const crypto = require('node:crypto');
const { cloneJson } = require('./canonical');
const { CONTENT_VERSION, PROTOCOL_VERSION } = require('./catalog');

const MODES = ['pve', 'challenge', 'expedition', 'challenge_ladder', 'world_rift'];
const COMMANDS = ['select_node', 'play_card', 'end_turn', 'choose_reward', 'abandon'];
const TERMINAL_PHASES = new Set(['completed', 'defeated', 'abandoned']);
const SAFE_REF = /^[A-Za-z0-9._:-]{1,128}$/;

function makeRuleError(reason, message, statusCode = 409) {
    const error = new Error(message);
    error.reason = reason;
    error.statusCode = statusCode;
    return error;
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function getScenario(content, mode) {
    const scenarioKey = ['challenge_ladder', 'world_rift'].includes(mode) ? 'challenge' : mode;
    const scenario = content && content.scenarios && content.scenarios[scenarioKey];
    if (!scenario || !MODES.includes(mode)) {
        throw makeRuleError('unsupported_run_mode', '权威试炼模式不受支持', 400);
    }
    return scenario;
}

function getCard(content, cardId) {
    const card = content && content.cards && content.cards[cardId];
    if (!card) throw makeRuleError('unknown_card_definition', '卡牌定义不存在');
    return card;
}

function getEnemy(content, enemyId) {
    const enemy = content && content.enemies && content.enemies[enemyId];
    if (!enemy) throw makeRuleError('unknown_enemy_definition', '敌人定义不存在');
    return enemy;
}

function randomInt(state, maxExclusive) {
    const max = clampInt(maxExclusive, 1, 1_000_000);
    const counter = clampInt(state.rng.counter, 0);
    const digest = crypto.createHash('sha256')
        .update(String(state.rng.seed || ''), 'utf8')
        .update(':', 'utf8')
        .update(String(counter), 'utf8')
        .digest();
    state.rng.counter = counter + 1;
    return digest.readUInt32BE(0) % max;
}

function shuffle(state, values) {
    const output = values.slice();
    for (let index = output.length - 1; index > 0; index -= 1) {
        const picked = randomInt(state, index + 1);
        [output[index], output[picked]] = [output[picked], output[index]];
    }
    return output;
}

function createCardInstance(state, cardId) {
    const sequence = clampInt(state.player.nextCardInstance, 1);
    state.player.nextCardInstance = sequence + 1;
    return { instanceId: `card-${sequence}`, cardId };
}

function generateRouteChoices(state, content) {
    const scenario = getScenario(content, state.mode);
    const stage = scenario.stages[state.route.stageIndex];
    if (!stage) return [];
    const enemyIds = stage.pool.length <= 2 ? stage.pool.slice() : shuffle(state, stage.pool).slice(0, 2);
    return enemyIds.map((enemyId, index) => {
        const enemy = getEnemy(content, enemyId);
        return {
            nodeId: `stage-${state.route.stageIndex + 1}-${enemyId}-${index + 1}`,
            stage: state.route.stageIndex + 1,
            type: stage.type,
            enemyId,
            name: enemy.name,
            threat: enemy.threat,
            maxHp: enemy.maxHp,
            boss: !!enemy.boss
        };
    });
}

function drawCards(state, count) {
    const drawn = [];
    for (let index = 0; index < count; index += 1) {
        if (state.player.drawPile.length === 0 && state.player.discardPile.length > 0) {
            state.player.drawPile = shuffle(state, state.player.discardPile);
            state.player.discardPile = [];
        }
        const card = state.player.drawPile.shift();
        if (!card) break;
        state.player.hand.push(card);
        drawn.push(card.instanceId);
    }
    return drawn;
}

function currentEnemyIntent(state, content) {
    if (!state.battle || !state.battle.enemy) return null;
    const definition = getEnemy(content, state.battle.enemy.enemyId);
    const pattern = Array.isArray(definition.pattern) ? definition.pattern : [];
    if (pattern.length === 0) return null;
    const index = clampInt(state.battle.enemy.intentIndex, 0) % pattern.length;
    return cloneJson(pattern[index]);
}

function createInitialState({ runId, userId, mode, seedHex, content }) {
    if (!SAFE_REF.test(String(runId || ''))) {
        throw makeRuleError('invalid_run_id', '权威 run id 非法', 400);
    }
    if (!String(userId || '').trim()) {
        throw makeRuleError('invalid_run_owner', '权威 run 缺少账号', 400);
    }
    if (!/^[0-9a-f]{64}$/i.test(String(seedHex || ''))) {
        throw makeRuleError('invalid_run_seed', '权威 run seed 非法', 500);
    }
    if (!content || content.protocolVersion !== PROTOCOL_VERSION || content.contentVersion !== CONTENT_VERSION) {
        throw makeRuleError('unsupported_content_version', '权威内容版本不受支持', 409);
    }
    const scenario = getScenario(content, mode);
    const state = {
        schemaVersion: 2,
        protocolVersion: PROTOCOL_VERSION,
        contentVersion: CONTENT_VERSION,
        runId: String(runId),
        mode,
        scenarioId: scenario.scenarioId,
        version: 0,
        phase: 'route',
        rng: { seed: String(seedHex).toLowerCase(), counter: 0 },
        player: {
            maxHp: scenario.maxHp,
            hp: scenario.maxHp,
            block: 0,
            energy: scenario.energyPerTurn,
            deck: [],
            drawPile: [],
            discardPile: [],
            hand: [],
            nextCardInstance: 1
        },
        route: {
            stageIndex: 0,
            totalStages: scenario.stages.length,
            choices: [],
            completedNodes: []
        },
        battle: null,
        reward: null,
        stats: {
            turns: 0,
            cardsPlayed: 0,
            damageDealt: 0,
            damageTaken: 0,
            blockGained: 0,
            encountersWon: 0,
            bossWins: 0,
            rewardsChosen: 0
        },
        summary: null
    };
    state.player.deck = content.starterDeck.map(cardId => createCardInstance(state, cardId));
    state.route.choices = generateRouteChoices(state, content);
    return state;
}

function normalizePayload(command, rawPayload) {
    if (!COMMANDS.includes(command)) {
        throw makeRuleError('unsupported_run_command', '权威动作不受支持', 400);
    }
    const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload) ? rawPayload : {};
    const allowed = {
        select_node: ['nodeId'],
        play_card: ['cardInstanceId'],
        end_turn: [],
        choose_reward: ['rewardId'],
        abandon: []
    }[command];
    const unknown = Object.keys(payload).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
        throw makeRuleError('invalid_action_payload', `动作包含不允许字段: ${unknown[0]}`, 400);
    }
    if (command === 'select_node') {
        const nodeId = String(payload.nodeId || '').trim();
        if (!SAFE_REF.test(nodeId)) throw makeRuleError('invalid_node_id', '路线节点非法', 400);
        return { nodeId };
    }
    if (command === 'play_card') {
        const cardInstanceId = String(payload.cardInstanceId || '').trim();
        if (!SAFE_REF.test(cardInstanceId)) throw makeRuleError('invalid_card_instance', '卡牌实例非法', 400);
        return { cardInstanceId };
    }
    if (command === 'choose_reward') {
        const rewardId = String(payload.rewardId || '').trim();
        if (!SAFE_REF.test(rewardId)) throw makeRuleError('invalid_reward_id', '奖励选项非法', 400);
        return { rewardId };
    }
    return {};
}

function beginBattle(state, content, node) {
    const scenario = getScenario(content, state.mode);
    const enemy = getEnemy(content, node.enemyId);
    state.phase = 'battle';
    state.reward = null;
    state.battle = {
        nodeId: node.nodeId,
        nodeType: node.type,
        turn: 1,
        enemy: {
            enemyId: enemy.enemyId,
            hp: enemy.maxHp,
            maxHp: enemy.maxHp,
            block: 0,
            vulnerable: 0,
            intentIndex: 0
        }
    };
    state.player.block = 0;
    state.player.energy = scenario.energyPerTurn;
    state.player.hand = [];
    state.player.discardPile = [];
    state.player.drawPile = shuffle(state, state.player.deck);
    drawCards(state, scenario.handSize);
    state.stats.turns += 1;
}

function applyDamageToEnemy(state, amount) {
    const enemy = state.battle.enemy;
    let damage = clampInt(amount, 0);
    if (enemy.vulnerable > 0 && damage > 0) {
        damage = Math.floor(damage * 1.5);
        enemy.vulnerable = Math.max(0, enemy.vulnerable - 1);
    }
    const blocked = Math.min(enemy.block, damage);
    enemy.block -= blocked;
    const dealt = Math.min(enemy.hp, damage - blocked);
    enemy.hp -= dealt;
    state.stats.damageDealt += dealt;
    return dealt;
}

function makeRewardChoices(state, content) {
    const cardId = shuffle(state, content.rewardCardPool)[0];
    const card = getCard(content, cardId);
    return shuffle(state, [
        {
            rewardId: `reward-card-${state.route.stageIndex + 1}-${cardId}`,
            kind: 'card',
            cardId,
            name: `纳入「${card.name}」`,
            description: card.description
        },
        {
            rewardId: `reward-heal-${state.route.stageIndex + 1}`,
            kind: 'heal',
            amount: 10,
            name: '调息',
            description: '回复 10 点生命。'
        },
        {
            rewardId: `reward-vitality-${state.route.stageIndex + 1}`,
            kind: 'max_hp',
            amount: 5,
            name: '固本',
            description: '最大生命 +5，并回复 5 点生命。'
        }
    ]);
}

function buildSummary(state, content, result, reason) {
    const scenario = getScenario(content, state.mode);
    const base = state.stats.encountersWon * 120
        + state.stats.bossWins * 180
        + state.player.hp * 3
        - state.stats.turns * 4
        - state.stats.damageTaken * 2;
    const score = result === 'completed' ? Math.max(0, Math.round(base * scenario.scoreMultiplier)) : 0;
    const grade = score >= 520 ? 'S' : score >= 420 ? 'A' : score >= 300 ? 'B' : result === 'completed' ? 'C' : '未完成';
    return {
        result,
        reason,
        score,
        grade,
        mode: state.mode,
        scenarioId: state.scenarioId,
        encountersWon: state.stats.encountersWon,
        bossWins: state.stats.bossWins,
        turns: state.stats.turns,
        cardsPlayed: state.stats.cardsPlayed,
        damageDealt: state.stats.damageDealt,
        damageTaken: state.stats.damageTaken,
        remainingHp: state.player.hp,
        maxHp: state.player.maxHp
    };
}

function finishEncounter(state, content, events) {
    const enemyDefinition = getEnemy(content, state.battle.enemy.enemyId);
    const completedNode = {
        nodeId: state.battle.nodeId,
        nodeType: state.battle.nodeType,
        enemyId: enemyDefinition.enemyId,
        boss: !!enemyDefinition.boss
    };
    state.route.completedNodes.push(completedNode);
    state.stats.encountersWon += 1;
    if (enemyDefinition.boss) state.stats.bossWins += 1;
    events.push({ type: 'encounter_won', ...completedNode });
    state.player.hand = [];
    state.player.drawPile = [];
    state.player.discardPile = [];
    state.player.block = 0;
    state.battle = null;
    const finalStage = state.route.stageIndex >= state.route.totalStages - 1;
    if (finalStage) {
        state.phase = 'completed';
        state.route.choices = [];
        state.reward = null;
        state.summary = buildSummary(state, content, 'completed', 'boss_defeated');
        events.push({ type: 'run_completed', score: state.summary.score, grade: state.summary.grade });
        return;
    }
    state.phase = 'reward';
    state.reward = { choices: makeRewardChoices(state, content) };
}

function playCard(state, content, payload, events) {
    if (state.phase !== 'battle' || !state.battle) {
        throw makeRuleError('command_not_allowed', '当前阶段不能出牌');
    }
    const handIndex = state.player.hand.findIndex(card => card.instanceId === payload.cardInstanceId);
    if (handIndex < 0) throw makeRuleError('card_not_in_hand', '卡牌不在权威手牌中');
    const instance = state.player.hand[handIndex];
    const definition = getCard(content, instance.cardId);
    if (definition.cost > state.player.energy) {
        throw makeRuleError('insufficient_energy', '能量不足');
    }
    state.player.hand.splice(handIndex, 1);
    state.player.energy -= definition.cost;
    const effect = definition.effect || {};
    const event = { type: 'card_played', cardInstanceId: instance.instanceId, cardId: instance.cardId };
    if (effect.damage) event.damage = applyDamageToEnemy(state, effect.damage);
    if (effect.block) {
        const gained = clampInt(effect.block, 0);
        state.player.block += gained;
        state.stats.blockGained += gained;
        event.block = gained;
    }
    if (effect.heal) {
        const before = state.player.hp;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + clampInt(effect.heal, 0));
        event.heal = state.player.hp - before;
    }
    if (effect.energy) {
        state.player.energy += clampInt(effect.energy, 0);
        event.energy = clampInt(effect.energy, 0);
    }
    if (effect.vulnerable && state.battle.enemy.hp > 0) {
        state.battle.enemy.vulnerable += clampInt(effect.vulnerable, 0);
        event.vulnerable = clampInt(effect.vulnerable, 0);
    }
    state.player.discardPile.push(instance);
    if (effect.draw) event.drawn = drawCards(state, clampInt(effect.draw, 0, 5));
    state.stats.cardsPlayed += 1;
    events.push(event);
    if (state.battle.enemy.hp <= 0) finishEncounter(state, content, events);
}

function applyEnemyIntent(state, content, events) {
    const intent = currentEnemyIntent(state, content);
    if (!intent) throw makeRuleError('enemy_intent_missing', '敌方意图不存在', 500);
    const enemy = state.battle.enemy;
    if (intent.block) enemy.block += clampInt(intent.block, 0);
    let damageTaken = 0;
    if (intent.amount) {
        const amount = clampInt(intent.amount, 0);
        const blocked = Math.min(state.player.block, amount);
        state.player.block -= blocked;
        damageTaken = Math.min(state.player.hp, amount - blocked);
        state.player.hp -= damageTaken;
        state.stats.damageTaken += damageTaken;
    }
    events.push({
        type: 'enemy_intent_resolved',
        intentType: intent.type,
        damageTaken,
        enemyBlock: clampInt(intent.block, 0)
    });
    enemy.intentIndex += 1;
}

function endTurn(state, content, events) {
    if (state.phase !== 'battle' || !state.battle) {
        throw makeRuleError('command_not_allowed', '当前阶段不能结束回合');
    }
    const scenario = getScenario(content, state.mode);
    state.player.discardPile.push(...state.player.hand);
    state.player.hand = [];
    applyEnemyIntent(state, content, events);
    if (state.player.hp <= 0) {
        state.phase = 'defeated';
        state.player.hp = 0;
        state.summary = buildSummary(state, content, 'defeated', 'hp_depleted');
        events.push({ type: 'run_defeated', reason: 'hp_depleted' });
        return;
    }
    if (scenario.turnBudget > 0 && state.stats.turns >= scenario.turnBudget) {
        state.phase = 'defeated';
        state.summary = buildSummary(state, content, 'defeated', 'turn_budget_exhausted');
        events.push({ type: 'run_defeated', reason: 'turn_budget_exhausted' });
        return;
    }
    state.player.block = 0;
    state.battle.enemy.block = 0;
    state.player.energy = scenario.energyPerTurn;
    state.battle.turn += 1;
    state.stats.turns += 1;
    drawCards(state, scenario.handSize);
    events.push({ type: 'player_turn_started', turn: state.battle.turn });
}

function chooseReward(state, content, payload, events) {
    if (state.phase !== 'reward' || !state.reward) {
        throw makeRuleError('command_not_allowed', '当前阶段不能选择奖励');
    }
    const reward = state.reward.choices.find(choice => choice.rewardId === payload.rewardId);
    if (!reward) throw makeRuleError('reward_not_available', '奖励不在权威选项中');
    if (reward.kind === 'card') {
        getCard(content, reward.cardId);
        state.player.deck.push(createCardInstance(state, reward.cardId));
    } else if (reward.kind === 'heal') {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + clampInt(reward.amount, 0));
    } else if (reward.kind === 'max_hp') {
        const amount = clampInt(reward.amount, 0);
        state.player.maxHp += amount;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
    } else {
        throw makeRuleError('unknown_reward_kind', '奖励定义不存在', 500);
    }
    const scenario = getScenario(content, state.mode);
    if (scenario.betweenEncounterHeal > 0) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + scenario.betweenEncounterHeal);
    }
    state.stats.rewardsChosen += 1;
    state.route.stageIndex += 1;
    state.phase = 'route';
    state.reward = null;
    state.route.choices = generateRouteChoices(state, content);
    events.push({ type: 'reward_chosen', rewardId: reward.rewardId, rewardKind: reward.kind });
}

function applyCommand(currentState, content, command, rawPayload) {
    const payload = normalizePayload(command, rawPayload);
    const state = cloneJson(currentState);
    if (!state || state.schemaVersion !== 2 || state.protocolVersion !== PROTOCOL_VERSION) {
        throw makeRuleError('invalid_canonical_state', '权威状态版本非法', 500);
    }
    if (TERMINAL_PHASES.has(state.phase)) {
        throw makeRuleError('run_not_active', '权威 run 已结束');
    }
    const events = [];
    if (command === 'select_node') {
        if (state.phase !== 'route') throw makeRuleError('command_not_allowed', '当前阶段不能选择路线');
        const node = state.route.choices.find(choice => choice.nodeId === payload.nodeId);
        if (!node) throw makeRuleError('node_not_available', '路线节点不在权威选项中');
        beginBattle(state, content, node);
        events.push({ type: 'encounter_started', nodeId: node.nodeId, enemyId: node.enemyId });
    } else if (command === 'play_card') {
        playCard(state, content, payload, events);
    } else if (command === 'end_turn') {
        endTurn(state, content, events);
    } else if (command === 'choose_reward') {
        chooseReward(state, content, payload, events);
    } else if (command === 'abandon') {
        state.phase = 'abandoned';
        state.summary = buildSummary(state, content, 'abandoned', 'player_abandoned');
        events.push({ type: 'run_abandoned' });
    }
    state.version = clampInt(currentState.version, 0) + 1;
    return { state, payload, events };
}

function projectCard(content, instance) {
    const definition = getCard(content, instance.cardId);
    return {
        instanceId: instance.instanceId,
        cardId: definition.cardId,
        name: definition.name,
        description: definition.description,
        cost: definition.cost
    };
}

function getAllowedCommands(state) {
    if (state.phase === 'route') return ['select_node', 'abandon'];
    if (state.phase === 'battle') return ['play_card', 'end_turn', 'abandon'];
    if (state.phase === 'reward') return ['choose_reward', 'abandon'];
    return [];
}

function projectState(state, content) {
    const scenario = getScenario(content, state.mode);
    const deckCounts = {};
    state.player.deck.forEach(instance => {
        deckCounts[instance.cardId] = (deckCounts[instance.cardId] || 0) + 1;
    });
    const battle = state.battle ? {
        nodeId: state.battle.nodeId,
        nodeType: state.battle.nodeType,
        turn: state.battle.turn,
        enemy: {
            enemyId: state.battle.enemy.enemyId,
            name: getEnemy(content, state.battle.enemy.enemyId).name,
            hp: state.battle.enemy.hp,
            maxHp: state.battle.enemy.maxHp,
            block: state.battle.enemy.block,
            vulnerable: state.battle.enemy.vulnerable,
            intent: currentEnemyIntent(state, content)
        }
    } : null;
    return {
        schemaVersion: state.schemaVersion,
        protocolVersion: state.protocolVersion,
        contentVersion: state.contentVersion,
        runId: state.runId,
        mode: state.mode,
        scenario: {
            scenarioId: scenario.scenarioId,
            title: scenario.title,
            description: scenario.description,
            turnBudget: scenario.turnBudget,
            betweenEncounterHeal: scenario.betweenEncounterHeal
        },
        version: state.version,
        phase: state.phase,
        allowedCommands: getAllowedCommands(state),
        player: {
            hp: state.player.hp,
            maxHp: state.player.maxHp,
            block: state.player.block,
            energy: state.player.energy,
            hand: state.player.hand.map(instance => projectCard(content, instance)),
            drawPileCount: state.player.drawPile.length,
            discardPileCount: state.player.discardPile.length,
            deckSize: state.player.deck.length,
            deckCounts
        },
        route: {
            stage: state.route.stageIndex + 1,
            totalStages: state.route.totalStages,
            choices: cloneJson(state.route.choices),
            completedNodes: cloneJson(state.route.completedNodes)
        },
        battle,
        reward: state.reward ? { choices: cloneJson(state.reward.choices) } : null,
        stats: cloneJson(state.stats),
        summary: state.summary ? cloneJson(state.summary) : null
    };
}

module.exports = {
    COMMANDS,
    MODES,
    TERMINAL_PHASES,
    applyCommand,
    createInitialState,
    getAllowedCommands,
    makeRuleError,
    normalizePayload,
    projectState
};
