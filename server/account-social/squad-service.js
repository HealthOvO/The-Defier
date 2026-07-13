const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../db/database');
const {
    deterministicId,
    hashCanonical,
    sha256,
    stableStringify
} = require('../progression/authoritative-runs/canonical');
const {
    REWARD_CURRENCY,
    REWARD_IMPACT
} = require('../world-rift/catalog');

const PROTOCOL_VERSION = 'world-rift-squad-v1';
const REPORT_VERSION = 'world-rift-squad-v1';
const SAFE_ID = /^[A-Za-z0-9._:-]{2,128}$/;
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_MEMBERS = 4;
const LEADERBOARD_LIMIT = 20;
const ACTIVE_MEMBER_STATUS = 'active';
const LEFT_MEMBER_STATUS = 'left';
const REQUIRED_TABLES = Object.freeze([
    'users',
    'world_rift_rotations',
    'world_rift_squads',
    'world_rift_squad_members',
    'world_rift_squad_invites',
    'world_rift_squad_contributions',
    'world_rift_squad_entries',
    'world_rift_squad_reward_claims',
    'world_rift_squad_mutations',
    'progression_economy_balances',
    'progression_economy_ledger'
]);
const SOCIAL_REQUIRED_TABLES = Object.freeze([
    'social_profiles',
    'social_friendships',
    'social_relationship_controls'
]);
const CLAIM_MILESTONES = Object.freeze([
    { milestoneId: 'squad-2000', targetScore: 2000, amount: 30, title: '裂隙协作·同心初成' },
    { milestoneId: 'squad-5000', targetScore: 5000, amount: 60, title: '裂隙协作·界痕共振' },
    { milestoneId: 'squad-8000', targetScore: 8000, amount: 100, title: '裂隙协作·四象同裂' }
]);

/*
Required schema contract for this service:

world_rift_squads
  squad_id PK, rotation_id, leader_user_id, status, created_at, updated_at
world_rift_squad_members
  squad_id + user_id PK, rotation_id, status, role, joined_at, left_at, locked_at,
  display_name_snapshot, profile_id_snapshot, updated_at
world_rift_squad_invites
  invite_id PK, squad_id, rotation_id, inviter_user_id, invitee_user_id, status,
  expires_at, responded_at, inviter_name_snapshot, inviter_profile_id_snapshot,
  invitee_name_snapshot, invitee_profile_id_snapshot, created_at, updated_at
world_rift_squad_contributions
  contribution_id PK, squad_id, rotation_id, user_id, contribution, remaining_hp, turns,
  linked_at, display_name_snapshot, profile_id_snapshot
world_rift_squad_entries
  rotation_id + squad_id PK, cooperative_score, contributing_members, best_remaining_hp_sum,
  best_turns_sum, member_count, locked_member_count, member_best_json, updated_at
world_rift_squad_reward_claims
  claim_id PK, user_id, rotation_id, squad_id, milestone_id, currency, amount,
  reward_impact, ledger_entry_id, claim_payload_json, claimed_at
world_rift_squad_mutations
  user_id + mutation_id PK, rotation_id, request_type, request_hash, request_body_json,
  receipt_json, squad_id, invite_id, claim_id, created_at

social validation fallback expects:
  social_profiles(user_id, profile_id, squad_invite_policy)
  social_friendships(user_low_id, user_high_id, status)
  social_relationship_controls(owner_user_id, target_user_id, is_blocked)
*/

function openDb() {
    const connection = new sqlite3.Database(dbPath);
    connection.configure('busyTimeout', Number(process.env.DEFIER_SQLITE_BUSY_TIMEOUT_MS || 5000));
    return connection;
}

function dbRun(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function dbGet(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row || null);
        });
    });
}

function dbAll(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

function closeDb(connection) {
    return new Promise(resolve => connection.close(() => resolve()));
}

let writeTail = Promise.resolve();

async function withWriteTransaction(fn) {
    let releaseQueue;
    const myTurn = new Promise(resolve => {
        releaseQueue = resolve;
    });
    const previousTurn = writeTail;
    writeTail = previousTurn.catch(() => {}).then(() => myTurn);
    await previousTurn.catch(() => {});
    const connection = openDb();
    try {
        await dbRun(connection, 'BEGIN IMMEDIATE');
        const result = await fn(connection);
        await dbRun(connection, 'COMMIT');
        return result;
    } catch (error) {
        try {
            await dbRun(connection, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[RiftSquad] Write rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        await closeDb(connection);
        releaseQueue();
    }
}

async function withReadConnection(fn) {
    const connection = openDb();
    try {
        return await fn(connection);
    } finally {
        await closeDb(connection);
    }
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function createNowProvider(value) {
    if (typeof value === 'function') return () => clampInt(value());
    if (Number.isFinite(Number(value))) {
        const fixed = clampInt(value);
        return () => fixed;
    }
    return () => Date.now();
}

function parseJson(value, fallback = null) {
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
        return fallback;
    }
}

function safeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
}

function makeError(statusCode, reason, message, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.reason = reason;
    if (details) error.details = details;
    return error;
}

function makeMutationConflictError() {
    return makeError(409, 'mutation_reused', 'mutationId 已被其他请求占用');
}

function makeSchemaContract() {
    return {
        protocolVersion: PROTOCOL_VERSION,
        requiredTables: REQUIRED_TABLES.slice(),
        socialTables: SOCIAL_REQUIRED_TABLES.slice(),
        maxMembers: MAX_MEMBERS,
        inviteTtlMs: INVITE_TTL_MS,
        milestones: CLAIM_MILESTONES.map(entry => ({
            milestoneId: entry.milestoneId,
            targetScore: entry.targetScore,
            amount: entry.amount,
            currency: REWARD_CURRENCY,
            rewardImpact: REWARD_IMPACT
        }))
    };
}

function makeSchemaMissingError(missingTables) {
    return makeError(503, 'rift_squad_schema_missing', '裂隙小队数据表尚未就绪', {
        missingTables,
        contract: makeSchemaContract()
    });
}

function assertAllowedKeys(source, allowed, reason = 'invalid_request_payload') {
    const unknown = Object.keys(source).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
        throw makeError(400, reason, `请求包含不允许字段: ${unknown[0]}`);
    }
}

function normalizeCreateRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'rotationId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const rotationId = safeId(source.rotationId);
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '裂隙小队协议版本不受支持');
    }
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, rotationId, mutationId };
}

function normalizeInviteRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'targetProfileId', 'targetUserId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const targetProfileId = safeId(source.targetProfileId);
    const targetUserId = safeId(source.targetUserId);
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '裂隙小队协议版本不受支持');
    }
    if (!targetProfileId && !targetUserId) {
        throw makeError(400, 'invalid_target_profile_id', 'targetProfileId 非法');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, targetProfileId, targetUserId, mutationId };
}

function normalizeTerminalInviteRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '裂隙小队协议版本不受支持');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, mutationId };
}

function normalizeClaimRequest(squadIdFromPath, milestoneIdFromPath, rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'rotationId', 'milestoneId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const rotationId = safeId(source.rotationId);
    const mutationId = safeId(source.mutationId);
    const milestoneId = safeId(source.milestoneId);
    const squadId = safeId(squadIdFromPath);
    const requestedMilestoneId = safeId(milestoneIdFromPath);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '裂隙小队协议版本不受支持');
    }
    if (!squadId) throw makeError(400, 'invalid_squad_id', 'squadId 非法');
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!milestoneId || milestoneId !== requestedMilestoneId) {
        throw makeError(400, 'milestone_id_mismatch', '里程碑与请求路径不一致');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, rotationId, squadId, milestoneId, mutationId };
}

function rotationLifecycleState(rotation, now = Date.now()) {
    if (!rotation) return 'closed';
    if (now < clampInt(rotation.starts_at ?? rotation.startsAt)) return 'pending';
    if (now < clampInt(rotation.ends_at ?? rotation.endsAt)) return 'active';
    if (now < clampInt(rotation.grace_ends_at ?? rotation.graceEndsAt)) return 'grace';
    if (now < clampInt(rotation.claim_ends_at ?? rotation.claimEndsAt)) return 'claim';
    return 'closed';
}

function requireCoordinationOpen(rotation, now = Date.now()) {
    const state = rotationLifecycleState(rotation, now);
    if (state !== 'active') {
        throw makeError(409, 'rift_squad_rotation_closed', '当前裂隙轮换已停止小队建队与邀请');
    }
}

function requireClaimOpen(rotation, now = Date.now()) {
    if (now >= clampInt(rotation.claim_ends_at ?? rotation.claimEndsAt)) {
        throw makeError(409, 'rift_squad_claim_window_closed', '当前裂隙小队领奖窗口已关闭');
    }
}

async function listMissingTables(connection, tableNames) {
    const rows = await dbAll(
        connection,
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN (${tableNames.map(() => '?').join(', ')})`,
        tableNames
    );
    const present = new Set(rows.map(row => String(row.name || '')));
    return tableNames.filter(name => !present.has(name));
}

async function assertTables(connection, tableNames) {
    const missing = await listMissingTables(connection, tableNames);
    if (missing.length > 0) throw makeSchemaMissingError(missing);
}

async function ensureMutationAvailable(connection, userId, mutationId, requestHash) {
    const existing = await dbGet(
        connection,
        `SELECT request_hash, receipt_json
         FROM world_rift_squad_mutations
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
    if (!existing) return null;
    if (String(existing.request_hash || '') !== String(requestHash || '')) {
        throw makeMutationConflictError();
    }
    const receipt = parseJson(existing.receipt_json, {});
    if (receipt && typeof receipt === 'object') receipt.idempotent = true;
    return receipt;
}

async function storeMutationReceipt(connection, {
    userId,
    mutationId,
    rotationId,
    requestType,
    requestHash,
    requestBody,
    receipt,
    squadId = '',
    inviteId = '',
    claimId = '',
    now = Date.now()
}) {
    await dbRun(
        connection,
        `INSERT OR REPLACE INTO world_rift_squad_mutations
            (user_id, mutation_id, rotation_id, request_type, request_hash, request_body_json, receipt_json,
             squad_id, invite_id, claim_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            mutationId,
            rotationId,
            requestType,
            requestHash,
            stableStringify(requestBody || {}),
            stableStringify(receipt || {}),
            String(squadId || ''),
            String(inviteId || ''),
            String(claimId || ''),
            clampInt(now)
        ]
    );
    return receipt;
}

async function loadRotation(connection, rotationId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_rotations
         WHERE rotation_id = ?`,
        [rotationId]
    );
}

async function loadUserSnapshot(connection, userId) {
    const row = await dbGet(
        connection,
        `SELECT u.id AS user_id,
                u.username,
                sp.profile_id,
                COALESCE(sp.squad_invite_policy, 'friends') AS squad_invite_policy
         FROM users u
         LEFT JOIN social_profiles sp ON sp.user_id = u.id
         WHERE u.id = ?`,
        [userId]
    );
    if (!row) throw makeError(404, 'user_not_found', '账号不存在');
    return {
        userId: String(row.user_id || userId),
        userName: String(row.username || ''),
        profileId: String(row.profile_id || `profile-${sha256(String(userId || '')).slice(0, 16)}`),
        squadInvitePolicy: String(row.squad_invite_policy || 'friends')
    };
}

async function loadProfileById(connection, profileId) {
    const row = await dbGet(
        connection,
        `SELECT sp.profile_id, sp.user_id, COALESCE(sp.squad_invite_policy, 'friends') AS squad_invite_policy, u.username
         FROM social_profiles sp
         JOIN users u ON u.id = sp.user_id
         WHERE sp.profile_id = ?`,
        [profileId]
    );
    if (!row) {
        throw makeError(404, 'target_unavailable', '目标道友不可用');
    }
    return {
        profileId: String(row.profile_id || ''),
        userId: String(row.user_id || ''),
        userName: String(row.username || ''),
        squadInvitePolicy: String(row.squad_invite_policy || 'friends')
    };
}

async function loadSquadById(connection, squadId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_squads
         WHERE squad_id = ?`,
        [squadId]
    );
}

async function loadEntry(connection, rotationId, squadId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_squad_entries
         WHERE rotation_id = ? AND squad_id = ?`,
        [rotationId, squadId]
    );
}

async function loadMemberBySquadUser(connection, squadId, userId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_squad_members
         WHERE squad_id = ? AND user_id = ?`,
        [squadId, userId]
    );
}

async function loadActiveMemberByRotation(connection, rotationId, userId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_squad_members
         WHERE rotation_id = ?
           AND user_id = ?
           AND status = ?`,
        [rotationId, userId, ACTIVE_MEMBER_STATUS]
    );
}

async function loadContributionLinkedSquad(connection, rotationId, userId) {
    return dbGet(
        connection,
        `SELECT squad_id, COUNT(*) AS contribution_count, MAX(linked_at) AS last_linked_at
         FROM world_rift_squad_contributions
         WHERE rotation_id = ?
           AND user_id = ?
           AND contribution > 0
         GROUP BY squad_id
         ORDER BY last_linked_at DESC, squad_id ASC
         LIMIT 1`,
        [rotationId, userId]
    );
}

async function listActiveMembers(connection, squadId) {
    return dbAll(
        connection,
        `SELECT *
         FROM world_rift_squad_members
         WHERE squad_id = ?
           AND status = ?
         ORDER BY CASE WHEN role = 'leader' THEN 0 ELSE 1 END ASC, joined_at ASC, user_id ASC`,
        [squadId, ACTIVE_MEMBER_STATUS]
    );
}

async function expirePendingInvites(connection, { rotationId = '', squadId = '', inviteeUserId = '', now = Date.now() } = {}) {
    const clauses = [`status = 'pending'`, 'expires_at <= ?'];
    const params = [clampInt(now)];
    if (rotationId) {
        clauses.push('rotation_id = ?');
        params.push(rotationId);
    }
    if (squadId) {
        clauses.push('squad_id = ?');
        params.push(squadId);
    }
    if (inviteeUserId) {
        clauses.push('invitee_user_id = ?');
        params.push(inviteeUserId);
    }
    await dbRun(
        connection,
        `UPDATE world_rift_squad_invites
         SET status = 'expired',
             responded_at = CASE WHEN responded_at > 0 THEN responded_at ELSE ? END,
             updated_at = ?
         WHERE ${clauses.join(' AND ')}`,
        [clampInt(now), clampInt(now), ...params]
    );
}

async function listPendingInvitesForUser(connection, rotationId, userId, now = Date.now()) {
    await expirePendingInvites(connection, { rotationId, inviteeUserId: userId, now });
    return dbAll(
        connection,
        `SELECT *
         FROM world_rift_squad_invites
         WHERE rotation_id = ?
           AND invitee_user_id = ?
           AND status = 'pending'
         ORDER BY created_at DESC, invite_id ASC`,
        [rotationId, userId]
    );
}

async function listPendingInvitesForSquad(connection, squadId, now = Date.now()) {
    await expirePendingInvites(connection, { squadId, now });
    return dbAll(
        connection,
        `SELECT *
         FROM world_rift_squad_invites
         WHERE squad_id = ?
           AND status = 'pending'
         ORDER BY created_at DESC, invite_id ASC`,
        [squadId]
    );
}

async function hasBlockingControl(connection, leftUserId, rightUserId) {
    const row = await dbGet(
        connection,
        `SELECT 1
         FROM social_relationship_controls
         WHERE ((owner_user_id = ? AND target_user_id = ?) OR (owner_user_id = ? AND target_user_id = ?))
           AND COALESCE(is_blocked, 0) = 1
         LIMIT 1`,
        [leftUserId, rightUserId, rightUserId, leftUserId]
    );
    return !!row;
}

function sortFriendPair(leftUserId, rightUserId) {
    return [String(leftUserId || ''), String(rightUserId || '')].sort((left, right) => left.localeCompare(right));
}

async function hasFriendship(connection, leftUserId, rightUserId) {
    const [userLowId, userHighId] = sortFriendPair(leftUserId, rightUserId);
    const row = await dbGet(
        connection,
        `SELECT 1
         FROM social_friendships
         WHERE user_low_id = ?
           AND user_high_id = ?
           AND COALESCE(status, 'accepted') = 'accepted'
         LIMIT 1`,
        [userLowId, userHighId]
    );
    return !!row;
}

let cachedSocialService;
function getSocialService() {
    if (cachedSocialService !== undefined) return cachedSocialService;
    try {
        cachedSocialService = require('./social-service');
    } catch (error) {
        cachedSocialService = null;
    }
    return cachedSocialService;
}

async function fallbackAssertInviteAllowed(connection, inviterUserId, inviteeUserId) {
    if (String(inviterUserId || '') === String(inviteeUserId || '')) {
        throw makeError(409, 'target_unavailable', '不能邀请自己进入裂隙小队');
    }
    if (await hasBlockingControl(connection, inviterUserId, inviteeUserId)) {
        throw makeError(404, 'target_unavailable', '目标道友不可用');
    }
    const areFriends = await hasFriendship(connection, inviterUserId, inviteeUserId);
    if (!areFriends) {
        throw makeError(404, 'target_unavailable', '目标道友不可用');
    }
    const snapshot = await loadUserSnapshot(connection, inviteeUserId);
    if (String(snapshot.squadInvitePolicy || 'friends') !== 'friends') {
        throw makeError(404, 'target_unavailable', '目标道友不可用');
    }
    return snapshot;
}

async function assertInviteAllowed(connection, inviterUserId, inviteeUserId) {
    const socialService = getSocialService();
    if (socialService && typeof socialService.assertRiftSquadInviteAllowed === 'function') {
        return socialService.assertRiftSquadInviteAllowed(connection, {
            inviterUserId,
            inviteeUserId
        });
    }
    return fallbackAssertInviteAllowed(connection, inviterUserId, inviteeUserId);
}

async function resolveInvitee(connection, request) {
    if (request.targetUserId) {
        return loadUserSnapshot(connection, request.targetUserId);
    }
    return loadProfileById(connection, request.targetProfileId);
}

function compareContributionRows(left, right) {
    const contributionDelta = clampInt(right.contribution) - clampInt(left.contribution);
    if (contributionDelta !== 0) return contributionDelta;
    const hpDelta = clampInt(right.remaining_hp ?? right.remainingHp) - clampInt(left.remaining_hp ?? left.remainingHp);
    if (hpDelta !== 0) return hpDelta;
    const turnDelta = clampInt(left.turns) - clampInt(right.turns);
    if (turnDelta !== 0) return turnDelta;
    return String(left.contribution_id || '').localeCompare(String(right.contribution_id || ''));
}

async function computeSquadAggregation(connection, squadId) {
    const members = await listActiveMembers(connection, squadId);
    if (members.length === 0) {
        return {
            memberCount: 0,
            lockedMemberCount: 0,
            cooperativeScore: 0,
            contributingMembers: 0,
            bestRemainingHpSum: 0,
            bestTurnsSum: 0,
            memberBest: []
        };
    }
    const contributions = await dbAll(
        connection,
        `SELECT *
         FROM world_rift_squad_contributions
         WHERE squad_id = ?
           AND contribution > 0
         ORDER BY contribution DESC, remaining_hp DESC, turns ASC, contribution_id ASC`,
        [squadId]
    );
    const bestByUser = new Map();
    contributions.forEach(row => {
        const userId = String(row.user_id || '');
        if (!bestByUser.has(userId)) {
            bestByUser.set(userId, row);
        }
    });
    const memberBest = members.map(member => {
        const best = bestByUser.get(String(member.user_id || '')) || null;
        return {
            userId: String(member.user_id || ''),
            userName: String(member.display_name_snapshot || ''),
            profileId: String(member.profile_id_snapshot || ''),
            role: String(member.role || 'member'),
            joinedAt: clampInt(member.joined_at),
            lockedAt: best ? clampInt(member.locked_at) : 0,
            bestContribution: clampInt(best && best.contribution),
            bestRemainingHp: clampInt(best && best.remaining_hp),
            bestTurns: clampInt(best && best.turns),
            contributionId: String(best && best.contribution_id || ''),
            isContributor: !!best
        };
    });
    const contributingMembers = memberBest.filter(entry => entry.isContributor);
    return {
        memberCount: members.length,
        lockedMemberCount: memberBest.filter(entry => entry.isContributor && entry.lockedAt > 0).length,
        cooperativeScore: contributingMembers.reduce((sum, entry) => sum + clampInt(entry.bestContribution), 0),
        contributingMembers: contributingMembers.length,
        bestRemainingHpSum: contributingMembers.reduce((sum, entry) => sum + clampInt(entry.bestRemainingHp), 0),
        bestTurnsSum: contributingMembers.reduce((sum, entry) => sum + clampInt(entry.bestTurns), 0),
        memberBest
    };
}

async function rebuildSquadEntry(connection, squadId, rotationId, now = Date.now()) {
    const squad = await loadSquadById(connection, squadId);
    if (!squad || String(squad.status || 'active') !== 'active') {
        await dbRun(
            connection,
            `DELETE FROM world_rift_squad_entries
             WHERE rotation_id = ? AND squad_id = ?`,
            [rotationId, squadId]
        );
        return null;
    }
    const aggregation = await computeSquadAggregation(connection, squadId);
    if (aggregation.memberCount <= 0) {
        await dbRun(
            connection,
            `DELETE FROM world_rift_squad_entries
             WHERE rotation_id = ? AND squad_id = ?`,
            [rotationId, squadId]
        );
        return null;
    }
    await dbRun(
        connection,
        `INSERT INTO world_rift_squad_entries
            (rotation_id, squad_id, cooperative_score, contributing_members, best_remaining_hp_sum,
             best_turns_sum, member_count, locked_member_count, member_best_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(rotation_id, squad_id) DO UPDATE SET
            cooperative_score = excluded.cooperative_score,
            contributing_members = excluded.contributing_members,
            best_remaining_hp_sum = excluded.best_remaining_hp_sum,
            best_turns_sum = excluded.best_turns_sum,
            member_count = excluded.member_count,
            locked_member_count = excluded.locked_member_count,
            member_best_json = excluded.member_best_json,
            updated_at = excluded.updated_at`,
        [
            rotationId,
            squadId,
            clampInt(aggregation.cooperativeScore),
            clampInt(aggregation.contributingMembers),
            clampInt(aggregation.bestRemainingHpSum),
            clampInt(aggregation.bestTurnsSum),
            clampInt(aggregation.memberCount),
            clampInt(aggregation.lockedMemberCount),
            stableStringify(aggregation.memberBest),
            clampInt(now)
        ]
    );
    return loadEntry(connection, rotationId, squadId);
}

function formatBalance(balance) {
    if (!balance) return null;
    return {
        currency: String(balance.currency || REWARD_CURRENCY),
        balance: clampInt(balance.balance),
        lifetimeEarned: clampInt(balance.lifetime_earned),
        lifetimeSpent: clampInt(balance.lifetime_spent),
        updatedAt: clampInt(balance.updated_at),
        spendPolicy: 'cosmetic_only'
    };
}

function formatRotation(rotation, now = Date.now()) {
    if (!rotation) return null;
    return {
        rotationId: String(rotation.rotation_id || ''),
        title: String(rotation.title || ''),
        startsAt: clampInt(rotation.starts_at),
        endsAt: clampInt(rotation.ends_at),
        graceEndsAt: clampInt(rotation.grace_ends_at),
        claimEndsAt: clampInt(rotation.claim_ends_at),
        state: rotationLifecycleState(rotation, now)
    };
}

function formatInviteRow(row, selfUserId) {
    if (!row) return null;
    const isInvitee = String(row.invitee_user_id || '') === String(selfUserId || '');
    return {
        inviteId: String(row.invite_id || ''),
        squadId: String(row.squad_id || ''),
        rotationId: String(row.rotation_id || ''),
        status: String(row.status || ''),
        expiresAt: clampInt(row.expires_at),
        respondedAt: clampInt(row.responded_at),
        createdAt: clampInt(row.created_at),
        inviter: {
            userName: String(row.inviter_name_snapshot || ''),
            profileId: String(row.inviter_profile_id_snapshot || '')
        },
        invitee: {
            userName: String(row.invitee_name_snapshot || ''),
            profileId: String(row.invitee_profile_id_snapshot || '')
        },
        direction: isInvitee ? 'received' : 'sent'
    };
}

function formatMilestones(entry, claimMap, hasContribution) {
    const cooperativeScore = clampInt(entry && entry.cooperative_score);
    return CLAIM_MILESTONES.map(milestone => {
        const claimedAt = clampInt(claimMap.get(milestone.milestoneId));
        const unlocked = cooperativeScore >= clampInt(milestone.targetScore);
        return {
            milestoneId: milestone.milestoneId,
            title: milestone.title,
            targetScore: milestone.targetScore,
            unlocked,
            claimable: unlocked && hasContribution && claimedAt === 0,
            claimed: claimedAt > 0,
            claimedAt,
            reward: {
                rewardType: 'world_rift_squad_milestone',
                currency: REWARD_CURRENCY,
                amount: milestone.amount,
                rewardImpact: REWARD_IMPACT,
                spendPolicy: 'cosmetic_only'
            }
        };
    });
}

async function loadClaimMap(connection, userId, rotationId, squadId) {
    const rows = await dbAll(
        connection,
        `SELECT milestone_id, claimed_at
         FROM world_rift_squad_reward_claims
         WHERE user_id = ?
           AND rotation_id = ?
           AND squad_id = ?`,
        [userId, rotationId, squadId]
    );
    return new Map(rows.map(row => [String(row.milestone_id || ''), clampInt(row.claimed_at)]));
}

function formatSquadProjection(squad, entry, aggregation, selfUserId) {
    if (!squad || !aggregation) return null;
    const leader = aggregation.memberBest.find(member => member.role === 'leader') || aggregation.memberBest[0] || null;
    return {
        squadId: String(squad.squad_id || ''),
        rotationId: String(squad.rotation_id || ''),
        status: String(squad.status || 'active'),
        leaderProfileId: String(leader && leader.profileId || ''),
        leaderName: String(leader && leader.userName || ''),
        cooperativeScore: clampInt((entry && entry.cooperative_score) ?? aggregation.cooperativeScore),
        contributingMembers: clampInt((entry && entry.contributing_members) ?? aggregation.contributingMembers),
        bestRemainingHpSum: clampInt((entry && entry.best_remaining_hp_sum) ?? aggregation.bestRemainingHpSum),
        bestTurnsSum: clampInt((entry && entry.best_turns_sum) ?? aggregation.bestTurnsSum),
        memberCount: clampInt((entry && entry.member_count) ?? aggregation.memberCount),
        lockedMemberCount: clampInt((entry && entry.locked_member_count) ?? aggregation.lockedMemberCount),
        members: aggregation.memberBest.map(member => ({
            profileId: String(member.profileId || ''),
            userName: String(member.userName || ''),
            role: String(member.role || 'member'),
            joinedAt: clampInt(member.joinedAt),
            lockedAt: clampInt(member.lockedAt),
            isContributor: !!member.isContributor,
            bestContribution: clampInt(member.bestContribution),
            bestRemainingHp: clampInt(member.bestRemainingHp),
            bestTurns: clampInt(member.bestTurns),
            isSelf: String(member.userId || '') === String(selfUserId || '')
        }))
    };
}

async function getLeaderboard(connection, rotationId, selfSquadId = '') {
    const rows = await dbAll(
        connection,
        `SELECT e.*
         FROM world_rift_squad_entries e
         JOIN world_rift_squads s ON s.squad_id = e.squad_id
         WHERE e.rotation_id = ?
           AND COALESCE(s.status, 'active') = 'active'
         ORDER BY e.cooperative_score DESC, e.contributing_members DESC, e.best_remaining_hp_sum DESC, e.best_turns_sum ASC, e.squad_id ASC
         LIMIT ?`,
        [rotationId, LEADERBOARD_LIMIT]
    );
    let myRank = null;
    if (selfSquadId) {
        const selfEntry = await loadEntry(connection, rotationId, selfSquadId);
        if (selfEntry) {
            const rankRow = await dbGet(
                connection,
                `SELECT COUNT(*) AS count
                 FROM world_rift_squad_entries
                 WHERE rotation_id = ?
                   AND (
                        cooperative_score > ?
                     OR (cooperative_score = ? AND contributing_members > ?)
                     OR (cooperative_score = ? AND contributing_members = ? AND best_remaining_hp_sum > ?)
                     OR (cooperative_score = ? AND contributing_members = ? AND best_remaining_hp_sum = ? AND best_turns_sum < ?)
                     OR (cooperative_score = ? AND contributing_members = ? AND best_remaining_hp_sum = ? AND best_turns_sum = ? AND squad_id < ?)
                   )`,
                [
                    rotationId,
                    clampInt(selfEntry.cooperative_score),
                    clampInt(selfEntry.cooperative_score), clampInt(selfEntry.contributing_members),
                    clampInt(selfEntry.cooperative_score), clampInt(selfEntry.contributing_members), clampInt(selfEntry.best_remaining_hp_sum),
                    clampInt(selfEntry.cooperative_score), clampInt(selfEntry.contributing_members), clampInt(selfEntry.best_remaining_hp_sum), clampInt(selfEntry.best_turns_sum),
                    clampInt(selfEntry.cooperative_score), clampInt(selfEntry.contributing_members), clampInt(selfEntry.best_remaining_hp_sum), clampInt(selfEntry.best_turns_sum), String(selfEntry.squad_id || '')
                ]
            );
            myRank = {
                rank: clampInt(rankRow && rankRow.count) + 1,
                squadId: String(selfEntry.squad_id || '')
            };
        }
    }
    return {
        entries: rows.map((row, index) => ({
            rank: index + 1,
            squadId: String(row.squad_id || ''),
            cooperativeScore: clampInt(row.cooperative_score),
            contributingMembers: clampInt(row.contributing_members),
            bestRemainingHpSum: clampInt(row.best_remaining_hp_sum),
            bestTurnsSum: clampInt(row.best_turns_sum),
            memberCount: clampInt(row.member_count),
            lockedMemberCount: clampInt(row.locked_member_count),
            members: parseJson(row.member_best_json, []).map(member => ({
                profileId: String(member.profileId || ''),
                userName: String(member.userName || ''),
                role: String(member.role || 'member'),
                bestContribution: clampInt(member.bestContribution),
                isContributor: !!member.isContributor
            })),
            isSelf: String(row.squad_id || '') === String(selfSquadId || '')
        })),
        myRank
    };
}

async function buildRotationDashboard(connection, userId, rotationId, now = Date.now(), { includeInvites = false, allowContributionFallback = false } = {}) {
    if (!rotationId) return null;
    const rotation = await loadRotation(connection, rotationId);
    if (!rotation) return null;
    let membership = await loadActiveMemberByRotation(connection, rotationId, userId);
    let contributionSquad = null;
    if (!membership && allowContributionFallback) {
        contributionSquad = await loadContributionLinkedSquad(connection, rotationId, userId);
    }
    const squadId = membership
        ? String(membership.squad_id || '')
        : String(contributionSquad && contributionSquad.squad_id || '');
    const squad = squadId ? await loadSquadById(connection, squadId) : null;
    const aggregation = squad ? await computeSquadAggregation(connection, squadId) : null;
    const entry = squad ? await loadEntry(connection, rotationId, squadId) : null;
    const claims = squad ? await loadClaimMap(connection, userId, rotationId, squadId) : new Map();
    const hasContribution = squad
        ? !!await dbGet(
            connection,
            `SELECT 1
             FROM world_rift_squad_contributions
             WHERE squad_id = ? AND user_id = ? AND contribution > 0
             LIMIT 1`,
            [squadId, userId]
        )
        : false;
    const pendingInvites = includeInvites && rotationLifecycleState(rotation, now) === 'active'
        ? await listPendingInvitesForUser(connection, rotationId, userId, now)
        : [];
    const sentInvites = includeInvites && squad && membership && String(membership.role || '') === 'leader'
        ? await listPendingInvitesForSquad(connection, squadId, now)
        : [];
    const leaderboard = await getLeaderboard(connection, rotationId, squadId);
    return {
        rotation: formatRotation(rotation, now),
        membership: membership ? {
            role: String(membership.role || 'member'),
            joinedAt: clampInt(membership.joined_at),
            lockedAt: hasContribution ? clampInt(membership.locked_at) : 0,
            status: String(membership.status || ACTIVE_MEMBER_STATUS)
        } : null,
        squad: formatSquadProjection(squad, entry, aggregation, userId),
        milestones: squad ? formatMilestones(entry, claims, hasContribution) : [],
        leaderboard,
        invites: {
            received: pendingInvites.map(row => formatInviteRow(row, userId)),
            sent: sentInvites.map(row => formatInviteRow(row, userId))
        }
    };
}

function buildDashboardEnvelope({ enabled, reason = '', current = null, previous = null, missingTables = [] }) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-dashboard`,
        protocolVersion: PROTOCOL_VERSION,
        enabled,
        reason: reason || undefined,
        current,
        previous,
        schemaContract: enabled ? undefined : {
            missingTables,
            ...makeSchemaContract()
        }
    };
}

async function getRiftSquadDashboard(userId, options = {}) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const now = clampInt(options.now ?? Date.now());
    if (options.connection) {
        const missing = await listMissingTables(options.connection, REQUIRED_TABLES);
        if (missing.length > 0) {
            return buildDashboardEnvelope({ enabled: false, reason: 'schema_missing', missingTables: missing });
        }
        return buildDashboardEnvelope({
            enabled: true,
            current: await buildRotationDashboard(options.connection, identity, String(options.currentRotationId || options.rotationId || ''), now, {
                includeInvites: true,
                allowContributionFallback: true
            }),
            previous: await buildRotationDashboard(options.connection, identity, String(options.previousRotationId || ''), now, {
                includeInvites: false,
                allowContributionFallback: true
            })
        });
    }
    return withReadConnection(async connection => {
        const missing = await listMissingTables(connection, REQUIRED_TABLES);
        if (missing.length > 0) {
            return buildDashboardEnvelope({ enabled: false, reason: 'schema_missing', missingTables: missing });
        }
        let currentRotationId = String(options.currentRotationId || options.rotationId || '');
        let previousRotationId = String(options.previousRotationId || '');
        if (!currentRotationId) {
            const currentRotation = await dbGet(
                connection,
                `SELECT rotation_id
                 FROM world_rift_rotations
                 ORDER BY starts_at DESC
                 LIMIT 1`
            );
            currentRotationId = String(currentRotation && currentRotation.rotation_id || '');
        }
        if (!previousRotationId && currentRotationId) {
            const previousRotation = await dbGet(
                connection,
                `SELECT rotation_id
                 FROM world_rift_rotations
                 WHERE rotation_id <> ?
                 ORDER BY starts_at DESC
                 LIMIT 1`,
                [currentRotationId]
            );
            previousRotationId = String(previousRotation && previousRotation.rotation_id || '');
        }
        return buildDashboardEnvelope({
            enabled: true,
            current: await buildRotationDashboard(connection, identity, currentRotationId, now, {
                includeInvites: true,
                allowContributionFallback: true
            }),
            previous: await buildRotationDashboard(connection, identity, previousRotationId, now, {
                includeInvites: false,
                allowContributionFallback: true
            })
        });
    });
}

async function createRiftSquad(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeCreateRequest(rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        const now = nowProvider();
        await assertTables(connection, REQUIRED_TABLES.concat(SOCIAL_REQUIRED_TABLES));
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const rotation = await loadRotation(connection, request.rotationId);
        if (!rotation) throw makeError(404, 'rift_squad_rotation_not_found', '裂隙轮换不存在');
        requireCoordinationOpen(rotation, now);
        const existingMembership = await loadActiveMemberByRotation(connection, request.rotationId, identity);
        if (existingMembership) {
            throw makeError(409, 'rift_squad_already_joined', '当前轮换已加入裂隙小队');
        }
        const snapshot = await loadUserSnapshot(connection, identity);
        const squadId = deterministicId('riftsquad', [request.rotationId, identity, request.mutationId]);
        await dbRun(
            connection,
            `INSERT INTO world_rift_squads
                (squad_id, rotation_id, leader_user_id, status, created_at, updated_at)
             VALUES (?, ?, ?, 'active', ?, ?)`,
            [squadId, request.rotationId, identity, now, now]
        );
        await dbRun(
            connection,
            `INSERT INTO world_rift_squad_members
                (squad_id, user_id, rotation_id, status, role, joined_at, left_at, locked_at,
                 display_name_snapshot, profile_id_snapshot, updated_at)
             VALUES (?, ?, ?, ?, 'leader', ?, 0, 0, ?, ?, ?)`,
            [squadId, identity, request.rotationId, ACTIVE_MEMBER_STATUS, now, snapshot.userName, snapshot.profileId, now]
        );
        await rebuildSquadEntry(connection, squadId, request.rotationId, now);
        const dashboard = await buildRotationDashboard(connection, identity, request.rotationId, now, {
            includeInvites: true,
            allowContributionFallback: true
        });
        const response = {
            success: true,
            reportVersion: `${REPORT_VERSION}-create`,
            protocolVersion: PROTOCOL_VERSION,
            idempotent: false,
            dashboard
        };
        return storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: request.rotationId,
            requestType: 'create',
            requestHash,
            requestBody: request,
            receipt: response,
            squadId,
            now
        });
    });
}

async function inviteRiftSquadFriend(userId, squadIdInput, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    const squadId = safeId(squadIdInput);
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    if (!squadId) throw makeError(400, 'invalid_squad_id', 'squadId 非法');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeInviteRequest(rawRequest);
    const requestHash = hashCanonical({ ...request, squadId });
    return withWriteTransaction(async connection => {
        const now = nowProvider();
        await assertTables(connection, REQUIRED_TABLES.concat(SOCIAL_REQUIRED_TABLES));
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const squad = await loadSquadById(connection, squadId);
        if (!squad || String(squad.status || 'active') !== 'active') {
            throw makeError(404, 'rift_squad_not_found', '裂隙小队不存在');
        }
        const rotation = await loadRotation(connection, String(squad.rotation_id || ''));
        if (!rotation) throw makeError(404, 'rift_squad_rotation_not_found', '裂隙轮换不存在');
        requireCoordinationOpen(rotation, now);
        const membership = await loadMemberBySquadUser(connection, squadId, identity);
        if (!membership || String(membership.status || '') !== ACTIVE_MEMBER_STATUS) {
            throw makeError(403, 'rift_squad_forbidden', '只有现役成员可以邀请道友');
        }
        if (String(membership.role || '') !== 'leader') {
            throw makeError(403, 'rift_squad_leader_required', '只有队长可以邀请道友');
        }
        const activeMembers = await listActiveMembers(connection, squadId);
        if (activeMembers.length >= MAX_MEMBERS) {
            throw makeError(409, 'rift_squad_full', '裂隙小队已满员');
        }
        const invitee = await resolveInvitee(connection, request);
        await assertInviteAllowed(connection, identity, invitee.userId);
        if (String(invitee.userId || '') === identity) {
            throw makeError(409, 'target_unavailable', '不能邀请自己进入裂隙小队');
        }
        const activeTargetMembership = await loadActiveMemberByRotation(connection, String(squad.rotation_id || ''), invitee.userId);
        if (activeTargetMembership) {
            if (String(activeTargetMembership.squad_id || '') === squadId) {
                throw makeError(409, 'rift_squad_member_exists', '目标道友已在当前裂隙小队');
            }
            throw makeError(409, 'rift_squad_target_already_joined', '目标道友已加入本轮其他裂隙小队');
        }
        await expirePendingInvites(connection, { squadId, inviteeUserId: invitee.userId, now });
        const existingPending = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_squad_invites
             WHERE squad_id = ?
               AND invitee_user_id = ?
               AND status = 'pending'
             LIMIT 1`,
            [squadId, invitee.userId]
        );
        if (existingPending) {
            const dashboard = await buildRotationDashboard(connection, identity, String(squad.rotation_id || ''), now, {
                includeInvites: true,
                allowContributionFallback: true
            });
            const response = {
                success: true,
                reportVersion: `${REPORT_VERSION}-invite`,
                protocolVersion: PROTOCOL_VERSION,
                idempotent: false,
                alreadyPending: true,
                invite: formatInviteRow(existingPending, identity),
                dashboard
            };
            return storeMutationReceipt(connection, {
                userId: identity,
                mutationId: request.mutationId,
                rotationId: String(squad.rotation_id || ''),
                requestType: 'invite',
                requestHash,
                requestBody: { ...request, squadId },
                receipt: response,
                squadId,
                inviteId: String(existingPending.invite_id || ''),
                now
            });
        }
        const inviter = await loadUserSnapshot(connection, identity);
        const inviteId = deterministicId('riftsquadinvite', [squadId, invitee.userId, request.mutationId]);
        const expiresAt = Math.min(now + INVITE_TTL_MS, clampInt(rotation.ends_at));
        await dbRun(
            connection,
            `INSERT INTO world_rift_squad_invites
                (invite_id, squad_id, rotation_id, inviter_user_id, invitee_user_id, status, expires_at, responded_at,
                 inviter_name_snapshot, inviter_profile_id_snapshot, invitee_name_snapshot, invitee_profile_id_snapshot,
                 created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?, ?, ?)`,
            [
                inviteId,
                squadId,
                String(squad.rotation_id || ''),
                identity,
                invitee.userId,
                expiresAt,
                inviter.userName,
                inviter.profileId,
                invitee.userName,
                invitee.profileId,
                now,
                now
            ]
        );
        const inviteRow = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_squad_invites
             WHERE invite_id = ?`,
            [inviteId]
        );
        const dashboard = await buildRotationDashboard(connection, identity, String(squad.rotation_id || ''), now, {
            includeInvites: true,
            allowContributionFallback: true
        });
        const response = {
            success: true,
            reportVersion: `${REPORT_VERSION}-invite`,
            protocolVersion: PROTOCOL_VERSION,
            idempotent: false,
            invite: formatInviteRow(inviteRow, identity),
            dashboard
        };
        return storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: String(squad.rotation_id || ''),
            requestType: 'invite',
            requestHash,
            requestBody: { ...request, squadId },
            receipt: response,
            squadId,
            inviteId,
            now
        });
    });
}

async function acceptRiftSquadInvite(userId, inviteIdInput, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    const inviteId = safeId(inviteIdInput);
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    if (!inviteId) throw makeError(400, 'invalid_invite_id', 'inviteId 非法');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeTerminalInviteRequest(rawRequest);
    const requestHash = hashCanonical({ ...request, inviteId, action: 'accept' });
    return withWriteTransaction(async connection => {
        const now = nowProvider();
        await assertTables(connection, REQUIRED_TABLES.concat(SOCIAL_REQUIRED_TABLES));
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        let invite = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_squad_invites
             WHERE invite_id = ?`,
            [inviteId]
        );
        if (!invite) throw makeError(404, 'rift_squad_invite_not_found', '裂隙小队邀请不存在');
        if (String(invite.invitee_user_id || '') !== identity) {
            throw makeError(403, 'rift_squad_forbidden', '只能处理自己的裂隙小队邀请');
        }
        await expirePendingInvites(connection, { squadId: String(invite.squad_id || ''), inviteeUserId: identity, now });
        invite = await dbGet(connection, `SELECT * FROM world_rift_squad_invites WHERE invite_id = ?`, [inviteId]);
        const rotation = await loadRotation(connection, String(invite.rotation_id || ''));
        if (!rotation) throw makeError(404, 'rift_squad_rotation_not_found', '裂隙轮换不存在');
        requireCoordinationOpen(rotation, now);
        if (String(invite.status || '') === 'accepted') {
            const dashboard = await buildRotationDashboard(connection, identity, String(invite.rotation_id || ''), now, {
                includeInvites: true,
                allowContributionFallback: true
            });
            const response = {
                success: true,
                reportVersion: `${REPORT_VERSION}-accept`,
                protocolVersion: PROTOCOL_VERSION,
                idempotent: false,
                alreadyAccepted: true,
                invite: formatInviteRow(invite, identity),
                dashboard
            };
            return storeMutationReceipt(connection, {
                userId: identity,
                mutationId: request.mutationId,
                rotationId: String(invite.rotation_id || ''),
                requestType: 'accept',
                requestHash,
                requestBody: { ...request, inviteId },
                receipt: response,
                squadId: String(invite.squad_id || ''),
                inviteId,
                now
            });
        }
        if (String(invite.status || '') !== 'pending') {
            throw makeError(409, 'rift_squad_invite_inactive', '裂隙小队邀请已失效');
        }
        const existingMembership = await loadActiveMemberByRotation(connection, String(invite.rotation_id || ''), identity);
        if (existingMembership) {
            if (String(existingMembership.squad_id || '') === String(invite.squad_id || '')) {
                await dbRun(
                    connection,
                    `UPDATE world_rift_squad_invites
                     SET status = 'accepted',
                         responded_at = CASE WHEN responded_at > 0 THEN responded_at ELSE ? END,
                         updated_at = ?
                     WHERE invite_id = ?`,
                    [now, now, inviteId]
                );
            } else {
                throw makeError(409, 'rift_squad_already_joined', '当前轮换已加入其他裂隙小队');
            }
        } else {
            const squad = await loadSquadById(connection, String(invite.squad_id || ''));
            if (!squad || String(squad.status || 'active') !== 'active') {
                throw makeError(404, 'rift_squad_not_found', '裂隙小队不存在');
            }
            await assertInviteAllowed(connection, String(invite.inviter_user_id || ''), identity);
            const activeMembers = await listActiveMembers(connection, String(invite.squad_id || ''));
            if (activeMembers.length >= MAX_MEMBERS) {
                throw makeError(409, 'rift_squad_full', '裂隙小队已满员');
            }
            const snapshot = await loadUserSnapshot(connection, identity);
            await dbRun(
                connection,
                `INSERT INTO world_rift_squad_members
                    (squad_id, user_id, rotation_id, status, role, joined_at, left_at, locked_at,
                     display_name_snapshot, profile_id_snapshot, updated_at)
                 VALUES (?, ?, ?, ?, 'member', ?, 0, 0, ?, ?, ?)
                 ON CONFLICT(squad_id, user_id) DO UPDATE SET
                    rotation_id = excluded.rotation_id,
                    status = excluded.status,
                    role = 'member',
                    joined_at = excluded.joined_at,
                    left_at = 0,
                    display_name_snapshot = excluded.display_name_snapshot,
                    profile_id_snapshot = excluded.profile_id_snapshot,
                    updated_at = excluded.updated_at`,
                [
                    String(invite.squad_id || ''),
                    identity,
                    String(invite.rotation_id || ''),
                    ACTIVE_MEMBER_STATUS,
                    now,
                    snapshot.userName,
                    snapshot.profileId,
                    now
                ]
            );
            await dbRun(
                connection,
                `UPDATE world_rift_squad_invites
                 SET status = 'accepted',
                     responded_at = CASE WHEN responded_at > 0 THEN responded_at ELSE ? END,
                     updated_at = ?
                 WHERE invite_id = ?`,
                [now, now, inviteId]
            );
            await rebuildSquadEntry(connection, String(invite.squad_id || ''), String(invite.rotation_id || ''), now);
        }
        invite = await dbGet(connection, `SELECT * FROM world_rift_squad_invites WHERE invite_id = ?`, [inviteId]);
        const dashboard = await buildRotationDashboard(connection, identity, String(invite.rotation_id || ''), now, {
            includeInvites: true,
            allowContributionFallback: true
        });
        const response = {
            success: true,
            reportVersion: `${REPORT_VERSION}-accept`,
            protocolVersion: PROTOCOL_VERSION,
            idempotent: false,
            invite: formatInviteRow(invite, identity),
            dashboard
        };
        return storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: String(invite.rotation_id || ''),
            requestType: 'accept',
            requestHash,
            requestBody: { ...request, inviteId },
            receipt: response,
            squadId: String(invite.squad_id || ''),
            inviteId,
            now
        });
    });
}

async function declineRiftSquadInvite(userId, inviteIdInput, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    const inviteId = safeId(inviteIdInput);
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    if (!inviteId) throw makeError(400, 'invalid_invite_id', 'inviteId 非法');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeTerminalInviteRequest(rawRequest);
    const requestHash = hashCanonical({ ...request, inviteId, action: 'decline' });
    return withWriteTransaction(async connection => {
        const now = nowProvider();
        await assertTables(connection, REQUIRED_TABLES.concat(SOCIAL_REQUIRED_TABLES));
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        await expirePendingInvites(connection, { now });
        let invite = await dbGet(connection, `SELECT * FROM world_rift_squad_invites WHERE invite_id = ?`, [inviteId]);
        if (!invite) throw makeError(404, 'rift_squad_invite_not_found', '裂隙小队邀请不存在');
        if (String(invite.invitee_user_id || '') !== identity) {
            throw makeError(403, 'rift_squad_forbidden', '只能处理自己的裂隙小队邀请');
        }
        if (String(invite.status || '') === 'accepted') {
            throw makeError(409, 'rift_squad_invite_inactive', '已接受的裂隙小队邀请不能再拒绝');
        }
        if (String(invite.status || '') !== 'declined' && String(invite.status || '') !== 'expired') {
            await dbRun(
                connection,
                `UPDATE world_rift_squad_invites
                 SET status = 'declined',
                     responded_at = CASE WHEN responded_at > 0 THEN responded_at ELSE ? END,
                     updated_at = ?
                 WHERE invite_id = ?`,
                [now, now, inviteId]
            );
        }
        invite = await dbGet(connection, `SELECT * FROM world_rift_squad_invites WHERE invite_id = ?`, [inviteId]);
        const dashboard = await buildRotationDashboard(connection, identity, String(invite.rotation_id || ''), now, {
            includeInvites: true,
            allowContributionFallback: true
        });
        const response = {
            success: true,
            reportVersion: `${REPORT_VERSION}-decline`,
            protocolVersion: PROTOCOL_VERSION,
            idempotent: false,
            invite: formatInviteRow(invite, identity),
            dashboard
        };
        return storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: String(invite.rotation_id || ''),
            requestType: 'decline',
            requestHash,
            requestBody: { ...request, inviteId },
            receipt: response,
            squadId: String(invite.squad_id || ''),
            inviteId,
            now
        });
    });
}

async function leaveRiftSquad(userId, squadIdInput, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    const squadId = safeId(squadIdInput);
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    if (!squadId) throw makeError(400, 'invalid_squad_id', 'squadId 非法');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeTerminalInviteRequest(rawRequest);
    const requestHash = hashCanonical({ ...request, squadId, action: 'leave' });
    return withWriteTransaction(async connection => {
        const now = nowProvider();
        await assertTables(connection, REQUIRED_TABLES);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const squad = await loadSquadById(connection, squadId);
        if (!squad || String(squad.status || 'active') !== 'active') {
            throw makeError(404, 'rift_squad_not_found', '裂隙小队不存在');
        }
        const rotation = await loadRotation(connection, String(squad.rotation_id || ''));
        if (!rotation) throw makeError(404, 'rift_squad_rotation_not_found', '裂隙轮换不存在');
        const membership = await loadMemberBySquadUser(connection, squadId, identity);
        if (!membership || String(membership.status || '') !== ACTIVE_MEMBER_STATUS) {
            throw makeError(404, 'rift_squad_membership_not_found', '当前账号不在该裂隙小队中');
        }
        const contributionLink = await dbGet(
            connection,
            `SELECT contribution_id
             FROM world_rift_squad_contributions
             WHERE squad_id = ?
               AND user_id = ?
               AND contribution > 0
             LIMIT 1`,
            [squadId, identity]
        );
        if (contributionLink) {
            throw makeError(409, 'rift_squad_membership_locked', '已有有效贡献后，本轮裂隙小队归属已锁定');
        }
        const activeMembers = await listActiveMembers(connection, squadId);
        await dbRun(
            connection,
            `UPDATE world_rift_squad_members
             SET status = ?,
                 role = 'member',
                 left_at = CASE WHEN left_at > 0 THEN left_at ELSE ? END,
                 updated_at = ?
             WHERE squad_id = ? AND user_id = ?`,
            [LEFT_MEMBER_STATUS, now, now, squadId, identity]
        );
        let deleted = false;
        if (activeMembers.length <= 1) {
            deleted = true;
            await dbRun(
                connection,
                `UPDATE world_rift_squad_invites
                 SET status = CASE WHEN status = 'pending' THEN 'cancelled' ELSE status END,
                     responded_at = CASE WHEN status = 'pending' AND responded_at = 0 THEN ? ELSE responded_at END,
                     updated_at = ?
                 WHERE squad_id = ?`,
                [now, now, squadId]
            );
            await dbRun(connection, `DELETE FROM world_rift_squad_entries WHERE rotation_id = ? AND squad_id = ?`, [String(squad.rotation_id || ''), squadId]);
            await dbRun(connection, `DELETE FROM world_rift_squads WHERE squad_id = ?`, [squadId]);
        } else {
            const remainingMembers = activeMembers.filter(entry => String(entry.user_id || '') !== identity);
            if (String(membership.role || '') === 'leader') {
                const nextLeader = remainingMembers.sort((left, right) => {
                    const joinedDelta = clampInt(left.joined_at) - clampInt(right.joined_at);
                    if (joinedDelta !== 0) return joinedDelta;
                    return String(left.user_id || '').localeCompare(String(right.user_id || ''));
                })[0];
                if (nextLeader) {
                    await dbRun(
                        connection,
                        `UPDATE world_rift_squad_members
                         SET role = CASE WHEN user_id = ? THEN 'leader' ELSE 'member' END,
                             updated_at = ?
                         WHERE squad_id = ?
                           AND status = ?`,
                        [String(nextLeader.user_id || ''), now, squadId, ACTIVE_MEMBER_STATUS]
                    );
                    await dbRun(
                        connection,
                        `UPDATE world_rift_squads
                         SET leader_user_id = ?,
                             updated_at = ?
                         WHERE squad_id = ?`,
                        [String(nextLeader.user_id || ''), now, squadId]
                    );
                }
            }
            await rebuildSquadEntry(connection, squadId, String(squad.rotation_id || ''), now);
        }
        const dashboard = deleted
            ? await buildRotationDashboard(connection, identity, String(squad.rotation_id || ''), now, {
                includeInvites: true,
                allowContributionFallback: true
            })
            : await buildRotationDashboard(connection, identity, String(squad.rotation_id || ''), now, {
                includeInvites: true,
                allowContributionFallback: true
            });
        const response = {
            success: true,
            reportVersion: `${REPORT_VERSION}-leave`,
            protocolVersion: PROTOCOL_VERSION,
            idempotent: false,
            deleted,
            dashboard
        };
        return storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: String(squad.rotation_id || ''),
            requestType: 'leave',
            requestHash,
            requestBody: { ...request, squadId },
            receipt: response,
            squadId,
            now
        });
    });
}

async function claimRiftSquadReward(userId, squadIdInput, milestoneIdInput, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeClaimRequest(squadIdInput, milestoneIdInput, rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        const now = nowProvider();
        await assertTables(connection, REQUIRED_TABLES);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const squad = await loadSquadById(connection, request.squadId);
        if (!squad) throw makeError(404, 'rift_squad_not_found', '裂隙小队不存在');
        if (String(squad.rotation_id || '') !== request.rotationId) {
            throw makeError(409, 'rift_squad_rotation_mismatch', '裂隙小队与轮换不一致');
        }
        const rotation = await loadRotation(connection, request.rotationId);
        if (!rotation) throw makeError(404, 'rift_squad_rotation_not_found', '裂隙轮换不存在');
        requireClaimOpen(rotation, now);
        const milestone = CLAIM_MILESTONES.find(entry => entry.milestoneId === request.milestoneId);
        if (!milestone) throw makeError(404, 'rift_squad_milestone_not_found', '裂隙小队里程碑不存在');
        const contributionProof = await dbGet(
            connection,
            `SELECT contribution_id
             FROM world_rift_squad_contributions
             WHERE squad_id = ?
               AND rotation_id = ?
               AND user_id = ?
               AND contribution > 0
             ORDER BY linked_at ASC
             LIMIT 1`,
            [request.squadId, request.rotationId, identity]
        );
        if (!contributionProof) {
            throw makeError(409, 'rift_squad_claim_unavailable', '只有向该小队贡献过正式成绩的成员可领奖');
        }
        const entry = await loadEntry(connection, request.rotationId, request.squadId);
        if (!entry || clampInt(entry.cooperative_score) < milestone.targetScore) {
            throw makeError(409, 'rift_squad_claim_unavailable', '当前里程碑尚未达成领奖条件');
        }
        const existingClaim = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_squad_reward_claims
             WHERE user_id = ?
               AND rotation_id = ?
               AND squad_id = ?
               AND milestone_id = ?`,
            [identity, request.rotationId, request.squadId, request.milestoneId]
        );
        if (!existingClaim) {
            const claimId = deterministicId('riftsquadclaim', [identity, request.rotationId, request.squadId, request.milestoneId]);
            const ledgerEntryId = deterministicId('riftsquadledger', [identity, request.rotationId, request.squadId, request.milestoneId, REWARD_CURRENCY]);
            await dbRun(
                connection,
                `INSERT INTO progression_economy_balances
                    (user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at)
                 VALUES (?, ?, ?, ?, 0, ?)
                 ON CONFLICT(user_id, currency) DO UPDATE SET
                    balance = progression_economy_balances.balance + excluded.balance,
                    lifetime_earned = progression_economy_balances.lifetime_earned + excluded.lifetime_earned,
                    updated_at = excluded.updated_at`,
                [identity, REWARD_CURRENCY, milestone.amount, milestone.amount, now]
            );
            const balance = await dbGet(
                connection,
                `SELECT *
                 FROM progression_economy_balances
                 WHERE user_id = ? AND currency = ?`,
                [identity, REWARD_CURRENCY]
            );
            await dbRun(
                connection,
                `INSERT INTO progression_economy_ledger
                    (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id, reward_impact, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ledgerEntryId,
                    identity,
                    REWARD_CURRENCY,
                    milestone.amount,
                    clampInt(balance && balance.balance),
                    milestone.title,
                    'world_rift_squad_reward',
                    `world_rift_squad:${request.rotationId}:${request.squadId}:${request.milestoneId}`,
                    REWARD_IMPACT,
                    stableStringify({
                        rotationId: request.rotationId,
                        squadId: request.squadId,
                        milestoneId: request.milestoneId,
                        contributionId: String(contributionProof.contribution_id || '')
                    }),
                    now
                ]
            );
            await dbRun(
                connection,
                `INSERT INTO world_rift_squad_reward_claims
                    (claim_id, user_id, rotation_id, squad_id, milestone_id, currency, amount, reward_impact,
                     ledger_entry_id, claim_payload_json, claimed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    claimId,
                    identity,
                    request.rotationId,
                    request.squadId,
                    request.milestoneId,
                    REWARD_CURRENCY,
                    milestone.amount,
                    REWARD_IMPACT,
                    ledgerEntryId,
                    stableStringify({
                        cooperativeScore: clampInt(entry.cooperative_score),
                        contributingMembers: clampInt(entry.contributing_members),
                        contributionId: String(contributionProof.contribution_id || '')
                    }),
                    now
                ]
            );
        }
        const claim = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_squad_reward_claims
             WHERE user_id = ?
               AND rotation_id = ?
               AND squad_id = ?
               AND milestone_id = ?`,
            [identity, request.rotationId, request.squadId, request.milestoneId]
        );
        const balance = await dbGet(
            connection,
            `SELECT *
             FROM progression_economy_balances
             WHERE user_id = ? AND currency = ?`,
            [identity, REWARD_CURRENCY]
        );
        const dashboard = await buildRotationDashboard(connection, identity, request.rotationId, now, {
            includeInvites: false,
            allowContributionFallback: true
        });
        const response = {
            success: true,
            reportVersion: `${REPORT_VERSION}-claim`,
            protocolVersion: PROTOCOL_VERSION,
            idempotent: false,
            alreadyClaimed: !!existingClaim,
            claim: {
                claimId: String(claim.claim_id || ''),
                squadId: String(claim.squad_id || ''),
                milestoneId: String(claim.milestone_id || ''),
                currency: String(claim.currency || REWARD_CURRENCY),
                amount: clampInt(claim.amount),
                rewardImpact: String(claim.reward_impact || REWARD_IMPACT),
                claimedAt: clampInt(claim.claimed_at)
            },
            balance: formatBalance(balance),
            dashboard
        };
        return storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: request.rotationId,
            requestType: 'claim',
            requestHash,
            requestBody: request,
            receipt: response,
            squadId: request.squadId,
            claimId: String(claim.claim_id || ''),
            now
        });
    });
}

async function linkContributionToActiveSquad(connection, context = {}) {
    const userId = String(context.userId || context.user_id || (context.contributionRow && context.contributionRow.user_id) || '').trim();
    const contributionRow = context.contributionRow && typeof context.contributionRow === 'object'
        ? context.contributionRow
        : null;
    const now = clampInt(context.now ?? Date.now());
    if (!connection || typeof connection !== 'object') {
        throw makeError(500, 'rift_squad_connection_required', '裂隙小队 contribution link 需要复用当前事务连接');
    }
    if (!userId || !contributionRow || !safeId(contributionRow.contribution_id) || !safeId(contributionRow.rotation_id)) {
        throw makeError(500, 'rift_squad_invalid_link_context', '裂隙小队 contribution link 上下文不完整');
    }
    if (clampInt(contributionRow.contribution) <= 0) {
        return { linked: false, reason: 'no_positive_contribution' };
    }
    const missing = await listMissingTables(connection, REQUIRED_TABLES);
    if (missing.length > 0) {
        return {
            linked: false,
            reason: 'schema_missing',
            missingTables: missing,
            contract: makeSchemaContract()
        };
    }
    const existingLink = await dbGet(
        connection,
        `SELECT *
         FROM world_rift_squad_contributions
         WHERE contribution_id = ?`,
        [String(contributionRow.contribution_id || '')]
    );
    if (existingLink) {
        const entry = await loadEntry(connection, String(existingLink.rotation_id || ''), String(existingLink.squad_id || ''));
        return {
            linked: true,
            squadId: String(existingLink.squad_id || ''),
            entry
        };
    }
    const membership = await loadActiveMemberByRotation(connection, String(contributionRow.rotation_id || ''), userId);
    if (!membership || !safeId(membership.squad_id)) {
        return { linked: false, reason: 'no_active_squad' };
    }
    const squad = await loadSquadById(connection, String(membership.squad_id || ''));
    if (!squad || String(squad.status || 'active') !== 'active') {
        return { linked: false, reason: 'squad_inactive' };
    }
    await dbRun(
        connection,
        `INSERT INTO world_rift_squad_contributions
            (contribution_id, squad_id, rotation_id, user_id, contribution, remaining_hp, turns, linked_at,
             display_name_snapshot, profile_id_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            String(contributionRow.contribution_id || ''),
            String(membership.squad_id || ''),
            String(contributionRow.rotation_id || ''),
            userId,
            clampInt(contributionRow.contribution),
            clampInt(contributionRow.remaining_hp),
            clampInt(contributionRow.turns),
            clampInt(contributionRow.submitted_at || now),
            String(membership.display_name_snapshot || ''),
            String(membership.profile_id_snapshot || '')
        ]
    );
    await dbRun(
        connection,
        `UPDATE world_rift_squad_members
         SET locked_at = CASE WHEN locked_at > 0 THEN locked_at ELSE ? END,
             updated_at = ?
         WHERE squad_id = ? AND user_id = ?`,
        [clampInt(contributionRow.submitted_at || now), now, String(membership.squad_id || ''), userId]
    );
    await dbRun(
        connection,
        `UPDATE world_rift_squads
         SET updated_at = ?
         WHERE squad_id = ?`,
        [now, String(membership.squad_id || '')]
    );
    const entry = await rebuildSquadEntry(connection, String(membership.squad_id || ''), String(contributionRow.rotation_id || ''), now);
    return {
        linked: true,
        squadId: String(membership.squad_id || ''),
        entry
    };
}

module.exports = {
    PROTOCOL_VERSION,
    getRiftSquadDashboard,
    createRiftSquad,
    inviteRiftSquadFriend,
    acceptRiftSquadInvite,
    declineRiftSquadInvite,
    leaveRiftSquad,
    claimRiftSquadReward,
    linkContributionToActiveSquad
};
