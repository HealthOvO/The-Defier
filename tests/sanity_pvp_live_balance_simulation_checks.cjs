const assert = require('assert');

const {
  RULE_VERSION,
  RULES
} = require('../server/pvp-live/engine/rules');
const {
  CONTENT_PACK_VERSION,
  BASELINE_LOADOUTS,
  BASELINE_BOT_POLICIES,
  validateContentPack
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

console.log('sanity_pvp_live_balance_simulation_checks passed');
