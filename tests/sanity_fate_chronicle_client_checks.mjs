import assert from "node:assert/strict";

globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  removeEventListener() {}
};

const { createFateChronicleService } = await import("../js/services/fate-chronicle-service.js");

function deferred() {
  let resolve;
  const promise = new Promise(res => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeCurrent(label, { runId = "" } = {}) {
  return {
    rotation: {
      rotationId: "fchron-2026-w29",
      label
    },
    progress: {
      chapters: []
    },
    activeAttempt: runId ? { attemptId: `${label}-attempt`, runId } : null
  };
}

function makeMutationEnvelope(label, runId) {
  return {
    success: true,
    rotation: {
      meta: {
        rotationId: "fchron-2026-w29",
        label
      },
      progress: {
        chapters: []
      }
    },
    attempt: { attemptId: `${label}-attempt`, runId },
    run: { runId, mode: "fate_chronicle" }
  };
}

function makeClient({ getUserId, currentImpl, startImpl, archiveImpl, claimArchiveImpl } = {}) {
  let requestId = 0;
  return {
    getCurrentUser() {
      const userId = getUserId();
      return userId ? { objectId: userId, username: userId } : null;
    },
    createAuthoritativeRunRequestId(prefix = "fchron") {
      requestId += 1;
      return `${prefix}-generated-${String(requestId).padStart(4, "0")}`;
    },
    async getFateChronicleCurrent(options) {
      return currentImpl ? currentImpl(options) : { success: true, current: makeCurrent("default") };
    },
    async startFateChronicleAttempt(payload, options) {
      return startImpl ? startImpl(payload, options) : {
        success: true,
        current: makeCurrent("started", { runId: "fchron-run-default" }),
        attempt: { attemptId: "fchron-attempt-default", runId: "fchron-run-default" },
        run: { runId: "fchron-run-default", mode: "fate_chronicle" }
      };
    },
    async submitFateChronicleResult() {
      return { success: true };
    },
    async claimFateChronicleReward() {
      return { success: true };
    },
    async getWeeklyArchiveCurrent(options) {
      return archiveImpl ? archiveImpl(options) : {
        success: true,
        archive: { cycleId: "warchive-2026-w29", credentialCount: 2 }
      };
    },
    async claimWeeklyArchiveFoundation(payload, options) {
      return claimArchiveImpl ? claimArchiveImpl(payload, options) : {
        success: true,
        foundationClaim: { cycleId: payload.cycleId, amount: 120 }
      };
    }
  };
}

{
  let userId = "fchron-user-a";
  const startCalls = [];
  const archiveClaimCalls = [];
  let startAttempt = 0;
  let archiveShouldFail = false;
  const client = makeClient({
    getUserId: () => userId,
    startImpl: async (payload, options) => {
      startCalls.push({ payload, options });
      startAttempt += 1;
      if (startAttempt === 1) {
        return { success: false, reason: "timeout", message: "timeout" };
      }
      return {
        success: true,
        current: makeCurrent(`started-${startAttempt}`, { runId: `fchron-run-${startAttempt}` }),
        attempt: { attemptId: `fchron-attempt-${startAttempt}`, runId: `fchron-run-${startAttempt}` },
        run: { runId: `fchron-run-${startAttempt}`, mode: "fate_chronicle" }
      };
    },
    archiveImpl: async () => archiveShouldFail
      ? { success: false, reason: "timeout", message: "archive timeout" }
      : { success: true, archive: { cycleId: "warchive-2026-w29", credentialCount: 2 } },
    claimArchiveImpl: async (payload, options) => {
      archiveClaimCalls.push({ payload, options });
      return { success: true, foundationClaim: { cycleId: payload.cycleId, amount: 120 } };
    }
  });
  const service = createFateChronicleService({ client });

  const loaded = await service.current({ expectedUserId: userId });
  assert.equal(loaded.success, true);
  assert.equal(service.getState().current.rotation.label, "default");

  const firstStart = await service.start({
    rotationId: "fchron-2026-w29",
    chapterId: "ember",
    oathId: "guard",
    expectedUserId: userId
  });
  assert.equal(firstStart.success, false);
  const retriedStart = await service.start({
    rotationId: "fchron-2026-w29",
    chapterId: "ember",
    oathId: "guard",
    expectedUserId: userId
  });
  assert.equal(retriedStart.success, true);
  assert.equal(startCalls[0].payload.clientAttemptId, startCalls[1].payload.clientAttemptId);
  assert.equal(startCalls[0].payload.mutationId, startCalls[1].payload.mutationId);
  assert.equal(startCalls[1].payload.protocolVersion, "authoritative-fate-chronicle-v1");
  assert.equal(startCalls[1].options.expectedUserId, userId);

  await service.start({
    rotationId: "fchron-2026-w29",
    chapterId: "ember",
    oathId: "guard",
    expectedUserId: userId
  });
  assert.notEqual(startCalls[2].payload.clientAttemptId, startCalls[1].payload.clientAttemptId);
  assert.notEqual(startCalls[2].payload.mutationId, startCalls[1].payload.mutationId);

  await service.loadArchive({ expectedUserId: userId });
  assert.equal(service.getState().weeklyArchive.cycleId, "warchive-2026-w29");
  const archiveClaim = await service.claimArchive({
    cycleId: "warchive-2026-w29",
    expectedUserId: userId
  });
  assert.equal(archiveClaim.success, true);
  assert.equal(archiveClaimCalls[0].payload.protocolVersion, "weekly-archive-v1");
  assert.equal(archiveClaimCalls[0].payload.cycleId, "warchive-2026-w29");
  assert.equal(Object.hasOwn(archiveClaimCalls[0].payload, "milestoneId"), false);
  archiveShouldFail = true;
  const failedArchive = await service.loadArchive({ expectedUserId: userId });
  assert.equal(failedArchive.success, false);
  assert.equal(service.getState().weeklyArchive, null);
  assert.equal(service.getState().archiveError.reason, "timeout");

  userId = "fchron-user-b";
  const oldAccountRead = await service.current({ expectedUserId: "fchron-user-a" });
  assert.equal(oldAccountRead.success, false);
  assert.equal(oldAccountRead.reason, "fate_chronicle_account_changed");
}

{
  let userId = "fchron-race-user";
  const slowCurrent = deferred();
  const slowStart = deferred();
  let currentCalls = 0;
  const client = makeClient({
    getUserId: () => userId,
    currentImpl: async () => {
      currentCalls += 1;
      if (currentCalls === 1) return { success: true, current: makeCurrent("seed") };
      return slowCurrent.promise;
    },
    startImpl: async () => slowStart.promise
  });
  const service = createFateChronicleService({ client });
  await service.current({ expectedUserId: userId });

  const staleReadPromise = service.current({ expectedUserId: userId });
  const mutationPromise = service.start({
    rotationId: "fchron-2026-w29",
    chapterId: "ember",
    oathId: "edge",
    expectedUserId: userId
  });
  slowCurrent.resolve({ success: true, current: makeCurrent("stale-read") });
  const staleRead = await staleReadPromise;
  assert.equal(staleRead.suppressed, true, "a read started before a mutation must not overwrite mutation state");

  slowStart.resolve(makeMutationEnvelope("mutation-won", "fchron-run-race"));
  const mutation = await mutationPromise;
  assert.equal(mutation.success, true);
  assert.equal(mutation.suppressed, undefined, "reads must never suppress an in-flight mutation");
  assert.equal(service.getState().current.rotation.meta.label, "mutation-won");
  assert.equal(service.getState().activeRun.runId, "fchron-run-race");

  const oldMutation = deferred();
  client.startFateChronicleAttempt = async () => oldMutation.promise;
  const oldMutationPromise = service.start({
    rotationId: "fchron-2026-w29",
    chapterId: "ember",
    oathId: "guard",
    expectedUserId: userId,
    forceNew: true
  });
  userId = "fchron-new-user";
  service.reset();
  client.getFateChronicleCurrent = async () => ({ success: true, current: makeCurrent("new-account") });
  const newAccountRead = await service.current({ expectedUserId: userId });
  assert.equal(newAccountRead.success, true);
  oldMutation.resolve({
    success: true,
    current: makeCurrent("old-account-result"),
    run: { runId: "fchron-run-old", mode: "fate_chronicle" }
  });
  const suppressedMutation = await oldMutationPromise;
  assert.equal(suppressedMutation.suppressed, true);
  assert.equal(service.getState().current.rotation.label, "new-account");
  assert.equal(service.getState().activeRun, null);
}

console.log("Fate chronicle client checks passed.");
