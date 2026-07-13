const assert = require('node:assert');
const crypto = require('node:crypto');
const {
  CONTENT_HASH,
  CONTENT_SNAPSHOT,
  CONTENT_VERSION,
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

function create(mode, label = `${mode}:golden:0`, runId = `golden-${mode}-0001`, scenarioId = '') {
  return createInitialState({
    runId,
    userId: 'golden-user',
    mode,
    scenarioId,
    seedHex: seed(label),
    content: CONTENT_SNAPSHOT,
  });
}

function chooseCommand(state) {
  const view = projectState(state, CONTENT_SNAPSHOT);
  if (state.phase === 'route') {
    return ['select_node', { nodeId: view.route.choices[0].nodeId }];
  }
  if (state.phase === 'reward') {
    const reward = (view.player.hp < 22
      ? view.reward.choices.find(choice => choice.kind === 'heal')
      : view.reward.choices.find(choice => choice.kind === 'card')) || view.reward.choices[0];
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

function drive(mode, label = `${mode}:golden:0`, runId = `golden-${mode}-0001`, scenarioId = '') {
  let state = create(mode, label, runId, scenarioId);
  const commands = [];
  while (!TERMINAL_PHASES.has(state.phase) && commands.length < 256) {
    const command = chooseCommand(state);
    state = applyCommand(state, CONTENT_SNAPSHOT, command[0], command[1]).state;
    commands.push(command);
  }
  return { state, commands };
}

function replay(mode, label, runId, commands, scenarioId = '') {
  let state = create(mode, label, runId, scenarioId);
  commands.forEach(([command, payload]) => {
    state = applyCommand(state, CONTENT_SNAPSHOT, command, payload).state;
  });
  return state;
}

function countDeckCards(cards) {
  return cards.reduce((accumulator, cardId) => {
    accumulator[cardId] = (accumulator[cardId] || 0) + 1;
    return accumulator;
  }, {});
}

assert.strictEqual(PROTOCOL_VERSION, 'authoritative-run-v2');
assert.strictEqual(CONTENT_VERSION, 'authoritative-trials-v2');
assert.strictEqual(
  CONTENT_HASH,
  '57e76d6f0877d17d250c1252aae022f862fbb38bd5647689795a45eca01353fb',
  'content hash should change only with an intentional catalog version update',
);

for (const scenario of Object.values(CONTENT_SNAPSHOT.scenarios)) {
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

const golden = {
  pve: {
    actions: 55,
    hash: 'ff048ca5dd38bdc591adeaea39d4ab9b41974f2509e683c7ea26948edf02b043',
    score: 613,
    turns: 14,
  },
  challenge: {
    actions: 45,
    hash: '49cb89f4005c5ae2d585466c8d049ddef452eae639ea829c14708ac5d88ebea2',
    score: 781,
    turns: 12,
  },
  expedition: {
    actions: 61,
    hash: 'd8d153a3a0a8bf3c666a70222a947b7e31c39b44a13188c41cdbc6ffd54496d2',
    score: 722,
    turns: 13,
  },
};

for (const mode of Object.keys(golden)) {
  const result = drive(mode);
  const expected = golden[mode];
  assert.strictEqual(result.state.phase, 'completed', `${mode} golden run should complete`);
  assert.strictEqual(result.commands.length, expected.actions, `${mode} golden action count drifted`);
  assert.strictEqual(hashCanonical(result.state), expected.hash, `${mode} golden final state drifted`);
  assert.strictEqual(result.state.summary.score, expected.score, `${mode} golden score drifted`);
  assert.strictEqual(result.state.stats.turns, expected.turns, `${mode} golden turn count drifted`);
  assert.strictEqual(result.state.summary.bossWins, 1, `${mode} must complete through a boss`);
  const replayed = replay(mode, `${mode}:golden:0`, `golden-${mode}-0001`, result.commands);
  assert.strictEqual(stableStringify(replayed), stableStringify(result.state), `${mode} replay must be byte-identical`);
}

const relayGolden = {
  vanguard: {
    actions: 27,
    hash: '1dfcd7e186187d0341070fbc34e7b9c2eb676e41f2f8cb167eaf4ae00844782d',
    score: 615,
    turns: 6,
  },
  bulwark: {
    actions: 53,
    hash: '4fe17d7e57889b13923382613b8a1febc3f70c578a869995096a3077dd3a6e85',
    score: 600,
    turns: 15,
  },
  insight: {
    actions: 40,
    hash: '78c3192a0e27498f07e85b01cc06cf935159fb540d66e7c20a7b8988bac61ba5',
    score: 653,
    turns: 7,
  },
};

for (const scenarioId of RELAY_EXPEDITION_SCENARIO_IDS) {
  const result = drive(
    'relay_expedition',
    `relay:${scenarioId}:golden:0`,
    `relay-${scenarioId}-golden-0001`,
    scenarioId,
  );
  const expected = relayGolden[scenarioId];
  assert.strictEqual(result.state.phase, 'completed', `${scenarioId} relay golden run should complete`);
  assert.strictEqual(result.state.scenarioId, scenarioId, `${scenarioId} relay golden scenario drifted`);
  assert.strictEqual(result.commands.length, expected.actions, `${scenarioId} relay action count drifted`);
  assert.strictEqual(hashCanonical(result.state), expected.hash, `${scenarioId} relay final state drifted`);
  assert.strictEqual(result.state.summary.score, expected.score, `${scenarioId} relay score drifted`);
  assert.strictEqual(result.state.stats.turns, expected.turns, `${scenarioId} relay turn count drifted`);
  const replayed = replay(
    'relay_expedition',
    `relay:${scenarioId}:golden:0`,
    `relay-${scenarioId}-golden-0001`,
    result.commands,
    scenarioId,
  );
  assert.strictEqual(stableStringify(replayed), stableStringify(result.state), `${scenarioId} relay replay must be byte-identical`);
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
    const replayed = replay('relay_expedition', label, runId, result.commands, scenarioId);
    assert.strictEqual(hashCanonical(replayed), hashCanonical(result.state), `${scenarioId}/${index} replay hash must match`);
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
