const DEFAULT_STATE = Object.freeze({
  phase: 'idle',
  queueTicket: '',
  inviteCode: '',
  matchId: '',
  seatId: '',
  stateView: null,
  waitingReport: null,
  inviteReport: null,
  inviteInbox: [],
  rematchReport: null,
  lastReplay: null,
  lastReplayMatchId: '',
  lastDisputeReport: null,
  lastEvents: [],
  lastError: null,
  realtimeStatus: 'idle',
  lastRealtimeConnectionId: '',
  lastRealtimeSyncMatchId: '',
  lastRealtimeSyncAt: 0,
  lastRealtimeIntentResult: null,
  realtimeReport: null,
  updatedAt: 0
});
const LAST_TERMINAL_MATCH_STORAGE_KEY = 'theDefierPvpLiveLastTerminalMatchV1';
const SEASON_GOAL_STORAGE_KEY = 'theDefierPvpLiveSeasonGoalV1';
const WAITING_QUEUE_TICKET_STORAGE_KEY = 'theDefierPvpLiveWaitingQueueTicketV1';
const ALLOWED_SEASON_GOAL_ACTIONS = Object.freeze([
  'queue_again',
  'practice',
  'friendly_rematch',
  'adjust_loadout',
  'review_events',
  'review_key_turns',
  'report_issue'
]);

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

function normalizePhaseFromView(stateView, fallback = 'active') {
  const status = String(stateView && stateView.status || '').trim();
  if (status === 'setup') return 'setup';
  if (status === 'finished') return 'finished';
  if (status === 'invalidated') return 'invalidated';
  return fallback;
}

function getDefaultLiveService() {
  const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  return root && root.PVPService && root.PVPService.live ? root.PVPService.live : null;
}

function getDefaultLiveStorage() {
  const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  const storage = root && root.localStorage ? root.localStorage : null;
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    return null;
  }
  return storage;
}

function getDefaultTimerApi() {
  const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  return {
    setTimeout: root && typeof root.setTimeout === 'function' ? root.setTimeout.bind(root) : null,
    clearTimeout: root && typeof root.clearTimeout === 'function' ? root.clearTimeout.bind(root) : null
  };
}

function normalizeDelayMs(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function getUserIdentityFromCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return '';
  try {
    if (typeof candidate.getCurrentUser === 'function') {
      const user = candidate.getCurrentUser();
      if (typeof candidate.getUserIdentity === 'function') {
        return String(candidate.getUserIdentity(user) || '').trim();
      }
      return String(user && (user.objectId || user.id || user.userId || user.username) || '').trim();
    }
  } catch (error) {
    return '';
  }
  const user = candidate.currentUser || null;
  return String(user && (user.objectId || user.id || user.userId || user.username) || '').trim();
}

function getDefaultLiveUserScope() {
  const root = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});
  const candidates = [
    root && root.PVPService && root.PVPService.context && root.PVPService.context.authService,
    root && root.__THE_DEFIER_SERVICES__ && root.__THE_DEFIER_SERVICES__.AuthService,
    root && root.AuthService,
    root && root.__THE_DEFIER_SERVICES__ && root.__THE_DEFIER_SERVICES__.BackendClient,
    root && root.BackendClient
  ];
  for (const candidate of candidates) {
    const identity = getUserIdentityFromCandidate(candidate);
    if (identity) return identity;
  }
  return '';
}

function normalizeStorageScope(scope) {
  return String(scope || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:@-]/g, '_')
    .slice(0, 96);
}

function isQueueTicketExpired(result) {
  if (!result || typeof result !== 'object') return false;
  const code = result.code || (result.error && result.error.code);
  if (String(code) === '404') return true;
  const reason = String(result.reason || '').toLowerCase();
  if (reason.includes('queue_ticket_expired') || reason.includes('queue_not_found')) return true;
  const message = String(result.message || '');
  return message.includes('队列票据不存在') || message.includes('queue ticket');
}

function getFailureCode(result) {
  if (!result || typeof result !== 'object') return '';
  return String(result.code || (result.error && result.error.code) || '').trim();
}

function isNoCurrentMatch(result) {
  if (!result || typeof result !== 'object') return false;
  const code = getFailureCode(result);
  if (code === '404') return true;
  const reason = String(result.reason || '').toLowerCase();
  if (reason.includes('no_current')) return true;
  const message = String(result.message || '');
  return message.includes('当前没有进行中的实时论道') || message.includes('no current');
}

function isNoCurrentInvite(result) {
  if (!result || typeof result !== 'object') return false;
  const code = getFailureCode(result);
  if (code === '404' && !result.reason) return true;
  const reason = String(result.reason || '').toLowerCase();
  if (reason.includes('no_current_invite')) return true;
  const message = String(result.message || '');
  return message.includes('当前没有等待中的好友约战') || message.includes('no current invite');
}

function shouldClearStoredTerminalMatch(result, stateView) {
  if (result && result.success === true) {
    return !stateView || stateView.status !== 'finished' || !stateView.postMatchReview;
  }
  const code = getFailureCode(result);
  if (code === '400' || code === '404') return true;
  const reason = String(result && result.reason || '').toLowerCase();
  if (reason.includes('not_found') || reason.includes('missing_match')) return true;
  const message = String(result && result.message || '');
  return message.includes('战局不存在') || message.includes('战局缺失') || message.toLowerCase().includes('match not found');
}

function normalizeInviteInbox(result) {
  const invites = Array.isArray(result && result.invites) ? result.invites : [];
  return invites.slice(0, 20).map(invite => ({
    inviteCode: String(invite && invite.inviteCode || invite && invite.inviteReport && invite.inviteReport.inviteCode || '').trim(),
    createdAt: Math.max(0, Math.floor(Number(invite && invite.createdAt) || 0)),
    inviteReport: invite && invite.inviteReport && typeof invite.inviteReport === 'object'
      ? cloneData(invite.inviteReport)
      : null
  })).filter(invite => invite.inviteCode);
}

export function createPvpLiveSession({
  liveService = getDefaultLiveService(),
  storage = getDefaultLiveStorage(),
  userScope = getDefaultLiveUserScope,
  onChange = null,
  now = () => Date.now(),
  realtimeReconnectDelayMs = 750,
  timers = null
} = {}) {
  let realtimeHandle = null;
  let realtimeConnectionId = 0;
  let realtimeReconnectTimer = null;
  let pendingRealtimeJoin = null;
  let pendingRealtimeResumeHeartbeat = false;
  let realtimeManualClose = false;
  const fallbackTimers = getDefaultTimerApi();
  const timerApi = timers && typeof timers.setTimeout === 'function'
    ? timers
    : fallbackTimers;
  const reconnectDelayMs = normalizeDelayMs(realtimeReconnectDelayMs, 750);
  let state = {
    ...DEFAULT_STATE,
    updatedAt: now()
  };

  const getSnapshotMatchId = (snapshot) => String(snapshot && (snapshot.matchId || snapshot.stateView && snapshot.stateView.matchId) || '').trim();

  const publish = (patch = {}) => {
    const previousMatchId = getSnapshotMatchId(state);
    const nextState = {
      ...state,
      ...patch,
      updatedAt: now()
    };
    const nextMatchId = getSnapshotMatchId(nextState);
    const matchIdentityTouched = Object.prototype.hasOwnProperty.call(patch, 'matchId')
      || Object.prototype.hasOwnProperty.call(patch, 'stateView');
    if (matchIdentityTouched && previousMatchId && previousMatchId !== nextMatchId) {
      nextState.lastReplay = null;
      nextState.lastReplayMatchId = '';
      nextState.lastDisputeReport = null;
    }
    state = nextState;
    if (typeof onChange === 'function') {
      try {
        onChange(getState());
      } catch (error) {
        // UI listeners are best-effort; state ownership stays inside the session.
      }
    }
    return getState();
  };

  const getStateViewVersion = (stateView) => {
    const value = Number(stateView && stateView.stateVersion);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null;
  };

  const getStateViewMatchId = (stateView) => String(stateView && stateView.matchId || '').trim();

  const getStateViewProgressRank = (stateView) => {
    const status = String(stateView && stateView.status || '').trim();
    if (status === 'finished' || status === 'invalidated') return 3;
    if (status === 'active') return 2;
    if (status === 'setup' || status === 'matched') return 1;
    return 0;
  };

  const isSameLiveMatch = (stateView) => {
    const currentMatchId = String(state.matchId || getStateViewMatchId(state.stateView) || '').trim();
    const nextMatchId = getStateViewMatchId(stateView);
    if (!currentMatchId || !nextMatchId) return true;
    return currentMatchId === nextMatchId;
  };

  const resolveAuthoritativeStateView = (incomingStateView) => {
    if (!incomingStateView || typeof incomingStateView !== 'object') {
      return { stateView: state.stateView, accepted: true };
    }
    const currentVersion = getStateViewVersion(state.stateView);
    const incomingVersion = getStateViewVersion(incomingStateView);
    const isLowerVersion = isSameLiveMatch(incomingStateView)
      && currentVersion !== null
      && incomingVersion !== null
      && incomingVersion < currentVersion;
    const movesMatchForward = getStateViewProgressRank(incomingStateView) > getStateViewProgressRank(state.stateView);
    const isStale = isLowerVersion && !movesMatchForward;
    return {
      stateView: isStale ? state.stateView : incomingStateView,
      accepted: !isStale
    };
  };

  const getEventSequence = (event) => Math.max(0, Math.floor(Number(event && event.sequence) || 0));

  const getMaxEventSequence = (events = []) => (Array.isArray(events) ? events : [])
    .reduce((max, event) => Math.max(max, getEventSequence(event)), 0);

  const resolveAuthoritativeEvents = (incomingEvents, incomingStateView = null, acceptedStateView = true) => {
    if (!acceptedStateView) return Array.isArray(state.lastEvents) ? state.lastEvents : [];
    const candidate = Array.isArray(incomingEvents)
      ? incomingEvents.slice(-8)
      : incomingStateView && Array.isArray(incomingStateView.recentEvents)
        ? incomingStateView.recentEvents.slice(-8)
        : null;
    if (!candidate) return Array.isArray(state.lastEvents) ? state.lastEvents : [];
    const currentMax = getMaxEventSequence(state.lastEvents);
    const candidateMax = getMaxEventSequence(candidate);
    if (isSameLiveMatch(incomingStateView) && currentMax > 0 && candidate.length === 0) {
      return Array.isArray(state.lastEvents) ? state.lastEvents : [];
    }
    if (isSameLiveMatch(incomingStateView) && currentMax > 0 && candidateMax > 0 && candidateMax < currentMax) {
      return Array.isArray(state.lastEvents) ? state.lastEvents : [];
    }
    return candidate;
  };

  const getLastSeenEventRevision = () => Math.max(
    getMaxEventSequence(state.lastEvents),
    getMaxEventSequence(state.stateView && state.stateView.recentEvents)
  );

  const getTerminalStorageKey = () => {
    const scope = normalizeStorageScope(typeof userScope === 'function' ? userScope() : userScope);
    return scope ? `${LAST_TERMINAL_MATCH_STORAGE_KEY}:${scope}` : LAST_TERMINAL_MATCH_STORAGE_KEY;
  };

  const getWaitingQueueStorageKey = () => {
    const scope = normalizeStorageScope(typeof userScope === 'function' ? userScope() : userScope);
    return scope ? `${WAITING_QUEUE_TICKET_STORAGE_KEY}:${scope}` : WAITING_QUEUE_TICKET_STORAGE_KEY;
  };

  const normalizeSeasonId = (seasonId = '') => normalizeStorageScope(seasonId || 's1-genesis');

  const getSeasonGoalStorageKey = (seasonId = '') => {
    const scope = normalizeStorageScope(typeof userScope === 'function' ? userScope() : userScope);
    const safeSeasonId = normalizeSeasonId(seasonId);
    return scope ? `${SEASON_GOAL_STORAGE_KEY}:${scope}:${safeSeasonId}` : `${SEASON_GOAL_STORAGE_KEY}:${safeSeasonId}`;
  };

  const normalizeSeasonGoalState = (raw = {}, seasonId = '') => {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const safeSeasonId = normalizeSeasonId(source.seasonId || seasonId);
    const actionId = ALLOWED_SEASON_GOAL_ACTIONS.includes(String(source.lastReviewAction || ''))
      ? String(source.lastReviewAction)
      : '';
    const recommendedMode = ['queue_again', 'practice', 'friendly_rematch', 'adjust_loadout'].includes(String(source.recommendedMode || ''))
      ? String(source.recommendedMode)
      : '';
    return {
      version: 1,
      seasonId: safeSeasonId,
      lastReviewAction: actionId,
      recommendedMode,
      lastMatchId: String(source.lastMatchId || '').slice(0, 96),
      dismissedUntilSeason: source.dismissedUntilSeason && normalizeSeasonId(source.dismissedUntilSeason) === safeSeasonId ? safeSeasonId : '',
      updatedAt: Math.max(0, Math.floor(Number(source.updatedAt) || 0))
    };
  };

  const readSeasonGoalState = (seasonId = '') => {
    const safeSeasonId = normalizeSeasonId(seasonId);
    if (!storage || typeof storage.getItem !== 'function') {
      return normalizeSeasonGoalState({}, safeSeasonId);
    }
    try {
      const raw = storage.getItem(getSeasonGoalStorageKey(safeSeasonId));
      return normalizeSeasonGoalState(raw ? JSON.parse(raw) : {}, safeSeasonId);
    } catch (error) {
      return normalizeSeasonGoalState({}, safeSeasonId);
    }
  };

  const writeSeasonGoalState = (seasonId = '', patch = {}) => {
    const safeSeasonId = normalizeSeasonId(seasonId);
    const nextState = normalizeSeasonGoalState({
      ...readSeasonGoalState(safeSeasonId),
      ...(patch && typeof patch === 'object' ? patch : {}),
      seasonId: safeSeasonId,
      updatedAt: now()
    }, safeSeasonId);
    if (!storage || typeof storage.setItem !== 'function') return nextState;
    try {
      storage.setItem(getSeasonGoalStorageKey(safeSeasonId), JSON.stringify(nextState));
    } catch (error) {
      // Goal memory is a local convenience only; live PVP must continue without it.
    }
    return nextState;
  };

  const recordSeasonGoalAction = ({
    seasonId = '',
    actionId = '',
    matchId = '',
    recommendedMode = ''
  } = {}) => {
    const safeAction = ALLOWED_SEASON_GOAL_ACTIONS.includes(String(actionId || '')) ? String(actionId) : '';
    if (!safeAction) return readSeasonGoalState(seasonId);
    return writeSeasonGoalState(seasonId, {
      lastReviewAction: safeAction,
      recommendedMode,
      lastMatchId: matchId
    });
  };

  const dismissSeasonGoal = (seasonId = '') => writeSeasonGoalState(seasonId, {
    dismissedUntilSeason: normalizeSeasonId(seasonId)
  });

  const readStoredTerminalMatchId = () => {
    if (!storage || typeof storage.getItem !== 'function') return '';
    try {
      return String(storage.getItem(getTerminalStorageKey()) || '').trim();
    } catch (error) {
      return '';
    }
  };

  const clearStoredTerminalMatchId = () => {
    if (!storage || typeof storage.removeItem !== 'function') return;
    try {
      storage.removeItem(getTerminalStorageKey());
      storage.removeItem(LAST_TERMINAL_MATCH_STORAGE_KEY);
    } catch (error) {
      // localStorage can be unavailable in privacy modes; live PVP still works without refresh recovery.
    }
  };

  const readStoredWaitingQueueTicket = () => {
    if (!storage || typeof storage.getItem !== 'function') return '';
    try {
      return String(storage.getItem(getWaitingQueueStorageKey()) || '').trim();
    } catch (error) {
      return '';
    }
  };

  const rememberWaitingQueueTicket = (queueTicket = '') => {
    const ticket = String(queueTicket || '').trim();
    if (!ticket || !storage || typeof storage.setItem !== 'function') return;
    try {
      const key = getWaitingQueueStorageKey();
      storage.setItem(key, ticket);
      if (key !== WAITING_QUEUE_TICKET_STORAGE_KEY && typeof storage.removeItem === 'function') {
        storage.removeItem(WAITING_QUEUE_TICKET_STORAGE_KEY);
      }
    } catch (error) {
      // Queue recovery is a refresh convenience only; live PVP still works without storage.
    }
  };

  const clearStoredWaitingQueueTicket = () => {
    if (!storage || typeof storage.removeItem !== 'function') return;
    try {
      storage.removeItem(getWaitingQueueStorageKey());
      storage.removeItem(WAITING_QUEUE_TICKET_STORAGE_KEY);
    } catch (error) {
      // Best effort only.
    }
  };

  const rememberTerminalReviewMatch = (nextState = state) => {
    const view = nextState && nextState.stateView ? nextState.stateView : null;
    const matchId = String(nextState && nextState.matchId || view && view.matchId || '').trim();
    if (!matchId || !view || view.status !== 'finished' || !view.postMatchReview) return;
    clearStoredWaitingQueueTicket();
    if (!storage || typeof storage.setItem !== 'function') return;
    try {
      const key = getTerminalStorageKey();
      storage.setItem(key, matchId);
      if (key !== LAST_TERMINAL_MATCH_STORAGE_KEY && typeof storage.removeItem === 'function') {
        storage.removeItem(LAST_TERMINAL_MATCH_STORAGE_KEY);
      }
    } catch (error) {
      // Best-effort only; losing this key must not block the live match flow.
    }
  };

  const fail = (reason, message, phase = state.phase) => publish({
    phase,
    lastError: { reason, message: message || reason }
  });

  const publishInviteWaiting = (result, message = '好友约战已创建，分享邀请码等待对手加入；不写正式积分。') => publish({
    phase: 'waiting_invite',
    queueTicket: '',
    inviteCode: result && result.inviteCode || state.inviteCode || '',
    matchId: '',
    seatId: '',
    stateView: null,
    waitingReport: null,
    inviteReport: result && result.inviteReport || state.inviteReport || null,
    inviteInbox: [],
    rematchReport: null,
    lastError: {
      reason: 'waiting_invite',
      message
    }
  });

  const publishInviteExpired = (result) => publish({
    phase: 'idle',
    queueTicket: '',
    inviteCode: '',
    matchId: '',
    seatId: '',
    stateView: null,
    waitingReport: null,
    inviteReport: null,
    inviteInbox: [],
    rematchReport: null,
    lastError: {
      reason: 'invite_expired',
      message: result && result.message || '好友约战邀请码已过期'
    }
  });

  const callLive = async (method, ...args) => {
    if (!liveService || typeof liveService[method] !== 'function') {
      return { success: false, reason: 'live_service_unavailable', message: '实时论道服务未就绪' };
    }
    return await liveService[method](...args);
  };

  function handleRealtimeMessage(message = {}) {
    const type = String(message && message.type || '').trim();
    if (type === 'connected') {
      return publish({
        realtimeStatus: 'connected',
        lastRealtimeConnectionId: String(message.connectionId || ''),
        realtimeReport: message.connectionReport && typeof message.connectionReport === 'object'
          ? cloneData(message.connectionReport)
          : null,
        lastError: null
      });
    }
    if (type === 'state_sync') {
      const resolved = resolveAuthoritativeStateView(message.stateView || state.stateView);
      const stateView = resolved.stateView;
      const next = publish({
        phase: normalizePhaseFromView(stateView, 'active'),
        matchId: resolved.accepted ? String(message.matchId || state.matchId || stateView && stateView.matchId || '') : state.matchId,
        seatId: resolved.accepted ? String(message.seatId || state.seatId || '') : state.seatId,
        stateView,
        waitingReport: null,
        rematchReport: state.rematchReport || null,
        realtimeStatus: state.realtimeStatus === 'idle' ? 'connected' : state.realtimeStatus,
        lastRealtimeSyncMatchId: String(message.matchId || state.matchId || stateView && stateView.matchId || ''),
        lastRealtimeSyncAt: now(),
        lastError: null,
        lastEvents: resolveAuthoritativeEvents(null, stateView, resolved.accepted)
      });
      rememberTerminalReviewMatch(next);
      return next;
    }
    if (type === 'events_replay') {
      const incomingMatchId = String(message.matchId || state.matchId || '');
      const currentMatchId = String(state.matchId || getStateViewMatchId(state.stateView) || '');
      const replayEvents = Array.isArray(message.events) ? message.events.slice(-8) : [];
      const sameMatch = !incomingMatchId || !currentMatchId || incomingMatchId === currentMatchId;
      return publish({
        matchId: incomingMatchId,
        realtimeStatus: state.realtimeStatus === 'idle' ? 'connected' : state.realtimeStatus,
        lastEvents: sameMatch
          ? resolveAuthoritativeEvents(replayEvents, state.stateView, true)
          : replayEvents
      });
    }
    if (type === 'presence') {
      const connectionReport = message.connectionReport && typeof message.connectionReport === 'object'
        ? cloneData(message.connectionReport)
        : null;
      const connectionTempoReport = message.connectionTempoReport && typeof message.connectionTempoReport === 'object'
        ? cloneData(message.connectionTempoReport)
        : null;
      return publish({
        matchId: String(message.matchId || state.matchId || ''),
        seatId: String(message.seatId || state.seatId || ''),
        realtimeStatus: state.realtimeStatus === 'idle' ? 'connected' : state.realtimeStatus,
        stateView: state.stateView && (connectionReport || connectionTempoReport)
          ? {
            ...state.stateView,
            ...(connectionReport ? { connectionReport } : {}),
            ...(connectionTempoReport ? { connectionTempoReport } : {})
          }
          : state.stateView,
        lastError: null
      });
    }
    if (type === 'intent_result') {
      const resolved = resolveAuthoritativeStateView(message.stateView || state.stateView);
      const stateView = resolved.stateView;
      const result = String(message.result || '').trim();
      const intentResult = {
        intentId: String(message.intentId || ''),
        matchId: String(message.matchId || state.matchId || stateView && stateView.matchId || ''),
        result,
        reason: String(message.reason || ''),
        message: String(message.message || ''),
        stateVersion: Math.max(0, Math.floor(Number(stateView && stateView.stateVersion) || 0)),
        serverTime: Math.max(0, Math.floor(Number(message.serverTime) || 0)),
        updatedAt: now()
      };
      const isIdempotentDuplicate = result === 'duplicate' && intentResult.reason === 'duplicate_action';
      const next = publish({
        phase: resolved.accepted ? normalizePhaseFromView(stateView, 'active') : state.phase,
        matchId: resolved.accepted ? String(message.matchId || state.matchId || stateView && stateView.matchId || '') : state.matchId,
        stateView,
        realtimeStatus: state.realtimeStatus === 'idle' ? 'connected' : state.realtimeStatus,
        waitingReport: null,
        rematchReport: state.rematchReport || null,
        lastEvents: resolveAuthoritativeEvents(message.events, stateView, resolved.accepted),
        lastRealtimeIntentResult: intentResult,
        lastError: result === 'accepted' || isIdempotentDuplicate
          ? null
          : { reason: message.reason || result || 'intent_result', message: message.message || '实时论道行动需要处理' }
      });
      rememberTerminalReviewMatch(next);
      return next;
    }
    if (type === 'error') {
      return publish({
        realtimeStatus: state.realtimeStatus === 'idle' ? 'error' : state.realtimeStatus,
        lastError: {
          reason: message.reason || 'ws_error',
          message: message.message || '实时论道 WS 异常'
        }
      });
    }
    return getState();
  }

  function clearRealtimeReconnectTimer() {
    if (!realtimeReconnectTimer) return;
    if (timerApi && typeof timerApi.clearTimeout === 'function') {
      timerApi.clearTimeout(realtimeReconnectTimer);
    }
    realtimeReconnectTimer = null;
  }

  function canReconnectRealtime() {
    return !!(pendingRealtimeJoin && pendingRealtimeJoin.matchId);
  }

  function scheduleRealtimeReconnect() {
    if (!canReconnectRealtime()) {
      return publish({ realtimeStatus: 'closed' });
    }
    if (!timerApi || typeof timerApi.setTimeout !== 'function') {
      return publish({
        realtimeStatus: 'closed',
        lastError: { reason: 'live_ws_timer_unavailable', message: '实时论道 WS 重连计时器不可用' }
      });
    }
    if (realtimeReconnectTimer) {
      return publish({
        realtimeStatus: 'reconnecting',
        lastError: { reason: 'live_ws_reconnecting', message: '实时论道 WS 正在重连' }
      });
    }
    publish({
      realtimeStatus: 'reconnecting',
      lastError: { reason: 'live_ws_reconnecting', message: '实时论道 WS 正在重连' }
    });
    realtimeReconnectTimer = timerApi.setTimeout(() => {
      realtimeReconnectTimer = null;
      if (!canReconnectRealtime()) return;
      connectRealtime();
    }, reconnectDelayMs);
    return getState();
  }

  function connectRealtime() {
    if (!liveService || typeof liveService.connectRealtime !== 'function') {
      return publish({
        realtimeStatus: 'unavailable',
        lastError: { reason: 'live_ws_unavailable', message: '实时论道 WebSocket 未就绪' }
      });
    }
    if (realtimeHandle) return getState();
    realtimeManualClose = false;
    clearRealtimeReconnectTimer();
    const connectionId = realtimeConnectionId + 1;
    realtimeConnectionId = connectionId;
    realtimeHandle = liveService.connectRealtime({
      onMessage: handleRealtimeMessage,
      onOpen: () => {
        if (connectionId !== realtimeConnectionId) return;
        publish({ realtimeStatus: 'connected', lastError: null });
        if (pendingRealtimeJoin) {
          sendRealtime({
            type: 'join_match',
            matchId: pendingRealtimeJoin.matchId,
            lastSeenRevision: pendingRealtimeJoin.lastSeenRevision
          });
        }
        if (pendingRealtimeResumeHeartbeat) {
          pendingRealtimeResumeHeartbeat = false;
          heartbeatRealtime(pendingRealtimeJoin && pendingRealtimeJoin.matchId || state.matchId, {
            lastSeenRevision: pendingRealtimeJoin && pendingRealtimeJoin.lastSeenRevision
          });
        }
      },
      onClose: () => {
        if (connectionId !== realtimeConnectionId) return;
        realtimeHandle = null;
        if (realtimeManualClose) {
          publish({ realtimeStatus: 'closed' });
          return;
        }
        scheduleRealtimeReconnect();
      },
      onError: () => publish({
        realtimeStatus: 'error',
        lastError: { reason: 'live_ws_error', message: '实时论道 WebSocket 连接异常' }
      })
    });
    if (!realtimeHandle) {
      return publish({
        realtimeStatus: 'unavailable',
        lastError: { reason: 'live_ws_unavailable', message: '实时论道 WebSocket 未就绪' }
      });
    }
    return publish({ realtimeStatus: 'connecting', lastError: null });
  }

  function sendRealtime(payload = {}) {
    if (!realtimeHandle || typeof realtimeHandle.send !== 'function') {
      return false;
    }
    return realtimeHandle.send(cloneData(payload));
  }

  function joinRealtimeMatch(matchId = '', { lastSeenRevision = 0 } = {}) {
    const id = String(matchId || state.matchId || '').trim();
    if (!id) return false;
    pendingRealtimeJoin = {
      matchId: id,
      lastSeenRevision: Math.max(0, Math.floor(Number(lastSeenRevision) || 0))
    };
    return sendRealtime({
      type: 'join_match',
      matchId: pendingRealtimeJoin.matchId,
      lastSeenRevision: pendingRealtimeJoin.lastSeenRevision
    });
  }

  function resumeRealtime(matchId = '') {
    const id = String(matchId || pendingRealtimeJoin && pendingRealtimeJoin.matchId || state.matchId || '').trim();
    if (!id) return false;
    const previousLastSeenRevision = pendingRealtimeJoin && pendingRealtimeJoin.matchId === id
      ? Math.max(0, Math.floor(Number(pendingRealtimeJoin.lastSeenRevision) || 0))
      : 0;
    pendingRealtimeJoin = {
      matchId: id,
      lastSeenRevision: Math.max(previousLastSeenRevision, getLastSeenEventRevision())
    };
    pendingRealtimeResumeHeartbeat = true;
    if (!realtimeHandle) {
      connectRealtime();
      return true;
    }
    const joined = sendRealtime({
      type: 'join_match',
      matchId: pendingRealtimeJoin.matchId,
      lastSeenRevision: pendingRealtimeJoin.lastSeenRevision
    });
    if (joined) {
      pendingRealtimeResumeHeartbeat = false;
      heartbeatRealtime(pendingRealtimeJoin.matchId, {
        lastSeenRevision: pendingRealtimeJoin.lastSeenRevision
      });
    }
    return joined;
  }

  function heartbeatRealtime(matchId = '', { lastSeenRevision = null } = {}) {
    const id = String(matchId || state.matchId || '').trim();
    if (!id) return false;
    const hasExplicitRevision = lastSeenRevision !== null && lastSeenRevision !== undefined;
    const explicitRevision = Number(lastSeenRevision);
    return sendRealtime({
      type: 'heartbeat',
      matchId: id,
      lastSeenRevision: hasExplicitRevision && Number.isFinite(explicitRevision)
        ? Math.max(0, Math.floor(explicitRevision))
        : getLastSeenEventRevision()
    });
  }

  function submitRealtimeIntent(intent = {}, matchId = '') {
    const id = String(matchId || state.matchId || '').trim();
    if (!id) return false;
    return sendRealtime({
      type: 'intent',
      matchId: id,
      intent: cloneData(intent || {})
    });
  }

  function disconnectRealtime() {
    realtimeManualClose = true;
    clearRealtimeReconnectTimer();
    if (realtimeHandle && typeof realtimeHandle.close === 'function') {
      realtimeHandle.close();
    }
    realtimeHandle = null;
    pendingRealtimeJoin = null;
    pendingRealtimeResumeHeartbeat = false;
    return publish({ realtimeStatus: 'closed' });
  }

  function getState() {
    return cloneData(state);
  }

  async function joinQueue(options = {}) {
    publish({
      phase: 'queueing',
      matchId: '',
      seatId: '',
      stateView: null,
      lastReplay: null,
      lastReplayMatchId: '',
      lastDisputeReport: null,
      lastError: null,
      lastEvents: []
    });
    const result = await callLive('joinQueue', options);
    if (!result || result.success === false) {
      return publish({
        ...DEFAULT_STATE,
        phase: 'idle',
        lastError: {
          reason: result && result.reason || 'queue_join_failed',
          message: result && result.message || '实时论道入队失败',
          connectionHealth: result && result.connectionHealth || null,
          matchmakingGuard: result && result.matchmakingGuard || null
        }
      });
    }
    clearStoredTerminalMatchId();
    if (result.status === 'matched') {
      clearStoredWaitingQueueTicket();
      const stateView = result.stateView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        queueTicket: result.queueTicket || state.queueTicket || '',
        inviteCode: '',
        matchId: result.matchId || '',
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        inviteReport: null,
        rematchReport: null,
        lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : [],
        lastError: null
      });
    }
    rememberWaitingQueueTicket(result.queueTicket || '');
    return publish({
      phase: 'waiting',
      queueTicket: result.queueTicket || '',
      inviteCode: '',
      matchId: '',
      seatId: '',
      stateView: null,
      waitingReport: result.waitingReport || null,
      inviteReport: null,
      rematchReport: null,
      lastError: null
    });
  }

  async function pollQueue() {
    if (!state.queueTicket) {
      return fail('missing_queue_ticket', '缺少实时论道队列票据', state.phase);
    }
    const result = await callLive('getQueueStatus', state.queueTicket);
    if (!result || result.success === false) {
      if (isQueueTicketExpired(result)) {
        clearStoredWaitingQueueTicket();
        return publish({
          phase: 'idle',
          queueTicket: '',
        matchId: '',
        seatId: '',
        stateView: null,
        waitingReport: null,
        lastError: {
            reason: 'queue_ticket_expired',
            message: result && result.message || '实时论道队列已结束，请重新排队'
          },
          lastEvents: []
        });
      }
      return fail(result && result.reason || 'queue_status_failed', result && result.message || '实时论道队列状态读取失败');
    }
    if (result.status === 'matched') {
      clearStoredWaitingQueueTicket();
      const stateView = result.stateView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        matchId: result.matchId || '',
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        rematchReport: null,
        lastError: null
      });
    }
    rememberWaitingQueueTicket(result.queueTicket || state.queueTicket);
    return publish({
      phase: 'waiting',
      queueTicket: result.queueTicket || state.queueTicket || '',
      waitingReport: result.waitingReport || state.waitingReport || null,
      rematchReport: null,
      lastError: null
    });
  }

  async function cancelQueue() {
    if (!state.queueTicket) {
      return fail('missing_queue_ticket', '缺少实时论道队列票据', state.phase);
    }
    const result = await callLive('cancelQueue', state.queueTicket);
    if (!result || result.success === false) {
      return fail(result && result.reason || 'queue_cancel_failed', result && result.message || '实时论道取消排队失败');
    }
    clearStoredWaitingQueueTicket();
    clearStoredTerminalMatchId();
    return publish({
      ...DEFAULT_STATE,
      updatedAt: now()
    });
  }

  async function refreshMatch() {
    if (!state.matchId) {
      return fail('missing_match_id', '缺少实时论道战局', state.phase);
    }
    const result = await callLive('getMatch', state.matchId);
    if (!result || result.success === false) {
      return fail(result && result.reason || 'match_refresh_failed', result && result.message || '实时论道战局读取失败');
    }
    const stateView = result.stateView || null;
    const resolved = resolveAuthoritativeStateView(stateView);
    const nextView = resolved.stateView;
    const next = publish({
      phase: resolved.accepted ? normalizePhaseFromView(nextView, 'active') : state.phase,
      matchId: resolved.accepted ? result.matchId || state.matchId : state.matchId,
      seatId: resolved.accepted ? result.seatId || state.seatId : state.seatId,
      stateView: nextView,
      waitingReport: null,
      rematchReport: null,
      lastError: null,
      lastEvents: resolveAuthoritativeEvents(null, nextView, resolved.accepted)
    });
    if (resolved.accepted) clearStoredWaitingQueueTicket();
    rememberTerminalReviewMatch(next);
    return next;
  }

  async function resumeStoredWaitingQueue() {
    const queueTicket = readStoredWaitingQueueTicket();
    if (!queueTicket) return null;
    const result = await callLive('getQueueStatus', queueTicket);
    if (!result || result.success === false) {
      if (isQueueTicketExpired(result)) {
        clearStoredWaitingQueueTicket();
      }
      return null;
    }
    if (result.status === 'matched') {
      clearStoredWaitingQueueTicket();
      const stateView = result.stateView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        queueTicket: '',
        inviteCode: '',
        matchId: result.matchId || '',
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        inviteReport: null,
        rematchReport: null,
        lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : [],
        lastError: null
      });
    }
    if (result.status === 'waiting') {
      const nextTicket = result.queueTicket || queueTicket;
      rememberWaitingQueueTicket(nextTicket);
      return publish({
        phase: 'waiting',
        queueTicket: nextTicket,
        inviteCode: '',
        matchId: '',
        seatId: '',
        stateView: null,
        waitingReport: result.waitingReport || null,
        inviteReport: null,
        rematchReport: null,
        lastError: null,
        lastEvents: []
      });
    }
    return null;
  }

  async function resumeStoredTerminalReview() {
    const matchId = readStoredTerminalMatchId();
    if (!matchId) return null;
    const result = await callLive('getMatch', matchId);
    const stateView = result && result.stateView || null;
    if (!result || result.success === false || !stateView || stateView.status !== 'finished' || !stateView.postMatchReview) {
      if (shouldClearStoredTerminalMatch(result, stateView)) {
        clearStoredTerminalMatchId();
      }
      return null;
    }
    const next = publish({
      phase: 'finished',
      queueTicket: '',
      matchId: result.matchId || matchId,
      seatId: result.seatId || '',
      stateView,
      waitingReport: null,
      rematchReport: null,
      lastError: null,
      lastEvents: Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : []
    });
    rememberTerminalReviewMatch(next);
    return await resumePendingRematchFromTerminal(next);
  }

  function terminalReviewCanRequestRematch(stateView) {
    const actions = stateView && stateView.postMatchReview && Array.isArray(stateView.postMatchReview.nextActions)
      ? stateView.postMatchReview.nextActions
      : [];
    return actions.some(action => action && action.id === 'friendly_rematch');
  }

  async function resumePendingRematchFromTerminal(next) {
    const sourceMatchId = String(next && next.matchId || '').trim();
    if (!sourceMatchId || !terminalReviewCanRequestRematch(next && next.stateView)) return next;
    const statusResult = await callLive('getRematchStatus', sourceMatchId);
    if (statusResult && statusResult.success !== false && statusResult.status === 'waiting_rematch') {
      return publish({
        phase: 'waiting_rematch',
        queueTicket: '',
        matchId: sourceMatchId,
        seatId: next.seatId || '',
        stateView: next.stateView || null,
        waitingReport: null,
        rematchReport: statusResult.friendlySeries || state.rematchReport || null,
        lastError: {
          reason: 'waiting_rematch',
          message: statusResult.message || '已发起低压力再战，等待本局对手确认；不写正式积分。'
        },
        lastEvents: Array.isArray(next.lastEvents) ? next.lastEvents.slice(-8) : []
      });
    }
    if (isTerminalRematchResult(statusResult) && String(statusResult.reason || '') !== 'no_pending_rematch') {
      return publishTerminalRematch(statusResult, statusResult.reason || 'rematch_closed', statusResult.message);
    }
    return next;
  }

  async function resumeCurrentMatch() {
    if (state.queueTicket || state.matchId) {
      return getState();
    }
    const result = await callLive('getCurrentMatch');
    if (!result || result.success === false) {
      if (isNoCurrentMatch(result)) {
        const waitingQueue = await resumeStoredWaitingQueue();
        if (waitingQueue) return waitingQueue;
        const terminalReview = await resumeStoredTerminalReview();
        if (terminalReview) return terminalReview;
      }
      return publish({
        phase: 'idle',
        queueTicket: '',
        matchId: '',
        seatId: '',
        stateView: null,
        waitingReport: null,
        lastError: null,
        lastEvents: []
      });
    }
    clearStoredWaitingQueueTicket();
    const stateView = result.stateView || null;
    const next = publish({
      phase: normalizePhaseFromView(stateView, 'active'),
      queueTicket: '',
      matchId: result.matchId || (stateView && stateView.matchId) || '',
      seatId: result.seatId || '',
      stateView,
      waitingReport: null,
      rematchReport: null,
      lastError: null,
      lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : []
    });
    rememberTerminalReviewMatch(next);
    return next;
  }

  async function submitIntent(intent = {}) {
    if (!state.matchId) {
      return fail('missing_match_id', '缺少实时论道战局', state.phase);
    }
    const stateVersion = Number.isFinite(Number(intent.stateVersion))
      ? Math.floor(Number(intent.stateVersion))
      : Math.floor(Number(state.stateView && state.stateView.stateVersion) || 0);
    const result = await callLive('submitIntent', state.matchId, {
      intentId: intent.intentId,
      intentType: intent.intentType,
      stateVersion,
      payload: cloneData(intent.payload || {})
    });
    if (!result || result.success === false) {
      return fail(result && result.reason || 'intent_submit_failed', result && result.message || '实时论道行动提交失败');
    }
    if (result.result === 'sync_required') {
      const resolved = resolveAuthoritativeStateView(result.stateView || state.stateView);
      const nextView = resolved.stateView;
      return publish({
        phase: resolved.accepted ? 'sync_required' : state.phase,
        stateView: nextView,
        waitingReport: null,
        rematchReport: state.rematchReport || null,
        lastError: { reason: result.reason || 'sync_required', message: result.message || '需要同步权威状态' },
        lastEvents: resolveAuthoritativeEvents(result.events, nextView, resolved.accepted)
      });
    }
    if (result.result === 'rejected') {
      const resolved = resolveAuthoritativeStateView(result.stateView || state.stateView);
      const nextView = resolved.stateView;
      return publish({
        phase: resolved.accepted ? normalizePhaseFromView(nextView, state.phase || 'active') : state.phase,
        stateView: nextView,
        waitingReport: null,
        rematchReport: state.rematchReport || null,
        lastError: { reason: result.reason || 'rejected', message: result.message || '行动被拒绝' },
        lastEvents: resolveAuthoritativeEvents(result.events, nextView, resolved.accepted)
      });
    }
    const resolved = resolveAuthoritativeStateView(result.stateView || state.stateView);
    const nextView = resolved.stateView;
    const next = publish({
      phase: resolved.accepted ? normalizePhaseFromView(nextView, 'active') : state.phase,
      stateView: nextView,
      waitingReport: null,
      rematchReport: resolved.accepted && nextView && nextView.friendlySeries ? nextView.friendlySeries : state.rematchReport || null,
      lastEvents: resolveAuthoritativeEvents(result.events, nextView, resolved.accepted),
      lastError: null
    });
    rememberTerminalReviewMatch(next);
    return next;
  }

  async function heartbeat() {
    if (!state.matchId) {
      return fail('missing_match_id', '缺少实时论道战局', state.phase);
    }
    const result = await callLive('heartbeat', state.matchId);
    if (!result || result.success === false) {
      return fail(result && result.reason || 'heartbeat_failed', result && result.message || '实时论道心跳失败', state.phase);
    }
    const stateView = result.stateView || state.stateView;
    const resolved = resolveAuthoritativeStateView(stateView);
    const nextView = resolved.stateView;
    const next = publish({
      phase: resolved.accepted ? normalizePhaseFromView(nextView, state.phase || 'active') : state.phase,
      matchId: resolved.accepted ? result.matchId || state.matchId : state.matchId,
      seatId: resolved.accepted ? result.seatId || state.seatId : state.seatId,
      stateView: nextView,
      waitingReport: null,
      rematchReport: state.rematchReport || null,
      lastError: null,
      lastEvents: resolveAuthoritativeEvents(null, nextView, resolved.accepted)
    });
    rememberTerminalReviewMatch(next);
    return next;
  }

  async function surrender({ intentId = '' } = {}) {
    if (!state.matchId) {
      return fail('missing_match_id', '缺少实时论道战局', state.phase);
    }
    const fallbackIntentId = `surrender-${String(state.matchId).slice(0, 24)}-${Date.now().toString(36)}`;
    return await submitIntent({
      intentId: intentId || fallbackIntentId,
      intentType: 'surrender',
      stateVersion: state.stateView && state.stateView.stateVersion,
      payload: {}
    });
  }

  async function getReplay(options = {}) {
    const matchId = getSnapshotMatchId(state);
    if (!matchId) {
      return fail('replay_match_missing', '实时论道回放战局缺失', state.phase);
    }
    const result = await callLive('getReplay', matchId, options);
    if (!result || result.success !== true || !result.replay) {
      return fail(result && result.reason || 'replay_failed', result && result.message || '实时论道回放读取失败', state.phase);
    }
    if (getSnapshotMatchId(state) !== matchId) {
      return getState();
    }
    return publish({
      lastReplay: cloneData(result.replay),
      lastReplayMatchId: matchId,
      lastError: null
    });
  }

  async function submitReport(report = {}) {
    const matchId = getSnapshotMatchId(state);
    if (!matchId) {
      return fail('report_match_missing', '实时论道异常反馈战局缺失', state.phase);
    }
    const result = await callLive('submitReport', matchId, report);
    if (!result || result.success !== true || !result.report) {
      return fail(result && result.reason || 'report_issue_failed', result && result.message || '实时论道异常反馈提交失败', state.phase);
    }
    if (getSnapshotMatchId(state) !== matchId) {
      return getState();
    }
    const receipt = cloneData(result.report);
    return publish({
      lastDisputeReport: receipt,
      lastError: {
        reason: 'report_issue_submitted',
        message: receipt.nextStepLine || '异常反馈已提交；复核不会立即改写本局结算。'
      }
    });
  }

  async function requestRematch(options = {}) {
    if (!state.matchId) {
      return fail('missing_match_id', '缺少实时论道战局', state.phase);
    }
    const result = await callLive('requestRematch', state.matchId, options);
    if (!result || result.success === false) {
      return fail(result && result.reason || 'rematch_failed', result && result.message || '实时论道再战发起失败', state.phase);
    }
    const friendlySeries = result.friendlySeries || result.stateView && result.stateView.friendlySeries || null;
    if (result.status === 'matched') {
      clearStoredTerminalMatchId();
      const stateView = result.stateView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        queueTicket: '',
        matchId: result.matchId || '',
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        rematchReport: friendlySeries,
        lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : [],
        lastError: null
      });
    }
    if (result.status === 'waiting_rematch') {
      return publish({
        phase: 'waiting_rematch',
        waitingReport: null,
        rematchReport: friendlySeries,
        lastError: {
          reason: 'waiting_rematch',
          message: '已发起低压力再战，等待本局对手确认；不写正式积分。'
        }
      });
    }
    return fail(result.reason || 'rematch_unavailable', result.message || '实时论道再战暂不可用', state.phase);
  }

  function publishTerminalRematch(result, fallbackReason, fallbackMessage) {
    const reason = String(result && result.reason || fallbackReason || 'rematch_closed');
    const message = String(result && result.message || fallbackMessage || '低压力再战等待已结束，可回到复盘后重新发起。');
    return publish({
      phase: normalizePhaseFromView(state.stateView, 'finished'),
      queueTicket: '',
      waitingReport: null,
      rematchReport: result && result.friendlySeries ? result.friendlySeries : state.rematchReport || null,
      lastError: {
        reason,
        message
      }
    });
  }

  function isTerminalRematchResult(result) {
    if (!result || typeof result !== 'object') return false;
    const status = String(result.status || '').trim();
    const reason = String(result.reason || '').trim();
    return status === 'cancelled'
      || status === 'expired'
      || reason === 'rematch_cancelled'
      || reason === 'rematch_expired'
      || reason === 'no_pending_rematch';
  }

  async function cancelRematch() {
    if (state.phase !== 'waiting_rematch') {
      return getState();
    }
    const sourceMatchId = String(state.rematchReport && state.rematchReport.sourceMatchId || state.matchId || '').trim();
    if (!sourceMatchId) {
      return fail('missing_match_id', '缺少实时论道再战来源', state.phase);
    }
    const result = await callLive('cancelRematch', sourceMatchId);
    if (result && result.success !== false && (result.status === 'cancelled' || result.status === 'expired')) {
      return publishTerminalRematch(result, result.status === 'expired' ? 'rematch_expired' : 'rematch_cancelled', result.message);
    }
    if (isTerminalRematchResult(result)) {
      return publishTerminalRematch(result, result.reason || 'rematch_cancelled', result.message);
    }
    return fail(result && result.reason || 'rematch_cancel_failed', result && result.message || '实时论道再战取消失败', state.phase);
  }

  async function pollRematch() {
    if (state.phase !== 'waiting_rematch') {
      return getState();
    }
    const result = await callLive('getCurrentMatch');
    const resultFriendlySeries = result && result.stateView && result.stateView.friendlySeries
      ? result.stateView.friendlySeries
      : null;
    const resultMatchId = String(result && (result.matchId || result.stateView && result.stateView.matchId) || '').trim();
    const expectedSourceMatchId = String(state.rematchReport && state.rematchReport.sourceMatchId || state.matchId || '').trim();
    const expectedSeriesId = String(state.rematchReport && state.rematchReport.seriesId || '').trim();
    const resultSourceMatchId = String(resultFriendlySeries && resultFriendlySeries.sourceMatchId || '').trim();
    const resultSeriesId = String(resultFriendlySeries && resultFriendlySeries.seriesId || '').trim();
    const matchesExpectedRematch = resultSourceMatchId
      && resultSourceMatchId === expectedSourceMatchId
      && (!expectedSeriesId || resultSeriesId === expectedSeriesId);
    if (result && result.success === true && resultMatchId && resultMatchId !== state.matchId && result.stateView && result.stateView.mode === 'friendly' && matchesExpectedRematch) {
      clearStoredTerminalMatchId();
      const stateView = result.stateView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        queueTicket: '',
        matchId: resultMatchId,
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        rematchReport: resultFriendlySeries,
        lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : [],
        lastError: null
      });
    }
    if (!result || result.success === false) {
      if (!isNoCurrentMatch(result)) {
        return fail(result && result.reason || 'rematch_poll_failed', result && result.message || '实时论道再战状态读取失败', 'waiting_rematch');
      }
    }
    const statusResult = await callLive('getRematchStatus', expectedSourceMatchId);
    if (statusResult && statusResult.success !== false && statusResult.status === 'waiting_rematch') {
      return publish({
        phase: 'waiting_rematch',
        waitingReport: null,
        rematchReport: statusResult.friendlySeries || state.rematchReport || null,
        lastError: {
          reason: 'waiting_rematch',
          message: statusResult.message || '已发起低压力再战，等待本局对手确认；不写正式积分。'
        }
      });
    }
    if (isTerminalRematchResult(statusResult)) {
      return publishTerminalRematch(statusResult, statusResult.reason || 'rematch_closed', statusResult.message);
    }
    return publish({
      phase: 'waiting_rematch',
      waitingReport: null,
      rematchReport: state.rematchReport || null,
      lastError: {
        reason: 'waiting_rematch',
        message: '已发起低压力再战，等待本局对手确认；不写正式积分。'
      }
    });
  }

  async function createInvite(options = {}) {
    publish({ phase: 'creating_invite', lastError: null, lastEvents: [] });
    const result = await callLive('createInvite', options);
    if (!result || result.success === false) {
      return publish({
        ...DEFAULT_STATE,
        phase: 'idle',
        lastError: {
          reason: result && result.reason || 'invite_create_failed',
          message: result && result.message || '实时论道邀请创建失败'
        }
      });
    }
    clearStoredTerminalMatchId();
    if (result.status === 'matched') {
      const stateView = result.stateView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        queueTicket: '',
        inviteCode: '',
        matchId: result.matchId || '',
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        inviteReport: null,
        inviteInbox: [],
        rematchReport: null,
        lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : [],
        lastError: null
      });
    }
    if (result.status === 'waiting_invite') {
      return publishInviteWaiting(result);
    }
    return fail(result.reason || 'invite_unavailable', result.message || '实时论道邀请暂不可用', state.phase);
  }

  async function resumeCurrentInvite() {
    if (state.queueTicket || state.matchId) {
      return getState();
    }
    const result = await callLive('getCurrentInvite');
    if (!result || result.success === false) {
      if (result && result.reason === 'invite_expired') {
        return publishInviteExpired(result);
      }
      if (isNoCurrentInvite(result)) {
        return publish({
          phase: 'idle',
          queueTicket: '',
          inviteCode: '',
          matchId: '',
          seatId: '',
          stateView: null,
          waitingReport: null,
          inviteReport: null,
          inviteInbox: state.inviteInbox || [],
          rematchReport: null,
          lastError: null,
          lastEvents: []
        });
      }
      return fail(result && result.reason || 'invite_resume_failed', result && result.message || '实时论道邀请状态读取失败', state.phase);
    }
    if (result.status === 'waiting_invite') {
      return publishInviteWaiting(result, '已恢复等待中的好友约战，分享邀请码等待对手加入；不写正式积分。');
    }
    return getState();
  }

  async function refreshInviteInbox() {
    const result = await callLive('getInviteInbox');
    if (!result || result.success === false) {
      return publish({
        inviteInbox: Array.isArray(state.inviteInbox) ? state.inviteInbox : [],
        lastError: {
          reason: 'invite_inbox_failed',
          message: result && result.message || '邀请收件箱暂时不可用'
        }
      });
    }
    return publish({
      inviteInbox: normalizeInviteInbox(result),
      lastError: null
    });
  }

  async function joinInvite(inviteCode = '', options = {}) {
    const code = String(inviteCode || '').trim();
    if (!code) {
      return fail('missing_invite_code', '缺少实时论道邀请码', state.phase);
    }
    const result = await callLive('joinInvite', code, options);
    if (!result || result.success === false) {
      return fail(result && result.reason || 'invite_join_failed', result && result.message || '实时论道邀请加入失败', state.phase);
    }
    if (result.status === 'matched') {
      clearStoredTerminalMatchId();
      const stateView = result.stateView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        queueTicket: '',
        inviteCode: '',
        matchId: result.matchId || '',
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        inviteReport: null,
        inviteInbox: [],
        rematchReport: null,
        lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : [],
        lastError: null
      });
    }
    return fail(result.reason || 'invite_join_unavailable', result.message || '实时论道邀请暂不可加入', state.phase);
  }

  async function cancelInvite(inviteCode = '') {
    const code = String(inviteCode || state.inviteCode || '').trim();
    if (!code) {
      return fail('missing_invite_code', '缺少实时论道邀请码', state.phase);
    }
    const result = await callLive('cancelInvite', code);
    if (!result || result.success === false) {
      if (result && result.reason === 'invite_expired') {
        return publishInviteExpired(result);
      }
      return fail(result && result.reason || 'invite_cancel_failed', result && result.message || '实时论道邀请取消失败', state.phase);
    }
    if (result.status === 'cancelled') {
      return publish({
        phase: 'idle',
        queueTicket: '',
        inviteCode: '',
        matchId: '',
        seatId: '',
        stateView: null,
        waitingReport: null,
        inviteReport: null,
        inviteInbox: [],
        rematchReport: null,
        lastEvents: [],
        lastError: {
          reason: 'invite_cancelled',
          message: '好友约战已取消，可以重新创建约战或进入公共匹配。'
        }
      });
    }
    return fail(result.reason || 'invite_cancel_unavailable', result.message || '实时论道邀请暂不可取消', state.phase);
  }

  async function pollInvite() {
    if (state.phase !== 'waiting_invite') {
      return getState();
    }
    const result = await callLive('getCurrentMatch');
    const resultMatchId = String(result && (result.matchId || result.stateView && result.stateView.matchId) || '').trim();
    const resultView = result && result.stateView || null;
    const quality = resultView && resultView.matchQuality || null;
    const safeguards = Array.isArray(quality && quality.safeguards) ? quality.safeguards : [];
    const isAcceptedInviteMatch = resultView
      && resultView.mode === 'friendly'
      && (quality && quality.expansionStage === 'friend_invite' || safeguards.includes('invite_only_match'));
    if (result && result.success === true && resultMatchId && resultView && isAcceptedInviteMatch) {
      clearStoredTerminalMatchId();
      const stateView = resultView || null;
      return publish({
        phase: normalizePhaseFromView(stateView, 'matched'),
        queueTicket: '',
        inviteCode: '',
        matchId: resultMatchId,
        seatId: result.seatId || '',
        stateView,
        waitingReport: null,
        inviteReport: null,
        inviteInbox: [],
        rematchReport: null,
        lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : [],
        lastError: null
      });
    }
    if (result && result.success === true && resultMatchId && resultView) {
      clearStoredTerminalMatchId();
      return publish({
        phase: normalizePhaseFromView(resultView, 'active'),
        queueTicket: '',
        inviteCode: '',
        matchId: resultMatchId,
        seatId: result.seatId || '',
        stateView: resultView,
        waitingReport: null,
        inviteReport: null,
        rematchReport: resultView && resultView.friendlySeries ? resultView.friendlySeries : null,
        lastEvents: resultView && Array.isArray(resultView.recentEvents) ? resultView.recentEvents.slice(-8) : [],
        lastError: {
          reason: 'invite_recovered_current_match',
          message: '已恢复当前实时论道，好友约战等待态已结束。'
        }
      });
    }
    if (!result || result.success === false) {
      if (!isNoCurrentMatch(result)) {
        return fail(result && result.reason || 'invite_poll_failed', result && result.message || '实时论道邀请状态读取失败', 'waiting_invite');
      }
    }
    const inviteResult = await callLive('getCurrentInvite');
    if (!inviteResult || inviteResult.success === false) {
      if (inviteResult && inviteResult.reason === 'invite_expired') {
        return publishInviteExpired(inviteResult);
      }
      if (isNoCurrentInvite(inviteResult)) {
        return publish({
          phase: 'idle',
          queueTicket: '',
          inviteCode: '',
          matchId: '',
          seatId: '',
          stateView: null,
          waitingReport: null,
          inviteReport: null,
          rematchReport: null,
          lastError: {
            reason: 'invite_not_found',
            message: '好友约战已结束或失效，可以重新创建约战或进入公共匹配。'
          }
        });
      }
      return fail(inviteResult && inviteResult.reason || 'invite_poll_failed', inviteResult && inviteResult.message || '实时论道邀请状态读取失败', 'waiting_invite');
    }
    if (inviteResult.status === 'waiting_invite') {
      return publishInviteWaiting(inviteResult);
    }
    return getState();
  }

  async function mulligan({ cardInstanceIds = [], intentId = '' } = {}) {
    if (!state.matchId) {
      return fail('missing_match_id', '缺少实时论道战局', state.phase);
    }
    const fallbackIntentId = `mulligan-${String(state.matchId).slice(0, 24)}-${Date.now().toString(36)}`;
    return await submitIntent({
      intentId: intentId || fallbackIntentId,
      intentType: 'mulligan',
      stateVersion: state.stateView && state.stateView.stateVersion,
      payload: {
        cardInstanceIds: Array.isArray(cardInstanceIds) ? cardInstanceIds.slice(0, 2) : []
      }
    });
  }

  async function ready({ intentId = '' } = {}) {
    if (!state.matchId) {
      return fail('missing_match_id', '缺少实时论道战局', state.phase);
    }
    const fallbackIntentId = `ready-${String(state.matchId).slice(0, 24)}-${Date.now().toString(36)}`;
    return await submitIntent({
      intentId: intentId || fallbackIntentId,
      intentType: 'ready',
      stateVersion: state.stateView && state.stateView.stateVersion,
      payload: {}
    });
  }

  function reset() {
    clearStoredTerminalMatchId();
    disconnectRealtime();
    return publish({
      ...DEFAULT_STATE,
      updatedAt: now()
    });
  }

  return {
    getState,
    joinQueue,
    createInvite,
    joinInvite,
    cancelInvite,
    pollInvite,
    refreshInviteInbox,
    cancelQueue,
    pollQueue,
    refreshMatch,
    resumeCurrentMatch,
    resumeCurrentInvite,
    submitIntent,
    heartbeat,
    connectRealtime,
    joinRealtimeMatch,
    resumeRealtime,
    submitRealtimeIntent,
    heartbeatRealtime,
    disconnectRealtime,
    getSeasonGoalState: readSeasonGoalState,
    recordSeasonGoalAction,
    dismissSeasonGoal,
    getReplay,
    submitReport,
    requestRematch,
    pollRematch,
    cancelRematch,
    mulligan,
    ready,
    surrender,
    reset
  };
}

export const PvpLiveSession = {
  create: createPvpLiveSession
};
