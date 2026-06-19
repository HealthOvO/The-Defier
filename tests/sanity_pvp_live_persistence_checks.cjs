const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();
const { normalizeLoadoutSnapshot } = require('../server/pvp-live/loadout');
const { createInitialLiveState } = require('../server/pvp-live/engine/state');
const { createLivePvpStore } = require('../server/pvp-live/live-store');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PVP_LIVE_PERSISTENCE_PORT || 9021);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.PVP_LIVE_PERSISTENCE_DB_PATH
  || path.join(os.tmpdir(), `the-defier-pvp-live-persistence-${process.pid}.sqlite`);
const JWT_SECRET = 'integration-jwt-secret-32-characters';
const HMAC_SECRET = 'integration-hmac-secret-32-characters';

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function dbRun(sql, params = []) {
  const db = new sqlite3.Database(DB_PATH);
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      db.close();
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  const db = new sqlite3.Database(DB_PATH);
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function makeLivePvpPersistenceForTest() {
  process.env.DEFIER_DB_PATH = DB_PATH;
  const { makeSqliteLivePvpPersistence } = require('../server/pvp-live/live-persistence');
  return makeSqliteLivePvpPersistence();
}

async function insertStaleWaitingQueueRow({ queueTicket, user, identitySlot, loadoutHash }) {
  const loadoutSnapshot = {
    loadoutHash,
    label: `${identitySlot}-stale-row`,
    identitySlot,
    deckSize: 20,
    locked: true,
  };
  await dbRun(
    `INSERT INTO pvp_live_queue_tickets
      (queue_ticket, user_id, display_name, loadout_snapshot_json, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      queue_ticket = excluded.queue_ticket,
      display_name = excluded.display_name,
      loadout_snapshot_json = excluded.loadout_snapshot_json,
      created_at = excluded.created_at`,
    [
      queueTicket,
      user.userId,
      user.username,
      JSON.stringify(loadoutSnapshot),
      Date.now(),
    ],
  );
}

async function setRank(user, score, division = '玄阶') {
  const now = Date.now();
  await dbRun(
    `INSERT INTO pvp_ranks
      (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, 1, ?, 's1-genesis', ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      user_name = excluded.user_name,
      score = excluded.score,
      division = excluded.division,
      updated_at = excluded.updated_at`,
    [
      `rank-${user.userId}`,
      user.userId,
      user.username,
      score,
      division,
      now,
      now,
    ],
  );
}

async function insertRankedWaitingQueueRow({ queueTicket, userId, username, displayName, score, createdAt, identitySlot, loadoutHash }) {
  const safeCreatedAt = Math.max(0, Math.floor(Number(createdAt) || Date.now()));
  const loadoutSnapshot = normalizeLoadoutSnapshot(
    makeLoadout(identitySlot, ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
    { now: () => safeCreatedAt },
  );
  await dbRun(
    `INSERT INTO users (id, username, password_hash, created_at, global_updated_at)
     VALUES (?, ?, 'pvp-live-saturated-test', ?, 0)
     ON CONFLICT(id) DO UPDATE SET
      username = excluded.username`,
    [userId, username, safeCreatedAt],
  );
  await setRank({ userId, username }, score);
  await dbRun(
    `INSERT INTO pvp_live_queue_tickets
      (queue_ticket, user_id, display_name, loadout_snapshot_json, rating_score, rating_bucket, rating_season_id, rating_provisional, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 's1-genesis', 0, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      queue_ticket = excluded.queue_ticket,
      display_name = excluded.display_name,
      loadout_snapshot_json = excluded.loadout_snapshot_json,
      rating_score = excluded.rating_score,
      rating_bucket = excluded.rating_bucket,
      rating_season_id = excluded.rating_season_id,
      rating_provisional = excluded.rating_provisional,
      created_at = excluded.created_at`,
    [
      queueTicket,
      userId,
      displayName,
      JSON.stringify(loadoutSnapshot),
      score,
      `${Math.floor(score / 100) * 100}_${Math.floor(score / 100) * 100 + 99}`,
      safeCreatedAt,
    ],
  );
}

function startServer() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_DB_PATH: DB_PATH,
      PVP_LIVE_SETUP_READY_TIMEOUT_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  return { child, getOutput: () => output };
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

async function request(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
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
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await request('/health');
      if (health.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`backend health check timed out: ${lastError && lastError.message}\n${server.getOutput()}`);
}

async function withServer(fn) {
  const server = startServer();
  try {
    await waitForHealth(server);
    return await fn();
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
  }
}

async function registerUser(prefix) {
  const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const response = await request('/api/auth/register', {
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

async function submitIntent(matchId, token, body) {
  return request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/intents`, {
    method: 'POST',
    token,
    body,
  });
}

function makeLoadout(identitySlot, pattern) {
  const deck = [];
  for (let index = 0; index < 20; index += 1) {
    deck.push({ id: pattern[index % pattern.length], upgraded: false });
  }
  return {
    identitySlot,
    label: `${identitySlot}-持久化测试谱`,
    deck,
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeStoreStaleMatch({ matchId, stateVersion, now }) {
  const createdAt = Math.max(1, Math.floor(Number(now) || Date.now()) - 1000);
  const updatedAt = createdAt + 500;
  const state = createInitialLiveState({
    matchId,
    seats: [
      {
        seatId: 'A',
        userId: 'store-stale-a',
        displayName: '本地甲',
        loadout: makeLoadout('store-stale-sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
      },
      {
        seatId: 'B',
        userId: 'store-stale-b',
        displayName: '本地乙',
        loadout: makeLoadout('store-stale-shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
      },
    ],
    matchQuality: {
      matchedAt: createdAt,
    },
  });
  state.setup.startedAt = createdAt;
  state.setup.readyDeadlineAt = createdAt + 60000;
  state.stateVersion = Math.max(1, Math.floor(Number(stateVersion) || 1));
  return {
    matchId,
    mode: 'ranked',
    createdAt,
    updatedAt,
    state,
    seatsByUserId: {
      'store-stale-a': 'A',
      'store-stale-b': 'B',
    },
  };
}

async function readyBoth({ matchId, tokenA, tokenB, stateVersionA, prefix }) {
  const readyA = await submitIntent(matchId, tokenA, {
    intentId: `${prefix}-ready-a`,
    intentType: 'ready',
    stateVersion: stateVersionA,
    payload: {},
  });
  assert.equal(readyA.payload.result, 'accepted', `${prefix} first ready should be accepted`);
  const readyB = await submitIntent(matchId, tokenB, {
    intentId: `${prefix}-ready-b`,
    intentType: 'ready',
    stateVersion: readyA.payload.stateView.stateVersion,
    payload: {},
  });
  assert.equal(readyB.payload.result, 'accepted', `${prefix} second ready should be accepted`);
  assert.equal(readyB.payload.stateView.status, 'active', `${prefix} both ready should activate live match`);
  return readyB;
}

(async () => {
  removeDbFiles();
  // The second server below reuses the same DB path to prove restart recovery
  // is SQLite-backed, not just in-memory activeMatchByUserId state.
  let skippedEventSaveCount = 0;
  const skippedStore = createLivePvpStore({
    persistence: {
      async saveMatch() {
        return { saved: false, skipped: true, reason: 'stale_state_version' };
      },
      async saveMatchEvents() {
        skippedEventSaveCount += 1;
      },
    },
  });
  const skippedStoreSave = await skippedStore.saveMatch({
    matchId: 'pvplm-stale-store-save',
    createdAt: 1,
    updatedAt: 2,
    state: {
      matchId: 'pvplm-stale-store-save',
      stateVersion: 1,
      status: 'active',
      seats: {
        A: { userId: 'store-stale-a' },
        B: { userId: 'store-stale-b' },
      },
      events: [
        {
          matchId: 'pvplm-stale-store-save',
          eventId: 'pvplm-stale-store-save-evt-1',
          sequence: 1,
          eventType: 'card_played',
          payload: { cost: 1 },
        },
      ],
    },
    seatsByUserId: {
      'store-stale-a': 'A',
      'store-stale-b': 'B',
    },
  });
  assert.equal(skippedStoreSave?.saved, false, 'store saveMatch should surface skipped stale persistence writes');
  assert.equal(skippedStoreSave?.skipped, true, 'store saveMatch should mark skipped stale persistence writes');
  assert.equal(skippedStoreSave?.reason, 'stale_state_version', 'store saveMatch should keep stale_state_version reason');
  assert.equal(skippedEventSaveCount, 0, 'store saveMatch should not append events when match state persistence is skipped');

  const heartbeatStaleMatchId = 'pvplm-store-stale-heartbeat';
  const heartbeatNow = 1700000010000;
  const heartbeatLocalMatch = makeStoreStaleMatch({
    matchId: heartbeatStaleMatchId,
    stateVersion: 2,
    now: heartbeatNow,
  });
  const heartbeatAuthoritativeMatch = makeStoreStaleMatch({
    matchId: heartbeatStaleMatchId,
    stateVersion: 5,
    now: heartbeatNow,
  });
  heartbeatAuthoritativeMatch.state.seats.B.hp = 31;
  let heartbeatAuthoritativeLoads = 0;
  const heartbeatStore = createLivePvpStore({
    now: () => heartbeatNow,
    persistence: {
      async saveMatch(match) {
        assert.equal(match.matchId, heartbeatStaleMatchId, 'heartbeat stale save should try to persist the local match first');
        return {
          saved: false,
          skipped: true,
          reason: 'stale_state_version',
          stateVersion: match.state.stateVersion,
          persistedStateVersion: heartbeatAuthoritativeMatch.state.stateVersion,
        };
      },
      async loadMatchForUser(userId, matchId) {
        heartbeatAuthoritativeLoads += 1;
        assert.equal(userId, 'store-stale-a', 'heartbeat stale reload should use the viewer user id');
        assert.equal(matchId, heartbeatStaleMatchId, 'heartbeat stale reload should keep the match id');
        return cloneJson(heartbeatAuthoritativeMatch);
      },
      async saveMatchEvents() {
        throw new Error('heartbeat stale save should not append events after skipped persistence');
      },
    },
  });
  heartbeatStore.matches.set(heartbeatStaleMatchId, heartbeatLocalMatch);
  heartbeatStore.activeMatchByUserId.set('store-stale-a', heartbeatStaleMatchId);
  heartbeatStore.activeMatchByUserId.set('store-stale-b', heartbeatStaleMatchId);
  const heartbeatResult = await heartbeatStore.recordHeartbeat('store-stale-a', heartbeatStaleMatchId);
  assert.equal(heartbeatAuthoritativeLoads, 1, 'heartbeat stale save should reload the authoritative persisted match');
  assert.equal(heartbeatResult?.stateView?.stateVersion, 5, 'heartbeat stale save should return authoritative stateView instead of the local stale view');
  assert.equal(heartbeatResult?.stateView?.opponent?.hp, 31, 'heartbeat stale save should return the latest persisted combat state');
  assert.equal(heartbeatStore.matches.get(heartbeatStaleMatchId)?.state?.stateVersion, 5, 'heartbeat stale reload should refresh the in-memory match cache');

  const intentStaleMatchId = 'pvplm-store-stale-intent';
  const intentNow = 1700000020000;
  const intentLocalMatch = makeStoreStaleMatch({
    matchId: intentStaleMatchId,
    stateVersion: 1,
    now: intentNow,
  });
  const intentAuthoritativeMatch = makeStoreStaleMatch({
    matchId: intentStaleMatchId,
    stateVersion: 6,
    now: intentNow,
  });
  intentAuthoritativeMatch.state.seats.B.hp = 29;
  let intentAuthoritativeLoads = 0;
  const intentStore = createLivePvpStore({
    now: () => intentNow,
    persistence: {
      async saveMatch(match) {
        assert.equal(match.matchId, intentStaleMatchId, 'intent stale save should try to persist the accepted local reducer result first');
        return {
          saved: false,
          skipped: true,
          reason: 'stale_state_version',
          stateVersion: match.state.stateVersion,
          persistedStateVersion: intentAuthoritativeMatch.state.stateVersion,
        };
      },
      async loadMatchForUser(userId, matchId) {
        intentAuthoritativeLoads += 1;
        assert.equal(userId, 'store-stale-a', 'intent stale reload should use the acting user id');
        assert.equal(matchId, intentStaleMatchId, 'intent stale reload should keep the match id');
        return cloneJson(intentAuthoritativeMatch);
      },
      async saveMatchEvents() {
        throw new Error('intent stale save should not append events after skipped persistence');
      },
    },
  });
  intentStore.matches.set(intentStaleMatchId, intentLocalMatch);
  intentStore.activeMatchByUserId.set('store-stale-a', intentStaleMatchId);
  intentStore.activeMatchByUserId.set('store-stale-b', intentStaleMatchId);
  const intentResult = await intentStore.submitIntent('store-stale-a', intentStaleMatchId, {
    intentId: 'store-stale-ready-a',
    intentType: 'ready',
    stateVersion: 1,
    payload: {},
  });
  assert.equal(intentAuthoritativeLoads, 1, 'intent stale save should reload the authoritative persisted match');
  assert.equal(intentResult?.result, 'sync_required', 'intent stale save should ask the client to sync instead of returning accepted local state');
  assert.equal(intentResult?.reason, 'stale_state_version', 'intent stale sync should expose stale_state_version as the reason');
  assert.deepEqual(intentResult?.events, [], 'intent stale sync should not replay local accepted events that failed persistence');
  assert.equal(intentResult?.stateView?.stateVersion, 6, 'intent stale sync should return authoritative stateView');
  assert.equal(intentResult?.stateView?.opponent?.hp, 29, 'intent stale sync should return the latest persisted combat state');
  assert.equal(intentStore.matches.get(intentStaleMatchId)?.state?.stateVersion, 6, 'intent stale reload should refresh the in-memory match cache');

  const missingReloadMatchId = 'pvplm-store-stale-missing-reload';
  const missingReloadMatch = makeStoreStaleMatch({
    matchId: missingReloadMatchId,
    stateVersion: 3,
    now: 1700000030000,
  });
  const missingReloadStore = createLivePvpStore({
    now: () => 1700000030000,
    persistence: {
      async saveMatch() {
        return {
          saved: false,
          skipped: true,
          reason: 'stale_state_version',
          stateVersion: missingReloadMatch.state.stateVersion,
          persistedStateVersion: 7,
        };
      },
      async loadMatchForUser(userId, matchId) {
        assert.equal(userId, 'store-stale-a', 'missing stale reload should still use the viewer user id');
        assert.equal(matchId, missingReloadMatchId, 'missing stale reload should still request the exact match id');
        return null;
      },
      async saveMatchEvents() {
        throw new Error('missing stale reload should not append events after skipped persistence');
      },
    },
  });
  missingReloadStore.matches.set(missingReloadMatchId, missingReloadMatch);
  missingReloadStore.activeMatchByUserId.set('store-stale-a', missingReloadMatchId);
  missingReloadStore.activeMatchByUserId.set('store-stale-b', missingReloadMatchId);
  const missingReloadResult = await missingReloadStore.recordHeartbeat('store-stale-a', missingReloadMatchId);
  assert.equal(missingReloadResult, null, 'missing authoritative stale reload should not return the local dirty heartbeat view');
  assert.equal(missingReloadStore.matches.has(missingReloadMatchId), false, 'missing authoritative stale reload should evict the local dirty match cache');
  assert.equal(missingReloadStore.activeMatchByUserId.has('store-stale-a'), false, 'missing authoritative stale reload should clear viewer active match cache');
  assert.equal(missingReloadStore.activeMatchByUserId.has('store-stale-b'), false, 'missing authoritative stale reload should clear opponent active match cache');

  let userA;
  let userB;
  let matchId;
  let stateVersionAfterIntent;
  let opponentHpAfterIntent;
  let userALoadoutHash;
  let userAIdentitySlot;
  let activeMatchCreatedAt;
  let corruptedActiveUpdatedAt;

  let waitingUserA;
  let waitingUserB;
  let rematchUserA;
  let rematchUserB;
  let rematchSourceMatchId;
  let rematchSeriesId;
  let inviteUserA;
  let inviteUserB;
  let inviteCode;
  let inviteLoadoutHash;
  let expiredInviteUserA;
  let expiredInviteUserB;
  let expiredInviteCode;
  let eventSourceUserA;
  let eventSourceUserB;
  let eventSourceMatchId;
  let rankedFarUser;
  let rankedNearUser;
  let rankedRequesterUser;
  let rankedFarQueueTicket;
  let saturatedRequesterUser;
  let wideAcceptedWaitingUser;
  let wideAcceptedRequesterUser;

  await withServer(async () => {
    waitingUserA = await registerUser('live_waiting_restart_a');
    waitingUserB = await registerUser('live_waiting_restart_b');
    const waitingLoadoutA = makeLoadout('waiting-sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']);

    const joinA = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: waitingUserA.token,
      body: { displayName: '候甲', loadout: waitingLoadoutA },
    });
    assert.equal(joinA.payload.status, 'waiting', 'first waiting queue restart user should wait');
    assert.equal(joinA.payload.loadoutSummary.identitySlot, 'waiting-sword', 'waiting queue should expose locked identity before restart');

    waitingUserA.queueTicket = joinA.payload.queueTicket;
    waitingUserA.loadoutHash = joinA.payload.loadoutHash;
  });

  await withServer(async () => {
    const statusAfterRestart = await request(`/api/pvp/live/queue/status/${encodeURIComponent(waitingUserA.queueTicket)}`, {
      token: waitingUserA.token,
    });
    assert.equal(statusAfterRestart.status, 200, 'restarted waiting queue ticket should remain readable');
    assert.equal(statusAfterRestart.payload.status, 'waiting', 'restarted waiting queue ticket should stay waiting');
    assert.equal(statusAfterRestart.payload.loadoutHash, waitingUserA.loadoutHash, 'restarted waiting queue status should preserve locked loadout hash');
    assert.equal(statusAfterRestart.payload.loadoutSummary.identitySlot, 'waiting-sword', 'restarted waiting queue status should preserve locked identity slot');

    const changedLoadout = makeLoadout('waiting-curse', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']);
    const rejoinChanged = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: waitingUserA.token,
      body: { displayName: '候甲', loadout: changedLoadout },
    });
    assert.equal(rejoinChanged.status, 200, 'restarted waiting queue owner should be able to rejoin');
    assert.equal(rejoinChanged.payload.status, 'waiting', 'restarted waiting queue owner should keep waiting status');
    assert.equal(rejoinChanged.payload.queueTicket, waitingUserA.queueTicket, 'restarted waiting queue owner should keep original queue ticket');
    assert.equal(rejoinChanged.payload.loadoutHash, waitingUserA.loadoutHash, 'restarted waiting queue rejoin should not overwrite locked loadout hash');
    assert.equal(rejoinChanged.payload.loadoutSummary.identitySlot, 'waiting-sword', 'restarted waiting queue rejoin should not overwrite locked identity slot');

    const waitingLoadoutB = makeLoadout('waiting-shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']);
    const joinB = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: waitingUserB.token,
      body: { displayName: '候乙', loadout: waitingLoadoutB },
    });
    assert.equal(joinB.payload.status, 'matched', 'restarted waiting queue should match second user after backend restart');
    assert.equal(joinB.payload.stateView.self.loadoutSummary.identitySlot, 'waiting-shield', 'second user should keep own locked waiting restart loadout');
    assert.equal(joinB.payload.stateView.opponent.loadoutHash, waitingUserA.loadoutHash, 'second user should see restarted waiting opponent locked hash');
    assert.ok(!joinB.payload.stateView.opponent.loadoutSnapshot, 'restarted waiting queue match must not leak opponent snapshot');

    const pollA = await request(`/api/pvp/live/queue/status/${encodeURIComponent(waitingUserA.queueTicket)}`, {
      token: waitingUserA.token,
    });
    assert.equal(pollA.status, 200, 'restarted waiting queue owner should receive matched result after second user joins');
    assert.equal(pollA.payload.status, 'matched', 'restarted waiting queue owner should receive matched status');
    assert.equal(pollA.payload.stateView.self.loadoutHash, waitingUserA.loadoutHash, 'restarted waiting queue matched owner should preserve locked loadout hash');
    assert.equal(pollA.payload.stateView.self.loadoutSummary.identitySlot, 'waiting-sword', 'restarted waiting queue matched owner should preserve locked identity slot');

    const pollASecondRead = await request(`/api/pvp/live/queue/status/${encodeURIComponent(waitingUserA.queueTicket)}`, {
      token: waitingUserA.token,
    });
    assert.equal(pollASecondRead.status, 404, 'restarted waiting queue matched ticket should be consumed after first read');
  });

  await withServer(async () => {
    rankedFarUser = await registerUser('live_ranked_restart_far');
    rankedNearUser = await registerUser('live_ranked_restart_near');
    rankedRequesterUser = await registerUser('live_ranked_restart_requester');
    await setRank(rankedFarUser, 1800, '天阶');
    await setRank(rankedNearUser, 1040, '玄阶');
    await setRank(rankedRequesterUser, 1000, '玄阶');

    const farJoin = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: rankedFarUser.token,
      body: { displayName: '重启高分远端', loadout: makeLoadout('ranked-far', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']) },
    });
    assert.equal(farJoin.payload.status, 'waiting', 'ranked far queue should wait before restart');
    rankedFarQueueTicket = farJoin.payload.queueTicket;
  });

  await withServer(async () => {
    const nearJoin = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: rankedNearUser.token,
      body: { displayName: '重启近分候选', loadout: makeLoadout('ranked-near', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']) },
    });
    assert.equal(nearJoin.payload.status, 'waiting', 'restarted initial rating stage should not match outside the base rating bucket');
    assert.ok(nearJoin.payload.queueTicket, 'restarted near candidate should keep its own queue ticket');
  });

  await withServer(async () => {
    const requesterJoin = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: rankedRequesterUser.token,
      body: { displayName: '重启新入近分', loadout: makeLoadout('ranked-requester', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']) },
    });
    assert.equal(requesterJoin.payload.status, 'matched', 'restarted candidate search should honor persisted rating bucket before older wider-gap rows');
    assert.equal(requesterJoin.payload.stateView.opponent.displayName, '重启近分候选', 'restarted candidate search should prefer the closest persisted rating snapshot');
    assert.equal(requesterJoin.payload.stateView.matchQuality?.ratingDeltaBucket, 'near_0_99', 'restarted ranked match quality should derive rating delta bucket from joined ratings');
    assert.equal(requesterJoin.payload.stateView.matchQuality?.expansionStage, 'strict_rating', 'restarted ranked match quality should expose strict rating stage');
    assert.ok(!/1800|1040|1000/.test(JSON.stringify(requesterJoin.payload.stateView.matchQuality || {})), 'restarted ranked match quality should not expose exact player ratings');

    const farStatus = await request(`/api/pvp/live/queue/status/${encodeURIComponent(rankedFarQueueTicket)}`, {
      token: rankedFarUser.token,
    });
    assert.equal(farStatus.payload.status, 'waiting', 'older wider-gap persisted candidate should remain waiting after closest candidate is selected');

    const cancelFar = await request('/api/pvp/live/queue/cancel', {
      method: 'POST',
      token: rankedFarUser.token,
      body: { queueTicket: rankedFarQueueTicket },
    });
    assert.equal(cancelFar.payload.status, 'cancelled', 'ranked far queue cleanup should cancel waiting ticket');
  });

  const saturatedBaseCreatedAt = Date.now() - (4 * 60 * 1000);
  for (let index = 0; index < 33; index += 1) {
    await insertRankedWaitingQueueRow({
      queueTicket: `pvplq-saturated-fair-${process.pid}-${index}`,
      userId: `saturated-fair-${process.pid}-${index}`,
      username: `saturated_fair_${process.pid}_${index}`,
      displayName: `饱和较远候选${index}`,
      score: 1150,
      createdAt: saturatedBaseCreatedAt + index,
      identitySlot: `saturated-fair-${index}`,
      loadoutHash: `saturated-fair-loadout-${index}`,
    });
  }
  await insertRankedWaitingQueueRow({
    queueTicket: `pvplq-saturated-near-${process.pid}`,
    userId: `saturated-near-${process.pid}`,
    username: `saturated_near_${process.pid}`,
    displayName: '饱和近分候选',
    score: 1040,
    createdAt: saturatedBaseCreatedAt + 40,
    identitySlot: 'saturated-near',
    loadoutHash: 'saturated-near-loadout',
  });

  await withServer(async () => {
    saturatedRequesterUser = await registerUser('live_ranked_saturated_requester');
    await setRank(saturatedRequesterUser, 1000, '玄阶');
    const saturatedRequesterJoin = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: saturatedRequesterUser.token,
      body: { displayName: '饱和新入近分', loadout: makeLoadout('ranked-saturated-requester', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']) },
    });
    assert.equal(saturatedRequesterJoin.payload.status, 'matched', `restarted saturated candidate search should restore beyond 32 candidates: ${JSON.stringify(saturatedRequesterJoin.payload)}`);
    assert.equal(saturatedRequesterJoin.payload.stateView.opponent.displayName, '饱和近分候选', 'restarted saturated candidate search should prefer candidate after the first 32 waiting rows');
    assert.equal(saturatedRequesterJoin.payload.stateView.matchQuality?.ratingDeltaBucket, 'near_0_99', 'restarted saturated ranked match should still expose near rating bucket');
    assert.ok(saturatedRequesterJoin.payload.stateView.matchQuality?.candidatePoolSize > 32, 'restarted saturated match quality should count more than 32 queued candidates');
  });
  await dbRun(
    `DELETE FROM pvp_live_queue_tickets
     WHERE user_id LIKE ? OR user_id = ?`,
    [`saturated-fair-${process.pid}-%`, `saturated-near-${process.pid}`],
  );

  await withServer(async () => {
    wideAcceptedWaitingUser = await registerUser('live_wide_accept_restart_waiting');
    await setRank(wideAcceptedWaitingUser, 1250, '玄阶');
    const wideAcceptedWaitingJoin = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: wideAcceptedWaitingUser.token,
      body: {
        displayName: '重启宽差同意等待者',
        loadout: makeLoadout('wide-accepted-waiting', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
        wideMatchConsent: true,
      },
    });
    assert.equal(wideAcceptedWaitingJoin.payload.status, 'waiting', 'wide accepted waiting player should queue before restart');
    await dbRun(
      `UPDATE pvp_live_queue_tickets
       SET created_at = ?
       WHERE queue_ticket = ?`,
      [Date.now() - (4 * 60 * 1000), wideAcceptedWaitingJoin.payload.queueTicket],
    );
  });

  await withServer(async () => {
    wideAcceptedRequesterUser = await registerUser('live_wide_accept_restart_requester');
    await setRank(wideAcceptedRequesterUser, 1000, '玄阶');
    const wideAcceptedRestartJoin = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: wideAcceptedRequesterUser.token,
      body: {
        displayName: '重启宽差同意新入',
        loadout: makeLoadout('wide-accepted-requester', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']),
        wideMatchConsent: true,
      },
    });
    assert.equal(wideAcceptedRestartJoin.payload.status, 'matched', `restarted two-sided wide consent should restore consent from the waiting queue row: ${JSON.stringify(wideAcceptedRestartJoin.payload)}`);
    assert.equal(wideAcceptedRestartJoin.payload.stateView.opponent.displayName, '重启宽差同意等待者', 'restarted accepted wide match should pair with the persisted consenting waiting player');
    assert.equal(wideAcceptedRestartJoin.payload.stateView.matchQuality?.tag, 'wide_but_accepted', 'restarted accepted wide match should keep wide_but_accepted tag');
    assert.equal(wideAcceptedRestartJoin.payload.stateView.matchQuality?.expansionStage, 'accepted_200_399', 'restarted accepted wide match should keep accepted wide stage');
    assert.ok(wideAcceptedRestartJoin.payload.stateView.matchQuality?.safeguards?.includes('explicit_wide_match_consent'), 'restarted accepted wide match should keep explicit consent safeguard');
    assert.ok(!/1250|1000/.test(JSON.stringify(wideAcceptedRestartJoin.payload.stateView.matchQuality || {})), 'restarted accepted wide match quality should not expose exact ratings');
  });

  await withServer(async () => {
    userA = await registerUser('live_persist_a');
    userB = await registerUser('live_persist_b');
    const loadoutA = makeLoadout('persist-sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']);
    const loadoutB = makeLoadout('persist-shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']);

    const joinA = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userA.token,
      body: { displayName: '甲', loadout: loadoutA },
    });
    assert.equal(joinA.payload.status, 'waiting', 'first live persistence user should wait');
    userALoadoutHash = joinA.payload.loadoutHash;
    userAIdentitySlot = joinA.payload.loadoutSummary.identitySlot;

    const joinB = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userB.token,
      body: { displayName: '乙', loadout: loadoutB },
    });
    assert.equal(joinB.payload.status, 'matched', 'second live persistence user should match');
    matchId = joinB.payload.matchId;

    const pollA = await request(`/api/pvp/live/queue/status/${encodeURIComponent(joinA.payload.queueTicket)}`, {
      token: userA.token,
    });
    assert.equal(pollA.payload.status, 'matched', 'first live persistence user should receive match');
    assert.equal(pollA.payload.stateView.self.loadoutHash, userALoadoutHash, 'pre-restart matched view should expose locked loadout hash');
    assert.equal(pollA.payload.stateView.self.loadoutSummary.identitySlot, userAIdentitySlot, 'pre-restart matched view should expose locked identity slot');

    const ready = await readyBoth({
      matchId,
      tokenA: userA.token,
      tokenB: userB.token,
      stateVersionA: pollA.payload.stateView.stateVersion,
      prefix: 'persist'
    });

    const playA = await submitIntent(matchId, userA.token, {
        intentId: 'persist-play-a-1',
        intentType: 'play_card',
        stateVersion: ready.payload.stateView.stateVersion,
        payload: { cardInstanceId: 'A-strike-1', targetSeat: 'B' },
    });
    assert.equal(playA.payload.result, 'accepted', 'pre-restart live intent should be accepted');
    stateVersionAfterIntent = playA.payload.stateView.stateVersion;
    opponentHpAfterIntent = playA.payload.stateView.opponent.hp;

    const heartbeatB = await request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/heartbeat`, {
      method: 'POST',
      token: userB.token,
      body: {},
    });
    assert.equal(heartbeatB.status, 200, 'pre-restart heartbeat should be accepted');
    assert.equal(heartbeatB.payload.stateView.connectionReport.reportVersion, 'pvp-live-connection-v1', 'pre-restart heartbeat should expose connection report');
  });

  const connectionRow = await dbGet('SELECT connection_json FROM pvp_live_matches WHERE match_id = ?', [matchId]);
  assert.ok(connectionRow && connectionRow.connection_json, 'heartbeat connection timeline should be persisted with the live match row');
  const persistedConnection = JSON.parse(connectionRow.connection_json);
  assert.equal(persistedConnection.reportVersion, 'pvp-live-connection-v1', 'persisted connection timeline should keep report version');
  assert.ok(persistedConnection.seats && persistedConnection.seats.B && persistedConnection.seats.B.lastHeartbeatAt > 0, 'persisted connection timeline should keep seat B heartbeat');

  const activeMatchRow = await dbGet('SELECT state_json, state_version, created_at FROM pvp_live_matches WHERE match_id = ?', [matchId]);
  assert.ok(activeMatchRow && activeMatchRow.state_json, 'active live match state should be persisted before restart');
  const latestActiveState = JSON.parse(activeMatchRow.state_json);
  assert.equal(latestActiveState.stateVersion, stateVersionAfterIntent, 'active match row should contain latest state version before stale-save CAS check');
  assert.equal(Number(activeMatchRow.state_version), stateVersionAfterIntent, 'active match row should persist state_version beside state_json');
  const acceptedSaveResult = await makeLivePvpPersistenceForTest().saveMatch({
    matchId,
    createdAt: Number(activeMatchRow.created_at) || Date.now(),
    updatedAt: Date.now(),
    state: latestActiveState,
    connection: {},
    seatsByUserId: {
      [userA.userId]: 'A',
      [userB.userId]: 'B',
    },
  });
  assert.equal(acceptedSaveResult?.saved, true, 'persistence saveMatch should report accepted active snapshots as saved');
  assert.equal(acceptedSaveResult?.skipped, false, 'persistence saveMatch should not mark accepted active snapshots as skipped');
  assert.equal(acceptedSaveResult?.reason, 'saved', 'persistence accepted save result should expose saved reason');
  const staleActiveState = JSON.parse(JSON.stringify(latestActiveState));
  staleActiveState.stateVersion = Math.max(0, latestActiveState.stateVersion - 1);
  if (staleActiveState.seats && staleActiveState.seats.B) {
    staleActiveState.seats.B.hp = Math.min(50, opponentHpAfterIntent + 1);
  }
  const staleSaveResult = await makeLivePvpPersistenceForTest().saveMatch({
    matchId,
    createdAt: Number(activeMatchRow.created_at) || Date.now(),
    updatedAt: Date.now() + 1,
    state: staleActiveState,
    connection: {},
    seatsByUserId: {
      [userA.userId]: 'A',
      [userB.userId]: 'B',
    },
  });
  assert.equal(staleSaveResult?.saved, false, 'persistence saveMatch should report stale lower-version saves as skipped');
  assert.equal(staleSaveResult?.skipped, true, 'persistence stale save result should mark skipped true');
  assert.equal(staleSaveResult?.reason, 'stale_state_version', 'persistence stale save result should expose a stable stale_state_version reason');
  const rowAfterStaleSave = await dbGet('SELECT state_json FROM pvp_live_matches WHERE match_id = ?', [matchId]);
  const stateAfterStaleSave = JSON.parse(rowAfterStaleSave.state_json);
  assert.equal(
    stateAfterStaleSave.stateVersion,
    stateVersionAfterIntent,
    'persistence CAS should reject stale active match saves with lower stateVersion',
  );
  assert.equal(
    stateAfterStaleSave.seats.B.hp,
    opponentHpAfterIntent,
    'persistence CAS should keep the latest combat state when a stale process saves later',
  );
  await dbRun(
    'UPDATE pvp_live_matches SET state_version = 0, state_json = ? WHERE match_id = ?',
    [JSON.stringify(latestActiveState), matchId],
  );
  const migratedStaleSaveResult = await makeLivePvpPersistenceForTest().saveMatch({
    matchId,
    createdAt: Number(activeMatchRow.created_at) || Date.now(),
    updatedAt: Date.now() + 2,
    state: staleActiveState,
    connection: {},
    seatsByUserId: {
      [userA.userId]: 'A',
      [userB.userId]: 'B',
    },
  });
  assert.equal(migratedStaleSaveResult?.saved, false, 'migrated stale lower-version saves should report skipped');
  assert.equal(migratedStaleSaveResult?.skipped, true, 'migrated stale save result should mark skipped true');
  assert.equal(migratedStaleSaveResult?.reason, 'stale_state_version', 'migrated stale save result should expose stale_state_version');
  const migratedRowAfterStaleSave = await dbGet('SELECT state_json FROM pvp_live_matches WHERE match_id = ?', [matchId]);
  const migratedStateAfterStaleSave = JSON.parse(migratedRowAfterStaleSave.state_json);
  assert.equal(
    migratedStateAfterStaleSave.stateVersion,
    stateVersionAfterIntent,
    'persistence CAS should derive existing revision from state_json for migrated rows',
  );
  assert.equal(
    migratedStateAfterStaleSave.seats.B.hp,
    opponentHpAfterIntent,
    'migrated active match rows should keep latest combat state when state_version backfill is still zero',
  );
  const corruptedActiveState = JSON.parse(activeMatchRow.state_json);
  delete corruptedActiveState.turnTiming;
  if (corruptedActiveState.setup) delete corruptedActiveState.setup.battleStartedAt;
  activeMatchCreatedAt = Number(activeMatchRow.created_at) || Date.now();
  corruptedActiveUpdatedAt = activeMatchCreatedAt + 30000;
  await dbRun(
    'UPDATE pvp_live_matches SET state_json = ?, updated_at = ? WHERE match_id = ?',
    [JSON.stringify(corruptedActiveState), corruptedActiveUpdatedAt, matchId],
  );

  const staleActiveQueueTicket = `pvplq-stale-active-${process.pid}`;
  await insertStaleWaitingQueueRow({
    queueTicket: staleActiveQueueTicket,
    user: userA,
    identitySlot: 'stale-waiting',
    loadoutHash: 'stale-waiting-loadout-hash',
  });

  await withServer(async () => {
    const rejoinA = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userA.token,
      body: { displayName: '甲' },
    });
    assert.equal(rejoinA.status, 200, 'restarted server should not queue a user who has a persisted active live match');
    assert.equal(rejoinA.payload.status, 'matched', 'restarted active live match join should return matched');
    assert.equal(rejoinA.payload.matchId, matchId, 'restarted active live match join should keep match id');
    assert.equal(rejoinA.payload.stateView.self.loadoutHash, userALoadoutHash, 'restarted active live match join should preserve locked loadout hash');
    assert.equal(rejoinA.payload.stateView.self.loadoutSummary.identitySlot, userAIdentitySlot, 'restarted active live match join should preserve locked identity slot');

    const currentA = await request('/api/pvp/live/matches/current', {
      token: userA.token,
    });
    assert.equal(currentA.status, 200, 'restarted server should recover persisted current live match');
    assert.equal(currentA.payload.matchId, matchId, 'restarted current match should keep match id');
    assert.equal(currentA.payload.seatId, 'A', 'restarted current match should keep user seat');
    assert.equal(currentA.payload.stateView.stateVersion, stateVersionAfterIntent, 'restarted current match should keep latest state version');
    assert.equal(currentA.payload.stateView.opponent.hp, opponentHpAfterIntent, 'restarted current match should keep latest opponent hp');
    assert.equal(currentA.payload.stateView.self.loadoutHash, userALoadoutHash, 'restarted current match should keep locked loadout hash');
    assert.equal(currentA.payload.stateView.self.loadoutSummary.identitySlot, userAIdentitySlot, 'restarted current match should keep locked identity slot');
    assert.equal(currentA.payload.stateView.connectionReport.reportVersion, 'pvp-live-connection-v1', 'restarted current match should restore connection report');
    assert.equal(currentA.payload.stateView.connectionReport.opponent.status, 'online', 'restarted current match should preserve recently heartbeated opponent as online');
    assert.notEqual(currentA.payload.stateView.turnTimer.startedAt, corruptedActiveUpdatedAt, 'restarted active match with missing turnTiming must not derive turn start from updated_at');
    assert.equal(currentA.payload.stateView.turnTimer.startedAt, activeMatchCreatedAt, 'restarted active match with missing turnTiming should fall back to match createdAt');
    assert.ok(!Array.isArray(currentA.payload.stateView.opponent.hand), 'restarted current match must not leak opponent hand');

    const staleQueueStatus = await request(`/api/pvp/live/queue/status/${encodeURIComponent(staleActiveQueueTicket)}`, {
      token: userA.token,
    });
    assert.equal(staleQueueStatus.status, 404, 'restarted active match should take precedence over any stale waiting row');
  });

  await withServer(async () => {
    rematchUserA = await registerUser('live_rematch_restart_a');
    rematchUserB = await registerUser('live_rematch_restart_b');
    const loadoutA = makeLoadout('rematch-sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']);
    const loadoutB = makeLoadout('rematch-shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']);

    const joinA = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: rematchUserA.token,
      body: { displayName: '约甲', loadout: loadoutA },
    });
    assert.equal(joinA.payload.status, 'waiting', 'first rematch persistence user should wait');
    const joinB = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: rematchUserB.token,
      body: { displayName: '约乙', loadout: loadoutB },
    });
    assert.equal(joinB.payload.status, 'matched', 'second rematch persistence user should match');
    rematchSourceMatchId = joinB.payload.matchId;

    const pollA = await request(`/api/pvp/live/queue/status/${encodeURIComponent(joinA.payload.queueTicket)}`, {
      token: rematchUserA.token,
    });
    assert.equal(pollA.payload.status, 'matched', 'first rematch persistence user should receive match');
    const ready = await readyBoth({
      matchId: rematchSourceMatchId,
      tokenA: rematchUserA.token,
      tokenB: rematchUserB.token,
      stateVersionA: pollA.payload.stateView.stateVersion,
      prefix: 'persist-rematch'
    });
    const surrenderB = await submitIntent(rematchSourceMatchId, rematchUserB.token, {
      intentId: 'persist-rematch-surrender-b-1',
      intentType: 'surrender',
      stateVersion: ready.payload.stateView.stateVersion,
      payload: {},
    });
    assert.equal(surrenderB.payload.result, 'accepted', 'pre-restart rematch source should finish normally');

    const rematchA = await request(`/api/pvp/live/matches/${encodeURIComponent(rematchSourceMatchId)}/rematch`, {
      method: 'POST',
      token: rematchUserA.token,
      body: { displayName: '约甲', loadout: loadoutA },
    });
    assert.equal(rematchA.status, 200, 'pre-restart first friendly rematch request should be accepted');
    assert.equal(rematchA.payload.status, 'waiting_rematch', 'pre-restart first friendly rematch request should wait');
    rematchSeriesId = rematchA.payload.friendlySeries?.seriesId;
    assert.ok(rematchSeriesId, 'pre-restart pending rematch should expose a series id');
  });

  const pendingRematchRow = await dbGet(
    'SELECT source_match_id, series_id, players_json FROM pvp_live_rematch_requests WHERE source_match_id = ?',
    [rematchSourceMatchId],
  );
  assert.ok(pendingRematchRow, 'pending friendly rematch request should be persisted before restart');
  assert.equal(pendingRematchRow.series_id, rematchSeriesId, 'persisted pending rematch should keep series id');
  assert.ok(pendingRematchRow.players_json.includes(rematchUserA.userId), 'persisted pending rematch should keep requester player snapshot');

  await withServer(async () => {
    const acceptedAfterRestart = await request(`/api/pvp/live/matches/${encodeURIComponent(rematchSourceMatchId)}/rematch`, {
      method: 'POST',
      token: rematchUserB.token,
      body: { displayName: '约乙', loadout: makeLoadout('rematch-shield-next', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']) },
    });
    assert.equal(acceptedAfterRestart.status, 200, 'restarted pending rematch should let the opponent accept');
    assert.equal(acceptedAfterRestart.payload.status, 'matched', 'restarted pending rematch should create the friendly match instead of waiting again');
    assert.equal(acceptedAfterRestart.payload.stateView.mode, 'friendly', 'restarted pending rematch should create friendly mode match');
    assert.equal(acceptedAfterRestart.payload.stateView.friendlySeries?.seriesId, rematchSeriesId, 'restarted pending rematch should keep original series id');
    assert.deepEqual(acceptedAfterRestart.payload.stateView.friendlySeries?.scoreBySourceSeat, { A: 1, B: 0 }, 'restarted pending rematch should preserve ranked source score');

    const currentA = await request('/api/pvp/live/matches/current', {
      token: rematchUserA.token,
    });
    assert.equal(currentA.status, 200, 'restarted pending rematch requester should recover accepted friendly match through current');
    assert.equal(currentA.payload.matchId, acceptedAfterRestart.payload.matchId, 'restarted pending rematch requester current match should point to accepted friendly match');
  });

  const clearedPendingRematchRow = await dbGet(
    'SELECT source_match_id FROM pvp_live_rematch_requests WHERE source_match_id = ?',
    [rematchSourceMatchId],
  );
  assert.equal(clearedPendingRematchRow, null, 'accepted pending rematch should be cleared after friendly match creation');

  await withServer(async () => {
    inviteUserA = await registerUser('live_invite_restart_a');
    inviteUserB = await registerUser('live_invite_restart_b');
    const inviteLoadoutA = makeLoadout('invite-sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']);

    const createdInvite = await request('/api/pvp/live/invites', {
      method: 'POST',
      token: inviteUserA.token,
      body: { displayName: '邀甲', targetUsername: inviteUserB.username, loadout: inviteLoadoutA },
    });
    assert.equal(createdInvite.status, 200, 'pre-restart private invite creation should be accepted');
    assert.equal(createdInvite.payload.status, 'waiting_invite', 'pre-restart private invite should wait');
    assert.equal(createdInvite.payload.inviteReport?.rankedImpact, 'none', 'pre-restart private invite should be no-score');
    assert.equal(createdInvite.payload.inviteReport?.target?.displayName, inviteUserB.username.slice(0, 40), 'pre-restart targeted private invite should expose target display name');
    inviteCode = createdInvite.payload.inviteCode;
    inviteLoadoutHash = createdInvite.payload.loadoutHash;
    assert.ok(inviteCode, 'pre-restart private invite should expose invite code');
    assert.ok(inviteLoadoutHash, 'pre-restart private invite should lock host loadout');
  });

  const pendingInviteRow = await dbGet(
    'SELECT invite_code, host_user_id, host_loadout_snapshot_json, target_user_id, target_user_name FROM pvp_live_invites WHERE invite_code = ?',
    [inviteCode],
  );
  assert.ok(pendingInviteRow, 'pending private invite should be persisted before restart');
  assert.equal(pendingInviteRow.host_user_id, inviteUserA.userId, 'persisted private invite should keep host user id');
  assert.equal(pendingInviteRow.target_user_id, inviteUserB.userId, 'persisted targeted private invite should keep target user id');
  assert.equal(pendingInviteRow.target_user_name, inviteUserB.username.slice(0, 40), 'persisted targeted private invite should keep target username');
  assert.ok(pendingInviteRow.host_loadout_snapshot_json.includes(inviteLoadoutHash), 'persisted private invite should keep locked host loadout snapshot');

  await withServer(async () => {
    const inviteInbox = await request('/api/pvp/live/invites/inbox', {
      token: inviteUserB.token,
    });
    assert.equal(inviteInbox.status, 200, 'restarted targeted private invite recipient should read inbox');
    assert.equal(inviteInbox.payload.invites.length, 1, 'restarted targeted private invite should appear in recipient inbox');
    assert.equal(inviteInbox.payload.invites[0].inviteCode, inviteCode, 'restarted targeted private invite inbox should keep invite code');
    assert.equal(inviteInbox.payload.invites[0].inviteReport?.target?.displayName, inviteUserB.username.slice(0, 40), 'restarted targeted private invite inbox should keep target display name');

    const joinedInvite = await request(`/api/pvp/live/invites/${encodeURIComponent(inviteCode)}/join`, {
      method: 'POST',
      token: inviteUserB.token,
      body: { displayName: '邀乙', loadout: makeLoadout('invite-shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']) },
    });
    assert.equal(joinedInvite.status, 200, 'restarted private invite should let invited opponent join');
    assert.equal(joinedInvite.payload.status, 'matched', 'restarted private invite should create a live match');
    assert.equal(joinedInvite.payload.stateView.mode, 'friendly', 'restarted private invite should create friendly no-score match');
    assert.equal(joinedInvite.payload.stateView.matchQuality?.expansionStage, 'friend_invite', 'restarted private invite should keep invite match quality stage');
    assert.equal(joinedInvite.payload.inviteReport?.target?.displayName, inviteUserB.username.slice(0, 40), 'restarted targeted private invite join should keep target report');
    assert.equal(joinedInvite.payload.stateView.opponent.loadoutHash, inviteLoadoutHash, 'restarted private invite should preserve host locked loadout hash');

    const currentHost = await request('/api/pvp/live/matches/current', {
      token: inviteUserA.token,
    });
    assert.equal(currentHost.status, 200, 'restarted private invite host should recover accepted invite through current');
    assert.equal(currentHost.payload.matchId, joinedInvite.payload.matchId, 'restarted private invite host current match should point to invite match');
    assert.equal(currentHost.payload.stateView.mode, 'friendly', 'restarted private invite host current match should stay friendly');
  });

  const clearedInviteRow = await dbGet(
    'SELECT invite_code FROM pvp_live_invites WHERE invite_code = ?',
    [inviteCode],
  );
  assert.equal(clearedInviteRow, null, 'accepted private invite should be cleared after match creation');

  await withServer(async () => {
    expiredInviteUserA = await registerUser('live_invite_expired_restart_a');
    expiredInviteUserB = await registerUser('live_invite_expired_restart_b');

    const createdExpiredInvite = await request('/api/pvp/live/invites', {
      method: 'POST',
      token: expiredInviteUserA.token,
      body: {
        displayName: '过甲',
        loadout: makeLoadout('expired-invite-sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
      },
    });
    assert.equal(createdExpiredInvite.status, 200, 'pre-restart expiring private invite creation should be accepted');
    assert.equal(createdExpiredInvite.payload.status, 'waiting_invite', 'pre-restart expiring private invite should wait');
    expiredInviteCode = createdExpiredInvite.payload.inviteCode;
    assert.ok(expiredInviteCode, 'pre-restart expiring private invite should expose invite code');
  });

  await dbRun(
    'UPDATE pvp_live_invites SET created_at = ? WHERE invite_code = ?',
    [Date.now() - (16 * 60 * 1000), expiredInviteCode],
  );

  await withServer(async () => {
    const joinedExpiredInvite = await request(`/api/pvp/live/invites/${encodeURIComponent(expiredInviteCode)}/join`, {
      method: 'POST',
      token: expiredInviteUserB.token,
      body: {
        displayName: '过乙',
        loadout: makeLoadout('expired-invite-shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
      },
    });
    assert.equal(joinedExpiredInvite.status, 404, 'expired persisted private invite should not be joinable after restart');
    assert.equal(joinedExpiredInvite.payload.reason, 'invite_expired', 'expired persisted private invite should expose stable expiry reason');
  });

  const clearedExpiredInviteRow = await dbGet(
    'SELECT invite_code FROM pvp_live_invites WHERE invite_code = ?',
    [expiredInviteCode],
  );
  assert.equal(clearedExpiredInviteRow, null, 'expired persisted private invite should be cleared after rejected join');

  await withServer(async () => {
    eventSourceUserA = await registerUser('live_event_source_a');
    eventSourceUserB = await registerUser('live_event_source_b');

    const joinA = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: eventSourceUserA.token,
      body: {
        displayName: '源甲',
        loadout: makeLoadout('event-source-sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']),
      },
    });
    assert.equal(joinA.payload.status, 'waiting', 'first event source persistence user should wait');

    const joinB = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: eventSourceUserB.token,
      body: {
        displayName: '源乙',
        loadout: makeLoadout('event-source-shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']),
      },
    });
    assert.equal(joinB.payload.status, 'matched', 'second event source persistence user should match');
    eventSourceMatchId = joinB.payload.matchId;

    const pollA = await request(`/api/pvp/live/queue/status/${encodeURIComponent(joinA.payload.queueTicket)}`, {
      token: eventSourceUserA.token,
    });
    assert.equal(pollA.payload.status, 'matched', 'first event source persistence user should receive match');
    const ready = await readyBoth({
      matchId: eventSourceMatchId,
      tokenA: eventSourceUserA.token,
      tokenB: eventSourceUserB.token,
      stateVersionA: pollA.payload.stateView.stateVersion,
      prefix: 'persist-event-source',
    });
    const surrenderB = await submitIntent(eventSourceMatchId, eventSourceUserB.token, {
      intentId: 'persist-event-source-surrender-b-1',
      intentType: 'surrender',
      stateVersion: ready.payload.stateView.stateVersion,
      payload: { reason: 'event_source_replay_recovery' },
    });
    assert.equal(surrenderB.payload.result, 'accepted', 'event source replay recovery match should finish normally');
  });

  const eventSourceCountRow = await dbGet(
    'SELECT COUNT(*) AS count FROM pvp_live_match_events WHERE match_id = ?',
    [eventSourceMatchId],
  );
  assert.ok(
    eventSourceCountRow && eventSourceCountRow.count >= 4,
    'event table should persist public replay source events',
  );
  const eventSourceMatchRow = await dbGet('SELECT state_json FROM pvp_live_matches WHERE match_id = ?', [eventSourceMatchId]);
  assert.ok(eventSourceMatchRow && eventSourceMatchRow.state_json, 'event source replay match row should exist before corruption');
  const corruptedEventSourceState = JSON.parse(eventSourceMatchRow.state_json);
  corruptedEventSourceState.events = [];
  await dbRun(
    'UPDATE pvp_live_matches SET state_json = ? WHERE match_id = ?',
    [JSON.stringify(corruptedEventSourceState), eventSourceMatchId],
  );

  await withServer(async () => {
    const recoveredPublicReplay = await request(`/api/pvp/live/matches/${encodeURIComponent(eventSourceMatchId)}/replay?visibility=replay_public`, {
      token: eventSourceUserA.token,
    });
    assert.equal(
      recoveredPublicReplay.status,
      200,
      'replay should recover public timeline from persisted event table when state events are corrupted',
    );
    const recoveredEvents = recoveredPublicReplay.payload.replay && recoveredPublicReplay.payload.replay.events || [];
    assert.ok(
      recoveredEvents.some(event => event.eventType === 'battle_started'),
      'event table replay recovery should include battle_started',
    );
    assert.ok(
      recoveredEvents.some(event => event.eventType === 'match_finished'),
      'event table replay recovery should include match_finished',
    );
    assert.equal(
      recoveredPublicReplay.payload.replay.hiddenScan?.forbiddenTokenCount,
      0,
      'event table replay recovery should keep hidden scan clean',
    );
  });

  let invalidatedUserA;
  let invalidatedUserB;
  let invalidatedMatchId;

  await withServer(async () => {
    invalidatedUserA = await registerUser('live_invalidated_a');
    invalidatedUserB = await registerUser('live_invalidated_b');

    const joinA = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: invalidatedUserA.token,
      body: { displayName: '丙' },
    });
    assert.equal(joinA.payload.status, 'waiting', 'first invalidated persistence user should wait');

    const joinB = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: invalidatedUserB.token,
      body: { displayName: '丁' },
    });
    assert.equal(joinB.payload.status, 'matched', 'second invalidated persistence user should match');
    invalidatedMatchId = joinB.payload.matchId;

    await new Promise(resolve => setTimeout(resolve, 1150));
    const invalidatedRead = await request('/api/pvp/live/matches/current', {
      token: invalidatedUserA.token,
    });
    assert.equal(invalidatedRead.status, 200, 'setup timeout should return invalidated snapshot before release');
    assert.equal(invalidatedRead.payload.stateView.status, 'invalidated', 'setup timeout should persist invalidated status');
  });

  await withServer(async () => {
    const currentInvalidated = await request('/api/pvp/live/matches/current', {
      token: invalidatedUserA.token,
    });
    assert.equal(currentInvalidated.status, 404, 'restarted server should not recover invalidated setup timeout as current live match');

    const rejoinInvalidated = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: invalidatedUserA.token,
      body: { displayName: '丙' },
    });
    assert.equal(rejoinInvalidated.status, 200, 'invalidated user should be able to queue after restart');
    assert.equal(rejoinInvalidated.payload.status, 'waiting', 'restarted invalidated match should not block fresh queue');
    assert.notEqual(rejoinInvalidated.payload.matchId, invalidatedMatchId, 'restarted queue should not return old invalidated match id');
  });

  console.log('sanity_pvp_live_persistence_checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
