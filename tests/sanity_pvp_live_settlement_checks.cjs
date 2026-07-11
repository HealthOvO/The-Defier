const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const sqlite3 = require('../server/node_modules/sqlite3').verbose();
const { createLivePvpStore } = require('../server/pvp-live/live-store');
const { SEASONS, SETTLEMENT_FINALIZATION_DELAY_MS } = require('../server/season-ops/catalog');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PVP_LIVE_SETTLEMENT_PORT || 9022);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.PVP_LIVE_SETTLEMENT_DB_PATH
  || path.join(os.tmpdir(), `the-defier-pvp-live-settlement-${process.pid}.sqlite`);
const JWT_SECRET = 'integration-jwt-secret-32-characters';
const HMAC_SECRET = 'integration-hmac-secret-32-characters';
process.env.DEFIER_DB_PATH = DB_PATH;

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function eventPublicData(event) {
  return event && (event.publicData || event.payload) || {};
}

async function assertTransientSettlementFailureRetriesBeforeRelease() {
  let settlementAttempts = 0;
  const savedStatuses = [];
  const store = createLivePvpStore({
    persistence: {
      async saveMatch(match) {
        savedStatuses.push(match.state.status);
      },
    },
    settlement: {
      async settleMatch() {
        settlementAttempts += 1;
        if (settlementAttempts === 1) {
          throw new Error('transient live settlement failure');
        }
        return { settled: true };
      },
    },
  });

  await store.joinQueue({ userId: 'retry-user-a', displayName: '甲' });
  const joinB = await store.joinQueue({ userId: 'retry-user-b', displayName: '乙' });
  const readyA = await store.submitIntent('retry-user-a', joinB.matchId, {
    intentId: 'retry-ready-a-1',
    intentType: 'ready',
    stateVersion: joinB.stateView.stateVersion,
    payload: {},
  });
  const readyB = await store.submitIntent('retry-user-b', joinB.matchId, {
    intentId: 'retry-ready-b-1',
    intentType: 'ready',
    stateVersion: readyA.stateView.stateVersion,
    payload: {},
  });
  await assert.rejects(
    () => store.submitIntent('retry-user-b', joinB.matchId, {
      intentId: 'retry-surrender-b-1',
      intentType: 'surrender',
      stateVersion: readyB.stateView.stateVersion,
      payload: {},
    }),
    /transient live settlement failure/,
    'transient settlement failure should surface instead of silently releasing an unsettled match',
  );
  assert.equal(settlementAttempts, 1, 'first live settlement attempt should run once');
  assert.ok(savedStatuses.includes('finished'), 'finished snapshot should be persisted before retry');

  const currentB = await store.getActiveMatchForUser('retry-user-b');
  assert.equal(settlementAttempts, 2, 'finished-but-unsettled live match should retry settlement on current match recovery');
  assert.equal(currentB.stateView.status, 'finished', 'retry should still return finished state view');

  const requeueB = await store.joinQueue({ userId: 'retry-user-b', displayName: '乙' });
  assert.equal(requeueB.status, 'waiting', 'live player should only be released for a new queue after settlement retry succeeds');
}

async function assertRound14DrawSettlementNoRankedImpact() {
  const { makeSqliteLivePvpSettlement } = require('../server/pvp-live/live-settlement');
  const settlement = makeSqliteLivePvpSettlement();
  const result = await settlement.settleMatch({
    matchId: 'round14-draw-direct-settlement',
    mode: 'ranked',
    state: {
      status: 'finished',
      mode: 'ranked',
      seats: {
        A: { seatId: 'A', userId: 'draw-user-a', displayName: '甲' },
        B: { seatId: 'B', userId: 'draw-user-b', displayName: '乙' },
      },
      events: [{
        eventType: 'match_finished',
        payload: {
          winnerSeat: 'draw',
          loserSeat: '',
          finishReason: 'round14_draw',
          scoreA: 0,
          scoreB: 0,
          scoreDelta: 0,
          scoreThreshold: 5,
        },
      }],
    },
  });
  assert.equal(result.settled, false, 'round14 draw settlement should not write ranked settlement');
  assert.equal(result.reason, 'round14_draw_no_ranked_impact', 'round14 draw should be treated as no ranked impact instead of invalid finished seats');
}

async function assertRound14ScoreSettlementWritesRankedHistory() {
  const { makeSqliteLivePvpSettlement } = require('../server/pvp-live/live-settlement');
  const settlement = makeSqliteLivePvpSettlement();
  const seededAt = Date.now();
  await dbRun(
    `INSERT INTO pvp_ranks
       (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
     VALUES
       ('pvp-rank-score-user-a', 'score-user-a', '甲', 1500, 7, 2, 1, '问道榜', 's1-genesis', ?, ?),
       ('pvp-rank-score-user-b', 'score-user-b', '乙', 1400, 4, 5, 1, '问道榜', 's1-genesis', ?, ?)`,
    [seededAt, seededAt, seededAt, seededAt],
  );
  const match = {
    matchId: 'round14-score-direct-settlement',
    mode: 'ranked',
    state: {
      status: 'finished',
      mode: 'ranked',
      seats: {
        A: { seatId: 'A', userId: 'score-user-a', displayName: '甲' },
        B: { seatId: 'B', userId: 'score-user-b', displayName: '乙' },
      },
      events: [{
        eventType: 'match_finished',
        payload: {
          winnerSeat: 'A',
          loserSeat: 'B',
          finishReason: 'round14_score',
          scoreA: 10,
          scoreB: 0,
          scoreDelta: 10,
          scoreThreshold: 5,
        },
      }],
    },
  };
  const result = await settlement.settleMatch(match);
  assert.equal(result.settled, true, 'round14 score settlement should write ranked settlement');
  assert.equal(result.finishReason, 'round14_score', 'round14 score settlement should keep finish reason');
  assert.equal(result.winner.oldScore, 1500, 'legacy settlement report should preserve the old-client rating baseline');
  assert.equal(result.winner.seasonRank.oldScore, 1000, 'official season projection should expose its isolated rating baseline');
  assert.equal(result.winner.seasonRank.rankedGames, 1, 'official season projection should keep season-only match count');
  const settlementRow = await dbGet(
    'SELECT * FROM pvp_live_match_settlements WHERE match_id = ?',
    [match.matchId],
  );
  assert.ok(settlementRow, 'round14 score settlement should write settlement gate');
  assert.equal(settlementRow.winner_user_id, 'score-user-a', 'round14 score settlement gate should persist winner user');
  assert.equal(settlementRow.loser_user_id, 'score-user-b', 'round14 score settlement gate should persist loser user');
  assert.equal(settlementRow.finish_reason, 'round14_score', 'round14 score settlement gate should persist finish reason');
  const historyCount = await dbGet(
    'SELECT COUNT(*) AS count FROM pvp_match_history WHERE ticket_id LIKE ?',
    [`live:${match.matchId}:%`],
  );
  assert.equal(historyCount.count, 2, 'round14 score settlement should append both player history rows');
  const winnerRank = await dbGet('SELECT * FROM pvp_ranks WHERE user_id = ?', ['score-user-a']);
  const loserRank = await dbGet('SELECT * FROM pvp_ranks WHERE user_id = ?', ['score-user-b']);
  assert.equal(winnerRank.wins, 8, 'live settlement should preserve and increment the legacy winner record');
  assert.equal(loserRank.losses, 6, 'live settlement should preserve and increment the legacy loser record');
  assert.ok(winnerRank.score > 1500, 'legacy winner rating should continue from its pre-rollout score');
  assert.ok(loserRank.score < 1400, 'legacy loser rating should continue from its pre-rollout score');
  const winnerSeasonRank = await dbGet('SELECT * FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?', ['s1-genesis', 'score-user-a']);
  const loserSeasonRank = await dbGet('SELECT * FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?', ['s1-genesis', 'score-user-b']);
  assert.equal(winnerSeasonRank.score, 1016, 'official season rating should start from a clean 1000 baseline');
  assert.equal(loserSeasonRank.score, 984, 'official season loser rating should stay isolated from legacy score');
  assert.equal(winnerSeasonRank.wins, 1, 'official season wins should start from zero');
  assert.equal(loserSeasonRank.losses, 1, 'official season losses should start from zero');
  const progressionRows = await new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DB_PATH);
    database.all(
      `SELECT user_id, event_type, activity_mode, trust_tier, source_ref, activity_completions, pvp_matches, pvp_wins
       FROM progression_events
       WHERE source_ref = ?
       ORDER BY user_id ASC`,
      [match.matchId],
      (error, rows) => {
        database.close();
        if (error) reject(error);
        else resolve(rows || []);
      },
    );
  });
  assert.equal(progressionRows.length, 2, 'ranked live settlement should append one trusted progression event per player');
  assert.ok(progressionRows.every(row => row.event_type === 'pvp_match_completed'), 'trusted progression event should use PVP completion type');
  assert.ok(progressionRows.every(row => row.activity_mode === 'pvp_live'), 'trusted progression event should use live PVP mode');
  assert.ok(progressionRows.every(row => row.trust_tier === 'server_authoritative'), 'live settlement progression should be server authoritative');
  assert.ok(progressionRows.every(row => row.activity_completions === 1 && row.pvp_matches === 1), 'live settlement should advance completion and match metrics');
  assert.deepEqual(progressionRows.map(row => row.pvp_wins).sort(), [0, 1], 'only the live winner should advance the trusted win metric');
  const replayResult = await settlement.settleMatch(match);
  assert.equal(replayResult.alreadySettled, true, 'direct settlement replay should use the existing settlement gate');
  const progressionCountAfterReplay = await dbGet(
    'SELECT COUNT(*) AS count FROM progression_events WHERE source_ref = ?',
    [match.matchId],
  );
  assert.equal(progressionCountAfterReplay.count, 2, 'trusted progression bridge should be idempotent on settlement replay');
  const { getStatus } = require('../server/progression/service');
  const winnerProgression = await getStatus('score-user-a');
  const trustedWeekly = winnerProgression.objectives.find(entry => entry.objectiveId === 'weekly_live_pvp_matches');
  assert.equal(trustedWeekly.current, 1, 'live settlement should project into the trusted weekly PVP objective');
  assert.equal(trustedWeekly.trustRequirement, 'server_authoritative', 'weekly live objective should preserve authoritative trust requirement');
  const trustedSeasonMatches = winnerProgression.objectives.find(entry => entry.objectiveId === 'season_live_pvp_matches');
  const trustedSeasonWins = winnerProgression.objectives.find(entry => entry.objectiveId === 'season_live_pvp_wins');
  assert.equal(trustedSeasonMatches.current, 1, 'live settlement should project into the authoritative season match objective');
  assert.equal(trustedSeasonWins.current, 1, 'only the live winner should advance the authoritative season win objective');
}

async function assertBoundaryMatchUsesAuthoritativeStartTime() {
  const { makeSqliteLivePvpSettlement } = require('../server/pvp-live/live-settlement');
  const settlement = makeSqliteLivePvpSettlement();
  const matchStartedAt = SEASONS[0].endsAt - 1000;
  const settledAt = SEASONS[0].endsAt + SETTLEMENT_FINALIZATION_DELAY_MS + 1000;
  const originalNow = Date.now;
  Date.now = () => settledAt;
  try {
    await dbRun(
      `INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
       VALUES ('boundary-user-a', 'boundary_user_a', 'test-hash', ?),
              ('boundary-user-b', 'boundary_user_b', 'test-hash', ?)`,
      [matchStartedAt, matchStartedAt],
    );
    const match = {
      matchId: 'season-boundary-direct-settlement',
      mode: 'ranked',
      createdAt: matchStartedAt,
      state: {
        status: 'finished',
        mode: 'ranked',
        setup: { battleStartedAt: matchStartedAt },
        seats: {
          A: { seatId: 'A', userId: 'boundary-user-a', displayName: '边界甲' },
          B: { seatId: 'B', userId: 'boundary-user-b', displayName: '边界乙' },
        },
        events: [{
          eventType: 'match_finished',
          payload: { winnerSeat: 'A', loserSeat: 'B', finishReason: 'round14_score' },
        }],
      },
    };
    const result = await settlement.settleMatch(match);
    assert.equal(result.settled, true, 'a match started before season end should still settle after the minimum finalization delay when no snapshot exists');
    const settlementRow = await dbGet(
      'SELECT match_started_at, created_at FROM pvp_live_match_settlements WHERE match_id = ?',
      [match.matchId],
    );
    assert.equal(Number(settlementRow.match_started_at), matchStartedAt, 'settlement gate should preserve authoritative match start');
    assert.equal(Number(settlementRow.created_at), settledAt, 'settlement gate should separately preserve completion time');
    const ladderRow = await dbGet(
      'SELECT score, ranked_games, last_match_id FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, 'boundary-user-a'],
    );
    assert.equal(ladderRow.last_match_id, match.matchId, 'boundary match should remain in the season where it started');
    assert.equal(Number(ladderRow.ranked_games), 1);
    const progressionRow = await dbGet(
      'SELECT occurred_at, received_at FROM progression_events WHERE user_id = ? AND source_ref = ?',
      ['boundary-user-a', match.matchId],
    );
    assert.equal(Number(progressionRow.occurred_at), matchStartedAt, 'season objective event should use match start time');
    assert.equal(Number(progressionRow.received_at), settledAt, 'season objective event should retain settlement receipt time');

    await dbRun(
      `INSERT OR IGNORE INTO users (id, username, password_hash, created_at)
       VALUES ('post-boundary-user-a', 'post_boundary_user_a', 'test-hash', ?),
              ('post-boundary-user-b', 'post_boundary_user_b', 'test-hash', ?)`,
      [matchStartedAt, matchStartedAt],
    );
    const postBoundaryMatch = {
      matchId: 'season-post-boundary-direct-settlement',
      mode: 'ranked',
      createdAt: matchStartedAt,
      state: {
        status: 'finished',
        mode: 'ranked',
        setup: { battleStartedAt: SEASONS[0].endsAt + 1 },
        seats: {
          A: { seatId: 'A', userId: 'post-boundary-user-a', displayName: '跨季甲' },
          B: { seatId: 'B', userId: 'post-boundary-user-b', displayName: '跨季乙' },
        },
        events: [{
          eventType: 'match_finished',
          payload: { winnerSeat: 'A', loserSeat: 'B', finishReason: 'round14_score' },
        }],
      },
    };
    const postBoundaryResult = await settlement.settleMatch(postBoundaryMatch);
    assert.equal(postBoundaryResult.settled, true, 'legacy settlement may complete after a setup crosses the season boundary');
    const postBoundaryLadder = await dbGet(
      'SELECT score FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      [SEASONS[0].seasonId, 'post-boundary-user-a'],
    );
    assert.equal(postBoundaryLadder, null, 'a room created before season end must not enter the old season when battle starts after the boundary');
    const postBoundarySettlement = await dbGet(
      'SELECT match_started_at FROM pvp_live_match_settlements WHERE match_id = ?',
      [postBoundaryMatch.matchId],
    );
    assert.equal(Number(postBoundarySettlement.match_started_at), SEASONS[0].endsAt + 1, 'battleStartedAt must override room creation for season membership');
  } finally {
    Date.now = originalNow;
  }
}

function startServer() {
  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_DB_PATH: DB_PATH,
      PVP_LIVE_TURN_TIMEOUT_MS: '1000',
      PVP_LIVE_LONG_WAIT_THRESHOLD_MS: '1000',
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

async function request(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (error) {
    payload = { raw: text };
  }
  return { status: response.status, ok: response.ok, payload };
}

async function waitForHealth(server) {
  const deadline = Date.now() + 10000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const health = await request('/health');
      if (health.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`backend health check timed out: ${lastError && lastError.message}\n${server.getOutput()}`);
}

async function withServer(fn) {
  const server = startServer();
  try {
    await waitForHealth(server);
    return await fn();
  } catch (error) {
    error.message = `${error.message}\nServer output:\n${server.getOutput()}`;
    throw error;
  } finally {
    await stopServer(server);
  }
}

async function registerUser(prefix) {
  const username = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const response = await request('/api/auth/register', {
    method: 'POST',
    body: { username, password: 'pwd123' },
  });
  assert.equal(response.status, 200, `register should succeed: ${JSON.stringify(response.payload)}`);
  return {
    username,
    userId: response.payload.user.objectId,
    token: response.payload.user.sessionToken,
  };
}

async function submitIntent(matchId, token, body) {
  return request(`/api/pvp/live/matches/${encodeURIComponent(matchId)}/intents`, {
    method: 'POST',
    token,
    body,
  });
}

async function readyBoth({ matchId, tokenA, tokenB, stateVersionA, prefix }) {
  const readyA = await submitIntent(matchId, tokenA, {
    intentId: `${prefix}-ready-a`,
    intentType: 'ready',
    stateVersion: stateVersionA,
    payload: {},
  });
  assert.equal(readyA.payload.result, 'accepted', `${prefix} first ready should be accepted`);
  const readyB = await submitIntent(matchId, tokenB, {
    intentId: `${prefix}-ready-b`,
    intentType: 'ready',
    stateVersion: readyA.payload.stateView.stateVersion,
    payload: {},
  });
  assert.equal(readyB.payload.result, 'accepted', `${prefix} second ready should be accepted`);
  assert.equal(readyB.payload.stateView.status, 'active', `${prefix} both ready should activate live match`);
  return readyB;
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.get(sql, params, (err, row) => {
      db.close();
      if (err) reject(err);
      else resolve(row || null);
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

(async () => {
  removeDbFiles();
  const { initDb } = require('../server/db/database');
  await initDb();
  await assertTransientSettlementFailureRetriesBeforeRelease();
  await assertRound14DrawSettlementNoRankedImpact();
  await assertRound14ScoreSettlementWritesRankedHistory();
  await assertBoundaryMatchUsesAuthoritativeStartTime();

  await withServer(async () => {
    const userA = await registerUser('live_settle_a');
    const userB = await registerUser('live_settle_b');

    const initialRankA = await request('/api/pvp/rank', { token: userA.token });
    const initialRankB = await request('/api/pvp/rank', { token: userB.token });
    assert.equal(initialRankA.payload.rank.score, 1000, 'winner should start from default PVP score');
    assert.equal(initialRankB.payload.rank.score, 1000, 'loser should start from default PVP score');
    const staleSeasonNow = Date.now() - 86400000;
    await dbRun(
      `INSERT INTO pvp_economy (user_id, economy_data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET economy_data = excluded.economy_data, updated_at = excluded.updated_at`,
      [userB.userId, JSON.stringify({
        version: 1,
        userId: userB.userId,
        coins: initialRankB.payload.wallet.coins,
        totalEarned: initialRankB.payload.wallet.totalEarned,
        totalSpent: 0,
        wins: 0,
        losses: 0,
        totalMatches: 0,
        winStreak: 0,
        lossStreak: 0,
        bestWinStreak: 0,
        purchases: {},
        ownedItems: {},
        seasonHonorCollection: {
          reportVersion: 'pvp-live-season-honor-collection-v1',
          seasonId: 's0-legacy-settlement',
          unlockedRewards: {
            s0_settlement_legacy_badge: {
              rewardId: 's0_settlement_legacy_badge',
              rewardType: 'cosmetic_badge',
              rewardName: '旧赛季结算徽记',
              targetGames: 1,
              unlockedAt: staleSeasonNow,
              rewardImpact: 'cosmetic_only',
              powerImpact: 'none'
            }
          }
        }
      }), staleSeasonNow]
    );

    const joinA = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userA.token,
      body: { displayName: userA.username },
    });
    assert.equal(joinA.payload.status, 'waiting', 'first settlement user should wait');
    await sleep(1050);

    const joinB = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userB.token,
      body: { displayName: userB.username },
    });
    assert.equal(joinB.payload.status, 'matched', 'second settlement user should match');

    const pollA = await request(`/api/pvp/live/queue/status/${encodeURIComponent(joinA.payload.queueTicket)}`, {
      token: userA.token,
    });
    assert.equal(pollA.payload.status, 'matched', 'first settlement user should receive match');

    const ready = await readyBoth({
      matchId: joinB.payload.matchId,
      tokenA: userA.token,
      tokenB: userB.token,
      stateVersionA: pollA.payload.stateView.stateVersion,
      prefix: 'settle-surrender'
    });

    const surrenderB = await submitIntent(joinB.payload.matchId, userB.token, {
        intentId: 'live-settlement-surrender-b-1',
        intentType: 'surrender',
        stateVersion: ready.payload.stateView.stateVersion,
        payload: {},
    });
    assert.equal(surrenderB.payload.result, 'accepted', 'live surrender should be accepted for settlement');
    assert.equal(surrenderB.payload.stateView.status, 'finished', 'live surrender should finish the match');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.reportVersion, 'pvp-live-settlement-report-v1', 'loser state view should expose settlement report after live settlement');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.result, 'loss', 'loser settlement report should be scoped to the viewer');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.oldScore, initialRankB.payload.rank.score, 'loser settlement report should expose old score');
    const loserSettlementReasons = surrenderB.payload.stateView.postMatchReview?.settlementReport?.reasonLines || [];
    assert.ok(loserSettlementReasons.some(reason => reason?.id === 'finish_type' && /认负|投降/.test(reason.line || '')), 'loser settlement report should explain the finish type in player-readable copy');
    assert.ok(loserSettlementReasons.some(reason => reason?.id === 'score_delta' && /正式积分|对手强度|服务端权威/.test(reason.line || '')), 'loser settlement report should explain why score changed');
    assert.ok(loserSettlementReasons.some(reason => reason?.id === 'reward_boundary' && /天道币|战斗数值|不改变/.test(reason.line || '')), 'loser settlement report should explain reward and non-power boundary');
    assert.ok(loserSettlementReasons.every(reason => reason?.usesHiddenInformation === false), 'settlement reason lines must not use hidden information');
    assert.doesNotMatch(JSON.stringify(loserSettlementReasons), /rating":|elo|opponentRating|expectedWinRate|ranked_authoritative|surrender_/i, 'settlement reasons must not expose hidden rating or raw settlement protocol values');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.reportVersion, 'pvp-live-season-honor-v1', 'loser settlement report should expose season honor progress');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.sourceVisibility, 'server_authoritative_settlement', 'season honor progress should come from authoritative settlement');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.powerImpact, 'none', 'season honor progress must not grant combat power');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.reportVersion, 'pvp-live-season-honor-reward-v1', 'season honor progress should expose cosmetic-only reward track');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.rewardImpact, 'cosmetic_only', 'season honor reward must be cosmetic only');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.powerImpact, 'none', 'season honor reward must not grant combat power');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.rewardState, 'earned', 'first ranked game should earn the first cosmetic honor marker');
    assert.ok(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.nextReward?.remainingGames > 0, 'season honor reward should point to the next cosmetic target');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionState, 'newly_unlocked', 'first ranked game should put the first cosmetic honor marker into the collection');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionReport?.reportVersion, 'pvp-live-season-honor-collection-v1', 'season honor reward should expose a collection report');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionReport?.powerImpact, 'none', 'season honor collection must not grant combat power');

    const rankAfterA = await request('/api/pvp/rank', { token: userA.token });
    const rankAfterB = await request('/api/pvp/rank', { token: userB.token });
    const loserRewardId = surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.rewardId;
    assert.equal(rankAfterA.payload.rank.wins, 1, 'server-authoritative live settlement should add winner rank win');
    assert.equal(rankAfterA.payload.rank.losses, 0, 'winner should not receive a loss');
    assert.equal(rankAfterB.payload.rank.wins, 0, 'loser should not receive a win');
    assert.equal(rankAfterB.payload.rank.losses, 1, 'server-authoritative live settlement should add loser rank loss');
    assert.ok(rankAfterA.payload.rank.score > initialRankA.payload.rank.score, 'winner score should increase after live settlement');
    assert.ok(rankAfterB.payload.rank.score < initialRankB.payload.rank.score, 'loser score should decrease after live settlement');
    assert.equal(rankAfterA.payload.wallet.totalMatches, 1, 'winner economy should count live match');
    assert.equal(rankAfterB.payload.wallet.totalMatches, 1, 'loser economy should count live match');
    assert.equal(rankAfterA.payload.wallet.wins, 1, 'winner wallet should count live win');
    assert.equal(rankAfterB.payload.wallet.losses, 1, 'loser wallet should count live loss');
    assert.ok(rankAfterA.payload.wallet.coins > initialRankA.payload.wallet.coins, 'winner should receive live match reward');
    assert.ok(rankAfterB.payload.wallet.coins > initialRankB.payload.wallet.coins, 'loser should receive participation reward');
    assert.ok(rankAfterA.payload.wallet.coins > rankAfterB.payload.wallet.coins, 'winner reward should exceed loser reward');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.scoreAfter, rankAfterB.payload.rank.score, 'loser settlement report should match authoritative rank score');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.coinsAwarded, rankAfterB.payload.wallet.coins - initialRankB.payload.wallet.coins, 'loser settlement report should match wallet reward delta');
    assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.gamesPlayed, rankAfterB.payload.rank.wins + rankAfterB.payload.rank.losses, 'season honor progress should match authoritative ranked games');
    assert.ok(/不改变生命、伤害、抽牌、灵力、起手或匹配/.test(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.boundary || ''), 'season honor progress should state the non-power boundary');
    assert.ok(/不授予卡牌、属性、资源、起手、匹配或战斗效果/.test(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.boundary || ''), 'season honor reward should state the cosmetic-only non-power boundary');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.reportVersion, 'pvp-live-season-honor-collection-v1', 'rank economy should persist season honor cosmetic collection');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.seasonId, 's1-genesis', 'live settlement should reset stale season honor collection before current reward grant');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.rewardImpact, 'cosmetic_only', 'season honor collection should stay cosmetic only');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.powerImpact, 'none', 'season honor collection should not grant combat power');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.unlockedRewards?.[loserRewardId]?.rewardId, loserRewardId, 'first honor cosmetic should be persisted by reward id');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.unlockedRewards?.s0_settlement_legacy_badge, undefined, 'live settlement should not carry stale season honor into current collection');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.unlockedRewards?.[loserRewardId]?.source, 'live_ranked', 'persisted honor cosmetic should come from live ranked settlement');
    assert.equal(rankAfterB.payload.economy?.seasonHonorCollection?.unlockedRewards?.[loserRewardId]?.powerImpact, 'none', 'persisted honor cosmetic should not grant combat power');
    assert.equal(rankAfterB.payload.economy?.ownedItems?.[loserRewardId], undefined, 'season honor cosmetic collection should not unlock shop-owned battle items');
    const loserSeasonStatus = await request('/api/pvp/live/season', { token: userB.token });
    assert.equal(loserSeasonStatus.status, 200, 'live season endpoint should return status after settlement');
    const loserClaimLedger = loserSeasonStatus.payload.userProgress?.claimLedger || [];
    assert.equal(loserClaimLedger.length, 1, 'season endpoint should expose one durable claim ledger entry after first ranked settlement');
    assert.equal(loserClaimLedger[0]?.reportVersion, 'pvp-live-season-claim-ledger-entry-v1', 'claim ledger entry should expose durable ledger entry version');
    assert.equal(loserClaimLedger[0]?.rewardId, loserRewardId, 'season endpoint claim ledger should include the earned reward id');
    assert.equal(loserClaimLedger[0]?.seasonId, 's1-genesis', 'claim ledger entry should stay scoped to the current season');
    assert.equal(loserClaimLedger[0]?.sourceMatchId, joinB.payload.matchId, 'claim ledger entry should trace the source live match');
    assert.equal(loserClaimLedger[0]?.claimSource, 'live_ranked_settlement', 'claim ledger entry should come from live ranked settlement');
    assert.equal(loserClaimLedger[0]?.rewardImpact, 'cosmetic_only', 'claim ledger entry should stay cosmetic only');
    assert.equal(loserClaimLedger[0]?.powerImpact, 'none', 'claim ledger entry should not grant combat power');
    assert.equal(loserSeasonStatus.payload.userProgress?.collection?.totalUnlocked, 1, 'season endpoint collection count should derive from durable claim ledger');
    assert.doesNotMatch(JSON.stringify(loserSeasonStatus.payload), /hand|deck|loadoutSnapshot|randomSeed|JWT_SECRET|DEFIER_HMAC_SECRET/i, 'season claim ledger must not leak hidden match state or secrets');
    const loserClaimRow = await dbGet(
      `SELECT user_id, season_id, reward_id, reward_type, target_games, claim_source, source_match_id
       FROM pvp_season_reward_claims
       WHERE user_id = ? AND season_id = ? AND reward_id = ?
       LIMIT 1`,
      [userB.userId, 's1-genesis', loserRewardId],
    );
    assert.equal(loserClaimRow?.claim_source, 'live_ranked_settlement', 'live settlement should write a durable season reward claim row');
    assert.equal(loserClaimRow?.source_match_id, joinB.payload.matchId, 'durable claim row should trace source match id');
    assert.equal(Number(loserClaimRow?.target_games), 1, 'durable claim row should persist reward target games');
    const legacyClaimRow = await dbGet(
      `SELECT user_id, season_id, reward_id, claim_source, source_match_id
       FROM pvp_season_reward_claims
       WHERE user_id = ? AND season_id = ? AND reward_id = ?
       LIMIT 1`,
      [userB.userId, 's0-legacy-settlement', 's0_settlement_legacy_badge'],
    );
    assert.equal(legacyClaimRow?.claim_source, 'legacy_economy_archive', 'live settlement should durably archive stale season honor claims inside settlement transaction');
    assert.equal(legacyClaimRow?.source_match_id, joinB.payload.matchId, 'live settlement stale archive should trace the settlement match id');
    const legacyArchiveRow = await dbGet(
      `SELECT season_id, total_unlocked, last_unlocked_reward_id, archive_source, source_match_id, reward_impact, power_impact
       FROM pvp_season_honor_archives
       WHERE user_id = ? AND season_id = ?
       LIMIT 1`,
      [userB.userId, 's0-legacy-settlement'],
    );
    assert.equal(Number(legacyArchiveRow?.total_unlocked), 1, 'live settlement should persist stale season archive count');
    assert.equal(legacyArchiveRow?.last_unlocked_reward_id, 's0_settlement_legacy_badge', 'live settlement should persist stale season last honor id');
    assert.equal(legacyArchiveRow?.archive_source, 'legacy_economy_archive', 'live settlement stale archive should preserve archive source');
    assert.equal(legacyArchiveRow?.source_match_id, joinB.payload.matchId, 'live settlement stale archive should trace source match id');
    assert.equal(legacyArchiveRow?.reward_impact, 'cosmetic_only', 'live settlement stale archive should remain cosmetic only');
    assert.equal(legacyArchiveRow?.power_impact, 'none', 'live settlement stale archive should not grant combat power');

    const duplicateSurrender = await submitIntent(joinB.payload.matchId, userB.token, {
        intentId: 'live-settlement-surrender-b-1',
        intentType: 'surrender',
        stateVersion: ready.payload.stateView.stateVersion,
        payload: {},
    });
    assert.equal(duplicateSurrender.payload.result, 'duplicate', 'duplicate live surrender should stay idempotent');

    const rankAfterDuplicateA = await request('/api/pvp/rank', { token: userA.token });
    const rankAfterDuplicateB = await request('/api/pvp/rank', { token: userB.token });
    assert.equal(rankAfterDuplicateA.payload.rank.score, rankAfterA.payload.rank.score, 'duplicate live settlement must not add winner score twice');
    assert.equal(rankAfterDuplicateB.payload.rank.score, rankAfterB.payload.rank.score, 'duplicate live settlement must not subtract loser score twice');
    assert.equal(rankAfterDuplicateA.payload.wallet.coins, rankAfterA.payload.wallet.coins, 'duplicate live settlement must not pay winner twice');
    assert.equal(rankAfterDuplicateB.payload.wallet.coins, rankAfterB.payload.wallet.coins, 'duplicate live settlement must not pay loser twice');
    assert.equal(Object.keys(rankAfterDuplicateB.payload.economy?.seasonHonorCollection?.unlockedRewards || {}).length, Object.keys(rankAfterB.payload.economy?.seasonHonorCollection?.unlockedRewards || {}).length, 'duplicate live settlement must not unlock honor cosmetics twice');
    assert.equal((rankAfterDuplicateB.payload.economy?.transactionLog || []).filter(entry => entry.type === 'live_season_honor_cosmetic' && entry.itemId === loserRewardId).length, 1, 'duplicate live settlement must not append duplicate honor cosmetic logs');
    const loserClaimRowCountAfterDuplicate = await dbGet(
      `SELECT COUNT(*) AS count
       FROM pvp_season_reward_claims
       WHERE user_id = ? AND season_id = ? AND reward_id = ?`,
      [userB.userId, 's1-genesis', loserRewardId],
    );
    assert.equal(Number(loserClaimRowCountAfterDuplicate?.count), 1, 'duplicate live settlement must not append duplicate durable claim rows');

    const settlementRow = await dbGet(
      'SELECT * FROM pvp_live_match_settlements WHERE match_id = ?',
      [joinB.payload.matchId],
    );
    assert.ok(settlementRow, 'pvp_live_match_settlements should record the live settlement gate');
    assert.equal(settlementRow.winner_user_id, userA.userId, 'settlement gate should persist winner user id');
    assert.equal(settlementRow.loser_user_id, userB.userId, 'settlement gate should persist loser user id');
    const authoritativeLadderA = await dbGet(
      'SELECT * FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      ['s1-genesis', userA.userId],
    );
    const authoritativeLadderB = await dbGet(
      'SELECT * FROM pvp_season_ladders WHERE season_id = ? AND user_id = ?',
      ['s1-genesis', userB.userId],
    );
    assert.equal(authoritativeLadderA?.score, rankAfterA.payload.rank.score, 'live winner settlement should project the authoritative season score in the same transaction');
    assert.equal(authoritativeLadderB?.score, rankAfterB.payload.rank.score, 'live loser settlement should project the authoritative season score in the same transaction');
    assert.equal(authoritativeLadderA?.last_match_id, joinB.payload.matchId, 'authoritative winner ladder should trace the settled live match');
    assert.equal(authoritativeLadderB?.last_match_id, joinB.payload.matchId, 'authoritative loser ladder should trace the settled live match');
    assert.equal(Number(authoritativeLadderA?.authoritative_participant), 1, 'live winner should become an authoritative season participant');
    assert.equal(Number(authoritativeLadderB?.authoritative_participant), 1, 'live loser should become an authoritative season participant');

    const seasonLeaderboard = await request('/api/season-ops/leaderboard?limit=10', { token: userA.token });
    assert.equal(seasonLeaderboard.status, 200, 'season ops leaderboard should expose the live authoritative projection');
    const winnerLeaderboardEntry = seasonLeaderboard.payload?.entries?.find(entry => entry.userName === userA.username);
    const loserLeaderboardEntry = seasonLeaderboard.payload?.entries?.find(entry => entry.userName === userB.username);
    assert.equal(winnerLeaderboardEntry?.score, rankAfterA.payload.rank.score, 'ranked live winner should appear with the projected authoritative score');
    assert.equal(loserLeaderboardEntry?.score, rankAfterB.payload.rank.score, 'ranked live loser should appear with the projected authoritative score');
    assert.ok(seasonLeaderboard.payload?.entries?.every(entry => entry.userId === undefined), 'public season leaderboard entries must not expose user ids');

    const historyCount = await dbGet(
      'SELECT COUNT(*) AS count FROM pvp_match_history WHERE ticket_id LIKE ?',
      [`live:${joinB.payload.matchId}:%`],
    );
    assert.equal(historyCount.count, 2, 'live settlement should append both player history rows exactly once');

    const friendlyRequestA = await request(`/api/pvp/live/matches/${encodeURIComponent(joinB.payload.matchId)}/rematch`, {
      method: 'POST',
      token: userA.token,
      body: { displayName: userA.username },
    });
    assert.equal(friendlyRequestA.status, 200, 'ranked winner should be able to request no-score friendly rematch');
    assert.equal(friendlyRequestA.payload.status, 'waiting_rematch', 'first no-score friendly rematch request should wait for opponent');
    assert.equal(friendlyRequestA.payload.friendlySeries?.rankedImpact, 'none', 'friendly rematch request should not imply ranked impact');

    const friendlyMatch = await request(`/api/pvp/live/matches/${encodeURIComponent(joinB.payload.matchId)}/rematch`, {
      method: 'POST',
      token: userB.token,
      body: { displayName: userB.username },
    });
    assert.equal(friendlyMatch.status, 200, 'ranked loser should be able to accept no-score friendly rematch');
    assert.equal(friendlyMatch.payload.status, 'matched', 'second no-score friendly rematch request should create a live match');
    assert.equal(friendlyMatch.payload.stateView.mode, 'friendly', 'friendly rematch should expose friendly mode in state view');
    assert.equal(friendlyMatch.payload.stateView.friendlySeries?.rankedImpact, 'none', 'friendly rematch state view should expose no ranked impact');
    assert.equal(friendlyMatch.payload.stateView.friendlySeries?.targetWins, 2, 'friendly rematch should declare Bo3 target wins');
    assert.deepEqual(friendlyMatch.payload.stateView.friendlySeries?.scoreBySourceSeat, { A: 1, B: 0 }, 'first friendly rematch should carry ranked source score into Bo3');
    assert.equal(friendlyMatch.payload.stateView.friendlySeries?.roundIndex, 2, 'first friendly rematch should be Bo3 round 2');
    assert.equal(friendlyMatch.payload.stateView.friendlySeries?.seriesStatus, 'ongoing', 'first friendly rematch should keep the Bo3 series ongoing');

    const friendlyReady = await readyBoth({
      matchId: friendlyMatch.payload.matchId,
      tokenA: userB.token,
      tokenB: userA.token,
      stateVersionA: friendlyMatch.payload.stateView.stateVersion,
      prefix: 'friendly-rematch'
    });
    const friendlySurrender = await submitIntent(friendlyMatch.payload.matchId, userA.token, {
      intentId: 'friendly-rematch-surrender-a-1',
      intentType: 'surrender',
      stateVersion: friendlyReady.payload.stateView.stateVersion,
      payload: {},
    });
    assert.equal(friendlySurrender.payload.result, 'accepted', 'friendly rematch surrender should finish normally');
    assert.equal(friendlySurrender.payload.stateView.status, 'finished', 'friendly rematch should reach finished state');
    assert.equal(friendlySurrender.payload.stateView.mode, 'friendly', 'finished friendly rematch should keep friendly mode');
    assert.equal(friendlySurrender.payload.stateView.postMatchReview?.friendlySeries?.rankedImpact, 'none', 'friendly rematch review should keep no ranked impact');
    assert.deepEqual(friendlySurrender.payload.stateView.postMatchReview?.friendlySeries?.scoreBySourceSeat, { A: 1, B: 1 }, 'finished first friendly round should update Bo3 score to 1-1');
    assert.equal(friendlySurrender.payload.stateView.postMatchReview?.friendlySeries?.seriesStatus, 'ongoing', '1-1 Bo3 score should keep the series open');
    assert.equal(friendlySurrender.payload.stateView.postMatchReview?.friendlySeries?.canRequestNextRound, true, '1-1 Bo3 score should allow the decider request');
    assert.ok(friendlySurrender.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'friendly_rematch'), 'unfinished Bo3 friendly review should expose the decider rematch action');
    assert.ok(friendlySurrender.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'queue_again'), 'finished friendly rematch review should still offer returning to real queue');

    const deciderRequestB = await request(`/api/pvp/live/matches/${encodeURIComponent(friendlyMatch.payload.matchId)}/rematch`, {
      method: 'POST',
      token: userB.token,
      body: { displayName: userB.username },
    });
    assert.equal(deciderRequestB.status, 200, 'friendly round winner should be able to request the Bo3 decider');
    assert.equal(deciderRequestB.payload.status, 'waiting_rematch', 'first Bo3 decider request should wait for opponent');
    assert.deepEqual(deciderRequestB.payload.friendlySeries?.scoreBySourceSeat, { A: 1, B: 1 }, 'Bo3 decider waiting report should carry the tied score');
    assert.equal(deciderRequestB.payload.friendlySeries?.roundIndex, 3, 'Bo3 decider waiting report should declare round 3');

    const deciderMatch = await request(`/api/pvp/live/matches/${encodeURIComponent(friendlyMatch.payload.matchId)}/rematch`, {
      method: 'POST',
      token: userA.token,
      body: { displayName: userA.username },
    });
    assert.equal(deciderMatch.status, 200, 'friendly round loser should be able to accept the Bo3 decider');
    assert.equal(deciderMatch.payload.status, 'matched', 'second Bo3 decider request should create a new friendly live match');
    assert.equal(deciderMatch.payload.stateView.mode, 'friendly', 'Bo3 decider should stay in friendly mode');
    assert.equal(deciderMatch.payload.stateView.friendlySeries?.sourceMatchId, friendlyMatch.payload.matchId, 'Bo3 decider should use the previous friendly match as source');
    assert.deepEqual(deciderMatch.payload.stateView.friendlySeries?.scoreBySourceSeat, { A: 1, B: 1 }, 'Bo3 decider setup should carry the tied score');
    assert.equal(deciderMatch.payload.stateView.friendlySeries?.roundIndex, 3, 'Bo3 decider setup should declare round 3');

    const deciderReady = await readyBoth({
      matchId: deciderMatch.payload.matchId,
      tokenA: userA.token,
      tokenB: userB.token,
      stateVersionA: deciderMatch.payload.stateView.stateVersion,
      prefix: 'friendly-rematch-decider'
    });
    const deciderSurrender = await submitIntent(deciderMatch.payload.matchId, userB.token, {
      intentId: 'friendly-rematch-decider-surrender-b-1',
      intentType: 'surrender',
      stateVersion: deciderReady.payload.stateView.stateVersion,
      payload: {},
    });
    assert.equal(deciderSurrender.payload.result, 'accepted', 'Bo3 decider surrender should finish normally');
    assert.equal(deciderSurrender.payload.stateView.status, 'finished', 'Bo3 decider should reach finished state');
    assert.deepEqual(deciderSurrender.payload.stateView.postMatchReview?.friendlySeries?.scoreBySourceSeat, { A: 2, B: 1 }, 'Bo3 decider should close the series at 2-1');
    assert.equal(deciderSurrender.payload.stateView.postMatchReview?.friendlySeries?.seriesStatus, 'complete', '2-win Bo3 score should complete the series');
    assert.equal(deciderSurrender.payload.stateView.postMatchReview?.friendlySeries?.winnerSourceSeat, 'A', 'Bo3 decider should expose the source-seat series winner');
    assert.equal(deciderSurrender.payload.stateView.postMatchReview?.friendlySeries?.canRequestNextRound, false, 'completed Bo3 should not allow another friendly rematch');
    assert.ok(!deciderSurrender.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'friendly_rematch'), 'completed Bo3 review should not expose another friendly rematch action');

    const rankAfterFriendlyA = await request('/api/pvp/rank', { token: userA.token });
    const rankAfterFriendlyB = await request('/api/pvp/rank', { token: userB.token });
    assert.equal(rankAfterFriendlyA.payload.rank.score, rankAfterA.payload.rank.score, 'friendly rematch must not change player A score');
    assert.equal(rankAfterFriendlyB.payload.rank.score, rankAfterB.payload.rank.score, 'friendly rematch must not change player B score');
    assert.equal(rankAfterFriendlyA.payload.wallet.totalMatches, rankAfterA.payload.wallet.totalMatches, 'friendly rematch must not count player A economy match');
    assert.equal(rankAfterFriendlyB.payload.wallet.totalMatches, rankAfterB.payload.wallet.totalMatches, 'friendly rematch must not count player B economy match');
    assert.equal(rankAfterFriendlyA.payload.wallet.coins, rankAfterA.payload.wallet.coins, 'friendly rematch must not pay player A coins');
    assert.equal(rankAfterFriendlyB.payload.wallet.coins, rankAfterB.payload.wallet.coins, 'friendly rematch must not pay player B coins');

    const friendlySettlementRow = await dbGet(
      'SELECT * FROM pvp_live_match_settlements WHERE match_id = ?',
      [friendlyMatch.payload.matchId],
    );
    assert.equal(friendlySettlementRow, null, 'friendly rematch should not write live settlement gate');
    const deciderSettlementRow = await dbGet(
      'SELECT * FROM pvp_live_match_settlements WHERE match_id = ?',
      [deciderMatch.payload.matchId],
    );
    assert.equal(deciderSettlementRow, null, 'Bo3 decider should not write live settlement gate');
    const friendlyHistoryCount = await dbGet(
      'SELECT COUNT(*) AS count FROM pvp_match_history WHERE ticket_id LIKE ?',
      [`live:${friendlyMatch.payload.matchId}:%`],
    );
    assert.equal(friendlyHistoryCount.count, 0, 'friendly rematch should not append live match history');
    const deciderHistoryCount = await dbGet(
      'SELECT COUNT(*) AS count FROM pvp_match_history WHERE ticket_id LIKE ?',
      [`live:${deciderMatch.payload.matchId}:%`],
    );
    assert.equal(deciderHistoryCount.count, 0, 'Bo3 decider should not append live match history');

    const inviteUserA = await registerUser('live_invite_settle_a');
    const inviteUserB = await registerUser('live_invite_settle_b');
    const inviteInitialRankA = await request('/api/pvp/rank', { token: inviteUserA.token });
    const inviteInitialRankB = await request('/api/pvp/rank', { token: inviteUserB.token });
    const inviteCreate = await request('/api/pvp/live/invites', {
      method: 'POST',
      token: inviteUserA.token,
      body: { displayName: inviteUserA.username },
    });
    assert.equal(inviteCreate.status, 200, 'private invite settlement creator should receive 200');
    assert.equal(inviteCreate.payload.status, 'waiting_invite', 'private invite settlement creator should wait for invited opponent');
    assert.ok(inviteCreate.payload.inviteCode, 'private invite settlement creator should receive an invite code');

    const inviteJoin = await request(`/api/pvp/live/invites/${encodeURIComponent(inviteCreate.payload.inviteCode)}/join`, {
      method: 'POST',
      token: inviteUserB.token,
      body: { displayName: inviteUserB.username },
    });
    assert.equal(inviteJoin.status, 200, 'private invite settlement opponent should join the invite');
    assert.equal(inviteJoin.payload.status, 'matched', 'private invite settlement join should create a match');
    assert.equal(inviteJoin.payload.stateView.mode, 'friendly', 'private invite settlement match should be friendly mode');
    assert.equal(inviteJoin.payload.stateView.matchQuality?.expansionStage, 'friend_invite', 'private invite settlement match should expose friend invite quality stage');

    const inviteReady = await readyBoth({
      matchId: inviteJoin.payload.matchId,
      tokenA: inviteUserA.token,
      tokenB: inviteUserB.token,
      stateVersionA: inviteJoin.payload.stateView.stateVersion,
      prefix: 'private-invite-settlement',
    });
    const inviteSurrender = await submitIntent(inviteJoin.payload.matchId, inviteUserB.token, {
      intentId: 'private-invite-settlement-surrender-b-1',
      intentType: 'surrender',
      stateVersion: inviteReady.payload.stateView.stateVersion,
      payload: {},
    });
    assert.equal(inviteSurrender.payload.result, 'accepted', 'private invite friendly surrender should finish normally');
    assert.equal(inviteSurrender.payload.stateView.status, 'finished', 'private invite friendly should reach finished state');
    assert.equal(inviteSurrender.payload.stateView.mode, 'friendly', 'finished private invite should remain friendly mode');

    const inviteRankAfterA = await request('/api/pvp/rank', { token: inviteUserA.token });
    const inviteRankAfterB = await request('/api/pvp/rank', { token: inviteUserB.token });
    assert.equal(inviteRankAfterA.payload.rank.score, inviteInitialRankA.payload.rank.score, 'private invite friendly match must not change invite player A score');
    assert.equal(inviteRankAfterB.payload.rank.score, inviteInitialRankB.payload.rank.score, 'private invite friendly match must not change invite player B score');
    assert.equal(inviteRankAfterA.payload.rank.wins, inviteInitialRankA.payload.rank.wins, 'private invite friendly match must not add invite player A rank win');
    assert.equal(inviteRankAfterB.payload.rank.losses, inviteInitialRankB.payload.rank.losses, 'private invite friendly match must not add invite player B rank loss');
    assert.equal(inviteRankAfterA.payload.wallet.totalMatches, inviteInitialRankA.payload.wallet.totalMatches, 'private invite friendly match must not count invite player A economy match');
    assert.equal(inviteRankAfterB.payload.wallet.totalMatches, inviteInitialRankB.payload.wallet.totalMatches, 'private invite friendly match must not count invite player B economy match');
    assert.equal(inviteRankAfterA.payload.wallet.coins, inviteInitialRankA.payload.wallet.coins, 'private invite friendly match must not pay invite player A coins');
    assert.equal(inviteRankAfterB.payload.wallet.coins, inviteInitialRankB.payload.wallet.coins, 'private invite friendly match must not pay invite player B coins');

    const inviteSettlementRow = await dbGet(
      'SELECT * FROM pvp_live_match_settlements WHERE match_id = ?',
      [inviteJoin.payload.matchId],
    );
    assert.equal(inviteSettlementRow, null, 'private invite friendly should not write live settlement gate');
    const inviteHistoryCount = await dbGet(
      'SELECT COUNT(*) AS count FROM pvp_match_history WHERE ticket_id LIKE ?',
      [`live:${inviteJoin.payload.matchId}:%`],
    );
    assert.equal(inviteHistoryCount.count, 0, 'private invite friendly should not append live match history');

    const userC = await registerUser('live_timeout_loser');
    const userD = await registerUser('live_timeout_winner');
    const initialRankC = await request('/api/pvp/rank', { token: userC.token });
    const initialRankD = await request('/api/pvp/rank', { token: userD.token });

    const joinC = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userC.token,
      body: { displayName: userC.username },
    });
    assert.equal(joinC.payload.status, 'waiting', 'first timeout settlement user should wait');
    await sleep(1050);

    const joinD = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userD.token,
      body: { displayName: userD.username },
    });
    assert.equal(joinD.payload.status, 'matched', 'second timeout settlement user should match');

    const readyTimeout = await readyBoth({
      matchId: joinD.payload.matchId,
      tokenA: userC.token,
      tokenB: userD.token,
      stateVersionA: joinD.payload.stateView.stateVersion,
      prefix: 'settle-timeout'
    });
    const timeoutLoserUser = readyTimeout.payload.stateView.currentSeat === 'A' ? userC : userD;
    const timeoutWinnerUser = timeoutLoserUser === userC ? userD : userC;
    const initialRankByUserId = {
      [userC.userId]: initialRankC,
      [userD.userId]: initialRankD,
    };

    await sleep(2150);
    const timeoutReadC = await request('/api/pvp/live/matches/current', {
      token: userC.token,
    });
    assert.equal(timeoutReadC.status, 200, 'timeout read should return finished state after settlement');
    assert.equal(timeoutReadC.payload.stateView.status, 'finished', 'timeout should finish the live match');
    assert.ok(
      timeoutReadC.payload.stateView.recentEvents.some(event => event.eventType === 'match_finished' && eventPublicData(event).finishReason === 'timeout'),
      'timeout finish should expose match_finished timeout event',
    );

    const rankAfterTimeoutC = await request('/api/pvp/rank', { token: userC.token });
    const rankAfterTimeoutD = await request('/api/pvp/rank', { token: userD.token });
    const rankAfterTimeoutByUserId = {
      [userC.userId]: rankAfterTimeoutC,
      [userD.userId]: rankAfterTimeoutD,
    };
    const timeoutLoserRank = rankAfterTimeoutByUserId[timeoutLoserUser.userId];
    const timeoutWinnerRank = rankAfterTimeoutByUserId[timeoutWinnerUser.userId];
    const timeoutLoserInitialRank = initialRankByUserId[timeoutLoserUser.userId];
    const timeoutWinnerInitialRank = initialRankByUserId[timeoutWinnerUser.userId];
    assert.equal(timeoutLoserRank.payload.rank.losses, 1, 'timeout loser should receive authoritative live rank loss');
    assert.equal(timeoutWinnerRank.payload.rank.wins, 1, 'timeout winner should receive authoritative live rank win');
    assert.ok(timeoutLoserRank.payload.rank.score < timeoutLoserInitialRank.payload.rank.score, 'timeout loser score should decrease');
    assert.ok(timeoutWinnerRank.payload.rank.score > timeoutWinnerInitialRank.payload.rank.score, 'timeout winner score should increase');
    assert.equal(timeoutLoserRank.payload.wallet.totalMatches, 1, 'timeout loser economy should count live match');
    assert.equal(timeoutWinnerRank.payload.wallet.totalMatches, 1, 'timeout winner economy should count live match');
    assert.ok(timeoutWinnerRank.payload.wallet.coins > timeoutWinnerInitialRank.payload.wallet.coins, 'timeout winner should receive live settlement reward');

    const timeoutSettlementRow = await dbGet(
      'SELECT * FROM pvp_live_match_settlements WHERE match_id = ?',
      [joinD.payload.matchId],
    );
    assert.ok(timeoutSettlementRow, 'timeout live settlement should write the settlement gate');
    assert.equal(timeoutSettlementRow.winner_user_id, timeoutWinnerUser.userId, 'timeout settlement gate should persist winner user id');
    assert.equal(timeoutSettlementRow.loser_user_id, timeoutLoserUser.userId, 'timeout settlement gate should persist loser user id');
    assert.equal(timeoutSettlementRow.finish_reason, 'timeout', 'timeout settlement gate should persist timeout finish reason');

    const userE = await registerUser('live_setup_timeout_a');
    const userF = await registerUser('live_setup_timeout_b');
    const initialRankE = await request('/api/pvp/rank', { token: userE.token });
    const initialRankF = await request('/api/pvp/rank', { token: userF.token });
    const joinE = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userE.token,
      body: { displayName: userE.username },
    });
    assert.equal(joinE.payload.status, 'waiting', 'first setup timeout settlement user should wait');
    await sleep(1050);

    const joinF = await request('/api/pvp/live/queue/join', {
      method: 'POST',
      token: userF.token,
      body: { displayName: userF.username },
    });
    assert.equal(joinF.payload.status, 'matched', 'second setup timeout settlement user should match');

    await sleep(1150);
    const setupTimeoutReadE = await request('/api/pvp/live/matches/current', {
      token: userE.token,
    });
    assert.equal(setupTimeoutReadE.status, 200, 'setup timeout read should return invalidated state before release');
    assert.equal(setupTimeoutReadE.payload.stateView.status, 'invalidated', 'setup timeout should invalidate before active battle starts');
    assert.ok(
      setupTimeoutReadE.payload.stateView.recentEvents.some(event => event.eventType === 'match_invalidated' && eventPublicData(event).reason === 'ready_timeout'),
      'setup timeout should expose match_invalidated ready_timeout event',
    );

    const rankAfterSetupTimeoutE = await request('/api/pvp/rank', { token: userE.token });
    const rankAfterSetupTimeoutF = await request('/api/pvp/rank', { token: userF.token });
    assert.equal(rankAfterSetupTimeoutE.payload.rank.score, initialRankE.payload.rank.score, 'setup timeout should not change player A score');
    assert.equal(rankAfterSetupTimeoutF.payload.rank.score, initialRankF.payload.rank.score, 'setup timeout should not change player B score');
    assert.equal(rankAfterSetupTimeoutE.payload.rank.wins, 0, 'setup timeout should not add player A win');
    assert.equal(rankAfterSetupTimeoutF.payload.rank.losses, 0, 'setup timeout should not add player B loss');
    assert.equal(rankAfterSetupTimeoutE.payload.wallet.totalMatches, 0, 'setup timeout should not count player A economy match');
    assert.equal(rankAfterSetupTimeoutF.payload.wallet.totalMatches, 0, 'setup timeout should not count player B economy match');

    const setupTimeoutSettlementRow = await dbGet(
      'SELECT * FROM pvp_live_match_settlements WHERE match_id = ?',
      [joinF.payload.matchId],
    );
    assert.equal(setupTimeoutSettlementRow, null, 'setup timeout invalidated match should not write settlement gate');
    const setupTimeoutHistoryCount = await dbGet(
      'SELECT COUNT(*) AS count FROM pvp_match_history WHERE ticket_id LIKE ?',
      [`live:${joinF.payload.matchId}:%`],
    );
    assert.equal(setupTimeoutHistoryCount.count, 0, 'setup timeout invalidated match should not append live match history');
  });

  console.log('sanity_pvp_live_settlement_checks passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
