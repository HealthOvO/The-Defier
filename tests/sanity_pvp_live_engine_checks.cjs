const {
  RULE_VERSION,
  createInitialLiveState,
  projectStateView,
  reduceIntent
} = require('../server/pvp-live/engine/reducer');
const { RULES } = require('../server/pvp-live/engine/rules');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertPostMatchReview(review, {
  result,
  winnerSeat,
  loserSeat,
  finishReason
}) {
  assert(review && review.reportVersion === 'pvp-live-post-match-review-v1', 'finished view should expose live post-match review report version');
  assert(review.result === result, `post-match review should be ${result}, got ${JSON.stringify(review)}`);
  assert(review.winnerSeat === winnerSeat, `post-match review should expose winner seat ${winnerSeat}, got ${JSON.stringify(review)}`);
  assert(review.loserSeat === loserSeat, `post-match review should expose loser seat ${loserSeat}, got ${JSON.stringify(review)}`);
  assert(review.finishReason === finishReason, `post-match review should expose finish reason ${finishReason}, got ${JSON.stringify(review)}`);
  assert(typeof review.summary === 'string' && review.summary.length > 0, 'post-match review should include a readable summary');
  assert(Array.isArray(review.evidence) && review.evidence.length >= 1, 'post-match review should include public evidence entries');
  assert(review.evidence.every(item => item && item.eventType && !item.payload), 'post-match review evidence should not expose hidden event payloads');
  assert(review.evidence.length >= 4, 'post-match review should include a public event trail instead of only the final event pair');
  assert(review.evidence.some(item => item.eventType === 'battle_started'), 'post-match review event trail should include battle start');
  assert(review.evidence.some(item => item.eventType === 'match_finished'), 'post-match review event trail should include match finish');
  assert(Array.isArray(review.suggestions) && review.suggestions.length >= 1, 'post-match review should include actionable suggestions');
  assert(Array.isArray(review.nextActions) && review.nextActions.some(item => item.id === 'review_events') && review.nextActions.some(item => item.id === 'review_key_turns') && review.nextActions.some(item => item.id === 'queue_again'), 'post-match review should expose replay, key-turn review, and requeue next actions');
  assert(review.keyTurnReplay && review.keyTurnReplay.reportVersion === 'pvp-live-key-turn-replay-v1', 'post-match review should expose a key-turn replay report');
  assert(review.keyTurnReplay.sourceVisibility === 'public_events', 'key-turn replay should be built from public event visibility');
  assert(review.keyTurnReplay.usesHiddenInformation === false, 'key-turn replay must not use hidden information');
  assert(review.keyTurnReplay.rankedImpact === 'none', 'key-turn replay should not imply ranked impact');
  assert(Array.isArray(review.keyTurnReplay.turns) && review.keyTurnReplay.turns.length >= 2, 'key-turn replay should include at least two public turn focus entries');
  assert(review.keyTurnReplay.turns.every(item => item && item.id && item.label && item.sequence >= 0 && item.eventType && item.lesson), 'key-turn replay entries should be structured and actionable');
  assert(review.keyTurnReplay.turns.some(item => item.eventType === 'battle_started'), 'key-turn replay should include the battle start window');
  assert(review.keyTurnReplay.turns.some(item => item.eventType === 'match_finished' || item.eventType === 'player_surrendered'), 'key-turn replay should include the terminal decision window');
  assert(!/payload|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(review.keyTurnReplay)), 'key-turn replay must not leak hidden card, hand, deck, or payload details');
  assert(review.experienceReport && review.experienceReport.reportVersion === 'pvp-live-experience-report-v1', 'post-match review should expose a public player-experience report');
  assert(review.experienceReport.sourceVisibility === 'public_events', 'experience report should be built from public events');
  assert(review.experienceReport.usesHiddenInformation === false, 'experience report must not use hidden information');
  assert(review.experienceReport.rankedImpact === 'none', 'experience report should not imply ranked impact or compensation');
  assert(['low', 'watch'].includes(review.experienceReport.nonGameRisk), `experience report should bucket non-game risk, got ${JSON.stringify(review.experienceReport)}`);
  assert(review.loadoutRecommendation && review.loadoutRecommendation.reportVersion === 'pvp-live-loadout-recommendation-v1', 'post-match review should expose a loadout recommendation report');
  assert(review.loadoutRecommendation.sourceVisibility === 'public_events_and_public_content', 'loadout recommendation should use public replay events and public content only');
  assert(review.loadoutRecommendation.usesHiddenInformation === false, 'loadout recommendation must not use hidden information');
  assert(review.loadoutRecommendation.rankedImpact === 'none', 'loadout recommendation must not affect ranked state');
  assert(Array.isArray(review.loadoutRecommendation.evidenceRefs) && review.loadoutRecommendation.evidenceRefs.length >= 1, 'loadout recommendation should cite public evidence refs');
  assert(/下一局/.test(review.loadoutRecommendation.boundaryLine || '') && /不自动排队/.test(review.loadoutRecommendation.boundaryLine || '') && /不写正式积分/.test(review.loadoutRecommendation.boundaryLine || ''), 'loadout recommendation should explain next-game no-auto-queue boundary');
  assert(!/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(review.loadoutRecommendation)), 'loadout recommendation must not leak hidden payloads or reward/rating data');
  assert(Array.isArray(review.experienceReport.nonGameRiskReasons), 'experience report should expose public non-game risk reasons');
  assert(review.experienceReport.seatWindowSummary && review.experienceReport.seatWindowSummary.firstSeat, 'experience report should expose first-seat window summary from public evidence');
  assert(typeof review.experienceReport.seatWindowSummary.secondSeatWindowObserved === 'boolean', 'experience report should expose second-seat window observation');
  assert(typeof review.experienceReport.seatWindowSummary.terminalBeforeSecondSeatWindow === 'boolean', 'experience report should expose terminal-before-second-window risk');
  assert(review.experienceReport.safeguardSummary && ['confirmed', 'missing_signal'].includes(review.experienceReport.safeguardSummary.setupReady), 'experience report should expose setup ready safeguard summary');
  assert(['triggered', 'not_triggered', 'not_observable'].includes(review.experienceReport.safeguardSummary.firstActionBudget), 'experience report should expose first-action budget safeguard state');
  assert(['triggered', 'not_needed', 'not_observable'].includes(review.experienceReport.safeguardSummary.openingProtection), 'experience report should expose opening protection safeguard state');
  assert(Number.isInteger(review.experienceReport.decisionWindowCount) && review.experienceReport.decisionWindowCount >= 1, 'experience report should count public decision windows');
  assert(Array.isArray(review.experienceReport.fairnessChecks) && review.experienceReport.fairnessChecks.length >= 3, 'experience report should expose fairness check entries');
  assert(review.experienceReport.fairnessChecks.some(item => item.id === 'setup_ready_required' && item.passed === true), 'experience report should confirm setup ready safeguard');
  assert(review.experienceReport.fairnessChecks.some(item => item.id === 'first_action_budget'), 'experience report should include first-action budget safeguard');
  assert(review.experienceReport.fairnessChecks.some(item => item.id === 'decision_windows'), 'experience report should include decision-window readability check');
  assert(review.experienceReport.fairnessChecks.every(item => Array.isArray(item.linkedEvidence) && item.linkedEvidence.length >= 1), 'each experience fairness check should link back to public evidence');
  assert(review.experienceReport.fairnessChecks.every(item => item.linkedEvidence.every(event => event && event.eventType && Number.isInteger(event.sequence) && !event.payload)), 'linked evidence should remain sanitized public event refs');
  assert(review.experienceReport.fairnessChecks.some(item => item.id === 'decision_windows' && item.linkedEvidence.some(event => event.eventType === 'battle_started')), 'decision-window check should link battle start evidence');
  assert(JSON.stringify(review.experienceReport.fairnessChecks).includes('"publicData"'), 'linked evidence should include allowlisted publicData for explainability');
  assert(typeof review.experienceReport.summary === 'string' && review.experienceReport.summary.length > 0, 'experience report should include a readable summary');
  assert(!/payload|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(review.experienceReport)), 'experience report must not leak hidden card, hand, deck, or payload details');
  assert(review.fairnessReceipt && review.fairnessReceipt.reportVersion === 'pvp-live-fairness-receipt-v1', 'post-match review should expose a player-facing fairness receipt');
  assert(review.fairnessReceipt.sourceVisibility === 'public_events', 'fairness receipt should be built from public events');
  assert(review.fairnessReceipt.usesHiddenInformation === false, 'fairness receipt must not use hidden information');
  assert(review.fairnessReceipt.rankedImpact === 'none', 'fairness receipt should not imply ranked impact or compensation');
  assert(review.fairnessReceipt.result === result && review.fairnessReceipt.finishReason === finishReason, 'fairness receipt should mirror the seat result and finish reason');
  assert(['accepted', 'watch'].includes(review.fairnessReceipt.receiptState), 'fairness receipt should expose an accepted/watch state');
  assert(/先手|秒杀|行动窗口|公平/.test(review.fairnessReceipt.fairnessVerdict), 'fairness receipt should explain anti-first-kill fairness');
  assert(/反打|护体|窗口/.test(review.fairnessReceipt.counterplayVerdict), 'fairness receipt should explain counterplay or protection windows');
  assert(Array.isArray(review.fairnessReceipt.evidenceSummary) && review.fairnessReceipt.evidenceSummary.length >= 3, 'fairness receipt should summarize multiple public checks');
  assert(review.fairnessReceipt.evidenceSummary.every(item => item && item.id && item.label && Array.isArray(item.evidenceSequences)), 'fairness receipt evidence summary should be structured');
  assert(!/payload|hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo/i.test(JSON.stringify(review.fairnessReceipt)), 'fairness receipt must not leak hidden cards or imply rating/reward');
  assert(!/reward|rating|elo/i.test(JSON.stringify(review)), 'post-match review must not imply reward or exact rating compensation');
}

function assertDrawPostMatchReview(review) {
  assert(review && review.reportVersion === 'pvp-live-post-match-review-v1', 'round14 draw should expose live post-match review report version');
  assert(review.result === 'draw', `round14 draw review should be draw, got ${JSON.stringify(review)}`);
  assert(review.winnerSeat === 'draw', 'round14 draw review should expose draw winner marker');
  assert(review.loserSeat === '', 'round14 draw review should not invent a loser seat');
  assert(review.finishReason === 'round14_draw', 'round14 draw review should expose round14_draw finish reason');
  assert(typeof review.summary === 'string' && /平局|分差/.test(review.summary), 'round14 draw review should explain score-gap draw');
  assert(Array.isArray(review.evidence) && review.evidence.some(item => item.eventType === 'match_finished'), 'round14 draw review should include match_finished evidence');
  assert(review.evidence.some(item => item.eventType === 'match_finished' && item.publicData && item.publicData.finishReason === 'round14_draw'), 'round14 draw evidence should expose public round14_draw reason');
  assert(review.keyTurnReplay && review.keyTurnReplay.turns.some(item => item.eventType === 'match_finished'), 'round14 draw key-turn replay should include the terminal score decision');
  assert(review.experienceReport && review.experienceReport.fairnessChecks.some(item => item.id === 'round14_resolution'), 'round14 draw experience report should expose long-game resolution fairness check');
  assert(review.fairnessReceipt && review.fairnessReceipt.reportVersion === 'pvp-live-fairness-receipt-v1', 'round14 draw review should expose a fairness receipt');
  assert(review.fairnessReceipt.evidenceSummary.some(item => item.id === 'round14_resolution'), 'round14 draw fairness receipt should summarize long-game public scoring');
  assert(review.loadoutRecommendation?.recommendedPresetId === 'balanced', 'round14 draw should recommend the default balanced loadout');
  assert(!/reward|rating|elo|hand|deck|cardId|instanceId|loadoutSnapshot/i.test(JSON.stringify(review)), 'round14 draw review must not leak hidden cards or imply reward/rating');
}

function createReadyLiveState(matchId) {
  const setupState = createInitialLiveState({
    matchId,
    seats: [
      { seatId: 'A', userId: `${matchId}-a`, displayName: '甲' },
      { seatId: 'B', userId: `${matchId}-b`, displayName: '乙' }
    ]
  });
  const readyAResult = reduceIntent(setupState, {
    intentId: `${matchId}-ready-a`,
    intentType: 'ready',
    matchId,
    seatId: 'A',
    ruleVersion: RULE_VERSION,
    stateVersion: setupState.stateVersion,
    payload: {}
  });
  const readyBResult = reduceIntent(readyAResult.state, {
    intentId: `${matchId}-ready-b`,
    intentType: 'ready',
    matchId,
    seatId: 'B',
    ruleVersion: RULE_VERSION,
    stateVersion: readyAResult.state.stateVersion,
    payload: {}
  });
  return readyBResult.state;
}

const baseState = createInitialLiveState({
  matchId: 'pvpm-test',
  seats: [
    { seatId: 'A', userId: 'u-a', displayName: '甲' },
    { seatId: 'B', userId: 'u-b', displayName: '乙' }
  ]
});

assert(baseState.ruleVersion === RULE_VERSION, 'state should expose pvp-live-v1 rule version');
assert(RULES.firstActionDamageBudget.firstSeat === 18 && RULES.firstActionDamageBudget.secondSeat === 22, 'damage budget rules should expose semantic first-seat and second-seat keys');
assert(!Object.prototype.hasOwnProperty.call(RULES.firstActionDamageBudget, 'A') && !Object.prototype.hasOwnProperty.call(RULES.firstActionDamageBudget, 'B'), 'damage budget rules must not expose seat-A or seat-B lookup keys');
assert(baseState.status === 'setup', 'live match should start in setup before either player can act');
assert(baseState.phase === 'setup', 'live match should expose setup phase before both players are ready');
assert(baseState.currentSeat === 'A', 'seat A should be reserved as first actor after setup in deterministic engine tests');
assert(baseState.seats.A.ready === false && baseState.seats.B.ready === false, 'both seats should start unready');
assert(baseState.seats.A.mulliganUsed === false && baseState.seats.B.mulliganUsed === false, 'both seats should start with mulligan available');
assert(baseState.seats.A.loadoutSnapshot && baseState.seats.A.loadoutSnapshot.loadoutHash, 'seat A should start with a server-locked loadout snapshot');
assert(baseState.seats.B.loadoutSnapshot && baseState.seats.B.loadoutSnapshot.loadoutHash, 'seat B should start with a server-locked loadout snapshot');
assert(baseState.seats.A.hp === 50 && baseState.seats.B.hp === 50, 'both seats should start at 50 hp');
assert(baseState.matchQuality && baseState.matchQuality.reportVersion === 'pvp-live-match-quality-v1', 'initial state should include live match quality report version');
assert(baseState.matchQuality.tag === 'good', 'initial state should default to good match quality tag');
assert(baseState.matchQuality.expansionStage === 'mvp_open_pool', 'initial state should expose MVP open-pool expansion stage');
assert(Array.isArray(baseState.matchQuality.safeguards) && baseState.matchQuality.safeguards.includes('setup_ready_required'), 'match quality report should include setup ready safeguard');
assert(baseState.firstMatchGuide && baseState.firstMatchGuide.reportVersion === 'pvp-live-first-match-guide-v1', 'initial state should include first-match guide report version');
assert(baseState.firstMatchGuide.safeguards.includes('opening_protection'), 'first-match guide should explain opening protection safeguard');
assert(baseState.firstMatchGuide.safeguards.includes('invalidated_no_score'), 'first-match guide should explain no-score invalidated setup safeguard');
assert(baseState.firstMatchGuide.steps.some(step => step.id === 'setup_ready' && /调息/.test(step.detail)), 'first-match guide should explain setup ready flow');
assert(baseState.firstMatchGuide.steps.some(step => step.id === 'mode_boundary' && /真人排位/.test(step.detail) && /旧残影/.test(step.detail)), 'first-match guide should explain live ranked mode boundary');
assert(baseState.firstMatchGuide.recommendedLoadouts.some(item => item.id === 'balanced' && /弱点/.test(item.weakness)), 'first-match guide should include balanced recommended loadout weakness');
assert(baseState.firstMatchGuide.recommendedLoadouts.some(item => item.id === 'sword' && /弱点/.test(item.weakness)), 'first-match guide should include sword recommended loadout weakness');
assert(baseState.firstMatchGuide.recommendedLoadouts.some(item => item.id === 'shield' && /弱点/.test(item.weakness)), 'first-match guide should include shield recommended loadout weakness');
assert(baseState.firstMatchGuide.exceptionBranches.some(item => item.id === 'ready_timeout' && /不写正式积分/.test(item.detail)), 'first-match guide should explain ready timeout exception');
assert(baseState.firstMatchGuide.exceptionBranches.some(item => item.id === 'refresh_required'), 'first-match guide should explain refresh_required exception');
assert(baseState.firstMatchGuide.reviewActions.length >= 3, 'first-match guide should expose at least three review actions');
assert(!/reward|rating|elo/i.test(JSON.stringify(baseState.firstMatchGuide)), 'first-match guide must not imply hidden reward or exact rating compensation');
assert(baseState.loadoutExplorationReport && baseState.loadoutExplorationReport.reportVersion === 'pvp-live-loadout-exploration-v1', 'initial state should expose loadout exploration report');
assert(baseState.loadoutExplorationReport.sourceVisibility === 'public_content', 'loadout exploration report should come from public content');
assert(baseState.loadoutExplorationReport.usesHiddenInformation === false, 'loadout exploration report must not use hidden information');
assert(baseState.loadoutExplorationReport.rankedImpact === 'none', 'loadout exploration report should not write ranked result');
assert(Array.isArray(baseState.loadoutExplorationReport.profiles) && baseState.loadoutExplorationReport.profiles.length >= 3, 'loadout exploration report should expose multiple replay goals');
assert(baseState.loadoutExplorationReport.profiles.every(item => item.funHook && item.skillTest && item.publicWeakness && item.practiceTopic && item.practiceTopic.id), 'loadout exploration profiles should include fun hook, skill test, weakness, and practice topic');
assert(baseState.loadoutExplorationReport.profiles.every(item => Array.isArray(item.swapSlots) && item.swapSlots.length >= 2), 'loadout exploration profiles should include swap slots');
assert(/不改变生命、伤害、抽牌、灵力、起手或匹配/.test(baseState.loadoutExplorationReport.progressionBoundary), 'loadout exploration report should lock non-power mastery boundary');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo/i.test(JSON.stringify(baseState.loadoutExplorationReport)), 'loadout exploration report must not leak hidden cards or hidden rating');

const viewA = projectStateView(baseState, 'A');
assert(viewA.status === 'setup' && viewA.setup.readyDeadlineAt > 0, 'state view should expose setup readiness metadata');
assert(viewA.matchQuality && viewA.matchQuality.tag === 'good', 'state view should expose public match quality tag');
assert(viewA.matchQuality.ratingDeltaBucket === 'unrated_mvp', 'state view should expose bucketed rating delta instead of exact hidden rating');
assert(viewA.firstMatchGuide && viewA.firstMatchGuide.reportVersion === 'pvp-live-first-match-guide-v1', 'state view should expose public first-match guide report');
assert(viewA.firstMatchGuide.nextAction === '先调息手牌，确认准备后再开战。', 'setup first-match guide should expose current next action');
assert(viewA.firstMatchGuide.recommendedLoadouts.length === 3, 'state view first-match guide should expose three MVP recommended loadouts');
assert(viewA.firstMatchGuide.exceptionBranches.some(item => item.id === 'ready_timeout'), 'state view first-match guide should expose ready timeout exception branch');
assert(viewA.firstMatchGuide.reviewActions.length >= 3, 'state view first-match guide should expose review action entries');
assert(!/reward|rating|elo/i.test(JSON.stringify(viewA.firstMatchGuide)), 'state view first-match guide must not leak hidden rating or reward promises');
assert(viewA.loadoutExplorationReport && viewA.loadoutExplorationReport.reportVersion === 'pvp-live-loadout-exploration-v1', 'state view should expose loadout exploration report');
assert(viewA.loadoutExplorationReport.sourceVisibility === 'public_content', 'state view exploration report should be public content only');
assert(viewA.loadoutExplorationReport.usesHiddenInformation === false, 'state view exploration report must not use hidden information');
assert(viewA.loadoutExplorationReport.rankedImpact === 'none', 'state view exploration report should not write ranked result');
assert(viewA.loadoutExplorationReport.profiles.length >= 3, 'state view exploration report should expose replay goals');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo/i.test(JSON.stringify(viewA.loadoutExplorationReport)), 'state view exploration report must not leak hidden cards or hidden rating');
assert(viewA.openingSafeguardReport && viewA.openingSafeguardReport.reportVersion === 'pvp-live-opening-safeguard-v1', 'state view should expose active opening safeguard report');
assert(viewA.openingSafeguardReport.damageBudget.firstSeat === 18, 'opening safeguard report should expose first-seat damage budget');
assert(viewA.openingSafeguardReport.damageBudget.secondSeat === 22, 'opening safeguard report should expose second-seat damage budget');
assert(viewA.openingSafeguardReport.openingProtection.minimumHp === 1, 'opening safeguard report should expose opening protection minimum hp');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo/i.test(JSON.stringify(viewA.openingSafeguardReport)), 'opening safeguard report must not leak hidden cards or hidden rating');
assert(viewA.duelMomentumReport && viewA.duelMomentumReport.reportVersion === 'pvp-live-duel-momentum-v1', 'state view should expose public duel momentum report');
assert(viewA.duelMomentumReport.sourceVisibility === 'public_state', 'duel momentum report should come from public state');
assert(viewA.duelMomentumReport.usesHiddenInformation === false, 'duel momentum report must not use hidden information');
assert(viewA.duelMomentumReport.rankedImpact === 'none', 'duel momentum report should not write ranked result');
assert(viewA.duelMomentumReport.viewerSeat === 'A' && viewA.duelMomentumReport.opponentSeat === 'B', 'duel momentum report should expose viewer and opponent seats');
assert(/局势/.test(viewA.duelMomentumReport.summaryLine), 'duel momentum report should provide a readable board-state summary');
assert(/反打窗口|行动窗口/.test(viewA.duelMomentumReport.counterplayLine), 'duel momentum report should explain counterplay or action windows');
assert(viewA.duelMomentumReport.safeguards.includes('opening_protection'), 'duel momentum report should surface opening protection safeguard');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(viewA.duelMomentumReport)), 'duel momentum report must not leak hidden cards or hidden rating/reward');
const invalidatedViewA = projectStateView({ ...baseState, status: 'invalidated', phase: 'invalidated' }, 'A');
assert(invalidatedViewA.duelMomentumReport.pressureState === 'invalidated', 'invalidated duel momentum should not show an actionable pressure state');
assert(/无效局/.test(invalidatedViewA.duelMomentumReport.summaryLine), 'invalidated duel momentum should explain no-start terminal state');
assert(/不计正式积分/.test(invalidatedViewA.duelMomentumReport.counterplayLine), 'invalidated duel momentum should keep no-score boundary readable');
assert(invalidatedViewA.duelMomentumReport.safeguards.includes('invalidated_no_score'), 'invalidated duel momentum should expose invalidated no-score safeguard');
assert(viewA.self.ready === false && viewA.opponent.ready === false, 'state view should expose public ready status');
assert(viewA.self.loadoutHash === baseState.seats.A.loadoutSnapshot.loadoutHash, 'self view should expose own locked loadout hash');
assert(viewA.opponent.loadoutHash === baseState.seats.B.loadoutSnapshot.loadoutHash, 'opponent view should expose only public locked loadout hash');
assert(!viewA.opponent.loadoutSnapshot, 'opponent public view must not expose full loadout snapshot');
assert(viewA.recentEvents.some(event => event.eventType === 'snapshot_locked'), 'initial setup view should include public snapshot_locked event');
assert(Array.isArray(viewA.self.hand) && viewA.self.hand.length > 0, 'self view should include own hand');
assert(typeof viewA.opponent.handCount === 'number', 'opponent view should expose hand count');
assert(!Array.isArray(viewA.opponent.hand), 'opponent view must not expose hand cards');
assert(!Array.isArray(viewA.opponent.deck), 'opponent view must not expose deck order');

const playBeforeReady = reduceIntent(baseState, {
  intentId: 'intent-play-before-ready-1',
  intentType: 'play_card',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: baseState.stateVersion,
  payload: { cardInstanceId: 'A-burst-1', targetSeat: 'B' }
});
assert(playBeforeReady.result === 'rejected' && playBeforeReady.reason === 'setup_not_ready', 'setup should reject play_card before both players ready');

const invalidMulligan = reduceIntent(baseState, {
  intentId: 'intent-invalid-mulligan-1',
  intentType: 'mulligan',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: baseState.stateVersion,
  payload: { cardInstanceIds: ['A-burst-1', 'A-strike-1', 'A-guard-1'] }
});
assert(invalidMulligan.result === 'rejected' && invalidMulligan.reason === 'invalid_mulligan_count', 'mulligan should allow at most two selected cards');

const mulligan = reduceIntent(baseState, {
  intentId: 'intent-mulligan-1',
  intentType: 'mulligan',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: baseState.stateVersion,
  payload: { cardInstanceIds: ['A-burst-1', 'A-strike-1'] }
});
assert(mulligan.result === 'accepted', 'setup mulligan should be accepted once');
assert(mulligan.state.status === 'setup', 'mulligan should not start battle by itself');
assert(mulligan.state.seats.A.mulliganUsed === true, 'mulligan should mark only the acting seat as used');
assert(mulligan.state.seats.A.hand.length === 3, 'mulligan should preserve opening hand size');
assert(!mulligan.state.seats.A.hand.some(card => card.instanceId === 'A-burst-1' || card.instanceId === 'A-strike-1'), 'mulligan should replace selected cards from hand');
assert(mulligan.events.some(e => e.eventType === 'mulligan_completed' && e.payload.count === 2), 'mulligan should emit a public count-only event');
assert(!JSON.stringify(mulligan.events).includes('A-burst-1'), 'mulligan public event should not reveal selected card ids');

const repeatedMulligan = reduceIntent(mulligan.state, {
  intentId: 'intent-mulligan-2',
  intentType: 'mulligan',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: mulligan.state.stateVersion,
  payload: { cardInstanceIds: [] }
});
assert(repeatedMulligan.result === 'rejected' && repeatedMulligan.reason === 'mulligan_already_used', 'each seat should only mulligan once');

const readyA = reduceIntent(mulligan.state, {
  intentId: 'intent-ready-a-1',
  intentType: 'ready',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: mulligan.state.stateVersion,
  payload: {}
});
assert(readyA.result === 'accepted', 'first ready intent should be accepted');
assert(readyA.state.status === 'setup', 'battle should remain in setup until both players are ready');
assert(readyA.state.seats.A.ready === true && readyA.state.seats.B.ready === false, 'first ready should only mark acting seat');

const readyB = reduceIntent(readyA.state, {
  intentId: 'intent-ready-b-1',
  intentType: 'ready',
  matchId: 'pvpm-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: readyA.state.stateVersion,
  payload: {}
});
assert(readyB.result === 'accepted', 'second ready intent should be accepted');
assert(readyB.state.status === 'active' && readyB.state.phase === 'main', 'battle should enter active main phase after both players ready');
assert(readyB.events.some(e => e.eventType === 'battle_started' && e.payload.firstSeat === 'A'), 'second ready should emit public battle_started event');

const activeSetupState = createInitialLiveState({
  matchId: 'pvpm-active-test',
  seats: [
    { seatId: 'A', userId: 'u-a', displayName: '甲' },
    { seatId: 'B', userId: 'u-b', displayName: '乙' }
  ]
});
const activeReadyA = reduceIntent(activeSetupState, {
  intentId: 'intent-active-ready-a-1',
  intentType: 'ready',
  matchId: 'pvpm-active-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: activeSetupState.stateVersion,
  payload: {}
});
const activeReadyB = reduceIntent(activeReadyA.state, {
  intentId: 'intent-active-ready-b-1',
  intentType: 'ready',
  matchId: 'pvpm-active-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: activeReadyA.state.stateVersion,
  payload: {}
});
const activeState = activeReadyB.state;
const activeViewA = projectStateView(activeState, 'A');
assert(activeViewA.openingSafeguardReport.status === 'armed', 'active opening safeguard report should start armed before first action');
assert(activeViewA.openingSafeguardReport.damageBudget.currentSeat === 'A', 'opening safeguard report should expose current acting seat');
assert(activeViewA.openingSafeguardReport.damageBudget.currentActionBudget === 18, 'opening safeguard report should expose current first-action budget');
assert(activeViewA.openingSafeguardReport.openingProtection.protectedSeats.includes('B'), 'opening protection should visibly protect the non-acting seat at battle start');
assert(activeViewA.openingSafeguardReport.secondSeatBuffer.block === 3 && activeViewA.openingSafeguardReport.secondSeatBuffer.seatId === 'B', 'opening safeguard report should expose public second-seat buffer');
assert(activeViewA.duelMomentumReport.pressureState === 'opening_window', 'active duel momentum should identify opening window at battle start');
assert(activeViewA.duelMomentumReport.currentSeat === 'A' && activeViewA.duelMomentumReport.isViewerTurn === true, 'active duel momentum should expose current public action seat');
assert(/护体/.test(activeViewA.duelMomentumReport.summaryLine), 'active duel momentum should mention active opening protection');
assert(/反打窗口/.test(activeViewA.duelMomentumReport.counterplayLine), 'active duel momentum should keep counterplay window readable');
assert(activeViewA.duelMomentumReport.safeguards.includes('second_seat_buffer'), 'active duel momentum should surface second-seat buffer safeguard');
assert(activeViewA.intentSignalReport && activeViewA.intentSignalReport.reportVersion === 'pvp-live-intent-signal-v1', 'active state view should expose public intent signal report');
assert(activeViewA.intentSignalReport.sourceVisibility === 'public_state_and_public_content', 'intent signal should use public board state and public card content only');
assert(activeViewA.intentSignalReport.usesHiddenInformation === false, 'intent signal must not use hidden hand or deck information');
assert(activeViewA.intentSignalReport.rankedImpact === 'none', 'intent signal should not write ranked result');
assert(activeViewA.intentSignalReport.viewerSeat === 'A' && activeViewA.intentSignalReport.currentSeat === 'A', 'intent signal should identify viewer and current public actor');
assert(activeViewA.intentSignalReport.isViewerTurn === true, 'intent signal should mark the acting viewer turn');
assert(activeViewA.intentSignalReport.threat.publicDamageCeiling >= 15, 'intent signal should expose a public damage ceiling after block/protection');
assert(activeViewA.intentSignalReport.threat.targetHpAfter >= 1, 'intent signal should keep opening protection readable instead of promising a first-click kill');
assert(/公开牌池|公开上限/.test(activeViewA.intentSignalReport.intentLine), 'intent signal should frame pressure as a public-content read, not a hidden-hand read');
assert(/反制窗口|护体|缓冲/.test(activeViewA.intentSignalReport.responseLine), 'intent signal should name the defender counterplay window');
assert(activeViewA.intentSignalReport.safeguards.includes('private_card_projection_blocked'), 'intent signal should carry the hidden-card safeguard');
assert(!/hand|deck|cardInstanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(activeViewA.intentSignalReport)), 'intent signal must not leak hands, decks, rating, or reward data');
assert(activeViewA.actionPreviewReport && activeViewA.actionPreviewReport.reportVersion === 'pvp-live-action-preview-v1', 'active state view should expose viewer-scoped action preview report');
assert(activeViewA.actionPreviewReport.sourceVisibility === 'viewer_public_state', 'action preview should be scoped to viewer public state');
assert(activeViewA.actionPreviewReport.usesHiddenInformation === false, 'action preview must not use hidden information');
assert(activeViewA.actionPreviewReport.rankedImpact === 'none', 'action preview should not write ranked result');
assert(activeViewA.actionPreviewReport.isViewerTurn === true, 'action preview should mark the current viewer turn');
const activeBurstPreview = activeViewA.actionPreviewReport.playableCards.find(card => card.cardInstanceId === 'A-burst-1');
assert(activeBurstPreview, 'action preview should include the acting viewer hand card');
assert(activeBurstPreview.rawDamage === 19, 'action preview should expose raw card damage from the viewer hand');
assert(activeBurstPreview.damageBudget === 18, 'action preview should expose current first-action budget');
assert(activeBurstPreview.budgetedDamage === 18, 'action preview should clamp damage to the current budget');
assert(activeBurstPreview.blockedDamage === 3, 'action preview should account for the public second-seat shield');
assert(activeBurstPreview.hpDamage === 15, 'action preview should expose expected HP damage after block');
assert(activeBurstPreview.targetHpAfter === 35, 'action preview should expose expected target HP after public mitigation');
assert(activeBurstPreview.openingProtection.willTrigger === false, 'action preview should not predict protection when the target survives above minimum HP');
assert(/B.*预计.*35/.test(activeBurstPreview.summaryLine), 'action preview should give a readable expected HP line');
assert(!/deck|loadoutSnapshot|rating|elo|reward|opponentHand|opponentDeck/i.test(JSON.stringify(activeViewA.actionPreviewReport)), 'action preview must not leak deck, hidden rating, reward, or opponent hidden hand');
const activeViewB = projectStateView(activeState, 'B');
assert(activeViewB.actionPreviewReport && activeViewB.actionPreviewReport.isViewerTurn === false, 'non-current viewer should receive a non-actionable preview boundary');
assert(activeViewB.actionPreviewReport.playableCards.length === 0, 'non-current viewer preview must not expose opponent playable card projections');
assert(activeViewB.intentSignalReport && activeViewB.intentSignalReport.isViewerTurn === false, 'non-current viewer should still receive a public intent read');
assert(activeViewB.intentSignalReport.threat.actorSeat === 'A', 'non-current viewer intent read should identify the public acting seat');
assert(/等待|观察|反制/.test(activeViewB.intentSignalReport.responseLine), 'non-current viewer intent read should focus on waiting and counterplay');
assert(!/hand|deck|cardInstanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(activeViewB.intentSignalReport)), 'non-current intent signal must not expose opponent hidden card projections');
assert(activeState.seats.B.block === 3, 'second seat should start active combat with public opening buffer block');
assert(activeState.events.some(e => e.eventType === 'opening_second_seat_buffer_granted' && e.payload.seatId === 'B' && e.payload.block === 3), 'battle start should emit public second-seat buffer event');

const setupDeck = ['punctureMark', 'exposedCircuit', 'pvp_guard'];
const tacticalDeck = setupDeck.concat(Array.from({ length: 17 }, (_, index) => index % 2 === 0 ? 'pvp_strike' : 'pvp_guard')).map(id => ({ id, upgraded: false }));
const tacticalState = createReadyLiveState('pvpm-public-status-test');
tacticalState.seats.A.hand = tacticalDeck.slice(0, 3).map((entry, index) => ({
  instanceId: `A-${entry.id}-${index + 1}`,
  cardId: entry.id,
  name: RULES.cards[entry.id].name,
  cost: RULES.cards[entry.id].cost,
  damage: RULES.cards[entry.id].damage || 0,
  block: RULES.cards[entry.id].block || 0
}));
tacticalState.seats.A.deck = tacticalDeck.slice(3).map((entry, index) => ({
  instanceId: `A-${entry.id}-${index + 4}`,
  cardId: entry.id,
  name: RULES.cards[entry.id].name,
  cost: RULES.cards[entry.id].cost,
  damage: RULES.cards[entry.id].damage || 0,
  block: RULES.cards[entry.id].block || 0
}));
tacticalState.seats.B.hand = ['pvp_guard', 'pvp_strike', 'pvp_guard'].map((id, index) => ({
  instanceId: `B-${id}-${index + 1}`,
  cardId: id,
  name: RULES.cards[id].name,
  cost: RULES.cards[id].cost,
  damage: RULES.cards[id].damage || 0,
  block: RULES.cards[id].block || 0
}));
const punctureMark = reduceIntent(tacticalState, {
  intentId: 'intent-public-status-mark-1',
  intentType: 'play_card',
  matchId: 'pvpm-public-status-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: tacticalState.stateVersion,
  payload: { cardInstanceId: 'A-punctureMark-1', targetSeat: 'B' }
});
assert(punctureMark.result === 'accepted', 'public setup card should be accepted');
assert(punctureMark.events.some(e => e.eventType === 'status_applied' && e.payload.statusId === 'vulnerable_mark' && e.payload.seatId === 'B'), 'public setup card should emit status_applied evidence');
assert(punctureMark.state.seats.B.publicStatuses.some(status => status.statusId === 'vulnerable_mark'), 'public setup card should attach a visible status to the target');
const markedViewB = projectStateView(punctureMark.state, 'B');
assert(markedViewB.self.publicStatuses.some(status => status.statusId === 'vulnerable_mark' && status.earliestConsumeTurnIndex > punctureMark.state.turnIndex), 'defender should see a public response window before payoff can consume the mark');
assert(markedViewB.recentEvents.some(event => event.eventType === 'status_applied' && (event.publicData || {}).statusId === 'vulnerable_mark'), 'defender should see public status_applied event evidence');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(markedViewB.self.publicStatuses)), 'public status view must not leak hidden hand, deck, rating, or card ids');
const sameWindowPayoff = reduceIntent(punctureMark.state, {
  intentId: 'intent-public-status-same-window-payoff-1',
  intentType: 'play_card',
  matchId: 'pvpm-public-status-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: punctureMark.state.stateVersion,
  payload: { cardInstanceId: 'A-exposedCircuit-2', targetSeat: 'B' }
});
assert(sameWindowPayoff.result === 'accepted', 'same-window payoff card should still resolve as a normal card');
assert(!sameWindowPayoff.events.some(e => e.eventType === 'status_consumed'), 'same-window payoff must not consume the public mark before defender response');
assert(sameWindowPayoff.state.seats.B.publicStatuses.some(status => status.statusId === 'vulnerable_mark'), 'same-window payoff should leave the public mark visible for response');
const markEndTurn = reduceIntent(punctureMark.state, {
  intentId: 'intent-public-status-a-end-1',
  intentType: 'end_turn',
  matchId: 'pvpm-public-status-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: punctureMark.state.stateVersion,
  payload: {}
});
const defenderResponseTurn = projectStateView(markEndTurn.state, 'B');
assert(defenderResponseTurn.self.publicStatuses.some(status => status.statusId === 'vulnerable_mark'), 'defender response turn should keep the public mark visible');
assert(/破绽|反制/.test(defenderResponseTurn.duelMomentumReport.counterplayLine) || defenderResponseTurn.self.publicStatuses.length > 0, 'defender response turn should be readable as a response window');
const guardMitigation = reduceIntent(markEndTurn.state, {
  intentId: 'intent-public-status-b-guard-1',
  intentType: 'play_card',
  matchId: 'pvpm-public-status-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: markEndTurn.state.stateVersion,
  payload: { cardInstanceId: 'B-pvp_guard-1', targetSeat: 'A' }
});
assert(guardMitigation.result === 'accepted', 'defender guard response should be accepted inside the public mark response window');
assert(guardMitigation.events.some(e => e.eventType === 'status_mitigated' && e.payload.statusId === 'vulnerable_mark' && e.payload.seatId === 'B'), 'defender guard response should emit public status_mitigated evidence');
assert(!guardMitigation.state.seats.B.publicStatuses.some(status => status.statusId === 'vulnerable_mark'), 'defender guard response should remove the public vulnerable mark');
const mitigatedViewA = projectStateView(guardMitigation.state, 'A');
assert(mitigatedViewA.recentEvents.some(event => event.eventType === 'status_mitigated' && (event.publicData || {}).statusId === 'vulnerable_mark'), 'attacker should see the public mitigation event before payoff');
assert(mitigatedViewA.actionReceiptReport.statusEffects && mitigatedViewA.actionReceiptReport.statusEffects.mitigated.some(status => status.statusId === 'vulnerable_mark'), 'guard receipt should explain the public status mitigation');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(mitigatedViewA.actionReceiptReport.statusEffects)), 'mitigation receipt must not leak hidden hand, deck, rating, or reward data');
const guardMitigationEndTurn = reduceIntent(guardMitigation.state, {
  intentId: 'intent-public-status-b-guard-end-1',
  intentType: 'end_turn',
  matchId: 'pvpm-public-status-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: guardMitigation.state.stateVersion,
  payload: {}
});
const mitigatedPayoff = reduceIntent(guardMitigationEndTurn.state, {
  intentId: 'intent-public-status-mitigated-payoff-1',
  intentType: 'play_card',
  matchId: 'pvpm-public-status-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: guardMitigationEndTurn.state.stateVersion,
  payload: { cardInstanceId: 'A-exposedCircuit-2', targetSeat: 'B' }
});
assert(mitigatedPayoff.result === 'accepted', 'payoff after mitigation should still resolve as a normal card');
assert(!mitigatedPayoff.events.some(e => e.eventType === 'status_consumed'), 'payoff after mitigation should not consume a removed public mark');
const mitigatedPayoffReceipt = projectStateView(mitigatedPayoff.state, 'A').actionReceiptReport;
assert(!mitigatedPayoffReceipt.statusEffects.consumed.some(status => status.statusId === 'vulnerable_mark'), 'payoff receipt after mitigation should not claim a public status bonus');
const defenderEndTurn = reduceIntent(markEndTurn.state, {
  intentId: 'intent-public-status-b-end-1',
  intentType: 'end_turn',
  matchId: 'pvpm-public-status-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: markEndTurn.state.stateVersion,
  payload: {}
});
const delayedPayoff = reduceIntent(defenderEndTurn.state, {
  intentId: 'intent-public-status-delayed-payoff-1',
  intentType: 'play_card',
  matchId: 'pvpm-public-status-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: defenderEndTurn.state.stateVersion,
  payload: { cardInstanceId: 'A-exposedCircuit-2', targetSeat: 'B' }
});
assert(delayedPayoff.result === 'accepted', 'delayed payoff should resolve after defender response window');
assert(delayedPayoff.events.some(e => e.eventType === 'status_consumed' && e.payload.statusId === 'vulnerable_mark' && e.payload.damageBonus > 0), 'delayed payoff should consume the public mark for a visible bonus');
assert(!delayedPayoff.state.seats.B.publicStatuses.some(status => status.statusId === 'vulnerable_mark'), 'consumed mark should be removed from target public statuses');
const delayedReceipt = projectStateView(delayedPayoff.state, 'A').actionReceiptReport;
assert(delayedReceipt.statusEffects && delayedReceipt.statusEffects.consumed.some(status => status.statusId === 'vulnerable_mark'), 'payoff receipt should explain consumed public status');
assert(/破绽|额外/.test(delayedReceipt.summaryLine), 'payoff receipt should include a readable public status payoff line');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(delayedReceipt)), 'payoff receipt must not leak hidden hand, deck, rating, or reward data');

const setupEmote = reduceIntent(baseState, {
  intentId: 'intent-setup-emote-1',
  intentType: 'emote',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: baseState.stateVersion,
  payload: { emoteId: 'respect' }
});
assert(setupEmote.result === 'accepted', 'setup phase should accept preset emote as non-combat social intent');
assert(setupEmote.state.status === 'setup', 'setup emote must not start or finish the match');
assert(setupEmote.state.stateVersion === baseState.stateVersion + 1, 'emote should advance public state version for persistence without starting combat');
assert(setupEmote.events.length === 1 && setupEmote.events[0].eventType === 'emote_sent', 'emote should emit one public emote event');
assert(setupEmote.events[0].payload.emoteId === 'respect', 'emote event should expose preset emote id');
assert(projectStateView(setupEmote.state, 'B').recentEvents.some(e => e.eventType === 'emote_sent' && (e.publicData || e.payload || {}).seatId === 'A'), 'opponent view should see public preset emote event');
const setupEmoteRateLimited = reduceIntent(setupEmote.state, {
  intentId: 'intent-setup-emote-2',
  intentType: 'emote',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: setupEmote.state.stateVersion,
  payload: { emoteId: 'thinking' }
});
assert(setupEmoteRateLimited.result === 'rejected' && setupEmoteRateLimited.reason === 'emote_rate_limited', 'emote should be rate limited without changing combat state');
const invalidEmote = reduceIntent(activeState, {
  intentId: 'intent-invalid-emote-1',
  intentType: 'emote',
  matchId: 'pvpm-active-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: activeState.stateVersion,
  payload: { emoteId: 'free_text_payload' }
});
assert(invalidEmote.result === 'rejected' && invalidEmote.reason === 'invalid_emote', 'live PVP should reject non-whitelisted emotes');

const burstIntent = {
  intentId: 'intent-burst-1',
  intentType: 'play_card',
  matchId: 'pvpm-active-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: activeState.stateVersion,
  payload: { cardInstanceId: activeState.seats.A.hand[0].instanceId, targetSeat: 'B' }
};

const burst = reduceIntent(activeState, burstIntent);
assert(burst.result === 'accepted', 'legal over-budget burst should be accepted');
assert(burst.state.seats.B.hp === 35, 'first action damage should clamp to 18 actual damage and consume public second-seat buffer first');
assert(burst.events.some(e => e.eventType === 'budget_clamped' && e.payload.preventedDamage === 1), 'budget clamp event should be public');
assert(burst.events.every(e => e.eventType !== 'damage_budget_exceeded'), 'budget clamp must not use reject event name');
assert(new Set(burst.events.map(e => e.sequence)).size === burst.events.length, 'events from one intent should have unique sequences');
assert(burst.events.map(e => e.sequence).join(',') === [activeState.eventSeq + 1, activeState.eventSeq + 2, activeState.eventSeq + 3].join(','), 'first combat intent should emit ordered event sequences after setup events');
const burstReceiptA = projectStateView(burst.state, 'A').actionReceiptReport;
assert(burstReceiptA && burstReceiptA.reportVersion === 'pvp-live-action-receipt-v1', 'state view should expose latest public action receipt after a card resolves');
assert(burstReceiptA.sourceVisibility === 'authoritative_public_projection', 'action receipt should be a server authoritative public projection');
assert(burstReceiptA.usesHiddenInformation === false, 'action receipt must not use hidden information');
assert(burstReceiptA.rankedImpact === 'none', 'action receipt must not write ranked result');
assert(burstReceiptA.actionType === 'play_card' && burstReceiptA.actingSeat === 'A', 'action receipt should identify the resolved card action');
assert(burstReceiptA.cardName === '破阵爆发', 'action receipt should expose the public played card name');
assert(burstReceiptA.damage.rawDamage === 19, 'action receipt should expose raw public damage');
assert(burstReceiptA.damage.budgetedDamage === 18, 'action receipt should expose budgeted damage');
assert(burstReceiptA.damage.preventedByBudget === 1, 'action receipt should expose budget prevention');
assert(burstReceiptA.damage.blockedDamage === 3, 'action receipt should expose public block absorption');
assert(burstReceiptA.damage.hpDamage === 15, 'action receipt should expose HP damage');
assert(burstReceiptA.damage.targetSeat === 'B' && burstReceiptA.damage.targetHpAfter === 35, 'action receipt should expose target HP after resolution');
assert(/预算后 18/.test(burstReceiptA.summaryLine) && /破盾 3/.test(burstReceiptA.summaryLine) && /生命伤害 15/.test(burstReceiptA.summaryLine), 'action receipt should give a readable resolved damage line');
assert(!/deck|loadoutSnapshot|rating|elo|reward|opponentHand|opponentDeck|cardInstanceId|sourceCardId/i.test(JSON.stringify(burstReceiptA)), 'action receipt must not leak hidden deck, rating, reward, or card instance ids');
const burstReceiptB = projectStateView(burst.state, 'B').actionReceiptReport;
assert(burstReceiptB && burstReceiptB.viewerSeat === 'B', 'opponent should receive the same public action receipt scoped to their viewer seat');
assert(burstReceiptB.damage.hpDamage === 15 && burstReceiptB.damage.targetSeat === 'B', 'opponent receipt should preserve public resolved damage without hidden payloads');
const unknownCardReceiptState = JSON.parse(JSON.stringify(burst.state));
unknownCardReceiptState.events.forEach(event => {
  if (!event || !event.payload) return;
  if (event.eventType === 'card_played') event.payload.cardId = 'debug_unknown_internal_card_id';
  if (['budget_clamped', 'opening_protection_triggered', 'damage_applied', 'block_gained'].includes(event.eventType)) {
    event.payload.sourceCardId = 'debug_unknown_internal_card_id';
  }
});
const unknownCardReceipt = projectStateView(unknownCardReceiptState, 'A').actionReceiptReport;
assert(unknownCardReceipt.cardName === '术式', 'unknown card ids should fall back to a generic public card label');
assert(!/debug_unknown_internal_card_id|cardId|sourceCardId/i.test(JSON.stringify(unknownCardReceipt)), 'unknown card fallback must not leak internal card ids');

const duplicate = reduceIntent(burst.state, burstIntent);
assert(duplicate.result === 'duplicate', 'same intent should return duplicate');
assert(duplicate.state.seats.B.hp === 35, 'duplicate intent must not deal damage twice');

const conflict = reduceIntent(duplicate.state, {
  ...burstIntent,
  payload: { cardInstanceId: 'A-strike-1', targetSeat: 'B' }
});
assert(conflict.result === 'rejected' && conflict.reason === 'duplicate_action_conflict', 'same intent id with different body should be rejected');

const stale = reduceIntent(conflict.state, {
  intentId: 'intent-stale',
  intentType: 'end_turn',
  matchId: 'pvpm-active-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: 0,
  payload: {}
});
assert(stale.result === 'sync_required' && stale.reason === 'stale_state', 'stale state version should require sync');

const setupEndTurn = reduceIntent(baseState, {
  intentId: 'intent-end-turn-1',
  intentType: 'end_turn',
  matchId: 'pvpm-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: baseState.stateVersion,
  payload: {}
});
const endTurn = reduceIntent(activeState, {
  intentId: 'intent-end-turn-1',
  intentType: 'end_turn',
  matchId: 'pvpm-active-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: activeState.stateVersion,
  payload: {}
});
assert(setupEndTurn.result === 'rejected' && setupEndTurn.reason === 'setup_not_ready', 'setup should reject end_turn before battle starts');
assert(endTurn.result === 'accepted', 'current seat should be able to end turn after setup');
assert(endTurn.state.currentSeat === 'B', 'end turn should switch current seat');
assert(endTurn.state.stateVersion === activeState.stateVersion + 1, 'end turn should advance state version');
endTurn.state.seats.B.hand.unshift({
  instanceId: 'B-overflow-first-action',
  cardId: 'pvp_burst',
  name: '过载开局',
  cost: 0,
  damage: 40,
  block: 0
});
const secondSeatBurst = reduceIntent(endTurn.state, {
  intentId: 'intent-second-seat-burst-budget',
  intentType: 'play_card',
  matchId: 'pvpm-active-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: endTurn.state.stateVersion,
  payload: { cardInstanceId: 'B-overflow-first-action', targetSeat: 'A' }
});
assert(secondSeatBurst.result === 'accepted', 'second seat first burst should be accepted');
assert(secondSeatBurst.state.seats.A.hp === 28, 'second seat first action damage should clamp to 22 actual damage');
assert(secondSeatBurst.events.some(e => e.eventType === 'budget_clamped' && e.payload.preventedDamage === 18), 'second seat first action budget clamp should be public');
const secondActionBudgetState = secondSeatBurst.state;
secondActionBudgetState.seats.B.hand.unshift({
  instanceId: 'B-overflow-second-action',
  cardId: 'pvp_burst',
  name: '过载追击',
  cost: 0,
  damage: 40,
  block: 0
});
const secondActionBurst = reduceIntent(secondActionBudgetState, {
  intentId: 'intent-second-action-budget',
  intentType: 'play_card',
  matchId: 'pvpm-active-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: secondActionBudgetState.stateVersion,
  payload: { cardInstanceId: 'B-overflow-second-action', targetSeat: 'A' }
});
assert(secondActionBurst.result === 'accepted', 'same turn second action should be accepted when energy is available');
assert(secondActionBurst.events.some(e => e.eventType === 'budget_clamped' && e.payload.actualDamage === 28), 'second action damage should clamp to secondAction budget');

const mirroredBudgetSetupState = createInitialLiveState({
  matchId: 'pvpm-mirrored-budget-test',
  seats: [
    { seatId: 'A', userId: 'u-a', displayName: '甲' },
    { seatId: 'B', userId: 'u-b', displayName: '乙' }
  ],
  firstSeat: 'B'
});
assert(mirroredBudgetSetupState.setup.firstSeat === 'B' && mirroredBudgetSetupState.currentSeat === 'B', 'createInitialLiveState should accept authoritative firstSeat B without test-only mutation');
const mirroredBudgetReadyA = reduceIntent(mirroredBudgetSetupState, {
  intentId: 'intent-mirrored-budget-ready-a',
  intentType: 'ready',
  matchId: 'pvpm-mirrored-budget-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: mirroredBudgetSetupState.stateVersion,
  payload: {}
});
const mirroredBudgetReadyB = reduceIntent(mirroredBudgetReadyA.state, {
  intentId: 'intent-mirrored-budget-ready-b',
  intentType: 'ready',
  matchId: 'pvpm-mirrored-budget-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: mirroredBudgetReadyA.state.stateVersion,
  payload: {}
});
assert(mirroredBudgetReadyB.state.currentSeat === 'B', 'mirrored budget setup should allow seat B to act first in simulations');
const mirroredBudgetViewB = projectStateView(mirroredBudgetReadyB.state, 'B');
assert(mirroredBudgetViewB.openingSafeguardReport.damageBudget.currentActionBudget === 18, 'mirrored first seat should receive first-seat budget instead of seat-B budget');
assert(mirroredBudgetViewB.openingSafeguardReport.secondSeatBuffer.seatId === 'A', 'mirrored budget setup should grant second-seat buffer to seat A');
const mirroredFirstBurst = reduceIntent(mirroredBudgetReadyB.state, {
  intentId: 'intent-mirrored-budget-first-burst',
  intentType: 'play_card',
  matchId: 'pvpm-mirrored-budget-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: mirroredBudgetReadyB.state.stateVersion,
  payload: { cardInstanceId: 'B-burst-1', targetSeat: 'A' }
});
assert(mirroredFirstBurst.result === 'accepted', 'mirrored first-seat burst should be accepted');
assert(mirroredFirstBurst.state.seats.A.hp === 35, 'mirrored first-seat damage should clamp to 18 actual damage and consume public second-seat buffer first');
assert(mirroredFirstBurst.events.some(e => e.eventType === 'budget_clamped' && e.payload.actualDamage === 18), 'mirrored first-seat budget clamp should be public');

const wrongSeat = reduceIntent(endTurn.state, {
  intentId: 'intent-wrong-seat-1',
  intentType: 'play_card',
  matchId: 'pvpm-active-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: endTurn.state.stateVersion,
  payload: { cardInstanceId: 'A-strike-1', targetSeat: 'B' }
});
assert(wrongSeat.result === 'rejected' && wrongSeat.reason === 'not_current_turn', 'non-current seat action should be rejected');

const surrender = reduceIntent(endTurn.state, {
  intentId: 'intent-surrender-1',
  intentType: 'surrender',
  matchId: 'pvpm-active-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: endTurn.state.stateVersion,
  payload: {}
});
assert(surrender.result === 'accepted', 'surrender should be accepted from an active participant');
assert(surrender.state.status === 'finished', 'surrender should finish match');
assert(surrender.stateView.status === 'finished', 'surrender state view should expose finished status');
assert(surrender.events.some(e => e.eventType === 'player_surrendered' && e.payload.loserSeat === 'B'), 'surrender should emit public surrendered event');
assert(surrender.events.some(e => e.eventType === 'match_finished' && e.payload.winnerSeat === 'A'), 'surrender should emit public match finish winner');
assertPostMatchReview(surrender.stateView.postMatchReview, {
  result: 'loss',
  winnerSeat: 'A',
  loserSeat: 'B',
  finishReason: 'surrender'
});
assertPostMatchReview(projectStateView(surrender.state, 'A').postMatchReview, {
  result: 'win',
  winnerSeat: 'A',
  loserSeat: 'B',
  finishReason: 'surrender'
});

const lethalSetupState = createInitialLiveState({
  matchId: 'pvpm-lethal-test',
  seats: [
    { seatId: 'A', userId: 'u-a', displayName: '甲' },
    { seatId: 'B', userId: 'u-b', displayName: '乙' }
  ]
});
const lethalReadyA = reduceIntent(lethalSetupState, {
  intentId: 'intent-lethal-ready-a',
  intentType: 'ready',
  matchId: 'pvpm-lethal-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: lethalSetupState.stateVersion,
  payload: {}
});
const lethalReadyB = reduceIntent(lethalReadyA.state, {
  intentId: 'intent-lethal-ready-b',
  intentType: 'ready',
  matchId: 'pvpm-lethal-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: lethalReadyA.state.stateVersion,
  payload: {}
});
const lethalState = lethalReadyB.state;
lethalState.seats.B.hp = 10;
const lethalPreviewViewA = projectStateView(lethalState, 'A');
const lethalBurstPreview = lethalPreviewViewA.actionPreviewReport.playableCards.find(card => card.cardInstanceId === 'A-burst-1');
assert(lethalBurstPreview && lethalBurstPreview.openingProtection.willTrigger === true, 'action preview should predict opening protection before a protected lethal action');
assert(lethalBurstPreview.damageBudget === 18, 'protected lethal preview should still use the current first-action budget');
assert(lethalBurstPreview.blockedDamage === 3, 'protected lethal preview should account for public second-seat shield first');
assert(lethalBurstPreview.openingProtection.minimumHp === 1, 'protected lethal preview should expose opening protection minimum HP');
assert(lethalBurstPreview.openingProtection.preventedDamage === 6, 'protected lethal preview should expose prevented lethal damage');
assert(lethalBurstPreview.targetHpAfter === 1, 'protected lethal preview should expose expected protected target HP');
assert(/护体.*1/.test(lethalBurstPreview.summaryLine), 'protected lethal preview should explain the 1 HP safeguard in readable text');
const lethalIntent = {
  intentId: 'intent-lethal-burst-1',
  intentType: 'play_card',
  matchId: 'pvpm-lethal-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: lethalState.stateVersion,
  payload: { cardInstanceId: 'A-burst-1', targetSeat: 'B' }
};
const lethal = reduceIntent(lethalState, lethalIntent);
assert(lethal.result === 'accepted', 'opening lethal action should still resolve as an accepted action');
assert(lethal.state.status === 'active', 'opening protection should prevent finishing before the defender has a turn');
assert(lethal.state.seats.B.hp === 1, 'opening protection should leave the defender at 1 hp');
const openingProtectionEvent = lethal.events.find(e => e.eventType === 'opening_protection_triggered');
assert(openingProtectionEvent && openingProtectionEvent.payload.protectedSeat === 'B', 'opening protection should emit a public event');
assert(openingProtectionEvent.payload.minimumHp === 1, 'opening protection event should expose minimum hp');
assert(openingProtectionEvent.payload.preventedDamage === 6, 'opening protection event should expose prevented lethal damage after public second-seat buffer');
assert(openingProtectionEvent.payload.wouldHaveHp === 0, 'opening protection event should expose would-have hp');
assert(!lethal.events.some(e => e.eventType === 'match_finished'), 'opening protection should not emit match_finished');
const lethalReceiptB = projectStateView(lethal.state, 'B').actionReceiptReport;
assert(lethalReceiptB && lethalReceiptB.actionType === 'play_card', 'opening protected lethal should expose public card action receipt');
assert(lethalReceiptB.openingProtection.triggered === true, 'protected lethal receipt should explain opening protection trigger');
assert(lethalReceiptB.openingProtection.protectedSeat === 'B', 'protected lethal receipt should expose protected seat');
assert(lethalReceiptB.openingProtection.preventedDamage === 6, 'protected lethal receipt should expose prevented damage');
assert(lethalReceiptB.damage.targetHpAfter === 1, 'protected lethal receipt should expose protected target HP');
assert(/护体/.test(lethalReceiptB.summaryLine), 'protected lethal receipt should explain the 1 HP safeguard in readable text');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(lethalReceiptB)), 'protected lethal receipt must remain public and no-impact');
const secondOpeningStrike = reduceIntent(lethal.state, {
  intentId: 'intent-lethal-strike-2',
  intentType: 'play_card',
  matchId: 'pvpm-lethal-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: lethal.state.stateVersion,
  payload: { cardInstanceId: 'A-strike-1', targetSeat: 'B' }
});
assert(secondOpeningStrike.result === 'accepted', 'same-turn follow-up opening strike should resolve');
assert(secondOpeningStrike.state.status === 'active' && secondOpeningStrike.state.seats.B.hp === 1, 'same-turn follow-up cannot bypass opening protection');
assert(secondOpeningStrike.events.some(e => e.eventType === 'opening_protection_triggered' && e.payload.preventedDamage > 0), 'same-turn follow-up should emit another opening protection event');
const lethalDuplicate = reduceIntent(lethal.state, lethalIntent);
assert(lethalDuplicate.result === 'duplicate', 'duplicate protected lethal intent should remain idempotent after protection');
const protectedEndTurn = reduceIntent(lethal.state, {
  intentId: 'intent-protected-end-turn',
  intentType: 'end_turn',
  matchId: 'pvpm-lethal-test',
  seatId: 'A',
  ruleVersion: RULE_VERSION,
  stateVersion: lethal.state.stateVersion,
  payload: {}
});
assert(protectedEndTurn.result === 'accepted' && protectedEndTurn.state.currentSeat === 'B', 'protected opening target should receive the next turn');
assert(protectedEndTurn.state.seats.B.block === 8, 'opening protection should grant first-turn counterplay block');
assert(protectedEndTurn.events.some(e => e.eventType === 'opening_counterplay_granted' && e.payload.seatId === 'B' && e.payload.block === 8), 'protected seat first turn should expose public counterplay event');
const protectedEndReceiptB = projectStateView(protectedEndTurn.state, 'B').actionReceiptReport;
assert(protectedEndReceiptB && protectedEndReceiptB.actionType === 'end_turn', 'state view should expose public end-turn action receipt');
assert(protectedEndReceiptB.actingSeat === 'A' && protectedEndReceiptB.nextSeat === 'B', 'end-turn receipt should expose action handoff');
assert(protectedEndReceiptB.draw.count === 3 && protectedEndReceiptB.draw.seatId === 'B', 'end-turn receipt should expose only public draw count');
assert(protectedEndReceiptB.counterplay.granted === true && protectedEndReceiptB.counterplay.seatId === 'B' && protectedEndReceiptB.counterplay.block === 8, 'end-turn receipt should expose public counterplay grant');
assert(/行动权交给 B/.test(protectedEndReceiptB.summaryLine) && /抽 3/.test(protectedEndReceiptB.summaryLine) && /反打缓冲 \+8/.test(protectedEndReceiptB.summaryLine), 'end-turn receipt should give a readable handoff and counterplay line');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(protectedEndReceiptB)), 'end-turn receipt must remain public and no-impact');
const protectedMomentumB = projectStateView(protectedEndTurn.state, 'B').duelMomentumReport;
assert(protectedMomentumB.pressureState === 'reversal_window', 'protected defender should see an explicit reversal window');
assert(protectedMomentumB.isViewerTurn === true, 'protected defender should see the counterplay window on their own turn');
assert(protectedMomentumB.safeguards.includes('counterplay_granted'), 'protected defender duel momentum should expose granted counterplay safeguard');
assert(/你的反打窗口/.test(protectedMomentumB.counterplayLine), 'protected defender duel momentum should say the counterplay window is theirs');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(protectedMomentumB)), 'protected defender duel momentum must remain public and no-impact');
protectedEndTurn.state.seats.A.hp = 10;
const normalLethal = reduceIntent(protectedEndTurn.state, {
  intentId: 'intent-normal-lethal',
  intentType: 'play_card',
  matchId: 'pvpm-lethal-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: protectedEndTurn.state.stateVersion,
  payload: { cardInstanceId: protectedEndTurn.state.seats.B.hand[0].instanceId, targetSeat: 'A' }
});
assert(normalLethal.result === 'accepted' && normalLethal.state.status === 'finished', 'normal lethal should still finish after the target already had a turn');
const finishedMomentumA = projectStateView(normalLethal.state, 'A').duelMomentumReport;
assert(finishedMomentumA.pressureState === 'finished', 'finished duel momentum should expose closed finished state');
assert(/对局已结束/.test(finishedMomentumA.summaryLine), 'finished duel momentum should explain the match is over');
assert(/赛后复盘/.test(finishedMomentumA.counterplayLine), 'finished duel momentum should route players to post-match review');
assert(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(finishedMomentumA)), 'finished duel momentum must remain public and no-impact');
assertPostMatchReview(normalLethal.stateView.postMatchReview, {
  result: 'win',
  winnerSeat: 'B',
  loserSeat: 'A',
  finishReason: 'lethal'
});
assert(normalLethal.stateView.postMatchReview.loadoutRecommendation.recommendedPresetId === 'sword', 'normal lethal winner should receive pressure loadout recommendation');
const normalLethalLoserReview = projectStateView(normalLethal.state, 'A').postMatchReview;
assertPostMatchReview(normalLethalLoserReview, {
  result: 'loss',
  winnerSeat: 'B',
  loserSeat: 'A',
  finishReason: 'lethal'
});
assert(normalLethalLoserReview.loadoutRecommendation.recommendedPresetId === 'shield', 'normal lethal loser should receive defensive loadout recommendation');
assert(normalLethalLoserReview.loadoutRecommendation.evidenceRefs.some(event => event.eventType === 'damage_applied'), 'normal lethal loser loadout recommendation should cite public damage evidence');
const round14DrawState = createReadyLiveState('pvpm-round14-draw');
round14DrawState.roundIndex = 14;
round14DrawState.turnIndex = 28;
round14DrawState.currentSeat = 'B';
round14DrawState.seats.A.hp = 30;
round14DrawState.seats.B.hp = 30;
round14DrawState.seats.A.block = 0;
round14DrawState.seats.B.block = 0;
const round14Draw = reduceIntent(round14DrawState, {
  intentId: 'intent-round14-draw-end',
  intentType: 'end_turn',
  matchId: 'pvpm-round14-draw',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: round14DrawState.stateVersion,
  payload: {}
});
assert(round14Draw.result === 'accepted', 'round14 draw end-turn should be accepted');
assert(round14Draw.state.status === 'finished', 'round14 draw should finish the match after the 14th complete round');
const round14DrawFinish = round14Draw.events.find(event => event.eventType === 'match_finished');
assert(round14DrawFinish && round14DrawFinish.payload.finishReason === 'round14_draw', 'round14 equal-score finish should emit round14_draw');
assert(round14DrawFinish.payload.winnerSeat === 'draw' && round14DrawFinish.payload.loserSeat === '', 'round14 draw should not invent a loser');
assert(round14DrawFinish.payload.scoreA === 0 && round14DrawFinish.payload.scoreB === 0 && round14DrawFinish.payload.scoreDelta === 0, 'round14 draw should expose public score components');
assertDrawPostMatchReview(round14Draw.stateView.postMatchReview);

const round14ScoreState = createReadyLiveState('pvpm-round14-score');
round14ScoreState.roundIndex = 14;
round14ScoreState.turnIndex = 28;
round14ScoreState.currentSeat = 'B';
round14ScoreState.seats.A.hp = 45;
round14ScoreState.seats.B.hp = 35;
const round14Score = reduceIntent(round14ScoreState, {
  intentId: 'intent-round14-score-end',
  intentType: 'end_turn',
  matchId: 'pvpm-round14-score',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: round14ScoreState.stateVersion,
  payload: {}
});
assert(round14Score.result === 'accepted', 'round14 score end-turn should be accepted');
assert(round14Score.state.status === 'finished', 'round14 score should finish the match after the 14th complete round');
const round14ScoreFinish = round14Score.events.find(event => event.eventType === 'match_finished');
assert(round14ScoreFinish && round14ScoreFinish.payload.finishReason === 'round14_score', 'round14 score finish should emit round14_score');
assert(round14ScoreFinish.payload.winnerSeat === 'A' && round14ScoreFinish.payload.loserSeat === 'B', 'round14 score should award the higher public score');
assert(round14ScoreFinish.payload.scoreA - round14ScoreFinish.payload.scoreB >= 5, 'round14 score should expose a public score gap at least five');
assertPostMatchReview(projectStateView(round14Score.state, 'A').postMatchReview, {
  result: 'win',
  winnerSeat: 'A',
  loserSeat: 'B',
  finishReason: 'round14_score'
});
const afterFinished = reduceIntent(normalLethal.state, {
  intentId: 'intent-after-finished',
  intentType: 'end_turn',
  matchId: 'pvpm-lethal-test',
  seatId: 'B',
  ruleVersion: RULE_VERSION,
  stateVersion: normalLethal.state.stateVersion,
  payload: {}
});
assert(afterFinished.result === 'rejected' && afterFinished.reason === 'match_not_active', 'new intent after match finish should be rejected');

console.log('sanity_pvp_live_engine_checks passed');
