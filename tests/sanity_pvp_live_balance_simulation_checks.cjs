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
assert.strictEqual(quickGate.experienceFairness.unreadableBurstCount, 0, 'quick gate should show zero unreadable burst losses');
assert.strictEqual(quickGate.experienceFairness.lossExplanationCoverage, 1, 'quick gate should preserve public loss explanation coverage');
assert.strictEqual(quickGate.botPolicyCoverage.uncovered.length, 0, 'quick gate should cover every declared bot policy priority token');
assert.ok(quickGate.experienceFairness.seatAgencyP05.firstSeat >= 2, 'first seat should have at least two real decision windows at P05');
assert.ok(quickGate.experienceFairness.seatAgencyP05.secondSeat >= 2, 'second seat should have at least two real decision windows at P05');
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

console.log('sanity_pvp_live_balance_simulation_checks passed');
