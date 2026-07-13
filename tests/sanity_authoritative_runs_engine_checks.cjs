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
assert.strictEqual(CONTENT_VERSION, 'authoritative-trials-v3');
assert.strictEqual(
  CONTENT_HASH,
  '7140563ebff0cb1825d6ed732f93bcd84c7fccfa4b48bf1ce85aece23ad157af',
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
    hash: '2614a8a4ab72d9f98f21f248832e2ef68ee2c82169ee18d10f9f3c1b08693fa1',
    score: 613,
    turns: 14,
  },
  challenge: {
    actions: 45,
    hash: '2d1f05efff9f34c50a50cb81547da92087887cf508369df58cf16f7bcf2fd462',
    score: 781,
    turns: 12,
  },
  expedition: {
    actions: 61,
    hash: '6170f378e5681fadbfba3f3e4f972c541637f650a3585f752aac7ec8fdced961',
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
    hash: '5200e3bb3c34e8bd0a658cf612ce4dc0837790b290e32003f752f06ee406f247',
    score: 615,
    turns: 6,
  },
  bulwark: {
    actions: 53,
    hash: '12031bc7f72ea0bdbd002b2d41563c463d287c593281c26c20804d2255d982de',
    score: 600,
    turns: 15,
  },
  insight: {
    actions: 40,
    hash: 'f0780d0404a55faf0f0e6712eadc6e6904178db1e0761f69056e58851ec89840',
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

const fateGolden = {
  'chronicle-ember-guard': { actions: 45, hash: '6523fe6a91751e0ba634a784911354eb7a3459aec2dcc6a6426fb8b3bc69f8bc', score: 670, turns: 12 },
  'chronicle-ember-edge': { actions: 34, hash: '149be668bebe61d36002d4c5640a15337691834e548222fa5ca7c230cea5ce6f', score: 725, turns: 7 },
  'chronicle-mirror-guard': { actions: 64, hash: 'c46f7eb8c6bb05fc83f058a680c8081f60c62d6a1697af351059b82a58cefe79', score: 851, turns: 16 },
  'chronicle-mirror-edge': { actions: 41, hash: '2fc4af2acb3febb8c06035a8458dcbc45380fdcfa88ccf5fd7f7d577cc0c95b5', score: 894, turns: 9 },
  'chronicle-rift-guard': { actions: 92, hash: '3700f93a7ff65459d019c7c0fc6156b0272ff3feb68c0d946ffb3ce5682a2cd0', score: 986, turns: 24 },
  'chronicle-rift-edge': { actions: 59, hash: '07a843fdec9a097850a998964558b97d67c990f88e78ec7ab16a21da3da7ecdb', score: 1097, turns: 11 },
};

for (const scenarioId of FATE_CHRONICLE_SCENARIO_IDS) {
  const scenario = CONTENT_SNAPSHOT.scenarios[scenarioId];
  const result = drive(
    'fate_chronicle',
    `fate:${scenarioId}:golden:0`,
    `fate-${scenarioId}-golden-0001`,
    scenarioId,
  );
  const expected = fateGolden[scenarioId];
  assert.strictEqual(result.state.phase, 'completed', `${scenarioId} fate golden run should complete`);
  assert.strictEqual(result.state.player.maxHp, scenario.maxHp, `${scenarioId} should pin its oath hp`);
  assert.strictEqual(result.commands.length, expected.actions, `${scenarioId} fate action count drifted`);
  assert.strictEqual(hashCanonical(result.state), expected.hash, `${scenarioId} fate final state drifted`);
  assert.strictEqual(result.state.summary.score, expected.score, `${scenarioId} fate score drifted`);
  assert.strictEqual(result.state.stats.turns, expected.turns, `${scenarioId} fate turn count drifted`);
  const replayed = replay(
    'fate_chronicle',
    `fate:${scenarioId}:golden:0`,
    `fate-${scenarioId}-golden-0001`,
    result.commands,
    scenarioId,
  );
  assert.strictEqual(stableStringify(replayed), stableStringify(result.state), `${scenarioId} fate replay must be byte-identical`);
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

for (const scenarioId of FATE_CHRONICLE_SCENARIO_IDS) {
  for (let index = 0; index < 60; index += 1) {
    const label = `fate:${scenarioId}:property:${index}`;
    const runId = `fate-${scenarioId}-${String(index).padStart(8, '0')}`;
    const result = drive('fate_chronicle', label, runId, scenarioId);
    assert(TERMINAL_PHASES.has(result.state.phase), `${scenarioId}/${index} should terminate`);
    assert(result.commands.length <= 256, `${scenarioId}/${index} should stay under the action budget`);
    assert(result.state.player.hp >= 0 && result.state.player.hp <= result.state.player.maxHp);
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
