const assert = require('node:assert');
const http = require('http');
const express = require('../server/node_modules/express');
const pvpLiveRoutes = require('../server/routes/pvp-live');
const { generateToken } = require('../server/middleware/auth');
const { attachLivePvpWebSocket } = require('../server/pvp-live/live-ws');

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

function sendJson(ws, payload) {
  ws.send(JSON.stringify(payload));
}

async function runSyncRequiredBroadcastCheck() {
  let authoritativeVersion = 10;
  const fakeMatchId = 'pvplm-ws-sync-required';
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
      assert.equal(intent.intentId, 'ws-sync-required-intent', 'WS sync_required broadcast should forward the intent payload');
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
  attachLivePvpWebSocket(server, { livePvpStore: fakeStore });
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
  } finally {
    if (socketA) socketA.close();
    if (socketB) socketB.close();
    await close(server);
  }
}

(async () => {
  await runSyncRequiredBroadcastCheck();

  pvpLiveRoutes.__livePvpStore.reset();

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
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
