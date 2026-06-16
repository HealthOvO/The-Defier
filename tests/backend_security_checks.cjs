const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();

const PORT = Number(process.env.BACKEND_SECURITY_TEST_PORT || 9011);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = 'integration-jwt-secret-32-characters';
const HMAC_SECRET = 'integration-hmac-secret-32-characters';
const DAY_MS = 24 * 60 * 60 * 1000;
const DB_PATH = process.env.BACKEND_SECURITY_DB_PATH
  || path.join(os.tmpdir(), `the-defier-backend-security-${process.pid}.sqlite`);

function signPayload(dataStr, salt, secret = HMAC_SECRET) {
  return crypto.createHmac('sha256', secret)
    .update('v1', 'utf8')
    .update('\n', 'utf8')
    .update(String(salt), 'utf8')
    .update('\n', 'utf8')
    .update(String(dataStr), 'utf8')
    .digest('hex');
}

function signSessionPayload(dataStr, salt, token) {
  return crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(String(salt), 'utf8')
    .update('\n', 'utf8')
    .update(String(dataStr), 'utf8')
    .digest('hex');
}

async function request(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (error) {
    payload = null;
  }
  return { status: res.status, ok: res.ok, payload };
}

async function waitForHealth() {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const res = await request('/health');
      if (res.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw lastError || new Error('backend health check timed out');
}

function startServer(env) {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), JWT_SECRET, DEFIER_DB_PATH: DB_PATH, ...env },
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

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(sql, params, function(err) {
      db.close();
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

async function withServer(env, fn) {
  const server = startServer(env);
  try {
    await waitForHealth();
    await fn();
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
  }
}

async function assertServerStartupFails(env, expectedText) {
  const server = startServer(env);
  const exitCode = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 3000);
    server.child.once('exit', code => {
      clearTimeout(timer);
      resolve(code);
    });
  });
  if (exitCode === null) {
    await stopServer(server);
    throw new Error('server should fail to start but kept running');
  }
  assert.notStrictEqual(exitCode, 0, 'invalid security config should fail server startup');
  assert(server.getOutput().includes(expectedText), `startup output should mention ${expectedText}: ${server.getOutput()}`);
}

async function registerUser(prefix) {
  const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const password = 'pwd123';
  const res = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(res.status, 200, `register should succeed: ${JSON.stringify(res.payload)}`);
  return {
    username,
    id: res.payload.user.objectId,
    token: res.payload.user.sessionToken
  };
}

async function registerFixedUsername(username) {
  return request('/api/auth/register', {
    method: 'POST',
    body: { username, password: 'pwd123' }
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeSessionIntegrity(data, salt, token) {
  return {
    salt,
    signature: signSessionPayload(typeof data === 'string' ? data : JSON.stringify(data), salt, token),
    signatureMode: 'session'
  };
}

function corruptToken(token) {
  assert(token && token.length > 8, `cannot corrupt invalid token: ${token}`);
  const last = token[token.length - 1];
  const replacement = last === 'a' ? 'b' : 'a';
  return `${token.slice(0, -1)}${replacement}`;
}

function makePvpBattleData(overrides = {}) {
  return {
    me: {
      maxHp: 820,
      energy: 4,
      currEnergy: 4,
      ...(overrides.me || {})
    },
    deck: overrides.deck || [
      { id: 'audit_strike' },
      { id: 'defend' },
      { id: 'quickSlash' },
      { id: 'meditation' },
      { id: 'spiritBoost' },
      { id: 'powerUp' },
      { id: 'shieldWall' },
      { id: 'heavyStrike' }
    ],
    aiProfile: overrides.aiProfile || 'balanced',
    deckArchetype: overrides.deckArchetype || 'balanced',
    ruleVersion: overrides.ruleVersion || 'pvp-v2',
    ...(overrides.extra || {})
  };
}

function makePvpDefenseRequest(overrides = {}) {
  return {
    realm: overrides.realm === undefined ? 5 : overrides.realm,
    powerScore: overrides.powerScore === undefined ? 500 : overrides.powerScore,
    battleData: overrides.battleData || makePvpBattleData(),
    config: overrides.config || { personality: 'balanced', guardianFormation: false },
    snapshotTime: overrides.snapshotTime || Date.now()
  };
}

function makePvpMatchRequest(overrides = {}) {
  return {
    myScore: overrides.myScore === undefined ? 1000 : overrides.myScore,
    myRealm: overrides.myRealm === undefined ? 5 : overrides.myRealm,
    preferredRankId: overrides.preferredRankId || '',
    allowPractice: overrides.allowPractice !== false
  };
}

function pvpEconomyMutationSnapshot(economy) {
  assert(economy && typeof economy === 'object', `invalid economy snapshot: ${JSON.stringify(economy)}`);
  return {
    coins: economy.coins,
    totalSpent: economy.totalSpent,
    purchases: { ...(economy.purchases || {}) },
    ownedItems: { ...(economy.ownedItems || {}) },
    equippedSkinId: economy.equippedSkinId || null,
    equippedTitleId: economy.equippedTitleId || null,
    transactionLog: Array.isArray(economy.transactionLog) ? economy.transactionLog.map(item => ({ ...item })) : [],
    lastPurchaseAt: economy.lastPurchaseAt || 0
  };
}

async function getPvpEconomyMutationSnapshot(user) {
  const economyRes = await request('/api/pvp/economy', { token: user.token });
  assert.strictEqual(economyRes.status, 200, `PVP economy should be readable: ${JSON.stringify(economyRes.payload)}`);
  return pvpEconomyMutationSnapshot(economyRes.payload.economy);
}

async function replacePvpEconomy(user, economy) {
  await dbRun(
    `UPDATE pvp_economy SET economy_data = ?, updated_at = ? WHERE user_id = ?`,
    [JSON.stringify(economy), Date.now(), user.id]
  );
}

async function seedLegacyGhostDuplicates() {
  removeDbFiles();
  await dbRun(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    global_data TEXT,
    created_at INTEGER NOT NULL
  )`);
  await dbRun(`CREATE TABLE game_ghosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    realm INTEGER NOT NULL,
    ghost_data TEXT NOT NULL,
    upload_time INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  await dbRun(
    `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`,
    ['legacy-user', 'legacy_user', 'hash', 1]
  );
  await dbRun(
    `INSERT INTO game_ghosts (user_id, user_name, realm, ghost_data, upload_time) VALUES (?, ?, ?, ?, ?)`,
    ['legacy-user', 'legacy_user', 4, JSON.stringify({ name: 'OlderGhost', hp: 10 }), 1000]
  );
  await dbRun(
    `INSERT INTO game_ghosts (user_id, user_name, realm, ghost_data, upload_time) VALUES (?, ?, ?, ?, ?)`,
    ['legacy-user', 'legacy_user', 5, JSON.stringify({ name: 'NewerGhost', hp: 20 }), 2000]
  );
}

async function seedLegacyUsersWithoutGlobalTimestamp() {
  removeDbFiles();
  await dbRun(`CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    global_data TEXT,
    created_at INTEGER NOT NULL
  )`);
}

async function runLegacyGhostMigrationChecks() {
  await seedLegacyGhostDuplicates();
  await withServer({}, async () => {
    const count = await dbGet('SELECT COUNT(*) as count FROM game_ghosts WHERE user_id = ?', ['legacy-user']);
    assert.strictEqual(count.count, 1, 'legacy duplicate ghost migration should keep one row per user');
    const row = await dbGet('SELECT realm, ghost_data as ghostData, upload_time as uploadTime FROM game_ghosts WHERE user_id = ?', ['legacy-user']);
    assert.strictEqual(row.realm, 5, 'legacy duplicate migration should preserve the newest upload realm');
    assert.strictEqual(row.uploadTime, 2000, 'legacy duplicate migration should preserve the newest upload timestamp');
    assert.strictEqual(JSON.parse(row.ghostData).name, 'NewerGhost', 'legacy duplicate migration should preserve newest ghost payload');
    const uniqueIndex = await dbGet(
      `SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index' AND name = 'idx_game_ghosts_user_id'`
    );
    assert.strictEqual(uniqueIndex.count, 1, 'ghost user_id unique index should be present after migration');
  });
}

async function runLegacyGlobalTimestampMigrationChecks() {
  await seedLegacyUsersWithoutGlobalTimestamp();
  await withServer({}, async () => {
    const column = await dbGet(`SELECT COUNT(*) as count FROM pragma_table_info('users') WHERE name = 'global_updated_at'`);
    assert.strictEqual(column.count, 1, 'legacy users table should be migrated with global_updated_at column');

    const user = await registerUser('legacy_global');
    const globalData = { achievements: ['legacy_migrated'], updatedAt: Date.now() };
    const write = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: { globalData, globalUpdatedAt: globalData.updatedAt }
    });
    assert.strictEqual(write.status, 200, `global data write should succeed after legacy users migration: ${JSON.stringify(write.payload)}`);
    const read = await request('/api/user/global', { token: user.token });
    assert.strictEqual(read.status, 200, 'global data read should succeed after legacy users migration');
    assert.deepStrictEqual(read.payload.data, globalData, 'global data should round-trip after legacy users migration');
  });
}

async function runOptionalIntegrityChecks() {
  await withServer({}, async () => {
    const user = await registerUser('optional_hmac');

    const partialSignature = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData: { level: 0 },
        saveTime: Date.now(),
        signature: 'a'.repeat(64)
      }
    });
    assert.strictEqual(partialSignature.status, 400, 'optional mode should reject signature without salt');

    const partialSalt = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData: { level: 0 },
        saveTime: Date.now(),
        salt: 'optional-salt-0'
      }
    });
    assert.strictEqual(partialSalt.status, 400, 'optional mode should reject salt without signature');

    const invalidSignature = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData: { level: 0 },
        saveTime: Date.now(),
        salt: 'optional-salt-0',
        signature: 'not-hex'
      }
    });
    assert.strictEqual(invalidSignature.status, 400, 'optional mode should reject malformed explicit signatures');

    const saveData = { level: 1, hp: 100 };
    const saveRes = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 0,
        saveData,
        saveTime: Date.now(),
        salt: 'optional-salt-1',
        signature: 'a'.repeat(64)
      }
    });
    assert.strictEqual(saveRes.status, 403, 'optional integrity should reject explicit HMAC signatures when HMAC is not configured');

    const invalidSlotValues = ['abc', 'NaN', 1.5, null, ''];
    for (const invalidSlot of invalidSlotValues) {
      const invalidSlotRes = await request('/api/saves', {
        method: 'POST',
        token: user.token,
        body: {
          slotIndex: invalidSlot,
          saveData: { level: 1 },
          saveTime: Date.now()
        }
      });
      assert.strictEqual(invalidSlotRes.status, 400, `invalid slotIndex ${String(invalidSlot)} should return 400`);
    }

    const missingAuth = await request('/api/saves');
    assert.strictEqual(missingAuth.status, 401, 'missing auth should return 401');

    const missingGlobalAuth = await request('/api/user/global');
    assert.strictEqual(missingGlobalAuth.status, 401, 'global data read without auth should return 401');

    const missingUserAliasAuth = await request('/api/user');
    assert.strictEqual(missingUserAliasAuth.status, 401, 'missing user alias auth should return 401');

    const corruptedJwt = corruptToken(user.token);
    const badTokenSaveRead = await request('/api/saves', { token: corruptedJwt });
    assert.strictEqual(badTokenSaveRead.status, 401, 'corrupted JWT save read should return 401');

    const badTokenUserAliasRead = await request('/api/user', { token: corruptedJwt });
    assert.strictEqual(badTokenUserAliasRead.status, 401, 'corrupted JWT /api/user alias read should return 401');

    const badTokenUserAliasWrite = await request('/api/user', {
      method: 'POST',
      token: corruptedJwt,
      body: { slotIndex: 0, saveData: { marker: 'bad-token-user-alias' }, saveTime: Date.now() }
    });
    assert.strictEqual(badTokenUserAliasWrite.status, 401, 'corrupted JWT /api/user alias write should return 401');

    const badTokenGlobalWrite = await request('/api/user/global', {
      method: 'POST',
      token: corruptedJwt,
      body: { globalData: { marker: 'bad-token-global', updatedAt: Date.now() } }
    });
    assert.strictEqual(badTokenGlobalWrite.status, 401, 'corrupted JWT global write should return 401');

    const badTokenGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: corruptedJwt,
      body: {
        realm: 3,
        ghostData: { name: 'BadTokenGhost', hp: 500, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: Date.now() },
        uploadTime: Date.now()
      }
    });
    assert.strictEqual(badTokenGhostWrite.status, 401, 'corrupted JWT ghost upload should return 401');

    const badTokenPvpRank = await request('/api/pvp/rank', { token: corruptedJwt });
    assert.strictEqual(badTokenPvpRank.status, 401, 'corrupted JWT PVP rank read should return 401');

    const badTokenRandomGhost = await request('/api/ghosts/random?realm=3', { token: corruptedJwt });
    assert.strictEqual(badTokenRandomGhost.status, 401, 'corrupted JWT random ghost lookup should return 401 instead of anonymous fallback');

    const optionalGlobalData = { achievements: ['first_clear'], coins: 12, updatedAt: Date.now() };
    const globalWrite = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: { globalData: optionalGlobalData }
    });
    assert.strictEqual(globalWrite.status, 200, 'global data write should succeed');
    const globalRead = await request('/api/user/global', { token: user.token });
    assert.strictEqual(globalRead.status, 200, 'global data read should succeed');
    assert.deepStrictEqual(globalRead.payload.data, optionalGlobalData, 'global data should round-trip');

    const invalidGlobalShape = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: { globalData: 'not-json-object' }
    });
    assert.strictEqual(invalidGlobalShape.status, 400, 'global data write should reject non-object payloads');

    const userAliasSave = await request('/api/user', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 2,
        saveData: { level: 22 },
        saveTime: Date.now()
      }
    });
    assert.strictEqual(userAliasSave.status, 200, '/api/user save alias should remain explicit and tested');
    const userAliasRead = await request('/api/user', { token: user.token });
    assert.strictEqual(userAliasRead.status, 200, '/api/user read alias should remain explicit and tested');
    assert(userAliasRead.payload.data.some(item => item.slotIndex === 2 && item.saveData.level === 22), '/api/user alias should return saved slot');

    const ghostNoMatch = await request('/api/ghosts/random?realm=9999');
    assert.strictEqual(ghostNoMatch.status, 200, 'ghost no-match lookup should return HTTP 200');
    assert.strictEqual(ghostNoMatch.payload.success, false, 'ghost no-match lookup should report success=false');

    const anonymousGhostName = `AnonymousReadableGhost_${Date.now()}`;
    const anonymousGhostUpload = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: {
        realm: 77,
        ghostData: {
          name: anonymousGhostName,
          hp: 777,
          maxHp: 888,
          deck: [{ id: 'anonymous_ghost_audit_card' }],
          updatedAt: Date.now()
        },
        uploadTime: Date.now()
      }
    });
    assert.strictEqual(anonymousGhostUpload.status, 200, 'authenticated ghost upload should seed anonymous random lookup');
    assert.strictEqual(anonymousGhostUpload.payload.success, true, 'authenticated ghost upload should succeed before anonymous lookup');
    const anonymousRandomGhost = await request('/api/ghosts/random?realm=77');
    assert.strictEqual(anonymousRandomGhost.status, 200, 'anonymous ghost lookup should return HTTP 200');
    assert.strictEqual(anonymousRandomGhost.payload.success, true, 'anonymous ghost lookup should return a seeded ghost without token');
    assert.strictEqual(anonymousRandomGhost.payload.data.userName, user.username, 'anonymous ghost lookup should expose the seeded ghost owner name');
    assert.strictEqual(anonymousRandomGhost.payload.data.realm, 77, 'anonymous ghost lookup should preserve the seeded ghost realm');
    assert.strictEqual(anonymousRandomGhost.payload.data.ghostData.name, anonymousGhostName, 'anonymous ghost lookup should return parsed ghost data');

    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'missing-user', password: 'bad' }
    });
    assert.strictEqual(badLogin.status, 401, 'bad login should return 401');

    const duplicateName = `duplicate_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const duplicateSettled = await Promise.all([
      registerFixedUsername(duplicateName),
      registerFixedUsername(duplicateName),
      registerFixedUsername(duplicateName)
    ]);
    const duplicateStatuses = duplicateSettled.map(item => item.status).sort((a, b) => a - b);
    assert.deepStrictEqual(duplicateStatuses, [200, 400, 400], `concurrent duplicate registration should return one success and duplicate errors: ${JSON.stringify(duplicateSettled)}`);
  });
}

async function runRequiredIntegrityChecks() {
  await withServer({ DEFIER_HMAC_SECRET: HMAC_SECRET, DEFIER_INTEGRITY_REQUIRED: '1' }, async () => {
    const user = await registerUser('required_hmac');
    const saveData = { level: 2, hp: 120 };
    const saveStr = JSON.stringify(saveData);
    const salt = 'required-salt-1';
    const signature = signPayload(saveStr, salt);

    const missingSig = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData, saveTime: Date.now() }
    });
    assert.strictEqual(missingSig.status, 400, 'forced integrity should reject missing signatures');

    const invalidFormat = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData, saveTime: Date.now(), salt, signature: 'not-hex' }
    });
    assert.strictEqual(invalidFormat.status, 400, 'forced integrity should reject invalid signature format');

    const tampered = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData: { ...saveData, hp: 999 }, saveTime: Date.now(), salt, signature }
    });
    assert.strictEqual(tampered.status, 403, 'forced integrity should reject tampered save payload');

    const validSave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: { slotIndex: 0, saveData, saveTime: Date.now(), salt, signature }
    });
    assert.strictEqual(validSave.status, 200, 'forced integrity should accept valid save signatures');

    const sessionSavePayload = { level: 3, hp: 130 };
    const sessionSaveSalt = 'session-save-1';
    const sessionSave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 2,
        saveData: sessionSavePayload,
        saveTime: Date.now(),
        salt: sessionSaveSalt,
        signature: signSessionPayload(JSON.stringify(sessionSavePayload), sessionSaveSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(sessionSave.status, 200, 'forced integrity should accept browser session save signatures');

    const badSessionSave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 2,
        saveData: { ...sessionSavePayload, hp: 999 },
        saveTime: Date.now(),
        salt: sessionSaveSalt,
        signature: signSessionPayload(JSON.stringify(sessionSavePayload), sessionSaveSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(badSessionSave.status, 403, 'forced integrity should reject tampered browser session save payloads');

    const globalBaseTime = Date.now();
    const globalData = { achievements: ['first_clear'], coins: 88, updatedAt: globalBaseTime };
    const globalSalt = 'session-global-1';
    const validGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData,
        globalUpdatedAt: globalBaseTime,
        salt: globalSalt,
        signature: signSessionPayload(JSON.stringify(globalData), globalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(validGlobal.status, 200, 'forced integrity should accept signed global data');

    const missingGlobalSig = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: { achievements: ['unsigned_global'], coins: 77, updatedAt: globalBaseTime + 1 },
        globalUpdatedAt: globalBaseTime + 1
      }
    });
    assert.strictEqual(missingGlobalSig.status, 400, 'forced integrity should reject missing global signatures');

    const invalidRequiredGlobalShape = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: { globalData: 'not-json-object' }
    });
    assert.strictEqual(invalidRequiredGlobalShape.status, 400, 'forced integrity should reject non-object global data');

    const tamperedGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: { ...globalData, coins: 999 },
        globalUpdatedAt: globalBaseTime + 1,
        salt: globalSalt,
        signature: signSessionPayload(JSON.stringify(globalData), globalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(tamperedGlobal.status, 403, 'forced integrity should reject tampered global data');

    const staleGlobalData = { achievements: ['stale'], coins: 1, updatedAt: globalBaseTime - 1000 };
    const staleGlobalSalt = 'session-global-stale';
    const staleGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: staleGlobalData,
        globalUpdatedAt: globalBaseTime - 1000,
        salt: staleGlobalSalt,
        signature: signSessionPayload(JSON.stringify(staleGlobalData), staleGlobalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(staleGlobal.status, 200, 'stale global data should be acknowledged');
    assert.strictEqual(staleGlobal.payload.skipped, true, 'stale global data should be marked skipped');
    const readGlobal = await request('/api/user/global', { token: user.token });
    assert.strictEqual(readGlobal.payload.data.coins, 88, 'stale global data should not overwrite newer payload');

    await dbRun('UPDATE users SET global_updated_at = ? WHERE id = ?', [9999999999999999, user.id]);
    const recoveredGlobalData = { achievements: ['recovered'], coins: 1234, updatedAt: globalBaseTime + 20000 };
    const recoveredGlobalSalt = 'session-global-recover';
    const recoveredGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: recoveredGlobalData,
        globalUpdatedAt: recoveredGlobalData.updatedAt,
        salt: recoveredGlobalSalt,
        signature: signSessionPayload(JSON.stringify(recoveredGlobalData), recoveredGlobalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(recoveredGlobal.status, 200, 'normal global write should recover from poisoned future timestamp');
    assert.notStrictEqual(recoveredGlobal.payload.skipped, true, 'recovered global write should not be skipped');
    const readRecoveredGlobal = await request('/api/user/global', { token: user.token });
    assert.strictEqual(readRecoveredGlobal.payload.data.coins, 1234, 'global write should recover after poisoned future timestamp');

    const infinityGlobalData = { achievements: ['infinity_client'], coins: 2222, updatedAt: globalBaseTime + 30000 };
    const infinityGlobalSalt = 'session-global-infinity';
    const infinityGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: infinityGlobalData,
        globalUpdatedAt: 'Infinity',
        salt: infinityGlobalSalt,
        signature: signSessionPayload(JSON.stringify(infinityGlobalData), infinityGlobalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(infinityGlobal.status, 200, 'global write with infinite timestamp should be normalized');
    assert.notStrictEqual(infinityGlobal.payload.skipped, true, 'global write with infinite timestamp should not poison stale guard');
    await sleep(5);
    const normalAfterInfinityGlobalData = { achievements: ['normal_after_infinity'], coins: 3333, updatedAt: Date.now() };
    const normalAfterInfinityGlobalSalt = 'session-global-after-infinity';
    const normalAfterInfinityGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: normalAfterInfinityGlobalData,
        globalUpdatedAt: normalAfterInfinityGlobalData.updatedAt,
        salt: normalAfterInfinityGlobalSalt,
        signature: signSessionPayload(JSON.stringify(normalAfterInfinityGlobalData), normalAfterInfinityGlobalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(normalAfterInfinityGlobal.status, 200, 'normal global write should still work after infinite timestamp input');
    assert.notStrictEqual(normalAfterInfinityGlobal.payload.skipped, true, 'normal global write after infinite timestamp should not be skipped');
    const readAfterInfinityGlobal = await request('/api/user/global', { token: user.token });
    assert.strictEqual(readAfterInfinityGlobal.payload.data.coins, 3333, 'infinite global timestamp should not permanently lock global data');

    await sleep(5);
    const futureGlobalOriginalTime = Date.now() + (6 * DAY_MS);
    const futureGlobalData = { achievements: ['future_client'], coins: 4444, updatedAt: futureGlobalOriginalTime };
    const futureGlobalSalt = 'session-global-future';
    const futureGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: futureGlobalData,
        globalUpdatedAt: futureGlobalOriginalTime,
        salt: futureGlobalSalt,
        signature: signSessionPayload(JSON.stringify(futureGlobalData), futureGlobalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(futureGlobal.status, 200, 'global write with future timestamp should be normalized');
    assert.notStrictEqual(futureGlobal.payload.skipped, true, 'global write with future timestamp should not be skipped');
    assert(futureGlobal.payload.globalUpdatedAt < futureGlobalOriginalTime, 'future global timestamp should be clamped below client future time');
    const readFutureGlobal = await request('/api/user/global', { token: user.token });
    assert.strictEqual(readFutureGlobal.payload.data.updatedAt, futureGlobal.payload.globalUpdatedAt, 'stored global payload updatedAt should match canonical globalUpdatedAt');
    await sleep(5);
    const normalAfterFutureGlobalData = { achievements: ['normal_after_future'], coins: 5555, updatedAt: Date.now() };
    const normalAfterFutureGlobalSalt = 'session-global-after-future';
    const normalAfterFutureGlobal = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: normalAfterFutureGlobalData,
        globalUpdatedAt: normalAfterFutureGlobalData.updatedAt,
        salt: normalAfterFutureGlobalSalt,
        signature: signSessionPayload(JSON.stringify(normalAfterFutureGlobalData), normalAfterFutureGlobalSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(normalAfterFutureGlobal.status, 200, 'normal global write should work after future timestamp input');
    assert.notStrictEqual(normalAfterFutureGlobal.payload.skipped, true, 'future global timestamp should not lock global data');

    await sleep(5);
    const sameGlobalTime = Date.now();
    const sameGlobalFirst = { achievements: ['same_time_first'], coins: 6001, updatedAt: sameGlobalTime };
    const sameGlobalFirstSalt = 'session-global-same-first';
    const sameGlobalFirstWrite = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: sameGlobalFirst,
        globalUpdatedAt: sameGlobalTime,
        salt: sameGlobalFirstSalt,
        signature: signSessionPayload(JSON.stringify(sameGlobalFirst), sameGlobalFirstSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(sameGlobalFirstWrite.status, 200, 'first same-time global write should succeed');
    assert.notStrictEqual(sameGlobalFirstWrite.payload.skipped, true, 'first same-time global write should not be skipped');
    const sameGlobalSecond = { achievements: ['same_time_second'], coins: 6002, updatedAt: sameGlobalTime };
    const sameGlobalSecondSalt = 'session-global-same-second';
    const sameGlobalSecondWrite = await request('/api/user/global', {
      method: 'POST',
      token: user.token,
      body: {
        globalData: sameGlobalSecond,
        globalUpdatedAt: sameGlobalTime,
        salt: sameGlobalSecondSalt,
        signature: signSessionPayload(JSON.stringify(sameGlobalSecond), sameGlobalSecondSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(sameGlobalSecondWrite.status, 200, 'same-time global conflict should be acknowledged');
    assert.strictEqual(sameGlobalSecondWrite.payload.skipped, true, 'same-time global conflict should not overwrite');
    const readSameGlobal = await request('/api/user/global', { token: user.token });
    assert.strictEqual(readSameGlobal.payload.data.coins, 6001, 'same-time global conflict should preserve first payload');

    const ghostData = { name: 'RequiredHero', hp: 500, maxHp: 500, deck: [{ id: 'audit_strike' }] };
    const ghostSalt = 'ghost-salt-123';
    const ghostSignature = signPayload(JSON.stringify(ghostData), ghostSalt);
    const missingGhostSig = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: { realm: 3, ghostData: { name: 'UnsignedHero', hp: 500, maxHp: 500, deck: [{ id: 'audit_guard' }] } }
    });
    assert.strictEqual(missingGhostSig.status, 400, 'forced integrity should reject missing ghost signatures');

    const validGhost = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: { realm: 3, ghostData, salt: ghostSalt, signature: ghostSignature }
    });
    assert.strictEqual(validGhost.status, 200, 'forced integrity should accept valid ghost signatures');

    const sessionGhostData = { name: 'SessionHero', hp: 501, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: Date.now() + 1 };
    const sessionGhostSalt = 'session-ghost-1';
    const sessionGhost = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: {
        realm: 4,
        ghostData: sessionGhostData,
        uploadTime: sessionGhostData.updatedAt,
        salt: sessionGhostSalt,
        signature: signSessionPayload(JSON.stringify(sessionGhostData), sessionGhostSalt, user.token),
        signatureMode: 'session'
      }
    });
    assert.strictEqual(sessionGhost.status, 200, 'forced integrity should accept browser session ghost signatures');

    const badGhost = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: { realm: 3, ghostData: { ...ghostData, hp: 999 }, salt: ghostSalt, signature: ghostSignature }
    });
    assert.strictEqual(badGhost.status, 403, 'forced integrity should reject tampered ghost payload');

    const invalidGhostShape = await request('/api/ghosts/current', {
      method: 'POST',
      token: user.token,
      body: {
        realm: 3,
        ghostData: { name: 'InvalidHero', hp: 9999, maxHp: 500, deck: [{ id: 'audit_strike' }] },
        salt: 'ghost-salt-456',
        signature: signPayload(JSON.stringify({ name: 'InvalidHero', hp: 9999, maxHp: 500, deck: [{ id: 'audit_strike' }] }), 'ghost-salt-456')
      }
    });
    assert.strictEqual(invalidGhostShape.status, 403, 'server-side ghost validation should reject impossible stats');

    const baseSaveTime = Date.now() - 1000;
    const writes = Array.from({ length: 10 }, (_, index) => {
      const payload = { level: index, hp: 100 + index };
      const writeSalt = `concurrent-${index}`;
      return request('/api/saves', {
        method: 'POST',
        token: user.token,
        body: {
          slotIndex: 1,
          saveData: payload,
          saveTime: baseSaveTime + index,
          salt: writeSalt,
          signature: signPayload(JSON.stringify(payload), writeSalt)
        }
      });
    });
    const settled = await Promise.all(writes);
    assert(settled.every(item => item.status === 200), `all concurrent writes should pass: ${JSON.stringify(settled)}`);

    const read = await request('/api/saves', { token: user.token });
    assert.strictEqual(read.status, 200, 'save read should succeed after concurrent writes');
    const slot = read.payload.data.find(item => item.slotIndex === 1);
    assert(slot, 'slot 1 should exist after concurrent writes');
    assert.strictEqual(slot.saveData.level, 9, 'newest concurrent save payload should win');
    assert.strictEqual(slot.saveTime, baseSaveTime + 9, 'newest concurrent save timestamp should win');

    const stalePayload = { level: -1, hp: 1 };
    const staleSalt = 'stale-save';
    const staleWrite = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 1,
        saveData: stalePayload,
        saveTime: baseSaveTime - 1000,
        salt: staleSalt,
        signature: signPayload(JSON.stringify(stalePayload), staleSalt)
      }
    });
    assert.strictEqual(staleWrite.status, 200, 'stale save write should be acknowledged without overwriting');
    assert.strictEqual(staleWrite.payload.skipped, true, 'stale save write should be marked skipped');

    const readAfterStale = await request('/api/saves', { token: user.token });
    const slotAfterStale = readAfterStale.payload.data.find(item => item.slotIndex === 1);
    assert.strictEqual(slotAfterStale.saveData.level, 9, 'stale save should not overwrite newest payload');

    await dbRun('UPDATE game_saves SET save_time = ? WHERE user_id = ? AND slot_index = ?', [9999999999999999, user.id, 1]);
    const recoveredSavePayload = { level: 10, hp: 200 };
    const recoveredSaveSalt = 'recover-save';
    const recoveredSaveTime = Date.now();
    const recoveredSave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 1,
        saveData: recoveredSavePayload,
        saveTime: recoveredSaveTime,
        salt: recoveredSaveSalt,
        signature: signPayload(JSON.stringify(recoveredSavePayload), recoveredSaveSalt)
      }
    });
    assert.strictEqual(recoveredSave.status, 200, 'normal save should recover from poisoned future timestamp');
    assert.notStrictEqual(recoveredSave.payload.skipped, true, 'recovered save write should not be skipped');
    const readRecoveredSave = await request('/api/saves', { token: user.token });
    const recoveredSlot = readRecoveredSave.payload.data.find(item => item.slotIndex === 1);
    assert.strictEqual(recoveredSlot.saveData.level, 10, 'save should recover after poisoned future timestamp');
    assert.strictEqual(recoveredSlot.saveTime, recoveredSave.payload.saveTime, 'recovered save should return and store canonical timestamp');

    const infinitySavePayload = { level: 30, hp: 300, timestamp: 9999999999999999 };
    const infinitySaveSalt = 'infinity-save';
    const infinitySave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 3,
        saveData: infinitySavePayload,
        saveTime: 'Infinity',
        salt: infinitySaveSalt,
        signature: signPayload(JSON.stringify(infinitySavePayload), infinitySaveSalt)
      }
    });
    assert.strictEqual(infinitySave.status, 200, 'save with infinite timestamp should be normalized');
    assert.notStrictEqual(infinitySave.payload.skipped, true, 'save with infinite timestamp should not poison stale guard');
    const readInfinitySave = await request('/api/saves', { token: user.token });
    const infinitySlot = readInfinitySave.payload.data.find(item => item.slotIndex === 3);
    assert(infinitySlot && infinitySlot.saveData.level === 30, 'infinite timestamp save should still write normalized payload');
    assert.strictEqual(infinitySlot.saveData.timestamp, infinitySave.payload.saveTime, 'infinite save payload timestamp should match canonical saveTime');
    await sleep(5);
    const normalAfterInfinitySavePayload = { level: 31, hp: 301 };
    const normalAfterInfinitySaveSalt = 'normal-after-infinity-save';
    const normalAfterInfinitySave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 3,
        saveData: normalAfterInfinitySavePayload,
        saveTime: Date.now(),
        salt: normalAfterInfinitySaveSalt,
        signature: signPayload(JSON.stringify(normalAfterInfinitySavePayload), normalAfterInfinitySaveSalt)
      }
    });
    assert.strictEqual(normalAfterInfinitySave.status, 200, 'normal save should still work after infinite timestamp input');
    assert.notStrictEqual(normalAfterInfinitySave.payload.skipped, true, 'normal save after infinite timestamp should not be skipped');
    const readAfterInfinitySave = await request('/api/saves', { token: user.token });
    const slotAfterInfinity = readAfterInfinitySave.payload.data.find(item => item.slotIndex === 3);
    assert.strictEqual(slotAfterInfinity.saveData.level, 31, 'infinite save timestamp should not permanently lock slot');

    await sleep(5);
    const futureSaveOriginalTime = Date.now() + (6 * DAY_MS);
    const futureSavePayload = { level: 40, hp: 400, timestamp: futureSaveOriginalTime };
    const futureSaveSalt = 'future-save';
    const futureSave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 3,
        saveData: futureSavePayload,
        saveTime: futureSaveOriginalTime,
        salt: futureSaveSalt,
        signature: signPayload(JSON.stringify(futureSavePayload), futureSaveSalt)
      }
    });
    assert.strictEqual(futureSave.status, 200, 'save with future timestamp should be normalized');
    assert.notStrictEqual(futureSave.payload.skipped, true, 'save with future timestamp should not be skipped');
    assert(futureSave.payload.saveTime < futureSaveOriginalTime, 'future save timestamp should be clamped below client future time');
    const readFutureSave = await request('/api/saves', { token: user.token });
    const futureSaveSlot = readFutureSave.payload.data.find(item => item.slotIndex === 3);
    assert.strictEqual(futureSaveSlot.saveData.timestamp, futureSave.payload.saveTime, 'future save payload timestamp should match canonical saveTime');
    await sleep(5);
    const normalAfterFutureSavePayload = { level: 41, hp: 401 };
    const normalAfterFutureSaveSalt = 'normal-after-future-save';
    const normalAfterFutureSave = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 3,
        saveData: normalAfterFutureSavePayload,
        saveTime: Date.now(),
        salt: normalAfterFutureSaveSalt,
        signature: signPayload(JSON.stringify(normalAfterFutureSavePayload), normalAfterFutureSaveSalt)
      }
    });
    assert.strictEqual(normalAfterFutureSave.status, 200, 'normal save should work after future timestamp input');
    assert.notStrictEqual(normalAfterFutureSave.payload.skipped, true, 'future save timestamp should not lock slot');

    await sleep(5);
    const sameSaveTime = Date.now();
    const sameSaveFirstPayload = { level: 50, hp: 500 };
    const sameSaveFirstSalt = 'same-save-first';
    const sameSaveFirst = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 3,
        saveData: sameSaveFirstPayload,
        saveTime: sameSaveTime,
        salt: sameSaveFirstSalt,
        signature: signPayload(JSON.stringify(sameSaveFirstPayload), sameSaveFirstSalt)
      }
    });
    assert.strictEqual(sameSaveFirst.status, 200, 'first same-time save should succeed');
    assert.notStrictEqual(sameSaveFirst.payload.skipped, true, 'first same-time save should not be skipped');
    const sameSaveSecondPayload = { level: 51, hp: 501 };
    const sameSaveSecondSalt = 'same-save-second';
    const sameSaveSecond = await request('/api/saves', {
      method: 'POST',
      token: user.token,
      body: {
        slotIndex: 3,
        saveData: sameSaveSecondPayload,
        saveTime: sameSaveTime,
        salt: sameSaveSecondSalt,
        signature: signPayload(JSON.stringify(sameSaveSecondPayload), sameSaveSecondSalt)
      }
    });
    assert.strictEqual(sameSaveSecond.status, 200, 'same-time save conflict should be acknowledged');
    assert.strictEqual(sameSaveSecond.payload.skipped, true, 'same-time save conflict should not overwrite');
    const readSameSave = await request('/api/saves', { token: user.token });
    const sameSaveSlot = readSameSave.payload.data.find(item => item.slotIndex === 3);
    assert.strictEqual(sameSaveSlot.saveData.level, 50, 'same-time save conflict should preserve first payload');

    const ghostUser = await registerUser('concurrent_ghost');
    const ghostWrites = Array.from({ length: 8 }, (_, index) => {
      const payload = { name: `ConcurrentGhost${index}`, hp: 500 + index, maxHp: 1000, deck: [{ id: 'audit_strike' }] };
      const salt = `concurrent-ghost-${index}`;
      return request('/api/ghosts/current', {
        method: 'POST',
        token: ghostUser.token,
        body: {
          realm: 42,
          ghostData: payload,
          salt,
          signature: signPayload(JSON.stringify(payload), salt)
        }
      });
    });
    const ghostSettled = await Promise.all(ghostWrites);
    assert(ghostSettled.every(item => item.status === 200), `all concurrent ghost uploads should pass: ${JSON.stringify(ghostSettled)}`);

    const ghostCount = await dbGet('SELECT COUNT(*) as count FROM game_ghosts WHERE user_id = ?', [ghostUser.id]);
    assert.strictEqual(ghostCount.count, 1, 'concurrent ghost uploads should leave exactly one ghost row per user');

    const newestGhost = { name: 'NewestGhost', hp: 700, maxHp: 1000, deck: [{ id: 'audit_strike' }], updatedAt: baseSaveTime + 5000 };
    const newestGhostSalt = 'newest-ghost';
    const newestGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 50,
        ghostData: newestGhost,
        uploadTime: newestGhost.updatedAt,
        salt: newestGhostSalt,
        signature: signPayload(JSON.stringify(newestGhost), newestGhostSalt)
      }
    });
    assert.strictEqual(newestGhostWrite.status, 200, 'newer ghost upload should succeed');
    const staleGhost = { name: 'StaleGhost', hp: 701, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: baseSaveTime + 1000 };
    const staleGhostSalt = 'stale-ghost';
    const staleGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 51,
        ghostData: staleGhost,
        uploadTime: staleGhost.updatedAt,
        salt: staleGhostSalt,
        signature: signPayload(JSON.stringify(staleGhost), staleGhostSalt)
      }
    });
    assert.strictEqual(staleGhostWrite.status, 200, 'stale ghost upload should be acknowledged');
    assert.strictEqual(staleGhostWrite.payload.skipped, true, 'stale ghost upload should be marked skipped');
    const ghostRow = await dbGet('SELECT realm, ghost_data as ghostData, upload_time as uploadTime FROM game_ghosts WHERE user_id = ?', [ghostUser.id]);
    assert.strictEqual(ghostRow.realm, 50, 'stale ghost upload should not overwrite newest realm');
    assert.strictEqual(JSON.parse(ghostRow.ghostData).name, 'NewestGhost', 'stale ghost upload should not overwrite newest payload');

    await dbRun('UPDATE game_ghosts SET upload_time = ? WHERE user_id = ?', [9999999999999999, ghostUser.id]);
    const recoveredGhost = { name: 'RecoveredGhost', hp: 720, maxHp: 1000, deck: [{ id: 'audit_strike' }], updatedAt: baseSaveTime + 25000 };
    const recoveredGhostSalt = 'recover-ghost';
    const recoveredGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 52,
        ghostData: recoveredGhost,
        uploadTime: recoveredGhost.updatedAt,
        salt: recoveredGhostSalt,
        signature: signPayload(JSON.stringify(recoveredGhost), recoveredGhostSalt)
      }
    });
    assert.strictEqual(recoveredGhostWrite.status, 200, 'normal ghost upload should recover from poisoned future timestamp');
    assert.notStrictEqual(recoveredGhostWrite.payload.skipped, true, 'recovered ghost upload should not be skipped');
    const recoveredGhostRow = await dbGet('SELECT realm, ghost_data as ghostData, upload_time as uploadTime FROM game_ghosts WHERE user_id = ?', [ghostUser.id]);
    assert.strictEqual(recoveredGhostRow.realm, 52, 'ghost upload should recover after poisoned future timestamp');
    assert.strictEqual(JSON.parse(recoveredGhostRow.ghostData).name, 'RecoveredGhost', 'recovered ghost payload should win');

    const infinityGhost = { name: 'InfinityGhost', hp: 730, maxHp: 1000, deck: [{ id: 'audit_strike' }], updatedAt: baseSaveTime + 30000 };
    const infinityGhostSalt = 'infinity-ghost';
    const infinityGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 53,
        ghostData: infinityGhost,
        uploadTime: 'Infinity',
        salt: infinityGhostSalt,
        signature: signPayload(JSON.stringify(infinityGhost), infinityGhostSalt)
      }
    });
    assert.strictEqual(infinityGhostWrite.status, 200, 'ghost upload with infinite timestamp should be normalized');
    assert.notStrictEqual(infinityGhostWrite.payload.skipped, true, 'ghost upload with infinite timestamp should not poison stale guard');
    await sleep(5);
    const normalAfterInfinityGhost = { name: 'NormalAfterInfinityGhost', hp: 740, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: Date.now() };
    const normalAfterInfinityGhostSalt = 'normal-after-infinity-ghost';
    const normalAfterInfinityGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 54,
        ghostData: normalAfterInfinityGhost,
        uploadTime: normalAfterInfinityGhost.updatedAt,
        salt: normalAfterInfinityGhostSalt,
        signature: signPayload(JSON.stringify(normalAfterInfinityGhost), normalAfterInfinityGhostSalt)
      }
    });
    assert.strictEqual(normalAfterInfinityGhostWrite.status, 200, 'normal ghost upload should still work after infinite timestamp input');
    assert.notStrictEqual(normalAfterInfinityGhostWrite.payload.skipped, true, 'normal ghost upload after infinite timestamp should not be skipped');
    const ghostAfterInfinityRow = await dbGet('SELECT realm, ghost_data as ghostData FROM game_ghosts WHERE user_id = ?', [ghostUser.id]);
    assert.strictEqual(ghostAfterInfinityRow.realm, 54, 'infinite ghost timestamp should not permanently lock ghost row');
    assert.strictEqual(JSON.parse(ghostAfterInfinityRow.ghostData).name, 'NormalAfterInfinityGhost', 'normal ghost after infinite timestamp should win');

    await sleep(5);
    const futureGhostOriginalTime = Date.now() + (6 * DAY_MS);
    const futureGhost = { name: 'FutureGhost', hp: 750, maxHp: 1000, deck: [{ id: 'audit_strike' }], updatedAt: futureGhostOriginalTime };
    const futureGhostSalt = 'future-ghost';
    const futureGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 55,
        ghostData: futureGhost,
        uploadTime: futureGhostOriginalTime,
        salt: futureGhostSalt,
        signature: signPayload(JSON.stringify(futureGhost), futureGhostSalt)
      }
    });
    assert.strictEqual(futureGhostWrite.status, 200, 'ghost upload with future timestamp should be normalized');
    assert.notStrictEqual(futureGhostWrite.payload.skipped, true, 'ghost upload with future timestamp should not be skipped');
    assert(futureGhostWrite.payload.uploadTime < futureGhostOriginalTime, 'future ghost timestamp should be clamped below client future time');
    const futureGhostRow = await dbGet('SELECT ghost_data as ghostData FROM game_ghosts WHERE user_id = ?', [ghostUser.id]);
    assert.strictEqual(JSON.parse(futureGhostRow.ghostData).updatedAt, futureGhostWrite.payload.uploadTime, 'stored ghost payload updatedAt should match canonical uploadTime');
    await sleep(5);
    const normalAfterFutureGhost = { name: 'NormalAfterFutureGhost', hp: 760, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: Date.now() };
    const normalAfterFutureGhostSalt = 'normal-after-future-ghost';
    const normalAfterFutureGhostWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 56,
        ghostData: normalAfterFutureGhost,
        uploadTime: normalAfterFutureGhost.updatedAt,
        salt: normalAfterFutureGhostSalt,
        signature: signPayload(JSON.stringify(normalAfterFutureGhost), normalAfterFutureGhostSalt)
      }
    });
    assert.strictEqual(normalAfterFutureGhostWrite.status, 200, 'normal ghost upload should work after future timestamp input');
    assert.notStrictEqual(normalAfterFutureGhostWrite.payload.skipped, true, 'future ghost timestamp should not lock ghost row');

    await sleep(5);
    const sameGhostTime = Date.now();
    const sameGhostFirst = { name: 'SameGhostFirst', hp: 770, maxHp: 1000, deck: [{ id: 'audit_strike' }], updatedAt: sameGhostTime };
    const sameGhostFirstSalt = 'same-ghost-first';
    const sameGhostFirstWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 57,
        ghostData: sameGhostFirst,
        uploadTime: sameGhostTime,
        salt: sameGhostFirstSalt,
        signature: signPayload(JSON.stringify(sameGhostFirst), sameGhostFirstSalt)
      }
    });
    assert.strictEqual(sameGhostFirstWrite.status, 200, 'first same-time ghost upload should succeed');
    assert.notStrictEqual(sameGhostFirstWrite.payload.skipped, true, 'first same-time ghost upload should not be skipped');
    const sameGhostSecond = { name: 'SameGhostSecond', hp: 780, maxHp: 1000, deck: [{ id: 'audit_guard' }], updatedAt: sameGhostTime };
    const sameGhostSecondSalt = 'same-ghost-second';
    const sameGhostSecondWrite = await request('/api/ghosts/current', {
      method: 'POST',
      token: ghostUser.token,
      body: {
        realm: 58,
        ghostData: sameGhostSecond,
        uploadTime: sameGhostTime,
        salt: sameGhostSecondSalt,
        signature: signPayload(JSON.stringify(sameGhostSecond), sameGhostSecondSalt)
      }
    });
    assert.strictEqual(sameGhostSecondWrite.status, 200, 'same-time ghost conflict should be acknowledged');
    assert.strictEqual(sameGhostSecondWrite.payload.skipped, true, 'same-time ghost conflict should not overwrite');
    const sameGhostRow = await dbGet('SELECT realm, ghost_data as ghostData FROM game_ghosts WHERE user_id = ?', [ghostUser.id]);
    assert.strictEqual(sameGhostRow.realm, 57, 'same-time ghost conflict should preserve first realm');
    assert.strictEqual(JSON.parse(sameGhostRow.ghostData).name, 'SameGhostFirst', 'same-time ghost conflict should preserve first payload');
  });
}

async function runPvpRequiredIntegrityChecks() {
  await withServer({ DEFIER_HMAC_SECRET: HMAC_SECRET, DEFIER_INTEGRITY_REQUIRED: '1' }, async () => {
    const user = await registerUser('pvp_required');
    const opponent = await registerUser('pvp_required_opp');

    for (const pathToCheck of ['/api/pvp/rank', '/api/pvp/leaderboard', '/api/pvp/defense/me', '/api/pvp/economy']) {
      const missingAuth = await request(pathToCheck);
      assert.strictEqual(missingAuth.status, 401, `${pathToCheck} should reject missing auth`);
    }

    const emptyDefense = await request('/api/pvp/defense/me', { token: user.token });
    assert.strictEqual(emptyDefense.status, 200, 'PVP defense empty state should return HTTP 200');
    assert.strictEqual(emptyDefense.payload.success, false, 'PVP defense empty state should return success=false');
    assert.strictEqual(emptyDefense.payload.message, '未设置防御快照', 'PVP defense empty state should explain missing snapshot');

    const emptyMatchRequest = makePvpMatchRequest({ myRealm: 7 });
    const emptyMatch = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: {
        ...emptyMatchRequest,
        ...makeSessionIntegrity(emptyMatchRequest, 'pvp-match-empty-opponent', user.token)
      }
    });
    assert.strictEqual(emptyMatch.status, 200, 'PVP match empty opponent state should return HTTP 200');
    assert.strictEqual(emptyMatch.payload.success, false, 'PVP match empty opponent state should return success=false');
    assert.strictEqual(emptyMatch.payload.message, '暂无对手数据', 'PVP match empty opponent state should explain missing opponent');
    const emptyMatchTickets = await dbGet('SELECT COUNT(*) as count FROM pvp_match_tickets WHERE user_id = ?', [user.id]);
    assert.strictEqual(emptyMatchTickets.count, 0, 'PVP match empty opponent state should not create a match ticket');

    const defenseRequest = makePvpDefenseRequest({ realm: 7, powerScore: 700 });
    const missingDefenseSig = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: defenseRequest
    });
    assert.strictEqual(missingDefenseSig.status, 400, 'PVP defense should reject missing signature');

    const malformedDefenseSig = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: { ...defenseRequest, salt: 'pvp-defense-bad-format', signature: 'not-hex' }
    });
    assert.strictEqual(malformedDefenseSig.status, 400, 'PVP defense should reject malformed signature');

    const defenseIntegrity = makeSessionIntegrity(defenseRequest, 'pvp-defense-valid-1', user.token);
    const tamperedDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...defenseRequest,
        powerScore: 999999,
        config: { personality: 'aggressive', guardianFormation: true },
        ...defenseIntegrity
      }
    });
    assert.strictEqual(tamperedDefense.status, 403, 'PVP defense should reject metadata tampering');

    const wildDefenseRequest = makePvpDefenseRequest({
      realm: 8,
      powerScore: 800,
      battleData: makePvpBattleData({
        me: { maxHp: 999999, energy: 99, currEnergy: 99 },
        deck: Array.from({ length: 80 }, (_, index) => ({ id: `audit_card_${index}`, upgraded: index % 2 === 0 }))
      }),
      config: { personality: 'fortified', guardianFormation: true }
    });
    const validWildDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...wildDefenseRequest,
        ...makeSessionIntegrity(wildDefenseRequest, 'pvp-defense-wild', user.token)
      }
    });
    assert.strictEqual(validWildDefense.status, 200, 'PVP defense should accept valid signed payloads');
    assert(validWildDefense.payload.snapshot.battleData.me.maxHp <= 5000, 'PVP defense maxHp should be clamped server-side');
    assert(validWildDefense.payload.snapshot.battleData.me.energy <= 12, 'PVP defense energy should be clamped server-side');
    assert(validWildDefense.payload.snapshot.battleData.deck.length <= 20, 'PVP defense deck should be capped server-side');

    const defenseBaseTime = Date.now() - 1000;
    const newestDefenseRequest = makePvpDefenseRequest({
      realm: 10,
      powerScore: 1000,
      snapshotTime: defenseBaseTime + 1000,
      config: { personality: 'newest-defense', guardianFormation: true }
    });
    const newestDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...newestDefenseRequest,
        ...makeSessionIntegrity(newestDefenseRequest, 'pvp-defense-newest', user.token)
      }
    });
    assert.strictEqual(newestDefense.status, 200, 'newest PVP defense should upload');
    assert.notStrictEqual(newestDefense.payload.skipped, true, 'newest PVP defense should not be skipped');
    assert.strictEqual(newestDefense.payload.snapshot.realm, 10, 'newest PVP defense should set current realm');
    assert.strictEqual(newestDefense.payload.snapshot.config.personality, 'newest-defense', 'newest PVP defense should store config');
    assert.strictEqual(newestDefense.payload.rank.realm, 10, 'newest PVP defense should update rank realm');
    const rankAfterNewestDefense = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterNewestDefense.payload.rank.realm, 10, 'newest PVP defense should persist rank realm');
    assert.strictEqual(rankAfterNewestDefense.payload.rank.hasDefenseSnapshot, true, 'newest PVP defense should mark rank as defended');
    const newestDefenseRankUpdatedAt = rankAfterNewestDefense.payload.rank.updatedAt;

    const staleDefenseRequest = makePvpDefenseRequest({
      realm: 2,
      powerScore: 200,
      snapshotTime: defenseBaseTime,
      config: { personality: 'stale-defense', guardianFormation: false }
    });
    const staleDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...staleDefenseRequest,
        ...makeSessionIntegrity(staleDefenseRequest, 'pvp-defense-stale', user.token)
      }
    });
    assert.strictEqual(staleDefense.status, 200, 'stale PVP defense should be acknowledged');
    assert.strictEqual(staleDefense.payload.skipped, true, 'stale PVP defense should be skipped');
    const defenseAfterStale = await request('/api/pvp/defense/me', { token: user.token });
    assert.strictEqual(defenseAfterStale.payload.snapshot.realm, 10, 'stale PVP defense should not overwrite realm');
    assert.strictEqual(defenseAfterStale.payload.snapshot.powerScore, 1000, 'stale PVP defense should not overwrite power score');
    assert.strictEqual(defenseAfterStale.payload.snapshot.config.personality, 'newest-defense', 'stale PVP defense should not overwrite config');
    assert.strictEqual(staleDefense.payload.rank.realm, 10, 'stale PVP defense response should keep rank realm');
    assert.strictEqual(staleDefense.payload.rank.updatedAt, newestDefenseRankUpdatedAt, 'stale PVP defense should not bump rank updatedAt');
    const rankAfterStaleDefense = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterStaleDefense.payload.rank.realm, 10, 'stale PVP defense should not persist stale rank realm');
    assert.strictEqual(rankAfterStaleDefense.payload.rank.updatedAt, newestDefenseRankUpdatedAt, 'stale PVP defense should not persist rank updatedAt bump');

    await sleep(5);
    const sameDefenseTime = Date.now();
    const sameDefenseFirstRequest = makePvpDefenseRequest({
      realm: 11,
      powerScore: 1100,
      snapshotTime: sameDefenseTime,
      config: { personality: 'same-defense-first', guardianFormation: true }
    });
    const sameDefenseFirst = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...sameDefenseFirstRequest,
        ...makeSessionIntegrity(sameDefenseFirstRequest, 'pvp-defense-same-first', user.token)
      }
    });
    assert.strictEqual(sameDefenseFirst.status, 200, 'first same-time PVP defense should upload');
    assert.notStrictEqual(sameDefenseFirst.payload.skipped, true, 'first same-time PVP defense should not be skipped');
    assert.strictEqual(sameDefenseFirst.payload.rank.realm, 11, 'first same-time PVP defense should update rank realm');
    const rankAfterSameDefenseFirst = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterSameDefenseFirst.payload.rank.realm, 11, 'first same-time PVP defense should persist rank realm');
    const sameDefenseRankUpdatedAt = rankAfterSameDefenseFirst.payload.rank.updatedAt;
    const sameDefenseSecondRequest = makePvpDefenseRequest({
      realm: 12,
      powerScore: 1200,
      snapshotTime: sameDefenseTime,
      config: { personality: 'same-defense-second', guardianFormation: false }
    });
    const sameDefenseSecond = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...sameDefenseSecondRequest,
        ...makeSessionIntegrity(sameDefenseSecondRequest, 'pvp-defense-same-second', user.token)
      }
    });
    assert.strictEqual(sameDefenseSecond.status, 200, 'same-time PVP defense conflict should be acknowledged');
    assert.strictEqual(sameDefenseSecond.payload.skipped, true, 'same-time PVP defense conflict should not overwrite');
    assert.strictEqual(sameDefenseSecond.payload.rank.realm, 11, 'same-time PVP defense conflict response should preserve rank realm');
    assert.strictEqual(sameDefenseSecond.payload.rank.updatedAt, sameDefenseRankUpdatedAt, 'same-time PVP defense conflict should not bump rank updatedAt');
    const defenseAfterSame = await request('/api/pvp/defense/me', { token: user.token });
    assert.strictEqual(defenseAfterSame.payload.snapshot.realm, 11, 'same-time PVP defense should preserve first realm');
    assert.strictEqual(defenseAfterSame.payload.snapshot.config.personality, 'same-defense-first', 'same-time PVP defense should preserve first config');
    const rankAfterSameDefense = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterSameDefense.payload.rank.realm, 11, 'same-time PVP defense should persist first rank realm');
    assert.strictEqual(rankAfterSameDefense.payload.rank.updatedAt, sameDefenseRankUpdatedAt, 'same-time PVP defense should persist first rank updatedAt');

    await sleep(5);
    const futureDefenseOriginalTime = Date.now() + (6 * DAY_MS);
    const futureDefenseRequest = makePvpDefenseRequest({
      realm: 13,
      powerScore: 1300,
      snapshotTime: futureDefenseOriginalTime,
      config: { personality: 'future-defense', guardianFormation: true }
    });
    const futureDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...futureDefenseRequest,
        ...makeSessionIntegrity(futureDefenseRequest, 'pvp-defense-future', user.token)
      }
    });
    assert.strictEqual(futureDefense.status, 200, 'future PVP defense timestamp should be normalized');
    assert.notStrictEqual(futureDefense.payload.skipped, true, 'future PVP defense timestamp should not be skipped');
    assert(futureDefense.payload.saveTime < futureDefenseOriginalTime, 'future PVP defense saveTime should be clamped below client future time');
    assert.strictEqual(futureDefense.payload.snapshot.realm, 13, 'future PVP defense should still write normalized snapshot');
    assert.strictEqual(futureDefense.payload.rank.realm, 13, 'future PVP defense should update rank realm after normalization');

    await sleep(5);
    const normalAfterFutureDefenseRequest = makePvpDefenseRequest({
      realm: 14,
      powerScore: 1400,
      snapshotTime: Date.now(),
      config: { personality: 'normal-after-future-defense', guardianFormation: false }
    });
    const normalAfterFutureDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...normalAfterFutureDefenseRequest,
        ...makeSessionIntegrity(normalAfterFutureDefenseRequest, 'pvp-defense-normal-after-future', user.token)
      }
    });
    assert.strictEqual(normalAfterFutureDefense.status, 200, 'normal PVP defense should work after future timestamp input');
    assert.notStrictEqual(normalAfterFutureDefense.payload.skipped, true, 'future PVP defense timestamp should not lock snapshot');
    assert.strictEqual(normalAfterFutureDefense.payload.snapshot.realm, 14, 'normal PVP defense should overwrite future-normalized snapshot');
    assert.strictEqual(normalAfterFutureDefense.payload.rank.realm, 14, 'normal PVP defense should update rank realm after future-normalized snapshot');

    await dbRun('UPDATE pvp_defense_snapshots SET save_time = ? WHERE user_id = ?', [9999999999999999, user.id]);
    const recoveredDefenseRequest = makePvpDefenseRequest({
      realm: 15,
      powerScore: 1500,
      snapshotTime: Date.now(),
      config: { personality: 'recovered-defense', guardianFormation: true }
    });
    const recoveredDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...recoveredDefenseRequest,
        ...makeSessionIntegrity(recoveredDefenseRequest, 'pvp-defense-recovered', user.token)
      }
    });
    assert.strictEqual(recoveredDefense.status, 200, 'normal PVP defense should recover from poisoned future timestamp');
    assert.notStrictEqual(recoveredDefense.payload.skipped, true, 'recovered PVP defense should not be skipped');
    assert.strictEqual(recoveredDefense.payload.snapshot.realm, 15, 'recovered PVP defense should overwrite poisoned timestamp row');
    assert.strictEqual(recoveredDefense.payload.rank.realm, 15, 'recovered PVP defense should update rank realm after poisoned timestamp');
    const rankAfterRecoveredDefense = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterRecoveredDefense.payload.rank.realm, 15, 'recovered PVP defense should persist recovered rank realm');

    const opponentDefenseRequest = makePvpDefenseRequest({
      realm: 8,
      powerScore: 650,
      battleData: makePvpBattleData({
        deck: [{ id: 'audit_guard' }, { id: 'defend' }, { id: 'shieldWall' }, { id: 'meditation' }, { id: 'spiritBoost' }, { id: 'powerUp' }, { id: 'quickSlash' }, { id: 'heavyStrike' }]
      })
    });
    const validOpponentDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: opponent.token,
      body: {
        ...opponentDefenseRequest,
        ...makeSessionIntegrity(opponentDefenseRequest, 'pvp-defense-opponent', opponent.token)
      }
    });
    assert.strictEqual(validOpponentDefense.status, 200, 'opponent PVP defense should upload');
    const opponentRank = await request('/api/pvp/rank', { token: opponent.token });
    assert.strictEqual(opponentRank.status, 200, 'opponent PVP rank should read');

    const matchRequest = makePvpMatchRequest({ preferredRankId: opponentRank.payload.rank.objectId, myRealm: 8 });
    const missingMatchSig = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: matchRequest
    });
    assert.strictEqual(missingMatchSig.status, 400, 'PVP match should reject missing signature');

    const malformedMatchSig = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: { ...matchRequest, salt: 'pvp-match-bad-format', signature: 'not-hex' }
    });
    assert.strictEqual(malformedMatchSig.status, 400, 'PVP match should reject malformed signature');

    const matchIntegrity = makeSessionIntegrity(matchRequest, 'pvp-match-base', user.token);
    const tamperedMatch = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: {
        ...matchRequest,
        preferredRankId: 'pvp-rank-tampered',
        ...matchIntegrity
      }
    });
    assert.strictEqual(tamperedMatch.status, 403, 'PVP match should reject tampered signed body');

    const validMatch = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: {
        ...matchRequest,
        ...makeSessionIntegrity(matchRequest, 'pvp-match-valid', user.token)
      }
    });
    assert.strictEqual(validMatch.status, 200, 'PVP match should accept valid signed body');
    assert.strictEqual(validMatch.payload.success, true, 'PVP match should create a ticket');

    const reportRequest = { matchTicket: validMatch.payload.matchTicket, didWin: true };
    const missingReportSig = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: { report: reportRequest }
    });
    assert.strictEqual(missingReportSig.status, 400, 'PVP report should reject missing signature');

    const malformedReportSig = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: { report: reportRequest, salt: 'pvp-report-bad-format', signature: 'not-hex' }
    });
    assert.strictEqual(malformedReportSig.status, 400, 'PVP report should reject malformed signature');

    const reportIntegrity = makeSessionIntegrity(reportRequest, 'pvp-report-base', user.token);
    const tamperedReport = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: {
        report: { ...reportRequest, didWin: false },
        ...reportIntegrity
      }
    });
    assert.strictEqual(tamperedReport.status, 403, 'PVP report should reject tampered signed report');

    const rankBeforeGate = await request('/api/pvp/rank', { token: user.token });
    const defaultGateReport = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: {
        report: reportRequest,
        ...makeSessionIntegrity(reportRequest, 'pvp-report-default-gate', user.token)
      }
    });
    assert.strictEqual(defaultGateReport.status, 200, 'default PVP report gate should respond with HTTP 200');
    assert.strictEqual(defaultGateReport.payload.success, false, 'default PVP report gate should reject client result');
    assert.strictEqual(defaultGateReport.payload.reason, 'server_authority_unavailable', 'default PVP report gate should explain authority mode');
    const rankAfterGate = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterGate.payload.rank.score, rankBeforeGate.payload.rank.score, 'default PVP report gate should not change score');
    assert.strictEqual(rankAfterGate.payload.wallet.coins, rankBeforeGate.payload.wallet.coins, 'default PVP report gate should not change wallet');

    const shopRequest = { itemId: 'secret_manual_2' };
    const missingShopSig = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: user.token,
      body: shopRequest
    });
    assert.strictEqual(missingShopSig.status, 400, 'PVP shop should reject missing signature');

    const malformedShopSig = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: user.token,
      body: { ...shopRequest, salt: 'pvp-shop-bad-format', signature: 'not-hex' }
    });
    assert.strictEqual(malformedShopSig.status, 400, 'PVP shop should reject malformed signature');

    const shopIntegrity = makeSessionIntegrity(shopRequest, 'pvp-shop-base', user.token);
    const tamperedShop = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: user.token,
      body: {
        itemId: 'title_supreme',
        itemName: 'forged-free-title',
        price: 0,
        itemType: 'title',
        ...shopIntegrity
      }
    });
    assert.strictEqual(tamperedShop.status, 403, 'PVP shop should reject tampered signed item id');

    const signedShopPurchase = (shopUser, itemId, salt) => {
      const requestBody = { itemId };
      return {
        ...requestBody,
        ...makeSessionIntegrity(requestBody, salt, shopUser.token)
      };
    };

    const missingCatalogShopUser = await registerUser('pvp_shop_missing_catalog');
    const missingCatalogBefore = await getPvpEconomyMutationSnapshot(missingCatalogShopUser);
    const missingCatalogShop = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: missingCatalogShopUser.token,
      body: signedShopPurchase(missingCatalogShopUser, 'not_a_real_shop_item', 'pvp-shop-missing-catalog')
    });
    assert.strictEqual(missingCatalogShop.status, 400, 'PVP shop should reject missing catalog item');
    assert.strictEqual(missingCatalogShop.payload.reason, 'missing', 'PVP shop missing catalog rejection should expose reason=missing');
    const missingCatalogAfter = await getPvpEconomyMutationSnapshot(missingCatalogShopUser);
    assert.deepStrictEqual(missingCatalogAfter, missingCatalogBefore, 'PVP shop missing item should not mutate economy');

    const insufficientShopUser = await registerUser('pvp_shop_insufficient');
    const insufficientBefore = await getPvpEconomyMutationSnapshot(insufficientShopUser);
    const insufficientShop = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: insufficientShopUser.token,
      body: signedShopPurchase(insufficientShopUser, 'title_supreme', 'pvp-shop-insufficient')
    });
    assert.strictEqual(insufficientShop.status, 400, 'PVP shop should reject purchases with insufficient coins');
    assert.strictEqual(insufficientShop.payload.reason, 'insufficient', 'PVP shop insufficient rejection should expose reason=insufficient');
    const insufficientAfter = await getPvpEconomyMutationSnapshot(insufficientShopUser);
    assert.deepStrictEqual(insufficientAfter, insufficientBefore, 'PVP shop insufficient coins should not mutate economy');

    const ownedCosmeticUser = await registerUser('pvp_shop_owned_cosmetic');
    const ownedEconomyRes = await request('/api/pvp/economy', { token: ownedCosmeticUser.token });
    assert.strictEqual(ownedEconomyRes.status, 200, 'PVP shop owned cosmetic user should get default economy');
    const ownedSeed = {
      ...ownedEconomyRes.payload.economy,
      coins: 3200,
      ownedItems: {
        ...(ownedEconomyRes.payload.economy.ownedItems || {}),
        skin_void_walker: true
      }
    };
    await replacePvpEconomy(ownedCosmeticUser, ownedSeed);
    const ownedBefore = await getPvpEconomyMutationSnapshot(ownedCosmeticUser);
    const ownedShop = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: ownedCosmeticUser.token,
      body: signedShopPurchase(ownedCosmeticUser, 'skin_void_walker', 'pvp-shop-owned-cosmetic')
    });
    assert.strictEqual(ownedShop.status, 400, 'PVP shop should reject already-owned cosmetics even if granted outside shop purchases');
    assert.strictEqual(ownedShop.payload.reason, 'owned', 'PVP shop owned cosmetic rejection should expose reason=owned');
    const ownedAfter = await getPvpEconomyMutationSnapshot(ownedCosmeticUser);
    assert.deepStrictEqual(ownedAfter, ownedBefore, 'PVP shop owned cosmetic rejection should not mutate economy');

    const soldOutShopUser = await registerUser('pvp_shop_sold_out');
    const soldOutEconomyRes = await request('/api/pvp/economy', { token: soldOutShopUser.token });
    assert.strictEqual(soldOutEconomyRes.status, 200, 'PVP shop sold-out user should get default economy');
    const soldOutSeed = {
      ...soldOutEconomyRes.payload.economy,
      coins: 2000,
      purchases: {
        ...(soldOutEconomyRes.payload.economy.purchases || {}),
        item_reset_stats: 5
      },
      transactionLog: [
        ...(soldOutEconomyRes.payload.economy.transactionLog || []),
        { type: 'test_seed', itemId: 'item_reset_stats', coins: 0, at: Date.now() - 1000 }
      ],
      lastPurchaseAt: Date.now() - 1000
    };
    await replacePvpEconomy(soldOutShopUser, soldOutSeed);
    const soldOutBefore = await getPvpEconomyMutationSnapshot(soldOutShopUser);
    const soldOutShop = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: soldOutShopUser.token,
      body: signedShopPurchase(soldOutShopUser, 'item_reset_stats', 'pvp-shop-sold-out')
    });
    assert.strictEqual(soldOutShop.status, 400, 'PVP shop should reject sold-out consumables');
    assert.strictEqual(soldOutShop.payload.reason, 'sold_out', 'PVP shop sold-out rejection should expose reason=sold_out');
    const soldOutAfter = await getPvpEconomyMutationSnapshot(soldOutShopUser);
    assert.deepStrictEqual(soldOutAfter, soldOutBefore, 'PVP shop sold-out rejection should not mutate economy');

    const canonicalShop = await request('/api/pvp/shop/purchase', {
      method: 'POST',
      token: user.token,
      body: {
        ...shopRequest,
        itemName: 'forged-free-skin',
        price: 0,
        itemType: 'skin',
        ...makeSessionIntegrity(shopRequest, 'pvp-shop-canonical', user.token)
      }
    });
    assert.strictEqual(canonicalShop.status, 200, 'PVP shop should accept canonical item id');
    assert.strictEqual(canonicalShop.payload.coinsSpent, 300, 'PVP shop should use server catalog pricing');
    const economyAfterShop = await request('/api/pvp/economy', { token: user.token });
    assert.strictEqual(economyAfterShop.payload.economy.purchases.secret_manual_2, 1, 'PVP shop should record canonical purchase id');
    assert.strictEqual(economyAfterShop.payload.economy.ownedItems.secret_manual_2, true, 'PVP shop should record canonical ownership');

    const concurrentShopUser = await registerUser('pvp_shop_concurrent');
    const concurrentShopEconomyBefore = await request('/api/pvp/economy', { token: concurrentShopUser.token });
    assert.strictEqual(concurrentShopEconomyBefore.status, 200, 'PVP shop concurrent user should get default economy');
    const concurrentShopRequest = { itemId: 'secret_manual_2' };
    const coinsBeforeConcurrentShop = concurrentShopEconomyBefore.payload.wallet.coins;
    const [shopA, shopB] = await Promise.all([
      request('/api/pvp/shop/purchase', {
        method: 'POST',
        token: concurrentShopUser.token,
        body: {
          ...concurrentShopRequest,
          ...makeSessionIntegrity(concurrentShopRequest, 'pvp-shop-concurrent-a', concurrentShopUser.token)
        }
      }),
      request('/api/pvp/shop/purchase', {
        method: 'POST',
        token: concurrentShopUser.token,
        body: {
          ...concurrentShopRequest,
          ...makeSessionIntegrity(concurrentShopRequest, 'pvp-shop-concurrent-b', concurrentShopUser.token)
        }
      })
    ]);
    const concurrentResults = [shopA, shopB];
    const concurrentSuccesses = concurrentResults.filter(item => item.status === 200 && item.payload?.success);
    const concurrentFailures = concurrentResults.filter(item => item.status === 400 && ['sold_out', 'owned'].includes(item.payload?.reason));
    assert.strictEqual(concurrentSuccesses.length, 1, `PVP shop concurrent stock=1 purchase should allow exactly one success: ${JSON.stringify(concurrentResults)}`);
    assert.strictEqual(concurrentFailures.length, 1, `PVP shop concurrent stock=1 purchase should reject the second purchase: ${JSON.stringify(concurrentResults)}`);
    assert.strictEqual(concurrentSuccesses[0].payload.coinsSpent, 300, 'PVP shop concurrent success should use canonical secret_manual_2 price');
    const economyAfterConcurrentShop = await request('/api/pvp/economy', { token: concurrentShopUser.token });
    assert.strictEqual(economyAfterConcurrentShop.payload.economy.purchases.secret_manual_2, 1, 'PVP shop concurrent purchase should record stock=1 item once');
    assert.strictEqual(economyAfterConcurrentShop.payload.economy.ownedItems.secret_manual_2, true, 'PVP shop concurrent purchase should own canonical stock=1 item');
    assert.strictEqual(economyAfterConcurrentShop.payload.wallet.coins, coinsBeforeConcurrentShop - 300, 'PVP shop concurrent purchase should deduct coins exactly once');
  });
}

async function runPvpClientReportedSettlementTestModeChecks() {
  await withServer({
    DEFIER_HMAC_SECRET: HMAC_SECRET,
    DEFIER_INTEGRITY_REQUIRED: '1',
    DEFIER_PVP_ALLOW_CLIENT_REPORTED_RESULT: '1',
    DEFIER_PVP_TEST_MODE: '1'
  }, async () => {
    const user = await registerUser('pvp_testmode');
    const opponent = await registerUser('pvp_testmode_opp');

    const userDefenseRequest = makePvpDefenseRequest({ realm: 9, powerScore: 900 });
    const userDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: user.token,
      body: {
        ...userDefenseRequest,
        ...makeSessionIntegrity(userDefenseRequest, 'pvp-testmode-user-defense', user.token)
      }
    });
    assert.strictEqual(userDefense.status, 200, 'test-mode user defense should upload');

    const opponentDefenseRequest = makePvpDefenseRequest({
      realm: 9,
      powerScore: 880,
      battleData: makePvpBattleData({ deck: [{ id: 'audit_guard' }, { id: 'defend' }, { id: 'shieldWall' }, { id: 'meditation' }, { id: 'spiritBoost' }, { id: 'powerUp' }, { id: 'quickSlash' }, { id: 'heavyStrike' }] })
    });
    const opponentDefense = await request('/api/pvp/defense', {
      method: 'POST',
      token: opponent.token,
      body: {
        ...opponentDefenseRequest,
        ...makeSessionIntegrity(opponentDefenseRequest, 'pvp-testmode-opp-defense', opponent.token)
      }
    });
    assert.strictEqual(opponentDefense.status, 200, 'test-mode opponent defense should upload');
    const opponentRank = await request('/api/pvp/rank', { token: opponent.token });
    assert.strictEqual(opponentRank.status, 200, 'test-mode opponent rank should read');

    const matchRequest = makePvpMatchRequest({ preferredRankId: opponentRank.payload.rank.objectId, myRealm: 9 });
    const match = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: {
        ...matchRequest,
        ...makeSessionIntegrity(matchRequest, 'pvp-testmode-match', user.token)
      }
    });
    assert.strictEqual(match.status, 200, 'test-mode PVP match should be created');
    assert.strictEqual(match.payload.success, true, 'test-mode PVP match should return success');

    const invalidTicketReport = { matchTicket: 'missing-ticket-for-testmode', didWin: true };
    const rankBeforeInvalidTicket = await request('/api/pvp/rank', { token: user.token });
    const invalidTicketResult = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: {
        report: invalidTicketReport,
        ...makeSessionIntegrity(invalidTicketReport, 'pvp-testmode-report-invalid-ticket', user.token)
      }
    });
    assert.strictEqual(invalidTicketResult.status, 400, 'test-mode PVP report should reject missing ticket');
    const rankAfterInvalidTicket = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterInvalidTicket.payload.rank.score, rankBeforeInvalidTicket.payload.rank.score, 'invalid ticket PVP report should not change score');
    assert.strictEqual(rankAfterInvalidTicket.payload.wallet.coins, rankBeforeInvalidTicket.payload.wallet.coins, 'invalid ticket PVP report should not change wallet');
    const invalidTicketHistoryCount = await dbGet('SELECT COUNT(*) as count FROM pvp_match_history WHERE ticket_id = ?', [invalidTicketReport.matchTicket]);
    assert.strictEqual(invalidTicketHistoryCount.count, 0, 'invalid ticket PVP report should not create match history');

    const expiredMatch = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: {
        ...matchRequest,
        ...makeSessionIntegrity(matchRequest, 'pvp-testmode-expired-match', user.token)
      }
    });
    assert.strictEqual(expiredMatch.status, 200, 'test-mode expired-ticket fixture should create a match');
    assert.strictEqual(expiredMatch.payload.success, true, 'test-mode expired-ticket fixture should return success');
    await dbRun(
      'UPDATE pvp_match_tickets SET expires_at = ? WHERE ticket_id = ?',
      [Date.now() - 1000, expiredMatch.payload.matchTicket]
    );
    const expiredTicketReport = { matchTicket: expiredMatch.payload.matchTicket, didWin: true };
    const rankBeforeExpiredTicket = await request('/api/pvp/rank', { token: user.token });
    const expiredTicketResult = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: {
        report: expiredTicketReport,
        ...makeSessionIntegrity(expiredTicketReport, 'pvp-testmode-report-expired-ticket', user.token)
      }
    });
    assert.strictEqual(expiredTicketResult.status, 410, 'test-mode PVP report should reject expired ticket');
    const rankAfterExpiredTicket = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterExpiredTicket.payload.rank.score, rankBeforeExpiredTicket.payload.rank.score, 'expired ticket PVP report should not change score');
    assert.strictEqual(rankAfterExpiredTicket.payload.wallet.coins, rankBeforeExpiredTicket.payload.wallet.coins, 'expired ticket PVP report should not change wallet');
    const expiredTicketHistoryCount = await dbGet('SELECT COUNT(*) as count FROM pvp_match_history WHERE ticket_id = ?', [expiredMatch.payload.matchTicket]);
    assert.strictEqual(expiredTicketHistoryCount.count, 0, 'expired ticket PVP report should not create match history');

    const rankBeforeReport = await request('/api/pvp/rank', { token: user.token });
    const report = { matchTicket: match.payload.matchTicket, didWin: true };
    const firstReport = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: {
        report,
        ...makeSessionIntegrity(report, 'pvp-testmode-report-1', user.token)
      }
    });
    assert.strictEqual(firstReport.status, 200, 'test-mode PVP report should accept first settlement');
    assert.strictEqual(firstReport.payload.success, true, 'test-mode PVP report should settle first result');
    assert(firstReport.payload.rank.score > rankBeforeReport.payload.rank.score, 'test-mode PVP win should increase score');
    assert(firstReport.payload.wallet.coins > rankBeforeReport.payload.wallet.coins, 'test-mode PVP win should award coins');

    const rankBeforeReplay = await request('/api/pvp/rank', { token: user.token });
    const replayReport = await request('/api/pvp/match/result', {
      method: 'POST',
      token: user.token,
      body: {
        report,
        ...makeSessionIntegrity(report, 'pvp-testmode-report-replay', user.token)
      }
    });
    assert.strictEqual(replayReport.status, 409, 'test-mode duplicate PVP report should return 409');
    const rankAfterReplay = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterReplay.payload.rank.score, rankBeforeReplay.payload.rank.score, 'duplicate PVP report should not change score');
    assert.strictEqual(rankAfterReplay.payload.wallet.coins, rankBeforeReplay.payload.wallet.coins, 'duplicate PVP report should not change wallet');
    const historyCount = await dbGet('SELECT COUNT(*) as count FROM pvp_match_history WHERE ticket_id = ?', [match.payload.matchTicket]);
    assert.strictEqual(historyCount.count, 1, 'duplicate PVP report should leave one match history row');

    const concurrentMatch = await request('/api/pvp/match', {
      method: 'POST',
      token: user.token,
      body: {
        ...matchRequest,
        ...makeSessionIntegrity(matchRequest, 'pvp-testmode-concurrent-match', user.token)
      }
    });
    assert.strictEqual(concurrentMatch.status, 200, 'test-mode concurrent fixture should create a match');
    assert.strictEqual(concurrentMatch.payload.success, true, 'test-mode concurrent fixture should return success');
    const concurrentReport = { matchTicket: concurrentMatch.payload.matchTicket, didWin: true };
    const rankBeforeConcurrentReport = await request('/api/pvp/rank', { token: user.token });
    const [concurrentReportA, concurrentReportB] = await Promise.all([
      request('/api/pvp/match/result', {
        method: 'POST',
        token: user.token,
        body: {
          report: concurrentReport,
          ...makeSessionIntegrity(concurrentReport, 'pvp-testmode-report-concurrent-a', user.token)
        }
      }),
      request('/api/pvp/match/result', {
        method: 'POST',
        token: user.token,
        body: {
          report: concurrentReport,
          ...makeSessionIntegrity(concurrentReport, 'pvp-testmode-report-concurrent-b', user.token)
        }
      })
    ]);
    const concurrentResults = [concurrentReportA, concurrentReportB];
    const concurrentSuccesses = concurrentResults.filter(item => item.status === 200 && item.payload?.success);
    const concurrentConflicts = concurrentResults.filter(item => item.status === 409);
    assert.strictEqual(concurrentSuccesses.length, 1, `concurrent PVP report should allow exactly one success: ${JSON.stringify(concurrentResults)}`);
    assert.strictEqual(concurrentConflicts.length, 1, `concurrent PVP report should reject duplicate settlement: ${JSON.stringify(concurrentResults)}`);
    const concurrentSuccess = concurrentSuccesses[0];
    assert(concurrentSuccess.payload.rank.score > rankBeforeConcurrentReport.payload.rank.score, 'concurrent PVP win should increase score once');
    assert(concurrentSuccess.payload.wallet.coins > rankBeforeConcurrentReport.payload.wallet.coins, 'concurrent PVP win should award coins once');
    const rankAfterConcurrentReport = await request('/api/pvp/rank', { token: user.token });
    assert.strictEqual(rankAfterConcurrentReport.payload.rank.score, concurrentSuccess.payload.rank.score, 'concurrent PVP final score should match the single successful settlement');
    assert.strictEqual(rankAfterConcurrentReport.payload.wallet.coins, concurrentSuccess.payload.wallet.coins, 'concurrent PVP final wallet should match the single successful settlement');
    const concurrentTicket = await dbGet('SELECT consumed_at FROM pvp_match_tickets WHERE ticket_id = ?', [concurrentMatch.payload.matchTicket]);
    assert(Number(concurrentTicket.consumed_at) > 0, 'concurrent PVP report should consume ticket once');
    const concurrentHistoryCount = await dbGet('SELECT COUNT(*) as count FROM pvp_match_history WHERE ticket_id = ?', [concurrentMatch.payload.matchTicket]);
    assert.strictEqual(concurrentHistoryCount.count, 1, 'concurrent PVP report should leave one match history row');
  });
}

(async () => {
  removeDbFiles();
  await assertServerStartupFails(
    { NODE_ENV: 'production', JWT_SECRET: '' },
    'JWT_SECRET must be configured with at least 32 characters in production'
  );
  await assertServerStartupFails(
    { NODE_ENV: 'production', JWT_SECRET: 'short-production-jwt-secret' },
    'JWT_SECRET must be configured with at least 32 characters in production'
  );
  await assertServerStartupFails(
    { NODE_ENV: 'production', JWT_SECRET, DEFIER_INTEGRITY_REQUIRED: '', DEFIER_HMAC_SECRET: '' },
    'NODE_ENV=production requires DEFIER_INTEGRITY_REQUIRED'
  );
  await assertServerStartupFails({ DEFIER_INTEGRITY_REQUIRED: '1' }, 'DEFIER_INTEGRITY_REQUIRED requires DEFIER_HMAC_SECRET');
  await runLegacyGhostMigrationChecks();
  await runLegacyGlobalTimestampMigrationChecks();
  await runOptionalIntegrityChecks();
  await runRequiredIntegrityChecks();
  await runPvpRequiredIntegrityChecks();
  await runPvpClientReportedSettlementTestModeChecks();
  console.log('Backend security endpoint checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
