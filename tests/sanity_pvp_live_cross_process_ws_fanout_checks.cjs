const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BASE_PORT = Number(process.env.PVP_LIVE_WS_FANOUT_PORT || (9300 + (process.pid % 1000) * 2));
const PORT_A = BASE_PORT;
const PORT_B = BASE_PORT + 1;
const DB_PATH = process.env.PVP_LIVE_WS_FANOUT_DB_PATH
  || path.join(os.tmpdir(), `the-defier-pvp-live-ws-fanout-${process.pid}.sqlite`);
const JWT_SECRET = 'ws-fanout-jwt-secret-32-characters';
const HMAC_SECRET = 'ws-fanout-hmac-secret-32-characters';

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function makeLoadout(identitySlot, pattern) {
  const deck = [];
  for (let index = 0; index < 20; index += 1) {
    deck.push({ id: pattern[index % pattern.length], upgraded: false });
  }
  return {
    identitySlot,
    label: `${identitySlot}-跨进程WS测试谱`,
    deck,
  };
}

function startServer(port, label) {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_DB_PATH: DB_PATH,
      PVP_LIVE_WS_SIGNAL_POLL_INTERVAL_MS: '25',
      PVP_LIVE_SETUP_READY_TIMEOUT_MS: '5000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    output += chunk.toString();
  });
  return { child, label, port, getOutput: () => output };
}

async function stopServer(server) {
  if (!server || server.child.killed || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function request(baseUrl, pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

async function waitForHealth(server) {
  const baseUrl = `http://127.0.0.1:${server.port}`;
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await request(baseUrl, '/health');
      if (health.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`${server.label} backend health check timed out: ${lastError && lastError.message}\n${server.getOutput()}`);
}

async function registerUser(baseUrl, prefix) {
  const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const response = await request(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { username, password: 'pwd123' },
  });
  assert.equal(response.status, 200, `register should succeed: ${JSON.stringify(response.payload)}`);
  return {
    username,
    userId: response.payload.user.objectId,
    token: response.payload.user.sessionToken,
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
    }, 7000);
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

function expectNoMessage(ws, predicate, label, timeoutMs = 350) {
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
      const waiterIndex = waiters.findIndex(waiter => waiter.resolve === rejectUnexpected);
      if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
    }
    function rejectUnexpected(message) {
      cleanup();
      reject(new Error(`unexpected ws message: ${label} ${JSON.stringify(message)}`));
    }
    ws.__defierWaiters.push({ predicate, resolve: rejectUnexpected });
  });
}

function sendJson(ws, payload) {
  ws.send(JSON.stringify(payload));
}

async function pollMatchedQueueStatus(baseUrl, queueTicket, token) {
  const deadline = Date.now() + 5000;
  let lastStatus = null;
  while (Date.now() < deadline) {
    const response = await request(baseUrl, `/api/pvp/live/queue/status/${encodeURIComponent(queueTicket)}`, { token });
    lastStatus = response;
    if (response.status === 200 && response.payload.status === 'matched') return response;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`queue status did not recover matched handoff: ${JSON.stringify(lastStatus && lastStatus.payload)}`);
}

(async () => {
  removeDbFiles();
  const serverA = startServer(PORT_A, 'process-a');
  let serverB = null;
  let socketA = null;
  let socketB = null;
  try {
    await waitForHealth(serverA);
    serverB = startServer(PORT_B, 'process-b');
    await waitForHealth(serverB);

    const baseUrlA = `http://127.0.0.1:${PORT_A}`;
    const baseUrlB = `http://127.0.0.1:${PORT_B}`;
    const wsBaseUrlA = `ws://127.0.0.1:${PORT_A}`;
    const wsBaseUrlB = `ws://127.0.0.1:${PORT_B}`;

    const userA = await registerUser(baseUrlA, 'fanout_a');
    const userB = await registerUser(baseUrlB, 'fanout_b');
    const loadoutA = makeLoadout('sword', ['pvp_burst', 'doubleStrike', 'battleCry', 'defend']);
    const loadoutB = makeLoadout('shield', ['pvp_guard', 'defend', 'stormWard', 'quickSlash']);

    const joinA = await request(baseUrlA, '/api/pvp/live/queue/join', {
      method: 'POST',
      token: userA.token,
      body: { displayName: 'Fanout A', loadout: loadoutA },
    });
    assert.equal(joinA.payload.status, 'waiting', 'shared DEFIER_DB_PATH first backend process should persist waiting player');

    const joinB = await request(baseUrlB, '/api/pvp/live/queue/join', {
      method: 'POST',
      token: userB.token,
      body: { displayName: 'Fanout B', loadout: loadoutB },
    });
    assert.equal(joinB.payload.status, 'matched', 'shared DEFIER_DB_PATH second backend process should create a shared live match');
    const matchId = joinB.payload.matchId;

    const statusA = await pollMatchedQueueStatus(baseUrlA, joinA.payload.queueTicket, userA.token);
    assert.equal(statusA.payload.matchId, matchId, 'shared DEFIER_DB_PATH should let two backend processes observe the same live match');

    socketA = await openSocket(`${wsBaseUrlA}/api/pvp/live/ws?token=${encodeURIComponent(userA.token)}`);
    socketB = await openSocket(`${wsBaseUrlB}/api/pvp/live/ws?token=${encodeURIComponent(userB.token)}`);
    await waitForMessage(socketA, message => message.type === 'connected', 'cross-process WS fanout connected A');
    await waitForMessage(socketB, message => message.type === 'connected', 'cross-process WS fanout connected B');

    sendJson(socketA, { type: 'join_match', matchId, lastSeenRevision: 0 });
    const initialA = await waitForMessage(socketA, message => message.type === 'state_sync' && message.matchId === matchId, 'cross-process WS fanout initial state_sync A');
    await waitForMessage(socketA, message => message.type === 'events_replay' && message.matchId === matchId, 'cross-process WS fanout events_replay A');
    sendJson(socketB, { type: 'join_match', matchId, lastSeenRevision: 0 });
    await waitForMessage(socketB, message => message.type === 'state_sync' && message.matchId === matchId, 'cross-process WS fanout initial state_sync B');
    await waitForMessage(socketB, message => message.type === 'events_replay' && message.matchId === matchId, 'cross-process WS fanout events_replay B');

    sendJson(socketA, {
      type: 'intent',
      matchId,
      intent: {
        intentId: 'cross-process-ready-a',
        intentType: 'ready',
        stateVersion: initialA.stateView.stateVersion,
        payload: {},
      },
    });
    const intentResultA = await waitForMessage(
      socketA,
      message => message.type === 'intent_result' && message.intentId === 'cross-process-ready-a',
      'cross-process WS fanout intent_result A',
    );
    assert.equal(intentResultA.result, 'accepted', 'different backend process should not need local submitIntent to observe state advance');
    const advancedVersion = intentResultA.stateView.stateVersion;
    await waitForMessage(
      socketA,
      message => message.type === 'state_sync' && message.matchId === matchId && message.stateView?.stateVersion >= advancedVersion,
      'cross-process WS fanout local state_sync A',
    );
    const remoteFanoutB = await waitForMessage(
      socketB,
      message => message.type === 'state_sync' && message.matchId === matchId && message.stateView?.stateVersion >= advancedVersion,
      'cross-process proactive WS fanout remote state_sync B',
    );
    assert.equal(remoteFanoutB.seatId, 'B', 'remote process socket should receive authoritative state_sync after opponent intent');
    assert.ok(remoteFanoutB.stateView?.stateVersion >= advancedVersion, 'cross-process proactive WS fanout should not require heartbeat catch-up');
    await expectNoMessage(
      socketA,
      message => message.type === 'state_sync' && message.matchId === matchId && message.stateView?.stateVersion >= advancedVersion,
      'origin process should not echo its own SQLite state_sync signal',
    );

    console.log('sanity_pvp_live_cross_process_ws_fanout_checks passed');
  } finally {
    if (socketA) socketA.close();
    if (socketB) socketB.close();
    await stopServer(serverB);
    await stopServer(serverA);
    removeDbFiles();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
