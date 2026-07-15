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
    state.battle.tacticTurn = { damageDealt: 0, blockGained: 0, cardsPlayed: 0 };
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

assert.strictEqual(PROTOCOL_VERSION, 'authoritative-run-v2');
assert.strictEqual(CONTENT_VERSION, 'authoritative-trials-v7');
assert.match(CONTENT_HASH, /^[a-f0-9]{64}$/i, 'content hash should stay a canonical SHA-256');
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
assert.strictEqual(publicInitial.combatTactics.version, 1);
assert.strictEqual(publicInitial.combatTactics.reportVersion, CONTENT_SNAPSHOT.combatTactics.reportVersion);
assert.strictEqual(publicInitial.combatTactics.lastResolution, null);
assert.strictEqual(publicInitial.stats.combatTacticOpportunities, 0);
assert.strictEqual(publicInitial.stats.combatTacticSuccesses, 0);
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
assert(initial.player.deck.every(card => card.upgraded === false), 'v7 genesis should explicitly pin every card as unupgraded');
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

const tacticThresholdCases = [
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

for (const tacticCase of tacticThresholdCases) {
  const successProbe = createTacticProbe({
    label: `${tacticCase.label}:success`,
    contractId: tacticCase.contractId,
    enemyId: tacticCase.enemyId,
    intentIndex: tacticCase.intentIndex,
    handCardIds: tacticCase.successCards,
  });
  const projectedBefore = projectState(successProbe, CONTENT_SNAPSHOT);
  assert.strictEqual(projectedBefore.battle.tactic.tacticId, tacticCase.expectedPublic.tacticId);
  assert.strictEqual(projectedBefore.battle.tactic.intentType, tacticCase.expectedPublic.intentType);
  assert.deepStrictEqual(
    projectedBefore.battle.tactic.requirements.map(requirement => requirement.target),
    tacticCase.expectedPublic.targets,
    `${tacticCase.label} public tactic thresholds drifted`,
  );
  assert.strictEqual(projectedBefore.battle.tactic.status, 'in_progress');
  const successResult = runTacticProbe(
    successProbe,
    successProbe.player.hand.map(card => card.instanceId),
  );
  const successResolution = findEvent(successResult.endTurnEvents, 'enemy_tactic_resolved');
  const successIntent = findEvent(successResult.endTurnEvents, 'enemy_intent_resolved');
  assert(successResolution, `${tacticCase.label} should emit an enemy_tactic_resolved receipt`);
  assert(successIntent, `${tacticCase.label} should emit an enemy_intent_resolved receipt`);
  assert.strictEqual(successResolution.success, true, `${tacticCase.label} should succeed when its thresholds are met`);
  assert.strictEqual(successResolution.tacticId, tacticCase.expectedPublic.tacticId);
  assert.strictEqual(successResolution.intentType, tacticCase.expectedPublic.intentType);
  assert.strictEqual(successResolution.damageReduction, tacticCase.expectedSuccess.damageReduction);
  assert.strictEqual(successResolution.blockReduction, tacticCase.expectedSuccess.blockReduction);
  assert(successResolution.requirements.every(requirement => requirement.met), `${tacticCase.label} success receipt should mark every requirement as met`);
  assert.strictEqual(successIntent.damageTaken, tacticCase.expectedSuccess.damageTaken);
  assert.strictEqual(successResult.state.stats.combatTacticOpportunities, 1);
  assert.strictEqual(successResult.state.stats.combatTacticSuccesses, 1);
  const projectedAfter = projectState(successResult.state, CONTENT_SNAPSHOT);
  assert.strictEqual(projectedAfter.combatTactics.lastResolution.success, true);
  assert.strictEqual(projectedAfter.combatTactics.lastResolution.tacticId, tacticCase.expectedPublic.tacticId);

  const failureProbe = createTacticProbe({
    label: `${tacticCase.label}:failure`,
    contractId: tacticCase.contractId,
    enemyId: tacticCase.enemyId,
    intentIndex: tacticCase.intentIndex,
    handCardIds: tacticCase.failureCards,
  });
  const failureResult = runTacticProbe(
    failureProbe,
    failureProbe.player.hand.map(card => card.instanceId),
  );
  const failureResolution = findEvent(failureResult.endTurnEvents, 'enemy_tactic_resolved');
  assert(failureResolution, `${tacticCase.label} failure case should still emit a tactic receipt`);
  assert.strictEqual(failureResolution.success, false, `${tacticCase.label} failure receipt must remain explicit`);
  assert(failureResolution.requirements.some(requirement => !requirement.met), `${tacticCase.label} failure receipt should preserve the unmet requirement`);
  assert.strictEqual(failureResult.state.stats.combatTacticOpportunities, 1);
  assert.strictEqual(failureResult.state.stats.combatTacticSuccesses, 0);
  const failureProjection = projectState(failureResult.state, CONTENT_SNAPSHOT);
  assert.strictEqual(failureProjection.combatTactics.lastResolution.success, false);
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
  'legacy persistent block must clear before the next enemy intent resolves',
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

const legacyV6Content = JSON.parse(stableStringify(CONTENT_SNAPSHOT));
legacyV6Content.contentVersion = 'authoritative-trials-v6';
delete legacyV6Content.combatTactics;
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

const branchlessLegacyContent = JSON.parse(stableStringify(CONTENT_SNAPSHOT));
branchlessLegacyContent.contentVersion = 'authoritative-trials-v5';
delete branchlessLegacyContent.combatTactics;
for (const scenarioId of BRANCHED_FATE_SCENARIO_IDS) {
  delete branchlessLegacyContent.scenarios[scenarioId].branchPlan;
}
const branchlessLegacyInitial = create(
  'fate_chronicle',
  'fate:branchless-legacy:0',
  'fate-branchless-legacy-0001',
  'chronicle-ember-proof',
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
  'chronicle-ember-proof',
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
