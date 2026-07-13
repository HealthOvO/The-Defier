import { BackendClient } from "./backend-client.js";
import { AuthoritativeRunService } from "./authoritative-run-service.js";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_SHORT_ID = /^[A-Za-z0-9._:-]{2,64}$/;
const DEFAULT_PROTOCOL_VERSION = 'relay-expedition-v1';
const DEFAULT_STATE = Object.freeze({
  current: null,
  session: null,
  currentLeg: null,
  legClaim: null,
  lastPass: null,
  lastProjection: null,
  rewardClaim: null,
  authoritativeRun: null,
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

function normalizeShortId(value) {
  const text = String(value || '').trim();
  return SAFE_SHORT_ID.test(text) ? text : '';
}

function normalizeLegIndex(value) {
  const numeric = Number(value);
  const normalized = Math.floor(numeric);
  return Number.isFinite(numeric) && normalized >= 1 && normalized <= 4 ? normalized : null;
}

function normalizeFailure(result = {}, fallbackMessage = '同道远征请求失败') {
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
    'rotationId',
    'currentSession',
    'session',
    'previousSession',
    'previousSessions',
    'currentLeg',
    'activeLeg',
    'rewardMilestones',
    'milestones',
    'openClaimUntil'
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function looksLikeSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [
    'sessionId',
    'rotationId',
    'status',
    'currentLegIndex',
    'currentLeg',
    'activeLeg',
    'legs',
    'rewardMilestones',
    'milestones',
    'memberCount',
    'totalScore'
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function looksLikeLeg(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return [
    'legId',
    'legIndex',
    'sessionId',
    'status',
    'tacticId',
    'runId',
    'handoffOptions',
    'priorityUntil',
    'openClaimUntil',
    'activeLeaseUntil'
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));
}

function getProjectionVersion(projection) {
  const version = Number(
    projection && Object.prototype.hasOwnProperty.call(projection, 'version')
      ? projection.version
      : projection && Object.prototype.hasOwnProperty.call(projection, 'stateVersion')
        ? projection.stateVersion
        : null
  );
  return Number.isFinite(version) && version >= 0 ? Math.floor(version) : null;
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
    ['relayExpedition'],
    ['relay'],
    ['expedition']
  ]);
  if (direct.found && direct.value && typeof direct.value === 'object' && !Array.isArray(direct.value)) {
    return direct.value;
  }
  if (allowEnvelope && looksLikeCurrentSnapshot(result)) {
    return sanitizeSnapshotEnvelope(result);
  }
  return null;
}

function extractSession(result) {
  return findCandidateValue(result, [
    ['session'],
    ['currentSession'],
    ['relaySession'],
    ['expeditionSession'],
    ['current', 'session'],
    ['current', 'currentSession'],
    ['snapshot', 'session'],
    ['snapshot', 'currentSession'],
    ['state', 'session'],
    ['state', 'currentSession']
  ]);
}

function extractLeg(result) {
  return findCandidateValue(result, [
    ['leg'],
    ['currentLeg'],
    ['activeLeg'],
    ['reservedLeg'],
    ['claimedLeg'],
    ['relayLeg'],
    ['session', 'currentLeg'],
    ['session', 'activeLeg'],
    ['currentSession', 'currentLeg'],
    ['currentSession', 'activeLeg'],
    ['current', 'leg'],
    ['current', 'currentLeg'],
    ['current', 'activeLeg'],
    ['current', 'currentSession', 'currentLeg'],
    ['current', 'currentSession', 'activeLeg'],
    ['snapshot', 'leg'],
    ['snapshot', 'currentLeg'],
    ['snapshot', 'activeLeg'],
    ['snapshot', 'currentSession', 'currentLeg'],
    ['snapshot', 'currentSession', 'activeLeg'],
    ['state', 'leg'],
    ['state', 'currentLeg'],
    ['state', 'activeLeg'],
    ['state', 'currentSession', 'currentLeg'],
    ['state', 'currentSession', 'activeLeg']
  ]);
}

function extractLegClaimRecord(result) {
  return findCandidateValue(result, [
    ['claim'],
    ['legClaim'],
    ['reservation'],
    ['claimedLeg']
  ]);
}

function extractPassRecord(result) {
  return findCandidateValue(result, [
    ['pass'],
    ['batonPass'],
    ['handoff'],
    ['passResult']
  ]);
}

function extractProjectionRecord(result) {
  return findCandidateValue(result, [
    ['project'],
    ['projectionResult'],
    ['projectionReceipt'],
    ['receipt']
  ]);
}

function extractRewardClaimRecord(result) {
  return findCandidateValue(result, [
    ['claim'],
    ['rewardClaim'],
    ['reward'],
    ['claimedReward']
  ]);
}

function extractRunProjection(result, snapshot = null, leg = null) {
  const direct = findCandidateValue(result, [
    ['projection'],
    ['run', 'projection'],
    ['authoritativeRun', 'projection'],
    ['receipt', 'projection'],
    ['ticket', 'projection'],
    ['leg', 'projection'],
    ['claimedLeg', 'projection'],
    ['currentLeg', 'projection'],
    ['activeLeg', 'projection'],
    ['current', 'projection'],
    ['current', 'currentLeg', 'projection'],
    ['current', 'activeLeg', 'projection'],
    ['current', 'currentSession', 'currentLeg', 'projection'],
    ['current', 'currentSession', 'activeLeg', 'projection'],
    ['session', 'currentLeg', 'projection'],
    ['session', 'activeLeg', 'projection'],
    ['currentSession', 'currentLeg', 'projection'],
    ['currentSession', 'activeLeg', 'projection']
  ]);
  if (direct.found && direct.value && typeof direct.value === 'object' && !Array.isArray(direct.value)) {
    return direct.value;
  }
  const legProjection = leg && (
    leg.projection
    || leg.run && leg.run.projection
    || leg.authoritativeRun && leg.authoritativeRun.projection
  );
  if (legProjection && typeof legProjection === 'object' && !Array.isArray(legProjection)) {
    return cloneData(legProjection);
  }
  const snapshotProjection = snapshot && (
    snapshot.projection
    || snapshot.currentLeg && snapshot.currentLeg.projection
    || snapshot.currentLeg && snapshot.currentLeg.run && snapshot.currentLeg.run.projection
    || snapshot.activeLeg && snapshot.activeLeg.projection
    || snapshot.activeLeg && snapshot.activeLeg.run && snapshot.activeLeg.run.projection
    || snapshot.currentSession && snapshot.currentSession.currentLeg && snapshot.currentSession.currentLeg.projection
    || snapshot.currentSession && snapshot.currentSession.currentLeg && snapshot.currentSession.currentLeg.run && snapshot.currentSession.currentLeg.run.projection
    || snapshot.currentSession && snapshot.currentSession.activeLeg && snapshot.currentSession.activeLeg.projection
    || snapshot.currentSession && snapshot.currentSession.activeLeg && snapshot.currentSession.activeLeg.run && snapshot.currentSession.activeLeg.run.projection
  );
  if (snapshotProjection && typeof snapshotProjection === 'object' && !Array.isArray(snapshotProjection)) {
    return cloneData(snapshotProjection);
  }
  return null;
}

function normalizeSessionValue(value, snapshot = null) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return cloneData(value);
  }
  if (snapshot && looksLikeSession(snapshot)) {
    return cloneData(snapshot);
  }
  return null;
}

function normalizeLegValue(value, snapshot = null) {
  if (value === null) return null;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return cloneData(value);
  }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const fromSnapshot = findCandidateValue(snapshot, [
    ['currentLeg'],
    ['activeLeg'],
    ['session', 'currentLeg'],
    ['session', 'activeLeg'],
    ['currentSession', 'currentLeg'],
    ['currentSession', 'activeLeg']
  ]);
  if (fromSnapshot.found) {
    return fromSnapshot.value;
  }
  return looksLikeLeg(snapshot) ? cloneData(snapshot) : null;
}

function getSessionIdFromState(state) {
  return normalizeSafeId(
    state && (
      state.session && state.session.sessionId
      || state.current && state.current.sessionId
      || state.current && state.current.currentSession && state.current.currentSession.sessionId
      || state.current && state.current.session && state.current.session.sessionId
    )
  );
}

function getRotationIdFromState(state) {
  return normalizeSafeId(
    state && (
      state.session && state.session.rotationId
      || state.current && state.current.rotationId
      || state.current && state.current.session && state.current.session.rotationId
      || state.current && state.current.currentSession && state.current.currentSession.rotationId
    )
  );
}

function getCurrentLegIdFromState(state) {
  return normalizeSafeId(
    state && (
      state.currentLeg && state.currentLeg.legId
      || state.session && state.session.currentLeg && state.session.currentLeg.legId
      || state.session && state.session.activeLeg && state.session.activeLeg.legId
      || state.current && state.current.currentLeg && state.current.currentLeg.legId
      || state.current && state.current.activeLeg && state.current.activeLeg.legId
    )
  );
}

function getCurrentLegIndexFromState(state) {
  const direct = normalizeLegIndex(
    state && (
      state.currentLeg && state.currentLeg.legIndex
      || state.session && state.session.currentLeg && state.session.currentLeg.legIndex
      || state.session && state.session.activeLeg && state.session.activeLeg.legIndex
      || state.session && state.session.currentLegIndex
      || state.current && state.current.currentLeg && state.current.currentLeg.legIndex
      || state.current && state.current.activeLeg && state.current.activeLeg.legIndex
      || state.current && state.current.currentLegIndex
    )
  );
  return direct;
}

function getRunIdFromState(state) {
  return normalizeSafeId(
    state && (
      state.currentLeg && (
        state.currentLeg.runId
        || state.currentLeg.run && state.currentLeg.run.runId
      )
      || state.authoritativeRun && state.authoritativeRun.runId
      || state.session && state.session.currentLeg && (
        state.session.currentLeg.runId
        || state.session.currentLeg.run && state.session.currentLeg.run.runId
      )
      || state.current && state.current.currentLeg && (
        state.current.currentLeg.runId
        || state.current.currentLeg.run && state.current.currentLeg.run.runId
      )
      || state.current && state.current.activeLeg && (
        state.current.activeLeg.runId
        || state.current.activeLeg.run && state.current.activeLeg.run.runId
      )
    )
  );
}

function getRelayRunId({ source = null, snapshot = null, leg = null, projection = null } = {}) {
  return normalizeSafeId(
    projection && (
      projection.runId
      || projection.id
      || projection.run && projection.run.runId
    )
    || leg && (
      leg.runId
      || leg.run && leg.run.runId
      || leg.authoritativeRun && leg.authoritativeRun.runId
      || leg.projection && leg.projection.runId
    )
    || source && (
      source.runId
      || source.run && source.run.runId
      || source.authoritativeRun && source.authoritativeRun.runId
    )
    || snapshot && (
      snapshot.runId
      || snapshot.currentLeg && snapshot.currentLeg.runId
      || snapshot.currentLeg && snapshot.currentLeg.run && snapshot.currentLeg.run.runId
      || snapshot.activeLeg && snapshot.activeLeg.runId
      || snapshot.activeLeg && snapshot.activeLeg.run && snapshot.activeLeg.run.runId
      || snapshot.currentSession && snapshot.currentSession.currentLeg && snapshot.currentSession.currentLeg.runId
      || snapshot.currentSession && snapshot.currentSession.currentLeg && snapshot.currentSession.currentLeg.run && snapshot.currentSession.currentLeg.run.runId
      || snapshot.currentSession && snapshot.currentSession.activeLeg && snapshot.currentSession.activeLeg.runId
      || snapshot.currentSession && snapshot.currentSession.activeLeg && snapshot.currentSession.activeLeg.run && snapshot.currentSession.activeLeg.run.runId
    )
  );
}

function normalizeAuthoritativeStateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const cloned = cloneData(snapshot);
  const hasActivity = !!(
    normalizeSafeId(cloned.runId)
    || normalizeShortId(cloned.mode)
    || cloned.projection
    || cloned.pending
    || cloned.pendingReplay
    || cloned.lastError
    || cloned.lastReceipt
    || cloned.lastReplay
  );
  return hasActivity ? cloned : null;
}

export function createRelayExpeditionService({
  client = BackendClient,
  authoritativeRunService = AuthoritativeRunService,
  onChange = null,
  now = () => Date.now()
} = {}) {
  const listeners = new Set();
  let state = {
    ...DEFAULT_STATE,
    authoritativeRun: null,
    updatedAt: now()
  };
  let requestEpoch = 0;
  let cachedCreateRetry = null;
  let cachedClaimRetry = null;
  let cachedPassRetry = null;
  let cachedProjectRetry = null;
  let cachedRewardRetry = null;
  let lastRelayRunId = '';

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

  function mirrorAuthoritativeRun(snapshot) {
    const normalized = normalizeAuthoritativeStateSnapshot(snapshot);
    const safeRunId = normalizeSafeId(normalized && normalized.runId);
    const previousRunId = normalizeSafeId(state.authoritativeRun && state.authoritativeRun.runId);
    if (safeRunId) {
      if (!lastRelayRunId || safeRunId !== lastRelayRunId) return;
    } else if (previousRunId && previousRunId !== lastRelayRunId) {
      return;
    } else if (!lastRelayRunId && !previousRunId) {
      return;
    }
    publish({
      authoritativeRun: normalized
    });
  }

  if (authoritativeRunService && typeof authoritativeRunService.subscribe === 'function') {
    authoritativeRunService.subscribe(snapshot => {
      mirrorAuthoritativeRun(snapshot);
    }, { emitCurrent: false });
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

  function clearRelayRunHandoff() {
    const currentAuthoritativeState = authoritativeRunService && typeof authoritativeRunService.getState === 'function'
      ? normalizeAuthoritativeStateSnapshot(authoritativeRunService.getState())
      : null;
    const currentRunId = normalizeSafeId(currentAuthoritativeState && currentAuthoritativeState.runId);
    if (lastRelayRunId && currentRunId === lastRelayRunId && authoritativeRunService && typeof authoritativeRunService.reset === 'function') {
      authoritativeRunService.reset();
    }
    lastRelayRunId = '';
    return publish({ authoritativeRun: null });
  }

  function reset() {
    requestEpoch += 1;
    cachedCreateRetry = null;
    cachedClaimRetry = null;
    cachedPassRetry = null;
    cachedProjectRetry = null;
    cachedRewardRetry = null;
    clearRelayRunHandoff();
    return publish({
      ...DEFAULT_STATE,
      authoritativeRun: null
    });
  }

  function buildRequestId(prefix = 'relay') {
    if (client && typeof client.createAuthoritativeRunRequestId === 'function') {
      return client.createAuthoritativeRunRequestId(prefix);
    }
    if (client && typeof client.createMutationId === 'function') {
      return `${String(prefix || 'relay').replace(/[^A-Za-z0-9._:-]/g, '') || 'relay'}-${client.createMutationId().replace(/^mutation-/, '')}`;
    }
    return `${String(prefix || 'relay').replace(/[^A-Za-z0-9._:-]/g, '') || 'relay'}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function resolveCreateSessionRetry({
    rotationId = '',
    sourceSquadId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    requestedClientSessionId = '',
    requestedMutationId = '',
    forceNew = false,
    boundUserId = ''
  } = {}) {
    if (forceNew) cachedCreateRetry = null;
    const safeClientSessionId = normalizeSafeId(requestedClientSessionId);
    const safeMutationId = normalizeSafeId(requestedMutationId);
    const fingerprint = JSON.stringify({
      rotationId: normalizeSafeId(rotationId),
      sourceSquadId: normalizeSafeId(sourceSquadId),
      protocolVersion: normalizeShortId(protocolVersion) || DEFAULT_PROTOCOL_VERSION,
      userId: String(boundUserId || '').trim(),
      requestedClientSessionId: safeClientSessionId,
      requestedMutationId: safeMutationId
    });
    if (cachedCreateRetry && cachedCreateRetry.fingerprint === fingerprint) {
      return {
        clientSessionId: cachedCreateRetry.clientSessionId,
        mutationId: cachedCreateRetry.mutationId
      };
    }
    cachedCreateRetry = {
      fingerprint,
      clientSessionId: safeClientSessionId || buildRequestId('relay-session'),
      mutationId: safeMutationId || buildRequestId('relay-create')
    };
    return {
      clientSessionId: cachedCreateRetry.clientSessionId,
      mutationId: cachedCreateRetry.mutationId
    };
  }

  function resolveClaimLegRetry({
    sessionId = '',
    legIndex = null,
    tacticId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    requestedClientLegId = '',
    requestedMutationId = '',
    forceNew = false,
    boundUserId = ''
  } = {}) {
    if (forceNew) cachedClaimRetry = null;
    const safeClientLegId = normalizeSafeId(requestedClientLegId);
    const safeMutationId = normalizeSafeId(requestedMutationId);
    const fingerprint = JSON.stringify({
      sessionId: normalizeSafeId(sessionId),
      legIndex: normalizeLegIndex(legIndex),
      tacticId: normalizeShortId(tacticId),
      protocolVersion: normalizeShortId(protocolVersion) || DEFAULT_PROTOCOL_VERSION,
      userId: String(boundUserId || '').trim(),
      requestedClientLegId: safeClientLegId,
      requestedMutationId: safeMutationId
    });
    if (cachedClaimRetry && cachedClaimRetry.fingerprint === fingerprint) {
      return {
        clientLegId: cachedClaimRetry.clientLegId,
        mutationId: cachedClaimRetry.mutationId
      };
    }
    cachedClaimRetry = {
      fingerprint,
      clientLegId: safeClientLegId || buildRequestId('relay-leg'),
      mutationId: safeMutationId || buildRequestId('relay-claim')
    };
    return {
      clientLegId: cachedClaimRetry.clientLegId,
      mutationId: cachedClaimRetry.mutationId
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
    const cache = cacheKey === 'pass'
      ? cachedPassRetry
      : cacheKey === 'project'
        ? cachedProjectRetry
        : cachedRewardRetry;
    if (safeMutationId) {
      const resolved = { fingerprint, mutationId: safeMutationId };
      if (cacheKey === 'pass') cachedPassRetry = resolved;
      else if (cacheKey === 'project') cachedProjectRetry = resolved;
      else cachedRewardRetry = resolved;
      return safeMutationId;
    }
    if (cache && cache.fingerprint === fingerprint && normalizeSafeId(cache.mutationId)) {
      return cache.mutationId;
    }
    const mutationId = buildRequestId(
      cacheKey === 'pass'
        ? 'relay-pass'
        : cacheKey === 'project'
          ? 'relay-project'
          : 'relay-reward'
    );
    const resolved = { fingerprint, mutationId };
    if (cacheKey === 'pass') cachedPassRetry = resolved;
    else if (cacheKey === 'project') cachedProjectRetry = resolved;
    else cachedRewardRetry = resolved;
    return mutationId;
  }

  function createMissingMethodFailure(methodName = '', fallbackMessage = '同道远征服务未就绪') {
    return {
      success: false,
      reason: 'relay_expedition_client_unavailable',
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
    const session = extractSession(result);
    const normalizedSession = session.found
      ? normalizeSessionValue(session.value, snapshot)
      : normalizeSessionValue(null, snapshot);
    if (normalizedSession !== null) {
      patch.session = normalizedSession;
    }
    if (
      kind === 'current'
      || kind === 'createSession'
      || kind === 'claimLeg'
      || kind === 'passBaton'
      || kind === 'projectLeg'
    ) {
      const leg = extractLeg(result);
      if (leg.found || snapshot) {
        patch.currentLeg = leg.found
          ? normalizeLegValue(leg.value, snapshot)
          : normalizeLegValue(null, snapshot);
      }
    }
    if (kind === 'claimLeg') {
      const legClaim = extractLegClaimRecord(result);
      if (legClaim.found) patch.legClaim = legClaim.value;
    }
    if (kind === 'passBaton') {
      const pass = extractPassRecord(result);
      if (pass.found) patch.lastPass = pass.value;
    }
    if (kind === 'projectLeg') {
      const projection = extractProjectionRecord(result);
      if (projection.found) patch.lastProjection = projection.value;
    }
    if (kind === 'claimReward') {
      const rewardClaim = extractRewardClaimRecord(result);
      if (rewardClaim.found) patch.rewardClaim = rewardClaim.value;
    }
    return patch;
  }

  async function reconcileRelayRunHandoff({
    source = null,
    expectedUserId = '',
    forceRefresh = false
  } = {}) {
    if (!authoritativeRunService || typeof authoritativeRunService.get !== 'function' || typeof authoritativeRunService.getState !== 'function') {
      return null;
    }
    if (expectedUserId && !isExpectedUserCurrent(expectedUserId)) {
      return null;
    }
    const snapshot = extractCurrentSnapshot(source, { allowEnvelope: true });
    const legCandidate = extractLeg(source);
    const leg = legCandidate.found ? normalizeLegValue(legCandidate.value, snapshot) : normalizeLegValue(null, snapshot);
    const projection = extractRunProjection(source, snapshot, leg);
    const runId = getRelayRunId({ source, snapshot, leg, projection }) || getRelayRunId({
      snapshot: state.current,
      leg: state.currentLeg,
      source: state.session
    });
    if (!runId) {
      clearRelayRunHandoff();
      return null;
    }
    const currentAuthoritativeState = normalizeAuthoritativeStateSnapshot(authoritativeRunService.getState());
    const currentRunId = normalizeSafeId(currentAuthoritativeState && currentAuthoritativeState.runId);
    const incomingVersion = getProjectionVersion(projection);
    const currentVersion = getProjectionVersion(currentAuthoritativeState && currentAuthoritativeState.projection);
    lastRelayRunId = runId;
    if (
      forceRefresh
      || currentRunId !== runId
      || !currentAuthoritativeState
      || (!currentAuthoritativeState.projection && !!projection)
      || (incomingVersion !== null && currentVersion !== null && incomingVersion > currentVersion)
    ) {
      await authoritativeRunService.get({
        runId,
        expectedUserId
      });
      return normalizeAuthoritativeStateSnapshot(authoritativeRunService.getState());
    }
    const normalized = normalizeAuthoritativeStateSnapshot(currentAuthoritativeState);
    publish({
      authoritativeRun: normalized
    });
    return normalized;
  }

  async function performRequest(kind, requestFactory, {
    expectedUserId = '',
    pending = {},
    fallbackFailureMessage = '同道远征请求失败'
  } = {}) {
    const boundUserId = getBoundUserId(expectedUserId);
    if (!boundUserId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_account_changed',
        message: '登录账号已变化，请刷新同道远征后重试'
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
        reason: 'relay_expedition_account_changed',
        message: '登录账号已变化，旧同道远征回执未应用'
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
    if (kind === 'createSession') cachedCreateRetry = null;
    if (kind === 'claimLeg') cachedClaimRetry = null;
    if (kind === 'passBaton') cachedPassRetry = null;
    if (kind === 'projectLeg') cachedProjectRetry = null;
    if (kind === 'claimReward') cachedRewardRetry = null;
    publish(buildSuccessPatch(kind, result));
    await reconcileRelayRunHandoff({
      source: result,
      expectedUserId: boundUserId,
      forceRefresh: kind === 'claimLeg' || kind === 'projectLeg'
    });
    return result;
  }

  async function current({
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.getRelayExpeditionCurrent !== 'function') {
      const failure = createMissingMethodFailure('getRelayExpeditionCurrent', '同道远征当前状态读取未就绪');
      publish({ lastError: failure });
      return failure;
    }
    return await performRequest(
      'current',
      boundUserId => client.getRelayExpeditionCurrent({ expectedUserId: boundUserId }),
      {
        expectedUserId,
        fallbackFailureMessage: '同道远征当前状态读取失败'
      }
    );
  }

  async function createSession({
    rotationId = '',
    sourceSquadId = '',
    clientSessionId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = '',
    forceNew = false
  } = {}) {
    if (!client || typeof client.createRelayExpeditionSession !== 'function') {
      const failure = createMissingMethodFailure('createRelayExpeditionSession', '同道远征开队未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    const safeSourceSquadId = normalizeSafeId(sourceSquadId);
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_rotation',
        message: '同道远征 rotationId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeSourceSquadId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_squad',
        message: '同道远征 sourceSquadId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeShortId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const boundUserId = getBoundUserId(expectedUserId);
    const retryIds = resolveCreateSessionRetry({
      rotationId: safeRotationId,
      sourceSquadId: safeSourceSquadId,
      protocolVersion: safeProtocolVersion,
      requestedClientSessionId: clientSessionId,
      requestedMutationId: mutationId,
      forceNew: forceNew === true,
      boundUserId
    });
    return await performRequest(
      'createSession',
      requestUserId => client.createRelayExpeditionSession({
        protocolVersion: safeProtocolVersion,
        rotationId: safeRotationId,
        sourceSquadId: safeSourceSquadId,
        clientSessionId: retryIds.clientSessionId,
        mutationId: retryIds.mutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          rotationId: safeRotationId,
          sourceSquadId: safeSourceSquadId,
          clientSessionId: retryIds.clientSessionId,
          mutationId: retryIds.mutationId
        },
        fallbackFailureMessage: '同道远征开队失败'
      }
    );
  }

  async function claimLeg(options = {}) {
    const {
      sessionId = '',
      legIndex = null,
      tacticId = '',
      clientLegId = '',
      mutationId = '',
      protocolVersion = DEFAULT_PROTOCOL_VERSION,
      expectedUserId = '',
      forceNew = false
    } = options;
    if (!client || typeof client.claimRelayExpeditionLeg !== 'function') {
      const failure = createMissingMethodFailure('claimRelayExpeditionLeg', '同道远征接棒未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeSessionId = normalizeSafeId(sessionId) || getSessionIdFromState(state);
    const explicitLegIndexProvided = Object.prototype.hasOwnProperty.call(options, 'legIndex');
    const safeLegIndex = normalizeLegIndex(legIndex);
    if (explicitLegIndexProvided && safeLegIndex === null) {
      const failure = {
        success: false,
        reason: 'relay_expedition_invalid_leg_index',
        message: '同道远征 legIndex 非法'
      };
      publish({ lastError: failure });
      return failure;
    }
    const resolvedLegIndex = safeLegIndex !== null ? safeLegIndex : getCurrentLegIndexFromState(state);
    const safeTacticId = normalizeShortId(tacticId);
    if (!safeSessionId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_session',
        message: '同道远征 sessionId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (resolvedLegIndex === null) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_leg_index',
        message: '同道远征 legIndex 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeTacticId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_tactic',
        message: '同道远征 tacticId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeShortId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const boundUserId = getBoundUserId(expectedUserId);
    const retryIds = resolveClaimLegRetry({
      sessionId: safeSessionId,
      legIndex: resolvedLegIndex,
      tacticId: safeTacticId,
      protocolVersion: safeProtocolVersion,
      requestedClientLegId: clientLegId,
      requestedMutationId: mutationId,
      forceNew: forceNew === true,
      boundUserId
    });
    return await performRequest(
      'claimLeg',
      requestUserId => client.claimRelayExpeditionLeg({
        protocolVersion: safeProtocolVersion,
        sessionId: safeSessionId,
        legIndex: resolvedLegIndex,
        tacticId: safeTacticId,
        clientLegId: retryIds.clientLegId,
        mutationId: retryIds.mutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          sessionId: safeSessionId,
          legIndex: resolvedLegIndex,
          tacticId: safeTacticId,
          clientLegId: retryIds.clientLegId,
          mutationId: retryIds.mutationId
        },
        fallbackFailureMessage: '同道远征接棒失败'
      }
    );
  }

  async function passBaton(options = {}) {
    const {
      sessionId = '',
      legIndex = null,
      mutationId = '',
      protocolVersion = DEFAULT_PROTOCOL_VERSION,
      expectedUserId = ''
    } = options;
    if (!client || typeof client.passRelayExpeditionBaton !== 'function') {
      const failure = createMissingMethodFailure('passRelayExpeditionBaton', '同道远征让棒未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeSessionId = normalizeSafeId(sessionId) || getSessionIdFromState(state);
    const explicitLegIndexProvided = Object.prototype.hasOwnProperty.call(options, 'legIndex');
    const safeLegIndex = normalizeLegIndex(legIndex);
    if (explicitLegIndexProvided && safeLegIndex === null) {
      const failure = {
        success: false,
        reason: 'relay_expedition_invalid_leg_index',
        message: '同道远征 legIndex 非法'
      };
      publish({ lastError: failure });
      return failure;
    }
    const resolvedLegIndex = safeLegIndex !== null ? safeLegIndex : getCurrentLegIndexFromState(state);
    if (!safeSessionId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_session',
        message: '同道远征 sessionId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (resolvedLegIndex === null) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_leg_index',
        message: '同道远征 legIndex 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeShortId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry('pass', {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      sessionId: safeSessionId,
      legIndex: resolvedLegIndex,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      'passBaton',
      requestUserId => client.passRelayExpeditionBaton({
        protocolVersion: safeProtocolVersion,
        sessionId: safeSessionId,
        legIndex: resolvedLegIndex,
        mutationId: resolvedMutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          sessionId: safeSessionId,
          legIndex: resolvedLegIndex,
          mutationId: resolvedMutationId
        },
        fallbackFailureMessage: '同道远征让棒失败'
      }
    );
  }

  async function projectLeg({
    sessionId = '',
    legId = '',
    runId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.projectRelayExpeditionLeg !== 'function') {
      const failure = createMissingMethodFailure('projectRelayExpeditionLeg', '同道远征投影未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeSessionId = normalizeSafeId(sessionId) || getSessionIdFromState(state);
    const safeLegId = normalizeSafeId(legId) || getCurrentLegIdFromState(state);
    const safeRunId = normalizeSafeId(runId) || getRunIdFromState(state);
    if (!safeSessionId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_session',
        message: '同道远征 sessionId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeLegId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_leg_id',
        message: '同道远征 legId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_run',
        message: '同道远征 runId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeShortId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry('project', {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      sessionId: safeSessionId,
      legId: safeLegId,
      runId: safeRunId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      'projectLeg',
      requestUserId => client.projectRelayExpeditionLeg(safeLegId, {
        protocolVersion: safeProtocolVersion,
        sessionId: safeSessionId,
        legId: safeLegId,
        runId: safeRunId,
        mutationId: resolvedMutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          sessionId: safeSessionId,
          legId: safeLegId,
          runId: safeRunId,
          mutationId: resolvedMutationId
        },
        fallbackFailureMessage: '同道远征投影失败'
      }
    );
  }

  async function claimReward({
    sessionId = '',
    rotationId = '',
    milestoneId = '',
    mutationId = '',
    protocolVersion = DEFAULT_PROTOCOL_VERSION,
    expectedUserId = ''
  } = {}) {
    if (!client || typeof client.claimRelayExpeditionReward !== 'function') {
      const failure = createMissingMethodFailure('claimRelayExpeditionReward', '同道远征奖励领取未就绪');
      publish({ lastError: failure });
      return failure;
    }
    const safeSessionId = normalizeSafeId(sessionId) || getSessionIdFromState(state);
    const safeRotationId = normalizeSafeId(rotationId) || getRotationIdFromState(state);
    const safeMilestoneId = normalizeShortId(milestoneId);
    if (!safeSessionId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_session',
        message: '同道远征 sessionId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeRotationId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_rotation',
        message: '同道远征 rotationId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (!safeMilestoneId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_milestone',
        message: '同道远征 milestoneId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    const safeProtocolVersion = normalizeShortId(protocolVersion) || DEFAULT_PROTOCOL_VERSION;
    const resolvedMutationId = resolveMutationRetry('reward', {
      requestedMutationId: mutationId,
      protocolVersion: safeProtocolVersion,
      sessionId: safeSessionId,
      rotationId: safeRotationId,
      milestoneId: safeMilestoneId,
      boundUserId: getBoundUserId(expectedUserId)
    });
    return await performRequest(
      'claimReward',
      requestUserId => client.claimRelayExpeditionReward(safeMilestoneId, {
        protocolVersion: safeProtocolVersion,
        sessionId: safeSessionId,
        rotationId: safeRotationId,
        milestoneId: safeMilestoneId,
        mutationId: resolvedMutationId
      }, { expectedUserId: requestUserId }),
      {
        expectedUserId,
        pending: {
          sessionId: safeSessionId,
          rotationId: safeRotationId,
          milestoneId: safeMilestoneId,
          mutationId: resolvedMutationId
        },
        fallbackFailureMessage: '同道远征奖励领取失败'
      }
    );
  }

  async function refreshRelayRun({
    runId = '',
    expectedUserId = ''
  } = {}) {
    const safeRunId = normalizeSafeId(runId) || getRunIdFromState(state);
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'relay_expedition_missing_run',
        message: '同道远征 runId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    lastRelayRunId = safeRunId;
    if (!authoritativeRunService || typeof authoritativeRunService.get !== 'function') {
      const failure = createMissingMethodFailure('AuthoritativeRunService.get', '权威远征接力未就绪');
      publish({ lastError: failure });
      return failure;
    }
    return await authoritativeRunService.get({
      runId: safeRunId,
      expectedUserId: getBoundUserId(expectedUserId)
    });
  }

  return {
    getState,
    subscribe,
    reset,
    current,
    createSession,
    claimLeg,
    passBaton,
    projectLeg,
    claimReward,
    refreshRelayRun,
    getAuthoritativeRunService() {
      return authoritativeRunService;
    }
  };
}

export const RelayExpeditionService = createRelayExpeditionService();
