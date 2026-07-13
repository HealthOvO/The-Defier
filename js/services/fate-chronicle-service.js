import { BackendClient } from "./backend-client.js";

const SAFE_ID = /^[A-Za-z0-9._:-]{2,128}$/;
const SAFE_MILESTONE_ID = /^[A-Za-z0-9._:-]{2,64}$/;
const DEFAULT_PROTOCOL_VERSION = "authoritative-fate-chronicle-v1";
const DEFAULT_WEEKLY_ARCHIVE_PROTOCOL_VERSION = "weekly-archive-v1";
const DEFAULT_STATE = Object.freeze({
  current: null,
  weeklyArchive: null,
  attempt: null,
  activeRun: null,
  lastResult: null,
  lastClaim: null,
  lastFoundationClaim: null,
  pending: null,
  lastError: null,
  archiveError: null,
  expectedUserId: "",
  updatedAt: 0
});

function cloneData(value) {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    if (Array.isArray(value)) return value.slice();
    if (typeof value === "object") return { ...value };
    return value;
  }
}

function normalizeUserId(user) {
  return String(user && (user.objectId || user.id || user.userId || user.username) || "").trim();
}

function normalizeSafeId(value) {
  const text = String(value || "").trim();
  return SAFE_ID.test(text) ? text : "";
}

function normalizeMilestoneId(value) {
  const text = String(value || "").trim();
  return SAFE_MILESTONE_ID.test(text) ? text : "";
}

function normalizeFailure(result = {}, fallbackMessage = "命途长卷请求失败") {
  const failure = {
    success: false,
    message: result && result.message ? result.message : fallbackMessage
  };
  if (result && result.reason) failure.reason = result.reason;
  return failure;
}

function sanitizeSnapshotEnvelope(result) {
  const snapshot = cloneData(result);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  delete snapshot.success;
  delete snapshot.message;
  delete snapshot.reason;
  delete snapshot.error;
  delete snapshot.suppressed;
  return snapshot;
}

function readPath(source, path = []) {
  let cursor = source;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, key)) {
      return { found: false, value: undefined };
    }
    cursor = cursor[key];
  }
  return { found: true, value: cursor };
}

function findCandidateValue(result, paths = []) {
  for (const path of paths) {
    const resolved = readPath(result, path);
    if (resolved.found) {
      return {
        found: true,
        value: cloneData(resolved.value)
      };
    }
  }
  return { found: false, value: undefined };
}

function looksLikeCurrentSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    "rotation",
    "rotationId",
    "chapters",
    "progress",
    "rewardMilestones",
    "milestones",
    "activeAttempt",
    "currentAttempt",
    "resumableAttempt",
    "recoverableAttempt"
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function looksLikeWeeklyArchiveSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    "credentialCount",
    "credentials",
    "voucherCount",
    "completedModes",
    "foundationReward",
    "foundationClaim",
    "rewardClaim",
    "cycle",
    "cycleId",
    "thresholds"
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function extractCurrentSnapshot(result, { allowEnvelope = true } = {}) {
  const direct = findCandidateValue(result, [
    ["current"],
    ["snapshot"],
    ["state"],
    ["dashboard"],
    ["fateChronicle"],
    ["chronicle"]
  ]);
  if (direct.found && direct.value && typeof direct.value === "object" && !Array.isArray(direct.value)) {
    return direct.value;
  }
  if (allowEnvelope && looksLikeCurrentSnapshot(result)) {
    return sanitizeSnapshotEnvelope(result);
  }
  return null;
}

function extractWeeklyArchiveSnapshot(result, { allowEnvelope = true } = {}) {
  const direct = findCandidateValue(result, [
    ["weeklyArchive"],
    ["archive"],
    ["current"],
    ["snapshot"],
    ["state"],
    ["dashboard"]
  ]);
  if (direct.found && direct.value && typeof direct.value === "object" && !Array.isArray(direct.value)) {
    if (!allowEnvelope && !looksLikeWeeklyArchiveSnapshot(direct.value)) {
      return null;
    }
    return direct.value;
  }
  if (allowEnvelope && looksLikeWeeklyArchiveSnapshot(result)) {
    return sanitizeSnapshotEnvelope(result);
  }
  return null;
}

function extractAttempt(result) {
  return findCandidateValue(result, [
    ["attempt"],
    ["activeAttempt"],
    ["currentAttempt"],
    ["resumableAttempt"],
    ["recoverableAttempt"],
    ["current", "attempt"],
    ["current", "activeAttempt"],
    ["current", "currentAttempt"],
    ["current", "resumableAttempt"],
    ["current", "recoverableAttempt"],
    ["snapshot", "attempt"],
    ["snapshot", "activeAttempt"],
    ["snapshot", "currentAttempt"],
    ["snapshot", "resumableAttempt"],
    ["snapshot", "recoverableAttempt"],
    ["state", "attempt"],
    ["state", "activeAttempt"],
    ["state", "currentAttempt"],
    ["state", "resumableAttempt"],
    ["state", "recoverableAttempt"]
  ]);
}

function extractRun(result) {
  return findCandidateValue(result, [
    ["run"],
    ["activeRun"],
    ["authoritativeRun"],
    ["attempt", "run"],
    ["attempt", "authoritativeRun"],
    ["activeAttempt", "run"],
    ["activeAttempt", "authoritativeRun"],
    ["currentAttempt", "run"],
    ["currentAttempt", "authoritativeRun"],
    ["current", "run"],
    ["current", "activeRun"],
    ["current", "authoritativeRun"],
    ["current", "attempt", "run"],
    ["current", "activeAttempt", "run"],
    ["snapshot", "run"],
    ["snapshot", "activeRun"],
    ["snapshot", "authoritativeRun"]
  ]);
}

function extractResultRecord(result) {
  return findCandidateValue(result, [
    ["result"],
    ["submission"],
    ["submittedResult"]
  ]);
}

function extractClaimRecord(result) {
  return findCandidateValue(result, [
    ["claim"],
    ["rewardClaim"],
    ["reward"],
    ["claimedReward"]
  ]);
}

function extractFoundationClaimRecord(result) {
  return findCandidateValue(result, [
    ["foundationClaim"],
    ["claim"],
    ["rewardClaim"],
    ["reward"],
    ["claimedReward"]
  ]);
}

function getRotationIdFromState(state) {
  return normalizeSafeId(
    state && state.current && (
      state.current.rotationId
      || state.current.rotation && (state.current.rotation.rotationId || state.current.rotation.id)
      || state.current.currentAttempt && state.current.currentAttempt.rotationId
      || state.current.activeAttempt && state.current.activeAttempt.rotationId
    )
  );
}

function getCycleIdFromState(state) {
  return normalizeSafeId(
    state && state.weeklyArchive && (
      state.weeklyArchive.cycleId
      || state.weeklyArchive.cycle && (state.weeklyArchive.cycle.cycleId || state.weeklyArchive.cycle.id)
      || state.weeklyArchive.rotationId
    )
  );
}

function getRunIdFromState(state) {
  return normalizeSafeId(
    state && state.attempt && (
      state.attempt.runId
      || state.attempt.run && state.attempt.run.runId
      || state.attempt.authoritativeRun && state.attempt.authoritativeRun.runId
    )
      || state && state.activeRun && (
        state.activeRun.runId
        || state.activeRun.id
      )
  );
}

export function createFateChronicleService({
  client = BackendClient,
  onChange = null,
  now = () => Date.now()
} = {}) {
  const listeners = new Set();
  let state = {
    ...DEFAULT_STATE,
    updatedAt: now()
  };
  let requestGeneration = 0;
  let mutationEpoch = 0;
  let completedMutationEpoch = 0;
  let activeMutationCount = 0;
  const readEpochs = {
    current: 0,
    archive: 0
  };
  let cachedStartRetry = null;
  let cachedSubmitRetry = null;
  let cachedClaimRetry = null;
  let cachedArchiveClaimRetry = null;

  function getCurrentUserId() {
    try {
      return normalizeUserId(client && typeof client.getCurrentUser === "function" ? client.getCurrentUser() : null);
    } catch (error) {
      return "";
    }
  }

  function getBoundUserId(expectedUserId = "") {
    return String(expectedUserId || state.expectedUserId || getCurrentUserId()).trim();
  }

  function isExpectedUserCurrent(expectedUserId = "") {
    const safeExpectedUserId = normalizeSafeId(expectedUserId) || String(expectedUserId || "").trim();
    return !!safeExpectedUserId && getCurrentUserId() === safeExpectedUserId;
  }

  function getState() {
    return cloneData(state) || { ...state };
  }

  function publish(patch = {}) {
    state = {
      ...state,
      ...patch,
      updatedAt: now()
    };
    const snapshot = getState();
    listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (error) {}
    });
    if (typeof onChange === "function") {
      try {
        onChange(snapshot);
      } catch (error) {}
    }
    return snapshot;
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    if (emitCurrent) {
      try {
        listener(getState());
      } catch (error) {}
    }
    return () => listeners.delete(listener);
  }

  function reset() {
    requestGeneration += 1;
    mutationEpoch = 0;
    completedMutationEpoch = 0;
    activeMutationCount = 0;
    readEpochs.current = 0;
    readEpochs.archive = 0;
    cachedStartRetry = null;
    cachedSubmitRetry = null;
    cachedClaimRetry = null;
    cachedArchiveClaimRetry = null;
    return publish({
      ...DEFAULT_STATE
    });
  }

  function buildRequestId(prefix = "fchron") {
    if (client && typeof client.createAuthoritativeRunRequestId === "function") {
      return client.createAuthoritativeRunRequestId(prefix);
    }
    if (client && typeof client.createMutationId === "function") {
      return `${String(prefix || "fchron").replace(/[^A-Za-z0-9._:-]/g, "") || "fchron"}-${client.createMutationId().replace(/^mutation-/, "")}`;
    }
    return `${String(prefix || "fchron").replace(/[^A-Za-z0-9._:-]/g, "") || "fchron"}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function resolveStartRetry({
    rotationId = "",
    chapterId = "",
    vowId = "",
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    requestedClientAttemptId = "",
    requestedMutationId = "",
    forceNew = false,
    boundUserId = ""
  } = {}) {
    if (forceNew) cachedStartRetry = null;
    const safeClientAttemptId = normalizeSafeId(requestedClientAttemptId);
    const safeMutationId = normalizeSafeId(requestedMutationId);
    const fingerprint = JSON.stringify({
      rotationId: normalizeSafeId(rotationId),
      chapterId: normalizeSafeId(chapterId),
      vowId: normalizeSafeId(vowId),
      protocolVersion: normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION,
      userId: String(boundUserId || "").trim(),
      requestedClientAttemptId: safeClientAttemptId,
      requestedMutationId: safeMutationId
    });
    if (cachedStartRetry && cachedStartRetry.fingerprint === fingerprint) {
      return {
        clientAttemptId: cachedStartRetry.clientAttemptId,
        mutationId: cachedStartRetry.mutationId
      };
    }
    cachedStartRetry = {
      fingerprint,
      clientAttemptId: safeClientAttemptId || buildRequestId("fchron-attempt"),
      mutationId: safeMutationId || buildRequestId("fchron-start")
    };
    return {
      clientAttemptId: cachedStartRetry.clientAttemptId,
      mutationId: cachedStartRetry.mutationId
    };
  }

  function resolveMutationRetry(cacheKey, {
    requestedMutationId = "",
    boundUserId = "",
    ...fingerprintSource
  } = {}) {
    const safeMutationId = normalizeSafeId(requestedMutationId);
    const fingerprint = JSON.stringify({
      ...fingerprintSource,
      userId: String(boundUserId || "").trim()
    });
    const cache = cacheKey === "submit"
      ? cachedSubmitRetry
      : cacheKey === "claim"
        ? cachedClaimRetry
        : cachedArchiveClaimRetry;
    if (safeMutationId) {
      const resolved = {
        fingerprint,
        mutationId: safeMutationId
      };
      if (cacheKey === "submit") cachedSubmitRetry = resolved;
      else if (cacheKey === "claim") cachedClaimRetry = resolved;
      else cachedArchiveClaimRetry = resolved;
      return safeMutationId;
    }
    if (cache && cache.fingerprint === fingerprint && normalizeSafeId(cache.mutationId)) {
      return cache.mutationId;
    }
    const mutationId = buildRequestId(
      cacheKey === "submit"
        ? "fchron-submit"
        : cacheKey === "claim"
          ? "fchron-claim"
          : "farchive-claim"
    );
    const resolved = { fingerprint, mutationId };
    if (cacheKey === "submit") cachedSubmitRetry = resolved;
    else if (cacheKey === "claim") cachedClaimRetry = resolved;
    else cachedArchiveClaimRetry = resolved;
    return mutationId;
  }

  function createMissingMethodFailure(methodName = "", fallbackMessage = "命途长卷服务未就绪") {
    return {
      success: false,
      reason: "fate_chronicle_client_unavailable",
      message: `${fallbackMessage} (${methodName})`
    };
  }

  function buildSuccessPatch(kind, result) {
    const patch = {
      pending: null,
      lastError: null
    };
    const snapshot = extractCurrentSnapshot(result, {
      allowEnvelope: kind === "current" || kind === "start" || kind === "submit" || kind === "claim"
    });
    if (snapshot) {
      patch.current = snapshot;
    } else if (kind === "current") {
      patch.current = null;
    }
    if (kind === "current" && Object.prototype.hasOwnProperty.call(result || {}, "archiveError")) {
      patch.archiveError = result.archiveError || null;
    } else if (kind === "current" && !patch.archiveError) {
      patch.archiveError = null;
    }
    const archive = extractWeeklyArchiveSnapshot(result, { allowEnvelope: kind === "current" || kind === "archive" });
    if (archive) {
      patch.weeklyArchive = archive;
    }
    if (kind === "archive" && !archive) {
      patch.weeklyArchive = null;
    }
    const attempt = extractAttempt(result);
    if (kind === "current" || kind === "start" || kind === "submit") {
      patch.attempt = attempt.found ? attempt.value : (kind === "current" ? null : state.attempt);
    }
    const run = extractRun(result);
    if (kind === "current" || kind === "start" || kind === "submit") {
      patch.activeRun = run.found ? run.value : (kind === "current" ? null : state.activeRun);
    }
    const submission = extractResultRecord(result);
    if (kind === "submit" && submission.found) {
      patch.lastResult = submission.value;
    }
    const claim = extractClaimRecord(result);
    if (kind === "claim" && claim.found) {
      patch.lastClaim = claim.value;
    }
    const foundationClaim = extractFoundationClaimRecord(result);
    if (kind === "claimArchive" && foundationClaim.found) {
      patch.lastFoundationClaim = foundationClaim.value;
    }
    return patch;
  }

  async function performRequest(kind, requestFactory, {
    expectedUserId = "",
    pending = {},
    fallbackFailureMessage = "命途长卷请求失败"
  } = {}) {
    const boundUserId = getBoundUserId(expectedUserId);
    if (!boundUserId) {
      const failure = {
        success: false,
        reason: "fate_chronicle_account_changed",
        message: "登录账号已变化，请刷新命途长卷后重试"
      };
      publish({
        pending: null,
        lastError: failure
      });
      return failure;
    }
    const isRead = kind === "current" || kind === "archive";
    const observedGeneration = requestGeneration;
    const observedMutationEpoch = mutationEpoch;
    const observedCompletedMutationEpoch = completedMutationEpoch;
    const observedRequestEpoch = isRead
      ? ++readEpochs[kind]
      : ++mutationEpoch;
    if (!isRead) activeMutationCount += 1;
    publish({
      expectedUserId: boundUserId,
      pending: {
        kind,
        ...cloneData(pending),
        startedAt: now()
      },
      lastError: null
    });
    let result = null;
    try {
      result = await requestFactory(boundUserId);
    } catch (error) {
      result = {
        success: false,
        error,
        message: error && error.message ? error.message : fallbackFailureMessage
      };
    }
    if (!isRead && observedGeneration === requestGeneration) {
      activeMutationCount = Math.max(0, activeMutationCount - 1);
      completedMutationEpoch = Math.max(completedMutationEpoch, observedRequestEpoch);
    }
    const requestWasSuperseded = observedGeneration !== requestGeneration
      || (isRead
        ? observedRequestEpoch !== readEpochs[kind]
          || observedMutationEpoch !== mutationEpoch
          || observedCompletedMutationEpoch !== completedMutationEpoch
          || activeMutationCount > 0
        : observedRequestEpoch !== mutationEpoch);
    if (requestWasSuperseded) {
      return {
        ...(result && typeof result === "object" ? result : { success: false, message: fallbackFailureMessage }),
        suppressed: true
      };
    }
    if (!isExpectedUserCurrent(boundUserId)) {
      const failure = {
        success: false,
        reason: "fate_chronicle_account_changed",
        message: "登录账号已变化，旧命途长卷回执未应用"
      };
      publish({
        pending: null,
        lastError: failure
      });
      return failure;
    }
    if (!result || result.success === false) {
      const failure = normalizeFailure(result, fallbackFailureMessage);
      publish({
        pending: null,
        lastError: failure
      });
      return result || failure;
    }
    if (kind === "start") cachedStartRetry = null;
    if (kind === "submit") cachedSubmitRetry = null;
    if (kind === "claim") cachedClaimRetry = null;
    if (kind === "claimArchive") cachedArchiveClaimRetry = null;
    publish(buildSuccessPatch(kind, result));
    return result;
  }

  async function current({
    expectedUserId = ""
  } = {}) {
    if (!client || typeof client.getFateChronicleCurrent !== "function") {
      const failure = createMissingMethodFailure("getFateChronicleCurrent", "命途长卷当前状态读取未就绪");
      publish({ lastError: failure });
      return failure;
    }
    return await performRequest(
      "current",
      boundUserId => client.getFateChronicleCurrent({ expectedUserId: boundUserId }),
      {
        expectedUserId,
        fallbackFailureMessage: "命途长卷当前状态读取失败"
      }
    );
  }

  async function start({
    rotationId = "",
    chapterId = "",
    oathId = "",
    vowId = "",
    clientAttemptId = "",
    mutationId = "",
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = "",
    forceNew = false
  } = {}) {
    if (!client || typeof client.startFateChronicleAttempt !== "function") {
      const failure = createMissingMethodFailure("startFateChronicleAttempt", "命途长卷发车未就绪");
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    const safeChapterId = normalizeSafeId(chapterId);
    const safeOathId = normalizeSafeId(oathId);
    const safeVowId = normalizeSafeId(vowId);
    const effectiveOathId = safeOathId || safeVowId;
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: "fate_chronicle_missing_rotation",
        message: "命途长卷 rotationId 缺失"
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeChapterId) {
      const failure = {
        success: false,
        reason: "fate_chronicle_missing_chapter",
        message: "命途长卷 chapterId 缺失"
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!effectiveOathId) {
      const failure = {
        success: false,
        reason: "fate_chronicle_missing_oath",
        message: "命途长卷 oathId 缺失"
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const boundUserId = getBoundUserId(expectedUserId);
    const retryIds = resolveStartRetry({
      rotationId: safeRotationId,
      chapterId: safeChapterId,
      vowId: effectiveOathId,
      protocolVersion: safeProtocolVersion,
      requestedClientAttemptId: clientAttemptId,
      requestedMutationId: mutationId,
      forceNew: forceNew === true,
      boundUserId
    });
    return await performRequest(
      "start",
      requestUserId => client.startFateChronicleAttempt({
        protocolVersion: safeProtocolVersion,
        rotationId: safeRotationId,
        chapterId: safeChapterId,
        oathId: effectiveOathId,
        clientAttemptId: retryIds.clientAttemptId,
        mutationId: retryIds.mutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          rotationId: safeRotationId,
          chapterId: safeChapterId,
          oathId: effectiveOathId,
          clientAttemptId: retryIds.clientAttemptId,
          mutationId: retryIds.mutationId
        },
        fallbackFailureMessage: "命途长卷发车失败"
      }
    );
  }

  async function submit({
    runId = "",
    mutationId = "",
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ""
  } = {}) {
    if (!client || typeof client.submitFateChronicleResult !== "function") {
      const failure = createMissingMethodFailure("submitFateChronicleResult", "命途长卷结算提交未就绪");
      publish({ lastError: failure });
      return failure;
    }
    const safeRunId = normalizeSafeId(runId) || getRunIdFromState(state);
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: "fate_chronicle_missing_run",
        message: "命途长卷 runId 缺失"
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry("submit", {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      runId: safeRunId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      "submit",
      requestUserId => client.submitFateChronicleResult({
        protocolVersion: safeProtocolVersion,
        runId: safeRunId,
        mutationId: resolvedMutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          runId: safeRunId,
          mutationId: resolvedMutationId
        },
        fallbackFailureMessage: "命途长卷结算提交失败"
      }
    );
  }

  async function claimReward({
    rotationId = "",
    milestoneId = "",
    mutationId = "",
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ""
  } = {}) {
    if (!client || typeof client.claimFateChronicleReward !== "function") {
      const failure = createMissingMethodFailure("claimFateChronicleReward", "命途长卷奖励领取未就绪");
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    const safeMilestoneId = normalizeMilestoneId(milestoneId);
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: "fate_chronicle_missing_rotation",
        message: "命途长卷 rotationId 缺失"
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeMilestoneId) {
      const failure = {
        success: false,
        reason: "fate_chronicle_missing_milestone",
        message: "命途长卷 milestoneId 缺失"
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry("claim", {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      rotationId: safeRotationId,
      milestoneId: safeMilestoneId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      "claim",
      requestUserId => client.claimFateChronicleReward(safeMilestoneId, {
        protocolVersion: safeProtocolVersion,
        rotationId: safeRotationId,
        milestoneId: safeMilestoneId,
        mutationId: resolvedMutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          rotationId: safeRotationId,
          milestoneId: safeMilestoneId,
          mutationId: resolvedMutationId
        },
        fallbackFailureMessage: "命途长卷奖励领取失败"
      }
    );
  }

  async function loadArchive({
    expectedUserId = ""
  } = {}) {
    if (!client || typeof client.getWeeklyArchiveCurrent !== "function") {
      const failure = createMissingMethodFailure("getWeeklyArchiveCurrent", "三证归卷当前状态读取未就绪");
      publish({ weeklyArchive: null, archiveError: failure });
      return failure;
    }
    const result = await performRequest(
      "archive",
      boundUserId => client.getWeeklyArchiveCurrent({ expectedUserId: boundUserId }),
      {
        expectedUserId,
        fallbackFailureMessage: "三证归卷当前状态读取失败"
      }
    );
    if (result && result.success === false) {
      publish({
        weeklyArchive: null,
        archiveError: normalizeFailure(result, "三证归卷当前状态读取失败")
      });
    } else if (result && result.success !== false) {
      publish({
        archiveError: null
      });
    }
    return result;
  }

  async function claimArchive({
    cycleId = "",
    mutationId = "",
    protocolVersion = DEFAULT_WEEKLY_ARCHIVE_PROTOCOL_VERSION,
    expectedUserId = ""
  } = {}) {
    if (!client || typeof client.claimWeeklyArchiveFoundation !== "function") {
      const failure = createMissingMethodFailure("claimWeeklyArchiveFoundation", "三证归卷基础奖励领取未就绪");
      publish({ lastError: failure });
      return failure;
    }
    const safeCycleId = normalizeSafeId(cycleId) || getCycleIdFromState(state);
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_WEEKLY_ARCHIVE_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry("claimArchive", {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      cycleId: safeCycleId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      "claimArchive",
      requestUserId => client.claimWeeklyArchiveFoundation({
        protocolVersion: safeProtocolVersion,
        cycleId: safeCycleId || undefined,
        mutationId: resolvedMutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          cycleId: safeCycleId,
          mutationId: resolvedMutationId
        },
        fallbackFailureMessage: "三证归卷基础奖励领取失败"
      }
    );
  }

  return {
    getState,
    subscribe,
    reset,
    current,
    start,
    submit,
    claimReward,
    loadArchive,
    claimArchive
  };
}

export const FateChronicleService = createFateChronicleService();
