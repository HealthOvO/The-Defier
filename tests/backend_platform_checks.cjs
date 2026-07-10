const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();

const PORT = Number(process.env.BACKEND_PLATFORM_TEST_PORT || 9022);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.BACKEND_PLATFORM_DB_PATH
  || path.join(os.tmpdir(), `the-defier-backend-platform-${process.pid}.sqlite`);
const JWT_SECRET = 'platform-jwt-secret-32-characters';
const HMAC_SECRET = 'platform-hmac-secret-32-characters';

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: options.method || 'GET',
    headers: options.headers || undefined
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (error) {
    payload = null;
  }
  return { status: res.status, ok: res.ok, headers: res.headers, payload };
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get(sql, params, (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function startServer() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: 'platform-test-sha'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk.toString());
  child.stderr.on('data', chunk => output += chunk.toString());
  return { child, getOutput: () => output };
}

async function stopServer(server) {
  if (!server || server.child.killed || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 2000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await request('/health');
      if (res.status === 200 && res.payload?.status === 'ok') return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`backend health check timed out\n${server.getOutput()}`);
}

async function main() {
  removeDbFiles();
  const server = startServer();
  try {
    await waitForHealth(server);

    const version = await request('/api/version');
    assert.strictEqual(version.status, 200, `/api/version should return 200: ${JSON.stringify(version.payload)}`);
    assert.strictEqual(version.payload?.status, 'ok', '/api/version should expose status=ok');
    assert.strictEqual(version.payload?.service, 'the-defier-backend', '/api/version should identify backend service');
    assert.match(version.payload?.appVersion || '', /^\d+\.\d+\.\d+$/, '/api/version should expose app package version');
    assert.match(version.payload?.serverVersion || '', /^\d+\.\d+\.\d+$/, '/api/version should expose server package version');
    assert.strictEqual(version.payload?.gitSha, 'platform-test-sha', '/api/version should prefer deployment git sha env');
    assert.match(version.payload?.packageLockDigest || '', /^[a-f0-9]{16,64}$/, '/api/version should expose root lockfile digest');
    assert.match(version.payload?.serverPackageLockDigest || '', /^[a-f0-9]{16,64}$/, '/api/version should expose server lockfile digest');
    assert.strictEqual(version.payload?.schema?.version, 4, '/api/version should expose schema version');
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0004_cloud_state_v2', '/api/version should expose current migration id');
    assert.ok(Array.isArray(version.payload?.schema?.appliedMigrations), '/api/version should expose applied migration list');
    assert.ok(
      version.payload.schema.appliedMigrations.some(item => item.id === '0001_startup_schema' && Number(item.appliedAt) > 0),
      '/api/version should include applied startup schema migration'
    );
    assert.ok(
      version.payload.schema.appliedMigrations.some(item => item.id === '0002_progression_platform' && Number(item.appliedAt) > 0),
      '/api/version should include applied progression schema migration'
    );
    assert.ok(
      version.payload.schema.appliedMigrations.some(item => item.id === '0003_verified_runs' && Number(item.appliedAt) > 0),
      '/api/version should include applied verified run schema migration'
    );
    assert.ok(
      version.payload.schema.appliedMigrations.some(item => item.id === '0004_cloud_state_v2' && Number(item.appliedAt) > 0),
      '/api/version should include applied cloud state schema migration'
    );
    const rootVersion = await request('/version');
    assert.strictEqual(rootVersion.status, 200, `/version should return 200: ${JSON.stringify(rootVersion.payload)}`);
    assert.deepStrictEqual(rootVersion.payload?.schema, version.payload.schema, '/version and /api/version should share schema payload');

    const requestId = 'platform-check-request-id';
    const health = await request('/api/health', { headers: { 'X-Request-Id': requestId } });
    assert.strictEqual(health.status, 200, `/api/health should return 200: ${JSON.stringify(health.payload)}`);
    assert.strictEqual(health.headers.get('x-request-id'), requestId, '/api/health should echo safe request id header');
    assert.strictEqual(health.payload?.status, 'ok', '/api/health should keep status=ok');
    assert.strictEqual(health.payload?.message, 'The Defier Backend is running', '/api/health should preserve existing health message');
    assert.strictEqual(health.payload?.checks?.database, 'ok', '/api/health should report database status');
    assert.strictEqual(health.payload?.schema?.currentMigrationId, '0004_cloud_state_v2', '/api/health should expose current schema migration');
    assert.strictEqual(health.payload?.version?.gitSha, 'platform-test-sha', '/api/health should include runtime version summary');
    const healthJson = JSON.stringify(health.payload);
    assert(!healthJson.includes(JWT_SECRET), '/api/health must not leak JWT secret');
    assert(!healthJson.includes(HMAC_SECRET), '/api/health must not leak HMAC secret');

    const migration = await dbGet('SELECT id, version, checksum, applied_at FROM schema_migrations WHERE id = ?', ['0001_startup_schema']);
    assert.strictEqual(migration?.id, '0001_startup_schema', 'schema_migrations should record startup schema migration');
    assert.strictEqual(Number(migration?.version), 1, 'schema_migrations should record schema version');
    assert.match(migration?.checksum || '', /^[a-f0-9]{16,64}$/, 'schema_migrations should record stable checksum');
    assert(Number(migration?.applied_at) > 0, 'schema_migrations should record applied timestamp');
    const migrationCount = await dbGet('SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?', ['0001_startup_schema']);
    assert.strictEqual(Number(migrationCount?.count), 1, 'schema_migrations should keep one row per migration id');
    const progressionMigration = await dbGet('SELECT id, version, checksum, applied_at FROM schema_migrations WHERE id = ?', ['0002_progression_platform']);
    assert.strictEqual(progressionMigration?.id, '0002_progression_platform', 'schema_migrations should record progression migration');
    assert.strictEqual(Number(progressionMigration?.version), 2, 'progression migration should record schema version 2');
    assert.match(progressionMigration?.checksum || '', /^[a-f0-9]{16,64}$/, 'progression migration should record stable checksum');
    assert(Number(progressionMigration?.applied_at) > 0, 'progression migration should record applied timestamp');
    const verifiedRunMigration = await dbGet('SELECT id, version, checksum, applied_at FROM schema_migrations WHERE id = ?', ['0003_verified_runs']);
    assert.strictEqual(verifiedRunMigration?.id, '0003_verified_runs', 'schema_migrations should record verified run migration');
    assert.strictEqual(Number(verifiedRunMigration?.version), 3, 'verified run migration should record schema version 3');
    assert.match(verifiedRunMigration?.checksum || '', /^[a-f0-9]{16,64}$/, 'verified run migration should record stable checksum');
    assert(Number(verifiedRunMigration?.applied_at) > 0, 'verified run migration should record applied timestamp');
    const cloudStateMigration = await dbGet('SELECT id, version, checksum, applied_at FROM schema_migrations WHERE id = ?', ['0004_cloud_state_v2']);
    assert.strictEqual(cloudStateMigration?.id, '0004_cloud_state_v2', 'schema_migrations should record cloud state migration');
    assert.strictEqual(Number(cloudStateMigration?.version), 4, 'cloud state migration should record schema version 4');
    assert.match(cloudStateMigration?.checksum || '', /^[a-f0-9]{16,64}$/, 'cloud state migration should record stable checksum');
    assert(Number(cloudStateMigration?.applied_at) > 0, 'cloud state migration should record applied timestamp');

    console.log('Backend platform checks passed.');
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
