import { BackendClient } from "./backend-client.js";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_MILESTONE_ID = /^[A-Za-z0-9._:-]{2,48}$/;
const DEFAULT_PROTOCOL_VERSION = 'authoritative-challenge-ladder-v1';
const DEFAULT_STATE = Object.freeze({
  current: null,
  attempt: null,
  lastResult: null,
  lastClaim: null,
  pending: null,
  lastError: null,
  expectedUserId: '',
  updatedAt: 0
});

function cloneData(value) {
  if (value === undefined || value === null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    if (Array.isArray(value)) return value.slice();
    if (typeof value === 'object') return { ...value };
    return value;
  }
}

function normalizeUserId(user) {
  return String(user && (user.objectId || user.id || user.userId || user.username) || '').trim();
}

function normalizeSafeId(value) {
  const text = String(value || '').trim();
  return SAFE_ID.test(text) ? text : '';
}

function normalizeMilestoneId(value) {
  const text = String(value || '').trim();
  return SAFE_MILESTONE_ID.test(text) ? text : '';
}

function normalizeFailure(result = {}, fallbackMessage = '众生试炼请求失败') {
  const failure = {
    success: false,
    message: result && result.message ? result.message : fallbackMessage
  };
  if (result && result.reason) failure.reason = result.reason;
  return failure;
}

function sanitizeSnapshotEnvelope(result) {
  const snapshot = cloneData(result);
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  delete snapshot.success;
  delete snapshot.message;
  delete snapshot.reason;
  delete snapshot.error;
  delete snapshot.suppressed;
  return snapshot;
}

function looksLikeCurrentSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [
    'rotation',
    'rotationId',
    'leaderboard',
    'entries',
    'topEntries',
    'attemptLimit',
    'remainingAttempts',
    'allowance',
    'resumableAttempt',
    'recoverableAttempt',
    'activeAttempt',
    'currentAttempt',
    'personalBest',
    'myRank',
    'milestones',
    'rewardMilestones'
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function readPath(source, path = []) {
  let cursor = source;
  for (const key of path) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, key)) {
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

function extractCurrentSnapshot(result, { allowEnvelope = true } = {}) {
  const direct = findCandidateValue(result, [
    ['current'],
    ['snapshot'],
    ['state'],
    ['dashboard'],
    ['challengeLadder'],
    ['ladder']
  ]);
  if (direct.found && direct.value && typeof direct.value === 'object' && !Array.isArray(direct.value)) {
    return direct.value;
  }
  if (allowEnvelope && looksLikeCurrentSnapshot(result)) {
    return sanitizeSnapshotEnvelope(result);
  }
  return null;
}

function extractAttempt(result) {
  return findCandidateValue(result, [
    ['attempt'],
    ['resumableAttempt'],
    ['currentAttempt'],
    ['activeAttempt'],
    ['recoverableAttempt'],
    ['current', 'attempt'],
    ['current', 'resumableAttempt'],
    ['current', 'currentAttempt'],
    ['current', 'activeAttempt'],
    ['current', 'recoverableAttempt'],
    ['snapshot', 'attempt'],
    ['snapshot', 'resumableAttempt'],
    ['snapshot', 'currentAttempt'],
    ['snapshot', 'activeAttempt'],
    ['snapshot', 'recoverableAttempt'],
    ['state', 'attempt'],
    ['state', 'resumableAttempt'],
    ['state', 'currentAttempt'],
    ['state', 'activeAttempt'],
    ['state', 'recoverableAttempt']
  ]);
}

function extractResultRecord(result) {
  return findCandidateValue(result, [
    ['result'],
    ['submission'],
    ['submittedResult']
  ]);
}

function extractClaimRecord(result) {
  return findCandidateValue(result, [
    ['claim'],
    ['rewardClaim'],
    ['reward']
  ]);
}

function getRotationIdFromState(state) {
  return normalizeSafeId(
    state && state.current && (
      state.current.rotationId
      || state.current.rotation && state.current.rotation.rotationId
      || state.current.rotation && state.current.rotation.id
    )
  );
}

function getRunIdFromState(state) {
  return normalizeSafeId(
    state && state.attempt && (
      state.attempt.runId
      || state.attempt.run && state.attempt.run.runId
      || state.attempt.resumableAttempt && state.attempt.resumableAttempt.runId
      || state.attempt.authoritativeRun && state.attempt.authoritativeRun.runId
    )
  );
}

export function createChallengeLadderService({
  client = BackendClient,
  onChange = null,
  now = () => Date.now()
} = {}) {
  const listeners = new Set();
  let state = {
    ...DEFAULT_STATE,
    updatedAt: now()
  };
  let requestEpoch = 0;
  let cachedStartRetry = null;
  let cachedSubmitRetry = null;
  let cachedClaimRetry = null;

  function getCurrentUserId() {
    try {
      return normalizeUserId(client && typeof client.getCurrentUser === 'function' ? client.getCurrentUser() : null);
    } catch (error) {
      return '';
    }
  }

  function getBoundUserId(expectedUserId = '') {
    return String(expectedUserId || state.expectedUserId || getCurrentUserId()).trim();
  }

  function isExpectedUserCurrent(expectedUserId = '') {
    const safeExpectedUserId = normalizeSafeId(expectedUserId) || String(expectedUserId || '').trim();
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
    if (typeof onChange === 'function') {
      try {
        onChange(snapshot);
      } catch (error) {}
    }
    return snapshot;
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    if (emitCurrent) {
      try {
        listener(getState());
      } catch (error) {}
    }
    return () => listeners.delete(listener);
  }

  function reset() {
    requestEpoch += 1;
    cachedStartRetry = null;
    cachedSubmitRetry = null;
    cachedClaimRetry = null;
    return publish({
      ...DEFAULT_STATE
    });
  }

  function buildRequestId(prefix = 'acl') {
    if (client && typeof client.createAuthoritativeRunRequestId === 'function') {
      return client.createAuthoritativeRunRequestId(prefix);
    }
    if (client && typeof client.createMutationId === 'function') {
      return `${String(prefix || 'acl').replace(/[^A-Za-z0-9._:-]/g, '') || 'acl'}-${client.createMutationId().replace(/^mutation-/, '')}`;
    }
    return `${String(prefix || 'acl').replace(/[^A-Za-z0-9._:-]/g, '') || 'acl'}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function resolveStartRetry({
    rotationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    requestedClientAttemptId = '',
    requestedMutationId = '',
    forceNew = false,
    boundUserId = ''
  } = {}) {
    if (forceNew) cachedStartRetry = null;
    const safeClientAttemptId = normalizeSafeId(requestedClientAttemptId);
    const safeMutationId = normalizeSafeId(requestedMutationId);
    const fingerprint = JSON.stringify({
      rotationId: normalizeSafeId(rotationId),
      protocolVersion: normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION,
      userId: String(boundUserId || '').trim(),
      requestedClientAttemptId: safeClientAttemptId,
      requestedMutationId: safeMutationId
    });
    if (cachedStartRetry && cachedStartRetry.fingerprint === fingerprint) {
      return {
        clientAttemptId: cachedStartRetry.clientAttemptId,
        mutationId: cachedStartRetry.mutationId
      };
    }
    if (safeClientAttemptId || safeMutationId) {
      cachedStartRetry = {
        fingerprint,
        clientAttemptId: safeClientAttemptId || buildRequestId('acl-attempt'),
        mutationId: safeMutationId || buildRequestId('acl-start')
      };
      return {
        clientAttemptId: cachedStartRetry.clientAttemptId,
        mutationId: cachedStartRetry.mutationId
      };
    }
    cachedStartRetry = {
      fingerprint,
      clientAttemptId: buildRequestId('acl-attempt'),
      mutationId: buildRequestId('acl-start')
    };
    return {
      clientAttemptId: cachedStartRetry.clientAttemptId,
      mutationId: cachedStartRetry.mutationId
    };
  }

  function resolveMutationRetry(cacheKey, {
    requestedMutationId = '',
    boundUserId = '',
    ...fingerprintSource
  } = {}) {
    const safeMutationId = normalizeSafeId(requestedMutationId);
    const fingerprint = JSON.stringify({
      ...fingerprintSource,
      userId: String(boundUserId || '').trim()
    });
    const cache = cacheKey === 'submit' ? cachedSubmitRetry : cachedClaimRetry;
    if (safeMutationId) {
      const resolved = {
        fingerprint,
        mutationId: safeMutationId
      };
      if (cacheKey === 'submit') cachedSubmitRetry = resolved;
      else cachedClaimRetry = resolved;
      return safeMutationId;
    }
    if (cache && cache.fingerprint === fingerprint && normalizeSafeId(cache.mutationId)) {
      return cache.mutationId;
    }
    const mutationId = buildRequestId(cacheKey === 'submit' ? 'acl-submit' : 'acl-claim');
    const resolved = { fingerprint, mutationId };
    if (cacheKey === 'submit') cachedSubmitRetry = resolved;
    else cachedClaimRetry = resolved;
    return mutationId;
  }

  function createMissingMethodFailure(methodName = '', fallbackMessage = '众生试炼服务未就绪') {
    return {
      success: false,
      reason: 'challenge_ladder_client_unavailable',
      message: `${fallbackMessage} (${methodName})`
    };
  }

  function buildSuccessPatch(kind, result) {
    const patch = {
      pending: null,
      lastError: null
    };
    const snapshot = extractCurrentSnapshot(result, { allowEnvelope: kind === 'current' });
    if (snapshot) {
      patch.current = snapshot;
    }
    const attempt = extractAttempt(result);
    if (kind === 'current' || kind === 'start' || kind === 'submit') {
      if (attempt.found) {
        patch.attempt = attempt.value;
      }
    }
    const submission = extractResultRecord(result);
    if (kind === 'submit' && submission.found) {
      patch.lastResult = submission.value;
    }
    const claim = extractClaimRecord(result);
    if (kind === 'claim' && claim.found) {
      patch.lastClaim = claim.value;
    }
    return patch;
  }

  async function performRequest(kind, requestFactory, {
    expectedUserId = '',
    pending = {},
    fallbackFailureMessage = '众生试炼请求失败'
  } = {}) {
    const boundUserId = getBoundUserId(expectedUserId);
    if (!boundUserId) {
      const failure = {
        success: false,
        reason: 'challenge_ladder_account_changed',
        message: '登录账号已变化，请刷新众生试炼后重试'
      };
      publish({
        pending: null,
        lastError: failure
      });
      return failure;
    }
    const observedRequestEpoch = ++requestEpoch;
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
    if (observedRequestEpoch !== requestEpoch) {
      return {
        ...(result && typeof result === 'object' ? result : { success: false, message: fallbackFailureMessage }),
        suppressed: true
      };
    }
    if (!isExpectedUserCurrent(boundUserId)) {
      const failure = {
        success: false,
        reason: 'challenge_ladder_account_changed',
        message: '登录账号已变化，旧众生试炼回执未应用'
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
    if (kind === 'start') cachedStartRetry = null;
    if (kind === 'submit') cachedSubmitRetry = null;
    if (kind === 'claim') cachedClaimRetry = null;
    publish(buildSuccessPatch(kind, result));
    return result;
  }

  async function current({
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.getChallengeLadderCurrent !== 'function') {
      const failure = createMissingMethodFailure('getChallengeLadderCurrent', '众生试炼当前状态读取未就绪');
      publish({ lastError: failure });
      return failure;
    }
    return await performRequest(
      'current',
      boundUserId => client.getChallengeLadderCurrent({ expectedUserId: boundUserId }),
      {
        expectedUserId,
        fallbackFailureMessage: '众生试炼当前状态读取失败'
      }
    );
  }

  async function start({
    rotationId = '',
    clientAttemptId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = '',
    forceNew = false
  } = {}) {
    if (!client || typeof client.startChallengeLadderAttempt !== 'function') {
      const failure = createMissingMethodFailure('startChallengeLadderAttempt', '众生试炼发车未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: 'challenge_ladder_missing_rotation',
        message: '众生试炼 rotationId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const boundUserId = getBoundUserId(expectedUserId);
    const retryIds = resolveStartRetry({
      rotationId: safeRotationId,
      protocolVersion: safeProtocolVersion,
      requestedClientAttemptId: clientAttemptId,
      requestedMutationId: mutationId,
      forceNew: forceNew === true,
      boundUserId
    });
    return await performRequest(
      'start',
      requestUserId => client.startChallengeLadderAttempt({
        protocolVersion: safeProtocolVersion,
        rotationId: safeRotationId,
        clientAttemptId: retryIds.clientAttemptId,
        mutationId: retryIds.mutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          rotationId: safeRotationId,
          clientAttemptId: retryIds.clientAttemptId,
          mutationId: retryIds.mutationId
        },
        fallbackFailureMessage: '众生试炼发车失败'
      }
    );
  }

  async function submit({
    runId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.submitChallengeLadderResult !== 'function') {
      const failure = createMissingMethodFailure('submitChallengeLadderResult', '众生试炼结算提交未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRunId = normalizeSafeId(runId) || getRunIdFromState(state);
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'challenge_ladder_missing_run',
        message: '众生试炼 runId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry('submit', {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      runId: safeRunId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      'submit',
      requestUserId => client.submitChallengeLadderResult({
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
        fallbackFailureMessage: '众生试炼结算提交失败'
      }
    );
  }

  async function claim({
    rotationId = '',
    milestoneId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.claimChallengeLadderReward !== 'function') {
      const failure = createMissingMethodFailure('claimChallengeLadderReward', '众生试炼奖励领取未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    const safeMilestoneId = normalizeMilestoneId(milestoneId);
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: 'challenge_ladder_missing_rotation',
        message: '众生试炼 rotationId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeMilestoneId) {
      const failure = {
        success: false,
        reason: 'challenge_ladder_missing_milestone',
        message: '众生试炼 milestoneId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry('claim', {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      rotationId: safeRotationId,
      milestoneId: safeMilestoneId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      'claim',
      requestUserId => client.claimChallengeLadderReward(safeMilestoneId, {
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
        fallbackFailureMessage: '众生试炼奖励领取失败'
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
    claim
  };
}

export const ChallengeLadderService = createChallengeLadderService();
