const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../db/database');
const { CONTENT_VERSION } = require('../progression/authoritative-runs/catalog');
const {
    deterministicId,
    hashCanonical,
    sha256,
    stableStringify
} = require('../progression/authoritative-runs/canonical');
const {
    getAuthoritativeRun,
    issueAuthoritativeRun
} = require('../progression/authoritative-runs/service');
const { ensureChallengeLadderSchema } = require('./bootstrap');
const {
    ATTEMPT_LIMIT,
    LEADERBOARD_LIMIT,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    SEED_SLOT_COUNT,
    SETTLEMENT_GRACE_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart
} = require('./catalog');

const REPORT_VERSION = 'account-challenge-ladder-v1';
const OPS_REPORT_VERSION = 'challenge-ladder-ops-v1';
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_MILESTONE_ID = /^[A-Za-z0-9._:-]{2,48}$/;
const INTERNAL_SEED = /^[a-f0-9]{64}$/;
const ACTIVE_ATTEMPT_STATUSES = ['reserved', 'active', 'completed'];

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
            console.error('[ChallengeLadder] Write rollback failed:', rollbackError);
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

function safeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
}

function safeMilestoneId(value) {
    const text = String(value || '').trim();
    return SAFE_MILESTONE_ID.test(text) ? text : '';
}

function parseJson(value, fallback = null) {
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
        return fallback;
    }
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

function assertAllowedKeys(source, allowed, reason = 'invalid_request_payload') {
    const unknown = Object.keys(source).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
        throw makeError(400, reason, `请求包含不允许字段: ${unknown[0]}`);
    }
}

function makeAccountRef(userId) {
    return `account-${sha256(String(userId || '')).slice(0, 16)}`;
}

function getSeedSecret() {
    const primary = String(process.env.DEFIER_CHALLENGE_LADDER_SEED_SECRET || '').trim();
    if (primary) return primary;
    const fallback = String(process.env.DEFIER_HMAC_SECRET || '').trim();
    if (fallback) return fallback;
    if (String(process.env.NODE_ENV || '').trim() === 'production') {
        throw makeError(503, 'challenge_ladder_seed_secret_missing', '众生试炼种子密钥未配置');
    }
    return 'defier-dev-challenge-ladder-seed-secret';
}

function deriveSeedHex(rotationId, seedSlot, catalogHash) {
    const seedHex = crypto.createHmac('sha256', getSeedSecret())
        .update([PROTOCOL_VERSION, String(rotationId || ''), String(seedSlot || ''), String(catalogHash || '')].join('|'))
        .digest('hex');
    if (!INTERNAL_SEED.test(seedHex)) {
        throw makeError(500, 'challenge_ladder_seed_invalid', '众生试炼服务端种子无效');
    }
    return seedHex;
}

function makeSeedFingerprint(seedHex) {
    return sha256(`challenge-ladder:${String(seedHex || '')}`).slice(0, 24);
}

function normalizeStartRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'rotationId', 'clientAttemptId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const rotationId = safeId(source.rotationId);
    const clientAttemptId = safeId(source.clientAttemptId);
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '众生试炼协议版本不受支持');
    }
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!clientAttemptId) throw makeError(400, 'invalid_client_attempt_id', 'clientAttemptId 非法');
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, rotationId, clientAttemptId, mutationId };
}

function normalizeSubmitRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'runId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const runId = safeId(source.runId);
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '众生试炼协议版本不受支持');
    }
    if (!runId) throw makeError(400, 'invalid_run_id', 'runId 非法');
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, runId, mutationId };
}

function normalizeClaimRequest(milestoneIdFromPath, rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'rotationId', 'milestoneId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const rotationId = safeId(source.rotationId);
    const milestoneId = safeMilestoneId(source.milestoneId);
    const mutationId = safeId(source.mutationId);
    const requestedMilestoneId = safeMilestoneId(milestoneIdFromPath);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '众生试炼协议版本不受支持');
    }
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!milestoneId || milestoneId !== requestedMilestoneId) {
        throw makeError(400, 'milestone_id_mismatch', '里程碑与请求路径不一致');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, rotationId, milestoneId, mutationId };
}

function compareResultLike(left, right) {
    const scoreDelta = clampInt(right.official_score ?? right.officialScore) - clampInt(left.official_score ?? left.officialScore);
    if (scoreDelta !== 0) return scoreDelta;
    const turnDelta = clampInt(left.turns) - clampInt(right.turns);
    if (turnDelta !== 0) return turnDelta;
    const hpDelta = clampInt(right.remaining_hp ?? right.remainingHp) - clampInt(left.remaining_hp ?? left.remainingHp);
    if (hpDelta !== 0) return hpDelta;
    const submittedDelta = clampInt(left.submitted_at ?? left.submittedAt) - clampInt(right.submitted_at ?? right.submittedAt);
    if (submittedDelta !== 0) return submittedDelta;
    return String(left.result_id || left.best_result_id || left.resultId || '').localeCompare(
        String(right.result_id || right.best_result_id || right.resultId || '')
    );
}

function rotationState(rotation, now = Date.now()) {
    if (!rotation) return 'closed';
    if (now < clampInt(rotation.startsAt)) return 'pending';
    if (now < clampInt(rotation.endsAt)) return 'active';
    if (now < clampInt(rotation.graceEndsAt)) return 'grace';
    return 'closed';
}

function formatRotation(rotation, now = Date.now()) {
    if (!rotation) return null;
    return {
        rotationId: String(rotation.rotationId || ''),
        protocolVersion: String(rotation.protocolVersion || PROTOCOL_VERSION),
        catalogVersion: String(rotation.catalogVersion || ''),
        rotationRuleVersion: String(rotation.rotationRuleVersion || ''),
        templateId: String(rotation.templateId || ''),
        title: String(rotation.title || ''),
        description: String(rotation.description || ''),
        startsAt: clampInt(rotation.startsAt),
        endsAt: clampInt(rotation.endsAt),
        graceEndsAt: clampInt(rotation.graceEndsAt),
        state: rotationState(rotation, now),
        attemptLimit: clampInt(rotation.attemptLimit, 1, ATTEMPT_LIMIT),
        seedSlotCount: clampInt(rotation.seedSlotCount, 1, SEED_SLOT_COUNT),
        leaderboardLimit: clampInt(rotation.leaderboardLimit, 1, LEADERBOARD_LIMIT),
        scoring: rotation.scoring || { mode: 'balanced' },
        fairness: rotation.fairness || {},
        milestones: Array.isArray(rotation.milestones) ? rotation.milestones.map(entry => ({
            milestoneId: String(entry.milestoneId || ''),
            title: String(entry.title || ''),
            targetScore: clampInt(entry.targetScore),
            reward: {
                rewardType: String(entry.reward && entry.reward.rewardType || 'rotation_milestone'),
                currency: String(entry.reward && entry.reward.currency || REWARD_CURRENCY),
                amount: clampInt(entry.reward && entry.reward.amount),
                rewardImpact: String(entry.reward && entry.reward.rewardImpact || REWARD_IMPACT),
                spendPolicy: String(entry.reward && entry.reward.spendPolicy || 'cosmetic_only')
            }
        })) : []
    };
}

function formatAttempt(attempt) {
    if (!attempt) return null;
    return {
        attemptId: String(attempt.attempt_id || attempt.attemptId || ''),
        rotationId: String(attempt.rotation_id || attempt.rotationId || ''),
        clientAttemptId: String(attempt.client_attempt_id || attempt.clientAttemptId || ''),
        runId: String(attempt.run_id || attempt.runId || '') || null,
        status: String(attempt.status || ''),
        attemptIndex: clampInt(attempt.attempt_index ?? attempt.attemptIndex, 0, ATTEMPT_LIMIT),
        seedSlot: clampInt(attempt.seed_slot ?? attempt.seedSlot, 0, SEED_SLOT_COUNT),
        seedFingerprint: String(attempt.seed_fingerprint || attempt.seedFingerprint || ''),
        reservedAt: clampInt(attempt.reserved_at ?? attempt.reservedAt),
        startedAt: clampInt(attempt.started_at ?? attempt.startedAt),
        activatedAt: clampInt(attempt.activated_at ?? attempt.activatedAt),
        completedAt: clampInt(attempt.completed_at ?? attempt.completedAt),
        submittedAt: clampInt(attempt.submitted_at ?? attempt.submittedAt),
        terminalAt: clampInt(attempt.terminal_at ?? attempt.terminalAt),
        updatedAt: clampInt(attempt.updated_at ?? attempt.updatedAt),
        resumable: ACTIVE_ATTEMPT_STATUSES.includes(String(attempt.status || ''))
    };
}

function formatResult(result) {
    if (!result) return null;
    return {
        resultId: String(result.result_id || ''),
        attemptId: String(result.attempt_id || ''),
        runId: String(result.run_id || ''),
        receiptId: String(result.receipt_id || ''),
        rotationId: String(result.rotation_id || ''),
        officialScore: clampInt(result.official_score),
        baseScore: clampInt(result.base_score),
        bonusScore: clampInt(result.bonus_score),
        grade: String(result.grade || ''),
        turns: clampInt(result.turns),
        remainingHp: clampInt(result.remaining_hp),
        damageTaken: clampInt(result.damage_taken),
        completedAttempts: clampInt(result.completed_attempts),
        stateHash: String(result.state_hash || ''),
        chainHead: String(result.chain_head || ''),
        submittedAt: clampInt(result.submitted_at),
        summary: parseJson(result.summary_json, {})
    };
}

function formatBalance(balance) {
    return {
        currency: REWARD_CURRENCY,
        balance: clampInt(balance && balance.balance),
        lifetimeEarned: clampInt(balance && balance.lifetime_earned),
        lifetimeSpent: clampInt(balance && balance.lifetime_spent),
        updatedAt: clampInt(balance && balance.updated_at),
        spendPolicy: 'cosmetic_only'
    };
}

function parseRotationRow(row) {
    if (!row) return null;
    const snapshot = parseJson(row.snapshot_json, {});
    const milestones = Array.isArray(snapshot.milestones) ? snapshot.milestones : parseJson(row.milestones_json, []);
    return {
        rotationId: String(row.rotation_id || snapshot.rotationId || ''),
        protocolVersion: String(row.protocol_version || snapshot.protocolVersion || PROTOCOL_VERSION),
        catalogVersion: String(row.catalog_version || snapshot.catalogVersion || ''),
        rotationRuleVersion: String(row.rule_version || snapshot.rotationRuleVersion || ''),
        catalogHash: String(row.catalog_hash || snapshot.catalogHash || ''),
        templateId: String(row.template_id || snapshot.templateId || ''),
        title: String(row.title || snapshot.title || ''),
        description: String(row.description || snapshot.description || ''),
        startsAt: clampInt(row.starts_at || snapshot.startsAt),
        endsAt: clampInt(row.ends_at || snapshot.endsAt),
        graceEndsAt: clampInt(row.grace_ends_at || snapshot.graceEndsAt),
        attemptLimit: clampInt(row.attempt_limit || snapshot.attemptLimit, 1, ATTEMPT_LIMIT),
        seedSlotCount: clampInt(row.seed_slot_count || snapshot.seedSlotCount, 1, SEED_SLOT_COUNT),
        leaderboardLimit: clampInt(row.leaderboard_limit || snapshot.leaderboardLimit, 1, LEADERBOARD_LIMIT),
        scoring: snapshot.scoring || parseJson(row.scoring_params_json, { mode: String(row.scoring_mode || 'balanced') }),
        milestones,
        fairness: snapshot.fairness || {},
        snapshotHash: String(row.snapshot_hash || snapshot.snapshotHash || '')
    };
}

async function loadRotationById(connection, rotationId) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_rotations
         WHERE rotation_id = ?`,
        [rotationId]
    );
    return parseRotationRow(row);
}

async function loadCurrentRotation(connection, now = Date.now()) {
    const snapshot = buildRotationSnapshot(now);
    return loadRotationById(connection, snapshot.rotationId);
}

async function loadPreviousGraceRotation(connection, now = Date.now()) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_rotations
         WHERE ends_at <= ? AND grace_ends_at > ?
         ORDER BY ends_at DESC
         LIMIT 1`,
        [now, now]
    );
    return parseRotationRow(row);
}

async function loadRelevantRotation(connection, rotationId, now = Date.now()) {
    const rotation = await loadRotationById(connection, rotationId);
    if (rotation) return rotation;
    const current = buildRotationSnapshot(now);
    if (rotationId === current.rotationId) return formatRotation(current, now);
    const previous = buildRotationSnapshotForStart(current.startsAt - 7 * 24 * 60 * 60 * 1000);
    if (rotationId === previous.rotationId) return formatRotation(previous, now);
    return null;
}

async function getStoredMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT rotation_id, request_hash, receipt_json
         FROM challenge_ladder_mutations
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function ensureMutationAvailable(connection, userId, mutationId, requestHash) {
    const row = await getStoredMutation(connection, userId, mutationId);
    if (!row) return null;
    if (String(row.request_hash || '') === requestHash) {
        const receipt = parseJson(row.receipt_json, null);
        if (!receipt || typeof receipt !== 'object') {
            throw makeError(500, 'challenge_ladder_corrupt_mutation_receipt', '众生试炼幂等回执损坏');
        }
        return receipt;
    }
    throw makeMutationConflictError();
}

async function storeMutationReceipt(connection, {
    userId,
    mutationId,
    rotationId,
    requestType,
    requestHash,
    requestBody,
    receipt,
    attemptId = '',
    resultId = '',
    claimId = '',
    now = Date.now()
}) {
    await dbRun(
        connection,
        `INSERT INTO challenge_ladder_mutations
            (user_id, mutation_id, rotation_id, request_type, request_hash, request_body_json, receipt_json,
             attempt_id, result_id, claim_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            mutationId,
            rotationId,
            requestType,
            requestHash,
            stableStringify(requestBody),
            JSON.stringify(receipt),
            attemptId,
            resultId,
            claimId,
            now
        ]
    );
}

async function persistMutationReceiptIfNeeded(userId, mutationId, requestHash, payload, response, meta) {
    return withWriteTransaction(async connection => {
        await ensureChallengeLadderSchema(connection, meta.now);
        const replay = await ensureMutationAvailable(connection, userId, mutationId, requestHash);
        if (replay) return replay;
        await storeMutationReceipt(connection, {
            userId,
            mutationId,
            rotationId: meta.rotationId,
            requestType: meta.requestType,
            requestHash,
            requestBody: payload,
            receipt: response,
            attemptId: meta.attemptId,
            resultId: meta.resultId,
            claimId: meta.claimId,
            now: meta.now
        });
        return response;
    });
}

async function recordOpsEvent(connection, eventType, {
    rotationId,
    accountRef = '',
    resultCode = 'ok',
    value = 0,
    detail = {}
}, now = Date.now()) {
    const safeDetail = {
        status: String(detail.status || '').slice(0, 32),
        attemptIndex: clampInt(detail.attemptIndex, 0, ATTEMPT_LIMIT),
        seedSlot: clampInt(detail.seedSlot, 0, SEED_SLOT_COUNT),
        score: clampInt(detail.score, 0, 1_000_000),
        milestoneId: String(detail.milestoneId || '').slice(0, 48),
        source: String(detail.source || '').slice(0, 48)
    };
    const eventId = `aclops-${crypto.randomUUID()}`;
    await dbRun(
        connection,
        `INSERT INTO challenge_ladder_ops_events
            (event_id, event_type, rotation_id, account_ref, result_code, value, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            eventId,
            eventType,
            rotationId,
            accountRef,
            resultCode,
            clampInt(value, 0, 1_000_000),
            JSON.stringify(safeDetail),
            now
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO challenge_ladder_ops_counters
            (event_type, rotation_id, result_code, event_count, total_value, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, rotation_id, result_code) DO UPDATE SET
            event_count = challenge_ladder_ops_counters.event_count + 1,
            total_value = challenge_ladder_ops_counters.total_value + excluded.total_value,
            updated_at = excluded.updated_at`,
        [
            eventType,
            rotationId,
            resultCode,
            clampInt(value, 0, 1_000_000),
            now
        ]
    );
}

async function loadAttemptById(connection, userId, attemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_attempts
         WHERE attempt_id = ? AND user_id = ?`,
        [attemptId, userId]
    );
}

async function loadAttemptByClientAttempt(connection, userId, rotationId, clientAttemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_attempts
         WHERE user_id = ? AND rotation_id = ? AND client_attempt_id = ?`,
        [userId, rotationId, clientAttemptId]
    );
}

async function loadAttemptByMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_attempts
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function loadAttemptByRunId(connection, userId, runId) {
    return dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_attempts
         WHERE user_id = ? AND run_id = ?`,
        [userId, runId]
    );
}

async function countAttemptsUsed(connection, userId, rotationId) {
    const row = await dbGet(
        connection,
        `SELECT COUNT(*) AS count
         FROM challenge_ladder_attempts
         WHERE user_id = ? AND rotation_id = ?`,
        [userId, rotationId]
    );
    return clampInt(row && row.count, 0, ATTEMPT_LIMIT);
}

async function loadExistingResult(connection, attemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_results
         WHERE attempt_id = ?`,
        [attemptId]
    );
}

async function loadBestResult(connection, userId, rotationId) {
    const row = await dbGet(
        connection,
        `SELECT r.*, e.completed_attempts
         FROM challenge_ladder_entries e
         JOIN challenge_ladder_results r ON r.result_id = e.best_result_id
         WHERE e.rotation_id = ? AND e.user_id = ?`,
        [rotationId, userId]
    );
    return row || null;
}

async function loadMilestoneClaims(connection, userId, rotationId) {
    const rows = await dbAll(
        connection,
        `SELECT milestone_id, claimed_at
         FROM challenge_ladder_reward_claims
         WHERE user_id = ? AND rotation_id = ?`,
        [userId, rotationId]
    );
    return new Map(rows.map(row => [String(row.milestone_id || ''), clampInt(row.claimed_at)]));
}

async function loadResumableAttempt(connection, userId, now = Date.now()) {
    const row = await dbGet(
        connection,
        `SELECT a.*
         FROM challenge_ladder_attempts a
         JOIN challenge_ladder_rotations r ON r.rotation_id = a.rotation_id
         WHERE a.user_id = ?
           AND a.status IN ('reserved', 'active', 'completed')
           AND r.grace_ends_at > ?
         ORDER BY CASE a.status
            WHEN 'reserved' THEN 0
            WHEN 'active' THEN 1
            ELSE 2
         END,
         a.updated_at DESC,
         a.attempt_index ASC
         LIMIT 1`,
        [userId, now]
    );
    return row || null;
}

async function loadAuthoritativeRunRow(connection, userId, runId) {
    return dbGet(
        connection,
        `SELECT run_id, user_id, client_run_id, activity_mode, status, content_version, content_hash,
                state_hash, chain_head, started_at, completed_at, settled_at, abandoned_at, expires_at, updated_at
         FROM progression_authoritative_runs
         WHERE run_id = ? AND user_id = ?`,
        [runId, userId]
    );
}

async function loadAuthoritativeReceipt(connection, userId, runId) {
    return dbGet(
        connection,
        `SELECT receipt_id, receipt_json, created_at
         FROM progression_authoritative_run_receipts
         WHERE run_id = ? AND user_id = ?`,
        [runId, userId]
    );
}

function mapRunStatusToAttemptStatus(runStatus, hasResult) {
    if (hasResult) return 'submitted';
    switch (String(runStatus || '')) {
    case 'active':
        return 'active';
    case 'completed':
    case 'settled':
        return 'completed';
    case 'defeated':
        return 'defeated';
    case 'abandoned':
        return 'abandoned';
    case 'expired':
        return 'expired';
    default:
        return 'reserved';
    }
}

async function syncAttemptState(connection, attempt, now = Date.now()) {
    if (!attempt) return null;
    const existingResult = await loadExistingResult(connection, attempt.attempt_id);
    if (!attempt.run_id) {
        if (existingResult && String(attempt.status || '') !== 'submitted') {
            await dbRun(
                connection,
                `UPDATE challenge_ladder_attempts
                 SET status = 'submitted',
                     submitted_at = ?,
                     terminal_at = CASE WHEN terminal_at > 0 THEN terminal_at ELSE ? END,
                     updated_at = ?
                 WHERE attempt_id = ? AND user_id = ?`,
                [clampInt(existingResult.submitted_at), clampInt(existingResult.submitted_at), now, attempt.attempt_id, attempt.user_id]
            );
            return loadAttemptById(connection, attempt.user_id, attempt.attempt_id);
        }
        if (String(attempt.status || '') === 'reserved') {
            const rotation = await loadRotationById(connection, attempt.rotation_id);
            if (rotation && now >= clampInt(rotation.endsAt)) {
                await dbRun(
                    connection,
                    `UPDATE challenge_ladder_attempts
                     SET status = 'expired',
                         terminal_at = CASE WHEN terminal_at > 0 THEN terminal_at ELSE ? END,
                         updated_at = ?
                     WHERE attempt_id = ? AND user_id = ?`,
                    [clampInt(rotation.endsAt), now, attempt.attempt_id, attempt.user_id]
                );
                return loadAttemptById(connection, attempt.user_id, attempt.attempt_id);
            }
        }
        return attempt;
    }
    const run = await loadAuthoritativeRunRow(connection, attempt.user_id, attempt.run_id);
    if (!run) throw makeError(409, 'challenge_ladder_run_missing', '众生试炼绑定的权威 run 不存在');
    const nextStatus = mapRunStatusToAttemptStatus(run.status, !!existingResult);
    const nextStartedAt = clampInt(run.started_at);
    const nextCompletedAt = clampInt(run.completed_at || run.settled_at);
    const nextSubmittedAt = existingResult ? clampInt(existingResult.submitted_at) : clampInt(attempt.submitted_at);
    const nextTerminalAt = nextStatus === 'submitted'
        ? nextSubmittedAt
        : ['defeated', 'abandoned', 'expired'].includes(nextStatus)
            ? Math.max(clampInt(run.abandoned_at), clampInt(run.expires_at), nextCompletedAt, clampInt(attempt.terminal_at))
            : clampInt(attempt.terminal_at);
    if (String(attempt.status || '') === nextStatus
        && clampInt(attempt.started_at) === nextStartedAt
        && clampInt(attempt.completed_at) === nextCompletedAt
        && clampInt(attempt.submitted_at) === nextSubmittedAt
        && clampInt(attempt.terminal_at) === nextTerminalAt) {
        return attempt;
    }
    await dbRun(
        connection,
        `UPDATE challenge_ladder_attempts
         SET status = ?,
             started_at = ?,
             activated_at = CASE WHEN activated_at > 0 THEN activated_at ELSE ? END,
             completed_at = ?,
             submitted_at = ?,
             terminal_at = ?,
             updated_at = ?
         WHERE attempt_id = ? AND user_id = ?`,
        [
            nextStatus,
            nextStartedAt,
            nextStartedAt,
            nextCompletedAt,
            nextSubmittedAt,
            nextTerminalAt,
            now,
            attempt.attempt_id,
            attempt.user_id
        ]
    );
    return loadAttemptById(connection, attempt.user_id, attempt.attempt_id);
}

function computeBonusScore(rotation, summary) {
    const scoring = rotation && rotation.scoring || {};
    if (String(scoring.mode || '') === 'tempo') {
        const turnPar = clampInt(scoring.turnPar, 0, 64);
        const bonusPerTurn = clampInt(scoring.bonusPerTurn, 0, 100);
        const bonusCap = clampInt(scoring.bonusCap, 0, 1000);
        return Math.min(Math.max(turnPar - clampInt(summary.turns), 0) * bonusPerTurn, bonusCap);
    }
    if (String(scoring.mode || '') === 'survival') {
        const bonusPerHp = clampInt(scoring.bonusPerHp, 0, 100);
        const bonusCap = clampInt(scoring.bonusCap, 0, 1000);
        return Math.min(clampInt(summary.remainingHp) * bonusPerHp, bonusCap);
    }
    return 0;
}

function validateProjectionInputs(rotation, attempt, run, receiptPayload, receiptRow, now = Date.now()) {
    if (!rotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
    if (!run) throw makeError(409, 'challenge_ladder_run_missing', '众生试炼绑定的权威 run 不存在');
    if (String(run.activity_mode || '') !== 'challenge_ladder') {
        throw makeError(409, 'challenge_ladder_run_mode_invalid', '权威回执模式与众生试炼不一致');
    }
    if (String(run.client_run_id || '') !== String(attempt.client_run_id || '')) {
        throw makeError(409, 'challenge_ladder_run_binding_invalid', '权威 run 与正式尝试绑定不一致');
    }
    if (clampInt(run.started_at) < clampInt(rotation.startsAt) || clampInt(run.started_at) >= clampInt(rotation.endsAt)) {
        throw makeError(409, 'challenge_ladder_rotation_window_mismatch', '权威 run 不属于该轮换窗口');
    }
    if (clampInt(receiptRow && receiptRow.created_at) > clampInt(rotation.graceEndsAt)) {
        throw makeError(409, 'challenge_ladder_receipt_after_grace', '结算宽限已结束，不能再投影正式成绩');
    }
    if (now >= clampInt(rotation.graceEndsAt)) {
        throw makeError(409, 'challenge_ladder_settlement_window_closed', '该轮众生试炼已结档，不能再写入正式榜');
    }
    if (String(receiptPayload.receiptId || '') !== String(receiptRow && receiptRow.receipt_id || '')
        || String(receiptPayload.runId || '') !== String(attempt.run_id || '')
        || String(receiptPayload.mode || '') !== 'challenge_ladder'
        || String(receiptPayload.contentVersion || '') !== String(run.content_version || '')
        || String(receiptPayload.contentHash || '') !== String(run.content_hash || '')
        || String(receiptPayload.trustTier || '') !== 'server_authoritative'
        || String(receiptPayload.authorityLevel || '') !== 'server_replayed'
        || !receiptPayload.integrity
        || receiptPayload.integrity.fullReplayPassed !== true
        || String(receiptPayload.integrity.stateHash || '') !== String(run.state_hash || '')
        || String(receiptPayload.integrity.chainHead || '') !== String(run.chain_head || '')) {
        throw makeError(409, 'challenge_ladder_receipt_invalid', '权威回执完整性校验失败');
    }
    if (!receiptPayload.summary || String(receiptPayload.summary.result || '') !== 'completed') {
        throw makeError(409, 'challenge_ladder_receipt_incomplete', '权威 run 尚未形成可上榜回执');
    }
}

async function upsertBestEntry(connection, resultRow, now = Date.now()) {
    const completedAttemptsRow = await dbGet(
        connection,
        `SELECT COUNT(*) AS count
         FROM challenge_ladder_results
         WHERE user_id = ? AND rotation_id = ?`,
        [resultRow.user_id, resultRow.rotation_id]
    );
    const completedAttempts = clampInt(completedAttemptsRow && completedAttemptsRow.count);
    const existing = await dbGet(
        connection,
        `SELECT *
         FROM challenge_ladder_entries
         WHERE rotation_id = ? AND user_id = ?`,
        [resultRow.rotation_id, resultRow.user_id]
    );
    if (!existing) {
        await dbRun(
            connection,
            `INSERT INTO challenge_ladder_entries
                (rotation_id, user_id, best_result_id, official_score, base_score, bonus_score, grade,
                 turns, remaining_hp, damage_taken, submitted_at, completed_attempts, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                resultRow.rotation_id,
                resultRow.user_id,
                resultRow.result_id,
                clampInt(resultRow.official_score),
                clampInt(resultRow.base_score),
                clampInt(resultRow.bonus_score),
                String(resultRow.grade || ''),
                clampInt(resultRow.turns),
                clampInt(resultRow.remaining_hp),
                clampInt(resultRow.damage_taken),
                clampInt(resultRow.submitted_at),
                completedAttempts,
                now
            ]
        );
        return;
    }
    const better = compareResultLike(resultRow, existing) < 0;
    await dbRun(
        connection,
        `UPDATE challenge_ladder_entries
         SET best_result_id = CASE WHEN ? THEN ? ELSE best_result_id END,
             official_score = CASE WHEN ? THEN ? ELSE official_score END,
             base_score = CASE WHEN ? THEN ? ELSE base_score END,
             bonus_score = CASE WHEN ? THEN ? ELSE bonus_score END,
             grade = CASE WHEN ? THEN ? ELSE grade END,
             turns = CASE WHEN ? THEN ? ELSE turns END,
             remaining_hp = CASE WHEN ? THEN ? ELSE remaining_hp END,
             damage_taken = CASE WHEN ? THEN ? ELSE damage_taken END,
             submitted_at = CASE WHEN ? THEN ? ELSE submitted_at END,
             completed_attempts = ?,
             updated_at = ?
         WHERE rotation_id = ? AND user_id = ?`,
        [
            better ? 1 : 0,
            resultRow.result_id,
            better ? 1 : 0,
            clampInt(resultRow.official_score),
            better ? 1 : 0,
            clampInt(resultRow.base_score),
            better ? 1 : 0,
            clampInt(resultRow.bonus_score),
            better ? 1 : 0,
            String(resultRow.grade || ''),
            better ? 1 : 0,
            clampInt(resultRow.turns),
            better ? 1 : 0,
            clampInt(resultRow.remaining_hp),
            better ? 1 : 0,
            clampInt(resultRow.damage_taken),
            better ? 1 : 0,
            clampInt(resultRow.submitted_at),
            completedAttempts,
            now,
            resultRow.rotation_id,
            resultRow.user_id
        ]
    );
}

async function projectAttemptResult(connection, attempt, now = Date.now(), source = 'submit') {
    let syncedAttempt = await syncAttemptState(connection, attempt, now);
    const existingResult = await loadExistingResult(connection, syncedAttempt.attempt_id);
    if (existingResult) {
        if (String(syncedAttempt.status || '') !== 'submitted') {
            await dbRun(
                connection,
                `UPDATE challenge_ladder_attempts
                 SET status = 'submitted',
                     submitted_at = ?,
                     terminal_at = CASE WHEN terminal_at > 0 THEN terminal_at ELSE ? END,
                     updated_at = ?
                 WHERE attempt_id = ? AND user_id = ?`,
                [clampInt(existingResult.submitted_at), clampInt(existingResult.submitted_at), now, syncedAttempt.attempt_id, syncedAttempt.user_id]
            );
            syncedAttempt = await loadAttemptById(connection, syncedAttempt.user_id, syncedAttempt.attempt_id);
        }
        return { attempt: syncedAttempt, result: existingResult, projected: false };
    }
    if (!syncedAttempt.run_id) return { attempt: syncedAttempt, result: null, projected: false };
    const rotation = await loadRotationById(connection, syncedAttempt.rotation_id);
    const run = await loadAuthoritativeRunRow(connection, syncedAttempt.user_id, syncedAttempt.run_id);
    const receiptRow = await loadAuthoritativeReceipt(connection, syncedAttempt.user_id, syncedAttempt.run_id);
    if (!receiptRow) return { attempt: syncedAttempt, result: null, projected: false };
    const receiptPayload = parseJson(receiptRow.receipt_json, {});
    validateProjectionInputs(rotation, syncedAttempt, run, receiptPayload, receiptRow, now);
    const summary = receiptPayload.summary || {};
    const baseScore = clampInt(summary.score);
    const bonusScore = computeBonusScore(rotation, summary);
    const officialScore = baseScore + bonusScore;
    const submittedAt = clampInt(receiptPayload.settledAt || receiptRow.created_at || now);
    const resultId = deterministicId('aclresult', [syncedAttempt.attempt_id, receiptPayload.receiptId || receiptRow.receipt_id]);
    const resultRow = {
        result_id: resultId,
        attempt_id: syncedAttempt.attempt_id,
        run_id: syncedAttempt.run_id,
        receipt_id: String(receiptPayload.receiptId || receiptRow.receipt_id || ''),
        user_id: syncedAttempt.user_id,
        rotation_id: syncedAttempt.rotation_id,
        base_score: baseScore,
        bonus_score: bonusScore,
        official_score: officialScore,
        grade: String(summary.grade || ''),
        turns: clampInt(summary.turns),
        remaining_hp: clampInt(summary.remainingHp),
        damage_taken: clampInt(summary.damageTaken),
        state_hash: String(receiptPayload.integrity && receiptPayload.integrity.stateHash || ''),
        chain_head: String(receiptPayload.integrity && receiptPayload.integrity.chainHead || ''),
        mutation_hash: sha256(`${source}:${syncedAttempt.attempt_id}:${String(receiptPayload.receiptId || '')}`),
        summary_json: JSON.stringify({
            ...summary,
            officialScore,
            bonusScore,
            scoringMode: String(rotation && rotation.scoring && rotation.scoring.mode || 'balanced')
        }),
        receipt_json: JSON.stringify({
            receiptId: String(receiptPayload.receiptId || ''),
            trustTier: String(receiptPayload.trustTier || ''),
            authorityLevel: String(receiptPayload.authorityLevel || ''),
            integrity: receiptPayload.integrity || {},
            settledAt: clampInt(receiptPayload.settledAt)
        }),
        submitted_at: submittedAt
    };
    await dbRun(
        connection,
        `INSERT INTO challenge_ladder_results
            (result_id, attempt_id, run_id, receipt_id, user_id, rotation_id, base_score, bonus_score,
             official_score, grade, turns, remaining_hp, damage_taken, state_hash, chain_head,
             mutation_hash, summary_json, receipt_json, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            resultRow.result_id,
            resultRow.attempt_id,
            resultRow.run_id,
            resultRow.receipt_id,
            resultRow.user_id,
            resultRow.rotation_id,
            resultRow.base_score,
            resultRow.bonus_score,
            resultRow.official_score,
            resultRow.grade,
            resultRow.turns,
            resultRow.remaining_hp,
            resultRow.damage_taken,
            resultRow.state_hash,
            resultRow.chain_head,
            resultRow.mutation_hash,
            resultRow.summary_json,
            resultRow.receipt_json,
            resultRow.submitted_at
        ]
    );
    await upsertBestEntry(connection, resultRow, now);
    await dbRun(
        connection,
        `UPDATE challenge_ladder_attempts
         SET status = 'submitted',
             completed_at = CASE WHEN completed_at > 0 THEN completed_at ELSE ? END,
             submitted_at = ?,
             terminal_at = CASE WHEN terminal_at > 0 THEN terminal_at ELSE ? END,
             updated_at = ?
         WHERE attempt_id = ? AND user_id = ?`,
        [clampInt(run && (run.completed_at || run.settled_at)), submittedAt, submittedAt, now, syncedAttempt.attempt_id, syncedAttempt.user_id]
    );
    await recordOpsEvent(connection, 'result_projected', {
        rotationId: syncedAttempt.rotation_id,
        accountRef: makeAccountRef(syncedAttempt.user_id),
        resultCode: 'ok',
        value: officialScore,
        detail: {
            status: 'submitted',
            attemptIndex: clampInt(syncedAttempt.attempt_index),
            seedSlot: clampInt(syncedAttempt.seed_slot),
            score: officialScore,
            source
        }
    }, now);
    return {
        attempt: await loadAttemptById(connection, syncedAttempt.user_id, syncedAttempt.attempt_id),
        result: await loadExistingResult(connection, syncedAttempt.attempt_id),
        projected: true
    };
}

async function reconcileUserState(connection, userId, now = Date.now()) {
    const rows = await dbAll(
        connection,
        `SELECT a.*
         FROM challenge_ladder_attempts a
         JOIN challenge_ladder_rotations r ON r.rotation_id = a.rotation_id
         WHERE a.user_id = ?
           AND a.status IN ('reserved', 'active', 'completed')
           AND (
                r.grace_ends_at > ?
                OR (a.status = 'reserved' AND (a.run_id IS NULL OR a.run_id = '') AND r.ends_at <= ?)
           )`,
        [userId, now, now]
    );
    for (const row of rows) {
        const synced = await syncAttemptState(connection, row, now);
        if (synced && synced.run_id) {
            await projectAttemptResult(connection, synced, now, 'current');
        }
    }
}

async function getLeaderboard(connection, rotationId, userId) {
    const rows = await dbAll(
        connection,
        `SELECT e.*, u.username
         FROM challenge_ladder_entries e
         JOIN users u ON u.id = e.user_id
         WHERE e.rotation_id = ?
         ORDER BY e.official_score DESC, e.turns ASC, e.remaining_hp DESC, e.submitted_at ASC, e.best_result_id ASC
         LIMIT ?`,
        [rotationId, LEADERBOARD_LIMIT]
    );
    const best = await loadBestResult(connection, userId, rotationId);
    let myRank = null;
    if (best) {
        const rankRow = await dbGet(
            connection,
            `SELECT COUNT(*) AS count
             FROM challenge_ladder_entries
             WHERE rotation_id = ?
               AND (
                    official_score > ?
                 OR (official_score = ? AND turns < ?)
                 OR (official_score = ? AND turns = ? AND remaining_hp > ?)
                 OR (official_score = ? AND turns = ? AND remaining_hp = ? AND submitted_at < ?)
                 OR (official_score = ? AND turns = ? AND remaining_hp = ? AND submitted_at = ? AND best_result_id < ?)
               )`,
            [
                rotationId,
                clampInt(best.official_score),
                clampInt(best.official_score), clampInt(best.turns),
                clampInt(best.official_score), clampInt(best.turns), clampInt(best.remaining_hp),
                clampInt(best.official_score), clampInt(best.turns), clampInt(best.remaining_hp), clampInt(best.submitted_at),
                clampInt(best.official_score), clampInt(best.turns), clampInt(best.remaining_hp), clampInt(best.submitted_at), String(best.result_id || '')
            ]
        );
        myRank = {
            rank: clampInt(rankRow && rankRow.count) + 1,
            userName: null,
            result: formatResult(best)
        };
    }
    return {
        entries: rows.map((row, index) => ({
            rank: index + 1,
            userName: String(row.username || ''),
            officialScore: clampInt(row.official_score),
            baseScore: clampInt(row.base_score),
            bonusScore: clampInt(row.bonus_score),
            grade: String(row.grade || ''),
            turns: clampInt(row.turns),
            remainingHp: clampInt(row.remaining_hp),
            damageTaken: clampInt(row.damage_taken),
            submittedAt: clampInt(row.submitted_at),
            isSelf: String(row.user_id || '') === String(userId || '')
        })),
        myRank
    };
}

function buildMilestoneView(rotation, bestResult, claimMap) {
    const bestScore = clampInt(bestResult && bestResult.official_score);
    return (rotation.milestones || []).map(entry => {
        const claimedAt = clampInt(claimMap.get(String(entry.milestoneId || '')));
        return {
            milestoneId: String(entry.milestoneId || ''),
            title: String(entry.title || ''),
            targetScore: clampInt(entry.targetScore),
            claimed: claimedAt > 0,
            claimedAt,
            claimable: bestScore >= clampInt(entry.targetScore) && claimedAt === 0,
            reward: {
                rewardType: String(entry.reward && entry.reward.rewardType || 'rotation_milestone'),
                currency: String(entry.reward && entry.reward.currency || REWARD_CURRENCY),
                amount: clampInt(entry.reward && entry.reward.amount),
                rewardImpact: String(entry.reward && entry.reward.rewardImpact || REWARD_IMPACT),
                spendPolicy: String(entry.reward && entry.reward.spendPolicy || 'cosmetic_only')
            }
        };
    });
}

async function hydrateRun(userId, runId, now = Date.now()) {
    if (!runId) return null;
    try {
        const response = await getAuthoritativeRun(userId, runId, now);
        return response && response.run || null;
    } catch (error) {
        if (Number(error && error.statusCode) === 404) return null;
        throw error;
    }
}

async function launchReservedAttempt(userId, attemptId, now = Date.now()) {
    const phase = await withWriteTransaction(async connection => {
        await ensureChallengeLadderSchema(connection, now);
        const attempt = await loadAttemptById(connection, userId, attemptId);
        if (!attempt) throw makeError(404, 'challenge_ladder_attempt_not_found', '众生试炼尝试不存在');
        const rotation = await loadRotationById(connection, attempt.rotation_id);
        if (!rotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
        if (rotationState(rotation, now) !== 'active') {
            throw makeError(409, 'challenge_ladder_start_window_closed', '该轮众生试炼已停止发车');
        }
        return {
            attempt,
            rotation,
            seedHex: deriveSeedHex(attempt.rotation_id, clampInt(attempt.seed_slot), rotation.catalogHash)
        };
    });
    const authoritative = await issueAuthoritativeRun(
        userId,
        {
            clientRunId: String(phase.attempt.client_run_id || ''),
            mode: 'challenge_ladder',
            contentVersion: CONTENT_VERSION
        },
        now,
        {
            binding: {
                type: 'challenge_ladder',
                rotationId: phase.attempt.rotation_id,
                attemptId: phase.attempt.attempt_id
            },
            seedHex: phase.seedHex
        }
    );
    const finalized = await withWriteTransaction(async connection => {
        await ensureChallengeLadderSchema(connection, now);
        const attempt = await loadAttemptById(connection, userId, attemptId);
        if (!attempt) throw makeError(404, 'challenge_ladder_attempt_not_found', '众生试炼尝试不存在');
        const run = authoritative && authoritative.run || null;
        if (!run || !safeId(run.runId)) {
            throw makeError(500, 'challenge_ladder_run_launch_failed', '众生试炼权威发车失败');
        }
        if (String(run.clientRunId || '') !== String(attempt.client_run_id || '')) {
            throw makeError(409, 'challenge_ladder_run_binding_invalid', '权威 run 与正式尝试绑定不一致');
        }
        if (String(attempt.run_id || '') && String(attempt.run_id || '') !== String(run.runId || '')) {
            throw makeError(409, 'challenge_ladder_run_binding_conflict', '正式尝试已绑定其他权威 run');
        }
        await dbRun(
            connection,
            `UPDATE challenge_ladder_attempts
             SET run_id = CASE WHEN run_id IS NULL OR run_id = '' THEN ? ELSE run_id END,
                 status = ?,
                 started_at = CASE WHEN started_at > 0 THEN started_at ELSE ? END,
                 activated_at = CASE WHEN activated_at > 0 THEN activated_at ELSE ? END,
                 completed_at = CASE WHEN ? > 0 THEN ? ELSE completed_at END,
                 terminal_at = CASE WHEN ? > 0 THEN ? ELSE terminal_at END,
                 updated_at = ?
             WHERE attempt_id = ? AND user_id = ?`,
            [
                run.runId,
                String(run.status || 'active') === 'completed' ? 'completed' : 'active',
                clampInt(run.startedAt),
                clampInt(run.startedAt),
                clampInt(run.completedAt),
                clampInt(run.completedAt),
                0,
                0,
                now,
                attemptId,
                userId
            ]
        );
        const refreshed = await loadAttemptById(connection, userId, attemptId);
        await recordOpsEvent(connection, 'attempt_bound', {
            rotationId: refreshed.rotation_id,
            accountRef: makeAccountRef(userId),
            resultCode: 'ok',
            detail: {
                status: String(refreshed.status || ''),
                attemptIndex: clampInt(refreshed.attempt_index),
                seedSlot: clampInt(refreshed.seed_slot)
            }
        }, now);
        return refreshed;
    });
    return { attempt: finalized, run: authoritative.run };
}

function buildStartResponse(rotation, attempt, run, now, { idempotent = false, resumedExisting = false } = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-start`,
        protocolVersion: PROTOCOL_VERSION,
        idempotent,
        resumedExisting,
        rotation: formatRotation(rotation, now),
        attempt: formatAttempt(attempt),
        run
    };
}

function buildSubmitResponse(rotation, attempt, result, now, { idempotent = false } = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-submit`,
        protocolVersion: PROTOCOL_VERSION,
        idempotent,
        rotation: formatRotation(rotation, now),
        attempt: formatAttempt(attempt),
        result: formatResult(result)
    };
}

function buildClaimResponse(rotation, claim, balance, now, { alreadyClaimed = false, idempotent = false } = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-claim`,
        protocolVersion: PROTOCOL_VERSION,
        alreadyClaimed,
        idempotent,
        rotation: formatRotation(rotation, now),
        claim: {
            claimId: String(claim.claim_id || ''),
            milestoneId: String(claim.milestone_id || ''),
            currency: String(claim.currency || REWARD_CURRENCY),
            amount: clampInt(claim.amount),
            rewardImpact: String(claim.reward_impact || REWARD_IMPACT),
            claimedAt: clampInt(claim.claimed_at)
        },
        balance: formatBalance(balance)
    };
}

async function getCurrentChallengeLadder(userId, now = Date.now()) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const state = await withWriteTransaction(async connection => {
        await ensureChallengeLadderSchema(connection, now);
        await reconcileUserState(connection, identity, now);
        const rotation = await loadCurrentRotation(connection, now);
        if (!rotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
        const usedAttempts = await countAttemptsUsed(connection, identity, rotation.rotationId);
        const resumableAttempt = await loadResumableAttempt(connection, identity, now);
        const bestResult = await loadBestResult(connection, identity, rotation.rotationId);
        const claimMap = await loadMilestoneClaims(connection, identity, rotation.rotationId);
        const leaderboard = await getLeaderboard(connection, rotation.rotationId, identity);
        const previousRotation = await loadPreviousGraceRotation(connection, now);
        let previousGrace = null;
        if (previousRotation && previousRotation.rotationId !== rotation.rotationId) {
            const previousBest = await loadBestResult(connection, identity, previousRotation.rotationId);
            if (previousBest) {
                const previousClaims = await loadMilestoneClaims(connection, identity, previousRotation.rotationId);
                previousGrace = {
                    rotation: previousRotation,
                    bestResult: previousBest,
                    milestones: buildMilestoneView(previousRotation, previousBest, previousClaims)
                };
            }
        }
        return {
            rotation,
            usedAttempts,
            remainingAttempts: Math.max(clampInt(rotation.attemptLimit, 1, ATTEMPT_LIMIT) - usedAttempts, 0),
            resumableAttempt,
            bestResult,
            milestones: buildMilestoneView(rotation, bestResult, claimMap),
            leaderboard,
            previousGrace
        };
    });
    const response = {
        success: true,
        reportVersion: `${REPORT_VERSION}-current`,
        protocolVersion: PROTOCOL_VERSION,
        rotation: formatRotation(state.rotation, now),
        allowance: {
            attemptLimit: clampInt(state.rotation.attemptLimit, 1, ATTEMPT_LIMIT),
            usedAttempts: state.usedAttempts,
            remainingAttempts: state.remainingAttempts
        },
        resumableAttempt: state.resumableAttempt ? {
            ...formatAttempt(state.resumableAttempt),
            run: await hydrateRun(identity, state.resumableAttempt.run_id, now)
        } : null,
        personalBest: formatResult(state.bestResult),
        milestones: state.milestones,
        leaderboard: state.leaderboard,
        previousGrace: state.previousGrace ? {
            rotation: formatRotation(state.previousGrace.rotation, now),
            personalBest: formatResult(state.previousGrace.bestResult),
            milestones: state.previousGrace.milestones
        } : null,
        notices: {
            fairness: [
                '正式榜仅接受服务端权威回执',
                '每周 3 次正式尝试，共享 3 个种子槽',
                '离线练习不会进入正式榜'
            ],
            settlementGraceMs: SETTLEMENT_GRACE_MS
        }
    };
    return response;
}

async function startChallengeLadderAttempt(userId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeStartRequest(rawRequest);
    const requestHash = hashCanonical(request);
    const phase = await withWriteTransaction(async connection => {
        await ensureChallengeLadderSchema(connection, now);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'mutation_replay', receipt: replay };
        await reconcileUserState(connection, identity, now);
        const rotation = await loadCurrentRotation(connection, now);
        if (!rotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
        const existingByMutation = await loadAttemptByMutation(connection, identity, request.mutationId);
        if (existingByMutation) {
            if (String(existingByMutation.request_hash || '') !== requestHash) {
                throw makeMutationConflictError();
            }
            const existingRotation = await loadRotationById(connection, String(existingByMutation.rotation_id || ''));
            if (!existingRotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
            if (String(existingByMutation.status || '') === 'reserved' && !String(existingByMutation.run_id || '')) {
                return { type: 'launch_reserved', rotation: existingRotation, attemptId: String(existingByMutation.attempt_id || '') };
            }
            if (!String(existingByMutation.run_id || '')) {
                throw makeError(409, 'challenge_ladder_attempt_terminal', '该次正式尝试已结束，不能重新发车');
            }
            return { type: 'resume_existing', rotation: existingRotation, attempt: existingByMutation };
        }
        const existingByClient = await loadAttemptByClientAttempt(connection, identity, request.rotationId, request.clientAttemptId);
        if (existingByClient) {
            if (String(existingByClient.request_hash || '') !== requestHash) {
                throw makeError(409, 'client_attempt_conflict', 'clientAttemptId 已绑定其他众生试炼请求');
            }
            const existingRotation = await loadRotationById(connection, String(existingByClient.rotation_id || ''));
            if (!existingRotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
            if (String(existingByClient.status || '') === 'reserved' && !String(existingByClient.run_id || '')) {
                return { type: 'launch_reserved', rotation: existingRotation, attemptId: String(existingByClient.attempt_id || '') };
            }
            if (!String(existingByClient.run_id || '')) {
                throw makeError(409, 'challenge_ladder_attempt_terminal', '该次正式尝试已结束，不能重新发车');
            }
            return { type: 'resume_existing', rotation: existingRotation, attempt: existingByClient };
        }
        const resumable = await loadResumableAttempt(connection, identity, now);
        if (resumable) {
            const resumableRotation = await loadRotationById(connection, String(resumable.rotation_id || ''));
            if (!resumableRotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
            if (String(resumable.status || '') === 'reserved' && !String(resumable.run_id || '')) {
                return { type: 'launch_reserved', rotation: resumableRotation, attemptId: String(resumable.attempt_id || '') };
            }
            return { type: 'resume_existing', rotation: resumableRotation, attempt: resumable };
        }
        if (request.rotationId !== rotation.rotationId) {
            throw makeError(409, 'rotation_not_current', '众生试炼轮换已更新，请刷新后重试');
        }
        const usedAttempts = await countAttemptsUsed(connection, identity, rotation.rotationId);
        if (usedAttempts >= clampInt(rotation.attemptLimit, 1, ATTEMPT_LIMIT)) {
            throw makeError(409, 'no_attempts_remaining', '本轮正式尝试次数已用尽');
        }
        const attemptIndex = usedAttempts + 1;
        const attemptId = deterministicId('aclattempt', [identity, rotation.rotationId, request.clientAttemptId]);
        const seedSlot = attemptIndex;
        const seedHex = deriveSeedHex(rotation.rotationId, seedSlot, rotation.catalogHash);
        const attempt = {
            attemptId,
            rotationId: rotation.rotationId,
            clientAttemptId: request.clientAttemptId,
            mutationId: request.mutationId,
            requestHash,
            requestBodyJson: stableStringify(request),
            attemptIndex,
            seedSlot,
            seedFingerprint: makeSeedFingerprint(seedHex),
            clientRunId: deterministicId('aclrun', [attemptId, rotation.rotationId]),
            reservedAt: now
        };
        await dbRun(
            connection,
            `INSERT INTO challenge_ladder_attempts
                (attempt_id, user_id, rotation_id, client_attempt_id, mutation_id, request_hash, request_body_json,
                 attempt_index, seed_slot, seed_fingerprint, client_run_id, status, reserved_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
            [
                attempt.attemptId,
                identity,
                attempt.rotationId,
                attempt.clientAttemptId,
                attempt.mutationId,
                attempt.requestHash,
                attempt.requestBodyJson,
                attempt.attemptIndex,
                attempt.seedSlot,
                attempt.seedFingerprint,
                attempt.clientRunId,
                attempt.reservedAt,
                now
            ]
        );
        await recordOpsEvent(connection, 'attempt_reserved', {
            rotationId: rotation.rotationId,
            accountRef: makeAccountRef(identity),
            detail: {
                status: 'reserved',
                attemptIndex,
                seedSlot
            }
        }, now);
        return { type: 'launch_reserved', rotation, attemptId };
    });
    if (phase.type === 'mutation_replay') return phase.receipt;
    if (phase.type === 'launch_reserved') {
        const launched = await launchReservedAttempt(identity, phase.attemptId, now);
        const response = buildStartResponse(phase.rotation, launched.attempt, launched.run, now);
        return persistMutationReceiptIfNeeded(identity, request.mutationId, requestHash, request, response, {
            rotationId: phase.rotation.rotationId,
            requestType: 'start',
            attemptId: launched.attempt.attempt_id,
            now
        });
    }
    const syncedRun = await hydrateRun(identity, phase.attempt.run_id, now);
    const response = buildStartResponse(phase.rotation, phase.attempt, syncedRun, now, {
        idempotent: true,
        resumedExisting: true
    });
    return persistMutationReceiptIfNeeded(identity, request.mutationId, requestHash, request, response, {
        rotationId: phase.rotation.rotationId,
        requestType: 'start',
        attemptId: phase.attempt.attempt_id,
        now
    });
}

async function submitChallengeLadderResult(userId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeSubmitRequest(rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        await ensureChallengeLadderSchema(connection, now);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const attempt = await loadAttemptByRunId(connection, identity, request.runId);
        if (!attempt) throw makeError(404, 'challenge_ladder_attempt_not_found', '众生试炼尝试不存在');
        const rotation = await loadRotationById(connection, attempt.rotation_id);
        if (!rotation) throw makeError(503, 'challenge_ladder_rotation_missing', '众生试炼轮换不存在');
        const projection = await projectAttemptResult(connection, attempt, now, 'submit');
        if (!projection.result) {
            throw makeError(409, 'authoritative_receipt_unavailable', '权威结算回执尚未生成，请先完成权威结算');
        }
        const response = buildSubmitResponse(rotation, projection.attempt, projection.result, now, {
            idempotent: !projection.projected
        });
        await storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: rotation.rotationId,
            requestType: 'submit',
            requestHash,
            requestBody: request,
            receipt: response,
            attemptId: projection.attempt.attempt_id,
            resultId: projection.result.result_id,
            now
        });
        return response;
    });
}

async function claimChallengeLadderReward(userId, milestoneId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeClaimRequest(milestoneId, rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        await ensureChallengeLadderSchema(connection, now);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const rotation = await loadRotationById(connection, request.rotationId);
        if (!rotation) throw makeError(404, 'challenge_ladder_rotation_not_found', '众生试炼轮换不存在');
        if (now >= clampInt(rotation.graceEndsAt)) {
            throw makeError(409, 'challenge_ladder_claim_window_closed', '该轮众生试炼已结档，不能再领奖');
        }
        await reconcileUserState(connection, identity, now);
        const bestResult = await loadBestResult(connection, identity, rotation.rotationId);
        if (!bestResult) throw makeError(409, 'challenge_ladder_milestone_unmet', '当前轮换尚无正式成绩');
        const milestone = (rotation.milestones || []).find(entry => String(entry.milestoneId || '') === request.milestoneId);
        if (!milestone) throw makeError(404, 'challenge_ladder_milestone_not_found', '众生试炼里程碑不存在');
        if (clampInt(bestResult.official_score) < clampInt(milestone.targetScore)) {
            throw makeError(409, 'challenge_ladder_milestone_unmet', '正式成绩尚未达到该里程碑');
        }
        const existingClaim = await dbGet(
            connection,
            `SELECT *
             FROM challenge_ladder_reward_claims
             WHERE user_id = ? AND rotation_id = ? AND milestone_id = ?`,
            [identity, rotation.rotationId, request.milestoneId]
        );
        if (!existingClaim) {
            const claimId = deterministicId('aclclaim', [identity, rotation.rotationId, request.milestoneId]);
            const ledgerEntryId = deterministicId('aclledger', [identity, rotation.rotationId, request.milestoneId, REWARD_CURRENCY]);
            const amount = clampInt(milestone.reward && milestone.reward.amount);
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
                    amount,
                    clampInt(balance && balance.balance),
                    String(milestone.title || '众生试炼里程碑'),
                    'challenge_ladder_reward',
                    `challenge_ladder:${rotation.rotationId}:${request.milestoneId}`,
                    REWARD_IMPACT,
                    JSON.stringify({ rotationId: rotation.rotationId, milestoneId: request.milestoneId }),
                    now
                ]
            );
            await dbRun(
                connection,
                `INSERT INTO challenge_ladder_reward_claims
                    (claim_id, user_id, rotation_id, milestone_id, best_result_id, currency, amount,
                     reward_impact, ledger_entry_id, claim_payload_json, claimed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    claimId,
                    identity,
                    rotation.rotationId,
                    request.milestoneId,
                    bestResult.result_id,
                    REWARD_CURRENCY,
                    amount,
                    REWARD_IMPACT,
                    ledgerEntryId,
                    JSON.stringify({ targetScore: clampInt(milestone.targetScore), bestScore: clampInt(bestResult.official_score) }),
                    now
                ]
            );
            await recordOpsEvent(connection, 'reward_claimed', {
                rotationId: rotation.rotationId,
                accountRef: makeAccountRef(identity),
                resultCode: 'ok',
                value: amount,
                detail: {
                    status: 'claimed',
                    milestoneId: request.milestoneId,
                    score: clampInt(bestResult.official_score)
                }
            }, now);
        }
        const claim = await dbGet(
            connection,
            `SELECT *
             FROM challenge_ladder_reward_claims
             WHERE user_id = ? AND rotation_id = ? AND milestone_id = ?`,
            [identity, rotation.rotationId, request.milestoneId]
        );
        const balance = await dbGet(
            connection,
            `SELECT *
             FROM progression_economy_balances
             WHERE user_id = ? AND currency = ?`,
            [identity, REWARD_CURRENCY]
        );
        const response = buildClaimResponse(rotation, claim, balance, now, {
            alreadyClaimed: !!existingClaim,
            idempotent: false
        });
        await storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: rotation.rotationId,
            requestType: 'claim',
            requestHash,
            requestBody: request,
            receipt: response,
            claimId: String(claim.claim_id || ''),
            resultId: String(bestResult.result_id || ''),
            now
        });
        return response;
    });
}

async function getChallengeLadderOpsOverview(now = Date.now()) {
    return withReadConnection(async connection => {
        await ensureChallengeLadderSchema(connection, now);
        const currentRotation = await loadCurrentRotation(connection, now);
        const [totals, attemptStates, counterRows] = await Promise.all([
            dbGet(
                connection,
                `SELECT
                    (SELECT COUNT(*) FROM challenge_ladder_rotations) AS rotations,
                    (SELECT COUNT(*) FROM challenge_ladder_attempts) AS attempts,
                    (SELECT COUNT(DISTINCT user_id) FROM challenge_ladder_attempts) AS players,
                    (SELECT COUNT(*) FROM challenge_ladder_results) AS results,
                    (SELECT COUNT(*) FROM challenge_ladder_reward_claims) AS claims`,
                []
            ),
            dbAll(
                connection,
                `SELECT status, COUNT(*) AS count
                 FROM challenge_ladder_attempts
                 GROUP BY status`,
                []
            ),
            dbAll(
                connection,
                `SELECT event_type, rotation_id, result_code, event_count, total_value, updated_at
                 FROM challenge_ladder_ops_counters
                 ORDER BY updated_at DESC, event_count DESC
                 LIMIT 100`,
                []
            )
        ]);
        const stateCounts = {
            reserved: 0,
            active: 0,
            completed: 0,
            submitted: 0,
            defeated: 0,
            abandoned: 0,
            expired: 0
        };
        for (const row of attemptStates) {
            const key = String(row.status || '');
            if (Object.prototype.hasOwnProperty.call(stateCounts, key)) {
                stateCounts[key] = clampInt(row.count);
            }
        }
        return {
            success: true,
            reportVersion: OPS_REPORT_VERSION,
            generatedAt: now,
            currentRotation: formatRotation(currentRotation, now),
            totals: {
                rotations: clampInt(totals && totals.rotations),
                attempts: clampInt(totals && totals.attempts),
                players: clampInt(totals && totals.players),
                results: clampInt(totals && totals.results),
                claims: clampInt(totals && totals.claims)
            },
            attemptStates: stateCounts,
            counters: counterRows.map(row => ({
                eventType: String(row.event_type || ''),
                rotationId: String(row.rotation_id || ''),
                resultCode: String(row.result_code || ''),
                eventCount: clampInt(row.event_count),
                totalValue: clampInt(row.total_value),
                updatedAt: clampInt(row.updated_at)
            }))
        };
    });
}

module.exports = {
    claimChallengeLadderReward,
    getChallengeLadderOpsOverview,
    getCurrentChallengeLadder,
    startChallengeLadderAttempt,
    submitChallengeLadderResult
};
