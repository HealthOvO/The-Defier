const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SHARED_NODE_MODULES = [
  path.join(ROOT, 'server', 'node_modules'),
  path.join(ROOT, 'node_modules'),
  path.resolve(ROOT, '..', 'The-Defier', 'server', 'node_modules'),
  path.resolve(ROOT, '..', 'The-Defier', 'node_modules'),
];

function resolveModule(name) {
  for (const candidate of [
    name,
    ...SHARED_NODE_MODULES.map(dir => path.join(dir, name)),
  ]) {
    try {
      return require(candidate);
    } catch (error) {}
  }
  throw new Error(`module not available: ${name}`);
}

const sqlite3 = resolveModule('sqlite3').verbose();
const bcrypt = resolveModule('bcrypt');
const jwt = resolveModule('jsonwebtoken');
const { generateToken } = require('../server/middleware/auth');

const PORT = Number(process.env.ACCOUNT_SECURITY_PLATFORM_TEST_PORT || 9071);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.ACCOUNT_SECURITY_PLATFORM_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-account-security-${process.pid}.sqlite`);
const JWT_SECRET = 'account-security-jwt-secret-32chars';
const HMAC_SECRET = 'account-security-hmac-secret-32';

process.env.JWT_SECRET = JWT_SECRET;

const EXPECTED_TABLES = [
  'auth_sessions',
  'auth_login_limits',
  'auth_security_mutations',
  'auth_security_events',
  'auth_security_counters',
  'social_profiles',
  'social_friend_requests',
  'social_friendships',
  'social_relationship_controls',
  'social_presence',
  'social_mutations',
  'social_ops_events',
  'social_ops_counters',
  'world_rift_squads',
  'world_rift_squad_members',
  'world_rift_squad_invites',
  'world_rift_squad_contributions',
  'world_rift_squad_entries',
  'world_rift_squad_reward_claims',
  'world_rift_squad_mutations',
];

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function openDb() {
  const connection = new sqlite3.Database(DB_PATH);
  connection.configure('busyTimeout', 5000);
  return connection;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.run(sql, params, function onRun(error) {
      db.close();
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.get(sql, params, (error, row) => {
      db.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.all(sql, params, (error, rows) => {
      db.close();
      if (error) reject(error);
      else resolve(rows || []);
    });
  });
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
      DEFIER_DB_PATH: DB_PATH,
      NODE_PATH: SHARED_NODE_MODULES.filter(Boolean).join(path.delimiter),
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
  return { child, getOutput: () => output };
}

async function stopServer(server) {
  if (!server || !server.child || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await new Promise(resolve => {
    const timer = setTimeout(resolve, 3000);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function request(pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
    if (server.child.exitCode !== null) {
      throw new Error(`account security backend exited early\n${server.getOutput()}`);
    }
    try {
      const response = await request('/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') {
        return response;
      }
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`account security health timed out\n${server.getOutput()}`);
}

async function withServer(fn) {
  const server = startServer();
  try {
    await waitForHealth(server);
    await fn(server);
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
  }
}

function makeSessionSignature(data, token, route, salt = `sig-${crypto.randomBytes(12).toString('hex')}`) {
    return {
      salt,
      signature: crypto.createHmac('sha256', token)
      .update('session-v2', 'utf8')
      .update('\n', 'utf8')
      .update(route, 'utf8')
      .update('\n', 'utf8')
      .update(salt, 'utf8')
      .update('\n', 'utf8')
      .update(JSON.stringify(data), 'utf8')
      .digest('hex'),
    signatureMode: 'session-v2',
  };
}

async function signedRequest(pathname, token, body, method = 'POST') {
  const route = `${method.toUpperCase()} ${pathname.split('?')[0]}`;
  return request(pathname, {
    method,
    token,
    body: {
      ...body,
      ...makeSessionSignature(body, token, route),
    },
  });
}

function decodeToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function registerUser({ username, password, deviceId = 'device-0001', deviceName = 'Web Device' }) {
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password, deviceId, deviceName },
  });
  assert.strictEqual(response.status, 200, JSON.stringify(response.payload));
  return response.payload;
}

async function loginUser({ username, password, deviceId = 'device-0001', deviceName = 'Web Device' }) {
  return request('/api/auth/login', {
    method: 'POST',
    body: { username, password, deviceId, deviceName },
  });
}

async function seedLegacyUsersWithCollision() {
  removeDbFiles();
  const firstHash = await bcrypt.hash('pwd123', 10);
  const secondHash = await bcrypt.hash('pwd123', 10);
  await dbRun(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    global_data TEXT,
    created_at INTEGER NOT NULL
  )`);
  await dbRun(
    `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    ['legacy-a', 'Alice', firstHash, 100]
  );
  await dbRun(
    `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    ['legacy-b', 'Ａlice', secondHash, 101]
  );
}

async function seedLegacyShortPasswordUser() {
  removeDbFiles();
  const hash = await bcrypt.hash('pwd123', 10);
  await dbRun(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    global_data TEXT,
    created_at INTEGER NOT NULL
  )`);
  await dbRun(
    `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    ['legacy-short-user', 'Legacy短', hash, 200]
  );
}

async function assertExpectedTablesExist() {
  const rows = await dbAll(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${EXPECTED_TABLES.map(() => '?').join(',')})`,
    EXPECTED_TABLES
  );
  const names = new Set(rows.map(row => String(row.name || '')));
  EXPECTED_TABLES.forEach(name => {
    assert(names.has(name), `expected V9 table missing: ${name}`);
  });
}

async function runMigrationCollisionChecks() {
  await seedLegacyUsersWithCollision();
  await withServer(async () => {
    await assertExpectedTablesExist();
    const version = await request('/api/version');
    assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0009_account_social_coop');
    assert.strictEqual(version.payload?.schema?.version, 9);

    const columns = await dbAll(`SELECT name FROM pragma_table_info('users')`);
    const columnNames = new Set(columns.map(row => row.name));
    ['username_normalized', 'auth_version', 'password_changed_at', 'disabled_at'].forEach(name => {
      assert(columnNames.has(name), `users.${name} should exist after V9 bootstrap`);
    });

    const rows = await dbAll(
      `SELECT username, username_normalized FROM users ORDER BY created_at ASC, id ASC`
    );
    assert.strictEqual(rows.length, 2, 'two legacy users should survive migration');
    assert.notStrictEqual(rows[0].username_normalized, rows[1].username_normalized, 'collision users should get unique normalized keys');
    assert(rows.every(row => String(row.username_normalized || '').startsWith('legacy:')), `collision rows should use legacy normalized keys: ${JSON.stringify(rows)}`);

    const firstLogin = await loginUser({ username: 'Alice', password: 'pwd123', deviceId: 'legacy-collision-a', deviceName: 'Legacy A' });
    assert.strictEqual(firstLogin.status, 200, JSON.stringify(firstLogin.payload));
    const secondLogin = await loginUser({ username: 'Ａlice', password: 'pwd123', deviceId: 'legacy-collision-b', deviceName: 'Legacy B' });
    assert.strictEqual(secondLogin.status, 200, JSON.stringify(secondLogin.payload));
    const normalizedLogin = await loginUser({ username: 'alice', password: 'pwd123', deviceId: 'legacy-collision-c', deviceName: 'Legacy C' });
    assert.strictEqual(normalizedLogin.status, 401, JSON.stringify(normalizedLogin.payload));
    assert.strictEqual(normalizedLogin.payload?.reason, 'auth_failed');

    const searchFirst = await request('/api/social/search?username=Alice', { token: secondLogin.payload.user.sessionToken });
    assert.strictEqual(searchFirst.status, 200, JSON.stringify(searchFirst.payload));
    assert.strictEqual(searchFirst.payload?.profile?.username, 'Alice', 'exact visible username should find the first migrated collision account');
    const searchSecond = await request(`/api/social/search?username=${encodeURIComponent('Ａlice')}`, { token: firstLogin.payload.user.sessionToken });
    assert.strictEqual(searchSecond.status, 200, JSON.stringify(searchSecond.payload));
    assert.strictEqual(searchSecond.payload?.profile?.username, 'Ａlice', 'exact visible username should find the second migrated collision account');
  });
}

async function runSessionLifecycleChecks() {
  removeDbFiles();
  await withServer(async () => {
    const weakRegister = await request('/api/auth/register', {
      method: 'POST',
      body: { username: 'Bad名', password: 'pwd123', deviceId: 'weak-device-1', deviceName: 'Weak Device' },
    });
    assert.strictEqual(weakRegister.status, 400, JSON.stringify(weakRegister.payload));
    assert.strictEqual(weakRegister.payload?.reason, 'registration_unavailable');
    assert.strictEqual(weakRegister.payload?.message, '注册未完成');

    const registered = await registerUser({
      username: '  AbC新  ',
      password: 'Abc12345!',
      deviceId: 'device-a1',
      deviceName: 'Primary Browser',
    });
    assert.strictEqual(registered.user.username, 'AbC新');
    const token1 = registered.user.sessionToken;
    const claims1 = decodeToken(token1);
    assert(claims1.sid && claims1.av === 1, `persistent token should carry sid+av: ${JSON.stringify(claims1)}`);

    const storedUser = await dbGet(`SELECT username, username_normalized, password_hash FROM users WHERE id = ?`, [registered.user.objectId]);
    assert.strictEqual(storedUser.username, 'AbC新');
    assert.strictEqual(storedUser.username_normalized, 'abc新');
    assert.match(storedUser.password_hash, /^\$2[aby]\$10\$/, 'new registration should store bcrypt cost 10 hash');

    const duplicateRegister = await request('/api/auth/register', {
      method: 'POST',
      body: { username: 'abc新', password: 'Abc12345!', deviceId: 'device-a2', deviceName: 'Duplicate Browser' },
    });
    assert.strictEqual(duplicateRegister.status, 400, JSON.stringify(duplicateRegister.payload));
    assert.strictEqual(duplicateRegister.payload?.reason, 'registration_unavailable');
    assert.strictEqual(duplicateRegister.payload?.message, '注册未完成');

    const overview1 = await request('/api/auth/security', { token: token1 });
    assert.strictEqual(overview1.status, 200, JSON.stringify(overview1.payload));
    assert.strictEqual(overview1.payload?.currentSession?.sessionId, claims1.sid);
    assert.strictEqual(overview1.payload?.sessions?.length, 1);
    assert(overview1.payload?.recentEvents?.some(event => event.eventType === 'register'));

    const login2 = await loginUser({
      username: 'abc新',
      password: 'Abc12345!',
      deviceId: 'device-b2',
      deviceName: 'Phone Browser',
    });
    assert.strictEqual(login2.status, 200, JSON.stringify(login2.payload));
    const token2 = login2.payload.user.sessionToken;
    const claims2 = decodeToken(token2);
    assert.notStrictEqual(claims1.sid, claims2.sid, 'second login should create a different sid');

    const overviewAfterLogin = await request('/api/auth/security', { token: token1 });
    assert.strictEqual(overviewAfterLogin.status, 200, JSON.stringify(overviewAfterLogin.payload));
    assert.strictEqual(overviewAfterLogin.payload?.sessions?.length, 2, 'device list should show both active sessions');

    const revokePayload = { mutationId: 'revoke-session-1', targetSessionId: claims2.sid };
    const wrongRouteRevoke = await request(`/api/auth/sessions/${encodeURIComponent(claims2.sid)}/revoke`, {
      method: 'POST',
      token: token1,
      body: {
        ...revokePayload,
        ...makeSessionSignature(revokePayload, token1, 'POST /api/auth/logout-all'),
      },
    });
    assert.strictEqual(wrongRouteRevoke.status, 403, JSON.stringify(wrongRouteRevoke.payload));
    assert.strictEqual(wrongRouteRevoke.payload?.reason, 'session-signature-mismatch', 'a valid session signature must not replay across routes');
    const revoke = await signedRequest(`/api/auth/sessions/${encodeURIComponent(claims2.sid)}/revoke`, token1, revokePayload);
    assert.strictEqual(revoke.status, 200, JSON.stringify(revoke.payload));
    assert.strictEqual(revoke.payload?.revokedSessionId, claims2.sid);

    const revokedOverview = await request('/api/auth/security', { token: token2 });
    assert.strictEqual(revokedOverview.status, 401, JSON.stringify(revokedOverview.payload));
    assert.strictEqual(revokedOverview.payload?.reason, 'session_revoked');

    const logout = await request('/api/auth/logout', { method: 'POST', token: token1 });
    assert.strictEqual(logout.status, 200, JSON.stringify(logout.payload));
    const loggedOutOverview = await request('/api/auth/security', { token: token1 });
    assert.strictEqual(loggedOutOverview.status, 401, JSON.stringify(loggedOutOverview.payload));
    assert.strictEqual(loggedOutOverview.payload?.reason, 'session_revoked');
  });
}

async function runLegacyLogoutChecks() {
  await seedLegacyShortPasswordUser();
  await withServer(async () => {
    const legacyToken = generateToken({ id: 'legacy-short-user', username: 'Legacy短' });
    const beforeLogout = await request('/api/auth/security', { token: legacyToken });
    assert.strictEqual(beforeLogout.status, 200, JSON.stringify(beforeLogout.payload));
    const logout = await request('/api/auth/logout', { method: 'POST', token: legacyToken });
    assert.strictEqual(logout.status, 200, JSON.stringify(logout.payload));
    assert.strictEqual(logout.payload?.allSessionsRevoked, true);
    const afterLogout = await request('/api/auth/security', { token: legacyToken });
    assert.strictEqual(afterLogout.status, 401, JSON.stringify(afterLogout.payload));
    assert.strictEqual(afterLogout.payload?.reason, 'session_revoked', 'legacy logout must invalidate the credential server-side');
  });
}

async function runLegacyPasswordChangeChecks() {
  await seedLegacyShortPasswordUser();
  await withServer(async () => {
    const legacyLogin = await loginUser({
      username: 'Legacy短',
      password: 'pwd123',
      deviceId: 'legacy-short-device',
      deviceName: 'Legacy Login Device',
    });
    assert.strictEqual(legacyLogin.status, 200, JSON.stringify(legacyLogin.payload));

    const legacyToken = generateToken({ id: 'legacy-short-user', username: 'Legacy短' });
    const legacyOverview = await request('/api/auth/security', { token: legacyToken });
    assert.strictEqual(legacyOverview.status, 200, JSON.stringify(legacyOverview.payload));
    assert.strictEqual(legacyOverview.payload?.currentSession?.legacy, true, 'legacy token should be explicitly surfaced as legacy');

    const changeBody = {
      currentPassword: 'pwd123',
      newPassword: 'NewPass123!',
      mutationId: 'legacy-change-1',
      deviceId: 'legacy-change-device',
      deviceName: 'Legacy Upgrade Browser',
    };
    const change = await signedRequest('/api/auth/password/change', legacyToken, changeBody);
    assert.strictEqual(change.status, 200, JSON.stringify(change.payload));
    const nextToken = change.payload?.user?.sessionToken;
    const nextClaims = decodeToken(nextToken);
    assert(nextClaims.sid && nextClaims.av === 2, `password change should issue new sid with auth version 2: ${JSON.stringify(nextClaims)}`);

    const legacyOverviewAfterChange = await request('/api/auth/security', { token: legacyToken });
    assert.strictEqual(legacyOverviewAfterChange.status, 401, JSON.stringify(legacyOverviewAfterChange.payload));
    assert.strictEqual(legacyOverviewAfterChange.payload?.reason, 'session_revoked');

    const oldPasswordLogin = await loginUser({
      username: 'Legacy短',
      password: 'pwd123',
      deviceId: 'legacy-old-password',
      deviceName: 'Old Password Browser',
    });
    assert.strictEqual(oldPasswordLogin.status, 401, JSON.stringify(oldPasswordLogin.payload));
    assert.strictEqual(oldPasswordLogin.payload?.reason, 'auth_failed');

    const newPasswordLogin = await loginUser({
      username: 'Legacy短',
      password: 'NewPass123!',
      deviceId: 'legacy-new-password',
      deviceName: 'New Password Browser',
    });
    assert.strictEqual(newPasswordLogin.status, 200, JSON.stringify(newPasswordLogin.payload));
  });
}

async function runRateLimitChecks() {
  removeDbFiles();
  await withServer(async () => {
    await registerUser({
      username: '限频甲',
      password: 'Limit123!',
      deviceId: 'limit-good-1',
      deviceName: 'Limit Browser',
    });

    const unknownLogin = await loginUser({
      username: '不存在甲',
      password: 'Whatever123!',
      deviceId: 'limit-missing-1',
      deviceName: 'Missing Browser',
    });
    assert.strictEqual(unknownLogin.status, 401, JSON.stringify(unknownLogin.payload));
    assert.strictEqual(unknownLogin.payload?.reason, 'auth_failed');

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failed = await loginUser({
        username: '限频甲',
        password: `WrongPass${attempt}!`,
        deviceId: `limit-fail-${attempt}`,
        deviceName: `Fail Browser ${attempt}`,
      });
      assert.strictEqual(failed.status, 401, `attempt ${attempt} should still be auth_failed: ${JSON.stringify(failed.payload)}`);
      assert.strictEqual(failed.payload?.reason, 'auth_failed');
    }

    const blocked = await loginUser({
      username: '限频甲',
      password: 'WrongPass5!',
      deviceId: 'limit-fail-5',
      deviceName: 'Fail Browser 5',
    });
    assert.strictEqual(blocked.status, 429, JSON.stringify(blocked.payload));
    assert.strictEqual(blocked.payload?.reason, 'auth_rate_limited');
    assert(Number(blocked.payload?.retryAfterSeconds) > 0, 'rate-limited response should expose retryAfterSeconds');

    const buckets = await dbAll(
      `SELECT bucket_key, scope, failures, blocked_until
       FROM auth_login_limits
       ORDER BY scope ASC`
    );
    assert(buckets.some(row => row.scope === 'ip'), `expected ip bucket in auth_login_limits: ${JSON.stringify(buckets)}`);
    assert(buckets.some(row => row.scope === 'user_ip'), `expected user_ip bucket in auth_login_limits: ${JSON.stringify(buckets)}`);
    buckets.forEach(row => {
      assert.match(String(row.bucket_key || ''), /^[a-f0-9]{64}$/i, `bucket key should be hashed: ${JSON.stringify(row)}`);
      assert(!String(row.bucket_key || '').includes('127.0.0.1'), `bucket key must not leak IP: ${JSON.stringify(row)}`);
    });
  });
}

async function main() {
  removeDbFiles();
  try {
    await runMigrationCollisionChecks();
    await runSessionLifecycleChecks();
    await runLegacyLogoutChecks();
    await runLegacyPasswordChangeChecks();
    await runRateLimitChecks();
    console.log('Account security platform checks passed.');
  } finally {
    removeDbFiles();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
