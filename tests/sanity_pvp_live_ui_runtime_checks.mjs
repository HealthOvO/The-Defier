import assert from 'node:assert';

const documentListeners = new Map();
const windowListeners = new Map();

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
  }
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
  }
};
await PVPScene.endLiveTurn();
assert.equal(realtimeIntentCalls.length, 2, 'live UI should unlock realtime intent after authoritative stateVersion advances');

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

console.log('PVP live UI runtime checks passed.');
