const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();
const { OBJECTIVES, getCycles, makeReward } = require('../server/progression/catalog');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PROGRESSION_PLATFORM_TEST_PORT || 9031);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.PROGRESSION_PLATFORM_DB_PATH
  || path.join(os.tmpdir(), `the-defier-progression-${process.pid}.sqlite`);
const JWT_SECRET = 'progression-jwt-secret-32-characters';
const HMAC_SECRET = 'progression-hmac-secret-32-characters';
const OPS_TOKEN = 'progression-ops-token-32-characters';

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
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
      DEFIER_INTEGRITY_REQUIRED: '1',
      DEFIER_OPS_TOKEN: OPS_TOKEN,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: 'progression-test-sha'
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
  } catch (error) {
    payload = null;
  }
  return { status: response.status, ok: response.ok, payload };
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await request('/api/health');
      if (response.status === 200 && response.payload?.status === 'ok') return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw lastError || new Error(`progression backend health timed out\n${server.getOutput()}`);
}

function signSessionPayload(data, token) {
  const salt = `session-${crypto.randomBytes(12).toString('hex')}`;
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
    body: {
      ...data,
      ...signSessionPayload(data, token)
    }
  });
}

async function registerAndLogin(username) {
  username = `${String(username || 'progress').slice(0, 8)}-${Date.now().toString(36)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(registered.status, 200, `register should succeed: ${JSON.stringify(registered.payload)}`);
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  });
  assert.strictEqual(login.status, 200, `login should succeed: ${JSON.stringify(login.payload)}`);
  const token = login.payload?.token || login.payload?.user?.sessionToken;
  assert(token, 'login should return bearer token');
  return {
    token,
    user: {
      id: login.payload?.user?.id || login.payload?.user?.objectId,
      username: login.payload?.user?.username
    }
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

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.run(sql, params, function onRun(error) {
      const result = { changes: this && this.changes || 0 };
      db.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function objective(status, objectiveId) {
  return (status.payload?.objectives || []).find(entry => entry.objectiveId === objectiveId);
}

async function runChecks() {
  const sundayCycles = getCycles(Date.UTC(2026, 6, 12, 23, 59, 59));
  const mondayCycles = getCycles(Date.UTC(2026, 6, 13, 0, 0, 0));
  assert.strictEqual(sundayCycles.daily.id, 'daily:2026-07-12', 'daily cycle should use UTC calendar day');
  assert.strictEqual(sundayCycles.weekly.id, 'weekly:2026-07-06', 'Sunday should remain in the Monday-start UTC week');
  assert.strictEqual(mondayCycles.weekly.id, 'weekly:2026-07-13', 'Monday UTC should start a new weekly cycle');
  assert(OBJECTIVES.some(entry => entry.trustRequirement === 'server_authoritative'), 'catalog should include an authoritative objective');
  assert(OBJECTIVES.some(entry => entry.trustRequirement === 'client_observed'), 'catalog should expose observed objectives separately');
  assert(OBJECTIVES.every(entry => makeReward(entry).rewardImpact === 'cosmetic_only'), 'V1 rewards must remain non-power');

  removeDbFiles();
  let server = startServer();
  try {
    await waitForHealth(server);
    const version = await request('/api/version');
    assert.strictEqual(version.payload?.schema?.version, 12, 'world-rift campaign directives should advance schema version without removing progression migrations');
    assert.strictEqual(version.payload?.schema?.currentMigrationId, '0012_world_rift_campaign_directives');
    assert.deepStrictEqual(
      version.payload?.schema?.appliedMigrations?.map(entry => entry.id),
      ['0001_startup_schema', '0002_progression_platform', '0003_verified_runs', '0004_cloud_state_v2', '0005_season_ops_economy', '0006_authoritative_runs_v2', '0007_authoritative_challenge_ladder', '0008_authoritative_world_rift', '0009_account_social_coop', '0010_relay_expedition', '0011_authoritative_fate_chronicle', '0012_world_rift_campaign_directives'],
      'fresh databases should record the full migration chain'
    );

    const primary = await registerAndLogin(`progression_primary_${Date.now()}`);
    const secondary = await registerAndLogin(`progression_secondary_${Date.now()}`);
    const rateLimited = await registerAndLogin(`progression_rate_${Date.now()}`);

    const unauthenticatedStatus = await request('/api/progression/status');
    assert.strictEqual(unauthenticatedStatus.status, 401, 'progression status should require auth');

    const secondaryInitial = await request('/api/progression/status', { token: secondary.token });
    assert.strictEqual(secondaryInitial.status, 200);
    assert((secondaryInitial.payload?.objectives || []).every(entry => entry.current === 0), 'new account should start with zero progress');
    const secondaryProjectionCount = await dbGet(
      'SELECT COUNT(*) AS count FROM progression_objective_progress WHERE user_id = ?',
      [secondary.user.id]
    );
    assert.strictEqual(Number(secondaryProjectionCount?.count), 0, 'status reads must not create zero-progress projection rows');

    const eventTimestamp = Date.now();
    const events = [
      {
        eventId: 'evt-pve-battle-boss-0001',
        eventType: 'battle_won',
        mode: 'pve',
        sourceRef: 'run-alpha-node-boss-0001',
        occurredAt: eventTimestamp,
        proof: { nodeType: 'boss', realm: 3, runId: 'run-alpha', secretProbe: 'must-not-persist' }
      },
      {
        eventId: 'evt-challenge-battle-0002',
        eventType: 'battle_won',
        mode: 'challenge',
        sourceRef: 'challenge-alpha-node-0002',
        proof: { nodeType: 'elite', realm: 4, runId: 'challenge-alpha' }
      },
      {
        eventId: 'evt-expedition-battle-0003',
        eventType: 'battle_won',
        mode: 'expedition',
        sourceRef: 'expedition-alpha-node-0003',
        proof: { nodeType: 'enemy', realm: 5, runId: 'expedition-alpha' }
      },
      {
        eventId: 'evt-challenge-complete-0004',
        eventType: 'activity_completed',
        mode: 'challenge',
        sourceRef: 'challenge-alpha-complete-0004',
        proof: { challengeMode: 'weekly', rotationKey: 'week-alpha', ruleId: 'rule-alpha', score: 999999 }
      },
      {
        eventId: 'evt-expedition-complete-0005',
        eventType: 'activity_completed',
        mode: 'expedition',
        sourceRef: 'expedition-alpha-complete-0005',
        proof: { chapterIndex: 8, reason: 'realm_clear', score: 888888 }
      }
    ];
    const submitted = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: { events }
    });
    assert.strictEqual(submitted.status, 200, `event batch should succeed: ${JSON.stringify(submitted.payload)}`);
    assert.strictEqual(submitted.payload?.reportVersion, 'account-progression-event-batch-v1');
    assert.strictEqual(submitted.payload?.accepted?.length, 5);
    assert.strictEqual(submitted.payload?.duplicates?.length, 0);
    assert.strictEqual(submitted.payload?.rejected?.length, 0);
    assert(submitted.payload.accepted.every(entry => entry.trustTier === 'client_observed'));

    const status = await request('/api/progression/status', { token: primary.token });
    assert.strictEqual(status.status, 200);
    assert.strictEqual(status.payload?.reportVersion, 'account-progression-status-v1');
    assert.strictEqual(status.payload?.catalogVersion, 'account-progression-v2');
    assert.strictEqual(objective(status, 'daily_battle_wins')?.current, 3);
    assert.strictEqual(objective(status, 'daily_battle_wins')?.claimable, true);
    assert.strictEqual(objective(status, 'daily_battle_wins')?.trustRequirement, 'client_observed');
    assert.strictEqual(objective(status, 'daily_battle_wins')?.reward?.rewardImpact, 'cosmetic_only');
    assert.strictEqual(objective(status, 'daily_activity_completions')?.current, 2);
    assert.strictEqual(objective(status, 'daily_mode_variety')?.current, 3);
    assert.strictEqual(objective(status, 'weekly_activity_completions')?.claimable, false);
    assert.strictEqual(objective(status, 'milestone_first_completion')?.claimable, true);
    assert.strictEqual(objective(status, 'season_verified_activity_completions')?.current, 0, 'client-observed completions must not satisfy verified season contracts');
    assert.strictEqual(objective(status, 'season_verified_mode_variety')?.current, 0, 'client-observed variety must not satisfy verified season contracts');
    assert.strictEqual(objective(status, 'season_live_pvp_matches')?.current, 0, 'client-observed events must not satisfy authoritative PVP contracts');
    assert(status.payload?.recentEvents?.every(entry => !('sourceRef' in entry)), 'player status should not echo source references');

    const replay = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: { events }
    });
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.payload?.accepted?.length, 0);
    assert.strictEqual(replay.payload?.duplicates?.length, 5, 'whole batch replay should be idempotent');
    const statusAfterReplay = await request('/api/progression/status', { token: primary.token });
    assert.strictEqual(objective(statusAfterReplay, 'daily_battle_wins')?.current, 3, 'duplicate events must not advance progress');

    const forgedServerEvent = [{
      eventId: 'evt-forged-pvp-server-0001',
      eventType: 'pvp_match_completed',
      mode: 'pvp_live',
      sourceRef: 'forged-match-ref-0001',
      proof: { didWin: true }
    }];
    const forged = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: { events: forgedServerEvent }
    });
    assert.strictEqual(forged.status, 200);
    assert.strictEqual(forged.payload?.accepted?.length, 0);
    assert.strictEqual(forged.payload?.rejected?.[0]?.reason, 'server_only_event');

    const unsigned = await request('/api/progression/events', {
      method: 'POST',
      token: primary.token,
      body: { events: [events[0]] }
    });
    assert.strictEqual(unsigned.status, 400, 'event ingestion should require integrity signature');

    const oversized = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: {
        events: Array.from({ length: 21 }, (_, index) => ({
          eventId: `evt-oversized-batch-${String(index).padStart(4, '0')}`,
          eventType: 'battle_won',
          mode: 'pve',
          sourceRef: `oversized-run-node-${String(index).padStart(4, '0')}`,
          proof: { nodeType: 'enemy' }
        }))
      }
    });
    assert.strictEqual(oversized.status, 400, 'event batches should be bounded');

    const staleTimestamp = await signedRequest('/api/progression/events', {
      token: primary.token,
      data: {
        events: [{
          eventId: 'evt-stale-timestamp-0001',
          eventType: 'battle_won',
          mode: 'pve',
          sourceRef: 'stale-timestamp-source-0001',
          occurredAt: Date.now() - (24 * 60 * 60 * 1000) - 60_000,
          proof: { nodeType: 'enemy' }
        }]
      }
    });
    assert.strictEqual(staleTimestamp.status, 200);
    assert.strictEqual(staleTimestamp.payload?.accepted?.length, 0);
    assert.strictEqual(staleTimestamp.payload?.rejected?.[0]?.reason, 'event_timestamp_out_of_window', 'stale client events must not roll into the current cycle');

    const rateBatch = [
      events[0],
      ...Array.from({ length: 19 }, (_, index) => ({
        eventId: `evt-rate-battle-${String(index).padStart(4, '0')}`,
        eventType: 'battle_won',
        mode: 'pve',
        sourceRef: `rate-run-node-${String(index).padStart(4, '0')}`,
        proof: { nodeType: 'enemy', realm: 2 }
      }))
    ];
    const rateAccepted = await signedRequest('/api/progression/events', {
      token: rateLimited.token,
      data: { events: rateBatch }
    });
    assert.strictEqual(rateAccepted.status, 200);
    assert.strictEqual(rateAccepted.payload?.accepted?.length, 20, 'same client event id should remain isolated by account');
    const rateRejected = await signedRequest('/api/progression/events', {
      token: rateLimited.token,
      data: {
        events: [{
          eventId: 'evt-rate-battle-overflow-0021',
          eventType: 'battle_won',
          mode: 'pve',
          sourceRef: 'rate-run-node-overflow-0021',
          proof: { nodeType: 'enemy' }
        }]
      }
    });
    assert.strictEqual(rateRejected.payload?.accepted?.length, 0);
    assert.strictEqual(rateRejected.payload?.rejected?.[0]?.reason, 'daily_event_limit', 'client-observed activity should have a hard daily cap');

    const dailyBattle = objective(status, 'daily_battle_wins');
    const claimData = { objectiveId: 'daily_battle_wins', cycleId: dailyBattle.cycleId };
    const mismatchedClaim = await signedRequest('/api/progression/rewards/daily_battle_wins/claim', {
      token: primary.token,
      data: { objectiveId: 'weekly_activity_completions', cycleId: dailyBattle.cycleId }
    });
    assert.strictEqual(mismatchedClaim.status, 400, 'claim signature payload must bind the URL objective');
    assert.strictEqual(mismatchedClaim.payload?.reason, 'objective_id_mismatch');
    const concurrentClaims = await Promise.all([
      signedRequest('/api/progression/rewards/daily_battle_wins/claim', { token: primary.token, data: claimData }),
      signedRequest('/api/progression/rewards/daily_battle_wins/claim', { token: primary.token, data: claimData })
    ]);
    assert(concurrentClaims.every(entry => entry.status === 200), `concurrent claim should be idempotent: ${JSON.stringify(concurrentClaims)}`);
    assert.strictEqual(concurrentClaims.filter(entry => entry.payload?.alreadyClaimed === false).length, 1);
    assert.strictEqual(concurrentClaims.filter(entry => entry.payload?.alreadyClaimed === true).length, 1);
    const rewardAmount = Number(dailyBattle.reward?.amount || 0);
    assert(rewardAmount > 0, 'claimable objective should expose a positive reward');
    assert(concurrentClaims.every(entry => Number(entry.payload?.balance?.balance) === rewardAmount), 'concurrent claim should credit exactly once');

    const incompleteWeekly = objective(status, 'weekly_activity_completions');
    const incompleteClaim = await signedRequest('/api/progression/rewards/weekly_activity_completions/claim', {
      token: primary.token,
      data: { objectiveId: 'weekly_activity_completions', cycleId: incompleteWeekly.cycleId }
    });
    assert.strictEqual(incompleteClaim.status, 409);
    assert.strictEqual(incompleteClaim.payload?.reason, 'objective_not_completed');

    const ledger = await request('/api/progression/ledger?limit=20', { token: primary.token });
    assert.strictEqual(ledger.status, 200);
    assert.strictEqual(ledger.payload?.reportVersion, 'account-progression-ledger-v1');
    assert.strictEqual(ledger.payload?.entries?.length, 1);
    assert.strictEqual(ledger.payload?.entries?.[0]?.delta, rewardAmount);
    assert(!JSON.stringify(ledger.payload).includes(primary.user?.id || 'missing-primary-id'), 'ledger should not echo user ids');

    const sharedLedgerTimestamp = Date.now() + 60_000;
    const paginationEntryIds = [
      'progression-ledger-page-a-0001',
      'progression-ledger-page-b-0001',
      'progression-ledger-page-c-0001'
    ];
    for (const [index, entryId] of paginationEntryIds.entries()) {
      await dbRun(
        `INSERT INTO progression_economy_ledger
            (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
             reward_impact, metadata_json, created_at)
         VALUES (?, ?, 'renown', 1, ?, 'pagination-test', 'test', ?, 'cosmetic_only', '{}', ?)`,
        [entryId, primary.user.id, rewardAmount + index + 1, `pagination-source-${index}`, sharedLedgerTimestamp]
      );
    }
    const ledgerPageOne = await request('/api/progression/ledger?limit=2', { token: primary.token });
    assert.strictEqual(ledgerPageOne.status, 200);
    assert.strictEqual(ledgerPageOne.payload?.entries?.length, 2);
    assert.match(String(ledgerPageOne.payload?.nextCursor || ''), /^\d+:[A-Za-z0-9._:-]{8,128}$/, 'ledger should return an opaque composite cursor');
    const ledgerPageTwo = await request(`/api/progression/ledger?limit=2&cursor=${encodeURIComponent(ledgerPageOne.payload.nextCursor)}`, { token: primary.token });
    assert.strictEqual(ledgerPageTwo.status, 200);
    const pagedEntryIds = new Set([
      ...(ledgerPageOne.payload?.entries || []),
      ...(ledgerPageTwo.payload?.entries || [])
    ].map(entry => entry.entryId));
    paginationEntryIds.forEach(entryId => assert(pagedEntryIds.has(entryId), `same-timestamp ledger pagination must retain ${entryId}`));

    const missingOpsToken = await request('/api/progression/ops/overview');
    assert.strictEqual(missingOpsToken.status, 404, 'ops endpoint should hide when token is absent');
    const wrongOpsToken = await request('/api/progression/ops/overview', {
      headers: { 'x-defier-ops-token': 'wrong-token' }
    });
    assert.strictEqual(wrongOpsToken.status, 403);
    const overview = await request('/api/progression/ops/overview', {
      headers: { 'x-defier-ops-token': OPS_TOKEN }
    });
    assert.strictEqual(overview.status, 200);
    assert.strictEqual(overview.payload?.reportVersion, 'account-progression-ops-overview-v1');
    assert(Number(overview.payload?.activity?.acceptedEvents) >= 5);
    assert(Number(overview.payload?.economy?.claims) >= 1);
    const overviewJson = JSON.stringify(overview.payload);
    [
      primary.user?.id,
      secondary.user?.id,
      'run-alpha-node-boss-0001',
      'evt-pve-battle-boss-0001',
      'must-not-persist'
    ].filter(Boolean).forEach(secret => {
      assert(!overviewJson.includes(secret), `ops overview must not leak ${secret}`);
    });

    const eventProof = await dbGet(
      'SELECT proof_json, occurred_at, received_at FROM progression_events WHERE event_id = ?',
      ['evt-pve-battle-boss-0001']
    );
    assert(eventProof, 'accepted event should persist');
    assert(!String(eventProof.proof_json).includes('secretProbe'), 'event proof should use a server whitelist');
    assert.strictEqual(Number(eventProof.occurred_at), eventTimestamp, 'accepted events should persist the validated occurrence time');
    assert(Number(eventProof.occurred_at) <= Number(eventProof.received_at), 'future occurrence times must not outrun server receipt time');
    const claimCount = await dbGet(
      'SELECT COUNT(*) AS count FROM progression_reward_claims WHERE user_id = ? AND objective_id = ?',
      [primary.user.id, 'daily_battle_wins']
    );
    const ledgerCount = await dbGet(
      'SELECT COUNT(*) AS count FROM progression_economy_ledger WHERE user_id = ? AND source_id = ?',
      [primary.user.id, `objective:${dailyBattle.cycleId}:daily_battle_wins`]
    );
    assert.strictEqual(Number(claimCount?.count), 1, 'concurrent reward claim should create one claim row');
    assert.strictEqual(Number(ledgerCount?.count), 1, 'concurrent reward claim should create one ledger row');

    const secondaryAfter = await request('/api/progression/status', { token: secondary.token });
    assert((secondaryAfter.payload?.objectives || []).every(entry => entry.current === 0), 'progress must remain account-isolated');
    assert.strictEqual(secondaryAfter.payload?.balances?.[0]?.balance || 0, 0, 'economy must remain account-isolated');

    await stopServer(server);
    server = startServer();
    await waitForHealth(server);
    const statusAfterRestart = await request('/api/progression/status', { token: primary.token });
    assert.strictEqual(objective(statusAfterRestart, 'daily_battle_wins')?.current, 3, 'progress should survive restart');
    assert.strictEqual(objective(statusAfterRestart, 'daily_battle_wins')?.claimed, true, 'claim state should survive restart');
    assert.strictEqual(statusAfterRestart.payload?.balances?.find(entry => entry.currency === 'renown')?.balance, rewardAmount, 'balance should survive restart');

    console.log('Progression platform checks passed.');
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server?.getOutput() || ''}`;
    throw error;
  } finally {
    await stopServer(server);
    removeDbFiles();
  }
}

runChecks().catch(error => {
  console.error(error);
  process.exit(1);
});
