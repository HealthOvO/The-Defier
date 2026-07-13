const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();
const { bootstrapCloudStateSchema } = require('../server/cloud-state/bootstrap');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.CLOUD_STATE_V2_TEST_PORT || 9044);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.CLOUD_STATE_V2_DB_PATH
  || path.join(os.tmpdir(), `the-defier-cloud-state-v2-${process.pid}.sqlite`);
const JWT_SECRET = 'cloud-state-v2-jwt-secret-32-characters';
const HMAC_SECRET = 'cloud-state-v2-hmac-secret-32-characters';
const OPS_TOKEN = 'cloud-state-v2-ops-token-32-characters';
const PROTOCOL_VERSION = 'cloud-state-v2';
const LEGACY_USER_ID = 'legacy-user-a';
const LEGACY_SLOT_TIME = 1710000000111;
const LEGACY_GLOBAL_TIME = 1710000000222;
const LEGACY_SLOT_BLOB = 's'.repeat(270 * 1024);
const LEGACY_GLOBAL_BLOB = 'g'.repeat(140 * 1024);

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(sql, params, function onRun(error) {
      const result = { changes: this && this.changes || 0 };
      db.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get(sql, params, (error, row) => {
      db.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(sql, params, (error, rows) => {
      db.close();
      if (error) reject(error);
      else resolve(rows || []);
    });
  });
}

function closeDatabase(db) {
  return new Promise(resolve => db.close(() => resolve()));
}

async function bootstrapLegacyConcurrently() {
  const runBootstrap = async () => {
    const db = new sqlite3.Database(DB_PATH);
    db.configure('busyTimeout', 5000);
    try {
      await bootstrapCloudStateSchema(db);
    } finally {
      await closeDatabase(db);
    }
  };
  await Promise.all([runBootstrap(), runBootstrap()]);
}

async function seedLegacyDatabase() {
  await dbRun(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    global_data TEXT,
    created_at INTEGER NOT NULL,
    global_updated_at INTEGER DEFAULT 0
  )`);
  await dbRun(`CREATE TABLE game_saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    slot_index INTEGER NOT NULL,
    save_data TEXT NOT NULL,
    save_time INTEGER NOT NULL,
    UNIQUE(user_id, slot_index)
  )`);
  await dbRun(`CREATE TABLE schema_migrations (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    applied_at INTEGER NOT NULL
  )`);
  await dbRun(
    `INSERT INTO users (id, username, password_hash, global_data, created_at, global_updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      LEGACY_USER_ID,
      'legacy_user_a',
      'not-used',
      JSON.stringify({ marker: 'legacy-global-marker', updatedAt: LEGACY_GLOBAL_TIME, flag: true, blob: LEGACY_GLOBAL_BLOB }),
      LEGACY_GLOBAL_TIME - 5000,
      LEGACY_GLOBAL_TIME
    ]
  );
  await dbRun(
    `INSERT INTO game_saves (user_id, slot_index, save_data, save_time)
     VALUES (?, 2, ?, ?)`,
    [
      LEGACY_USER_ID,
      JSON.stringify({ marker: 'legacy-slot-marker', hp: 77, timestamp: LEGACY_SLOT_TIME, blob: LEGACY_SLOT_BLOB }),
      LEGACY_SLOT_TIME
    ]
  );
  for (const [id, version] of [['0001_startup_schema', 1], ['0002_progression_platform', 2], ['0003_verified_runs', 3]]) {
    await dbRun(
      `INSERT INTO schema_migrations (id, version, checksum, description, applied_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, version, `${id}-checksum`, id, LEGACY_SLOT_TIME]
    );
  }
}

function startServer() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: OPS_TOKEN,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: 'cloud-state-v2-test-sha'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk.toString());
  child.stderr.on('data', chunk => output += chunk.toString());
  return { child, getOutput: () => output };
}

function stopServer(server) {
  return new Promise(resolve => {
    if (!server || !server.child || server.child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      server.child.kill('SIGKILL');
      resolve();
    }, 2000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    server.child.kill('SIGTERM');
  });
}

async function request(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {}
  return { status: response.status, ok: response.ok, payload };
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await request('/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') return;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`cloud state v2 backend health timed out\n${server.getOutput()}`);
}

function signSessionPayload(payload, token, saltPrefix = 'sess') {
  const salt = `${saltPrefix}-${crypto.randomBytes(12).toString('hex')}`;
  const signature = crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
  return { salt, signature, signatureMode: 'session' };
}

function signHmacPayload(payload, saltPrefix = 'hmac') {
  const salt = `${saltPrefix}-${crypto.randomBytes(12).toString('hex')}`;
  const signature = crypto.createHmac('sha256', HMAC_SECRET)
    .update('v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
  return { salt, signature };
}

function signLegacySave(saveData, token, saltPrefix = 'legacy-save') {
  const salt = `${saltPrefix}-${crypto.randomBytes(12).toString('hex')}`;
  const payload = typeof saveData === 'string' ? saveData : JSON.stringify(saveData);
  const signature = crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(payload, 'utf8')
    .digest('hex');
  return { salt, signature, signatureMode: 'session' };
}

async function registerUser(prefix) {
  const username = `${String(prefix || 'cloud').slice(0, 8)}_${Date.now().toString(36)}_${Math.floor(Math.random() * 46656).toString(36)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(registered.status, 200, JSON.stringify(registered.payload));
  return {
    username,
    userId: registered.payload?.user?.objectId,
    token: registered.payload?.user?.sessionToken
  };
}

async function main() {
  removeDbFiles();
  await seedLegacyDatabase();
  await bootstrapLegacyConcurrently();

  const concurrentLegacyImports = await dbGet(
    `SELECT COUNT(*) AS count
     FROM cloud_state_revisions
     WHERE user_id = ? AND operation = 'legacy_import'`,
    [LEGACY_USER_ID]
  );
  assert.strictEqual(Number(concurrentLegacyImports?.count), 2, 'concurrent bootstrap should import each legacy scope once');
  const concurrentImportEvents = await dbGet(
    `SELECT COUNT(*) AS count
     FROM cloud_state_ops_events
     WHERE event_type = 'legacy_import'`
  );
  assert.strictEqual(Number(concurrentImportEvents?.count), 2, 'concurrent bootstrap should emit one event per imported scope');
  const concurrentImportCounter = await dbGet(
    `SELECT event_count AS count
     FROM cloud_state_ops_counters
     WHERE event_type = 'legacy_import'`
  );
  assert.strictEqual(Number(concurrentImportCounter?.count), 2, 'concurrent bootstrap should count each imported scope once');

  let server = startServer();
  try {
    await waitForHealth(server);

    const version = await request('/api/version');
    assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
    assert.strictEqual(version.payload?.schema?.version, 9, 'schema version should advance through account social v9');
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0009_account_social_coop');
    assert(version.payload?.schema?.appliedMigrations?.some(item => item.id === '0004_cloud_state_v2'), 'applied migrations should include v4');
    assert(version.payload?.schema?.appliedMigrations?.some(item => item.id === '0007_authoritative_challenge_ladder'), 'applied migrations should include v7');
    assert(version.payload?.schema?.appliedMigrations?.some(item => item.id === '0008_authoritative_world_rift'), 'applied migrations should include v8');
    assert(version.payload?.schema?.appliedMigrations?.some(item => item.id === '0009_account_social_coop'), 'applied migrations should include v9');

    const legacyHeads = await dbAll(
      `SELECT user_id, entity_key, head_revision_id
       FROM cloud_state_heads
       WHERE user_id = ?
       ORDER BY entity_key ASC`,
      [LEGACY_USER_ID]
    );
    assert.deepStrictEqual(
      legacyHeads.map(row => row.entity_key),
      ['global', 'slot:2'],
      `legacy rows should backfill one global head and one slot head: ${JSON.stringify(legacyHeads)}`
    );
    const legacyRevisions = await dbAll(
      `SELECT entity_key, revision_number, operation, content_hash, data_size_bytes
       FROM cloud_state_revisions
       WHERE user_id = ?
       ORDER BY entity_key ASC`,
      [LEGACY_USER_ID]
    );
    assert.strictEqual(legacyRevisions.length, 2, `legacy rows should backfill two revisions: ${JSON.stringify(legacyRevisions)}`);
    legacyRevisions.forEach(row => {
      assert.strictEqual(row.operation, 'legacy_import');
      assert.strictEqual(Number(row.revision_number), 1);
      assert.match(row.content_hash || '', /^[a-f0-9]{64}$/);
    });
    assert(
      Number(legacyRevisions.find(row => row.entity_key === 'slot:2')?.data_size_bytes) > 256 * 1024,
      'legacy slot imports must tolerate payloads above the new-write limit'
    );
    assert(
      Number(legacyRevisions.find(row => row.entity_key === 'global')?.data_size_bytes) > 128 * 1024,
      'legacy global imports must tolerate payloads above the new-write limit'
    );

    await stopServer(server);
    server = startServer();
    await waitForHealth(server);
    const legacyRevisionCount = await dbGet(
      `SELECT COUNT(*) AS count
       FROM cloud_state_revisions
       WHERE user_id = ?`,
      [LEGACY_USER_ID]
    );
    assert.strictEqual(Number(legacyRevisionCount?.count), 2, 'restart should not duplicate legacy backfill revisions');
    const legacyImportCounterAfterRestart = await dbGet(
      `SELECT event_count AS count
       FROM cloud_state_ops_counters
       WHERE event_type = 'legacy_import'`
    );
    assert.strictEqual(Number(legacyImportCounterAfterRestart?.count), 2, 'restart should not double-count legacy imports');

    const primary = await registerUser('cloud_state_primary');
    const secondary = await registerUser('cloud_state_secondary');

    const initialSlotPayload = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 0,
      baseRevisionId: null,
      mutationId: 'mut-slot-init-0001',
      saveData: { marker: 'slot-v2-initial', hp: 11 },
      saveTime: Date.now()
    };
    const tamperedSlot = await request('/api/saves', {
      method: 'POST',
      token: primary.token,
      body: {
        ...initialSlotPayload,
        saveData: { marker: 'slot-v2-tampered', hp: 12 },
        ...signSessionPayload(initialSlotPayload, primary.token, 'slot-tamper')
      }
    });
    assert.strictEqual(tamperedSlot.status, 403, `tampered signed payload should fail: ${JSON.stringify(tamperedSlot.payload)}`);

    const initialSlot = await request('/api/saves', {
      method: 'POST',
      token: primary.token,
      body: { ...initialSlotPayload, ...signSessionPayload(initialSlotPayload, primary.token, 'slot-init') }
    });
    assert.strictEqual(initialSlot.status, 200, JSON.stringify(initialSlot.payload));
    assert.strictEqual(initialSlot.payload?.revisionNumber, 1);
    const slotReadAfterInitial = await request('/api/saves', { token: primary.token });
    const slotZero = slotReadAfterInitial.payload?.data?.find(entry => entry.slotIndex === 0);
    assert.strictEqual(slotZero?.revisionId, initialSlot.payload?.revisionId, 'GET /api/saves should expose head metadata for slot');
    assert.strictEqual(slotZero?.saveData?.marker, 'slot-v2-initial');

    const raceBaseRevisionId = initialSlot.payload.revisionId;
    const racePayloadA = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 0,
      baseRevisionId: raceBaseRevisionId,
      mutationId: 'mut-slot-race-0002',
      saveData: { marker: 'slot-race-a', hp: 21 },
      saveTime: Date.now() + 10
    };
    const racePayloadB = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 0,
      baseRevisionId: raceBaseRevisionId,
      mutationId: 'mut-slot-race-0003',
      saveData: { marker: 'slot-race-b', hp: 22 },
      saveTime: Date.now() + 11
    };
    const [raceA, raceB] = await Promise.all([
      request('/api/saves', {
        method: 'POST',
        token: primary.token,
        body: { ...racePayloadA, ...signSessionPayload(racePayloadA, primary.token, 'race-a') }
      }),
      request('/api/saves', {
        method: 'POST',
        token: primary.token,
        body: { ...racePayloadB, ...signSessionPayload(racePayloadB, primary.token, 'race-b') }
      })
    ]);
    const winner = raceA.status === 200 ? raceA : raceB;
    const loser = raceA.status === 409 ? raceA : raceB;
    const winnerPayload = raceA.status === 200 ? racePayloadA : racePayloadB;
    assert.strictEqual(winner.status, 200, `one competing request should win: ${JSON.stringify({ raceA, raceB })}`);
    assert.strictEqual(loser.status, 409, `one competing request should conflict: ${JSON.stringify({ raceA, raceB })}`);
    assert.strictEqual(loser.payload?.reason, 'save_conflict');
    assert.strictEqual(loser.payload?.current?.revisionId, winner.payload?.revisionId, 'conflict should return current head revision');
    assert.strictEqual(loser.payload?.current?.saveData?.marker, winnerPayload.saveData.marker, 'conflict should return current head data');

    const replayWinner = await request('/api/saves', {
      method: 'POST',
      token: primary.token,
      body: { ...winnerPayload, ...signSessionPayload(winnerPayload, primary.token, 'race-winner-replay') }
    });
    assert.strictEqual(replayWinner.status, 200, JSON.stringify(replayWinner.payload));
    assert.deepStrictEqual(replayWinner.payload, winner.payload, 'same mutationId and same request should replay original receipt');

    const mutationReusePayload = {
      ...winnerPayload,
      saveData: { marker: 'slot-race-mutated', hp: 99 }
    };
    const mutationReuse = await request('/api/saves', {
      method: 'POST',
      token: primary.token,
      body: { ...mutationReusePayload, ...signSessionPayload(mutationReusePayload, primary.token, 'mutation-reuse') }
    });
    assert.strictEqual(mutationReuse.status, 409, JSON.stringify(mutationReuse.payload));
    assert.strictEqual(mutationReuse.payload?.reason, 'save_mutation_reused');

    const followupSlotPayload = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 0,
      baseRevisionId: winner.payload.revisionId,
      mutationId: 'mut-slot-followup-0004',
      saveData: { marker: 'slot-followup', hp: 31 },
      saveTime: Date.now() + 20
    };
    const followupSlot = await request('/api/saves', {
      method: 'POST',
      token: primary.token,
      body: { ...followupSlotPayload, ...signSessionPayload(followupSlotPayload, primary.token, 'slot-followup') }
    });
    assert.strictEqual(followupSlot.status, 200, JSON.stringify(followupSlot.payload));

    const slotHistoryBeforeRestore = await request('/api/saves/slots/0/history?limit=3', { token: primary.token });
    assert.strictEqual(slotHistoryBeforeRestore.status, 200, JSON.stringify(slotHistoryBeforeRestore.payload));
    assert.strictEqual(slotHistoryBeforeRestore.payload?.history?.length, 3);
    assert.strictEqual(slotHistoryBeforeRestore.payload?.headRevisionId, followupSlot.payload?.revisionId);
    assert.strictEqual(slotHistoryBeforeRestore.payload?.history?.[0]?.isHead, true);
    assert.strictEqual(slotHistoryBeforeRestore.payload?.history?.[1]?.isHead, false);
    assert.strictEqual(slotHistoryBeforeRestore.payload.history[0]?.revisionId, followupSlot.payload?.revisionId);
    assert.strictEqual(slotHistoryBeforeRestore.payload.history[2]?.revisionId, initialSlot.payload?.revisionId);
    assert.strictEqual('mutationId' in slotHistoryBeforeRestore.payload.history[0], false, 'history should not expose mutationId');
    assert.strictEqual('requestHash' in slotHistoryBeforeRestore.payload.history[0], false, 'history should not expose requestHash');

    const badHistoryLimit = await request('/api/saves/slots/0/history?limit=21', { token: primary.token });
    assert.strictEqual(badHistoryLimit.status, 400);
    assert.strictEqual(badHistoryLimit.payload?.reason, 'invalid_history_limit');

    const restoreSlotPayload = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 0,
      baseRevisionId: followupSlot.payload.revisionId,
      sourceRevisionId: initialSlot.payload.revisionId,
      mutationId: 'mut-slot-restore-0005'
    };
    const restoredSlot = await request('/api/saves/slots/0/restore', {
      method: 'POST',
      token: primary.token,
      body: { ...restoreSlotPayload, ...signSessionPayload(restoreSlotPayload, primary.token, 'slot-restore') }
    });
    assert.strictEqual(restoredSlot.status, 200, JSON.stringify(restoredSlot.payload));
    assert.strictEqual(restoredSlot.payload?.restoredFromRevisionId, initialSlot.payload?.revisionId);
    const slotHistoryAfterRestore = await request('/api/saves/slots/0/history?limit=4', { token: primary.token });
    assert.strictEqual(slotHistoryAfterRestore.payload?.history?.[0]?.operation, 'restore');
    assert.strictEqual(slotHistoryAfterRestore.payload?.history?.[0]?.sourceRevisionId, initialSlot.payload?.revisionId);
    const slotReadAfterRestore = await request('/api/saves', { token: primary.token });
    const restoredHead = slotReadAfterRestore.payload?.data?.find(entry => entry.slotIndex === 0);
    assert.strictEqual(restoredHead?.saveData?.marker, 'slot-v2-initial', `restore should move current head back to initial content: ${JSON.stringify(restoredHead)}`);
    assert(Number(restoredHead?.saveTime) > Number(initialSlot.payload?.saveTime || 0), 'restore should project a fresh canonical saveTime');
    assert.strictEqual(restoredHead?.saveData?.timestamp, restoredHead?.saveTime, 'restored slot projection timestamp should match canonical saveTime');

    const foreignRestorePayload = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 0,
      baseRevisionId: null,
      sourceRevisionId: initialSlot.payload.revisionId,
      mutationId: 'mut-slot-foreign-0006'
    };
    const foreignRestore = await request('/api/saves/slots/0/restore', {
      method: 'POST',
      token: secondary.token,
      body: { ...foreignRestorePayload, ...signSessionPayload(foreignRestorePayload, secondary.token, 'slot-foreign') }
    });
    assert.strictEqual(foreignRestore.status, 404, JSON.stringify(foreignRestore.payload));
    assert.strictEqual(foreignRestore.payload?.reason, 'save_revision_not_found');

    const initialGlobalPayload = {
      protocolVersion: PROTOCOL_VERSION,
      baseRevisionId: null,
      mutationId: 'mut-global-init-0001',
      globalData: { marker: 'global-v2-initial', flags: { alpha: true } },
      globalUpdatedAt: Date.now()
    };
    const initialGlobal = await request('/api/user/global', {
      method: 'POST',
      token: primary.token,
      body: { ...initialGlobalPayload, ...signHmacPayload(initialGlobalPayload, 'global-init') }
    });
    assert.strictEqual(initialGlobal.status, 200, JSON.stringify(initialGlobal.payload));
    const replayGlobal = await request('/api/user/global', {
      method: 'POST',
      token: primary.token,
      body: { ...initialGlobalPayload, ...signHmacPayload(initialGlobalPayload, 'global-replay') }
    });
    assert.deepStrictEqual(replayGlobal.payload, initialGlobal.payload, 'global mutation replay should return original receipt');

    const followupGlobalPayload = {
      protocolVersion: PROTOCOL_VERSION,
      baseRevisionId: initialGlobal.payload.revisionId,
      mutationId: 'mut-global-followup-0002',
      globalData: { marker: 'global-v2-followup', flags: { beta: true } },
      globalUpdatedAt: Date.now() + 5
    };
    const followupGlobal = await request('/api/user/global', {
      method: 'POST',
      token: primary.token,
      body: { ...followupGlobalPayload, ...signSessionPayload(followupGlobalPayload, primary.token, 'global-followup') }
    });
    assert.strictEqual(followupGlobal.status, 200, JSON.stringify(followupGlobal.payload));
    const globalHistory = await request('/api/user/global/history?limit=2', { token: primary.token });
    assert.strictEqual(globalHistory.status, 200, JSON.stringify(globalHistory.payload));
    assert.strictEqual(globalHistory.payload?.history?.length, 2);
    assert.strictEqual(globalHistory.payload?.headRevisionId, followupGlobal.payload?.revisionId);
    assert.strictEqual(globalHistory.payload?.history?.[0]?.isHead, true);
    assert.strictEqual('mutationId' in globalHistory.payload.history[0], false, 'global history should not expose mutationId');
    assert.strictEqual('requestHash' in globalHistory.payload.history[0], false, 'global history should not expose requestHash');
    const restoreGlobalPayload = {
      protocolVersion: PROTOCOL_VERSION,
      baseRevisionId: followupGlobal.payload.revisionId,
      sourceRevisionId: initialGlobal.payload.revisionId,
      mutationId: 'mut-global-restore-0003'
    };
    const restoredGlobal = await request('/api/user/global/restore', {
      method: 'POST',
      token: primary.token,
      body: { ...restoreGlobalPayload, ...signSessionPayload(restoreGlobalPayload, primary.token, 'global-restore') }
    });
    assert.strictEqual(restoredGlobal.status, 200, JSON.stringify(restoredGlobal.payload));
    const globalRead = await request('/api/user/global', { token: primary.token });
    assert.strictEqual(globalRead.payload?.data?.marker, 'global-v2-initial', `global restore should recover initial state: ${JSON.stringify(globalRead.payload)}`);
    assert.strictEqual(globalRead.payload?.revisionId, restoredGlobal.payload?.revisionId);
    assert(Number(globalRead.payload?.globalUpdatedAt) > Number(initialGlobal.payload?.globalUpdatedAt || 0), 'global restore should project a fresh canonical time');
    assert.strictEqual(globalRead.payload?.data?.updatedAt, globalRead.payload?.globalUpdatedAt, 'restored global updatedAt should match projection');

    const legacySlotSaveData = { marker: 'legacy-slot-write', hp: 45 };
    const legacySlotWrite = await request('/api/saves', {
      method: 'POST',
      token: secondary.token,
      body: {
        slotIndex: 1,
        saveData: legacySlotSaveData,
        saveTime: Date.now() + 30,
        ...signLegacySave(legacySlotSaveData, secondary.token, 'legacy-slot')
      }
    });
    assert.strictEqual(legacySlotWrite.status, 200, JSON.stringify(legacySlotWrite.payload));
    const legacyGlobalData = { marker: 'legacy-global-write', value: 7, updatedAt: Date.now() + 31 };
    const legacyGlobalWrite = await request('/api/user/global', {
      method: 'POST',
      token: secondary.token,
      body: {
        globalData: legacyGlobalData,
        globalUpdatedAt: legacyGlobalData.updatedAt,
        ...signLegacySave(legacyGlobalData, secondary.token, 'legacy-global')
      }
    });
    assert.strictEqual(legacyGlobalWrite.status, 200, JSON.stringify(legacyGlobalWrite.payload));
    const secondarySaves = await request('/api/saves', { token: secondary.token });
    const secondarySlot = secondarySaves.payload?.data?.find(entry => entry.slotIndex === 1);
    assert.strictEqual(secondarySlot?.revisionNumber, 1, 'legacy slot write should append its first revision');
    const secondaryGlobal = await request('/api/user/global', { token: secondary.token });
    assert.strictEqual(secondaryGlobal.payload?.revisionNumber, 1, 'legacy global write should append its first revision');

    let retainedHeadRevisionId = null;
    for (let index = 0; index < 25; index += 1) {
      const retainedPayload = {
        protocolVersion: PROTOCOL_VERSION,
        slotIndex: 3,
        baseRevisionId: retainedHeadRevisionId,
        mutationId: `mut-retention-${String(index).padStart(4, '0')}`,
        saveData: { marker: `retention-${index}` },
        saveTime: Date.now() + 100 + index
      };
      const retainedWrite = await request('/api/saves', {
        method: 'POST',
        token: secondary.token,
        body: { ...retainedPayload, ...signSessionPayload(retainedPayload, secondary.token, `retention-${index}`) }
      });
      assert.strictEqual(retainedWrite.status, 200, JSON.stringify(retainedWrite.payload));
      retainedHeadRevisionId = retainedWrite.payload?.revisionId;
      if (index === 0) {
        await dbRun(
          `UPDATE cloud_state_mutations SET created_at = 1 WHERE user_id = ? AND mutation_id = ?`,
          [secondary.userId, retainedPayload.mutationId]
        );
        await dbRun(
          `UPDATE cloud_state_ops_events
           SET created_at = 1
           WHERE id = (SELECT MIN(id) FROM cloud_state_ops_events)`
        );
      }
    }
    const retainedRevisionCount = await dbGet(
      `SELECT COUNT(*) AS count
       FROM cloud_state_revisions
       WHERE user_id = ? AND entity_key = 'slot:3'`,
      [secondary.userId]
    );
    assert.strictEqual(Number(retainedRevisionCount?.count), 20, 'each scope should retain the latest 20 revisions');
    const retainedHistory = await request('/api/saves/slots/3/history?limit=20', { token: secondary.token });
    assert.strictEqual(retainedHistory.status, 200, JSON.stringify(retainedHistory.payload));
    assert.strictEqual(retainedHistory.payload?.history?.length, 20);
    assert.strictEqual(retainedHistory.payload?.history?.[0]?.revisionId, retainedHeadRevisionId);
    assert.strictEqual(retainedHistory.payload?.history?.[19]?.revisionNumber, 6);
    const expiredMutationCount = await dbGet(
      `SELECT COUNT(*) AS count FROM cloud_state_mutations WHERE created_at < ?`,
      [Date.now() - (30 * 24 * 60 * 60 * 1000)]
    );
    assert.strictEqual(Number(expiredMutationCount?.count), 0, 'expired mutation receipts should be pruned');
    const expiredOpsEventCount = await dbGet(
      `SELECT COUNT(*) AS count FROM cloud_state_ops_events WHERE created_at < ?`,
      [Date.now() - (30 * 24 * 60 * 60 * 1000)]
    );
    assert.strictEqual(Number(expiredOpsEventCount?.count), 0, 'expired raw ops events should be pruned');

    const retainedSourceRevisionId = retainedHistory.payload?.history?.[19]?.revisionId;
    const retentionRestorePayload = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 3,
      baseRevisionId: retainedHeadRevisionId,
      sourceRevisionId: retainedSourceRevisionId,
      mutationId: 'mut-retention-restore-0025'
    };
    const retentionRestore = await request('/api/saves/slots/3/restore', {
      method: 'POST',
      token: secondary.token,
      body: {
        ...retentionRestorePayload,
        ...signSessionPayload(retentionRestorePayload, secondary.token, 'retention-restore')
      }
    });
    assert.strictEqual(retentionRestore.status, 200, JSON.stringify(retentionRestore.payload));
    retainedHeadRevisionId = retentionRestore.payload?.revisionId;
    const retainedCountWithRestoreSource = await dbGet(
      `SELECT COUNT(*) AS count
       FROM cloud_state_revisions
       WHERE user_id = ? AND entity_key = 'slot:3'`,
      [secondary.userId]
    );
    assert.strictEqual(Number(retainedCountWithRestoreSource?.count), 21, 'a retained restore may keep one referenced source beyond the 20-revision window');
    const retainedSourceAfterRestore = await dbGet(
      `SELECT COUNT(*) AS count
       FROM cloud_state_revisions
       WHERE user_id = ? AND entity_key = 'slot:3' AND revision_id = ?`,
      [secondary.userId, retainedSourceRevisionId]
    );
    assert.strictEqual(Number(retainedSourceAfterRestore?.count), 1, 'restore should preserve its source while the restore revision remains in the window');

    for (let index = 25; index < 45; index += 1) {
      const retainedPayload = {
        protocolVersion: PROTOCOL_VERSION,
        slotIndex: 3,
        baseRevisionId: retainedHeadRevisionId,
        mutationId: `mut-retention-${String(index).padStart(4, '0')}`,
        saveData: { marker: `retention-${index}` },
        saveTime: Date.now() + 200 + index
      };
      const retainedWrite = await request('/api/saves', {
        method: 'POST',
        token: secondary.token,
        body: { ...retainedPayload, ...signSessionPayload(retainedPayload, secondary.token, `retention-${index}`) }
      });
      assert.strictEqual(retainedWrite.status, 200, JSON.stringify(retainedWrite.payload));
      retainedHeadRevisionId = retainedWrite.payload?.revisionId;
    }
    const retainedCountAfterRestoreExpires = await dbGet(
      `SELECT COUNT(*) AS count
       FROM cloud_state_revisions
       WHERE user_id = ? AND entity_key = 'slot:3'`,
      [secondary.userId]
    );
    assert.strictEqual(Number(retainedCountAfterRestoreExpires?.count), 20, 'source revisions should be pruned after their restore revision leaves the retained window');
    const expiredRetainedSource = await dbGet(
      `SELECT COUNT(*) AS count
       FROM cloud_state_revisions
       WHERE user_id = ? AND entity_key = 'slot:3' AND revision_id = ?`,
      [secondary.userId, retainedSourceRevisionId]
    );
    assert.strictEqual(Number(expiredRetainedSource?.count), 0, 'unreferenced source revisions must not accumulate indefinitely');

    const bigSlotPayload = {
      protocolVersion: PROTOCOL_VERSION,
      slotIndex: 0,
      baseRevisionId: restoredSlot.payload.revisionId,
      mutationId: 'mut-slot-big-0007',
      saveData: { blob: 'x'.repeat(270 * 1024) },
      saveTime: Date.now() + 40
    };
    const bigSlot = await request('/api/saves', {
      method: 'POST',
      token: primary.token,
      body: { ...bigSlotPayload, ...signSessionPayload(bigSlotPayload, primary.token, 'slot-big') }
    });
    assert.strictEqual(bigSlot.status, 413, JSON.stringify(bigSlot.payload));
    assert.strictEqual(bigSlot.payload?.reason, 'save_payload_too_large');

    const bigGlobalPayload = {
      protocolVersion: PROTOCOL_VERSION,
      baseRevisionId: restoredGlobal.payload.revisionId,
      mutationId: 'mut-global-big-0004',
      globalData: { blob: 'y'.repeat(140 * 1024) },
      globalUpdatedAt: Date.now() + 41
    };
    const bigGlobal = await request('/api/user/global', {
      method: 'POST',
      token: primary.token,
      body: { ...bigGlobalPayload, ...signSessionPayload(bigGlobalPayload, primary.token, 'global-big') }
    });
    assert.strictEqual(bigGlobal.status, 413, JSON.stringify(bigGlobal.payload));
    assert.strictEqual(bigGlobal.payload?.reason, 'global_payload_too_large');

    const missingOps = await request('/api/saves/ops/overview');
    assert.strictEqual(missingOps.status, 404);
    const wrongOps = await request('/api/saves/ops/overview', {
      headers: { 'x-defier-ops-token': 'wrong-token' }
    });
    assert.strictEqual(wrongOps.status, 403);
    const opsOverview = await request('/api/saves/ops/overview', {
      headers: { 'x-defier-ops-token': OPS_TOKEN }
    });
    assert.strictEqual(opsOverview.status, 200, JSON.stringify(opsOverview.payload));
    assert.strictEqual(opsOverview.payload?.reportVersion, 'cloud-state-ops-overview-v1');
    assert.strictEqual(opsOverview.payload?.limits?.retainedRevisionWindowPerScope, 20);
    assert.strictEqual(opsOverview.payload?.limits?.maxRetainedRevisionsPerScope, 40);
    assert.strictEqual(opsOverview.payload?.limits?.mutationRetentionMs, 30 * 24 * 60 * 60 * 1000);
    assert.strictEqual(opsOverview.payload?.limits?.opsEventRetentionMs, 30 * 24 * 60 * 60 * 1000);
    assert(Number(opsOverview.payload?.activity?.acceptedWrites) >= 6, `ops should aggregate writes: ${JSON.stringify(opsOverview.payload)}`);
    assert(Number(opsOverview.payload?.activity?.restores) >= 2, `ops should aggregate restores: ${JSON.stringify(opsOverview.payload)}`);
    assert(Number(opsOverview.payload?.activity?.conflicts) >= 2, `ops should aggregate conflicts: ${JSON.stringify(opsOverview.payload)}`);
    assert(Number(opsOverview.payload?.activity?.idempotentReplays) >= 2, `ops should aggregate idempotent replays: ${JSON.stringify(opsOverview.payload)}`);
    const opsJson = JSON.stringify(opsOverview.payload);
    [
      LEGACY_USER_ID,
      primary.userId,
      secondary.userId,
      initialSlot.payload?.revisionId,
      initialSlot.payload?.contentHash,
      followupSlotPayload.mutationId,
      'slot-v2-initial',
      'global-v2-initial',
      'legacy-slot-marker'
    ].filter(Boolean).forEach(secret => {
      assert(!opsJson.includes(secret), `ops overview must not leak ${secret}`);
    });

    console.log('Cloud state V2 sanity checks passed.');
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
    removeDbFiles();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
