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
    issueAuthoritativeRun,
    settleAuthoritativeRun
} = require('../progression/authoritative-runs/service');
const { ensureFateChronicleSchema } = require('./bootstrap');
const {
    CATALOG_VERSION,
    CHAPTERS,
    CLAIM_WINDOW_MS,
    MILESTONES,
    POWER_IMPACT,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    ROTATION_RULE_VERSION,
    RUN_TTL_MS,
    SETTLEMENT_GRACE_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart,
    getChapter,
    getOath
} = require('./catalog');

const REPORT_VERSION = 'account-fate-chronicle-v1';
const OPS_REPORT_VERSION = 'fate-chronicle-ops-v1';
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_SHORT_ID = /^[A-Za-z0-9._:-]{2,64}$/;
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
                console.error('[FateChronicle] Read rollback failed:', rollbackError);
            }
        }
        throw error;
    } finally {
        await closeDb(connection);
    }
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
            console.error('[FateChronicle] Write rollback failed:', rollbackError);
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

function createNowProvider(nowInput) {
    const fixedNow = Number.isFinite(Number(nowInput)) ? clampInt(nowInput) : null;
    return () => fixedNow !== null ? fixedNow : Date.now();
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

function safeShortId(value) {
    const text = String(value || '').trim();
    return SAFE_SHORT_ID.test(text) ? text : '';
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
    return makeError(409, 'mutation_reused', 'mutationId 已被其他命途长卷请求占用');
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
    const primary = String(process.env.DEFIER_FATE_CHRONICLE_SEED_SECRET || '').trim();
    if (primary) return primary;
    const fallback = String(process.env.DEFIER_HMAC_SECRET || '').trim();
    if (fallback) return fallback;
    if (String(process.env.NODE_ENV || '').trim() === 'production') {
        throw makeError(503, 'fate_chronicle_seed_secret_missing', '命途长卷种子密钥未配置');
    }
    return 'defier-dev-fate-chronicle-seed-secret';
}

function deriveSeedHex(rotationId, chapterId, oathId, scenarioId, catalogHash) {
    const seedHex = crypto.createHmac('sha256', getSeedSecret())
        .update([
            PROTOCOL_VERSION,
            String(rotationId || ''),
            String(chapterId || ''),
            String(oathId || ''),
            String(scenarioId || ''),
            String(catalogHash || '')
        ].join('|'))
        .digest('hex');
    if (!INTERNAL_SEED.test(seedHex)) {
        throw makeError(500, 'fate_chronicle_seed_invalid', '命途长卷服务端种子无效');
    }
    return seedHex;
}

function makeSeedFingerprint(seedHex) {
    return sha256(`fate-chronicle:${String(seedHex || '')}`).slice(0, 24);
}

function normalizeStartRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'rotationId', 'chapterId', 'oathId', 'clientAttemptId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const rotationId = safeId(source.rotationId);
    const chapterId = safeShortId(source.chapterId);
    const oathId = safeShortId(source.oathId);
    const clientAttemptId = safeId(source.clientAttemptId);
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '命途长卷协议版本不受支持');
    }
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!chapterId) throw makeError(400, 'invalid_chapter_id', 'chapterId 非法');
    if (!oathId) throw makeError(400, 'invalid_oath_id', 'oathId 非法');
    if (!clientAttemptId) throw makeError(400, 'invalid_client_attempt_id', 'clientAttemptId 非法');
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, rotationId, chapterId, oathId, clientAttemptId, mutationId };
}

function normalizeSubmitRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'runId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const runId = safeId(source.runId);
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '命途长卷协议版本不受支持');
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
    const milestoneId = safeShortId(source.milestoneId);
    const mutationId = safeId(source.mutationId);
    const requestedMilestoneId = safeShortId(milestoneIdFromPath);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '命途长卷协议版本不受支持');
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
    return String(left.result_id || left.resultId || '').localeCompare(String(right.result_id || right.resultId || ''));
}

function rotationState(rotation, now = Date.now()) {
    if (!rotation) return 'closed';
    if (now < clampInt(rotation.startsAt)) return 'pending';
    if (now < clampInt(rotation.endsAt)) return 'active';
    if (now < clampInt(rotation.graceEndsAt)) return 'grace';
    if (now < clampInt(rotation.claimEndsAt)) return 'claim';
    return 'closed';
}

function formatRotation(rotation, now = Date.now()) {
    if (!rotation) return null;
    return {
        rotationId: String(rotation.rotationId || ''),
        protocolVersion: String(rotation.protocolVersion || PROTOCOL_VERSION),
        catalogVersion: String(rotation.catalogVersion || CATALOG_VERSION),
        rotationRuleVersion: String(rotation.rotationRuleVersion || ROTATION_RULE_VERSION),
        title: String(rotation.title || ''),
        description: String(rotation.description || ''),
        startsAt: clampInt(rotation.startsAt),
        endsAt: clampInt(rotation.endsAt),
        graceEndsAt: clampInt(rotation.graceEndsAt),
        claimEndsAt: clampInt(rotation.claimEndsAt),
        runTtlMs: clampInt(rotation.runTtlMs, 1, RUN_TTL_MS),
        state: rotationState(rotation, now),
        rewardCurrency: String(rotation.rewardCurrency || REWARD_CURRENCY),
        rewardImpact: String(rotation.rewardImpact || REWARD_IMPACT),
        powerImpact: String(rotation.powerImpact || POWER_IMPACT),
        chapters: Array.isArray(rotation.chapters) ? rotation.chapters.map(chapter => ({
            chapterId: String(chapter.chapterId || ''),
            chapterIndex: clampInt(chapter.chapterIndex, 1, CHAPTERS.length),
            title: String(chapter.title || ''),
            description: String(chapter.description || ''),
            unlockRequirement: chapter.unlockRequirement || {},
            oaths: Array.isArray(chapter.oaths) ? chapter.oaths.map(oath => ({
                oathId: String(oath.oathId || ''),
                scenarioId: String(oath.scenarioId || ''),
                title: String(oath.title || ''),
                description: String(oath.description || ''),
                encounterCount: clampInt(oath.encounterCount),
                maxHp: clampInt(oath.maxHp),
                turnBudget: clampInt(oath.turnBudget),
                betweenEncounterHeal: clampInt(oath.betweenEncounterHeal),
                scoreMultiplier: Number(oath.scoreMultiplier) || 1
            })) : []
        })) : [],
        milestones: Array.isArray(rotation.milestones) ? rotation.milestones.map(entry => ({
            milestoneId: String(entry.milestoneId || ''),
            milestoneType: String(entry.milestoneType || ''),
            chapterId: String(entry.chapterId || ''),
            title: String(entry.title || ''),
            reward: {
                currency: String(entry.reward && entry.reward.currency || REWARD_CURRENCY),
                amount: clampInt(entry.reward && entry.reward.amount),
                rewardImpact: String(entry.reward && entry.reward.rewardImpact || REWARD_IMPACT),
                powerImpact: String(entry.reward && entry.reward.powerImpact || POWER_IMPACT)
            }
        })) : [],
        fairness: rotation.fairness || {}
    };
}

function formatAttempt(attempt) {
    if (!attempt) return null;
    return {
        attemptId: String(attempt.attempt_id || attempt.attemptId || ''),
        rotationId: String(attempt.rotation_id || attempt.rotationId || ''),
        chapterId: String(attempt.chapter_id || attempt.chapterId || ''),
        oathId: String(attempt.oath_id || attempt.oathId || ''),
        scenarioId: String(attempt.scenario_id || attempt.scenarioId || ''),
        clientAttemptId: String(attempt.client_attempt_id || attempt.clientAttemptId || ''),
        runId: String(attempt.run_id || attempt.runId || '') || null,
        status: String(attempt.status || ''),
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
        chapterId: String(result.chapter_id || ''),
        oathId: String(result.oath_id || ''),
        scenarioId: String(result.scenario_id || ''),
        officialScore: clampInt(result.official_score),
        grade: String(result.grade || ''),
        turns: clampInt(result.turns),
        remainingHp: clampInt(result.remaining_hp),
        damageTaken: clampInt(result.damage_taken),
        encountersWon: clampInt(result.encounters_won),
        bossWins: clampInt(result.boss_wins),
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
        spendPolicy: 'cosmetic_only',
        powerImpact: POWER_IMPACT
    };
}

function parseRotationRow(row) {
    if (!row) return null;
    const snapshot = parseJson(row.snapshot_json, {});
    return {
        rotationId: String(row.rotation_id || snapshot.rotationId || ''),
        protocolVersion: String(row.protocol_version || snapshot.protocolVersion || PROTOCOL_VERSION),
        catalogVersion: String(row.catalog_version || snapshot.catalogVersion || CATALOG_VERSION),
        rotationRuleVersion: String(row.rule_version || snapshot.rotationRuleVersion || ROTATION_RULE_VERSION),
        catalogHash: String(row.catalog_hash || snapshot.catalogHash || ''),
        title: String(row.title || snapshot.title || ''),
        description: String(row.description || snapshot.description || ''),
        startsAt: clampInt(row.starts_at || snapshot.startsAt),
        endsAt: clampInt(row.ends_at || snapshot.endsAt),
        graceEndsAt: clampInt(row.grace_ends_at || snapshot.graceEndsAt),
        claimEndsAt: clampInt(row.claim_ends_at || snapshot.claimEndsAt),
        runTtlMs: clampInt(row.run_ttl_ms || snapshot.runTtlMs, 1, RUN_TTL_MS),
        rewardCurrency: String(row.reward_currency || snapshot.rewardCurrency || REWARD_CURRENCY),
        rewardImpact: String(row.reward_impact || snapshot.rewardImpact || REWARD_IMPACT),
        powerImpact: String(row.power_impact || snapshot.powerImpact || POWER_IMPACT),
        chapters: snapshot.chapters || parseJson(row.chapters_json, CHAPTERS),
        milestones: snapshot.milestones || parseJson(row.milestones_json, MILESTONES),
        fairness: snapshot.fairness || {},
        snapshotHash: String(row.snapshot_hash || snapshot.snapshotHash || '')
    };
}

function parseProgressRow(row) {
    if (!row) return null;
    return {
        userId: String(row.user_id || ''),
        rotationId: String(row.rotation_id || ''),
        chapterId: String(row.chapter_id || ''),
        completedOaths: parseJson(row.completed_oaths_json, []),
        bestResultId: String(row.best_result_id || ''),
        bestScore: clampInt(row.best_score),
        firstCompletedAt: clampInt(row.first_completed_at),
        dualCompletedAt: clampInt(row.dual_completed_at),
        updatedAt: clampInt(row.updated_at)
    };
}

async function loadRotationById(connection, rotationId) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_rotations
         WHERE rotation_id = ?`,
        [rotationId]
    );
    return parseRotationRow(row);
}

async function loadCurrentRotation(connection, now = Date.now()) {
    const snapshot = buildRotationSnapshot(now);
    return loadRotationById(connection, snapshot.rotationId);
}

async function loadPreviousClaimRotation(connection, now = Date.now()) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_rotations
         WHERE ends_at <= ? AND claim_ends_at > ?
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
    if (rotationId === current.rotationId) return current;
    const previous = buildRotationSnapshotForStart(current.startsAt - 7 * 24 * 60 * 60 * 1000);
    if (rotationId === previous.rotationId) return previous;
    return null;
}

async function getStoredMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT rotation_id, request_hash, receipt_json
         FROM fate_chronicle_mutations
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
            throw makeError(500, 'fate_chronicle_corrupt_mutation_receipt', '命途长卷幂等回执损坏');
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
        `INSERT INTO fate_chronicle_mutations
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
        await ensureFateChronicleSchema(connection, meta.now);
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
    rotationId = '',
    accountRef = '',
    resultCode = 'ok',
    value = 0,
    detail = {}
}, now = Date.now()) {
    const safeDetail = {
        status: String(detail.status || '').slice(0, 32),
        chapterId: String(detail.chapterId || '').slice(0, 32),
        oathId: String(detail.oathId || '').slice(0, 32),
        scenarioId: String(detail.scenarioId || '').slice(0, 48),
        milestoneId: String(detail.milestoneId || '').slice(0, 48),
        source: String(detail.source || '').slice(0, 32),
        score: clampInt(detail.score, 0, 2_000_000)
    };
    const eventId = `fcops-${crypto.randomUUID()}`;
    await dbRun(
        connection,
        `INSERT INTO fate_chronicle_ops_events
            (event_id, event_type, rotation_id, account_ref, result_code, value, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            eventId,
            eventType,
            rotationId,
            accountRef,
            resultCode,
            clampInt(value, 0, 2_000_000),
            JSON.stringify(safeDetail),
            now
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO fate_chronicle_ops_counters
            (event_type, rotation_id, result_code, event_count, total_value, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, rotation_id, result_code) DO UPDATE SET
            event_count = fate_chronicle_ops_counters.event_count + 1,
            total_value = fate_chronicle_ops_counters.total_value + excluded.total_value,
            updated_at = excluded.updated_at`,
        [
            eventType,
            rotationId,
            resultCode,
            clampInt(value, 0, 2_000_000),
            now
        ]
    );
}

async function loadAttemptById(connection, userId, attemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_attempts
         WHERE attempt_id = ? AND user_id = ?`,
        [attemptId, userId]
    );
}

async function loadAttemptByClientAttempt(connection, userId, rotationId, clientAttemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_attempts
         WHERE user_id = ? AND rotation_id = ? AND client_attempt_id = ?`,
        [userId, rotationId, clientAttemptId]
    );
}

async function loadAttemptByMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_attempts
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function loadAttemptByRunId(connection, userId, runId) {
    return dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_attempts
         WHERE user_id = ? AND run_id = ?`,
        [userId, runId]
    );
}

async function loadResumableAttempt(connection, userId, now = Date.now()) {
    return dbGet(
        connection,
        `SELECT a.*
         FROM fate_chronicle_attempts a
         JOIN fate_chronicle_rotations r ON r.rotation_id = a.rotation_id
         WHERE a.user_id = ?
           AND a.status IN ('reserved', 'active', 'completed')
           AND r.grace_ends_at > ?
         ORDER BY CASE a.status
            WHEN 'reserved' THEN 0
            WHEN 'active' THEN 1
            ELSE 2
         END,
         a.updated_at DESC
         LIMIT 1`,
        [userId, now]
    );
}

async function loadAuthoritativeRunRow(connection, userId, runId) {
    return dbGet(
        connection,
        `SELECT run_id, user_id, client_run_id, activity_mode, scenario_id, status, content_version, content_hash,
                state_hash, chain_head, state_version, started_at, completed_at, settled_at, abandoned_at, expires_at, updated_at
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

async function loadExistingResult(connection, attemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_results
         WHERE attempt_id = ?`,
        [attemptId]
    );
}

async function loadResultById(connection, resultId) {
    return dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_results
         WHERE result_id = ?`,
        [resultId]
    );
}

async function loadRotationResults(connection, userId, rotationId) {
    return dbAll(
        connection,
        `SELECT *
         FROM fate_chronicle_results
         WHERE user_id = ? AND rotation_id = ?
         ORDER BY submitted_at DESC, result_id DESC`,
        [userId, rotationId]
    );
}

async function loadProgressRows(connection, userId, rotationId) {
    const rows = await dbAll(
        connection,
        `SELECT *
         FROM fate_chronicle_progress
         WHERE user_id = ? AND rotation_id = ?
         ORDER BY chapter_id ASC`,
        [userId, rotationId]
    );
    return rows.map(parseProgressRow);
}

async function loadClaimMap(connection, userId, rotationId) {
    const rows = await dbAll(
        connection,
        `SELECT milestone_id, claimed_at
         FROM fate_chronicle_reward_claims
         WHERE user_id = ? AND rotation_id = ?`,
        [userId, rotationId]
    );
    return new Map(rows.map(row => [String(row.milestone_id || ''), clampInt(row.claimed_at)]));
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
                `UPDATE fate_chronicle_attempts
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
                    `UPDATE fate_chronicle_attempts
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
    if (!run) throw makeError(409, 'fate_chronicle_run_missing', '命途长卷绑定的权威 run 不存在');
    const rotation = await loadRotationById(connection, attempt.rotation_id);
    const settlementClosed = !!rotation && now >= clampInt(rotation.graceEndsAt);
    const nextStatus = !existingResult && settlementClosed
        ? 'expired'
        : mapRunStatusToAttemptStatus(run.status, !!existingResult);
    const nextStartedAt = clampInt(run.started_at);
    const nextCompletedAt = clampInt(run.completed_at || run.settled_at);
    const nextSubmittedAt = existingResult ? clampInt(existingResult.submitted_at) : clampInt(attempt.submitted_at);
    const nextTerminalAt = nextStatus === 'submitted'
        ? nextSubmittedAt
        : ['defeated', 'abandoned', 'expired'].includes(nextStatus)
            ? Math.max(
                settlementClosed ? clampInt(rotation && rotation.graceEndsAt) : 0,
                clampInt(run.abandoned_at),
                clampInt(run.expires_at),
                nextCompletedAt,
                clampInt(attempt.terminal_at)
            )
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
        `UPDATE fate_chronicle_attempts
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

function getRotationChapter(rotation, chapterId) {
    const chapters = Array.isArray(rotation && rotation.chapters) ? rotation.chapters : CHAPTERS;
    return chapters.find(entry => String(entry.chapterId || '') === String(chapterId || '')) || null;
}

function getRotationOath(rotation, chapterId, oathId) {
    const chapter = getRotationChapter(rotation, chapterId);
    if (!chapter) return null;
    return (chapter.oaths || []).find(entry => String(entry.oathId || '') === String(oathId || '')) || null;
}

function buildProgressState(rotation, progressRows, resultRows, claimMap) {
    const rowsByChapter = new Map(progressRows.map(row => [String(row.chapterId || ''), row]));
    const resultsByChapter = new Map();
    const resultById = new Map();
    const oathFirstCompletion = new Map();
    for (const row of resultRows) {
        resultById.set(String(row.result_id || ''), row);
        const chapterId = String(row.chapter_id || '');
        const oathId = String(row.oath_id || '');
        if (!resultsByChapter.has(chapterId)) resultsByChapter.set(chapterId, []);
        resultsByChapter.get(chapterId).push(row);
        const oathKey = `${chapterId}:${oathId}`;
        const existing = oathFirstCompletion.get(oathKey);
        if (!existing || clampInt(row.submitted_at) < clampInt(existing.submitted_at)) {
            oathFirstCompletion.set(oathKey, row);
        }
    }
    let completedChapterCount = 0;
    let completedOathCount = 0;
    let dualChapterCount = 0;
    const chapters = (rotation.chapters || []).map(chapter => {
        const row = rowsByChapter.get(String(chapter.chapterId || ''));
        const completedOaths = new Set(Array.isArray(row && row.completedOaths) ? row.completedOaths.map(entry => String(entry || '')) : []);
        const previousChapter = chapter.chapterIndex > 1
            ? rowsByChapter.get(String((rotation.chapters || [])[chapter.chapterIndex - 2] && (rotation.chapters || [])[chapter.chapterIndex - 2].chapterId || ''))
            : null;
        const previousCompleted = chapter.chapterIndex === 1
            ? true
            : !!previousChapter && Array.isArray(previousChapter.completedOaths) && previousChapter.completedOaths.length > 0;
        const unlocked = chapter.chapterIndex === 1 || previousCompleted;
        const chapterCompleted = completedOaths.size > 0;
        const dualCompleted = completedOaths.size >= (chapter.oaths || []).length;
        if (chapterCompleted) completedChapterCount += 1;
        if (dualCompleted) dualChapterCount += 1;
        completedOathCount += completedOaths.size;
        const bestResult = row && row.bestResultId ? resultById.get(String(row.bestResultId || '')) || null : null;
        return {
            chapterId: String(chapter.chapterId || ''),
            chapterIndex: clampInt(chapter.chapterIndex, 1, CHAPTERS.length),
            title: String(chapter.title || ''),
            description: String(chapter.description || ''),
            unlocked,
            unlockedBy: chapter.chapterIndex === 1 ? null : String((rotation.chapters || [])[chapter.chapterIndex - 2] && (rotation.chapters || [])[chapter.chapterIndex - 2].chapterId || ''),
            completed: chapterCompleted,
            firstCompletedAt: clampInt(row && row.firstCompletedAt),
            dualCompleted,
            dualCompletedAt: clampInt(row && row.dualCompletedAt),
            bestResult: formatResult(bestResult),
            completedOathCount: completedOaths.size,
            oaths: (chapter.oaths || []).map(oath => {
                const oathKey = `${chapter.chapterId}:${oath.oathId}`;
                const firstRow = oathFirstCompletion.get(oathKey) || null;
                return {
                    oathId: String(oath.oathId || ''),
                    scenarioId: String(oath.scenarioId || ''),
                    title: String(oath.title || ''),
                    description: String(oath.description || ''),
                    encounterCount: clampInt(oath.encounterCount),
                    maxHp: clampInt(oath.maxHp),
                    turnBudget: clampInt(oath.turnBudget),
                    betweenEncounterHeal: clampInt(oath.betweenEncounterHeal),
                    scoreMultiplier: Number(oath.scoreMultiplier) || 1,
                    completed: completedOaths.has(String(oath.oathId || '')),
                    completedAt: clampInt(firstRow && firstRow.submitted_at)
                };
            })
        };
    });
    const milestones = (rotation.milestones || []).map(entry => {
        const milestoneId = String(entry.milestoneId || '');
        const milestoneType = String(entry.milestoneType || '');
        const chapterView = chapters.find(chapter => String(chapter.chapterId || '') === String(entry.chapterId || '')) || null;
        let unlockedAt = 0;
        let claimable = false;
        if (milestoneType === 'chapter_clear') {
            unlockedAt = clampInt(chapterView && chapterView.firstCompletedAt);
            claimable = unlockedAt > 0;
        } else if (milestoneType === 'chapter_dual') {
            unlockedAt = clampInt(chapterView && chapterView.dualCompletedAt);
            claimable = unlockedAt > 0;
        } else if (milestoneType === 'full_clear') {
            const allCleared = chapters.every(chapter => chapter.completed);
            unlockedAt = allCleared
                ? Math.max(...chapters.map(chapter => clampInt(chapter.firstCompletedAt)), 0)
                : 0;
            claimable = unlockedAt > 0;
        }
        const claimedAt = clampInt(claimMap.get(milestoneId));
        return {
            milestoneId,
            milestoneType,
            chapterId: String(entry.chapterId || ''),
            title: String(entry.title || ''),
            unlockedAt,
            claimed: claimedAt > 0,
            claimedAt,
            claimable: claimable && claimedAt === 0,
            reward: {
                currency: String(entry.reward && entry.reward.currency || REWARD_CURRENCY),
                amount: clampInt(entry.reward && entry.reward.amount),
                rewardImpact: String(entry.reward && entry.reward.rewardImpact || REWARD_IMPACT),
                powerImpact: String(entry.reward && entry.reward.powerImpact || POWER_IMPACT)
            }
        };
    });
    return {
        chapters,
        milestones,
        summary: {
            completedChapterCount,
            completedOathCount,
            dualChapterCount,
            chronicleCertificateEarned: completedOathCount > 0,
            claimableRewardCount: milestones.filter(entry => entry.claimable).length,
            claimedRewardCount: milestones.filter(entry => entry.claimed).length
        }
    };
}

async function buildRotationDashboard(connection, userId, rotation) {
    if (!rotation) return null;
    const resultRows = await loadRotationResults(connection, userId, rotation.rotationId);
    const progressRows = await loadProgressRows(connection, userId, rotation.rotationId);
    const claimMap = await loadClaimMap(connection, userId, rotation.rotationId);
    return buildProgressState(rotation, progressRows, resultRows, claimMap);
}

function validateProjectionInputs(rotation, attempt, run, receiptPayload, receiptRow) {
    if (!rotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
    if (!run) throw makeError(409, 'fate_chronicle_run_missing', '命途长卷绑定的权威 run 不存在');
    if (String(run.activity_mode || '') !== 'fate_chronicle') {
        throw makeError(409, 'fate_chronicle_run_mode_invalid', '权威回执模式与命途长卷不一致');
    }
    if (String(run.scenario_id || '') !== String(attempt.scenario_id || '')) {
        throw makeError(409, 'fate_chronicle_run_scenario_invalid', '权威 run 与誓约场景绑定不一致');
    }
    if (String(run.client_run_id || '') !== String(attempt.client_run_id || '')) {
        throw makeError(409, 'fate_chronicle_run_binding_invalid', '权威 run 与命途长卷尝试绑定不一致');
    }
    if (clampInt(run.started_at) < clampInt(rotation.startsAt) || clampInt(run.started_at) >= clampInt(rotation.endsAt)) {
        throw makeError(409, 'fate_chronicle_rotation_window_mismatch', '权威 run 不属于该周命途长卷窗口');
    }
    if (clampInt(receiptRow && receiptRow.created_at) > clampInt(rotation.graceEndsAt)) {
        throw makeError(409, 'fate_chronicle_receipt_after_grace', '命途长卷结算宽限已结束，不能再投影章节完成');
    }
    if (String(receiptPayload.receiptId || '') !== String(receiptRow && receiptRow.receipt_id || '')
        || String(receiptPayload.runId || '') !== String(attempt.run_id || '')
        || String(receiptPayload.mode || '') !== 'fate_chronicle'
        || String(receiptPayload.contentVersion || '') !== String(run.content_version || '')
        || String(receiptPayload.contentHash || '') !== String(run.content_hash || '')
        || String(receiptPayload.trustTier || '') !== 'server_authoritative'
        || String(receiptPayload.authorityLevel || '') !== 'server_replayed'
        || !receiptPayload.integrity
        || receiptPayload.integrity.fullReplayPassed !== true
        || String(receiptPayload.integrity.stateHash || '') !== String(run.state_hash || '')
        || String(receiptPayload.integrity.chainHead || '') !== String(run.chain_head || '')) {
        throw makeError(409, 'fate_chronicle_receipt_invalid', '权威回执完整性校验失败');
    }
    if (!receiptPayload.summary || String(receiptPayload.summary.result || '') !== 'completed') {
        throw makeError(409, 'fate_chronicle_receipt_incomplete', '权威 run 尚未形成可投影的完整通关回执');
    }
}

async function upsertProgressForResult(connection, resultRow, now = Date.now()) {
    const existingRow = await dbGet(
        connection,
        `SELECT *
         FROM fate_chronicle_progress
         WHERE user_id = ? AND rotation_id = ? AND chapter_id = ?`,
        [resultRow.user_id, resultRow.rotation_id, resultRow.chapter_id]
    );
    const existing = parseProgressRow(existingRow);
    const completedOaths = new Set(Array.isArray(existing && existing.completedOaths) ? existing.completedOaths.map(entry => String(entry || '')) : []);
    completedOaths.add(String(resultRow.oath_id || ''));
    const bestResult = existing && existing.bestResultId
        ? await loadResultById(connection, existing.bestResultId)
        : null;
    const better = !bestResult || compareResultLike(resultRow, bestResult) < 0;
    const firstCompletedAt = existing && existing.firstCompletedAt > 0
        ? clampInt(existing.firstCompletedAt)
        : clampInt(resultRow.submitted_at);
    const dualCompletedAt = completedOaths.size >= 2
        ? existing && existing.dualCompletedAt > 0
            ? clampInt(existing.dualCompletedAt)
            : clampInt(resultRow.submitted_at)
        : 0;
    if (!existing) {
        await dbRun(
            connection,
            `INSERT INTO fate_chronicle_progress
                (user_id, rotation_id, chapter_id, completed_oaths_json, best_result_id, best_score,
                 first_completed_at, dual_completed_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                resultRow.user_id,
                resultRow.rotation_id,
                resultRow.chapter_id,
                stableStringify(Array.from(completedOaths)),
                resultRow.result_id,
                clampInt(resultRow.official_score),
                firstCompletedAt,
                dualCompletedAt,
                now
            ]
        );
        return;
    }
    await dbRun(
        connection,
        `UPDATE fate_chronicle_progress
         SET completed_oaths_json = ?,
             best_result_id = CASE WHEN ? THEN ? ELSE best_result_id END,
             best_score = CASE WHEN ? THEN ? ELSE best_score END,
             first_completed_at = ?,
             dual_completed_at = ?,
             updated_at = ?
         WHERE user_id = ? AND rotation_id = ? AND chapter_id = ?`,
        [
            stableStringify(Array.from(completedOaths)),
            better ? 1 : 0,
            resultRow.result_id,
            better ? 1 : 0,
            clampInt(resultRow.official_score),
            firstCompletedAt,
            dualCompletedAt,
            now,
            resultRow.user_id,
            resultRow.rotation_id,
            resultRow.chapter_id
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
                `UPDATE fate_chronicle_attempts
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
    validateProjectionInputs(rotation, syncedAttempt, run, receiptPayload, receiptRow);
    const summary = receiptPayload.summary || {};
    const submittedAt = clampInt(receiptPayload.settledAt || receiptRow.created_at || now);
    const resultId = deterministicId('fcresult', [syncedAttempt.attempt_id, receiptPayload.receiptId || receiptRow.receipt_id]);
    const resultRow = {
        result_id: resultId,
        attempt_id: syncedAttempt.attempt_id,
        run_id: syncedAttempt.run_id,
        receipt_id: String(receiptPayload.receiptId || receiptRow.receipt_id || ''),
        user_id: syncedAttempt.user_id,
        rotation_id: syncedAttempt.rotation_id,
        chapter_id: syncedAttempt.chapter_id,
        oath_id: syncedAttempt.oath_id,
        scenario_id: syncedAttempt.scenario_id,
        official_score: clampInt(summary.score),
        grade: String(summary.grade || ''),
        turns: clampInt(summary.turns),
        remaining_hp: clampInt(summary.remainingHp),
        damage_taken: clampInt(summary.damageTaken),
        encounters_won: clampInt(summary.encountersWon),
        boss_wins: clampInt(summary.bossWins),
        state_hash: String(receiptPayload.integrity && receiptPayload.integrity.stateHash || ''),
        chain_head: String(receiptPayload.integrity && receiptPayload.integrity.chainHead || ''),
        mutation_hash: sha256(`${source}:${syncedAttempt.attempt_id}:${String(receiptPayload.receiptId || '')}`),
        summary_json: JSON.stringify({
            ...summary,
            chapterId: syncedAttempt.chapter_id,
            oathId: syncedAttempt.oath_id,
            scenarioId: syncedAttempt.scenario_id
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
    try {
        await dbRun(
            connection,
            `INSERT INTO fate_chronicle_results
                (result_id, attempt_id, run_id, receipt_id, user_id, rotation_id, chapter_id, oath_id, scenario_id,
                 official_score, grade, turns, remaining_hp, damage_taken, encounters_won, boss_wins,
                 state_hash, chain_head, mutation_hash, summary_json, receipt_json, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                resultRow.result_id,
                resultRow.attempt_id,
                resultRow.run_id,
                resultRow.receipt_id,
                resultRow.user_id,
                resultRow.rotation_id,
                resultRow.chapter_id,
                resultRow.oath_id,
                resultRow.scenario_id,
                resultRow.official_score,
                resultRow.grade,
                resultRow.turns,
                resultRow.remaining_hp,
                resultRow.damage_taken,
                resultRow.encounters_won,
                resultRow.boss_wins,
                resultRow.state_hash,
                resultRow.chain_head,
                resultRow.mutation_hash,
                resultRow.summary_json,
                resultRow.receipt_json,
                resultRow.submitted_at
            ]
        );
    } catch (error) {
        if (String(error && error.code || '') !== 'SQLITE_CONSTRAINT') throw error;
        const raced = await loadExistingResult(connection, syncedAttempt.attempt_id);
        if (!raced) throw error;
        return { attempt: await loadAttemptById(connection, syncedAttempt.user_id, syncedAttempt.attempt_id), result: raced, projected: false };
    }
    await upsertProgressForResult(connection, resultRow, now);
    await dbRun(
        connection,
        `UPDATE fate_chronicle_attempts
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
        value: clampInt(resultRow.official_score),
        detail: {
            status: 'submitted',
            chapterId: syncedAttempt.chapter_id,
            oathId: syncedAttempt.oath_id,
            scenarioId: syncedAttempt.scenario_id,
            source,
            score: clampInt(resultRow.official_score)
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
         FROM fate_chronicle_attempts a
         WHERE a.user_id = ?
           AND a.status IN ('reserved', 'active', 'completed')`,
        [userId]
    );
    for (const row of rows) {
        const synced = await syncAttemptState(connection, row, now);
        if (!synced || !synced.run_id) continue;
        try {
            await projectAttemptResult(connection, synced, now, 'current');
        } catch (error) {
            if (error && (error.reason === 'fate_chronicle_receipt_after_grace' || error.reason === 'fate_chronicle_receipt_incomplete')) {
                continue;
            }
            throw error;
        }
    }
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

function buildCurrentResponse({
    now,
    currentRotation,
    currentDashboard,
    previousRotation = null,
    previousDashboard = null,
    activeAttempt = null,
    activeRun = null
}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-current`,
        protocolVersion: PROTOCOL_VERSION,
        generatedAt: now,
        rotation: {
            meta: formatRotation(currentRotation, now),
            progress: currentDashboard
        },
        previousClaimRotation: previousRotation && previousDashboard
            ? {
                meta: formatRotation(previousRotation, now),
                progress: previousDashboard
            }
            : null,
        activeAttempt: formatAttempt(activeAttempt),
        activeRun: activeRun || null
    };
}

function buildStartResponse(rotation, dashboard, attempt, run, now, { idempotent = false, resumedExisting = false } = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-start`,
        protocolVersion: PROTOCOL_VERSION,
        idempotent,
        resumedExisting,
        rotation: {
            meta: formatRotation(rotation, now),
            progress: dashboard
        },
        attempt: formatAttempt(attempt),
        run
    };
}

function buildSubmitResponse(rotation, dashboard, attempt, result, run, now, { idempotent = false } = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-submit`,
        protocolVersion: PROTOCOL_VERSION,
        idempotent,
        rotation: {
            meta: formatRotation(rotation, now),
            progress: dashboard
        },
        attempt: formatAttempt(attempt),
        result: formatResult(result),
        run: run || null
    };
}

function buildClaimResponse(rotation, dashboard, claim, balance, now, { alreadyClaimed = false, idempotent = false } = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-claim`,
        protocolVersion: PROTOCOL_VERSION,
        alreadyClaimed,
        idempotent,
        rotation: {
            meta: formatRotation(rotation, now),
            progress: dashboard
        },
        claim: {
            claimId: String(claim.claim_id || ''),
            milestoneId: String(claim.milestone_id || ''),
            milestoneType: String(claim.milestone_type || ''),
            chapterId: String(claim.chapter_id || ''),
            currency: String(claim.currency || REWARD_CURRENCY),
            amount: clampInt(claim.amount),
            rewardImpact: String(claim.reward_impact || REWARD_IMPACT),
            powerImpact: String(claim.power_impact || POWER_IMPACT),
            claimedAt: clampInt(claim.claimed_at)
        },
        balance: formatBalance(balance)
    };
}

function requireRotationChapterAndOath(rotation, chapterId, oathId) {
    const chapter = getRotationChapter(rotation, chapterId);
    if (!chapter) throw makeError(404, 'fate_chronicle_chapter_not_found', '命途长卷章节不存在');
    const oath = getRotationOath(rotation, chapterId, oathId);
    if (!oath) throw makeError(404, 'fate_chronicle_oath_not_found', '命途长卷誓约不存在');
    return { chapter, oath };
}

function assertChapterUnlocked(dashboard, chapterId) {
    const chapter = dashboard && dashboard.chapters && dashboard.chapters.find(entry => String(entry.chapterId || '') === String(chapterId || ''));
    if (!chapter || !chapter.unlocked) {
        throw makeError(409, 'fate_chronicle_chapter_locked', '该章节尚未解锁');
    }
}

async function launchReservedAttempt(userId, attemptId, nowProvider) {
    const phase = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureFateChronicleSchema(connection, transactionNow);
        const attempt = await loadAttemptById(connection, userId, attemptId);
        if (!attempt) throw makeError(404, 'fate_chronicle_attempt_not_found', '命途长卷尝试不存在');
        const rotation = await loadRotationById(connection, attempt.rotation_id);
        if (!rotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
        if (rotationState(rotation, transactionNow) !== 'active') {
            throw makeError(409, 'fate_chronicle_start_window_closed', '本周命途长卷已停止发车');
        }
        const seedHex = deriveSeedHex(
            attempt.rotation_id,
            attempt.chapter_id,
            attempt.oath_id,
            attempt.scenario_id,
            rotation.catalogHash
        );
        return { attempt, rotation, seedHex };
    });
    const authoritative = await issueAuthoritativeRun(
        userId,
        {
            clientRunId: String(phase.attempt.client_run_id || ''),
            mode: 'fate_chronicle',
            contentVersion: CONTENT_VERSION
        },
        nowProvider(),
        {
            binding: {
                type: 'fate_chronicle',
                rotationId: phase.attempt.rotation_id,
                attemptId: phase.attempt.attempt_id,
                chapterId: phase.attempt.chapter_id,
                oathId: phase.attempt.oath_id
            },
            seedHex: phase.seedHex,
            scenarioId: String(phase.attempt.scenario_id || ''),
            runTtlMs: RUN_TTL_MS,
            nowProvider,
            startDeadline: clampInt(phase.rotation.endsAt),
            startDeadlineReason: 'fate_chronicle_start_window_closed',
            startDeadlineMessage: '本周命途长卷已停止发车'
        }
    );
    const finalized = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureFateChronicleSchema(connection, transactionNow);
        const attempt = await loadAttemptById(connection, userId, attemptId);
        if (!attempt) throw makeError(404, 'fate_chronicle_attempt_not_found', '命途长卷尝试不存在');
        const run = authoritative && authoritative.run || null;
        if (!run || !safeId(run.runId)) {
            throw makeError(500, 'fate_chronicle_run_launch_failed', '命途长卷权威发车失败');
        }
        if (String(run.clientRunId || '') !== String(attempt.client_run_id || '')) {
            throw makeError(409, 'fate_chronicle_run_binding_invalid', '权威 run 与命途长卷尝试绑定不一致');
        }
        if (String(attempt.run_id || '') && String(attempt.run_id || '') !== String(run.runId || '')) {
            throw makeError(409, 'fate_chronicle_run_binding_conflict', '命途长卷尝试已绑定其他权威 run');
        }
        await dbRun(
            connection,
            `UPDATE fate_chronicle_attempts
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
                transactionNow,
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
                chapterId: String(refreshed.chapter_id || ''),
                oathId: String(refreshed.oath_id || ''),
                scenarioId: String(refreshed.scenario_id || '')
            }
        }, transactionNow);
        return refreshed;
    });
    return { attempt: finalized, run: authoritative.run };
}

async function getCurrentFateChronicle(userId, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const current = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureFateChronicleSchema(connection, transactionNow);
        await reconcileUserState(connection, identity, transactionNow);
        const rotation = await loadCurrentRotation(connection, transactionNow);
        if (!rotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
        const currentDashboard = await buildRotationDashboard(connection, identity, rotation);
        const previousRotation = await loadPreviousClaimRotation(connection, transactionNow);
        const previousDashboard = previousRotation && previousRotation.rotationId !== rotation.rotationId
            ? await buildRotationDashboard(connection, identity, previousRotation)
            : null;
        const activeAttempt = await loadResumableAttempt(connection, identity, transactionNow);
        return {
            now: transactionNow,
            rotation,
            currentDashboard,
            previousRotation: previousRotation && previousRotation.rotationId !== rotation.rotationId ? previousRotation : null,
            previousDashboard,
            activeAttempt
        };
    });
    const activeRun = current.activeAttempt && current.activeAttempt.run_id
        ? await hydrateRun(identity, current.activeAttempt.run_id, current.now)
        : null;
    return buildCurrentResponse({
        now: current.now,
        currentRotation: current.rotation,
        currentDashboard: current.currentDashboard,
        previousRotation: current.previousRotation,
        previousDashboard: current.previousDashboard,
        activeAttempt: current.activeAttempt,
        activeRun
    });
}

async function startFateChronicleAttempt(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeStartRequest(rawRequest);
    const requestHash = hashCanonical(request);
    const phase = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureFateChronicleSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'mutation_replay', receipt: replay };
        await reconcileUserState(connection, identity, transactionNow);
        const rotation = await loadCurrentRotation(connection, transactionNow);
        if (!rotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
        if (rotationState(rotation, transactionNow) !== 'active') {
            throw makeError(409, 'fate_chronicle_start_window_closed', '本周命途长卷已停止发车');
        }
        if (request.rotationId !== rotation.rotationId) {
            throw makeError(409, 'rotation_not_current', '命途长卷周轮换已更新，请刷新后重试');
        }
        requireRotationChapterAndOath(rotation, request.chapterId, request.oathId);
        const dashboard = await buildRotationDashboard(connection, identity, rotation);
        assertChapterUnlocked(dashboard, request.chapterId);
        const existingByMutation = await loadAttemptByMutation(connection, identity, request.mutationId);
        if (existingByMutation) {
            if (String(existingByMutation.request_hash || '') !== requestHash) throw makeMutationConflictError();
            const existingRotation = await loadRotationById(connection, String(existingByMutation.rotation_id || ''));
            if (!existingRotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
            return String(existingByMutation.status || '') === 'reserved' && !String(existingByMutation.run_id || '')
                ? { type: 'launch_reserved', rotation: existingRotation, attemptId: String(existingByMutation.attempt_id || '') }
                : { type: 'resume_existing', rotation: existingRotation, attempt: existingByMutation };
        }
        const existingByClient = await loadAttemptByClientAttempt(connection, identity, request.rotationId, request.clientAttemptId);
        if (existingByClient) {
            if (String(existingByClient.request_hash || '') !== requestHash) {
                throw makeError(409, 'client_attempt_conflict', 'clientAttemptId 已绑定其他命途长卷请求');
            }
            const existingRotation = await loadRotationById(connection, String(existingByClient.rotation_id || ''));
            if (!existingRotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
            return String(existingByClient.status || '') === 'reserved' && !String(existingByClient.run_id || '')
                ? { type: 'launch_reserved', rotation: existingRotation, attemptId: String(existingByClient.attempt_id || '') }
                : { type: 'resume_existing', rotation: existingRotation, attempt: existingByClient };
        }
        const resumable = await loadResumableAttempt(connection, identity, transactionNow);
        if (resumable) {
            const resumableRotation = await loadRotationById(connection, String(resumable.rotation_id || ''));
            if (!resumableRotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
            return String(resumable.status || '') === 'reserved' && !String(resumable.run_id || '')
                ? { type: 'launch_reserved', rotation: resumableRotation, attemptId: String(resumable.attempt_id || '') }
                : { type: 'resume_existing', rotation: resumableRotation, attempt: resumable };
        }
        const oath = getRotationOath(rotation, request.chapterId, request.oathId);
        const attemptId = deterministicId('fcattempt', [identity, rotation.rotationId, request.chapterId, request.oathId, request.clientAttemptId]);
        const seedHex = deriveSeedHex(rotation.rotationId, request.chapterId, request.oathId, oath.scenarioId, rotation.catalogHash);
        const attempt = {
            attemptId,
            rotationId: rotation.rotationId,
            chapterId: request.chapterId,
            oathId: request.oathId,
            scenarioId: String(oath.scenarioId || ''),
            clientAttemptId: request.clientAttemptId,
            mutationId: request.mutationId,
            requestHash,
            requestBodyJson: stableStringify(request),
            seedFingerprint: makeSeedFingerprint(seedHex),
            clientRunId: deterministicId('fcrun', [attemptId, rotation.rotationId]),
            reservedAt: transactionNow
        };
        await dbRun(
            connection,
            `INSERT INTO fate_chronicle_attempts
                (attempt_id, user_id, rotation_id, chapter_id, oath_id, scenario_id, client_attempt_id,
                 mutation_id, request_hash, request_body_json, seed_fingerprint, client_run_id,
                 status, reserved_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)`,
            [
                attempt.attemptId,
                identity,
                attempt.rotationId,
                attempt.chapterId,
                attempt.oathId,
                attempt.scenarioId,
                attempt.clientAttemptId,
                attempt.mutationId,
                attempt.requestHash,
                attempt.requestBodyJson,
                attempt.seedFingerprint,
                attempt.clientRunId,
                attempt.reservedAt,
                transactionNow
            ]
        );
        await recordOpsEvent(connection, 'attempt_reserved', {
            rotationId: rotation.rotationId,
            accountRef: makeAccountRef(identity),
            detail: {
                status: 'reserved',
                chapterId: attempt.chapterId,
                oathId: attempt.oathId,
                scenarioId: attempt.scenarioId
            }
        }, transactionNow);
        return { type: 'launch_reserved', rotation, attemptId };
    });
    if (phase.type === 'mutation_replay') return phase.receipt;
    if (phase.type === 'launch_reserved') {
        const launched = await launchReservedAttempt(identity, phase.attemptId, nowProvider);
        const responseNow = nowProvider();
        const dashboard = await withReadConnection(async connection => {
            const rotation = await loadRotationById(connection, phase.rotation.rotationId);
            return buildRotationDashboard(connection, identity, rotation || phase.rotation);
        });
        const response = buildStartResponse(phase.rotation, dashboard, launched.attempt, launched.run, responseNow);
        return persistMutationReceiptIfNeeded(identity, request.mutationId, requestHash, request, response, {
            rotationId: phase.rotation.rotationId,
            requestType: 'start',
            attemptId: launched.attempt.attempt_id,
            now: responseNow
        });
    }
    const responseNow = nowProvider();
    const dashboard = await withReadConnection(async connection => buildRotationDashboard(connection, identity, phase.rotation));
    const syncedRun = await hydrateRun(identity, phase.attempt.run_id, responseNow);
    const response = buildStartResponse(phase.rotation, dashboard, phase.attempt, syncedRun, responseNow, {
        idempotent: true,
        resumedExisting: true
    });
    return persistMutationReceiptIfNeeded(identity, request.mutationId, requestHash, request, response, {
        rotationId: phase.rotation.rotationId,
        requestType: 'start',
        attemptId: phase.attempt.attempt_id,
        now: responseNow
    });
}

async function submitFateChronicleResult(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeSubmitRequest(rawRequest);
    const requestHash = hashCanonical(request);

    const preflight = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureFateChronicleSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'mutation_replay', receipt: replay };
        const attempt = await loadAttemptByRunId(connection, identity, request.runId);
        if (!attempt) throw makeError(404, 'fate_chronicle_attempt_not_found', '命途长卷尝试不存在');
        const existingResult = await loadExistingResult(connection, attempt.attempt_id);
        if (existingResult) {
            const rotation = await loadRotationById(connection, attempt.rotation_id);
            return { type: 'already_projected', attempt, rotation };
        }
        const run = await loadAuthoritativeRunRow(connection, identity, request.runId);
        if (!run) throw makeError(404, 'authoritative_run_not_found', '权威 run 不存在');
        const authoritativeReceipt = await loadAuthoritativeReceipt(connection, identity, request.runId);
        if (authoritativeReceipt) {
            return { type: 'ready_for_projection', attempt, run };
        }
        return { type: 'needs_settlement', attempt, run };
    });
    if (preflight.type === 'mutation_replay') return preflight.receipt;

    if (preflight.type === 'needs_settlement') {
        await settleAuthoritativeRun(
            identity,
            request.runId,
            {
                runId: request.runId,
                mutationId: request.mutationId,
                expectedVersion: clampInt(preflight.run.state_version)
            },
            nowProvider()
        );
    }

    const hydratedRun = await hydrateRun(identity, request.runId, nowProvider());

    return withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureFateChronicleSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const attempt = await loadAttemptByRunId(connection, identity, request.runId);
        if (!attempt) throw makeError(404, 'fate_chronicle_attempt_not_found', '命途长卷尝试不存在');
        const rotation = await loadRotationById(connection, attempt.rotation_id);
        if (!rotation) throw makeError(503, 'fate_chronicle_rotation_missing', '命途长卷轮换不存在');
        const projection = await projectAttemptResult(connection, attempt, transactionNow, 'submit');
        if (!projection.result) {
            if (transactionNow >= clampInt(rotation.graceEndsAt)) {
                throw makeError(409, 'fate_chronicle_settlement_window_closed', '命途长卷结算宽限已结束，不能再生成通关投影');
            }
            throw makeError(409, 'authoritative_receipt_unavailable', '权威结算回执尚未生成，请先完成权威结算');
        }
        const dashboard = await buildRotationDashboard(connection, identity, rotation);
        const response = buildSubmitResponse(rotation, dashboard, projection.attempt, projection.result, hydratedRun, transactionNow, {
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
            now: transactionNow
        });
        return response;
    });
}

async function claimFateChronicleReward(userId, milestoneId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeClaimRequest(milestoneId, rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureFateChronicleSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const rotation = await loadRelevantRotation(connection, request.rotationId, transactionNow);
        if (!rotation) throw makeError(404, 'fate_chronicle_rotation_not_found', '命途长卷轮换不存在');
        if (transactionNow >= clampInt(rotation.claimEndsAt)) {
            throw makeError(409, 'fate_chronicle_claim_window_closed', '该轮命途长卷领奖窗口已关闭');
        }
        await reconcileUserState(connection, identity, transactionNow);
        const dashboard = await buildRotationDashboard(connection, identity, rotation);
        const milestone = (dashboard.milestones || []).find(entry => String(entry.milestoneId || '') === request.milestoneId);
        if (!milestone) throw makeError(404, 'fate_chronicle_milestone_not_found', '命途长卷里程碑不存在');
        if (!milestone.claimable && !milestone.claimed) {
            throw makeError(409, 'fate_chronicle_milestone_unmet', '当前里程碑尚未达成领奖条件');
        }
        const existingClaim = await dbGet(
            connection,
            `SELECT *
             FROM fate_chronicle_reward_claims
             WHERE user_id = ? AND rotation_id = ? AND milestone_id = ?`,
            [identity, rotation.rotationId, request.milestoneId]
        );
        if (!existingClaim) {
            const claimId = deterministicId('fcclaim', [identity, rotation.rotationId, request.milestoneId]);
            const ledgerEntryId = deterministicId('fcledger', [identity, rotation.rotationId, request.milestoneId, REWARD_CURRENCY]);
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
                [identity, REWARD_CURRENCY, amount, amount, transactionNow]
            );
            const balanceAfter = await dbGet(
                connection,
                `SELECT *
                 FROM progression_economy_balances
                 WHERE user_id = ? AND currency = ?`,
                [identity, REWARD_CURRENCY]
            );
            await dbRun(
                connection,
                `INSERT INTO progression_economy_ledger
                    (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                     reward_impact, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ledgerEntryId,
                    identity,
                    REWARD_CURRENCY,
                    amount,
                    clampInt(balanceAfter && balanceAfter.balance),
                    String(milestone.title || '命途长卷里程碑'),
                    'fate_chronicle_reward',
                    `fate_chronicle:${rotation.rotationId}:${request.milestoneId}`,
                    REWARD_IMPACT,
                    JSON.stringify({
                        rotationId: rotation.rotationId,
                        milestoneId: request.milestoneId,
                        milestoneType: milestone.milestoneType,
                        chapterId: milestone.chapterId
                    }),
                    transactionNow
                ]
            );
            await dbRun(
                connection,
                `INSERT INTO fate_chronicle_reward_claims
                    (claim_id, user_id, rotation_id, milestone_id, milestone_type, chapter_id, currency, amount,
                     reward_impact, power_impact, ledger_entry_id, claim_payload_json, claimed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    claimId,
                    identity,
                    rotation.rotationId,
                    request.milestoneId,
                    milestone.milestoneType,
                    milestone.chapterId || '',
                    REWARD_CURRENCY,
                    amount,
                    REWARD_IMPACT,
                    POWER_IMPACT,
                    ledgerEntryId,
                    JSON.stringify({
                        unlockedAt: clampInt(milestone.unlockedAt),
                        title: String(milestone.title || ''),
                        milestoneType: milestone.milestoneType
                    }),
                    transactionNow
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
                    chapterId: milestone.chapterId || '',
                    source: milestone.milestoneType
                }
            }, transactionNow);
        }
        const claim = await dbGet(
            connection,
            `SELECT *
             FROM fate_chronicle_reward_claims
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
        const refreshedDashboard = await buildRotationDashboard(connection, identity, rotation);
        const response = buildClaimResponse(rotation, refreshedDashboard, claim, balance, transactionNow, {
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
            now: transactionNow
        });
        return response;
    });
}

async function getFateChronicleOpsOverview(nowInput = Date.now()) {
    const nowProvider = createNowProvider(nowInput);
    const transactionNow = nowProvider();
    await withWriteTransaction(connection => ensureFateChronicleSchema(connection, transactionNow));
    return withReadConnection(async connection => {
        const currentRotation = await loadCurrentRotation(connection, transactionNow);
        const counters = await dbAll(
            connection,
            `SELECT *
             FROM fate_chronicle_ops_counters
             ORDER BY updated_at DESC, event_type ASC`
        );
        const recentEvents = await dbAll(
            connection,
            `SELECT *
             FROM fate_chronicle_ops_events
             ORDER BY created_at DESC
             LIMIT 20`
        );
        const totals = await dbGet(
            connection,
            `SELECT
                (SELECT COUNT(*) FROM fate_chronicle_attempts) AS attempts,
                (SELECT COUNT(*) FROM fate_chronicle_results) AS results,
                (SELECT COUNT(*) FROM fate_chronicle_reward_claims) AS claims,
                (SELECT COUNT(*) FROM fate_chronicle_attempts WHERE status IN ('reserved', 'active', 'completed')) AS active`
        );
        const currentCounts = currentRotation
            ? await dbGet(
                connection,
                `SELECT
                    (SELECT COUNT(*) FROM fate_chronicle_attempts WHERE rotation_id = ?) AS attempts,
                    (SELECT COUNT(*) FROM fate_chronicle_results WHERE rotation_id = ?) AS results,
                    (SELECT COUNT(*) FROM fate_chronicle_reward_claims WHERE rotation_id = ?) AS claims`,
                [currentRotation.rotationId, currentRotation.rotationId, currentRotation.rotationId]
            )
            : null;
        return {
            success: true,
            reportVersion: OPS_REPORT_VERSION,
            protocolVersion: PROTOCOL_VERSION,
            generatedAt: transactionNow,
            currentRotation: currentRotation
                ? {
                    ...formatRotation(currentRotation, transactionNow),
                    counts: {
                        attempts: clampInt(currentCounts && currentCounts.attempts),
                        results: clampInt(currentCounts && currentCounts.results),
                        claims: clampInt(currentCounts && currentCounts.claims)
                    }
                }
                : null,
            totals: {
                attempts: clampInt(totals && totals.attempts),
                results: clampInt(totals && totals.results),
                claims: clampInt(totals && totals.claims),
                active: clampInt(totals && totals.active)
            },
            counters: counters.map(row => ({
                eventType: String(row.event_type || ''),
                rotationId: String(row.rotation_id || ''),
                resultCode: String(row.result_code || ''),
                eventCount: clampInt(row.event_count),
                totalValue: clampInt(row.total_value),
                updatedAt: clampInt(row.updated_at)
            })),
            recentEvents: recentEvents.map(row => ({
                eventId: String(row.event_id || ''),
                eventType: String(row.event_type || ''),
                rotationId: String(row.rotation_id || ''),
                accountRef: String(row.account_ref || ''),
                resultCode: String(row.result_code || ''),
                value: clampInt(row.value),
                detail: parseJson(row.detail_json, {}),
                createdAt: clampInt(row.created_at)
            }))
        };
    }, { transaction: true });
}

module.exports = {
    claimFateChronicleReward,
    getCurrentFateChronicle,
    getFateChronicleOpsOverview,
    startFateChronicleAttempt,
    submitFateChronicleResult
};
