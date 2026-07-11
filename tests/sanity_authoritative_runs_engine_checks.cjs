const assert = require('node:assert');
const crypto = require('node:crypto');
const {
  CONTENT_HASH,
  CONTENT_SNAPSHOT,
  CONTENT_VERSION,
  PROTOCOL_VERSION,
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

function create(mode, label = `${mode}:golden:0`, runId = `golden-${mode}-0001`) {
  return createInitialState({
    runId,
    userId: 'golden-user',
    mode,
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

function drive(mode, label = `${mode}:golden:0`, runId = `golden-${mode}-0001`) {
  let state = create(mode, label, runId);
  const commands = [];
  while (!TERMINAL_PHASES.has(state.phase) && commands.length < 256) {
    const command = chooseCommand(state);
    state = applyCommand(state, CONTENT_SNAPSHOT, command[0], command[1]).state;
    commands.push(command);
  }
  return { state, commands };
}

function replay(mode, label, runId, commands) {
  let state = create(mode, label, runId);
  commands.forEach(([command, payload]) => {
    state = applyCommand(state, CONTENT_SNAPSHOT, command, payload).state;
  });
  return state;
}

assert.strictEqual(PROTOCOL_VERSION, 'authoritative-run-v2');
assert.strictEqual(CONTENT_VERSION, 'authoritative-trials-v1');
assert.strictEqual(
  CONTENT_HASH,
  'aa18ac01c39d1c1c38d0c26fe3d83d92a3b34035b25305628e00a96a42bdd281',
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

const golden = {
  pve: {
    actions: 55,
    hash: 'a686eb32b265e58497fdfb1dcee74d9f7611f5303f7e966365e75f0c9867f5bc',
    score: 613,
    turns: 14,
  },
  challenge: {
    actions: 45,
    hash: '5a80920aaceafd9173b0fbfb4c8686d00fdc73ef36937786a0bf099161a02b02',
    score: 781,
    turns: 12,
  },
  expedition: {
    actions: 61,
    hash: 'fa03831437f7e3a98958c8088e771b862846ae3bc6848b8617712fc1e99c130b',
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

for (const mode of ['pve', 'challenge', 'expedition']) {
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

const seedA = create('pve', 'seed-a', 'seed-run-00000001');
const seedB = create('pve', 'seed-b', 'seed-run-00000001');
assert.notStrictEqual(hashCanonical(seedA), hashCanonical(seedB), 'different server seeds should produce different canonical states');

console.log('Authoritative runs engine sanity checks passed.');
