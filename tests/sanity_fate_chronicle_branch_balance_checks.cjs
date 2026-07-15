const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { CONTENT_VERSION, CONTENT_SNAPSHOT } = require('../server/progression/authoritative-runs/catalog');
const {
  applyCommand,
  createInitialState,
  projectState,
} = require('../server/progression/authoritative-runs/engine');

const BLOCK_CARDS = new Set(['guard', 'iron_mandate', 'ember_riposte', 'mirror_breath', 'warding_stride']);
const DAMAGE_CARDS = new Set([
  'strike',
  'sky_pierce',
  'life_siphon',
  'fracture',
  'ember_riposte',
  'severing_flow',
  'archive_surge',
  'sealbreaker',
]);
const TERMINAL_PHASES = new Set(['completed', 'defeated', 'abandoned']);
const BRANCH_SCENARIOS = [
  'chronicle-ember-proof',
  'chronicle-mirror-audit',
  'chronicle-rift-seal',
];
const SAMPLE_SIZE = 24;
const DOMINANCE_CLEAR_RATE_BPS = 2000;
const DOMINANCE_AVERAGE_SCORE = 120;
const MIN_VISIBLE_TURN_DELTA = 1;
const MIN_VISIBLE_DAMAGE_DELTA = 2;
const MIN_VISIBLE_HP_DELTA = 2;
const FLOAT_EPSILON = 1e-9;
const PRIVATE_BRANCH_FIELDS = [
  'rewardCardPool',
  'rewardProfile',
  'futureStages',
  'enemyAdjustments',
  'rewardAdjustments',
  'seed',
];
const PUBLIC_BRANCH_KEYS = [
  'branchId',
  'title',
  'description',
  'counterplay',
  'buildFocus',
  'consequenceSummary',
].sort();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function assertPublicBranch(branch, label) {
  assert(branch && typeof branch === 'object', `${label} should expose a public chapterBranch`);
  assert.deepStrictEqual(Object.keys(branch).sort(), PUBLIC_BRANCH_KEYS, `${label} should only expose public chapterBranch fields`);
  const json = JSON.stringify(branch);
  PRIVATE_BRANCH_FIELDS.forEach(field => {
    assert(!json.includes(field), `${label} must not leak private branch field ${field}`);
  });
}

function assertNoPrivateProjectionFields(view, label) {
  const json = JSON.stringify(view);
  PRIVATE_BRANCH_FIELDS.forEach(field => {
    assert(!json.includes(field), `${label} must not leak private field ${field}`);
  });
  if (view.route?.chapterBranch) {
    assertPublicBranch(view.route.chapterBranch, `${label}/route`);
  }
  (view.route?.choices || []).forEach((choice, index) => {
    if (choice.chapterBranch) {
      assertPublicBranch(choice.chapterBranch, `${label}/choice-${index}`);
    }
  });
}

function chooseReward(view) {
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

function chooseBattleAction(view) {
  const incomingDamage = Number(view.battle?.enemy?.intent?.amount || 0);
  const enemyBlock = Number(view.battle?.enemy?.block || 0);
  const tactic = view.battle?.tactic;
  const requirements = Array.isArray(tactic?.requirements) ? tactic.requirements : [];
  const blockRequirement = requirements.find(requirement => requirement.metric === 'blockGained');
  const damageRequirement = requirements.find(requirement => requirement.metric === 'damageDealt');
  const needsBlock = blockRequirement && !blockRequirement.met;
  const needsDamage = damageRequirement && !damageRequirement.met;
  const effectiveIncomingDamage = Math.max(
    0,
    incomingDamage - (tactic?.completed ? Number(tactic.effects?.damageReduction || 0) : 0),
  );
  const cards = view.player.hand.slice().sort((left, right) => {
    const leftBlocks = BLOCK_CARDS.has(left.cardId) ? 1 : 0;
    const rightBlocks = BLOCK_CARDS.has(right.cardId) ? 1 : 0;
    const leftDamages = DAMAGE_CARDS.has(left.cardId) ? 1 : 0;
    const rightDamages = DAMAGE_CARDS.has(right.cardId) ? 1 : 0;
    const tacticOrder = needsBlock
      ? rightBlocks - leftBlocks
      : needsDamage
        ? rightDamages - leftDamages
        : 0;
    const defenseOrder = effectiveIncomingDamage > view.player.block
      ? rightBlocks - leftBlocks
      : leftBlocks - rightBlocks;
    return tacticOrder || defenseOrder || right.cost - left.cost || left.instanceId.localeCompare(right.instanceId);
  });
  const damageIntoGuard = enemyBlock > 0
    ? cards.find(entry => DAMAGE_CARDS.has(entry.cardId) && entry.cost <= view.player.energy)
    : null;
  const card = damageIntoGuard || cards.find(entry => entry.cost <= view.player.energy);
  return card
    ? ['play_card', { cardInstanceId: card.instanceId }]
    : ['end_turn', {}];
}

function chooseRoute(view, branchId) {
  const preferred = view.route.choices.find(choice => choice.chapterBranch?.branchId === branchId);
  const choice = preferred || view.route.choices[0];
  return ['select_node', { nodeId: choice.nodeId }];
}

function runSample(scenarioId, branchId, index) {
  const runKey = `s111:${scenarioId}:${branchId}:${index}`;
  const stateSeed = sha256(runKey);
  const scenario = CONTENT_SNAPSHOT.scenarios[scenarioId];
  assert(scenario, `missing fate branch scenario ${scenarioId}`);
  let state = createInitialState({
    runId: `fate-branch-balance-${sha256(runKey).slice(0, 24)}`,
    userId: 'fate-branch-balance-gate',
    mode: 'fate_chronicle',
    scenarioId,
    seedHex: stateSeed,
    content: CONTENT_SNAPSHOT,
  });
  let actions = 0;
  let sawBranchProjection = false;
  while (!TERMINAL_PHASES.has(state.phase) && actions < 256) {
    const view = projectState(state, CONTENT_SNAPSHOT);
    assertNoPrivateProjectionFields(view, `${runKey}/step-${actions}`);
    if (view.route?.chapterBranch || view.route?.choices?.some(choice => choice.chapterBranch)) {
      sawBranchProjection = true;
    }
    const [command, payload] = state.phase === 'route'
      ? chooseRoute(view, branchId)
      : state.phase === 'reward'
        ? chooseReward(view)
        : chooseBattleAction(view);
    state = applyCommand(state, CONTENT_SNAPSHOT, command, payload).state;
    actions += 1;
  }
  assert(TERMINAL_PHASES.has(state.phase), `${runKey} must terminate within the action budget`);
  assert(actions <= 256, `${runKey} exceeded the action budget`);
  assert(state.player.hp >= 0 && state.player.hp <= state.player.maxHp, `${runKey} produced invalid hp`);
  if (state.summary?.chapterBranchResolution) {
    assertPublicBranch(state.summary.chapterBranchResolution, `${runKey}/summary`);
    assert.equal(state.summary.chapterBranchResolution.branchId, branchId, `${runKey} should retain the selected branch in the terminal summary`);
  }
  return {
    branchId,
    scenarioId,
    completed: state.phase === 'completed',
    score: Number(state.summary?.score || 0),
    turns: Number(state.stats?.turns || state.summary?.turns || 0),
    damageTaken: Number(state.stats?.damageTaken || state.summary?.damageTaken || 0),
    remainingHp: Number(state.player?.hp || state.summary?.remainingHp || 0),
    actions,
    sawBranchProjection,
  };
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarize(branchId, samples) {
  const clearCount = samples.filter(sample => sample.completed).length;
  return {
    branchId,
    sampleSize: samples.length,
    clearCount,
    clearRateBps: Math.round((clearCount * 10000) / samples.length),
    averageScore: average(samples.map(sample => sample.score)),
    averageTurns: average(samples.map(sample => sample.turns)),
    averageDamageTaken: average(samples.map(sample => sample.damageTaken)),
    averageRemainingHp: average(samples.map(sample => sample.remainingHp)),
    averageActions: average(samples.map(sample => sample.actions)),
    maxActions: Math.max(...samples.map(sample => sample.actions)),
    branchProjectionCount: samples.filter(sample => sample.sawBranchProjection).length,
  };
}

function assertNoDominance(scenarioId, left, right) {
  const clearDelta = left.clearRateBps - right.clearRateBps;
  const scoreDelta = left.averageScore - right.averageScore;
  const dominates = clearDelta >= DOMINANCE_CLEAR_RATE_BPS && scoreDelta >= DOMINANCE_AVERAGE_SCORE;
  assert(
    !dominates,
    `${scenarioId} ${left.branchId} must not dominate ${right.branchId} on both clear rate and average score (delta=${(clearDelta / 100).toFixed(1)}pp, ${scoreDelta})`,
  );
}

function assertVisibleCostDifference(scenarioId, left, right) {
  const turnDelta = Math.abs(left.averageTurns - right.averageTurns);
  const damageDelta = Math.abs(left.averageDamageTaken - right.averageDamageTaken);
  const hpDelta = Math.abs(left.averageRemainingHp - right.averageRemainingHp);
  const hasVisibleCost = turnDelta >= MIN_VISIBLE_TURN_DELTA
    || damageDelta >= MIN_VISIBLE_DAMAGE_DELTA
    || hpDelta >= MIN_VISIBLE_HP_DELTA;
  assert(
    hasVisibleCost,
    `${scenarioId} branches need at least one visible average cost delta (turns=${turnDelta.toFixed(2)}, damage=${damageDelta.toFixed(2)}, hp=${hpDelta.toFixed(2)})`,
  );
}

function assertHigherScorePaysCost(scenarioId, left, right) {
  const scoreDelta = left.averageScore - right.averageScore;
  if (scoreDelta <= FLOAT_EPSILON) return;
  const noWorseTurns = left.averageTurns <= right.averageTurns + FLOAT_EPSILON;
  const noWorseDamage = left.averageDamageTaken <= right.averageDamageTaken + FLOAT_EPSILON;
  const noWorseHp = left.averageRemainingHp + FLOAT_EPSILON >= right.averageRemainingHp;
  assert(
    !(noWorseTurns && noWorseDamage && noWorseHp),
    `${scenarioId} ${left.branchId} scores higher than ${right.branchId} without paying any visible cost `
      + `(score=${scoreDelta.toFixed(2)}, turns=${left.averageTurns.toFixed(2)}<=${right.averageTurns.toFixed(2)}, `
      + `damage=${left.averageDamageTaken.toFixed(2)}<=${right.averageDamageTaken.toFixed(2)}, `
      + `hp=${left.averageRemainingHp.toFixed(2)}>=${right.averageRemainingHp.toFixed(2)})`,
  );
  const visibleCost = left.averageTurns - right.averageTurns >= MIN_VISIBLE_TURN_DELTA
    || left.averageDamageTaken - right.averageDamageTaken >= MIN_VISIBLE_DAMAGE_DELTA
    || right.averageRemainingHp - left.averageRemainingHp >= MIN_VISIBLE_HP_DELTA;
  assert(
    visibleCost,
    `${scenarioId} ${left.branchId} scores higher than ${right.branchId} but the tradeoff is not visibly large enough `
      + `(turns=${(left.averageTurns - right.averageTurns).toFixed(2)}, `
      + `damage=${(left.averageDamageTaken - right.averageDamageTaken).toFixed(2)}, `
      + `hp=${(right.averageRemainingHp - left.averageRemainingHp).toFixed(2)})`,
  );
}

assert.equal(CONTENT_VERSION, 'authoritative-trials-v7');

const report = {
  reportVersion: 'fate-chronicle-branch-balance-v1',
  contentVersion: CONTENT_VERSION,
  sampleSize: SAMPLE_SIZE,
  dominanceThresholds: {
    clearRateBps: DOMINANCE_CLEAR_RATE_BPS,
    averageScore: DOMINANCE_AVERAGE_SCORE,
  },
  visibleCostThresholds: {
    averageTurns: MIN_VISIBLE_TURN_DELTA,
    averageDamageTaken: MIN_VISIBLE_DAMAGE_DELTA,
    averageRemainingHp: MIN_VISIBLE_HP_DELTA,
  },
  scenarios: {},
};

for (const scenarioId of BRANCH_SCENARIOS) {
  const scenario = CONTENT_SNAPSHOT.scenarios[scenarioId];
  assert(scenario?.branchPlan?.version === 1, `${scenarioId} must expose branchPlan v1`);
  assert(Array.isArray(scenario.branchPlan.options) && scenario.branchPlan.options.length === 2, `${scenarioId} must expose exactly two branch options`);

  const summaries = scenario.branchPlan.options.map(option => {
    const samples = Array.from({ length: SAMPLE_SIZE }, (_, index) => runSample(scenarioId, option.branchId, index));
    const summary = summarize(option.branchId, samples);
    assert(summary.maxActions <= 256, `${scenarioId}/${option.branchId} exceeded the action ceiling`);
    assert(summary.clearCount >= 1, `${scenarioId}/${option.branchId} must have at least one completable sample`);
    assert(summary.branchProjectionCount >= 1, `${scenarioId}/${option.branchId} must expose at least one public branch projection across the fixed seeds`);
    return summary;
  });

  assertNoDominance(scenarioId, summaries[0], summaries[1]);
  assertNoDominance(scenarioId, summaries[1], summaries[0]);
  assertVisibleCostDifference(scenarioId, summaries[0], summaries[1]);
  assertHigherScorePaysCost(scenarioId, summaries[0], summaries[1]);
  assertHigherScorePaysCost(scenarioId, summaries[1], summaries[0]);

  report.scenarios[scenarioId] = {
    branchIds: summaries.map(summary => summary.branchId),
    summaries,
  };
}

console.log(JSON.stringify(report, null, 2));
console.log('Fate chronicle branch balance checks passed.');
