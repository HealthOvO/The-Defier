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
const PORT = Number(process.env.AUTHORITATIVE_RUNS_PLATFORM_TEST_PORT || 9057);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.AUTHORITATIVE_RUNS_PLATFORM_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-authoritative-runs-platform-${process.pid}.sqlite`);
const JWT_SECRET = 'authoritative-runs-platform-jwt-secret';
const HMAC_SECRET = 'authoritative-runs-platform-hmac-secret';
const OPS_TOKEN = 'authoritative-runs-platform-ops-token';
const BLOCK_CARDS = new Set(['guard', 'iron_mandate']);
const TERMINAL_PHASES = new Set(['completed', 'defeated', 'abandoned']);
const RELAY_RUN_TTL_MS = 2 * 60 * 60 * 1000;

process.env.DEFIER_DB_PATH = DB_PATH;

const { CONTENT_SNAPSHOT, CONTENT_VERSION } = require('../server/progression/authoritative-runs/catalog');

function loadAuthoritativeRunsService() {
  const target = require.resolve('../server/progression/authoritative-runs/service');
  delete require.cache[target];
  return require(target);
}

const {
  getCurrentAuthoritativeRun,
  issueAuthoritativeRun,
  SETTLEMENT_RECEIPT_RECOVERY_WINDOW_MS
} = loadAuthoritativeRunsService();

let runCounter = 0;
let actionCounter = 0;
let mutationCounter = 0;
let userCounter = 0;

function nextId(prefix) {
  if (prefix === 'run') runCounter += 1;
  if (prefix === 'action') actionCounter += 1;
  if (prefix === 'mutation') mutationCounter += 1;
  if (prefix === 'user') userCounter += 1;
  const counters = {
    run: runCounter,
    action: actionCounter,
    mutation: mutationCounter,
    user: userCounter
  };
  return `ar-${prefix}-${String(counters[prefix]).padStart(4, '0')}`;
}

function seedHex(label) {
  return crypto.createHash('sha256').update(String(label), 'utf8').digest('hex');
}

function countDeck(cards) {
  return cards.reduce((accumulator, cardId) => {
    accumulator[cardId] = (accumulator[cardId] || 0) + 1;
    return accumulator;
  }, {});
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function buildServerBootstrapScript() {
  return `
    require('./server/app.js');
  `;
}

function startServer() {
  const child = spawn(process.execPath, ['-e', buildServerBootstrapScript()], {
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
      DEFIER_GIT_SHA: 'authoritative-runs-platform-test-sha'
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
  return { child, getOutput: () => output };
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
    if (server.child.exitCode !== null) {
      throw new Error(`authoritative runs backend exited early\n${server.getOutput()}`);
    }
    try {
      const response = await request('/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') return;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`authoritative runs backend health timed out\n${server.getOutput()}`);
}

function signSessionPayload(data, token, salt = `arsig-${crypto.randomBytes(12).toString('hex')}`) {
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
    body: { ...data, ...signSessionPayload(data, token) }
  });
}

async function registerAndLogin() {
  const username = `author-${Date.now().toString(36)}-${nextId('u').slice(-4)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(registered.status, 200, JSON.stringify(registered.payload));
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(login.status, 200, JSON.stringify(login.payload));
  return {
    username,
    token: login.payload?.token || login.payload?.user?.sessionToken,
    userId: login.payload?.user?.id || login.payload?.user?.objectId
  };
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

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(sql, params, function onRun(error) {
      const result = {
        changes: this && this.changes || 0,
        lastID: this && this.lastID || 0
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

async function startRun(token, mode, clientRunId = `${mode}-${nextId('run')}`) {
  const response = await signedRequest('/api/progression/authoritative-runs', {
    token,
    data: {
      clientRunId,
      mode,
      contentVersion: CONTENT_VERSION
    }
  });
  assert.strictEqual(response.status, 200, JSON.stringify(response.payload));
  return response;
}

async function getCurrentRun(token, mode) {
  return request(`/api/progression/authoritative-runs/current?mode=${encodeURIComponent(mode)}`, {
    method: 'GET',
    token
  });
}

async function getRun(token, runId) {
  return request(`/api/progression/authoritative-runs/${runId}`, {
    method: 'GET',
    token
  });
}

async function getReplay(token, runId) {
  return request(`/api/progression/authoritative-runs/${runId}/replay`, {
    method: 'GET',
    token
  });
}

async function submitAction(token, runId, expectedVersion, command, payload, actionId = nextId('action')) {
  return signedRequest(`/api/progression/authoritative-runs/${runId}/actions`, {
    token,
    data: {
      runId,
      actionId,
      expectedVersion,
      command,
      payload
    }
  });
}

async function settleRun(token, runId, expectedVersion, mutationId = nextId('mutation')) {
  return signedRequest(`/api/progression/authoritative-runs/${runId}/settle`, {
    token,
    data: {
      runId,
      mutationId,
      expectedVersion
    }
  });
}

async function issueInternalRelayRun(userId, {
  clientRunId,
  scenarioId,
  ttlMs,
  seedLabel = `relay:${scenarioId}:${clientRunId}`
}) {
  return issueAuthoritativeRun(
    userId,
    {
      clientRunId,
      mode: 'relay_expedition',
      contentVersion: CONTENT_VERSION,
    },
    Date.now(),
    {
      binding: {
        type: 'relay_expedition',
        sessionId: `relay-session-${scenarioId}`,
        legId: `relay-leg-${scenarioId}`,
      },
      seedHex: seedHex(seedLabel),
      scenarioId,
      runTtlMs: ttlMs,
    }
  );
}

async function driveRun(token, run, { maxSteps = 256, stopAfterSteps = null } = {}) {
  let currentRun = run;
  const actions = [];
  while (String(currentRun.status || '') === 'active' && actions.length < maxSteps) {
    if (stopAfterSteps !== null && actions.length >= stopAfterSteps) break;
    const [command, payload] = chooseCommandFromProjection(currentRun.projection || currentRun.state);
    const response = await submitAction(
      token,
      currentRun.runId,
      Number(currentRun.stateVersion),
      command,
      payload
    );
    assert.strictEqual(response.status, 200, JSON.stringify(response.payload));
    actions.push(response.payload.action);
    currentRun = response.payload.run;
  }
  return { run: currentRun, actions };
}

async function opsOverview(token = OPS_TOKEN) {
  return request('/api/progression/ops/authoritative-runs', {
    method: 'GET',
    headers: token ? { 'x-defier-ops-token': token } : {}
  });
}

async function retention(days, token = OPS_TOKEN) {
  return request('/api/progression/ops/authoritative-runs/retention', {
    method: 'POST',
    headers: { 'x-defier-ops-token': token },
    body: { retentionDays: days }
  });
}

async function main() {
  removeDbFiles();
  let server = startServer();
  try {
    await waitForHealth(server);

    const version = await request('/api/version');
    assert.strictEqual(version.status, 200, JSON.stringify(version.payload));
    assert.strictEqual(version.payload?.schema?.version, 11);
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0011_authoritative_fate_chronicle');
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
        '0010_relay_expedition',
        '0011_authoritative_fate_chronicle'
      ]
    );

    for (const table of [
      'progression_authoritative_run_catalogs',
      'progression_authoritative_runs',
      'progression_authoritative_run_actions',
      'progression_authoritative_run_snapshots',
      'progression_authoritative_run_receipts',
      'progression_authoritative_run_ops_events',
      'progression_authoritative_run_ops_counters'
    ]) {
      const row = await dbGet(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        [table]
      );
      assert.strictEqual(row?.name, table, `schema should create ${table}`);
    }

    const primary = await registerAndLogin();
    const secondary = await registerAndLogin();

    const faultRunStart = await startRun(secondary.token, 'expedition', 'fault-expedition-client-0001');
    let faultRun = faultRunStart.payload.run;
    const faultActionId = nextId('action');
    await dbRun(
      `CREATE TRIGGER authoritative_run_fault_after_action
       BEFORE UPDATE OF action_count ON progression_authoritative_runs
       WHEN OLD.run_id = '${faultRun.runId}'
       BEGIN
         SELECT RAISE(ABORT, 'authoritative-run-fault');
       END`
    );
    const faultedAction = await submitAction(
      secondary.token,
      faultRun.runId,
      0,
      'select_node',
      { nodeId: faultRun.projection.route.choices[0].nodeId },
      faultActionId
    );
    assert.strictEqual(faultedAction.status, 500, 'fault injection should abort the action transaction');
    await dbRun('DROP TRIGGER authoritative_run_fault_after_action');
    const faultRollback = await dbGet(
      `SELECT action_count, state_version,
              (SELECT COUNT(*) FROM progression_authoritative_run_actions WHERE run_id = ?) AS actions
       FROM progression_authoritative_runs WHERE run_id = ?`,
      [faultRun.runId, faultRun.runId]
    );
    assert.deepStrictEqual(
      {
        actionCount: Number(faultRollback.action_count),
        stateVersion: Number(faultRollback.state_version),
        actions: Number(faultRollback.actions)
      },
      { actionCount: 0, stateVersion: 0, actions: 0 },
      'mid-transaction failure must leave no partial action or version advance'
    );
    const faultRetry = await submitAction(
      secondary.token,
      faultRun.runId,
      0,
      'select_node',
      { nodeId: faultRun.projection.route.choices[0].nodeId },
      faultActionId
    );
    assert.strictEqual(faultRetry.status, 200, JSON.stringify(faultRetry.payload));
    faultRun = faultRetry.payload.run;
    const faultCleanup = await submitAction(
      secondary.token,
      faultRun.runId,
      faultRun.stateVersion,
      'abandon',
      {},
      nextId('action')
    );
    assert.strictEqual(faultCleanup.status, 200, JSON.stringify(faultCleanup.payload));

    const unsignedStartPayload = {
      clientRunId: 'pve-ar-bootstrap-0001',
      mode: 'pve',
      contentVersion: CONTENT_VERSION
    };
    const unauthenticated = await request('/api/progression/authoritative-runs', {
      method: 'POST',
      body: unsignedStartPayload
    });
    assert.strictEqual(unauthenticated.status, 401);

    const unsigned = await request('/api/progression/authoritative-runs', {
      method: 'POST',
      token: primary.token,
      body: unsignedStartPayload
    });
    expectReason(unsigned, 400, 'missing-signature');

    const badSignature = await request('/api/progression/authoritative-runs', {
      method: 'POST',
      token: primary.token,
      body: {
        ...unsignedStartPayload,
        salt: 'arsig-bad-signature-0001',
        signature: '0'.repeat(64),
        signatureMode: 'session'
      }
    });
    expectReason(badSignature, 403, 'session-signature-mismatch');

    const strictStart = await signedRequest('/api/progression/authoritative-runs', {
      token: primary.token,
      data: {
        ...unsignedStartPayload,
        score: 9999
      }
    });
    expectReason(strictStart, 400, 'invalid_request_payload');

    const staleContentVersion = await signedRequest('/api/progression/authoritative-runs', {
      token: primary.token,
      data: {
        clientRunId: 'pve-ar-stale-content-0001',
        mode: 'pve',
        contentVersion: 'authoritative-trials-v0'
      }
    });
    expectReason(staleContentVersion, 409, 'unsupported_content_version');

    const relayPublicStart = await signedRequest('/api/progression/authoritative-runs', {
      token: primary.token,
      data: {
        clientRunId: 'relay-public-client-0001',
        mode: 'relay_expedition',
        contentVersion: CONTENT_VERSION
      }
    });
    expectReason(relayPublicStart, 403, 'relay_expedition_start_required');

    await dbRun(
      `INSERT INTO game_saves (user_id, slot_index, save_data, save_time)
       VALUES (?, ?, ?, ?)`,
      [
        primary.userId,
        3,
        JSON.stringify({
          hp: 1,
          maxHp: 999,
          deck: ['forged-save-card'],
          heavenlyInsight: 999
        }),
        Date.now()
      ]
    );

    const relayVanguard = await issueInternalRelayRun(primary.userId, {
      clientRunId: 'relay-internal-vanguard-0001',
      scenarioId: 'vanguard'
    });
    assert.strictEqual(relayVanguard.run.mode, 'relay_expedition');
    assert.strictEqual(relayVanguard.run.projection?.scenario?.scenarioId, 'vanguard');
    assert.strictEqual(relayVanguard.run.projection?.player?.hp, CONTENT_SNAPSHOT.scenarios.vanguard.maxHp);
    assert.strictEqual(relayVanguard.run.projection?.player?.maxHp, CONTENT_SNAPSHOT.scenarios.vanguard.maxHp);
    assert.strictEqual(relayVanguard.run.projection?.player?.deckSize, 10);
    assert.deepStrictEqual(
      relayVanguard.run.projection?.player?.deckCounts,
      countDeck(CONTENT_SNAPSHOT.scenarios.vanguard.starterDeck),
      'relay vanguard should ignore account save data and use the standardized deck'
    );
    assert(
      Number(relayVanguard.run.expiresAt) - Number(relayVanguard.run.startedAt) <= RELAY_RUN_TTL_MS,
      `relay vanguard ttl should be capped at 2h, got ${relayVanguard.run.expiresAt} - ${relayVanguard.run.startedAt}`
    );
    const relayCurrent = await getCurrentRun(primary.token, 'relay_expedition');
    assert.strictEqual(relayCurrent.status, 200, JSON.stringify(relayCurrent.payload));
    assert.strictEqual(relayCurrent.payload?.run?.runId, relayVanguard.run.runId);
    assert.strictEqual(relayCurrent.payload?.run?.projection?.scenario?.scenarioId, 'vanguard');

    const relayIdempotent = await issueInternalRelayRun(primary.userId, {
      clientRunId: 'relay-internal-vanguard-0001',
      scenarioId: 'vanguard',
      ttlMs: 30 * 60 * 1000
    });
    assert.strictEqual(relayIdempotent.run.runId, relayVanguard.run.runId);
    assert.strictEqual(relayIdempotent.run.idempotent, true);

    await assert.rejects(
      issueInternalRelayRun(primary.userId, {
        clientRunId: 'relay-invalid-scenario-0001',
        scenarioId: 'unknown'
      }),
      error => error && error.reason === 'relay_expedition_scenario_invalid',
      'relay issue should reject unknown internal scenarios'
    );
    await assert.rejects(
      issueInternalRelayRun(primary.userId, {
        clientRunId: 'relay-invalid-ttl-0001',
        scenarioId: 'bulwark',
        ttlMs: RELAY_RUN_TTL_MS + 1
      }),
      error => error && error.reason === 'relay_expedition_ttl_invalid',
      'relay issue should reject ttl values beyond 2h'
    );

    const startedPve = await startRun(primary.token, 'pve', 'pve-ar-client-0001');
    const startedChallenge = await startRun(primary.token, 'challenge', 'challenge-ar-client-0001');
    const startedExpedition = await startRun(primary.token, 'expedition', 'expedition-ar-client-0001');
    let pveRun = startedPve.payload.run;
    let challengeRun = startedChallenge.payload.run;
    let expeditionRun = startedExpedition.payload.run;
    assert.strictEqual(pveRun.mode, 'pve');
    assert.strictEqual(challengeRun.mode, 'challenge');
    assert.strictEqual(expeditionRun.mode, 'expedition');
    assert.strictEqual(pveRun.authorityLevel, 'server_replayed');
    assert.strictEqual(pveRun.trustTier, 'server_authoritative');

    for (const [mode, runId] of [
      ['pve', pveRun.runId],
      ['challenge', challengeRun.runId],
      ['expedition', expeditionRun.runId]
    ]) {
      const current = await getCurrentRun(primary.token, mode);
      assert.strictEqual(current.status, 200, JSON.stringify(current.payload));
      assert.strictEqual(current.payload?.run?.runId, runId);
      const fetched = await getRun(primary.token, runId);
      assert.strictEqual(fetched.status, 200, JSON.stringify(fetched.payload));
      assert.strictEqual(fetched.payload?.run?.runId, runId);
    }

    const otherAccountGet = await getRun(secondary.token, pveRun.runId);
    expectReason(otherAccountGet, 404, 'authoritative_run_not_found');

    const sameClientRunId = await startRun(primary.token, 'pve', 'pve-ar-client-0001');
    assert.strictEqual(sameClientRunId.payload?.run?.runId, pveRun.runId);
    assert.strictEqual(sameClientRunId.payload?.run?.idempotent, true);

    const sameClientRunIdConflict = await signedRequest('/api/progression/authoritative-runs', {
      token: primary.token,
      data: {
        clientRunId: 'pve-ar-client-0001',
        mode: 'challenge',
        contentVersion: CONTENT_VERSION
      }
    });
    expectReason(sameClientRunIdConflict, 409, 'client_run_conflict');

    const resumedExisting = await startRun(primary.token, 'pve', 'pve-ar-client-0002');
    assert.strictEqual(resumedExisting.payload?.run?.runId, pveRun.runId);
    assert.strictEqual(resumedExisting.payload?.run?.resumedExisting, true);
    assert.strictEqual(resumedExisting.payload?.run?.clientRunId, 'pve-ar-client-0001');

    const actionMismatch = await signedRequest(`/api/progression/authoritative-runs/${pveRun.runId}/actions`, {
      token: primary.token,
      data: {
        runId: challengeRun.runId,
        actionId: nextId('action'),
        expectedVersion: 0,
        command: 'select_node',
        payload: {
          nodeId: pveRun.projection.route.choices[0].nodeId
        }
      }
    });
    expectReason(actionMismatch, 400, 'authoritative_run_id_mismatch');

    const strictActionPayload = await signedRequest(`/api/progression/authoritative-runs/${pveRun.runId}/actions`, {
      token: primary.token,
      data: {
        runId: pveRun.runId,
        actionId: nextId('action'),
        expectedVersion: 0,
        command: 'select_node',
        payload: {
          nodeId: pveRun.projection.route.choices[0].nodeId,
          score: 999
        }
      }
    });
    expectReason(strictActionPayload, 400, 'invalid_action_payload');

    const challengeSelectNodeId = challengeRun.projection.route.choices[0].nodeId;
    const challengeAltNodeId = challengeRun.projection.route.choices[1].nodeId;
    const duplicatedActionId = nextId('action');
    const firstChallengeAction = await submitAction(
      primary.token,
      challengeRun.runId,
      0,
      'select_node',
      { nodeId: challengeSelectNodeId },
      duplicatedActionId
    );
    assert.strictEqual(firstChallengeAction.status, 200, JSON.stringify(firstChallengeAction.payload));
    challengeRun = firstChallengeAction.payload.run;

    const duplicatedChallengeAction = await submitAction(
      primary.token,
      challengeRun.runId,
      0,
      'select_node',
      { nodeId: challengeSelectNodeId },
      duplicatedActionId
    );
    assert.strictEqual(duplicatedChallengeAction.status, 200, JSON.stringify(duplicatedChallengeAction.payload));
    assert.strictEqual(duplicatedChallengeAction.payload?.action?.idempotent, true);
    assert.strictEqual(duplicatedChallengeAction.payload?.run?.idempotent, true);

    const conflictingChallengeAction = await submitAction(
      primary.token,
      challengeRun.runId,
      0,
      'select_node',
      { nodeId: challengeAltNodeId },
      duplicatedActionId
    );
    expectReason(conflictingChallengeAction, 409, 'action_id_conflict');

    const crossRunReplayAction = await submitAction(
      primary.token,
      expeditionRun.runId,
      0,
      'select_node',
      { nodeId: expeditionRun.projection.route.choices[0].nodeId },
      duplicatedActionId
    );
    expectReason(crossRunReplayAction, 409, 'action_replay_conflict');

    const staleActionVersion = await submitAction(
      primary.token,
      challengeRun.runId,
      0,
      'end_turn',
      {},
      nextId('action')
    );
    expectReason(staleActionVersion, 409, 'stale_run_version');

    const expeditionNodeA = expeditionRun.projection.route.choices[0].nodeId;
    const expeditionNodeB = expeditionRun.projection.route.choices[1].nodeId;
    const [concurrentActionA, concurrentActionB] = await Promise.all([
      submitAction(primary.token, expeditionRun.runId, 0, 'select_node', { nodeId: expeditionNodeA }, nextId('action')),
      submitAction(primary.token, expeditionRun.runId, 0, 'select_node', { nodeId: expeditionNodeB }, nextId('action'))
    ]);
    const concurrentStatuses = [concurrentActionA.status, concurrentActionB.status].sort((left, right) => left - right);
    assert.deepStrictEqual(concurrentStatuses, [200, 409], JSON.stringify([concurrentActionA.payload, concurrentActionB.payload]));
    const staleConcurrent = concurrentActionA.status === 409 ? concurrentActionA : concurrentActionB;
    expectReason(staleConcurrent, 409, 'stale_run_version');
    const expeditionCurrent = await getRun(primary.token, expeditionRun.runId);
    assert.strictEqual(expeditionCurrent.status, 200, JSON.stringify(expeditionCurrent.payload));
    expeditionRun = expeditionCurrent.payload.run;
    assert.strictEqual(expeditionRun.stateVersion, 1);

    const firstEight = await driveRun(primary.token, pveRun, { stopAfterSteps: 8 });
    pveRun = firstEight.run;
    assert.strictEqual(firstEight.actions.length, 8);
    assert.strictEqual(pveRun.stateVersion, 8);
    const snapshotRows = await dbAll(
      `SELECT sequence FROM progression_authoritative_run_snapshots
       WHERE run_id = ? ORDER BY sequence ASC`,
      [pveRun.runId]
    );
    assert.deepStrictEqual(snapshotRows.map(row => Number(row.sequence)), [0, 8]);

    const refreshedPve = await getRun(primary.token, pveRun.runId);
    assert.strictEqual(refreshedPve.status, 200, JSON.stringify(refreshedPve.payload));
    assert.strictEqual(refreshedPve.payload?.run?.stateVersion, 8);

    await stopServer(server);
    server = startServer();
    await waitForHealth(server);
    const resumedAfterRestart = await getCurrentRun(primary.token, 'pve');
    assert.strictEqual(resumedAfterRestart.status, 200, JSON.stringify(resumedAfterRestart.payload));
    assert.strictEqual(resumedAfterRestart.payload?.run?.runId, pveRun.runId);
    assert.strictEqual(resumedAfterRestart.payload?.run?.stateVersion, 8);
    pveRun = resumedAfterRestart.payload.run;

    const beforeTamperState = await dbGet(
      `SELECT recovery_count, state_json, state_hash FROM progression_authoritative_runs WHERE run_id = ?`,
      [pveRun.runId]
    );
    await dbRun(
      `UPDATE progression_authoritative_runs
       SET state_json = ?, updated_at = updated_at + 1
       WHERE run_id = ?`,
      ['{"phase":"forged","version":999}', pveRun.runId]
    );
    const recoveredPve = await getRun(primary.token, pveRun.runId);
    assert.strictEqual(recoveredPve.status, 200, JSON.stringify(recoveredPve.payload));
    pveRun = recoveredPve.payload.run;
    assert.strictEqual(pveRun.stateVersion, 8);
    assert(pveRun.recovery.recoveryCount >= Number(beforeTamperState.recovery_count || 0) + 1);
    const afterTamperState = await dbGet(
      `SELECT recovery_count, state_json FROM progression_authoritative_runs WHERE run_id = ?`,
      [pveRun.runId]
    );
    assert(!String(afterTamperState.state_json || '').includes('"forged"'));

    const recoveredOpsRow = await dbGet(
      `SELECT COUNT(*) AS count
       FROM progression_authoritative_run_ops_events
       WHERE event_type = 'state_recovered' AND run_id = ?`,
      [pveRun.runId]
    );
    assert(Number(recoveredOpsRow.count) >= 1, 'state tamper should emit a sanitized recovery event');

    const completedPve = await driveRun(primary.token, pveRun);
    pveRun = completedPve.run;
    assert.strictEqual(pveRun.status, 'completed');
    assert.strictEqual(pveRun.projection.phase, 'completed');

    const settleMismatch = await signedRequest(`/api/progression/authoritative-runs/${pveRun.runId}/settle`, {
      token: primary.token,
      data: {
        runId: challengeRun.runId,
        mutationId: nextId('mutation'),
        expectedVersion: pveRun.stateVersion
      }
    });
    expectReason(settleMismatch, 400, 'authoritative_run_id_mismatch');

    const strictSettle = await signedRequest(`/api/progression/authoritative-runs/${pveRun.runId}/settle`, {
      token: primary.token,
      data: {
        runId: pveRun.runId,
        mutationId: nextId('mutation'),
        expectedVersion: pveRun.stateVersion,
        outcome: 'completed'
      }
    });
    expectReason(strictSettle, 400, 'invalid_settlement_request');

    const staleSettle = await settleRun(primary.token, pveRun.runId, pveRun.stateVersion - 1);
    expectReason(staleSettle, 409, 'stale_run_version');

    const completedChallenge = await driveRun(primary.token, challengeRun);
    challengeRun = completedChallenge.run;
    assert.strictEqual(challengeRun.status, 'completed');
    await dbRun(
      `UPDATE progression_authoritative_run_actions
       SET payload_json = ?
       WHERE run_id = ? AND sequence = 1`,
      ['{"nodeId":"forged-node"}', challengeRun.runId]
    );
    const tamperedJournalSettle = await settleRun(primary.token, challengeRun.runId, challengeRun.stateVersion);
    expectReason(tamperedJournalSettle, 409, 'journal_payload_integrity_failed');
    const rejectedReplayAudit = await dbGet(
      `SELECT COUNT(*) AS count
       FROM progression_authoritative_run_ops_events
       WHERE event_type = 'settlement_replay_rejected' AND run_id = ?`,
      [challengeRun.runId]
    );
    assert(Number(rejectedReplayAudit.count) >= 1, 'failed full replay should survive rollback as a sanitized ops event');

    const replay = await getReplay(primary.token, pveRun.runId);
    assert.strictEqual(replay.status, 200, JSON.stringify(replay.payload));
    assert.strictEqual(replay.payload?.replay?.verified, true);
    const replayJson = JSON.stringify(replay.payload);
    for (const forbidden of ['"rng"', '"drawPile"', '"discardPile"', '"state_json"', JWT_SECRET, HMAC_SECRET, OPS_TOKEN]) {
      assert(!replayJson.includes(forbidden), `replay response must redact ${forbidden}`);
    }

    const relayAdvanced = await driveRun(primary.token, relayVanguard.run, { stopAfterSteps: 6 });
    const relayReplay = await getReplay(primary.token, relayAdvanced.run.runId);
    assert.strictEqual(relayReplay.status, 200, JSON.stringify(relayReplay.payload));
    assert.strictEqual(relayReplay.payload?.replay?.finalState?.scenario?.scenarioId, 'vanguard');
    assert.strictEqual(relayReplay.payload?.replay?.finalState?.mode, 'relay_expedition');

    const completedRelay = await driveRun(primary.token, relayAdvanced.run);
    assert.strictEqual(completedRelay.run.status, 'completed');
    const nextRelayAfterCompleted = await issueInternalRelayRun(primary.userId, {
      clientRunId: 'relay-internal-vanguard-0002',
      scenarioId: 'vanguard'
    });
    assert.notStrictEqual(
      nextRelayAfterCompleted.run.runId,
      completedRelay.run.runId,
      'a completed relay run must not block the same account from receiving a later relay leg'
    );

    await dbRun(
      `CREATE TRIGGER authoritative_settlement_fault_before_receipt
       BEFORE INSERT ON progression_authoritative_run_receipts
       WHEN NEW.run_id = '${pveRun.runId}'
       BEGIN
         SELECT RAISE(ABORT, 'authoritative-settlement-fault');
       END`
    );
    const faultedSettlement = await settleRun(
      primary.token,
      pveRun.runId,
      pveRun.stateVersion,
      'ar-mutation-fault-settlement-0001'
    );
    assert.strictEqual(faultedSettlement.status, 500, 'settlement fault should abort the transaction');
    await dbRun('DROP TRIGGER authoritative_settlement_fault_before_receipt');
    const settlementRollback = await dbGet(
      `SELECT status,
              (SELECT COUNT(*) FROM progression_authoritative_run_receipts WHERE run_id = ?) AS receipts,
              (SELECT COUNT(*) FROM progression_events WHERE user_id = ? AND source_ref = ?) AS events
       FROM progression_authoritative_runs WHERE run_id = ?`,
      [pveRun.runId, primary.userId, `authoritative:${pveRun.runId}`, pveRun.runId]
    );
    assert.deepStrictEqual(
      {
        status: settlementRollback.status,
        receipts: Number(settlementRollback.receipts),
        events: Number(settlementRollback.events)
      },
      { status: 'completed', receipts: 0, events: 0 },
      'mid-settlement failure must roll back both progression event and receipt'
    );

    const settleMutationA = nextId('mutation');
    const settleMutationB = nextId('mutation');
    const [settleConcurrentA, settleConcurrentB] = await Promise.all([
      settleRun(primary.token, pveRun.runId, pveRun.stateVersion, settleMutationA),
      settleRun(primary.token, pveRun.runId, pveRun.stateVersion, settleMutationB)
    ]);
    const concurrentSettles = [
      { response: settleConcurrentA, mutationId: settleMutationA },
      { response: settleConcurrentB, mutationId: settleMutationB }
    ];
    assert.deepStrictEqual(
      concurrentSettles.map(entry => entry.response.status).sort(),
      [200, 200],
      'concurrent settles with different mutation ids must reuse one canonical receipt'
    );
    const winningSettle = concurrentSettles.find(entry => entry.response.payload?.receipt?.idempotent === false);
    const recoveredConcurrentSettle = concurrentSettles.find(entry => entry.response.payload?.receipt?.recovered === true);
    assert(winningSettle, JSON.stringify(concurrentSettles));
    assert(recoveredConcurrentSettle, JSON.stringify(concurrentSettles));
    assert.strictEqual(winningSettle.response.payload?.receipt?.runId, pveRun.runId);
    assert.strictEqual(winningSettle.response.payload?.receipt?.idempotent, false);
    assert.strictEqual(recoveredConcurrentSettle.response.payload?.receipt?.receiptId, winningSettle.response.payload?.receipt?.receiptId);
    assert.strictEqual(recoveredConcurrentSettle.response.payload?.run?.recovered, true);

    const repeatedSettle = await settleRun(primary.token, pveRun.runId, pveRun.stateVersion, winningSettle.mutationId);
    assert.strictEqual(repeatedSettle.status, 200, JSON.stringify(repeatedSettle.payload));
    assert.strictEqual(repeatedSettle.payload?.receipt?.idempotent, true);
    const mismatchedSettleReplay = await settleRun(
      primary.token,
      pveRun.runId,
      Math.max(0, pveRun.stateVersion - 1),
      winningSettle.mutationId
    );
    assert.strictEqual(mismatchedSettleReplay.status, 409, JSON.stringify(mismatchedSettleReplay.payload));
    assert.strictEqual(mismatchedSettleReplay.payload?.reason, 'settlement_mutation_payload_conflict');

    const recoveredAfterLostResponse = await settleRun(
      primary.token,
      pveRun.runId,
      pveRun.stateVersion,
      nextId('mutation')
    );
    assert.strictEqual(recoveredAfterLostResponse.status, 200, JSON.stringify(recoveredAfterLostResponse.payload));
    assert.strictEqual(recoveredAfterLostResponse.payload?.receipt?.receiptId, winningSettle.response.payload?.receipt?.receiptId);
    assert.strictEqual(recoveredAfterLostResponse.payload?.receipt?.idempotent, true);
    assert.strictEqual(recoveredAfterLostResponse.payload?.receipt?.recovered, true);
    const recoveryVersionConflict = await settleRun(
      primary.token,
      pveRun.runId,
      Math.max(0, pveRun.stateVersion - 1),
      nextId('mutation')
    );
    assert.strictEqual(recoveryVersionConflict.status, 409, JSON.stringify(recoveryVersionConflict.payload));
    assert.strictEqual(recoveryVersionConflict.payload?.reason, 'settlement_recovery_version_conflict');

    const settledCurrent = await getCurrentRun(primary.token, 'pve');
    assert.strictEqual(settledCurrent.status, 200, JSON.stringify(settledCurrent.payload));
    assert.strictEqual(settledCurrent.payload?.run, null);
    assert.strictEqual(settledCurrent.payload?.recoveryKind, 'settlement_receipt');
    assert.strictEqual(settledCurrent.payload?.lastSettlement?.runId, pveRun.runId);
    assert.strictEqual(settledCurrent.payload?.lastSettlement?.status, 'settled');
    assert.strictEqual(settledCurrent.payload?.lastSettlement?.receipt?.receiptId, winningSettle.response.payload?.receipt?.receiptId);
    const historicalCurrent = await getCurrentAuthoritativeRun(
      primary.userId,
      'pve',
      Number(settledCurrent.payload?.lastSettlement?.settledAt) + SETTLEMENT_RECEIPT_RECOVERY_WINDOW_MS + 1
    );
    assert.strictEqual(historicalCurrent.run, null);
    assert.strictEqual(historicalCurrent.lastSettlement, undefined, 'historical settlements must not replace no-current-run state');

    const authoritativeReceiptRow = await dbGet(
      `SELECT COUNT(*) AS count FROM progression_authoritative_run_receipts WHERE run_id = ?`,
      [pveRun.runId]
    );
    assert.strictEqual(Number(authoritativeReceiptRow.count), 1, 'duplicate settle must not write a second receipt');
    const authoritativeEventRow = await dbGet(
      `SELECT COUNT(*) AS count FROM progression_events
       WHERE user_id = ? AND source_ref = ? AND event_type = 'activity_completed'`,
      [primary.userId, `authoritative:${pveRun.runId}`]
    );
    assert.strictEqual(Number(authoritativeEventRow.count), 1, 'settle must mint a single server_authoritative progression event');
    const authoritativeEvent = await dbGet(
      `SELECT trust_tier, source_kind, proof_json
       FROM progression_events
       WHERE user_id = ? AND source_ref = ?`,
      [primary.userId, `authoritative:${pveRun.runId}`]
    );
    assert.strictEqual(authoritativeEvent?.trust_tier, 'server_authoritative');
    assert.strictEqual(authoritativeEvent?.source_kind, 'authoritative_run_settlement');
    const authoritativeProof = JSON.parse(authoritativeEvent.proof_json || '{}');
    assert.strictEqual(authoritativeProof.runId, pveRun.runId);

    const opsMissing = await opsOverview('');
    assert.strictEqual(opsMissing.status, 404);
    const opsWrong = await opsOverview('not-the-real-token');
    assert.strictEqual(opsWrong.status, 403);
    const ops = await opsOverview();
    assert.strictEqual(ops.status, 200, JSON.stringify(ops.payload));
    assert.strictEqual(ops.payload?.limits?.snapshotInterval, 8);
    assert(ops.payload?.totals?.runs >= 3);
    assert(ops.payload?.byMode?.relay_expedition >= 1, 'ops overview should count internal relay runs');
    assert(ops.payload?.counters?.state_recovered?.count >= 1);
    const opsJson = JSON.stringify(ops.payload);
    for (const forbidden of [primary.userId, pveRun.runId, challengeRun.runId, JWT_SECRET, HMAC_SECRET, OPS_TOKEN, '"state_json"', '"payload_json"']) {
      assert(!opsJson.includes(forbidden), `ops response must redact ${forbidden}`);
    }
    const recentEvent = ops.payload?.recentEvents?.find(event => String(event.userRef || '').startsWith('account-'));
    assert(recentEvent, 'ops response should surface hashed user references');
    assert(!String(recentEvent.runRef || '').includes(pveRun.runId), 'ops response should hash run ids');

    const abandonedStart = await startRun(secondary.token, 'challenge', 'secondary-challenge-0001');
    let abandonedRun = abandonedStart.payload.run;
    const abandoned = await submitAction(
      secondary.token,
      abandonedRun.runId,
      0,
      'abandon',
      {},
      nextId('action')
    );
    assert.strictEqual(abandoned.status, 200, JSON.stringify(abandoned.payload));
    abandonedRun = abandoned.payload.run;
    assert.strictEqual(abandonedRun.status, 'abandoned');
    assert.strictEqual(abandonedRun.projection.summary.reason, 'player_abandoned');

    const expiryStart = await startRun(secondary.token, 'pve', 'secondary-pve-0001');
    let expiryRun = expiryStart.payload.run;
    const expiryNodeId = expiryRun.projection.route.choices[0].nodeId;
    const expiryActionId = nextId('action');
    const expiryFirstAction = await submitAction(
      secondary.token,
      expiryRun.runId,
      0,
      'select_node',
      { nodeId: expiryNodeId },
      expiryActionId
    );
    assert.strictEqual(expiryFirstAction.status, 200, JSON.stringify(expiryFirstAction.payload));
    expiryRun = expiryFirstAction.payload.run;
    await dbRun(
      `UPDATE progression_authoritative_runs
       SET expires_at = ?, updated_at = ?
       WHERE run_id = ?`,
      [Date.now() - 1000, Date.now() - 1000, expiryRun.runId]
    );
    const expiredDuplicateAction = await submitAction(
      secondary.token,
      expiryRun.runId,
      0,
      'select_node',
      { nodeId: expiryNodeId },
      expiryActionId
    );
    expectReason(expiredDuplicateAction, 410, 'authoritative_run_expired');
    const expiredCurrent = await getCurrentRun(secondary.token, 'pve');
    assert.strictEqual(expiredCurrent.status, 200, JSON.stringify(expiredCurrent.payload));
    assert.strictEqual(expiredCurrent.payload?.run, null);
    assert.strictEqual(expiredCurrent.payload?.expiredRunId, expiryRun.runId);
    const expiredGet = await getRun(secondary.token, expiryRun.runId);
    assert.strictEqual(expiredGet.status, 200, JSON.stringify(expiredGet.payload));
    expiryRun = expiredGet.payload.run;
    assert.strictEqual(expiryRun.status, 'expired');
    assert.deepStrictEqual(expiryRun.projection.allowedCommands, []);
    const expiredAction = await submitAction(
      secondary.token,
      expiryRun.runId,
      expiryRun.stateVersion,
      'select_node',
      { nodeId: expiryStart.payload.run.projection.route.choices[0].nodeId },
      nextId('action')
    );
    expectReason(expiredAction, 410, 'authoritative_run_expired');

    const dormantStart = await startRun(secondary.token, 'expedition', 'secondary-expedition-dormant-0001');
    const dormantRun = dormantStart.payload.run;

    const invalidRetention = await retention(6);
    expectReason(invalidRetention, 400, 'invalid_retention_days');

    const retentionCutoffTs = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await dbRun(
      `UPDATE progression_authoritative_runs
       SET updated_at = ?,
           expires_at = CASE WHEN run_id = ? THEN ? ELSE expires_at END
       WHERE run_id IN (?, ?, ?, ?)`,
      [
        retentionCutoffTs,
        dormantRun.runId,
        retentionCutoffTs,
        pveRun.runId,
        abandonedRun.runId,
        expiryRun.runId,
        dormantRun.runId
      ]
    );

    const retainedBefore = {
      settledRun: await dbGet(`SELECT run_id FROM progression_authoritative_runs WHERE run_id = ?`, [pveRun.runId]),
      abandonedRun: await dbGet(`SELECT run_id FROM progression_authoritative_runs WHERE run_id = ?`, [abandonedRun.runId]),
      expiredRun: await dbGet(`SELECT run_id FROM progression_authoritative_runs WHERE run_id = ?`, [expiryRun.runId]),
      dormantRun: await dbGet(`SELECT run_id, status FROM progression_authoritative_runs WHERE run_id = ?`, [dormantRun.runId])
    };
    assert(retainedBefore.settledRun && retainedBefore.abandonedRun && retainedBefore.expiredRun && retainedBefore.dormantRun);
    assert.strictEqual(retainedBefore.dormantRun.status, 'active', 'retention fixture must remain untouched active state');

    const pruned = await retention(7);
    assert.strictEqual(pruned.status, 200, JSON.stringify(pruned.payload));
    assert(pruned.payload?.deleted?.runs >= 4);
    assert(pruned.payload?.deleted?.expiredActiveRuns >= 1);
    assert(pruned.payload?.deleted?.actions >= 1);
    assert(pruned.payload?.deleted?.snapshots >= 3);
    assert(pruned.payload?.deleted?.receipts >= 1);

    for (const runId of [pveRun.runId, abandonedRun.runId, expiryRun.runId, dormantRun.runId]) {
      const row = await dbGet(`SELECT run_id FROM progression_authoritative_runs WHERE run_id = ?`, [runId]);
      assert.strictEqual(row, null, `retention should delete ${runId}`);
      const actionRows = await dbGet(`SELECT COUNT(*) AS count FROM progression_authoritative_run_actions WHERE run_id = ?`, [runId]);
      assert.strictEqual(Number(actionRows.count), 0, `retention should delete actions for ${runId}`);
      const snapshotCount = await dbGet(`SELECT COUNT(*) AS count FROM progression_authoritative_run_snapshots WHERE run_id = ?`, [runId]);
      assert.strictEqual(Number(snapshotCount.count), 0, `retention should delete snapshots for ${runId}`);
      const receiptCount = await dbGet(`SELECT COUNT(*) AS count FROM progression_authoritative_run_receipts WHERE run_id = ?`, [runId]);
      assert.strictEqual(Number(receiptCount.count), 0, `retention should delete receipts for ${runId}`);
    }

    const authoritativeProgressStillPresent = await dbGet(
      `SELECT COUNT(*) AS count FROM progression_events
       WHERE user_id = ? AND source_ref = ?`,
      [primary.userId, `authoritative:${pveRun.runId}`]
    );
    assert.strictEqual(Number(authoritativeProgressStillPresent.count), 1, 'retention should not erase progression history');

    console.log('Authoritative runs platform sanity checks passed.');
  } finally {
    await stopServer(server);
    removeDbFiles();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
