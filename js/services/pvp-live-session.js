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
  lastEvents: [],
  lastError: null,
  updatedAt: 0
});
const LAST_TERMINAL_MATCH_STORAGE_KEY = 'theDefierPvpLiveLastTerminalMatchV1';

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
  now = () => Date.now()
} = {}) {
  let state = {
    ...DEFAULT_STATE,
    updatedAt: now()
  };

  const publish = (patch = {}) => {
    state = {
      ...state,
      ...patch,
      updatedAt: now()
    };
    return getState();
  };

  const getTerminalStorageKey = () => {
    const scope = normalizeStorageScope(typeof userScope === 'function' ? userScope() : userScope);
    return scope ? `${LAST_TERMINAL_MATCH_STORAGE_KEY}:${scope}` : LAST_TERMINAL_MATCH_STORAGE_KEY;
  };

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

  const rememberTerminalReviewMatch = (nextState = state) => {
    const view = nextState && nextState.stateView ? nextState.stateView : null;
    const matchId = String(nextState && nextState.matchId || view && view.matchId || '').trim();
    if (!matchId || !view || view.status !== 'finished' || !view.postMatchReview) return;
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

  function getState() {
    return cloneData(state);
  }

  async function joinQueue(options = {}) {
    publish({ phase: 'queueing', lastError: null, lastEvents: [] });
    const result = await callLive('joinQueue', options);
    if (!result || result.success === false) {
      return publish({
        ...DEFAULT_STATE,
        phase: 'idle',
        lastError: {
          reason: result && result.reason || 'queue_join_failed',
          message: result && result.message || '实时论道入队失败'
        }
      });
    }
    clearStoredTerminalMatchId();
    if (result.status === 'matched') {
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
        lastError: null
      });
    }
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
    return publish({
      phase: 'waiting',
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
    const next = publish({
      phase: normalizePhaseFromView(stateView, 'active'),
      matchId: result.matchId || state.matchId,
      seatId: result.seatId || state.seatId,
      stateView,
      waitingReport: null,
      rematchReport: null,
      lastError: null,
      lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : []
    });
    rememberTerminalReviewMatch(next);
    return next;
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
    return next;
  }

  async function resumeCurrentMatch() {
    if (state.queueTicket || state.matchId) {
      return getState();
    }
    const result = await callLive('getCurrentMatch');
    if (!result || result.success === false) {
      if (isNoCurrentMatch(result)) {
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
      return publish({
      phase: 'sync_required',
      stateView: result.stateView || state.stateView,
      waitingReport: null,
      rematchReport: state.rematchReport || null,
      lastError: { reason: result.reason || 'sync_required', message: result.message || '需要同步权威状态' },
        lastEvents: Array.isArray(result.events) ? result.events : []
      });
    }
    if (result.result === 'rejected') {
      return publish({
        phase: normalizePhaseFromView(result.stateView || state.stateView, state.phase || 'active'),
        stateView: result.stateView || state.stateView,
        waitingReport: null,
        rematchReport: state.rematchReport || null,
        lastError: { reason: result.reason || 'rejected', message: result.message || '行动被拒绝' },
        lastEvents: Array.isArray(result.events) ? result.events : []
      });
    }
    const nextView = result.stateView || state.stateView;
    const next = publish({
      phase: normalizePhaseFromView(nextView, 'active'),
      stateView: nextView,
      waitingReport: null,
      rematchReport: nextView && nextView.friendlySeries ? nextView.friendlySeries : state.rematchReport || null,
      lastEvents: Array.isArray(result.events) ? result.events : [],
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
    const next = publish({
      phase: normalizePhaseFromView(stateView, state.phase || 'active'),
      matchId: result.matchId || state.matchId,
      seatId: result.seatId || state.seatId,
      stateView,
      waitingReport: null,
      rematchReport: state.rematchReport || null,
      lastError: null,
      lastEvents: stateView && Array.isArray(stateView.recentEvents) ? stateView.recentEvents.slice(-8) : state.lastEvents
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
    const matchId = String(state.matchId || state.stateView && state.stateView.matchId || '').trim();
    if (!matchId) {
      return fail('replay_match_missing', '实时论道回放战局缺失', state.phase);
    }
    const result = await callLive('getReplay', matchId, options);
    if (!result || result.success !== true || !result.replay) {
      return fail(result && result.reason || 'replay_failed', result && result.message || '实时论道回放读取失败', state.phase);
    }
    return publish({
      lastReplay: cloneData(result.replay),
      lastError: null
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
    getReplay,
    requestRematch,
    pollRematch,
    mulligan,
    ready,
    surrender,
    reset
  };
}

export const PvpLiveSession = {
  create: createPvpLiveSession
};
