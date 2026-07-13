const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.FATE_CHRONICLE_PLATFORM_TEST_PORT || 9076);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.FATE_CHRONICLE_PLATFORM_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-fate-chronicle-${process.pid}.sqlite`);
const JWT_SECRET = 'fate-chronicle-platform-jwt-secret-32-characters';
const HMAC_SECRET = 'fate-chronicle-platform-hmac-secret-32-characters';
const SEED_SECRET = 'fate-chronicle-platform-seed-secret-32-characters';
const OPS_TOKEN = 'fate-chronicle-platform-ops-token';
const FATE_PROTOCOL = 'authoritative-fate-chronicle-v1';
const WEEKLY_PROTOCOL = 'weekly-archive-v1';
const BLOCK_CARDS = new Set(['guard', 'iron_mandate']);

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
let idCounter = 0;

function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(8, '0')}`;
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
}

function startServer() {
  const child = spawn(process.execPath, ['-e', "require('./server/app.js')"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_FATE_CHRONICLE_SEED_SECRET: SEED_SECRET,
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: OPS_TOKEN,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: 'fate-chronicle-platform-test-sha'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });
  return { child, getOutput: () => output };
}

function stopServer(server) {
  return new Promise(resolve => {
    if (!server || server.child.exitCode !== null) return resolve();
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

async function request(pathname, { method = 'GET', token = '', body, headers = {} } = {}) {
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
  return { status: response.status, payload };
}

async function waitForHealth(server) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(`backend exited early\n${server.getOutput()}`);
    try {
      const health = await request('/api/health');
      if (health.status === 200 && health.payload?.status === 'ok') return health.payload;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`backend health timed out\n${server.getOutput()}`);
}

function signPayload(token, data, route = '') {
  const salt = `fate-sig-${crypto.randomBytes(8).toString('hex')}`;
  const signature = crypto.createHmac('sha256', token)
    .update(route ? 'session-v2' : 'session-v1', 'utf8')
    .update(route ? `\n${route}` : '', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return {
    ...data,
    salt,
    signature,
    signatureMode: route ? 'session-v2' : 'session'
  };
}

function signedV2(pathname, token, data, routePath = pathname) {
  const route = `POST ${routePath}`;
  return request(pathname, { method: 'POST', token, body: signPayload(token, data, route) });
}

function signedV1(pathname, token, data) {
  return request(pathname, { method: 'POST', token, body: signPayload(token, data) });
}

async function registerAndLogin() {
  const username = `fate_${Date.now().toString(36)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', { method: 'POST', body: { username, password } });
  assert.equal(registered.status, 200, JSON.stringify(registered.payload));
  const login = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
  return {
    token: login.payload?.token || login.payload?.user?.sessionToken,
    userId: login.payload?.user?.id || login.payload?.user?.objectId
  };
}

function chooseCommand(projection) {
  if (projection.phase === 'route') return ['select_node', { nodeId: projection.route.choices[0].nodeId }];
  if (projection.phase === 'reward') {
    const reward = (projection.player.hp < 22
      ? projection.reward.choices.find(choice => choice.kind === 'heal')
      : projection.reward.choices.find(choice => choice.kind === 'card')) || projection.reward.choices[0];
    return ['choose_reward', { rewardId: reward.rewardId }];
  }
  assert.equal(projection.phase, 'battle', `unsupported phase ${projection.phase}`);
  const incoming = Number(projection.battle?.enemy?.intent?.amount || 0);
  const cards = projection.player.hand.slice().sort((left, right) => {
    const leftBlocks = BLOCK_CARDS.has(left.cardId) ? 1 : 0;
    const rightBlocks = BLOCK_CARDS.has(right.cardId) ? 1 : 0;
    const defenseOrder = incoming > projection.player.block
      ? rightBlocks - leftBlocks
      : leftBlocks - rightBlocks;
    return defenseOrder || right.cost - left.cost || left.instanceId.localeCompare(right.instanceId);
  });
  const card = cards.find(entry => entry.cost <= projection.player.energy);
  return card ? ['play_card', { cardInstanceId: card.instanceId }] : ['end_turn', {}];
}

async function submitRunAction(token, run, command, payload) {
  const pathname = `/api/progression/authoritative-runs/${encodeURIComponent(run.runId)}/actions`;
  const response = await signedV1(pathname, token, {
    runId: run.runId,
    actionId: nextId('fate-action'),
    expectedVersion: Number(run.stateVersion),
    command,
    payload
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response.payload.run;
}

async function driveRun(token, initialRun, { stopAfter = null } = {}) {
  let run = initialRun;
  let actions = 0;
  while (run.status === 'active' && actions < 256) {
    if (stopAfter !== null && actions >= stopAfter) break;
    const [command, payload] = chooseCommand(run.projection || run.state);
    run = await submitRunAction(token, run, command, payload);
    actions += 1;
  }
  assert(actions < 256, 'fate run must stay under the authoritative action cap');
  return { run, actions };
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(DB_PATH);
    connection.configure('busyTimeout', 5000);
    connection.run(sql, params, function onRun(error) {
      const result = { changes: this && this.changes || 0 };
      connection.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(DB_PATH);
    connection.configure('busyTimeout', 5000);
    connection.get(sql, params, (error, row) => {
      connection.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function expectReason(response, status, reason) {
  assert.equal(response.status, status, JSON.stringify(response.payload));
  assert.equal(response.payload?.reason, reason, JSON.stringify(response.payload));
}

(async () => {
  removeDbFiles();
  let server = startServer();
  try {
    const health = await waitForHealth(server);
    assert.equal(health.schema?.version, 11);
    assert.equal(health.schema?.currentMigrationId, '0011_authoritative_fate_chronicle');

    const account = await registerAndLogin();
    const current = await request('/api/fate-chronicle/current', { token: account.token });
    assert.equal(current.status, 200, JSON.stringify(current.payload));
    assert.equal(current.payload?.protocolVersion, FATE_PROTOCOL);
    const rotationId = current.payload?.rotation?.meta?.rotationId;
    assert(rotationId, 'current response must expose the frozen rotation id');
    assert.equal(current.payload?.rotation?.progress?.chapters?.[0]?.unlocked, true);
    assert.equal(current.payload?.rotation?.progress?.chapters?.[1]?.unlocked, false);

    const lockedRequest = {
      protocolVersion: FATE_PROTOCOL,
      rotationId,
      chapterId: 'chapter-2',
      oathId: 'guard',
      clientAttemptId: 'fate-locked-attempt-0001',
      mutationId: 'fate-locked-mutation-0001'
    };
    expectReason(await signedV2('/api/fate-chronicle/attempts', account.token, lockedRequest), 409, 'fate_chronicle_chapter_locked');

    const startRequest = {
      protocolVersion: FATE_PROTOCOL,
      rotationId,
      chapterId: 'chapter-1',
      oathId: 'guard',
      clientAttemptId: 'fate-attempt-chapter1-0001',
      mutationId: 'fate-start-chapter1-0001'
    };
    const unsigned = await request('/api/fate-chronicle/attempts', {
      method: 'POST',
      token: account.token,
      body: startRequest
    });
    expectReason(unsigned, 400, 'missing-signature');
    const legacy = await request('/api/fate-chronicle/attempts', {
      method: 'POST',
      token: account.token,
      body: signPayload(account.token, startRequest)
    });
    expectReason(legacy, 400, 'route-bound-signature-required');
    const wrongRoute = await request('/api/fate-chronicle/attempts', {
      method: 'POST',
      token: account.token,
      body: signPayload(account.token, startRequest, 'POST /api/fate-chronicle/results')
    });
    expectReason(wrongRoute, 403, 'session-signature-mismatch');

    const started = await signedV2('/api/fate-chronicle/attempts', account.token, startRequest);
    assert.equal(started.status, 200, JSON.stringify(started.payload));
    assert.equal(started.payload?.attempt?.chapterId, 'chapter-1');
    assert.equal(started.payload?.attempt?.oathId, 'guard');
    assert.equal(started.payload?.run?.mode, 'fate_chronicle');
    assert.equal(started.payload?.run?.scenarioId, 'chronicle-ember-guard');
    assert(!JSON.stringify(started.payload).includes(SEED_SECRET), 'seed secret must never reach the client');
    assert(!JSON.stringify(started.payload).includes('seedHex'), 'raw seed must never reach the client');

    const startReplay = await signedV2('/api/fate-chronicle/attempts', account.token, startRequest);
    assert.equal(startReplay.status, 200, JSON.stringify(startReplay.payload));
    assert.equal(startReplay.payload?.attempt?.attemptId, started.payload?.attempt?.attemptId);
    assert.equal(startReplay.payload?.run?.runId, started.payload?.run?.runId);

    const firstDriven = await driveRun(account.token, started.payload.run);
    assert.equal(firstDriven.run.status, 'completed');
    const submitRequest = {
      protocolVersion: FATE_PROTOCOL,
      runId: firstDriven.run.runId,
      mutationId: 'fate-submit-chapter1-0001'
    };
    const submitted = await signedV2('/api/fate-chronicle/results', account.token, submitRequest);
    assert.equal(submitted.status, 200, JSON.stringify(submitted.payload));
    assert.equal(submitted.payload?.result?.chapterId, 'chapter-1');
    assert.equal(submitted.payload?.rotation?.progress?.chapters?.[0]?.completed, true);
    assert.equal(submitted.payload?.rotation?.progress?.chapters?.[1]?.unlocked, true);
    const submitReplay = await signedV2('/api/fate-chronicle/results', account.token, submitRequest);
    assert.equal(submitReplay.status, 200, JSON.stringify(submitReplay.payload));
    assert.equal(submitReplay.payload?.result?.resultId, submitted.payload?.result?.resultId);

    const claimRequest = {
      protocolVersion: FATE_PROTOCOL,
      rotationId,
      milestoneId: 'chapter-1-clear',
      mutationId: 'fate-claim-chapter1-0001'
    };
    const claimed = await signedV2('/api/fate-chronicle/rewards/chapter-1-clear/claim', account.token, claimRequest);
    assert.equal(claimed.status, 200, JSON.stringify(claimed.payload));
    assert.equal(claimed.payload?.claim?.amount, 30);
    assert.equal(claimed.payload?.claim?.rewardImpact, 'cosmetic_only');
    assert.equal(claimed.payload?.claim?.powerImpact, 'none');
    const claimReplay = await signedV2('/api/fate-chronicle/rewards/chapter-1-clear/claim', account.token, claimRequest);
    assert.equal(claimReplay.status, 200, JSON.stringify(claimReplay.payload));
    assert.equal(claimReplay.payload?.claim?.claimId, claimed.payload?.claim?.claimId);

    const secondStartRequest = {
      protocolVersion: FATE_PROTOCOL,
      rotationId,
      chapterId: 'chapter-2',
      oathId: 'guard',
      clientAttemptId: 'fate-attempt-chapter2-0001',
      mutationId: 'fate-start-chapter2-0001'
    };
    const secondStarted = await signedV2('/api/fate-chronicle/attempts', account.token, secondStartRequest);
    assert.equal(secondStarted.status, 200, JSON.stringify(secondStarted.payload));
    const partial = await driveRun(account.token, secondStarted.payload.run, { stopAfter: 5 });
    assert.equal(partial.run.status, 'active');

    await stopServer(server);
    server = startServer();
    await waitForHealth(server);
    const recovered = await request('/api/fate-chronicle/current', { token: account.token });
    assert.equal(recovered.status, 200, JSON.stringify(recovered.payload));
    assert.equal(recovered.payload?.activeRun?.runId, partial.run.runId, 'restart must recover the same authoritative run');
    assert.equal(recovered.payload?.activeRun?.stateVersion, partial.run.stateVersion, 'restart must preserve the exact action boundary');
    const recoveredDriven = await driveRun(account.token, recovered.payload.activeRun);
    assert.equal(recoveredDriven.run.status, 'completed');
    const preSettled = await signedV2(
      `/api/progression/authoritative-runs/${encodeURIComponent(recoveredDriven.run.runId)}/settle`,
      account.token,
      {
        runId: recoveredDriven.run.runId,
        mutationId: 'fate-authoritative-settle-chapter2-0001',
        expectedVersion: recoveredDriven.run.stateVersion
      },
      '/api/progression/authoritative-runs/:runId/settle'
    );
    assert.equal(preSettled.status, 200, JSON.stringify(preSettled.payload));
    assert.equal(preSettled.payload?.receipt?.integrity?.fullReplayPassed, true);
    const secondSubmit = await signedV2('/api/fate-chronicle/results', account.token, {
      protocolVersion: FATE_PROTOCOL,
      runId: recoveredDriven.run.runId,
      mutationId: 'fate-submit-chapter2-0001'
    });
    assert.equal(secondSubmit.status, 200, JSON.stringify(secondSubmit.payload));
    assert.equal(secondSubmit.payload?.rotation?.progress?.chapters?.[1]?.completed, true);

    const abandonedStart = await signedV2('/api/fate-chronicle/attempts', account.token, {
      protocolVersion: FATE_PROTOCOL,
      rotationId,
      chapterId: 'chapter-2',
      oathId: 'edge',
      clientAttemptId: 'fate-attempt-abandon-0001',
      mutationId: 'fate-start-abandon-0001'
    });
    assert.equal(abandonedStart.status, 200, JSON.stringify(abandonedStart.payload));
    const abandonedRun = await submitRunAction(account.token, abandonedStart.payload.run, 'abandon', {});
    assert.equal(abandonedRun.status, 'abandoned');
    const retry = await signedV2('/api/fate-chronicle/attempts', account.token, {
      protocolVersion: FATE_PROTOCOL,
      rotationId,
      chapterId: 'chapter-2',
      oathId: 'edge',
      clientAttemptId: 'fate-attempt-retry-0001',
      mutationId: 'fate-start-retry-0001'
    });
    assert.equal(retry.status, 200, JSON.stringify(retry.payload));
    assert.notEqual(retry.payload?.run?.runId, abandonedRun.runId, 'abandon must free the account for an immediate fresh retry');

    await dbRun(
      `INSERT INTO progression_events
        (user_id, event_id, event_type, activity_mode, source_kind, trust_tier, source_ref,
         battle_wins, boss_wins, activity_completions, pvp_matches, pvp_wins, proof_json, occurred_at, received_at)
       VALUES (?, ?, 'activity_completed', 'world_rift', 'world_rift_settlement', 'server_authoritative', ?,
               0, 0, 1, 0, 0, '{}', ?, ?)`,
      [account.userId, 'fate-weekly-rift-event-0001', 'fate-weekly-rift-source-0001', Date.now(), Date.now()]
    );
    const archive = await request('/api/weekly-archive/current', { token: account.token });
    assert.equal(archive.status, 200, JSON.stringify(archive.payload));
    assert.equal(archive.payload?.grade?.proofCount, 2, 'fate settlement plus one other trusted mode must reach 2/5');
    assert.equal(archive.payload?.slots?.find(slot => slot.mode === 'fate_chronicle')?.earned, true);
    assert.equal(archive.payload?.claim?.activeCycle?.claimable, true);
    const weeklyClaimRequest = {
      protocolVersion: WEEKLY_PROTOCOL,
      cycleId: archive.payload?.cycle?.cycleId,
      mutationId: 'weekly-foundation-fate-0001'
    };
    const weeklyUnsigned = await request('/api/weekly-archive/rewards/foundation/claim', {
      method: 'POST',
      token: account.token,
      body: weeklyClaimRequest
    });
    expectReason(weeklyUnsigned, 400, 'missing-signature');
    const weeklyLegacySignature = await signedV1(
      '/api/weekly-archive/rewards/foundation/claim',
      account.token,
      weeklyClaimRequest
    );
    expectReason(weeklyLegacySignature, 400, 'route-bound-signature-required');
    const weeklyWrongRouteSignature = await signedV2(
      '/api/weekly-archive/rewards/foundation/claim',
      account.token,
      weeklyClaimRequest,
      '/api/fate-chronicle/rewards/foundation/claim'
    );
    expectReason(weeklyWrongRouteSignature, 403, 'session-signature-mismatch');
    const weeklyClaim = await signedV2('/api/weekly-archive/rewards/foundation/claim', account.token, weeklyClaimRequest);
    assert.equal(weeklyClaim.status, 200, JSON.stringify(weeklyClaim.payload));
    assert.equal(weeklyClaim.payload?.reward?.amount, 120);
    const weeklyReplay = await signedV2('/api/weekly-archive/rewards/foundation/claim', account.token, weeklyClaimRequest);
    assert.equal(weeklyReplay.status, 200, JSON.stringify(weeklyReplay.payload));
    assert.equal(weeklyReplay.payload?.claim?.claimId, weeklyClaim.payload?.claim?.claimId);

    const wallet = await dbGet(
      `SELECT balance, lifetime_earned FROM progression_economy_balances
       WHERE user_id = ? AND currency = 'renown'`,
      [account.userId]
    );
    assert.equal(Number(wallet.balance), 150, 'chapter reward and weekly foundation must each credit exactly once');
    assert.equal(Number(wallet.lifetime_earned), 150);
    const ledger = await dbGet(
      `SELECT COUNT(*) AS count FROM progression_economy_ledger WHERE user_id = ?`,
      [account.userId]
    );
    assert.equal(Number(ledger.count), 2, 'idempotent retries must not duplicate economy entries');

    const weeklyOpsWithoutAuth = await request('/api/weekly-archive/ops/overview', {
      headers: { 'x-defier-ops-token': OPS_TOKEN }
    });
    assert.equal(weeklyOpsWithoutAuth.status, 401, 'weekly ops token must not bypass account authentication');
    const weeklyOpsWithoutToken = await request('/api/weekly-archive/ops/overview', { token: account.token });
    assert.equal(weeklyOpsWithoutToken.status, 404, 'missing weekly ops token must not reveal the endpoint');
    const weeklyOpsWrongToken = await request('/api/weekly-archive/ops/overview', {
      token: account.token,
      headers: { 'x-defier-ops-token': `${OPS_TOKEN}-wrong` }
    });
    assert.equal(weeklyOpsWrongToken.status, 403, 'wrong weekly ops token must be rejected');
    const weeklyOps = await request('/api/weekly-archive/ops/overview', {
      token: account.token,
      headers: { 'x-defier-ops-token': OPS_TOKEN }
    });
    assert.equal(weeklyOps.status, 200, JSON.stringify(weeklyOps.payload));
    assert(weeklyOps.payload?.totals?.claims >= 1);
    assert(weeklyOps.payload?.recentEvents?.every(event => !JSON.stringify(event).includes(account.userId)), 'weekly ops events must mask raw account ids');

    const opsWithoutAuth = await request('/api/fate-chronicle/ops/overview', {
      headers: { 'x-defier-ops-token': OPS_TOKEN }
    });
    assert.equal(opsWithoutAuth.status, 401, 'ops token must not bypass account authentication');
    const opsWithoutToken = await request('/api/fate-chronicle/ops/overview', { token: account.token });
    assert.equal(opsWithoutToken.status, 404, 'missing ops token must not reveal the endpoint');
    const ops = await request('/api/fate-chronicle/ops/overview', {
      token: account.token,
      headers: { 'x-defier-ops-token': OPS_TOKEN }
    });
    assert.equal(ops.status, 200, JSON.stringify(ops.payload));
    assert(ops.payload?.totals?.results >= 2);
    assert(ops.payload?.recentEvents?.every(event => !JSON.stringify(event).includes(account.userId)), 'ops events must mask raw account ids');

    console.log('Fate chronicle platform checks passed.');
  } finally {
    await stopServer(server);
    removeDbFiles();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
