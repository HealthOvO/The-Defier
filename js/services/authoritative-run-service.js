import { BackendClient } from "./backend-client.js";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const MODES = new Set(['pve', 'challenge', 'expedition', 'challenge_ladder', 'world_rift', 'fate_chronicle']);
const TERMINAL_PHASE_RANK = Object.freeze({
  route: 1,
  battle: 2,
  reward: 3,
  completed: 4,
  defeated: 4,
  abandoned: 4
});
const DEFAULT_CONTENT_VERSION = 'authoritative-trials-v8';
const DEFAULT_STATE = Object.freeze({
  mode: '',
  runId: '',
  projection: null,
  lastReplay: null,
  lastReplayRunId: '',
  lastReceipt: null,
  pending: null,
  pendingReplay: false,
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

function normalizeMode(value) {
  const mode = String(value || '').trim();
  return MODES.has(mode) ? mode : '';
}

function normalizeProjectionPhase(value) {
  const phase = String(value || '').trim();
  return Object.prototype.hasOwnProperty.call(TERMINAL_PHASE_RANK, phase) ? phase : '';
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

function getProjectionPhaseRank(projection) {
  return TERMINAL_PHASE_RANK[normalizeProjectionPhase(projection && (projection.phase || projection.status))] || 0;
}

function getProjectionRunId(projection) {
  return normalizeSafeId(
    projection && (
      projection.runId
      || projection.id
      || projection.run && projection.run.runId
    )
  );
}

function getProjectionMode(projection) {
  return normalizeMode(projection && (projection.mode || projection.runMode));
}

function extractProjection(result) {
  const candidates = [
    result && result.projection,
    result && result.run && result.run.state,
    result && result.run && result.run.projection,
    result && result.receipt && result.receipt.projection,
    result && result.ticket && result.ticket.projection,
    result && result.current && result.current.projection
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return cloneData(candidate);
    }
  }
  return null;
}

function extractReplay(result) {
  const candidates = [
    result && result.replay,
    result && result.publicReplay,
    result && result.timeline
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      return cloneData(candidate);
    }
  }
  return null;
}

function extractReceipt(result) {
  const candidates = [
    result && result.receipt,
    result && result.action,
    result && result.ticket,
    result && result.actionReceipt
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return cloneData(candidate);
    }
  }
  return null;
}

function normalizeFailure(result = {}, fallbackMessage = '权威试炼请求失败') {
  return {
    success: false,
    reason: result && result.reason ? result.reason : undefined,
    message: result && result.message ? result.message : fallbackMessage
  };
}

export function createAuthoritativeRunService({
  client = BackendClient,
  onChange = null,
  now = () => Date.now()
} = {}) {
  const listeners = new Set();
  let state = {
    ...DEFAULT_STATE,
    updatedAt: now()
  };
  let projectionRequestEpoch = 0;
  let replayRequestEpoch = 0;
  let cachedBeginRetry = null;
  let cachedActionRetry = null;
  let cachedSettleRetry = null;

  function getCurrentUserId() {
    try {
      return normalizeUserId(client && typeof client.getCurrentUser === 'function' ? client.getCurrentUser() : null);
    } catch (error) {
      return '';
    }
  }

  function isExpectedUserCurrent(expectedUserId = '') {
    const safeExpectedUserId = normalizeSafeId(expectedUserId) || String(expectedUserId || '').trim();
    return !!safeExpectedUserId && getCurrentUserId() === safeExpectedUserId;
  }

  function getState() {
    return cloneData(state) || {
      ...state
    };
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
    projectionRequestEpoch += 1;
    replayRequestEpoch += 1;
    cachedBeginRetry = null;
    cachedActionRetry = null;
    cachedSettleRetry = null;
    return publish({
      ...DEFAULT_STATE
    });
  }

  function buildRequestId(prefix = 'ar') {
    if (client && typeof client.createAuthoritativeRunRequestId === 'function') {
      return client.createAuthoritativeRunRequestId(prefix);
    }
    if (client && typeof client.createMutationId === 'function') {
      return `${String(prefix || 'ar').replace(/[^A-Za-z0-9._:-]/g, '') || 'ar'}-${client.createMutationId().replace(/^mutation-/, '')}`;
    }
    return `${String(prefix || 'ar').replace(/[^A-Za-z0-9._:-]/g, '') || 'ar'}-${Date.now().toString(36)}`;
  }

  function getBoundUserId(expectedUserId = '') {
    return String(expectedUserId || state.expectedUserId || getCurrentUserId()).trim();
  }

  function resolveActionRetry(runId = '', command = '', expectedVersion = null, payload = null, requestedActionId = '') {
    const safeRequestedActionId = normalizeSafeId(requestedActionId);
    const fingerprint = JSON.stringify({
      runId: normalizeSafeId(runId),
      command: String(command || ''),
      expectedVersion: Number.isFinite(Number(expectedVersion)) ? Math.floor(Number(expectedVersion)) : null,
      payload: cloneData(payload)
    });
    if (safeRequestedActionId) {
      cachedActionRetry = { fingerprint, actionId: safeRequestedActionId };
      return safeRequestedActionId;
    }
    if (cachedActionRetry && cachedActionRetry.fingerprint === fingerprint && normalizeSafeId(cachedActionRetry.actionId)) {
      return cachedActionRetry.actionId;
    }
    const actionId = buildRequestId('ar-action');
    cachedActionRetry = { fingerprint, actionId };
    return actionId;
  }

  function resolveSettleRetry(runId = '', expectedVersion = null, requestedMutationId = '') {
    const safeRequestedMutationId = normalizeSafeId(requestedMutationId);
    const fingerprint = JSON.stringify({
      runId: normalizeSafeId(runId),
      expectedVersion: Number.isFinite(Number(expectedVersion)) ? Math.floor(Number(expectedVersion)) : null
    });
    if (safeRequestedMutationId) {
      cachedSettleRetry = { fingerprint, mutationId: safeRequestedMutationId };
      return safeRequestedMutationId;
    }
    if (cachedSettleRetry && cachedSettleRetry.fingerprint === fingerprint && normalizeSafeId(cachedSettleRetry.mutationId)) {
      return cachedSettleRetry.mutationId;
    }
    const mutationId = buildRequestId('ar-settle');
    cachedSettleRetry = { fingerprint, mutationId };
    return mutationId;
  }

  function resolveBeginRetry(mode = '', requestedClientRunId = '', forceNew = false) {
    const safeRequestedClientRunId = normalizeSafeId(requestedClientRunId);
    const safeMode = normalizeMode(mode);
    if (forceNew) cachedBeginRetry = null;
    if (safeRequestedClientRunId) {
      cachedBeginRetry = { mode: safeMode, clientRunId: safeRequestedClientRunId };
      return safeRequestedClientRunId;
    }
    if (cachedBeginRetry && cachedBeginRetry.mode === safeMode && normalizeSafeId(cachedBeginRetry.clientRunId)) {
      return cachedBeginRetry.clientRunId;
    }
    const clientRunId = buildRequestId('ar-client');
    cachedBeginRetry = { mode: safeMode, clientRunId };
    return clientRunId;
  }

  function resolveProjectionAcceptance(incomingProjection, {
    allowRunSwitch = false,
    requestRunId = '',
    requestMode = ''
  } = {}) {
    if (!incomingProjection || typeof incomingProjection !== 'object') {
      return {
        accepted: false,
        reason: 'authoritative_run_projection_missing'
      };
    }
    const currentProjection = state.projection;
    const incomingRunId = getProjectionRunId(incomingProjection) || normalizeSafeId(requestRunId);
    const currentRunId = state.runId || getProjectionRunId(currentProjection);
    if (currentRunId && incomingRunId && currentRunId !== incomingRunId && !allowRunSwitch) {
      return {
        accepted: false,
        reason: 'authoritative_run_stale_response'
      };
    }
    const currentVersion = getProjectionVersion(currentProjection);
    const incomingVersion = getProjectionVersion(incomingProjection);
    const sameRun = !currentRunId || !incomingRunId || currentRunId === incomingRunId;
    if (sameRun && currentVersion !== null && incomingVersion !== null && incomingVersion < currentVersion) {
      return {
        accepted: false,
        reason: 'authoritative_run_stale_response'
      };
    }
    if (sameRun && currentVersion !== null && incomingVersion !== null && incomingVersion === currentVersion) {
      const currentPhaseRank = getProjectionPhaseRank(currentProjection);
      const incomingPhaseRank = getProjectionPhaseRank(incomingProjection);
      if (incomingPhaseRank < currentPhaseRank) {
        return {
          accepted: false,
          reason: 'authoritative_run_stale_response'
        };
      }
    }
    return {
      accepted: true,
      projection: cloneData(incomingProjection),
      runId: incomingRunId || currentRunId,
      mode: getProjectionMode(incomingProjection) || normalizeMode(requestMode) || state.mode
    };
  }

  async function performProjectionRequest(kind, requestFactory, {
    requestRunId = '',
    requestMode = '',
    expectedUserId = '',
    pendingId = '',
    allowRunSwitch = false,
    fallbackFailureMessage = '权威试炼请求失败'
  } = {}) {
    const boundUserId = getBoundUserId(expectedUserId);
    if (!boundUserId) {
      const failure = {
        success: false,
        reason: 'authoritative_run_account_changed',
        message: '登录账号已变化，请刷新权威试炼后重试'
      };
      publish({
        pending: null,
        lastError: failure
      });
      return failure;
    }
    const requestEpoch = ++projectionRequestEpoch;
    publish({
      expectedUserId: boundUserId,
      pending: {
        kind,
        runId: normalizeSafeId(requestRunId),
        mode: normalizeMode(requestMode),
        mutationId: normalizeSafeId(pendingId),
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
        message: error.message || fallbackFailureMessage
      };
    }
    if (requestEpoch !== projectionRequestEpoch) {
      return {
        ...(result && typeof result === 'object' ? result : { success: false, message: fallbackFailureMessage }),
        suppressed: true
      };
    }
    if (!isExpectedUserCurrent(boundUserId)) {
      const failure = {
        success: false,
        reason: 'authoritative_run_account_changed',
        message: '登录账号已变化，旧权威试炼回执未应用'
      };
      publish({
        pending: null,
        lastError: failure
      });
      return failure;
    }
    if (!result || result.success === false) {
      const failure = normalizeFailure(result, fallbackFailureMessage);
      const staleProjection = result
        && result.reason === 'stale_run_version'
        ? extractProjection(result)
        : null;
      const staleAccepted = staleProjection
        ? resolveProjectionAcceptance(staleProjection, {
          allowRunSwitch: false,
          requestRunId,
          requestMode
        })
        : null;
      publish({
        ...(staleAccepted && staleAccepted.accepted ? {
          mode: staleAccepted.mode,
          runId: staleAccepted.runId,
          projection: staleAccepted.projection
        } : {}),
        pending: null,
        lastError: failure
      });
      return result || failure;
    }
    if (kind === 'current'
      && Object.prototype.hasOwnProperty.call(result, 'run')
      && result.run === null) {
      const lastSettlement = result.lastSettlement && typeof result.lastSettlement === 'object'
        ? result.lastSettlement
        : null;
      const recoveredProjection = lastSettlement
        ? extractProjection({ run: lastSettlement })
        : null;
      const recovered = recoveredProjection
        ? resolveProjectionAcceptance(recoveredProjection, {
          allowRunSwitch: true,
          requestRunId: lastSettlement.runId,
          requestMode
        })
        : null;
      if (recovered && recovered.accepted) {
        publish({
          mode: recovered.mode,
          runId: recovered.runId,
          projection: recovered.projection,
          lastReceipt: cloneData(lastSettlement.receipt || recovered.projection.receipt || null),
          pending: null,
          lastError: null
        });
        return result;
      }
      publish({
        mode: normalizeMode(requestMode),
        runId: '',
        projection: null,
        lastReceipt: null,
        pending: null,
        lastError: null
      });
      return result;
    }
    const projection = extractProjection(result);
    const accepted = resolveProjectionAcceptance(projection, {
      allowRunSwitch,
      requestRunId,
      requestMode
    });
    if (!accepted.accepted) {
      publish({
        pending: null,
        lastError: accepted.reason === 'authoritative_run_projection_missing'
          ? {
            success: false,
            reason: accepted.reason,
            message: '权威试炼回执缺少 projection'
          }
          : null
      });
      if (accepted.reason === 'authoritative_run_projection_missing') {
        return {
          success: false,
          reason: accepted.reason,
          message: '权威试炼回执缺少 projection'
        };
      }
      return {
        ...result,
        suppressed: true
      };
    }
    publish({
      mode: accepted.mode,
      runId: accepted.runId,
      projection: accepted.projection,
      lastReceipt: extractReceipt(result),
      pending: null,
      lastError: null
    });
    return result;
  }

  async function performReplayRequest(requestFactory, {
    requestRunId = '',
    expectedUserId = '',
    fallbackFailureMessage = '权威试炼回放请求失败'
  } = {}) {
    const boundUserId = getBoundUserId(expectedUserId);
    if (!boundUserId) {
      const failure = {
        success: false,
        reason: 'authoritative_run_account_changed',
        message: '登录账号已变化，请刷新权威试炼回放后重试'
      };
      publish({
        pendingReplay: false,
        lastError: failure
      });
      return failure;
    }
    const requestEpoch = ++replayRequestEpoch;
    publish({
      expectedUserId: boundUserId,
      pendingReplay: true,
      lastError: null
    });
    let result = null;
    try {
      result = await requestFactory(boundUserId);
    } catch (error) {
      result = {
        success: false,
        error,
        message: error.message || fallbackFailureMessage
      };
    }
    if (requestEpoch !== replayRequestEpoch) {
      return {
        ...(result && typeof result === 'object' ? result : { success: false, message: fallbackFailureMessage }),
        suppressed: true
      };
    }
    if (!isExpectedUserCurrent(boundUserId)) {
      const failure = {
        success: false,
        reason: 'authoritative_run_account_changed',
        message: '登录账号已变化，旧权威试炼回放未应用'
      };
      publish({
        pendingReplay: false,
        lastError: failure
      });
      return failure;
    }
    if (!result || result.success === false) {
      const failure = normalizeFailure(result, fallbackFailureMessage);
      publish({
        pendingReplay: false,
        lastError: failure
      });
      return result || failure;
    }
    const replay = extractReplay(result);
    if (!replay) {
      const failure = {
        success: false,
        reason: 'authoritative_run_replay_missing',
        message: '权威试炼回放缺失'
      };
      publish({
        pendingReplay: false,
        lastError: failure
      });
      return failure;
    }
    publish({
      pendingReplay: false,
      lastReplay: replay,
      lastReplayRunId: normalizeSafeId(requestRunId) || state.runId,
      lastError: null
    });
    return result;
  }

  async function begin({
    mode = '',
    clientRunId = '',
    contentVersion = DEFAULT_CONTENT_VERSION,
    forceNew = false,
    expectedUserId = ''
  } = {}) {
    const safeMode = normalizeMode(mode);
    if (!safeMode) {
      const failure = {
        success: false,
        reason: 'authoritative_run_invalid_mode',
        message: '权威试炼模式不支持'
      };
      publish({ lastError: failure });
      return failure;
    }
    const resolvedClientRunId = resolveBeginRetry(safeMode, clientRunId, forceNew === true);
    return await performProjectionRequest(
      'begin',
      boundUserId => client.beginAuthoritativeRun({
        clientRunId: resolvedClientRunId,
        mode: safeMode,
        contentVersion: normalizeSafeId(contentVersion) || DEFAULT_CONTENT_VERSION
      }, { expectedUserId: boundUserId }),
      {
        requestMode: safeMode,
        expectedUserId,
        pendingId: resolvedClientRunId,
        allowRunSwitch: true,
        fallbackFailureMessage: '权威试炼发车失败'
      }
    );
  }

  async function current({
    mode = '',
    expectedUserId = ''
  } = {}) {
    const safeMode = normalizeMode(mode) || state.mode;
    if (!safeMode) {
      const failure = {
        success: false,
        reason: 'authoritative_run_invalid_mode',
        message: '权威试炼模式不支持'
      };
      publish({ lastError: failure });
      return failure;
    }
    return await performProjectionRequest(
      'current',
      boundUserId => client.getCurrentAuthoritativeRun(safeMode, { expectedUserId: boundUserId }),
      {
        requestMode: safeMode,
        expectedUserId,
        allowRunSwitch: true,
        fallbackFailureMessage: '权威试炼当前状态读取失败'
      }
    );
  }

  async function get({
    runId = '',
    expectedUserId = ''
  } = {}) {
    const safeRunId = normalizeSafeId(runId) || state.runId;
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'authoritative_run_missing_id',
        message: '权威试炼 runId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    return await performProjectionRequest(
      'get',
      boundUserId => client.getAuthoritativeRun(safeRunId, { expectedUserId: boundUserId }),
      {
        requestRunId: safeRunId,
        expectedUserId,
        allowRunSwitch: true,
        fallbackFailureMessage: '权威试炼状态读取失败'
      }
    );
  }

  async function action({
    runId = '',
    actionId = '',
    expectedVersion = null,
    command = '',
    payload = null,
    expectedUserId = ''
  } = {}) {
    const safeRunId = normalizeSafeId(runId) || state.runId;
    const safeCommand = String(command || '').trim();
    const resolvedExpectedVersion = Number.isFinite(Number(expectedVersion))
      ? Math.floor(Number(expectedVersion))
      : getProjectionVersion(state.projection);
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'authoritative_run_missing_id',
        message: '权威试炼 runId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (resolvedExpectedVersion === null) {
      const failure = {
        success: false,
        reason: 'authoritative_run_invalid_version',
        message: '权威试炼版本号无效'
      };
      publish({ lastError: failure });
      return failure;
    }
    const resolvedActionId = resolveActionRetry(safeRunId, safeCommand, resolvedExpectedVersion, payload, actionId);
    return await performProjectionRequest(
      'action',
      boundUserId => client.submitAuthoritativeRunAction(safeRunId, {
        actionId: resolvedActionId,
        expectedVersion: resolvedExpectedVersion,
        command: safeCommand,
        payload: cloneData(payload)
      }, { expectedUserId: boundUserId }),
      {
        requestRunId: safeRunId,
        requestMode: state.mode,
        expectedUserId,
        pendingId: resolvedActionId,
        allowRunSwitch: false,
        fallbackFailureMessage: '权威试炼行动失败'
      }
    );
  }

  async function settle({
    runId = '',
    mutationId = '',
    expectedVersion = null,
    expectedUserId = ''
  } = {}) {
    const safeRunId = normalizeSafeId(runId) || state.runId;
    const resolvedExpectedVersion = Number.isFinite(Number(expectedVersion))
      ? Math.floor(Number(expectedVersion))
      : getProjectionVersion(state.projection);
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'authoritative_run_missing_id',
        message: '权威试炼 runId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    if (resolvedExpectedVersion === null) {
      const failure = {
        success: false,
        reason: 'authoritative_run_invalid_version',
        message: '权威试炼版本号无效'
      };
      publish({ lastError: failure });
      return failure;
    }
    const resolvedMutationId = resolveSettleRetry(safeRunId, resolvedExpectedVersion, mutationId);
    return await performProjectionRequest(
      'settle',
      boundUserId => client.settleAuthoritativeRun(safeRunId, {
        mutationId: resolvedMutationId,
        expectedVersion: resolvedExpectedVersion
      }, { expectedUserId: boundUserId }),
      {
        requestRunId: safeRunId,
        requestMode: state.mode,
        expectedUserId,
        pendingId: resolvedMutationId,
        allowRunSwitch: false,
        fallbackFailureMessage: '权威试炼结算失败'
      }
    );
  }

  async function replay({
    runId = '',
    expectedUserId = ''
  } = {}) {
    const safeRunId = normalizeSafeId(runId) || state.runId;
    if (!safeRunId) {
      const failure = {
        success: false,
        reason: 'authoritative_run_missing_id',
        message: '权威试炼 runId 缺失'
      };
      publish({ lastError: failure });
      return failure;
    }
    return await performReplayRequest(
      boundUserId => client.getAuthoritativeRunReplay(safeRunId, { expectedUserId: boundUserId }),
      {
        requestRunId: safeRunId,
        expectedUserId,
        fallbackFailureMessage: '权威试炼回放读取失败'
      }
    );
  }

  return {
    getState,
    subscribe,
    reset,
    begin,
    current,
    get,
    action,
    settle,
    replay
  };
}

export const AuthoritativeRunService = createAuthoritativeRunService();
