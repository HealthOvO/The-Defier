const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  RULE_VERSION
} = require('../server/pvp-live/engine/rules');
const {
  CONTENT_PACK_VERSION,
  BASELINE_LOADOUTS,
  BASELINE_BOT_POLICIES
} = require('../server/pvp-live/content/pvp-live-v1-content');
const {
  BALANCE_ARTIFACT_CONTRACT_VERSION,
  FROZEN_BALANCE_ARTIFACT_SEED,
  FROZEN_BALANCE_ARTIFACT_PATHS,
  REQUIRED_GOLDEN_REPLAY_IDS,
  buildBalanceFixtureArtifacts,
  validateBalanceFixtureArtifacts,
  runBalanceSimulationFullGate
} = require('../server/pvp-live/balance-artifacts');
const {
  validateSimulationReport
} = require('../server/pvp-live/balance-simulation');

assert.strictEqual(
  BALANCE_ARTIFACT_CONTRACT_VERSION,
  'pvp-live-balance-artifacts-v1',
  'S2-B balance artifacts should expose a frozen contract version'
);
assert.deepStrictEqual(
  FROZEN_BALANCE_ARTIFACT_PATHS,
  {
    baselineLoadouts: 'server/pvp-live/fixtures/baseline_loadouts_v1.json',
    baselineBotPolicies: 'server/pvp-live/fixtures/baseline_bot_policies_v1.json',
    openingScripts: 'server/pvp-live/fixtures/opening_scripts_v1.jsonl',
    goldenReplays: 'server/pvp-live/fixtures/golden_replays_v1.jsonl',
    simulationReport: 'output/pvp-live-balance/simulation_report_v1.json',
    failingReplaysDir: 'output/pvp-live-balance/failing_replays/'
  },
  'S2-B fixture paths should be frozen now that implementation files are locked'
);
assert.ok(
  REQUIRED_GOLDEN_REPLAY_IDS.includes('golden-response-window-preserved-001')
    && REQUIRED_GOLDEN_REPLAY_IDS.includes('golden-public-loss-explanation-only-001'),
  'S2-B golden replay manifest should include response-window and public-loss-explanation cases'
);

const artifacts = buildBalanceFixtureArtifacts({
  seed: FROZEN_BALANCE_ARTIFACT_SEED,
  matchesPerOrderedPair: 157,
  openingScriptCount: 10000
});
const artifactValidation = validateBalanceFixtureArtifacts(artifacts, { mode: 'quick' });

assert.strictEqual(artifacts.contractVersion, BALANCE_ARTIFACT_CONTRACT_VERSION, 'artifact bundle should identify its contract');
assert.strictEqual(artifacts.ruleVersion, RULE_VERSION, 'artifact bundle should pin current live PVP rule version');
assert.strictEqual(artifacts.contentPackVersion, CONTENT_PACK_VERSION, 'artifact bundle should pin current content pack version');
assert.strictEqual(artifacts.paths.openingScripts, FROZEN_BALANCE_ARTIFACT_PATHS.openingScripts, 'artifact bundle should use frozen opening script path');
assert.strictEqual(artifacts.baselineLoadouts.loadouts.length, BASELINE_LOADOUTS.length, 'baseline loadout artifact should include all loadouts');
assert.strictEqual(artifacts.baselineBotPolicies.policies.length, BASELINE_BOT_POLICIES.length, 'baseline policy artifact should include all policies');
assert.strictEqual(artifacts.openingScripts.length, 10000, 'artifact generator should materialize 10,000 opening scripts');
assert.ok(
  Object.values(artifacts.openingScriptSummary.categoryCounts).every(count => count >= 1000),
  'opening scripts should materially cover every frozen opening pressure category'
);
assert.strictEqual(artifacts.goldenReplays.length, REQUIRED_GOLDEN_REPLAY_IDS.length, 'golden replay artifact should cover every required golden case');
assert.ok(
  artifacts.goldenReplays.every(replay => replay.visibility === 'replay_public' || replay.visibility === 'audit_safe'),
  'golden replays should declare public/audit-safe visibility instead of hidden-state fixtures'
);
assert.strictEqual(artifacts.simulationReport.totalMatches, 10048, 'artifact quick report should keep the current 10,048-match quick gate');
assert.ok(artifacts.simulationReport.staplePressure.length > 0, 'artifact report should include derived staple pressure rows');
const artifactEntertainmentAudit = artifacts.simulationReport.entertainmentAudit || {};
const artifactPostGameCoverage = artifactEntertainmentAudit.postGameActionCoverage || {};
const artifactPostGameRows = Array.isArray(artifactPostGameCoverage.commonNextActions)
  ? artifactPostGameCoverage.commonNextActions
  : [];
const artifactPostGameActionBridge = artifactEntertainmentAudit.postGameActionBridge || {};
assert.strictEqual(artifactEntertainmentAudit.reportVersion, 'pvp-live-entertainment-audit-v1', 'artifact quick report should include the live PVP entertainment audit report');
assert.strictEqual(artifactEntertainmentAudit.sampleCount, artifacts.simulationReport.totalMatches, 'artifact entertainment audit should cover every quick-gate sample');
assert.ok(artifactEntertainmentAudit.stompRate <= 0.15, 'artifact entertainment audit stompRate should stay below the live PVP ceiling');
assert.ok(artifactEntertainmentAudit.closeGameRate >= 0.35, 'artifact entertainment audit closeGameRate should preserve enough late-game suspense');
assert.ok(artifactEntertainmentAudit.leadChangeOrThreatShiftRate >= 0.30, 'artifact entertainment audit should preserve enough lead or threat shifts');
assert.strictEqual(artifactPostGameCoverage.coverageRate, 1, 'artifact entertainment audit should cover observed finish reasons with post-game next actions');
assert.ok(artifactPostGameRows.length >= 1, 'artifact entertainment audit should include observed finish reason next-action rows');
assert.ok(
  artifactPostGameRows.every(row => row.reason && row.covered === true && row.actions.length >= 1),
  'artifact entertainment audit next-action rows should stay actionable'
);
assert.strictEqual(artifactPostGameActionBridge.reportVersion, 'pvp-live-post-game-action-bridge-v1', 'artifact entertainment audit should include the post-game audit-to-UI action bridge');
assert.ok(artifactPostGameActionBridge.uiActionIdsByAuditAction.key_turn_replay.includes('review_key_turns'), 'artifact action bridge should map key_turn_replay to the real review_key_turns UI button');
assert.ok(artifactPostGameActionBridge.uiActionIdsByAuditAction.apply_loadout_recommendation.includes('adjust_loadout'), 'artifact action bridge should map loadout recommendation to the real adjust_loadout UI button');
assert.ok(artifactPostGameActionBridge.uiActionIdsByAuditAction.practice_topic.includes('practice'), 'artifact action bridge should map practice_topic to the real practice UI button');
assert.ok(artifactPostGameActionBridge.coveredAuditActions.includes('report_issue'), 'artifact action bridge should include the real dispute report handoff');
assert.ok(artifactPostGameActionBridge.coveredAuditActions.includes('avoid_opponent'), 'artifact action bridge should include the real avoid-opponent handoff');
assert.ok(artifactPostGameRows.flatMap(row => row.actions).includes('report_issue'), 'artifact post-game action coverage should include report_issue');
assert.ok(artifactPostGameRows.flatMap(row => row.actions).includes('avoid_opponent'), 'artifact post-game action coverage should include avoid_opponent');
assert.ok(
  Object.values(artifacts.simulationReport.archetypeSpread).every(report => !report.dominantRisk && !report.falseArchetypeRisk),
  'artifact quick report should keep the stabilized quick-gate archetype spread; full helper owns the S2-C pass gate'
);
assert.strictEqual(artifactValidation.pass, true, `S2-B quick artifact validation should pass: ${JSON.stringify(artifactValidation.failures)}`);

const repoRoot = path.resolve(__dirname, '..');
const diskLoadouts = JSON.parse(fs.readFileSync(path.join(repoRoot, FROZEN_BALANCE_ARTIFACT_PATHS.baselineLoadouts), 'utf8'));
const diskPolicies = JSON.parse(fs.readFileSync(path.join(repoRoot, FROZEN_BALANCE_ARTIFACT_PATHS.baselineBotPolicies), 'utf8'));
const diskOpeningScriptLines = fs.readFileSync(path.join(repoRoot, FROZEN_BALANCE_ARTIFACT_PATHS.openingScripts), 'utf8').trim().split('\n');
const diskOpeningScripts = diskOpeningScriptLines.map(line => JSON.parse(line));
const diskGoldenReplays = fs.readFileSync(path.join(repoRoot, FROZEN_BALANCE_ARTIFACT_PATHS.goldenReplays), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const diskSimulationReportPath = path.join(repoRoot, FROZEN_BALANCE_ARTIFACT_PATHS.simulationReport);
assert.strictEqual(diskLoadouts.contractVersion, BALANCE_ARTIFACT_CONTRACT_VERSION, 'committed baseline loadout fixture should carry the S2-B artifact contract');
assert.strictEqual(diskPolicies.contractVersion, BALANCE_ARTIFACT_CONTRACT_VERSION, 'committed baseline bot policy fixture should carry the S2-B artifact contract');
assert.strictEqual(diskOpeningScriptLines.length, 10000, 'committed opening script fixture should contain exactly 10,000 JSONL rows');
assert.strictEqual(diskGoldenReplays.length, REQUIRED_GOLDEN_REPLAY_IDS.length, 'committed golden replay fixture should contain every required replay row');
assert.deepStrictEqual(
  diskGoldenReplays.map(replay => replay.id).sort(),
  REQUIRED_GOLDEN_REPLAY_IDS.slice().sort(),
  'committed golden replay fixture ids should match the required manifest'
);
assert.deepStrictEqual(diskLoadouts, artifacts.baselineLoadouts, 'committed baseline loadout fixture should match deterministic artifact generator output');
assert.deepStrictEqual(diskPolicies, artifacts.baselineBotPolicies, 'committed baseline bot policy fixture should match deterministic artifact generator output');
assert.deepStrictEqual(diskOpeningScripts, artifacts.openingScripts, 'committed opening scripts should match deterministic artifact generator output');
assert.deepStrictEqual(diskGoldenReplays, artifacts.goldenReplays, 'committed golden replays should match deterministic artifact generator output');
if (fs.existsSync(diskSimulationReportPath)) {
  const diskSimulationReport = JSON.parse(fs.readFileSync(diskSimulationReportPath, 'utf8'));
  assert.deepStrictEqual(diskSimulationReport, artifacts.simulationReport, 'local simulation report snapshot should match deterministic artifact generator output when present');
}

const fullGateCandidate = runBalanceSimulationFullGate({
  seed: 'pvp-live-v1-s2b-full-candidate',
  openingScripts: 10000
});
const fullValidation = validateSimulationReport(fullGateCandidate, { mode: 'full' });
const accidentalQuickValidation = validateSimulationReport(fullGateCandidate, { mode: 'quick' });
assert.strictEqual(fullGateCandidate.samplePolicy.mode, 'full', 'full gate helper should label full sample policy');
assert.strictEqual(fullGateCandidate.samplePolicy.matchesPerOrderedPair, 500, 'full gate helper should run 500 samples per ordered pair');
assert.strictEqual(fullGateCandidate.totalMatches, 32000, 'full gate helper should run the required 32,000-match matrix');
assert.strictEqual(fullValidation.pass, true, 'S2-C full gate helper should pass the 32,000-match balance gate');
assert.strictEqual(accidentalQuickValidation.pass, true, 'full gate reports should keep full-mode validation even when requested through quick mode');

console.log('sanity_pvp_live_balance_artifact_checks passed');
