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
const { ensureWorldRiftSchema } = require('./bootstrap');
const {
    ATTEMPT_LIMIT,
    CATALOG_VERSION,
    CLAIM_WINDOW_MS,
    CONTRIBUTION_FORMULA,
    LEADERBOARD_LIMIT,
    PHASES,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    SEED_SLOT_COUNT,
    SETTLEMENT_GRACE_MS,
    TOTAL_HP,
    WEEK_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart
} = require('./catalog');
const {
    getRiftSquadDashboard,
    linkContributionToActiveSquad
} = require('../account-social/squad-service');

const REPORT_VERSION = 'account-world-rift-v2';
const OPS_REPORT_VERSION = 'world-rift-ops-v2';
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_MILESTONE_ID = /^[A-Za-z0-9._:-]{2,48}$/;
const SAFE_DIRECTIVE_ID = /^[A-Za-z0-9._:-]{2,64}$/;
const INTERNAL_SEED = /^[a-f0-9]{64}$/;
const ACTIVE_ATTEMPT_STATUSES = ['reserved', 'active', 'completed'];
const DIRECTIVE_SCOPES = new Set(['personal', 'squad', 'global']);
const ROUTE_CONTRACT_IDS = new Set(['steady', 'contested', 'perilous']);

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
            console.error('[WorldRift] Write rollback failed:', rollbackError);
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
    if (typeof value === 'function') {
        return () => clampInt(value());
    }
    if (Number.isFinite(Number(value))) {
        const fixedNow = clampInt(value);
        return () => fixedNow;
    }
    return () => Date.now();
}

function safeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
}

function safeMilestoneId(value) {
    const text = String(value || '').trim();
    return SAFE_MILESTONE_ID.test(text) ? text : '';
}

function safeDirectiveId(value) {
    const text = String(value || '').trim();
    return SAFE_DIRECTIVE_ID.test(text) ? text : '';
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
    const primary = String(process.env.DEFIER_WORLD_RIFT_SEED_SECRET || '').trim();
    if (primary) return primary;
    const fallback = String(process.env.DEFIER_HMAC_SECRET || '').trim();
    if (fallback) return fallback;
    if (String(process.env.NODE_ENV || '').trim() === 'production') {
        throw makeError(503, 'world_rift_seed_secret_missing', '天穹裂隙种子密钥未配置');
    }
    return 'defier-dev-world-rift-seed-secret';
}

function deriveSeedHex(rotationId, seedSlot, catalogHash) {
    const seedHex = crypto.createHmac('sha256', getSeedSecret())
        .update([PROTOCOL_VERSION, String(rotationId || ''), String(seedSlot || ''), String(catalogHash || '')].join('|'))
        .digest('hex');
    if (!INTERNAL_SEED.test(seedHex)) {
        throw makeError(500, 'world_rift_seed_invalid', '天穹裂隙服务端种子无效');
    }
    return seedHex;
}

function makeSeedFingerprint(seedHex) {
    return sha256(`world-rift:${String(seedHex || '')}`).slice(0, 24);
}

function normalizeStartRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'rotationId', 'clientAttemptId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const rotationId = safeId(source.rotationId);
    const clientAttemptId = safeId(source.clientAttemptId);
    const mutationId = safeId(source.mutationId);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '天穹裂隙协议版本不受支持');
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
        throw makeError(409, 'unsupported_protocol_version', '天穹裂隙协议版本不受支持');
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
        throw makeError(409, 'unsupported_protocol_version', '天穹裂隙协议版本不受支持');
    }
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!milestoneId || milestoneId !== requestedMilestoneId) {
        throw makeError(400, 'milestone_id_mismatch', '里程碑与请求路径不一致');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, rotationId, milestoneId, mutationId };
}

function normalizeDirectiveClaimRequest(directiveIdFromPath, rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['protocolVersion', 'rotationId', 'directiveId', 'mutationId']);
    const protocolVersion = String(source.protocolVersion || '').trim();
    const rotationId = safeId(source.rotationId);
    const directiveId = safeDirectiveId(source.directiveId);
    const mutationId = safeId(source.mutationId);
    const requestedDirectiveId = safeDirectiveId(directiveIdFromPath);
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '天穹裂隙协议版本不受支持');
    }
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!directiveId || directiveId !== requestedDirectiveId) {
        throw makeError(400, 'directive_id_mismatch', '战役指令与请求路径不一致');
    }
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 非法');
    return { protocolVersion, rotationId, directiveId, mutationId };
}

function normalizeDirectiveReplayRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['rotationId', 'contributionId']);
    const rotationId = safeId(source.rotationId);
    const contributionId = safeId(source.contributionId);
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    if (!contributionId) throw makeError(400, 'invalid_contribution_id', 'contributionId 非法');
    return { rotationId, contributionId };
}

function normalizeDirectiveReconcileRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['rotationId']);
    const rotationId = safeId(source.rotationId);
    if (!rotationId) throw makeError(400, 'invalid_rotation_id', 'rotationId 非法');
    return { rotationId };
}

function compareContributionLike(left, right) {
    const contributionDelta = clampInt(right.contribution) - clampInt(left.contribution);
    if (contributionDelta !== 0) return contributionDelta;
    const hpDelta = clampInt(right.remaining_hp ?? right.remainingHp) - clampInt(left.remaining_hp ?? left.remainingHp);
    if (hpDelta !== 0) return hpDelta;
    const turnDelta = clampInt(left.turns) - clampInt(right.turns);
    if (turnDelta !== 0) return turnDelta;
    return String(left.contribution_id || left.contributionId || '').localeCompare(
        String(right.contribution_id || right.contributionId || '')
    );
}

function compareEntryLike(left, right) {
    const rankedDelta = clampInt(right.ranked_contribution ?? right.rankedContribution) - clampInt(left.ranked_contribution ?? left.rankedContribution);
    if (rankedDelta !== 0) return rankedDelta;
    const bestDelta = clampInt(right.best_contribution ?? right.bestContribution) - clampInt(left.best_contribution ?? left.bestContribution);
    if (bestDelta !== 0) return bestDelta;
    const hpDelta = clampInt(right.ranked_remaining_hp ?? right.rankedRemainingHp) - clampInt(left.ranked_remaining_hp ?? left.rankedRemainingHp);
    if (hpDelta !== 0) return hpDelta;
    const turnDelta = clampInt(left.ranked_turns ?? left.rankedTurns) - clampInt(right.ranked_turns ?? right.rankedTurns);
    if (turnDelta !== 0) return turnDelta;
    return String(left.entry_id || left.entryId || '').localeCompare(String(right.entry_id || right.entryId || ''));
}

function rotationLifecycleState(rotation, now = Date.now()) {
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
        catalogVersion: String(rotation.catalogVersion || ''),
        rotationRuleVersion: String(rotation.rotationRuleVersion || ''),
        title: String(rotation.title || ''),
        description: String(rotation.description || ''),
        startsAt: clampInt(rotation.startsAt),
        endsAt: clampInt(rotation.endsAt),
        graceEndsAt: clampInt(rotation.graceEndsAt),
        claimEndsAt: clampInt(rotation.claimEndsAt),
        state: rotationLifecycleState(rotation, now),
        attemptLimit: clampInt(rotation.attemptLimit, 1, ATTEMPT_LIMIT),
        seedSlotCount: clampInt(rotation.seedSlotCount, 1, SEED_SLOT_COUNT),
        leaderboardLimit: clampInt(rotation.leaderboardLimit, 1, LEADERBOARD_LIMIT),
        totalHp: clampInt(rotation.totalHp, 1, TOTAL_HP),
        phases: Array.isArray(rotation.phases) ? rotation.phases.map(phase => ({
            phaseIndex: clampInt(phase.phaseIndex, 1, PHASES.length),
            phaseId: String(phase.phaseId || ''),
            title: String(phase.title || ''),
            hp: clampInt(phase.hp),
            cumulativeThreshold: clampInt(phase.cumulativeThreshold),
            rewardMilestoneId: String(phase.rewardMilestoneId || '')
        })) : [],
        milestones: Array.isArray(rotation.milestones) ? rotation.milestones.map(entry => ({
            milestoneId: String(entry.milestoneId || ''),
            milestoneType: String(entry.milestoneType || ''),
            title: String(entry.title || ''),
            targetContribution: clampInt(entry.targetContribution),
            targetAppliedDamage: clampInt(entry.targetAppliedDamage),
            phaseIndex: clampInt(entry.phaseIndex),
            reward: {
                rewardType: String(entry.reward && entry.reward.rewardType || ''),
                currency: String(entry.reward && entry.reward.currency || REWARD_CURRENCY),
                amount: clampInt(entry.reward && entry.reward.amount),
                rewardImpact: String(entry.reward && entry.reward.rewardImpact || REWARD_IMPACT),
                spendPolicy: String(entry.reward && entry.reward.spendPolicy || 'cosmetic_only')
            }
        })) : [],
        directiveSet: {
            directiveSetId: String(rotation.directiveSetId || ''),
            title: String(rotation.directiveTitle || ''),
            description: String(rotation.directiveDescription || ''),
            directives: getRotationDirectives(rotation).map(formatDirectiveDefinition)
        },
        fairness: rotation.fairness || {},
        contributionFormula: rotation.contributionFormula || CONTRIBUTION_FORMULA
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

function formatContribution(contribution) {
    if (!contribution) return null;
    return {
        contributionId: String(contribution.contribution_id || ''),
        attemptId: String(contribution.attempt_id || ''),
        runId: String(contribution.run_id || ''),
        receiptId: String(contribution.receipt_id || ''),
        rotationId: String(contribution.rotation_id || ''),
        contribution: clampInt(contribution.contribution),
        appliedDamage: clampInt(contribution.applied_damage),
        echoContribution: clampInt(contribution.echo_contribution),
        score: clampInt(contribution.score),
        turns: clampInt(contribution.turns),
        remainingHp: clampInt(contribution.remaining_hp),
        survivalBonus: clampInt(contribution.survival_bonus),
        tempoBonus: clampInt(contribution.tempo_bonus),
        previousPhaseIndex: clampInt(contribution.previous_phase_index),
        nextPhaseIndex: clampInt(contribution.next_phase_index),
        previousAppliedDamage: clampInt(contribution.previous_applied_damage),
        nextAppliedDamage: clampInt(contribution.next_applied_damage),
        stateVersion: clampInt(contribution.state_version),
        submittedAt: clampInt(contribution.submitted_at),
        summary: parseJson(contribution.summary_json, {})
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

function formatPersonalEntry(entry) {
    if (!entry) {
        return {
            rankedContribution: 0,
            bestContribution: 0,
            rankedRemainingHp: 0,
            rankedTurns: 0,
            totalContribution: 0,
            completedAttempts: 0
        };
    }
    return {
        entryId: String(entry.entry_id || ''),
        rankedContribution: clampInt(entry.ranked_contribution),
        bestContribution: clampInt(entry.best_contribution),
        rankedRemainingHp: clampInt(entry.ranked_remaining_hp),
        rankedTurns: clampInt(entry.ranked_turns),
        totalContribution: clampInt(entry.total_contribution),
        completedAttempts: clampInt(entry.completed_attempts),
        updatedAt: clampInt(entry.updated_at)
    };
}

function parseRotationRow(row) {
    if (!row) return null;
    const snapshot = parseJson(row.snapshot_json, {});
    return {
        rotationId: String(row.rotation_id || snapshot.rotationId || ''),
        protocolVersion: String(row.protocol_version || snapshot.protocolVersion || PROTOCOL_VERSION),
        catalogVersion: String(row.catalog_version || snapshot.catalogVersion || ''),
        rotationRuleVersion: String(row.rule_version || snapshot.rotationRuleVersion || ''),
        catalogHash: String(row.catalog_hash || snapshot.catalogHash || ''),
        title: String(row.title || snapshot.title || ''),
        description: String(row.description || snapshot.description || ''),
        startsAt: clampInt(row.starts_at || snapshot.startsAt),
        endsAt: clampInt(row.ends_at || snapshot.endsAt),
        graceEndsAt: clampInt(row.grace_ends_at || snapshot.graceEndsAt),
        claimEndsAt: clampInt(row.claim_ends_at || snapshot.claimEndsAt),
        attemptLimit: clampInt(row.attempt_limit || snapshot.attemptLimit, 1, ATTEMPT_LIMIT),
        seedSlotCount: clampInt(row.seed_slot_count || snapshot.seedSlotCount, 1, SEED_SLOT_COUNT),
        leaderboardLimit: clampInt(row.leaderboard_limit || snapshot.leaderboardLimit, 1, LEADERBOARD_LIMIT),
        totalHp: clampInt(row.total_hp || snapshot.totalHp, 1, TOTAL_HP),
        contributionFormula: snapshot.contributionFormula || parseJson(row.contribution_formula_json, CONTRIBUTION_FORMULA),
        phases: snapshot.phases || parseJson(row.phases_json, PHASES),
        milestones: snapshot.milestones || parseJson(row.milestones_json, []),
        directiveSetId: String(snapshot.directiveSetId || ''),
        directiveTitle: String(snapshot.directiveTitle || ''),
        directiveDescription: String(snapshot.directiveDescription || ''),
        directives: Array.isArray(snapshot.directives) ? snapshot.directives : [],
        fairness: snapshot.fairness || {},
        snapshotHash: String(row.snapshot_hash || snapshot.snapshotHash || '')
    };
}

function parseStateRow(row) {
    if (!row) return null;
    return {
        rotationId: String(row.rotation_id || ''),
        appliedDamage: clampInt(row.applied_damage, 0, TOTAL_HP),
        totalContribution: clampInt(row.total_contribution),
        currentPhaseIndex: clampInt(row.current_phase_index, 1, PHASES.length),
        clearedAt: clampInt(row.cleared_at),
        phaseUnlocks: parseJson(row.phase_unlocks_json, {}),
        stateVersion: clampInt(row.state_version),
        lastContributionId: String(row.last_contribution_id || ''),
        lastResultAt: clampInt(row.last_result_at),
        updatedAt: clampInt(row.updated_at)
    };
}

async function loadRotationById(connection, rotationId) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM world_rift_rotations
         WHERE rotation_id = ?`,
        [rotationId]
    );
    return parseRotationRow(row);
}

async function loadCurrentRotation(connection, now = Date.now()) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM world_rift_rotations
         WHERE starts_at <= ? AND ends_at > ?
         ORDER BY created_at DESC, rotation_id ASC
         LIMIT 1`,
        [now, now]
    );
    if (row) return parseRotationRow(row);
    const calendarRotation = buildRotationSnapshot(now);
    return loadRotationById(connection, calendarRotation.rotationId);
}

async function loadPreviousClaimRotation(connection, now = Date.now()) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM world_rift_rotations
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
    if (rotationId === current.rotationId) return formatRotation(current, now);
    const previous = buildRotationSnapshotForStart(current.startsAt - WEEK_MS);
    if (rotationId === previous.rotationId) return formatRotation(previous, now);
    return null;
}

async function loadStateByRotation(connection, rotationId) {
    const row = await dbGet(
        connection,
        `SELECT *
         FROM world_rift_states
         WHERE rotation_id = ?`,
        [rotationId]
    );
    return parseStateRow(row);
}

async function getStoredMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT rotation_id, request_hash, receipt_json
         FROM world_rift_mutations
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function ensureMutationAvailable(connection, userId, mutationId, requestHash) {
    const row = await getStoredMutation(connection, userId, mutationId);
    if (!row) return null;
    if (String(row.request_hash || '') !== requestHash) {
        throw makeMutationConflictError();
    }
    const receipt = parseJson(row.receipt_json, null);
    if (!receipt || typeof receipt !== 'object') {
        throw makeError(500, 'world_rift_corrupt_mutation_receipt', '天穹裂隙幂等回执损坏');
    }
    receipt.idempotent = true;
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
    attemptId = '',
    contributionId = '',
    claimId = '',
    now = Date.now()
}) {
    await dbRun(
        connection,
        `INSERT OR IGNORE INTO world_rift_mutations
            (user_id, mutation_id, rotation_id, request_type, request_hash, request_body_json,
             receipt_json, attempt_id, contribution_id, claim_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            mutationId,
            rotationId,
            requestType,
            requestHash,
            stableStringify(requestBody || {}),
            stableStringify(receipt || {}),
            attemptId,
            contributionId,
            claimId,
            now
        ]
    );
}

async function persistMutationReceiptIfNeeded(userId, mutationId, requestHash, requestBody, receipt, meta) {
    return withWriteTransaction(async connection => {
        await ensureWorldRiftSchema(connection, meta && meta.now || Date.now());
        const replay = await ensureMutationAvailable(connection, userId, mutationId, requestHash);
        if (replay) return replay;
        await storeMutationReceipt(connection, {
            userId,
            mutationId,
            rotationId: meta.rotationId,
            requestType: meta.requestType,
            requestHash,
            requestBody,
            receipt,
            attemptId: meta.attemptId,
            contributionId: meta.contributionId,
            claimId: meta.claimId,
            now: meta.now
        });
        return receipt;
    });
}

async function recordOpsEvent(connection, eventType, {
    rotationId,
    accountRef = '',
    resultCode = 'ok',
    value = 0,
    detail = {}
}, now = Date.now()) {
    const eventId = deterministicId('riftops', [
        rotationId,
        eventType,
        accountRef || '',
        resultCode,
        String(now),
        crypto.randomUUID()
    ]);
    const detailJson = stableStringify(detail);
    await dbRun(
        connection,
        `INSERT INTO world_rift_ops_events
            (event_id, event_type, rotation_id, account_ref, result_code, value, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            eventId,
            eventType,
            rotationId,
            String(accountRef || ''),
            String(resultCode || 'ok'),
            clampInt(value, 0, 1_000_000),
            detailJson,
            now
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO world_rift_ops_counters
            (event_type, rotation_id, result_code, event_count, total_value, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, rotation_id, result_code) DO UPDATE SET
            event_count = world_rift_ops_counters.event_count + 1,
            total_value = world_rift_ops_counters.total_value + excluded.total_value,
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
         FROM world_rift_attempts
         WHERE attempt_id = ? AND user_id = ?`,
        [attemptId, userId]
    );
}

async function loadAttemptByClientAttempt(connection, userId, rotationId, clientAttemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_attempts
         WHERE user_id = ? AND rotation_id = ? AND client_attempt_id = ?`,
        [userId, rotationId, clientAttemptId]
    );
}

async function loadAttemptByMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_attempts
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function loadAttemptByRunId(connection, userId, runId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_attempts
         WHERE user_id = ? AND run_id = ?`,
        [userId, runId]
    );
}

async function countAttemptsUsed(connection, userId, rotationId) {
    const row = await dbGet(
        connection,
        `SELECT COUNT(*) AS count
         FROM world_rift_attempts
         WHERE user_id = ? AND rotation_id = ?`,
        [userId, rotationId]
    );
    return clampInt(row && row.count, 0, ATTEMPT_LIMIT);
}

async function loadExistingContribution(connection, attemptId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_contributions
         WHERE attempt_id = ?`,
        [attemptId]
    );
}

async function loadContributionById(connection, contributionId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_contributions
         WHERE contribution_id = ?`,
        [contributionId]
    );
}

async function loadEntry(connection, userId, rotationId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_entries
         WHERE rotation_id = ? AND user_id = ?`,
        [rotationId, userId]
    );
}

async function loadMilestoneClaims(connection, userId, rotationId) {
    const rows = await dbAll(
        connection,
        `SELECT milestone_id, claimed_at
         FROM world_rift_reward_claims
         WHERE user_id = ? AND rotation_id = ?`,
        [userId, rotationId]
    );
    return new Map(rows.map(row => [String(row.milestone_id || ''), clampInt(row.claimed_at)]));
}

async function loadResumableAttempt(connection, userId, now = Date.now()) {
    const row = await dbGet(
        connection,
        `SELECT a.*
         FROM world_rift_attempts a
         JOIN world_rift_rotations r ON r.rotation_id = a.rotation_id
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

function getRotationPhases(rotation) {
    return Array.isArray(rotation && rotation.phases) && rotation.phases.length > 0
        ? rotation.phases
        : PHASES;
}

function getRotationMilestones(rotation) {
    return Array.isArray(rotation && rotation.milestones) ? rotation.milestones : [];
}

function getRotationDirectives(rotation) {
    return Array.isArray(rotation && rotation.directives)
        ? rotation.directives.filter(entry => entry && safeDirectiveId(entry.directiveId) && DIRECTIVE_SCOPES.has(String(entry.scope || '')))
        : [];
}

function formatDirectiveDefinition(entry) {
    return {
        directiveId: String(entry && entry.directiveId || ''),
        scope: String(entry && entry.scope || ''),
        title: String(entry && entry.title || ''),
        description: String(entry && entry.description || ''),
        goalText: String(entry && entry.goalText || ''),
        target: clampInt(entry && entry.targetValue, 1),
        reward: {
            rewardType: String(entry && entry.reward && entry.reward.rewardType || 'world_rift_campaign_directive'),
            currency: String(entry && entry.reward && entry.reward.currency || REWARD_CURRENCY),
            amount: clampInt(entry && entry.reward && entry.reward.amount),
            rewardImpact: String(entry && entry.reward && entry.reward.rewardImpact || REWARD_IMPACT),
            spendPolicy: String(entry && entry.reward && entry.reward.spendPolicy || 'cosmetic_only')
        }
    };
}

function directiveProgressUnit(entry) {
    switch (String(entry && entry.metric || '')) {
    case 'qualified_runs':
    case 'completed_runs':
        return '场';
    case 'distinct_contracts':
        return '类';
    case 'contract_selections':
        return '段';
    case 'route_bonus':
        return '路线分';
    default:
        return '';
    }
}

function extractDirectiveFacts(summary) {
    const source = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {};
    const routeResolution = source.routeResolution && typeof source.routeResolution === 'object'
        ? source.routeResolution
        : {};
    const completed = String(source.result || '') === 'completed';
    const selections = completed && Array.isArray(routeResolution.selections)
        ? routeResolution.selections
            .map(entry => String(entry && entry.contractId || ''))
            .filter(contractId => ROUTE_CONTRACT_IDS.has(contractId))
        : [];
    return {
        completed,
        completedRuns: completed ? 1 : 0,
        remainingHp: completed ? clampInt(source.remainingHp, 0, 999) : 0,
        routeBonus: completed ? clampInt(routeResolution.totalBonus, 0, 10_000) : 0,
        selections,
        distinctContracts: [...new Set(selections)].sort()
    };
}

function evaluateDirectiveDelta(directive, facts, currentProgressJson = {}) {
    const criteria = directive && directive.criteria && typeof directive.criteria === 'object'
        ? directive.criteria
        : {};
    const allowedContracts = Array.isArray(criteria.allowedContracts)
        ? criteria.allowedContracts.map(String).filter(contractId => ROUTE_CONTRACT_IDS.has(contractId))
        : [];
    const selectedContracts = allowedContracts.length > 0
        ? facts.selections.filter(contractId => allowedContracts.includes(contractId))
        : facts.selections.slice();
    const matchedDistinctContracts = [...new Set(selectedContracts)].sort();
    const qualifies = (!criteria.requireCompleted || facts.completed)
        && facts.remainingHp >= clampInt(criteria.minRemainingHp)
        && facts.distinctContracts.length >= clampInt(criteria.minDistinctContracts)
        && selectedContracts.length >= clampInt(criteria.minMatchedContracts);
    const metric = String(directive && directive.metric || '');
    const previousContracts = Array.isArray(currentProgressJson.contracts)
        ? currentProgressJson.contracts.map(String).filter(contractId => ROUTE_CONTRACT_IDS.has(contractId))
        : [];
    const nextContracts = metric === 'distinct_contracts' && qualifies
        ? [...new Set([...previousContracts, ...matchedDistinctContracts])].sort()
        : previousContracts;
    let deltaValue = 0;
    if (qualifies) {
        switch (metric) {
        case 'qualified_runs':
            deltaValue = 1;
            break;
        case 'completed_runs':
            deltaValue = facts.completedRuns;
            break;
        case 'contract_selections':
            deltaValue = selectedContracts.length;
            break;
        case 'route_bonus':
            deltaValue = facts.routeBonus;
            break;
        case 'distinct_contracts':
            deltaValue = Math.max(nextContracts.length - previousContracts.length, 0);
            break;
        default:
            deltaValue = 0;
        }
    }
    return {
        deltaValue,
        progressJson: metric === 'distinct_contracts' ? { contracts: nextContracts } : {},
        deltaJson: {
            completed: facts.completed,
            remainingHp: facts.remainingHp,
            routeBonus: facts.routeBonus,
            selectedContracts,
            addedContracts: metric === 'distinct_contracts'
                ? nextContracts.filter(contractId => !previousContracts.includes(contractId))
                : []
        }
    };
}

async function loadDirectiveState(connection, rotationId, directiveId, ownerType, ownerId) {
    return dbGet(
        connection,
        `SELECT *
         FROM world_rift_directive_states
         WHERE rotation_id = ? AND directive_id = ? AND owner_type = ? AND owner_id = ?`,
        [rotationId, directiveId, ownerType, ownerId]
    );
}

async function loadDirectiveClaims(connection, userId, rotationId) {
    const rows = await dbAll(
        connection,
        `SELECT *
         FROM world_rift_directive_claims
         WHERE user_id = ? AND rotation_id = ?`,
        [userId, rotationId]
    );
    return new Map(rows.map(row => [String(row.directive_id || ''), row]));
}

async function loadUserSquadContribution(connection, userId, rotationId) {
    return dbGet(
        connection,
        `SELECT squad_id, contribution_id, contribution, linked_at
         FROM world_rift_squad_contributions
         WHERE user_id = ? AND rotation_id = ? AND contribution > 0
         ORDER BY linked_at DESC, contribution_id ASC
         LIMIT 1`,
        [userId, rotationId]
    );
}

async function loadContributionSquadId(connection, contributionId) {
    const row = await dbGet(
        connection,
        `SELECT squad_id
         FROM world_rift_squad_contributions
         WHERE contribution_id = ?`,
        [contributionId]
    );
    return String(row && row.squad_id || '');
}

function makeDirectiveOwner(directive, userId, rotationId, squadId = '') {
    const scope = String(directive && directive.scope || '');
    if (scope === 'personal') return { ownerType: 'account', ownerId: String(userId || '') };
    if (scope === 'global') return { ownerType: 'global', ownerId: String(rotationId || '') };
    if (scope === 'squad' && safeId(squadId)) return { ownerType: 'squad', ownerId: squadId };
    return null;
}

async function projectDirective(connection, {
    rotation,
    directive,
    contributionRow,
    owner,
    facts,
    now = Date.now()
}) {
    const rotationId = String(rotation.rotationId || '');
    const directiveId = String(directive.directiveId || '');
    const contributionId = String(contributionRow.contribution_id || '');
    const existingProjection = await dbGet(
        connection,
        `SELECT *
         FROM world_rift_directive_projections
         WHERE rotation_id = ? AND directive_id = ? AND contribution_id = ? AND owner_type = ? AND owner_id = ?`,
        [rotationId, directiveId, contributionId, owner.ownerType, owner.ownerId]
    );
    if (existingProjection) {
        const target = clampInt(directive.targetValue, 1);
        const progress = Math.min(clampInt(existingProjection.result_progress_value), target);
        return {
            directiveId,
            scope: String(directive.scope || ''),
            title: String(directive.title || ''),
            delta: 0,
            progress,
            target,
            progressText: `${progress} / ${target} ${directiveProgressUnit(directive)}`.trim(),
            completedNow: false,
            projected: false
        };
    }
    const state = await loadDirectiveState(connection, rotationId, directiveId, owner.ownerType, owner.ownerId);
    const previousProgress = clampInt(state && state.progress_value);
    const previousStateVersion = clampInt(state && state.state_version);
    const evaluated = evaluateDirectiveDelta(directive, facts, parseJson(state && state.progress_json, {}));
    const nextProgress = previousProgress + clampInt(evaluated.deltaValue);
    const target = clampInt(directive.targetValue, 1);
    const completedNow = previousProgress < target && nextProgress >= target;
    const completedAt = clampInt(state && state.completed_at) || (completedNow ? clampInt(contributionRow.submitted_at || now) : 0);
    const projectionId = deterministicId('riftdirectiveprojection', [
        rotationId,
        directiveId,
        contributionId,
        owner.ownerType,
        owner.ownerId
    ]);
    const nextStateVersion = previousStateVersion + 1;
    await dbRun(
        connection,
        `INSERT INTO world_rift_directive_states
            (rotation_id, directive_id, scope, owner_type, owner_id, progress_value, target_value,
             progress_json, state_version, completed_at, last_projection_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(rotation_id, directive_id, owner_type, owner_id) DO UPDATE SET
            scope = excluded.scope,
            progress_value = excluded.progress_value,
            target_value = excluded.target_value,
            progress_json = excluded.progress_json,
            state_version = excluded.state_version,
            completed_at = excluded.completed_at,
            last_projection_id = excluded.last_projection_id,
            updated_at = excluded.updated_at`,
        [
            rotationId,
            directiveId,
            String(directive.scope || ''),
            owner.ownerType,
            owner.ownerId,
            nextProgress,
            target,
            stableStringify(evaluated.progressJson),
            nextStateVersion,
            completedAt,
            projectionId,
            now
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO world_rift_directive_projections
            (projection_id, rotation_id, directive_id, contribution_id, owner_type, owner_id, delta_value,
             delta_json, result_progress_value, result_state_version, completed_now, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            projectionId,
            rotationId,
            directiveId,
            contributionId,
            owner.ownerType,
            owner.ownerId,
            clampInt(evaluated.deltaValue),
            stableStringify(evaluated.deltaJson),
            nextProgress,
            nextStateVersion,
            completedNow ? 1 : 0,
            now
        ]
    );
    return {
        directiveId,
        scope: String(directive.scope || ''),
        title: String(directive.title || ''),
        delta: clampInt(evaluated.deltaValue),
        progress: Math.min(nextProgress, target),
        target,
        progressText: `${Math.min(nextProgress, target)} / ${target} ${directiveProgressUnit(directive)}`.trim(),
        completedNow,
        projected: true
    };
}

async function projectContributionDirectives(connection, rotation, contributionRow, squadId = '', now = Date.now()) {
    const directives = getRotationDirectives(rotation);
    if (directives.length === 0 || !contributionRow) return [];
    const summary = parseJson(contributionRow.summary_json, {});
    const facts = extractDirectiveFacts(summary);
    const deltas = [];
    for (const directive of directives) {
        const owner = makeDirectiveOwner(
            directive,
            String(contributionRow.user_id || ''),
            String(contributionRow.rotation_id || ''),
            squadId
        );
        if (!owner) continue;
        deltas.push(await projectDirective(connection, {
            rotation,
            directive,
            contributionRow,
            owner,
            facts,
            now
        }));
    }
    return deltas;
}

async function ensureDirectiveCatalogBackfill(connection, rotation, now = Date.now()) {
    const directives = getRotationDirectives(rotation);
    if (directives.length === 0) return { contributions: 0, projections: 0, skipped: true };
    const marker = await dbGet(
        connection,
        `SELECT event_id
         FROM world_rift_ops_events
         WHERE event_type = 'directive_catalog_backfilled'
           AND rotation_id = ?
           AND result_code = ?
         LIMIT 1`,
        [rotation.rotationId, CATALOG_VERSION]
    );
    if (marker) return { contributions: 0, projections: 0, skipped: true };
    const contributions = await dbAll(
        connection,
        `SELECT *
         FROM world_rift_contributions
         WHERE rotation_id = ?
         ORDER BY submitted_at ASC, contribution_id ASC`,
        [rotation.rotationId]
    );
    let projectionCount = 0;
    for (const contribution of contributions) {
        const squadId = await loadContributionSquadId(connection, contribution.contribution_id);
        const deltas = await projectContributionDirectives(
            connection,
            rotation,
            contribution,
            squadId,
            clampInt(contribution.submitted_at || now)
        );
        projectionCount += deltas.filter(entry => entry.projected).length;
    }
    await recordOpsEvent(connection, 'directive_catalog_backfilled', {
        rotationId: rotation.rotationId,
        resultCode: CATALOG_VERSION,
        value: projectionCount,
        detail: {
            catalogVersion: CATALOG_VERSION,
            contributions: contributions.length,
            projections: projectionCount
        }
    }, now);
    return {
        contributions: contributions.length,
        projections: projectionCount,
        skipped: false
    };
}

async function buildDirectiveViews(connection, rotation, userId, now = Date.now(), squadIdHint = '') {
    const directives = getRotationDirectives(rotation);
    if (directives.length === 0) return [];
    const [claimMap, personalEntry, squadContribution] = await Promise.all([
        loadDirectiveClaims(connection, userId, rotation.rotationId),
        loadEntry(connection, userId, rotation.rotationId),
        loadUserSquadContribution(connection, userId, rotation.rotationId)
    ]);
    const squadId = String(squadContribution && squadContribution.squad_id || squadIdHint || '');
    const hasPersonalContribution = clampInt(personalEntry && personalEntry.completed_attempts) > 0;
    const claimWindowOpen = now < clampInt(rotation.claimEndsAt);
    const views = [];
    for (const directive of directives.slice().sort((left, right) => clampInt(left.sortOrder) - clampInt(right.sortOrder))) {
        const owner = makeDirectiveOwner(directive, userId, rotation.rotationId, squadId);
        const state = owner
            ? await loadDirectiveState(connection, rotation.rotationId, directive.directiveId, owner.ownerType, owner.ownerId)
            : null;
        const claim = claimMap.get(String(directive.directiveId || '')) || null;
        const target = clampInt(directive.targetValue, 1);
        const rawProgress = clampInt(state && state.progress_value);
        const progress = Math.min(rawProgress, target);
        const completedAt = clampInt(state && state.completed_at);
        const completed = completedAt > 0 || rawProgress >= target;
        const eligible = String(directive.scope || '') === 'squad'
            ? !!squadContribution
            : hasPersonalContribution;
        const claimedAt = clampInt(claim && claim.claimed_at);
        const claimed = claimedAt > 0;
        views.push({
            ...formatDirectiveDefinition(directive),
            progress,
            progressText: `${progress} / ${target} ${directiveProgressUnit(directive)}`.trim(),
            status: claimed ? 'claimed' : completed ? 'completed' : owner ? 'active' : 'unavailable',
            ownerLabel: String(directive.scope || '') === 'personal'
                ? '个人'
                : String(directive.scope || '') === 'squad'
                    ? '裂隙小队'
                    : '全服',
            eligibilityText: String(directive.scope || '') === 'squad'
                ? (!owner ? '加入裂隙小队后可共同推进' : !squadContribution ? '本轮向该小队完成一次正式贡献后可领取' : '')
                : String(directive.scope || '') === 'global' && !hasPersonalContribution
                    ? '本轮完成一次正式贡献后可领取'
                    : '',
            completedAt,
            claimable: claimWindowOpen && completed && eligible && !claimed,
            claimed,
            claimedAt
        });
    }
    return views;
}

function getTotalHp(rotation) {
    return clampInt(rotation && rotation.totalHp, 1, TOTAL_HP);
}

function getPhaseInfoForDamage(rotation, appliedDamage) {
    const phases = getRotationPhases(rotation);
    const totalHp = getTotalHp(rotation);
    const clampedApplied = clampInt(appliedDamage, 0, totalHp);
    let previousThreshold = 0;
    for (const phase of phases) {
        const threshold = clampInt(phase.cumulativeThreshold);
        const phaseHp = clampInt(phase.hp);
        if (clampedApplied < threshold) {
            const phaseDamage = clampedApplied - previousThreshold;
            return {
                phaseIndex: clampInt(phase.phaseIndex, 1, phases.length),
                phaseId: String(phase.phaseId || ''),
                title: String(phase.title || ''),
                hp: phaseHp,
                damageInPhase: phaseDamage,
                remainingHp: Math.max(phaseHp - phaseDamage, 0),
                cumulativeThreshold: threshold,
                worldRemainingHp: Math.max(totalHp - clampedApplied, 0),
                cleared: false
            };
        }
        previousThreshold = threshold;
    }
    const last = phases[phases.length - 1] || PHASES[PHASES.length - 1];
    return {
        phaseIndex: clampInt(last.phaseIndex, 1, phases.length),
        phaseId: String(last.phaseId || ''),
        title: String(last.title || ''),
        hp: clampInt(last.hp),
        damageInPhase: clampInt(last.hp),
        remainingHp: 0,
        cumulativeThreshold: clampInt(last.cumulativeThreshold),
        worldRemainingHp: 0,
        cleared: true
    };
}

function normalizePhaseUnlocks(rotation, rawUnlocks, state = null) {
    const source = rawUnlocks && typeof rawUnlocks === 'object' && !Array.isArray(rawUnlocks) ? rawUnlocks : {};
    const appliedDamage = clampInt(state && state.appliedDamage);
    const clearedAt = clampInt(state && state.clearedAt);
    const unlocks = {};
    for (const phase of getRotationPhases(rotation)) {
        const key = String(phase.rewardMilestoneId || '');
        const unlockedAt = clampInt(source[key]);
        if (unlockedAt > 0) {
            unlocks[key] = unlockedAt;
            continue;
        }
        unlocks[key] = appliedDamage >= clampInt(phase.cumulativeThreshold) ? clearedAt : 0;
    }
    return unlocks;
}

function buildWorldStateView(rotation, state, now = Date.now()) {
    const totalHp = getTotalHp(rotation);
    const safeState = state || {
        appliedDamage: 0,
        totalContribution: 0,
        currentPhaseIndex: 1,
        clearedAt: 0,
        phaseUnlocks: {},
        stateVersion: 0,
        lastContributionId: '',
        lastResultAt: 0,
        updatedAt: 0
    };
    const phaseInfo = getPhaseInfoForDamage(rotation, safeState.appliedDamage);
    const phaseUnlocks = normalizePhaseUnlocks(rotation, safeState.phaseUnlocks, safeState);
    const lifecycle = rotationLifecycleState(rotation, now);
    const cleared = safeState.appliedDamage >= totalHp || clampInt(safeState.clearedAt) > 0;
    return {
        rotationId: String(rotation.rotationId || ''),
        status: cleared
            ? (lifecycle === 'active' ? 'echo' : lifecycle === 'grace' ? 'echo_grace' : lifecycle === 'claim' ? 'echo_claim' : 'echo_closed')
            : lifecycle,
        totalHp,
        appliedDamage: clampInt(safeState.appliedDamage, 0, totalHp),
        remainingHp: Math.max(totalHp - clampInt(safeState.appliedDamage, 0, totalHp), 0),
        totalContribution: clampInt(safeState.totalContribution),
        progressRatio: Math.max(0, Math.min(clampInt(safeState.appliedDamage, 0, totalHp) / totalHp, 1)),
        clearedAt: clampInt(safeState.clearedAt),
        stateVersion: clampInt(safeState.stateVersion),
        lastContributionId: String(safeState.lastContributionId || ''),
        lastResultAt: clampInt(safeState.lastResultAt),
        updatedAt: clampInt(safeState.updatedAt),
        currentPhase: {
            phaseIndex: phaseInfo.phaseIndex,
            phaseId: phaseInfo.phaseId,
            title: phaseInfo.title,
            hp: phaseInfo.hp,
            remainingHp: phaseInfo.remainingHp,
            damageTaken: phaseInfo.damageInPhase,
            cumulativeThreshold: phaseInfo.cumulativeThreshold,
            cleared
        },
        phaseUnlocks: getRotationPhases(rotation).map(phase => ({
            milestoneId: String(phase.rewardMilestoneId || ''),
            phaseIndex: clampInt(phase.phaseIndex),
            phaseId: String(phase.phaseId || ''),
            title: String(phase.title || ''),
            unlockedAt: clampInt(phaseUnlocks[String(phase.rewardMilestoneId || '')])
        }))
    };
}

function mapRunStatusToAttemptStatus(runStatus, hasContribution) {
    if (hasContribution) return 'submitted';
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
    const existingContribution = await loadExistingContribution(connection, attempt.attempt_id);
    if (!attempt.run_id) {
        if (existingContribution && String(attempt.status || '') !== 'submitted') {
            await dbRun(
                connection,
                `UPDATE world_rift_attempts
                 SET status = 'submitted',
                     submitted_at = ?,
                     terminal_at = CASE WHEN terminal_at > 0 THEN terminal_at ELSE ? END,
                     updated_at = ?
                 WHERE attempt_id = ? AND user_id = ?`,
                [
                    clampInt(existingContribution.submitted_at),
                    clampInt(existingContribution.submitted_at),
                    now,
                    attempt.attempt_id,
                    attempt.user_id
                ]
            );
            return loadAttemptById(connection, attempt.user_id, attempt.attempt_id);
        }
        if (String(attempt.status || '') === 'reserved') {
            const rotation = await loadRotationById(connection, attempt.rotation_id);
            if (rotation && now >= clampInt(rotation.endsAt)) {
                await dbRun(
                    connection,
                    `UPDATE world_rift_attempts
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
    if (!run) throw makeError(409, 'world_rift_run_missing', '天穹裂隙绑定的权威 run 不存在');
    const nextStatus = mapRunStatusToAttemptStatus(run.status, !!existingContribution);
    const nextStartedAt = clampInt(run.started_at);
    const nextCompletedAt = clampInt(run.completed_at || run.settled_at);
    const nextSubmittedAt = existingContribution ? clampInt(existingContribution.submitted_at) : clampInt(attempt.submitted_at);
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
        `UPDATE world_rift_attempts
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

function computeContribution(summary) {
    const score = clampInt(summary && summary.score);
    const remainingHp = clampInt(summary && summary.remainingHp);
    const turns = clampInt(summary && summary.turns);
    const survivalBonus = Math.min(remainingHp * clampInt(CONTRIBUTION_FORMULA.survivalBonusPerHp), clampInt(CONTRIBUTION_FORMULA.survivalBonusCap));
    const tempoBonus = Math.min(
        Math.max(clampInt(CONTRIBUTION_FORMULA.tempoTurnPar) - turns, 0) * clampInt(CONTRIBUTION_FORMULA.tempoBonusPerTurn),
        clampInt(CONTRIBUTION_FORMULA.tempoBonusCap)
    );
    const contribution = clampInt(
        clampInt(CONTRIBUTION_FORMULA.baseContribution)
        + score * clampInt(CONTRIBUTION_FORMULA.qualityMultiplier)
        + survivalBonus
        + tempoBonus,
        clampInt(CONTRIBUTION_FORMULA.minContribution),
        clampInt(CONTRIBUTION_FORMULA.maxContribution)
    );
    return { score, turns, remainingHp, survivalBonus, tempoBonus, contribution };
}

function validateProjectionInputs(rotation, attempt, run, receiptPayload, receiptRow, now = Date.now()) {
    if (!rotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
    if (!run) throw makeError(409, 'world_rift_run_missing', '天穹裂隙绑定的权威 run 不存在');
    if (String(run.activity_mode || '') !== 'world_rift') {
        throw makeError(409, 'world_rift_run_mode_invalid', '权威回执模式与天穹裂隙不一致');
    }
    if (String(run.client_run_id || '') !== String(attempt.client_run_id || '')) {
        throw makeError(409, 'world_rift_run_binding_invalid', '权威 run 与正式尝试绑定不一致');
    }
    if (clampInt(run.started_at) < clampInt(rotation.startsAt) || clampInt(run.started_at) >= clampInt(rotation.endsAt)) {
        throw makeError(409, 'world_rift_rotation_window_mismatch', '权威 run 不属于该轮换窗口');
    }
    if (clampInt(receiptRow && receiptRow.created_at) > clampInt(rotation.graceEndsAt)) {
        throw makeError(409, 'world_rift_receipt_after_grace', '结算宽限已结束，不能再投影裂隙贡献');
    }
    if (now >= clampInt(rotation.graceEndsAt)) {
        throw makeError(409, 'world_rift_settlement_window_closed', '该轮天穹裂隙已停止写入贡献');
    }
    if (String(receiptPayload.receiptId || '') !== String(receiptRow && receiptRow.receipt_id || '')
        || String(receiptPayload.runId || '') !== String(attempt.run_id || '')
        || String(receiptPayload.mode || '') !== 'world_rift'
        || String(receiptPayload.contentVersion || '') !== String(run.content_version || '')
        || String(receiptPayload.contentHash || '') !== String(run.content_hash || '')
        || String(receiptPayload.trustTier || '') !== 'server_authoritative'
        || String(receiptPayload.authorityLevel || '') !== 'server_replayed'
        || !receiptPayload.integrity
        || receiptPayload.integrity.fullReplayPassed !== true
        || String(receiptPayload.integrity.stateHash || '') !== String(run.state_hash || '')
        || String(receiptPayload.integrity.chainHead || '') !== String(run.chain_head || '')) {
        throw makeError(409, 'world_rift_receipt_invalid', '权威回执完整性校验失败');
    }
    if (!receiptPayload.summary || String(receiptPayload.summary.result || '') !== 'completed') {
        throw makeError(409, 'world_rift_receipt_incomplete', '权威 run 尚未形成可投影的完整裂隙回执');
    }
}

async function upsertEntry(connection, contributionRow, now = Date.now()) {
    const rows = await dbAll(
        connection,
        `SELECT contribution_id, contribution, remaining_hp, turns
         FROM world_rift_contributions
         WHERE user_id = ? AND rotation_id = ?`,
        [contributionRow.user_id, contributionRow.rotation_id]
    );
    const ordered = rows.slice().sort(compareContributionLike);
    const ranked = ordered.slice(0, 3);
    const aggregates = {
        rankedContribution: ranked.reduce((sum, row) => sum + clampInt(row.contribution), 0),
        bestContribution: ranked.length > 0 ? clampInt(ranked[0].contribution) : 0,
        rankedRemainingHp: ranked.reduce((sum, row) => sum + clampInt(row.remaining_hp), 0),
        rankedTurns: ranked.reduce((sum, row) => sum + clampInt(row.turns), 0),
        totalContribution: ordered.reduce((sum, row) => sum + clampInt(row.contribution), 0),
        completedAttempts: ordered.length
    };
    const entryId = deterministicId('riftentry', [contributionRow.rotation_id, contributionRow.user_id]);
    const existing = await loadEntry(connection, contributionRow.user_id, contributionRow.rotation_id);
    if (!existing) {
        await dbRun(
            connection,
            `INSERT INTO world_rift_entries
                (rotation_id, user_id, entry_id, ranked_contribution, best_contribution, ranked_remaining_hp,
                 ranked_turns, total_contribution, completed_attempts, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                contributionRow.rotation_id,
                contributionRow.user_id,
                entryId,
                aggregates.rankedContribution,
                aggregates.bestContribution,
                aggregates.rankedRemainingHp,
                aggregates.rankedTurns,
                aggregates.totalContribution,
                aggregates.completedAttempts,
                now
            ]
        );
        return;
    }
    await dbRun(
        connection,
        `UPDATE world_rift_entries
         SET entry_id = ?,
             ranked_contribution = ?,
             best_contribution = ?,
             ranked_remaining_hp = ?,
             ranked_turns = ?,
             total_contribution = ?,
             completed_attempts = ?,
             updated_at = ?
         WHERE rotation_id = ? AND user_id = ?`,
        [
            entryId,
            aggregates.rankedContribution,
            aggregates.bestContribution,
            aggregates.rankedRemainingHp,
            aggregates.rankedTurns,
            aggregates.totalContribution,
            aggregates.completedAttempts,
            now,
            contributionRow.rotation_id,
            contributionRow.user_id
        ]
    );
}

async function projectAttemptContribution(connection, attempt, now = Date.now(), source = 'submit') {
    let syncedAttempt = await syncAttemptState(connection, attempt, now);
    const existingContribution = await loadExistingContribution(connection, syncedAttempt.attempt_id);
    if (existingContribution) {
        if (String(syncedAttempt.status || '') !== 'submitted') {
            await dbRun(
                connection,
                `UPDATE world_rift_attempts
                 SET status = 'submitted',
                     submitted_at = ?,
                     terminal_at = CASE WHEN terminal_at > 0 THEN terminal_at ELSE ? END,
                     updated_at = ?
                 WHERE attempt_id = ? AND user_id = ?`,
                [
                    clampInt(existingContribution.submitted_at),
                    clampInt(existingContribution.submitted_at),
                    now,
                    syncedAttempt.attempt_id,
                    syncedAttempt.user_id
                ]
            );
            syncedAttempt = await loadAttemptById(connection, syncedAttempt.user_id, syncedAttempt.attempt_id);
        }
        const existingRotation = await loadRotationById(connection, syncedAttempt.rotation_id);
        const existingSquadId = await loadContributionSquadId(connection, existingContribution.contribution_id);
        const directiveDeltas = existingRotation
            ? await projectContributionDirectives(connection, existingRotation, existingContribution, existingSquadId, now)
            : [];
        return {
            attempt: syncedAttempt,
            contribution: existingContribution,
            state: await loadStateByRotation(connection, syncedAttempt.rotation_id),
            projected: false,
            directiveDeltas
        };
    }
    if (!syncedAttempt.run_id) {
        return { attempt: syncedAttempt, contribution: null, state: await loadStateByRotation(connection, syncedAttempt.rotation_id), projected: false };
    }
    const rotation = await loadRotationById(connection, syncedAttempt.rotation_id);
    const run = await loadAuthoritativeRunRow(connection, syncedAttempt.user_id, syncedAttempt.run_id);
    const receiptRow = await loadAuthoritativeReceipt(connection, syncedAttempt.user_id, syncedAttempt.run_id);
    if (!receiptRow) {
        return { attempt: syncedAttempt, contribution: null, state: await loadStateByRotation(connection, syncedAttempt.rotation_id), projected: false };
    }
    const receiptPayload = parseJson(receiptRow.receipt_json, {});
    validateProjectionInputs(rotation, syncedAttempt, run, receiptPayload, receiptRow, now);
    const summary = receiptPayload.summary || {};
    const computed = computeContribution(summary);
    const state = await loadStateByRotation(connection, syncedAttempt.rotation_id);
    const totalHp = getTotalHp(rotation);
    const previousAppliedDamage = clampInt(state && state.appliedDamage, 0, totalHp);
    const appliedDamage = Math.max(Math.min(computed.contribution, totalHp - previousAppliedDamage), 0);
    const echoContribution = Math.max(computed.contribution - appliedDamage, 0);
    const nextAppliedDamage = previousAppliedDamage + appliedDamage;
    const nextTotalContribution = clampInt(state && state.totalContribution) + computed.contribution;
    const previousPhase = getPhaseInfoForDamage(rotation, previousAppliedDamage);
    const nextPhase = getPhaseInfoForDamage(rotation, nextAppliedDamage);
    const submittedAt = clampInt(receiptPayload.settledAt || receiptRow.created_at || now);
    const contributionId = deterministicId('riftcontrib', [syncedAttempt.attempt_id, receiptPayload.receiptId || receiptRow.receipt_id]);
    const previousUnlocks = normalizePhaseUnlocks(rotation, state && state.phaseUnlocks, state);
    const nextUnlocks = { ...previousUnlocks };
    for (const phase of getRotationPhases(rotation)) {
        const key = String(phase.rewardMilestoneId || '');
        if (!nextUnlocks[key] && previousAppliedDamage < clampInt(phase.cumulativeThreshold) && nextAppliedDamage >= clampInt(phase.cumulativeThreshold)) {
            nextUnlocks[key] = submittedAt;
        }
    }
    const nextClearedAt = clampInt(state && state.clearedAt) > 0
        ? clampInt(state && state.clearedAt)
        : nextAppliedDamage >= totalHp
            ? submittedAt
            : 0;
    const nextStateVersion = clampInt(state && state.stateVersion) + 1;
    const contributionRow = {
        contribution_id: contributionId,
        attempt_id: syncedAttempt.attempt_id,
        run_id: syncedAttempt.run_id,
        receipt_id: String(receiptPayload.receiptId || receiptRow.receipt_id || ''),
        user_id: syncedAttempt.user_id,
        rotation_id: syncedAttempt.rotation_id,
        score: computed.score,
        turns: computed.turns,
        remaining_hp: computed.remainingHp,
        survival_bonus: computed.survivalBonus,
        tempo_bonus: computed.tempoBonus,
        contribution: computed.contribution,
        applied_damage: appliedDamage,
        echo_contribution: echoContribution,
        previous_phase_index: previousPhase.phaseIndex,
        next_phase_index: nextPhase.phaseIndex,
        previous_applied_damage: previousAppliedDamage,
        next_applied_damage: nextAppliedDamage,
        state_version: nextStateVersion,
        mutation_hash: sha256(`${source}:${syncedAttempt.attempt_id}:${String(receiptPayload.receiptId || '')}`),
        summary_json: stableStringify({
            ...summary,
            contribution: computed.contribution,
            appliedDamage,
            echoContribution
        }),
        receipt_json: stableStringify({
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
        `INSERT INTO world_rift_contributions
            (contribution_id, attempt_id, run_id, receipt_id, user_id, rotation_id, score, turns, remaining_hp,
             survival_bonus, tempo_bonus, contribution, applied_damage, echo_contribution, previous_phase_index,
             next_phase_index, previous_applied_damage, next_applied_damage, state_version, mutation_hash,
             summary_json, receipt_json, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            contributionRow.contribution_id,
            contributionRow.attempt_id,
            contributionRow.run_id,
            contributionRow.receipt_id,
            contributionRow.user_id,
            contributionRow.rotation_id,
            contributionRow.score,
            contributionRow.turns,
            contributionRow.remaining_hp,
            contributionRow.survival_bonus,
            contributionRow.tempo_bonus,
            contributionRow.contribution,
            contributionRow.applied_damage,
            contributionRow.echo_contribution,
            contributionRow.previous_phase_index,
            contributionRow.next_phase_index,
            contributionRow.previous_applied_damage,
            contributionRow.next_applied_damage,
            contributionRow.state_version,
            contributionRow.mutation_hash,
            contributionRow.summary_json,
            contributionRow.receipt_json,
            contributionRow.submitted_at
        ]
    );
    const squadLink = await linkContributionToActiveSquad(connection, {
        userId: syncedAttempt.user_id,
        contributionRow,
        now
    });
    const directiveDeltas = await projectContributionDirectives(
        connection,
        rotation,
        contributionRow,
        squadLink && squadLink.linked ? String(squadLink.squadId || '') : '',
        now
    );
    await dbRun(
        connection,
        `UPDATE world_rift_states
         SET applied_damage = ?,
             total_contribution = ?,
             current_phase_index = ?,
             cleared_at = ?,
             phase_unlocks_json = ?,
             state_version = ?,
             last_contribution_id = ?,
             last_result_at = ?,
             updated_at = ?
         WHERE rotation_id = ?`,
        [
            nextAppliedDamage,
            nextTotalContribution,
            nextPhase.phaseIndex,
            nextClearedAt,
            stableStringify(nextUnlocks),
            nextStateVersion,
            contributionId,
            submittedAt,
            now,
            syncedAttempt.rotation_id
        ]
    );
    await upsertEntry(connection, contributionRow, now);
    await dbRun(
        connection,
        `UPDATE world_rift_attempts
         SET status = 'submitted',
             completed_at = CASE WHEN completed_at > 0 THEN completed_at ELSE ? END,
             submitted_at = ?,
             terminal_at = CASE WHEN terminal_at > 0 THEN terminal_at ELSE ? END,
             updated_at = ?
         WHERE attempt_id = ? AND user_id = ?`,
        [
            clampInt(run && (run.completed_at || run.settled_at)),
            submittedAt,
            submittedAt,
            now,
            syncedAttempt.attempt_id,
            syncedAttempt.user_id
        ]
    );
    await recordOpsEvent(connection, 'contribution_projected', {
        rotationId: syncedAttempt.rotation_id,
        accountRef: makeAccountRef(syncedAttempt.user_id),
        resultCode: 'ok',
        value: computed.contribution,
        detail: {
            status: 'submitted',
            attemptIndex: clampInt(syncedAttempt.attempt_index),
            seedSlot: clampInt(syncedAttempt.seed_slot),
            appliedDamage,
            echoContribution,
            source
        }
    }, now);
    return {
        attempt: await loadAttemptById(connection, syncedAttempt.user_id, syncedAttempt.attempt_id),
        contribution: await loadContributionById(connection, contributionId),
        state: await loadStateByRotation(connection, syncedAttempt.rotation_id),
        projected: true,
        directiveDeltas
    };
}

async function reconcileUserState(connection, userId, now = Date.now()) {
    const rows = await dbAll(
        connection,
        `SELECT a.*
         FROM world_rift_attempts a
         JOIN world_rift_rotations r ON r.rotation_id = a.rotation_id
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
            await projectAttemptContribution(connection, synced, now, 'current');
        }
    }
}

async function getLeaderboard(connection, rotationId, userId) {
    const rows = await dbAll(
        connection,
        `SELECT e.*, u.username
         FROM world_rift_entries e
         JOIN users u ON u.id = e.user_id
         WHERE e.rotation_id = ?
         ORDER BY e.ranked_contribution DESC, e.best_contribution DESC, e.ranked_remaining_hp DESC, e.ranked_turns ASC, e.entry_id ASC
         LIMIT ?`,
        [rotationId, LEADERBOARD_LIMIT]
    );
    const selfEntry = await loadEntry(connection, userId, rotationId);
    let myRank = null;
    if (selfEntry) {
        const rankRow = await dbGet(
            connection,
            `SELECT COUNT(*) AS count
             FROM world_rift_entries
             WHERE rotation_id = ?
               AND (
                    ranked_contribution > ?
                 OR (ranked_contribution = ? AND best_contribution > ?)
                 OR (ranked_contribution = ? AND best_contribution = ? AND ranked_remaining_hp > ?)
                 OR (ranked_contribution = ? AND best_contribution = ? AND ranked_remaining_hp = ? AND ranked_turns < ?)
                 OR (ranked_contribution = ? AND best_contribution = ? AND ranked_remaining_hp = ? AND ranked_turns = ? AND entry_id < ?)
               )`,
            [
                rotationId,
                clampInt(selfEntry.ranked_contribution),
                clampInt(selfEntry.ranked_contribution), clampInt(selfEntry.best_contribution),
                clampInt(selfEntry.ranked_contribution), clampInt(selfEntry.best_contribution), clampInt(selfEntry.ranked_remaining_hp),
                clampInt(selfEntry.ranked_contribution), clampInt(selfEntry.best_contribution), clampInt(selfEntry.ranked_remaining_hp), clampInt(selfEntry.ranked_turns),
                clampInt(selfEntry.ranked_contribution), clampInt(selfEntry.best_contribution), clampInt(selfEntry.ranked_remaining_hp), clampInt(selfEntry.ranked_turns), String(selfEntry.entry_id || '')
            ]
        );
        myRank = {
            rank: clampInt(rankRow && rankRow.count) + 1,
            userName: null,
            entry: formatPersonalEntry(selfEntry)
        };
    }
    return {
        entries: rows.map((row, index) => ({
            rank: index + 1,
            userName: String(row.username || ''),
            rankedContribution: clampInt(row.ranked_contribution),
            bestContribution: clampInt(row.best_contribution),
            rankedRemainingHp: clampInt(row.ranked_remaining_hp),
            rankedTurns: clampInt(row.ranked_turns),
            totalContribution: clampInt(row.total_contribution),
            completedAttempts: clampInt(row.completed_attempts),
            isSelf: String(row.user_id || '') === String(userId || '')
        })),
        myRank
    };
}

function buildMilestoneView(rotation, worldState, personalEntry, claimMap) {
    const totalContribution = clampInt(personalEntry && personalEntry.total_contribution);
    const hasValidContribution = clampInt(personalEntry && personalEntry.completed_attempts) > 0;
    const unlockMap = new Map((worldState && worldState.phaseUnlocks || []).map(entry => [String(entry.milestoneId || ''), clampInt(entry.unlockedAt)]));
    return getRotationMilestones(rotation).map(entry => {
        const claimedAt = clampInt(claimMap.get(String(entry.milestoneId || '')));
        const milestoneType = String(entry.milestoneType || '');
        const unlockedAt = milestoneType === 'global'
            ? clampInt(unlockMap.get(String(entry.milestoneId || '')))
            : totalContribution >= clampInt(entry.targetContribution)
                ? clampInt(worldState && worldState.updatedAt || 0)
                : 0;
        const claimable = milestoneType === 'global'
            ? unlockedAt > 0 && hasValidContribution && claimedAt === 0
            : totalContribution >= clampInt(entry.targetContribution) && claimedAt === 0;
        return {
            milestoneId: String(entry.milestoneId || ''),
            milestoneType,
            title: String(entry.title || ''),
            targetContribution: clampInt(entry.targetContribution),
            targetAppliedDamage: clampInt(entry.targetAppliedDamage),
            phaseIndex: clampInt(entry.phaseIndex),
            unlockedAt,
            claimed: claimedAt > 0,
            claimedAt,
            claimable,
            reward: {
                rewardType: String(entry.reward && entry.reward.rewardType || ''),
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

async function launchReservedAttempt(userId, attemptId, nowInput) {
    const nowProvider = createNowProvider(nowInput);
    const phase = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const attempt = await loadAttemptById(connection, userId, attemptId);
        if (!attempt) throw makeError(404, 'world_rift_attempt_not_found', '天穹裂隙尝试不存在');
        const rotation = await loadRotationById(connection, attempt.rotation_id);
        if (!rotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
        if (rotationLifecycleState(rotation, transactionNow) !== 'active') {
            throw makeError(409, 'world_rift_start_window_closed', '该轮天穹裂隙已停止发车');
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
            mode: 'world_rift',
            contentVersion: CONTENT_VERSION
        },
        nowProvider(),
        {
            binding: {
                type: 'world_rift',
                rotationId: phase.attempt.rotation_id,
                attemptId: phase.attempt.attempt_id
            },
            seedHex: phase.seedHex,
            nowProvider,
            startDeadline: clampInt(phase.rotation.endsAt),
            startDeadlineReason: 'world_rift_start_window_closed',
            startDeadlineMessage: '该轮天穹裂隙已停止发车'
        }
    );
    const finalized = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const attempt = await loadAttemptById(connection, userId, attemptId);
        if (!attempt) throw makeError(404, 'world_rift_attempt_not_found', '天穹裂隙尝试不存在');
        const run = authoritative && authoritative.run || null;
        if (!run || !safeId(run.runId)) {
            throw makeError(500, 'world_rift_run_launch_failed', '天穹裂隙权威发车失败');
        }
        if (String(run.clientRunId || '') !== String(attempt.client_run_id || '')) {
            throw makeError(409, 'world_rift_run_binding_invalid', '权威 run 与正式尝试绑定不一致');
        }
        if (String(attempt.run_id || '') && String(attempt.run_id || '') !== String(run.runId || '')) {
            throw makeError(409, 'world_rift_run_binding_conflict', '正式尝试已绑定其他权威 run');
        }
        await dbRun(
            connection,
            `UPDATE world_rift_attempts
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
                attemptIndex: clampInt(refreshed.attempt_index),
                seedSlot: clampInt(refreshed.seed_slot)
            }
        }, transactionNow);
        return refreshed;
    });
    return { attempt: finalized, run: authoritative.run };
}

function buildStartResponse(rotation, worldState, attempt, run, now, { idempotent = false, resumedExisting = false } = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-start`,
        protocolVersion: PROTOCOL_VERSION,
        idempotent,
        resumedExisting,
        rotation: formatRotation(rotation, now),
        world: buildWorldStateView(rotation, worldState, now),
        attempt: formatAttempt(attempt),
        run
    };
}

function buildSubmitResponse(rotation, worldState, attempt, contribution, entry, now, {
    idempotent = false,
    directives = [],
    directiveDeltas = []
} = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-submit`,
        protocolVersion: PROTOCOL_VERSION,
        idempotent,
        rotation: formatRotation(rotation, now),
        world: buildWorldStateView(rotation, worldState, now),
        attempt: formatAttempt(attempt),
        contribution: formatContribution(contribution),
        personal: formatPersonalEntry(entry),
        directives,
        directiveDeltas
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
            milestoneType: String(claim.milestone_type || ''),
            currency: String(claim.currency || REWARD_CURRENCY),
            amount: clampInt(claim.amount),
            rewardImpact: String(claim.reward_impact || REWARD_IMPACT),
            claimedAt: clampInt(claim.claimed_at)
        },
        balance: formatBalance(balance)
    };
}

function buildDirectiveClaimResponse(rotation, claim, directive, directives, balance, now, {
    alreadyClaimed = false,
    idempotent = false
} = {}) {
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-directive-claim`,
        protocolVersion: PROTOCOL_VERSION,
        alreadyClaimed,
        idempotent,
        rotation: formatRotation(rotation, now),
        directive,
        directives,
        claim: {
            claimId: String(claim.claim_id || ''),
            directiveId: String(claim.directive_id || ''),
            scope: String(claim.scope || ''),
            currency: String(claim.currency || REWARD_CURRENCY),
            amount: clampInt(claim.amount),
            rewardImpact: String(claim.reward_impact || REWARD_IMPACT),
            claimedAt: clampInt(claim.claimed_at)
        },
        balance: formatBalance(balance)
    };
}

async function getCurrentWorldRift(userId, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const state = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        await reconcileUserState(connection, identity, transactionNow);
        const rotation = await loadCurrentRotation(connection, transactionNow);
        if (!rotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
        await ensureDirectiveCatalogBackfill(connection, rotation, transactionNow);
        const worldState = await loadStateByRotation(connection, rotation.rotationId);
        const usedAttempts = await countAttemptsUsed(connection, identity, rotation.rotationId);
        const resumableAttempt = await loadResumableAttempt(connection, identity, transactionNow);
        const personalEntry = await loadEntry(connection, identity, rotation.rotationId);
        const claimMap = await loadMilestoneClaims(connection, identity, rotation.rotationId);
        const leaderboard = await getLeaderboard(connection, rotation.rotationId, identity);
        const previousRotation = await loadPreviousClaimRotation(connection, transactionNow);
        const riftSquad = await getRiftSquadDashboard(identity, {
            connection,
            currentRotationId: rotation.rotationId,
            previousRotationId: previousRotation && previousRotation.rotationId || '',
            now: transactionNow
        });
        const directives = await buildDirectiveViews(
            connection,
            rotation,
            identity,
            transactionNow,
            String(riftSquad && riftSquad.current && riftSquad.current.squad && riftSquad.current.squad.squadId || '')
        );
        let previousClaim = null;
        if (previousRotation && previousRotation.rotationId !== rotation.rotationId) {
            const previousEntry = await loadEntry(connection, identity, previousRotation.rotationId);
            if (previousEntry) {
                const previousState = await loadStateByRotation(connection, previousRotation.rotationId);
                const previousClaims = await loadMilestoneClaims(connection, identity, previousRotation.rotationId);
                const previousDirectives = await buildDirectiveViews(connection, previousRotation, identity, transactionNow);
                previousClaim = {
                    rotation: previousRotation,
                    worldState: previousState,
                    personalEntry: previousEntry,
                    milestones: buildMilestoneView(previousRotation, buildWorldStateView(previousRotation, previousState, transactionNow), previousEntry, previousClaims),
                    directives: previousDirectives
                };
            }
        }
        return {
            rotation,
            worldState,
            usedAttempts,
            remainingAttempts: Math.max(clampInt(rotation.attemptLimit, 1, ATTEMPT_LIMIT) - usedAttempts, 0),
            resumableAttempt,
            personalEntry,
            milestones: buildMilestoneView(rotation, buildWorldStateView(rotation, worldState, transactionNow), personalEntry, claimMap),
            directives,
            leaderboard,
            riftSquad,
            previousClaim,
            observedAt: transactionNow
        };
    });
    const responseNow = nowProvider();
    return {
        success: true,
        reportVersion: `${REPORT_VERSION}-current`,
        protocolVersion: PROTOCOL_VERSION,
        rotation: formatRotation(state.rotation, responseNow),
        world: buildWorldStateView(state.rotation, state.worldState, responseNow),
        allowance: {
            attemptLimit: clampInt(state.rotation.attemptLimit, 1, ATTEMPT_LIMIT),
            usedAttempts: state.usedAttempts,
            remainingAttempts: state.remainingAttempts
        },
        resumableAttempt: state.resumableAttempt ? {
            ...formatAttempt(state.resumableAttempt),
            run: await hydrateRun(identity, state.resumableAttempt.run_id, responseNow)
        } : null,
        personal: formatPersonalEntry(state.personalEntry),
        milestones: state.milestones,
        directives: state.directives,
        leaderboard: state.leaderboard,
        riftSquad: state.riftSquad,
        previousClaim: state.previousClaim ? {
            rotation: formatRotation(state.previousClaim.rotation, responseNow),
            world: buildWorldStateView(state.previousClaim.rotation, state.previousClaim.worldState, responseNow),
            personal: formatPersonalEntry(state.previousClaim.personalEntry),
            milestones: state.previousClaim.milestones,
            directives: state.previousClaim.directives
        } : null,
        notices: {
            fairness: [
                '正式裂隙只接受服务端权威回执',
                '每周 5 次正式出征，所有账号共享 5 个种子槽',
                '正式榜只计算最佳 3 次贡献'
            ],
            settlementGraceMs: SETTLEMENT_GRACE_MS,
            claimWindowMs: CLAIM_WINDOW_MS
        }
    };
}

async function startWorldRiftAttempt(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeStartRequest(rawRequest);
    const requestHash = hashCanonical(request);
    const phase = await withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return { type: 'mutation_replay', receipt: replay };
        await reconcileUserState(connection, identity, transactionNow);
        const rotation = await loadCurrentRotation(connection, transactionNow);
        if (!rotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
        const currentWorldState = await loadStateByRotation(connection, rotation.rotationId);
        const existingByMutation = await loadAttemptByMutation(connection, identity, request.mutationId);
        if (existingByMutation) {
            if (String(existingByMutation.request_hash || '') !== requestHash) {
                throw makeMutationConflictError();
            }
            const existingRotation = await loadRotationById(connection, String(existingByMutation.rotation_id || ''));
            if (!existingRotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
            const existingWorldState = await loadStateByRotation(connection, existingRotation.rotationId);
            if (String(existingByMutation.status || '') === 'reserved' && !String(existingByMutation.run_id || '')) {
                return { type: 'launch_reserved', rotation: existingRotation, worldState: existingWorldState, attemptId: String(existingByMutation.attempt_id || '') };
            }
            if (!String(existingByMutation.run_id || '')) {
                throw makeError(409, 'world_rift_attempt_terminal', '该次正式尝试已结束，不能重新发车');
            }
            return { type: 'resume_existing', rotation: existingRotation, worldState: existingWorldState, attempt: existingByMutation };
        }
        const existingByClient = await loadAttemptByClientAttempt(connection, identity, request.rotationId, request.clientAttemptId);
        if (existingByClient) {
            if (String(existingByClient.request_hash || '') !== requestHash) {
                throw makeError(409, 'client_attempt_conflict', 'clientAttemptId 已绑定其他裂隙请求');
            }
            const existingRotation = await loadRotationById(connection, String(existingByClient.rotation_id || ''));
            if (!existingRotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
            const existingWorldState = await loadStateByRotation(connection, existingRotation.rotationId);
            if (String(existingByClient.status || '') === 'reserved' && !String(existingByClient.run_id || '')) {
                return { type: 'launch_reserved', rotation: existingRotation, worldState: existingWorldState, attemptId: String(existingByClient.attempt_id || '') };
            }
            if (!String(existingByClient.run_id || '')) {
                throw makeError(409, 'world_rift_attempt_terminal', '该次正式尝试已结束，不能重新发车');
            }
            return { type: 'resume_existing', rotation: existingRotation, worldState: existingWorldState, attempt: existingByClient };
        }
        const resumable = await loadResumableAttempt(connection, identity, transactionNow);
        if (resumable) {
            const resumableRotation = await loadRotationById(connection, String(resumable.rotation_id || ''));
            if (!resumableRotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
            const resumableWorldState = await loadStateByRotation(connection, resumableRotation.rotationId);
            if (String(resumable.status || '') === 'reserved' && !String(resumable.run_id || '')) {
                return { type: 'launch_reserved', rotation: resumableRotation, worldState: resumableWorldState, attemptId: String(resumable.attempt_id || '') };
            }
            return { type: 'resume_existing', rotation: resumableRotation, worldState: resumableWorldState, attempt: resumable };
        }
        if (request.rotationId !== rotation.rotationId) {
            throw makeError(409, 'rotation_not_current', '天穹裂隙轮换已更新，请刷新后重试');
        }
        if (rotationLifecycleState(rotation, transactionNow) !== 'active') {
            throw makeError(409, 'world_rift_start_window_closed', '该轮天穹裂隙已停止发车');
        }
        const usedAttempts = await countAttemptsUsed(connection, identity, rotation.rotationId);
        if (usedAttempts >= clampInt(rotation.attemptLimit, 1, ATTEMPT_LIMIT)) {
            throw makeError(409, 'no_attempts_remaining', '本轮正式出征次数已用尽');
        }
        const attemptIndex = usedAttempts + 1;
        const attemptId = deterministicId('riftattempt', [identity, rotation.rotationId, request.clientAttemptId]);
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
            clientRunId: deterministicId('riftrun', [attemptId, rotation.rotationId]),
            reservedAt: transactionNow
        };
        await dbRun(
            connection,
            `INSERT INTO world_rift_attempts
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
                transactionNow
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
        }, transactionNow);
        return { type: 'launch_reserved', rotation, worldState: currentWorldState, attemptId };
    });
    if (phase.type === 'mutation_replay') return phase.receipt;
    if (phase.type === 'launch_reserved') {
        const launched = await launchReservedAttempt(identity, phase.attemptId, nowProvider);
        const refreshedWorldState = await withReadConnection(async connection => loadStateByRotation(connection, phase.rotation.rotationId));
        const responseNow = nowProvider();
        const response = buildStartResponse(phase.rotation, refreshedWorldState || phase.worldState, launched.attempt, launched.run, responseNow);
        return persistMutationReceiptIfNeeded(identity, request.mutationId, requestHash, request, response, {
            rotationId: phase.rotation.rotationId,
            requestType: 'start',
            attemptId: launched.attempt.attempt_id,
            now: responseNow
        });
    }
    const responseNow = nowProvider();
    const syncedRun = await hydrateRun(identity, phase.attempt.run_id, responseNow);
    const response = buildStartResponse(phase.rotation, phase.worldState, phase.attempt, syncedRun, responseNow, {
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

async function submitWorldRiftContribution(userId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeSubmitRequest(rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const attempt = await loadAttemptByRunId(connection, identity, request.runId);
        if (!attempt) throw makeError(404, 'world_rift_attempt_not_found', '天穹裂隙尝试不存在');
        const rotation = await loadRotationById(connection, attempt.rotation_id);
        if (!rotation) throw makeError(503, 'world_rift_rotation_missing', '天穹裂隙轮换不存在');
        await ensureDirectiveCatalogBackfill(connection, rotation, transactionNow);
        const projection = await projectAttemptContribution(connection, attempt, transactionNow, 'submit');
        if (!projection.contribution) {
            throw makeError(409, 'authoritative_receipt_unavailable', '权威结算回执尚未生成，请先完成权威结算');
        }
        const entry = await loadEntry(connection, identity, rotation.rotationId);
        const directives = await buildDirectiveViews(connection, rotation, identity, transactionNow);
        const response = buildSubmitResponse(rotation, projection.state, projection.attempt, projection.contribution, entry, transactionNow, {
            idempotent: !projection.projected,
            directives,
            directiveDeltas: projection.directiveDeltas || []
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
            contributionId: projection.contribution.contribution_id,
            now: transactionNow
        });
        if (projection.projected && nowProvider() >= clampInt(rotation.graceEndsAt)) {
            throw makeError(409, 'world_rift_settlement_window_closed', '该轮天穹裂隙已停止写入贡献');
        }
        return response;
    });
}

async function claimWorldRiftReward(userId, milestoneId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeClaimRequest(milestoneId, rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const rotation = await loadRotationById(connection, request.rotationId);
        if (!rotation) throw makeError(404, 'world_rift_rotation_not_found', '天穹裂隙轮换不存在');
        if (transactionNow >= clampInt(rotation.claimEndsAt)) {
            throw makeError(409, 'world_rift_claim_window_closed', '该轮天穹裂隙领奖窗口已关闭');
        }
        await reconcileUserState(connection, identity, transactionNow);
        const worldState = await loadStateByRotation(connection, rotation.rotationId);
        const personalEntry = await loadEntry(connection, identity, rotation.rotationId);
        if (!personalEntry) throw makeError(409, 'world_rift_milestone_unmet', '当前轮换尚无有效裂隙贡献');
        const milestone = getRotationMilestones(rotation).find(entry => String(entry.milestoneId || '') === request.milestoneId);
        if (!milestone) throw makeError(404, 'world_rift_milestone_not_found', '天穹裂隙里程碑不存在');
        const claimMap = await loadMilestoneClaims(connection, identity, rotation.rotationId);
        const milestoneView = buildMilestoneView(rotation, buildWorldStateView(rotation, worldState, transactionNow), personalEntry, claimMap)
            .find(entry => String(entry.milestoneId || '') === request.milestoneId);
        if (!milestoneView || !milestoneView.claimed && !milestoneView.claimable) {
            throw makeError(409, 'world_rift_milestone_unmet', '当前里程碑尚未达成领奖条件');
        }
        const existingClaim = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_reward_claims
             WHERE user_id = ? AND rotation_id = ? AND milestone_id = ?`,
            [identity, rotation.rotationId, request.milestoneId]
        );
        if (!existingClaim) {
            const claimId = deterministicId('riftclaim', [identity, rotation.rotationId, request.milestoneId]);
            const ledgerEntryId = deterministicId('riftledger', [identity, rotation.rotationId, request.milestoneId, REWARD_CURRENCY]);
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
                    String(milestone.title || '天穹裂隙奖励'),
                    'world_rift_reward',
                    `world_rift:${rotation.rotationId}:${request.milestoneId}`,
                    REWARD_IMPACT,
                    stableStringify({
                        rotationId: rotation.rotationId,
                        milestoneId: request.milestoneId,
                        milestoneType: String(milestone.milestoneType || '')
                    }),
                    transactionNow
                ]
            );
            await dbRun(
                connection,
                `INSERT INTO world_rift_reward_claims
                    (claim_id, user_id, rotation_id, milestone_id, milestone_type, contribution_id, currency, amount,
                     reward_impact, ledger_entry_id, claim_payload_json, claimed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    claimId,
                    identity,
                    rotation.rotationId,
                    request.milestoneId,
                    String(milestone.milestoneType || ''),
                    '',
                    REWARD_CURRENCY,
                    amount,
                    REWARD_IMPACT,
                    ledgerEntryId,
                    stableStringify({
                        totalContribution: clampInt(personalEntry.total_contribution),
                        appliedDamage: clampInt(worldState && worldState.appliedDamage),
                        phaseUnlocks: normalizePhaseUnlocks(rotation, worldState && worldState.phaseUnlocks, worldState)
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
                    milestoneType: String(milestone.milestoneType || '')
                }
            }, transactionNow);
        }
        const claim = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_reward_claims
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
        const response = buildClaimResponse(rotation, claim, balance, transactionNow, {
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
        if (!existingClaim && nowProvider() >= clampInt(rotation.claimEndsAt)) {
            throw makeError(409, 'world_rift_claim_window_closed', '该轮天穹裂隙领奖窗口已关闭');
        }
        return response;
    });
}

async function claimWorldRiftDirective(userId, directiveId, rawRequest, nowInput) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const nowProvider = createNowProvider(nowInput);
    const request = normalizeDirectiveClaimRequest(directiveId, rawRequest);
    const requestHash = hashCanonical(request);
    return withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const replay = await ensureMutationAvailable(connection, identity, request.mutationId, requestHash);
        if (replay) return replay;
        const rotation = await loadRotationById(connection, request.rotationId);
        if (!rotation) throw makeError(404, 'world_rift_rotation_not_found', '天穹裂隙轮换不存在');
        if (transactionNow >= clampInt(rotation.claimEndsAt)) {
            throw makeError(409, 'world_rift_claim_window_closed', '该轮天穹裂隙领奖窗口已关闭');
        }
        const directive = getRotationDirectives(rotation)
            .find(entry => String(entry.directiveId || '') === request.directiveId);
        if (!directive) throw makeError(404, 'world_rift_directive_not_found', '天穹裂隙战役指令不存在');
        await ensureDirectiveCatalogBackfill(connection, rotation, transactionNow);
        await reconcileUserState(connection, identity, transactionNow);
        const personalEntry = await loadEntry(connection, identity, rotation.rotationId);
        if (clampInt(personalEntry && personalEntry.completed_attempts) <= 0) {
            throw makeError(409, 'world_rift_directive_unmet', '当前轮换尚无有效裂隙贡献');
        }
        const squadContribution = await loadUserSquadContribution(connection, identity, rotation.rotationId);
        const squadId = String(squadContribution && squadContribution.squad_id || '');
        if (String(directive.scope || '') === 'squad' && !squadId) {
            throw makeError(409, 'world_rift_directive_unmet', '本轮未留下可领取的小队贡献');
        }
        const owner = makeDirectiveOwner(directive, identity, rotation.rotationId, squadId);
        if (!owner) throw makeError(409, 'world_rift_directive_unmet', '战役指令尚未建立可领取进度');
        const state = await loadDirectiveState(
            connection,
            rotation.rotationId,
            request.directiveId,
            owner.ownerType,
            owner.ownerId
        );
        if (!state || (clampInt(state.completed_at) <= 0 && clampInt(state.progress_value) < clampInt(directive.targetValue, 1))) {
            throw makeError(409, 'world_rift_directive_unmet', '当前战役指令尚未完成');
        }
        const existingClaim = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_directive_claims
             WHERE user_id = ? AND rotation_id = ? AND directive_id = ?`,
            [identity, rotation.rotationId, request.directiveId]
        );
        if (!existingClaim) {
            const claimId = deterministicId('riftdirectiveclaim', [identity, rotation.rotationId, request.directiveId]);
            const ledgerEntryId = deterministicId('riftdirectiveledger', [identity, rotation.rotationId, request.directiveId, REWARD_CURRENCY]);
            const amount = clampInt(directive.reward && directive.reward.amount);
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
                    String(directive.title || '天穹裂隙战役指令'),
                    'world_rift_directive',
                    `world_rift_directive:${rotation.rotationId}:${request.directiveId}`,
                    REWARD_IMPACT,
                    stableStringify({
                        rotationId: rotation.rotationId,
                        directiveId: request.directiveId,
                        scope: String(directive.scope || ''),
                        progress: clampInt(state.progress_value),
                        target: clampInt(directive.targetValue, 1)
                    }),
                    transactionNow
                ]
            );
            await dbRun(
                connection,
                `INSERT INTO world_rift_directive_claims
                    (claim_id, user_id, rotation_id, directive_id, scope, owner_type, owner_id, contribution_id,
                     currency, amount, reward_impact, ledger_entry_id, claim_payload_json, claimed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    claimId,
                    identity,
                    rotation.rotationId,
                    request.directiveId,
                    String(directive.scope || ''),
                    owner.ownerType,
                    owner.ownerId,
                    String(squadContribution && squadContribution.contribution_id || ''),
                    REWARD_CURRENCY,
                    amount,
                    REWARD_IMPACT,
                    ledgerEntryId,
                    stableStringify({
                        progress: clampInt(state.progress_value),
                        target: clampInt(directive.targetValue, 1),
                        stateVersion: clampInt(state.state_version)
                    }),
                    transactionNow
                ]
            );
            await recordOpsEvent(connection, 'directive_reward_claimed', {
                rotationId: rotation.rotationId,
                accountRef: makeAccountRef(identity),
                resultCode: 'ok',
                value: amount,
                detail: {
                    directiveId: request.directiveId,
                    scope: String(directive.scope || '')
                }
            }, transactionNow);
        }
        const claim = await dbGet(
            connection,
            `SELECT *
             FROM world_rift_directive_claims
             WHERE user_id = ? AND rotation_id = ? AND directive_id = ?`,
            [identity, rotation.rotationId, request.directiveId]
        );
        const balance = await dbGet(
            connection,
            `SELECT *
             FROM progression_economy_balances
             WHERE user_id = ? AND currency = ?`,
            [identity, REWARD_CURRENCY]
        );
        const directives = await buildDirectiveViews(connection, rotation, identity, transactionNow, squadId);
        const directiveView = directives.find(entry => entry.directiveId === request.directiveId) || null;
        const response = buildDirectiveClaimResponse(
            rotation,
            claim,
            directiveView,
            directives,
            balance,
            transactionNow,
            { alreadyClaimed: !!existingClaim }
        );
        await storeMutationReceipt(connection, {
            userId: identity,
            mutationId: request.mutationId,
            rotationId: rotation.rotationId,
            requestType: 'directive_claim',
            requestHash,
            requestBody: request,
            receipt: response,
            claimId: String(claim.claim_id || ''),
            now: transactionNow
        });
        if (!existingClaim && nowProvider() >= clampInt(rotation.claimEndsAt)) {
            throw makeError(409, 'world_rift_claim_window_closed', '该轮天穹裂隙领奖窗口已关闭');
        }
        return response;
    });
}

async function replayWorldRiftDirectiveContribution(rawRequest, nowInput) {
    const request = normalizeDirectiveReplayRequest(rawRequest);
    const nowProvider = createNowProvider(nowInput);
    return withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const rotation = await loadRotationById(connection, request.rotationId);
        if (!rotation) throw makeError(404, 'world_rift_rotation_not_found', '天穹裂隙轮换不存在');
        const contribution = await loadContributionById(connection, request.contributionId);
        if (!contribution || String(contribution.rotation_id || '') !== rotation.rotationId) {
            throw makeError(404, 'world_rift_contribution_not_found', '天穹裂隙贡献不存在');
        }
        const squadId = await loadContributionSquadId(connection, contribution.contribution_id);
        const deltas = await projectContributionDirectives(
            connection,
            rotation,
            contribution,
            squadId,
            clampInt(contribution.submitted_at || transactionNow)
        );
        await recordOpsEvent(connection, 'directive_contribution_replayed', {
            rotationId: rotation.rotationId,
            accountRef: makeAccountRef(contribution.user_id),
            resultCode: 'ok',
            value: deltas.filter(entry => entry.projected).length,
            detail: {
                contributionId: contribution.contribution_id,
                projected: deltas.filter(entry => entry.projected).length,
                alreadyPresent: deltas.filter(entry => !entry.projected).length
            }
        }, transactionNow);
        return {
            success: true,
            reportVersion: `${OPS_REPORT_VERSION}-directive-replay`,
            rotationId: rotation.rotationId,
            contributionId: contribution.contribution_id,
            deltas
        };
    });
}

async function reconcileWorldRiftDirectives(rawRequest, nowInput) {
    const request = normalizeDirectiveReconcileRequest(rawRequest);
    const nowProvider = createNowProvider(nowInput);
    return withWriteTransaction(async connection => {
        const transactionNow = nowProvider();
        await ensureWorldRiftSchema(connection, transactionNow);
        const rotation = await loadRotationById(connection, request.rotationId);
        if (!rotation) throw makeError(404, 'world_rift_rotation_not_found', '天穹裂隙轮换不存在');
        const contributions = await dbAll(
            connection,
            `SELECT *
             FROM world_rift_contributions
             WHERE rotation_id = ?
             ORDER BY submitted_at ASC, contribution_id ASC`,
            [rotation.rotationId]
        );
        await dbRun(connection, `DELETE FROM world_rift_directive_projections WHERE rotation_id = ?`, [rotation.rotationId]);
        await dbRun(connection, `DELETE FROM world_rift_directive_states WHERE rotation_id = ?`, [rotation.rotationId]);
        let projectionCount = 0;
        let positiveDeltaCount = 0;
        for (const contribution of contributions) {
            const squadId = await loadContributionSquadId(connection, contribution.contribution_id);
            const deltas = await projectContributionDirectives(
                connection,
                rotation,
                contribution,
                squadId,
                clampInt(contribution.submitted_at || transactionNow)
            );
            projectionCount += deltas.length;
            positiveDeltaCount += deltas.filter(entry => entry.delta > 0).length;
        }
        const stateRows = await dbAll(
            connection,
            `SELECT scope, COUNT(*) AS owners,
                    SUM(CASE WHEN completed_at > 0 OR progress_value >= target_value THEN 1 ELSE 0 END) AS completed
             FROM world_rift_directive_states
             WHERE rotation_id = ?
             GROUP BY scope`,
            [rotation.rotationId]
        );
        const claimRow = await dbGet(
            connection,
            `SELECT COUNT(*) AS count
             FROM world_rift_directive_claims
             WHERE rotation_id = ?`,
            [rotation.rotationId]
        );
        await recordOpsEvent(connection, 'directives_reconciled', {
            rotationId: rotation.rotationId,
            resultCode: 'ok',
            value: projectionCount,
            detail: {
                contributions: contributions.length,
                projections: projectionCount,
                positiveDeltas: positiveDeltaCount,
                preservedClaims: clampInt(claimRow && claimRow.count)
            }
        }, transactionNow);
        return {
            success: true,
            reportVersion: `${OPS_REPORT_VERSION}-directive-reconcile`,
            rotationId: rotation.rotationId,
            contributions: contributions.length,
            projections: projectionCount,
            positiveDeltas: positiveDeltaCount,
            preservedClaims: clampInt(claimRow && claimRow.count),
            states: stateRows.map(row => ({
                scope: String(row.scope || ''),
                owners: clampInt(row.owners),
                completed: clampInt(row.completed)
            }))
        };
    });
}

async function getWorldRiftOpsOverview(now = Date.now()) {
    return withReadConnection(async connection => {
        await ensureWorldRiftSchema(connection, now);
        const currentRotation = await loadCurrentRotation(connection, now);
        const currentWorldState = currentRotation ? await loadStateByRotation(connection, currentRotation.rotationId) : null;
        const [totals, attemptStates, counterRows] = await Promise.all([
            dbGet(
                connection,
                `SELECT
                    (SELECT COUNT(*) FROM world_rift_rotations) AS rotations,
                    (SELECT COUNT(*) FROM world_rift_attempts) AS attempts,
                    (SELECT COUNT(DISTINCT user_id) FROM world_rift_attempts) AS players,
                    (SELECT COUNT(*) FROM world_rift_contributions) AS contributions,
                    (SELECT COUNT(*) FROM world_rift_reward_claims) AS claims,
                    (SELECT COUNT(*) FROM world_rift_directive_projections) AS directive_projections,
                    (SELECT COUNT(*) FROM world_rift_directive_claims) AS directive_claims`,
                []
            ),
            dbAll(
                connection,
                `SELECT status, COUNT(*) AS count
                 FROM world_rift_attempts
                 GROUP BY status`,
                []
            ),
            dbAll(
                connection,
                `SELECT event_type, rotation_id, result_code, event_count, total_value, updated_at
                 FROM world_rift_ops_counters
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
            currentWorld: currentRotation ? buildWorldStateView(currentRotation, currentWorldState, now) : null,
            totals: {
                rotations: clampInt(totals && totals.rotations),
                attempts: clampInt(totals && totals.attempts),
                players: clampInt(totals && totals.players),
                contributions: clampInt(totals && totals.contributions),
                claims: clampInt(totals && totals.claims),
                directiveProjections: clampInt(totals && totals.directive_projections),
                directiveClaims: clampInt(totals && totals.directive_claims)
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
    claimWorldRiftDirective,
    claimWorldRiftReward,
    getCurrentWorldRift,
    getWorldRiftOpsOverview,
    reconcileWorldRiftDirectives,
    replayWorldRiftDirectiveContribution,
    startWorldRiftAttempt,
    submitWorldRiftContribution
};
