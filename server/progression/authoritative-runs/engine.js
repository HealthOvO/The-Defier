const crypto = require('node:crypto');
const { cloneJson } = require('./canonical');
const { CONTENT_VERSION, PROTOCOL_VERSION } = require('./catalog');

const MODES = ['pve', 'challenge', 'expedition', 'challenge_ladder', 'world_rift', 'relay_expedition', 'fate_chronicle'];
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

function isModeCompatible(mode, scenario) {
    if (!scenario) return false;
    if (String(scenario.mode || '') === String(mode || '')) return true;
    return ['challenge_ladder', 'world_rift'].includes(mode) && String(scenario.mode || '') === 'challenge';
}

function findScenarioById(content, scenarioId) {
    const safeScenarioId = String(scenarioId || '').trim();
    if (!safeScenarioId) return null;
    const direct = content && content.scenarios && content.scenarios[safeScenarioId];
    if (direct && String(direct.scenarioId || '') === safeScenarioId) return direct;
    const scenarios = Object.values(content && content.scenarios || {});
    return scenarios.find(scenario => String(scenario && scenario.scenarioId || '') === safeScenarioId) || null;
}

function getScenario(content, mode, scenarioId = '') {
    if (!MODES.includes(mode)) {
        throw makeRuleError('unsupported_run_mode', '权威试炼模式不受支持', 400);
    }
    const resolvedById = findScenarioById(content, scenarioId);
    if (resolvedById) {
        if (!isModeCompatible(mode, resolvedById)) {
            throw makeRuleError('scenario_mode_mismatch', '权威试炼场景与模式不匹配', 409);
        }
        return resolvedById;
    }
    const scenarioKey = ['challenge_ladder', 'world_rift'].includes(mode) ? 'challenge' : mode;
    const scenario = content && content.scenarios && content.scenarios[scenarioKey];
    if (!scenario || !isModeCompatible(mode, scenario)) {
        throw makeRuleError('unsupported_run_mode', '权威试炼模式不受支持', 400);
    }
    return scenario;
}

function getCard(content, cardId) {
    const card = content && content.cards && content.cards[cardId];
    if (!card) throw makeRuleError('unknown_card_definition', '卡牌定义不存在');
    return card;
}

function getDeckCraftingRules(content, scenario = null) {
    const base = content && content.deckCrafting;
    if (!base || clampInt(base.version, 0, 10) !== 1) return null;
    const override = scenario && scenario.rewardProfile && typeof scenario.rewardProfile === 'object'
        ? scenario.rewardProfile
        : {};
    return {
        cardOfferCount: clampInt(override.cardOfferCount ?? base.cardOfferCount, 1, 3),
        healAmount: clampInt(override.healAmount ?? base.healAmount, 1, 100),
        healThresholdPercent: clampInt(override.healThresholdPercent ?? base.healThresholdPercent, 1, 99),
        maxCardsRemoved: clampInt(override.maxCardsRemoved ?? base.maxCardsRemoved, 0, 10),
        maxHpAmount: clampInt(override.maxHpAmount ?? base.maxHpAmount, 1, 50),
        minBlockCards: clampInt(override.minBlockCards ?? base.minBlockCards, 0, 10),
        minDeckSize: clampInt(override.minDeckSize ?? base.minDeckSize, 5, 20),
        minDamageCards: clampInt(override.minDamageCards ?? base.minDamageCards, 0, 10),
        removePriority: Array.isArray(override.removePriority) ? override.removePriority : [],
        removeUnlockStage: clampInt(override.removeUnlockStage ?? base.removeUnlockStage, 1, 20),
        upgradePriority: Array.isArray(override.upgradePriority) ? override.upgradePriority : []
    };
}

function resolveCardDefinition(content, instance) {
    const definition = getCard(content, instance.cardId);
    if (!getDeckCraftingRules(content) || !instance.upgraded || !definition.upgrade) return definition;
    return {
        ...definition,
        ...definition.upgrade,
        cardId: definition.cardId,
        effect: cloneJson(definition.upgrade.effect || definition.effect || {})
    };
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

function createCardInstance(state, cardId, content) {
    const sequence = clampInt(state.player.nextCardInstance, 1);
    state.player.nextCardInstance = sequence + 1;
    const instance = { instanceId: `card-${sequence}`, cardId };
    if (getDeckCraftingRules(content)) instance.upgraded = false;
    return instance;
}

function generateRouteChoices(state, content) {
    const scenario = getScenario(content, state.mode, state.scenarioId);
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

function createInitialState({ runId, userId, mode, scenarioId = '', seedHex, content }) {
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
    const scenario = getScenario(content, mode, scenarioId);
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
            rewardsChosen: 0,
            ...(getDeckCraftingRules(content) ? { cardsUpgraded: 0, cardsRemoved: 0 } : {})
        },
        summary: null
    };
    const starterDeck = Array.isArray(scenario.starterDeck) && scenario.starterDeck.length > 0
        ? scenario.starterDeck
        : content.starterDeck;
    state.player.deck = starterDeck.map(cardId => createCardInstance(state, cardId, content));
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
    const scenario = getScenario(content, state.mode, state.scenarioId);
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

function makeLegacyRewardChoices(state, content) {
    const scenario = getScenario(content, state.mode, state.scenarioId);
    const rewardCardPool = Array.isArray(scenario.rewardCardPool) && scenario.rewardCardPool.length > 0
        ? scenario.rewardCardPool
        : content.rewardCardPool;
    const cardId = shuffle(state, rewardCardPool)[0];
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

function prioritizeDeckInstances(state, priority, predicate) {
    const ranks = new Map(priority.map((cardId, index) => [String(cardId), index]));
    return state.player.deck
        .filter(predicate)
        .slice()
        .sort((left, right) => {
            const leftRank = ranks.has(left.cardId) ? ranks.get(left.cardId) : priority.length;
            const rightRank = ranks.has(right.cardId) ? ranks.get(right.cardId) : priority.length;
            if (leftRank !== rightRank) return leftRank - rightRank;
            return String(left.instanceId).localeCompare(String(right.instanceId));
        });
}

function canRemoveCardInstance(state, content, instance, rules) {
    if (!instance || instance.upgraded) return false;
    if (rules.removePriority.length > 0 && !rules.removePriority.includes(instance.cardId)) return false;
    const remaining = state.player.deck.filter(entry => entry.instanceId !== instance.instanceId);
    const damageCards = remaining.filter(entry => clampInt(resolveCardDefinition(content, entry).effect?.damage, 0) > 0).length;
    const blockCards = remaining.filter(entry => clampInt(resolveCardDefinition(content, entry).effect?.block, 0) > 0).length;
    return damageCards >= rules.minDamageCards && blockCards >= rules.minBlockCards;
}

function makeDeckCraftingRewardChoices(state, content, scenario, rules) {
    const rewardCardPool = Array.isArray(scenario.rewardCardPool) && scenario.rewardCardPool.length > 0
        ? scenario.rewardCardPool
        : content.rewardCardPool;
    const cardIds = [...new Set(rewardCardPool.map(cardId => String(cardId || '')).filter(Boolean))];
    const cardChoices = shuffle(state, cardIds)
        .slice(0, rules.cardOfferCount)
        .map(cardId => {
            const card = getCard(content, cardId);
            return {
                rewardId: `reward-card-${state.route.stageIndex + 1}-${cardId}`,
                kind: 'card',
                cardId,
                name: `纳入「${card.name}」`,
                description: card.description
            };
        });

    const choices = cardChoices.slice();
    const upgradeTarget = prioritizeDeckInstances(
        state,
        rules.upgradePriority,
        instance => !instance.upgraded && !!getCard(content, instance.cardId).upgrade
    )[0];
    if (upgradeTarget) {
        const card = getCard(content, upgradeTarget.cardId);
        choices.push({
            rewardId: `reward-upgrade-${state.route.stageIndex + 1}-${upgradeTarget.instanceId}`,
            kind: 'upgrade_card',
            cardId: upgradeTarget.cardId,
            targetCardInstanceId: upgradeTarget.instanceId,
            name: `精修「${card.name}」`,
            description: `${card.description} 精修后：${card.upgrade.description}`
        });
    }

    const hpPercent = state.player.maxHp > 0
        ? Math.floor((state.player.hp * 100) / state.player.maxHp)
        : 0;
    const removeUnlocked = state.route.stageIndex + 1 >= rules.removeUnlockStage
        && clampInt(state.stats.cardsRemoved, 0) < rules.maxCardsRemoved;
    const removeTarget = removeUnlocked
        ? prioritizeDeckInstances(
            state,
            rules.removePriority,
            instance => canRemoveCardInstance(state, content, instance, rules)
        )[0]
        : null;
    if (hpPercent <= rules.healThresholdPercent) {
        choices.push({
            rewardId: `reward-heal-${state.route.stageIndex + 1}`,
            kind: 'heal',
            amount: rules.healAmount,
            name: '调息',
            description: `回复 ${rules.healAmount} 点生命。`
        });
    } else if (state.player.deck.length > rules.minDeckSize && removeTarget) {
        const card = getCard(content, removeTarget.cardId);
        choices.push({
            rewardId: `reward-remove-${state.route.stageIndex + 1}-${removeTarget.instanceId}`,
            kind: 'remove_card',
            cardId: removeTarget.cardId,
            targetCardInstanceId: removeTarget.instanceId,
            name: `裁去「${card.name}」`,
            description: `从本次牌组永久移除此牌，牌组不会低于 ${rules.minDeckSize} 张。`
        });
    } else {
        choices.push({
            rewardId: `reward-vitality-${state.route.stageIndex + 1}`,
            kind: 'max_hp',
            amount: rules.maxHpAmount,
            name: '固本',
            description: `最大生命 +${rules.maxHpAmount}，并回复 ${rules.maxHpAmount} 点生命。`
        });
    }
    return shuffle(state, choices);
}

function makeRewardChoices(state, content) {
    const scenario = getScenario(content, state.mode, state.scenarioId);
    const rules = getDeckCraftingRules(content, scenario);
    if (!rules) return makeLegacyRewardChoices(state, content);
    return makeDeckCraftingRewardChoices(state, content, scenario, rules);
}

function buildSummary(state, content, result, reason) {
    const scenario = getScenario(content, state.mode, state.scenarioId);
    const base = state.stats.encountersWon * 120
        + state.stats.bossWins * 180
        + state.player.hp * 3
        - state.stats.turns * 4
        - state.stats.damageTaken * 2;
    const score = result === 'completed' ? Math.max(0, Math.round(base * scenario.scoreMultiplier)) : 0;
    const grade = score >= 520 ? 'S' : score >= 420 ? 'A' : score >= 300 ? 'B' : result === 'completed' ? 'C' : '未完成';
    const summary = {
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
    if (getDeckCraftingRules(content, scenario)) {
        summary.deckSize = state.player.deck.length;
        summary.upgradedCards = state.player.deck.filter(instance => !!instance.upgraded).length;
        summary.cardsRemoved = clampInt(state.stats.cardsRemoved, 0);
    }
    return summary;
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
    const definition = resolveCardDefinition(content, instance);
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
    const scenario = getScenario(content, state.mode, state.scenarioId);
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
    const scenario = getScenario(content, state.mode, state.scenarioId);
    const deckCraftingRules = getDeckCraftingRules(content, scenario);
    if (reward.kind === 'card') {
        getCard(content, reward.cardId);
        state.player.deck.push(createCardInstance(state, reward.cardId, content));
    } else if (reward.kind === 'upgrade_card') {
        if (!deckCraftingRules) {
            throw makeRuleError('unknown_reward_kind', '奖励定义不存在', 500);
        }
        const target = state.player.deck.find(instance => instance.instanceId === reward.targetCardInstanceId);
        const definition = target && getCard(content, target.cardId);
        if (!target || target.upgraded || !definition.upgrade || target.cardId !== reward.cardId) {
            throw makeRuleError('reward_target_invalid', '精修目标已不在权威牌组中');
        }
        target.upgraded = true;
        state.stats.cardsUpgraded = clampInt(state.stats.cardsUpgraded, 0) + 1;
    } else if (reward.kind === 'remove_card') {
        if (!deckCraftingRules) throw makeRuleError('unknown_reward_kind', '奖励定义不存在', 500);
        if (state.player.deck.length <= deckCraftingRules.minDeckSize
            || state.route.stageIndex + 1 < deckCraftingRules.removeUnlockStage
            || clampInt(state.stats.cardsRemoved, 0) >= deckCraftingRules.maxCardsRemoved) {
            throw makeRuleError('reward_target_invalid', '当前牌组不能继续裁牌');
        }
        const targetIndex = state.player.deck.findIndex(instance => (
            instance.instanceId === reward.targetCardInstanceId
            && instance.cardId === reward.cardId
            && !instance.upgraded
        ));
        if (targetIndex < 0) throw makeRuleError('reward_target_invalid', '裁牌目标已不在权威牌组中');
        if (!canRemoveCardInstance(state, content, state.player.deck[targetIndex], deckCraftingRules)) {
            throw makeRuleError('reward_target_invalid', '裁牌会破坏牌组的基本攻防能力');
        }
        state.player.deck.splice(targetIndex, 1);
        state.stats.cardsRemoved = clampInt(state.stats.cardsRemoved, 0) + 1;
    } else if (reward.kind === 'heal') {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + clampInt(reward.amount, 0));
    } else if (reward.kind === 'max_hp') {
        const amount = clampInt(reward.amount, 0);
        state.player.maxHp += amount;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + amount);
    } else {
        throw makeRuleError('unknown_reward_kind', '奖励定义不存在', 500);
    }
    if (scenario.betweenEncounterHeal > 0) {
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + scenario.betweenEncounterHeal);
    }
    state.stats.rewardsChosen += 1;
    state.route.stageIndex += 1;
    state.phase = 'route';
    state.reward = null;
    state.route.choices = generateRouteChoices(state, content);
    events.push({
        type: 'reward_chosen',
        rewardId: reward.rewardId,
        rewardKind: reward.kind,
        ...(deckCraftingRules && reward.cardId ? { cardId: reward.cardId } : {}),
        ...(deckCraftingRules && reward.targetCardInstanceId ? { targetCardInstanceId: reward.targetCardInstanceId } : {})
    });
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
    const definition = resolveCardDefinition(content, instance);
    return {
        instanceId: instance.instanceId,
        cardId: definition.cardId,
        name: definition.name,
        description: definition.description,
        cost: definition.cost,
        ...(getDeckCraftingRules(content) ? { upgraded: !!instance.upgraded } : {})
    };
}

function getAllowedCommands(state) {
    if (state.phase === 'route') return ['select_node', 'abandon'];
    if (state.phase === 'battle') return ['play_card', 'end_turn', 'abandon'];
    if (state.phase === 'reward') return ['choose_reward', 'abandon'];
    return [];
}

function projectState(state, content) {
    const scenario = getScenario(content, state.mode, state.scenarioId);
    const deckCraftingRules = getDeckCraftingRules(content, scenario);
    const deckCounts = {};
    const upgradedDeckCounts = {};
    state.player.deck.forEach(instance => {
        deckCounts[instance.cardId] = (deckCounts[instance.cardId] || 0) + 1;
        if (instance.upgraded) {
            upgradedDeckCounts[instance.cardId] = (upgradedDeckCounts[instance.cardId] || 0) + 1;
        }
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
            deckCounts,
            ...(deckCraftingRules ? {
                upgradedDeckCounts,
                deckCrafting: {
                    upgradedCount: state.player.deck.filter(instance => !!instance.upgraded).length,
                    cardsRemoved: clampInt(state.stats.cardsRemoved, 0),
                    minDeckSize: deckCraftingRules.minDeckSize
                }
            } : {})
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
