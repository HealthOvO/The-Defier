import assert from 'node:assert';

const documentListeners = new Map();
const windowListeners = new Map();
const localStorageState = new Map();

function addListener(registry, type, listener) {
  if (!registry.has(type)) registry.set(type, []);
  registry.get(type).push(listener);
}

function dispatchListeners(registry, type, event = {}) {
  const listeners = registry.get(type) || [];
  listeners.forEach(listener => listener({ type, ...event }));
}

const documentStub = {
  hidden: false,
  addEventListener(type, listener) {
    addListener(documentListeners, type, listener);
  },
  createElement() {
    return {
      style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild() {},
      querySelector() { return null; },
      querySelectorAll() { return []; }
    };
  },
  body: { appendChild() {} },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};

let nextTimerId = 1;
const scheduledIntervals = [];
const clearedTimers = [];

globalThis.document = documentStub;
globalThis.window = {
  addEventListener(type, listener) {
    addListener(windowListeners, type, listener);
  },
  removeEventListener() {},
  setInterval(callback, intervalMs) {
    const id = nextTimerId;
    nextTimerId += 1;
    scheduledIntervals.push({ id, callback, intervalMs });
    return id;
  },
  clearInterval(id) {
    clearedTimers.push(id);
  }
};
globalThis.localStorage = {
  getItem(key) {
    return localStorageState.has(key) ? localStorageState.get(key) : null;
  },
  setItem(key, value) {
    localStorageState.set(key, String(value));
  },
  removeItem(key) {
    localStorageState.delete(key);
  }
};
globalThis.window.localStorage = globalThis.localStorage;

const { PVPScene } = await import('../js/scenes/pvp-scene.js');

PVPScene.getLiveSession = () => ({
  getState: () => ({
    phase: 'active',
    matchId: 'pvpm-ui-runtime-realtime',
    seatId: 'A',
    realtimeStatus: 'reconnecting',
    lastRealtimeSyncAt: 1781871234567,
    realtimeReport: {
      connectionId: 'ws-runtime-1',
      heartbeatIntervalMs: 1200
    },
    lastError: {
      reason: 'live_ws_reconnecting',
      message: '实时论道 WS 正在重连'
    },
    stateView: {
      matchId: 'pvpm-ui-runtime-realtime',
      status: 'active',
      stateVersion: 8,
      currentSeat: 'A',
      connectionReport: {
        heartbeatIntervalMs: 1200
      }
    }
  })
});

localStorageState.set('the-defier:pvp-live-social-preferences:v1', JSON.stringify({ socialMuted: true }));
PVPScene.liveSocialMuted = false;
PVPScene.liveSocialPreferencesLoaded = false;
PVPScene.loadLiveSocialPreferences();
assert.equal(PVPScene.liveSocialMuted, true, 'live social mute preference should load from local storage');
const persistedMuteSnapshot = PVPScene.getLiveSnapshot();
assert.equal(persistedMuteSnapshot.social.muted, true, 'live snapshot should expose persisted local social mute');
assert.equal(persistedMuteSnapshot.social.preferenceScope, 'local_only', 'live social preference should be scoped to local display only');
assert.equal(persistedMuteSnapshot.social.sourceVisibility, 'local_preference', 'live social preference should be marked as local visibility state');
assert.equal(persistedMuteSnapshot.social.rankedImpact, 'none', 'live social preference should not affect ranked state');
PVPScene.toggleLiveSocialMute();
assert.equal(PVPScene.liveSocialMuted, false, 'toggle should update in-memory social mute preference');
assert.match(
  localStorageState.get('the-defier:pvp-live-social-preferences:v1') || '',
  /"socialMuted":false/,
  'toggle should persist social mute preference for the next session',
);

const realtimeSnapshot = PVPScene.getLiveSnapshot();
assert.equal(realtimeSnapshot.realtimeStatus, 'reconnecting', 'live snapshot should expose local realtime reconnecting status');
assert.equal(realtimeSnapshot.lastRealtimeSyncAt, 1781871234567, 'live snapshot should expose last local realtime sync timestamp');
assert.deepEqual(
  realtimeSnapshot.realtimeReport,
  { connectionId: 'ws-runtime-1', heartbeatIntervalMs: 1200 },
  'live snapshot should expose cloned local realtime report for text renderers',
);
assert.equal(
  realtimeSnapshot.lastError.reason,
  'live_ws_reconnecting',
  'live snapshot should preserve local realtime reconnect reason for UI diagnostics',
);

assert.equal(
  PVPScene.getLiveLastSeenEventRevision({
    stateView: { recentEvents: [{ eventType: 'battle_started', sequence: 2 }] },
    lastEvents: [{ eventType: 'card_played', sequence: 7 }]
  }),
  7,
  'getLiveLastSeenEventRevision should prefer replay event high-water marks when reconnecting',
);

const localGraceConnectionCopy = PVPScene.formatLiveConnectionStatus({
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'grace', isViewer: true, remainingGraceMs: 12700 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(localGraceConnectionCopy, /我方重连宽限 13s/, 'live UI local reconnect grace exposes remaining countdown');
assert.match(localGraceConnectionCopy, /自动恢复|恢复权威连接|切回页面/, 'live UI local reconnect grace should give explicit recovery guidance');
assert.doesNotMatch(localGraceConnectionCopy, /行动倒计时|准备倒计时/, 'live UI local reconnect grace keeps timeout copy off the turn timer');

const localDisconnectedConnectionCopy = PVPScene.formatLiveConnectionStatus({
  connectionReport: {
    reportVersion: 'pvp-live-connection-v1',
    viewerSeat: 'A',
    opponentSeat: 'B',
    heartbeatIntervalMs: 1000,
    heartbeatStaleMs: 1000,
    graceMs: 30000,
    viewer: { seatId: 'A', status: 'disconnected', isViewer: true, remainingGraceMs: 0 },
    opponent: { seatId: 'B', status: 'online', isViewer: false, remainingGraceMs: 0 }
  }
});
assert.match(localDisconnectedConnectionCopy, /我方断线/, 'live UI local disconnected state should name the viewer as disconnected');
assert.match(localDisconnectedConnectionCopy, /刷新同步权威结果|同步权威结果/, 'live UI local disconnected state prefers authoritative sync guidance before connection_timeout');
assert.match(localDisconnectedConnectionCopy, /仍在可恢复窗口会自动重连/, 'live UI local disconnected state keeps recovery conditional');
assert.match(localDisconnectedConnectionCopy, /权威|connection_timeout|超时结算/, 'live UI local disconnected state should explain authoritative terminal boundary');

const matchQualityWithConnectionGate = PVPScene.formatLiveMatchQuality({
  matchQuality: {
    reportVersion: 'pvp-live-match-quality-v1',
    tag: 'good',
    expansionStage: 'strict_rating',
    ratingDeltaBucket: 'near_0_99',
    waitMs: { A: 1200, B: 800 },
    candidatePoolSize: 2,
    connectionHealth: 'pass',
    connectionHealthSummary: {
      status: 'pass',
      sampleTag: 'client_preflight'
    },
    safeguards: ['server_authoritative', 'connection_health_gate']
  }
});
assert.match(matchQualityWithConnectionGate, /连接健康通过/, 'live UI match quality should expose passed connection health gate');
assert.doesNotMatch(matchQualityWithConnectionGate, /rtt|missed|heartbeat|reconnect|延迟.*\\d/i, 'live UI match quality should not expose raw connection probe details');

let entrySafeguardState = {
  phase: 'idle',
  queueTicket: '',
  matchId: '',
  lastError: {
    reason: 'connection_health_failed',
    message: '当前连接不适合进入正式真人排位，请重试检测或先进入问道练习。',
    connectionHealth: {
      reportVersion: 'pvp-live-queue-connection-health-v1',
      status: 'blocked',
      sampleTag: 'client_preflight',
      reasons: ['latency_unstable'],
      actions: [
        { id: 'retry_connection_check', label: '重试检测', detail: '重新检测连接后再尝试入队。' },
        { id: 'practice', label: '问道练习', detail: '进入不写正式积分的练习。' }
      ]
    }
  },
  stateView: null,
  lastEvents: []
};
PVPScene.liveSelectedLoadoutPreset = 'sword';
PVPScene.getLiveSession = () => ({ getState: () => entrySafeguardState });
assert.equal(PVPScene.isLiveEntrySafeguardBlocked(), true, 'blocked connection health should mark live entry safeguard as active');
assert.equal(PVPScene.hasLiveEntrySafeguardAction(null, 'retry_connection_check'), true, 'blocked connection health should expose retry action');
assert.equal(PVPScene.hasLiveEntrySafeguardAction(null, 'practice'), true, 'blocked connection health should expose practice action');
const entryScenario = PVPScene.buildLiveEntrySafeguardPracticeScenario();
assert.equal(entryScenario.sourceMatchId, 'entry_safeguard:connection_health_failed', 'entry safeguard drill should have a stable source id');
assert.equal(entryScenario.sourceVisibility, 'replay_self', 'entry safeguard drill should use self-visible replay data only');
assert.equal(entryScenario.usesHiddenInformation, false, 'entry safeguard drill must not use hidden opponent information');
assert.equal(entryScenario.rankedImpact, 'none', 'entry safeguard drill must not write ranked score');
assert.ok(entryScenario.trainingTags.includes('连接健康练习'), 'entry safeguard drill should be labeled as connection health practice');
PVPScene.liveDrillScenario = entryScenario;
assert.equal(
  PVPScene.getLiveSnapshot().drillScenario.sourceMatchId,
  'entry_safeguard:connection_health_failed',
  'live snapshot should keep the entry safeguard drill visible while no live match is active',
);
const oldDocumentQuerySelector = documentStub.querySelector;
const liveButtons = new Map([
  ['join-queue', { disabled: true, textContent: '入队', querySelector() { return null; } }],
  ['practice-live', { disabled: true, textContent: '问道练习', querySelector() { return null; } }],
]);
const liveRootStub = {
  querySelector(selector) {
    const actionMatch = String(selector || '').match(/^\[data-live-action="([^"]+)"\]$/);
    return actionMatch ? liveButtons.get(actionMatch[1]) || null : null;
  },
  querySelectorAll() { return []; }
};
documentStub.querySelector = (selector) => selector === '[data-live-pvp-root]' ? liveRootStub : null;
PVPScene.updateLiveButtons('idle', false, null);
assert.equal(liveButtons.get('join-queue').disabled, false, 'blocked entry safeguard should keep retry join button enabled');
assert.equal(liveButtons.get('join-queue').textContent, '重试检测', 'blocked entry safeguard should relabel join button to retry connection check');
assert.equal(liveButtons.get('practice-live').disabled, false, 'blocked entry safeguard should enable no-score practice');
entrySafeguardState = { phase: 'idle', queueTicket: '', matchId: '', lastError: null, stateView: null, lastEvents: [] };
PVPScene.updateLiveButtons('idle', false, null);
assert.equal(liveButtons.get('join-queue').textContent, '入队', 'healthy idle live entry should restore normal queue copy');
assert.equal(liveButtons.get('practice-live').disabled, true, 'healthy idle live entry should not expose practice without a blocked safeguard action');
documentStub.querySelector = oldDocumentQuerySelector;

let currentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-heartbeat',
  stateView: {
    connectionReport: {
      heartbeatIntervalMs: 1200
    }
  }
};
let heartbeatCalls = 0;
let renderCalls = 0;

PVPScene.getLiveSession = () => ({
  getState: () => currentState,
  async heartbeat() {
    heartbeatCalls += 1;
    currentState = {
      ...currentState,
      stateView: {
        ...currentState.stateView,
        connectionReport: {
          heartbeatIntervalMs: 2400
        }
      }
    };
  }
});
PVPScene.renderLivePanel = () => {
  renderCalls += 1;
};

const originalSendLiveHeartbeat = PVPScene.sendLiveHeartbeat;
let immediateHeartbeatCalls = 0;
PVPScene.sendLiveHeartbeat = async () => {
  immediateHeartbeatCalls += 1;
};

PVPScene.startLiveHeartbeat();
await Promise.resolve();
assert.deepEqual(
  scheduledIntervals.map(entry => entry.intervalMs),
  [1200],
  'startLiveHeartbeat runtime should schedule the server heartbeat interval',
);
assert.equal(PVPScene.liveHeartbeatIntervalMs, 1200, 'scene should remember the active heartbeat interval');
assert.equal(immediateHeartbeatCalls, 1, 'startLiveHeartbeat should still send one immediate heartbeat');

PVPScene.startLiveHeartbeat();
await Promise.resolve();
assert.equal(scheduledIntervals.length, 1, 'startLiveHeartbeat runtime should not stack duplicate timers for the same interval');
assert.equal(clearedTimers.length, 0, 'same-interval heartbeat start should not clear and rebuild the timer');

currentState = {
  ...currentState,
  stateView: {
    ...currentState.stateView,
    connectionReport: {
      heartbeatIntervalMs: 2400
    }
  }
};
PVPScene.startLiveHeartbeat();
await Promise.resolve();
assert.deepEqual(
  scheduledIntervals.map(entry => entry.intervalMs),
  [1200, 2400],
  'startLiveHeartbeat runtime should rebuild timer when the server interval changes',
);
assert.deepEqual(clearedTimers, [1], 'server interval change should clear the old heartbeat timer');
assert.equal(PVPScene.liveHeartbeatIntervalMs, 2400, 'scene should retain the rebuilt heartbeat interval');

PVPScene.stopLiveHeartbeat();
scheduledIntervals.length = 0;
clearedTimers.length = 0;
nextTimerId = 1;
currentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-heartbeat',
  stateView: {
    connectionReport: {
      heartbeatIntervalMs: 1200
    }
  }
};
PVPScene.sendLiveHeartbeat = async () => {};
PVPScene.startLiveHeartbeat();
await Promise.resolve();

PVPScene.sendLiveHeartbeat = originalSendLiveHeartbeat;
await PVPScene.sendLiveHeartbeat();
assert.equal(heartbeatCalls, 1, 'sendLiveHeartbeat runtime should call session heartbeat');
assert.equal(renderCalls, 1, 'sendLiveHeartbeat runtime should rerender after heartbeat state sync');
assert.deepEqual(
  scheduledIntervals.map(entry => entry.intervalMs),
  [1200, 2400],
  'sendLiveHeartbeat runtime should rebuild heartbeat timer after receiving a new server interval',
);
assert.deepEqual(clearedTimers, [1], 'sendLiveHeartbeat runtime should clear stale timer after server interval changes');

PVPScene.stopLiveHeartbeat();
scheduledIntervals.length = 0;
clearedTimers.length = 0;
nextTimerId = 1;

let foregroundState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-foreground',
  realtimeStatus: 'reconnecting',
  stateView: {
    matchId: 'pvpm-ui-runtime-foreground',
    status: 'active',
    stateVersion: 11,
    currentSeat: 'A',
    connectionReport: {
      heartbeatIntervalMs: 1200
    }
  }
};
let foregroundResumeCalls = 0;
let foregroundHeartbeatCalls = 0;
let foregroundRenderCalls = 0;
PVPScene.liveLifecycleBound = false;
PVPScene.liveForegroundResumeQueued = false;
PVPScene.liveForegroundResumeTimer = null;
PVPScene.liveHeartbeatTimer = null;
PVPScene.liveHeartbeatIntervalMs = 0;
PVPScene.getLiveSession = () => ({
  getState: () => foregroundState,
  connectRealtime: () => true,
  joinRealtimeMatch: () => true,
  resumeRealtime: (matchId) => {
    foregroundResumeCalls += 1;
    assert.equal(matchId, 'pvpm-ui-runtime-foreground', 'foreground resume should target the active live match');
    return true;
  },
  heartbeatRealtime: () => false,
  heartbeat: async () => {
    foregroundHeartbeatCalls += 1;
    foregroundState = {
      ...foregroundState,
      realtimeStatus: 'connected'
    };
  },
  disconnectRealtime: () => {}
});
PVPScene.renderLivePanel = () => {
  foregroundRenderCalls += 1;
};
PVPScene.startLiveHeartbeat({ sendImmediately: false });
assert.ok((documentListeners.get('visibilitychange') || []).length > 0, 'live UI foreground resume should bind document visibilitychange');
assert.ok((windowListeners.get('focus') || []).length > 0, 'live UI foreground resume should bind window focus');
assert.ok((windowListeners.get('pageshow') || []).length > 0, 'live UI foreground resume should bind window pageshow');

documentStub.hidden = true;
dispatchListeners(documentListeners, 'visibilitychange');
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 0, 'live UI foreground resume should ignore hidden visibilitychange');
assert.equal(foregroundHeartbeatCalls, 0, 'live UI foreground resume should not heartbeat while the document is hidden');

documentStub.hidden = false;
dispatchListeners(documentListeners, 'visibilitychange');
dispatchListeners(windowListeners, 'focus');
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 1, 'resume-visible live UI should trigger one immediate realtime resume after hidden-tab throttling');
assert.equal(foregroundHeartbeatCalls, 1, 'live UI foreground resume should send one immediate heartbeat for reconnecting matches');
assert.equal(foregroundRenderCalls, 1, 'live UI foreground resume should rerender after the authority heartbeat');

dispatchListeners(windowListeners, 'focus');
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 1, 'live UI foreground resume should not double-fire focus after the same visibility return');
assert.equal(foregroundHeartbeatCalls, 1, 'live UI foreground resume should not double-heartbeat after a follow-up focus task');

if (PVPScene.liveForegroundResumeTimer) {
  clearTimeout(PVPScene.liveForegroundResumeTimer);
  PVPScene.liveForegroundResumeTimer = null;
}
PVPScene.liveForegroundResumeQueued = false;
PVPScene.activeTab = 'ranking';
dispatchListeners(windowListeners, 'pageshow');
await Promise.resolve();
await Promise.resolve();
await Promise.resolve();
assert.equal(foregroundResumeCalls, 1, 'live UI foreground resume should not restart realtime after leaving the live tab');
assert.equal(foregroundHeartbeatCalls, 1, 'live UI foreground resume should not heartbeat after leaving the live tab');
PVPScene.activeTab = 'live';

PVPScene.stopLiveHeartbeat();

let intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 3,
    currentSeat: 'A'
  },
  lastEvents: [
    { eventType: 'turn_ended', actingSeat: 'A', sequence: 3, payload: { nextSeat: 'B' } }
  ]
};
const realtimeIntentCalls = [];
PVPScene.liveIntentSeq = 0;
PVPScene.liveIntentInFlight = null;
PVPScene.startLiveRealtime = () => {};
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => intentState,
  submitRealtimeIntent: (intent, matchId) => {
    realtimeIntentCalls.push({ intent, matchId });
    return true;
  },
  submitIntent: async () => {
    throw new Error('HTTP fallback should not run while realtime intent send succeeds');
  }
});

await Promise.all([
  PVPScene.endLiveTurn(),
  PVPScene.endLiveTurn()
]);
assert.equal(realtimeIntentCalls.length, 1, 'live UI should keep one realtime intent in-flight and ignore double-click submits');

intentState = {
  ...intentState,
  stateView: {
    ...intentState.stateView,
    stateVersion: 4
  },
  lastEvents: [
    { eventType: 'turn_ended', actingSeat: 'A', sequence: 3, payload: { nextSeat: 'B' } },
    { eventType: 'emote_sent', actingSeat: 'B', sequence: 4, payload: { seatId: 'B', emoteId: 'thinking', label: '思考' } }
  ]
};
await PVPScene.endLiveTurn();
assert.equal(
  realtimeIntentCalls.length,
  1,
  'live UI should not unlock action intent when social stateVersion advance includes stale action events',
);

intentState = {
  ...intentState,
  stateView: {
    ...intentState.stateView,
    stateVersion: 5
  },
  lastEvents: [
    { eventType: 'turn_ended', actingSeat: 'A', sequence: 5, payload: { nextSeat: 'B' } }
  ]
};
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 2, 'live UI should unlock realtime action intent after matching authoritative action event advances stateVersion');

intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 8,
    currentSeat: 'A'
  }
};
PVPScene.liveIntentInFlight = null;
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 3, 'live UI should send the first action intent before reconnect protection check');
intentState = {
  ...intentState,
  realtimeStatus: 'reconnecting',
  lastError: { reason: 'live_ws_reconnecting', message: '实时论道 WS 正在重连' },
  updatedAt: Date.now() + 1
};
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 3, 'live UI should keep action intent in-flight during realtime reconnecting');

intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 12,
    currentSeat: 'A'
  },
  lastRealtimeIntentResult: null
};
PVPScene.liveIntentInFlight = null;
await Promise.all([
  PVPScene.submitLiveEmote('respect'),
  PVPScene.submitLiveEmote('respect')
]);
assert.equal(realtimeIntentCalls.length, 4, 'live UI should keep one social realtime intent in-flight and ignore double-click emotes');
const socialIntentId = realtimeIntentCalls[realtimeIntentCalls.length - 1].intent.intentId;
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 5, 'live UI should not let a pending social intent block action intents');
intentState = {
  ...intentState,
  lastRealtimeIntentResult: {
    intentId: socialIntentId,
    matchId: 'pvpm-ui-runtime-intent-lock',
    result: 'accepted',
    updatedAt: Date.now() + 2
  }
};
await PVPScene.submitLiveEmote('thinking');
assert.equal(realtimeIntentCalls.length, 6, 'live UI should unlock social intents after the matching intent_result ack');

intentState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-intent-lock',
  seatId: 'A',
  realtimeStatus: 'connected',
  stateView: {
    matchId: 'pvpm-ui-runtime-intent-lock',
    status: 'active',
    stateVersion: 14,
    currentSeat: 'A'
  },
  lastRealtimeIntentResult: null
};
let refreshMatchCalls = 0;
PVPScene.liveIntentInFlight = null;
PVPScene.getLiveSession = () => ({
  getState: () => intentState,
  submitRealtimeIntent: (intent, matchId) => {
    realtimeIntentCalls.push({ intent, matchId });
    return true;
  },
  submitIntent: async () => {
    throw new Error('HTTP fallback should not run while realtime intent send succeeds');
  },
  refreshMatch: async () => {
    refreshMatchCalls += 1;
    return intentState;
  }
});
await PVPScene.submitLiveEmote('respect');
await PVPScene.submitLiveEmote('respect');
assert.equal(realtimeIntentCalls.length, 7, 'live UI should keep lost-ack social intent pending before manual refresh');
await PVPScene.refreshLiveMatch();
assert.equal(refreshMatchCalls, 1, 'manual live refresh should read authoritative match state while an intent is pending');
await PVPScene.submitLiveEmote('thinking');
assert.equal(realtimeIntentCalls.length, 8, 'live UI should unlock pending realtime intents after manual authoritative refresh');

let surrenderState = {
  phase: 'active',
  matchId: 'pvpm-ui-runtime-surrender-confirm',
  seatId: 'A',
  realtimeStatus: 'closed',
  stateView: {
    matchId: 'pvpm-ui-runtime-surrender-confirm',
    status: 'active',
    stateVersion: 21,
    currentSeat: 'A'
  }
};
const surrenderIntents = [];
PVPScene.liveIntentInFlight = null;
PVPScene.liveSurrenderConfirmUntil = 0;
PVPScene.liveInlineHint = '';
PVPScene.startLiveRealtime = () => {};
PVPScene.stopLivePolling = () => {};
PVPScene.renderLivePanel = () => {};
PVPScene.getLiveSession = () => ({
  getState: () => surrenderState,
  submitIntent: async (intent) => {
    surrenderIntents.push(intent);
    surrenderState = {
      ...surrenderState,
      phase: 'finished',
      stateView: {
        ...surrenderState.stateView,
        status: 'finished',
        stateVersion: surrenderState.stateView.stateVersion + 1
      }
    };
    return surrenderState;
  }
});
await PVPScene.surrenderLiveMatch();
assert.equal(surrenderIntents.length, 0, 'first live surrender click should only arm confirmation and must not submit surrender intent');
assert.match(PVPScene.liveInlineHint, /再次点击确认认输/, 'first live surrender click should explain the second confirmation click');
assert.ok(PVPScene.liveSurrenderConfirmUntil > Date.now(), 'first live surrender click should arm a short confirmation window');
await PVPScene.surrenderLiveMatch();
assert.equal(surrenderIntents.length, 1, 'second live surrender click inside confirmation window should submit exactly one surrender intent');
assert.equal(surrenderIntents[0].intentType, 'surrender', 'confirmed live surrender should still use the authoritative surrender intent type');
assert.equal(PVPScene.liveSurrenderConfirmUntil, 0, 'confirmed live surrender should clear the confirmation window');

console.log('PVP live UI runtime checks passed.');
