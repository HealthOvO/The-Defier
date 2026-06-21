const assert = require('assert');

const {
  runBalanceSimulationFullGate,
  validateSimulationReport
} = require('../server/pvp-live/balance-simulation');

const fullGate = runBalanceSimulationFullGate({
  seed: 'pvp-live-v1-s2c-full-gate-balance',
  openingScripts: 10000
});
const validation = validateSimulationReport(fullGate, { mode: 'full' });

assert.strictEqual(fullGate.samplePolicy.mode, 'full', 'S2-C full gate should run in full mode');
assert.strictEqual(fullGate.samplePolicy.matchesPerOrderedPair, 500, 'S2-C full gate should keep 500 matches per ordered pair');
assert.strictEqual(fullGate.totalMatches, 32000, 'S2-C full gate should keep the 32,000-match matrix');
assert.strictEqual(validation.pass, true, `S2-C full gate should pass full validation: ${JSON.stringify(validation.failures)}`);
assert.strictEqual(fullGate.safety.secondSeatDeathBeforeActionCount, 0, 'S2-C full gate should still show zero second-seat deaths before action');
assert.strictEqual(fullGate.safety.secondSeatDeadActionLineCount, 0, 'S2-C full gate should still show zero second-seat dead action lines');
assert.strictEqual(fullGate.burstCounterplay.midBurstWithoutResponseWindowCount, 0, 'S2-C full gate should still show zero unreadable mid-burst samples');
const fullEntertainmentAudit = fullGate.entertainmentAudit || {};
const fullPostGameCoverage = fullEntertainmentAudit.postGameActionCoverage || {};
const fullPostGameRows = Array.isArray(fullPostGameCoverage.commonNextActions)
  ? fullPostGameCoverage.commonNextActions
  : [];
const fullPostGameActionBridge = fullEntertainmentAudit.postGameActionBridge || {};
assert.strictEqual(fullEntertainmentAudit.reportVersion, 'pvp-live-entertainment-audit-v1', 'S2-C full gate should include the live PVP entertainment audit report');
assert.ok(fullEntertainmentAudit.stompRate <= 0.15, 'S2-C full gate entertainment audit stompRate should stay below the live PVP ceiling');
assert.ok(fullEntertainmentAudit.closeGameRate >= 0.35, 'S2-C full gate entertainment audit should preserve enough late-game suspense');
assert.ok(fullEntertainmentAudit.leadChangeOrThreatShiftRate >= 0.30, 'S2-C full gate entertainment audit should preserve enough lead or threat shifts');
assert.strictEqual(fullPostGameCoverage.coverageRate, 1, 'S2-C full gate entertainment audit should cover observed finish reasons with post-game next actions');
assert.ok(fullPostGameRows.length >= 1, 'S2-C full gate entertainment audit should include observed finish reason next-action rows');
assert.strictEqual(fullPostGameActionBridge.reportVersion, 'pvp-live-post-game-action-bridge-v1', 'S2-C full gate entertainment audit should include the post-game audit-to-UI action bridge');
assert.ok(fullPostGameActionBridge.uiActionIdsByAuditAction.key_turn_replay.includes('review_key_turns'), 'S2-C full gate action bridge should map key_turn_replay to the real review_key_turns UI button');
assert.ok(!fullPostGameActionBridge.coveredAuditActions.includes('report_issue'), 'S2-C full gate action bridge must not claim an unimplemented report_issue UI handoff');
assert.ok(fullPostGameRows.flatMap(row => row.actions).every(actionId => actionId !== 'report_issue'), 'S2-C full gate post-game action coverage should only contain implemented public review UI actions');
assert.ok(
  Object.values(fullGate.archetypeWinRates).every(rate => rate >= 0.45 && rate <= 0.55),
  `S2-C archetype win rates should all stay within 45%-55%: ${JSON.stringify(fullGate.archetypeWinRates)}`
);
assert.ok(
  Object.values(fullGate.archetypeSpread).every(row => !row.dominantRisk && !row.falseArchetypeRisk),
  `S2-C archetype spread should not contain dominant or false archetype risks: ${JSON.stringify(fullGate.archetypeSpread)}`
);
assert.ok(
  Object.values(fullGate.pairWinRates).every(row => row.firstSeatWinRate >= 0.45 && row.firstSeatWinRate <= 0.55),
  'S2-C full gate pair first-seat rates should stay within 45%-55%'
);

console.log('sanity_pvp_live_full_gate_balance_checks passed');
