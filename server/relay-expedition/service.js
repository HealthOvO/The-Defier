const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../db/database');
const {
    ACTIVE_LEASE_MS,
    LEG_COUNT,
    MILESTONES,
    POWER_IMPACT,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    TACTICS,
    buildLegWindows,
    computeLegScore,
    deriveHandoffOptions,
    getMilestone,
    getTactic,
    isMilestoneUnlocked
} = require('./catalog');
const { ensureRelayExpeditionSchema } = require('./bootstrap');
const { CONTENT_VERSION } = require('../progression/authoritative-runs/catalog');
const {
    expireInternalRelayRun,
    issueAuthoritativeRun
} = require('../progression/authoritative-runs/service');
const {
    deterministicId,
    hashCanonical,
    sha256,
    stableStringify
} = require('../progression/authoritative-runs/canonical');

const REPORT_VERSION = 'relay-expedition-v1';
const RELAY_MODE = 'relay_expedition';
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_ENTITY_ID = /^[A-Za-z0-9._:-]{2,64}$/;
const TERMINAL_RUN_STATUSES = new Set(['defeated', 'abandoned', 'expired']);
const PROCESSED_LEG_STATUSES = new Set(['projected', 'skipped', 'expired']);
const MAX_RECOVERY_ATTEMPTS = LEG_COUNT * 3;

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
            console.error('[RelayExpedition] Write rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        await closeDb(connection);
        releaseQueue();
    }
}

async function withReadConnection(fn, { transaction = false } = {}) {
    const connection = openDb();
    try {
        if (transaction) await dbRun(connection, 'BEGIN');
        const result = await fn(connection);
        if (transaction) await dbRun(connection, 'COMMIT');
        return result;
    } catch (error) {
        if (transaction) {
            try {
                await dbRun(connection, 'ROLLBACK');
            } catch (rollbackError) {
                console.error('[RelayExpedition] Read rollback failed:', rollbackError);
            }
        }
        throw error;
    } finally {
        await closeDb(connection);
    }
}

function makeError(statusCode, reason, message, details = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.reason = reason;
    if (details) error.details = details;
    return error;
}

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

function safeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
}

function safeEntityId(value) {
    const text = String(value || '').trim();
    return SAFE_ENTITY_ID.test(text) ? text : '';
}

function parseJson(value, fallback = null) {
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
}

function assertAllowedKeys(source, allowed, reason = 'invalid_request_payload') {
    const unknown = Object.keys(source).filter(key => !allowed.includes(key));
    if (unknown.length > 0) throw makeError(400, reason, `请求包含不允许字段: ${unknown[0]}`);
}

function createNowProvider(nowInput) {
    if (typeof nowInput === 'function') {
        return () => clampInt(nowInput());
    }
    if (Number.isFinite(Number(nowInput))) {
        const fixed = clampInt(nowInput);
        return () => fixed;
    }
    return () => Date.now();
}

function normalizeBaseRequest(rawRequest, allowedKeys) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, allowedKeys);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'relay_protocol_mismatch', '同道远征协议版本不受支持');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', '同道远征 mutationId 非法');
    return { source, protocolVersion, mutationId };
}

function normalizeCreateRequest(rawRequest) {
    const base = normalizeBaseRequest(rawRequest, ['protocolVersion', 'rotationId', 'sourceSquadId', 'clientSessionId', 'mutationId']);
    const rotationId = safeId(base.source.rotationId);
    const sourceSquadId = safeId(base.source.sourceSquadId);
    const clientSessionId = safeId(base.source.clientSessionId);
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', '同道远征轮换标识非法');
    if (!sourceSquadId) throw makeError(400, 'invalid_source_squad_id', '源裂隙小队标识非法');
    if (!clientSessionId) throw makeError(400, 'invalid_client_session_id', '客户端远征标识非法');
    return { protocolVersion: base.protocolVersion, rotationId, sourceSquadId, clientSessionId, mutationId: base.mutationId };
}

function normalizeClaimRequest(rawRequest) {
    const base = normalizeBaseRequest(rawRequest, ['protocolVersion', 'sessionId', 'legIndex', 'tacticId', 'clientLegId', 'mutationId']);
    const sessionId = safeId(base.source.sessionId);
    const legIndex = clampInt(base.source.legIndex, 0, LEG_COUNT + 1);
    const tacticId = safeEntityId(base.source.tacticId);
    const clientLegId = safeId(base.source.clientLegId);
    if (!sessionId) throw makeError(400, 'invalid_session_id', '同道远征 sessionId 非法');
    if (legIndex < 1 || legIndex > LEG_COUNT) throw makeError(400, 'invalid_leg_index', '同道远征棒次非法');
    if (!getTactic(tacticId)) throw makeError(400, 'invalid_tactic_id', '同道远征接力谱不受支持');
    if (!clientLegId) throw makeError(400, 'invalid_client_leg_id', '客户端棒次标识非法');
    return { protocolVersion: base.protocolVersion, sessionId, legIndex, tacticId, clientLegId, mutationId: base.mutationId };
}

function normalizePassRequest(rawRequest) {
    const base = normalizeBaseRequest(rawRequest, ['protocolVersion', 'sessionId', 'legIndex', 'mutationId']);
    const sessionId = safeId(base.source.sessionId);
    const legIndex = clampInt(base.source.legIndex, 0, LEG_COUNT + 1);
    if (!sessionId) throw makeError(400, 'invalid_session_id', '同道远征 sessionId 非法');
    if (legIndex < 1 || legIndex > LEG_COUNT) throw makeError(400, 'invalid_leg_index', '同道远征棒次非法');
    return { protocolVersion: base.protocolVersion, sessionId, legIndex, mutationId: base.mutationId };
}

function normalizeProjectRequest(legId, rawRequest) {
    const base = normalizeBaseRequest(rawRequest, ['protocolVersion', 'sessionId', 'legId', 'runId', 'mutationId']);
    const normalizedLegId = safeId(legId);
    const sessionId = safeId(base.source.sessionId);
    const bodyLegId = safeId(base.source.legId);
    const runId = safeId(base.source.runId);
    if (!normalizedLegId || bodyLegId !== normalizedLegId) throw makeError(400, 'relay_leg_id_mismatch', '接力棒次与请求路径不一致');
    if (!sessionId) throw makeError(400, 'invalid_session_id', '同道远征 sessionId 非法');
    if (!runId) throw makeError(400, 'invalid_run_id', '同道远征权威 run 标识非法');
    return { protocolVersion: base.protocolVersion, sessionId, legId: normalizedLegId, runId, mutationId: base.mutationId };
}

function normalizeRewardRequest(milestoneId, rawRequest) {
    const base = normalizeBaseRequest(rawRequest, ['protocolVersion', 'sessionId', 'rotationId', 'milestoneId', 'mutationId']);
    const normalizedMilestoneId = safeEntityId(milestoneId);
    const bodyMilestoneId = safeEntityId(base.source.milestoneId);
    const sessionId = safeId(base.source.sessionId);
    const rotationId = safeId(base.source.rotationId);
    if (!normalizedMilestoneId || bodyMilestoneId !== normalizedMilestoneId) throw makeError(400, 'milestone_id_mismatch', '里程碑与请求路径不一致');
    if (!getMilestone(normalizedMilestoneId)) throw makeError(404, 'relay_milestone_not_found', '同道远征里程碑不存在');
    if (!sessionId || !rotationId) throw makeError(400, 'relay_reward_context_invalid', '同道远征领奖上下文缺失');
    return { protocolVersion: base.protocolVersion, sessionId, rotationId, milestoneId: normalizedMilestoneId, mutationId: base.mutationId };
}

function makeAccountRef(userId) {
    return userId ? `acct-${sha256(String(userId)).slice(0, 12)}` : '';
}

function makeEntityRef(prefix, value) {
    return value ? `${prefix}-${sha256(String(value)).slice(0, 12)}` : '';
}

async function recordOpsEvent(connection, eventType, {
    rotationId = '',
    sessionId = '',
    userId = '',
    runId = '',
    resultCode = 'ok',
    value = 0,
    detail = {}
} = {}, now = Date.now()) {
    const safeDetail = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {};
    const eventId = `relayops-${crypto.randomUUID()}`;
    await dbRun(
        connection,
        `INSERT INTO relay_expedition_ops_events
            (event_id, event_type, rotation_id, session_ref, account_ref, run_ref, result_code, value, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            eventId,
            String(eventType || 'unknown'),
            String(rotationId || ''),
            makeEntityRef('session', sessionId),
            makeAccountRef(userId),
            makeEntityRef('run', runId),
            String(resultCode || 'ok'),
            clampInt(value),
            stableStringify(safeDetail),
            clampInt(now)
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO relay_expedition_ops_counters
            (event_type, rotation_id, result_code, event_count, total_value, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, rotation_id, result_code) DO UPDATE SET
            event_count = relay_expedition_ops_counters.event_count + 1,
            total_value = relay_expedition_ops_counters.total_value + excluded.total_value,
            updated_at = excluded.updated_at`,
        [String(eventType || 'unknown'), String(rotationId || ''), String(resultCode || 'ok'), clampInt(value), clampInt(now)]
    );
}

function makeMutationConflictError() {
    return makeError(409, 'mutation_reused', '相同 mutationId 已绑定其他同道远征请求');
}

async function loadMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT * FROM relay_expedition_mutations WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function replayMutation(connection, userId, mutationId, requestHash) {
    const row = await loadMutation(connection, userId, mutationId);
    if (!row) return null;
    if (String(row.request_hash || '') !== String(requestHash || '')) throw makeMutationConflictError();
    return { ...parseJson(row.receipt_json, {}), idempotent: true };
}

async function storeMutation(connection, userId, request, requestType, receipt, {
    rotationId = '', sessionId = '', legId = '', claimId = '', now = Date.now()
} = {}) {
    await dbRun(
        connection,
        `INSERT INTO relay_expedition_mutations
            (user_id, mutation_id, rotation_id, session_id, request_type, request_hash,
             request_body_json, receipt_json, leg_id, claim_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            request.mutationId,
            rotationId,
            sessionId,
            requestType,
            hashCanonical(request),
            stableStringify(request),
            stableStringify(receipt),
            legId,
            claimId,
            clampInt(now)
        ]
    );
}

function formatRotationRow(row, now = Date.now()) {
    if (!row) return null;
    const snapshot = parseJson(row.snapshot_json, {});
    return {
        ...snapshot,
        lifecycle: now < clampInt(row.starts_at) ? 'upcoming'
            : now < clampInt(row.ends_at) ? 'active'
                : now < clampInt(row.grace_ends_at) ? 'grace'
                    : now < clampInt(row.claim_ends_at) ? 'claim_only' : 'closed'
    };
}

async function loadCurrentRotation(connection, now = Date.now()) {
    const row = await dbGet(
        connection,
        `SELECT * FROM relay_expedition_rotations
         WHERE starts_at <= ? AND ends_at > ?
         ORDER BY starts_at DESC LIMIT 1`,
        [now, now]
    );
    return row ? { row, view: formatRotationRow(row, now) } : null;
}

async function loadRotationById(connection, rotationId, now = Date.now()) {
    const row = await dbGet(connection, `SELECT * FROM relay_expedition_rotations WHERE rotation_id = ?`, [rotationId]);
    return row ? { row, view: formatRotationRow(row, now) } : null;
}

async function loadSession(connection, sessionId) {
    return dbGet(connection, `SELECT * FROM relay_expedition_sessions WHERE session_id = ?`, [sessionId]);
}

async function loadOwnedSession(connection, userId, sessionId) {
    return dbGet(
        connection,
        `SELECT s.*
         FROM relay_expedition_sessions s
         JOIN relay_expedition_members m ON m.session_id = s.session_id
         WHERE s.session_id = ? AND m.user_id = ?`,
        [sessionId, userId]
    );
}

async function loadUserSessionForRotation(connection, userId, rotationId) {
    return dbGet(
        connection,
        `SELECT s.*
         FROM relay_expedition_sessions s
         JOIN relay_expedition_members m ON m.session_id = s.session_id
         WHERE m.user_id = ? AND m.rotation_id = ?
         ORDER BY s.started_at DESC LIMIT 1`,
        [userId, rotationId]
    );
}

async function loadMembers(connection, sessionId) {
    return dbAll(
        connection,
        `SELECT * FROM relay_expedition_members WHERE session_id = ? ORDER BY seat ASC`,
        [sessionId]
    );
}

async function loadLegs(connection, sessionId) {
    return dbAll(
        connection,
        `SELECT * FROM relay_expedition_legs WHERE session_id = ? ORDER BY leg_index ASC`,
        [sessionId]
    );
}

async function loadLeg(connection, sessionId, legIndex) {
    return dbGet(
        connection,
        `SELECT * FROM relay_expedition_legs WHERE session_id = ? AND leg_index = ?`,
        [sessionId, legIndex]
    );
}

async function loadLegById(connection, legId) {
    return dbGet(connection, `SELECT * FROM relay_expedition_legs WHERE leg_id = ?`, [legId]);
}

async function loadClaims(connection, userId, sessionId) {
    return dbAll(
        connection,
        `SELECT * FROM relay_expedition_reward_claims WHERE user_id = ? AND session_id = ? ORDER BY claimed_at ASC`,
        [userId, sessionId]
    );
}

async function loadSourceSquadForUser(connection, userId, now = Date.now()) {
    const squad = await dbGet(
        connection,
        `SELECT s.*, wr.starts_at AS source_starts_at, wr.ends_at AS source_ends_at
         FROM world_rift_squads s
         JOIN world_rift_squad_members mine
           ON mine.squad_id = s.squad_id
          AND mine.user_id = ?
          AND mine.status = 'active'
         JOIN world_rift_rotations wr ON wr.rotation_id = s.rotation_id
         WHERE s.status = 'active'
           AND wr.starts_at <= ?
           AND wr.ends_at > ?
         ORDER BY s.updated_at DESC LIMIT 1`,
        [userId, now, now]
    );
    if (!squad) return null;
    const members = await dbAll(
        connection,
        `SELECT * FROM world_rift_squad_members
         WHERE squad_id = ? AND status = 'active'
         ORDER BY CASE WHEN role = 'leader' THEN 0 ELSE 1 END ASC, joined_at ASC, user_id ASC`,
        [squad.squad_id]
    );
    return { squad, members };
}

function formatSourceSquad(source, viewerUserId) {
    if (!source) return null;
    return {
        sourceSquadId: String(source.squad.squad_id || ''),
        sourceRotationId: String(source.squad.rotation_id || ''),
        isLeader: String(source.squad.leader_user_id || '') === String(viewerUserId || ''),
        memberCount: source.members.length,
        eligible: source.members.length >= 2 && source.members.length <= 4,
        members: source.members.map((member, seat) => ({
            profileId: String(member.profile_id_snapshot || ''),
            displayName: String(member.display_name_snapshot || '无名道友'),
            seat,
            role: String(member.role || 'member'),
            isSelf: String(member.user_id || '') === String(viewerUserId || '')
        }))
    };
}

function projectAuthoritativeSummary(summary = {}) {
    const source = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {};
    return {
        result: String(source.result || ''),
        reason: String(source.reason || ''),
        score: clampInt(source.score),
        grade: String(source.grade || ''),
        scenarioId: String(source.scenarioId || ''),
        encountersWon: clampInt(source.encountersWon, 0, 16),
        bossWins: clampInt(source.bossWins, 0, 4),
        turns: clampInt(source.turns, 0, 512),
        cardsPlayed: clampInt(source.cardsPlayed, 0, 2048),
        damageDealt: clampInt(source.damageDealt),
        damageTaken: clampInt(source.damageTaken),
        remainingHp: clampInt(source.remainingHp),
        maxHp: clampInt(source.maxHp)
    };
}

function findMember(members, userId) {
    return members.find(member => String(member.user_id || '') === String(userId || '')) || null;
}

function choosePriorityMember(members, {
    preferredUserId = '',
    previousRunnerUserId = ''
} = {}) {
    const active = members.filter(member => String(member.status || '') === 'active' && clampInt(member.claimed_legs) < 2);
    if (active.length === 0) return null;
    const nonConsecutive = active.filter(member => String(member.user_id || '') !== String(previousRunnerUserId || ''));
    const candidates = nonConsecutive.length > 0 ? nonConsecutive : active;
    const preferred = candidates.find(member => String(member.user_id || '') === String(preferredUserId || ''));
    if (preferred) return preferred;
    const previous = findMember(members, previousRunnerUserId);
    const previousSeat = previous ? clampInt(previous.seat) : -1;
    return candidates
        .slice()
        .sort((left, right) => {
            const leftDistance = ((clampInt(left.seat) - previousSeat - 1) + members.length) % members.length;
            const rightDistance = ((clampInt(right.seat) - previousSeat - 1) + members.length) % members.length;
            return leftDistance - rightDistance || clampInt(left.seat) - clampInt(right.seat);
        })[0];
}

function canMemberClaimLeg(member, members, legs) {
    if (!member || String(member.status || '') !== 'active' || clampInt(member.claimed_legs) >= 2) return false;
    const previous = legs
        .filter(leg => clampInt(leg.leg_index) < LEG_COUNT && PROCESSED_LEG_STATUSES.has(String(leg.status || '')) && String(leg.runner_user_id || ''))
        .sort((left, right) => clampInt(right.leg_index) - clampInt(left.leg_index))[0];
    if (!previous || String(previous.runner_user_id || '') !== String(member.user_id || '')) return true;
    return !members.some(candidate => (
        String(candidate.user_id || '') !== String(member.user_id || '')
        && String(candidate.status || '') === 'active'
        && clampInt(candidate.claimed_legs) < 2
    ));
}

function formatMember(member, viewerUserId) {
    return {
        profileId: String(member.profile_id_snapshot || ''),
        displayName: String(member.display_name_snapshot || '无名道友'),
        seat: clampInt(member.seat),
        role: String(member.role || 'member'),
        status: String(member.status || 'active'),
        claimedLegs: clampInt(member.claimed_legs),
        projectedLegs: clampInt(member.projected_legs),
        lastLegIndex: clampInt(member.last_leg_index),
        isSelf: String(member.user_id || '') === String(viewerUserId || '')
    };
}

function formatLeg(leg, members, viewerUserId, session, now = Date.now()) {
    const priority = findMember(members, leg.priority_user_id);
    const runner = findMember(members, leg.runner_user_id);
    const viewer = findMember(members, viewerUserId);
    const allLegs = session.__legs || [];
    const current = clampInt(session.current_leg_index) === clampInt(leg.leg_index) && String(session.status || '') === 'active';
    const queuedAt = clampInt(leg.queued_at);
    const priorityUntil = clampInt(leg.priority_until);
    const openClaimUntil = clampInt(leg.open_claim_until);
    const activeLeaseUntil = clampInt(leg.active_lease_until);
    const claimPhase = !current || String(leg.status || '') !== 'queued'
        ? 'closed'
        : now < priorityUntil ? 'priority'
            : now < openClaimUntil ? 'open' : 'expired';
    const eligible = current
        && String(leg.status || '') === 'queued'
        && canMemberClaimLeg(viewer, members, allLegs)
        && ((claimPhase === 'priority' && String(leg.priority_user_id || '') === String(viewerUserId || '')) || claimPhase === 'open');
    const allowedTacticIds = parseJson(leg.handoff_options_json, []);
    return {
        legId: String(leg.leg_id || ''),
        legIndex: clampInt(leg.leg_index),
        status: String(leg.status || ''),
        outcome: String(leg.outcome || ''),
        current,
        priorityMember: priority ? formatMember(priority, viewerUserId) : null,
        runner: runner ? formatMember(runner, viewerUserId) : null,
        tacticId: String(leg.tactic_id || ''),
        tactic: getTactic(leg.tactic_id),
        allowedTactics: Array.isArray(allowedTacticIds)
            ? allowedTacticIds.map(getTactic).filter(Boolean)
            : [],
        routeScore: clampInt(leg.route_score),
        authoritativeSummary: projectAuthoritativeSummary(parseJson(leg.authoritative_summary_json, {})),
        queuedAt,
        priorityUntil,
        openClaimUntil,
        activeLeaseUntil,
        claimPhase,
        canClaim: eligible,
        canPass: current
            && String(leg.status || '') === 'queued'
            && claimPhase === 'priority'
            && String(leg.priority_user_id || '') === String(viewerUserId || ''),
        runId: String(leg.runner_user_id || '') === String(viewerUserId || '') ? String(leg.run_id || '') : '',
        clientRunId: String(leg.runner_user_id || '') === String(viewerUserId || '') ? String(leg.client_run_id || '') : '',
        recoverable: String(leg.runner_user_id || '') === String(viewerUserId || '')
            && ['reserved', 'active', 'settled'].includes(String(leg.status || ''))
            && activeLeaseUntil > now
    };
}

function buildMilestoneViews(session, member, claims, rotation, now = Date.now()) {
    const claimMap = new Map(claims.map(claim => [String(claim.milestone_id || ''), claim]));
    return MILESTONES.map(milestone => {
        const claimed = claimMap.get(milestone.milestoneId) || null;
        const unlocked = isMilestoneUnlocked(milestone, session);
        const contributed = member && clampInt(member.projected_legs) > 0;
        return {
            ...milestone,
            unlocked,
            claimed: !!claimed,
            claimedAt: claimed ? clampInt(claimed.claimed_at) : 0,
            claimable: unlocked && contributed && !claimed && now < clampInt(rotation.row.claim_ends_at)
        };
    });
}

async function formatSession(connection, session, viewerUserId, rotation, now = Date.now()) {
    if (!session) return null;
    const [members, legs, claims] = await Promise.all([
        loadMembers(connection, session.session_id),
        loadLegs(connection, session.session_id),
        loadClaims(connection, viewerUserId, session.session_id)
    ]);
    const member = findMember(members, viewerUserId);
    const sessionForLegs = { ...session, __legs: legs };
    const legViews = legs.map(leg => formatLeg(leg, members, viewerUserId, sessionForLegs, now));
    return {
        sessionId: String(session.session_id || ''),
        rotationId: String(session.rotation_id || ''),
        sourceSquadId: String(session.source_squad_id || ''),
        status: String(session.status || ''),
        currentLegIndex: clampInt(session.current_leg_index),
        routeScore: clampInt(session.route_score),
        routeMax: 6400,
        successfulLegs: clampInt(session.successful_legs),
        processedLegs: clampInt(session.processed_legs),
        projectedLegs: clampInt(session.projected_legs),
        participantCount: clampInt(session.participant_count),
        stateVersion: clampInt(session.state_version),
        route: parseJson(session.route_json, []),
        members: members.map(entry => formatMember(entry, viewerUserId)),
        membership: member ? formatMember(member, viewerUserId) : null,
        legs: legViews,
        currentLeg: legViews.find(leg => leg.current) || null,
        milestones: buildMilestoneViews(session, member, claims, rotation, now),
        startedAt: clampInt(session.started_at),
        completedAt: clampInt(session.completed_at),
        updatedAt: clampInt(session.updated_at)
    };
}

async function activateQueuedLeg(connection, session, leg, members, previousRunnerUserId, handoffOptions, now) {
    const priority = choosePriorityMember(members, {
        preferredUserId: leg.priority_user_id,
        previousRunnerUserId
    });
    if (!priority) {
        throw makeError(409, 'relay_no_eligible_runner', '本轮已没有可接棒成员');
    }
    const windows = buildLegWindows(now);
    await dbRun(
        connection,
        `UPDATE relay_expedition_legs
         SET priority_user_id = ?, handoff_options_json = ?, queued_at = ?, priority_until = ?,
             open_claim_until = ?, updated_at = ?
         WHERE leg_id = ? AND queued_at = 0`,
        [
            priority.user_id,
            stableStringify(handoffOptions),
            windows.queuedAt,
            windows.priorityUntil,
            windows.openClaimUntil,
            now,
            leg.leg_id
        ]
    );
    return loadLeg(connection, session.session_id, leg.leg_index);
}

async function applyLegProjection(connection, session, leg, {
    outcome,
    summary = {},
    receiptId = ''
}, now = Date.now()) {
    if (PROCESSED_LEG_STATUSES.has(String(leg.status || ''))) return loadSession(connection, session.session_id);
    const projectedSummary = projectAuthoritativeSummary({ ...summary, result: outcome || summary.result });
    const normalizedOutcome = String(outcome || projectedSummary.result || 'expired');
    const score = computeLegScore(normalizedOutcome, projectedSummary);
    const handoffOptions = deriveHandoffOptions(normalizedOutcome, projectedSummary);
    const members = await loadMembers(connection, session.session_id);
    const runner = findMember(members, leg.runner_user_id);
    const actualProjection = !!(runner && String(leg.run_id || ''));
    const nextStatus = normalizedOutcome === 'skipped' ? 'skipped'
        : normalizedOutcome === 'expired' ? 'expired' : 'projected';
    const route = parseJson(session.route_json, []);
    const routeEntry = {
        legIndex: clampInt(leg.leg_index),
        outcome: normalizedOutcome,
        status: nextStatus,
        tacticId: String(leg.tactic_id || ''),
        routeScore: score,
        runner: runner ? {
            profileId: String(runner.profile_id_snapshot || ''),
            displayName: String(runner.display_name_snapshot || '无名道友'),
            seat: clampInt(runner.seat)
        } : null,
        summary: projectedSummary,
        projectedAt: now
    };
    const nextRoute = route.filter(entry => clampInt(entry && entry.legIndex) !== clampInt(leg.leg_index));
    nextRoute.push(routeEntry);
    nextRoute.sort((left, right) => clampInt(left.legIndex) - clampInt(right.legIndex));

    await dbRun(
        connection,
        `UPDATE relay_expedition_legs
         SET status = ?, outcome = ?, receipt_id = ?, authoritative_summary_json = ?, route_score = ?,
             handoff_options_json = ?, settled_at = CASE WHEN settled_at > 0 THEN settled_at ELSE ? END,
             projected_at = ?, skipped_at = CASE WHEN ? = 'skipped' THEN ? ELSE skipped_at END,
             terminal_at = ?, updated_at = ?
         WHERE leg_id = ? AND status NOT IN ('projected', 'skipped', 'expired')`,
        [
            nextStatus,
            normalizedOutcome,
            String(receiptId || ''),
            stableStringify(projectedSummary),
            score,
            stableStringify(handoffOptions),
            now,
            now,
            normalizedOutcome,
            now,
            now,
            now,
            leg.leg_id
        ]
    );
    if (actualProjection) {
        await dbRun(
            connection,
            `UPDATE relay_expedition_members
             SET projected_legs = projected_legs + 1, last_leg_index = ?, updated_at = ?
             WHERE session_id = ? AND user_id = ?`,
            [leg.leg_index, now, session.session_id, runner.user_id]
        );
    }
    const refreshedMembers = await loadMembers(connection, session.session_id);
    const participantCount = refreshedMembers.filter(member => clampInt(member.projected_legs) > 0).length;
    const processedLegs = clampInt(session.processed_legs) + 1;
    const projectedLegs = clampInt(session.projected_legs) + (actualProjection ? 1 : 0);
    const successfulLegs = clampInt(session.successful_legs) + (normalizedOutcome === 'completed' ? 1 : 0);
    const routeScore = clampInt(session.route_score) + score;
    const complete = processedLegs >= LEG_COUNT;
    let nextLeg = null;
    if (!complete) {
        nextLeg = await loadLeg(connection, session.session_id, clampInt(leg.leg_index) + 1);
        if (!nextLeg) throw makeError(500, 'relay_next_leg_missing', '同道远征下一棒不存在');
        nextLeg = await activateQueuedLeg(
            connection,
            session,
            nextLeg,
            refreshedMembers,
            String(leg.runner_user_id || ''),
            handoffOptions,
            now
        );
    }
    await dbRun(
        connection,
        `UPDATE relay_expedition_sessions
         SET status = ?, current_leg_index = ?, active_leg_id = ?, route_score = ?, successful_legs = ?,
             processed_legs = ?, projected_legs = ?, participant_count = ?, route_json = ?, route_hash = ?,
             state_version = state_version + 1, completed_at = ?, terminal_at = ?, updated_at = ?
         WHERE session_id = ?`,
        [
            complete ? 'completed' : 'active',
            complete ? LEG_COUNT + 1 : clampInt(leg.leg_index) + 1,
            complete ? '' : String(nextLeg && nextLeg.leg_id || ''),
            routeScore,
            successfulLegs,
            processedLegs,
            projectedLegs,
            participantCount,
            stableStringify(nextRoute),
            hashCanonical(nextRoute),
            complete ? now : 0,
            complete ? now : 0,
            now,
            session.session_id
        ]
    );
    await recordOpsEvent(connection, 'leg_processed', {
        rotationId: session.rotation_id,
        sessionId: session.session_id,
        userId: leg.runner_user_id,
        runId: leg.run_id,
        resultCode: normalizedOutcome,
        value: score,
        detail: { legIndex: clampInt(leg.leg_index), status: nextStatus, sessionCompleted: complete }
    }, now);
    return loadSession(connection, session.session_id);
}

async function loadAuthoritativeFacts(connection, leg) {
    if (!leg || !String(leg.run_id || '')) return { run: null, receipt: null };
    const run = await dbGet(
        connection,
        `SELECT * FROM progression_authoritative_runs WHERE run_id = ? AND user_id = ? AND activity_mode = ?`,
        [leg.run_id, leg.runner_user_id, RELAY_MODE]
    );
    const receipt = run ? await dbGet(
        connection,
        `SELECT * FROM progression_authoritative_run_receipts WHERE run_id = ? AND user_id = ?`,
        [leg.run_id, leg.runner_user_id]
    ) : null;
    return { run, receipt };
}

async function reconcileSession(connection, session, now = Date.now()) {
    let current = session;
    for (let guard = 0; guard < LEG_COUNT + 2; guard += 1) {
        if (!current || String(current.status || '') !== 'active') return { session: current, launch: null };
        const legIndex = clampInt(current.current_leg_index);
        if (legIndex < 1 || legIndex > LEG_COUNT) return { session: current, launch: null };
        let leg = await loadLeg(connection, current.session_id, legIndex);
        if (!leg) throw makeError(500, 'relay_current_leg_missing', '同道远征当前棒不存在');
        if (clampInt(leg.queued_at) === 0 && String(leg.status || '') === 'queued') {
            const members = await loadMembers(connection, current.session_id);
            leg = await activateQueuedLeg(connection, current, leg, members, '', legIndex === 1 ? TACTICS.map(entry => entry.tacticId) : ['bulwark', 'insight'], now);
        }
        if (String(leg.status || '') === 'queued') {
            if (clampInt(leg.open_claim_until) > 0 && now >= clampInt(leg.open_claim_until)) {
                current = await applyLegProjection(connection, current, leg, { outcome: 'skipped', summary: { result: 'skipped' } }, now);
                continue;
            }
            return { session: current, launch: null };
        }
        if (['reserved', 'active', 'settled'].includes(String(leg.status || ''))) {
            const facts = await loadAuthoritativeFacts(connection, leg);
            if (facts.receipt) {
                const receipt = parseJson(facts.receipt.receipt_json, {});
                const summary = receipt && receipt.summary || {};
                current = await applyLegProjection(connection, current, leg, {
                    outcome: String(summary.result || 'completed'),
                    summary,
                    receiptId: String(facts.receipt.receipt_id || '')
                }, now);
                continue;
            }
            const runStatus = String(facts.run && facts.run.status || '');
            if (facts.run && runStatus === 'completed') {
                const state = parseJson(facts.run.state_json, {});
                const summary = state && state.summary || { result: 'completed' };
                current = await applyLegProjection(connection, current, leg, {
                    outcome: 'completed',
                    summary
                }, now);
                continue;
            }
            if (facts.run && TERMINAL_RUN_STATUSES.has(runStatus)) {
                const state = parseJson(facts.run.state_json, {});
                const summary = state && state.summary || { result: runStatus };
                current = await applyLegProjection(connection, current, leg, {
                    outcome: String(summary.result || runStatus),
                    summary
                }, now);
                continue;
            }
            if (facts.run && String(leg.status || '') !== 'active') {
                await dbRun(
                    connection,
                    `UPDATE relay_expedition_legs SET status = 'active', started_at = CASE WHEN started_at > 0 THEN started_at ELSE ? END, updated_at = ? WHERE leg_id = ?`,
                    [clampInt(facts.run.started_at || now), now, leg.leg_id]
                );
                leg = await loadLegById(connection, leg.leg_id);
            }
            if (runStatus !== 'completed' && clampInt(leg.active_lease_until) > 0 && now >= clampInt(leg.active_lease_until)) {
                const state = facts.run ? parseJson(facts.run.state_json, {}) : {};
                current = await applyLegProjection(connection, current, leg, {
                    outcome: 'expired',
                    summary: state && state.summary || { result: 'expired' }
                }, now);
                continue;
            }
            if (!facts.run && String(leg.status || '') === 'reserved') {
                return {
                    session: current,
                    launch: {
                        sessionId: String(current.session_id || ''),
                        rotationId: String(current.rotation_id || ''),
                        legId: String(leg.leg_id || ''),
                        legIndex: clampInt(leg.leg_index),
                        runnerUserId: String(leg.runner_user_id || ''),
                        tacticId: String(leg.tactic_id || ''),
                        clientRunId: String(leg.client_run_id || ''),
                        activeLeaseUntil: clampInt(leg.active_lease_until),
                        request: parseJson(leg.request_body_json, {})
                    }
                };
            }
        }
        return { session: current, launch: null };
    }
    throw makeError(500, 'relay_reconcile_guard_exceeded', '同道远征恢复次数超过限制');
}

function getSeedSecret() {
    const secret = String(
        process.env.DEFIER_RELAY_EXPEDITION_SEED_SECRET
        || process.env.DEFIER_WORLD_RIFT_SEED_SECRET
        || process.env.DEFIER_HMAC_SECRET
        || process.env.JWT_SECRET
        || ''
    ).trim();
    if (secret.length < 32) throw makeError(500, 'relay_seed_secret_missing', '同道远征种子密钥未配置');
    return secret;
}

function deriveSeedHex(launch) {
    return crypto.createHmac('sha256', getSeedSecret())
        .update(PROTOCOL_VERSION, 'utf8')
        .update('\n', 'utf8')
        .update(String(launch.rotationId || ''), 'utf8')
        .update('\n', 'utf8')
        .update(String(launch.sessionId || ''), 'utf8')
        .update('\n', 'utf8')
        .update(String(launch.legId || ''), 'utf8')
        .update('\n', 'utf8')
        .update(String(launch.runnerUserId || ''), 'utf8')
        .digest('hex');
}

async function compensateFailedLegLaunch(launch, run, nowProvider, cause) {
    return withWriteTransaction(async connection => {
        const now = nowProvider();
        await ensureRelayExpeditionSchema(connection, now);
        const leg = await loadLegById(connection, launch.legId);
        const runId = String(run && run.runId || '');
        const boundLeg = runId ? await dbGet(
            connection,
            `SELECT leg_id FROM relay_expedition_legs WHERE run_id = ? LIMIT 1`,
            [runId]
        ) : null;
        const ownsReservation = !!(
            leg
            && String(leg.session_id || '') === launch.sessionId
            && String(leg.runner_user_id || '') === launch.runnerUserId
            && String(leg.client_run_id || '') === launch.clientRunId
            && String(leg.status || '') === 'reserved'
            && !String(leg.run_id || '')
        );
        if (ownsReservation) {
            const previous = await dbGet(
                connection,
                `SELECT COALESCE(MAX(leg_index), 0) AS leg_index
                 FROM relay_expedition_legs
                 WHERE session_id = ? AND runner_user_id = ? AND leg_id <> ?
                   AND status IN ('projected', 'skipped', 'expired')`,
                [launch.sessionId, launch.runnerUserId, launch.legId]
            );
            await dbRun(
                connection,
                `UPDATE relay_expedition_members
                 SET claimed_legs = CASE WHEN claimed_legs > 0 THEN claimed_legs - 1 ELSE 0 END,
                     last_leg_index = ?, updated_at = ?
                 WHERE session_id = ? AND user_id = ?`,
                [clampInt(previous && previous.leg_index), now, launch.sessionId, launch.runnerUserId]
            );
            await dbRun(
                connection,
                `UPDATE relay_expedition_legs
                 SET runner_user_id = '', tactic_id = '', client_leg_id = '', client_run_id = '', run_id = NULL,
                     request_hash = '', request_body_json = '{}', seed_fingerprint = '', status = 'queued',
                     reserved_at = 0, started_at = 0, active_lease_until = 0, updated_at = ?
                 WHERE leg_id = ? AND status = 'reserved' AND (run_id IS NULL OR run_id = '')`,
                [now, launch.legId]
            );
            await dbRun(
                connection,
                `UPDATE relay_expedition_sessions SET active_leg_id = ?, updated_at = ? WHERE session_id = ?`,
                [launch.legId, now, launch.sessionId]
            );
        }
        let expiredRun = false;
        if (runId && !boundLeg) {
            const invalidated = await expireInternalRelayRun(
                launch.runnerUserId,
                {
                    runId,
                    clientRunId: launch.clientRunId,
                    reason: String(cause && cause.reason || cause && cause.code || 'relay_bind_failed')
                },
                now,
                { connection }
            );
            expiredRun = !!(invalidated && invalidated.expired);
        }
        if (ownsReservation || expiredRun) {
            await recordOpsEvent(connection, 'leg_launch_compensated', {
                rotationId: launch.rotationId,
                sessionId: launch.sessionId,
                userId: launch.runnerUserId,
                runId,
                resultCode: String(cause && cause.reason || cause && cause.code || 'relay_bind_failed'),
                detail: { legIndex: launch.legIndex, reservationReleased: ownsReservation, orphanExpired: expiredRun }
            }, now);
        }
        return { reservationReleased: ownsReservation, orphanExpired: expiredRun, alreadyBound: !!boundLeg };
    });
}

async function launchReservedLeg(launch, nowProvider) {
    const launchNow = nowProvider();
    const remainingTtl = clampInt(launch.activeLeaseUntil) - launchNow;
    if (remainingTtl <= 0) {
        const error = makeError(409, 'relay_active_lease_expired', '接力运行窗口已结束');
        await compensateFailedLegLaunch(launch, null, nowProvider, error);
        throw error;
    }
    let issued;
    try {
        issued = await issueAuthoritativeRun(
            launch.runnerUserId,
            {
                clientRunId: launch.clientRunId,
                mode: RELAY_MODE,
                contentVersion: CONTENT_VERSION
            },
            launchNow,
            {
                binding: { type: RELAY_MODE, sessionId: launch.sessionId, legId: launch.legId },
                seedHex: deriveSeedHex(launch),
                scenarioId: launch.tacticId,
                runTtlMs: Math.min(remainingTtl, ACTIVE_LEASE_MS),
                startDeadline: launch.activeLeaseUntil,
                startDeadlineReason: 'relay_active_lease_expired',
                startDeadlineMessage: '接力运行窗口已结束',
                nowProvider
            }
        );
    } catch (error) {
        await compensateFailedLegLaunch(launch, null, nowProvider, error);
        throw error;
    }
    const run = issued && issued.run;
    if (!run
        || String(run.clientRunId || '') !== launch.clientRunId
        || String(run.mode || '') !== RELAY_MODE
        || String(run.status || '') !== 'active') {
        const error = makeError(409, 'relay_authoritative_binding_conflict', '权威 run 与接力棒绑定不一致');
        await compensateFailedLegLaunch(launch, run, nowProvider, error);
        throw error;
    }
    try {
        return await withWriteTransaction(async connection => {
            const transactionNow = nowProvider();
            await ensureRelayExpeditionSchema(connection, transactionNow);
            const leg = await loadLegById(connection, launch.legId);
            if (!leg || String(leg.session_id || '') !== launch.sessionId || String(leg.runner_user_id || '') !== launch.runnerUserId) {
                throw makeError(409, 'relay_leg_reservation_changed', '接力棒预留已变化，请刷新');
            }
            if (String(leg.run_id || '')) {
                if (String(leg.run_id || '') !== String(run.runId || '')) {
                    throw makeError(409, 'relay_authoritative_binding_conflict', '接力棒已绑定其他权威 run');
                }
                return { success: true, run, idempotent: true };
            }
            if (String(leg.status || '') !== 'reserved' || transactionNow >= clampInt(leg.active_lease_until)) {
                throw makeError(409, 'relay_active_lease_expired', '接力运行窗口已结束');
            }
            await dbRun(
                connection,
                `UPDATE relay_expedition_legs
                 SET run_id = ?, status = 'active', started_at = ?, updated_at = ?
                 WHERE leg_id = ? AND status = 'reserved' AND (run_id IS NULL OR run_id = '')`,
                [run.runId, clampInt(run.startedAt || transactionNow), transactionNow, leg.leg_id]
            );
            const request = launch.request && typeof launch.request === 'object' ? launch.request : {};
            const receipt = {
                success: true,
                reportVersion: `${REPORT_VERSION}-claim`,
                protocolVersion: PROTOCOL_VERSION,
                leg: {
                    legId: leg.leg_id,
                    legIndex: clampInt(leg.leg_index),
                    status: 'active',
                    tacticId: String(leg.tactic_id || ''),
                    runId: String(run.runId || ''),
                    activeLeaseUntil: clampInt(leg.active_lease_until)
                },
                authoritativeRun: run,
                idempotent: false
            };
            if (request.mutationId) {
                const existing = await loadMutation(connection, launch.runnerUserId, request.mutationId);
                if (!existing) {
                    await storeMutation(connection, launch.runnerUserId, request, 'claim_leg', receipt, {
                        rotationId: launch.rotationId,
                        sessionId: launch.sessionId,
                        legId: launch.legId,
                        now: transactionNow
                    });
                }
            }
            await recordOpsEvent(connection, 'leg_launched', {
                rotationId: launch.rotationId,
                sessionId: launch.sessionId,
                userId: launch.runnerUserId,
                runId: run.runId,
                detail: { legIndex: launch.legIndex, tacticId: launch.tacticId }
            }, transactionNow);
            return receipt;
        });
    } catch (error) {
        await compensateFailedLegLaunch(launch, run, nowProvider, error);
        throw error;
    }
}

async function createRelayExpeditionSession(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeCreateRequest(rawRequest);
    const requestHash = hashCanonical(request);
    const nowProvider = createNowProvider(nowInput);
    const phase = await withWriteTransaction(async connection => {
        const now = nowProvider();
        await ensureRelayExpeditionSchema(connection, now);
        const replay = await replayMutation(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'replay', receipt: replay };
        const rotation = await loadCurrentRotation(connection, now);
        if (!rotation) throw makeError(503, 'relay_rotation_missing', '同道远征轮换不存在');
        if (request.rotationId !== rotation.view.rotationId) {
            throw makeError(409, 'relay_rotation_not_current', '同道远征轮换已更新，请刷新后重试');
        }
        const squad = await dbGet(
            connection,
            `SELECT s.*
             FROM world_rift_squads s
             JOIN world_rift_rotations wr ON wr.rotation_id = s.rotation_id
             WHERE s.squad_id = ? AND s.status = 'active' AND wr.starts_at <= ? AND wr.ends_at > ?`,
            [request.sourceSquadId, now, now]
        );
        if (!squad) throw makeError(404, 'relay_source_squad_not_found', '当前周源裂隙小队不存在');
        if (String(squad.leader_user_id || '') !== identity) {
            throw makeError(403, 'relay_leader_required', '只有当前裂隙小队队长可以开启同道远征');
        }
        const sourceMembers = await dbAll(
            connection,
            `SELECT * FROM world_rift_squad_members
             WHERE squad_id = ? AND status = 'active'
             ORDER BY CASE WHEN role = 'leader' THEN 0 ELSE 1 END ASC, joined_at ASC, user_id ASC`,
            [request.sourceSquadId]
        );
        if (sourceMembers.length < 2 || sourceMembers.length > 4) {
            throw makeError(409, 'relay_roster_size_invalid', '同道远征需要 2-4 名真实小队成员');
        }
        const existingSource = await dbGet(
            connection,
            `SELECT session_id FROM relay_expedition_sessions WHERE rotation_id = ? AND source_squad_id = ?`,
            [request.rotationId, request.sourceSquadId]
        );
        if (existingSource) throw makeError(409, 'relay_session_already_exists', '该小队本轮已开启同道远征');
        for (const member of sourceMembers) {
            const occupied = await dbGet(
                connection,
                `SELECT session_id FROM relay_expedition_members WHERE rotation_id = ? AND user_id = ?`,
                [request.rotationId, member.user_id]
            );
            if (occupied) throw makeError(409, 'relay_member_already_committed', '小队成员本轮已加入其他同道远征');
        }
        const sessionId = deterministicId('relaysession', [request.rotationId, request.sourceSquadId]);
        const firstWindows = buildLegWindows(now);
        await dbRun(
            connection,
            `INSERT INTO relay_expedition_sessions
                (session_id, rotation_id, source_squad_id, source_rotation_id, leader_user_id, client_session_id,
                 status, current_leg_index, active_leg_id, route_json, route_hash, started_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 'active', 1, ?, '[]', ?, ?, ?)`,
            [
                sessionId,
                request.rotationId,
                request.sourceSquadId,
                squad.rotation_id,
                identity,
                request.clientSessionId,
                deterministicId('relayleg', [sessionId, 1]),
                hashCanonical([]),
                now,
                now
            ]
        );
        for (let seat = 0; seat < sourceMembers.length; seat += 1) {
            const member = sourceMembers[seat];
            await dbRun(
                connection,
                `INSERT INTO relay_expedition_members
                    (session_id, rotation_id, user_id, profile_id_snapshot, display_name_snapshot, seat, role,
                     status, locked_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
                [
                    sessionId,
                    request.rotationId,
                    member.user_id,
                    String(member.profile_id_snapshot || ''),
                    String(member.display_name_snapshot || '无名道友'),
                    seat,
                    String(member.role || (seat === 0 ? 'leader' : 'member')),
                    now,
                    now
                ]
            );
        }
        for (let legIndex = 1; legIndex <= LEG_COUNT; legIndex += 1) {
            const priority = sourceMembers[(legIndex - 1) % sourceMembers.length];
            const active = legIndex === 1;
            await dbRun(
                connection,
                `INSERT INTO relay_expedition_legs
                    (leg_id, session_id, rotation_id, leg_index, priority_user_id, status, handoff_options_json,
                     queued_at, priority_until, open_claim_until, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
                [
                    deterministicId('relayleg', [sessionId, legIndex]),
                    sessionId,
                    request.rotationId,
                    legIndex,
                    priority.user_id,
                    stableStringify(active ? TACTICS.map(entry => entry.tacticId) : []),
                    active ? firstWindows.queuedAt : 0,
                    active ? firstWindows.priorityUntil : 0,
                    active ? firstWindows.openClaimUntil : 0,
                    now
                ]
            );
        }
        const receipt = {
            success: true,
            reportVersion: `${REPORT_VERSION}-create`,
            protocolVersion: PROTOCOL_VERSION,
            sessionId,
            rotationId: request.rotationId,
            stateVersion: 0,
            idempotent: false
        };
        await storeMutation(connection, identity, request, 'create_session', receipt, {
            rotationId: request.rotationId,
            sessionId,
            now
        });
        await recordOpsEvent(connection, 'session_created', {
            rotationId: request.rotationId,
            sessionId,
            userId: identity,
            value: sourceMembers.length,
            detail: { memberCount: sourceMembers.length, legCount: LEG_COUNT }
        }, now);
        return { type: 'created', receipt };
    });
    if (phase.type === 'replay') return phase.receipt;
    return getCurrentRelayExpedition(identity, nowProvider);
}

async function getCurrentRelayExpedition(userId, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt += 1) {
        const state = await withWriteTransaction(async connection => {
            const now = nowProvider();
            await ensureRelayExpeditionSchema(connection, now);
            const rotation = await loadCurrentRotation(connection, now);
            if (!rotation) throw makeError(503, 'relay_rotation_missing', '同道远征轮换不存在');
            const sourceSquad = await loadSourceSquadForUser(connection, identity, now);
            let session = await loadUserSessionForRotation(connection, identity, rotation.view.rotationId);
            let launch = null;
            if (session) {
                const reconciled = await reconcileSession(connection, session, now);
                session = reconciled.session;
                launch = reconciled.launch;
            }
            if (launch) return { launch };
            const previousRows = await dbAll(
                connection,
                `SELECT s.*
                 FROM relay_expedition_sessions s
                 JOIN relay_expedition_members m ON m.session_id = s.session_id
                 JOIN relay_expedition_rotations r ON r.rotation_id = s.rotation_id
                 WHERE m.user_id = ? AND s.rotation_id <> ? AND r.claim_ends_at > ?
                 ORDER BY r.starts_at DESC, s.started_at DESC`,
                [identity, rotation.view.rotationId, now]
            );
            const previousSessions = [];
            for (const previous of previousRows) {
                const previousRotation = await loadRotationById(connection, previous.rotation_id, now);
                if (!previousRotation) continue;
                const reconciled = await reconcileSession(connection, previous, now);
                if (reconciled.launch) return { launch: reconciled.launch };
                previousSessions.push({ session: reconciled.session, rotation: previousRotation });
            }
            const currentView = session ? await formatSession(connection, session, identity, rotation, now) : null;
            const previousViews = [];
            for (const entry of previousSessions) {
                previousViews.push(await formatSession(connection, entry.session, identity, entry.rotation, now));
            }
            const primaryView = [currentView, ...previousViews]
                .find(view => view && String(view.status || '') === 'active')
                || currentView
                || null;
            return {
                response: {
                    success: true,
                    reportVersion: `${REPORT_VERSION}-current`,
                    protocolVersion: PROTOCOL_VERSION,
                    rotation: rotation.view,
                    sourceSquad: formatSourceSquad(sourceSquad, identity),
                    currentSession: currentView,
                    session: primaryView,
                    currentLeg: primaryView && primaryView.currentLeg || null,
                    previousSession: previousViews[0] || null,
                    previousSessions: previousViews,
                    observedAt: now,
                    notices: {
                        sharedState: '共享路线、棒次和接力谱，不共享残血、牌组、手牌或战斗随机状态。',
                        fairness: '每位成员最多接两棒；有其他合格成员时，同一账号不能连续接棒。',
                        rewardImpact: REWARD_IMPACT,
                        powerImpact: POWER_IMPACT
                    }
                }
            };
        });
        if (state.response) return state.response;
        if (state.launch) {
            await launchReservedLeg(state.launch, nowProvider);
            continue;
        }
    }
    throw makeError(503, 'relay_recovery_incomplete', '同道远征恢复尚未收敛，请重试');
}

async function claimRelayExpeditionLeg(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeClaimRequest(rawRequest);
    const requestHash = hashCanonical(request);
    const nowProvider = createNowProvider(nowInput);
    const phase = await withWriteTransaction(async connection => {
        const now = nowProvider();
        await ensureRelayExpeditionSchema(connection, now);
        const replay = await replayMutation(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'replay', receipt: replay };
        let session = await loadOwnedSession(connection, identity, request.sessionId);
        if (!session) throw makeError(404, 'relay_session_not_found', '同道远征 session 不存在');
        const reconciled = await reconcileSession(connection, session, now);
        session = reconciled.session;
        if (reconciled.launch) return { type: 'launch', launch: reconciled.launch };
        if (String(session.status || '') !== 'active') throw makeError(409, 'relay_session_terminal', '同道远征已结束');
        if (clampInt(session.current_leg_index) !== request.legIndex) throw makeError(409, 'relay_leg_not_current', '该棒次不是当前接力棒');
        const leg = await loadLeg(connection, session.session_id, request.legIndex);
        if (!leg) throw makeError(404, 'relay_leg_not_found', '同道远征棒次不存在');
        if (String(leg.status || '') !== 'queued') throw makeError(409, 'relay_leg_unavailable', '当前接力棒已被领取');
        if (now >= clampInt(leg.open_claim_until)) throw makeError(409, 'relay_claim_window_closed', '当前接棒窗口已结束');
        if (now < clampInt(leg.priority_until) && String(leg.priority_user_id || '') !== identity) {
            throw makeError(409, 'relay_priority_window_active', '当前仍是优先成员接棒时段');
        }
        const [members, legs] = await Promise.all([loadMembers(connection, session.session_id), loadLegs(connection, session.session_id)]);
        const member = findMember(members, identity);
        if (!canMemberClaimLeg(member, members, legs)) throw makeError(409, 'relay_member_not_eligible', '当前账号不满足接棒资格');
        const allowed = parseJson(leg.handoff_options_json, []);
        if (!Array.isArray(allowed) || !allowed.includes(request.tacticId)) {
            throw makeError(409, 'relay_tactic_not_available', '该接力谱当前不可选');
        }
        const clientConflict = await dbGet(
            connection,
            `SELECT leg_id, request_hash FROM relay_expedition_legs
             WHERE runner_user_id = ? AND client_leg_id = ? LIMIT 1`,
            [identity, request.clientLegId]
        );
        if (clientConflict && String(clientConflict.leg_id || '') !== String(leg.leg_id || '')) {
            throw makeError(409, 'relay_client_leg_conflict', 'clientLegId 已绑定其他接力棒');
        }
        const clientRunId = deterministicId('relayrun', [session.session_id, leg.leg_id, identity, request.clientLegId]);
        const activeLeaseUntil = now + ACTIVE_LEASE_MS;
        const update = await dbRun(
            connection,
            `UPDATE relay_expedition_legs
             SET runner_user_id = ?, tactic_id = ?, client_leg_id = ?, client_run_id = ?, status = 'reserved',
                 request_hash = ?, request_body_json = ?, seed_fingerprint = ?, reserved_at = ?,
                 active_lease_until = ?, updated_at = ?
             WHERE leg_id = ? AND status = 'queued'`,
            [
                identity,
                request.tacticId,
                request.clientLegId,
                clientRunId,
                requestHash,
                stableStringify(request),
                sha256(`${session.rotation_id}:${leg.leg_id}:${identity}`).slice(0, 16),
                now,
                activeLeaseUntil,
                now,
                leg.leg_id
            ]
        );
        if (update.changes !== 1) throw makeError(409, 'relay_leg_claim_raced', '接力棒已被其他成员领取，请刷新');
        await dbRun(
            connection,
            `UPDATE relay_expedition_members
             SET claimed_legs = claimed_legs + 1, last_leg_index = ?, updated_at = ?
             WHERE session_id = ? AND user_id = ?`,
            [leg.leg_index, now, session.session_id, identity]
        );
        await dbRun(
            connection,
            `UPDATE relay_expedition_sessions SET active_leg_id = ?, updated_at = ? WHERE session_id = ?`,
            [leg.leg_id, now, session.session_id]
        );
        await recordOpsEvent(connection, 'leg_reserved', {
            rotationId: session.rotation_id,
            sessionId: session.session_id,
            userId: identity,
            detail: { legIndex: request.legIndex, tacticId: request.tacticId }
        }, now);
        return {
            type: 'launch',
            launch: {
                sessionId: session.session_id,
                rotationId: session.rotation_id,
                legId: leg.leg_id,
                legIndex: clampInt(leg.leg_index),
                runnerUserId: identity,
                tacticId: request.tacticId,
                clientRunId,
                activeLeaseUntil,
                request
            }
        };
    });
    if (phase.type === 'replay') return phase.receipt;
    if (phase.type === 'launch') return launchReservedLeg(phase.launch, nowProvider);
    throw makeError(500, 'relay_claim_phase_invalid', '同道远征接棒状态异常');
}

async function passRelayExpeditionBaton(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizePassRequest(rawRequest);
    const requestHash = hashCanonical(request);
    const nowProvider = createNowProvider(nowInput);
    const phase = await withWriteTransaction(async connection => {
        const now = nowProvider();
        await ensureRelayExpeditionSchema(connection, now);
        const replay = await replayMutation(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'replay', receipt: replay };
        let session = await loadOwnedSession(connection, identity, request.sessionId);
        if (!session) throw makeError(404, 'relay_session_not_found', '同道远征 session 不存在');
        const reconciled = await reconcileSession(connection, session, now);
        session = reconciled.session;
        if (reconciled.launch) return { type: 'launch_then_retry', launch: reconciled.launch };
        if (String(session.status || '') !== 'active' || clampInt(session.current_leg_index) !== request.legIndex) {
            throw makeError(409, 'relay_leg_not_current', '该棒次不是当前接力棒');
        }
        const leg = await loadLeg(connection, session.session_id, request.legIndex);
        if (!leg || String(leg.status || '') !== 'queued') throw makeError(409, 'relay_leg_unavailable', '当前接力棒不能让棒');
        if (String(leg.priority_user_id || '') !== identity || now >= clampInt(leg.priority_until)) {
            throw makeError(409, 'relay_pass_not_allowed', '只有优先成员可在优先时段主动让棒');
        }
        const members = await loadMembers(connection, session.session_id);
        const next = choosePriorityMember(members, { previousRunnerUserId: identity });
        if (!next || String(next.user_id || '') === identity) throw makeError(409, 'relay_no_pass_target', '当前没有其他合格接棒成员');
        const nextPassCount = clampInt(leg.pass_count) + 1;
        const nextPriorityUntil = nextPassCount >= members.length
            ? now
            : Math.min(now + (clampInt(leg.priority_until) - clampInt(leg.queued_at)), clampInt(leg.open_claim_until));
        await dbRun(
            connection,
            `UPDATE relay_expedition_legs
             SET priority_user_id = ?, priority_until = ?, pass_count = ?, updated_at = ?
             WHERE leg_id = ? AND status = 'queued' AND priority_user_id = ?`,
            [next.user_id, nextPriorityUntil, nextPassCount, now, leg.leg_id, identity]
        );
        const receipt = {
            success: true,
            reportVersion: `${REPORT_VERSION}-pass`,
            protocolVersion: PROTOCOL_VERSION,
            sessionId: session.session_id,
            legId: leg.leg_id,
            legIndex: request.legIndex,
            priorityMember: formatMember(next, identity),
            priorityUntil: nextPriorityUntil,
            idempotent: false
        };
        await storeMutation(connection, identity, request, 'pass_baton', receipt, {
            rotationId: session.rotation_id,
            sessionId: session.session_id,
            legId: leg.leg_id,
            now
        });
        await recordOpsEvent(connection, 'baton_passed', {
            rotationId: session.rotation_id,
            sessionId: session.session_id,
            userId: identity,
            detail: { legIndex: request.legIndex, passCount: nextPassCount }
        }, now);
        return { type: 'passed', receipt };
    });
    if (phase.type === 'replay') return phase.receipt;
    if (phase.type === 'launch_then_retry') {
        await launchReservedLeg(phase.launch, nowProvider);
        return passRelayExpeditionBaton(identity, request, nowProvider);
    }
    return getCurrentRelayExpedition(identity, nowProvider);
}

async function projectRelayExpeditionLeg(userId, legId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeProjectRequest(legId, rawRequest);
    const requestHash = hashCanonical(request);
    const nowProvider = createNowProvider(nowInput);
    const phase = await withWriteTransaction(async connection => {
        const now = nowProvider();
        await ensureRelayExpeditionSchema(connection, now);
        const replay = await replayMutation(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'replay', receipt: replay };
        let session = await loadOwnedSession(connection, identity, request.sessionId);
        if (!session) throw makeError(404, 'relay_session_not_found', '同道远征 session 不存在');
        const leg = await loadLegById(connection, request.legId);
        if (!leg || String(leg.session_id || '') !== request.sessionId) throw makeError(404, 'relay_leg_not_found', '同道远征棒次不存在');
        if (String(leg.runner_user_id || '') !== identity || String(leg.run_id || '') !== request.runId) {
            throw makeError(403, 'relay_leg_ownership_mismatch', '该权威 run 不属于当前接棒账号');
        }
        if (!PROCESSED_LEG_STATUSES.has(String(leg.status || ''))) {
            const facts = await loadAuthoritativeFacts(connection, leg);
            if (!facts.run) throw makeError(409, 'relay_authoritative_run_missing', '权威 run 尚未绑定');
            if (facts.receipt) {
                const receipt = parseJson(facts.receipt.receipt_json, {});
                const summary = receipt && receipt.summary || {};
                session = await applyLegProjection(connection, session, leg, {
                    outcome: String(summary.result || 'completed'),
                    summary,
                    receiptId: String(facts.receipt.receipt_id || '')
                }, now);
            } else if (String(facts.run.status || '') === 'completed') {
                const state = parseJson(facts.run.state_json, {});
                const summary = state && state.summary || { result: 'completed' };
                session = await applyLegProjection(connection, session, leg, {
                    outcome: 'completed',
                    summary
                }, now);
            } else if (TERMINAL_RUN_STATUSES.has(String(facts.run.status || ''))) {
                const state = parseJson(facts.run.state_json, {});
                const summary = state && state.summary || { result: facts.run.status };
                session = await applyLegProjection(connection, session, leg, {
                    outcome: String(summary.result || facts.run.status),
                    summary
                }, now);
            } else {
                throw makeError(409, 'relay_run_not_settled', '权威远征尚未结算，不能投影共享路线');
            }
        }
        const refreshedLeg = await loadLegById(connection, request.legId);
        const receipt = {
            success: true,
            reportVersion: `${REPORT_VERSION}-project`,
            protocolVersion: PROTOCOL_VERSION,
            sessionId: request.sessionId,
            leg: {
                legId: request.legId,
                legIndex: clampInt(refreshedLeg.leg_index),
                status: String(refreshedLeg.status || ''),
                outcome: String(refreshedLeg.outcome || ''),
                routeScore: clampInt(refreshedLeg.route_score)
            },
            idempotent: PROCESSED_LEG_STATUSES.has(String(leg.status || ''))
        };
        await storeMutation(connection, identity, request, 'project_leg', receipt, {
            rotationId: session.rotation_id,
            sessionId: session.session_id,
            legId: leg.leg_id,
            now
        });
        return { type: 'projected', receipt };
    });
    if (phase.type === 'replay') return phase.receipt;
    return getCurrentRelayExpedition(identity, nowProvider);
}

async function claimRelayExpeditionReward(userId, milestoneId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeRewardRequest(milestoneId, rawRequest);
    const requestHash = hashCanonical(request);
    const nowProvider = createNowProvider(nowInput);
    for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt += 1) {
        const phase = await withWriteTransaction(async connection => {
            const now = nowProvider();
            await ensureRelayExpeditionSchema(connection, now);
            const replay = await replayMutation(connection, identity, request.mutationId, requestHash);
            if (replay) return { type: 'receipt', receipt: replay };
            let session = await loadOwnedSession(connection, identity, request.sessionId);
            if (!session || String(session.rotation_id || '') !== request.rotationId) {
                throw makeError(404, 'relay_session_not_found', '同道远征领奖 session 不存在');
            }
            const rotation = await loadRotationById(connection, request.rotationId, now);
            if (!rotation || now >= clampInt(rotation.row.claim_ends_at)) {
                throw makeError(409, 'relay_claim_window_closed', '同道远征领奖窗口已结束');
            }
            const reconciled = await reconcileSession(connection, session, now);
            if (reconciled.launch) return { type: 'launch', launch: reconciled.launch };
            session = reconciled.session;
        const member = await dbGet(
            connection,
            `SELECT * FROM relay_expedition_members WHERE session_id = ? AND user_id = ?`,
            [session.session_id, identity]
        );
        if (!member || clampInt(member.projected_legs) < 1) {
            throw makeError(403, 'relay_reward_contribution_required', '至少完成一次真实棒次投影后才能领取奖励');
        }
        const milestone = getMilestone(request.milestoneId);
        if (!isMilestoneUnlocked(milestone, session)) throw makeError(409, 'relay_milestone_locked', '同道远征里程碑尚未达成');
        const existing = await dbGet(
            connection,
            `SELECT * FROM relay_expedition_reward_claims WHERE user_id = ? AND session_id = ? AND milestone_id = ?`,
            [identity, session.session_id, request.milestoneId]
        );
        if (existing) {
            const receipt = {
                success: true,
                reportVersion: `${REPORT_VERSION}-reward`,
                protocolVersion: PROTOCOL_VERSION,
                claimId: existing.claim_id,
                milestoneId: request.milestoneId,
                amount: clampInt(existing.amount),
                currency: String(existing.currency || REWARD_CURRENCY),
                idempotent: true
            };
            await storeMutation(connection, identity, request, 'claim_reward', receipt, {
                rotationId: request.rotationId,
                sessionId: request.sessionId,
                claimId: existing.claim_id,
                now
            });
            return { type: 'receipt', receipt };
        }
        const amount = clampInt(milestone.reward.amount);
        const claimId = deterministicId('relayclaim', [identity, session.session_id, request.milestoneId]);
        const ledgerEntryId = deterministicId('ledger', ['relay_expedition_reward', claimId]);
        await dbRun(
            connection,
            `INSERT INTO progression_economy_balances
                (user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at)
             VALUES (?, ?, ?, ?, 0, ?)
             ON CONFLICT(user_id, currency) DO UPDATE SET
                balance = progression_economy_balances.balance + excluded.balance,
                lifetime_earned = progression_economy_balances.lifetime_earned + excluded.lifetime_earned,
                updated_at = excluded.updated_at`,
            [identity, REWARD_CURRENCY, amount, amount, now]
        );
        const balance = await dbGet(
            connection,
            `SELECT balance FROM progression_economy_balances WHERE user_id = ? AND currency = ?`,
            [identity, REWARD_CURRENCY]
        );
        await dbRun(
            connection,
            `INSERT INTO progression_economy_ledger
                (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                 reward_impact, metadata_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'relay_expedition_reward', ?, ?, ?, ?)`,
            [
                ledgerEntryId,
                identity,
                REWARD_CURRENCY,
                amount,
                clampInt(balance && balance.balance),
                milestone.title,
                `relay:${session.session_id}:${request.milestoneId}`,
                REWARD_IMPACT,
                stableStringify({ rotationId: request.rotationId, sessionRef: makeEntityRef('session', session.session_id), milestoneId: request.milestoneId, powerImpact: POWER_IMPACT }),
                now
            ]
        );
        await dbRun(
            connection,
            `INSERT INTO relay_expedition_reward_claims
                (claim_id, user_id, rotation_id, session_id, milestone_id, currency, amount,
                 reward_impact, power_impact, ledger_entry_id, claim_payload_json, claimed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                claimId,
                identity,
                request.rotationId,
                session.session_id,
                request.milestoneId,
                REWARD_CURRENCY,
                amount,
                REWARD_IMPACT,
                POWER_IMPACT,
                ledgerEntryId,
                stableStringify({ milestoneId: request.milestoneId, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }),
                now
            ]
        );
        const receipt = {
            success: true,
            reportVersion: `${REPORT_VERSION}-reward`,
            protocolVersion: PROTOCOL_VERSION,
            claimId,
            milestoneId: request.milestoneId,
            amount,
            currency: REWARD_CURRENCY,
            rewardImpact: REWARD_IMPACT,
            powerImpact: POWER_IMPACT,
            balanceAfter: clampInt(balance && balance.balance),
            idempotent: false
        };
        await storeMutation(connection, identity, request, 'claim_reward', receipt, {
            rotationId: request.rotationId,
            sessionId: request.sessionId,
            claimId,
            now
        });
        await recordOpsEvent(connection, 'reward_claimed', {
            rotationId: request.rotationId,
            sessionId: request.sessionId,
            userId: identity,
            value: amount,
            detail: { milestoneId: request.milestoneId, currency: REWARD_CURRENCY }
        }, now);
            return { type: 'receipt', receipt };
        });
        if (phase.type === 'receipt') return phase.receipt;
        if (phase.type === 'launch') {
            await launchReservedLeg(phase.launch, nowProvider);
            continue;
        }
    }
    throw makeError(503, 'relay_reward_recovery_incomplete', '同道远征领奖恢复尚未收敛，请重试');
}

async function getRelayExpeditionOpsOverview(nowInput) {
    const nowProvider = createNowProvider(nowInput);
    return withReadConnection(async connection => {
        const now = nowProvider();
        const [sessionTotals, legStatusRows, sessionStatusRows, claimTotal, counterRows, recentRows] = await Promise.all([
            dbGet(connection, `SELECT COUNT(*) AS total, COALESCE(SUM(route_score), 0) AS route_score FROM relay_expedition_sessions`),
            dbAll(connection, `SELECT status, COUNT(*) AS count FROM relay_expedition_legs GROUP BY status ORDER BY status ASC`),
            dbAll(connection, `SELECT status, COUNT(*) AS count FROM relay_expedition_sessions GROUP BY status ORDER BY status ASC`),
            dbGet(connection, `SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount FROM relay_expedition_reward_claims`),
            dbAll(connection, `SELECT * FROM relay_expedition_ops_counters ORDER BY event_type ASC, rotation_id ASC, result_code ASC`),
            dbAll(connection, `SELECT event_type, rotation_id, session_ref, account_ref, run_ref, result_code, value, detail_json, created_at FROM relay_expedition_ops_events ORDER BY created_at DESC, event_id DESC LIMIT 20`)
        ]);
        const mapCounts = rows => Object.fromEntries(rows.map(row => [String(row.status || ''), clampInt(row.count)]));
        return {
            success: true,
            reportVersion: `${REPORT_VERSION}-ops`,
            generatedAt: now,
            protocolVersion: PROTOCOL_VERSION,
            totals: {
                sessions: clampInt(sessionTotals && sessionTotals.total),
                routeScore: clampInt(sessionTotals && sessionTotals.route_score),
                rewardClaims: clampInt(claimTotal && claimTotal.total),
                renownGranted: clampInt(claimTotal && claimTotal.amount)
            },
            sessionsByStatus: mapCounts(sessionStatusRows),
            legsByStatus: mapCounts(legStatusRows),
            counters: counterRows.map(row => ({
                eventType: String(row.event_type || ''),
                rotationId: String(row.rotation_id || ''),
                resultCode: String(row.result_code || ''),
                count: clampInt(row.event_count),
                totalValue: clampInt(row.total_value),
                updatedAt: clampInt(row.updated_at)
            })),
            recentEvents: recentRows.map(row => ({
                eventType: String(row.event_type || ''),
                rotationId: String(row.rotation_id || ''),
                sessionRef: String(row.session_ref || ''),
                accountRef: String(row.account_ref || ''),
                runRef: String(row.run_ref || ''),
                resultCode: String(row.result_code || ''),
                value: clampInt(row.value),
                detail: parseJson(row.detail_json, {}),
                createdAt: clampInt(row.created_at)
            }))
        };
    }, { transaction: true });
}

module.exports = {
    PROTOCOL_VERSION,
    REPORT_VERSION,
    claimRelayExpeditionLeg,
    claimRelayExpeditionReward,
    createRelayExpeditionSession,
    getCurrentRelayExpedition,
    getRelayExpeditionOpsOverview,
    normalizeClaimRequest,
    normalizeCreateRequest,
    normalizePassRequest,
    normalizeProjectRequest,
    normalizeRewardRequest,
    passRelayExpeditionBaton,
    projectRelayExpeditionLeg
};
