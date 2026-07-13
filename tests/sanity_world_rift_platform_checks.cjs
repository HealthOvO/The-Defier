const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SHARED_NODE_MODULES = [
  path.resolve(ROOT, '..', 'The-Defier', 'server', 'node_modules'),
  path.resolve(ROOT, '..', 'The-Defier', 'node_modules'),
];

function resolveSqlite3() {
  for (const candidate of [
    'sqlite3',
    path.join(ROOT, 'node_modules', 'sqlite3'),
    path.join(ROOT, 'server', 'node_modules', 'sqlite3'),
    path.join(SHARED_NODE_MODULES[0], 'sqlite3'),
    path.join(SHARED_NODE_MODULES[1], 'sqlite3'),
  ]) {
    try {
      return require(candidate).verbose();
    } catch (error) {}
  }
  throw new Error('sqlite3 module is not available in this worktree');
}

const sqlite3 = resolveSqlite3();
const { CONTENT_VERSION } = require('../server/progression/authoritative-runs/catalog');

const PORT = Number(process.env.WORLD_RIFT_PLATFORM_TEST_PORT || 9065);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECONDARY_PORT = Number(process.env.WORLD_RIFT_PLATFORM_SECONDARY_TEST_PORT || PORT + 1);
const SECONDARY_BASE_URL = `http://127.0.0.1:${SECONDARY_PORT}`;
const DB_PATH = process.env.WORLD_RIFT_PLATFORM_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-world-rift-platform-${process.pid}.sqlite`);
const JWT_SECRET = 'world-rift-platform-jwt-secret-32';
const HMAC_SECRET = 'world-rift-platform-hmac-secret-32';
const OPS_TOKEN = 'world-rift-platform-ops-token-32';
const PROTOCOL_VERSION = 'authoritative-world-rift-v1';
const EXPECTED_SCHEMA_VERSION = 10;
const EXPECTED_MIGRATION_ID = '0010_relay_expedition';
const EXPECTED_TABLES = [
  'world_rift_rotations',
  'world_rift_states',
  'world_rift_attempts',
  'world_rift_contributions',
  'world_rift_entries',
  'world_rift_reward_claims',
  'world_rift_mutations',
  'world_rift_ops_events',
  'world_rift_ops_counters',
];
const BLOCK_CARDS = new Set(['guard', 'iron_mandate']);

let userCounter = 0;
let runCounter = 0;
let actionCounter = 0;
let mutationCounter = 0;
let attemptCounter = 0;

function nextId(prefix) {
  if (prefix === 'user') userCounter += 1;
  if (prefix === 'run') runCounter += 1;
  if (prefix === 'action') actionCounter += 1;
  if (prefix === 'mutation') mutationCounter += 1;
  if (prefix === 'attempt') attemptCounter += 1;
  const counters = {
    user: userCounter,
    run: runCounter,
    action: actionCounter,
    mutation: mutationCounter,
    attempt: attemptCounter,
  };
  return `rift-${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function startServer(port = PORT) {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_WORLD_RIFT_SEED_SECRET: 'world-rift-platform-seed-secret-32',
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: OPS_TOKEN,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: 'world-rift-platform-test-sha',
      NODE_PATH: [
        process.env.NODE_PATH,
        path.join(ROOT, 'node_modules'),
        path.join(ROOT, 'server', 'node_modules'),
        ...SHARED_NODE_MODULES,
      ].filter(Boolean).join(path.delimiter),
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

async function requestAt(baseUrl, pathname, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
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

async function request(pathname, options = {}) {
  return requestAt(BASE_URL, pathname, options);
}

async function waitForHealth(server, baseUrl = BASE_URL) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`world rift backend exited early\n${server.getOutput()}`);
    }
    try {
      const response = await requestAt(baseUrl, '/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') return response;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`world rift backend health timed out\n${server.getOutput()}`);
}

function signSessionPayload(data, token, salt = `riftsig-${crypto.randomBytes(12).toString('hex')}`) {
  const signature = crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return { salt, signature, signatureMode: 'session' };
}

async function signedRequest(pathname, { token, data, method = 'POST' }) {
  return request(pathname, {
    method,
    token,
    body: { ...data, ...signSessionPayload(data, token) },
  });
}

async function signedRequestAt(baseUrl, pathname, { token, data, method = 'POST' }) {
  return requestAt(baseUrl, pathname, {
    method,
    token,
    body: { ...data, ...signSessionPayload(data, token) },
  });
}

async function registerAndLogin(tag) {
  const username = `${String(tag || 'rift').slice(0, 8)}-${Date.now().toString(36)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password },
  });
  assert.strictEqual(registered.status, 200, JSON.stringify(registered.payload));
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.strictEqual(login.status, 200, JSON.stringify(login.payload));
  return {
    username,
    token: login.payload?.token || login.payload?.user?.sessionToken,
    userId: login.payload?.user?.id || login.payload?.user?.objectId,
  };
}

function openDb() {
  const connection = new sqlite3.Database(DB_PATH);
  connection.configure('busyTimeout', 5000);
  return connection;
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

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.run(sql, params, function onRun(error) {
      const result = {
        changes: Number(this && this.changes || 0),
        lastID: Number(this && this.lastID || 0),
      };
      db.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function dbRunOn(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: Number(this && this.changes || 0) });
    });
  });
}

async function acquireWriteLock() {
  const connection = openDb();
  await dbRunOn(connection, 'BEGIN IMMEDIATE');
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await dbRunOn(connection, 'COMMIT');
    } finally {
      await new Promise(resolve => connection.close(resolve));
    }
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestAcrossDeadline(deadline, requestFactory) {
  const release = await acquireWriteLock();
  let released = false;
  try {
    const pending = requestFactory();
    await wait(Math.max(Number(deadline) - Date.now() + 150, 150));
    await release();
    released = true;
    return await pending;
  } finally {
    if (!released) await release();
  }
}

function expectReason(response, status, reason) {
  assert.strictEqual(response.status, status, JSON.stringify(response.payload));
  assert.strictEqual(response.payload?.reason, reason, JSON.stringify(response.payload));
}

function chooseCommandFromProjection(projection) {
  if (!projection || typeof projection !== 'object') {
    throw new Error('projection is required to choose a command');
  }
  if (projection.phase === 'route') {
    return ['select_node', { nodeId: projection.route.choices[0].nodeId }];
  }
  if (projection.phase === 'reward') {
    const reward = (projection.player.hp < 22
      ? projection.reward.choices.find(choice => choice.kind === 'heal')
      : projection.reward.choices.find(choice => choice.kind === 'card')) || projection.reward.choices[0];
    return ['choose_reward', { rewardId: reward.rewardId }];
  }
  if (projection.phase !== 'battle') {
    throw new Error(`unsupported projection phase for driver: ${projection.phase}`);
  }
  const incomingDamage = Number(projection.battle?.enemy?.intent?.amount || 0);
  const cards = projection.player.hand.slice().sort((left, right) => {
    const leftBlocks = BLOCK_CARDS.has(left.cardId) ? 1 : 0;
    const rightBlocks = BLOCK_CARDS.has(right.cardId) ? 1 : 0;
    const defenseOrder = incomingDamage > projection.player.block
      ? rightBlocks - leftBlocks
      : leftBlocks - rightBlocks;
    return defenseOrder || right.cost - left.cost || left.instanceId.localeCompare(right.instanceId);
  });
  const card = cards.find(entry => entry.cost <= projection.player.energy);
  return card
    ? ['play_card', { cardInstanceId: card.instanceId }]
    : ['end_turn', {}];
}

async function submitAction(token, runId, expectedVersion, command, payload, actionId = nextId('action')) {
  return signedRequest(`/api/progression/authoritative-runs/${runId}/actions`, {
    token,
    data: {
      runId,
      actionId,
      expectedVersion,
      command,
      payload,
    },
  });
}

async function settleAuthoritativeRun(token, runId, expectedVersion, mutationId = nextId('mutation')) {
  return signedRequest(`/api/progression/authoritative-runs/${runId}/settle`, {
    token,
    data: {
      runId,
      mutationId,
      expectedVersion,
    },
  });
}

async function getWorldCurrent(token, baseUrl = BASE_URL) {
  return requestAt(baseUrl, '/api/world-rift/current', {
    method: 'GET',
    token,
  });
}

async function startWorldAttempt(token, payload, baseUrl = BASE_URL) {
  return signedRequestAt(baseUrl, '/api/world-rift/attempts', {
    token,
    data: payload,
  });
}

async function submitWorldContribution(token, payload, baseUrl = BASE_URL) {
  return signedRequestAt(baseUrl, '/api/world-rift/contributions', {
    token,
    data: payload,
  });
}

async function claimWorldReward(token, milestoneId, payload, baseUrl = BASE_URL) {
  return signedRequestAt(baseUrl, `/api/world-rift/rewards/${encodeURIComponent(milestoneId)}/claim`, {
    token,
    data: payload,
  });
}

async function getWorldOpsOverview({ token, opsToken } = {}, baseUrl = BASE_URL) {
  return requestAt(baseUrl, '/api/world-rift/ops/overview', {
    method: 'GET',
    token,
    headers: opsToken ? { 'x-defier-ops-token': opsToken } : {},
  });
}

async function startDirectAuthoritativeWorldRift(token, clientRunId = `${nextId('run')}-direct`) {
  return signedRequest('/api/progression/authoritative-runs', {
    token,
    data: {
      clientRunId,
      mode: 'world_rift',
      contentVersion: CONTENT_VERSION,
    },
  });
}

function pickRotationId(currentPayload) {
  const candidates = [
    currentPayload?.rotation?.rotationId,
    currentPayload?.currentRotation?.rotationId,
    currentPayload?.rotationId,
  ].filter(Boolean);
  if (candidates.length === 0) {
    throw new Error(`world rift current payload does not expose a rotation id: ${JSON.stringify(currentPayload)}`);
  }
  return candidates[0];
}

function pickAttempt(responsePayload) {
  const attempt = responsePayload?.attempt || responsePayload?.currentAttempt || responsePayload?.data?.attempt;
  if (!attempt || typeof attempt !== 'object') {
    throw new Error(`world rift attempt payload is missing the durable attempt projection: ${JSON.stringify(responsePayload)}`);
  }
  return attempt;
}

function pickBoundRun(responsePayload) {
  const run = responsePayload?.run
    || responsePayload?.attempt?.run
    || responsePayload?.attempt?.authoritativeRun
    || responsePayload?.currentAttempt?.run;
  if (!run || typeof run !== 'object') {
    throw new Error(`world rift payload is missing the bound authoritative run: ${JSON.stringify(responsePayload)}`);
  }
  return run;
}

function pickCurrentAttempt(currentPayload) {
  return currentPayload?.resumableAttempt
    || currentPayload?.currentAttempt
    || currentPayload?.recoverableAttempt
    || currentPayload?.attempt
    || null;
}

async function driveRun(token, run, { maxSteps = 320 } = {}) {
  let currentRun = run;
  const actions = [];
  while (String(currentRun.status || '') === 'active' && actions.length < maxSteps) {
    const [command, payload] = chooseCommandFromProjection(currentRun.projection || currentRun.state);
    const response = await submitAction(
      token,
      currentRun.runId,
      Number(currentRun.stateVersion),
      command,
      payload,
    );
    assert.strictEqual(response.status, 200, JSON.stringify(response.payload));
    actions.push(response.payload.action);
    currentRun = response.payload.run;
  }
  return { run: currentRun, actions };
}

async function completeWorldRiftAttempt(account, attemptStartResponse, { submitContribution = true, submitBaseUrl = BASE_URL } = {}) {
  const attempt = pickAttempt(attemptStartResponse.payload);
  const boundRun = pickBoundRun(attemptStartResponse.payload);
  const driven = await driveRun(account.token, boundRun);
  const completedRun = driven.run;
  assert.strictEqual(completedRun.status, 'completed', 'world rift bound run should complete before contribution submission');
  const settled = await settleAuthoritativeRun(
    account.token,
    completedRun.runId,
    Number(completedRun.stateVersion),
  );
  assert.strictEqual(settled.status, 200, JSON.stringify(settled.payload));
  if (!submitContribution) {
    return { attempt, run: completedRun, authoritativeReceipt: settled.payload?.receipt || null, contributionResponse: null };
  }
  const submitMutationId = `${nextId('mutation')}-submit`;
  const submitted = await submitWorldContribution(account.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: completedRun.runId,
    mutationId: submitMutationId,
  }, submitBaseUrl);
  assert.strictEqual(submitted.status, 200, JSON.stringify(submitted.payload));
  return { attempt, run: completedRun, authoritativeReceipt: settled.payload?.receipt || null, contributionResponse: submitted };
}

async function assertV8SchemaReady() {
  const version = await request('/api/version');
  assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
  const actualVersion = Number(version.payload?.schema?.version);
  const actualMigration = String(version.payload?.schema?.currentMigrationId || '');
  const presentTables = new Set(
    (await dbAll(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'world_rift_%' ORDER BY name ASC`,
    )).map(row => String(row.name || '')),
  );
  const missingTables = EXPECTED_TABLES.filter(name => !presentTables.has(name));
  if (actualVersion !== EXPECTED_SCHEMA_VERSION || actualMigration !== EXPECTED_MIGRATION_ID || missingTables.length > 0) {
    const applied = (version.payload?.schema?.appliedMigrations || []).map(entry => entry.id).join(', ');
    throw new Error(
      [
        'world rift platform schema is not bootstrapped yet.',
        `Expected schema ${EXPECTED_SCHEMA_VERSION}/${EXPECTED_MIGRATION_ID}, got ${actualVersion}/${actualMigration || 'unknown'}.`,
        `Missing tables: ${missingTables.length > 0 ? missingTables.join(', ') : 'none'}.`,
        `Applied migrations: ${applied || 'none'}.`,
      ].join(' '),
    );
  }
}

async function getCurrentRotationRow() {
  return dbGet(`SELECT * FROM world_rift_rotations ORDER BY starts_at DESC LIMIT 1`);
}

async function getPreviousRotationRow(currentRotationId) {
  return dbGet(
    `SELECT * FROM world_rift_rotations
     WHERE rotation_id <> ?
     ORDER BY starts_at DESC LIMIT 1`,
    [currentRotationId],
  );
}

async function setWorldState(rotationId, {
  appliedDamage,
  totalContribution,
  currentPhaseIndex,
  clearedAt = 0,
  phaseUnlocks = {},
  stateVersion = 0,
  lastContributionId = '',
  lastResultAt = Date.now(),
}) {
  await dbRun(
    `UPDATE world_rift_states
     SET applied_damage = ?, total_contribution = ?, current_phase_index = ?, cleared_at = ?,
         phase_unlocks_json = ?, state_version = ?, last_contribution_id = ?, last_result_at = ?, updated_at = ?
     WHERE rotation_id = ?`,
    [
      Number(appliedDamage),
      Number(totalContribution),
      Number(currentPhaseIndex),
      Number(clearedAt),
      JSON.stringify(phaseUnlocks),
      Number(stateVersion),
      String(lastContributionId || ''),
      Number(lastResultAt),
      Date.now(),
      rotationId,
    ],
  );
}

async function tamperReceiptResult(runId, resultValue) {
  const row = await dbGet(
    `SELECT receipt_json
     FROM progression_authoritative_run_receipts
     WHERE run_id = ?`,
    [runId],
  );
  assert(row, `missing authoritative receipt for ${runId}`);
  const payload = JSON.parse(row.receipt_json);
  payload.summary = payload.summary || {};
  payload.summary.result = resultValue;
  await dbRun(
    `UPDATE progression_authoritative_run_receipts
     SET receipt_json = ?
     WHERE run_id = ?`,
    [JSON.stringify(payload), runId],
  );
}

async function insertPreviousClaimFixture(userId, rotationId) {
  const now = Date.now() - 60_000;
  const contributionId = `rift-prev-contribution-${crypto.randomUUID().slice(0, 8)}`;
  await setWorldState(rotationId, {
    appliedDamage: 2400,
    totalContribution: 2400,
    currentPhaseIndex: 2,
    phaseUnlocks: {
      'global-phase-1': now,
      'global-phase-2': 0,
      'global-phase-3': 0,
    },
    stateVersion: 1,
    lastContributionId: contributionId,
    lastResultAt: now,
  });
  await dbRun(
    `INSERT INTO world_rift_contributions
      (contribution_id, attempt_id, run_id, receipt_id, user_id, rotation_id, score, turns, remaining_hp,
       survival_bonus, tempo_bonus, contribution, applied_damage, echo_contribution, previous_phase_index,
       next_phase_index, previous_applied_damage, next_applied_damage, state_version, mutation_hash,
       summary_json, receipt_json, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, 420, 11, 26, 78, 105, 2000, 2000, 0, 1, 2, 400, 2400, 1, ?, ?, ?, ?)`,
    [
      contributionId,
      `rift-prev-attempt-${crypto.randomUUID().slice(0, 8)}`,
      `rift-prev-run-${crypto.randomUUID().slice(0, 8)}`,
      `rift-prev-receipt-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      rotationId,
      crypto.createHash('sha256').update(contributionId).digest('hex'),
      JSON.stringify({ score: 420, turns: 11, remainingHp: 26, result: 'completed', contribution: 2000 }),
      JSON.stringify({ receiptId: contributionId }),
      now,
    ],
  );
  await dbRun(
    `INSERT INTO world_rift_entries
      (rotation_id, user_id, entry_id, ranked_contribution, best_contribution, ranked_remaining_hp,
       ranked_turns, total_contribution, completed_attempts, updated_at)
     VALUES (?, ?, ?, 2000, 2000, 26, 11, 2000, 1, ?)`,
    [
      rotationId,
      userId,
      `rift-prev-entry-${crypto.randomUUID().slice(0, 8)}`,
      now,
    ],
  );
}

async function runCoverage() {
  const primary = await registerAndLogin('rift-primary');
  const secondary = await registerAndLogin('rift-secondary');
  const autoProjectUser = await registerAndLogin('rift-autoproject');
  const tamperUser = await registerAndLogin('rift-tamper');
  const overflowUser = await registerAndLogin('rift-overflow');
  const clearUser = await registerAndLogin('rift-clear');
  const echoUser = await registerAndLogin('rift-echo');

  const unauthenticatedCurrent = await getWorldCurrent();
  assert.strictEqual(unauthenticatedCurrent.status, 401, 'world rift current should require JWT');

  const opsHidden = await getWorldOpsOverview();
  assert.strictEqual(opsHidden.status, 401, 'ops overview should authenticate the actor before checking the ops token');
  const opsDenied = await getWorldOpsOverview({ opsToken: 'wrong-token' });
  assert.strictEqual(opsDenied.status, 401, 'unauthenticated callers must not get an ops-token validity oracle');
  const opsNeedsIdentity = await getWorldOpsOverview({ opsToken: OPS_TOKEN });
  assert.strictEqual(opsNeedsIdentity.status, 401, 'valid ops token must still require a JWT actor');

  const directWorldRiftStart = await startDirectAuthoritativeWorldRift(primary.token);
  assert.notStrictEqual(directWorldRiftStart.status, 200, 'plain authoritative-runs start must not create world_rift mode');
  assert.strictEqual(directWorldRiftStart.payload?.reason, 'world_rift_start_required');

  const primaryCurrent = await getWorldCurrent(primary.token);
  assert.strictEqual(primaryCurrent.status, 200, JSON.stringify(primaryCurrent.payload));
  const currentRotationId = pickRotationId(primaryCurrent.payload);
  assert.strictEqual(primaryCurrent.payload?.allowance?.attemptLimit, 5, 'current should expose 5 weekly attempts');
  assert.strictEqual(primaryCurrent.payload?.rotation?.seedSlotCount, 5, 'current should expose 5 shared seed slots');
  assert.strictEqual(primaryCurrent.payload?.world?.totalHp, 10000, 'world total hp must match the authoritative catalog');

  const currentRotation = await getCurrentRotationRow();
  assert.strictEqual(currentRotation.rotation_id, currentRotationId);
  const previousRotation = await getPreviousRotationRow(currentRotationId);
  assert(previousRotation, 'bootstrap should retain the previous rotation for claim recovery');

  await insertPreviousClaimFixture(primary.userId, previousRotation.rotation_id);
  await dbRun(
    `INSERT INTO world_rift_attempts
      (attempt_id, user_id, rotation_id, client_attempt_id, mutation_id, request_hash, request_body_json,
       attempt_index, seed_slot, seed_fingerprint, client_run_id, run_id, status, reserved_at,
       started_at, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '{}', 5, 5, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
    [
      `rift-closed-attempt-${crypto.randomUUID().slice(0, 8)}`,
      primary.userId,
      previousRotation.rotation_id,
      `rift-closed-client-${crypto.randomUUID().slice(0, 8)}`,
      `rift-closed-mutation-${crypto.randomUUID().slice(0, 8)}`,
      crypto.createHash('sha256').update('closed-claim-window-attempt').digest('hex'),
      `rift-closed-fingerprint-${crypto.randomUUID().slice(0, 8)}`,
      `rift-closed-client-run-${crypto.randomUUID().slice(0, 8)}`,
      `rift-closed-run-${crypto.randomUUID().slice(0, 8)}`,
      Number(previousRotation.starts_at) + 1000,
      Number(previousRotation.ends_at) - 1000,
      Number(previousRotation.ends_at) - 500,
      Date.now(),
    ],
  );
  const previousClaimCurrent = await getWorldCurrent(primary.token);
  assert.strictEqual(previousClaimCurrent.status, 200, JSON.stringify(previousClaimCurrent.payload));
  assert.notStrictEqual(
    previousClaimCurrent.payload?.resumableAttempt?.rotationId,
    previousRotation.rotation_id,
    'claim-only rotations must not expose or auto-project stale authoritative attempts after settlement grace',
  );
  assert.strictEqual(previousClaimCurrent.payload?.previousClaim?.rotation?.rotationId, previousRotation.rotation_id);
  const previousClaimMilestone = (previousClaimCurrent.payload?.previousClaim?.milestones || []).find(entry => entry.claimable === true);
  assert(previousClaimMilestone, 'current should surface claimable milestones from the previous rotation claim window');
  const previousClaimResponse = await claimWorldReward(primary.token, previousClaimMilestone.milestoneId, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: previousRotation.rotation_id,
    milestoneId: previousClaimMilestone.milestoneId,
    mutationId: `${nextId('mutation')}-previous-claim`,
  });
  assert.strictEqual(previousClaimResponse.status, 200, JSON.stringify(previousClaimResponse.payload));

  const firstPrimaryStart = await startWorldAttempt(primary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-primary-1`,
    mutationId: `${nextId('mutation')}-primary-1`,
  });
  assert.strictEqual(firstPrimaryStart.status, 200, JSON.stringify(firstPrimaryStart.payload));
  const firstSecondaryStart = await startWorldAttempt(secondary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-secondary-1`,
    mutationId: `${nextId('mutation')}-secondary-1`,
  }, SECONDARY_BASE_URL);
  assert.strictEqual(firstSecondaryStart.status, 200, JSON.stringify(firstSecondaryStart.payload));
  assert.strictEqual(
    pickAttempt(firstPrimaryStart.payload).seedFingerprint,
    pickAttempt(firstSecondaryStart.payload).seedFingerprint,
    'all accounts should receive the same seed fingerprint for the same attempt index',
  );

  const autoProjectStart = await startWorldAttempt(autoProjectUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-autoproject-1`,
    mutationId: `${nextId('mutation')}-autoproject-1`,
  });
  assert.strictEqual(autoProjectStart.status, 200, JSON.stringify(autoProjectStart.payload));
  await completeWorldRiftAttempt(autoProjectUser, autoProjectStart, { submitContribution: false });
  const autoProjectedCurrent = await getWorldCurrent(autoProjectUser.token);
  assert.strictEqual(autoProjectedCurrent.status, 200, JSON.stringify(autoProjectedCurrent.payload));
  assert.strictEqual(pickCurrentAttempt(autoProjectedCurrent.payload), null, 'current should auto-project settled-but-unsubmitted world rift runs');
  const autoProjectedCount = await dbGet(
    `SELECT COUNT(*) AS count FROM world_rift_contributions WHERE user_id = ? AND rotation_id = ?`,
    [autoProjectUser.userId, currentRotationId],
  );
  assert.strictEqual(Number(autoProjectedCount?.count), 1, 'current auto-projection should persist exactly one contribution fact');

  const tamperStart = await startWorldAttempt(tamperUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-tamper-1`,
    mutationId: `${nextId('mutation')}-tamper-1`,
  });
  assert.strictEqual(tamperStart.status, 200, JSON.stringify(tamperStart.payload));
  const tamperCompleted = await completeWorldRiftAttempt(tamperUser, tamperStart, { submitContribution: false });
  await tamperReceiptResult(tamperCompleted.run.runId, 'defeated');
  const tamperedSubmit = await submitWorldContribution(tamperUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: tamperCompleted.run.runId,
    mutationId: `${nextId('mutation')}-tampered-submit`,
  });
  expectReason(tamperedSubmit, 409, 'world_rift_receipt_incomplete');

  const primaryPending = await completeWorldRiftAttempt(primary, firstPrimaryStart, { submitContribution: false });
  const secondaryPending = await completeWorldRiftAttempt(secondary, firstSecondaryStart, { submitContribution: false });
  const stateBeforeConcurrent = await dbGet(
    `SELECT applied_damage, total_contribution, state_version FROM world_rift_states WHERE rotation_id = ?`,
    [currentRotationId],
  );
  const contributionCountBefore = await dbGet(`SELECT COUNT(*) AS count FROM world_rift_contributions WHERE rotation_id = ?`, [currentRotationId]);
  const [primarySubmitted, secondarySubmitted] = await Promise.all([
    submitWorldContribution(primary.token, {
      protocolVersion: PROTOCOL_VERSION,
      runId: primaryPending.run.runId,
      mutationId: `${nextId('mutation')}-primary-submit`,
    }, BASE_URL),
    submitWorldContribution(secondary.token, {
      protocolVersion: PROTOCOL_VERSION,
      runId: secondaryPending.run.runId,
      mutationId: `${nextId('mutation')}-secondary-submit`,
    }, SECONDARY_BASE_URL),
  ]);
  assert.strictEqual(primarySubmitted.status, 200, JSON.stringify(primarySubmitted.payload));
  assert.strictEqual(secondarySubmitted.status, 200, JSON.stringify(secondarySubmitted.payload));
  const stateAfterConcurrent = await dbGet(
    `SELECT applied_damage, total_contribution, state_version FROM world_rift_states WHERE rotation_id = ?`,
    [currentRotationId],
  );
  const contributionCountAfter = await dbGet(`SELECT COUNT(*) AS count FROM world_rift_contributions WHERE rotation_id = ?`, [currentRotationId]);
  const primaryContribution = Number(primarySubmitted.payload?.contribution?.contribution || 0);
  const secondaryContribution = Number(secondarySubmitted.payload?.contribution?.contribution || 0);
  const primaryAppliedDamage = Number(primarySubmitted.payload?.contribution?.appliedDamage || 0);
  const secondaryAppliedDamage = Number(secondarySubmitted.payload?.contribution?.appliedDamage || 0);
  assert.strictEqual(Number(contributionCountAfter?.count), Number(contributionCountBefore?.count) + 2, 'two concurrent contributions must each be recorded exactly once');
  assert.strictEqual(
    Number(stateAfterConcurrent?.state_version),
    Number(stateBeforeConcurrent?.state_version) + 2,
    'state version should advance once per first projected contribution',
  );
  assert.strictEqual(
    Number(stateAfterConcurrent?.applied_damage),
    Number(stateBeforeConcurrent?.applied_damage) + primaryAppliedDamage + secondaryAppliedDamage,
    'concurrent contributions must not lose applied world damage',
  );
  assert.strictEqual(
    Number(stateAfterConcurrent?.total_contribution),
    Number(stateBeforeConcurrent?.total_contribution) + primaryContribution + secondaryContribution,
    'concurrent contributions must not lose personal/world contribution totals',
  );

  const duplicateSubmit = await submitWorldContribution(primary.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: primaryPending.run.runId,
    mutationId: `${nextId('mutation')}-primary-duplicate`,
  }, SECONDARY_BASE_URL);
  assert.strictEqual(duplicateSubmit.status, 200, JSON.stringify(duplicateSubmit.payload));
  assert.strictEqual(duplicateSubmit.payload?.idempotent, true, 'resubmitting the same run must return the existing contribution fact');
  const contributionCountAfterDuplicate = await dbGet(`SELECT COUNT(*) AS count FROM world_rift_contributions WHERE rotation_id = ?`, [currentRotationId]);
  assert.strictEqual(Number(contributionCountAfterDuplicate?.count), Number(contributionCountAfter?.count), 'same run must only be applied once');

  const invalidPayloadSubmit = await signedRequest('/api/world-rift/contributions', {
    token: primary.token,
    data: {
      protocolVersion: PROTOCOL_VERSION,
      runId: primaryPending.run.runId,
      mutationId: `${nextId('mutation')}-invalid-payload`,
      phase: 2,
    },
  });
  expectReason(invalidPayloadSubmit, 400, 'invalid_request_payload');

  const overflowStart = await startWorldAttempt(overflowUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-overflow-1`,
    mutationId: `${nextId('mutation')}-overflow-1`,
  });
  assert.strictEqual(overflowStart.status, 200, JSON.stringify(overflowStart.payload));
  const overflowPending = await completeWorldRiftAttempt(overflowUser, overflowStart, { submitContribution: false });
  await setWorldState(currentRotationId, {
    appliedDamage: 2390,
    totalContribution: 5000,
    currentPhaseIndex: 1,
    phaseUnlocks: {
      'global-phase-1': 0,
      'global-phase-2': 0,
      'global-phase-3': 0,
    },
    stateVersion: 11,
  });
  const overflowSubmitted = await submitWorldContribution(overflowUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: overflowPending.run.runId,
    mutationId: `${nextId('mutation')}-overflow-submit`,
  });
  assert.strictEqual(overflowSubmitted.status, 200, JSON.stringify(overflowSubmitted.payload));
  assert.strictEqual(overflowSubmitted.payload?.contribution?.previousPhaseIndex, 1, 'overflow submission should start in phase 1');
  assert.strictEqual(overflowSubmitted.payload?.contribution?.nextPhaseIndex, 2, 'overflow submission should spill into phase 2');
  assert(overflowSubmitted.payload?.contribution?.nextAppliedDamage > 2400, 'overflow submission should advance past the phase 1 threshold');

  const clearStart = await startWorldAttempt(clearUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-clear-1`,
    mutationId: `${nextId('mutation')}-clear-1`,
  });
  assert.strictEqual(clearStart.status, 200, JSON.stringify(clearStart.payload));
  const clearPending = await completeWorldRiftAttempt(clearUser, clearStart, { submitContribution: false });
  await setWorldState(currentRotationId, {
    appliedDamage: 9990,
    totalContribution: 9000,
    currentPhaseIndex: 3,
    phaseUnlocks: {
      'global-phase-1': Date.now() - 5000,
      'global-phase-2': Date.now() - 3000,
      'global-phase-3': 0,
    },
    stateVersion: 21,
  });
  const clearSubmitted = await submitWorldContribution(clearUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: clearPending.run.runId,
    mutationId: `${nextId('mutation')}-clear-submit`,
  });
  assert.strictEqual(clearSubmitted.status, 200, JSON.stringify(clearSubmitted.payload));
  assert.strictEqual(clearSubmitted.payload?.contribution?.appliedDamage, 10, 'clearing submission should only apply the remaining 10 hp');
  assert.strictEqual(clearSubmitted.payload?.world?.remainingHp, 0, 'world hp must never become negative');
  assert(clearSubmitted.payload?.world?.clearedAt > 0, 'clearing submission should set clearedAt');
  assert.strictEqual(clearSubmitted.payload?.contribution?.nextAppliedDamage, 10000, 'clearing submission should cap applied damage at total hp');

  const echoStart = await startWorldAttempt(echoUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-echo-1`,
    mutationId: `${nextId('mutation')}-echo-1`,
  });
  assert.strictEqual(echoStart.status, 200, JSON.stringify(echoStart.payload));
  const echoPending = await completeWorldRiftAttempt(echoUser, echoStart, { submitContribution: false });
  const stateBeforeEcho = await dbGet(
    `SELECT applied_damage, total_contribution FROM world_rift_states WHERE rotation_id = ?`,
    [currentRotationId],
  );
  const echoSubmitted = await submitWorldContribution(echoUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: echoPending.run.runId,
    mutationId: `${nextId('mutation')}-echo-submit`,
  }, SECONDARY_BASE_URL);
  assert.strictEqual(echoSubmitted.status, 200, JSON.stringify(echoSubmitted.payload));
  assert.strictEqual(echoSubmitted.payload?.contribution?.appliedDamage, 0, 'echo submission must not apply extra world damage after clear');
  assert(echoSubmitted.payload?.contribution?.echoContribution > 0, 'echo submission should retain personal contribution in echo state');
  const stateAfterEcho = await dbGet(
    `SELECT applied_damage, total_contribution FROM world_rift_states WHERE rotation_id = ?`,
    [currentRotationId],
  );
  assert.strictEqual(Number(stateAfterEcho?.applied_damage), Number(stateBeforeEcho?.applied_damage), 'echo submissions must not change cleared world damage');
  assert.strictEqual(
    Number(stateAfterEcho?.total_contribution),
    Number(stateBeforeEcho?.total_contribution) + Number(echoSubmitted.payload?.contribution?.contribution || 0),
    'echo submissions must still count toward total contribution',
  );

  const claimCurrent = await getWorldCurrent(primary.token);
  assert.strictEqual(claimCurrent.status, 200, JSON.stringify(claimCurrent.payload));
  const claimableCurrentMilestone = (claimCurrent.payload?.milestones || []).find(entry => entry.claimable === true);
  assert(claimableCurrentMilestone, 'primary account should have at least one current rotation claimable milestone');
  const [claimA, claimB] = await Promise.all([
    claimWorldReward(primary.token, claimableCurrentMilestone.milestoneId, {
      protocolVersion: PROTOCOL_VERSION,
      rotationId: currentRotationId,
      milestoneId: claimableCurrentMilestone.milestoneId,
      mutationId: `${nextId('mutation')}-claim-a`,
    }, BASE_URL),
    claimWorldReward(primary.token, claimableCurrentMilestone.milestoneId, {
      protocolVersion: PROTOCOL_VERSION,
      rotationId: currentRotationId,
      milestoneId: claimableCurrentMilestone.milestoneId,
      mutationId: `${nextId('mutation')}-claim-b`,
    }, SECONDARY_BASE_URL),
  ]);
  assert.strictEqual(claimA.status, 200, JSON.stringify(claimA.payload));
  assert.strictEqual(claimB.status, 200, JSON.stringify(claimB.payload));
  const claimRows = await dbAll(
    `SELECT claim_id FROM world_rift_reward_claims WHERE user_id = ? AND rotation_id = ? AND milestone_id = ?`,
    [primary.userId, currentRotationId, claimableCurrentMilestone.milestoneId],
  );
  const ledgerRows = await dbAll(
    `SELECT entry_id FROM progression_economy_ledger WHERE user_id = ? AND source_type = 'world_rift_reward' AND source_id = ?`,
    [primary.userId, `world_rift:${currentRotationId}:${claimableCurrentMilestone.milestoneId}`],
  );
  assert.strictEqual(claimRows.length, 1, 'concurrent claim requests must persist one claim fact');
  assert.strictEqual(ledgerRows.length, 1, 'concurrent claim requests must write one ledger entry');

  const cutoffStartUser = await registerAndLogin('rift-cutoff-start');
  const startDeadline = Date.now() + 1000;
  await dbRun(
    `UPDATE world_rift_rotations SET ends_at = ? WHERE rotation_id = ?`,
    [startDeadline, currentRotationId],
  );
  try {
    const lateStart = await requestAcrossDeadline(startDeadline, () => startWorldAttempt(cutoffStartUser.token, {
      protocolVersion: PROTOCOL_VERSION,
      rotationId: currentRotationId,
      clientAttemptId: `${nextId('attempt')}-cutoff-start`,
      mutationId: `${nextId('mutation')}-cutoff-start`,
    }));
    expectReason(lateStart, 409, 'world_rift_start_window_closed');
    const lateStartAttempts = await dbGet(
      `SELECT COUNT(*) AS count FROM world_rift_attempts WHERE user_id = ? AND rotation_id = ?`,
      [cutoffStartUser.userId, currentRotationId],
    );
    assert.strictEqual(Number(lateStartAttempts?.count), 0, 'start requests queued across endsAt must be rejected after the write lock is acquired');
  } finally {
    await dbRun(
      `UPDATE world_rift_rotations SET ends_at = ? WHERE rotation_id = ?`,
      [Number(currentRotation.ends_at), currentRotationId],
    );
  }

  const cutoffSubmitUser = await registerAndLogin('rift-cutoff-submit');
  const cutoffSubmitStart = await startWorldAttempt(cutoffSubmitUser.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: currentRotationId,
    clientAttemptId: `${nextId('attempt')}-cutoff-submit`,
    mutationId: `${nextId('mutation')}-cutoff-submit-start`,
  });
  assert.strictEqual(cutoffSubmitStart.status, 200, JSON.stringify(cutoffSubmitStart.payload));
  const cutoffPending = await completeWorldRiftAttempt(cutoffSubmitUser, cutoffSubmitStart, { submitContribution: false });
  const contributionDeadline = Date.now() + 1000;
  await dbRun(
    `UPDATE world_rift_rotations SET grace_ends_at = ? WHERE rotation_id = ?`,
    [contributionDeadline, currentRotationId],
  );
  try {
    const lateContribution = await requestAcrossDeadline(contributionDeadline, () => submitWorldContribution(cutoffSubmitUser.token, {
      protocolVersion: PROTOCOL_VERSION,
      runId: cutoffPending.run.runId,
      mutationId: `${nextId('mutation')}-cutoff-submit-late`,
    }));
    expectReason(lateContribution, 409, 'world_rift_settlement_window_closed');
    const lateContributionRows = await dbGet(
      `SELECT COUNT(*) AS count FROM world_rift_contributions WHERE user_id = ? AND run_id = ?`,
      [cutoffSubmitUser.userId, cutoffPending.run.runId],
    );
    assert.strictEqual(Number(lateContributionRows?.count), 0, 'contribution requests queued across graceEndsAt must not commit late world state');
  } finally {
    await dbRun(
      `UPDATE world_rift_rotations SET grace_ends_at = ? WHERE rotation_id = ?`,
      [Number(currentRotation.grace_ends_at), currentRotationId],
    );
  }

  const cutoffClaimCurrent = await getWorldCurrent(echoUser.token);
  assert.strictEqual(cutoffClaimCurrent.status, 200, JSON.stringify(cutoffClaimCurrent.payload));
  const cutoffClaimMilestone = (cutoffClaimCurrent.payload?.milestones || []).find(entry => entry.claimable === true);
  assert(cutoffClaimMilestone, 'echo user should retain an unclaimed milestone for the claim cutoff race');
  const claimDeadline = Date.now() + 1000;
  await dbRun(
    `UPDATE world_rift_rotations SET claim_ends_at = ? WHERE rotation_id = ?`,
    [claimDeadline, currentRotationId],
  );
  try {
    const lateClaim = await requestAcrossDeadline(claimDeadline, () => claimWorldReward(echoUser.token, cutoffClaimMilestone.milestoneId, {
      protocolVersion: PROTOCOL_VERSION,
      rotationId: currentRotationId,
      milestoneId: cutoffClaimMilestone.milestoneId,
      mutationId: `${nextId('mutation')}-cutoff-claim-late`,
    }));
    expectReason(lateClaim, 409, 'world_rift_claim_window_closed');
    const lateClaimRows = await dbGet(
      `SELECT COUNT(*) AS count FROM world_rift_reward_claims WHERE user_id = ? AND rotation_id = ? AND milestone_id = ?`,
      [echoUser.userId, currentRotationId, cutoffClaimMilestone.milestoneId],
    );
    const lateClaimLedgerRows = await dbGet(
      `SELECT COUNT(*) AS count FROM progression_economy_ledger WHERE user_id = ? AND source_type = 'world_rift_reward' AND source_id = ?`,
      [echoUser.userId, `world_rift:${currentRotationId}:${cutoffClaimMilestone.milestoneId}`],
    );
    assert.strictEqual(Number(lateClaimRows?.count), 0, 'reward claims queued across claimEndsAt must not persist a late claim');
    assert.strictEqual(Number(lateClaimLedgerRows?.count), 0, 'reward claims queued across claimEndsAt must not mint late ledger entries');
  } finally {
    await dbRun(
      `UPDATE world_rift_rotations SET claim_ends_at = ? WHERE rotation_id = ?`,
      [Number(currentRotation.claim_ends_at), currentRotationId],
    );
  }

  const opsOverview = await getWorldOpsOverview({ token: primary.token, opsToken: OPS_TOKEN }, SECONDARY_BASE_URL);
  assert.strictEqual(opsOverview.status, 200, JSON.stringify(opsOverview.payload));
  const opsSerialized = JSON.stringify(opsOverview.payload);
  assert(!opsSerialized.includes(primary.userId), 'ops overview must stay account-id redacted');
  assert(!/[a-f0-9]{64}/.test(opsSerialized), 'ops overview must not leak raw 64-hex seeds or receipts');
}

async function main() {
  removeDbFiles();
  const primaryServer = startServer(PORT);
  const secondaryServer = startServer(SECONDARY_PORT);
  try {
    await waitForHealth(primaryServer, BASE_URL);
    await waitForHealth(secondaryServer, SECONDARY_BASE_URL);
    await assertV8SchemaReady();
    await runCoverage();
    console.log('sanity_world_rift_platform_checks passed');
  } finally {
    await stopServer(primaryServer);
    await stopServer(secondaryServer);
    removeDbFiles();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
