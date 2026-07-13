const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
function resolveSqlite3() {
  for (const candidate of [
    'sqlite3',
    path.join(ROOT, 'node_modules', 'sqlite3'),
    path.join(ROOT, 'server', 'node_modules', 'sqlite3')
  ]) {
    try {
      return require(candidate).verbose();
    } catch (error) {}
  }
  throw new Error('sqlite3 module is not available in this worktree');
}
const sqlite3 = resolveSqlite3();
const PORT = Number(process.env.AUTHORITATIVE_RUNS_MIGRATION_TEST_PORT || 9056);
const CONCURRENT_PORT_A = PORT + 1;
const CONCURRENT_PORT_B = PORT + 2;
const DB_PATH = process.env.AUTHORITATIVE_RUNS_MIGRATION_DB_PATH
  || path.join(os.tmpdir(), `the-defier-authoritative-runs-v2-${process.pid}.sqlite`);
const CONCURRENT_DB_PATH = process.env.AUTHORITATIVE_RUNS_MIGRATION_CONCURRENT_DB_PATH
  || path.join(os.tmpdir(), `the-defier-authoritative-runs-v2-concurrent-${process.pid}.sqlite`);
const JWT_SECRET = 'authoritative-runs-v2-jwt-secret-32-characters';
const HMAC_SECRET = 'authoritative-runs-v2-hmac-secret-32-characters';

function stableStringify(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

const FALLBACK_CATALOG_SNAPSHOT = {
  modes: {
    challenge: {
      rewardPool: ['focus', 'tempo'],
      routeChoices: 2,
      turnBudget: 10
    },
    expedition: {
      rewardPool: ['sustain', 'scout'],
      routeChoices: 2,
      sustainBias: 2
    },
    pve: {
      rewardPool: ['guard', 'draw'],
      routeChoices: 2,
      turnBudget: 12
    }
  },
  protocol: 'authoritative-run-v2',
  encounters: ['ember_knight', 'jade_colossus', 'storm_archon']
};
function loadRuntimeCatalog() {
  try {
    return require(path.join(ROOT, 'server', 'progression', 'authoritative-runs', 'catalog.js'));
  } catch (error) {
    return null;
  }
}
const RUNTIME_CATALOG = loadRuntimeCatalog();
const CATALOG_VERSION = String(RUNTIME_CATALOG?.CONTENT_VERSION || 'authoritative-trials-v2');
const CATALOG_JSON = String(RUNTIME_CATALOG?.CONTENT_JSON || stableStringify(FALLBACK_CATALOG_SNAPSHOT));
const CATALOG_HASH = String(RUNTIME_CATALOG?.CONTENT_HASH || digest(CATALOG_JSON));
const CATALOG_SNAPSHOT = JSON.parse(CATALOG_JSON);
const DRIFTED_CATALOG_HASH = '0'.repeat(64);
const LEGACY_CATALOG_VERSION = 'authoritative-trials-v1';
const LEGACY_CATALOG_HASH = digest('authoritative-trials-v1-immutable-fixture');
const LEGACY_CATALOG_JSON = JSON.stringify({
  protocolVersion: 'authoritative-run-v2',
  contentVersion: LEGACY_CATALOG_VERSION,
  fixture: 'pre-relay-catalog'
});

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
      const result = { changes: this && this.changes || 0 };
      db.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function buildServerBootstrapScript() {
  return `
    require('./server/app.js');
  `;
}

function startServer({
  port,
  dbPath,
  contentVersion = CATALOG_VERSION,
  contentHash = CATALOG_HASH,
  contentSnapshotJson = CATALOG_JSON,
  gitSha = `authoritative-runs-v2-${port}`
}) {
  const child = spawn(process.execPath, ['-e', buildServerBootstrapScript()], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_DB_PATH: dbPath,
      DEFIER_GIT_SHA: gitSha,
      DEFIER_AUTHORITATIVE_RUNS_CONTENT_VERSION: contentVersion,
      DEFIER_AUTHORITATIVE_RUNS_CONTENT_HASH: contentHash,
      DEFIER_AUTHORITATIVE_RUNS_CONTENT_SNAPSHOT_JSON: contentSnapshotJson
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk.toString());
  child.stderr.on('data', chunk => output += chunk.toString());
  return { child, getOutput: () => output, port, dbPath };
}

function stopServer(server) {
  return new Promise(resolve => {
    if (!server || !server.child || server.child.exitCode !== null) return resolve();
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

async function waitForHealth(server, label = `:${server.port}`) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`${label} exited before health check\n${server.getOutput()}`);
    }
    try {
      const response = await request(server.port, '/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') return;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${label} health check timed out\n${server.getOutput()}`);
}

async function waitForExit(server, expectedCode = 1) {
  const exitCode = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not exit\n${server.getOutput()}`)), 5000);
    if (server.child.exitCode !== null) {
      clearTimeout(timer);
      resolve(server.child.exitCode);
      return;
    }
    server.child.once('exit', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  assert.strictEqual(exitCode, expectedCode, `expected startup failure exit code ${expectedCode}, got ${exitCode}`);
}

async function expectUniqueConstraint(dbPath, sql, params, message) {
  try {
    await dbRun(dbPath, sql, params);
    assert.fail(message);
  } catch (error) {
    assert.match(String(error.message || error), /unique constraint/i, message);
  }
}

async function assertTablesExist(dbPath) {
  const tableNames = [
    'progression_authoritative_run_catalogs',
    'progression_authoritative_runs',
    'progression_authoritative_run_actions',
    'progression_authoritative_run_snapshots',
    'progression_authoritative_run_receipts',
    'progression_authoritative_run_ops_events',
    'progression_authoritative_run_ops_counters'
  ];
  for (const table of tableNames) {
    const row = await dbGet(
      dbPath,
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
      [table]
    );
    assert.strictEqual(row?.name, table, `schema should create ${table}`);
  }
}

async function main() {
  removeDbFiles(DB_PATH);
  removeDbFiles(CONCURRENT_DB_PATH);

  let server = startServer({ port: PORT, dbPath: DB_PATH });
  try {
    await waitForHealth(server, 'fresh-start');
    const version = await request(PORT, '/api/version');
    assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
    assert.strictEqual(version.payload?.schema?.version, 10);
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0010_relay_expedition');
    assert.deepStrictEqual(
      version.payload?.schema?.appliedMigrations?.map(entry => entry.id),
      [
        '0001_startup_schema',
        '0002_progression_platform',
        '0003_verified_runs',
        '0004_cloud_state_v2',
        '0005_season_ops_economy',
        '0006_authoritative_runs_v2',
        '0007_authoritative_challenge_ladder',
        '0008_authoritative_world_rift',
        '0009_account_social_coop',
        '0010_relay_expedition'
      ]
    );

    await assertTablesExist(DB_PATH);

    const catalogRow = await dbGet(
      DB_PATH,
      `SELECT content_version, protocol_version, content_hash, content_json
       FROM progression_authoritative_run_catalogs
       WHERE content_version = ?`,
      [CATALOG_VERSION]
    );
    assert.strictEqual(catalogRow?.content_version, CATALOG_VERSION, 'catalog bootstrap should insert the configured content version');
    assert.strictEqual(catalogRow?.protocol_version, 'authoritative-run-v2', 'catalog bootstrap should pin the protocol version');
    assert.strictEqual(catalogRow?.content_hash, CATALOG_HASH, 'catalog bootstrap should persist the configured content hash');
    assert.deepStrictEqual(JSON.parse(catalogRow?.content_json || '{}'), CATALOG_SNAPSHOT, 'catalog bootstrap should persist the immutable snapshot');
    const relayScenarios = JSON.parse(catalogRow?.content_json || '{}')?.scenarios || {};
    assert.strictEqual(relayScenarios.vanguard?.scenarioId, 'vanguard', 'catalog bootstrap should persist relay vanguard');
    assert.strictEqual(relayScenarios.bulwark?.scenarioId, 'bulwark', 'catalog bootstrap should persist relay bulwark');
    assert.strictEqual(relayScenarios.insight?.scenarioId, 'insight', 'catalog bootstrap should persist relay insight');
    await dbRun(
      DB_PATH,
      `INSERT INTO progression_authoritative_run_catalogs
          (content_version, protocol_version, content_hash, content_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [LEGACY_CATALOG_VERSION, 'authoritative-run-v2', LEGACY_CATALOG_HASH, LEGACY_CATALOG_JSON, Date.now()]
    );

    const migrationRow = await dbGet(
      DB_PATH,
      `SELECT id, version, checksum, applied_at
       FROM schema_migrations
       WHERE id = '0006_authoritative_runs_v2'`
    );
    assert.strictEqual(migrationRow?.id, '0006_authoritative_runs_v2');
    assert.strictEqual(Number(migrationRow?.version), 6);
    assert.match(migrationRow?.checksum || '', /^[a-f0-9]{16,64}$/);
    assert(Number(migrationRow?.applied_at) > 0);

    await dbRun(
      DB_PATH,
      `INSERT INTO users (id, username, password_hash, created_at, global_updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['migration-user-1', 'migration_user_1', 'hash', Date.now(), 0]
    );
    await dbRun(
      DB_PATH,
      `INSERT INTO progression_authoritative_runs (
          run_id, user_id, client_run_id, activity_mode, scenario_id, protocol_version,
          content_version, content_hash, status, state_version, action_count, state_json,
          state_hash, chain_head, started_at, expires_at, completed_at, settled_at,
          abandoned_at, last_action_at, recovery_count, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'ar-run-active-1',
        'migration-user-1',
        'client-run-active-1',
        'pve',
        'scenario-a',
        'authoritative-run-v2',
        CATALOG_VERSION,
        CATALOG_HASH,
        'active',
        1,
        0,
        '{"phase":"route"}',
        'state-hash-a',
        'chain-head-a',
        Date.now(),
        Date.now() + 60_000,
        0,
        0,
        0,
        0,
        0,
        Date.now()
      ]
    );
    await expectUniqueConstraint(
      DB_PATH,
      `INSERT INTO progression_authoritative_runs (
          run_id, user_id, client_run_id, activity_mode, scenario_id, protocol_version,
          content_version, content_hash, status, state_version, action_count, state_json,
          state_hash, chain_head, started_at, expires_at, completed_at, settled_at,
          abandoned_at, last_action_at, recovery_count, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'ar-run-active-2',
        'migration-user-1',
        'client-run-active-2',
        'pve',
        'scenario-b',
        'authoritative-run-v2',
        CATALOG_VERSION,
        CATALOG_HASH,
        'active',
        2,
        1,
        '{"phase":"route"}',
        'state-hash-b',
        'chain-head-b',
        Date.now(),
        Date.now() + 120_000,
        0,
        0,
        0,
        0,
        0,
        Date.now()
      ],
      'partial unique index should reject a second active run for the same account and mode'
    );
    await dbRun(
      DB_PATH,
      `INSERT INTO progression_authoritative_runs (
          run_id, user_id, client_run_id, activity_mode, scenario_id, protocol_version,
          content_version, content_hash, status, state_version, action_count, state_json,
          state_hash, chain_head, started_at, expires_at, completed_at, settled_at,
          abandoned_at, last_action_at, recovery_count, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'ar-run-terminal-1',
        'migration-user-1',
        'client-run-terminal-1',
        'pve',
        'scenario-terminal',
        'authoritative-run-v2',
        CATALOG_VERSION,
        CATALOG_HASH,
        'completed',
        8,
        7,
        '{"phase":"completed"}',
        'state-hash-terminal',
        'chain-head-terminal',
        Date.now() - 10_000,
        Date.now() - 1,
        Date.now() - 500,
        0,
        0,
        Date.now() - 500,
        0,
        Date.now()
      ]
    );

    await stopServer(server);
    server = null;

    for (const table of [
      'world_rift_ops_counters',
      'world_rift_ops_events',
      'world_rift_mutations',
      'world_rift_reward_claims',
      'world_rift_entries',
      'world_rift_contributions',
      'world_rift_attempts',
      'world_rift_states',
      'world_rift_rotations'
    ]) {
      await dbRun(DB_PATH, `DROP TABLE ${table}`);
    }
    await dbRun(DB_PATH, `DELETE FROM schema_migrations WHERE id = '0008_authoritative_world_rift'`);
    server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'authoritative-runs-v7-to-v8' });
    await waitForHealth(server, 'v7-to-v8-restart');
    const v7ToV8Version = await request(PORT, '/api/version');
    assert.strictEqual(v7ToV8Version.payload?.schema?.currentMigrationId, '0010_relay_expedition');
    const preservedRuns = await dbGet(
      DB_PATH,
      `SELECT COUNT(*) AS count
       FROM progression_authoritative_runs
       WHERE run_id IN ('ar-run-active-1', 'ar-run-terminal-1')`
    );
    assert.strictEqual(Number(preservedRuns?.count), 2, 'v7 to v8 restart must preserve live authoritative-run data while adding world-rift tables');
    const preservedLegacyCatalog = await dbGet(
      DB_PATH,
      `SELECT content_hash, content_json
       FROM progression_authoritative_run_catalogs
       WHERE content_version = ?`,
      [LEGACY_CATALOG_VERSION]
    );
    assert.deepStrictEqual(
      preservedLegacyCatalog,
      { content_hash: LEGACY_CATALOG_HASH, content_json: LEGACY_CATALOG_JSON },
      'v2 catalog bootstrap must preserve immutable v1 content for old-run replay'
    );
    const restoredWorldTable = await dbGet(
      DB_PATH,
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'world_rift_attempts'`
    );
    assert.strictEqual(restoredWorldTable?.name, 'world_rift_attempts', 'v7 to v8 restart must bootstrap world-rift storage');
    await stopServer(server);
    server = null;

    await dbRun(
      DB_PATH,
      `UPDATE progression_authoritative_run_catalogs
       SET content_hash = ?
       WHERE content_version = ?`,
      [DRIFTED_CATALOG_HASH, CATALOG_VERSION]
    );
    const driftedServer = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'authoritative-runs-v2-drift' });
    await waitForExit(driftedServer);
    assert.match(
      driftedServer.getOutput(),
      /AUTHORITATIVE_RUN_CATALOG_DRIFT|catalog drift detected/i,
      'catalog drift should fail closed during startup'
    );
    await dbRun(
      DB_PATH,
      `UPDATE progression_authoritative_run_catalogs
       SET protocol_version = ?, content_hash = ?, content_json = ?
       WHERE content_version = ?`,
      ['authoritative-run-v2', CATALOG_HASH, CATALOG_JSON, CATALOG_VERSION]
    );

    server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'authoritative-runs-v2-upgrade' });
    await waitForHealth(server, 'upgrade-start');

    await stopServer(server);
    server = null;

    for (const table of [
      'progression_authoritative_run_receipts',
      'progression_authoritative_run_snapshots',
      'progression_authoritative_run_actions',
      'progression_authoritative_run_ops_counters',
      'progression_authoritative_run_ops_events',
      'progression_authoritative_runs',
      'progression_authoritative_run_catalogs'
    ]) {
      await dbRun(DB_PATH, `DROP TABLE ${table}`);
    }
    await dbRun(DB_PATH, `DELETE FROM schema_migrations WHERE id = '0006_authoritative_runs_v2'`);

    server = startServer({ port: PORT, dbPath: DB_PATH, gitSha: 'authoritative-runs-v2-reapply' });
    await waitForHealth(server, 'upgrade-reapply');
    const upgraded = await request(PORT, '/api/version');
    assert.strictEqual(upgraded.payload?.schema?.currentMigrationId, '0010_relay_expedition');
    assert.deepStrictEqual(
      upgraded.payload?.schema?.appliedMigrations?.map(entry => entry.id),
      [
        '0001_startup_schema',
        '0002_progression_platform',
        '0003_verified_runs',
        '0004_cloud_state_v2',
        '0005_season_ops_economy',
        '0006_authoritative_runs_v2',
        '0007_authoritative_challenge_ladder',
        '0008_authoritative_world_rift',
        '0009_account_social_coop',
        '0010_relay_expedition'
      ],
      'reapplying authoritative runs should still converge on the full schema chain'
    );
    await assertTablesExist(DB_PATH);
    const migrationCount = await dbGet(
      DB_PATH,
      `SELECT COUNT(*) AS count
       FROM schema_migrations
       WHERE id = '0006_authoritative_runs_v2'`
    );
    assert.strictEqual(Number(migrationCount?.count), 1, 'migration row should stay single after reapply');
    const challengeLadderMigrationCount = await dbGet(
      DB_PATH,
      `SELECT COUNT(*) AS count
       FROM schema_migrations
       WHERE id = '0007_authoritative_challenge_ladder'`
    );
    assert.strictEqual(Number(challengeLadderMigrationCount?.count), 1, 'challenge ladder migration row should remain present after reapplying 0006');
    const worldRiftMigrationCount = await dbGet(
      DB_PATH,
      `SELECT COUNT(*) AS count
       FROM schema_migrations
       WHERE id = '0008_authoritative_world_rift'`
    );
    assert.strictEqual(Number(worldRiftMigrationCount?.count), 1, 'world rift migration row should remain present after reapplying 0006');

    await stopServer(server);
    server = null;

    const concurrentA = startServer({
      port: CONCURRENT_PORT_A,
      dbPath: CONCURRENT_DB_PATH,
      gitSha: 'authoritative-runs-v2-concurrent-a'
    });
    const concurrentB = startServer({
      port: CONCURRENT_PORT_B,
      dbPath: CONCURRENT_DB_PATH,
      gitSha: 'authoritative-runs-v2-concurrent-b'
    });
    try {
      await Promise.all([
        waitForHealth(concurrentA, 'concurrent-a'),
        waitForHealth(concurrentB, 'concurrent-b')
      ]);
      const concurrentCatalogCount = await dbGet(
        CONCURRENT_DB_PATH,
        `SELECT COUNT(*) AS count
         FROM progression_authoritative_run_catalogs
         WHERE content_version = ?`,
        [CATALOG_VERSION]
      );
      assert.strictEqual(Number(concurrentCatalogCount?.count), 1, 'concurrent startup should keep one immutable catalog row');
      const concurrentMigrationCount = await dbGet(
        CONCURRENT_DB_PATH,
        `SELECT COUNT(*) AS count
         FROM schema_migrations
         WHERE id = '0006_authoritative_runs_v2'`
      );
      assert.strictEqual(Number(concurrentMigrationCount?.count), 1, 'concurrent startup should keep one migration row');
      const concurrentChallengeLadderMigrationCount = await dbGet(
        CONCURRENT_DB_PATH,
        `SELECT COUNT(*) AS count
         FROM schema_migrations
         WHERE id = '0007_authoritative_challenge_ladder'`
      );
      assert.strictEqual(Number(concurrentChallengeLadderMigrationCount?.count), 1, 'concurrent startup should keep one challenge ladder migration row');
      const concurrentWorldRiftMigrationCount = await dbGet(
        CONCURRENT_DB_PATH,
        `SELECT COUNT(*) AS count
         FROM schema_migrations
         WHERE id = '0008_authoritative_world_rift'`
      );
      assert.strictEqual(Number(concurrentWorldRiftMigrationCount?.count), 1, 'concurrent startup should keep one world rift migration row');
      const concurrentIndices = await dbAll(
        CONCURRENT_DB_PATH,
        `SELECT name
         FROM sqlite_master
         WHERE type = 'index' AND name LIKE 'idx_progression_authoritative_%'
         ORDER BY name ASC`
      );
      assert(
        concurrentIndices.some(row => row.name === 'idx_progression_authoritative_runs_active_mode'),
        'concurrent startup should preserve the active-run partial unique index'
      );
    } finally {
      await stopServer(concurrentA);
      await stopServer(concurrentB);
    }

    console.log('Authoritative runs V2 migration checks passed.');
  } finally {
    await stopServer(server);
    removeDbFiles(DB_PATH);
    removeDbFiles(CONCURRENT_DB_PATH);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
