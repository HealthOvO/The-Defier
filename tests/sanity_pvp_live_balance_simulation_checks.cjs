const assert = require('assert');

const {
  RULE_VERSION,
  RULES
} = require('../server/pvp-live/engine/rules');
const {
  CONTENT_PACK_VERSION,
  BASELINE_LOADOUTS,
  BASELINE_BOT_POLICIES,
  validateContentPack,
  getLoadoutExplorationProfile,
  buildLoadoutExplorationReport
} = require('../server/pvp-live/content/pvp-live-v1-content');
const {
  runBalanceSimulationQuickGate,
  runOneSimulatedMatch,
  scoreFirstSeatOutcome,
  scoreOutcomeWin,
  validateSimulationReport
} = require('../server/pvp-live/balance-simulation');

assert.strictEqual(CONTENT_PACK_VERSION, 'pvp-live-v1-content-pack');
assert.strictEqual(BASELINE_LOADOUTS.length, 8, 'V10-S2 content pack should expose eight baseline loadouts');
assert.strictEqual(BASELINE_BOT_POLICIES.length, 8, 'V10-S2 content pack should expose eight baseline bot policies');
assert.deepStrictEqual(
  BASELINE_LOADOUTS.map(loadout => loadout.id).sort(),
  [
    'aggro_pressure',
    'draw_midrange',
    'healing_attrition',
    'low_hp_counter',
    'shield_counter',
    'soft_control',
    'tempo_mark',
    'vulnerable_combo'
  ].sort(),
  'V10-S2 baseline loadout ids should match the frozen content-pack archetype list'
);

const contentValidation = validateContentPack({ ruleVersion: RULE_VERSION });
assert.strictEqual(contentValidation.pass, true, `content pack validation should pass: ${JSON.stringify(contentValidation.failures)}`);
assert.strictEqual(contentValidation.ruleVersion, RULE_VERSION, 'content pack validation should pin current live PVP rule version');
assert.strictEqual(contentValidation.loadoutCount, 8, 'content pack validation should cover all eight baseline loadouts');
assert.strictEqual(contentValidation.policyCount, 8, 'content pack validation should cover all eight baseline bot policies');
assert.strictEqual(contentValidation.zeroCostCardCount, 0, 'content pack should not admit 0-cost cards into ranked V10-S2 baseline loadouts');
assert.strictEqual(contentValidation.maxSingleCardCopies, 2, 'content pack should cap every baseline card at two copies');
assert.ok(contentValidation.minOneCostCards >= 10, 'every baseline loadout should retain at least ten 1-cost cards');
assert.ok(contentValidation.minInteractionCards >= 8, 'every baseline loadout should contain at least eight non-pure-damage interaction cards');
assert.ok(contentValidation.maxDirectDamageCards <= 10, 'baseline loadouts should not over-index on pure damage');
assert.ok(contentValidation.maxMainDeckOverlapRate <= 0.6, 'baseline archetypes should not collapse into the same main-deck shell');
assert.ok(
  Object.values(contentValidation.roleCoverageByLoadout).every(report => Object.values(report).every(Boolean)),
  'each baseline loadout should cover opening action, defense/recovery, public setup, finisher, and swap slots'
);
assert.strictEqual(contentValidation.explorationProfileCount, 8, 'each baseline loadout should expose a public exploration profile');
BASELINE_LOADOUTS.forEach(loadout => {
  const profile = getLoadoutExplorationProfile(loadout.id);
  assert.strictEqual(profile.id, loadout.id, `exploration profile should match loadout id: ${loadout.id}`);
  assert.ok(profile.funHook && profile.skillTest && profile.publicWeakness, `exploration profile should expose fun hook, skill test, and public weakness: ${loadout.id}`);
  assert.ok(profile.swapSlots.length >= 2 && profile.swapSlots.length <= 4, `exploration profile should expose 2-4 swap slots: ${loadout.id}`);
  assert.ok(profile.practiceTopic && profile.practiceTopic.id && profile.practiceTopic.detail, `exploration profile should expose practice topic: ${loadout.id}`);
  assert.ok(/不改变生命、伤害、抽牌、灵力、起手或匹配/.test(profile.masteryBoundary), `exploration profile should lock non-power mastery boundary: ${loadout.id}`);
  assert.ok(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo/i.test(JSON.stringify(profile)), `exploration profile must not leak hidden cards or hidden rating: ${loadout.id}`);
});
const explorationReport = buildLoadoutExplorationReport();
assert.strictEqual(explorationReport.reportVersion, 'pvp-live-loadout-exploration-v1', 'exploration report should expose report version');
assert.strictEqual(explorationReport.sourceVisibility, 'public_content', 'exploration report should be public content only');
assert.strictEqual(explorationReport.usesHiddenInformation, false, 'exploration report must not use hidden information');
assert.strictEqual(explorationReport.rankedImpact, 'none', 'exploration report should not write ranked result');
assert.ok(explorationReport.profiles.length >= 3, 'exploration report should expose multiple replay goals');
assert.ok(!/hand|deck|cardId|instanceId|loadoutSnapshot|rating|elo/i.test(JSON.stringify(explorationReport)), 'exploration report must not leak hidden cards or hidden rating');

const quickGate = runBalanceSimulationQuickGate({
  seed: 'pvp-live-v1-s2-quick-gate',
  matchesPerOrderedPair: 157,
  openingScripts: 10000
});
const gateValidation = validateSimulationReport(quickGate, { mode: 'quick' });

assert.strictEqual(quickGate.ruleVersion, RULE_VERSION, 'V10-S2 quick gate should run on the current live PVP rule version');
assert.strictEqual(quickGate.contentPackVersion, CONTENT_PACK_VERSION, 'V10-S2 quick gate should identify the content pack version');
assert.strictEqual(quickGate.totalMatches, 10048, 'quick gate should run at least 10,000 simulated matches across the ordered baseline matrix');
assert.strictEqual(quickGate.totalOpeningScripts, 10000, 'quick gate should run the required 10,000 opening pressure probes');
assert.strictEqual(quickGate.openingProbeReport.totalProbes, 10000, 'quick gate should execute opening pressure probes instead of echoing the requested count');
assert.strictEqual(quickGate.openingProbeReport.pass, true, `opening pressure probes should pass: ${JSON.stringify(quickGate.openingProbeReport.failures)}`);
assert.ok(Object.keys(quickGate.openingProbeReport.categoryCounts).length >= 8, 'opening pressure probes should cover the eight frozen opening categories');
assert.ok(Object.values(quickGate.openingProbeReport.categoryCounts).every(count => count >= 1000), 'opening pressure probes should materially sample each opening category');
assert.ok(!Object.prototype.hasOwnProperty.call(RULES.firstActionDamageBudget, 'A') && !Object.prototype.hasOwnProperty.call(RULES.firstActionDamageBudget, 'B'), 'balance gate should not allow seat-A or seat-B damage budget aliases');
assert.strictEqual(gateValidation.pass, true, `V10-S2 quick gate should pass: ${JSON.stringify(gateValidation.failures)}`);
assert.ok(quickGate.firstSeatWinRate >= 0.47 && quickGate.firstSeatWinRate <= 0.53, 'quick gate first-seat win rate should stay within 47%-53%');
assert.strictEqual(quickGate.safety.secondSeatDeathBeforeActionCount, 0, 'quick gate should show zero second-seat deaths before first real action');
assert.strictEqual(quickGate.safety.secondSeatDeadActionLineCount, 0, 'quick gate should show zero second-seat dead action lines');
assert.strictEqual(quickGate.burstCounterplay.midBurstWithoutResponseWindowCount, 0, 'quick gate should show zero unreadable mid-burst samples');
assert.strictEqual(quickGate.burstCounterplay.lethalWithoutFullResponseWindowCount, 0, 'quick gate should show zero lethal bursts without full response windows');
assert.strictEqual(quickGate.experienceFairness.nonGameLossCount, 0, 'quick gate should show zero non-game losses');
assert.strictEqual(quickGate.experienceFairness.reportVersion, 'pvp-live-experience-fairness-audit-v1', 'quick gate should expose a formal experience fairness audit report');
assert.strictEqual(quickGate.experienceFairness.sourceVisibility, 'simulation_public_metrics', 'experience fairness audit should use public simulation metrics');
assert.strictEqual(quickGate.experienceFairness.usesHiddenInformation, false, 'experience fairness audit must not use hidden hands or deck order');
assert.strictEqual(quickGate.experienceFairness.rankedImpact, 'none', 'experience fairness audit must not write ranked state');
assert.strictEqual(quickGate.experienceFairness.unreadableBurstCount, 0, 'quick gate should show zero unreadable burst losses');
assert.strictEqual(quickGate.experienceFairness.lossExplanationCoverage, 1, 'quick gate should preserve public loss explanation coverage');
assert.strictEqual(quickGate.experienceFairness.controlLockWindowCount, 0, 'quick gate should show zero control-lock windows');
assert.strictEqual(quickGate.experienceFairness.rejectFrictionRate, 0, 'quick gate should show zero unclear reject friction in deterministic bot simulation');
assert.ok(
  [
    'burst_without_setup',
    'no_meaningful_choice',
    'control_lock',
    'budget_confusing',
    'dragging_loop',
    'network_unfair',
    'reward_pressure',
    'social_discomfort'
  ].every(tag => quickGate.experienceFairness.negativeExperienceTagCatalog.includes(tag)),
  'experience fairness audit should preserve the documented negative experience tag catalog'
);
assert.strictEqual(quickGate.botPolicyCoverage.uncovered.length, 0, 'quick gate should cover every declared bot policy priority token');
assert.ok(quickGate.experienceFairness.seatAgencyP05.firstSeat >= 2, 'first seat should have at least two real decision windows at P05');
assert.ok(quickGate.experienceFairness.seatAgencyP05.secondSeat >= 2, 'second seat should have at least two real decision windows at P05');
const entertainmentAudit = quickGate.entertainmentAudit || {};
const postGameActionCoverage = entertainmentAudit.postGameActionCoverage || {};
const postGameActionRows = Array.isArray(postGameActionCoverage.commonNextActions)
  ? postGameActionCoverage.commonNextActions
  : [];
const deckEditFollowThroughRate = entertainmentAudit.deckEditFollowThroughRate || {};
const deckEditActions = Array.isArray(deckEditFollowThroughRate.actions) ? deckEditFollowThroughRate.actions : [];
const rematchIntentRate = entertainmentAudit.rematchIntentRate || {};
const rematchActions = Array.isArray(rematchIntentRate.actions) ? rematchIntentRate.actions : [];
const postGameActionBridge = entertainmentAudit.postGameActionBridge || {};
const bridgedAuditActions = new Set(Array.isArray(postGameActionBridge.coveredAuditActions) ? postGameActionBridge.coveredAuditActions : []);
assert.strictEqual(entertainmentAudit.reportVersion, 'pvp-live-entertainment-audit-v1', 'quick gate should expose a live PVP entertainment audit report');
assert.strictEqual(entertainmentAudit.sourceVisibility, 'simulation_public_metrics', 'entertainment audit should be derived from public simulation metrics');
assert.strictEqual(entertainmentAudit.usesHiddenInformation, false, 'entertainment audit must not require hidden hands or deck order');
assert.strictEqual(entertainmentAudit.rankedImpact, 'none', 'entertainment audit must not write ranked state or rewards');
assert.strictEqual(entertainmentAudit.sampleCount, quickGate.totalMatches, 'entertainment audit should cover the full quick-gate sample set');
assert.ok(entertainmentAudit.stompRate <= 0.15, 'entertainment audit stompRate should stay below the live PVP ceiling');
assert.ok(entertainmentAudit.closeGameRate >= 0.35, 'entertainment audit closeGameRate should prove enough late-game suspense');
assert.ok(entertainmentAudit.leadChangeOrThreatShiftRate >= 0.30, 'entertainment audit should prove mid-game lead or threat shifts');
assert.strictEqual(postGameActionCoverage.coverageRate, 1, 'entertainment audit should cover every observed common finish reason with next actions');
assert.ok(postGameActionRows.length >= 1, 'entertainment audit should include at least one observed finish reason next-action row');
assert.ok(
  postGameActionRows.every(row => row.reason && row.covered === true && row.actions.length >= 1),
  'entertainment audit post-game coverage rows should be actionable per finish reason'
);
assert.strictEqual(postGameActionBridge.reportVersion, 'pvp-live-post-game-action-bridge-v1', 'entertainment audit should expose a post-game audit-to-UI action bridge');
assert.strictEqual(postGameActionBridge.sourceVisibility, 'public_review_action_contract', 'post-game action bridge should be derived from public review UI contracts');
assert.strictEqual(postGameActionBridge.usesHiddenInformation, false, 'post-game action bridge must not require hidden hands or deck order');
assert.strictEqual(postGameActionBridge.rankedImpact, 'none', 'post-game action bridge must not write ranked state or rewards');
assert.ok(postGameActionBridge.uiActionIdsByAuditAction.key_turn_replay.includes('review_key_turns'), 'post-game action bridge should map key_turn_replay to the real review_key_turns UI button');
assert.ok(postGameActionBridge.uiActionIdsByAuditAction.apply_loadout_recommendation.includes('adjust_loadout'), 'post-game action bridge should map apply_loadout_recommendation to the real adjust_loadout UI button');
assert.ok(postGameActionBridge.uiActionIdsByAuditAction.practice_topic.includes('practice'), 'post-game action bridge should map practice_topic to the real practice UI button');
assert.ok(
  postGameActionRows.flatMap(row => row.actions).every(actionId => bridgedAuditActions.has(actionId)),
  'every entertainment audit post-game action should be covered by the audit-to-UI action bridge'
);
assert.ok(
  postGameActionRows.flatMap(row => row.actions).includes('report_issue'),
  'post-game action coverage should include the implemented dispute report handoff'
);
assert.ok(
  postGameActionRows.flatMap(row => row.actions).includes('avoid_opponent'),
  'post-game action coverage should include the implemented avoid-opponent handoff'
);
assert.ok(
  bridgedAuditActions.has('report_issue')
    && postGameActionBridge.uiActionIdsByAuditAction.report_issue.includes('report_issue'),
  'post-game action bridge should map report_issue to the real dispute report UI button'
);
assert.ok(
  bridgedAuditActions.has('avoid_opponent')
    && postGameActionBridge.uiActionIdsByAuditAction.avoid_opponent.includes('avoid_opponent'),
  'post-game action bridge should map avoid_opponent to the real avoid-opponent UI button'
);
assert.ok(
  deckEditFollowThroughRate.trackable === true
    && deckEditActions.includes('apply_loadout_recommendation')
    && deckEditActions.includes('practice_topic'),
  'entertainment audit should prove deck-edit follow-through is instrumented through recommendation and practice actions'
);
assert.ok(
  rematchIntentRate.trackable === true
    && /observation_only/.test(rematchIntentRate.policy)
    && rematchActions.includes('queue_again'),
  'entertainment audit should track rematch intent as observation-only without manipulating matchmaking'
);
assert.ok(quickGate.safety.damagePreventedByBudgetCount > 0, 'quick gate should include real budget prevention samples');
assert.ok(quickGate.evidenceSeeds.longestReplaySeed, 'quick gate should expose a longest replay seed');
assert.ok(quickGate.evidenceSeeds.largestBurstReplaySeed, 'quick gate should expose a largest burst replay seed');

const aggroLoadout = BASELINE_LOADOUTS.find(loadout => loadout.id === 'aggro_pressure');
assert.ok(aggroLoadout, 'resource_draw regression seed should use the frozen aggro baseline loadout');
const resourceDrawSample = runOneSimulatedMatch({
  loadoutA: aggroLoadout,
  loadoutB: aggroLoadout,
  firstSeat: 'A',
  seed: 'resource-draw-pin-aggro_pressure-aggro_pressure-A-0'
});
assert.strictEqual(resourceDrawSample.finishReason, 'resource_draw', 'resource_draw regression seed should finish by shared resource exhaustion');
assert.strictEqual(resourceDrawSample.result, 'draw', 'resource_draw should remain a draw instead of becoming a first-seat win');
assert.strictEqual(resourceDrawSample.winnerSeat, 'draw', 'resource_draw should expose draw winner seat for report consumers');
assert.strictEqual(scoreFirstSeatOutcome(resourceDrawSample), 0.5, 'resource_draw should count as 0.5 in first-seat win-rate scoring');
assert.strictEqual(scoreOutcomeWin(resourceDrawSample, 'aggro_pressure'), 0.5, 'resource_draw should count as 0.5 in archetype win-rate scoring');

assert.strictEqual(RULES.cards.wardingHerb.block, 4, 'wardingHerb should trade lower block for public healing instead of outclassing pvp_guard');
assert.ok(
  RULES.cards.wardingHerb.block + RULES.cards.wardingHerb.heal <= RULES.cards.pvp_guard.block,
  'wardingHerb raw block plus public heal should not exceed pvp_guard while simulation has no guard-stance reduction model'
);
const healingAttritionLoadout = BASELINE_LOADOUTS.find(loadout => loadout.id === 'healing_attrition');
assert.ok(healingAttritionLoadout, 'public heal regression should use the frozen healing_attrition baseline loadout');
const shieldCounterLoadout = BASELINE_LOADOUTS.find(loadout => loadout.id === 'shield_counter');
assert.ok(shieldCounterLoadout, 'public heal guard-priority regression should use the frozen shield_counter baseline loadout');
const fullHpGuardPrioritySample = runOneSimulatedMatch({
  loadoutA: shieldCounterLoadout,
  loadoutB: aggroLoadout,
  firstSeat: 'A',
  seed: 'public-heal-simulation-pin-full-hp-guard-priority-A-0',
  forcedOpenings: {
    A: ['pvp_guard', 'wardingHerb', 'innerPeace'],
    B: ['pvp_strike', 'quickSlash', 'doubleStrike']
  }
});
assert.deepStrictEqual(
  fullHpGuardPrioritySample.cardsPlayed[0],
  { seatId: 'A', loadoutId: 'shield_counter', cardId: 'pvp_guard', recoveredHp: 0 },
  'balance simulation should prefer pure guard over heal cards at full HP'
);
const publicHealSimulationSample = runOneSimulatedMatch({
  loadoutA: aggroLoadout,
  loadoutB: healingAttritionLoadout,
  firstSeat: 'A',
  seed: 'public-heal-simulation-pin-aggro_pressure-healing_attrition-A-0',
  forcedOpenings: {
    A: ['pvp_burst', 'pvp_strike', 'pvp_strike'],
    B: ['innerPeace', 'mendThread', 'wardingHerb']
  }
});
const recoveredHpPlays = publicHealSimulationSample.cardsPlayed
  .filter(play => play.seatId === 'B' && play.recoveredHp > 0);
assert.ok(recoveredHpPlays.length >= 2, 'balance simulation should apply public heal cards after real HP loss');
assert.ok(
  recoveredHpPlays.some(play => play.cardId === 'innerPeace' && play.recoveredHp === 3),
  'balance simulation should carry innerPeace heal from card rules into simulated resolution'
);
assert.ok(
  recoveredHpPlays.some(play => play.cardId === 'mendThread' && play.recoveredHp === 3),
  'balance simulation should carry mendThread heal from card rules into simulated resolution'
);
assert.ok(
  publicHealSimulationSample.longGameStats.B.preventedOrRecoveredDamage >= recoveredHpPlays.reduce((sum, play) => sum + play.recoveredHp, 0),
  'balance simulation should count recovered HP in long-game defense scoring'
);
const publicHealResponseSample = runOneSimulatedMatch({
  loadoutA: healingAttritionLoadout,
  loadoutB: aggroLoadout,
  firstSeat: 'B',
  seed: 'public-heal-simulation-pin-heal-response-window-B-0',
  forcedOpenings: {
    A: ['innerPeace', 'mendThread', 'wardingHerb'],
    B: ['pvp_burst', 'pvp_strike', 'pvp_strike']
  }
});
const recoveredByA = publicHealResponseSample.cardsPlayed
  .filter(play => play.seatId === 'A')
  .reduce((sum, play) => sum + play.recoveredHp, 0);
assert.ok(recoveredByA > 0, 'balance simulation should let the pressured second seat recover HP with public heal cards');
assert.ok(
  publicHealResponseSample.longGameStats.A.preventedOrRecoveredDamage >= recoveredByA,
  'balance simulation should count second-seat recovered HP in long-game defense scoring'
);
assert.strictEqual((RULES.softControlWeakness || {}).reduction, 2, 'balance simulation should read the public soft-control weakness amount from rules');
const softControlWeakSample = runOneSimulatedMatch({
  loadoutA: shieldCounterLoadout,
  loadoutB: aggroLoadout,
  firstSeat: 'A',
  seed: 'public-weak-focus-simulation-pin-shield_counter-aggro_pressure-A-0',
  forcedOpenings: {
    A: ['stormWard', 'stormWard', 'stormWard'],
    B: ['pvp_burst', 'pvp_burst', 'pvp_burst']
  }
});
const weakPreventedPlays = softControlWeakSample.cardsPlayed
  .filter(play => play.preventedByWeak > 0);
assert.ok(
  weakPreventedPlays.some(play => play.seatId === 'B' && play.cardId === 'pvp_burst' && play.preventedByWeak === 2),
  'balance simulation should apply public weak_focus to the next outgoing attack instead of ignoring soft control'
);
assert.ok(
  softControlWeakSample.longGameStats.A.preventedOrRecoveredDamage >= RULES.cards.stormWard.block + RULES.softControlWeakness.reduction,
  'balance simulation should count weak_focus prevented damage in defender long-game scoring'
);

console.log('sanity_pvp_live_balance_simulation_checks passed');
