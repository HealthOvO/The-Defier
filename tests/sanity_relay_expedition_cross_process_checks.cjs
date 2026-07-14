const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.RELAY_EXPEDITION_CROSS_PROCESS_DB_PATH
  || path.join(os.tmpdir(), `the-defier-relay-expedition-cross-process-${process.pid}.sqlite`);
const JWT_SECRET = 'relay-expedition-cross-process-jwt-secret-32chars';
const HMAC_SECRET = 'relay-expedition-cross-process-hmac-secret-32chars';
const SEED_SECRET = 'relay-expedition-cross-process-seed-secret-32chars';

process.env.DEFIER_DB_PATH = DB_PATH;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DEFIER_HMAC_SECRET = HMAC_SECRET;
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

const CHILD_SCRIPT = `
  (async () => {
    const payload = JSON.parse(process.argv[1] || '{}');
    const { initDb } = require('./server/db/database');
    const relay = require('./server/relay-expedition/service');
    await initDb();
    if (payload.action === 'claim') {
      const response = await relay.claimRelayExpeditionLeg(payload.userId, payload.request, payload.now);
      process.stdout.write(JSON.stringify({ ok: true, response }));
      return;
    }
    if (payload.action === 'current') {
      const response = await relay.getCurrentRelayExpedition(payload.userId, payload.now);
      process.stdout.write(JSON.stringify({ ok: true, response }));
      return;
    }
    throw new Error('unsupported child action');
  })().catch(error => {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: {
        reason: error && error.reason || '',
        message: error && error.message || String(error),
        statusCode: Number(error && error.statusCode) || 0
      }
    }));
    process.exit(1);
  });
`;

function spawnChild(payload) {
  const child = spawn(process.execPath, ['-e', CHILD_SCRIPT, JSON.stringify(payload)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET,
      DEFIER_HMAC_SECRET: HMAC_SECRET,
      DEFIER_WORLD_RIFT_SEED_SECRET: SEED_SECRET,
      DEFIER_RELAY_EXPEDITION_SEED_SECRET: SEED_SECRET,
      DEFIER_DB_PATH: DB_PATH,
      DEFIER_GIT_SHA: `relay-expedition-cross-${process.pid}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.once('exit', code => {
      let parsed = null;
      try {
        parsed = stdout ? JSON.parse(stdout) : null;
      } catch (error) {}
      if (code === 0) {
        resolve(parsed || { ok: true, response: null });
        return;
      }
      if (parsed) {
        resolve(parsed);
        return;
      }
      reject(new Error(stderr || stdout || `child exited with code ${code}`));
    });
  });
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

function summaryForCompleted() {
  return {
    result: 'completed',
    reason: 'boss_defeated',
    score: 701,
    grade: 'S',
    scenarioId: 'vanguard',
    encountersWon: 3,
    bossWins: 1,
    turns: 17,
    cardsPlayed: 23,
    damageDealt: 91,
    damageTaken: 11,
    remainingHp: 28,
    maxHp: 40
  };
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

async function main() {
  removeDbFiles();

  const { initDb } = require('../server/db/database');
  const relay = require('../server/relay-expedition/service');
  const authoritativeRuns = require('../server/progression/authoritative-runs/service');
  const { hashCanonical } = require('../server/progression/authoritative-runs/canonical');

  await initDb();

  const baseNow = Date.now();
  const { relayRotationId, worldRiftRotationId } = await getRotationIds(baseNow);
  await seedUsers(['cp1', 'cp2', 'cp3', 'recover1', 'recover2', 'settle1', 'settle2'], baseNow);

  await seedSquad({
    squadId: 'cp-squad-claim',
    rotationId: worldRiftRotationId,
    now: baseNow,
    members: [
      { userId: 'user-cp1', displayName: '并甲', profileId: 'profile-cp1' },
      { userId: 'user-cp2', displayName: '并乙', profileId: 'profile-cp2' },
      { userId: 'user-cp3', displayName: '并丙', profileId: 'profile-cp3' }
    ]
  });
  const concurrentSession = await relay.createRelayExpeditionSession('user-cp1', {
    protocolVersion: relay.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'cp-squad-claim',
    clientSessionId: 'relay-cp-session-claim',
    mutationId: 'relay-cp-create-claim'
  }, baseNow + 1);
  const concurrentLeg = concurrentSession.currentLeg;
  const claimNow = concurrentLeg.priorityUntil + 1;
  await dbRun(
    `UPDATE relay_expedition_legs SET priority_until = ?, open_claim_until = ? WHERE leg_id = ?`,
    [claimNow - 1, claimNow + 60_000, concurrentLeg.legId]
  );

  const requestA = {
    protocolVersion: relay.PROTOCOL_VERSION,
    sessionId: concurrentSession.session.sessionId,
    legIndex: 1,
    tacticId: 'vanguard',
    clientLegId: 'relay-cp-leg-claim-a',
    mutationId: 'relay-cp-claim-a'
  };
  const requestB = {
    protocolVersion: relay.PROTOCOL_VERSION,
    sessionId: concurrentSession.session.sessionId,
    legIndex: 1,
    tacticId: 'insight',
    clientLegId: 'relay-cp-leg-claim-b',
    mutationId: 'relay-cp-claim-b'
  };
  const [claimA, claimB] = await Promise.all([
    spawnChild({ action: 'claim', userId: 'user-cp2', request: requestA, now: claimNow }),
    spawnChild({ action: 'claim', userId: 'user-cp3', request: requestB, now: claimNow })
  ]);
  const claims = [claimA, claimB];
  const winners = claims.filter(entry => entry.ok);
  const losers = claims.filter(entry => !entry.ok);
  assert.strictEqual(winners.length, 1, 'concurrent claim should produce exactly one winner');
  assert.strictEqual(losers.length, 1, 'concurrent claim should produce exactly one loser');
  assert.match(
    losers[0].error.reason,
    /^relay_leg_(claim_raced|unavailable)$|^relay_member_not_eligible$/,
    'losing cross-process claim must fail with relay availability error'
  );
  const reservedLeg = await dbGet(
    `SELECT runner_user_id, status, run_id FROM relay_expedition_legs WHERE leg_id = ?`,
    [concurrentLeg.legId]
  );
  assert.strictEqual(reservedLeg?.status, 'active', 'winning claim should bind the leg to an active run');
  assert(reservedLeg?.runner_user_id === 'user-cp2' || reservedLeg?.runner_user_id === 'user-cp3');
  const relayRunCount = await dbGet(
    `SELECT COUNT(*) AS count
     FROM progression_authoritative_runs
     WHERE activity_mode = 'relay_expedition'
       AND user_id IN ('user-cp2', 'user-cp3')`
  );
  assert.strictEqual(Number(relayRunCount?.count), 1, 'concurrent claim must create exactly one authoritative relay run');

  await seedSquad({
    squadId: 'cp-squad-reserve',
    rotationId: worldRiftRotationId,
    now: baseNow + 100,
    members: [
      { userId: 'user-recover1', displayName: '恢甲', profileId: 'profile-recover1' },
      { userId: 'user-recover2', displayName: '恢乙', profileId: 'profile-recover2' }
    ]
  });
  const reserveSession = await relay.createRelayExpeditionSession('user-recover1', {
    protocolVersion: relay.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'cp-squad-reserve',
    clientSessionId: 'relay-cp-session-reserve',
    mutationId: 'relay-cp-create-reserve'
  }, baseNow + 101);
  const reserveLegId = reserveSession.currentLeg.legId;
  const reserveRunClientId = 'relay-cp-run-reserve-launch';
  const reserveRecoveryNow = baseNow + 102;
  const reserveRequest = relay.normalizeClaimRequest({
    protocolVersion: relay.PROTOCOL_VERSION,
    sessionId: reserveSession.session.sessionId,
    legIndex: 1,
    tacticId: 'vanguard',
    clientLegId: 'relay-cp-client-leg-reserve',
    mutationId: 'relay-cp-claim-reserve'
  });
  await dbRun(
    `UPDATE relay_expedition_legs
     SET runner_user_id = 'user-recover1', tactic_id = 'vanguard', client_leg_id = 'relay-cp-client-leg-reserve',
         client_run_id = ?, status = 'reserved', request_hash = ?, request_body_json = ?,
         reserved_at = ?, active_lease_until = ?, updated_at = ?
     WHERE leg_id = ?`,
    [
      reserveRunClientId,
      hashCanonical(reserveRequest),
      JSON.stringify(reserveRequest),
      reserveRecoveryNow,
      reserveRecoveryNow + 60 * 60 * 1000,
      reserveRecoveryNow,
      reserveLegId
    ]
  );
  await dbRun(
    `UPDATE relay_expedition_members SET claimed_legs = 1, last_leg_index = 1, updated_at = ? WHERE session_id = ? AND user_id = 'user-recover1'`,
    [reserveRecoveryNow, reserveSession.session.sessionId]
  );
  await dbRun(
    `UPDATE relay_expedition_sessions SET active_leg_id = ?, updated_at = ? WHERE session_id = ?`,
    [reserveLegId, reserveRecoveryNow, reserveSession.session.sessionId]
  );
  const racedReserveClaim = await spawnChild({
    action: 'claim',
    userId: 'user-recover2',
    request: reserveRequest,
    now: reserveRecoveryNow + 1
  });
  assert.strictEqual(racedReserveClaim.ok, false, JSON.stringify(racedReserveClaim));
  assert.strictEqual(racedReserveClaim.error.reason, 'relay_leg_claim_raced', 'another member must not recover an owned reservation');
  const reserveAfterRace = await dbGet(
    `SELECT runner_user_id, status, run_id FROM relay_expedition_legs WHERE leg_id = ?`,
    [reserveLegId]
  );
  assert.strictEqual(reserveAfterRace?.runner_user_id, 'user-recover1');
  assert.strictEqual(reserveAfterRace?.status, 'reserved', 'raced retry must leave the rightful reservation intact');
  assert(!reserveAfterRace?.run_id, 'raced retry must not launch an authoritative run');

  const reserveRecovered = await spawnChild({
    action: 'claim',
    userId: 'user-recover1',
    request: reserveRequest,
    now: reserveRecoveryNow + 2
  });
  assert.strictEqual(reserveRecovered.ok, true, JSON.stringify(reserveRecovered));
  assert.strictEqual(reserveRecovered.response.leg.status, 'active', 'rightful retry should launch the reserved leg');
  const reserveLegAfter = await dbGet(
    `SELECT status, run_id FROM relay_expedition_legs WHERE leg_id = ?`,
    [reserveLegId]
  );
  assert.strictEqual(reserveLegAfter?.status, 'active', 'reserved leg should recover by launching and binding a run');
  assert(reserveLegAfter?.run_id, 'reserve->launch recovery must persist run_id');

  const bindSession = await relay.createRelayExpeditionSession('user-recover2', {
    protocolVersion: relay.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'cp-squad-reserve',
    clientSessionId: 'relay-cp-session-bind',
    mutationId: 'relay-cp-create-bind'
  }, baseNow + 200).catch(() => null);
  assert.strictEqual(bindSession, null, 'same roster should not create a second live session');

  await seedSquad({
    squadId: 'cp-squad-bind',
    rotationId: worldRiftRotationId,
    now: baseNow + 210,
    members: [
      { userId: 'user-settle1', displayName: '投甲', profileId: 'profile-settle1' },
      { userId: 'user-settle2', displayName: '投乙', profileId: 'profile-settle2' }
    ]
  });
  const bindRecoverySession = await relay.createRelayExpeditionSession('user-settle1', {
    protocolVersion: relay.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'cp-squad-bind',
    clientSessionId: 'relay-cp-session-bind-real',
    mutationId: 'relay-cp-create-bind-real'
  }, baseNow + 211);
  const bindLegId = bindRecoverySession.currentLeg.legId;
  const bindClientRunId = 'relay-cp-run-bind-existing';
  const bindRecoveryNow = baseNow + 212;
  await dbRun(
    `UPDATE relay_expedition_legs
     SET runner_user_id = 'user-settle1', tactic_id = 'bulwark', client_leg_id = 'relay-cp-client-leg-bind',
         client_run_id = ?, status = 'reserved', request_hash = 'hash', request_body_json = ?,
         reserved_at = ?, active_lease_until = ?, updated_at = ?
     WHERE leg_id = ?`,
    [
      bindClientRunId,
      JSON.stringify({
        protocolVersion: relay.PROTOCOL_VERSION,
        sessionId: bindRecoverySession.session.sessionId,
        legIndex: 1,
        tacticId: 'bulwark',
        clientLegId: 'relay-cp-client-leg-bind',
        mutationId: 'relay-cp-claim-bind'
      }),
      bindRecoveryNow,
      bindRecoveryNow + 60 * 60 * 1000,
      bindRecoveryNow,
      bindLegId
    ]
  );
  await dbRun(
    `UPDATE relay_expedition_members SET claimed_legs = 1, last_leg_index = 1, updated_at = ? WHERE session_id = ? AND user_id = 'user-settle1'`,
    [bindRecoveryNow, bindRecoverySession.session.sessionId]
  );
  await dbRun(
    `UPDATE relay_expedition_sessions SET active_leg_id = ?, updated_at = ? WHERE session_id = ?`,
    [bindLegId, bindRecoveryNow, bindRecoverySession.session.sessionId]
  );
  const preIssued = await authoritativeRuns.issueAuthoritativeRun(
    'user-settle1',
    {
      clientRunId: bindClientRunId,
      mode: 'relay_expedition',
      contentVersion: require('../server/progression/authoritative-runs/catalog').CONTENT_VERSION
    },
    bindRecoveryNow,
    {
      binding: { type: 'relay_expedition', sessionId: bindRecoverySession.session.sessionId, legId: bindLegId },
      seedHex: 'a'.repeat(64),
      scenarioId: 'bulwark',
      runTtlMs: 30 * 60 * 1000,
      startDeadline: bindRecoveryNow + 60 * 60 * 1000,
      nowProvider: () => bindRecoveryNow
    }
  );
  assert.strictEqual(preIssued.success, true);
  const bindRecovered = await spawnChild({
    action: 'current',
    userId: 'user-settle1',
    now: bindRecoveryNow + 1
  });
  assert.strictEqual(bindRecovered.ok, true, JSON.stringify(bindRecovered));
  const bindLegAfter = await dbGet(
    `SELECT status, run_id FROM relay_expedition_legs WHERE leg_id = ?`,
    [bindLegId]
  );
  assert.strictEqual(bindLegAfter?.status, 'active', 'launch->bind recovery should reactivate reserved leg');
  assert.strictEqual(bindLegAfter?.run_id, preIssued.run.runId, 'launch->bind recovery must bind the pre-issued authoritative run');
  const bindRunCount = await dbGet(
    `SELECT COUNT(*) AS count FROM progression_authoritative_runs WHERE client_run_id = ? AND user_id = 'user-settle1'`,
    [bindClientRunId]
  );
  assert.strictEqual(Number(bindRunCount?.count), 1, 'launch->bind recovery must not duplicate authoritative runs');

  const settleClaim = await relay.claimRelayExpeditionLeg('user-settle2', {
    protocolVersion: relay.PROTOCOL_VERSION,
    sessionId: bindRecoverySession.session.sessionId,
    legIndex: 1,
    tacticId: 'vanguard',
    clientLegId: 'relay-cp-settle-leg-real',
    mutationId: 'relay-cp-settle-claim-real'
  }, bindRecoveryNow + 2).catch(() => null);
  assert.strictEqual(settleClaim, null, 'busy live session should reject second direct claim');

  const settleSession = await relay.createRelayExpeditionSession('user-settle2', {
    protocolVersion: relay.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'cp-squad-bind',
    clientSessionId: 'relay-cp-session-settle-other',
    mutationId: 'relay-cp-create-settle-other'
  }, baseNow + 300).catch(() => null);
  assert.strictEqual(settleSession, null, 'same roster cannot open another relay session for settle recovery');

  await seedUsers(['settle3', 'settle4'], baseNow + 320);
  await seedSquad({
    squadId: 'cp-squad-settle',
    rotationId: worldRiftRotationId,
    now: baseNow + 321,
    members: [
      { userId: 'user-settle3', displayName: '结甲', profileId: 'profile-settle3' },
      { userId: 'user-settle4', displayName: '结乙', profileId: 'profile-settle4' }
    ]
  });
  const settleRecoverySession = await relay.createRelayExpeditionSession('user-settle3', {
    protocolVersion: relay.PROTOCOL_VERSION,
    rotationId: relayRotationId,
    sourceSquadId: 'cp-squad-settle',
    clientSessionId: 'relay-cp-session-settle',
    mutationId: 'relay-cp-create-settle'
  }, baseNow + 322);
  const settleClaimed = await relay.claimRelayExpeditionLeg('user-settle3', {
    protocolVersion: relay.PROTOCOL_VERSION,
    sessionId: settleRecoverySession.session.sessionId,
    legIndex: 1,
    tacticId: 'vanguard',
    clientLegId: 'relay-cp-settle-leg-claim',
    mutationId: 'relay-cp-settle-claim'
  }, baseNow + 323);
  await insertCompletedReceipt(settleClaimed.authoritativeRun.runId, 'user-settle3', summaryForCompleted(), baseNow + 324);
  const settleRecovered = await spawnChild({
    action: 'current',
    userId: 'user-settle3',
    now: baseNow + 325
  });
  assert.strictEqual(settleRecovered.ok, true, JSON.stringify(settleRecovered));
  assert.strictEqual(settleRecovered.response.session.route[0].outcome, 'completed', 'settle/project recovery should auto-project completed receipt');
  assert.strictEqual(settleRecovered.response.session.currentLegIndex, 2, 'settle/project recovery must advance the shared route');

  removeDbFiles();
  console.log('Relay expedition cross-process checks passed.');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
