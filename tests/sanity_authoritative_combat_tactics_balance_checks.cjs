const assert = require('node:assert');
const crypto = require('node:crypto');
const { CONTENT_SNAPSHOT } = require('../server/progression/authoritative-runs/catalog');
const {
  applyCommand,
  createInitialState,
  projectState,
} = require('../server/progression/authoritative-runs/engine');

const TERMINAL_PHASES = new Set(['completed', 'defeated', 'abandoned']);
const SAMPLE_SIZE = 24;
const CONTRACTS = ['steady', 'contested', 'perilous'];
const REPRESENTATIVE_SCENARIOS = [
  { key: 'pve', mode: 'pve', scenarioId: '' },
  { key: 'challenge', mode: 'challenge', scenarioId: '' },
  { key: 'expedition', mode: 'expedition', scenarioId: '' },
];
const ATTACK_REACTIVE_CARDS = new Set(['warding_stride', 'guard', 'iron_mandate']);
const DAMAGE_REACTIVE_CARDS = new Set(['sealbreaker', 'ember_riposte', 'sky_pierce', 'strike', 'fracture', 'life_siphon']);

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

function chooseRoute(view, preferredContractId) {
  const targetDifficulty = CONTENT_SNAPSHOT.routeContracts.profiles[preferredContractId].difficultyRating;
  const choices = view.route.choices.slice().sort((left, right) => {
    const leftRating = Number(left.routeContract?.difficultyRating || 0);
    const rightRating = Number(right.routeContract?.difficultyRating || 0);
    const leftMatch = left.routeContract?.contractId === preferredContractId ? 0 : 1;
    const rightMatch = right.routeContract?.contractId === preferredContractId ? 0 : 1;
    return leftMatch - rightMatch
      || Math.abs(leftRating - targetDifficulty) - Math.abs(rightRating - targetDifficulty)
      || leftRating - rightRating;
  });
  return ['select_node', { nodeId: choices[0].nodeId }];
}

function chooseReward(view) {
  const tacticReward = view.reward.choices.find(choice => choice.kind === 'card' && CONTRACT_REWARD_CARDS.has(choice.cardId));
  if (tacticReward) return ['choose_reward', { rewardId: tacticReward.rewardId }];
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

const CONTRACT_REWARD_CARDS = new Set(['warding_stride', 'sealbreaker']);

function scoreBattleCard(view, card) {
  const intent = view.battle?.enemy?.intent || {};
  const attackIncoming = Number(intent.amount || 0) > 0;
  const enemyBlock = Number(view.battle?.enemy?.block || 0);
  let score = card.cost <= view.player.energy ? 0 : -1000;
  if (card.cardId === 'sealbreaker') {
    score += enemyBlock > 0 ? 120 : 30;
  }
  if (card.cardId === 'warding_stride') {
    score += attackIncoming ? 110 : 25;
  }
  if (card.cardId === 'ember_riposte' && intent.type === 'defend_attack') {
    score += 115;
  }
  if (intent.type === 'attack' || intent.type === 'defend_attack') {
    if (ATTACK_REACTIVE_CARDS.has(card.cardId)) score += 60;
  }
  if (intent.type === 'fortify' || intent.type === 'defend_attack') {
    if (DAMAGE_REACTIVE_CARDS.has(card.cardId)) score += 55;
  }
  score += Number(card.cost || 0) * 2;
  return score;
}

function chooseBattleAction(view) {
  const cards = view.player.hand
    .filter(card => card.cost <= view.player.energy)
    .slice()
    .sort((left, right) => {
      const delta = scoreBattleCard(view, right) - scoreBattleCard(view, left);
      return delta || right.cost - left.cost || left.instanceId.localeCompare(right.instanceId);
    });
  const chosen = cards[0];
  return chosen
    ? ['play_card', { cardInstanceId: chosen.instanceId }]
    : ['end_turn', {}];
}

function chooseCommand(state, preferredContractId) {
  const view = projectState(state, CONTENT_SNAPSHOT);
  if (state.phase === 'route') return chooseRoute(view, preferredContractId);
  if (state.phase === 'reward') return chooseReward(view);
  return chooseBattleAction(view);
}

function emptyIntentSummary() {
  return {
    opportunities: 0,
    successes: 0,
    failures: 0,
  };
}

function emptyCardSummary() {
  return {
    plays: 0,
    procs: 0,
    nonProcPlays: 0,
  };
}

function createSample(scenario, preferredContractId, index) {
  return {
    scenario,
    preferredContractId,
    index,
    state: createInitialState({
      runId: `combat-balance-${sha256(`${scenario.key}:${preferredContractId}:${index}`).slice(0, 24)}`,
      userId: 'combat-balance-user',
      mode: scenario.mode,
      scenarioId: scenario.scenarioId,
      seedHex: sha256(`combat-seed:${scenario.key}:${preferredContractId}:${index}`),
      content: CONTENT_SNAPSHOT,
    }),
    actions: 0,
    intentSummary: {
      attack: emptyIntentSummary(),
      fortify: emptyIntentSummary(),
      defend_attack: emptyIntentSummary(),
    },
    conditionalCards: {
      warding_stride: emptyCardSummary(),
      sealbreaker: emptyCardSummary(),
    },
  };
}

function collectEvents(sample, events) {
  events.forEach((event) => {
    if (event.type === 'enemy_tactic_resolved') {
      const bucket = sample.intentSummary[event.intentType];
      if (!bucket) return;
      bucket.opportunities += 1;
      if (event.success) bucket.successes += 1;
      else bucket.failures += 1;
    }
    if (event.type === 'card_played' && sample.conditionalCards[event.cardId]) {
      const bucket = sample.conditionalCards[event.cardId];
      bucket.plays += 1;
      const procValue = Number(event.conditionalBlock || event.conditionalDamage || 0);
      if (procValue > 0) bucket.procs += 1;
      else bucket.nonProcPlays += 1;
    }
  });
}

function executeSample(sample) {
  while (!TERMINAL_PHASES.has(sample.state.phase) && sample.actions < 256) {
    const [command, payload] = chooseCommand(sample.state, sample.preferredContractId);
    const result = applyCommand(sample.state, CONTENT_SNAPSHOT, command, payload);
    sample.state = result.state;
    sample.actions += 1;
    collectEvents(sample, result.events);
  }
  assert(TERMINAL_PHASES.has(sample.state.phase), `${sample.scenario.key}/${sample.preferredContractId}/${sample.index} must terminate`);
  assert(sample.actions <= 256, `${sample.scenario.key}/${sample.preferredContractId}/${sample.index} exceeded the action budget`);
  return {
    completed: sample.state.phase === 'completed',
    actions: sample.actions,
    score: Number(sample.state.summary?.score || 0),
    turns: sample.state.stats.turns,
    damageTaken: sample.state.stats.damageTaken,
    remainingHp: sample.state.player.hp,
    opportunities: sample.state.summary?.combatTactics?.opportunities || 0,
    successes: sample.state.summary?.combatTactics?.successes || 0,
    successRateBps: sample.state.summary?.combatTactics?.successRateBps || 0,
    intentSummary: sample.intentSummary,
    conditionalCards: sample.conditionalCards,
  };
}

function summarize(results) {
  const summary = {
    completed: results.filter(result => result.completed).length,
    completionRateBps: Math.round(results.filter(result => result.completed).length * 10000 / results.length),
    scoreP50: median(results.map(result => result.score)),
    turnsP50: median(results.map(result => result.turns)),
    damageTakenP50: median(results.map(result => result.damageTaken)),
    remainingHpP50: median(results.map(result => result.remainingHp)),
    maxActions: Math.max(...results.map(result => result.actions)),
    combatTactics: {
      opportunities: 0,
      successes: 0,
      successRateBps: 0,
      intents: {
        attack: emptyIntentSummary(),
        fortify: emptyIntentSummary(),
        defend_attack: emptyIntentSummary(),
      },
      conditionalCards: {
        warding_stride: emptyCardSummary(),
        sealbreaker: emptyCardSummary(),
      },
    },
  };
  results.forEach((result) => {
    summary.combatTactics.opportunities += result.opportunities;
    summary.combatTactics.successes += result.successes;
    ['attack', 'fortify', 'defend_attack'].forEach((intentType) => {
      const target = summary.combatTactics.intents[intentType];
      const source = result.intentSummary[intentType];
      target.opportunities += source.opportunities;
      target.successes += source.successes;
      target.failures += source.failures;
    });
    ['warding_stride', 'sealbreaker'].forEach((cardId) => {
      const target = summary.combatTactics.conditionalCards[cardId];
      const source = result.conditionalCards[cardId];
      target.plays += source.plays;
      target.procs += source.procs;
      target.nonProcPlays += source.nonProcPlays;
    });
  });
  summary.combatTactics.successRateBps = summary.combatTactics.opportunities > 0
    ? Math.round(summary.combatTactics.successes * 10000 / summary.combatTactics.opportunities)
    : 0;
  return summary;
}

const report = {};
const combined = {
  attack: emptyIntentSummary(),
  fortify: emptyIntentSummary(),
  defend_attack: emptyIntentSummary(),
  warding_stride: emptyCardSummary(),
  sealbreaker: emptyCardSummary(),
};
let contestedTradeoffScenarios = 0;

for (const scenario of REPRESENTATIVE_SCENARIOS) {
  report[scenario.key] = {};
  for (const contractId of CONTRACTS) {
    const results = Array.from(
      { length: SAMPLE_SIZE },
      (_, index) => executeSample(createSample(scenario, contractId, index)),
    );
    const summary = summarize(results);
    report[scenario.key][contractId] = summary;
    ['attack', 'fortify', 'defend_attack'].forEach((intentType) => {
      combined[intentType].opportunities += summary.combatTactics.intents[intentType].opportunities;
      combined[intentType].successes += summary.combatTactics.intents[intentType].successes;
      combined[intentType].failures += summary.combatTactics.intents[intentType].failures;
    });
    ['warding_stride', 'sealbreaker'].forEach((cardId) => {
      combined[cardId].plays += summary.combatTactics.conditionalCards[cardId].plays;
      combined[cardId].procs += summary.combatTactics.conditionalCards[cardId].procs;
      combined[cardId].nonProcPlays += summary.combatTactics.conditionalCards[cardId].nonProcPlays;
    });
  }

  const steady = report[scenario.key].steady;
  const contested = report[scenario.key].contested;
  const perilous = report[scenario.key].perilous;
  const contestedHasTradeoff = contested.completed < steady.completed
    || contested.damageTakenP50 > steady.damageTakenP50
    || contested.remainingHpP50 < steady.remainingHpP50;
  const perilousHasTradeoff = perilous.completed < steady.completed
    || perilous.damageTakenP50 > steady.damageTakenP50
    || perilous.remainingHpP50 < steady.remainingHpP50;
  if (contestedHasTradeoff) contestedTradeoffScenarios += 1;
  assert(perilousHasTradeoff, `${scenario.key} perilous routing should still create a measurable tradeoff under tactic-aware play`);
  assert(steady.maxActions <= 256 && contested.maxActions <= 256 && perilous.maxActions <= 256,
    `${scenario.key} must stay within the bounded action budget for every contract`);
}

assert(contestedTradeoffScenarios >= 2, 'contested routing should still create a measurable tradeoff in most representative scenarios');

['attack', 'fortify', 'defend_attack'].forEach((intentType) => {
  assert(combined[intentType].opportunities > 0, `${intentType} tactic should be reachable in the representative balance matrix`);
  assert(combined[intentType].successes > 0, `${intentType} tactic should be completable in the representative balance matrix`);
  assert(combined[intentType].failures > 0, `${intentType} tactic should still admit failure cases in the representative balance matrix`);
});

['warding_stride', 'sealbreaker'].forEach((cardId) => {
  assert(combined[cardId].plays > 0, `${cardId} should be played in the representative balance matrix`);
  assert(combined[cardId].procs > 0, `${cardId} should satisfy its condition in the representative balance matrix`);
  assert(combined[cardId].nonProcPlays > 0, `${cardId} should also appear without its condition so it does not become unconditional`);
});

console.log(JSON.stringify({
  reportVersion: CONTENT_SNAPSHOT.combatTactics.reportVersion,
  sampleSize: SAMPLE_SIZE,
  contracts: CONTRACTS,
  scenarios: REPRESENTATIVE_SCENARIOS.map(entry => entry.key),
  report,
  combined,
}, null, 2));
console.log('Authoritative combat tactics balance checks passed.');
