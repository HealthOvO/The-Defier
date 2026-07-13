const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'defier-weekly-archive-'));
process.env.DEFIER_DB_PATH = path.join(tempDir, 'database.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'weekly-archive-test-jwt-secret-32-characters';
process.env.DEFIER_HMAC_SECRET = process.env.DEFIER_HMAC_SECRET || 'weekly-archive-test-hmac-secret-32-characters';

const { db, initDb } = require('../server/db/database');
const {
  FOUNDATION_REWARD_AMOUNT,
  PROTOCOL_VERSION,
  SLOT_DEFINITIONS,
  WEEK_MS,
  buildCycleSnapshotForTime
} = require('../server/weekly-archive/catalog');
const {
  claimWeeklyArchiveFoundation,
  getCurrentWeeklyArchive,
  getWeeklyArchiveOpsOverview
} = require('../server/weekly-archive/service');

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows || []);
    });
  });
}

function closeDb() {
  return new Promise(resolve => db.close(() => resolve()));
}

async function addProgressionEvent({
  userId,
  eventId,
  mode,
  occurredAt,
  trustTier = 'server_authoritative',
  activityCompletions = 1
}) {
  await dbRun(
    `INSERT INTO progression_events
      (user_id, event_id, event_type, activity_mode, source_kind, trust_tier, source_ref,
       battle_wins, boss_wins, activity_completions, pvp_matches, pvp_wins,
       proof_json, occurred_at, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, ?, ?)`,
    [
      userId,
      eventId,
      `weekly_archive_${eventId}`,
      mode,
      `${mode}_settlement`,
      trustTier,
      `source:${eventId}`,
      activityCompletions,
      JSON.stringify({ runId: `run:${eventId}`, didWin: mode === 'pvp_live' }),
      occurredAt,
      occurredAt
    ]
  );
}

async function expectReason(promise, reason) {
  await assert.rejects(promise, error => {
    assert.equal(error && error.reason, reason);
    return true;
  });
}

(async () => {
  const userId = 'weekly-user-0001';
  const now = Date.now();
  const currentCycle = buildCycleSnapshotForTime(now);
  const previousCycle = buildCycleSnapshotForTime(now - WEEK_MS);

  await initDb();
  await dbRun(
    `INSERT INTO users (id, username, password_hash, global_data, created_at)
     VALUES (?, ?, ?, '{}', ?)`,
    [userId, 'weekly_archive_user', 'not-used-by-direct-service-test', now]
  );

  const tables = await dbAll(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name LIKE 'weekly_archive_%'
     ORDER BY name`
  );
  assert.deepEqual(
    tables.map(row => row.name),
    [
      'weekly_archive_cycles',
      'weekly_archive_mutations',
      'weekly_archive_ops_counters',
      'weekly_archive_ops_events',
      'weekly_archive_reward_claims'
    ],
    'V11 bootstrap must create every weekly archive table'
  );

  await addProgressionEvent({
    userId,
    eventId: 'current-challenge-1',
    mode: 'challenge_ladder',
    occurredAt: currentCycle.startsAt + 1_000
  });
  await addProgressionEvent({
    userId,
    eventId: 'current-challenge-duplicate',
    mode: 'challenge_ladder',
    occurredAt: currentCycle.startsAt + 2_000
  });
  await addProgressionEvent({
    userId,
    eventId: 'current-untrusted-pvp',
    mode: 'pvp_live',
    occurredAt: currentCycle.startsAt + 3_000,
    trustTier: 'client_observed'
  });
  await addProgressionEvent({
    userId,
    eventId: 'current-incomplete-relay',
    mode: 'relay_expedition',
    occurredAt: currentCycle.startsAt + 4_000,
    activityCompletions: 0
  });

  let archive = await getCurrentWeeklyArchive(userId, { now });
  assert.equal(archive.grade.proofCount, 1, 'duplicates, untrusted reports, and incomplete activity must not add proofs');
  assert.equal(archive.grade.gradeId, 'unarchived');
  assert.equal(archive.claim.activeCycle.claimable, false);
  assert.equal(archive.slots.find(slot => slot.mode === 'challenge_ladder')?.earned, true);
  assert.equal(archive.slots.find(slot => slot.mode === 'pvp_live')?.earned, false);

  await expectReason(
    claimWeeklyArchiveFoundation(userId, {
      protocolVersion: PROTOCOL_VERSION,
      cycleId: currentCycle.cycleId,
      mutationId: 'weekly-claim-too-early'
    }),
    'foundation_not_ready'
  );

  await addProgressionEvent({
    userId,
    eventId: 'current-rift-1',
    mode: 'world_rift',
    occurredAt: currentCycle.startsAt + 5_000
  });
  archive = await getCurrentWeeklyArchive(userId, { now });
  assert.equal(archive.grade.proofCount, 2);
  assert.equal(archive.grade.gradeId, 'foundation');
  assert.equal(archive.claim.activeCycle.claimable, true);

  const claimRequest = {
    protocolVersion: PROTOCOL_VERSION,
    cycleId: currentCycle.cycleId,
    mutationId: 'weekly-claim-current-0001'
  };
  const firstClaim = await claimWeeklyArchiveFoundation(userId, claimRequest);
  const replayedClaim = await claimWeeklyArchiveFoundation(userId, claimRequest);
  assert.equal(firstClaim.claim.claimId, replayedClaim.claim.claimId, 'same mutation must replay the durable receipt');
  assert.equal(firstClaim.reward.amount, FOUNDATION_REWARD_AMOUNT);
  assert.equal(firstClaim.reward.rewardImpact, 'cosmetic_only');
  assert.equal(firstClaim.reward.powerImpact, 'none');

  const alreadyClaimed = await claimWeeklyArchiveFoundation(userId, {
    ...claimRequest,
    mutationId: 'weekly-claim-current-0002'
  });
  assert.equal(alreadyClaimed.claim.alreadyClaimed, true, 'a new mutation after settlement must return the existing claim');

  const walletAfterClaim = await dbGet(
    `SELECT balance, lifetime_earned FROM progression_economy_balances
     WHERE user_id = ? AND currency = 'renown'`,
    [userId]
  );
  assert.deepEqual(
    { balance: Number(walletAfterClaim.balance), lifetimeEarned: Number(walletAfterClaim.lifetime_earned) },
    { balance: FOUNDATION_REWARD_AMOUNT, lifetimeEarned: FOUNDATION_REWARD_AMOUNT },
    'foundation reward must credit exactly once'
  );
  const currentLedgerCount = await dbGet(
    `SELECT COUNT(*) AS count FROM progression_economy_ledger
     WHERE user_id = ? AND source_type = 'weekly_archive_reward'`,
    [userId]
  );
  assert.equal(Number(currentLedgerCount.count), 1, 'retries must not duplicate the economy ledger');

  for (const [index, mode] of ['fate_chronicle', 'pvp_live', 'relay_expedition'].entries()) {
    await addProgressionEvent({
      userId,
      eventId: `current-extra-${index}`,
      mode,
      occurredAt: currentCycle.startsAt + 6_000 + index
    });
  }
  archive = await getCurrentWeeklyArchive(userId, { now });
  assert.equal(archive.grade.proofCount, SLOT_DEFINITIONS.length);
  assert.equal(archive.grade.gradeId, 'complete');
  assert.equal(archive.grade.rewardAmount, FOUNDATION_REWARD_AMOUNT, '4-5 proofs must remain display-only upgrades');
  assert.equal(archive.claim.activeCycle.claimed, true);

  await addProgressionEvent({
    userId,
    eventId: 'previous-fate-1',
    mode: 'fate_chronicle',
    occurredAt: previousCycle.startsAt + 1_000
  });
  await addProgressionEvent({
    userId,
    eventId: 'previous-challenge-1',
    mode: 'challenge_ladder',
    occurredAt: previousCycle.startsAt + 2_000
  });
  const carryover = await getCurrentWeeklyArchive(userId, { now });
  assert.equal(carryover.claim.carryoverCycle?.cycleId, previousCycle.cycleId);
  assert.equal(carryover.claim.carryoverCycle?.claimable, true, 'previous UTC week must remain claimable during grace');

  await expectReason(
    claimWeeklyArchiveFoundation(userId, {
      protocolVersion: PROTOCOL_VERSION,
      cycleId: previousCycle.cycleId,
      mutationId: claimRequest.mutationId
    }),
    'mutation_reused'
  );
  const previousClaim = await claimWeeklyArchiveFoundation(userId, {
    protocolVersion: PROTOCOL_VERSION,
    cycleId: previousCycle.cycleId,
    mutationId: 'weekly-claim-previous-0001'
  });
  assert.equal(previousClaim.reward.amount, FOUNDATION_REWARD_AMOUNT);

  const finalWallet = await dbGet(
    `SELECT balance, lifetime_earned FROM progression_economy_balances
     WHERE user_id = ? AND currency = 'renown'`,
    [userId]
  );
  assert.equal(Number(finalWallet.balance), FOUNDATION_REWARD_AMOUNT * 2, 'each eligible week may pay once');
  assert.equal(Number(finalWallet.lifetime_earned), FOUNDATION_REWARD_AMOUNT * 2);

  const overview = await getWeeklyArchiveOpsOverview(now);
  assert.equal(overview.protocolVersion, PROTOCOL_VERSION);
  assert.equal(overview.totals.claims, 2);
  assert.equal(overview.totals.renownGranted, FOUNDATION_REWARD_AMOUNT * 2);
  assert(overview.recentEvents.every(event => !JSON.stringify(event).includes(userId)), 'ops telemetry must not expose raw account ids');

  console.log('Weekly archive platform checks passed.');
})()
  .finally(async () => {
    await closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
