const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = process.env.WORLD_RIFT_SQUAD_TEST_DB_PATH
  || path.join(os.tmpdir(), `the-defier-world-rift-squad-${process.pid}.sqlite`);

process.env.DEFIER_DB_PATH = DB_PATH;
process.env.NODE_ENV = 'test';
process.env.DEFIER_HMAC_SECRET = process.env.DEFIER_HMAC_SECRET || 'world-rift-squad-test-secret';
process.env.DEFIER_WORLD_RIFT_SEED_SECRET = process.env.DEFIER_WORLD_RIFT_SEED_SECRET || 'world-rift-squad-seed-secret';

function resolveSqlite3() {
  for (const candidate of [
    'sqlite3',
    path.join(ROOT, 'node_modules', 'sqlite3'),
    path.join(ROOT, 'server', 'node_modules', 'sqlite3'),
    path.resolve(ROOT, '..', 'The-Defier', 'node_modules', 'sqlite3'),
    path.resolve(ROOT, '..', 'The-Defier', 'server', 'node_modules', 'sqlite3'),
  ]) {
    try {
      return require(candidate).verbose();
    } catch (error) {}
  }
  throw new Error('sqlite3 module is not available');
}

const sqlite3 = resolveSqlite3();
removeDbFiles();
const { db: sharedDb } = require('../server/db/database');
const { ensureWorldRiftSchema } = require('../server/world-rift/bootstrap');
const {
  PROTOCOL_VERSION,
  acceptRiftSquadInvite,
  claimRiftSquadReward,
  createRiftSquad,
  declineRiftSquadInvite,
  getRiftSquadDashboard,
  inviteRiftSquadFriend,
  leaveRiftSquad,
  linkContributionToActiveSquad,
} = require('../server/account-social/squad-service');
const { getCurrentWorldRift } = require('../server/world-rift/service');

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${DB_PATH}${suffix}`, { force: true });
  }
}

function openDb() {
  const connection = new sqlite3.Database(DB_PATH);
  connection.configure('busyTimeout', 5000);
  return connection;
}

function dbRunOn(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve({ changes: Number(this && this.changes || 0) });
    });
  });
}

function dbGetOn(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row || null);
    });
  });
}

function dbAllOn(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows || []);
    });
  });
}

function closeDb(connection) {
  return new Promise(resolve => connection.close(resolve));
}

async function withDb(fn) {
  const connection = openDb();
  try {
    return await fn(connection);
  } finally {
    await closeDb(connection);
  }
}

async function createSupportSchema(connection, now) {
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  await ensureWorldRiftSchema(connection, now);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS progression_economy_balances (
    user_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    lifetime_earned INTEGER NOT NULL DEFAULT 0,
    lifetime_spent INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, currency)
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS progression_economy_ledger (
    entry_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, source_type, source_id, currency)
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS social_profiles (
    user_id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL UNIQUE,
    discovery_policy TEXT NOT NULL DEFAULT 'exact_only',
    friend_request_policy TEXT NOT NULL DEFAULT 'exact_only',
    presence_visibility TEXT NOT NULL DEFAULT 'friends',
    pvp_invite_policy TEXT NOT NULL DEFAULT 'friends',
    squad_invite_policy TEXT NOT NULL DEFAULT 'friends',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS social_friendships (
    friendship_id TEXT PRIMARY KEY,
    user_low_id TEXT NOT NULL,
    user_high_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'accepted',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_low_id, user_high_id)
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS social_relationship_controls (
    owner_user_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    is_blocked INTEGER NOT NULL DEFAULT 0,
    is_muted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(owner_user_id, target_user_id)
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS world_rift_squads (
    squad_id TEXT PRIMARY KEY,
    rotation_id TEXT NOT NULL,
    leader_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS world_rift_squad_members (
    squad_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rotation_id TEXT NOT NULL,
    status TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    left_at INTEGER NOT NULL DEFAULT 0,
    locked_at INTEGER NOT NULL DEFAULT 0,
    display_name_snapshot TEXT NOT NULL DEFAULT '',
    profile_id_snapshot TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(squad_id, user_id)
  )`);
  await dbRunOn(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_members_active
    ON world_rift_squad_members(rotation_id, user_id, status)`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS world_rift_squad_invites (
    invite_id TEXT PRIMARY KEY,
    squad_id TEXT NOT NULL,
    rotation_id TEXT NOT NULL,
    inviter_user_id TEXT NOT NULL,
    invitee_user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    responded_at INTEGER NOT NULL DEFAULT 0,
    inviter_name_snapshot TEXT NOT NULL DEFAULT '',
    inviter_profile_id_snapshot TEXT NOT NULL DEFAULT '',
    invitee_name_snapshot TEXT NOT NULL DEFAULT '',
    invitee_profile_id_snapshot TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  await dbRunOn(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_invites_inbox
    ON world_rift_squad_invites(rotation_id, invitee_user_id, status, created_at DESC)`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS world_rift_squad_contributions (
    contribution_id TEXT PRIMARY KEY,
    squad_id TEXT NOT NULL,
    rotation_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    contribution INTEGER NOT NULL,
    remaining_hp INTEGER NOT NULL DEFAULT 0,
    turns INTEGER NOT NULL DEFAULT 0,
    linked_at INTEGER NOT NULL,
    display_name_snapshot TEXT NOT NULL DEFAULT '',
    profile_id_snapshot TEXT NOT NULL DEFAULT ''
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS world_rift_squad_entries (
    rotation_id TEXT NOT NULL,
    squad_id TEXT NOT NULL,
    cooperative_score INTEGER NOT NULL DEFAULT 0,
    contributing_members INTEGER NOT NULL DEFAULT 0,
    best_remaining_hp_sum INTEGER NOT NULL DEFAULT 0,
    best_turns_sum INTEGER NOT NULL DEFAULT 0,
    member_count INTEGER NOT NULL DEFAULT 0,
    locked_member_count INTEGER NOT NULL DEFAULT 0,
    member_best_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL,
    PRIMARY KEY(rotation_id, squad_id)
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS world_rift_squad_reward_claims (
    claim_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    rotation_id TEXT NOT NULL,
    squad_id TEXT NOT NULL,
    milestone_id TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
    ledger_entry_id TEXT NOT NULL,
    claim_payload_json TEXT NOT NULL DEFAULT '{}',
    claimed_at INTEGER NOT NULL,
    UNIQUE(user_id, rotation_id, squad_id, milestone_id)
  )`);
  await dbRunOn(connection, `CREATE TABLE IF NOT EXISTS world_rift_squad_mutations (
    user_id TEXT NOT NULL,
    mutation_id TEXT NOT NULL,
    rotation_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    request_body_json TEXT NOT NULL DEFAULT '{}',
    receipt_json TEXT NOT NULL DEFAULT '{}',
    squad_id TEXT NOT NULL DEFAULT '',
    invite_id TEXT NOT NULL DEFAULT '',
    claim_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY(user_id, mutation_id)
  )`);
}

async function seedUsers(connection, now) {
  const users = ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map(name => ({
    userId: `user-${name}`,
    username: name,
    profileId: `profile-${name}`,
  }));
  for (const user of users) {
    await dbRunOn(connection, `INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, 'x', ?)`, [
      user.userId,
      user.username,
      now,
    ]);
    await dbRunOn(connection, `INSERT INTO social_profiles (user_id, profile_id, squad_invite_policy) VALUES (?, ?, 'friends')`, [
      user.userId,
      user.profileId,
    ]);
  }
  for (const friend of users.slice(1)) {
    const pair = ['user-alpha', friend.userId].sort();
    await dbRunOn(connection, `INSERT INTO social_friendships (friendship_id, user_low_id, user_high_id, status) VALUES (?, ?, ?, 'accepted')`, [
      `friend-${pair[0]}-${pair[1]}`,
      pair[0],
      pair[1],
    ]);
  }
  return Object.fromEntries(users.map(user => [user.username, user]));
}

async function loadCurrentRotationId(connection) {
  const row = await dbGetOn(connection, `SELECT rotation_id FROM world_rift_rotations ORDER BY starts_at DESC LIMIT 1`);
  assert(row && row.rotation_id, 'expected current world-rift rotation');
  return row.rotation_id;
}

async function expectErrorReason(fn, reason) {
  try {
    await fn();
  } catch (error) {
    assert.strictEqual(error.reason, reason, error.stack);
    return error;
  }
  throw new Error(`expected ${reason}`);
}

async function linkContribution({ userId, rotationId, contributionId, contribution, remainingHp, turns, now }) {
  return withDb(async connection => {
    await dbRunOn(connection, 'BEGIN IMMEDIATE');
    try {
      await dbRunOn(connection, `INSERT INTO world_rift_contributions
        (contribution_id, attempt_id, run_id, receipt_id, user_id, rotation_id, score, turns, remaining_hp,
         survival_bonus, tempo_bonus, contribution, applied_damage, echo_contribution, previous_phase_index,
         next_phase_index, previous_applied_damage, next_applied_damage, state_version, mutation_hash,
         summary_json, receipt_json, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, 1, 1, 0, ?, 1, ?, '{}', '{}', ?)`, [
        contributionId,
        `attempt-${contributionId}`,
        `run-${contributionId}`,
        `receipt-${contributionId}`,
        userId,
        rotationId,
        contribution,
        turns,
        remainingHp,
        contribution,
        contribution,
        contribution,
        `hash-${contributionId}`,
        now,
      ]);
      const result = await linkContributionToActiveSquad(connection, {
        userId,
        contributionRow: {
          contribution_id: contributionId,
          user_id: userId,
          rotation_id: rotationId,
          contribution,
          remaining_hp: remainingHp,
          turns,
          submitted_at: now,
        },
        now,
      });
      await dbRunOn(connection, 'COMMIT');
      return result;
    } catch (error) {
      await dbRunOn(connection, 'ROLLBACK').catch(() => {});
      throw error;
    }
  });
}

async function run() {
  const now = Date.now();
  let users;
  let rotationId;
  await withDb(async connection => {
    await createSupportSchema(connection, now);
    users = await seedUsers(connection, now);
    rotationId = await loadCurrentRotationId(connection);
  });

  const create = await createRiftSquad(users.alpha.userId, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    mutationId: 'squad-create-alpha',
  }, now);
  assert.strictEqual(create.success, true);
  const replayCreate = await createRiftSquad(users.alpha.userId, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    mutationId: 'squad-create-alpha',
  }, now);
  assert.strictEqual(replayCreate.idempotent, true, 'create mutation replay should be marked idempotent');
  const squadId = create.dashboard.squad.squadId;

  await withDb(connection => dbRunOn(connection, `UPDATE social_profiles SET squad_invite_policy = 'disabled' WHERE user_id = ?`, [users.bravo.userId]));
  await expectErrorReason(() => inviteRiftSquadFriend(users.alpha.userId, squadId, {
    protocolVersion: PROTOCOL_VERSION,
    targetProfileId: users.bravo.profileId,
    mutationId: 'invite-bravo-disabled',
  }, now), 'target_unavailable');
  await withDb(connection => dbRunOn(connection, `UPDATE social_profiles SET squad_invite_policy = 'friends' WHERE user_id = ?`, [users.bravo.userId]));

  const inviteBravo = await inviteRiftSquadFriend(users.alpha.userId, squadId, {
    protocolVersion: PROTOCOL_VERSION,
    targetProfileId: users.bravo.profileId,
    mutationId: 'invite-bravo',
  }, now + 1);
  await acceptRiftSquadInvite(users.bravo.userId, inviteBravo.invite.inviteId, {
    protocolVersion: PROTOCOL_VERSION,
    mutationId: 'accept-bravo',
  }, now + 2);
  const inviteCharlie = await inviteRiftSquadFriend(users.alpha.userId, squadId, {
    protocolVersion: PROTOCOL_VERSION,
    targetProfileId: users.charlie.profileId,
    mutationId: 'invite-charlie',
  }, now + 3);
  await acceptRiftSquadInvite(users.charlie.userId, inviteCharlie.invite.inviteId, {
    protocolVersion: PROTOCOL_VERSION,
    mutationId: 'accept-charlie',
  }, now + 4);
  const inviteEchoForDecline = await inviteRiftSquadFriend(users.alpha.userId, squadId, {
    protocolVersion: PROTOCOL_VERSION,
    targetProfileId: users.echo.profileId,
    mutationId: 'invite-echo-decline',
  }, now + 5);
  const declined = await declineRiftSquadInvite(users.echo.userId, inviteEchoForDecline.invite.inviteId, {
    protocolVersion: PROTOCOL_VERSION,
    mutationId: 'decline-echo',
  }, now + 6);
  assert.strictEqual(declined.invite.status, 'declined');
  const inviteDelta = await inviteRiftSquadFriend(users.alpha.userId, squadId, {
    protocolVersion: PROTOCOL_VERSION,
    targetProfileId: users.delta.profileId,
    mutationId: 'invite-delta',
  }, now + 7);
  await acceptRiftSquadInvite(users.delta.userId, inviteDelta.invite.inviteId, {
    protocolVersion: PROTOCOL_VERSION,
    mutationId: 'accept-delta',
  }, now + 8);
  await expectErrorReason(() => inviteRiftSquadFriend(users.alpha.userId, squadId, {
    protocolVersion: PROTOCOL_VERSION,
    targetProfileId: users.echo.profileId,
    mutationId: 'invite-echo-full',
  }, now + 9), 'rift_squad_full');

  await linkContribution({
    userId: users.alpha.userId,
    rotationId,
    contributionId: 'squad-alpha-low',
    contribution: 1900,
    remainingHp: 12,
    turns: 14,
    now: now + 10,
  });
  await linkContribution({
    userId: users.alpha.userId,
    rotationId,
    contributionId: 'squad-alpha-best',
    contribution: 2500,
    remainingHp: 20,
    turns: 11,
    now: now + 11,
  });
  await linkContribution({
    userId: users.bravo.userId,
    rotationId,
    contributionId: 'squad-bravo-best',
    contribution: 2600,
    remainingHp: 18,
    turns: 12,
    now: now + 12,
  });
  const zeroContribution = await linkContribution({
    userId: users.charlie.userId,
    rotationId,
    contributionId: 'squad-charlie-zero',
    contribution: 0,
    remainingHp: 0,
    turns: 20,
    now: now + 12,
  });
  assert.deepStrictEqual(zeroContribution, { linked: false, reason: 'no_positive_contribution' }, 'zero contribution should not create a squad participation fact');
  const zeroSquadFact = await withDb(connection => dbGetOn(connection, `SELECT contribution_id FROM world_rift_squad_contributions WHERE contribution_id = ?`, ['squad-charlie-zero']));
  assert.strictEqual(zeroSquadFact, null, 'zero contribution must not be inserted into squad contribution facts');
  await withDb(async connection => {
    await dbRunOn(connection, `INSERT INTO world_rift_squad_contributions
      (contribution_id, squad_id, rotation_id, user_id, contribution, remaining_hp, turns, linked_at, display_name_snapshot, profile_id_snapshot)
      VALUES ('legacy-charlie-zero', ?, ?, ?, 0, 0, 20, ?, 'charlie', ?)`, [squadId, rotationId, users.charlie.userId, now + 12, users.charlie.profileId]);
    await dbRunOn(connection, `UPDATE world_rift_squad_members SET locked_at = ? WHERE squad_id = ? AND user_id = ?`, [now + 12, squadId, users.charlie.userId]);
  });

  const dashboard = await getRiftSquadDashboard(users.alpha.userId, {
    currentRotationId: rotationId,
    now: now + 13,
  });
  assert.strictEqual(dashboard.enabled, true);
  assert.strictEqual(dashboard.current.squad.memberCount, 4, 'squad should cap at four active members');
  assert.strictEqual(dashboard.current.squad.lockedMemberCount, 2, 'contributing members should be locked');
  assert.strictEqual(dashboard.current.squad.cooperativeScore, 5100, 'squad score should sum each member best contribution only');
  assert.strictEqual(dashboard.current.squad.contributingMembers, 2);
  assert.strictEqual(dashboard.current.squad.members.find(member => member.profileId === users.charlie.profileId)?.isContributor, false, 'legacy zero row must not project as real participation');
  assert.strictEqual(dashboard.current.squad.bestRemainingHpSum, 38);
  assert.strictEqual(dashboard.current.squad.bestTurnsSum, 23);
  assert(dashboard.current.leaderboard.entries.some(entry => entry.squadId === squadId), 'squad leaderboard should include active squad');
  await expectErrorReason(() => leaveRiftSquad(users.alpha.userId, squadId, {
    protocolVersion: PROTOCOL_VERSION,
    mutationId: 'leave-alpha-locked',
  }, now + 14), 'rift_squad_membership_locked');

  const claim = await claimRiftSquadReward(users.alpha.userId, squadId, 'squad-5000', {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    milestoneId: 'squad-5000',
    mutationId: 'claim-5000-alpha',
  }, now + 15);
  assert.strictEqual(claim.claim.rewardImpact, 'cosmetic_only');
  assert.strictEqual(claim.balance.spendPolicy, 'cosmetic_only');
  const claimReplay = await claimRiftSquadReward(users.alpha.userId, squadId, 'squad-5000', {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    milestoneId: 'squad-5000',
    mutationId: 'claim-5000-alpha',
  }, now + 16);
  assert.strictEqual(claimReplay.idempotent, true, 'claim replay should be idempotent');
  const secondClaim = await claimRiftSquadReward(users.alpha.userId, squadId, 'squad-5000', {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    milestoneId: 'squad-5000',
    mutationId: 'claim-5000-alpha-second',
  }, now + 17);
  assert.strictEqual(secondClaim.alreadyClaimed, true);
  await expectErrorReason(() => claimRiftSquadReward(users.charlie.userId, squadId, 'squad-5000', {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    milestoneId: 'squad-5000',
    mutationId: 'claim-charlie-no-contribution',
  }, now + 18), 'rift_squad_claim_unavailable');

  const solo = await createRiftSquad(users.echo.userId, {
    protocolVersion: PROTOCOL_VERSION,
    rotationId,
    mutationId: 'squad-create-echo',
  }, now + 19);
  const soloSquadId = solo.dashboard.squad.squadId;
  await withDb(async connection => {
    await dbRunOn(connection, `INSERT INTO world_rift_squad_contributions
      (contribution_id, squad_id, rotation_id, user_id, contribution, remaining_hp, turns, linked_at, display_name_snapshot, profile_id_snapshot)
      VALUES ('legacy-echo-zero', ?, ?, ?, 0, 0, 20, ?, 'echo', ?)`, [soloSquadId, rotationId, users.echo.userId, now + 19, users.echo.profileId]);
    await dbRunOn(connection, `UPDATE world_rift_squad_members SET locked_at = ? WHERE squad_id = ? AND user_id = ?`, [now + 19, soloSquadId, users.echo.userId]);
  });
  const soloLeave = await leaveRiftSquad(users.echo.userId, soloSquadId, {
    protocolVersion: PROTOCOL_VERSION,
    mutationId: 'leave-echo-unlocked',
  }, now + 20);
  assert.strictEqual(soloLeave.deleted, true, 'legacy zero-only contribution must not prevent the last member from leaving');
  const leftRow = await withDb(connection => dbGetOn(connection, `SELECT status FROM world_rift_squad_members WHERE squad_id = ? AND user_id = ?`, [
    soloSquadId,
    users.echo.userId,
  ]));
  assert.strictEqual(leftRow.status, 'left', 'unlocked leave should persist a left status, not a locked contribution state');

  const current = await getCurrentWorldRift(users.alpha.userId, now + 21);
  assert.strictEqual(current.riftSquad.enabled, true);
  assert.strictEqual(current.riftSquad.current.squad.squadId, squadId, 'world-rift current should expose the active squad projection');

  const [claimRows, ledgerRows] = await withDb(async connection => Promise.all([
    dbAllOn(connection, `SELECT * FROM world_rift_squad_reward_claims WHERE user_id = ? AND squad_id = ? AND milestone_id = ?`, [
      users.alpha.userId,
      squadId,
      'squad-5000',
    ]),
    dbAllOn(connection, `SELECT * FROM progression_economy_ledger WHERE user_id = ? AND source_type = 'world_rift_squad_reward'`, [
      users.alpha.userId,
    ]),
  ]));
  assert.strictEqual(claimRows.length, 1, 'squad claim should persist one claim fact');
  assert.strictEqual(ledgerRows.length, 1, 'squad claim should mint one cosmetic ledger entry');
  assert.strictEqual(ledgerRows[0].reward_impact, 'cosmetic_only');
}

run()
  .then(async () => {
    await new Promise(resolve => sharedDb.close(resolve));
    removeDbFiles();
    console.log('sanity_world_rift_squad_platform_checks passed');
  })
  .catch(async error => {
    await new Promise(resolve => sharedDb.close(resolve));
    removeDbFiles();
    console.error(error);
    process.exitCode = 1;
  });
