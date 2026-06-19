const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  FROZEN_BALANCE_ARTIFACT_PATHS,
  REQUIRED_GOLDEN_REPLAY_IDS,
  REDUCER_BACKED_GOLDEN_REPLAY_IDS,
  STORE_BACKED_GOLDEN_REPLAY_IDS,
  SIMULATION_BACKED_GOLDEN_REPLAY_IDS
} = require('../server/pvp-live/balance-artifacts');
const {
  loadGoldenReplayFixtures,
  runGoldenReplayAgainstReducer,
  runGoldenReplayAgainstStore,
  runGoldenReplayAgainstSimulation
} = require('../server/pvp-live/golden-replay-runner');

const repoRoot = path.resolve(__dirname, '..');
const fixturePath = path.join(repoRoot, FROZEN_BALANCE_ARTIFACT_PATHS.goldenReplays);
const diskReplays = fs.readFileSync(fixturePath, 'utf8')
  .trim()
  .split('\n')
  .map(line => JSON.parse(line));
const loadedReplays = loadGoldenReplayFixtures(repoRoot);

assert.strictEqual(loadedReplays.length, REQUIRED_GOLDEN_REPLAY_IDS.length, 'golden replay runner should load every required replay fixture');
assert.deepStrictEqual(loadedReplays, diskReplays, 'golden replay runner should read the committed fixture without re-synthesizing it');

assert.ok(
  REDUCER_BACKED_GOLDEN_REPLAY_IDS.includes('golden-replay-public-redaction-001')
    && REDUCER_BACKED_GOLDEN_REPLAY_IDS.includes('golden-audit-safe-scan-001'),
  'reducer-backed golden manifest should cover both replay_public and audit_safe replay layers'
);

function assertReducerBackedReplay(id) {
  const replay = loadedReplays.find(item => item.id === id);
  assert.ok(replay, `required reducer-backed replay should exist: ${id}`);
  assert.strictEqual(replay.executionLayer, 'reducer', `${id} should declare reducer execution layer`);
  assert.ok(
    (Array.isArray(replay.reducerScript) && replay.reducerScript.length >= 4)
      || (replay.reducerScenario && replay.reducerScenario.scenarioType),
    `${id} should carry an executable reducer script or reducer scenario`
  );
  if (id === 'golden-replay-public-redaction-001') {
    assert.strictEqual(replay.visibility, 'replay_public', `${id} must exercise the replay_public branch`);
  }
  if (id === 'golden-audit-safe-scan-001') {
    assert.strictEqual(replay.visibility, 'audit_safe', `${id} must exercise the audit_safe branch`);
  }

  const result = runGoldenReplayAgainstReducer(replay);
  assert.strictEqual(result.pass, true, `${id} reducer replay should pass: ${JSON.stringify(result.failures)}`);
  assert.strictEqual(result.replayId, id, 'replay result should retain fixture id');
  assert.strictEqual(result.executionLayer, 'reducer', 'replay result should prove reducer execution layer');
  assert.strictEqual(result.ruleVersion, replay.ruleVersion, 'replay should run against the fixture rule version');
  assert.strictEqual(result.finalState.status, 'finished', `${id} should reach a reducer-backed terminal state`);
  assert.strictEqual(result.finalState.finishReason, replay.expectedEndReason, `${id} should finish with the fixture end reason`);
  assert.strictEqual(result.finalState.winnerSeat, replay.expectedWinner, `${id} should finish with the fixture winner`);
  assert.strictEqual(result.sequenceReport.contiguous, true, `${id} event sequence should remain contiguous`);
  assert.ok(/^[a-f0-9]{16}$/.test(result.replayHash), `${id} should expose a stable replay hash`);
  assert.ok(/^[a-f0-9]{16}$/.test(result.finalStateHash), `${id} should expose a stable final-state hash`);
  assert.ok(/^[a-f0-9]{16}$/.test(result.publicReplay.matchRef), `${id} public replay should expose a stable match reference`);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result.publicReplay, 'matchId'), false, `${id} public replay should not expose raw match id`);
  assert.strictEqual(result.hiddenLeakReport.hiddenHandLeakCount, 0, `${id} public replay must not leak hidden hand data`);
  assert.strictEqual(result.hiddenLeakReport.hiddenDeckOrderLeakCount, 0, `${id} public replay must not leak hidden deck order`);
  assert.strictEqual(result.hiddenLeakReport.reviewHiddenTokenCount, 0, `${id} post-match reviews must not leak hidden tokens`);
  assert.strictEqual(result.hiddenLeakReport.replayHiddenTokenCount, 0, `${id} replay_public payload must not leak hidden tokens`);
  assert.strictEqual(result.hiddenLeakReport.auditHiddenTokenCount, 0, `${id} audit_safe payload must not leak hidden tokens`);
  assert.strictEqual(result.hiddenLeakReport.forbiddenStringTokenCount, 0, `${id} public replay text must not include hidden token strings`);
  assert.strictEqual(result.reviewDerivation.publicDerivationOnly, true, `${id} review should be derivable from public reducer events`);
  assert.strictEqual(result.reviewDerivation.hasBudgetPrevention, replay.expectedReview.hasBudgetPrevention, `${id} budget-prevention review marker should match public evidence`);
  assert.strictEqual(result.reviewDerivation.hasLoserAdvice, replay.expectedReview.hasLoserAdvice, `${id} loser-advice contract should match fixture`);
  assert.strictEqual(result.primaryVisibility.visibilityLayer, replay.visibility, `${id} should execute its declared visibility branch`);
  assert.strictEqual(result.publicReplay.visibilityLayer, 'replay_public', `${id} should always materialize replay_public payload`);
  assert.ok(/^[a-f0-9]{16}$/.test(result.publicReplay.sharePayloadHash), `${id} replay_public payload should expose stable share hash`);
  assert.strictEqual(result.publicReplay.hiddenScan.forbiddenTokenCount, 0, `${id} replay_public hidden scan should be clean`);
  assert.strictEqual(result.auditSafe.visibilityLayer, 'audit_safe', `${id} should always materialize audit_safe payload`);
  assert.ok(Array.isArray(result.auditSafe.fieldPaths) && result.auditSafe.fieldPaths.length > 0, `${id} audit_safe payload should expose field paths`);
  assert.strictEqual(result.auditSafe.hiddenScan.forbiddenTokenCount, 0, `${id} audit_safe hidden scan should be clean`);

  replay.expectedEvents.forEach((eventType) => {
    assert.ok(result.eventTypes.includes(eventType), `${id} should emit expected reducer event: ${eventType}`);
  });
  if (replay.expectedReview.hasBudgetPrevention) {
    assert.ok(result.eventTypes.includes('budget_clamped'), `${id} should emit budget_clamped as reducer-backed budget prevention`);
  }
  if (id === 'golden-idempotent-action-001') {
    assert.strictEqual(result.idempotency.duplicateResult, 'duplicate', 'idempotent golden replay should return duplicate for repeated intent');
    assert.strictEqual(result.idempotency.stateVersionStable, true, 'idempotent golden replay should not advance state version on duplicate');
    assert.strictEqual(result.idempotency.noDuplicateEventsAppended, true, 'idempotent golden replay should not append events on duplicate');
  }
  if (id === 'golden-draw-round14-001') {
    assert.strictEqual(replay.reducerScenario.scenarioType, 'round14_draw_runtime', 'round14 golden should declare reducer runtime scenario');
    assert.strictEqual(result.finalState.finishReason, 'round14_draw', 'round14 runtime golden should finish with reducer-backed draw');
    assert.strictEqual(result.finalState.winnerSeat, 'draw', 'round14 runtime golden should keep draw winner marker');
    assert.strictEqual(result.reviewDerivation.hasLoserAdvice, false, 'round14 draw golden should not invent loser advice');
  }
}

async function assertStoreBackedReplay(id) {
  const replay = loadedReplays.find(item => item.id === id);
  assert.ok(replay, `required store-backed replay should exist: ${id}`);
  assert.strictEqual(replay.executionLayer, 'store', `${id} should declare store execution layer`);
  assert.ok(replay.storeScenario && replay.storeScenario.scenarioType, `${id} should carry an executable store scenario`);

  const result = await runGoldenReplayAgainstStore(replay);
  assert.strictEqual(result.pass, true, `${id} store replay should pass: ${JSON.stringify(result.failures)}`);
  assert.strictEqual(result.replayId, id, 'store replay result should retain fixture id');
  assert.strictEqual(result.executionLayer, 'store', 'store replay result should prove store execution layer');
  assert.strictEqual(result.ruleVersion, replay.ruleVersion, 'store replay should run against the fixture rule version');
  assert.strictEqual(result.finalState.status, replay.expectedStatus, `${id} should reach expected store status`);
  assert.strictEqual(result.finalState.finishReason, replay.expectedEndReason, `${id} should expose expected end reason`);
  assert.strictEqual(result.sequenceReport.contiguous, true, `${id} store event sequence should remain contiguous`);
  assert.ok(/^[a-f0-9]{16}$/.test(result.replayHash), `${id} should expose a stable store replay hash`);
  assert.ok(/^[a-f0-9]{16}$/.test(result.publicReplay.matchRef), `${id} store public replay should expose a stable match reference`);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result.publicReplay, 'matchId'), false, `${id} store public replay should not expose raw match id`);
  assert.strictEqual(result.hiddenLeakReport.hiddenHandLeakCount, 0, `${id} store replay must not leak hidden hand data`);
  assert.strictEqual(result.hiddenLeakReport.hiddenDeckOrderLeakCount, 0, `${id} store replay must not leak hidden deck order`);
  assert.strictEqual(result.hiddenLeakReport.replayHiddenTokenCount, 0, `${id} store replay_public payload must not leak hidden tokens`);
  assert.strictEqual(result.hiddenLeakReport.auditHiddenTokenCount, 0, `${id} store audit_safe payload must not leak hidden tokens`);
  assert.strictEqual(result.primaryVisibility.visibilityLayer, replay.visibility, `${id} should execute declared store visibility branch`);
  replay.expectedEvents.forEach((eventType) => {
    assert.ok(result.eventTypes.includes(eventType), `${id} should emit expected store event: ${eventType}`);
  });
  if (id === 'golden-reconnect-resume-001') {
    assert.strictEqual(replay.expectedReview.expectsPostMatchReview, false, 'reconnect golden should not expect a post-match review while the match remains active');
    assert.strictEqual(result.postMatchReviewPresent, false, 'reconnect golden should not expose post-match review on active resume');
    assert.strictEqual(result.connectionResume.sameStateVersionAfterReconnect, true, 'reconnect golden should resume without advancing state version');
    assert.strictEqual(result.connectionResume.graceObservedBeforeReconnect, true, 'reconnect golden should observe grace before heartbeat resume');
    assert.strictEqual(result.connectionResume.onlineAfterReconnect, true, 'reconnect golden should return the player to online');
  }
  if (id === 'golden-soft-timeout-001') {
    assert.strictEqual(replay.expectedReview.expectsPostMatchReview, false, 'soft-timeout golden should not expect a post-match review after first timeout automation');
    assert.strictEqual(result.postMatchReviewPresent, false, 'soft-timeout golden should continue without post-match review');
    assert.strictEqual(result.automation.firstTimeoutAutomation, true, 'soft-timeout golden should execute low-risk automation on first timeout');
    assert.strictEqual(result.finalState.status, 'active', 'soft-timeout golden should continue the match after first timeout automation');
  }
  if (id === 'golden-forfeit-timeout-001') {
    assert.strictEqual(replay.expectedReview.expectsPostMatchReview, true, 'forfeit-timeout golden should expect a post-match review after terminal timeout');
    assert.strictEqual(result.postMatchReviewPresent, true, 'forfeit-timeout golden should expose post-match review after terminal timeout');
    assert.strictEqual(result.automation.forfeitAfterRepeatedTimeout, true, 'forfeit-timeout golden should finish after repeated or severe timeout');
  }
  if (id === 'golden-invalid-match-001') {
    assert.strictEqual(replay.expectedReview.expectsPostMatchReview, false, 'invalid golden should not expect a post-match review');
    assert.strictEqual(result.postMatchReviewPresent, false, 'invalid golden should not expose post-match review');
    assert.strictEqual(result.finalState.status, 'invalidated', 'invalid golden should remain invalidated instead of finished');
    assert.strictEqual(result.reviewDerivation.publicDerivationOnly, true, 'invalid golden should not require post-match hidden review data');
  }
}

function assertSimulationBackedReplay(id) {
  const replay = loadedReplays.find(item => item.id === id);
  assert.ok(replay, `required simulation-backed replay should exist: ${id}`);
  assert.strictEqual(replay.executionLayer, 'simulation', `${id} should declare simulation execution layer`);
  const result = runGoldenReplayAgainstSimulation(replay);
  assert.strictEqual(result.pass, true, `${id} simulation replay should pass: ${JSON.stringify(result.failures)}`);
  assert.strictEqual(result.finalState.status, 'finished', `${id} should be represented as a terminal simulation result`);
  assert.strictEqual(result.finalState.finishReason, replay.expectedEndReason, `${id} should finish with round14 draw reason`);
  assert.strictEqual(result.finalState.winnerSeat, 'draw', `${id} should preserve draw winner seat`);
  assert.strictEqual(result.round14Evidence.simulationLayerOnly, true, `${id} should state that round14 is not reducer/store-backed yet`);
  assert.ok(/^[a-f0-9]{16}$/.test(result.replayHash), `${id} should expose a stable simulation replay hash`);
}

async function main() {
  REDUCER_BACKED_GOLDEN_REPLAY_IDS.forEach(assertReducerBackedReplay);

  assert.deepStrictEqual(
    STORE_BACKED_GOLDEN_REPLAY_IDS.slice().sort(),
    [
      'golden-reconnect-resume-001',
      'golden-soft-timeout-001',
      'golden-forfeit-timeout-001',
      'golden-invalid-match-001'
    ].sort(),
    'store-backed golden manifest should cover reconnect, soft timeout, forfeit timeout, and invalidated setup'
  );
  for (const id of STORE_BACKED_GOLDEN_REPLAY_IDS) {
    await assertStoreBackedReplay(id);
  }

  assert.deepStrictEqual(
    SIMULATION_BACKED_GOLDEN_REPLAY_IDS,
    [],
    'simulation-backed golden manifest should be empty after round14 draw enters reducer runtime'
  );
  SIMULATION_BACKED_GOLDEN_REPLAY_IDS.forEach(assertSimulationBackedReplay);

  console.log('sanity_pvp_live_golden_replay_checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
