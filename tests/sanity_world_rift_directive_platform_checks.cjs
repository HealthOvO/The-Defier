const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SHARED_NODE_MODULES = [
  path.resolve(ROOT, '..', 'The-Defier', 'server', 'node_modules'),
  path.resolve(ROOT, '..', 'The-Defier', 'node_modules'),
];

const {
  CONTENT_VERSION,
} = require('../server/progression/authoritative-runs/catalog');
const {
  CATALOG_SNAPSHOT,
  CATALOG_VERSION,
  PROTOCOL_VERSION,
  ROTATION_RULE_VERSION,
  buildRotationSnapshotForStart,
} = require('../server/world-rift/catalog');
const {
  hashCanonical,
  stableStringify,
} = require('../server/progression/authoritative-runs/canonical');

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
const BLOCK_CARDS = new Set(['guard', 'iron_mandate']);
const DB_PATH = process.env.WORLD_RIFT_DIRECTIVE_PLATFORM_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-world-rift-directives-${process.pid}.sqlite`);
const JWT_SECRET = 'world-rift-directive-platform-jwt-secret-32';
const HMAC_SECRET = 'world-rift-directive-platform-hmac-secret-32';
const OPS_TOKEN = 'world-rift-directive-platform-ops-token-32';

let PORT = Number(process.env.WORLD_RIFT_DIRECTIVE_PLATFORM_TEST_PORT || 0);
let BASE_URL = '';
let userCounter = 0;
let actionCounter = 0;
let mutationCounter = 0;
let attemptCounter = 0;
const DIRECTIVE_SERVICE_CHILD_SCRIPT = `
const operation = String(process.argv[1] || '');
const payload = JSON.parse(Buffer.from(String(process.argv[2] || ''), 'base64').toString('utf8'));

(async () => {
  const service = require('./server/world-rift/service');
  let result;
  if (operation === 'claimDirective') {
    result = await service.claimWorldRiftDirective(payload.userId, payload.directiveId, payload.request);
  } else if (operation === 'reconcileDirectives') {
    result = await service.reconcileWorldRiftDirectives(payload.request);
  } else {
    throw new Error(\`unsupported world-rift service operation: \${operation}\`);
  }
  process.stdout.write(JSON.stringify({ ok: true, result }));
})().catch(error => {
  process.stdout.write(JSON.stringify({
    ok: false,
    status: Number(error?.statusCode || error?.status || 500),
    reason: String(error?.reason || ''),
    message: String(error?.message || error),
  }));
  process.exitCode = 1;
});
`;

function nextId(prefix) {
  if (prefix === 'user') userCounter += 1;
  if (prefix === 'action') actionCounter += 1;
  if (prefix === 'mutation') mutationCounter += 1;
  if (prefix === 'attempt') attemptCounter += 1;
  const counters = {
    user: userCounter,
    action: actionCounter,
    mutation: mutationCounter,
    attempt: attemptCounter,
  };
  return `rift-directive-${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: Number(server.address()?.port || 0) });
    });
  });
}

async function configureTestPort() {
  if (!PORT) {
    const reservation = await reserveAvailablePort();
    PORT = reservation.port;
    await new Promise((resolve, reject) => {
      reservation.server.close(error => error ? reject(error) : resolve());
    });
  }
  BASE_URL = `http://127.0.0.1:${PORT}`;
}

function startServer() {
  const gitSha = `world-rift-directive-platform-${process.pid}-${PORT}`;
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_WORLD_RIFT_SEED_SECRET: 'world-rift-directive-seed-secret-32',
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: OPS_TOKEN,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: gitSha,
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
  return { child, gitSha, getOutput: () => output };
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
      throw new Error(`world-rift directive backend exited early\n${server.getOutput()}`);
    }
    try {
      const response = await request('/api/health');
      if (response.status === 200
        && response.payload?.status === 'ok'
        && response.payload?.version?.gitSha === server.gitSha) {
        return;
      }
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`world-rift directive backend health timed out\n${server.getOutput()}`);
}

function signSessionV2Payload(method, pathname, data, token, salt = `riftsig-${crypto.randomBytes(12).toString('hex')}`) {
  const normalizedMethod = String(method || 'POST').toUpperCase();
  const normalizedPath = String(pathname || '').split('?')[0];
  const signature = crypto.createHmac('sha256', token)
    .update('session-v2', 'utf8')
    .update('\n', 'utf8')
    .update(`${normalizedMethod} ${normalizedPath}`, 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return { salt, signature, signatureMode: 'session-v2' };
}

function signSessionV1Payload(data, token, salt = `riftsig-${crypto.randomBytes(12).toString('hex')}`) {
  const signature = crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return { salt, signature, signatureMode: 'session' };
}

function signSessionPayload(method, pathname, data, token) {
  const normalizedPath = String(pathname || '').split('?')[0];
  return normalizedPath.startsWith('/api/world-rift/')
    ? signSessionV2Payload(method, normalizedPath, data, token)
    : signSessionV1Payload(data, token);
}

async function signedRequest(pathname, { token, data, method = 'POST' }) {
  return request(pathname, {
    method,
    token,
    body: { ...data, ...signSessionPayload(method, pathname, data, token) },
  });
}

async function routeBoundSignedRequest(pathname, { token, data, method = 'POST' }) {
  return request(pathname, {
    method,
    token,
    body: { ...data, ...signSessionV2Payload(method, pathname, data, token) },
  });
}

async function registerAndLogin(tag) {
  const username = `${String(tag || 'rift').slice(0, 10)}-${Date.now().toString(36)}-${nextId('user').slice(-4)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(registered.status, 200, JSON.stringify(registered.payload));
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
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
      const changes = Number(this?.changes || 0);
      db.close();
      if (error) reject(error);
      else resolve({ changes });
    });
  });
}

function chooseCommandFromProjection(projection, strategy = {}) {
  if (projection.phase === 'route') {
    const choices = Array.isArray(projection.route?.choices) ? projection.route.choices : [];
    const routeIndex = Number(strategy.routeIndex || 0);
    const preferredContract = Array.isArray(strategy.preferredContracts)
      ? String(strategy.preferredContracts[routeIndex] || '')
      : '';
    strategy.routeIndex = routeIndex + 1;
    const riskOrder = { steady: 0, contested: 1, perilous: 2 };
    const choice = choices.find(entry => String(entry?.routeContract?.contractId || '') === preferredContract)
      || choices.slice().sort((left, right) => {
        const leftRisk = riskOrder[String(left?.routeContract?.contractId || '')] ?? 99;
        const rightRisk = riskOrder[String(right?.routeContract?.contractId || '')] ?? 99;
        return leftRisk - rightRisk || String(left?.nodeId || '').localeCompare(String(right?.nodeId || ''));
      })[0];
    assert(choice, 'authoritative route projection must expose at least one selectable node');
    return ['select_node', { nodeId: choice.nodeId }];
  }
  if (projection.phase === 'reward') {
    const reward = (strategy.preferHealing
      ? projection.reward.choices.find(choice => choice.kind === 'heal')
      : null) || (projection.player.hp < 22
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

async function getWorldCurrent(token) {
  return request('/api/world-rift/current', { method: 'GET', token });
}

async function startWorldAttempt(token, payload) {
  return signedRequest('/api/world-rift/attempts', { token, data: payload });
}

async function submitWorldContribution(token, payload) {
  return signedRequest('/api/world-rift/contributions', { token, data: payload });
}

function pickRotationId(currentPayload) {
  return currentPayload?.rotation?.rotationId
    || currentPayload?.currentRotation?.rotationId
    || currentPayload?.rotationId
    || '';
}

function pickAttempt(responsePayload) {
  return responsePayload?.attempt || responsePayload?.currentAttempt || responsePayload?.data?.attempt || null;
}

function pickBoundRun(responsePayload) {
  return responsePayload?.run
    || responsePayload?.attempt?.run
    || responsePayload?.attempt?.authoritativeRun
    || responsePayload?.currentAttempt?.run
    || null;
}

async function driveRun(token, run, { maxSteps = 320, preferredContracts = [], preferHealing = false } = {}) {
  let currentRun = run;
  const actions = [];
  const strategy = { preferredContracts, preferHealing, routeIndex: 0 };
  while (String(currentRun.status || '') === 'active' && actions.length < maxSteps) {
    const [command, payload] = chooseCommandFromProjection(currentRun.projection || currentRun.state, strategy);
    const response = await submitAction(token, currentRun.runId, Number(currentRun.stateVersion), command, payload);
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    actions.push(response.payload.action);
    currentRun = response.payload.run;
  }
  return { run: currentRun, actions };
}

function buildRouteRunOptions(directive) {
  const criteria = directive?.criteria && typeof directive.criteria === 'object' ? directive.criteria : {};
  const allowedContracts = Array.isArray(criteria.allowedContracts)
    ? criteria.allowedContracts.map(String)
    : [];
  let preferredContracts = ['steady', 'steady', 'contested'];
  if (Number(criteria.minDistinctContracts || 0) >= 2) {
    preferredContracts = ['contested', 'steady', 'contested'];
  } else if (Number(criteria.minMatchedContracts || 0) > 0) {
    const matchedContract = allowedContracts.includes('steady')
      ? 'steady'
      : allowedContracts.includes('contested')
        ? 'contested'
        : allowedContracts[0] || 'steady';
    preferredContracts = [matchedContract, 'steady', 'contested'];
  }
  return {
    preferredContracts,
    preferHealing: Number(criteria.minRemainingHp || 0) > 0,
  };
}

async function completeWorldRiftContribution(token, rotationId, personalDirective) {
  const started = await startWorldAttempt(token, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    clientAttemptId: `${nextId('attempt')}-directive-followup`,
    mutationId: `${nextId('mutation')}-directive-followup-start`,
  });
  assert.equal(started.status, 200, JSON.stringify(started.payload));
  const attempt = pickAttempt(started.payload);
  const run = pickBoundRun(started.payload);
  assert(attempt && run, 'follow-up world-rift attempt must return a bound authoritative run');
  const driven = await driveRun(token, run, buildRouteRunOptions(personalDirective));
  assert.equal(driven.run.status, 'completed', 'follow-up directive run must complete authoritatively');
  const settled = await settleAuthoritativeRun(token, driven.run.runId, Number(driven.run.stateVersion));
  assert.equal(settled.status, 200, JSON.stringify(settled.payload));
  const submitted = await submitWorldContribution(token, {
    protocolVersion: PROTOCOL_VERSION,
    runId: driven.run.runId,
    mutationId: `${nextId('mutation')}-directive-followup-submit`,
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.payload));
  return {
    attempt,
    run: driven.run,
    contribution: submitted.payload?.contribution || null,
    directiveDeltas: submitted.payload?.directiveDeltas || [],
  };
}

async function ensureClaimablePersonalDirective(user, rotationIdInput = '') {
  let current = await getWorldCurrent(user.token);
  assert.equal(current.status, 200, JSON.stringify(current.payload));
  const rotationId = String(rotationIdInput || pickRotationId(current.payload) || '');
  assert(rotationId, 'claimable directive helper requires a rotation id');
  const currentPersonalDirective = extractDirectiveViews(current.payload)
    .find(entry => String(entry?.scope || '') === 'personal');
  assert(currentPersonalDirective, 'current payload must expose a personal directive');
  const personalDirective = await loadRotationDirectiveDefinition(rotationId, currentPersonalDirective.directiveId);
  const attemptLimit = Math.min(5, Number(current.payload?.allowance?.attemptLimit || 5));
  let usedAttempts = Number(current.payload?.allowance?.usedAttempts || 0);
  let claimable = extractDirectiveViews(current.payload)
    .find(entry => String(entry?.scope || '') === 'personal' && entry?.claimable === true);
  while (!claimable && usedAttempts < attemptLimit) {
    await completeWorldRiftContribution(user.token, rotationId, personalDirective);
    current = await getWorldCurrent(user.token);
    assert.equal(current.status, 200, JSON.stringify(current.payload));
    usedAttempts = Number(current.payload?.allowance?.usedAttempts || usedAttempts + 1);
    claimable = extractDirectiveViews(current.payload)
      .find(entry => String(entry?.scope || '') === 'personal' && entry?.claimable === true);
  }
  assert(
    claimable,
    `personal directive must become claimable within ${attemptLimit} official runs: ${JSON.stringify(current.payload?.directives)}`,
  );
  return {
    rotationId,
    current,
    personalDirective,
    claimable,
  };
}

async function insertPreviousContributionFixture(userId, rotationId) {
  const now = Date.now() - 60000;
  const contributionId = `rift-prev-directive-${crypto.randomUUID().slice(0, 8)}`;
  const phaseUnlocks = {
    'global-phase-1': now,
    'global-phase-2': 0,
    'global-phase-3': 0,
  };
  await dbAll('SELECT 1');
  const db = openDb();
  try {
    await new Promise((resolve, reject) => db.serialize(async () => {
      try {
        await new Promise((res, rej) => db.run(
          `UPDATE world_rift_states
           SET applied_damage = 2400, total_contribution = 2400, current_phase_index = 2,
               phase_unlocks_json = ?, state_version = 1, last_contribution_id = ?, last_result_at = ?, updated_at = ?
           WHERE rotation_id = ?`,
          [JSON.stringify(phaseUnlocks), contributionId, now, now, rotationId],
          error => error ? rej(error) : res(),
        ));
        await new Promise((res, rej) => db.run(
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
            JSON.stringify({
              score: 420,
              turns: 11,
              remainingHp: 26,
              result: 'completed',
              contribution: 2000,
              routeResolution: {
                totalBonus: 25,
                selections: [
                  { contractId: 'steady', scoreBonus: 0 },
                  { contractId: 'contested', scoreBonus: 25 },
                ],
              },
            }),
            JSON.stringify({ receiptId: contributionId }),
            now,
          ],
          error => error ? rej(error) : res(),
        ));
        await new Promise((res, rej) => db.run(
          `INSERT INTO world_rift_entries
            (rotation_id, user_id, entry_id, ranked_contribution, best_contribution, ranked_remaining_hp,
             ranked_turns, total_contribution, completed_attempts, updated_at)
           VALUES (?, ?, ?, 2000, 2000, 26, 11, 2000, 1, ?)`,
          [rotationId, userId, `rift-prev-entry-${crypto.randomUUID().slice(0, 8)}`, now],
          error => error ? rej(error) : res(),
        ));
        resolve();
      } catch (error) {
        reject(error);
      }
    }));
  } finally {
    await new Promise(resolve => db.close(resolve));
  }
  return contributionId;
}

async function getIndexColumns(tableName, indexName) {
  const rows = await dbAll(`PRAGMA index_info(${JSON.stringify(indexName)})`);
  return rows.map(row => String(row.name || '').toLowerCase()).filter(Boolean);
}

function normalizeDirectiveScopes(source) {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source)) return source;
  if (Array.isArray(source.views)) return source.views;
  const scopes = [];
  for (const [key, value] of Object.entries(source)) {
    if (!['personal', 'squad', 'global'].includes(key)) continue;
    if (Array.isArray(value)) {
      scopes.push({ scope: key, directives: value });
    } else if (value && typeof value === 'object') {
      scopes.push({ scope: key, ...value });
    }
  }
  return scopes;
}

async function forcePreviousRowToV1(rotationId) {
  const row = await dbGet(
    `SELECT rotation_id, starts_at, snapshot_json
     FROM world_rift_rotations
     WHERE rotation_id = ?`,
    [rotationId],
  );
  assert(row, `missing previous rotation row ${rotationId}`);
  const snapshot = JSON.parse(String(row.snapshot_json || '{}'));
  snapshot.catalogVersion = 'world-rift-catalog-v1';
  snapshot.rotationRuleVersion = 'world-rift-rotation-v1';
  delete snapshot.directiveSetId;
  delete snapshot.directiveTitle;
  delete snapshot.directiveDescription;
  delete snapshot.directives;
  if (snapshot.fairness && typeof snapshot.fairness === 'object') {
    delete snapshot.fairness.directiveFactsSource;
    delete snapshot.fairness.directiveRewards;
  }
  delete snapshot.snapshotHash;
  snapshot.snapshotHash = hashCanonical(snapshot);
  const snapshotJson = stableStringify(snapshot);
  const snapshotHash = snapshot.snapshotHash;
  const db = openDb();
  try {
    await new Promise((resolve, reject) => db.run(
      `UPDATE world_rift_rotations
       SET catalog_version = ?, rule_version = ?, snapshot_hash = ?, snapshot_json = ?
       WHERE rotation_id = ?`,
      ['world-rift-catalog-v1', 'world-rift-rotation-v1', snapshotHash, snapshotJson, rotationId],
      error => error ? reject(error) : resolve(),
    ));
  } finally {
    await new Promise(resolve => db.close(resolve));
  }
  return { snapshotHash, snapshotJson };
}

async function forceRotationRowToV2(rotationId) {
  const row = await dbGet(
    `SELECT rotation_id, starts_at
     FROM world_rift_rotations
     WHERE rotation_id = ?`,
    [rotationId],
  );
  assert(row, `missing previous rotation row ${rotationId}`);
  const snapshot = buildRotationSnapshotForStart(Number(row.starts_at));
  const snapshotJson = stableStringify(snapshot);
  const snapshotHash = String(snapshot.snapshotHash || '');
  const db = openDb();
  try {
    await new Promise((resolve, reject) => db.run(
      `UPDATE world_rift_rotations
       SET catalog_version = ?, rule_version = ?, snapshot_hash = ?, snapshot_json = ?
       WHERE rotation_id = ?`,
      ['world-rift-catalog-v2', 'world-rift-rotation-v2', snapshotHash, snapshotJson, rotationId],
      error => error ? reject(error) : resolve(),
    ));
  } finally {
    await new Promise(resolve => db.close(resolve));
  }
  return { snapshotHash, snapshotJson };
}

function extractDirectiveViews(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return normalizeDirectiveScopes(
    payload.directiveViews
    || payload.directives
    || payload.directiveProgress
    || payload.scopeProgress
    || null,
  );
}

async function loadRotationDirectiveDefinition(rotationId, directiveId) {
  const row = await dbGet(
    `SELECT snapshot_json
     FROM world_rift_rotations
     WHERE rotation_id = ?`,
    [rotationId],
  );
  assert(row, `missing rotation snapshot for ${rotationId}`);
  const snapshot = JSON.parse(String(row.snapshot_json || '{}'));
  const directive = Array.isArray(snapshot.directives)
    ? snapshot.directives.find(entry => String(entry?.directiveId || '') === String(directiveId || ''))
    : null;
  assert(directive, `missing directive definition ${directiveId} in ${rotationId}`);
  return directive;
}

async function snapshotDirectivePersistence(rotationId) {
  const states = await dbAll(
    `SELECT rotation_id, directive_id, scope, owner_type, owner_id, progress_value, target_value,
            progress_json, state_version, completed_at, last_projection_id
     FROM world_rift_directive_states
     WHERE rotation_id = ?
     ORDER BY scope, directive_id, owner_type, owner_id`,
    [rotationId],
  );
  const projections = await dbAll(
    `SELECT projection_id, rotation_id, directive_id, contribution_id, owner_type, owner_id,
            delta_value, delta_json, result_progress_value, result_state_version, completed_now
     FROM world_rift_directive_projections
     WHERE rotation_id = ?
     ORDER BY contribution_id, directive_id, owner_type, owner_id`,
    [rotationId],
  );
  return { states, projections };
}

function buildSharedNodePath() {
  return [
    process.env.NODE_PATH,
    path.join(ROOT, 'node_modules'),
    path.join(ROOT, 'server', 'node_modules'),
    ...SHARED_NODE_MODULES,
  ].filter(Boolean).join(path.delimiter);
}

async function invokeWorldRiftServiceInChild(operation, payload) {
  return new Promise((resolve, reject) => {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
    const child = spawn(process.execPath, ['-e', DIRECTIVE_SERVICE_CHILD_SCRIPT, operation, encodedPayload], {
      cwd: ROOT,
      env: {
        ...process.env,
        DEFIER_DB_PATH: DB_PATH,
        DEFIER_SQLITE_BUSY_TIMEOUT_MS: process.env.DEFIER_SQLITE_BUSY_TIMEOUT_MS || '5000',
        NODE_PATH: buildSharedNodePath(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', code => {
      let parsed = null;
      try {
        parsed = JSON.parse(stdout || '{}');
      } catch (error) {
        reject(new Error(`failed to parse child ${operation} output (code ${code})\nstdout: ${stdout}\nstderr: ${stderr}`));
        return;
      }
      if (parsed?.ok === true) {
        resolve(parsed.result);
        return;
      }
      reject(new Error(
        `child ${operation} failed with code ${code}: ${parsed?.status || 'unknown'} ${parsed?.reason || ''} ${parsed?.message || stderr}`.trim(),
      ));
    });
  });
}

function publicDirectiveProgressSnapshot(payload) {
  return extractDirectiveViews(payload)
    .map(entry => ({
      directiveId: String(entry?.directiveId || ''),
      scope: String(entry?.scope || ''),
      progress: Number(entry?.progress || 0),
      target: Number(entry?.target || 0),
      completedAt: Number(entry?.completedAt || 0),
      claimed: entry?.claimed === true,
      claimedAt: Number(entry?.claimedAt || 0),
    }))
    .sort((left, right) => left.scope.localeCompare(right.scope)
      || left.directiveId.localeCompare(right.directiveId));
}

function collectJsonKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    value.forEach(entry => collectJsonKeys(entry, keys));
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;
  for (const [key, entry] of Object.entries(value)) {
    keys.add(key);
    collectJsonKeys(entry, keys);
  }
  return keys;
}

async function runCheck(name, fn, failures) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`not ok - ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

async function main() {
  const failures = [];
  let server = null;
  removeDbFiles();
  await configureTestPort();
  try {
    server = startServer();
    await waitForHealth(server);
    const primary = await registerAndLogin('rift-directive-primary');
    const scenario = {
      rotationId: '',
      contributionIds: [],
      squadContributionId: '',
      directiveId: '',
      claimId: '',
      primaryAfterOps: null,
    };

    await runCheck('catalog v2 snapshot exposes fixed directive scopes', async () => {
      assert.equal(CATALOG_VERSION, 'world-rift-catalog-v2');
      assert.equal(ROTATION_RULE_VERSION, 'world-rift-rotation-v2');
      const snapshotA = buildRotationSnapshotForStart(Date.UTC(2026, 6, 13, 0, 0, 0));
      const snapshotB = buildRotationSnapshotForStart(Date.UTC(2026, 6, 13, 0, 0, 0));
      assert.equal(snapshotA.snapshotHash, snapshotB.snapshotHash, 'same v2 rotation seed must hash identically');
      const directives = snapshotA.directives || CATALOG_SNAPSHOT.directives || null;
      assert(Array.isArray(directives), 'world-rift v2 catalog must embed directives as an array');
      for (const scope of ['personal', 'squad', 'global']) {
        const entries = directives.filter(entry => String(entry?.scope || '') === scope);
        assert(entries.length > 0, `directive scope ${scope} must be precomputed in every v2 rotation`);
      }
    }, failures);

    await runCheck('bootstrap upgrades the active v1 rotation, backfills receipts, and keeps older rows stable', async () => {
      const activeRow = await dbGet(
        `SELECT rotation_id
         FROM world_rift_rotations
         WHERE starts_at <= ? AND ends_at > ?
         ORDER BY created_at DESC, rotation_id ASC
         LIMIT 1`,
        [Date.now(), Date.now()],
      );
      assert(activeRow, 'bootstrap must create an active world-rift rotation row');
      const legacyActive = await forcePreviousRowToV1(activeRow.rotation_id);
      const legacyContributionId = await insertPreviousContributionFixture(primary.userId, activeRow.rotation_id);

      const firstCurrent = await getWorldCurrent(primary.token);
      assert.equal(firstCurrent.status, 200, JSON.stringify(firstCurrent.payload));
      const currentRotationId = pickRotationId(firstCurrent.payload);
      assert(currentRotationId, 'current payload must expose a rotation id');
      assert.equal(currentRotationId, activeRow.rotation_id, 'active catalog upgrade must keep the durable rotation identity');
      const currentRow = await dbGet(
        `SELECT rotation_id, catalog_version, rule_version, snapshot_hash, snapshot_json
         FROM world_rift_rotations
         WHERE rotation_id = ?`,
        [currentRotationId],
      );
      assert(currentRow, `missing world_rift_rotations row for ${currentRotationId}`);
      assert.equal(currentRow.catalog_version, 'world-rift-catalog-v2');
      assert.equal(currentRow.rule_version, 'world-rift-rotation-v2');
      assert.notEqual(currentRow.snapshot_hash, legacyActive.snapshotHash, 'active v1 snapshot must be promoted to the v2 catalog');
      const migratedProjectionCount = await dbGet(
        `SELECT COUNT(*) AS count
         FROM world_rift_directive_projections
         WHERE contribution_id = ?`,
        [legacyContributionId],
      );
      assert(
        Number(migratedProjectionCount?.count || 0) >= 2,
        'active catalog upgrade must backfill personal/global projections from existing authoritative receipts',
      );
      const migratedViews = extractDirectiveViews(firstCurrent.payload);
      assert(
        migratedViews.some(entry => entry.scope === 'personal' && Number(entry.progress || 0) > 0),
        'active catalog upgrade must expose backfilled personal progress immediately',
      );
      assert(
        migratedViews.some(entry => entry.scope === 'global' && Number(entry.progress || 0) > 0),
        'active catalog upgrade must expose backfilled global progress immediately',
      );
      const previousRow = await dbGet(
        `SELECT rotation_id, catalog_version, rule_version, snapshot_hash, snapshot_json
         FROM world_rift_rotations
         WHERE rotation_id <> ?
         ORDER BY starts_at DESC
         LIMIT 1`,
        [currentRotationId],
      );
      assert(previousRow, 'bootstrap should retain a previous world-rift rotation row for claim carryover');
      const before = await forcePreviousRowToV1(previousRow.rotation_id);
      const replayCurrent = await getWorldCurrent(primary.token);
      assert.equal(replayCurrent.status, 200, JSON.stringify(replayCurrent.payload));
      const after = await dbGet(
        `SELECT catalog_version, rule_version, snapshot_hash, snapshot_json
         FROM world_rift_rotations
         WHERE rotation_id = ?`,
        [previousRow.rotation_id],
      );
      assert.equal(after.catalog_version, 'world-rift-catalog-v1');
      assert.equal(after.rule_version, 'world-rift-rotation-v1');
      assert.deepEqual(
        { snapshot_hash: after.snapshot_hash, snapshot_json: after.snapshot_json },
        { snapshot_hash: before.snapshotHash, snapshot_json: before.snapshotJson },
        'reading current state must not rewrite the manually preserved v1 previous rotation snapshot',
      );
    }, failures);

    await runCheck('directive schema tables and uniqueness constraints exist', async () => {
      const tables = new Set(
        (await dbAll(
          `SELECT name
           FROM sqlite_master
           WHERE type = 'table'
             AND name IN ('world_rift_directive_states', 'world_rift_directive_projections', 'world_rift_directive_claims')`,
        )).map(row => String(row.name || '')),
      );
      for (const table of ['world_rift_directive_states', 'world_rift_directive_projections', 'world_rift_directive_claims']) {
        assert(tables.has(table), `missing directive table ${table}`);
      }
      const indexes = await dbAll('PRAGMA index_list(world_rift_directive_projections)');
      const uniqueProjectionIndex = [];
      for (const index of indexes) {
        if (!index || Number(index.unique) !== 1) continue;
        uniqueProjectionIndex.push(await getIndexColumns('world_rift_directive_projections', String(index.name || '')));
      }
      assert(
        uniqueProjectionIndex.some(columns => {
          const joined = columns.join(',');
          return joined.includes('contribution')
            && joined.includes('directive')
            && joined.includes('owner');
        }),
        'directive projections need a unique key covering contribution + directive + owner to block double projection',
      );
    }, failures);

    await runCheck('authoritative submit derives directive deltas from receipt summary and remains idempotent', async () => {
      const current = await getWorldCurrent(primary.token);
      assert.equal(current.status, 200, JSON.stringify(current.payload));
      const rotationId = pickRotationId(current.payload);
      const previousRow = await dbGet(
        `SELECT rotation_id
         FROM world_rift_rotations
         WHERE rotation_id <> ?
         ORDER BY starts_at DESC
         LIMIT 1`,
        [rotationId],
      );
      assert(previousRow, 'need a previous rotation fixture for previousClaim contract checks');
      await forceRotationRowToV2(previousRow.rotation_id);
      await insertPreviousContributionFixture(primary.userId, previousRow.rotation_id);

      const started = await startWorldAttempt(primary.token, {
        protocolVersion: PROTOCOL_VERSION,
        rotationId,
        clientAttemptId: `${nextId('attempt')}-directive-1`,
        mutationId: `${nextId('mutation')}-directive-start-1`,
      });
      assert.equal(started.status, 200, JSON.stringify({
        payload: started.payload,
        serverOutput: server.getOutput(),
      }));
      const attempt = pickAttempt(started.payload);
      const run = pickBoundRun(started.payload);
      assert(attempt && run, 'world-rift start must return both the durable attempt and bound authoritative run');

      const driven = await driveRun(primary.token, run);
      assert.equal(driven.run.status, 'completed', 'world-rift directive probe needs a completed authoritative run');
      const settled = await settleAuthoritativeRun(primary.token, driven.run.runId, Number(driven.run.stateVersion));
      assert.equal(settled.status, 200, JSON.stringify(settled.payload));

      const receiptRow = await dbGet(
        `SELECT receipt_json
         FROM progression_authoritative_run_receipts
         WHERE run_id = ?`,
        [driven.run.runId],
      );
      assert(receiptRow, `missing authoritative receipt for ${driven.run.runId}`);
      const receiptPayload = JSON.parse(receiptRow.receipt_json);
      const selections = receiptPayload?.summary?.routeResolution?.selections;
      assert(Array.isArray(selections) && selections.length > 0, 'authoritative receipt summary must expose resolved route selections');
      assert(
        selections.every(selection => ['steady', 'contested', 'perilous'].includes(String(selection.contractId || selection.id || ''))),
        'directive facts must be derived from authoritative steady/contested/perilous selections',
      );

      const forgedClientCounts = await signedRequest('/api/world-rift/contributions', {
        token: primary.token,
        data: {
          protocolVersion: PROTOCOL_VERSION,
          runId: driven.run.runId,
          mutationId: `${nextId('mutation')}-directive-forged`,
          routeSelections: { steady: 99, contested: 99, perilous: 99 },
        },
      });
      assert.equal(forgedClientCounts.status, 400, JSON.stringify(forgedClientCounts.payload));
      assert.equal(forgedClientCounts.payload?.reason, 'invalid_request_payload');

      const submitted = await submitWorldContribution(primary.token, {
        protocolVersion: PROTOCOL_VERSION,
        runId: driven.run.runId,
        mutationId: `${nextId('mutation')}-directive-submit-1`,
      });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.payload));
      const contributionId = String(submitted.payload?.contribution?.contributionId || '');
      assert(contributionId, 'world-rift contribution response must expose contributionId');
      scenario.rotationId = rotationId;
      scenario.contributionIds.push(contributionId);
      const directiveDeltas = submitted.payload?.directiveDeltas;
      assert(
        directiveDeltas && (Array.isArray(directiveDeltas) || typeof directiveDeltas === 'object'),
        'world-rift contribution success must return directiveDeltas',
      );

      const projectionCountBeforeReplay = await dbGet(
        `SELECT COUNT(*) AS count
         FROM world_rift_directive_projections
         WHERE contribution_id = ?`,
        [contributionId],
      );
      const replay = await submitWorldContribution(primary.token, {
        protocolVersion: PROTOCOL_VERSION,
        runId: driven.run.runId,
        mutationId: `${nextId('mutation')}-directive-submit-2`,
      });
      assert.equal(replay.status, 200, JSON.stringify(replay.payload));
      assert.equal(replay.payload?.idempotent, true, 'repeat submit/reconcile must reuse the existing contribution fact');
      const projectionCountAfterReplay = await dbGet(
        `SELECT COUNT(*) AS count
         FROM world_rift_directive_projections
         WHERE contribution_id = ?`,
        [contributionId],
      );
      assert.equal(
        Number(projectionCountAfterReplay?.count),
        Number(projectionCountBeforeReplay?.count),
        'repeat submit/reconcile must not create extra directive projection rows',
      );

      const refreshed = await getWorldCurrent(primary.token);
      assert.equal(refreshed.status, 200, JSON.stringify(refreshed.payload));
      const currentDirectiveViews = extractDirectiveViews(refreshed.payload);
      const previousDirectiveViews = extractDirectiveViews(refreshed.payload?.previousClaim);
      assert(currentDirectiveViews.length > 0, 'current payload must expose readable directive views');
      assert(previousDirectiveViews.length > 0, 'previousClaim payload must expose readable directive views');
      const scopes = new Set(currentDirectiveViews.map(entry => String(entry.scope || entry.ownerScope || '')));
      for (const scope of ['personal', 'squad', 'global']) {
        assert(scopes.has(scope), `current directive views must include ${scope} scope`);
      }
      const squadScope = currentDirectiveViews.find(entry => String(entry.scope || '') === 'squad');
      assert(squadScope, 'squad directive scope must be present even without an active squad');
      assert(
        squadScope.unavailable === true || squadScope.available === false || squadScope.status === 'unavailable',
        'without a squad, squad directives should surface as unavailable instead of disappearing',
      );
      const serializedViews = JSON.stringify({ currentDirectiveViews, previousDirectiveViews });
      assert(!serializedViews.includes('ownerId'), 'readable directive views must not leak ownerId');
      assert(!serializedViews.includes('requestHash'), 'readable directive views must not leak requestHash');
      assert(!serializedViews.includes('criteriaMetric'), 'readable directive views must not leak internal criteria metrics');
    }, failures);

    await runCheck('personal directive claim is route-bound and rewards exactly once', async () => {
      assert(scenario.rotationId, 'authoritative contribution check must establish the current rotation');
      let current = await getWorldCurrent(primary.token);
      assert.equal(current.status, 200, JSON.stringify(current.payload));
      const personalView = extractDirectiveViews(current.payload)
        .find(entry => String(entry?.scope || '') === 'personal');
      assert(personalView, 'current payload must expose a personal directive');
      const personalDirective = await loadRotationDirectiveDefinition(
        scenario.rotationId,
        personalView.directiveId,
      );

      const squadCreate = await routeBoundSignedRequest('/api/social/rift-squads', {
        token: primary.token,
        data: {
          protocolVersion: String(current.payload?.riftSquad?.protocolVersion || 'world-rift-squad-v1'),
          rotationId: scenario.rotationId,
          mutationId: `${nextId('mutation')}-directive-squad-create`,
        },
      });
      assert.equal(squadCreate.status, 200, JSON.stringify(squadCreate.payload));

      const attemptLimit = Math.min(5, Number(current.payload?.allowance?.attemptLimit || 5));
      let usedAttempts = Number(current.payload?.allowance?.usedAttempts || 0);
      let claimable = extractDirectiveViews(current.payload)
        .find(entry => String(entry?.scope || '') === 'personal' && entry?.claimable === true);
      while ((!claimable || !scenario.squadContributionId) && usedAttempts < attemptLimit) {
        const completed = await completeWorldRiftContribution(
          primary.token,
          scenario.rotationId,
          personalDirective,
        );
        const contributionId = String(completed.contribution?.contributionId || '');
        assert(contributionId, 'follow-up directive run must return a contribution id');
        scenario.contributionIds.push(contributionId);
        if (!scenario.squadContributionId) scenario.squadContributionId = contributionId;
        current = await getWorldCurrent(primary.token);
        assert.equal(current.status, 200, JSON.stringify(current.payload));
        usedAttempts = Number(current.payload?.allowance?.usedAttempts || usedAttempts + 1);
        claimable = extractDirectiveViews(current.payload)
          .find(entry => String(entry?.scope || '') === 'personal' && entry?.claimable === true);
      }
      assert(
        claimable,
        `personal directive must become claimable within ${attemptLimit} official runs: ${JSON.stringify(current.payload?.directives)}`,
      );
      assert(scenario.squadContributionId, 'ops coverage needs one contribution bound to the active squad');
      const squadProjectionOwners = await dbAll(
        `SELECT DISTINCT owner_type
         FROM world_rift_directive_projections
         WHERE contribution_id = ?
         ORDER BY owner_type`,
        [scenario.squadContributionId],
      );
      assert.deepEqual(
        squadProjectionOwners.map(row => String(row.owner_type || '')),
        ['account', 'global', 'squad'],
        'a contribution made after squad creation must project all three directive owners',
      );

      scenario.directiveId = String(claimable.directiveId || '');
      const claimPath = `/api/world-rift/directives/${encodeURIComponent(scenario.directiveId)}/claim`;
      const wrongRouteData = {
        protocolVersion: PROTOCOL_VERSION,
        rotationId: scenario.rotationId,
        directiveId: scenario.directiveId,
        mutationId: `${nextId('mutation')}-directive-wrong-route`,
      };
      const wrongRoute = await request(claimPath, {
        method: 'POST',
        token: primary.token,
        body: {
          ...wrongRouteData,
          ...signSessionV2Payload('POST', '/api/world-rift/contributions', wrongRouteData, primary.token),
        },
      });
      assert.equal(wrongRoute.status, 403, JSON.stringify(wrongRoute.payload));
      assert.equal(
        wrongRoute.payload?.reason,
        'session-signature-mismatch',
        'a signature bound to contributions must not authorize directive claim',
      );

      const legacyData = {
        protocolVersion: PROTOCOL_VERSION,
        rotationId: scenario.rotationId,
        directiveId: scenario.directiveId,
        mutationId: `${nextId('mutation')}-directive-session-v1`,
      };
      const legacySignature = await request(claimPath, {
        method: 'POST',
        token: primary.token,
        body: { ...legacyData, ...signSessionV1Payload(legacyData, primary.token) },
      });
      assert.equal(legacySignature.status, 400, JSON.stringify(legacySignature.payload));
      assert.equal(
        legacySignature.payload?.reason,
        'route-bound-signature-required',
        'directive claim must reject a valid legacy session-v1 signature',
      );
      const rejectedClaimCount = await dbGet(
        `SELECT COUNT(*) AS count
         FROM world_rift_directive_claims
         WHERE user_id = ? AND rotation_id = ? AND directive_id = ?`,
        [primary.userId, scenario.rotationId, scenario.directiveId],
      );
      assert.equal(Number(rejectedClaimCount?.count || 0), 0, 'rejected signatures must not create a directive claim');

      const balanceBefore = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [primary.userId],
      );
      const startingBalance = Number(balanceBefore?.balance || 0);
      const claimMutationId = `${nextId('mutation')}-directive-claim`;
      const claimData = {
        protocolVersion: PROTOCOL_VERSION,
        rotationId: scenario.rotationId,
        directiveId: scenario.directiveId,
        mutationId: claimMutationId,
      };
      const claimed = await signedRequest(claimPath, { token: primary.token, data: claimData });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.payload));
      assert.equal(claimed.payload?.success, true);
      assert.equal(claimed.payload?.alreadyClaimed, false);
      assert.equal(claimed.payload?.idempotent, false);
      assert.equal(claimed.payload?.claim?.currency, 'renown');
      assert.equal(claimed.payload?.claim?.rewardImpact, 'cosmetic_only');
      const rewardAmount = Number(claimed.payload?.claim?.amount || 0);
      assert(rewardAmount > 0, 'completed personal directive must grant positive cosmetic-only renown');
      scenario.claimId = String(claimed.payload?.claim?.claimId || '');
      assert(scenario.claimId, 'directive claim response must expose the persisted claim id');
      const balanceAfterFirst = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [primary.userId],
      );
      assert.equal(Number(balanceAfterFirst?.balance || 0), startingBalance + rewardAmount);

      const mutationReplay = await signedRequest(claimPath, { token: primary.token, data: claimData });
      assert.equal(mutationReplay.status, 200, JSON.stringify(mutationReplay.payload));
      assert.equal(mutationReplay.payload?.idempotent, true, 'same claim mutation must replay its stored receipt');
      assert.equal(mutationReplay.payload?.claim?.claimId, scenario.claimId);
      const balanceAfterReplay = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [primary.userId],
      );
      assert.equal(Number(balanceAfterReplay?.balance || 0), Number(balanceAfterFirst?.balance || 0));

      const reclaimed = await signedRequest(claimPath, {
        token: primary.token,
        data: { ...claimData, mutationId: `${nextId('mutation')}-directive-reclaim` },
      });
      assert.equal(reclaimed.status, 200, JSON.stringify(reclaimed.payload));
      assert.equal(reclaimed.payload?.alreadyClaimed, true, 'new mutation against an issued claim must report alreadyClaimed');
      assert.equal(reclaimed.payload?.idempotent, false);
      assert.equal(reclaimed.payload?.claim?.claimId, scenario.claimId);
      const balanceAfterReclaim = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [primary.userId],
      );
      assert.equal(Number(balanceAfterReclaim?.balance || 0), Number(balanceAfterFirst?.balance || 0));

      const claims = await dbAll(
        `SELECT claim_id, currency, amount, reward_impact, ledger_entry_id
         FROM world_rift_directive_claims
         WHERE user_id = ? AND rotation_id = ? AND directive_id = ?`,
        [primary.userId, scenario.rotationId, scenario.directiveId],
      );
      assert.equal(claims.length, 1, 'claim replay and reclaim must leave exactly one directive claim row');
      assert.equal(claims[0].claim_id, scenario.claimId);
      assert.equal(claims[0].currency, 'renown');
      assert.equal(claims[0].reward_impact, 'cosmetic_only');
      assert.equal(Number(claims[0].amount || 0), rewardAmount);
      const ledger = await dbAll(
        `SELECT entry_id, currency, delta, balance_after, reward_impact
         FROM progression_economy_ledger
         WHERE user_id = ?
           AND source_type = 'world_rift_directive'
           AND source_id = ?`,
        [primary.userId, `world_rift_directive:${scenario.rotationId}:${scenario.directiveId}`],
      );
      assert.equal(ledger.length, 1, 'claim replay and reclaim must leave exactly one directive economy ledger row');
      assert.equal(ledger[0].entry_id, claims[0].ledger_entry_id);
      assert.equal(ledger[0].currency, 'renown');
      assert.equal(ledger[0].reward_impact, 'cosmetic_only');
      assert.equal(Number(ledger[0].delta || 0), rewardAmount);
      assert.equal(Number(ledger[0].balance_after || 0), startingBalance + rewardAmount);
    }, failures);

    await runCheck('same-account concurrent directive claim across independent services rewards once with explainable receipts', async () => {
      assert(scenario.rotationId, 'directive claim race needs the current rotation fixture');
      const concurrentUser = await registerAndLogin('rift-directive-race');
      const prepared = await ensureClaimablePersonalDirective(concurrentUser, scenario.rotationId);
      const concurrentDirectiveId = String(prepared.claimable?.directiveId || '');
      assert(concurrentDirectiveId, 'concurrent claim fixture must expose a directive id');

      const balanceBefore = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [concurrentUser.userId],
      );
      const startingBalance = Number(balanceBefore?.balance || 0);
      const claimPayloadA = {
        protocolVersion: PROTOCOL_VERSION,
        rotationId: prepared.rotationId,
        directiveId: concurrentDirectiveId,
        mutationId: `${nextId('mutation')}-directive-race-a`,
      };
      const claimPayloadB = {
        protocolVersion: PROTOCOL_VERSION,
        rotationId: prepared.rotationId,
        directiveId: concurrentDirectiveId,
        mutationId: `${nextId('mutation')}-directive-race-b`,
      };
      const [claimA, claimB] = await Promise.all([
        invokeWorldRiftServiceInChild('claimDirective', {
          userId: concurrentUser.userId,
          directiveId: concurrentDirectiveId,
          request: claimPayloadA,
        }),
        invokeWorldRiftServiceInChild('claimDirective', {
          userId: concurrentUser.userId,
          directiveId: concurrentDirectiveId,
          request: claimPayloadB,
        }),
      ]);
      const responses = [claimA, claimB];
      const claimIds = [...new Set(responses.map(response => String(response?.claim?.claimId || '')))];
      assert.deepEqual(
        responses
          .map(response => `${response?.alreadyClaimed === true}:${response?.idempotent === true}`)
          .sort(),
        ['false:false', 'true:false'],
        'concurrent distinct mutations must resolve into one issued claim receipt and one already-claimed receipt',
      );
      assert.equal(claimIds.length, 1, 'concurrent claims must converge on one durable claim id');
      const rewardAmount = Number(claimA?.claim?.amount || claimB?.claim?.amount || 0);
      assert(rewardAmount > 0, 'concurrent directive claim must still return a positive reward amount');
      assert(
        responses.every(response => Number(response?.claim?.amount || 0) === rewardAmount),
        'both concurrent claim responses must describe the same reward amount',
      );
      assert(
        responses.every(response => Number(response?.balance?.balance || 0) === startingBalance + rewardAmount),
        'both concurrent claim responses must converge on the same post-claim balance',
      );

      const claimRows = await dbAll(
        `SELECT claim_id, ledger_entry_id, currency, amount, reward_impact
         FROM world_rift_directive_claims
         WHERE user_id = ? AND rotation_id = ? AND directive_id = ?`,
        [concurrentUser.userId, prepared.rotationId, concurrentDirectiveId],
      );
      const ledgerRows = await dbAll(
        `SELECT entry_id, currency, delta, balance_after, reward_impact
         FROM progression_economy_ledger
         WHERE user_id = ?
           AND source_type = 'world_rift_directive'
           AND source_id = ?`,
        [concurrentUser.userId, `world_rift_directive:${prepared.rotationId}:${concurrentDirectiveId}`],
      );
      const balanceAfter = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [concurrentUser.userId],
      );
      assert.equal(claimRows.length, 1, 'concurrent directive claims must persist one claim row');
      assert.equal(ledgerRows.length, 1, 'concurrent directive claims must write one directive ledger row');
      assert.equal(claimRows[0].claim_id, claimIds[0]);
      assert.equal(claimRows[0].ledger_entry_id, ledgerRows[0].entry_id);
      assert.equal(claimRows[0].currency, 'renown');
      assert.equal(claimRows[0].reward_impact, 'cosmetic_only');
      assert.equal(Number(claimRows[0].amount || 0), rewardAmount);
      assert.equal(ledgerRows[0].currency, 'renown');
      assert.equal(ledgerRows[0].reward_impact, 'cosmetic_only');
      assert.equal(Number(ledgerRows[0].delta || 0), rewardAmount);
      assert.equal(Number(ledgerRows[0].balance_after || 0), startingBalance + rewardAmount);
      assert.equal(Number(balanceAfter?.balance || 0), startingBalance + rewardAmount);
    }, failures);

    await runCheck('independent claim and reconcile overlap preserve directive state, claim row, ledger, and balance', async () => {
      assert(scenario.rotationId, 'directive overlap race needs the current rotation fixture');
      const overlapUser = await registerAndLogin('rift-directive-overlap');
      const prepared = await ensureClaimablePersonalDirective(overlapUser, scenario.rotationId);
      const overlapDirectiveId = String(prepared.claimable?.directiveId || '');
      assert(overlapDirectiveId, 'overlap claim fixture must expose a directive id');
      const baselinePersistence = await snapshotDirectivePersistence(prepared.rotationId);
      const claimCountBefore = await dbGet(
        `SELECT COUNT(*) AS count
         FROM world_rift_directive_claims
         WHERE rotation_id = ?`,
        [prepared.rotationId],
      );
      const balanceBefore = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [overlapUser.userId],
      );
      const startingBalance = Number(balanceBefore?.balance || 0);
      const [claimed, reconciled] = await Promise.all([
        invokeWorldRiftServiceInChild('claimDirective', {
          userId: overlapUser.userId,
          directiveId: overlapDirectiveId,
          request: {
            protocolVersion: PROTOCOL_VERSION,
            rotationId: prepared.rotationId,
            directiveId: overlapDirectiveId,
            mutationId: `${nextId('mutation')}-directive-overlap-claim`,
          },
        }),
        invokeWorldRiftServiceInChild('reconcileDirectives', {
          request: {
            rotationId: prepared.rotationId,
          },
        }),
      ]);
      const rewardAmount = Number(claimed?.claim?.amount || 0);
      assert.equal(claimed?.alreadyClaimed, false, 'overlap claim should still issue one first-time receipt');
      assert.equal(claimed?.idempotent, false);
      assert(rewardAmount > 0, 'overlap claim should still issue a positive reward');
      assert.equal(Number(claimed?.balance?.balance || 0), startingBalance + rewardAmount);
      assert.equal(reconciled?.success, true, 'concurrent reconcile should still complete successfully');
      assert.equal(Number(reconciled?.projections || 0), baselinePersistence.projections.length);
      assert(
        [Number(claimCountBefore?.count || 0), Number(claimCountBefore?.count || 0) + 1]
          .includes(Number(reconciled?.preservedClaims || 0)),
        'overlap reconcile should observe either the pre-race claim count or the post-claim count',
      );

      const claimsAfter = await dbAll(
        `SELECT claim_id, ledger_entry_id, currency, amount, reward_impact
         FROM world_rift_directive_claims
         WHERE user_id = ? AND rotation_id = ? AND directive_id = ?`,
        [overlapUser.userId, prepared.rotationId, overlapDirectiveId],
      );
      const ledgerAfter = await dbAll(
        `SELECT entry_id, currency, delta, balance_after, reward_impact
         FROM progression_economy_ledger
         WHERE user_id = ?
           AND source_type = 'world_rift_directive'
           AND source_id = ?`,
        [overlapUser.userId, `world_rift_directive:${prepared.rotationId}:${overlapDirectiveId}`],
      );
      const balanceAfter = await dbGet(
        `SELECT balance
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [overlapUser.userId],
      );
      const persistenceAfter = await snapshotDirectivePersistence(prepared.rotationId);
      const overlapCurrent = await getWorldCurrent(overlapUser.token);
      assert.equal(overlapCurrent.status, 200, JSON.stringify(overlapCurrent.payload));
      const claimedView = extractDirectiveViews(overlapCurrent.payload)
        .find(entry => String(entry?.directiveId || '') === overlapDirectiveId);
      assert.equal(claimsAfter.length, 1, 'claim/reconcile overlap must preserve exactly one claim row');
      assert.equal(ledgerAfter.length, 1, 'claim/reconcile overlap must preserve exactly one directive ledger row');
      assert.equal(claimsAfter[0].claim_id, String(claimed?.claim?.claimId || ''));
      assert.equal(claimsAfter[0].ledger_entry_id, ledgerAfter[0].entry_id);
      assert.equal(Number(claimsAfter[0].amount || 0), rewardAmount);
      assert.equal(Number(ledgerAfter[0].delta || 0), rewardAmount);
      assert.equal(Number(ledgerAfter[0].balance_after || 0), startingBalance + rewardAmount);
      assert.equal(Number(balanceAfter?.balance || 0), startingBalance + rewardAmount);
      assert.deepEqual(
        persistenceAfter,
        baselinePersistence,
        'claim/reconcile overlap must leave directive state/projection persistence identical to the deterministic baseline',
      );
      assert.equal(claimedView?.claimed, true, 'claim/reconcile overlap must keep the directive publicly claimed');
      assert(Number(claimedView?.claimedAt || 0) > 0, 'claimed directive view should retain claimedAt after overlap');
    }, failures);

    await runCheck('ops replay and reconcile rebuild directives without duplicating rewards', async () => {
      assert(scenario.squadContributionId && scenario.claimId, 'claim coverage must establish ops fixtures');
      const beforeCurrent = await getWorldCurrent(primary.token);
      assert.equal(beforeCurrent.status, 200, JSON.stringify(beforeCurrent.payload));
      const publicBefore = publicDirectiveProgressSnapshot(beforeCurrent.payload);
      assert.deepEqual(
        [...new Set(publicBefore.map(entry => entry.scope))].sort(),
        ['global', 'personal', 'squad'],
        'ops fixture must expose all directive scopes before replay',
      );
      const persistenceBefore = await snapshotDirectivePersistence(scenario.rotationId);
      assert.deepEqual(
        [...new Set(persistenceBefore.states.map(row => String(row.scope || '')))].sort(),
        ['global', 'personal', 'squad'],
        'ops fixture must persist state for all directive scopes',
      );

      const replay = await request('/api/world-rift/ops/directives/replay', {
        method: 'POST',
        token: primary.token,
        headers: { 'x-defier-ops-token': OPS_TOKEN },
        body: {
          rotationId: scenario.rotationId,
          contributionId: scenario.squadContributionId,
        },
      });
      assert.equal(replay.status, 200, JSON.stringify(replay.payload));
      assert.equal(replay.payload?.success, true);
      const replayDeltas = Array.isArray(replay.payload?.deltas) ? replay.payload.deltas : [];
      assert.deepEqual(
        [...new Set(replayDeltas.map(entry => String(entry?.scope || '')))].sort(),
        ['global', 'personal', 'squad'],
        'single-contribution ops replay must inspect every bound directive scope',
      );
      assert(
        replayDeltas.every(entry => entry?.projected === false && Number(entry?.delta || 0) === 0),
        'replaying an already projected contribution must report only zero-delta existing projections',
      );
      const persistenceAfterReplay = await snapshotDirectivePersistence(scenario.rotationId);
      assert.deepEqual(
        persistenceAfterReplay,
        persistenceBefore,
        'single-contribution ops replay must not add projections or change directive state',
      );

      assert(persistenceBefore.projections.length > 0, 'ops reconcile fixture must contain directive projections');
      const corruptedState = await dbRun(
        `UPDATE world_rift_directive_states
         SET progress_value = 0, progress_json = '{}', state_version = 0,
             completed_at = 0, last_projection_id = ''
         WHERE rotation_id = ?`,
        [scenario.rotationId],
      );
      assert(corruptedState.changes > 0, 'ops reconcile fixture must corrupt persisted directive states');
      const deletedProjection = await dbRun(
        `DELETE FROM world_rift_directive_projections
         WHERE projection_id = ?`,
        [persistenceBefore.projections[0].projection_id],
      );
      assert.equal(deletedProjection.changes, 1, 'ops reconcile fixture must remove exactly one projection');
      const corruptedPersistence = await snapshotDirectivePersistence(scenario.rotationId);
      assert.notDeepEqual(
        corruptedPersistence,
        persistenceBefore,
        'ops reconcile fixture must differ from the contribution-derived baseline before repair',
      );

      const claimsBefore = await dbAll(
        `SELECT claim_id, user_id, rotation_id, directive_id, scope, owner_type, owner_id,
                currency, amount, reward_impact, ledger_entry_id, claim_payload_json, claimed_at
         FROM world_rift_directive_claims
         WHERE rotation_id = ?
           AND user_id = ?
           AND directive_id = ?
         ORDER BY claim_id`,
        [scenario.rotationId, primary.userId, scenario.directiveId],
      );
      const rotationClaimCountBefore = await dbGet(
        `SELECT COUNT(*) AS count
         FROM world_rift_directive_claims
         WHERE rotation_id = ?`,
        [scenario.rotationId],
      );
      const ledgerBefore = await dbAll(
        `SELECT entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                reward_impact, metadata_json, created_at
         FROM progression_economy_ledger
         WHERE user_id = ? AND source_type = 'world_rift_directive'
         ORDER BY entry_id`,
        [primary.userId],
      );
      const balanceBefore = await dbGet(
        `SELECT user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [primary.userId],
      );
      assert.equal(claimsBefore.length, 1, 'ops reconcile fixture must contain exactly one issued directive claim');
      assert.equal(ledgerBefore.length, 1, 'ops reconcile fixture must contain exactly one directive reward ledger row');

      const reconciled = await request('/api/world-rift/ops/directives/reconcile', {
        method: 'POST',
        token: primary.token,
        headers: { 'x-defier-ops-token': OPS_TOKEN },
        body: { rotationId: scenario.rotationId },
      });
      assert.equal(reconciled.status, 200, JSON.stringify(reconciled.payload));
      assert.equal(reconciled.payload?.success, true);
      assert.equal(Number(reconciled.payload?.projections || 0), persistenceBefore.projections.length);
      assert.equal(Number(reconciled.payload?.preservedClaims || 0), Number(rotationClaimCountBefore?.count || 0));
      assert.deepEqual(
        [...new Set((reconciled.payload?.states || []).map(entry => String(entry?.scope || '')))].sort(),
        ['global', 'personal', 'squad'],
        'rotation reconcile report must cover every rebuilt directive scope',
      );

      const persistenceAfterReconcile = await snapshotDirectivePersistence(scenario.rotationId);
      assert.deepEqual(
        persistenceAfterReconcile,
        persistenceBefore,
        'rotation reconcile must deterministically rebuild the same states and projection journal',
      );
      const claimsAfter = await dbAll(
        `SELECT claim_id, user_id, rotation_id, directive_id, scope, owner_type, owner_id,
                currency, amount, reward_impact, ledger_entry_id, claim_payload_json, claimed_at
         FROM world_rift_directive_claims
         WHERE rotation_id = ?
           AND user_id = ?
           AND directive_id = ?
         ORDER BY claim_id`,
        [scenario.rotationId, primary.userId, scenario.directiveId],
      );
      const ledgerAfter = await dbAll(
        `SELECT entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                reward_impact, metadata_json, created_at
         FROM progression_economy_ledger
         WHERE user_id = ? AND source_type = 'world_rift_directive'
         ORDER BY entry_id`,
        [primary.userId],
      );
      const balanceAfter = await dbGet(
        `SELECT user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = 'renown'`,
        [primary.userId],
      );
      assert.deepEqual(claimsAfter, claimsBefore, 'rotation reconcile must preserve the issued claim row verbatim');
      assert.deepEqual(ledgerAfter, ledgerBefore, 'rotation reconcile must not issue another economy ledger reward');
      assert.deepEqual(balanceAfter, balanceBefore, 'rotation reconcile must not change the renown balance');

      const afterCurrent = await getWorldCurrent(primary.token);
      assert.equal(afterCurrent.status, 200, JSON.stringify(afterCurrent.payload));
      assert.deepEqual(
        publicDirectiveProgressSnapshot(afterCurrent.payload),
        publicBefore,
        'rotation reconcile must preserve public progress and claim state for every scope',
      );
      const claimedPersonal = extractDirectiveViews(afterCurrent.payload)
        .find(entry => String(entry?.directiveId || '') === scenario.directiveId);
      assert.equal(claimedPersonal?.claimed, true, 'issued personal claim must remain visible after reconcile');
      scenario.primaryAfterOps = afterCurrent.payload;
    }, failures);

    await runCheck('player directive views isolate personal owners and share only global progress', async () => {
      const secondary = await registerAndLogin('rift-directive-secondary');
      const primaryCurrent = scenario.primaryAfterOps
        ? { status: 200, payload: scenario.primaryAfterOps }
        : await getWorldCurrent(primary.token);
      const secondaryCurrent = await getWorldCurrent(secondary.token);
      assert.equal(primaryCurrent.status, 200, JSON.stringify(primaryCurrent.payload));
      assert.equal(secondaryCurrent.status, 200, JSON.stringify(secondaryCurrent.payload));
      const primaryViews = extractDirectiveViews(primaryCurrent.payload);
      const secondaryViews = extractDirectiveViews(secondaryCurrent.payload);
      const primaryPersonal = primaryViews.find(entry => String(entry?.directiveId || '') === scenario.directiveId);
      const secondaryPersonal = secondaryViews.find(entry => String(entry?.directiveId || '') === scenario.directiveId);
      assert(primaryPersonal && secondaryPersonal, 'both accounts must receive the same personal directive definition');
      assert.equal(primaryPersonal.claimed, true);
      assert(
        Number(primaryPersonal.completedAt || 0) > 0
          || Number(primaryPersonal.progress || 0) >= Number(primaryPersonal.target || 1),
        'claimed personal directive should stay completed even if the view reports a non-threshold progress counter',
      );
      assert.equal(Number(secondaryPersonal.progress || 0), 0, 'second account must not inherit first account personal progress');
      assert.equal(secondaryPersonal.claimed, false, 'second account must not inherit first account personal claim');
      assert.equal(Number(secondaryPersonal.claimedAt || 0), 0);
      assert(!JSON.stringify(secondaryPersonal).includes(scenario.claimId), 'second account directive view must not expose first claim id');

      const globalSnapshot = views => views
        .filter(entry => String(entry?.scope || '') === 'global')
        .map(entry => ({
          directiveId: String(entry?.directiveId || ''),
          progress: Number(entry?.progress || 0),
          target: Number(entry?.target || 0),
          completedAt: Number(entry?.completedAt || 0),
        }))
        .sort((left, right) => left.directiveId.localeCompare(right.directiveId));
      assert.deepEqual(
        globalSnapshot(secondaryViews),
        globalSnapshot(primaryViews),
        'global directive progress must be identical for all viewers',
      );

      for (const [label, payload] of [
        ['primary', primaryCurrent.payload],
        ['secondary', secondaryCurrent.payload],
      ]) {
        const keys = collectJsonKeys(payload);
        for (const forbidden of ['ownerId', 'owner_id', 'requestHash', 'request_hash', 'criteria', 'criteriaMetric', 'metric']) {
          assert(!keys.has(forbidden), `${label} player JSON must not expose internal directive field ${forbidden}`);
        }
      }
    }, failures);

    if (failures.length > 0) {
      const summary = failures.map((failure, index) => {
        const message = failure.error && failure.error.message ? failure.error.message : String(failure.error);
        return `${index + 1}. ${failure.name}: ${message}`;
      }).join('\n');
      throw new Error(`World-rift directive platform checks failed:\n${summary}`);
    }

    console.log('World rift directive platform checks passed.');
  } finally {
    await stopServer(server);
    removeDbFiles();
  }
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
