const assert = require('node:assert');
const crypto = require('node:crypto');
const {
  CONTENT_SNAPSHOT,
  CONTENT_VERSION,
} = require('../server/progression/authoritative-runs/catalog');
const { cloneJson, stableStringify } = require('../server/progression/authoritative-runs/canonical');
const {
  applyCommand,
  createInitialState,
  projectState,
} = require('../server/progression/authoritative-runs/engine');

const TERMINAL_PHASES = new Set(['completed', 'defeated', 'abandoned']);
const PRIVATE_POLICY_KEYS = [
  'policyId',
  'preferredTypes',
  'thresholds',
  'weights',
  'priority',
  'intentSource',
];
const CORRECTION_ROLES = new Set(['attack', 'guard', 'tempo']);

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function makeCardInstances(cardIds) {
  return cardIds.map((cardId, index) => ({
    instanceId: `probe-card-${index + 1}`,
    cardId,
    upgraded: false,
  }));
}

function scaleByBps(value, bps) {
  return Math.max(1, Math.round(Number(value || 0) * Number(bps || 10000) / 10000));
}

function makeRouteContract(contractId, enemyId) {
  const profile = CONTENT_SNAPSHOT.routeContracts.profiles[contractId];
  const enemy = CONTENT_SNAPSHOT.enemies[enemyId];
  assert(profile, `missing route contract fixture ${contractId}`);
  assert(enemy, `missing enemy fixture ${enemyId}`);
  const enemyAdjustments = cloneJson(profile.enemyAdjustments || {});
  const rewardAdjustments = cloneJson(profile.rewardAdjustments || {});
  const adjustedMaxHp = scaleByBps(enemy.maxHp, enemyAdjustments.maxHpBps);
  return {
    version: 1,
    contractId: profile.contractId,
    label: profile.label,
    riskTier: profile.riskTier,
    riskLabel: profile.riskLabel,
    difficultyTier: profile.difficultyTier,
    difficultyLabel: profile.difficultyLabel,
    difficultyRating: profile.difficultyRating,
    rewardTier: profile.rewardTier,
    rewardLabel: profile.rewardLabel,
    difficultySummary: `probe enemy ${adjustedMaxHp} hp`,
    rewardSummary: 'probe reward profile',
    scoreBonus: profile.scoreBonus,
    enemyAdjustments,
    rewardAdjustments,
  };
}

function makeRouteNode({ enemyId, contractId = 'steady', label = 'probe' }) {
  const enemy = CONTENT_SNAPSHOT.enemies[enemyId];
  const routeContract = makeRouteContract(contractId, enemyId);
  return {
    nodeId: `enemy-decision-${label}-${enemyId}-${contractId}`,
    stage: 1,
    type: 'battle',
    enemyId,
    name: enemy.name,
    threat: enemy.threat,
    maxHp: scaleByBps(enemy.maxHp, routeContract.enemyAdjustments.maxHpBps),
    boss: !!enemy.boss,
    routeContract,
  };
}

function createProbeState({
  label,
  enemyId,
  mode = 'pve',
  scenarioId = '',
  contractId = 'steady',
  hp = null,
  deckIds = null,
  lastResolution = null,
  content = CONTENT_SNAPSHOT,
}) {
  const state = createInitialState({
    runId: `enemy-decision-${sha256(`run:${label}`).slice(0, 24)}`,
    userId: 'enemy-decision-user',
    mode,
    scenarioId,
    seedHex: sha256(`seed:${label}`),
    content,
  });
  if (Array.isArray(deckIds)) {
    state.player.deck = makeCardInstances(deckIds);
    state.player.nextCardInstance = deckIds.length + 1;
  }
  if (hp !== null) state.player.hp = Math.max(1, Math.min(state.player.maxHp, hp));
  if (lastResolution) {
    state.combatTactics = state.combatTactics || { version: 2, reportVersion: 'authoritative-combat-tactics-v2', lastResolution: null };
    state.combatTactics.lastResolution = cloneJson(lastResolution);
  }
  state.route.choices = [makeRouteNode({ enemyId, contractId, label })];
  return state;
}

function startProbe(fixture, content = CONTENT_SNAPSHOT) {
  const before = createProbeState({ ...fixture, content });
  const result = applyCommand(before, content, 'select_node', { nodeId: before.route.choices[0].nodeId });
  return {
    before,
    result,
    state: result.state,
    view: projectState(result.state, content),
  };
}

function reachDecisionWindow(fixture, content = CONTENT_SNAPSHOT) {
  const started = startProbe(fixture, content);
  let state = started.state;
  let result = null;
  for (let intentIndex = 0; intentIndex < 2; intentIndex += 1) {
    state.player.block = 100;
    result = applyCommand(state, content, 'end_turn', {});
    state = result.state;
  }
  return {
    result,
    state: result.state,
    view: projectState(result.state, content),
  };
}

function chooseCommand(state, content = CONTENT_SNAPSHOT) {
  const view = projectState(state, content);
  if (state.phase === 'route') {
    const choice = view.route.choices.slice().sort((left, right) => left.nodeId.localeCompare(right.nodeId))[0];
    return ['select_node', { nodeId: choice.nodeId }];
  }
  if (state.phase === 'reward') {
    const choice = view.reward.choices
      .slice()
      .sort((left, right) => {
        const leftCorrection = left.correction ? 0 : 1;
        const rightCorrection = right.correction ? 0 : 1;
        return leftCorrection - rightCorrection || left.rewardId.localeCompare(right.rewardId);
      })[0];
    return ['choose_reward', { rewardId: choice.rewardId }];
  }
  const playable = view.player.hand
    .filter(card => Number(card.cost || 0) <= Number(view.player.energy || 0))
    .sort((left, right) => {
      const leftDamage = CONTENT_SNAPSHOT.cards[left.cardId]?.effect?.damage || 0;
      const rightDamage = CONTENT_SNAPSHOT.cards[right.cardId]?.effect?.damage || 0;
      return rightDamage - leftDamage || Number(right.cost || 0) - Number(left.cost || 0) || left.instanceId.localeCompare(right.instanceId);
    })[0];
  return playable
    ? ['play_card', { cardInstanceId: playable.instanceId }]
    : ['end_turn', {}];
}

function runJournal(label, commands = null, content = CONTENT_SNAPSHOT) {
  let state = createInitialState({
    runId: `journal-${sha256(`run:${label}`).slice(0, 24)}`,
    userId: 'enemy-decision-user',
    mode: 'pve',
    scenarioId: '',
    seedHex: sha256(`journal:${label}`),
    content,
  });
  const journal = [];
  if (Array.isArray(commands)) {
    commands.forEach(([command, payload]) => {
      state = applyCommand(state, content, command, payload).state;
      journal.push([command, cloneJson(payload)]);
    });
    return { state, journal };
  }
  while (!TERMINAL_PHASES.has(state.phase) && journal.length < 40) {
    const [command, payload] = chooseCommand(state, content);
    state = applyCommand(state, content, command, payload).state;
    journal.push([command, cloneJson(payload)]);
  }
  return { state, journal };
}

function assertProjectStatePure(state, content, label) {
  const before = stableStringify(state);
  const rngCounter = state.rng.counter;
  const first = projectState(state, content);
  const second = projectState(state, content);
  assert.strictEqual(stableStringify(state), before, `${label} projectState must not mutate canonical state`);
  assert.strictEqual(state.rng.counter, rngCounter, `${label} projectState must not advance RNG`);
  assert.strictEqual(stableStringify(first), stableStringify(second), `${label} repeated projection must be byte-identical`);
}

function assertNoPrivatePolicyConfig(value, label) {
  const json = JSON.stringify(value);
  PRIVATE_POLICY_KEYS.forEach((key) => {
    assert(!json.includes(`"${key}"`), `${label} must not leak private enemy decision key ${key}`);
  });
}

function assertPublicDecisionSurface(value, label) {
  assertNoPrivatePolicyConfig(value, label);
  const json = JSON.stringify(value);
  assert(!json.includes('"branchId"'), `${label} must not leak enemy decision branchId`);
}

function getCorrectionChoices(state) {
  const view = projectState(state, CONTENT_SNAPSHOT);
  return view.reward.choices.filter(choice => choice.correction);
}

function makeKillableBattle(state) {
  state.battle.enemy.hp = 1;
  state.player.energy = 3;
  state.player.hand = [{ instanceId: 'lethal-card', cardId: 'strike', upgraded: false }];
  state.player.drawPile = [];
  state.player.discardPile = [];
}

assert.strictEqual(CONTENT_VERSION, 'authoritative-trials-v9');
assert.strictEqual(CONTENT_SNAPSHOT.enemyDecision.version, 1);
assert.strictEqual(CONTENT_SNAPSHOT.enemyDecision.reportVersion, 'authoritative-enemy-decision-v1');
assert(Object.keys(CONTENT_SNAPSHOT.enemyDecision.policies).length >= 3, 'enemy decision catalog should define multiple private policies');
Object.entries(CONTENT_SNAPSHOT.enemyDecision.enemyPolicies).forEach(([enemyId, policyId]) => {
  assert(CONTENT_SNAPSHOT.enemies[enemyId], `enemy policy should point at real enemy ${enemyId}`);
  assert(CONTENT_SNAPSHOT.enemyDecision.policies[policyId], `enemy ${enemyId} should use a private policy`);
});

{
  const first = runJournal('byte-identical');
  const replay = runJournal('byte-identical', first.journal);
  assert.strictEqual(
    stableStringify(replay.state),
    stableStringify(first.state),
    'same seed and same action journal result must be byte-identical',
  );
  assert.strictEqual(
    stableStringify(projectState(replay.state, CONTENT_SNAPSHOT)),
    stableStringify(projectState(first.state, CONTENT_SNAPSHOT)),
    'same seed and same action journal projection must be byte-identical',
  );
  assertProjectStatePure(first.state, CONTENT_SNAPSHOT, 'current v9 journal');
}

{
  const started = startProbe({
    label: 'freeze-intent',
    enemyId: 'ember_revenant',
    contractId: 'contested',
    hp: 48,
    deckIds: ['strike', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte', 'severing_flow'],
  });
  const beforePlayIntent = projectState(started.state, CONTENT_SNAPSHOT).battle.enemy.intent;
  assert.strictEqual(started.state.battle.enemyDecision.branchId, '', 'opening turn should keep the base pattern before the one adaptive window');
  const playView = projectState(started.state, CONTENT_SNAPSHOT);
  const playable = playView.player.hand.find(card => Number(card.cost || 0) <= Number(playView.player.energy || 0));
  assert(playable, 'freeze probe should draw at least one playable card');
  const afterPlay = applyCommand(started.state, CONTENT_SNAPSHOT, 'play_card', { cardInstanceId: playable.instanceId }).state;
  const afterPlayIntent = projectState(afterPlay, CONTENT_SNAPSHOT).battle.enemy.intent;
  assert.deepStrictEqual(afterPlayIntent, beforePlayIntent, 'frozen enemy intent must stay identical after a card is played');
  const afterTurn = applyCommand(afterPlay, CONTENT_SNAPSHOT, 'end_turn', {}).state;
  const nextTurnIntent = projectState(afterTurn, CONTENT_SNAPSHOT).battle.enemy.intent;
  assert.notStrictEqual(afterTurn.battle.enemy.intentSource.intentIndex, started.state.battle.enemy.intentSource.intentIndex, 'next turn may advance to a new frozen source intent');
  assert(nextTurnIntent && nextTurnIntent.type, 'next turn should expose a frozen intent');
  assert.strictEqual(afterTurn.battle.enemyDecision.branchId, '', 'second turn should still follow the base pattern before the adaptive window');
  afterTurn.player.block = 100;
  const decisionWindow = applyCommand(afterTurn, CONTENT_SNAPSHOT, 'end_turn', {}).state;
  assert(decisionWindow.battle.enemyDecision.branchId, 'third turn should be the encounter adaptive window when a readable branch matches');
  decisionWindow.player.block = 100;
  const afterDecisionWindow = applyCommand(decisionWindow, CONTENT_SNAPSHOT, 'end_turn', {}).state;
  assert.strictEqual(afterDecisionWindow.battle.enemyDecision.branchId, '', 'turns after the adaptive window should return to the base pattern');
}

{
  const branchFixtures = [
    {
      label: 'pressure-low-hp',
      enemyId: 'ember_revenant',
      contractId: 'steady',
      hp: 10,
      deckIds: ['strike', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte', 'severing_flow'],
    },
    {
      label: 'pressure-risk-contract',
      enemyId: 'ember_revenant',
      contractId: 'contested',
      hp: 48,
      deckIds: ['strike', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte', 'severing_flow'],
    },
    {
      label: 'balance-repeat-failure',
      enemyId: 'ink_scout',
      contractId: 'steady',
      hp: 48,
      deckIds: ['strike', 'sky_pierce', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte'],
    },
    {
      label: 'balance-attack-skew',
      enemyId: 'mirror_seer',
      contractId: 'steady',
      hp: 48,
      deckIds: ['strike', 'sky_pierce', 'life_siphon', 'fracture', 'severing_flow', 'archive_surge', 'ember_riposte', 'ember_riposte'],
    },
    {
      label: 'guard-damage-light',
      enemyId: 'oath_scribe',
      contractId: 'steady',
      hp: 48,
      deckIds: ['guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'strike', 'life_siphon', 'ember_riposte'],
    },
    {
      label: 'guard-missed-break',
      enemyId: 'trial_adjudicator',
      contractId: 'steady',
      hp: 48,
      deckIds: ['strike', 'sky_pierce', 'life_siphon', 'fracture', 'severing_flow', 'archive_surge', 'guard', 'iron_mandate'],
    },
  ];
  const branchesByPolicy = new Map();
  const pressureIntentCuePairs = new Set();
  for (let index = 0; index < 72; index += 1) {
    const fixture = branchFixtures[index % branchFixtures.length];
    const started = reachDecisionWindow({ ...fixture, label: `${fixture.label}-${index}` });
    const privateDecision = started.state.battle.enemyDecision;
    assert(privateDecision && privateDecision.policyId, `${fixture.label} should freeze a private policy decision`);
    assert(privateDecision.branchId, `${fixture.label} should use an explicit adaptive branch`);
    if (!branchesByPolicy.has(privateDecision.policyId)) branchesByPolicy.set(privateDecision.policyId, new Set());
    branchesByPolicy.get(privateDecision.policyId).add(privateDecision.branchId);
    const publicEnemy = started.view.battle.enemy;
    const policy = CONTENT_SNAPSHOT.enemyDecision.policies[privateDecision.policyId];
    const branch = policy.branches.find(entry => entry.branchId === privateDecision.branchId);
    assert(branch?.cue?.cueId, `${privateDecision.branchId} should define a branch-specific public cue`);
    assert.deepStrictEqual(
      Object.keys(publicEnemy.decisionCue).sort(),
      ['cueId', 'detail', 'title', 'version'],
      'battle projection enemy.decisionCue should expose only the public cue contract',
    );
    assert.strictEqual(
      publicEnemy.decisionCue.cueId,
      branch.cue.cueId,
      'adaptive branch should expose its specific public cue instead of the generic policy cue',
    );
    if (privateDecision.policyId === 'pressure_reader') {
      pressureIntentCuePairs.add(`${publicEnemy.intent.type}|${publicEnemy.decisionCue.cueId}`);
    }
    assertPublicDecisionSurface(started.view, `${fixture.label} public projection`);
    assertPublicDecisionSurface(started.result.events, `${fixture.label} public events`);
  }
  ['pressure_reader', 'guard_breaker', 'balance_auditor'].forEach((policyId) => {
    assert(
      (branchesByPolicy.get(policyId) || new Set()).size >= 2,
      `${policyId} should exercise at least two fixed-sample adaptive branches`,
    );
  });
  assert(
    pressureIntentCuePairs.size >= 2,
    'one policy should produce at least two public intent/cue combinations from explicit build, hp, and history inputs',
  );
}

{
  const deckIds = ['strike', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte', 'severing_flow'];
  const steady = reachDecisionWindow({
    label: 'timed-steady-abstains',
    enemyId: 'ember_revenant',
    mode: 'challenge',
    contractId: 'steady',
    hp: 46,
    deckIds,
  });
  const pressured = reachDecisionWindow({
    label: 'timed-pressured-adapts',
    enemyId: 'ember_revenant',
    mode: 'challenge',
    contractId: 'contested',
    hp: 46,
    deckIds,
  });
  assert.strictEqual(steady.state.battle.enemyDecision.branchId, '', 'timed steady contracts should abstain from adaptive pressure');
  assert.strictEqual(pressured.state.battle.enemyDecision.branchId, 'timed-pressure-push', 'timed pressured contracts should use the explicit timed branch');
  assert.strictEqual(pressured.view.battle.enemy.decisionCue.cueId, 'pressure-timed', 'timed pressure should remain readable before the player acts');
}

{
  const versionCompatContent = cloneJson(CONTENT_SNAPSHOT);
  versionCompatContent.contentVersion = 'authoritative-trials-v8';
  const compatStarted = startProbe({
    label: 'v8-block-present-enables-decision',
    enemyId: 'ember_revenant',
    contractId: 'contested',
    hp: 48,
    deckIds: ['strike', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte', 'severing_flow'],
  }, versionCompatContent);
  assert(compatStarted.state.enemyDecision, 'enemyDecision should enable from the snapshot block/version, not the catalog version string');
  assert(compatStarted.view.battle.enemy.decisionCue, 'v8-labeled snapshots with enemyDecision.version=1 should still project decision cue');

  const legacyContent = cloneJson(CONTENT_SNAPSHOT);
  legacyContent.contentVersion = 'authoritative-trials-v8';
  delete legacyContent.enemyDecision;
  Object.values(legacyContent.enemies).forEach((enemy) => {
    delete enemy.policy;
    delete enemy.enemyDecision;
  });
  const started = startProbe({
    label: 'legacy-v8-static-pattern',
    enemyId: 'ember_revenant',
    contractId: 'contested',
    hp: 10,
    deckIds: ['strike', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte', 'severing_flow'],
  }, legacyContent);
  const enemy = started.view.battle.enemy;
  assert.strictEqual(started.state.contentVersion, 'authoritative-trials-v8');
  assert(!started.state.enemyDecision, 'v8 canonical state should not create enemyDecision state');
  assert(!started.state.battle.enemy.intent, 'v8 should keep using static pattern instead of frozen enemy intent');
  assert.strictEqual(enemy.intent.type, 'attack', 'v8 battle projection should keep the static pattern intent');
  assert(!enemy.decisionCue, 'v8 projection must not expose enemy decision cue');
  assertPublicDecisionSurface(started.view, 'v8 public projection');
  const abandoned = applyCommand(started.state, legacyContent, 'abandon', {}).state;
  assert(!abandoned.summary.enemyDecision, 'v8 terminal summary must not expose enemy decision');
}

{
  const started = startProbe({
    label: 'failed-counterplay-reward-correction',
    enemyId: 'oath_scribe',
    contractId: 'steady',
    hp: 48,
    deckIds: ['strike', 'guard', 'guard', 'iron_mandate', 'mirror_breath', 'warding_stride', 'ember_riposte', 'severing_flow'],
  });
  const openingView = projectState(started.state, CONTENT_SNAPSHOT);
  const openingIntent = openingView.battle.enemy.intent;
  const hpBefore = started.state.player.hp;
  const failed = applyCommand(started.state, CONTENT_SNAPSHOT, 'end_turn', {});
  const damageEvent = failed.events.find(event => event.type === 'enemy_intent_resolved');
  assert.strictEqual(damageEvent.damageTaken, Number(openingIntent.amount || 0), 'failed counterplay should add no extra punishment beyond intent damage');
  assert.strictEqual(failed.state.player.hp, hpBefore - Number(openingIntent.amount || 0), 'failed counterplay should not apply hidden hp penalties');

  const withCorrection = cloneJson(failed.state);
  const withoutCorrection = cloneJson(failed.state);
  withoutCorrection.battle.tacticEncounter.records = [];
  makeKillableBattle(withCorrection);
  makeKillableBattle(withoutCorrection);
  const correctedWin = applyCommand(withCorrection, CONTENT_SNAPSHOT, 'play_card', { cardInstanceId: 'lethal-card' }).state;
  const baselineWin = applyCommand(withoutCorrection, CONTENT_SNAPSHOT, 'play_card', { cardInstanceId: 'lethal-card' }).state;
  assert.strictEqual(correctedWin.phase, 'reward', 'correction probe should produce a non-terminal reward phase');
  assert.strictEqual(
    projectState(correctedWin, CONTENT_SNAPSHOT).reward.choices.length,
    projectState(baselineWin, CONTENT_SNAPSHOT).reward.choices.length,
    'correction marker must not increase the number of reward choices',
  );
  const correctionChoices = getCorrectionChoices(correctedWin);
  assert.strictEqual(correctionChoices.length, 1, 'non-terminal reward should expose exactly one correction card candidate');
  const correction = correctionChoices[0].correction;
  assert.strictEqual(correction.version, 1);
  assert(CORRECTION_ROLES.has(correction.role), 'correction.role should stay within attack|guard|tempo');
  assert.strictEqual(correction.role, 'attack');
  assert(correction.title && correction.reason && correction.reason.length >= 12, 'correction role and reason should be readable');
  assertPublicDecisionSurface(projectState(correctedWin, CONTENT_SNAPSHOT).reward, 'public reward correction');

  const chosen = applyCommand(correctedWin, CONTENT_SNAPSHOT, 'choose_reward', { rewardId: correctionChoices[0].rewardId }).state;
  assert.strictEqual(chosen.enemyDecision.correctionRewardsChosen, 1, 'choosing correction card should increment private correction stats');
  const abandoned = applyCommand(chosen, CONTENT_SNAPSHOT, 'abandon', {}).state;
  assert.strictEqual(abandoned.summary.enemyDecision.correctionRewardsChosen, 1, 'terminal summary should report correction choices');
  assert.deepStrictEqual(
    Object.keys(abandoned.summary.enemyDecision).sort(),
    ['adaptiveBranches', 'adaptiveRateBps', 'correctionRewardsChosen', 'opportunities', 'reportVersion', 'version'],
    'summary.enemyDecision should expose the public aggregate contract only',
  );
  assertPublicDecisionSurface(failed.events, 'failed counterplay events');
  assertPublicDecisionSurface(abandoned.summary.enemyDecision, 'public enemy decision summary');
}

console.log('Authoritative enemy decision checks passed.');
