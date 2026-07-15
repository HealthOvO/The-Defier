const assert = require('node:assert');
const crypto = require('node:crypto');
const {
  CONTENT_HASH,
  CONTENT_SNAPSHOT,
  CONTENT_VERSION,
  FATE_CHRONICLE_SCENARIO_IDS,
  PROTOCOL_VERSION,
  RELAY_EXPEDITION_SCENARIO_IDS,
} = require('../server/progression/authoritative-runs/catalog');
const { hashCanonical, stableStringify } = require('../server/progression/authoritative-runs/canonical');
const {
  applyCommand,
  createInitialState,
  normalizePayload,
  projectState,
} = require('../server/progression/authoritative-runs/engine');

const BLOCK_CARDS = new Set(['guard', 'iron_mandate']);
const TERMINAL_PHASES = new Set(['completed', 'defeated', 'abandoned']);

function seed(label) {
  return crypto.createHash('sha256').update(label).digest('hex');
}

function create(
  mode,
  label = `${mode}:golden:0`,
  runId = `golden-${mode}-0001`,
  scenarioId = '',
  content = CONTENT_SNAPSHOT,
) {
  return createInitialState({
    runId,
    userId: 'golden-user',
    mode,
    scenarioId,
    seedHex: seed(label),
    content,
  });
}

function chooseCommand(state, content = CONTENT_SNAPSHOT, options = {}) {
  const view = projectState(state, content);
  if (state.phase === 'route') {
    const preferredChoice = typeof options.chooseRoute === 'function'
      ? options.chooseRoute(view, state, content)
      : null;
    const choice = preferredChoice || view.route.choices[0];
    return ['select_node', { nodeId: choice.nodeId }];
  }
  if (state.phase === 'reward') {
    const hpPercent = view.player.maxHp > 0 ? (view.player.hp * 100) / view.player.maxHp : 0;
    const preferredKind = hpPercent < 35
      ? 'heal'
      : view.route.stage === 1
        ? 'upgrade_card'
        : view.route.stage === 2
          ? 'remove_card'
          : view.route.stage % 3 === 0
            ? 'card'
            : 'upgrade_card';
    const reward = view.reward.choices.find(choice => choice.kind === preferredKind)
      || view.reward.choices.find(choice => choice.kind === 'card')
      || view.reward.choices[0];
    return ['choose_reward', { rewardId: reward.rewardId }];
  }
  const incomingDamage = Number(view.battle?.enemy?.intent?.amount || 0);
  const cards = view.player.hand.slice().sort((left, right) => {
    const leftBlocks = BLOCK_CARDS.has(left.cardId) ? 1 : 0;
    const rightBlocks = BLOCK_CARDS.has(right.cardId) ? 1 : 0;
    const defenseOrder = incomingDamage > view.player.block
      ? rightBlocks - leftBlocks
      : leftBlocks - rightBlocks;
    return defenseOrder || right.cost - left.cost || left.instanceId.localeCompare(right.instanceId);
  });
  const card = cards.find(entry => entry.cost <= view.player.energy);
  return card
    ? ['play_card', { cardInstanceId: card.instanceId }]
    : ['end_turn', {}];
}

function drive(
  mode,
  label = `${mode}:golden:0`,
  runId = `golden-${mode}-0001`,
  scenarioId = '',
  content = CONTENT_SNAPSHOT,
  options = {},
) {
  let state = create(mode, label, runId, scenarioId, content);
  const commands = [];
  while (!TERMINAL_PHASES.has(state.phase) && commands.length < 256) {
    const command = chooseCommand(state, content, options);
    state = applyCommand(state, content, command[0], command[1]).state;
    commands.push(command);
  }
  return { state, commands };
}

function replay(mode, label, runId, commands, scenarioId = '', content = CONTENT_SNAPSHOT) {
  let state = create(mode, label, runId, scenarioId, content);
  commands.forEach(([command, payload]) => {
    state = applyCommand(state, content, command, payload).state;
  });
  return state;
}

function countDeckCards(cards) {
  return cards.reduce((accumulator, cardId) => {
    accumulator[cardId] = (accumulator[cardId] || 0) + 1;
    return accumulator;
  }, {});
}

function assertCompletedDeckCrafting(state, label) {
  if (state.phase !== 'completed') return;
  const rules = CONTENT_SNAPSHOT.deckCrafting;
  const damageCards = state.player.deck.filter(instance => Number(CONTENT_SNAPSHOT.cards[instance.cardId]?.effect?.damage || 0) > 0);
  const blockCards = state.player.deck.filter(instance => Number(CONTENT_SNAPSHOT.cards[instance.cardId]?.effect?.block || 0) > 0);
  const upgradedCards = state.player.deck.filter(instance => !!instance.upgraded);
  assert(state.stats.cardsUpgraded >= 1, `${label} should preserve at least one targeted upgrade`);
  assert.strictEqual(state.stats.cardsRemoved, 1, `${label} should execute one bounded trim`);
  assert(state.player.deck.length >= rules.minDeckSize, `${label} must preserve the minimum deck size`);
  assert(damageCards.length >= rules.minDamageCards, `${label} must preserve the direct-damage floor`);
  assert(blockCards.length >= rules.minBlockCards, `${label} must preserve the block-card floor`);
  assert.strictEqual(state.summary.deckSize, state.player.deck.length, `${label} summary deck size drifted`);
  assert.strictEqual(state.summary.upgradedCards, upgradedCards.length, `${label} summary upgrade count drifted`);
  assert.strictEqual(state.summary.cardsRemoved, state.stats.cardsRemoved, `${label} summary trim count drifted`);
}

const BRANCHED_FATE_SCENARIO_IDS = [
  'chronicle-ember-proof',
  'chronicle-mirror-audit',
  'chronicle-rift-seal',
];
const PUBLIC_CHAPTER_BRANCH_KEYS = [
  'branchId',
  'title',
  'description',
  'counterplay',
  'buildFocus',
  'consequenceSummary',
].sort();
const PRIVATE_CHAPTER_BRANCH_FIELDS = [
  'rewardCardPool',
  'rewardProfile',
  'futureStages',
  'enemyAdjustments',
  'rewardAdjustments',
  'seed',
];

function cloneState(state) {
  return JSON.parse(stableStringify(state));
}

function assertPublicChapterBranch(branch, label) {
  assert(branch && typeof branch === 'object', `${label} should expose a public chapterBranch object`);
  assert.deepStrictEqual(
    Object.keys(branch).sort(),
    PUBLIC_CHAPTER_BRANCH_KEYS,
    `${label} should expose only the public chapterBranch fields`,
  );
  const serialized = JSON.stringify(branch);
  PRIVATE_CHAPTER_BRANCH_FIELDS.forEach(field => {
    assert(!serialized.includes(field), `${label} must not leak private field ${field}`);
  });
}

function advanceUntil(initialState, predicate, content = CONTENT_SNAPSHOT, options = {}) {
  let state = initialState;
  const commands = [];
  let view = projectState(state, content);
  while (!TERMINAL_PHASES.has(state.phase) && !predicate(state, view, commands)) {
    const command = chooseCommand(state, content, options);
    state = applyCommand(state, content, command[0], command[1]).state;
    commands.push(command);
    view = projectState(state, content);
  }
  return { state, view, commands };
}

function branchRouteSelector(branchId = '') {
  return (view) => {
    const preferred = view.route.choices.find(choice => choice.chapterBranch?.branchId === branchId);
    return preferred || null;
  };
}

function routeSignature(view) {
  return view.route.choices.map(choice => ({
    nodeId: choice.nodeId,
    enemyId: choice.enemyId,
    maxHp: choice.maxHp,
    branchId: choice.chapterBranch?.branchId || '',
  }));
}

function createTacticProbe({
  label,
  contractId = 'steady',
  enemyId = 'ink_scout',
  intentIndex = 0,
  handCardIds = [],
  enemyBlock = 0,
  playerBlock = 0,
  energy = 3,
  content = CONTENT_SNAPSHOT,
} = {}) {
  let state = create(
    'pve',
    `tactic:${label}`,
    `tactic-${seed(`run:${label}`).slice(0, 24)}`,
    '',
    content,
  );
  const nodeId = projectState(state, content).route.choices[0].nodeId;
  state = applyCommand(state, content, 'select_node', { nodeId }).state;
  const enemy = content.enemies[enemyId];
  const contract = content.routeContracts?.profiles?.[contractId];
  state.battle.enemy.enemyId = enemyId;
  state.battle.enemy.hp = enemy.maxHp;
  state.battle.enemy.maxHp = enemy.maxHp;
  state.battle.enemy.block = enemyBlock;
  state.battle.enemy.vulnerable = 0;
  state.battle.enemy.intentIndex = intentIndex;
  state.battle.routeContract = contract ? {
    version: 1,
    contractId,
    label: contract.label,
    riskTier: contract.riskTier,
    riskLabel: contract.riskLabel,
    difficultyTier: contract.difficultyTier,
    difficultyLabel: contract.difficultyLabel,
    difficultyRating: contract.difficultyRating,
    rewardTier: contract.rewardTier,
    rewardLabel: contract.rewardLabel,
    difficultySummary: `probe:${contractId}`,
    rewardSummary: `probe:${contractId}`,
    scoreBonus: contract.scoreBonus,
    enemyAdjustments: cloneState(contract.enemyAdjustments),
    rewardAdjustments: cloneState(contract.rewardAdjustments),
  } : null;
  state.player.block = playerBlock;
  state.player.energy = energy;
  state.player.hand = handCardIds.map((cardId, index) => ({
    instanceId: `probe-card-${index + 1}`,
    cardId,
    upgraded: false,
  }));
  state.player.drawPile = [];
  state.player.discardPile = [];
  if (state.battle.tacticTurn) {
    state.battle.tacticTurn = {
      damageDealt: 0,
      blockGained: 0,
      cardsPlayed: 0,
      ...(content.combatTactics?.version === 2 ? { roles: [] } : {}),
    };
  }
  return state;
}

function runTacticProbe(state, cardInstanceIds = [], content = CONTENT_SNAPSHOT) {
  let current = state;
  const playEvents = [];
  cardInstanceIds.forEach((cardInstanceId) => {
    const result = applyCommand(current, content, 'play_card', { cardInstanceId });
    current = result.state;
    playEvents.push(...result.events);
  });
  const endTurn = applyCommand(current, content, 'end_turn', {});
  return { state: endTurn.state, playEvents, endTurnEvents: endTurn.events };
}

function findEvent(events, type) {
  return events.find(event => event.type === type);
}

function findTacticLine(tactic, lineId) {
  return tactic?.lines?.find(line => line.lineId === lineId) || null;
}

const FROZEN_V5_CONTENT_HASH = 'b1787bc02a98b459641c5dce541a56e3c3476724c7ae3083efc1b2e8e372b280';
const FROZEN_V6_CONTENT_HASH = '25e7e2f3fab1b58f477f6c016d7bdea6c43292bcabf635b5f0f9d8ff241c9abc';
const FROZEN_V7_CONTENT_HASH = 'a89a387d2558df8e982de8951979f930c96891574fcae2b68d28fb5ae2a7a062';
const HISTORICAL_V7_COMBAT_TACTICS = Object.freeze({
  version: 1,
  reportVersion: 'authoritative-combat-tactics-v1',
  rewardCardPool: ['warding_stride', 'sealbreaker'],
  profiles: {
    attack: {
      tacticId: 'brace',
      title: '守势',
      prompt: '在敌方进攻落下前建立足够格挡。',
      blockThresholdBps: 7000,
      minBlockThreshold: 4,
      damageReduction: 2,
      rewardSummary: '达成后本次敌方伤害减少 2 点。'
    },
    fortify: {
      tacticId: 'break',
      title: '破阵',
      prompt: '在敌方结印前打出足够伤害，压缩其护势。',
      damageThresholdBps: 7500,
      minDamageThreshold: 5,
      blockReductionBps: 5000,
      rewardSummary: '达成后本次敌方格挡减半。'
    },
    defend_attack: {
      tacticId: 'balance',
      title: '争衡',
      prompt: '同时完成进攻与防守，拆解敌方攻守一体。',
      damageThresholdBps: 5000,
      blockThresholdBps: 5000,
      minDamageThreshold: 4,
      minBlockThreshold: 3,
      damageReduction: 2,
      blockReduction: 2,
      rewardSummary: '达成后本次敌方伤害与格挡各减少 2 点。'
    },
  },
});

function createHistoricalV7Content() {
  const content = cloneState(CONTENT_SNAPSHOT);
  content.contentVersion = 'authoritative-trials-v7';
  content.combatTactics = cloneState(HISTORICAL_V7_COMBAT_TACTICS);
  return content;
}

function createHistoricalV6Content() {
  const content = cloneState(CONTENT_SNAPSHOT);
  content.contentVersion = 'authoritative-trials-v6';
  delete content.combatTactics;
  delete content.cards.warding_stride;
  delete content.cards.sealbreaker;
  const auditCashout = content.scenarios['chronicle-mirror-audit'].branchPlan.options
    .find(option => option.branchId === 'audit_cashout');
  const sealRush = content.scenarios['chronicle-rift-seal'].branchPlan.options
    .find(option => option.branchId === 'seal_rush');
  auditCashout.enemyId = 'mirror_duelist';
  delete sealRush.scoreMultiplier;
  return content;
}

function createHistoricalV5Content() {
  const content = createHistoricalV6Content();
  content.contentVersion = 'authoritative-trials-v5';
  BRANCHED_FATE_SCENARIO_IDS.forEach((scenarioId) => {
    delete content.scenarios[scenarioId];
  });
  return content;
}

const HISTORICAL_V5_CONTENT = createHistoricalV5Content();
const HISTORICAL_V6_CONTENT = createHistoricalV6Content();
const HISTORICAL_V7_CONTENT = createHistoricalV7Content();

assert.strictEqual(PROTOCOL_VERSION, 'authoritative-run-v2');
assert.strictEqual(CONTENT_VERSION, 'authoritative-trials-v8');
assert.match(CONTENT_HASH, /^[a-f0-9]{64}$/i, 'content hash should stay a canonical SHA-256');
assert.strictEqual(
  hashCanonical(HISTORICAL_V5_CONTENT),
  FROZEN_V5_CONTENT_HASH,
  'historical v5 content must preserve the frozen compatibility hash',
);
assert.strictEqual(
  hashCanonical(HISTORICAL_V6_CONTENT),
  FROZEN_V6_CONTENT_HASH,
  'historical v6 content must preserve the frozen compatibility hash',
);
assert.strictEqual(
  crypto.createHash('sha256').update(stableStringify(HISTORICAL_V7_CONTENT)).digest('hex'),
  FROZEN_V7_CONTENT_HASH,
  'historical v7 content must preserve the frozen compatibility hash',
);
assert.deepStrictEqual(FATE_CHRONICLE_SCENARIO_IDS, [
  'chronicle-ember-guard',
  'chronicle-ember-edge',
  'chronicle-ember-proof',
  'chronicle-mirror-guard',
  'chronicle-mirror-edge',
  'chronicle-mirror-audit',
  'chronicle-rift-guard',
  'chronicle-rift-edge',
  'chronicle-rift-seal',
]);

assert.strictEqual(CONTENT_SNAPSHOT.routeContracts.version, 1);
assert.strictEqual(CONTENT_SNAPSHOT.routeContracts.reportVersion, 'authoritative-route-contract-v1');
assert.deepStrictEqual(Object.keys(CONTENT_SNAPSHOT.routeContracts.profiles), ['steady', 'contested', 'perilous']);
const contractProfiles = Object.values(CONTENT_SNAPSHOT.routeContracts.profiles);
for (let index = 0; index < contractProfiles.length; index += 1) {
  const profile = contractProfiles[index];
  assert.strictEqual(profile.contractId, ['steady', 'contested', 'perilous'][index]);
  assert(profile.difficultyRating >= 1 && profile.difficultyRating <= 3);
  assert(profile.enemyAdjustments.maxHpBps >= 10000);
  assert(profile.scoreBonus >= 0);
  if (index > 0) {
    const previous = contractProfiles[index - 1];
    assert(profile.difficultyRating > previous.difficultyRating, 'route difficulty must increase by contract tier');
    assert(profile.enemyAdjustments.maxHpBps > previous.enemyAdjustments.maxHpBps, 'route HP pressure must increase');
    assert(profile.scoreBonus > previous.scoreBonus, 'route score premium must increase');
  }
}
for (const pair of CONTENT_SNAPSHOT.routeContracts.stagePairs) {
  assert.strictEqual(pair.length, 2, 'every route stage must present exactly two distinct contracts');
  assert.strictEqual(new Set(pair).size, 2, 'a route stage must not present duplicate contracts');
  pair.forEach(contractId => assert(CONTENT_SNAPSHOT.routeContracts.profiles[contractId]));
}

for (const scenario of Object.values(CONTENT_SNAPSHOT.scenarios)) {
  assert(
    new Set(scenario.rewardCardPool || CONTENT_SNAPSHOT.rewardCardPool).size >= 5,
    `${scenario.scenarioId} should offer at least five distinct reward cards`,
  );
  assert(
    (scenario.rewardProfile?.removePriority || []).every(cardId => ['strike', 'guard'].includes(cardId)),
    `${scenario.scenarioId} may only trim basic strike/guard cards`,
  );
  for (const stage of scenario.stages) {
    for (const enemyId of stage.pool) {
      const firstIntent = CONTENT_SNAPSHOT.enemies[enemyId].pattern[0];
      assert(
        Number(firstIntent.amount || 0) < scenario.maxHp,
        `${scenario.mode}/${enemyId} must not one-shot a full-health player on the opening response`,
      );
    }
  }
}

for (const scenarioId of BRANCHED_FATE_SCENARIO_IDS) {
  const scenario = CONTENT_SNAPSHOT.scenarios[scenarioId];
  assert(scenario, `missing branched fate scenario ${scenarioId}`);
  assert.strictEqual(scenario.mode, 'fate_chronicle', `${scenarioId} must stay in fate chronicle mode`);
  assert(scenario.branchPlan && typeof scenario.branchPlan === 'object', `${scenarioId} must define branchPlan`);
  assert.strictEqual(scenario.branchPlan.version, 1, `${scenarioId} branchPlan must stay on v1`);
  assert(
    Number.isInteger(scenario.branchPlan.triggerStage) && scenario.branchPlan.triggerStage >= 1,
    `${scenarioId} branchPlan triggerStage must be a 1-based integer`,
  );
  assert(
    scenario.branchPlan.triggerStage < scenario.stages.length,
    `${scenarioId} branchPlan must branch before the final stage so later route choices can diverge`,
  );
  assert(Array.isArray(scenario.branchPlan.options), `${scenarioId} branchPlan options must be an array`);
  assert.strictEqual(scenario.branchPlan.options.length, 2, `${scenarioId} branchPlan must expose exactly two options`);
}

for (const card of Object.values(CONTENT_SNAPSHOT.cards)) {
  assert(card.cost >= 1, `${card.cardId} must require at least one energy to enter the action sequence`);
  if (card.upgrade) assert(card.upgrade.cost >= 1, `${card.cardId} upgrade must preserve the energy floor`);
}
for (const protectedCardId of ['insight', 'fracture', 'flowing_qi']) {
  assert.strictEqual(
    CONTENT_SNAPSHOT.cards[protectedCardId].upgrade,
    undefined,
    `${protectedCardId} is a cycle/multiplier core and must not receive a direct v5 upgrade`,
  );
}

const initial = create('pve');
const initialCopy = stableStringify(initial);
const publicInitial = projectState(initial, CONTENT_SNAPSHOT);
const publicJson = JSON.stringify(publicInitial);
assert.strictEqual(publicInitial.protocolVersion, PROTOCOL_VERSION);
assert.strictEqual(publicInitial.contentVersion, CONTENT_VERSION);
assert.deepStrictEqual(publicInitial.allowedCommands, ['select_node', 'abandon']);
assert(!publicJson.includes(initial.rng.seed), 'public projection must not expose the secret seed');
assert(!publicJson.includes('"rng"'), 'public projection must not expose RNG state');
assert(!publicJson.includes('"drawPile":'), 'public projection must not expose ordered draw pile state');
assert.strictEqual(publicInitial.route.contractVersion, 1);
assert.strictEqual(publicInitial.route.choices.length, 2);
assert(publicInitial.route.choices.every(choice => choice.routeContract?.version === 1));
assert.strictEqual(publicInitial.combatTactics.version, 2);
assert.strictEqual(publicInitial.combatTactics.reportVersion, CONTENT_SNAPSHOT.combatTactics.reportVersion);
assert.strictEqual(publicInitial.combatTactics.lastResolution, null);
assert.strictEqual(publicInitial.stats.combatTacticOpportunities, 0);
assert.strictEqual(publicInitial.stats.combatTacticSuccesses, 0);
assert.strictEqual(publicInitial.stats.combatTacticAdvancedSuccesses, 0);
assert(!publicJson.includes('enemyAdjustments'), 'public projection must not expose private enemy coefficients');
assert(!publicJson.includes('rewardAdjustments'), 'public projection must not expose private reward coefficients');
assert.throws(
  () => normalizePayload('play_card', { cardInstanceId: 'card-1', damage: 9999 }),
  error => error.reason === 'invalid_action_payload',
  'client-authored damage must be rejected',
);
assert.throws(
  () => applyCommand(initial, CONTENT_SNAPSHOT, 'choose_reward', { rewardId: 'reward-forged' }),
  error => error.reason === 'command_not_allowed',
);
assert.strictEqual(stableStringify(initial), initialCopy, 'rejected commands must not mutate canonical state');
assert(initial.player.deck.every(card => card.upgraded === false), 'v8 genesis should explicitly pin every card as unupgraded');
assert.deepStrictEqual(publicInitial.player.upgradedDeckCounts, {});
assert.strictEqual(publicInitial.player.deckCrafting.minDeckSize, 8);

const contestedChoice = publicInitial.route.choices.find(choice => choice.routeContract.contractId === 'contested');
assert(contestedChoice, 'the opening route pair must expose the contested contract');
const contestedStart = applyCommand(
  initial,
  CONTENT_SNAPSHOT,
  'select_node',
  { nodeId: contestedChoice.nodeId },
);
const contestedBattle = projectState(contestedStart.state, CONTENT_SNAPSHOT);
const contestedEnemy = CONTENT_SNAPSHOT.enemies[contestedChoice.enemyId];
const contestedProfile = CONTENT_SNAPSHOT.routeContracts.profiles.contested;
assert.strictEqual(contestedBattle.battle.enemy.maxHp, contestedChoice.maxHp);
assert.strictEqual(contestedBattle.battle.routeContract.contractId, 'contested');
assert.strictEqual(
  contestedBattle.battle.enemy.intent.amount || 0,
  contestedEnemy.pattern[0].amount
    ? Number(contestedEnemy.pattern[0].amount) + contestedProfile.enemyAdjustments.intentDamageBonus
    : 0,
  'the selected contract must bind enemy intent pressure on the server',
);
assert.strictEqual(
  contestedBattle.battle.enemy.intent.block || 0,
  contestedEnemy.pattern[0].block
    ? Number(contestedEnemy.pattern[0].block) + contestedProfile.enemyAdjustments.intentBlockBonus
    : 0,
);
assert.deepStrictEqual(contestedStart.events, [{
  type: 'encounter_started',
  nodeId: contestedChoice.nodeId,
  enemyId: contestedChoice.enemyId,
  routeContractId: 'contested',
}]);
const intentLabelProbe = JSON.parse(stableStringify(contestedStart.state));
intentLabelProbe.battle.enemy.enemyId = 'mirror_seer';
intentLabelProbe.battle.enemy.intentIndex = 0;
const adjustedCombinedIntent = projectState(intentLabelProbe, CONTENT_SNAPSHOT).battle.enemy.intent;
assert.strictEqual(adjustedCombinedIntent.label, '镜返 6 / 6');
assert.strictEqual(adjustedCombinedIntent.block, 6);
assert.strictEqual(adjustedCombinedIntent.amount, 6);
assert.throws(
  () => applyCommand(
    initial,
    { ...CONTENT_SNAPSHOT, contentVersion: 'authoritative-trials-v4' },
    'abandon',
    {},
  ),
  error => error.reason === 'content_state_mismatch',
  'commands must not execute against a different immutable content snapshot',
);

const tacticRoleProbe = createTacticProbe({
  label: 'tactic-role-projection',
  handCardIds: ['strike', 'guard', 'insight', 'ember_riposte'],
});
const projectedTacticRoleHand = Object.fromEntries(
  projectState(tacticRoleProbe, CONTENT_SNAPSHOT).player.hand.map(card => [card.cardId, card.tacticRole]),
);
assert.strictEqual(projectedTacticRoleHand.strike, 'attack');
assert.strictEqual(projectedTacticRoleHand.guard, 'guard');
assert.strictEqual(projectedTacticRoleHand.insight, undefined);
assert.strictEqual(projectedTacticRoleHand.ember_riposte, undefined);

const attackProgressProbe = createTacticProbe({
  label: 'attack-progress',
  contractId: 'steady',
  enemyId: 'ink_scout',
  intentIndex: 0,
  handCardIds: ['strike', 'guard'],
});
const attackProjectedBefore = projectState(attackProgressProbe, CONTENT_SNAPSHOT);
assert.strictEqual(attackProjectedBefore.battle.tactic.version, 2);
assert.strictEqual(attackProjectedBefore.battle.tactic.tacticId, 'answer_attack');
assert.deepStrictEqual(attackProjectedBefore.battle.tactic.lines.map(line => line.lineId), ['brace', 'counterflow']);
assert.strictEqual(findTacticLine(attackProjectedBefore.battle.tactic, 'brace').requirements[0].target, 4);
assert.strictEqual(
  findTacticLine(attackProjectedBefore.battle.tactic, 'counterflow').requirements.find(requirement => requirement.metric === 'roleSequence').actual,
  0,
  'attack advanced line should start with zero sequence progress',
);
const attackAfterStrike = applyCommand(
  attackProgressProbe,
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: attackProgressProbe.player.hand[0].instanceId },
);
assert.strictEqual(findEvent(attackAfterStrike.events, 'card_played').tacticRole, 'attack');
const attackProjectedMid = projectState(attackAfterStrike.state, CONTENT_SNAPSHOT);
assert.strictEqual(
  findTacticLine(attackProjectedMid.battle.tactic, 'counterflow').requirements.find(requirement => requirement.metric === 'roleSequence').actual,
  1,
  'attack advanced line should record attack->guard sequence progress after the opening attack',
);
const attackAdvancedResult = runTacticProbe(
  attackAfterStrike.state,
  [attackProgressProbe.player.hand[1].instanceId],
);
const attackAdvancedResolution = findEvent(attackAdvancedResult.endTurnEvents, 'enemy_tactic_resolved');
const attackAdvancedIntent = findEvent(attackAdvancedResult.endTurnEvents, 'enemy_intent_resolved');
assert.strictEqual(attackAdvancedResolution.success, true);
assert.strictEqual(attackAdvancedResolution.tacticId, 'answer_attack');
assert.strictEqual(attackAdvancedResolution.lineId, 'counterflow');
assert.strictEqual(attackAdvancedResolution.tier, 'advanced');
assert.strictEqual(attackAdvancedResolution.damageReduction, 4);
assert.strictEqual(attackAdvancedIntent.damageTaken, 0);
assert.strictEqual(findTacticLine(attackAdvancedResolution, 'brace').completed, true);
assert.strictEqual(findTacticLine(attackAdvancedResolution, 'counterflow').completed, true);
assert.strictEqual(attackAdvancedResult.state.stats.combatTacticAdvancedSuccesses, 1);
assert.strictEqual(projectState(attackAdvancedResult.state, CONTENT_SNAPSHOT).combatTactics.lastResolution.lineId, 'counterflow');

const defendProgressProbe = createTacticProbe({
  label: 'defend-progress',
  contractId: 'steady',
  enemyId: 'mirror_seer',
  intentIndex: 0,
  handCardIds: ['guard', 'strike'],
});
const defendAfterGuard = applyCommand(
  defendProgressProbe,
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: defendProgressProbe.player.hand[0].instanceId },
);
assert.strictEqual(findEvent(defendAfterGuard.events, 'card_played').tacticRole, 'guard');
const defendProjectedMid = projectState(defendAfterGuard.state, CONTENT_SNAPSHOT);
assert.strictEqual(
  findTacticLine(defendProjectedMid.battle.tactic, 'turnabout').requirements.find(requirement => requirement.metric === 'roleSequence').actual,
  1,
  'defend_attack advanced line should record guard->attack sequence progress after the opening guard',
);
const defendAdvancedResult = runTacticProbe(
  defendAfterGuard.state,
  [defendProgressProbe.player.hand[1].instanceId],
);
const defendAdvancedResolution = findEvent(defendAdvancedResult.endTurnEvents, 'enemy_tactic_resolved');
assert.strictEqual(defendAdvancedResolution.lineId, 'turnabout');
assert.strictEqual(defendAdvancedResolution.tier, 'advanced');
assert.strictEqual(defendAdvancedResolution.damageReduction, 3);
assert.strictEqual(defendAdvancedResolution.blockReduction, 3);
assert.strictEqual(defendAdvancedResult.state.stats.combatTacticAdvancedSuccesses, 1);

const v2DualLinePriorityCases = [
  {
    label: 'attack-steady',
    contractId: 'steady',
    enemyId: 'ink_scout',
    intentIndex: 0,
    successCards: ['strike', 'guard'],
    expectedSuccess: {
      tacticId: 'answer_attack',
      lineId: 'counterflow',
      tier: 'advanced',
      damageReduction: 4,
      blockReduction: 0,
      damageTaken: 0,
    },
  },
  {
    label: 'fortify-contested',
    contractId: 'contested',
    enemyId: 'ash_acolyte',
    intentIndex: 1,
    successCards: ['strike', 'strike'],
    expectedSuccess: {
      tacticId: 'answer_fortify',
      lineId: 'swiftbreak',
      tier: 'advanced',
      damageReduction: 0,
      blockReduction: 6,
      damageTaken: 0,
    },
  },
  {
    label: 'defend-attack-perilous',
    contractId: 'perilous',
    enemyId: 'mirror_seer',
    intentIndex: 0,
    successCards: ['guard', 'strike'],
    expectedSuccess: {
      tacticId: 'answer_balance',
      lineId: 'turnabout',
      tier: 'advanced',
      damageReduction: 3,
      blockReduction: 3,
      damageTaken: 0,
    },
  },
];

for (const tacticCase of v2DualLinePriorityCases) {
  const successProbe = createTacticProbe({
    label: `${tacticCase.label}:success`,
    contractId: tacticCase.contractId,
    enemyId: tacticCase.enemyId,
    intentIndex: tacticCase.intentIndex,
    handCardIds: tacticCase.successCards,
  });
  const projectedBefore = projectState(successProbe, CONTENT_SNAPSHOT);
  assert.strictEqual(projectedBefore.battle.tactic.version, 2);
  assert.strictEqual(projectedBefore.battle.tactic.tacticId, tacticCase.expectedSuccess.tacticId);
  assert(projectedBefore.battle.tactic.lines.some(line => line.tier === 'standard'));
  assert(projectedBefore.battle.tactic.lines.some(line => line.tier === 'advanced'));
  assert.strictEqual(projectedBefore.battle.tactic.completed, false);
  const successResult = runTacticProbe(
    successProbe,
    successProbe.player.hand.map(card => card.instanceId),
  );
  const successResolution = findEvent(successResult.endTurnEvents, 'enemy_tactic_resolved');
  const successIntent = findEvent(successResult.endTurnEvents, 'enemy_intent_resolved');
  assert(successResolution, `${tacticCase.label} should emit an enemy_tactic_resolved receipt`);
  assert(successIntent, `${tacticCase.label} should emit an enemy_intent_resolved receipt`);
  assert.strictEqual(successResolution.success, true, `${tacticCase.label} should succeed when both lines are satisfied`);
  assert.strictEqual(successResolution.tacticId, tacticCase.expectedSuccess.tacticId);
  assert.strictEqual(successResolution.lineId, tacticCase.expectedSuccess.lineId);
  assert.strictEqual(successResolution.tier, tacticCase.expectedSuccess.tier);
  assert.strictEqual(successResolution.damageReduction, tacticCase.expectedSuccess.damageReduction);
  assert.strictEqual(successResolution.blockReduction, tacticCase.expectedSuccess.blockReduction);
  assert.strictEqual(findTacticLine(successResolution, tacticCase.expectedSuccess.lineId).completed, true);
  assert(successResolution.requirements.every(requirement => requirement.met), `${tacticCase.label} success receipt should mark every selected-line requirement as met`);
  assert.strictEqual(successIntent.damageTaken, tacticCase.expectedSuccess.damageTaken);
  assert.strictEqual(successResult.state.stats.combatTacticOpportunities, 1);
  assert.strictEqual(successResult.state.stats.combatTacticSuccesses, 1);
  assert.strictEqual(successResult.state.stats.combatTacticAdvancedSuccesses, 1);
  const projectedAfter = projectState(successResult.state, CONTENT_SNAPSHOT);
  assert.strictEqual(projectedAfter.combatTactics.lastResolution.success, true);
  assert.strictEqual(projectedAfter.combatTactics.lastResolution.lineId, tacticCase.expectedSuccess.lineId);
}

const fortifyMaxCardProbe = createTacticProbe({
  label: 'fortify-max-cards',
  contractId: 'contested',
  enemyId: 'ash_acolyte',
  intentIndex: 1,
  handCardIds: ['strike', 'insight', 'strike'],
});
const fortifyAfterFirstCard = applyCommand(
  fortifyMaxCardProbe,
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: fortifyMaxCardProbe.player.hand[0].instanceId },
);
assert.deepStrictEqual(
  findTacticLine(projectState(fortifyAfterFirstCard.state, CONTENT_SNAPSHOT).battle.tactic, 'swiftbreak')
    .requirements.find(requirement => requirement.metric === 'cardsPlayedMin'),
  {
    metric: 'cardsPlayedMin',
    label: '本回合至少出牌',
    target: 2,
    actual: 1,
    comparison: 'gte',
    met: false,
  },
  'fortify advanced line must not resolve from the first card',
);
assert.strictEqual(
  findTacticLine(projectState(fortifyAfterFirstCard.state, CONTENT_SNAPSHOT).battle.tactic, 'swiftbreak').completed,
  false,
  'fortify advanced line must remain incomplete even when the first strike already meets its damage target',
);
const fortifyAfterSecondCard = applyCommand(
  fortifyAfterFirstCard.state,
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: fortifyMaxCardProbe.player.hand[1].instanceId },
);
assert.strictEqual(
  findTacticLine(projectState(fortifyAfterSecondCard.state, CONTENT_SNAPSHOT).battle.tactic, 'swiftbreak')
    .requirements.find(requirement => requirement.metric === 'cardsPlayedMin').met,
  true,
  'fortify advanced line should open only after the second card',
);
assert.strictEqual(
  findTacticLine(projectState(fortifyAfterSecondCard.state, CONTENT_SNAPSHOT).battle.tactic, 'swiftbreak').completed,
  true,
  'fortify advanced line should resolve after exactly two cards when its damage target is met',
);
assert.strictEqual(
  findTacticLine(projectState(fortifyAfterSecondCard.state, CONTENT_SNAPSHOT).battle.tactic, 'swiftbreak')
    .requirements.find(requirement => requirement.metric === 'cardsPlayedMax').actual,
  2,
  'fortify advanced line should stay within the card cap before the third play',
);
const fortifyMaxCardResult = runTacticProbe(
  fortifyAfterSecondCard.state,
  [fortifyMaxCardProbe.player.hand[2].instanceId],
);
const fortifyMaxCardResolution = findEvent(fortifyMaxCardResult.endTurnEvents, 'enemy_tactic_resolved');
assert.strictEqual(fortifyMaxCardResolution.lineId, 'break');
assert.strictEqual(fortifyMaxCardResolution.tier, 'standard');
assert.strictEqual(
  findTacticLine(fortifyMaxCardResolution, 'swiftbreak').requirements.find(requirement => requirement.metric === 'cardsPlayedMax').actual,
  3,
  'fortify advanced line must stop resolving once the player exceeds the max-card constraint',
);
assert.strictEqual(
  findTacticLine(fortifyMaxCardResolution, 'swiftbreak').requirements.find(requirement => requirement.metric === 'cardsPlayedMax').met,
  false,
  'fortify advanced line must fail its cardsPlayedMax requirement after the third play',
);

const failedAttackProbe = createTacticProbe({
  label: 'attack-failure-no-extra-penalty',
  contractId: 'steady',
  enemyId: 'ink_scout',
  intentIndex: 0,
  handCardIds: [],
});
const failedAttackBefore = projectState(failedAttackProbe, CONTENT_SNAPSHOT);
const failedAttackResult = runTacticProbe(failedAttackProbe, []);
const failedAttackResolution = findEvent(failedAttackResult.endTurnEvents, 'enemy_tactic_resolved');
const failedAttackIntent = findEvent(failedAttackResult.endTurnEvents, 'enemy_intent_resolved');
assert.strictEqual(failedAttackResolution.success, false);
assert.strictEqual(failedAttackResolution.lineId, '');
assert.strictEqual(failedAttackResolution.tier, '');
assert.strictEqual(failedAttackResolution.damageReduction, 0);
assert.strictEqual(failedAttackResolution.blockReduction, 0);
assert.strictEqual(failedAttackResolution.requirements.length, 0);
assert(failedAttackResolution.lines.every(line => line.completed === false), 'failed turn should not auto-complete any tactic line');
assert.strictEqual(failedAttackIntent.damagePrevented, 0);
assert.strictEqual(failedAttackIntent.blockPrevented, 0);
assert.strictEqual(
  failedAttackIntent.damageTaken,
  Number(failedAttackBefore.battle.enemy.intent.amount || 0) - Number(failedAttackBefore.player.block || 0),
  'failed turn should resolve only the base enemy intent without an extra tactic penalty',
);
assert.strictEqual(failedAttackResult.state.stats.combatTacticSuccesses, 0);
assert.strictEqual(failedAttackResult.state.stats.combatTacticAdvancedSuccesses, 0);
assert.strictEqual(projectState(failedAttackResult.state, CONTENT_SNAPSHOT).combatTactics.lastResolution.success, false);

const historicalV7Initial = create(
  'pve',
  'historical-v7:initial',
  'historical-v7-initial-0001',
  '',
  HISTORICAL_V7_CONTENT,
);
const historicalV7PublicInitial = projectState(historicalV7Initial, HISTORICAL_V7_CONTENT);
assert.strictEqual(historicalV7PublicInitial.contentVersion, 'authoritative-trials-v7');
assert.strictEqual(historicalV7PublicInitial.combatTactics.version, 1);
assert.strictEqual(historicalV7PublicInitial.stats.combatTacticAdvancedSuccesses, undefined);

const historicalV7TacticCases = [
  {
    label: 'attack-steady',
    contractId: 'steady',
    enemyId: 'ink_scout',
    intentIndex: 0,
    successCards: ['guard'],
    failureCards: [],
    expectedPublic: {
      tacticId: 'brace',
      intentType: 'attack',
      targets: [4],
    },
    expectedSuccess: {
      damageReduction: 2,
      blockReduction: 0,
      damageTaken: 0,
    },
  },
  {
    label: 'fortify-contested',
    contractId: 'contested',
    enemyId: 'ash_acolyte',
    intentIndex: 1,
    successCards: ['strike'],
    failureCards: ['fracture'],
    expectedPublic: {
      tacticId: 'break',
      intentType: 'fortify',
      targets: [6],
    },
    expectedSuccess: {
      damageReduction: 0,
      blockReduction: 4,
      damageTaken: 0,
    },
  },
  {
    label: 'defend-attack-perilous',
    contractId: 'perilous',
    enemyId: 'mirror_seer',
    intentIndex: 0,
    successCards: ['ember_riposte'],
    failureCards: ['strike'],
    expectedPublic: {
      tacticId: 'balance',
      intentType: 'defend_attack',
      targets: [4, 4],
    },
    expectedSuccess: {
      damageReduction: 2,
      blockReduction: 2,
      damageTaken: 1,
    },
  },
];

for (const tacticCase of historicalV7TacticCases) {
  const successProbe = createTacticProbe({
    label: `historical-v7:${tacticCase.label}:success`,
    contractId: tacticCase.contractId,
    enemyId: tacticCase.enemyId,
    intentIndex: tacticCase.intentIndex,
    handCardIds: tacticCase.successCards,
    content: HISTORICAL_V7_CONTENT,
  });
  const projectedBefore = projectState(successProbe, HISTORICAL_V7_CONTENT);
  assert.strictEqual(projectedBefore.battle.tactic.version, 1);
  assert.deepStrictEqual(
    Object.keys(projectedBefore.battle.tactic).sort(),
    ['cardsPlayed', 'completed', 'effects', 'intentType', 'prompt', 'requirements', 'rewardSummary', 'status', 'tacticId', 'title', 'version'],
    `${tacticCase.label} historical v7 public tactic shape drifted`,
  );
  assert(projectedBefore.player.hand.every(card => card.tacticRole === undefined), `${tacticCase.label} historical v7 hand projection must not add tacticRole`);
  assert.strictEqual(projectedBefore.battle.tactic.tacticId, tacticCase.expectedPublic.tacticId);
  assert.strictEqual(projectedBefore.battle.tactic.intentType, tacticCase.expectedPublic.intentType);
  assert.deepStrictEqual(
    projectedBefore.battle.tactic.requirements.map(requirement => requirement.target),
    tacticCase.expectedPublic.targets,
    `${tacticCase.label} historical v7 public tactic thresholds drifted`,
  );
  const successResult = runTacticProbe(
    successProbe,
    successProbe.player.hand.map(card => card.instanceId),
    HISTORICAL_V7_CONTENT,
  );
  const successResolution = findEvent(successResult.endTurnEvents, 'enemy_tactic_resolved');
  const successIntent = findEvent(successResult.endTurnEvents, 'enemy_intent_resolved');
  assert.deepStrictEqual(
    Object.keys(successResolution).sort(),
    ['blockReduction', 'damageReduction', 'intentType', 'requirements', 'rewardSummary', 'success', 'tacticId', 'title', 'type', 'version'],
    `${tacticCase.label} historical v7 tactic receipt shape drifted`,
  );
  assert.strictEqual(successResolution.version, 1);
  assert.strictEqual(successResolution.success, true);
  assert.strictEqual(successResolution.tacticId, tacticCase.expectedPublic.tacticId);
  assert.strictEqual(successResolution.intentType, tacticCase.expectedPublic.intentType);
  assert.strictEqual(successResolution.damageReduction, tacticCase.expectedSuccess.damageReduction);
  assert.strictEqual(successResolution.blockReduction, tacticCase.expectedSuccess.blockReduction);
  assert(successResolution.requirements.every(requirement => requirement.met), `${tacticCase.label} historical v7 success receipt should mark every requirement as met`);
  assert.strictEqual(successIntent.damageTaken, tacticCase.expectedSuccess.damageTaken);
  assert.strictEqual(successResult.state.stats.combatTacticOpportunities, 1);
  assert.strictEqual(successResult.state.stats.combatTacticSuccesses, 1);
  assert.strictEqual(successResult.state.stats.combatTacticAdvancedSuccesses, undefined);
  const projectedAfter = projectState(successResult.state, HISTORICAL_V7_CONTENT);
  assert.deepStrictEqual(
    Object.keys(projectedAfter.combatTactics.lastResolution).sort(),
    ['blockReduction', 'damageReduction', 'intentType', 'requirements', 'rewardSummary', 'success', 'tacticId', 'title', 'version'],
    `${tacticCase.label} historical v7 projected lastResolution shape drifted`,
  );

  const failureProbe = createTacticProbe({
    label: `historical-v7:${tacticCase.label}:failure`,
    contractId: tacticCase.contractId,
    enemyId: tacticCase.enemyId,
    intentIndex: tacticCase.intentIndex,
    handCardIds: tacticCase.failureCards,
    content: HISTORICAL_V7_CONTENT,
  });
  const failureResult = runTacticProbe(
    failureProbe,
    failureProbe.player.hand.map(card => card.instanceId),
    HISTORICAL_V7_CONTENT,
  );
  const failureResolution = findEvent(failureResult.endTurnEvents, 'enemy_tactic_resolved');
  assert.deepStrictEqual(
    Object.keys(failureResolution).sort(),
    ['blockReduction', 'damageReduction', 'intentType', 'requirements', 'rewardSummary', 'success', 'tacticId', 'title', 'type', 'version'],
    `${tacticCase.label} historical v7 failure receipt shape drifted`,
  );
  assert.strictEqual(failureResolution.success, false, `${tacticCase.label} historical v7 failure receipt must remain explicit`);
  assert(failureResolution.requirements.some(requirement => !requirement.met), `${tacticCase.label} historical v7 failure receipt should preserve the unmet requirement`);
  assert.strictEqual(failureResult.state.stats.combatTacticSuccesses, 0);
  assert.strictEqual(projectState(failureResult.state, HISTORICAL_V7_CONTENT).combatTactics.lastResolution.success, false);
}

const persistentBlockExpectations = [
  { contractId: 'steady', enemyId: 'ash_acolyte', intentIndex: 1, cards: ['strike'], expectedBlock: 4, label: 'fortify/steady' },
  { contractId: 'contested', enemyId: 'ash_acolyte', intentIndex: 1, cards: ['strike'], expectedBlock: 4, label: 'fortify/contested' },
  { contractId: 'perilous', enemyId: 'ash_acolyte', intentIndex: 1, cards: ['strike'], expectedBlock: 5, label: 'fortify/perilous' },
  { contractId: 'steady', enemyId: 'mirror_seer', intentIndex: 0, cards: ['ember_riposte'], expectedBlock: 3, label: 'defend_attack/steady' },
  { contractId: 'contested', enemyId: 'mirror_seer', intentIndex: 0, cards: ['ember_riposte'], expectedBlock: 4, label: 'defend_attack/contested' },
  { contractId: 'perilous', enemyId: 'mirror_seer', intentIndex: 0, cards: ['ember_riposte'], expectedBlock: 5, label: 'defend_attack/perilous' },
];

for (const expectation of persistentBlockExpectations) {
  const probe = createTacticProbe({
    label: `persistent:${expectation.label}`,
    contractId: expectation.contractId,
    enemyId: expectation.enemyId,
    intentIndex: expectation.intentIndex,
    handCardIds: expectation.cards,
  });
  const result = runTacticProbe(probe, probe.player.hand.map(card => card.instanceId));
  const projected = projectState(result.state, CONTENT_SNAPSHOT);
  assert.strictEqual(
    projected.battle.enemy.block,
    expectation.expectedBlock,
    `${expectation.label} should carry its reduced block into the next player turn`,
  );
}

const fortifyCarryProbe = createTacticProbe({
  label: 'carry-fortify',
  contractId: 'steady',
  enemyId: 'ash_acolyte',
  intentIndex: 1,
  handCardIds: ['strike'],
});
const fortifyCarry = runTacticProbe(
  fortifyCarryProbe,
  fortifyCarryProbe.player.hand.map(card => card.instanceId),
);
assert.strictEqual(projectState(fortifyCarry.state, CONTENT_SNAPSHOT).battle.enemy.block, 4);
fortifyCarry.state.player.hand = [{ instanceId: 'probe-followup-strike', cardId: 'strike', upgraded: false }];
fortifyCarry.state.player.drawPile = [];
fortifyCarry.state.player.discardPile = [];
fortifyCarry.state.player.energy = 3;
const fortifyCarryHit = applyCommand(
  fortifyCarry.state,
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: 'probe-followup-strike' },
);
assert.strictEqual(fortifyCarryHit.events[0].damage, 4, 'persistent fortify block should absorb the next player-turn damage first');
assert.strictEqual(fortifyCarryHit.state.battle.enemy.block, 0);
const fortifyCarryClear = applyCommand(fortifyCarryHit.state, CONTENT_SNAPSHOT, 'end_turn', {});
assert.strictEqual(
  findEvent(fortifyCarryClear.events, 'enemy_intent_resolved').enemyBlock,
  0,
  'persistent fortify block must clear before the next enemy intent resolves',
);
assert.strictEqual(fortifyCarryClear.state.battle.enemy.block, 0);

const defendCarryProbe = createTacticProbe({
  label: 'carry-defend-attack',
  contractId: 'steady',
  enemyId: 'mirror_seer',
  intentIndex: 0,
  handCardIds: ['ember_riposte'],
});
const defendCarry = runTacticProbe(
  defendCarryProbe,
  defendCarryProbe.player.hand.map(card => card.instanceId),
);
assert.strictEqual(projectState(defendCarry.state, CONTENT_SNAPSHOT).battle.enemy.block, 3);
defendCarry.state.player.hand = [{ instanceId: 'probe-followup-strike-2', cardId: 'strike', upgraded: false }];
defendCarry.state.player.drawPile = [];
defendCarry.state.player.discardPile = [];
defendCarry.state.player.energy = 3;
const defendCarryHit = applyCommand(
  defendCarry.state,
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: 'probe-followup-strike-2' },
);
assert.strictEqual(defendCarryHit.events[0].damage, 5, 'persistent defend_attack block should absorb the next player-turn damage first');
assert.strictEqual(defendCarryHit.state.battle.enemy.block, 0);
const defendCarryClear = applyCommand(defendCarryHit.state, CONTENT_SNAPSHOT, 'end_turn', {});
assert.strictEqual(
  findEvent(defendCarryClear.events, 'enemy_intent_resolved').enemyBlock,
  0,
  'defend_attack carryover block should clear before the next enemy action',
);
assert.strictEqual(defendCarryClear.state.battle.enemy.block, 0);

const wardingStrideAttack = applyCommand(
  createTacticProbe({
    label: 'warding-stride-attack',
    contractId: 'steady',
    enemyId: 'ink_scout',
    intentIndex: 0,
    handCardIds: ['warding_stride'],
  }),
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: 'probe-card-1' },
);
assert.strictEqual(wardingStrideAttack.events[0].block, 8);
assert.strictEqual(wardingStrideAttack.events[0].conditionalBlock, 4);
const wardingStrideFortify = applyCommand(
  createTacticProbe({
    label: 'warding-stride-fortify',
    contractId: 'steady',
    enemyId: 'ash_acolyte',
    intentIndex: 1,
    handCardIds: ['warding_stride'],
  }),
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: 'probe-card-1' },
);
assert.strictEqual(wardingStrideFortify.events[0].block, 4);
assert.strictEqual(wardingStrideFortify.events[0].conditionalBlock, undefined);

const sealbreakerWithBlock = applyCommand(
  createTacticProbe({
    label: 'sealbreaker-with-block',
    contractId: 'steady',
    enemyId: 'ink_scout',
    intentIndex: 0,
    enemyBlock: 4,
    handCardIds: ['sealbreaker'],
  }),
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: 'probe-card-1' },
);
assert.strictEqual(sealbreakerWithBlock.events[0].damage, 12);
assert.strictEqual(sealbreakerWithBlock.events[0].conditionalDamage, 7);
const sealbreakerWithoutBlock = applyCommand(
  createTacticProbe({
    label: 'sealbreaker-without-block',
    contractId: 'steady',
    enemyId: 'ink_scout',
    intentIndex: 0,
    enemyBlock: 0,
    handCardIds: ['sealbreaker'],
  }),
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: 'probe-card-1' },
);
assert.strictEqual(sealbreakerWithoutBlock.events[0].damage, 9);
assert.strictEqual(sealbreakerWithoutBlock.events[0].conditionalDamage, undefined);

let craftingState = create('pve', 'pve:crafting:0', 'crafting-pve-0001');
while (craftingState.phase !== 'reward') {
  const [command, payload] = chooseCommand(craftingState);
  craftingState = applyCommand(craftingState, CONTENT_SNAPSHOT, command, payload).state;
}
const firstCraftingView = projectState(craftingState, CONTENT_SNAPSHOT);
assert.strictEqual(firstCraftingView.reward.choices.filter(choice => choice.kind === 'card').length, 2);
assert(firstCraftingView.reward.routeContract?.contractId);
assert(!JSON.stringify(firstCraftingView.reward).includes('rewardAdjustments'));
assert(firstCraftingView.reward.choices.some(choice => choice.kind === 'upgrade_card'));
assert(!firstCraftingView.reward.choices.some(choice => choice.kind === 'remove_card'), 'trimming must stay locked after only one encounter');
const upgradeChoice = firstCraftingView.reward.choices.find(choice => choice.kind === 'upgrade_card');
const upgradeTarget = craftingState.player.deck.find(card => card.instanceId === upgradeChoice.targetCardInstanceId);
const upgradedState = applyCommand(
  craftingState,
  CONTENT_SNAPSHOT,
  'choose_reward',
  { rewardId: upgradeChoice.rewardId },
).state;
assert.strictEqual(upgradedState.player.deck.length, craftingState.player.deck.length, 'upgrading must preserve deck size');
assert.strictEqual(
  upgradedState.player.deck.find(card => card.instanceId === upgradeTarget.instanceId)?.upgraded,
  true,
  'upgrade reward must mutate the exact server-selected card instance',
);
assert.strictEqual(upgradedState.stats.cardsUpgraded, 1);

const upgradedPlayProbe = JSON.parse(stableStringify(upgradedState));
const nextNode = projectState(upgradedPlayProbe, CONTENT_SNAPSHOT).route.choices[0];
const battleProbe = applyCommand(upgradedPlayProbe, CONTENT_SNAPSHOT, 'select_node', { nodeId: nextNode.nodeId }).state;
const upgradedInstance = battleProbe.player.deck.find(card => card.instanceId === upgradeTarget.instanceId);
battleProbe.player.hand = [upgradedInstance];
battleProbe.player.drawPile = battleProbe.player.drawPile.filter(card => card.instanceId !== upgradedInstance.instanceId);
battleProbe.player.discardPile = battleProbe.player.discardPile.filter(card => card.instanceId !== upgradedInstance.instanceId);
battleProbe.player.energy = 3;
battleProbe.battle.enemy.block = 0;
const upgradedCardView = projectState(battleProbe, CONTENT_SNAPSHOT).player.hand[0];
assert.strictEqual(upgradedCardView.upgraded, true);
assert.strictEqual(upgradedCardView.name, CONTENT_SNAPSHOT.cards[upgradeTarget.cardId].upgrade.name);
const upgradedPlay = applyCommand(
  battleProbe,
  CONTENT_SNAPSHOT,
  'play_card',
  { cardInstanceId: upgradedInstance.instanceId },
);
assert.strictEqual(
  upgradedPlay.events[0].damage,
  CONTENT_SNAPSHOT.cards[upgradeTarget.cardId].upgrade.effect.damage,
  'upgraded instance must resolve the upgraded effect on the server',
);

let secondRewardState = upgradedState;
while (!(secondRewardState.phase === 'reward' && secondRewardState.route.stageIndex === 1)) {
  const [command, payload] = chooseCommand(secondRewardState);
  secondRewardState = applyCommand(secondRewardState, CONTENT_SNAPSHOT, command, payload).state;
}
const secondRewardView = projectState(secondRewardState, CONTENT_SNAPSHOT);
const secondRewardContract = CONTENT_SNAPSHOT.routeContracts.profiles[
  secondRewardView.reward.routeContract.contractId
];
assert(secondRewardContract, 'reward state must retain its selected route contract');
assert.strictEqual(
  secondRewardView.reward.choices.filter(choice => choice.kind === 'card').length,
  CONTENT_SNAPSHOT.deckCrafting.cardOfferCount + secondRewardContract.rewardAdjustments.extraCardOffers,
  'the selected route must bind its card-offer premium to the reward state',
);
const healingReward = secondRewardView.reward.choices.find(choice => choice.kind === 'heal');
if (healingReward) {
  assert.strictEqual(
    healingReward.amount,
    CONTENT_SNAPSHOT.deckCrafting.healAmount + secondRewardContract.rewardAdjustments.healBonus,
  );
}
const vitalityReward = secondRewardView.reward.choices.find(choice => choice.kind === 'max_hp');
if (vitalityReward) {
  assert.strictEqual(
    vitalityReward.amount,
    CONTENT_SNAPSHOT.deckCrafting.maxHpAmount + secondRewardContract.rewardAdjustments.maxHpBonus,
  );
}
const removeChoice = secondRewardView.reward.choices.find(choice => choice.kind === 'remove_card');
assert(removeChoice, 'a healthy deck should unlock one exact trim choice after the second encounter');
const removedState = applyCommand(
  secondRewardState,
  CONTENT_SNAPSHOT,
  'choose_reward',
  { rewardId: removeChoice.rewardId },
).state;
assert.strictEqual(removedState.player.deck.length, secondRewardState.player.deck.length - 1);
assert(!removedState.player.deck.some(card => card.instanceId === removeChoice.targetCardInstanceId));
assert.strictEqual(removedState.stats.cardsRemoved, 1);
const exhaustedTrimState = JSON.parse(stableStringify(secondRewardState));
exhaustedTrimState.stats.cardsRemoved = CONTENT_SNAPSHOT.deckCrafting.maxCardsRemoved;
assert.throws(
  () => applyCommand(exhaustedTrimState, CONTENT_SNAPSHOT, 'choose_reward', { rewardId: removeChoice.rewardId }),
  error => error.reason === 'reward_target_invalid',
  'trim rewards must be revalidated against the run-wide removal cap',
);

const legacyContent = JSON.parse(stableStringify(CONTENT_SNAPSHOT));
legacyContent.contentVersion = 'authoritative-trials-v3';
delete legacyContent.routeContracts;
delete legacyContent.deckCrafting;
delete legacyContent.combatTactics;
Object.values(legacyContent.cards).forEach(card => delete card.upgrade);
const legacyRewardState = JSON.parse(stableStringify(initial));
legacyRewardState.contentVersion = legacyContent.contentVersion;
legacyRewardState.phase = 'reward';
legacyRewardState.battle = null;
legacyRewardState.route.choices = [];
delete legacyRewardState.route.contractVersion;
legacyRewardState.player.deck.forEach(card => delete card.upgraded);
delete legacyRewardState.stats.cardsUpgraded;
delete legacyRewardState.stats.cardsRemoved;
delete legacyRewardState.stats.combatTacticOpportunities;
delete legacyRewardState.stats.combatTacticSuccesses;
delete legacyRewardState.combatTactics;
legacyRewardState.reward = {
  choices: [{
    rewardId: 'reward-card-1-sky_pierce',
    kind: 'card',
    cardId: 'sky_pierce',
    name: '纳入「穿云」',
    description: '造成 13 点伤害。',
  }],
};
const legacyRewardResult = applyCommand(
  legacyRewardState,
  legacyContent,
  'choose_reward',
  { rewardId: 'reward-card-1-sky_pierce' },
);
assert(
  legacyRewardResult.state.player.deck.every(card => !Object.hasOwn(card, 'upgraded')),
  'v1-v3 replay must never backfill upgraded=false into historical card instances',
);
assert.deepStrictEqual(legacyRewardResult.events, [{
  type: 'reward_chosen',
  rewardId: 'reward-card-1-sky_pierce',
  rewardKind: 'card',
}]);

const legacyV6Content = cloneState(HISTORICAL_V6_CONTENT);
const legacyV6Initial = create(
  'pve',
  'legacy-v6:tactics:0',
  'legacy-v6-tactics-0001',
  '',
  legacyV6Content,
);
const legacyV6Projection = projectState(legacyV6Initial, legacyV6Content);
assert.strictEqual(legacyV6Projection.combatTactics, undefined);
assert.strictEqual(legacyV6Initial.combatTactics, undefined);
assert.strictEqual(legacyV6Initial.stats.combatTacticOpportunities, undefined);
assert.strictEqual(legacyV6Initial.stats.combatTacticSuccesses, undefined);
let legacyV6Battle = applyCommand(
  legacyV6Initial,
  legacyV6Content,
  'select_node',
  { nodeId: legacyV6Projection.route.choices[0].nodeId },
).state;
legacyV6Battle.battle.enemy.enemyId = 'ash_acolyte';
legacyV6Battle.battle.enemy.hp = CONTENT_SNAPSHOT.enemies.ash_acolyte.maxHp;
legacyV6Battle.battle.enemy.maxHp = CONTENT_SNAPSHOT.enemies.ash_acolyte.maxHp;
legacyV6Battle.battle.enemy.intentIndex = 1;
legacyV6Battle.player.hand = [];
legacyV6Battle.player.drawPile = [];
legacyV6Battle.player.discardPile = [];
legacyV6Battle.player.energy = 3;
legacyV6Battle = applyCommand(legacyV6Battle, legacyV6Content, 'end_turn', {}).state;
const legacyV6BattleProjection = projectState(legacyV6Battle, legacyV6Content);
assert.strictEqual(legacyV6Battle.battle.enemy.block, 0, 'legacy v6 enemy block should still clear immediately after the enemy turn');
assert.strictEqual(legacyV6BattleProjection.battle.tactic, undefined);
assert.strictEqual(legacyV6BattleProjection.combatTactics, undefined);
assert(!stableStringify(legacyV6Battle).includes('combatTactics'), 'legacy v6 canonical state must not backfill combatTactics fields');

const abandoned = applyCommand(initial, CONTENT_SNAPSHOT, 'abandon', {}).state;
assert.strictEqual(abandoned.phase, 'abandoned');
assert.strictEqual(abandoned.version, 1);
assert.strictEqual(abandoned.summary.reason, 'player_abandoned');

const relayDeckExpectations = Object.fromEntries(
  RELAY_EXPEDITION_SCENARIO_IDS.map((scenarioId) => [
    scenarioId,
    countDeckCards(CONTENT_SNAPSHOT.scenarios[scenarioId].starterDeck),
  ]),
);

for (const scenarioId of RELAY_EXPEDITION_SCENARIO_IDS) {
  const relayScenario = CONTENT_SNAPSHOT.scenarios[scenarioId];
  const relayInitial = create(
    'relay_expedition',
    `relay:${scenarioId}:golden:0`,
    `relay-${scenarioId}-golden-0001`,
    scenarioId,
  );
  const relayProjection = projectState(relayInitial, CONTENT_SNAPSHOT);
  assert.strictEqual(relayInitial.mode, 'relay_expedition');
  assert.strictEqual(relayInitial.scenarioId, scenarioId);
  assert.strictEqual(relayProjection.mode, 'relay_expedition');
  assert.strictEqual(relayProjection.scenario.scenarioId, scenarioId);
  assert.strictEqual(relayProjection.player.hp, relayScenario.maxHp, `${scenarioId} should start at full hp`);
  assert.strictEqual(relayProjection.player.maxHp, relayScenario.maxHp, `${scenarioId} should pin max hp`);
  assert.strictEqual(relayProjection.player.deckSize, 10, `${scenarioId} should use a 10-card standardized deck`);
  assert.deepStrictEqual(relayProjection.player.deckCounts, relayDeckExpectations[scenarioId], `${scenarioId} deck drifted`);
  assert.strictEqual(relayProjection.route.totalStages, 3, `${scenarioId} should pin a three-stage route`);
}

for (const scenarioId of BRANCHED_FATE_SCENARIO_IDS) {
  const scenario = CONTENT_SNAPSHOT.scenarios[scenarioId];
  const triggerLabel = `fate:${scenarioId}:branch-trigger`;
  const triggerRunId = `fate-${scenarioId}-branch-trigger-0001`;
  const initial = create('fate_chronicle', triggerLabel, triggerRunId, scenarioId);
  const triggered = advanceUntil(
    initial,
    (state, view) => state.phase === 'route' && view.route.stage === scenario.branchPlan.triggerStage,
  );
  assert.strictEqual(triggered.state.phase, 'route', `${scenarioId} should reach its branch trigger on a route phase`);
  assert.strictEqual(triggered.view.route.stage, scenario.branchPlan.triggerStage, `${scenarioId} should expose the configured trigger stage`);
  const branchChoices = triggered.view.route.choices.filter(choice => choice.chapterBranch && typeof choice.chapterBranch === 'object');
  assert.strictEqual(branchChoices.length, 2, `${scenarioId} trigger stage should project two chapterBranch choices`);
  const projectedBranchIds = branchChoices.map(choice => choice.chapterBranch.branchId).sort();
  const configuredBranchIds = scenario.branchPlan.options.map(option => option.branchId).sort();
  assert.deepStrictEqual(projectedBranchIds, configuredBranchIds, `${scenarioId} public branch ids must mirror the branchPlan`);
  branchChoices.forEach(choice => assertPublicChapterBranch(choice.chapterBranch, `${scenarioId}/${choice.nodeId}`));
  const triggerJson = JSON.stringify(triggered.view);
  PRIVATE_CHAPTER_BRANCH_FIELDS.forEach(field => {
    assert(!triggerJson.includes(field), `${scenarioId} trigger projection must not leak ${field}`);
  });

  const nextRouteByBranch = new Map();
  for (const branchId of configuredBranchIds) {
    const selectedChoice = branchChoices.find(choice => choice.chapterBranch.branchId === branchId);
    let state = applyCommand(
      cloneState(triggered.state),
      CONTENT_SNAPSHOT,
      'select_node',
      { nodeId: selectedChoice.nodeId },
    ).state;
    let projection = projectState(state, CONTENT_SNAPSHOT);
    assertPublicChapterBranch(projection.route.chapterBranch, `${scenarioId}/${branchId}/immediate`);
    assert.strictEqual(projection.route.chapterBranch.branchId, branchId, `${scenarioId} should persist the selected branch immediately after selection`);
    const nextRoute = advanceUntil(
      state,
      (routeState, view) => routeState.phase === 'route' && view.route.stage > scenario.branchPlan.triggerStage,
    );
    assert.strictEqual(nextRoute.state.phase, 'route', `${scenarioId}/${branchId} should return to a later route phase after the branch trigger`);
    assertPublicChapterBranch(nextRoute.view.route.chapterBranch, `${scenarioId}/${branchId}/later`);
    assert.strictEqual(nextRoute.view.route.chapterBranch.branchId, branchId, `${scenarioId} should preserve chapterBranch on later route projections`);
    nextRouteByBranch.set(branchId, routeSignature(nextRoute.view));
  }
  const [firstBranchId, secondBranchId] = configuredBranchIds;
  assert.notDeepStrictEqual(
    nextRouteByBranch.get(firstBranchId),
    nextRouteByBranch.get(secondBranchId),
    `${scenarioId} later route choices must diverge after choosing different chapter branches`,
  );

  for (const branchId of configuredBranchIds) {
    const completed = drive(
      'fate_chronicle',
      `fate:${scenarioId}:${branchId}:golden:0`,
      `fate-${scenarioId}-${branchId}-golden-0001`,
      scenarioId,
      CONTENT_SNAPSHOT,
      { chooseRoute: branchRouteSelector(branchId) },
    );
    assert.strictEqual(completed.state.phase, 'completed', `${scenarioId}/${branchId} should still complete under the standard driver`);
    assertPublicChapterBranch(
      completed.state.summary?.chapterBranchResolution,
      `${scenarioId}/${branchId}/summary`,
    );
    assert.strictEqual(
      completed.state.summary.chapterBranchResolution.branchId,
      branchId,
      `${scenarioId} terminal summary should preserve the selected chapter branch`,
    );
  }
}

const branchlessLegacyContent = cloneState(HISTORICAL_V5_CONTENT);
const branchlessLegacyInitial = create(
  'fate_chronicle',
  'fate:branchless-legacy:0',
  'fate-branchless-legacy-0001',
  'chronicle-ember-guard',
  branchlessLegacyContent,
);
const branchlessLegacyProjection = projectState(branchlessLegacyInitial, branchlessLegacyContent);
assert.strictEqual(branchlessLegacyProjection.route.chapterBranch, undefined, 'legacy content without branchPlan should not backfill a route-level chapterBranch');
assert(
  branchlessLegacyProjection.route.choices.every(choice => choice.chapterBranch === undefined),
  'legacy content without branchPlan should not project chapterBranch on route choices',
);
const branchlessLegacyResult = drive(
  'fate_chronicle',
  'fate:branchless-legacy:0',
  'fate-branchless-legacy-0001',
  'chronicle-ember-guard',
  branchlessLegacyContent,
);
assert.strictEqual(branchlessLegacyResult.state.summary?.chapterBranchResolution, undefined, 'legacy branchless replays should not synthesize chapterBranchResolution');

const legacyV4Content = JSON.parse(stableStringify(CONTENT_SNAPSHOT));
legacyV4Content.contentVersion = 'authoritative-trials-v4';
delete legacyV4Content.routeContracts;
delete legacyV4Content.combatTactics;
const legacyV4Golden = {
  pve: {
    actions: 63,
    hash: '530b464118426b1a1f54d668ed8e38b4db15e908f302c9f7ae0f80d7b4ef86f9',
    score: 626,
    turns: 16,
  },
  challenge: {
    actions: 46,
    hash: '695180364e2dd47506a32ca42370debe2dd57f0dbc08825c5e0652611b9b74dd',
    score: 786,
    turns: 11,
  },
  expedition: {
    actions: 78,
    hash: 'd02f8619267fd1753f0a2de91af30f6681398132f9444123f4bdc37c603927ec',
    score: 695,
    turns: 19,
  },
};

for (const mode of Object.keys(legacyV4Golden)) {
  const result = drive(
    mode,
    `${mode}:golden:0`,
    `golden-${mode}-0001`,
    '',
    legacyV4Content,
  );
  const expected = legacyV4Golden[mode];
  assert.strictEqual(result.state.phase, 'completed', `${mode} v4 replay should complete`);
  assert.strictEqual(result.commands.length, expected.actions, `${mode} v4 action count drifted`);
  assert.strictEqual(hashCanonical(result.state), expected.hash, `${mode} v4 final state must remain byte-identical`);
  assert.strictEqual(result.state.summary.score, expected.score, `${mode} v4 score drifted`);
  assert.strictEqual(result.state.stats.turns, expected.turns, `${mode} v4 turn count drifted`);
  assert.strictEqual(result.state.route.contractVersion, undefined, `${mode} v4 must not backfill route contracts`);
}

for (const mode of ['pve', 'challenge', 'expedition']) {
  const first = drive(mode);
  const second = drive(mode);
  assert.strictEqual(first.state.phase, 'completed', `${mode} golden run should complete`);
  assert.strictEqual(stableStringify(second.state), stableStringify(first.state), `${mode} should remain deterministic under identical seed, mode, and content`);
  assert.deepStrictEqual(second.commands, first.commands, `${mode} should preserve the same command journal under identical inputs`);
  assert(first.state.stats.cardsUpgraded >= 1, `${mode} golden run must exercise a real card upgrade`);
  assert.strictEqual(first.state.stats.cardsRemoved, 1, `${mode} golden run must exercise one bounded trim`);
  assert.strictEqual(first.state.summary.bossWins, 1, `${mode} must complete through a boss`);
  assert.strictEqual(first.state.summary.routeResolution.selections.length, first.state.route.totalStages);
  assert.strictEqual(first.state.summary.combatTactics.version, 2, `${mode} summary must stay on combat tactics v2`);
  assert(Number.isInteger(first.state.summary.combatTactics.advancedSuccesses), `${mode} summary must expose advancedSuccesses`);
  assert(
    first.state.summary.combatTactics.advancedSuccesses <= first.state.summary.combatTactics.successes,
    `${mode} advanced tactic successes must stay bounded by total successes`,
  );
  assert.strictEqual(
    first.state.summary.scoreBreakdown.routeBonus,
    first.state.summary.routeResolution.totalBonus,
  );
  const replayed = replay(mode, `${mode}:golden:0`, `golden-${mode}-0001`, first.commands);
  assert.strictEqual(stableStringify(replayed), stableStringify(first.state), `${mode} replay must be byte-identical`);
}

for (const scenarioId of RELAY_EXPEDITION_SCENARIO_IDS) {
  const first = drive(
    'relay_expedition',
    `relay:${scenarioId}:golden:0`,
    `relay-${scenarioId}-golden-0001`,
    scenarioId,
  );
  const second = drive(
    'relay_expedition',
    `relay:${scenarioId}:golden:0`,
    `relay-${scenarioId}-golden-0001`,
    scenarioId,
  );
  assert.strictEqual(first.state.phase, 'completed', `${scenarioId} relay golden run should complete`);
  assert.strictEqual(first.state.scenarioId, scenarioId, `${scenarioId} relay golden scenario drifted`);
  assert.strictEqual(stableStringify(second.state), stableStringify(first.state), `${scenarioId} relay genesis and playthrough should stay deterministic`);
  assert.deepStrictEqual(second.commands, first.commands, `${scenarioId} relay action journal should stay deterministic`);
  assert(first.state.stats.cardsUpgraded >= 1, `${scenarioId} relay run must exercise a real card upgrade`);
  assert.strictEqual(first.state.stats.cardsRemoved, 1, `${scenarioId} relay run must exercise one bounded trim`);
  const replayed = replay(
    'relay_expedition',
    `relay:${scenarioId}:golden:0`,
    `relay-${scenarioId}-golden-0001`,
    first.commands,
    scenarioId,
  );
  assert.strictEqual(stableStringify(replayed), stableStringify(first.state), `${scenarioId} relay replay must be byte-identical`);
}

for (const scenarioId of FATE_CHRONICLE_SCENARIO_IDS) {
  const scenario = CONTENT_SNAPSHOT.scenarios[scenarioId];
  const first = drive(
    'fate_chronicle',
    `fate:${scenarioId}:golden:0`,
    `fate-${scenarioId}-golden-0001`,
    scenarioId,
  );
  const second = drive(
    'fate_chronicle',
    `fate:${scenarioId}:golden:0`,
    `fate-${scenarioId}-golden-0001`,
    scenarioId,
  );
  assert.strictEqual(first.state.phase, 'completed', `${scenarioId} fate golden run should complete`);
  assert.strictEqual(first.state.player.maxHp, scenario.maxHp, `${scenarioId} should pin its oath hp`);
  assert.strictEqual(stableStringify(second.state), stableStringify(first.state), `${scenarioId} fate run should stay deterministic`);
  assert.deepStrictEqual(second.commands, first.commands, `${scenarioId} fate action journal should stay deterministic`);
  assert(first.state.stats.cardsUpgraded >= 1, `${scenarioId} fate run must exercise a real card upgrade`);
  assert.strictEqual(first.state.stats.cardsRemoved, 1, `${scenarioId} fate run must exercise one bounded trim`);
  const replayed = replay(
    'fate_chronicle',
    `fate:${scenarioId}:golden:0`,
    `fate-${scenarioId}-golden-0001`,
    first.commands,
    scenarioId,
  );
  assert.strictEqual(stableStringify(replayed), stableStringify(first.state), `${scenarioId} fate replay must be byte-identical`);
}

for (const mode of ['pve', 'challenge', 'expedition', 'challenge_ladder', 'world_rift']) {
  for (let index = 0; index < 40; index += 1) {
    const label = `${mode}:property:${index}`;
    const runId = `property-${mode}-${String(index).padStart(8, '0')}`;
    const result = drive(mode, label, runId);
    assert(TERMINAL_PHASES.has(result.state.phase), `${mode}/${index} should terminate`);
    assert(result.commands.length <= 256, `${mode}/${index} should stay under the action budget`);
    assert(Number.isFinite(result.state.player.hp), `${mode}/${index} hp must remain finite`);
    assert(result.state.player.hp >= 0 && result.state.player.hp <= result.state.player.maxHp);
    assert.strictEqual(result.state.version, result.commands.length, `${mode}/${index} version must match journal length`);
    assertCompletedDeckCrafting(result.state, `${mode}/${index}`);
    const replayed = replay(mode, label, runId, result.commands);
    assert.strictEqual(hashCanonical(replayed), hashCanonical(result.state), `${mode}/${index} replay hash must match`);
  }
}

for (const scenarioId of RELAY_EXPEDITION_SCENARIO_IDS) {
  for (let index = 0; index < 20; index += 1) {
    const label = `relay:${scenarioId}:property:${index}`;
    const runId = `relay-${scenarioId}-${String(index).padStart(8, '0')}`;
    const result = drive('relay_expedition', label, runId, scenarioId);
    assert(TERMINAL_PHASES.has(result.state.phase), `${scenarioId}/${index} should terminate`);
    assert.strictEqual(result.state.scenarioId, scenarioId, `${scenarioId}/${index} should preserve scenario id`);
    assert(result.commands.length <= 256, `${scenarioId}/${index} should stay under the action budget`);
    assertCompletedDeckCrafting(result.state, `${scenarioId}/${index}`);
    const replayed = replay('relay_expedition', label, runId, result.commands, scenarioId);
    assert.strictEqual(hashCanonical(replayed), hashCanonical(result.state), `${scenarioId}/${index} replay hash must match`);
  }
}

for (const scenarioId of FATE_CHRONICLE_SCENARIO_IDS) {
  for (let index = 0; index < 60; index += 1) {
    const label = `fate:${scenarioId}:property:${index}`;
    const runId = `fate-${scenarioId}-${String(index).padStart(8, '0')}`;
    const result = drive('fate_chronicle', label, runId, scenarioId);
    assert(TERMINAL_PHASES.has(result.state.phase), `${scenarioId}/${index} should terminate`);
    assert(result.commands.length <= 256, `${scenarioId}/${index} should stay under the action budget`);
    assert(result.state.player.hp >= 0 && result.state.player.hp <= result.state.player.maxHp);
    assertCompletedDeckCrafting(result.state, `${scenarioId}/${index}`);
    const replayed = replay('fate_chronicle', label, runId, result.commands, scenarioId);
    assert.strictEqual(hashCanonical(replayed), hashCanonical(result.state), `${scenarioId}/${index} fate replay hash must match`);
  }
}

const sharedLadderSeed = seed('challenge-ladder:shared-slot');
const ladderInitialA = createInitialState({
  runId: 'ladder-shared-run-0001',
  userId: 'ladder-user-a',
  mode: 'challenge_ladder',
  seedHex: sharedLadderSeed,
  content: CONTENT_SNAPSHOT,
});
const ladderInitialB = createInitialState({
  runId: 'ladder-shared-run-0002',
  userId: 'ladder-user-b',
  mode: 'challenge_ladder',
  seedHex: sharedLadderSeed,
  content: CONTENT_SNAPSHOT,
});
assert.strictEqual(ladderInitialA.scenarioId, CONTENT_SNAPSHOT.scenarios.challenge.scenarioId);
const { runId: ladderRunIdA, ...ladderComparableA } = ladderInitialA;
const { runId: ladderRunIdB, ...ladderComparableB } = ladderInitialB;
assert.notStrictEqual(ladderRunIdA, ladderRunIdB, 'fairness check must compare distinct account runs');
assert.strictEqual(
  stableStringify(ladderComparableA),
  stableStringify(ladderComparableB),
  'same official seed slot must produce a byte-identical ladder genesis across accounts',
);

const sharedRiftSeed = seed('world-rift:shared-slot');
const riftInitialA = createInitialState({
  runId: 'rift-shared-run-0001',
  userId: 'rift-user-a',
  mode: 'world_rift',
  seedHex: sharedRiftSeed,
  content: CONTENT_SNAPSHOT,
});
const riftInitialB = createInitialState({
  runId: 'rift-shared-run-0002',
  userId: 'rift-user-b',
  mode: 'world_rift',
  seedHex: sharedRiftSeed,
  content: CONTENT_SNAPSHOT,
});
assert.strictEqual(riftInitialA.scenarioId, CONTENT_SNAPSHOT.scenarios.challenge.scenarioId);
const { runId: riftRunIdA, ...riftComparableA } = riftInitialA;
const { runId: riftRunIdB, ...riftComparableB } = riftInitialB;
assert.notStrictEqual(riftRunIdA, riftRunIdB, 'world-rift fairness check must compare distinct account runs');
assert.strictEqual(
  stableStringify(riftComparableA),
  stableStringify(riftComparableB),
  'same official seed slot must produce a byte-identical world-rift genesis across accounts',
);

for (const scenarioId of RELAY_EXPEDITION_SCENARIO_IDS) {
  const sharedRelaySeed = seed(`relay:${scenarioId}:shared-slot`);
  const relayInitialA = createInitialState({
    runId: `relay-${scenarioId}-shared-run-0001`,
    userId: 'relay-user-a',
    mode: 'relay_expedition',
    scenarioId,
    seedHex: sharedRelaySeed,
    content: CONTENT_SNAPSHOT,
  });
  const relayInitialB = createInitialState({
    runId: `relay-${scenarioId}-shared-run-0002`,
    userId: 'relay-user-b',
    mode: 'relay_expedition',
    scenarioId,
    seedHex: sharedRelaySeed,
    content: CONTENT_SNAPSHOT,
  });
  const { runId: relayRunIdA, ...relayComparableA } = relayInitialA;
  const { runId: relayRunIdB, ...relayComparableB } = relayInitialB;
  assert.notStrictEqual(relayRunIdA, relayRunIdB, `${scenarioId} fairness check must compare distinct account runs`);
  assert.strictEqual(
    stableStringify(relayComparableA),
    stableStringify(relayComparableB),
    `${scenarioId} should produce a byte-identical relay genesis across accounts when seed and scenario match`,
  );
}

const seedA = create('pve', 'seed-a', 'seed-run-00000001');
const seedB = create('pve', 'seed-b', 'seed-run-00000001');
assert.notStrictEqual(hashCanonical(seedA), hashCanonical(seedB), 'different server seeds should produce different canonical states');

console.log('Authoritative runs engine sanity checks passed.');
