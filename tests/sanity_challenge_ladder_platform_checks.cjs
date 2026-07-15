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

const PORT = Number(process.env.CHALLENGE_LADDER_PLATFORM_TEST_PORT || 9063);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SECONDARY_PORT = Number(process.env.CHALLENGE_LADDER_PLATFORM_SECONDARY_TEST_PORT || PORT + 1);
const SECONDARY_BASE_URL = `http://127.0.0.1:${SECONDARY_PORT}`;
const DB_PATH = process.env.CHALLENGE_LADDER_PLATFORM_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-challenge-ladder-platform-${process.pid}.sqlite`);
const JWT_SECRET = 'challenge-ladder-platform-jwt-secret-32';
const HMAC_SECRET = 'challenge-ladder-platform-hmac-secret-32';
const OPS_TOKEN = 'challenge-ladder-platform-ops-token-32';
const PROTOCOL_VERSION = 'authoritative-challenge-ladder-v1';
const EXPECTED_SCHEMA_VERSION = 12;
const EXPECTED_MIGRATION_ID = '0012_world_rift_campaign_directives';
const EXPECTED_TABLES = [
  'challenge_ladder_rotations',
  'challenge_ladder_attempts',
  'challenge_ladder_results',
  'challenge_ladder_entries',
  'challenge_ladder_reward_claims',
  'challenge_ladder_mutations',
  'challenge_ladder_ops_events',
  'challenge_ladder_ops_counters',
];
const BLOCK_CARDS = new Set(['guard', 'iron_mandate', 'ember_riposte', 'mirror_breath', 'warding_stride']);
const DAMAGE_CARDS = new Set([
  'strike',
  'sky_pierce',
  'life_siphon',
  'fracture',
  'ember_riposte',
  'severing_flow',
  'archive_surge',
  'sealbreaker',
]);

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
  return `acl-${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
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
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: OPS_TOKEN,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: 'challenge-ladder-platform-test-sha',
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
      throw new Error(`challenge ladder backend exited early\n${server.getOutput()}`);
    }
    try {
      const response = await requestAt(baseUrl, '/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') return response;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`challenge ladder backend health timed out\n${server.getOutput()}`);
}

function signSessionPayload(data, token, salt = `aclsig-${crypto.randomBytes(12).toString('hex')}`) {
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
  const username = `${String(tag || 'ladder').slice(0, 8)}-${Date.now().toString(36)}`;
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
  const enemyBlock = Number(projection.battle?.enemy?.block || 0);
  const tactic = projection.battle?.tactic;
  const requirements = Array.isArray(tactic?.requirements) ? tactic.requirements : [];
  const blockRequirement = requirements.find(requirement => requirement.metric === 'blockGained');
  const damageRequirement = requirements.find(requirement => requirement.metric === 'damageDealt');
  const needsBlock = blockRequirement && !blockRequirement.met;
  const needsDamage = damageRequirement && !damageRequirement.met;
  const effectiveIncomingDamage = Math.max(
    0,
    incomingDamage - (tactic?.completed ? Number(tactic.effects?.damageReduction || 0) : 0),
  );
  const cards = projection.player.hand.slice().sort((left, right) => {
    const leftBlocks = BLOCK_CARDS.has(left.cardId) ? 1 : 0;
    const rightBlocks = BLOCK_CARDS.has(right.cardId) ? 1 : 0;
    const leftDamages = DAMAGE_CARDS.has(left.cardId) ? 1 : 0;
    const rightDamages = DAMAGE_CARDS.has(right.cardId) ? 1 : 0;
    const tacticOrder = needsBlock
      ? rightBlocks - leftBlocks
      : needsDamage
        ? rightDamages - leftDamages
        : 0;
    const defenseOrder = effectiveIncomingDamage > projection.player.block
      ? rightBlocks - leftBlocks
      : leftBlocks - rightBlocks;
    return tacticOrder || defenseOrder || right.cost - left.cost || left.instanceId.localeCompare(right.instanceId);
  });
  const damageIntoGuard = enemyBlock > 0
    ? cards.find(entry => DAMAGE_CARDS.has(entry.cardId) && entry.cost <= projection.player.energy)
    : null;
  const card = damageIntoGuard || cards.find(entry => entry.cost <= projection.player.energy);
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

async function getChallengeCurrent(token) {
  return request('/api/challenge-ladder/current', {
    method: 'GET',
    token,
  });
}

async function startChallengeAttempt(token, payload) {
  return signedRequest('/api/challenge-ladder/attempts', {
    token,
    data: payload,
  });
}

async function submitChallengeResult(token, payload) {
  return signedRequest('/api/challenge-ladder/results', {
    token,
    data: payload,
  });
}

async function claimChallengeReward(token, milestoneId, payload) {
  return signedRequest(`/api/challenge-ladder/rewards/${encodeURIComponent(milestoneId)}/claim`, {
    token,
    data: payload,
  });
}

async function getChallengeOpsOverview({ token, opsToken } = {}) {
  return request('/api/challenge-ladder/ops/overview', {
    method: 'GET',
    token,
    headers: opsToken ? { 'x-defier-ops-token': opsToken } : {},
  });
}

async function startDirectAuthoritativeChallengeLadder(token, clientRunId = `${nextId('run')}-direct`) {
  return signedRequest('/api/progression/authoritative-runs', {
    token,
    data: {
      clientRunId,
      mode: 'challenge_ladder',
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
    throw new Error(`challenge ladder current payload does not expose a rotation id: ${JSON.stringify(currentPayload)}`);
  }
  return candidates[0];
}

function pickAttempt(responsePayload) {
  const attempt = responsePayload?.attempt || responsePayload?.currentAttempt || responsePayload?.data?.attempt;
  if (!attempt || typeof attempt !== 'object') {
    throw new Error(`challenge ladder attempt payload is missing the durable attempt projection: ${JSON.stringify(responsePayload)}`);
  }
  return attempt;
}

function pickBoundRun(responsePayload) {
  const run = responsePayload?.run
    || responsePayload?.attempt?.run
    || responsePayload?.attempt?.authoritativeRun
    || responsePayload?.currentAttempt?.run;
  if (!run || typeof run !== 'object') {
    throw new Error(`challenge ladder payload is missing the bound authoritative run: ${JSON.stringify(responsePayload)}`);
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

function pickLeaderboard(currentPayload) {
  return currentPayload?.leaderboard?.entries
    || currentPayload?.leaderboard
    || currentPayload?.entries
    || currentPayload?.board
    || [];
}

function pickSelfRank(currentPayload) {
  return currentPayload?.leaderboard?.myRank
    || currentPayload?.myRank
    || currentPayload?.self
    || currentPayload?.selfRank
    || currentPayload?.player
    || null;
}

function pickPersonalBest(currentPayload) {
  return currentPayload?.personalBest
    || currentPayload?.best
    || currentPayload?.bestEntry
    || null;
}

function pickMilestones(currentPayload) {
  return currentPayload?.milestones
    || currentPayload?.rewards
    || [];
}

async function driveRun(token, run, { maxSteps = 256 } = {}) {
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

async function completeChallengeAttempt(account, attemptStartResponse, { submitResult = true } = {}) {
  const attempt = pickAttempt(attemptStartResponse.payload);
  const boundRun = pickBoundRun(attemptStartResponse.payload);
  const driven = await driveRun(account.token, boundRun);
  const completedRun = driven.run;
  assert.strictEqual(completedRun.status, 'completed', 'challenge ladder bound run should complete before result submission');
  const settled = await settleAuthoritativeRun(
    account.token,
    completedRun.runId,
    Number(completedRun.stateVersion),
  );
  assert.strictEqual(settled.status, 200, JSON.stringify(settled.payload));
  if (!submitResult) {
    return { attempt, run: completedRun, authoritativeReceipt: settled.payload?.receipt || null, resultResponse: null };
  }
  const resultMutationId = `${nextId('mutation')}-submit`;
  const submitted = await submitChallengeResult(account.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: completedRun.runId,
    mutationId: resultMutationId,
  });
  assert.strictEqual(submitted.status, 200, JSON.stringify(submitted.payload));
  return { attempt, run: completedRun, authoritativeReceipt: settled.payload?.receipt || null, resultResponse: submitted };
}

async function assertV7SchemaReady() {
  const version = await request('/api/version');
  assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
  const actualVersion = Number(version.payload?.schema?.version);
  const actualMigration = String(version.payload?.schema?.currentMigrationId || '');
  const presentTables = new Set(
    (await dbAll(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'challenge_ladder_%' ORDER BY name ASC`,
    )).map(row => String(row.name || '')),
  );
  const missingTables = EXPECTED_TABLES.filter(name => !presentTables.has(name));
  if (actualVersion !== EXPECTED_SCHEMA_VERSION || actualMigration !== EXPECTED_MIGRATION_ID || missingTables.length > 0) {
    const applied = (version.payload?.schema?.appliedMigrations || []).map(entry => entry.id).join(', ');
    throw new Error(
      [
        'challenge ladder platform schema is not bootstrapped yet.',
        `Expected schema ${EXPECTED_SCHEMA_VERSION}/${EXPECTED_MIGRATION_ID}, got ${actualVersion}/${actualMigration || 'unknown'}.`,
        `Missing tables: ${missingTables.length > 0 ? missingTables.join(', ') : 'none'}.`,
        `Applied migrations: ${applied || 'none'}.`,
        'This is the first expected failure before /api/challenge-ladder/* route coverage can run.',
      ].join(' '),
    );
  }
}

async function runFutureFlowCoverage() {
  const primary = await registerAndLogin('acl-primary');
  const secondary = await registerAndLogin('acl-secondary');
  const tertiary = await registerAndLogin('acl-tertiary');

  const unauthenticatedCurrent = await getChallengeCurrent();
  assert.strictEqual(unauthenticatedCurrent.status, 401, 'challenge ladder current should require JWT');

  const opsHidden = await getChallengeOpsOverview();
  assert.strictEqual(opsHidden.status, 401, 'ops overview should authenticate the actor before checking the ops token');
  const opsDenied = await getChallengeOpsOverview({ opsToken: 'wrong-token' });
  assert.strictEqual(opsDenied.status, 401, 'unauthenticated callers must not get an ops-token validity oracle');
  const opsNeedsIdentity = await getChallengeOpsOverview({ opsToken: OPS_TOKEN });
  assert.strictEqual(opsNeedsIdentity.status, 401, 'valid ops token must still require a JWT actor');

  const directChallengeLadderStart = await startDirectAuthoritativeChallengeLadder(primary.token);
  assert.notStrictEqual(directChallengeLadderStart.status, 200, 'plain authoritative-runs start must not create challenge_ladder mode');
  assert.strictEqual(directChallengeLadderStart.payload?.reason, 'challenge_ladder_start_required');

  const previousRotation = await dbGet(
    `SELECT rotation_id, ends_at
     FROM challenge_ladder_rotations
     WHERE ends_at <= ?
     ORDER BY ends_at DESC
     LIMIT 1`,
    [Date.now()],
  );
  assert(previousRotation, 'bootstrap should retain the previous rotation for settlement recovery');
  const staleAttemptId = `${nextId('attempt')}-stale-reservation`;
  await dbRun(
    `INSERT INTO challenge_ladder_attempts
      (attempt_id, user_id, rotation_id, client_attempt_id, mutation_id, request_hash, request_body_json,
       attempt_index, seed_slot, seed_fingerprint, client_run_id, status, reserved_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '{}', 1, 1, ?, ?, 'reserved', ?, ?)`,
    [
      staleAttemptId,
      primary.userId,
      previousRotation.rotation_id,
      `${nextId('attempt')}-stale-client`,
      `${nextId('mutation')}-stale-start`,
      crypto.createHash('sha256').update(staleAttemptId).digest('hex'),
      'stale-seed-fingerprint',
      `${nextId('run')}-stale-client-run`,
      Number(previousRotation.ends_at) - 1,
      Number(previousRotation.ends_at) - 1,
    ],
  );

  const current = await getChallengeCurrent(primary.token);
  assert.strictEqual(current.status, 200, JSON.stringify(current.payload));
  assert.strictEqual(pickCurrentAttempt(current.payload), null, 'an unlaunched reservation must expire when its rotation closes');
  const expiredReservation = await dbGet(
    'SELECT status, terminal_at FROM challenge_ladder_attempts WHERE attempt_id = ?',
    [staleAttemptId],
  );
  assert.strictEqual(expiredReservation?.status, 'expired');
  assert.strictEqual(Number(expiredReservation?.terminal_at), Number(previousRotation.ends_at));
  assert.strictEqual(current.payload?.protocolVersion, PROTOCOL_VERSION);
  const rotationId = pickRotationId(current.payload);
  assert.strictEqual(typeof rotationId, 'string');
  assert(rotationId.length > 0, 'current rotation id should be non-empty');

  const sameAttemptPayload = {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-primary`,
    mutationId: `${nextId('mutation')}-start-primary`,
  };
  const firstStart = await startChallengeAttempt(primary.token, sameAttemptPayload);
  assert.strictEqual(firstStart.status, 200, JSON.stringify(firstStart.payload));
  const replayedStart = await startChallengeAttempt(primary.token, sameAttemptPayload);
  assert.strictEqual(replayedStart.status, 200, JSON.stringify(replayedStart.payload));
  assert.strictEqual(pickAttempt(firstStart.payload).attemptId, pickAttempt(replayedStart.payload).attemptId, 'same attempt mutation should replay the same durable attempt');

  const changedMutation = await startChallengeAttempt(primary.token, {
    ...sameAttemptPayload,
    clientAttemptId: `${nextId('attempt')}-primary-conflict`,
  });
  assert.strictEqual(changedMutation.status, 409, JSON.stringify(changedMutation.payload));
  assert.strictEqual(changedMutation.payload?.reason, 'mutation_reused');

  const slotA = pickAttempt(firstStart.payload);
  const secondaryStart = await startChallengeAttempt(secondary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-secondary`,
    mutationId: `${nextId('mutation')}-start-secondary`,
  });
  assert.strictEqual(secondaryStart.status, 200, JSON.stringify(secondaryStart.payload));
  const tertiaryStart = await startChallengeAttempt(tertiary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-tertiary`,
    mutationId: `${nextId('mutation')}-start-tertiary`,
  });
  assert.strictEqual(tertiaryStart.status, 200, JSON.stringify(tertiaryStart.payload));

  const slotB = pickAttempt(secondaryStart.payload);
  const slotC = pickAttempt(tertiaryStart.payload);
  assert.strictEqual(Number(slotA.attemptIndex), 1);
  assert.strictEqual(Number(slotB.attemptIndex), 1);
  assert.strictEqual(Number(slotC.attemptIndex), 1);
  assert.strictEqual(Number(slotA.seedSlot), 1);
  assert.strictEqual(Number(slotB.seedSlot), 1);
  assert.strictEqual(Number(slotC.seedSlot), 1);
  assert.strictEqual(slotA.seedFingerprint, slotB.seedFingerprint, 'same attempt slot across accounts should share one ladder seed fingerprint');
  assert.strictEqual(slotA.seedFingerprint, slotC.seedFingerprint, 'same attempt slot across accounts should share one ladder seed fingerprint');

  const resultPrimary = await completeChallengeAttempt(primary, firstStart);
  const pendingProjectionStart = await startChallengeAttempt(secondary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-secondary-pending`,
    mutationId: `${nextId('mutation')}-start-secondary-pending`,
  });
  assert.strictEqual(pendingProjectionStart.status, 200, JSON.stringify(pendingProjectionStart.payload));
  const secondaryPending = await completeChallengeAttempt(secondary, pendingProjectionStart, { submitResult: false });
  const originalGrace = await dbGet(
    'SELECT grace_ends_at FROM challenge_ladder_rotations WHERE rotation_id = ?',
    [rotationId],
  );
  await dbRun(
    'UPDATE challenge_ladder_rotations SET grace_ends_at = ? WHERE rotation_id = ?',
    [Date.now() - 1, rotationId],
  );
  const lateProjection = await submitChallengeResult(secondary.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: secondaryPending.run.runId,
    mutationId: `${nextId('mutation')}-late-projection`,
  });
  assert.strictEqual(lateProjection.status, 409, JSON.stringify(lateProjection.payload));
  assert.strictEqual(lateProjection.payload?.reason, 'challenge_ladder_settlement_window_closed');
  const lateProjectionCount = await dbGet(
    'SELECT COUNT(*) AS count FROM challenge_ladder_results WHERE run_id = ?',
    [secondaryPending.run.runId],
  );
  assert.strictEqual(Number(lateProjectionCount?.count), 0, 'a receipt minted before grace must not be first-projected after the ladder closes');
  await dbRun(
    'UPDATE challenge_ladder_rotations SET grace_ends_at = ? WHERE rotation_id = ?',
    [Number(originalGrace.grace_ends_at), rotationId],
  );
  const recoveredCurrent = await getChallengeCurrent(secondary.token);
  assert.strictEqual(recoveredCurrent.status, 200, JSON.stringify(recoveredCurrent.payload));
  assert.strictEqual(pickCurrentAttempt(recoveredCurrent.payload), null, 'current should auto-project settled-but-unsubmitted attempts');
  assert(pickPersonalBest(recoveredCurrent.payload), 'auto projection should restore personal best view');

  const resultTertiary = await completeChallengeAttempt(tertiary, tertiaryStart);
  const leaderboardCurrent = await getChallengeCurrent(primary.token);
  assert.strictEqual(leaderboardCurrent.status, 200, JSON.stringify(leaderboardCurrent.payload));
  const leaderboard = pickLeaderboard(leaderboardCurrent.payload);
  assert(leaderboard.length >= 2, 'official leaderboard should list multiple projected results');
  const selfRank = pickSelfRank(leaderboardCurrent.payload);
  assert(selfRank, 'current payload should expose self rank once a formal result exists');
  const personalBest = pickPersonalBest(leaderboardCurrent.payload);
  assert(personalBest, 'current payload should expose the account best result');
  assert(Number(personalBest.officialScore) >= Number(resultPrimary.resultResponse?.payload?.officialScore || resultPrimary.resultResponse?.payload?.result?.officialScore || 0));

  const historicalRunId = `${nextId('run')}-previous-grace`;
  const historicalResultId = `aclresult-${crypto.createHash('sha256').update(historicalRunId).digest('hex').slice(0, 32)}`;
  const historicalReceiptId = `arreceipt-${crypto.createHash('sha256').update(`${historicalRunId}:receipt`).digest('hex').slice(0, 32)}`;
  await dbRun(
    `UPDATE challenge_ladder_attempts
     SET run_id = ?, status = 'submitted', submitted_at = ?, terminal_at = ?, updated_at = ?
     WHERE attempt_id = ?`,
    [historicalRunId, Number(previousRotation.ends_at) - 1000, Number(previousRotation.ends_at) - 1000, Date.now(), staleAttemptId],
  );
  await dbRun(
    `INSERT INTO challenge_ladder_results
      (result_id, attempt_id, run_id, receipt_id, user_id, rotation_id, base_score, bonus_score,
       official_score, grade, turns, remaining_hp, damage_taken, state_hash, chain_head,
       mutation_hash, summary_json, receipt_json, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, 1000, 0, 1000, 'S', 10, 40, 0, ?, ?, ?, '{}', '{}', ?)`,
    [
      historicalResultId,
      staleAttemptId,
      historicalRunId,
      historicalReceiptId,
      primary.userId,
      previousRotation.rotation_id,
      crypto.createHash('sha256').update(`${historicalRunId}:state`).digest('hex'),
      crypto.createHash('sha256').update(`${historicalRunId}:chain`).digest('hex'),
      crypto.createHash('sha256').update(`${historicalRunId}:mutation`).digest('hex'),
      Number(previousRotation.ends_at) - 1000,
    ],
  );
  await dbRun(
    `INSERT INTO challenge_ladder_entries
      (rotation_id, user_id, best_result_id, official_score, base_score, bonus_score, grade,
       turns, remaining_hp, damage_taken, submitted_at, completed_attempts, updated_at)
     VALUES (?, ?, ?, 1000, 1000, 0, 'S', 10, 40, 0, ?, 1, ?)`,
    [previousRotation.rotation_id, primary.userId, historicalResultId, Number(previousRotation.ends_at) - 1000, Date.now()],
  );
  await dbRun(
    'UPDATE challenge_ladder_rotations SET grace_ends_at = ? WHERE rotation_id = ?',
    [Date.now() + 10 * 60 * 1000, previousRotation.rotation_id],
  );
  const previousGraceCurrent = await getChallengeCurrent(primary.token);
  assert.strictEqual(previousGraceCurrent.status, 200, JSON.stringify(previousGraceCurrent.payload));
  assert.strictEqual(previousGraceCurrent.payload?.previousGrace?.rotation?.rotationId, previousRotation.rotation_id);
  const previousGraceMilestone = pickMilestones(previousGraceCurrent.payload.previousGrace).find(entry => entry.claimable === true);
  assert(previousGraceMilestone, 'current should surface claimable milestones from the previous grace rotation');
  const previousGraceClaim = await claimChallengeReward(primary.token, previousGraceMilestone.milestoneId, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId: previousRotation.rotation_id,
    milestoneId: previousGraceMilestone.milestoneId,
    mutationId: `${nextId('mutation')}-previous-grace-claim`,
  });
  assert.strictEqual(previousGraceClaim.status, 200, JSON.stringify(previousGraceClaim.payload));

  const foreignSubmit = await submitChallengeResult(secondary.token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: resultPrimary.run.runId,
    mutationId: `${nextId('mutation')}-foreign-submit`,
  });
  assert.strictEqual(foreignSubmit.status, 404, 'another account must not be able to submit a foreign challenge ladder run');

  const secondPrimaryStart = await startChallengeAttempt(primary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-primary-second`,
    mutationId: `${nextId('mutation')}-start-primary-second`,
  });
  assert.strictEqual(secondPrimaryStart.status, 200, JSON.stringify(secondPrimaryStart.payload));
  const secondPrimaryResult = await completeChallengeAttempt(primary, secondPrimaryStart);
  const thirdPrimaryStart = await startChallengeAttempt(primary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-primary-third`,
    mutationId: `${nextId('mutation')}-start-primary-third`,
  });
  assert.strictEqual(thirdPrimaryStart.status, 200, JSON.stringify(thirdPrimaryStart.payload));
  const thirdPrimaryResult = await completeChallengeAttempt(primary, thirdPrimaryStart);
  const quotaExceeded = await startChallengeAttempt(primary.token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-primary-fourth`,
    mutationId: `${nextId('mutation')}-start-primary-fourth`,
  });
  assert.notStrictEqual(quotaExceeded.status, 200, 'fourth formal attempt should be rejected once three slots are consumed');

  const postQuotaCurrent = await getChallengeCurrent(primary.token);
  assert.strictEqual(postQuotaCurrent.status, 200, JSON.stringify(postQuotaCurrent.payload));
  const postQuotaBest = pickPersonalBest(postQuotaCurrent.payload);
  assert(postQuotaBest, 'best-result projection should remain available after multiple formal submissions');
  const observedScores = [
    Number(resultPrimary.resultResponse?.payload?.officialScore || resultPrimary.resultResponse?.payload?.result?.officialScore || 0),
    Number(secondPrimaryResult.resultResponse?.payload?.officialScore || secondPrimaryResult.resultResponse?.payload?.result?.officialScore || 0),
    Number(thirdPrimaryResult.resultResponse?.payload?.officialScore || thirdPrimaryResult.resultResponse?.payload?.result?.officialScore || 0),
  ];
  assert.strictEqual(
    Number(postQuotaBest.officialScore),
    Math.max(...observedScores),
    'leaderboard projection should keep the strict best official score for each account',
  );

  const milestone = pickMilestones(postQuotaCurrent.payload).find(entry => entry && (entry.claimable === true || entry.canClaim === true));
  if (!milestone) {
    throw new Error(
      'challenge ladder current payload did not expose a claimable milestone after formal submissions. '
      + 'The reward-claim atomicity section is wired below and should run once the backend ships a reachable milestone fixture.',
    );
  }
  const milestoneId = milestone.milestoneId || milestone.id;
  const claimPayloadA = {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    milestoneId,
    mutationId: `${nextId('mutation')}-claim-a`,
  };
  const claimPayloadB = {
    ...claimPayloadA,
    mutationId: `${nextId('mutation')}-claim-b`,
  };
  const secondaryBackend = startServer(SECONDARY_PORT);
  let claimA;
  let claimB;
  try {
    await waitForHealth(secondaryBackend, SECONDARY_BASE_URL);
    [claimA, claimB] = await Promise.all([
      claimChallengeReward(primary.token, milestoneId, claimPayloadA),
      signedRequestAt(SECONDARY_BASE_URL, `/api/challenge-ladder/rewards/${encodeURIComponent(milestoneId)}/claim`, {
        token: primary.token,
        data: claimPayloadB,
      }),
    ]);
  } finally {
    await stopServer(secondaryBackend);
  }
  assert.strictEqual(claimA.status, 200, JSON.stringify(claimA.payload));
  assert.strictEqual(claimB.status, 200, JSON.stringify(claimB.payload));

  const rewardClaimRows = await dbGet(
    `SELECT
       (SELECT COUNT(*) FROM challenge_ladder_reward_claims WHERE user_id = ? AND rotation_id = ? AND milestone_id = ?) AS claims,
       (SELECT COUNT(*) FROM progression_economy_ledger WHERE user_id = ? AND source_type = 'challenge_ladder_reward' AND source_id = ?) AS ledger_entries`,
    [primary.userId, rotationId, milestoneId, primary.userId, `challenge_ladder:${rotationId}:${milestoneId}`],
  );
  assert.strictEqual(Number(rewardClaimRows.claims), 1, 'cross-process reward claims with distinct mutations should persist one durable claim row');
  assert.strictEqual(Number(rewardClaimRows.ledger_entries), 1, 'cross-process reward claims with distinct mutations should mint one ledger entry');

  const ops = await getChallengeOpsOverview({ token: primary.token, opsToken: OPS_TOKEN });
  assert.strictEqual(ops.status, 200, JSON.stringify(ops.payload));
  const opsJson = JSON.stringify(ops.payload);
  for (const forbidden of [
    primary.userId,
    secondary.userId,
    tertiary.userId,
    HMAC_SECRET,
    JWT_SECRET,
    OPS_TOKEN,
    slotA.seedFingerprint && `${slotA.seedFingerprint}:raw`,
    '"payload_json"',
    '"seed"',
  ].filter(Boolean)) {
    assert(!opsJson.includes(forbidden), `ops overview must redact ${forbidden}`);
  }

  const tieA = resultPrimary.resultResponse?.payload?.result || resultPrimary.resultResponse?.payload;
  const tieB = resultTertiary.resultResponse?.payload?.result || resultTertiary.resultResponse?.payload;
  if (Number(tieA?.officialScore) === Number(tieB?.officialScore)
    && Number(tieA?.turns) === Number(tieB?.turns)
    && Number(tieA?.remainingHp) === Number(tieB?.remainingHp)) {
    const tiedEntries = pickLeaderboard(leaderboardCurrent.payload).filter(entry =>
      Number(entry.officialScore) === Number(tieA.officialScore)
      && Number(entry.turns) === Number(tieA.turns)
      && Number(entry.remainingHp) === Number(tieA.remainingHp),
    );
    assert(tiedEntries.length >= 2, 'equal official projections should appear on the board as a stable tie');
  }
}

(async () => {
  removeDbFiles();
  const server = startServer();
  try {
    await waitForHealth(server);
    await assertV7SchemaReady();
    await runFutureFlowCoverage();
    console.log('Challenge ladder platform sanity checks passed.');
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
    removeDbFiles();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
