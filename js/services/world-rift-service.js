import { BackendClient } from "./backend-client.js";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_MILESTONE_ID = /^[A-Za-z0-9._:-]{2,48}$/;
const SAFE_DIRECTIVE_ID = /^[A-Za-z0-9._:-]{2,64}$/;
const DEFAULT_PROTOCOL_VERSION = 'authoritative-world-rift-v1';
const DEFAULT_STATE = Object.freeze({
  current: null,
  world: null,
  leaderboard: null,
  attempt: null,
  contribution: null,
  directives: null,
  directiveDeltas: null,
  claim: null,
  previousClaim: null,
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

function normalizeDirectiveId(value) {
  const text = String(value || '').trim();
  return SAFE_DIRECTIVE_ID.test(text) ? text : '';
}

function normalizeFailure(result = {}, fallbackMessage = '世界裂隙请求失败') {
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
    'world',
    'worldState',
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
    'contribution',
    'personalContribution',
    'rewardMilestones',
    'previousClaim',
    'previousGrace'
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function looksLikeWorldState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [
    'phase',
    'phaseId',
    'currentPhaseIndex',
    'currentPhase',
    'remainingHp',
    'phaseHp',
    'totalContribution',
    'stateVersion',
    'status',
    'clearedAt',
    'isEcho',
    'echo'
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function looksLikeLeaderboard(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return true;
  return [
    'entries',
    'topEntries',
    'rows',
    'rankings',
    'myRank',
    'self',
    'totalEntries'
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function looksLikeContribution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [
    'contributionId',
    'runId',
    'resultId',
    'contribution',
    'rankedContribution',
    'totalContribution',
    'appliedDamage',
    'stateVersion',
    'completedRuns'
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
    ['worldRift'],
    ['rift']
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

function extractContribution(result) {
  return findCandidateValue(result, [
    ['contribution'],
    ['submission'],
    ['submittedContribution'],
    ['result'],
    ['personalContribution'],
    ['entry'],
    ['self'],
    ['current', 'contribution'],
    ['current', 'personalContribution'],
    ['current', 'entry'],
    ['current', 'self'],
    ['snapshot', 'contribution'],
    ['snapshot', 'personalContribution'],
    ['snapshot', 'entry'],
    ['snapshot', 'self'],
    ['state', 'contribution'],
    ['state', 'personalContribution'],
    ['state', 'entry'],
    ['state', 'self']
  ]);
}

function extractClaimRecord(result) {
  return findCandidateValue(result, [
    ['claim'],
    ['rewardClaim'],
    ['reward'],
    ['claimedReward']
  ]);
}

function extractPreviousClaim(result) {
  return findCandidateValue(result, [
    ['previousClaim'],
    ['previousGrace'],
    ['previousRotation'],
    ['previousRewardClaim'],
    ['current', 'previousClaim'],
    ['current', 'previousGrace'],
    ['current', 'previousRotation'],
    ['snapshot', 'previousClaim'],
    ['snapshot', 'previousGrace'],
    ['snapshot', 'previousRotation'],
    ['state', 'previousClaim'],
    ['state', 'previousGrace'],
    ['state', 'previousRotation']
  ]);
}

function extractDirectives(result) {
  return findCandidateValue(result, [
    ['directives'],
    ['current', 'directives'],
    ['snapshot', 'directives'],
    ['state', 'directives']
  ]);
}

function extractDirectiveDeltas(result) {
  return findCandidateValue(result, [
    ['directiveDeltas'],
    ['contribution', 'directiveDeltas'],
    ['submission', 'directiveDeltas'],
    ['result', 'directiveDeltas']
  ]);
}

function extractWorld(result) {
  return findCandidateValue(result, [
    ['world'],
    ['worldState'],
    ['bossState'],
    ['current', 'world'],
    ['current', 'worldState'],
    ['current', 'bossState'],
    ['snapshot', 'world'],
    ['snapshot', 'worldState'],
    ['snapshot', 'bossState'],
    ['state', 'world'],
    ['state', 'worldState'],
    ['state', 'bossState']
  ]);
}

function extractLeaderboard(result) {
  return findCandidateValue(result, [
    ['leaderboard'],
    ['rankings'],
    ['board'],
    ['current', 'leaderboard'],
    ['current', 'rankings'],
    ['current', 'board'],
    ['snapshot', 'leaderboard'],
    ['snapshot', 'rankings'],
    ['snapshot', 'board'],
    ['state', 'leaderboard'],
    ['state', 'rankings'],
    ['state', 'board']
  ]);
}

function normalizeLeaderboardValue(value, snapshot = null) {
  if (Array.isArray(value)) {
    return { entries: cloneData(value) };
  }
  if (value && typeof value === 'object') {
    return cloneData(value);
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const entriesSource = findCandidateValue(snapshot, [
    ['entries'],
    ['topEntries'],
    ['rows'],
    ['rankings']
  ]);
  const myRankSource = findCandidateValue(snapshot, [['myRank']]);
  const selfSource = findCandidateValue(snapshot, [['self'], ['entry'], ['personalBest']]);
  const totalEntriesSource = findCandidateValue(snapshot, [['totalEntries']]);
  if (!entriesSource.found && !myRankSource.found && !selfSource.found && !totalEntriesSource.found) {
    return null;
  }
  const normalized = {};
  if (entriesSource.found) {
    normalized.entries = Array.isArray(entriesSource.value) ? entriesSource.value : cloneData(entriesSource.value);
  }
  if (myRankSource.found) normalized.myRank = cloneData(myRankSource.value);
  if (selfSource.found) normalized.self = cloneData(selfSource.value);
  if (totalEntriesSource.found) normalized.totalEntries = totalEntriesSource.value;
  return normalized;
}

function normalizeWorldValue(value, snapshot = null) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return cloneData(value);
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || !looksLikeWorldState(snapshot)) {
    return null;
  }
  return cloneData(snapshot);
}

function normalizeDirectiveList(value) {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  return cloneData(value);
}

function getRotationIdFromState(state) {
  return normalizeSafeId(
    state && state.current && (
      state.current.rotationId
      || state.current.rotation && state.current.rotation.rotationId
      || state.current.rotation && state.current.rotation.id
      || state.current.world && state.current.world.rotationId
      || state.current.worldState && state.current.worldState.rotationId
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

export function createWorldRiftService({
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

  function buildRequestId(prefix = 'rift') {
    if (client && typeof client.createAuthoritativeRunRequestId === 'function') {
      return client.createAuthoritativeRunRequestId(prefix);
    }
    if (client && typeof client.createMutationId === 'function') {
      return `${String(prefix || 'rift').replace(/[^A-Za-z0-9._:-]/g, '') || 'rift'}-${client.createMutationId().replace(/^mutation-/, '')}`;
    }
    return `${String(prefix || 'rift').replace(/[^A-Za-z0-9._:-]/g, '') || 'rift'}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
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
        clientAttemptId: safeClientAttemptId || buildRequestId('rift-attempt'),
        mutationId: safeMutationId || buildRequestId('rift-start')
      };
      return {
        clientAttemptId: cachedStartRetry.clientAttemptId,
        mutationId: cachedStartRetry.mutationId
      };
    }
    cachedStartRetry = {
      fingerprint,
      clientAttemptId: buildRequestId('rift-attempt'),
      mutationId: buildRequestId('rift-start')
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
    const mutationId = buildRequestId(cacheKey === 'submit' ? 'rift-submit' : 'rift-claim');
    const resolved = { fingerprint, mutationId };
    if (cacheKey === 'submit') cachedSubmitRetry = resolved;
    else cachedClaimRetry = resolved;
    return mutationId;
  }

  function createMissingMethodFailure(methodName = '', fallbackMessage = '世界裂隙服务未就绪') {
    return {
      success: false,
      reason: 'world_rift_client_unavailable',
      message: `${fallbackMessage} (${methodName})`
    };
  }

  function buildSuccessPatch(kind, result, { preserveDirectiveDeltas = false } = {}) {
    const patch = {
      pending: null,
      lastError: null
    };
    const snapshot = extractCurrentSnapshot(result, { allowEnvelope: kind === 'current' });
    if (snapshot) {
      patch.current = snapshot;
    }
    const world = extractWorld(result);
    if (world.found) {
      patch.world = normalizeWorldValue(world.value, snapshot);
    } else if (snapshot) {
      const derivedWorld = normalizeWorldValue(null, snapshot);
      if (derivedWorld !== null) patch.world = derivedWorld;
    }
    const leaderboard = extractLeaderboard(result);
    if (leaderboard.found) {
      patch.leaderboard = normalizeLeaderboardValue(leaderboard.value, snapshot);
    } else if (snapshot) {
      const derivedLeaderboard = normalizeLeaderboardValue(null, snapshot);
      if (derivedLeaderboard !== null) patch.leaderboard = derivedLeaderboard;
    }
    const attempt = extractAttempt(result);
    if (kind === 'current' || kind === 'start' || kind === 'submit') {
      if (attempt.found) {
        patch.attempt = attempt.value;
      }
    }
    const contribution = extractContribution(result);
    if (contribution.found) {
      if (!snapshot || kind !== 'current' || looksLikeContribution(contribution.value) || contribution.value === null) {
        patch.contribution = contribution.value;
      }
    }
    const directives = extractDirectives(result);
    if (directives.found) {
      const normalizedDirectives = normalizeDirectiveList(directives.value);
      if (normalizedDirectives !== undefined) patch.directives = normalizedDirectives;
    } else if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'directives')) {
      const normalizedDirectives = normalizeDirectiveList(snapshot.directives);
      if (normalizedDirectives !== undefined) patch.directives = normalizedDirectives;
    }
    const directiveDeltas = extractDirectiveDeltas(result);
    if (!preserveDirectiveDeltas) patch.directiveDeltas = [];
    if (kind === 'submit' && directiveDeltas.found) {
      const normalizedDeltas = normalizeDirectiveList(directiveDeltas.value);
      if (normalizedDeltas !== undefined) patch.directiveDeltas = normalizedDeltas;
    }
    const claim = extractClaimRecord(result);
    if (claim.found) {
      patch.claim = claim.value;
    }
    const previousClaim = extractPreviousClaim(result);
    if (previousClaim.found) {
      patch.previousClaim = previousClaim.value;
    }
    return patch;
  }

  async function performRequest(kind, requestFactory, {
    expectedUserId = '',
    pending = {},
    preserveDirectiveDeltas = false,
    fallbackFailureMessage = '世界裂隙请求失败'
  } = {}) {
    const boundUserId = getBoundUserId(expectedUserId);
    if (!boundUserId) {
      const failure = {
        success: false,
        reason: 'world_rift_account_changed',
        message: '登录账号已变化，请刷新世界裂隙后重试'
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
        reason: 'world_rift_account_changed',
        message: '登录账号已变化，旧世界裂隙回执未应用'
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
    publish(buildSuccessPatch(kind, result, { preserveDirectiveDeltas }));
    return result;
  }

  async function current({
    expectedUserId = '',
    preserveDirectiveDeltas = false
  } = {}) {
    if (!client || typeof client.getWorldRiftCurrent !== 'function') {
      const failure = createMissingMethodFailure('getWorldRiftCurrent', '世界裂隙当前状态读取未就绪');
      publish({ lastError: failure });
      return failure;
    }
    return await performRequest(
      'current',
      boundUserId => client.getWorldRiftCurrent({ expectedUserId: boundUserId }),
      {
        expectedUserId,
        preserveDirectiveDeltas,
        fallbackFailureMessage: '世界裂隙当前状态读取失败'
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
    if (!client || typeof client.startWorldRiftAttempt !== 'function') {
      const failure = createMissingMethodFailure('startWorldRiftAttempt', '世界裂隙发车未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: 'world_rift_missing_rotation',
        message: '世界裂隙 rotationId 缺失'
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
      requestUserId => client.startWorldRiftAttempt({
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
        fallbackFailureMessage: '世界裂隙发车失败'
      }
    );
  }

  async function submit({
    runId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.submitWorldRiftContribution !== 'function') {
      const failure = createMissingMethodFailure('submitWorldRiftContribution', '世界裂隙结算提交未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRunId = normalizeSafeId(runId) || getRunIdFromState(state);
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'world_rift_missing_run',
        message: '世界裂隙 runId 缺失'
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
      requestUserId => client.submitWorldRiftContribution({
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
        fallbackFailureMessage: '世界裂隙结算提交失败'
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
    if (!client || typeof client.claimWorldRiftReward !== 'function') {
      const failure = createMissingMethodFailure('claimWorldRiftReward', '世界裂隙奖励领取未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    const safeMilestoneId = normalizeMilestoneId(milestoneId);
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: 'world_rift_missing_rotation',
        message: '世界裂隙 rotationId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeMilestoneId) {
      const failure = {
        success: false,
        reason: 'world_rift_missing_milestone',
        message: '世界裂隙 milestoneId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry('claim', {
      requestedMutationId: mutationId,
      claimKind: 'milestone',
      protocolVersion: safeProtocolVersion,
      rotationId: safeRotationId,
      milestoneId: safeMilestoneId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      'claim',
      requestUserId => client.claimWorldRiftReward(safeMilestoneId, {
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
        fallbackFailureMessage: '世界裂隙奖励领取失败'
      }
    );
  }

  async function claimDirective({
    rotationId = '',
    directiveId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.claimWorldRiftDirective !== 'function') {
      const failure = createMissingMethodFailure('claimWorldRiftDirective', '世界裂隙指令领取未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    const safeDirectiveId = normalizeDirectiveId(directiveId);
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: 'world_rift_missing_rotation',
        message: '世界裂隙 rotationId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeDirectiveId) {
      const failure = {
        success: false,
        reason: 'world_rift_missing_directive',
        message: '世界裂隙 directiveId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeSafeId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry('claim', {
      requestedMutationId: mutationId,
      claimKind: 'directive',
      protocolVersion: safeProtocolVersion,
      rotationId: safeRotationId,
      directiveId: safeDirectiveId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      'claim',
      requestUserId => client.claimWorldRiftDirective(safeDirectiveId, {
        protocolVersion: safeProtocolVersion,
        rotationId: safeRotationId,
        directiveId: safeDirectiveId,
        mutationId: resolvedMutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          rotationId: safeRotationId,
          directiveId: safeDirectiveId,
          mutationId: resolvedMutationId
        },
        fallbackFailureMessage: '世界裂隙指令领取失败'
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
    claim,
    claimDirective
  };
}

export const WorldRiftService = createWorldRiftService();
