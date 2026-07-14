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

assert.strictEqual(PROTOCOL_VERSION, 'authoritative-run-v2');
assert.strictEqual(CONTENT_VERSION, 'authoritative-trials-v4');
assert.strictEqual(
  CONTENT_HASH,
  'ec26095949bfadf81a322f454b092ec96dbfe09199c607513ea3e2f44501b301',
  'content hash should change only with an intentional catalog version update',
);

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

for (const card of Object.values(CONTENT_SNAPSHOT.cards)) {
  assert(card.cost >= 1, `${card.cardId} must require at least one energy to enter the action sequence`);
  if (card.upgrade) assert(card.upgrade.cost >= 1, `${card.cardId} upgrade must preserve the energy floor`);
}
for (const protectedCardId of ['insight', 'fracture', 'flowing_qi']) {
  assert.strictEqual(
    CONTENT_SNAPSHOT.cards[protectedCardId].upgrade,
    undefined,
    `${protectedCardId} is a cycle/multiplier core and must not receive a direct v4 upgrade`,
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
assert(initial.player.deck.every(card => card.upgraded === false), 'v4 genesis should explicitly pin every card as unupgraded');
assert.deepStrictEqual(publicInitial.player.upgradedDeckCounts, {});
assert.strictEqual(publicInitial.player.deckCrafting.minDeckSize, 8);

let craftingState = create('pve', 'pve:crafting:0', 'crafting-pve-0001');
while (craftingState.phase !== 'reward') {
  const [command, payload] = chooseCommand(craftingState);
  craftingState = applyCommand(craftingState, CONTENT_SNAPSHOT, command, payload).state;
}
const firstCraftingView = projectState(craftingState, CONTENT_SNAPSHOT);
assert.strictEqual(firstCraftingView.reward.choices.filter(choice => choice.kind === 'card').length, 2);
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
delete legacyContent.deckCrafting;
Object.values(legacyContent.cards).forEach(card => delete card.upgrade);
const legacyRewardState = JSON.parse(stableStringify(initial));
legacyRewardState.contentVersion = legacyContent.contentVersion;
legacyRewardState.phase = 'reward';
legacyRewardState.battle = null;
legacyRewardState.route.choices = [];
legacyRewardState.player.deck.forEach(card => delete card.upgraded);
delete legacyRewardState.stats.cardsUpgraded;
delete legacyRewardState.stats.cardsRemoved;
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

for (const mode of Object.keys(golden)) {
  const result = drive(mode);
  const expected = golden[mode];
  assert.strictEqual(result.state.phase, 'completed', `${mode} golden run should complete`);
  assert.strictEqual(result.commands.length, expected.actions, `${mode} golden action count drifted`);
  assert.strictEqual(hashCanonical(result.state), expected.hash, `${mode} golden final state drifted`);
  assert.strictEqual(result.state.summary.score, expected.score, `${mode} golden score drifted`);
  assert.strictEqual(result.state.stats.turns, expected.turns, `${mode} golden turn count drifted`);
  assert(result.state.stats.cardsUpgraded >= 1, `${mode} golden run must exercise a real card upgrade`);
  assert.strictEqual(result.state.stats.cardsRemoved, 1, `${mode} golden run must exercise one bounded trim`);
  assert.strictEqual(result.state.summary.bossWins, 1, `${mode} must complete through a boss`);
  const replayed = replay(mode, `${mode}:golden:0`, `golden-${mode}-0001`, result.commands);
  assert.strictEqual(stableStringify(replayed), stableStringify(result.state), `${mode} replay must be byte-identical`);
}

const relayGolden = {
  vanguard: {
    actions: 27,
    hash: '06d2b401e28a2b5cdceabd22aeef7298edc1f45d35d1c5aa6856829c63966763',
    score: 641,
    turns: 7,
  },
  bulwark: {
    actions: 60,
    hash: '366b207081091187df5d797d36096a0edcf1c4a982901f83757c8844bd8e9436',
    score: 629,
    turns: 17,
  },
  insight: {
    actions: 40,
    hash: 'ac547a24e16204173e586bafb41d6408d83b01ee345f179b8a3b335b766bf9dc',
    score: 591,
    turns: 10,
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
  assert(result.state.stats.cardsUpgraded >= 1, `${scenarioId} relay run must exercise a real card upgrade`);
  assert.strictEqual(result.state.stats.cardsRemoved, 1, `${scenarioId} relay run must exercise one bounded trim`);
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
  'chronicle-ember-guard': { actions: 36, hash: '844e06ae61a3d71b7a6b631f73007bce7a293bde3bd99c1478d9809afa3adba9', score: 668, turns: 10 },
  'chronicle-ember-edge': { actions: 32, hash: 'f8da249bd2aed6154d30272f7114dbfcc97ddefbcac9723c6daae4e2fc621a9d', score: 709, turns: 8 },
  'chronicle-mirror-guard': { actions: 54, hash: '90f146a6d75f1070c77d08feca7b6ff3946ba17bcac50b86ac59c087f966f99c', score: 840, turns: 14 },
  'chronicle-mirror-edge': { actions: 48, hash: 'd06fa00a819e136fbe212acca57c7f5dd40a28675252da39e747e123a3cfab1d', score: 800, turns: 13 },
  'chronicle-rift-guard': { actions: 93, hash: '5bfeb668741bcbaaa23feab44a6e97d80f86fb02d4bbea5938050b856170241f', score: 998, turns: 26 },
  'chronicle-rift-edge': { actions: 61, hash: 'dd22b936c5e7626aecedcfe66e99d213114e50def53d7199cbbb943636da7d30', score: 1015, turns: 16 },
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
  assert(result.state.stats.cardsUpgraded >= 1, `${scenarioId} fate run must exercise a real card upgrade`);
  assert.strictEqual(result.state.stats.cardsRemoved, 1, `${scenarioId} fate run must exercise one bounded trim`);
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
