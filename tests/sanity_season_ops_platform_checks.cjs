const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();
const {
  CATALOG_VERSION,
  OFFERS,
  PROTOCOL_VERSION,
  SEASONS,
  SETTLEMENT_FINALIZATION_DELAY_MS,
  getSeasonState,
  getSettlementTier,
} = require('../server/season-ops/catalog');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.SEASON_OPS_PLATFORM_TEST_PORT || 9061);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.SEASON_OPS_PLATFORM_DB_PATH
  || path.join(os.tmpdir(), `the-defier-season-ops-${process.pid}.sqlite`);
const JWT_SECRET = 'season-ops-jwt-secret-32-characters';
const HMAC_SECRET = 'season-ops-hmac-secret-32-characters';
const OPS_TOKEN = 'season-ops-private-token-32-characters';

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
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
      DEFIER_GIT_SHA: 'season-ops-test-sha',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => output += chunk.toString());
  child.stderr.on('data', chunk => output += chunk.toString());
  return { child, port, baseUrl: `http://127.0.0.1:${port}`, getOutput: () => output };
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

async function request(pathname, { method = 'GET', token, body, headers = {} } = {}, baseUrl = BASE_URL) {
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
  } catch {}
  return { status: response.status, payload };
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await request('/api/health', {}, server.baseUrl || BASE_URL);
      if (health.status === 200 && health.payload?.status === 'ok') return health;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const detail = server.getOutput();
  const message = lastError && lastError.message ? lastError.message : 'season ops health timed out';
  const error = new Error(`${message}\nServer output:\n${detail}`);
  if (lastError) error.cause = lastError;
  throw error;
}

async function runConcurrentStartupCheck() {
  removeDbFiles();
  const first = startServer(PORT);
  const second = startServer(PORT + 1);
  try {
    const [firstHealth, secondHealth] = await Promise.all([waitForHealth(first), waitForHealth(second)]);
    assert.strictEqual(firstHealth.payload?.schema?.currentMigrationId, '0012_world_rift_campaign_directives');
    assert.strictEqual(secondHealth.payload?.schema?.currentMigrationId, '0012_world_rift_campaign_directives');
  } finally {
    await Promise.all([stopServer(first), stopServer(second)]);
  }
  const catalogCounts = await dbGet(
    `SELECT
       (SELECT COUNT(*) FROM season_ops_seasons) AS seasons,
       (SELECT COUNT(*) FROM season_ops_offers) AS offers,
       (SELECT COUNT(*) FROM schema_migrations WHERE id = '0005_season_ops_economy') AS migrations,
       (SELECT COUNT(*) FROM weekly_archive_cycles) AS archiveCycles,
       (SELECT COUNT(DISTINCT snapshot_hash) FROM weekly_archive_cycles) AS archiveHashes`,
  );
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(catalogCounts).map(([key, value]) => [key, Number(value)])),
    {
      seasons: SEASONS.length,
      offers: OFFERS.length,
      migrations: 1,
      archiveCycles: 3,
      archiveHashes: 3,
    },
    'concurrent startup should converge on one immutable catalog, one migration record, and three weekly archive snapshots',
  );
}

function signSessionPayload(data, token) {
  const salt = `season-${crypto.randomBytes(12).toString('hex')}`;
  const signature = crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return { salt, signature, signatureMode: 'session' };
}

async function signedRequest(pathname, token, data) {
  return request(pathname, {
    method: 'POST',
    token,
    body: { ...data, ...signSessionPayload(data, token) },
  });
}

async function registerAndLogin(username) {
  username = `${String(username || 'season').slice(0, 8)}-${Date.now().toString(36)}`;
  const password = 'pwd123456';
  const registered = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password },
  });
  assert.strictEqual(registered.status, 200, `register should succeed: ${JSON.stringify(registered.payload)}`);
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  assert.strictEqual(login.status, 200, `login should succeed: ${JSON.stringify(login.payload)}`);
  const token = login.payload?.token || login.payload?.user?.sessionToken;
  const userId = login.payload?.user?.id || login.payload?.user?.objectId;
  assert(token && userId, 'login should return token and user id');
  return { token, userId, username };
}

function openDb() {
  const connection = new sqlite3.Database(DB_PATH);
  connection.configure('busyTimeout', 5000);
  return connection;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const connection = openDb();
    connection.run(sql, params, function onRun(error) {
      const result = { changes: Number(this && this.changes || 0) };
      connection.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const connection = openDb();
    connection.get(sql, params, (error, row) => {
      connection.close();
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

async function seedWallet(userId, balance) {
  await dbRun(
    `INSERT INTO progression_economy_balances
       (user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at)
     VALUES (?, 'renown', ?, ?, 0, ?)
     ON CONFLICT(user_id, currency) DO UPDATE SET
       balance = excluded.balance,
       lifetime_earned = MAX(progression_economy_balances.lifetime_earned, excluded.lifetime_earned),
       updated_at = excluded.updated_at`,
    [userId, balance, balance, Date.now()],
  );
}

async function runApiChecks(server) {
  const health = await waitForHealth(server);
  assert.strictEqual(health.payload?.schema?.version, 12, 'season ops should coexist with world-rift campaign directives schema v12');
  assert.strictEqual(health.payload?.schema?.currentMigrationId, '0012_world_rift_campaign_directives');

  const unauthenticated = await request('/api/season-ops/current');
  assert.strictEqual(unauthenticated.status, 401, 'season dashboard should require JWT');

  const primary = await registerAndLogin(`season_primary_${Date.now()}`);
  const secondary = await registerAndLogin(`season_secondary_${Date.now()}`);
  await seedWallet(primary.userId, 500);
  await seedWallet(secondary.userId, 100);

  await dbRun(
    `INSERT INTO pvp_ranks
       (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
     VALUES (?, ?, ?, 2400, 99, 0, 1, '天穹榜', 's1-genesis', ?, ?)`,
    [`legacy-${primary.userId}`, primary.userId, primary.username, Date.now(), Date.now()],
  );

  const dashboard = await request('/api/season-ops/current', { token: primary.token });
  assert.strictEqual(dashboard.status, 200);
  assert.strictEqual(dashboard.payload?.reportVersion, 'season-ops-dashboard-v1');
  assert.strictEqual(dashboard.payload?.protocolVersion, PROTOCOL_VERSION);
  assert.strictEqual(dashboard.payload?.season?.state, 'active');
  assert.strictEqual(dashboard.payload?.wallet?.balance, 500);
  assert(dashboard.payload?.offers?.every(offer => offer.rewardImpact === 'cosmetic_only' && offer.available === true));
  assert(dashboard.payload?.objectives?.some(entry => entry.trustRequirement === 'server_verified' && entry.scope === 'season'));
  assert(dashboard.payload?.objectives?.some(entry => entry.trustRequirement === 'server_authoritative' && entry.scope === 'season'));
  assert.deepStrictEqual(dashboard.payload?.leaderboard, [], 'legacy pvp_ranks must not enter the official season ladder');

  const offer = OFFERS[0];
  const mutationId = 'season-mutation-concurrent-0001';
  const purchasePayload = {
    protocolVersion: PROTOCOL_VERSION,
    seasonId: offer.seasonId,
    offerId: offer.offerId,
    mutationId,
  };
  const unsigned = await request('/api/season-ops/store/purchases', {
    method: 'POST',
    token: primary.token,
    body: purchasePayload,
  });
  assert.strictEqual(unsigned.status, 400, 'purchase should require a complete session signature');

  const [purchaseA, purchaseB] = await Promise.all([
    signedRequest('/api/season-ops/store/purchases', primary.token, purchasePayload),
    signedRequest('/api/season-ops/store/purchases', primary.token, purchasePayload),
  ]);
  assert.strictEqual(purchaseA.status, 200, `first concurrent purchase should succeed: ${JSON.stringify(purchaseA.payload)}`);
  assert.strictEqual(purchaseB.status, 200, `same mutation replay should return the durable receipt: ${JSON.stringify(purchaseB.payload)}`);
  assert.strictEqual(purchaseA.payload?.purchaseId, purchaseB.payload?.purchaseId, 'same mutation should replay one purchase receipt');
  assert.strictEqual(purchaseA.payload?.wallet?.balance, 320);

  const counts = await dbGet(
    `SELECT
       (SELECT COUNT(*) FROM season_ops_purchases WHERE user_id = ?) AS purchases,
       (SELECT COUNT(*) FROM season_ops_mutations WHERE user_id = ?) AS mutations,
       (SELECT COUNT(*) FROM season_ops_entitlements WHERE user_id = ?) AS entitlements,
       (SELECT COUNT(*) FROM progression_economy_ledger WHERE user_id = ? AND source_type = 'season_ops_purchase') AS ledger_entries`,
    [primary.userId, primary.userId, primary.userId, primary.userId],
  );
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])),
    { purchases: 1, mutations: 1, entitlements: 1, ledger_entries: 1 },
    'concurrent purchase should commit one order, mutation, entitlement and ledger entry',
  );

  const changedMutation = await signedRequest('/api/season-ops/store/purchases', primary.token, {
    ...purchasePayload,
    offerId: OFFERS[1].offerId,
  });
  assert.strictEqual(changedMutation.status, 409, 'reusing a mutation id with changed fields must fail');
  assert.strictEqual(changedMutation.payload?.reason, 'mutation_reused');

  const insufficient = await signedRequest('/api/season-ops/store/purchases', secondary.token, {
    protocolVersion: PROTOCOL_VERSION,
    seasonId: OFFERS[4].seasonId,
    offerId: OFFERS[4].offerId,
    mutationId: 'season-mutation-insufficient-0001',
  });
  assert.strictEqual(insufficient.status, 409);
  assert.strictEqual(insufficient.payload?.reason, 'insufficient_funds');
  assert.strictEqual((await request('/api/season-ops/current', { token: secondary.token })).payload?.wallet?.balance, 100, 'failed purchase must not change another account wallet');

  const opsHidden = await request('/api/season-ops/ops/overview');
  assert.strictEqual(opsHidden.status, 404, 'ops endpoints should stay hidden without a token');
  const opsDenied = await request('/api/season-ops/ops/overview', { headers: { 'x-defier-ops-token': 'wrong-token' } });
  assert.strictEqual(opsDenied.status, 403);
  const opsNeedsIdentity = await request('/api/season-ops/ops/overview', { headers: { 'x-defier-ops-token': OPS_TOKEN } });
  assert.strictEqual(opsNeedsIdentity.status, 401, 'valid ops token must still require an authenticated actor');
  const ops = await request('/api/season-ops/ops/overview', { token: primary.token, headers: { 'x-defier-ops-token': OPS_TOKEN } });
  assert.strictEqual(ops.status, 200);
  const opsJson = JSON.stringify(ops.payload);
  assert(!opsJson.includes(primary.userId) && !opsJson.includes(mutationId), 'ops overview must not expose user or mutation ids');

  const compensationPayload = {
    protocolVersion: PROTOCOL_VERSION,
    seasonId: SEASONS[0].seasonId,
    targetUserId: secondary.userId,
    confirmTargetUserId: secondary.userId,
    mutationId: 'season-compensation-mutation-0001',
    reasonCode: 'service_incident',
    amount: 75,
  };
  const unconfirmedCompensation = await request('/api/season-ops/ops/compensations', {
    method: 'POST',
    token: primary.token,
    headers: { 'x-defier-ops-token': OPS_TOKEN },
    body: { ...compensationPayload, confirmTargetUserId: '' },
  });
  assert.strictEqual(unconfirmedCompensation.status, 400, 'manual compensation must explicitly confirm its target account');
  assert.strictEqual(unconfirmedCompensation.payload?.reason, 'target_confirmation_required');
  const compensation = await request('/api/season-ops/ops/compensations', {
    method: 'POST',
    token: primary.token,
    headers: { 'x-defier-ops-token': OPS_TOKEN },
    body: compensationPayload,
  });
  assert.strictEqual(compensation.status, 200, JSON.stringify(compensation.payload));
  assert.strictEqual(compensation.payload?.reportVersion, 'season-ops-compensation-v1');
  assert.strictEqual(compensation.payload?.wallet?.balance, 175);
  assert.match(compensation.payload?.recipientRef || '', /^[a-f0-9]{24}$/);
  assert(!JSON.stringify(compensation.payload).includes(secondary.userId), 'compensation receipt must not echo the raw target user id');
  const compensationReplay = await request('/api/season-ops/ops/compensations', {
    method: 'POST',
    token: primary.token,
    headers: { 'x-defier-ops-token': OPS_TOKEN },
    body: compensationPayload,
  });
  assert.strictEqual(compensationReplay.status, 200);
  assert.strictEqual(compensationReplay.payload?.compensationId, compensation.payload?.compensationId, 'same compensation mutation should replay one durable receipt');
  const changedCompensation = await request('/api/season-ops/ops/compensations', {
    method: 'POST',
    token: primary.token,
    headers: { 'x-defier-ops-token': OPS_TOKEN },
    body: { ...compensationPayload, amount: 76 },
  });
  assert.strictEqual(changedCompensation.status, 409, 'compensation mutation reuse with changed amount must fail');
  assert.strictEqual(changedCompensation.payload?.reason, 'mutation_reused');
  const compensationCounts = await dbGet(
    `SELECT
       (SELECT COUNT(*) FROM season_ops_compensations WHERE target_user_id = ?) AS compensations,
       (SELECT COUNT(*) FROM progression_economy_ledger WHERE user_id = ? AND source_type = 'season_ops_compensation') AS ledger_entries,
       (SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = 'renown') AS balance`,
    [secondary.userId, secondary.userId, secondary.userId],
  );
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(compensationCounts).map(([key, value]) => [key, Number(value)])),
    { compensations: 1, ledger_entries: 1, balance: 175 },
    'manual compensation should atomically credit one wallet, ledger row, and durable receipt',
  );
  const compensationAudit = await dbGet(
    'SELECT actor_ref, receipt_json FROM season_ops_compensations WHERE target_user_id = ? AND mutation_id = ?',
    [secondary.userId, compensationPayload.mutationId],
  );
  assert.match(compensationAudit.actor_ref, /^[a-f0-9]{24}$/);
  assert(!compensationAudit.receipt_json.includes(primary.userId) && !compensationAudit.receipt_json.includes(secondary.userId), 'durable compensation receipt should keep actor and recipient pseudonymous');
  const opsAfterCompensation = await request('/api/season-ops/ops/overview', { token: primary.token, headers: { 'x-defier-ops-token': OPS_TOKEN } });
  assert.strictEqual(opsAfterCompensation.payload?.resources?.compensationCount, 1);
  assert.strictEqual(opsAfterCompensation.payload?.resources?.compensationTotal, 75);

  const snapshotTooEarly = await request(`/api/season-ops/ops/seasons/${SEASONS[0].seasonId}/snapshot`, {
    method: 'POST',
    token: primary.token,
    headers: { 'x-defier-ops-token': OPS_TOKEN },
    body: { confirmSeasonId: SEASONS[0].seasonId },
  });
  assert.strictEqual(snapshotTooEarly.status, 409, 'active season must not be snapshotted early');
  assert.strictEqual(snapshotTooEarly.payload?.reason, 'season_snapshot_not_ready');

  await dbRun(
    `INSERT INTO pvp_season_ladders
       (season_id, user_id, user_name, score, wins, losses, ranked_games, division,
        authoritative_participant, first_authoritative_at, last_match_id, last_result, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [SEASONS[0].seasonId, primary.userId, primary.username, 1120, 4, 1, 5, '潜龙榜', Date.now() - 1000, 'live-match-primary-0001', 'win', Date.now() - 500, Date.now() - 1000],
  );
  await dbRun(
    `INSERT INTO pvp_season_ladders
       (season_id, user_id, user_name, score, wins, losses, ranked_games, division,
        authoritative_participant, first_authoritative_at, last_match_id, last_result, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [SEASONS[0].seasonId, secondary.userId, secondary.username, 980, 1, 3, 4, '潜龙榜', Date.now() - 900, 'live-match-secondary-0001', 'loss', Date.now() - 400, Date.now() - 900],
  );

  const leaderboard = await request('/api/season-ops/leaderboard?limit=10', { token: primary.token });
  assert.strictEqual(leaderboard.status, 200);
  assert.strictEqual(leaderboard.payload?.entries?.[0]?.userName, primary.username);
  assert.strictEqual(leaderboard.payload?.entries?.[0]?.userId, undefined, 'public leaderboard should omit user ids');
  assert.strictEqual(leaderboard.payload?.self?.userId, undefined, 'self leaderboard projection should omit internal user id');

  return { primary, secondary };
}

async function runSettlementChecks(primary, secondary) {
  process.env.DEFIER_DB_PATH = DB_PATH;
  const originalNow = Date.now;
  const endedAt = SEASONS[0].graceEndsAt + 1000;
  Date.now = () => endedAt;
  const database = require('../server/db/database');
  const seasonOps = require('../server/season-ops/service');
  await database.initDb();
  try {
    Date.now = () => SEASONS[0].endsAt + SETTLEMENT_FINALIZATION_DELAY_MS - 1;
    await assert.rejects(
      () => seasonOps.createLeaderboardSnapshot(SEASONS[0].seasonId),
      error => error && error.reason === 'season_snapshot_settlement_window_open',
      'final snapshot must wait for season-boundary live matches to settle',
    );

    const newerProjection = await seasonOps.recordAuthoritativePvpResult(database.db, {
      seasonId: SEASONS[0].seasonId,
      userId: primary.userId,
      matchId: 'live-match-primary-newer-0002',
      didWin: true,
      score: 1125,
      wins: 5,
      losses: 1,
      rankedGames: 6,
      division: '潜龙榜',
      occurredAt: SEASONS[0].endsAt - 100,
      updatedAt: SEASONS[0].endsAt + 100,
    });
    assert.strictEqual(newerProjection.applied, true);
    const staleProjection = await seasonOps.recordAuthoritativePvpResult(database.db, {
      seasonId: SEASONS[0].seasonId,
      userId: primary.userId,
      matchId: 'live-match-primary-older-0001',
      didWin: false,
      score: 900,
      wins: 1,
      losses: 8,
      rankedGames: 9,
      division: '潜龙榜',
      occurredAt: SEASONS[0].endsAt - 200,
      updatedAt: SEASONS[0].endsAt + 200,
    });
    assert.strictEqual(staleProjection.applied, false, 'older authoritative replay must not rewind a newer season projection');
    assert.strictEqual(staleProjection.stale, true);
    const projectedRank = await dbGet(
      'SELECT score, wins, losses, last_match_id FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, primary.userId],
    );
    assert.deepStrictEqual(
      { score: Number(projectedRank.score), wins: Number(projectedRank.wins), losses: Number(projectedRank.losses), lastMatchId: projectedRank.last_match_id },
      { score: 1125, wins: 5, losses: 1, lastMatchId: 'live-match-primary-newer-0002' },
    );

    Date.now = () => endedAt;
    const pendingBoundaryMatchId = 'live-match-boundary-still-active-0003';
    await dbRun(
      `INSERT INTO pvp_live_matches
        (match_id, status, seat_a_user_id, seat_b_user_id, state_version, state_json,
         connection_json, created_at, updated_at, finished_at)
       VALUES (?, 'active', ?, ?, 1, ?, '{}', ?, ?, 0)`,
      [
        pendingBoundaryMatchId,
        primary.userId,
        secondary.userId,
        JSON.stringify({
          status: 'active',
          mode: 'ranked',
          setup: { battleStartedAt: SEASONS[0].endsAt - 1000 },
          seats: {
            A: { userId: primary.userId },
            B: { userId: secondary.userId },
          },
          events: [],
        }),
        SEASONS[0].endsAt - 2000,
        endedAt,
      ],
    );
    await dbRun(
      `INSERT INTO pvp_live_matches
        (match_id, status, seat_a_user_id, seat_b_user_id, state_version, state_json,
         connection_json, created_at, updated_at, finished_at)
       VALUES (?, 'active', ?, ?, 1, ?, '{}', ?, ?, 0)`,
      [
        'live-match-boundary-friendly-ignored-0004',
        primary.userId,
        secondary.userId,
        JSON.stringify({
          status: 'active',
          mode: 'friendly',
          setup: { battleStartedAt: SEASONS[0].endsAt - 900 },
          seats: { A: { userId: primary.userId }, B: { userId: secondary.userId } },
          events: [],
        }),
        SEASONS[0].endsAt - 1900,
        endedAt,
      ],
    );
    await dbRun(
      `INSERT INTO pvp_live_matches
        (match_id, status, seat_a_user_id, seat_b_user_id, state_version, state_json,
         connection_json, created_at, updated_at, finished_at)
       VALUES (?, 'finished', ?, ?, 2, ?, '{}', ?, ?, ?)`,
      [
        'live-match-boundary-draw-ignored-0005',
        primary.userId,
        secondary.userId,
        JSON.stringify({
          status: 'finished',
          mode: 'ranked',
          setup: { battleStartedAt: SEASONS[0].endsAt - 800 },
          seats: { A: { userId: primary.userId }, B: { userId: secondary.userId } },
          events: [{
            eventType: 'match_finished',
            payload: { winnerSeat: 'draw', loserSeat: '', finishReason: 'round14_draw' },
          }],
        }),
        SEASONS[0].endsAt - 1800,
        endedAt,
        endedAt,
      ],
    );
    await dbRun(
      `INSERT INTO pvp_live_matches
        (match_id, status, seat_a_user_id, seat_b_user_id, state_version, state_json,
         connection_json, created_at, updated_at, finished_at)
       VALUES (?, 'active', ?, ?, 1, ?, '{}', ?, ?, 0)`,
      [
        'live-match-boundary-test-scope-ignored-0006',
        primary.userId,
        secondary.userId,
        JSON.stringify({
          status: 'active',
          mode: 'ranked',
          testMatchScope: 'release_audit',
          setup: { battleStartedAt: SEASONS[0].endsAt - 700 },
          seats: { A: { userId: primary.userId }, B: { userId: secondary.userId } },
          events: [],
        }),
        SEASONS[0].endsAt - 1700,
        endedAt,
      ],
    );
    await assert.rejects(
      () => seasonOps.createLeaderboardSnapshot(SEASONS[0].seasonId),
      error => error && error.reason === 'season_snapshot_matches_pending' && error.pendingMatchCount === 1,
      'only unresolved official season matches should block finalization after the elapsed buffer',
    );
    await dbRun(
      `UPDATE pvp_live_matches
       SET status = 'invalidated', state_json = ?, updated_at = ?, finished_at = ?
       WHERE match_id = ?`,
      [
        JSON.stringify({
          status: 'invalidated',
          mode: 'ranked',
          setup: { battleStartedAt: SEASONS[0].endsAt - 1000 },
          seats: {
            A: { userId: primary.userId },
            B: { userId: secondary.userId },
          },
          events: [{ eventType: 'match_invalidated', payload: { reason: 'recovery_timeout' } }],
        }),
        endedAt,
        endedAt,
        pendingBoundaryMatchId,
      ],
    );
    const snapshot = await seasonOps.createLeaderboardSnapshot(SEASONS[0].seasonId, {
      actorId: primary.userId,
      requestId: 'season-ops-snapshot-request-0001',
    });
    assert.strictEqual(snapshot.entryCount, 2);
    assert.strictEqual(snapshot.entries[0].userId, primary.userId);
    assert.strictEqual(snapshot.entries[1].userId, secondary.userId);
    assert.strictEqual(snapshot.entries[0].score, 1125);
    assert.strictEqual(snapshot.entries[0].settlementTierId, 'champion');
    assert.strictEqual(snapshot.entries[1].settlementTierId, 'participant', 'small populations must not incorrectly create a top-10 runner-up');

    const secondaryBeforeLateResult = await dbGet(
      'SELECT score, wins, losses, last_match_id FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, secondary.userId],
    );
    const lateResult = await seasonOps.recordAuthoritativePvpResult(database.db, {
      seasonId: SEASONS[0].seasonId,
      userId: secondary.userId,
      matchId: 'live-match-secondary-after-final-0002',
      didWin: true,
      score: 1400,
      wins: 20,
      losses: 3,
      rankedGames: 23,
      division: '问道榜',
      occurredAt: SEASONS[0].endsAt - 50,
      updatedAt: endedAt + 500,
    });
    assert.strictEqual(lateResult.applied, false, 'late authoritative settlement must not mutate a finalized season');
    assert.strictEqual(lateResult.finalized, true);
    const secondaryAfterLateResult = await dbGet(
      'SELECT score, wins, losses, last_match_id FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, secondary.userId],
    );
    assert.deepStrictEqual(secondaryAfterLateResult, secondaryBeforeLateResult, 'final snapshot must freeze the live leaderboard projection');
    const lateJournal = await dbGet(
      `SELECT projection_status FROM pvp_season_ladder_results
       WHERE season_id = ? AND user_id = ? AND match_id = ?`,
      [SEASONS[0].seasonId, secondary.userId, 'live-match-secondary-after-final-0002'],
    );
    assert.strictEqual(lateJournal.projection_status, 'post_snapshot_noop', 'late result should remain auditable without changing the final ladder');

    await dbRun(
      `INSERT INTO pvp_live_match_settlements
        (match_id, winner_user_id, loser_user_id, winner_seat, loser_seat, finish_reason,
         rating_delta_winner, rating_delta_loser, winner_score_after, loser_score_after,
         winner_coins_awarded, loser_coins_awarded, payload, match_started_at, created_at)
       VALUES (?, ?, ?, 'A', 'B', 'late_recovery', 16, -16, 1500, 800, 0, 0, '{}', ?, ?)`,
      ['live-match-bootstrap-after-final-0003', primary.userId, secondary.userId, SEASONS[0].endsAt - 25, endedAt + 700],
    );
    const { bootstrapSeasonOpsSchema } = require('../server/season-ops/bootstrap');
    await bootstrapSeasonOpsSchema(database.db);
    const primaryAfterLateBootstrap = await dbGet(
      'SELECT score, wins, losses, last_match_id FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, primary.userId],
    );
    assert.strictEqual(Number(primaryAfterLateBootstrap.score), 1125, 'startup replay must not apply settlements completed after finalization');
    assert.strictEqual(primaryAfterLateBootstrap.last_match_id, 'live-match-primary-newer-0002');
    const bootstrapLateJournal = await dbGet(
      `SELECT projection_status FROM pvp_season_ladder_results
       WHERE season_id = ? AND user_id = ? AND match_id = ?`,
      [SEASONS[0].seasonId, primary.userId, 'live-match-bootstrap-after-final-0003'],
    );
    assert.strictEqual(bootstrapLateJournal.projection_status, 'post_snapshot_noop');

    await dbRun(
      'UPDATE pvp_season_ladders SET score = 1 WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, primary.userId],
    );
    const replaySnapshot = await seasonOps.createLeaderboardSnapshot(SEASONS[0].seasonId);
    assert.strictEqual(replaySnapshot.contentHash, snapshot.contentHash, 'final snapshot should be immutable after ladder changes');
    assert.strictEqual(replaySnapshot.entries[0].score, 1125);

    const snapshotAudit = await dbGet(
      `SELECT detail_json FROM season_ops_ops_events
       WHERE event_type = 'snapshot' AND season_id = ? AND result_code = 'created'
       ORDER BY created_at DESC LIMIT 1`,
      [SEASONS[0].seasonId],
    );
    const snapshotAuditDetail = JSON.parse(snapshotAudit.detail_json);
    assert.match(snapshotAuditDetail.actorRef, /^[a-f0-9]{24}$/, 'privileged season action should persist a pseudonymous actor reference');
    assert.strictEqual(snapshotAuditDetail.requestId, 'season-ops-snapshot-request-0001');
    assert(!snapshotAudit.detail_json.includes(primary.userId), 'ops audit detail must not persist the raw user id');

    const primaryBefore = await dbGet('SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?', [primary.userId, 'renown']);
    const secondaryBefore = await dbGet('SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?', [secondary.userId, 'renown']);
    const settled = await seasonOps.settleSeason(SEASONS[0].seasonId);
    assert.strictEqual(settled.settledCount, 2);
    assert.strictEqual(settled.replayedCount, 0);
    const primaryAfter = await dbGet('SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?', [primary.userId, 'renown']);
    const secondaryAfter = await dbGet('SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?', [secondary.userId, 'renown']);
    assert.strictEqual(Number(primaryAfter.balance), Number(primaryBefore.balance) + 1200);
    assert.strictEqual(Number(secondaryAfter.balance), Number(secondaryBefore.balance) + 200);

    const replaySettlement = await seasonOps.settleSeason(SEASONS[0].seasonId);
    assert.strictEqual(replaySettlement.settledCount, 0);
    assert.strictEqual(replaySettlement.replayedCount, 2);
    assert.strictEqual(Number((await dbGet('SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?', [primary.userId, 'renown'])).balance), Number(primaryAfter.balance), 'replayed settlement must not pay twice');

    const secondarySettlement = await dbGet(
      'SELECT ledger_entry_id, entitlement_key FROM season_ops_settlements WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, secondary.userId],
    );
    await dbRun('DELETE FROM progression_economy_ledger WHERE entry_id = ?', [secondarySettlement.ledger_entry_id]);
    await dbRun('DELETE FROM season_ops_entitlements WHERE user_id = ? AND entitlement_key = ?', [secondary.userId, secondarySettlement.entitlement_key]);
    const balanceBeforeReconcile = Number((await dbGet('SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?', [secondary.userId, 'renown'])).balance);
    const reconciled = await seasonOps.reconcileSeason(SEASONS[0].seasonId);
    assert(reconciled.repairedCount >= 1, 'reconcile should repair missing durable settlement artifacts');
    const repairedLedger = await dbGet('SELECT entry_id FROM progression_economy_ledger WHERE entry_id = ?', [secondarySettlement.ledger_entry_id]);
    const repairedEntitlement = await dbGet('SELECT entitlement_key FROM season_ops_entitlements WHERE user_id = ? AND entitlement_key = ?', [secondary.userId, secondarySettlement.entitlement_key]);
    assert(repairedLedger && repairedEntitlement, 'reconcile should restore the missing ledger and entitlement');
    assert.strictEqual(Number((await dbGet('SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?', [secondary.userId, 'renown'])).balance), balanceBeforeReconcile, 'artifact repair must not add wallet balance twice');

    await dbRun(
      'UPDATE season_ops_leaderboard_entries SET score = score + 1 WHERE snapshot_id = ? AND rank = 1',
      [snapshot.snapshotId],
    );
    await assert.rejects(
      () => seasonOps.createLeaderboardSnapshot(SEASONS[0].seasonId),
      error => error && error.reason === 'season_snapshot_corrupt',
      'snapshot replay should fail closed when immutable content no longer matches its hash',
    );
  } finally {
    Date.now = originalNow;
    await new Promise(resolve => database.db.close(() => resolve()));
  }
}

async function runCatalogDriftCheck() {
  const offer = OFFERS[0];
  await dbRun('UPDATE season_ops_offers SET content_hash = ? WHERE offer_id = ?', ['corrupt-catalog-hash', offer.offerId]);
  const connection = openDb();
  const { bootstrapSeasonOpsSchema } = require('../server/season-ops/bootstrap');
  await assert.rejects(
    () => bootstrapSeasonOpsSchema(connection),
    error => error && error.code === 'SEASON_OPS_CATALOG_DRIFT',
    'catalog bootstrap should fail closed on immutable content drift',
  );
  await new Promise(resolve => connection.close(() => resolve()));
}

(async () => {
  assert.strictEqual(CATALOG_VERSION, 'season-ops-catalog-v1');
  assert.strictEqual(PROTOCOL_VERSION, 'season-ops-v1');
  assert.strictEqual(getSeasonState(SEASONS[0], Date.UTC(2026, 6, 11)).state, 'active');
  assert.strictEqual(getSeasonState(SEASONS[0], SEASONS[0].endsAt).state, 'grace');
  assert.strictEqual(getSeasonState(SEASONS[0], SEASONS[0].graceEndsAt).state, 'ended');
  assert.strictEqual(getSettlementTier({ rank: 2, totalPlayers: 2, rankedGames: 1 }).tierId, 'participant');
  assert(OFFERS.every(offer => offer.rewardImpact === 'cosmetic_only'));

  await runConcurrentStartupCheck();
  const server = startServer();
  let users = null;
  try {
    users = await runApiChecks(server);
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
  }
  await runSettlementChecks(users.primary, users.secondary);
  await runCatalogDriftCheck();
  removeDbFiles();
  console.log('Season ops platform checks passed.');
})().catch(error => {
  console.error(error);
  removeDbFiles();
  process.exit(1);
});
