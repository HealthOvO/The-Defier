const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { stableStringify } = require('../server/progression/authoritative-runs/canonical');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.RELAY_EXPEDITION_MIGRATION_TEST_PORT || 9066);
const DB_PATH = process.env.RELAY_EXPEDITION_MIGRATION_DB_PATH
  || path.join(os.tmpdir(), `the-defier-relay-expedition-migration-${process.pid}.sqlite`);
const JWT_SECRET = 'relay-expedition-migration-jwt-secret-32chars';
const HMAC_SECRET = 'relay-expedition-migration-hmac-secret-32chars';
const SEED_SECRET = 'relay-expedition-migration-seed-secret-32chars';

process.env.DEFIER_DB_PATH = DB_PATH;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DEFIER_HMAC_SECRET = HMAC_SECRET;
process.env.DEFIER_WORLD_RIFT_SEED_SECRET = SEED_SECRET;
process.env.DEFIER_RELAY_EXPEDITION_SEED_SECRET = SEED_SECRET;

function resolveSqlite3() {
  for (const candidate of [
    'sqlite3',
    path.join(ROOT, 'node_modules', 'sqlite3'),
    path.join(ROOT, 'server', 'node_modules', 'sqlite3'),
    path.resolve(ROOT, '..', 'The-Defier', 'node_modules', 'sqlite3'),
    path.resolve(ROOT, '..', 'The-Defier', 'server', 'node_modules', 'sqlite3')
  ]) {
    try {
      return require(candidate).verbose();
    } catch (error) {}
  }
  throw new Error('sqlite3 module is not available in this worktree');
}

const sqlite3 = resolveSqlite3();

function removeDbFiles(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function dbGet(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.get(sql, params, (error, row) => {
      db.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbAll(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.all(sql, params, (error, rows) => {
      db.close();
      if (error) reject(error);
      else resolve(rows || []);
    });
  });
}

function dbRun(dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.run(sql, params, function onRun(error) {
      const result = { changes: Number(this && this.changes || 0) };
      db.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

async function insertRelayRotationSnapshot(dbPath, snapshot, now) {
  await dbRun(
    dbPath,
    `INSERT INTO relay_expedition_rotations (
        rotation_id, protocol_version, catalog_version, rule_version, catalog_hash,
        title, description, starts_at, ends_at, grace_ends_at, claim_ends_at,
        leg_count, priority_window_ms, open_claim_window_ms, active_lease_ms,
        tactics_json, score_formula_json, milestones_json, snapshot_hash, snapshot_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      snapshot.rotationId,
      snapshot.protocolVersion,
      snapshot.catalogVersion,
      snapshot.rotationRuleVersion,
      snapshot.catalogHash,
      snapshot.title,
      snapshot.description,
      snapshot.startsAt,
      snapshot.endsAt,
      snapshot.graceEndsAt,
      snapshot.claimEndsAt,
      snapshot.legCount,
      snapshot.priorityWindowMs,
      snapshot.openClaimWindowMs,
      snapshot.activeLeaseMs,
      stableStringify(snapshot.tactics),
      stableStringify(snapshot.scoreFormula),
      stableStringify(snapshot.milestones),
      snapshot.snapshotHash,
      stableStringify(snapshot),
      now
    ]
  );
}

function startServer({ port, dbPath, gitSha = `relay-expedition-migration-${port}` }) {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_WORLD_RIFT_SEED_SECRET: SEED_SECRET,
      DEFIER_RELAY_EXPEDITION_SEED_SECRET: SEED_SECRET,
      DEFIER_DB_PATH: dbPath,
      DEFIER_GIT_SHA: gitSha
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    output += chunk.toString();
  });
  return { child, getOutput: () => output, port };
}

function stopServer(server) {
  return new Promise(resolve => {
    if (!server || !server.child || server.child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      server.child.kill('SIGKILL');
      resolve();
    }, 3000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    server.child.kill('SIGTERM');
  });
}

async function request(port, pathname) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`);
  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {}
  return { status: response.status, payload };
}

async function waitForHealth(server, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`${label} exited before health check\n${server.getOutput()}`);
    }
    try {
      const health = await request(server.port, '/api/health');
      if (health.status === 200 && health.payload?.status === 'ok') return;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${label} timed out\n${server.getOutput()}`);
}

async function assertRelayTablesExist(dbPath) {
  const tables = [
    'relay_expedition_rotations',
    'relay_expedition_sessions',
    'relay_expedition_members',
    'relay_expedition_legs',
    'relay_expedition_reward_claims',
    'relay_expedition_mutations',
    'relay_expedition_ops_events',
    'relay_expedition_ops_counters'
  ];
  for (const table of tables) {
    const row = await dbGet(
      dbPath,
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [table]
    );
    assert.strictEqual(row?.name, table, `schema should create ${table}`);
  }
}

async function seedLegacyRows(dbPath) {
  const now = Date.now();
  await dbRun(
    dbPath,
    `INSERT INTO users (id, username, password_hash, created_at, global_updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['relay-migration-user-a', 'relay_migration_user_a', 'hash-a', now, now]
  );
  await dbRun(
    dbPath,
    `INSERT INTO users (id, username, password_hash, created_at, global_updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['relay-migration-user-b', 'relay_migration_user_b', 'hash-b', now + 1, now + 1]
  );
  await dbRun(
    dbPath,
    `INSERT INTO game_saves (user_id, slot_index, save_data, save_time)
     VALUES (?, ?, ?, ?)`,
    ['relay-migration-user-a', 0, JSON.stringify({ chapter: 7, deck: ['alpha', 'beta'] }), now + 2]
  );
  await dbRun(
    dbPath,
    `INSERT INTO pvp_ranks
        (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['relay-rank-a', 'relay-migration-user-a', 'relay_a', 1337, 12, 4, 2, 'gold', 's1', now + 3, now + 3]
  );
  const worldRiftRotation = await dbGet(
    dbPath,
    `SELECT rotation_id
     FROM world_rift_rotations
     WHERE starts_at <= ? AND ends_at > ?
     ORDER BY starts_at DESC
     LIMIT 1`,
    [now, now]
  );
  assert(worldRiftRotation?.rotation_id, 'world rift rotation must exist after bootstrap');
  await dbRun(
    dbPath,
    `INSERT INTO world_rift_squads
        (squad_id, rotation_id, leader_user_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    ['relay-migration-squad', worldRiftRotation.rotation_id, 'relay-migration-user-a', now + 4, now + 4]
  );
  for (const [seat, member] of [
    ['leader', 'relay-migration-user-a'],
    ['member', 'relay-migration-user-b']
  ]) {
    await dbRun(
      dbPath,
      `INSERT INTO world_rift_squad_members
          (squad_id, user_id, rotation_id, status, role, joined_at, left_at, locked_at,
           display_name_snapshot, profile_id_snapshot, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, 0, 0, ?, ?, ?)`,
      [
        'relay-migration-squad',
        member,
        worldRiftRotation.rotation_id,
        seat,
        now + 5,
        member === 'relay-migration-user-a' ? '迁移甲' : '迁移乙',
        `profile-${member}`,
        now + 5
      ]
    );
  }
  return { now, worldRiftRotationId: worldRiftRotation.rotation_id };
}

async function createRelaySessionFixture(now) {
  const { initDb } = require('../server/db/database');
  const { createRelayExpeditionSession, PROTOCOL_VERSION } = require('../server/relay-expedition/service');
  const { buildRotationSnapshot } = require('../server/relay-expedition/catalog');

  await initDb();
  const rotationId = buildRotationSnapshot(now).rotationId;
  const response = await createRelayExpeditionSession(
    'relay-migration-user-a',
    {
      protocolVersion: PROTOCOL_VERSION,
      rotationId,
      sourceSquadId: 'relay-migration-squad',
      clientSessionId: 'relay-migration-session-client-0001',
      mutationId: 'relay-migration-create-0001'
    },
    now
  );
  assert.strictEqual(response?.success, true);
  return response.session?.sessionId || response.currentSession?.sessionId;
}

async function main() {
  removeDbFiles(DB_PATH);

  let server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'relay-expedition-fresh-start' });
  try {
    await waitForHealth(server, 'fresh-start');
    const version = await request(PORT, '/api/version');
    assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
    assert.strictEqual(version.payload?.schema?.version, 12);
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0012_world_rift_campaign_directives');
    await assertRelayTablesExist(DB_PATH);
  } finally {
    await stopServer(server);
    server = null;
  }

  const {
    CATALOG_VERSION,
    LEGACY_V1_CATALOG_VERSION,
    LEGACY_V1_SETTLEMENT_GRACE_MS,
    ROTATION_RULE_VERSION,
    SETTLEMENT_GRACE_MS,
    WEEK_MS,
    buildLegacyV1RotationSnapshotForStart,
    buildRotationSnapshot
  } = require('../server/relay-expedition/catalog');
  assert.strictEqual(CATALOG_VERSION, 'relay-expedition-catalog-v2');
  assert.strictEqual(ROTATION_RULE_VERSION, 'relay-expedition-rotation-v2');
  assert.strictEqual(SETTLEMENT_GRACE_MS - LEGACY_V1_SETTLEMENT_GRACE_MS, 6 * 60 * 60 * 1000);
  const compatibilityNow = Date.now();
  const currentV2Snapshot = buildRotationSnapshot(compatibilityNow);
  const legacyCurrent = buildLegacyV1RotationSnapshotForStart(currentV2Snapshot.startsAt);
  const legacyPrevious = buildLegacyV1RotationSnapshotForStart(currentV2Snapshot.startsAt - WEEK_MS);
  await dbRun(DB_PATH, `DELETE FROM relay_expedition_rotations`);
  await insertRelayRotationSnapshot(DB_PATH, legacyPrevious, compatibilityNow);
  await insertRelayRotationSnapshot(DB_PATH, legacyCurrent, compatibilityNow);

  server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'relay-expedition-v1-rotation-compat' });
  try {
    await waitForHealth(server, 'v1-rotation-compat');
    const preservedLegacyRows = await dbAll(
      DB_PATH,
      `SELECT catalog_version, rule_version, snapshot_hash FROM relay_expedition_rotations ORDER BY starts_at DESC`
    );
    assert.strictEqual(preservedLegacyRows.length, 2);
    assert(preservedLegacyRows.every(row => row.catalog_version === LEGACY_V1_CATALOG_VERSION));
    assert(preservedLegacyRows.every(row => row.rule_version === 'relay-expedition-rotation-v1'));
    assert.strictEqual(preservedLegacyRows[0].snapshot_hash, legacyCurrent.snapshotHash, 'known v1 rotation must remain byte-for-byte frozen');
  } finally {
    await stopServer(server);
    server = null;
  }

  await dbRun(
    DB_PATH,
    `UPDATE relay_expedition_rotations SET claim_ends_at = claim_ends_at + 1 WHERE rotation_id = ?`,
    [legacyCurrent.rotationId]
  );
  const scalarTamperedConnection = new sqlite3.Database(DB_PATH);
  try {
    const { ROTATION_DRIFT_CODE, bootstrapRelayExpeditionSchema } = require('../server/relay-expedition/bootstrap');
    await assert.rejects(
      () => bootstrapRelayExpeditionSchema(scalarTamperedConnection, compatibilityNow),
      error => error && error.code === ROTATION_DRIFT_CODE,
      'rotation scalar columns must stay byte-for-byte aligned with the frozen snapshot'
    );
  } finally {
    await new Promise(resolve => scalarTamperedConnection.close(resolve));
  }
  await dbRun(
    DB_PATH,
    `UPDATE relay_expedition_rotations SET claim_ends_at = ? WHERE rotation_id = ?`,
    [legacyCurrent.claimEndsAt, legacyCurrent.rotationId]
  );

  await dbRun(
    DB_PATH,
    `UPDATE relay_expedition_rotations SET snapshot_hash = 'tampered-v1-snapshot' WHERE rotation_id = ?`,
    [legacyCurrent.rotationId]
  );
  const tamperedConnection = new sqlite3.Database(DB_PATH);
  try {
    const { ROTATION_DRIFT_CODE, bootstrapRelayExpeditionSchema } = require('../server/relay-expedition/bootstrap');
    await assert.rejects(
      () => bootstrapRelayExpeditionSchema(tamperedConnection, compatibilityNow),
      error => error && error.code === ROTATION_DRIFT_CODE,
      'unknown or tampered v1 rotation must still fail closed'
    );
  } finally {
    await new Promise(resolve => tamperedConnection.close(resolve));
  }

  const legacy = await seedLegacyRows(DB_PATH);

  for (const table of [
    'relay_expedition_ops_counters',
    'relay_expedition_ops_events',
    'relay_expedition_mutations',
    'relay_expedition_reward_claims',
    'relay_expedition_legs',
    'relay_expedition_members',
    'relay_expedition_sessions',
    'relay_expedition_rotations'
  ]) {
    await dbRun(DB_PATH, `DROP TABLE IF EXISTS ${table}`);
  }
  await dbRun(DB_PATH, `DELETE FROM schema_migrations WHERE id = '0010_relay_expedition'`);

  server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'relay-expedition-v9-to-v10' });
  try {
    await waitForHealth(server, 'v9-to-v10-restart');
    const version = await request(PORT, '/api/version');
    assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0012_world_rift_campaign_directives');
    await assertRelayTablesExist(DB_PATH);

    const preservedUser = await dbGet(
      DB_PATH,
      `SELECT username FROM users WHERE id = 'relay-migration-user-a'`
    );
    assert.strictEqual(preservedUser?.username, 'relay_migration_user_a', 'v9 to v10 must preserve users');

    const preservedSave = await dbGet(
      DB_PATH,
      `SELECT save_data FROM game_saves WHERE user_id = ? AND slot_index = 0`,
      ['relay-migration-user-a']
    );
    assert.deepStrictEqual(JSON.parse(preservedSave?.save_data || '{}'), { chapter: 7, deck: ['alpha', 'beta'] });

    const preservedRank = await dbGet(
      DB_PATH,
      `SELECT score, wins, losses FROM pvp_ranks WHERE user_id = ?`,
      ['relay-migration-user-a']
    );
    assert.deepStrictEqual(
      { score: Number(preservedRank?.score), wins: Number(preservedRank?.wins), losses: Number(preservedRank?.losses) },
      { score: 1337, wins: 12, losses: 4 },
      'v9 to v10 must preserve pvp data'
    );

    const preservedSquad = await dbGet(
      DB_PATH,
      `SELECT leader_user_id, rotation_id FROM world_rift_squads WHERE squad_id = ?`,
      ['relay-migration-squad']
    );
    assert.deepStrictEqual(
      preservedSquad,
      { leader_user_id: 'relay-migration-user-a', rotation_id: legacy.worldRiftRotationId },
      'v9 to v10 must preserve world-rift squads'
    );
  } finally {
    await stopServer(server);
    server = null;
  }

  const sessionId = await createRelaySessionFixture(legacy.now + 10_000);
  assert(sessionId, 'relay fixture session should be created after upgrade');

  server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'relay-expedition-repeat-start-a' });
  try {
    await waitForHealth(server, 'repeat-start-a');
    const sessionRow = await dbGet(
      DB_PATH,
      `SELECT session_id, current_leg_index, status FROM relay_expedition_sessions WHERE session_id = ?`,
      [sessionId]
    );
    assert.deepStrictEqual(
      sessionRow,
      { session_id: sessionId, current_leg_index: 1, status: 'active' },
      'repeat startup must preserve existing relay sessions'
    );
  } finally {
    await stopServer(server);
    server = null;
  }

  server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'relay-expedition-repeat-start-b' });
  try {
    await waitForHealth(server, 'repeat-start-b');
    const migrationCount = await dbGet(
      DB_PATH,
      `SELECT COUNT(*) AS count FROM schema_migrations WHERE id = '0010_relay_expedition'`
    );
    assert.strictEqual(Number(migrationCount?.count), 1, 'repeat startup must keep one 0010 migration row');

    const legCount = await dbGet(
      DB_PATH,
      `SELECT COUNT(*) AS count FROM relay_expedition_legs WHERE session_id = ?`,
      [sessionId]
    );
    assert.strictEqual(Number(legCount?.count), 4, 'repeat startup must preserve relay legs');

    const rotationRows = await dbAll(
      DB_PATH,
      `SELECT rotation_id FROM relay_expedition_rotations ORDER BY starts_at DESC`
    );
    assert(rotationRows.length >= 2, 'relay bootstrap should keep previous and current rotation rows');
  } finally {
    await stopServer(server);
    server = null;
    removeDbFiles(DB_PATH);
  }

  console.log('Relay expedition migration checks passed.');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
