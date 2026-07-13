const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../db/database');
const {
    FOUNDATION_REWARD_AMOUNT,
    FOUNDATION_REWARD_ID,
    FOUNDATION_THRESHOLD,
    GRADE_DEFINITIONS,
    POWER_IMPACT,
    PROTOCOL_VERSION,
    REPORT_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    SLOT_DEFINITIONS,
    SLOT_MODE_SET,
    WEEK_MS,
    buildCycleSnapshotForTime,
    buildCycleSnapshotFromId,
    clampInt,
    getArchiveGrade,
    getCycleState,
    hashValue,
    stableStringify
} = require('./catalog');
const {
    buildSnapshotFromCycleId,
    ensureCycleRow,
    bootstrapWeeklyArchiveSchema
} = require('./bootstrap');

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const CURRENT_REPORT_VERSION = `${REPORT_VERSION}-current-v1`;
const CLAIM_REPORT_VERSION = `${REPORT_VERSION}-claim-v1`;
const OPS_REPORT_VERSION = `${REPORT_VERSION}-ops-overview-v1`;

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
                console.error('[WeeklyArchive] Read rollback failed:', rollbackError);
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
            console.error('[WeeklyArchive] Write rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        await closeDb(connection);
        releaseQueue();
    }
}

function safeId(value) {
    const text = String(value || '').trim();
    return SAFE_ID.test(text) ? text : '';
}

function parseJsonObject(value) {
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
        return {};
    }
}

function deterministicId(prefix, parts) {
    return `${prefix}-${crypto.createHash('sha256').update(parts.join('|'), 'utf8').digest('hex').slice(0, 32)}`;
}

function makeError(statusCode, reason, message, extra = null) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.reason = reason;
    if (extra && typeof extra === 'object') Object.assign(error, extra);
    return error;
}

function makeMutationConflictError() {
    return makeError(409, 'mutation_reused', 'mutationId 已被其他请求占用');
}

function maskRef(scope, rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return '';
    return hashValue({ scope, value: text }).slice(0, 24);
}

function summarizePvpProof(proof) {
    if (proof.didWin === true) return 'official_win';
    if (proof.didWin === false) return 'official_loss_or_draw';
    return 'official_completed';
}

function summarizeProof(slot, proof) {
    const summary = {};
    const runId = safeId(proof.runId);
    if (runId) summary.runRef = maskRef(`${slot.mode}:run`, runId);
    if (slot.mode === 'pvp_live') {
        summary.outcome = summarizePvpProof(proof);
    }
    if (slot.mode === 'fate_chronicle' && proof.summary && typeof proof.summary === 'object') {
        const chapterIndex = clampInt(proof.summary.chapterIndex, 0, 3);
        if (chapterIndex > 0) summary.chapterIndex = chapterIndex;
    }
    if (proof.rotationId) summary.rotationRef = maskRef(`${slot.mode}:rotation`, proof.rotationId);
    if (proof.sessionId) summary.sessionRef = maskRef(`${slot.mode}:session`, proof.sessionId);
    if (proof.receiptId) summary.receiptRef = maskRef(`${slot.mode}:receipt`, proof.receiptId);
    return summary;
}

function summarizeCycle(snapshot, now) {
    const state = getCycleState(snapshot, now);
    return {
        cycleId: snapshot.cycleId,
        title: snapshot.title,
        startsAt: snapshot.startsAt,
        endsAt: snapshot.endsAt,
        claimEndsAt: snapshot.claimEndsAt,
        state: state.state,
        isActive: !!state.isActive,
        isGrace: !!state.isGrace,
        isExpired: !!state.isExpired,
        rewardCurrency: snapshot.rewardCurrency,
        rewardImpact: snapshot.rewardImpact,
        powerImpact: snapshot.powerImpact
    };
}

function buildEmptySlot(slot) {
    return {
        slotId: slot.slotId,
        mode: slot.mode,
        title: slot.title,
        evidenceLabel: slot.evidenceLabel,
        earned: false,
        earnedAt: 0,
        evidence: null
    };
}

function buildEarnedSlot(slot, row) {
    const proof = parseJsonObject(row.proof_json);
    const earnedAt = clampInt(row.occurred_at || row.received_at);
    return {
        slotId: slot.slotId,
        mode: slot.mode,
        title: slot.title,
        evidenceLabel: slot.evidenceLabel,
        earned: true,
        earnedAt,
        evidence: {
            sourceKind: String(row.source_kind || ''),
            trustTier: String(row.trust_tier || ''),
            sourceRef: maskRef(`${slot.mode}:source`, row.source_ref),
            eventRef: maskRef(`${slot.mode}:event`, row.event_id),
            occurredAt: earnedAt,
            receivedAt: clampInt(row.received_at),
            proof: summarizeProof(slot, proof)
        }
    };
}

async function ensureCycleSnapshot(connection, cycleId, now = Date.now()) {
    const snapshot = buildSnapshotFromCycleId(cycleId);
    if (!snapshot) throw makeError(404, 'cycle_not_found', '归卷周期不存在');
    await ensureCycleRow(connection, snapshot, now);
    return snapshot;
}

async function getStoredMutation(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT cycle_id, request_hash, receipt_json
         FROM weekly_archive_mutations
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function ensureMutationAvailable(connection, userId, mutationId, requestHash) {
    const row = await getStoredMutation(connection, userId, mutationId);
    if (!row) return null;
    if (String(row.request_hash || '') === requestHash) {
        try {
            return JSON.parse(String(row.receipt_json || '{}'));
        } catch (error) {
            throw makeError(500, 'weekly_archive_corrupt_mutation_receipt', '归卷幂等回执损坏');
        }
    }
    throw makeMutationConflictError();
}

async function storeMutationReceipt(connection, {
    userId,
    mutationId,
    cycleId,
    requestType,
    requestHash,
    requestBody,
    claimId,
    receipt,
    now
}) {
    await dbRun(
        connection,
        `INSERT INTO weekly_archive_mutations
            (user_id, mutation_id, cycle_id, request_type, request_hash, request_body_json, claim_id, receipt_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            mutationId,
            cycleId,
            requestType,
            requestHash,
            stableStringify(requestBody),
            claimId || '',
            JSON.stringify(receipt),
            now
        ]
    );
}

async function ensureWalletRow(connection, userId, now = Date.now()) {
    await dbRun(
        connection,
        `INSERT OR IGNORE INTO progression_economy_balances
            (user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at)
         VALUES (?, ?, 0, 0, 0, ?)`,
        [userId, REWARD_CURRENCY, now]
    );
}

async function getWalletRow(connection, userId) {
    const row = await dbGet(
        connection,
        `SELECT currency, balance, lifetime_earned, lifetime_spent, updated_at
         FROM progression_economy_balances
         WHERE user_id = ? AND currency = ?`,
        [userId, REWARD_CURRENCY]
    );
    return {
        currency: REWARD_CURRENCY,
        balance: clampInt(row && row.balance),
        lifetimeEarned: clampInt(row && row.lifetime_earned),
        lifetimeSpent: clampInt(row && row.lifetime_spent),
        updatedAt: clampInt(row && row.updated_at),
        spendPolicy: 'cosmetic_only'
    };
}

function normalizeWallet(wallet) {
    return {
        currency: REWARD_CURRENCY,
        balance: clampInt(wallet && wallet.balance),
        lifetimeEarned: clampInt(wallet && wallet.lifetimeEarned),
        lifetimeSpent: clampInt(wallet && wallet.lifetimeSpent),
        updatedAt: clampInt(wallet && wallet.updatedAt),
        spendPolicy: 'cosmetic_only'
    };
}

async function loadFoundationClaim(connection, userId, cycleId) {
    return dbGet(
        connection,
        `SELECT claim_id, cycle_id, reward_id, grade_id, mutation_id, request_hash, ledger_entry_id,
                amount, currency, reward_impact, power_impact, proof_count, grade_display_level,
                receipt_json, claimed_at
         FROM weekly_archive_reward_claims
         WHERE user_id = ? AND cycle_id = ? AND reward_id = ?`,
        [userId, cycleId, FOUNDATION_REWARD_ID]
    );
}

async function queryProofRows(connection, userId, cycleSnapshot) {
    const modeParams = SLOT_DEFINITIONS.map(slot => slot.mode);
    return dbAll(
        connection,
        `SELECT event_id, activity_mode, source_kind, trust_tier, source_ref, proof_json, occurred_at, received_at
         FROM progression_events
         WHERE user_id = ?
           AND trust_tier = 'server_authoritative'
           AND activity_completions > 0
           AND occurred_at >= ?
           AND occurred_at < ?
           AND activity_mode IN (${modeParams.map(() => '?').join(', ')})
         ORDER BY occurred_at ASC, received_at ASC, event_id ASC`,
        [userId, cycleSnapshot.startsAt, cycleSnapshot.endsAt].concat(modeParams)
    );
}

async function computeArchiveSnapshot(connection, userId, cycleSnapshot, now = Date.now()) {
    const rows = await queryProofRows(connection, userId, cycleSnapshot);
    const firstRowByMode = new Map();
    for (const row of rows) {
        const mode = String(row.activity_mode || '');
        if (!SLOT_MODE_SET.has(mode)) continue;
        if (!firstRowByMode.has(mode)) firstRowByMode.set(mode, row);
    }
    const slots = SLOT_DEFINITIONS.map(slot => {
        const row = firstRowByMode.get(slot.mode);
        return row ? buildEarnedSlot(slot, row) : buildEmptySlot(slot);
    });
    const earnedCount = slots.reduce((count, slot) => count + (slot.earned ? 1 : 0), 0);
    const grade = getArchiveGrade(earnedCount);
    const claimRow = await loadFoundationClaim(connection, userId, cycleSnapshot.cycleId);
    const cycle = summarizeCycle(cycleSnapshot, now);
    const claimWindowOpen = cycle.state === 'active' || cycle.state === 'grace';
    return {
        cycle,
        slots,
        earnedCount,
        grade: {
            gradeId: grade.gradeId,
            title: grade.title,
            proofCount: earnedCount,
            totalProofs: SLOT_DEFINITIONS.length,
            displayLevel: clampInt(grade.displayLevel),
            rewardEligible: earnedCount >= FOUNDATION_THRESHOLD,
            rewardAmount: earnedCount >= FOUNDATION_THRESHOLD ? FOUNDATION_REWARD_AMOUNT : 0,
            rewardCurrency: REWARD_CURRENCY,
            rewardImpact: REWARD_IMPACT
        },
        claim: {
            rewardId: FOUNDATION_REWARD_ID,
            threshold: FOUNDATION_THRESHOLD,
            amount: FOUNDATION_REWARD_AMOUNT,
            currency: REWARD_CURRENCY,
            rewardImpact: REWARD_IMPACT,
            powerImpact: POWER_IMPACT,
            claimWindowOpen,
            claimable: claimWindowOpen && earnedCount >= FOUNDATION_THRESHOLD && !claimRow,
            claimed: !!claimRow,
            claimedAt: clampInt(claimRow && claimRow.claimed_at),
            gradeAtClaim: String(claimRow && claimRow.grade_id || ''),
            proofCountAtClaim: clampInt(claimRow && claimRow.proof_count),
            ledgerEntryId: maskRef('weekly_archive:ledger', claimRow && claimRow.ledger_entry_id),
            claimRef: maskRef('weekly_archive:claim', claimRow && claimRow.claim_id)
        }
    };
}

function buildFoundationClaimView(archive) {
    return {
        rewardId: FOUNDATION_REWARD_ID,
        threshold: FOUNDATION_THRESHOLD,
        amount: FOUNDATION_REWARD_AMOUNT,
        currency: REWARD_CURRENCY,
        rewardImpact: REWARD_IMPACT,
        powerImpact: POWER_IMPACT,
        activeCycle: {
            cycleId: archive.cycle.cycleId,
            state: archive.cycle.state,
            claimWindowOpen: archive.claim.claimWindowOpen,
            claimable: archive.claim.claimable,
            claimed: archive.claim.claimed,
            claimedAt: archive.claim.claimedAt,
            gradeAtClaim: archive.claim.gradeAtClaim,
            proofCountAtClaim: archive.claim.proofCountAtClaim
        }
    };
}

function assertAllowedKeys(source, allowed, reason = 'invalid_request_payload') {
    const unknown = Object.keys(source).filter(key => !allowed.includes(key));
    if (unknown.length > 0) {
        throw makeError(400, reason, `请求包含不允许字段: ${unknown[0]}`);
    }
}

function normalizeClaimRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    assertAllowedKeys(source, ['mutationId', 'cycleId', 'protocolVersion']);
    const mutationId = safeId(source.mutationId);
    const cycleId = String(source.cycleId || '').trim();
    const protocolVersion = String(source.protocolVersion || '').trim();
    if (!mutationId) throw makeError(400, 'invalid_mutation_id', 'mutationId 无效');
    if (!buildCycleSnapshotFromId(cycleId)) throw makeError(400, 'invalid_cycle_id', 'cycleId 无效');
    if (protocolVersion !== PROTOCOL_VERSION) {
        throw makeError(409, 'unsupported_protocol_version', '归卷协议版本不匹配');
    }
    return { mutationId, cycleId, protocolVersion };
}

async function recordOpsEvent(connection, eventType, {
    cycleId = '',
    gradeId = '',
    resultCode = 'ok',
    value = 0,
    detail = null
} = {}) {
    const now = Date.now();
    await dbRun(
        connection,
        `INSERT INTO weekly_archive_ops_events
            (event_id, event_type, cycle_id, grade_id, result_code, value, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            deterministicId('weekly-archive-event', [eventType, cycleId, gradeId, resultCode, String(now), String(Math.random())]),
            eventType,
            String(cycleId || ''),
            String(gradeId || ''),
            String(resultCode || 'ok'),
            clampInt(value),
            JSON.stringify(detail || {}),
            now
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO weekly_archive_ops_counters
            (event_type, cycle_id, grade_id, result_code, event_count, total_value, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(event_type, cycle_id, grade_id, result_code) DO UPDATE SET
            event_count = weekly_archive_ops_counters.event_count + 1,
            total_value = weekly_archive_ops_counters.total_value + excluded.total_value,
            updated_at = excluded.updated_at`,
        [eventType, String(cycleId || ''), String(gradeId || ''), String(resultCode || 'ok'), clampInt(value), now]
    );
}

function buildOpsDetail({ userId = '', mutationId = '', proofCount = 0, claimId = '', ledgerEntryId = '' } = {}) {
    return {
        accountRef: maskRef('weekly_archive:account', userId),
        mutationRef: maskRef('weekly_archive:mutation', mutationId),
        claimRef: maskRef('weekly_archive:claim', claimId),
        ledgerRef: maskRef('weekly_archive:ledger', ledgerEntryId),
        proofCount: clampInt(proofCount, 0, SLOT_DEFINITIONS.length)
    };
}

async function recordDetachedOpsEvent(eventType, details) {
    try {
        await withWriteTransaction(async connection => {
            await bootstrapWeeklyArchiveSchema(connection, Date.now());
            await recordOpsEvent(connection, eventType, details);
        });
    } catch (error) {
        console.error('[WeeklyArchive] Failed to write detached ops event:', error);
    }
}

function buildClaimReceipt({
    cycleSnapshot,
    archive,
    claimId,
    claimedAt,
    ledgerEntryId,
    wallet,
    alreadyClaimed = false,
    idempotent = false
}) {
    return {
        success: true,
        reportVersion: CLAIM_REPORT_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        cycle: archive.cycle,
        grade: archive.grade,
        reward: {
            rewardId: FOUNDATION_REWARD_ID,
            currency: REWARD_CURRENCY,
            amount: FOUNDATION_REWARD_AMOUNT,
            rewardImpact: REWARD_IMPACT,
            powerImpact: POWER_IMPACT
        },
        claim: {
            claimId,
            cycleId: cycleSnapshot.cycleId,
            rewardId: FOUNDATION_REWARD_ID,
            gradeId: archive.grade.gradeId,
            proofCount: archive.earnedCount,
            claimedAt,
            alreadyClaimed: !!alreadyClaimed,
            idempotent: !!idempotent,
            ledgerEntryId,
            claimWindowOpen: archive.claim.claimWindowOpen
        },
        wallet: normalizeWallet(wallet),
        slots: archive.slots
    };
}

async function getCurrentWeeklyArchive(userId, { now = Date.now() } = {}) {
    await withWriteTransaction(connection => bootstrapWeeklyArchiveSchema(connection, now));
    return withReadConnection(async connection => {
        const currentSnapshot = buildCycleSnapshotForTime(now);
        const previousSnapshot = buildCycleSnapshotForTime(now - WEEK_MS);
        const currentArchive = await computeArchiveSnapshot(connection, userId, currentSnapshot, now);
        const previousState = getCycleState(previousSnapshot, now);
        const carryoverArchive = previousState.isGrace
            ? await computeArchiveSnapshot(connection, userId, previousSnapshot, now)
            : null;
        return {
            success: true,
            reportVersion: CURRENT_REPORT_VERSION,
            protocolVersion: PROTOCOL_VERSION,
            generatedAt: clampInt(now),
            cycle: currentArchive.cycle,
            grade: currentArchive.grade,
            slots: currentArchive.slots,
            claim: {
                rewardId: FOUNDATION_REWARD_ID,
                threshold: FOUNDATION_THRESHOLD,
                amount: FOUNDATION_REWARD_AMOUNT,
                currency: REWARD_CURRENCY,
                rewardImpact: REWARD_IMPACT,
                powerImpact: POWER_IMPACT,
                activeCycle: buildFoundationClaimView(currentArchive).activeCycle,
                carryoverCycle: carryoverArchive ? {
                    cycleId: carryoverArchive.cycle.cycleId,
                    state: carryoverArchive.cycle.state,
                    claimWindowOpen: carryoverArchive.claim.claimWindowOpen,
                    claimable: carryoverArchive.claim.claimable,
                    claimed: carryoverArchive.claim.claimed,
                    claimedAt: carryoverArchive.claim.claimedAt,
                    gradeAtClaim: carryoverArchive.claim.gradeAtClaim,
                    proofCountAtClaim: carryoverArchive.claim.proofCountAtClaim
                } : null
            }
        };
    }, { transaction: true });
}

async function claimWeeklyArchiveFoundation(userId, rawRequest) {
    const request = normalizeClaimRequest(rawRequest);
    const requestHash = hashValue(request);
    const now = Date.now();
    try {
        return await withWriteTransaction(async connection => {
            await bootstrapWeeklyArchiveSchema(connection, now, { extraCycleIds: [request.cycleId] });
            const idempotentReceipt = await ensureMutationAvailable(connection, userId, request.mutationId, requestHash);
            if (idempotentReceipt) return idempotentReceipt;

            const cycleSnapshot = await ensureCycleSnapshot(connection, request.cycleId, now);
            const cycleState = getCycleState(cycleSnapshot, now);
            if (!cycleState.isActive && !cycleState.isGrace) {
                throw makeError(409, 'claim_window_closed', '该归卷周期已停止领奖');
            }

            const archive = await computeArchiveSnapshot(connection, userId, cycleSnapshot, now);
            if (archive.earnedCount < FOUNDATION_THRESHOLD) {
                throw makeError(409, 'foundation_not_ready', '当前凭证不足，不能领取基础归卷奖励');
            }

            const existingClaim = await loadFoundationClaim(connection, userId, request.cycleId);
            if (existingClaim) {
                const wallet = await getWalletRow(connection, userId);
                let receipt;
                try {
                    receipt = JSON.parse(String(existingClaim.receipt_json || '{}'));
                } catch (error) {
                    receipt = buildClaimReceipt({
                        cycleSnapshot,
                        archive,
                        claimId: String(existingClaim.claim_id || ''),
                        claimedAt: clampInt(existingClaim.claimed_at),
                        ledgerEntryId: String(existingClaim.ledger_entry_id || ''),
                        wallet,
                        alreadyClaimed: true,
                        idempotent: false
                    });
                }
                if (String(receipt.reportVersion || '') !== CLAIM_REPORT_VERSION) {
                    receipt = buildClaimReceipt({
                        cycleSnapshot,
                        archive,
                        claimId: String(existingClaim.claim_id || ''),
                        claimedAt: clampInt(existingClaim.claimed_at),
                        ledgerEntryId: String(existingClaim.ledger_entry_id || ''),
                        wallet,
                        alreadyClaimed: true,
                        idempotent: false
                    });
                } else {
                    receipt.claim = {
                        ...receipt.claim,
                        alreadyClaimed: true,
                        idempotent: false
                    };
                }
                await storeMutationReceipt(connection, {
                    userId,
                    mutationId: request.mutationId,
                    cycleId: request.cycleId,
                    requestType: 'claim_foundation',
                    requestHash,
                    requestBody: request,
                    claimId: String(existingClaim.claim_id || ''),
                    receipt,
                    now
                });
                await recordOpsEvent(connection, 'foundation_claim', {
                    cycleId: request.cycleId,
                    gradeId: archive.grade.gradeId,
                    resultCode: 'already_claimed',
                    value: 0,
                    detail: buildOpsDetail({
                        userId,
                        mutationId: request.mutationId,
                        proofCount: archive.earnedCount,
                        claimId: existingClaim.claim_id,
                        ledgerEntryId: existingClaim.ledger_entry_id
                    })
                });
                return receipt;
            }

            await ensureWalletRow(connection, userId, now);
            await dbRun(
                connection,
                `INSERT INTO progression_economy_balances
                    (user_id, currency, balance, lifetime_earned, lifetime_spent, updated_at)
                 VALUES (?, ?, ?, ?, 0, ?)
                 ON CONFLICT(user_id, currency) DO UPDATE SET
                    balance = progression_economy_balances.balance + excluded.balance,
                    lifetime_earned = progression_economy_balances.lifetime_earned + excluded.lifetime_earned,
                    updated_at = excluded.updated_at`,
                [userId, REWARD_CURRENCY, FOUNDATION_REWARD_AMOUNT, FOUNDATION_REWARD_AMOUNT, now]
            );
            const wallet = await getWalletRow(connection, userId);
            const claimId = deterministicId('weekly-archive-claim', [userId, request.cycleId, FOUNDATION_REWARD_ID]);
            const ledgerEntryId = deterministicId('weekly-archive-ledger', [userId, request.cycleId, FOUNDATION_REWARD_ID]);
            await dbRun(
                connection,
                `INSERT INTO progression_economy_ledger
                    (entry_id, user_id, currency, delta, balance_after, reason, source_type, source_id,
                     reward_impact, metadata_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ledgerEntryId,
                    userId,
                    REWARD_CURRENCY,
                    FOUNDATION_REWARD_AMOUNT,
                    clampInt(wallet.balance),
                    '三证归卷',
                    'weekly_archive_reward',
                    `weekly_archive:${request.cycleId}:${FOUNDATION_REWARD_ID}`,
                    REWARD_IMPACT,
                    JSON.stringify({
                        protocolVersion: PROTOCOL_VERSION,
                        rewardId: FOUNDATION_REWARD_ID,
                        cycleId: request.cycleId,
                        gradeId: archive.grade.gradeId,
                        proofCount: archive.earnedCount
                    }),
                    now
                ]
            );

            const receipt = buildClaimReceipt({
                cycleSnapshot,
                archive,
                claimId,
                claimedAt: now,
                ledgerEntryId,
                wallet,
                alreadyClaimed: false,
                idempotent: false
            });

            await dbRun(
                connection,
                `INSERT INTO weekly_archive_reward_claims
                    (claim_id, user_id, cycle_id, reward_id, grade_id, mutation_id, request_hash, ledger_entry_id,
                     amount, currency, reward_impact, power_impact, proof_count, grade_display_level, receipt_json, claimed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    claimId,
                    userId,
                    request.cycleId,
                    FOUNDATION_REWARD_ID,
                    archive.grade.gradeId,
                    request.mutationId,
                    requestHash,
                    ledgerEntryId,
                    FOUNDATION_REWARD_AMOUNT,
                    REWARD_CURRENCY,
                    REWARD_IMPACT,
                    POWER_IMPACT,
                    archive.earnedCount,
                    clampInt(archive.grade.displayLevel),
                    JSON.stringify(receipt),
                    now
                ]
            );
            await storeMutationReceipt(connection, {
                userId,
                mutationId: request.mutationId,
                cycleId: request.cycleId,
                requestType: 'claim_foundation',
                requestHash,
                requestBody: request,
                claimId,
                receipt,
                now
            });
            await recordOpsEvent(connection, 'foundation_claim', {
                cycleId: request.cycleId,
                gradeId: archive.grade.gradeId,
                resultCode: 'granted',
                value: FOUNDATION_REWARD_AMOUNT,
                detail: buildOpsDetail({
                    userId,
                    mutationId: request.mutationId,
                    proofCount: archive.earnedCount,
                    claimId,
                    ledgerEntryId
                })
            });
            return receipt;
        });
    } catch (error) {
        await recordDetachedOpsEvent('foundation_claim', {
            cycleId: request.cycleId,
            gradeId: '',
            resultCode: error && error.reason || 'claim_failed',
            value: 0,
            detail: buildOpsDetail({
                userId,
                mutationId: request.mutationId
            })
        });
        throw error;
    }
}

async function getWeeklyArchiveOpsOverview(now = Date.now()) {
    await withWriteTransaction(connection => bootstrapWeeklyArchiveSchema(connection, now));
    return withReadConnection(async connection => {
        const currentCycle = buildCycleSnapshotForTime(now);
        const [totals, counterRows, recentRows] = await Promise.all([
            dbGet(
                connection,
                `SELECT
                    (SELECT COUNT(*) FROM weekly_archive_cycles) AS cycles,
                    (SELECT COUNT(*) FROM weekly_archive_reward_claims) AS claims,
                    (SELECT COUNT(DISTINCT user_id) FROM weekly_archive_reward_claims) AS claimers,
                    (SELECT COALESCE(SUM(amount), 0) FROM weekly_archive_reward_claims) AS renown_granted`,
                []
            ),
            dbAll(
                connection,
                `SELECT event_type, cycle_id, grade_id, result_code, event_count, total_value, updated_at
                 FROM weekly_archive_ops_counters
                 ORDER BY updated_at DESC, event_count DESC
                 LIMIT 100`,
                []
            ),
            dbAll(
                connection,
                `SELECT event_type, cycle_id, grade_id, result_code, value, detail_json, created_at
                 FROM weekly_archive_ops_events
                 ORDER BY created_at DESC, event_id DESC
                 LIMIT 20`,
                []
            )
        ]);
        return {
            success: true,
            reportVersion: OPS_REPORT_VERSION,
            protocolVersion: PROTOCOL_VERSION,
            generatedAt: clampInt(now),
            currentCycle: summarizeCycle(currentCycle, now),
            totals: {
                cycles: clampInt(totals && totals.cycles),
                claims: clampInt(totals && totals.claims),
                claimers: clampInt(totals && totals.claimers),
                renownGranted: clampInt(totals && totals.renown_granted)
            },
            counters: counterRows.map(row => ({
                eventType: String(row.event_type || ''),
                cycleId: String(row.cycle_id || ''),
                gradeId: String(row.grade_id || ''),
                resultCode: String(row.result_code || ''),
                eventCount: clampInt(row.event_count),
                totalValue: clampInt(row.total_value),
                updatedAt: clampInt(row.updated_at)
            })),
            recentEvents: recentRows.map(row => ({
                eventType: String(row.event_type || ''),
                cycleId: String(row.cycle_id || ''),
                gradeId: String(row.grade_id || ''),
                resultCode: String(row.result_code || ''),
                value: clampInt(row.value),
                detail: parseJsonObject(row.detail_json),
                createdAt: clampInt(row.created_at)
            }))
        };
    }, { transaction: true });
}

module.exports = {
    CLAIM_REPORT_VERSION,
    CURRENT_REPORT_VERSION,
    OPS_REPORT_VERSION,
    PROTOCOL_VERSION,
    claimWeeklyArchiveFoundation,
    getCurrentWeeklyArchive,
    getWeeklyArchiveOpsOverview,
    normalizeClaimRequest
};
