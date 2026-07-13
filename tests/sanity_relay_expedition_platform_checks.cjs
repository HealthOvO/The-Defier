const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.RELAY_EXPEDITION_PLATFORM_TEST_PORT || 9067);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = process.env.RELAY_EXPEDITION_PLATFORM_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-relay-expedition-platform-${process.pid}.sqlite`);
const JWT_SECRET = 'relay-expedition-platform-jwt-secret-32chars';
const HMAC_SECRET = 'relay-expedition-platform-hmac-secret-32chars';
const SEED_SECRET = 'relay-expedition-platform-seed-secret-32chars';

process.env.DEFIER_DB_PATH = DB_PATH;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DEFIER_HMAC_SECRET = HMAC_SECRET;
process.env.DEFIER_INTEGRITY_REQUIRED = '1';
process.env.DEFIER_WORLD_RIFT_SEED_SECRET = SEED_SECRET;
process.env.DEFIER_RELAY_EXPEDITION_SEED_SECRET = SEED_SECRET;

function resolveSqlite3() {
  for (const candidate of [
    'sqlite3',
    path.join(ROOT, 'node_modules', 'sqlite3'),
    path.join(ROOT, 'server', 'node_modules', 'sqlite3'),
    path.resolve(ROOT, '..', 'The-Defier', 'node_modules', 'sqlite3'),
    path.resolve(ROOT, '..', 'The-Defier', 'server', 'node_modules', 'sqlite3')
  ]) {
    try {
      return require(candidate).verbose();
    } catch (error) {}
  }
  throw new Error('sqlite3 module is not available in this worktree');
}

const sqlite3 = resolveSqlite3();

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function openDb() {
  const db = new sqlite3.Database(DB_PATH);
  db.configure('busyTimeout', 5000);
  return db;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = openDb();
    db.run(sql, params, function onRun(error) {
      const result = { changes: Number(this && this.changes || 0) };
      db.close();
      if (error) reject(error);
      else resolve(result);
    });
  });
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
      DEFIER_WORLD_RIFT_SEED_SECRET: SEED_SECRET,
      DEFIER_RELAY_EXPEDITION_SEED_SECRET: SEED_SECRET,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: `relay-expedition-platform-${process.pid}`
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
      throw new Error(`relay expedition backend exited early\n${server.getOutput()}`);
    }
    try {
      const health = await request('/api/health');
      if (health.status === 200 && health.payload?.status === 'ok') return;
    } catch (error) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`relay expedition health timeout\n${server.getOutput()}`);
}

async function expectError(fn, reason, statusCode = null) {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert(caught, `expected error ${reason}`);
  assert.strictEqual(caught.reason, reason, caught.message);
  if (statusCode !== null) assert.strictEqual(Number(caught.statusCode), statusCode, caught.message);
  return caught;
}

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(4, '0')}`;
}

function summaryFor(result, overrides = {}) {
  const base = {
    result,
    reason: result === 'completed'
      ? 'boss_defeated'
      : result === 'defeated'
        ? 'hp_depleted'
        : result === 'abandoned'
          ? 'player_abandoned'
          : result === 'expired'
            ? 'relay_active_lease_expired'
            : result,
    score: result === 'completed' ? 680 : 0,
    grade: result === 'completed' ? 'S' : '未完成',
    scenarioId: 'vanguard',
    encountersWon: result === 'completed' ? 3 : result === 'skipped' ? 0 : 1,
    bossWins: result === 'completed' ? 1 : 0,
    turns: result === 'completed' ? 17 : 9,
    cardsPlayed: result === 'completed' ? 24 : 7,
    damageDealt: result === 'completed' ? 88 : 24,
    damageTaken: result === 'completed' ? 12 : 40,
    remainingHp: result === 'completed' ? 29 : 0,
    maxHp: 40
  };
  return { ...base, ...overrides };
}

async function seedUsers(userTags, now) {
  for (const tag of userTags) {
    await dbRun(
      `INSERT INTO users
          (id, username, password_hash, created_at, global_updated_at, username_normalized, auth_version, password_changed_at, disabled_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0)`,
      [`user-${tag}`, `relay_${tag}`, `hash-${tag}`, now, now, `relay_${tag}`]
    );
  }
}

async function getRotationIds(now) {
  const relay = await dbGet(
    `SELECT rotation_id FROM relay_expedition_rotations WHERE starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC LIMIT 1`,
    [now, now]
  );
  const rift = await dbGet(
    `SELECT rotation_id FROM world_rift_rotations WHERE starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC LIMIT 1`,
    [now, now]
  );
  assert(relay?.rotation_id, 'relay rotation must exist');
  assert(rift?.rotation_id, 'world-rift rotation must exist');
  return { relayRotationId: relay.rotation_id, worldRiftRotationId: rift.rotation_id };
}

async function seedSquad({ squadId, rotationId, members, now }) {
  await dbRun(
    `INSERT INTO world_rift_squads
        (squad_id, rotation_id, leader_user_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
    [squadId, rotationId, members[0].userId, now, now]
  );
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    await dbRun(
      `INSERT INTO world_rift_squad_members
          (squad_id, user_id, rotation_id, status, role, joined_at, left_at, locked_at,
           display_name_snapshot, profile_id_snapshot, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?, 0, 0, ?, ?, ?)`,
      [
        squadId,
        member.userId,
        rotationId,
        index === 0 ? 'leader' : 'member',
        now + index,
        member.displayName,
        member.profileId,
        now + index
      ]
    );
  }
}

async function seedSupportRows(userId, riftRotationId, now) {
  await dbRun(
    `INSERT INTO pvp_ranks
        (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [`rank-${userId}`, userId, userId, 1200, 9, 3, 1, 'gold', 's1', now, now]
  );
  await dbRun(
    `INSERT OR IGNORE INTO world_rift_entries
        (rotation_id, user_id, entry_id, ranked_contribution, best_contribution, ranked_remaining_hp,
         ranked_turns, total_contribution, completed_attempts, updated_at)
     VALUES (?, ?, ?, 110, 110, 24, 9, 110, 1, ?)`,
    [riftRotationId, userId, `entry-${userId}`, now]
  );
}

async function seedCompletedRelaySession({ sessionId, rotationId, userId, startedAt }) {
  const route = Array.from({ length: 4 }, (_, index) => ({
    legIndex: index + 1,
    outcome: 'completed',
    status: 'projected',
    tacticId: 'vanguard',
    routeScore: 1275,
    projectedAt: startedAt + index + 1
  }));
  const routeJson = JSON.stringify(route);
  await dbRun(
    `INSERT INTO relay_expedition_sessions
        (session_id, rotation_id, source_squad_id, source_rotation_id, leader_user_id, client_session_id,
         status, current_leg_index, active_leg_id, route_score, successful_legs, processed_legs,
         projected_legs, participant_count, route_json, route_hash, state_version, started_at,
         completed_at, terminal_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'completed', 5, '', 5100, 4, 4, 4, 1, ?, ?, 4, ?, ?, ?, ?)`,
    [
      sessionId,
      rotationId,
      `source-${sessionId}`,
      `source-rotation-${rotationId}`,
      userId,
      `client-${sessionId}`,
      routeJson,
      crypto.createHash('sha256').update(routeJson).digest('hex'),
      startedAt,
      startedAt + 10,
      startedAt + 10,
      startedAt + 10
    ]
  );
  await dbRun(
    `INSERT INTO relay_expedition_members
        (session_id, rotation_id, user_id, profile_id_snapshot, display_name_snapshot, seat, role,
         status, claimed_legs, projected_legs, last_leg_index, locked_at, updated_at)
     VALUES (?, ?, ?, 'profile-history', '历史成员', 0, 'leader', 'active', 2, 1, 1, ?, ?)`,
    [sessionId, rotationId, userId, startedAt, startedAt]
  );
  for (let legIndex = 1; legIndex <= 4; legIndex += 1) {
    await dbRun(
      `INSERT INTO relay_expedition_legs
          (leg_id, session_id, rotation_id, leg_index, priority_user_id, runner_user_id,
           tactic_id, status, outcome, authoritative_summary_json, route_score,
           handoff_options_json, queued_at, priority_until, open_claim_until,
           settled_at, projected_at, terminal_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'vanguard', 'projected', 'completed', '{}', 1275,
               '[]', ?, ?, ?, ?, ?, ?, ?)`,
      [
        `leg-${sessionId}-${legIndex}`,
        sessionId,
        rotationId,
        legIndex,
        userId,
        legIndex === 1 ? userId : '',
        startedAt,
        startedAt + 1,
        startedAt + 2,
        startedAt + 3,
        startedAt + 3,
        startedAt + 3,
        startedAt + 3
      ]
    );
  }
}

async function snapshotFormalState(userId, riftRotationId) {
  return {
    pvp: await dbGet(
      `SELECT score, wins, losses FROM pvp_ranks WHERE user_id = ?`,
      [userId]
    ),
    riftState: await dbGet(
      `SELECT applied_damage, total_contribution, state_version FROM world_rift_states WHERE rotation_id = ?`,
      [riftRotationId]
    ),
    riftEntry: await dbGet(
      `SELECT ranked_contribution, total_contribution, completed_attempts
       FROM world_rift_entries
       WHERE rotation_id = ? AND user_id = ?`,
      [riftRotationId, userId]
    ),
    riftContributionCount: await dbGet(
      `SELECT COUNT(*) AS count FROM world_rift_contributions WHERE user_id = ? AND rotation_id = ?`,
      [userId, riftRotationId]
    )
  };
}

async function createSessionForSquad(service, rotationId, squadId, leaderUserId, suffix, now) {
  const response = await service.createRelayExpeditionSession(
    leaderUserId,
    {
      protocolVersion: service.PROTOCOL_VERSION,
      rotationId,
      sourceSquadId: squadId,
      clientSessionId: `relay-client-session-${suffix}`,
      mutationId: `relay-create-${suffix}`
    },
    now
  );
  assert.strictEqual(response.success, true, JSON.stringify(response));
  return response.session;
}

async function claimLeg(service, userId, sessionId, legIndex, tacticId, suffix, now) {
  const response = await service.claimRelayExpeditionLeg(
    userId,
    {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId,
      legIndex,
      tacticId,
      clientLegId: `relay-client-leg-${suffix}`,
      mutationId: `relay-claim-${suffix}`
    },
    now
  );
  assert.strictEqual(response.success, true, JSON.stringify(response));
  return response;
}

async function passBaton(service, userId, sessionId, legIndex, suffix, now) {
  const response = await service.passRelayExpeditionBaton(
    userId,
    {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId,
      legIndex,
      mutationId: `relay-pass-${suffix}`
    },
    now
  );
  assert.strictEqual(response.success, true, JSON.stringify(response));
  return response;
}

async function insertCompletedReceipt(runId, userId, summary, now) {
  const receiptId = `receipt-${runId}`;
  await dbRun(
    `UPDATE progression_authoritative_runs
     SET status = 'completed', completed_at = ?, updated_at = ?, state_json = ?
     WHERE run_id = ?`,
    [now, now, JSON.stringify({ phase: 'completed', summary }), runId]
  );
  await dbRun(
    `INSERT INTO progression_authoritative_run_receipts
        (receipt_id, run_id, user_id, mutation_id, activity_mode, event_id, receipt_json, state_hash, chain_head, created_at)
     VALUES (?, ?, ?, ?, 'relay_expedition', '', ?, ?, ?, ?)`,
    [
      receiptId,
      runId,
      userId,
      `settle-${runId}`,
      JSON.stringify({ success: true, receiptId, summary }),
      `state-${runId}`,
      `chain-${runId}`,
      now
    ]
  );
}

async function markRunTerminal(runId, status, summary, now) {
  await dbRun(
    `UPDATE progression_authoritative_runs
     SET status = ?, state_json = ?, abandoned_at = CASE WHEN ? = 'abandoned' THEN ? ELSE abandoned_at END,
         updated_at = ?
     WHERE run_id = ?`,
    [status, JSON.stringify({ phase: status, summary }), status, now, now, runId]
  );
}

async function projectLeg(service, userId, sessionId, legId, runId, suffix, now) {
  const response = await service.projectRelayExpeditionLeg(
    userId,
    legId,
    {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId,
      legId,
      runId,
      mutationId: `relay-project-${suffix}`
    },
    now
  );
  assert.strictEqual(response.success, true, JSON.stringify(response));
  return response;
}

function signRoutePayload(route, token, data) {
  const salt = `relay-sig-${crypto.randomBytes(8).toString('hex')}`;
  const signature = crypto.createHmac('sha256', token)
    .update('session-v2', 'utf8')
    .update(`\n${route}`, 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return { ...data, salt, signature, signatureMode: 'session-v2' };
}

function signLegacySessionPayload(token, data) {
  const salt = `relay-legacy-${crypto.randomBytes(8).toString('hex')}`;
  const signature = crypto.createHmac('sha256', token)
    .update('session-v1', 'utf8')
    .update('\n', 'utf8')
    .update(salt, 'utf8')
    .update('\n', 'utf8')
    .update(JSON.stringify(data), 'utf8')
    .digest('hex');
  return { ...data, salt, signature, signatureMode: 'session' };
}

async function signedRequest(pathname, { method = 'POST', token, data }) {
  const route = `${method} ${pathname}`;
  return request(pathname, {
    method,
    token,
    body: signRoutePayload(route, token, data)
  });
}

async function main() {
  removeDbFiles();

  const { initDb } = require('../server/db/database');
  const service = require('../server/relay-expedition/service');
  const { ACTIVE_LEASE_MS, buildRotationSnapshot } = require('../server/relay-expedition/catalog');
  const { generateToken } = require('../server/middleware/auth');

  await initDb();

  const baseNow = Date.now();
  const { relayRotationId, worldRiftRotationId } = await getRotationIds(baseNow);
  const allTags = [
    'solo',
    'duoA1', 'duoA2',
    'triA1', 'triA2', 'triA3',
    'quadA1', 'quadA2', 'quadA3', 'quadA4',
    'uniqueB1', 'uniqueB2',
    'flow1', 'flow2', 'flow3',
    'reward1', 'reward2',
    'comp1', 'comp2',
    'history1', 'history2'
  ];
  await seedUsers(allTags, baseNow);
  await seedSupportRows('user-reward1', worldRiftRotationId, baseNow);

  await seedSquad({
    squadId: 'squad-solo',
    rotationId: worldRiftRotationId,
    now: baseNow,
    members: [{ userId: 'user-solo', displayName: '独行者', profileId: 'profile-solo' }]
  });
  await seedSquad({
    squadId: 'squad-duo',
    rotationId: worldRiftRotationId,
    now: baseNow + 10,
    members: [
      { userId: 'user-duoA1', displayName: '双甲', profileId: 'profile-duoA1' },
      { userId: 'user-duoA2', displayName: '双乙', profileId: 'profile-duoA2' }
    ]
  });
  await seedSquad({
    squadId: 'squad-trio',
    rotationId: worldRiftRotationId,
    now: baseNow + 20,
    members: [
      { userId: 'user-triA1', displayName: '三甲', profileId: 'profile-triA1' },
      { userId: 'user-triA2', displayName: '三乙', profileId: 'profile-triA2' },
      { userId: 'user-triA3', displayName: '三丙', profileId: 'profile-triA3' }
    ]
  });
  await seedSquad({
    squadId: 'squad-quad',
    rotationId: worldRiftRotationId,
    now: baseNow + 30,
    members: [
      { userId: 'user-quadA1', displayName: '四甲', profileId: 'profile-quadA1' },
      { userId: 'user-quadA2', displayName: '四乙', profileId: 'profile-quadA2' },
      { userId: 'user-quadA3', displayName: '四丙', profileId: 'profile-quadA3' },
      { userId: 'user-quadA4', displayName: '四丁', profileId: 'profile-quadA4' }
    ]
  });
  await seedSquad({
    squadId: 'squad-unique-a',
    rotationId: worldRiftRotationId,
    now: baseNow + 40,
    members: [
      { userId: 'user-uniqueB1', displayName: '唯一甲', profileId: 'profile-uniqueB1' },
      { userId: 'user-uniqueB2', displayName: '唯一乙', profileId: 'profile-uniqueB2' }
    ]
  });
  await seedSquad({
    squadId: 'squad-unique-b',
    rotationId: worldRiftRotationId,
    now: baseNow + 50,
    members: [
      { userId: 'user-uniqueB1', displayName: '唯一甲', profileId: 'profile-uniqueB1' },
      { userId: 'user-triA3', displayName: '三丙', profileId: 'profile-triA3' }
    ]
  });
  await seedSquad({
    squadId: 'squad-flow',
    rotationId: worldRiftRotationId,
    now: baseNow + 60,
    members: [
      { userId: 'user-flow1', displayName: '流一', profileId: 'profile-flow1' },
      { userId: 'user-flow2', displayName: '流二', profileId: 'profile-flow2' },
      { userId: 'user-flow3', displayName: '流三', profileId: 'profile-flow3' }
    ]
  });
  await seedSquad({
    squadId: 'squad-reward',
    rotationId: worldRiftRotationId,
    now: baseNow + 70,
    members: [
      { userId: 'user-reward1', displayName: '奖甲', profileId: 'profile-reward1' },
      { userId: 'user-reward2', displayName: '奖乙', profileId: 'profile-reward2' }
    ]
  });
  await seedSquad({
    squadId: 'squad-compensation',
    rotationId: worldRiftRotationId,
    now: baseNow + 80,
    members: [
      { userId: 'user-comp1', displayName: '补偿甲', profileId: 'profile-comp1' },
      { userId: 'user-comp2', displayName: '补偿乙', profileId: 'profile-comp2' }
    ]
  });

  const relayRotations = await dbAll(`SELECT * FROM relay_expedition_rotations ORDER BY starts_at DESC`);
  const worldRiftRotations = await dbAll(`SELECT * FROM world_rift_rotations ORDER BY starts_at DESC`);
  assert(relayRotations.length >= 2, 'relay bootstrap must retain previous rotation');
  assert(worldRiftRotations.length >= 2, 'world-rift bootstrap must retain previous rotation');
  const previousRelayRotation = relayRotations[1];
  const previousWorldRiftRotation = worldRiftRotations[1];
  await seedSquad({
    squadId: 'squad-history',
    rotationId: previousWorldRiftRotation.rotation_id,
    now: Number(previousWorldRiftRotation.starts_at) + 80,
    members: [
      { userId: 'user-history1', displayName: '史甲', profileId: 'profile-history1' },
      { userId: 'user-history2', displayName: '史乙', profileId: 'profile-history2' }
    ]
  });

  const duoSession = await createSessionForSquad(service, relayRotationId, 'squad-duo', 'user-duoA1', 'duo', baseNow + 100);
  assert.strictEqual(duoSession.members.length, 2, '2-player squad should create relay session');
  const trioSession = await createSessionForSquad(service, relayRotationId, 'squad-trio', 'user-triA1', 'trio', baseNow + 110);
  assert.strictEqual(trioSession.members.length, 3, '3-player squad should create relay session');
  const quadSession = await createSessionForSquad(service, relayRotationId, 'squad-quad', 'user-quadA1', 'quad', baseNow + 120);
  assert.strictEqual(quadSession.members.length, 4, '4-player squad should create relay session');

  await expectError(
    () => service.createRelayExpeditionSession('user-solo', {
      protocolVersion: service.PROTOCOL_VERSION,
      rotationId: relayRotationId,
      sourceSquadId: 'squad-solo',
      clientSessionId: nextId('relay-client-session'),
      mutationId: nextId('relay-create')
    }, baseNow + 130),
    'relay_roster_size_invalid',
    409
  );
  await expectError(
    () => service.createRelayExpeditionSession('user-duoA2', {
      protocolVersion: service.PROTOCOL_VERSION,
      rotationId: relayRotationId,
      sourceSquadId: 'squad-duo',
      clientSessionId: nextId('relay-client-session'),
      mutationId: nextId('relay-create')
    }, baseNow + 131),
    'relay_leader_required',
    403
  );

  await createSessionForSquad(service, relayRotationId, 'squad-unique-a', 'user-uniqueB1', 'unique-a', baseNow + 140);
  await expectError(
    () => service.createRelayExpeditionSession('user-uniqueB1', {
      protocolVersion: service.PROTOCOL_VERSION,
      rotationId: relayRotationId,
      sourceSquadId: 'squad-unique-b',
      clientSessionId: nextId('relay-client-session'),
      mutationId: nextId('relay-create')
    }, baseNow + 141),
    'relay_member_already_committed',
    409
  );

  const createReplay = await service.createRelayExpeditionSession('user-reward1', {
    protocolVersion: service.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'squad-reward',
    clientSessionId: 'relay-client-session-reward-create',
    mutationId: 'relay-create-reward-idempotent'
  }, baseNow + 150);
  const createReplayAgain = await service.createRelayExpeditionSession('user-reward1', {
    protocolVersion: service.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'squad-reward',
    clientSessionId: 'relay-client-session-reward-create',
    mutationId: 'relay-create-reward-idempotent'
  }, baseNow + 150);
  assert.strictEqual(createReplayAgain.sessionId, createReplay.session.sessionId, 'same create mutation should replay');
  await expectError(
    () => service.createRelayExpeditionSession('user-reward1', {
      protocolVersion: service.PROTOCOL_VERSION,
      rotationId: relayRotationId,
      sourceSquadId: 'squad-reward',
      clientSessionId: 'relay-client-session-reward-other',
      mutationId: 'relay-create-reward-idempotent'
    }, baseNow + 150),
    'mutation_reused',
    409
  );

  await dbRun(
    `UPDATE world_rift_squad_members
     SET display_name_snapshot = '已漂移', profile_id_snapshot = 'profile-drifted'
     WHERE squad_id = 'squad-duo' AND user_id = 'user-duoA2'`
  );
  const duoAfterSourceDrift = await service.getCurrentRelayExpedition('user-duoA1', baseNow + 151);
  assert.strictEqual(
    duoAfterSourceDrift.session.members.find(member => member.profileId === 'profile-duoA2')?.displayName,
    '双乙',
    'relay member snapshot must not drift after session creation'
  );

  const flowSession = await createSessionForSquad(service, relayRotationId, 'squad-flow', 'user-flow1', 'flow', baseNow + 200);
  const flowSessionId = flowSession.sessionId;

  await expectError(
    () => service.claimRelayExpeditionLeg('user-flow2', {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId: flowSessionId,
      legIndex: 1,
      tacticId: 'vanguard',
      clientLegId: 'relay-client-leg-priority-reject',
      mutationId: 'relay-claim-priority-reject'
    }, baseNow + 200),
    'relay_priority_window_active',
    409
  );

  const passed = await passBaton(service, 'user-flow1', flowSessionId, 1, 'flow-pass', baseNow + 201);
  assert.strictEqual(passed.currentLeg.priorityMember.displayName, '流二', 'priority baton should move to next member');

  const currentLegAfterPass = passed.currentLeg;
  const openNow = currentLegAfterPass.priorityUntil + 1;
  const leg1Claim = await claimLeg(service, 'user-flow3', flowSessionId, 1, 'vanguard', 'flow-leg1', openNow);
  assert.strictEqual(leg1Claim.leg.legIndex, 1);

  const leg1Summary = summaryFor('completed', { scenarioId: 'vanguard', turns: 16, remainingHp: 31, maxHp: 40 });
  await insertCompletedReceipt(leg1Claim.authoritativeRun.runId, 'user-flow3', leg1Summary, openNow + 10);
  const flowAfterLeg1 = await projectLeg(
    service,
    'user-flow3',
    flowSessionId,
    leg1Claim.leg.legId,
    leg1Claim.authoritativeRun.runId,
    'flow-leg1',
    openNow + 11
  );
  assert.strictEqual(flowAfterLeg1.session.currentLegIndex, 2, 'completed leg must advance to leg 2');
  assert.deepStrictEqual(
    flowAfterLeg1.session.currentLeg.allowedTactics.map(t => t.tacticId),
    ['vanguard', 'insight'],
    'fast completed leg should unlock vanguard + insight'
  );

  const leg2OpenNow = flowAfterLeg1.session.currentLeg.priorityUntil + 1;
  await expectError(
    () => service.claimRelayExpeditionLeg('user-flow3', {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId: flowSessionId,
      legIndex: 2,
      tacticId: 'vanguard',
      clientLegId: 'relay-client-leg-consecutive-reject',
      mutationId: 'relay-claim-consecutive-reject'
    }, leg2OpenNow),
    'relay_member_not_eligible',
    409
  );
  const leg2Claim = await claimLeg(service, 'user-flow2', flowSessionId, 2, 'insight', 'flow-leg2', leg2OpenNow);
  const leg2Summary = summaryFor('defeated', { scenarioId: 'insight', encountersWon: 2 });
  await markRunTerminal(leg2Claim.authoritativeRun.runId, 'defeated', leg2Summary, leg2OpenNow + 10);
  const flowAfterLeg2 = await projectLeg(
    service,
    'user-flow2',
    flowSessionId,
    leg2Claim.leg.legId,
    leg2Claim.authoritativeRun.runId,
    'flow-leg2',
    leg2OpenNow + 11
  );
  assert.strictEqual(flowAfterLeg2.session.currentLegIndex, 3, 'defeated leg must still advance');
  assert.deepStrictEqual(
    flowAfterLeg2.session.currentLeg.allowedTactics.map(t => t.tacticId),
    ['bulwark', 'insight'],
    'defeated leg should unlock rescue tactics'
  );

  const leg3OpenNow = flowAfterLeg2.session.currentLeg.priorityUntil + 1;
  const leg3Claim = await claimLeg(service, 'user-flow3', flowSessionId, 3, 'bulwark', 'flow-leg3', leg3OpenNow);
  const leg3Summary = summaryFor('abandoned', { scenarioId: 'bulwark', encountersWon: 1 });
  await markRunTerminal(leg3Claim.authoritativeRun.runId, 'abandoned', leg3Summary, leg3OpenNow + 10);
  const flowAfterLeg3 = await projectLeg(
    service,
    'user-flow3',
    flowSessionId,
    leg3Claim.leg.legId,
    leg3Claim.authoritativeRun.runId,
    'flow-leg3',
    leg3OpenNow + 11
  );
  assert.strictEqual(flowAfterLeg3.session.currentLegIndex, 4, 'abandoned leg must still advance');

  const leg4OpenNow = flowAfterLeg3.session.currentLeg.priorityUntil + 1;
  await expectError(
    () => service.claimRelayExpeditionLeg('user-flow3', {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId: flowSessionId,
      legIndex: 4,
      tacticId: 'bulwark',
      clientLegId: 'relay-client-leg-max-two',
      mutationId: 'relay-claim-max-two'
    }, leg4OpenNow),
    'relay_member_not_eligible',
    409
  );

  const duoCurrentLeg = duoAfterSourceDrift.session.currentLeg;
  const duoClaim = await claimLeg(service, 'user-duoA1', duoSession.sessionId, 1, 'vanguard', 'duo-expire-leg1', duoCurrentLeg.priorityUntil - 1);
  const duoExpired = await service.getCurrentRelayExpedition('user-duoA1', duoClaim.leg.activeLeaseUntil + 1);
  assert.strictEqual(duoExpired.session.route[0].outcome, 'expired', 'active lease expiry should project expired');
  assert.strictEqual(duoExpired.session.currentLegIndex, 2, 'expired leg must advance');

  const quadSkipCurrent = quadSession.currentLeg;
  const quadSkipped = await service.getCurrentRelayExpedition('user-quadA1', quadSkipCurrent.openClaimUntil + 1);
  assert.strictEqual(quadSkipped.session.route[0].outcome, 'skipped', 'open-claim timeout should project skipped');
  assert.strictEqual(quadSkipped.session.currentLegIndex, 2, 'skipped leg must advance');

  const rewardSessionId = createReplay.session.sessionId;
  const rewardCurrent = createReplay.currentLeg;
  const rewardBefore = await snapshotFormalState('user-reward1', worldRiftRotationId);
  const rewardClaimLeg = await claimLeg(service, 'user-reward1', rewardSessionId, 1, 'vanguard', 'reward-leg1', rewardCurrent.priorityUntil - 1);
  const rewardSummary = summaryFor('completed', { scenarioId: 'vanguard', turns: 18, remainingHp: 27, maxHp: 40, score: 720 });
  await insertCompletedReceipt(rewardClaimLeg.authoritativeRun.runId, 'user-reward1', rewardSummary, baseNow + 350);
  const rewardProjected = await service.getCurrentRelayExpedition('user-reward1', baseNow + 351);
  assert.strictEqual(rewardProjected.session.route[0].outcome, 'completed', 'receipt recovery should auto-project completed leg');

  const rewardReceipt = await service.claimRelayExpeditionReward('user-reward1', 'relay-first-handoff', {
    protocolVersion: service.PROTOCOL_VERSION,
    sessionId: rewardSessionId,
    rotationId: relayRotationId,
    milestoneId: 'relay-first-handoff',
    mutationId: 'relay-reward-claim-0001'
  }, baseNow + 352);
  assert.strictEqual(rewardReceipt.success, true);
  assert.strictEqual(rewardReceipt.amount, 30);
  assert.strictEqual(rewardReceipt.currency, 'renown');
  assert.strictEqual(rewardReceipt.rewardImpact, 'cosmetic_only');
  assert.strictEqual(rewardReceipt.powerImpact, 'none');

  const rewardReplay = await service.claimRelayExpeditionReward('user-reward1', 'relay-first-handoff', {
    protocolVersion: service.PROTOCOL_VERSION,
    sessionId: rewardSessionId,
    rotationId: relayRotationId,
    milestoneId: 'relay-first-handoff',
    mutationId: 'relay-reward-claim-0001'
  }, baseNow + 353);
  assert.strictEqual(rewardReplay.idempotent, true, 'same reward mutation should replay');
  await expectError(
    () => service.claimRelayExpeditionReward('user-reward1', 'relay-route-complete', {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId: rewardSessionId,
      rotationId: relayRotationId,
      milestoneId: 'relay-route-complete',
      mutationId: 'relay-reward-claim-0001'
    }, baseNow + 353),
    'mutation_reused',
    409
  );

  const rewardBalance = await dbGet(
    `SELECT balance, lifetime_earned FROM progression_economy_balances WHERE user_id = ? AND currency = 'renown'`,
    ['user-reward1']
  );
  assert.deepStrictEqual(
    { balance: Number(rewardBalance?.balance), lifetime_earned: Number(rewardBalance?.lifetime_earned) },
    { balance: 30, lifetime_earned: 30 },
    'reward claim must update relay renown wallet'
  );
  const rewardLedger = await dbGet(
    `SELECT currency, delta, reason, source_type, reward_impact FROM progression_economy_ledger
     WHERE user_id = ? AND source_type = 'relay_expedition_reward'`,
    ['user-reward1']
  );
  assert.deepStrictEqual(
    rewardLedger,
    {
      currency: 'renown',
      delta: 30,
      reason: '接力初鸣',
      source_type: 'relay_expedition_reward',
      reward_impact: 'cosmetic_only'
    },
    'reward claim must append relay ledger entry'
  );
  const rewardClaimRow = await dbGet(
    `SELECT milestone_id, currency, amount, reward_impact, power_impact
     FROM relay_expedition_reward_claims
     WHERE user_id = ? AND session_id = ?`,
    ['user-reward1', rewardSessionId]
  );
  assert.deepStrictEqual(
    rewardClaimRow,
    {
      milestone_id: 'relay-first-handoff',
      currency: 'renown',
      amount: 30,
      reward_impact: 'cosmetic_only',
      power_impact: 'none'
    },
    'reward claim row must be persisted atomically with wallet update'
  );
  const rewardAfter = await snapshotFormalState('user-reward1', worldRiftRotationId);
  assert.deepStrictEqual(rewardAfter.pvp, rewardBefore.pvp, 'relay reward must not mutate pvp ranks');
  assert.deepStrictEqual(rewardAfter.riftState, rewardBefore.riftState, 'relay reward must not mutate world-rift shared state');
  assert.deepStrictEqual(rewardAfter.riftEntry, rewardBefore.riftEntry, 'relay reward must not mutate world-rift entries');
  assert.deepStrictEqual(rewardAfter.riftContributionCount, rewardBefore.riftContributionCount, 'relay reward must not create world-rift contributions');

  const compensationSession = await createSessionForSquad(
    service,
    relayRotationId,
    'squad-compensation',
    'user-comp1',
    'compensation',
    baseNow + 500
  );
  const reservationNow = baseNow + 501;
  const launchTimes = [
    reservationNow,
    reservationNow + 1,
    reservationNow + 2,
    reservationNow + 3,
    reservationNow + ACTIVE_LEASE_MS + 1,
    reservationNow + ACTIVE_LEASE_MS + 2
  ];
  let launchTimeIndex = 0;
  await expectError(
    () => service.claimRelayExpeditionLeg('user-comp1', {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId: compensationSession.sessionId,
      legIndex: 1,
      tacticId: 'vanguard',
      clientLegId: 'relay-client-leg-bind-timeout',
      mutationId: 'relay-claim-bind-timeout'
    }, () => launchTimes[Math.min(launchTimeIndex++, launchTimes.length - 1)]),
    'relay_active_lease_expired',
    409
  );
  const compensatedLeg = await dbGet(
    `SELECT status, runner_user_id, client_leg_id, client_run_id, run_id, active_lease_until
     FROM relay_expedition_legs WHERE session_id = ? AND leg_index = 1`,
    [compensationSession.sessionId]
  );
  assert.deepStrictEqual(
    compensatedLeg,
    {
      status: 'queued',
      runner_user_id: '',
      client_leg_id: '',
      client_run_id: '',
      run_id: null,
      active_lease_until: 0
    },
    'bind timeout must atomically release the relay reservation'
  );
  const compensatedMember = await dbGet(
    `SELECT claimed_legs, last_leg_index FROM relay_expedition_members WHERE session_id = ? AND user_id = ?`,
    [compensationSession.sessionId, 'user-comp1']
  );
  assert.deepStrictEqual(
    compensatedMember,
    { claimed_legs: 0, last_leg_index: 0 },
    'bind timeout must roll back member claim accounting'
  );
  const orphanRun = await dbGet(
    `SELECT status FROM progression_authoritative_runs
     WHERE user_id = ? AND activity_mode = 'relay_expedition'
     ORDER BY started_at DESC LIMIT 1`,
    ['user-comp1']
  );
  assert.strictEqual(orphanRun?.status, 'expired', 'issued but unbound authoritative run must be expired');
  const compensationEvent = await dbGet(
    `SELECT event_type FROM relay_expedition_ops_events
     WHERE event_type = 'leg_launch_compensated' AND rotation_id = ?
     ORDER BY created_at DESC LIMIT 1`,
    [relayRotationId]
  );
  assert.strictEqual(compensationEvent?.event_type, 'leg_launch_compensated');
  await expectError(
    () => service.claimRelayExpeditionLeg('user-comp1', {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId: compensationSession.sessionId,
      legIndex: 1,
      tacticId: 'vanguard',
      clientLegId: 'relay-client-leg-bind-timeout',
      mutationId: 'relay-claim-bind-timeout-replay'
    }, reservationNow + ACTIVE_LEASE_MS + 50),
    'relay_authoritative_binding_conflict',
    409
  );
  const replayedTerminalLeg = await dbGet(
    `SELECT status, run_id FROM relay_expedition_legs WHERE session_id = ? AND leg_index = 1`,
    [compensationSession.sessionId]
  );
  assert.deepStrictEqual(
    replayedTerminalLeg,
    { status: 'queued', run_id: null },
    'an expired orphan run must never be rebound by a repeated clientLegId'
  );
  const compensationRetry = await claimLeg(
    service,
    'user-comp1',
    compensationSession.sessionId,
    1,
    'vanguard',
    'bind-timeout-retry',
    reservationNow + ACTIVE_LEASE_MS + 100
  );
  assert.strictEqual(compensationRetry.leg.status, 'active', 'a fresh claim must not be blocked by the expired orphan run');

  const historicalCreateAt = Number(previousRelayRotation.starts_at) + 100;
  const historicalSession = await createSessionForSquad(
    service,
    previousRelayRotation.rotation_id,
    'squad-history',
    'user-history1',
    'history-previous',
    historicalCreateAt
  );
  const historicalClaim = await claimLeg(
    service,
    'user-history1',
    historicalSession.sessionId,
    1,
    'vanguard',
    'history-previous-leg1',
    historicalSession.currentLeg.priorityUntil - 1
  );
  const historicalSummary = summaryFor('completed', { scenarioId: 'vanguard', score: 650 });
  await insertCompletedReceipt(
    historicalClaim.authoritativeRun.runId,
    'user-history1',
    historicalSummary,
    historicalSession.currentLeg.priorityUntil + 10
  );

  const currentRotationSnapshot = buildRotationSnapshot(baseNow);
  const historyNow = currentRotationSnapshot.startsAt + 60 * 60 * 1000;
  const allRelayRotations = await dbAll(`SELECT * FROM relay_expedition_rotations ORDER BY starts_at DESC`);
  const olderRelayRotation = allRelayRotations.find(row => Number(row.starts_at) < Number(previousRelayRotation.starts_at));
  assert(olderRelayRotation, 'historical setup must retain the N-2 relay rotation');
  assert(Number(olderRelayRotation.claim_ends_at) > historyNow, 'N-2 rotation must still be claimable early in the current week');
  const olderSessionId = 'relay-history-older-session';
  await seedCompletedRelaySession({
    sessionId: olderSessionId,
    rotationId: olderRelayRotation.rotation_id,
    userId: 'user-history1',
    startedAt: Number(olderRelayRotation.starts_at) + 100
  });

  const lateReward = await service.claimRelayExpeditionReward('user-history1', 'relay-first-handoff', {
    protocolVersion: service.PROTOCOL_VERSION,
    sessionId: historicalSession.sessionId,
    rotationId: previousRelayRotation.rotation_id,
    milestoneId: 'relay-first-handoff',
    mutationId: 'relay-history-late-reward'
  }, historyNow);
  assert.strictEqual(lateReward.amount, 30, 'direct reward claim must reconcile a late authoritative receipt first');
  const olderReward = await service.claimRelayExpeditionReward('user-history1', 'relay-route-complete', {
    protocolVersion: service.PROTOCOL_VERSION,
    sessionId: olderSessionId,
    rotationId: olderRelayRotation.rotation_id,
    milestoneId: 'relay-route-complete',
    mutationId: 'relay-history-older-reward'
  }, historyNow + 1);
  assert.strictEqual(olderReward.amount, 60, 'N-2 reward must remain claimable until its own claim window closes');

  const historicalCurrent = await service.getCurrentRelayExpedition('user-history1', historyNow + 2);
  assert.strictEqual(historicalCurrent.currentSession, null, 'history user should have no current-rotation session');
  assert.strictEqual(historicalCurrent.session?.sessionId, historicalSession.sessionId, 'active previous session should remain the primary playable session');
  assert.strictEqual(historicalCurrent.previousSession?.sessionId, historicalSession.sessionId, 'previousSession compatibility alias must point at the newest history');
  assert.deepStrictEqual(
    historicalCurrent.previousSessions.map(entry => entry.sessionId),
    [historicalSession.sessionId, olderSessionId],
    'all still-claimable historical sessions must be returned newest first'
  );
  assert.strictEqual(
    historicalCurrent.previousSessions[0].route[0]?.outcome,
    'completed',
    'historical current query must reconcile late receipts before formatting'
  );

  const apiServer = startServer();
  try {
    await waitForHealth(apiServer);
    const rewardToken = generateToken({ id: 'user-reward1', username: 'relay_reward1' });

    const publicRelayStart = await signedRequest('/api/progression/authoritative-runs', {
      token: rewardToken,
      data: {
        clientRunId: 'relay-public-start-0001',
        mode: 'relay_expedition',
        contentVersion: require('../server/progression/authoritative-runs/catalog').CONTENT_VERSION
      }
    });
    assert.strictEqual(publicRelayStart.status, 403, JSON.stringify(publicRelayStart.payload));
    assert.strictEqual(publicRelayStart.payload?.reason, 'relay_expedition_start_required');

    const claimForged = await signedRequest('/api/relay-expeditions/legs/claim', {
      token: rewardToken,
      data: {
        protocolVersion: service.PROTOCOL_VERSION,
        sessionId: rewardSessionId,
        legIndex: 2,
        tacticId: 'vanguard',
        clientLegId: 'relay-api-forged-claim-0001',
        mutationId: 'relay-api-forged-claim-0001',
        score: 9999
      }
    });
    assert.strictEqual(claimForged.status, 400, JSON.stringify(claimForged.payload));
    assert.strictEqual(claimForged.payload?.reason, 'invalid_request_payload');

    const rewardForged = await signedRequest('/api/relay-expeditions/rewards/relay-first-handoff/claim', {
      token: rewardToken,
      data: {
        protocolVersion: service.PROTOCOL_VERSION,
        sessionId: rewardSessionId,
        rotationId: relayRotationId,
        milestoneId: 'relay-first-handoff',
        mutationId: 'relay-api-forged-reward-0001',
        amount: 999,
        currency: 'coin'
      }
    });
    assert.strictEqual(rewardForged.status, 400, JSON.stringify(rewardForged.payload));
    assert.strictEqual(rewardForged.payload?.reason, 'invalid_request_payload');

    const rewardPath = '/api/relay-expeditions/rewards/relay-first-handoff/claim';
    const routeBoundReward = {
      protocolVersion: service.PROTOCOL_VERSION,
      sessionId: rewardSessionId,
      rotationId: relayRotationId,
      milestoneId: 'relay-first-handoff',
      mutationId: 'relay-api-route-bound-reward-0001'
    };
    const unsignedReward = await request(rewardPath, {
      method: 'POST',
      token: rewardToken,
      body: routeBoundReward
    });
    assert.strictEqual(unsignedReward.status, 400, JSON.stringify(unsignedReward.payload));
    assert.strictEqual(unsignedReward.payload?.reason, 'missing-signature');

    const legacyReward = await request(rewardPath, {
      method: 'POST',
      token: rewardToken,
      body: signLegacySessionPayload(rewardToken, routeBoundReward)
    });
    assert.strictEqual(legacyReward.status, 400, JSON.stringify(legacyReward.payload));
    assert.strictEqual(legacyReward.payload?.reason, 'route-bound-signature-required');

    const wrongRouteReward = await request(rewardPath, {
      method: 'POST',
      token: rewardToken,
      body: signRoutePayload('POST /api/relay-expeditions/baton/pass', rewardToken, routeBoundReward)
    });
    assert.strictEqual(wrongRouteReward.status, 403, JSON.stringify(wrongRouteReward.payload));
    assert.strictEqual(wrongRouteReward.payload?.reason, 'session-signature-mismatch');

    const validReward = await signedRequest(rewardPath, {
      token: rewardToken,
      data: routeBoundReward
    });
    assert.strictEqual(validReward.status, 200, JSON.stringify(validReward.payload));
    assert.strictEqual(validReward.payload?.idempotent, true, 'correct route-bound session-v2 request should reach reward idempotency');
  } finally {
    await stopServer(apiServer);
    removeDbFiles();
  }

  console.log('Relay expedition platform checks passed.');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
