const assert = require('node:assert');
const http = require('http');
const express = require('../server/node_modules/express');
const pvpLiveRoutes = require('../server/routes/pvp-live');
const { generateToken } = require('../server/middleware/auth');
const { attachLivePvpWebSocket, makeEventReplay } = require('../server/pvp-live/live-ws');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

async function request(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { raw: text };
  }
  return { status: response.status, ok: response.ok, payload };
}

function makeLoadout(identitySlot, pattern) {
  const deck = [];
  for (let index = 0; index < 20; index += 1) {
    deck.push({ id: pattern[index % pattern.length], upgraded: false });
  }
  return {
    identitySlot,
    label: `${identitySlot}-ws-测试谱`,
    deck
  };
}

function assertPublicArrayEventReplay() {
  const replay = makeEventReplay([
    {
      eventType: 'connection_timeout',
      sequence: 2,
      actingSeat: '',
      visibility: 'public',
      payload: {
        seatId: '',
        disconnectedSeats: ['A', 'B'],
        phase: 'setup',
        elapsedMs: 30000,
        cardId: 'hidden-card-id',
      },
    },
    {
      eventType: 'ready_timeout',
      sequence: 3,
      actingSeat: '',
      visibility: 'public',
      payload: {
        unreadySeats: ['A', 'B'],
        readyDeadlineAt: 123456,
        elapsedMs: 10000,
        hand: ['hidden'],
      },
    },
    {
      eventType: 'hp_recovered',
      sequence: 4,
      actingSeat: 'A',
      visibility: 'public',
      payload: {
        seatId: 'A',
        recoveredHp: 3,
        hp: 41,
        maxHp: 50,
        capped: false,
        sourceCardId: 'innerPeace',
        cardId: 'innerPeace',
        hand: ['hidden'],
      },
    },
  ], 1);
  assert.deepEqual(replay[0].publicData.disconnectedSeats, ['A', 'B'], 'WS public replay should preserve public disconnected seat arrays');
  assert.deepEqual(replay[1].publicData.unreadySeats, ['A', 'B'], 'WS public replay should preserve public ready-timeout seat arrays');
  assert.deepEqual(
    replay[2].publicData,
    { seatId: 'A', recoveredHp: 3, hp: 41, maxHp: 50, capped: false },
    'WS public replay should preserve only public hp_recovered fields'
  );
  assert.equal(JSON.stringify(replay).includes('hidden-card-id'), false, 'WS public replay should still strip non-allowlisted ids');
  assert.equal(JSON.stringify(replay).includes('hidden'), false, 'WS public replay should still strip hidden arrays');
  assert.equal(JSON.stringify(replay).includes('innerPeace'), false, 'WS public replay should strip hidden heal source card ids');
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('ws open timeout')), 5000);
    ws.addEventListener('open', () => {
      clearTimeout(timer);
      attachMessageQueue(ws);
      resolve(ws);
    }, { once: true });
    ws.addEventListener('error', (event) => {
      clearTimeout(timer);
      reject(event.error || new Error('ws open failed'));
    }, { once: true });
  });
}

function attachMessageQueue(ws) {
  if (ws.__defierQueueAttached) return;
  ws.__defierQueueAttached = true;
  ws.__defierMessageQueue = [];
  ws.__defierWaiters = [];
  ws.addEventListener('message', (event) => {
    let message = null;
    try {
      message = JSON.parse(String(event.data || ''));
    } catch (error) {
      return;
    }
    const waiters = ws.__defierWaiters || [];
    const waiterIndex = waiters.findIndex(waiter => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = waiters.splice(waiterIndex, 1);
      waiter.resolve(message);
      return;
    }
    ws.__defierMessageQueue.push(message);
  });
}

function waitForMessage(ws, predicate, label) {
  return new Promise((resolve, reject) => {
    attachMessageQueue(ws);
    const queuedIndex = ws.__defierMessageQueue.findIndex(predicate);
    if (queuedIndex >= 0) {
      const [message] = ws.__defierMessageQueue.splice(queuedIndex, 1);
      resolve(message);
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`ws message timeout: ${label}`));
    }, 5000);
    function cleanup() {
      clearTimeout(timer);
      ws.removeEventListener('close', onClose);
      ws.removeEventListener('error', onError);
      const waiters = ws.__defierWaiters || [];
      const waiterIndex = waiters.findIndex(waiter => waiter.resolve === resolveQueued);
      if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
    }
    function resolveQueued(message) {
      cleanup();
      resolve(message);
    }
    function onClose() {
      cleanup();
      reject(new Error(`ws closed before message: ${label}`));
    }
    function onError(event) {
      cleanup();
      reject(event.error || new Error(`ws error before message: ${label}`));
    }
    ws.__defierWaiters.push({ predicate, resolve: resolveQueued });
    ws.addEventListener('close', onClose);
    ws.addEventListener('error', onError);
  });
}

function expectNoMessage(ws, predicate, label, timeoutMs = 250) {
  return new Promise((resolve, reject) => {
    attachMessageQueue(ws);
    const queuedIndex = ws.__defierMessageQueue.findIndex(predicate);
    if (queuedIndex >= 0) {
      const [message] = ws.__defierMessageQueue.splice(queuedIndex, 1);
      reject(new Error(`unexpected ws message: ${label} ${JSON.stringify(message)}`));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      const waiters = ws.__defierWaiters || [];
      const waiterIndex = waiters.findIndex(waiter => waiter.reject === rejectUnexpected);
      if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
    }
    function rejectUnexpected(message) {
      cleanup();
      reject(new Error(`unexpected ws message: ${label} ${JSON.stringify(message)}`));
    }
    ws.__defierWaiters.push({
      predicate,
      resolve: rejectUnexpected,
      reject: rejectUnexpected
    });
  });
}

function sendJson(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function makeSharedLiveWsSignalStore() {
  let lastSignalId = 0;
  const signals = [];
  return {
    async getLiveWsLatestSignalId() {
      return lastSignalId;
    },
    async appendLiveWsSignal(signal) {
      const matchId = String(signal && signal.matchId || '').trim();
      if (!matchId) return null;
      lastSignalId += 1;
      const row = {
        signalId: lastSignalId,
        id: lastSignalId,
        matchId,
        signalType: String(signal && signal.signalType || 'state_sync'),
        stateVersion: Math.max(0, Math.floor(Number(signal && signal.stateVersion) || 0)),
        reason: String(signal && signal.reason || ''),
        sourceInstanceId: String(signal && signal.sourceInstanceId || ''),
        createdAt: Date.now()
      };
      signals.push(row);
      return row;
    },
    async loadLiveWsSignalsSince(signalId) {
      const cursor = Math.max(0, Math.floor(Number(signalId) || 0));
      return signals.filter(signal => signal.signalId > cursor);
    },
    getSignals() {
      return signals.slice();
    }
  };
}

async function runSyncRequiredBroadcastCheck() {
  let authoritativeVersion = 10;
  const fakeMatchId = 'pvplm-ws-sync-required';
  const signalStore = makeSharedLiveWsSignalStore();
  const fakeStore = {
    heartbeatIntervalMs: 1500,
    async getMatchForUser(userId, matchId) {
      assert.equal(matchId, fakeMatchId, 'WS sync_required broadcast fake store should read the requested match');
      const seatId = userId === 'ws-sync-a' ? 'A' : 'B';
      return {
        match: { matchId: fakeMatchId },
        seatId,
        stateView: {
          matchId: fakeMatchId,
          status: 'active',
          stateVersion: authoritativeVersion,
          currentSeat: authoritativeVersion >= 11 ? 'B' : 'A',
          self: { seatId, hand: [] },
          opponent: { seatId: seatId === 'A' ? 'B' : 'A', handCount: 3 }
        }
      };
    },
    async submitIntent(userId, matchId, intent) {
      assert.equal(userId, 'ws-sync-a', 'WS sync_required broadcast should submit as the acting user');
      assert.equal(matchId, fakeMatchId, 'WS sync_required broadcast should submit the requested match');
      assert.ok(
        intent.intentId === 'ws-sync-required-intent'
          || intent.intentId === 'ws-sync-required-intent-repeat'
          || intent.intentId === 'ws-duplicate-intent'
          || intent.intentId === 'ws-duplicate-intent-repeat',
        'WS sync_required broadcast should forward the intent payload',
      );
      if (intent.intentId === 'ws-duplicate-intent' || intent.intentId === 'ws-duplicate-intent-repeat') {
        authoritativeVersion = 12;
        return {
          result: 'duplicate',
          reason: 'duplicate_action',
          events: [],
          stateView: {
            matchId: fakeMatchId,
            status: 'active',
            stateVersion: authoritativeVersion,
            currentSeat: 'B',
            self: { seatId: 'A', hand: [] },
            opponent: { seatId: 'B', handCount: 3 }
          }
        };
      }
      authoritativeVersion = 11;
      return {
        result: 'sync_required',
        reason: 'conflicting_state_version',
        events: [],
        stateView: {
          matchId: fakeMatchId,
          status: 'active',
          stateVersion: authoritativeVersion,
          currentSeat: 'B',
          self: { seatId: 'A', hand: [] },
          opponent: { seatId: 'B', handCount: 3 }
        }
      };
    },
    async loadMatchEvents() {
      return [];
    }
  };

  const server = http.createServer();
  attachLivePvpWebSocket(server, {
    livePvpStore: fakeStore,
    liveWsSignalStore: signalStore,
    liveWsSignalPollIntervalMs: 25
  });
  await listen(server);
  const wsBaseUrl = `ws://127.0.0.1:${server.address().port}`;
  const tokenA = generateToken({ id: 'ws-sync-a', username: 'ws-sync-a' });
  const tokenB = generateToken({ id: 'ws-sync-b', username: 'ws-sync-b' });
  let socketA = null;
  let socketB = null;
  try {
    socketA = await openSocket(`${wsBaseUrl}/api/pvp/live/ws?token=${encodeURIComponent(tokenA)}`);
    socketB = await openSocket(`${wsBaseUrl}/api/pvp/live/ws?token=${encodeURIComponent(tokenB)}`);
    await waitForMessage(socketA, message => message.type === 'connected', 'sync_required connected A');
    await waitForMessage(socketB, message => message.type === 'connected', 'sync_required connected B');

    sendJson(socketA, { type: 'join_match', matchId: fakeMatchId, lastSeenRevision: 0 });
    await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.seatId === 'A', 'sync_required state_sync A');
    await waitForMessage(socketA, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'sync_required events_replay A');
    sendJson(socketB, { type: 'join_match', matchId: fakeMatchId, lastSeenRevision: 0 });
    await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.seatId === 'B', 'sync_required state_sync B');
    await waitForMessage(socketB, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'sync_required events_replay B');

    sendJson(socketA, {
      type: 'intent',
      matchId: fakeMatchId,
      intent: {
        intentId: 'ws-sync-required-intent',
        intentType: 'play_card',
        stateVersion: 9,
        payload: { cardInstanceId: 'A-card-1', targetSeat: 'B' }
      }
    });
    const intentResultA = await waitForMessage(socketA, message => message.type === 'intent_result' && message.intentId === 'ws-sync-required-intent', 'sync_required intent_result A');
    assert.equal(intentResultA.result, 'sync_required', 'WS sync_required intent should report sync_required to the sender');
    assert.equal(intentResultA.reason, 'conflicting_state_version', 'WS sync_required intent should preserve the authoritative sync reason');
    const syncToA = await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 11, 'sync_required broadcast state_sync A');
    assert.equal(syncToA.seatId, 'A', 'WS sync_required intent should also refresh the sender with authoritative state_sync');
    assert.equal(syncToA.stateView?.currentSeat, intentResultA.stateView?.currentSeat, 'WS sync_required sender state_sync should match intent_result authoritative turn');
    const broadcastToB = await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 11, 'sync_required broadcast state_sync B');
    assert.equal(broadcastToB.seatId, 'B', 'WS sync_required intent should broadcast authoritative sync to the opponent seat');

    sendJson(socketA, {
      type: 'intent',
      matchId: fakeMatchId,
      intent: {
        intentId: 'ws-sync-required-intent-repeat',
        intentType: 'play_card',
        stateVersion: 9,
        payload: { cardInstanceId: 'A-card-1', targetSeat: 'B' }
      }
    });
    await waitForMessage(socketA, message => message.type === 'intent_result' && message.intentId === 'ws-sync-required-intent-repeat', 'sync_required repeat intent_result A');
    await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 11, 'sync_required repeat state_sync A');
    const syncRequiredSignals = signalStore.getSignals().filter(signal => signal.reason === 'sync_required');
    assert.equal(syncRequiredSignals.length, 1, 'WS sync_required fanout should throttle repeated same-version signals');

    sendJson(socketA, {
      type: 'intent',
      matchId: fakeMatchId,
      intent: {
        intentId: 'ws-duplicate-intent',
        intentType: 'play_card',
        stateVersion: 9,
        payload: { cardInstanceId: 'A-card-1', targetSeat: 'B' }
      }
    });
    const duplicateResultA = await waitForMessage(socketA, message => message.type === 'intent_result' && message.intentId === 'ws-duplicate-intent', 'duplicate intent_result A');
    assert.equal(duplicateResultA.result, 'duplicate', 'WS duplicate intent should report duplicate to the sender');
    assert.equal(duplicateResultA.reason, 'duplicate_action', 'WS duplicate intent should preserve the idempotent duplicate reason');
    const duplicateSyncToA = await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 12, 'duplicate broadcast state_sync A');
    assert.equal(duplicateSyncToA.seatId, 'A', 'WS duplicate intent should also refresh the sender with authoritative state_sync');
    const duplicateBroadcastToB = await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 12, 'duplicate broadcast state_sync B');
    assert.equal(duplicateBroadcastToB.seatId, 'B', 'WS duplicate intent should broadcast authoritative sync to the opponent seat');

    sendJson(socketA, {
      type: 'intent',
      matchId: fakeMatchId,
      intent: {
        intentId: 'ws-duplicate-intent-repeat',
        intentType: 'play_card',
        stateVersion: 9,
        payload: { cardInstanceId: 'A-card-1', targetSeat: 'B' }
      }
    });
    await waitForMessage(socketA, message => message.type === 'intent_result' && message.intentId === 'ws-duplicate-intent-repeat', 'duplicate repeat intent_result A');
    await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 12, 'duplicate repeat state_sync A');
    const duplicateSignals = signalStore.getSignals().filter(signal => signal.reason === 'duplicate_action');
    assert.equal(duplicateSignals.length, 1, 'WS duplicate fanout should throttle repeated same-version signals');
  } finally {
    if (socketA) socketA.close();
    if (socketB) socketB.close();
    await close(server);
  }
}

async function runHeartbeatEventsReplayCheck() {
  const fakeMatchId = 'pvplm-ws-heartbeat-replay';
  let heartbeatCalls = 0;
  let eventLoadCalls = 0;
  const fakeStore = {
    heartbeatIntervalMs: 1500,
    async recordHeartbeat(userId, matchId) {
      assert.equal(userId, 'ws-heartbeat-b', 'WS heartbeat replay should authenticate the heartbeat user');
      assert.equal(matchId, fakeMatchId, 'WS heartbeat replay should record heartbeat for the requested match');
      heartbeatCalls += 1;
      return {
        match: { matchId: fakeMatchId },
        seatId: 'B',
        stateView: {
          matchId: fakeMatchId,
          status: 'active',
          stateVersion: 12,
          currentSeat: 'A',
          connectionReport: {
            viewer: { seatId: 'B', status: 'online' },
            opponent: { seatId: 'A', status: 'online' },
            heartbeatIntervalMs: 1500
          },
          connectionTempoReport: {
            reportVersion: 'pvp-live-connection-tempo-v1',
            sourceVisibility: 'server_authoritative_connection_state',
            usesHiddenInformation: false,
            rankedImpact: 'none',
            tempoState: 'stable',
            severity: 'normal',
            phase: 'active',
            currentSeat: 'A',
            viewerSeat: 'B',
            opponentSeat: 'A',
            affectedSeat: '',
            statusLine: '连接：我方在线 · 对方在线',
            detailLine: '双方在线，按当前行动窗口继续。',
            actionBoundary: 'continue',
            canSubmitIntent: false,
            shouldWaitForAuthority: false,
            safeguards: ['server_authoritative_projection']
          },
          self: { seatId: 'B', hand: [] },
          opponent: { seatId: 'A', handCount: 3 }
        }
      };
    },
    async getMatchForUser(userId, matchId) {
      assert.equal(userId, 'ws-heartbeat-b', 'WS heartbeat replay broadcast should refresh the same user seat');
      assert.equal(matchId, fakeMatchId, 'WS heartbeat replay broadcast should refresh the requested match');
      return {
        match: { matchId: fakeMatchId },
        seatId: 'B',
        stateView: {
          matchId: fakeMatchId,
          status: 'active',
          stateVersion: 12,
          currentSeat: 'A',
          self: { seatId: 'B', hand: [] },
          opponent: { seatId: 'A', handCount: 3 }
        }
      };
    },
    async loadMatchEvents(matchId) {
      assert.equal(matchId, fakeMatchId, 'WS heartbeat replay should load persisted events for missed replay');
      eventLoadCalls += 1;
      return [
        { sequence: 1, eventType: 'battle_started', visibility: 'public', actingSeat: 'A', payload: { firstSeat: 'A', roundIndex: 1, hiddenDeck: ['secret'] } },
        { sequence: 2, eventType: 'card_played', visibility: 'public', actingSeat: 'A', payload: { cost: 1, remainingEnergy: 2, hiddenCardId: 'private-card' } },
        { sequence: 3, eventType: 'private_draw', visibility: 'self', actingSeat: 'B', payload: { deck: ['private'] } }
      ];
    }
  };

  const server = http.createServer();
  attachLivePvpWebSocket(server, { livePvpStore: fakeStore });
  await listen(server);
  const wsBaseUrl = `ws://127.0.0.1:${server.address().port}`;
  const tokenB = generateToken({ id: 'ws-heartbeat-b', username: 'ws-heartbeat-b' });
  let socketB = null;
  try {
    socketB = await openSocket(`${wsBaseUrl}/api/pvp/live/ws?token=${encodeURIComponent(tokenB)}`);
    await waitForMessage(socketB, message => message.type === 'connected', 'heartbeat replay connected B');

    sendJson(socketB, { type: 'heartbeat', matchId: fakeMatchId });
    await waitForMessage(socketB, message => message.type === 'presence' && message.matchId === fakeMatchId, 'legacy heartbeat replay presence B');
    await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId, 'legacy heartbeat replay state_sync B');
    assert.equal(eventLoadCalls, 0, 'legacy WS heartbeat without lastSeenRevision should not request events replay');

    sendJson(socketB, { type: 'heartbeat', matchId: fakeMatchId, lastSeenRevision: 1 });
    const presenceB = await waitForMessage(socketB, message => message.type === 'presence' && message.matchId === fakeMatchId, 'heartbeat replay presence B');
    assert.equal(presenceB.connectionReport?.viewer?.status, 'online', 'WS heartbeat replay should still return presence before replay');
    assert.equal(presenceB.connectionTempoReport?.reportVersion, 'pvp-live-connection-tempo-v1', 'WS heartbeat replay presence should forward server connection tempo');
    assert.equal(presenceB.connectionTempoReport?.sourceVisibility, 'server_authoritative_connection_state', 'WS heartbeat replay presence should keep server-authoritative tempo source');
    assert.equal(presenceB.connectionTempoReport?.usesHiddenInformation, false, 'WS heartbeat replay presence should not expose hidden tempo information');
    const replayB = await waitForMessage(socketB, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'heartbeat replay events_replay B');
    assert.equal(replayB.fromRevision, 1, 'WS heartbeat should replay missed public events after lastSeenRevision');
    assert.deepEqual(replayB.events.map(event => event.sequence), [2], 'WS heartbeat replay should only include missed public events');
    assert.deepEqual(replayB.events[0].publicData, { cost: 1, remainingEnergy: 2 }, 'WS heartbeat replay should sanitize public event payloads');
    assert.equal(JSON.stringify(replayB.events).includes('hiddenCardId'), false, 'WS heartbeat replay should not expose private payload keys');
    assert.equal(heartbeatCalls, 2, 'WS heartbeat replay should record legacy and revision-aware heartbeats');
    assert.ok(eventLoadCalls >= 1, 'WS heartbeat replay should query the persisted event source');
  } finally {
    if (socketB) socketB.close();
    await close(server);
  }
}

async function runCrossProcessHeartbeatStateCatchupCheck() {
  const fakeMatchId = 'pvplm-ws-cross-heartbeat-catchup';
  let authoritativeVersion = 20;
  let processBHeartbeatReads = 0;

  const makeStateView = (userId) => {
    const seatId = userId === 'ws-cross-a' ? 'A' : 'B';
    return {
      matchId: fakeMatchId,
      status: 'active',
      stateVersion: authoritativeVersion,
      currentSeat: authoritativeVersion >= 21 ? 'B' : 'A',
      recentEvents: authoritativeVersion >= 21
        ? [{ eventType: 'card_played', sequence: 7 }]
        : [{ eventType: 'battle_started', sequence: 6 }],
      self: { seatId, hand: [] },
      opponent: { seatId: seatId === 'A' ? 'B' : 'A', handCount: 3 }
    };
  };

  const makeAccess = (userId) => ({
    match: { matchId: fakeMatchId },
    seatId: userId === 'ws-cross-a' ? 'A' : 'B',
    stateView: makeStateView(userId)
  });

  const makeStore = (processLabel) => ({
    heartbeatIntervalMs: 1500,
    async getMatchForUser(userId, matchId) {
      assert.equal(matchId, fakeMatchId, `${processLabel} should read the requested shared match`);
      return makeAccess(userId);
    },
    async recordHeartbeat(userId, matchId) {
      assert.equal(userId, 'ws-cross-b', 'cross-process heartbeat catch-up should be driven by the remote opponent');
      assert.equal(matchId, fakeMatchId, 'cross-process heartbeat catch-up should record the requested match');
      processBHeartbeatReads += 1;
      return makeAccess(userId);
    },
    async submitIntent(userId, matchId, intent) {
      assert.equal(processLabel, 'process-a', 'cross-process state advance should happen on process A');
      assert.equal(userId, 'ws-cross-a', 'cross-process state advance should submit as player A');
      assert.equal(matchId, fakeMatchId, 'cross-process state advance should submit to the shared match');
      assert.equal(intent.intentId, 'ws-cross-advance', 'cross-process state advance should forward the intent payload');
      authoritativeVersion = 21;
      return {
        result: 'accepted',
        reason: 'accepted',
        events: [{ sequence: 7, eventType: 'card_played', visibility: 'public', actingSeat: 'A', payload: { cost: 1, remainingEnergy: 2 } }],
        stateView: makeStateView(userId)
      };
    },
    async loadMatchEvents() {
      return [];
    }
  });

  const serverA = http.createServer();
  const serverB = http.createServer();
  attachLivePvpWebSocket(serverA, { livePvpStore: makeStore('process-a') });
  attachLivePvpWebSocket(serverB, { livePvpStore: makeStore('process-b') });
  await listen(serverA);
  await listen(serverB);
  const wsBaseUrlA = `ws://127.0.0.1:${serverA.address().port}`;
  const wsBaseUrlB = `ws://127.0.0.1:${serverB.address().port}`;
  const tokenA = generateToken({ id: 'ws-cross-a', username: 'ws-cross-a' });
  const tokenB = generateToken({ id: 'ws-cross-b', username: 'ws-cross-b' });
  let socketA = null;
  let socketB = null;
  try {
    socketA = await openSocket(`${wsBaseUrlA}/api/pvp/live/ws?token=${encodeURIComponent(tokenA)}`);
    socketB = await openSocket(`${wsBaseUrlB}/api/pvp/live/ws?token=${encodeURIComponent(tokenB)}`);
    await waitForMessage(socketA, message => message.type === 'connected', 'cross-process connected A');
    await waitForMessage(socketB, message => message.type === 'connected', 'cross-process connected B');

    sendJson(socketA, { type: 'join_match', matchId: fakeMatchId, lastSeenRevision: 0 });
    await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 20, 'cross-process initial state_sync A');
    await waitForMessage(socketA, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'cross-process events_replay A');
    sendJson(socketB, { type: 'join_match', matchId: fakeMatchId, lastSeenRevision: 0 });
    await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 20, 'cross-process initial state_sync B');
    await waitForMessage(socketB, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'cross-process events_replay B');

    sendJson(socketA, {
      type: 'intent',
      matchId: fakeMatchId,
      intent: {
        intentId: 'ws-cross-advance',
        intentType: 'play_card',
        stateVersion: 20,
        payload: { cardInstanceId: 'A-card-1', targetSeat: 'B' }
      }
    });
    await waitForMessage(socketA, message => message.type === 'intent_result' && message.intentId === 'ws-cross-advance' && message.stateView?.stateVersion === 21, 'cross-process intent_result A');
    await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 21, 'cross-process local state_sync A');

    sendJson(socketB, { type: 'heartbeat', matchId: fakeMatchId });
    await waitForMessage(socketB, message => message.type === 'presence' && message.matchId === fakeMatchId, 'cross-process heartbeat presence B');
    const catchupB = await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 21, 'cross-process heartbeat state_sync B');
    assert.equal(catchupB.seatId, 'B', 'cross-process heartbeat catch-up should keep the remote seat scope');
    assert.equal(catchupB.stateView?.currentSeat, 'B', 'cross-process heartbeat should catch up opponent state from authoritative store');
    assert.equal(processBHeartbeatReads, 1, 'cross-process heartbeat catch-up should read process B authoritative heartbeat once');
  } finally {
    if (socketA) socketA.close();
    if (socketB) socketB.close();
    await close(serverA);
    await close(serverB);
  }
}

async function runJoinRaceSignalFanoutCheck() {
  const fakeMatchId = 'pvplm-ws-join-race-signal';
  const signalStore = makeSharedLiveWsSignalStore();
  let authoritativeVersion = 40;
  let signalInsertedDuringJoin = false;

  const makeStateView = (userId) => {
    const seatId = userId === 'ws-join-race-b' ? 'B' : 'A';
    return {
      matchId: fakeMatchId,
      status: 'active',
      stateVersion: authoritativeVersion,
      currentSeat: authoritativeVersion >= 41 ? 'B' : 'A',
      self: { seatId, hand: [] },
      opponent: { seatId: seatId === 'A' ? 'B' : 'A', handCount: 3 }
    };
  };

  const fakeStore = {
    heartbeatIntervalMs: 1500,
    async getMatchForUser(userId, matchId) {
      assert.equal(matchId, fakeMatchId, 'join race fanout should read the requested match');
      return {
        match: { matchId: fakeMatchId },
        seatId: userId === 'ws-join-race-b' ? 'B' : 'A',
        stateView: makeStateView(userId)
      };
    },
    async loadMatchEvents(matchId) {
      assert.equal(matchId, fakeMatchId, 'join race fanout should load events during join');
      if (!signalInsertedDuringJoin) {
        signalInsertedDuringJoin = true;
        authoritativeVersion = 41;
        await signalStore.appendLiveWsSignal({
          matchId: fakeMatchId,
          signalType: 'state_sync',
          stateVersion: authoritativeVersion,
          reason: 'match_saved',
          sourceInstanceId: 'remote-process'
        });
      }
      return [];
    }
  };

  const server = http.createServer();
  attachLivePvpWebSocket(server, {
    livePvpStore: fakeStore,
    liveWsSignalStore: signalStore,
    liveWsSignalPollIntervalMs: 25
  });
  await listen(server);
  const wsBaseUrl = `ws://127.0.0.1:${server.address().port}`;
  const tokenB = generateToken({ id: 'ws-join-race-b', username: 'ws-join-race-b' });
  let socketB = null;
  try {
    socketB = await openSocket(`${wsBaseUrl}/api/pvp/live/ws?token=${encodeURIComponent(tokenB)}`);
    await waitForMessage(socketB, message => message.type === 'connected', 'join race connected B');

    sendJson(socketB, { type: 'join_match', matchId: fakeMatchId, lastSeenRevision: 0 });
    await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 40, 'join race initial state_sync B');
    await waitForMessage(socketB, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'join race events_replay B');
    const raceFanoutB = await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 41, 'join race concurrent signal state_sync B');
    assert.equal(raceFanoutB.seatId, 'B', 'join_match cursor baseline should not skip a signal created during join');
  } finally {
    if (socketB) socketB.close();
    await close(server);
  }
}

async function runCrossProcessPassiveStateFanoutCheck() {
  const fakeMatchId = 'pvplm-ws-cross-passive-fanout';
  const signalStore = makeSharedLiveWsSignalStore();
  let authoritativeVersion = 30;
  let processBHeartbeatReads = 0;

  const makeStateView = (userId) => {
    const seatId = userId === 'ws-passive-a' ? 'A' : 'B';
    return {
      matchId: fakeMatchId,
      status: 'active',
      stateVersion: authoritativeVersion,
      currentSeat: authoritativeVersion >= 31 ? 'B' : 'A',
      recentEvents: authoritativeVersion >= 31
        ? [{ eventType: 'card_played', sequence: 11 }]
        : [{ eventType: 'battle_started', sequence: 10 }],
      self: { seatId, hand: [] },
      opponent: { seatId: seatId === 'A' ? 'B' : 'A', handCount: 3 }
    };
  };

  const makeAccess = (userId) => ({
    match: { matchId: fakeMatchId },
    seatId: userId === 'ws-passive-a' ? 'A' : 'B',
    stateView: makeStateView(userId)
  });

  const makeStore = (processLabel) => ({
    heartbeatIntervalMs: 1500,
    async getMatchForUser(userId, matchId) {
      assert.equal(matchId, fakeMatchId, `${processLabel} passive fanout should read the requested match`);
      return makeAccess(userId);
    },
    async recordHeartbeat() {
      processBHeartbeatReads += 1;
      throw new Error('passive cross-process fanout should not require a remote heartbeat');
    },
    async submitIntent(userId, matchId, intent, options = {}) {
      assert.equal(processLabel, 'process-a', 'passive cross-process state advance should happen on process A');
      assert.equal(userId, 'ws-passive-a', 'passive cross-process state advance should submit as player A');
      assert.equal(matchId, fakeMatchId, 'passive cross-process state advance should submit to the shared match');
      assert.equal(intent.intentId, 'ws-passive-advance', 'passive cross-process state advance should forward the intent payload');
      assert.ok(options.liveWsSourceInstanceId, 'passive cross-process accepted save should receive the origin WS instance id');
      authoritativeVersion = 31;
      const liveWsSignal = await signalStore.appendLiveWsSignal({
        matchId,
        signalType: 'state_sync',
        stateVersion: authoritativeVersion,
        reason: 'match_saved',
        sourceInstanceId: options.liveWsSourceInstanceId
      });
      return {
        result: 'accepted',
        reason: 'accepted',
        events: [{ sequence: 11, eventType: 'card_played', visibility: 'public', actingSeat: 'A', payload: { cost: 1, remainingEnergy: 2 } }],
        stateView: makeStateView(userId),
        saveResult: {
          saved: true,
          skipped: false,
          reason: 'saved',
          liveWsSignalAppended: true,
          liveWsSignalId: liveWsSignal && liveWsSignal.signalId
        }
      };
    },
    async loadMatchEvents() {
      return [];
    }
  });

  const serverA = http.createServer();
  const serverB = http.createServer();
  attachLivePvpWebSocket(serverA, {
    livePvpStore: makeStore('process-a'),
    liveWsSignalStore: signalStore,
    liveWsSignalPollIntervalMs: 25
  });
  attachLivePvpWebSocket(serverB, {
    livePvpStore: makeStore('process-b'),
    liveWsSignalStore: signalStore,
    liveWsSignalPollIntervalMs: 25
  });
  await listen(serverA);
  await listen(serverB);
  const wsBaseUrlA = `ws://127.0.0.1:${serverA.address().port}`;
  const wsBaseUrlB = `ws://127.0.0.1:${serverB.address().port}`;
  const tokenA = generateToken({ id: 'ws-passive-a', username: 'ws-passive-a' });
  const tokenB = generateToken({ id: 'ws-passive-b', username: 'ws-passive-b' });
  let socketA = null;
  let socketB = null;
  try {
    socketA = await openSocket(`${wsBaseUrlA}/api/pvp/live/ws?token=${encodeURIComponent(tokenA)}`);
    socketB = await openSocket(`${wsBaseUrlB}/api/pvp/live/ws?token=${encodeURIComponent(tokenB)}`);
    await waitForMessage(socketA, message => message.type === 'connected', 'passive cross-process connected A');
    await waitForMessage(socketB, message => message.type === 'connected', 'passive cross-process connected B');

    sendJson(socketA, { type: 'join_match', matchId: fakeMatchId, lastSeenRevision: 0 });
    await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 30, 'passive cross-process initial state_sync A');
    await waitForMessage(socketA, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'passive cross-process events_replay A');
    sendJson(socketB, { type: 'join_match', matchId: fakeMatchId, lastSeenRevision: 0 });
    await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 30, 'passive cross-process initial state_sync B');
    await waitForMessage(socketB, message => message.type === 'events_replay' && message.matchId === fakeMatchId, 'passive cross-process events_replay B');

    sendJson(socketA, {
      type: 'intent',
      matchId: fakeMatchId,
      intent: {
        intentId: 'ws-passive-advance',
        intentType: 'play_card',
        stateVersion: 30,
        payload: { cardInstanceId: 'A-card-1', targetSeat: 'B' }
      }
    });
    await waitForMessage(socketA, message => message.type === 'intent_result' && message.intentId === 'ws-passive-advance' && message.stateView?.stateVersion === 31, 'passive cross-process intent_result A');
    await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 31, 'passive cross-process local state_sync A');
    const passiveFanoutB = await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 31, 'passive cross-process remote state_sync B');
    assert.equal(passiveFanoutB.seatId, 'B', 'passive cross-process fanout should keep the remote seat scope');
    assert.equal(passiveFanoutB.stateView?.currentSeat, 'B', 'passive cross-process fanout should read the remote authoritative state');
    assert.equal(processBHeartbeatReads, 0, 'passive cross-process fanout should not rely on opponent heartbeat');
    await expectNoMessage(
      socketA,
      message => message.type === 'state_sync' && message.matchId === fakeMatchId && message.stateView?.stateVersion === 31,
      'passive cross-process origin should not echo its own persisted signal',
      250
    );
  } finally {
    if (socketA) socketA.close();
    if (socketB) socketB.close();
    await close(serverA);
    await close(serverB);
  }
}

(async () => {
  assertPublicArrayEventReplay();
  await runSyncRequiredBroadcastCheck();
  await runHeartbeatEventsReplayCheck();
  await runCrossProcessHeartbeatStateCatchupCheck();
  await runJoinRaceSignalFanoutCheck();
  await runCrossProcessPassiveStateFanoutCheck();

  pvpLiveRoutes.__livePvpStore.reset();
  pvpLiveRoutes.__attachServices({
    ratingProvider: {
      async getLivePvpRating() {
        return { score: 1000, division: '玄阶', seasonId: 's1-genesis', provisional: false, rankedGames: 6 };
      }
    }
  });

  const app = express();
  app.use(express.json());
  app.use('/api/pvp/live', pvpLiveRoutes);
  const server = http.createServer(app);
  attachLivePvpWebSocket(server, { livePvpStore: pvpLiveRoutes.__livePvpStore });
  await listen(server);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const wsBaseUrl = `ws://127.0.0.1:${server.address().port}`;

  const tokenA = generateToken({ id: 'ws-user-a', username: 'ws-a' });
  const tokenB = generateToken({ id: 'ws-user-b', username: 'ws-b' });
  const loadoutA = makeLoadout('sword', ['pvp_burst', 'doubleStrike', 'battleCry', 'defend']);
  const loadoutB = makeLoadout('shield', ['pvp_guard', 'defend', 'stormWard', 'quickSlash']);

  let socketA = null;
  let socketB = null;
  try {
    const joinA = await request(baseUrl, '/api/pvp/live/queue/join', {
      method: 'POST',
      token: tokenA,
      body: { displayName: 'WS A', loadout: loadoutA }
    });
    assert.equal(joinA.payload.status, 'waiting', 'first WS test player should wait in queue');

    const joinB = await request(baseUrl, '/api/pvp/live/queue/join', {
      method: 'POST',
      token: tokenB,
      body: { displayName: 'WS B', loadout: loadoutB }
    });
    assert.equal(joinB.payload.status, 'matched', 'second WS test player should match');
    const matchId = joinB.payload.matchId;

    socketA = await openSocket(`${wsBaseUrl}/api/pvp/live/ws?token=${encodeURIComponent(tokenA)}`);
    const connectedA = await waitForMessage(socketA, message => message.type === 'connected', 'connected A');
    assert.ok(/^ws-/.test(connectedA.connectionId || ''), 'WS connected should expose stable connection id');
    assert.ok(connectedA.connectionReport?.heartbeatIntervalMs >= 1000, 'WS connected should expose authoritative heartbeat interval');

    socketB = await openSocket(`${wsBaseUrl}/api/pvp/live/ws?token=${encodeURIComponent(tokenB)}`);
    await waitForMessage(socketB, message => message.type === 'connected', 'connected B');

    sendJson(socketA, { type: 'join_match', matchId, lastSeenRevision: 0 });
    const stateSyncA = await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === matchId, 'state_sync A');
    assert.equal(stateSyncA.seatId, 'A', 'WS state_sync should be seat scoped for A');
    assert.equal(stateSyncA.stateView?.status, 'setup', 'WS state_sync should expose current match state');
    const eventsReplayA = await waitForMessage(socketA, message => message.type === 'events_replay' && message.matchId === matchId, 'events_replay A');
    assert.ok(Array.isArray(eventsReplayA.events), 'WS join_match should send missed events replay array');
    assert.ok(eventsReplayA.events.every(event => !JSON.stringify(event).includes('deck')), 'WS events_replay should not expose hidden deck data');

    sendJson(socketB, { type: 'join_match', matchId, lastSeenRevision: 0 });
    const stateSyncB = await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === matchId, 'state_sync B');
    assert.equal(stateSyncB.seatId, 'B', 'WS state_sync should be seat scoped for B');

    sendJson(socketA, { type: 'heartbeat', matchId });
    const presenceA = await waitForMessage(socketA, message => message.type === 'presence' && message.matchId === matchId, 'presence A');
    assert.ok(presenceA.connectionReport?.viewer?.status, 'WS heartbeat should return presence connection report');

    sendJson(socketA, {
      type: 'intent',
      matchId,
      intent: {
        intentId: 'ws-ready-a',
        intentType: 'ready',
        stateVersion: stateSyncA.stateView.stateVersion,
        payload: {}
      }
    });
    const intentResultA = await waitForMessage(socketA, message => message.type === 'intent_result' && message.intentId === 'ws-ready-a', 'intent_result A');
    assert.equal(intentResultA.result, 'accepted', 'WS intent should return accepted intent_result');
    assert.ok(intentResultA.stateView?.stateVersion > stateSyncA.stateView.stateVersion, 'WS intent_result should carry updated state view');
    const broadcastToB = await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === matchId && message.stateView?.stateVersion >= intentResultA.stateView.stateVersion, 'broadcast state_sync B');
    assert.equal(broadcastToB.seatId, 'B', 'WS accepted intent should push state_sync to the opponent seat');

    console.log('sanity_pvp_live_ws_checks passed');
  } finally {
    if (socketA) socketA.close();
    if (socketB) socketB.close();
    await close(server);
    pvpLiveRoutes.__livePvpStore.reset();
    pvpLiveRoutes.__attachServices({});
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
