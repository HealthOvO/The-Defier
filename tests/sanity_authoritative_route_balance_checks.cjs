const assert = require('node:assert');
const crypto = require('node:crypto');
const { CONTENT_SNAPSHOT } = require('../server/progression/authoritative-runs/catalog');
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
const SAMPLE_SIZE = 64;
const STRATEGIES = ['safe', 'mid', 'risky'];
const SCENARIOS = [
  { key: 'pve', mode: 'pve', scenarioId: '' },
  { key: 'challenge', mode: 'challenge', scenarioId: '' },
  { key: 'expedition', mode: 'expedition', scenarioId: '' },
  { key: 'relay-vanguard', mode: 'relay_expedition', scenarioId: 'vanguard' },
  { key: 'fate-rift-guard', mode: 'fate_chronicle', scenarioId: 'chronicle-rift-guard' },
];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function chooseRoute(view, strategy) {
  const choices = view.route.choices.slice().sort((left, right) => {
    const leftRating = Number(left.routeContract?.difficultyRating || 0);
    const rightRating = Number(right.routeContract?.difficultyRating || 0);
    if (strategy === 'safe') return leftRating - rightRating;
    if (strategy === 'risky') return rightRating - leftRating;
    return Math.abs(leftRating - 2) - Math.abs(rightRating - 2) || leftRating - rightRating;
  });
  return ['select_node', { nodeId: choices[0].nodeId }];
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

function getTacticLineRequirement(line, metric) {
  return Array.isArray(line?.requirements)
    ? line.requirements.find(requirement => requirement?.metric === metric) || null
    : null;
}

function parseRoleSequence(line) {
  const requirement = getTacticLineRequirement(line, 'roleSequence');
  const roles = String(requirement?.label || '')
    .split('后接')
    .map((segment) => {
      if (segment === '攻式') return 'attack';
      if (segment === '守式') return 'guard';
      return '';
    })
    .filter(Boolean);
  return roles.length > 0 ? roles : [];
}

function getNextRequiredRole(line) {
  const requirement = getTacticLineRequirement(line, 'roleSequence');
  const expectedRoles = parseRoleSequence(line);
  if (!requirement || expectedRoles.length === 0) return '';
  const progress = Math.max(0, Math.min(expectedRoles.length, Number(requirement.actual || 0)));
  return progress < expectedRoles.length ? expectedRoles[progress] : '';
}

function isAttackCard(card) {
  return card?.tacticRole === 'attack' || DAMAGE_CARDS.has(card?.cardId);
}

function isGuardCard(card) {
  return card?.tacticRole === 'guard' || BLOCK_CARDS.has(card?.cardId);
}

function getCompletedLineDamageReduction(tactic) {
  if (!Array.isArray(tactic?.lines)) {
    return tactic?.completed ? Number(tactic.effects?.damageReduction || 0) : 0;
  }
  const completedLines = Array.isArray(tactic?.lines)
    ? tactic.lines.filter(line => line?.completed)
    : [];
  const selectedLine = completedLines.find(line => line?.tier === 'advanced')
    || completedLines.find(line => line?.tier === 'standard')
    || null;
  return Number(selectedLine?.effects?.damageReduction || 0);
}

function chooseBattleAction(view) {
  const incomingDamage = Number(view.battle?.enemy?.intent?.amount || 0);
  const enemyBlock = Number(view.battle?.enemy?.block || 0);
  const tactic = view.battle?.tactic;
  const hand = Array.isArray(view.player?.hand) ? view.player.hand : [];
  const preferredLine = Array.isArray(tactic?.lines)
    ? tactic.lines.find(line => line?.tier === 'standard') || tactic.lines[0] || null
    : tactic;
  const blockRequirement = getTacticLineRequirement(preferredLine, 'blockGained');
  const damageRequirement = getTacticLineRequirement(preferredLine, 'damageDealt');
  const nextRole = getNextRequiredRole(preferredLine);
  const needsBlock = !!blockRequirement && !blockRequirement.met;
  const needsDamage = !!damageRequirement && !damageRequirement.met;
  const effectiveIncomingDamage = Math.max(
    0,
    incomingDamage - getCompletedLineDamageReduction(tactic),
  );
  const cards = hand.slice().sort((left, right) => {
    const leftBlocks = isGuardCard(left) ? 1 : 0;
    const rightBlocks = isGuardCard(right) ? 1 : 0;
    const leftDamages = isAttackCard(left) ? 1 : 0;
    const rightDamages = isAttackCard(right) ? 1 : 0;
    const leftRoleMatch = nextRole && left.tacticRole === nextRole ? 1 : 0;
    const rightRoleMatch = nextRole && right.tacticRole === nextRole ? 1 : 0;
    const roleOrder = rightRoleMatch - leftRoleMatch;
    const mixedRequirementOrder = needsBlock && needsDamage
      ? (rightBlocks + rightDamages) - (leftBlocks + leftDamages)
      : 0;
    const tacticOrder = needsBlock
      ? rightBlocks - leftBlocks
      : needsDamage
        ? rightDamages - leftDamages
        : 0;
    const defenseOrder = effectiveIncomingDamage > view.player.block
      ? rightBlocks - leftBlocks
      : leftBlocks - rightBlocks;
    const guardBreakOrder = enemyBlock > 0 ? rightDamages - leftDamages : 0;
    return roleOrder
      || mixedRequirementOrder
      || tacticOrder
      || defenseOrder
      || guardBreakOrder
      || right.cost - left.cost
      || left.instanceId.localeCompare(right.instanceId);
  });
  const damageIntoGuard = enemyBlock > 0 && nextRole !== 'guard'
    ? cards.find(entry => isAttackCard(entry) && entry.cost <= view.player.energy)
    : null;
  const card = damageIntoGuard || cards.find(entry => entry.cost <= view.player.energy);
  return card
    ? ['play_card', { cardInstanceId: card.instanceId }]
    : ['end_turn', {}];
}

function chooseCommand(state, strategy) {
  const view = projectState(state, CONTENT_SNAPSHOT);
  if (state.phase === 'route') return chooseRoute(view, strategy);
  if (state.phase === 'reward') return chooseReward(view);
  return chooseBattleAction(view);
}

function runSample(scenario, strategy, index) {
  const sampleKey = `s109:${scenario.key}:${strategy}:${index}`;
  const seedKey = `s109:${scenario.key}:${index}`;
  let state = createInitialState({
    runId: `balance-${sha256(sampleKey).slice(0, 24)}`,
    userId: 'balance-gate-user',
    mode: scenario.mode,
    scenarioId: scenario.scenarioId,
    seedHex: sha256(seedKey),
    content: CONTENT_SNAPSHOT,
  });
  let actions = 0;
  while (!TERMINAL_PHASES.has(state.phase) && actions < 256) {
    const [command, payload] = chooseCommand(state, strategy);
    state = applyCommand(state, CONTENT_SNAPSHOT, command, payload).state;
    actions += 1;
  }
  assert(
    TERMINAL_PHASES.has(state.phase),
    `${sampleKey} must terminate within the action budget: ${JSON.stringify(projectState(state, CONTENT_SNAPSHOT))}`,
  );
  assert(actions <= 256, `${sampleKey} exceeded the action budget`);
  assert(state.player.hp >= 0 && state.player.hp <= state.player.maxHp, `${sampleKey} produced invalid hp`);
  return {
    completed: state.phase === 'completed',
    score: Number(state.summary?.score || 0),
    turns: state.stats.turns,
    damageTaken: state.stats.damageTaken,
    remainingHp: state.player.hp,
    maxHp: state.player.maxHp,
    actions,
  };
}

function summarize(samples) {
  return {
    completed: samples.filter(sample => sample.completed).length,
    completionRateBps: Math.round(samples.filter(sample => sample.completed).length * 10000 / samples.length),
    scoreP50: median(samples.map(sample => sample.score)),
    turnsP50: median(samples.map(sample => sample.turns)),
    damageTakenP50: median(samples.map(sample => sample.damageTaken)),
    remainingHpP50: median(samples.map(sample => sample.remainingHp)),
    maxHpP50: median(samples.map(sample => sample.maxHp)),
    maxActions: Math.max(...samples.map(sample => sample.actions)),
  };
}

const report = {};
let meaningfulMidCosts = 0;

for (const scenario of SCENARIOS) {
  report[scenario.key] = {};
  for (const strategy of STRATEGIES) {
    const samples = Array.from(
      { length: SAMPLE_SIZE },
      (_, index) => runSample(scenario, strategy, index),
    );
    report[scenario.key][strategy] = summarize(samples);
  }

  const safe = report[scenario.key].safe;
  const mid = report[scenario.key].mid;
  const risky = report[scenario.key].risky;
  assert(safe.completed >= mid.completed && mid.completed >= risky.completed,
    `${scenario.key} completion must not improve with route pressure (${safe.completed}/${mid.completed}/${risky.completed})`);
  assert(safe.scoreP50 <= mid.scoreP50 && mid.scoreP50 <= risky.scoreP50,
    `${scenario.key} median score must pay for additional route pressure (${safe.scoreP50}/${mid.scoreP50}/${risky.scoreP50})`);
  assert(safe.turnsP50 <= mid.turnsP50 && mid.turnsP50 <= risky.turnsP50,
    `${scenario.key} median turns must reflect the difficulty ladder`);
  assert(risky.scoreP50 >= safe.scoreP50 + 20,
    `${scenario.key} risky route needs a visible score premium`);
  assert(risky.damageTakenP50 >= safe.damageTakenP50 + 2,
    `${scenario.key} risky route needs a visible damage cost (${risky.damageTakenP50} vs ${safe.damageTakenP50})`);
  assert(risky.remainingHpP50 <= safe.remainingHpP50,
    `${scenario.key} risky route must not improve median remaining hp`);
  assert(risky.maxActions <= 256, `${scenario.key} risky route exceeded the action ceiling`);

  const midHasCost = mid.completed < safe.completed
    || mid.turnsP50 >= safe.turnsP50 + 0.5
    || mid.damageTakenP50 >= safe.damageTakenP50 + 1
    || mid.remainingHpP50 <= safe.remainingHpP50 - 1;
  if (midHasCost) meaningfulMidCosts += 1;
}

assert(meaningfulMidCosts >= 3, `mid-risk routing must have a measurable cost in most representative scenarios (${meaningfulMidCosts}/${SCENARIOS.length})`);
assert(
  report.challenge.safe.completed - report.challenge.risky.completed >= 3,
  'challenge risky routing must create at least a 4.6pp completion tradeoff across fixed seeds',
);
assert(
  report.challenge.risky.completionRateBps <= 9500,
  'challenge risky routing must not become a cosmetic 100% completion choice',
);

console.log(JSON.stringify({
  reportVersion: CONTENT_SNAPSHOT.routeContracts.reportVersion,
  sampleSize: SAMPLE_SIZE,
  report,
}, null, 2));
console.log('Authoritative route balance checks passed.');
