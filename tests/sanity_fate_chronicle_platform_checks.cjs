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
const PRIVATE_BRANCH_FIELDS = [
  'rewardCardPool',
  'rewardProfile',
  'futureStages',
  'enemyAdjustments',
  'rewardAdjustments',
  'seed'
];
const PUBLIC_BRANCH_KEYS = [
  'branchId',
  'title',
  'description',
  'counterplay',
  'buildFocus',
  'consequenceSummary'
].sort();

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

function assertPublicBranch(branch, label) {
  assert(branch && typeof branch === 'object', `${label} should expose a public chapter branch`);
  assert.deepEqual(Object.keys(branch).sort(), PUBLIC_BRANCH_KEYS, `${label} should only expose public chapter branch fields`);
  const json = JSON.stringify(branch);
  PRIVATE_BRANCH_FIELDS.forEach(field => {
    assert(!json.includes(field), `${label} must not leak private field ${field}`);
  });
}

function assertNoPrivateBranchFields(value, label) {
  const json = JSON.stringify(value || null);
  PRIVATE_BRANCH_FIELDS.forEach(field => {
    assert(!json.includes(field), `${label} must not leak private field ${field}`);
  });
}

function chooseCommand(projection, { preferredBranchId = '' } = {}) {
  if (projection.phase === 'route') {
    const preferred = preferredBranchId
      ? projection.route.choices.find(choice => choice.chapterBranch?.branchId === preferredBranchId)
      : null;
    return ['select_node', { nodeId: (preferred || projection.route.choices[0]).nodeId }];
  }
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

async function startFateAttempt(token, { rotationId, chapterId, oathId, clientAttemptId, mutationId }) {
  const response = await signedV2('/api/fate-chronicle/attempts', token, {
    protocolVersion: FATE_PROTOCOL,
    rotationId,
    chapterId,
    oathId,
    clientAttemptId,
    mutationId
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response;
}

async function settleAuthoritativeRun(token, runId, stateVersion, mutationId) {
  const response = await signedV2(
    `/api/progression/authoritative-runs/${encodeURIComponent(runId)}/settle`,
    token,
    {
      runId,
      mutationId,
      expectedVersion: stateVersion
    },
    '/api/progression/authoritative-runs/:runId/settle'
  );
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response;
}

async function submitFateResult(token, runId, mutationId) {
  const response = await signedV2('/api/fate-chronicle/results', token, {
    protocolVersion: FATE_PROTOCOL,
    runId,
    mutationId
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  return response;
}

async function driveRun(token, initialRun, { stopAfter = null, preferredBranchId = '', onProjection = null } = {}) {
  let run = initialRun;
  let actions = 0;
  while (run.status === 'active' && actions < 256) {
    if (stopAfter !== null && actions >= stopAfter) break;
    if (typeof onProjection === 'function') onProjection(run.projection || run.state);
    const [command, payload] = chooseCommand(run.projection || run.state, { preferredBranchId });
    run = await submitRunAction(token, run, command, payload);
    actions += 1;
  }
  if (typeof onProjection === 'function') onProjection(run.projection || run.state);
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
    assert.equal(health.schema?.version, 12);
    assert.equal(health.schema?.currentMigrationId, '0012_world_rift_campaign_directives');

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

    const started = await startFateAttempt(account.token, startRequest);
    assert.equal(started.payload?.attempt?.chapterId, 'chapter-1');
    assert.equal(started.payload?.attempt?.oathId, 'guard');
    assert.equal(started.payload?.run?.mode, 'fate_chronicle');
    assert.equal(started.payload?.run?.scenarioId, 'chronicle-ember-guard');
    assert(!JSON.stringify(started.payload).includes(SEED_SECRET), 'seed secret must never reach the client');
    assert(!JSON.stringify(started.payload).includes('seedHex'), 'raw seed must never reach the client');

    const startReplay = await startFateAttempt(account.token, startRequest);
    assert.equal(startReplay.payload?.attempt?.attemptId, started.payload?.attempt?.attemptId);
    assert.equal(startReplay.payload?.run?.runId, started.payload?.run?.runId);

    const firstDriven = await driveRun(account.token, started.payload.run);
    assert.equal(firstDriven.run.status, 'completed');
    const submitted = await submitFateResult(account.token, firstDriven.run.runId, 'fate-submit-chapter1-0001');
    assert.equal(submitted.payload?.result?.chapterId, 'chapter-1');
    assert.equal(submitted.payload?.rotation?.progress?.chapters?.[0]?.completed, true);
    assert.equal(submitted.payload?.rotation?.progress?.chapters?.[1]?.unlocked, true);
    const submitReplay = await submitFateResult(account.token, firstDriven.run.runId, 'fate-submit-chapter1-0001');
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

    const edgeStarted = await startFateAttempt(account.token, {
      rotationId,
      chapterId: 'chapter-1',
      oathId: 'edge',
      clientAttemptId: 'fate-attempt-chapter1-edge-0001',
      mutationId: 'fate-start-chapter1-edge-0001'
    });
    assert.equal(edgeStarted.payload?.run?.scenarioId, 'chronicle-ember-edge');
    const edgeDriven = await driveRun(account.token, edgeStarted.payload.run);
    assert.equal(edgeDriven.run.status, 'completed');
    const edgeSubmitted = await submitFateResult(account.token, edgeDriven.run.runId, 'fate-submit-chapter1-edge-0001');
    const edgeChapter = edgeSubmitted.payload?.rotation?.progress?.chapters?.find(chapter => chapter.chapterId === 'chapter-1');
    const edgeDualMilestone = edgeSubmitted.payload?.rotation?.progress?.milestones?.find(entry => entry.milestoneId === 'chapter-1-dual');
    assert.equal(edgeChapter?.completedOathCount, 2, 'chapter-1 should report 2 completed oaths after guard+edge');
    assert.equal(edgeChapter?.oathCount, 3, 'chapter-1 should expose the v2 three-oath count');
    assert.equal(edgeChapter?.allOathsCompleted, false, 'chapter-1 2/3 must not report full completion');
    assert.equal(edgeChapter?.dualCompleted, false, 'dualCompleted compatibility alias must stay false at 2/3');
    assert.equal(edgeChapter?.allOathsCompletedAt, 0, 'chapter-1 2/3 must not set the full-completion timestamp');
    assert.equal(edgeDualMilestone?.claimable, false, 'chapter-1 dual milestone must not be claimable at 2/3');
    const chapterOneAfterEdge = await dbGet(
      `SELECT completed_oaths_json, dual_completed_at
       FROM fate_chronicle_progress
       WHERE user_id = ? AND rotation_id = ? AND chapter_id = 'chapter-1'`,
      [account.userId, rotationId]
    );
    assert.deepEqual(
      JSON.parse(String(chapterOneAfterEdge?.completed_oaths_json || '[]')).sort(),
      ['edge', 'guard'],
      'chapter-1 progress row should keep exactly the first two completed oaths after 2/3',
    );
    assert.equal(Number(chapterOneAfterEdge?.dual_completed_at || 0), 0, 'chapter-1 2/3 must keep dual_completed_at at 0');

    const proofStarted = await startFateAttempt(account.token, {
      rotationId,
      chapterId: 'chapter-1',
      oathId: 'proof',
      clientAttemptId: 'fate-attempt-chapter1-proof-0001',
      mutationId: 'fate-start-chapter1-proof-0001'
    });
    assert.equal(proofStarted.payload?.run?.scenarioId, 'chronicle-ember-proof');
    const proofBranch = {
      decision: null,
      routeOptions: null,
      battle: null,
      reward: null,
      terminal: null
    };
    const proofDriven = await driveRun(account.token, proofStarted.payload.run, {
      preferredBranchId: 'proof_rush',
      onProjection(projection) {
        assertNoPrivateBranchFields(projection, 'proof projection');
        if (projection?.phase === 'route' && projection?.route?.chapterBranchDecision && !proofBranch.decision) {
          proofBranch.decision = projection.route.chapterBranchDecision;
          proofBranch.routeOptions = projection.route.choices.map(choice => choice.chapterBranch).filter(Boolean);
        }
        if (projection?.phase === 'battle' && projection?.battle?.chapterBranch && !proofBranch.battle) {
          proofBranch.battle = projection.battle.chapterBranch;
        }
        if (projection?.phase === 'reward' && projection?.route?.chapterBranch && !proofBranch.reward) {
          proofBranch.reward = projection.route.chapterBranch;
        }
        if (projection?.phase === 'completed' && projection?.summary?.chapterBranchResolution && !proofBranch.terminal) {
          proofBranch.terminal = {
            route: projection.route?.chapterBranch || null,
            summary: projection.summary.chapterBranchResolution
          };
        }
      }
    });
    assert.equal(proofDriven.run.status, 'completed');
    assert.equal(proofBranch.decision?.version, 1, 'proof run should expose chapterBranchDecision v1 before branch lock-in');
    assert.equal(proofBranch.decision?.triggerStage, 2, 'proof run should branch at stage 2');
    assert.equal(proofBranch.routeOptions?.length, 2, 'proof run should surface exactly two public branch options');
    proofBranch.routeOptions?.forEach((branch, index) => assertPublicBranch(branch, `proof option ${index}`));
    assert.equal(proofBranch.routeOptions?.some(branch => branch.branchId === 'proof_rush'), true, 'proof run should expose the proof_rush branch option');
    assertPublicBranch(proofBranch.battle, 'proof battle branch');
    assert.equal(proofBranch.battle?.branchId, 'proof_rush');
    assertPublicBranch(proofBranch.reward, 'proof reward branch');
    assert.equal(proofBranch.reward?.branchId, 'proof_rush');
    assertPublicBranch(proofBranch.terminal?.route, 'proof terminal route branch');
    assertPublicBranch(proofBranch.terminal?.summary, 'proof terminal summary branch');
    assert.equal(proofBranch.terminal?.route?.branchId, 'proof_rush');
    assert.equal(proofBranch.terminal?.summary?.branchId, 'proof_rush');

    const proofSettled = await settleAuthoritativeRun(
      account.token,
      proofDriven.run.runId,
      proofDriven.run.stateVersion,
      'fate-authoritative-settle-proof-0001'
    );
    assert.equal(proofSettled.payload?.receipt?.integrity?.fullReplayPassed, true, 'proof authoritative settle must pass full replay');
    const proofSettleReplay = await settleAuthoritativeRun(
      account.token,
      proofDriven.run.runId,
      proofDriven.run.stateVersion,
      'fate-authoritative-settle-proof-0001'
    );
    assert.equal(
      proofSettleReplay.payload?.receipt?.receiptId,
      proofSettled.payload?.receipt?.receiptId,
      'proof authoritative settle replay should return the same receipt',
    );
    const proofSubmitted = await submitFateResult(account.token, proofDriven.run.runId, 'fate-submit-chapter1-proof-0001');
    const proofSubmitReplay = await submitFateResult(account.token, proofDriven.run.runId, 'fate-submit-chapter1-proof-0001');
    assert.equal(proofSubmitReplay.payload?.result?.resultId, proofSubmitted.payload?.result?.resultId, 'proof result submit should replay idempotently');
    const proofChapter = proofSubmitted.payload?.rotation?.progress?.chapters?.find(chapter => chapter.chapterId === 'chapter-1');
    const proofDualMilestone = proofSubmitted.payload?.rotation?.progress?.milestones?.find(entry => entry.milestoneId === 'chapter-1-dual');
    assert.equal(proofChapter?.completedOathCount, 3, 'chapter-1 should report 3 completed oaths after proof');
    assert.equal(proofChapter?.oathCount, 3, 'chapter-1 should keep the v2 three-oath count after proof');
    assert.equal(proofChapter?.allOathsCompleted, true, 'chapter-1 3/3 must report full completion');
    assert.equal(proofChapter?.dualCompleted, true, 'dualCompleted compatibility alias must become true at 3/3');
    assert(Number(proofChapter?.allOathsCompletedAt || 0) > 0, 'chapter-1 3/3 must expose allOathsCompletedAt');
    assert.equal(proofDualMilestone?.claimable, true, 'chapter-1 dual milestone must become claimable at 3/3');
    const chapterOneAfterProof = await dbGet(
      `SELECT completed_oaths_json, dual_completed_at
       FROM fate_chronicle_progress
       WHERE user_id = ? AND rotation_id = ? AND chapter_id = 'chapter-1'`,
      [account.userId, rotationId]
    );
    assert.deepEqual(
      JSON.parse(String(chapterOneAfterProof?.completed_oaths_json || '[]')).sort(),
      ['edge', 'guard', 'proof'],
      'chapter-1 progress row should keep all three completed oaths after 3/3',
    );
    assert(Number(chapterOneAfterProof?.dual_completed_at || 0) > 0, 'chapter-1 3/3 must persist dual_completed_at');

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
