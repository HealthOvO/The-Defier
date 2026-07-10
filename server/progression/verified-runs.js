const crypto = require('node:crypto');
const sqlite3 = require('sqlite3').verbose();
const { dbPath } = require('../db/database');
const { getJwtSecret } = require('../middleware/auth');

const VERIFIED_RUN_CONTENT_VERSION = 'verified-run-v1';
const VERIFIED_RUN_REPORT_VERSION = 'account-verified-run-v1';
const VERIFIED_AUTHORITY_LEVEL = 'verified_envelope';
const VERIFIED_TRUST_TIER = 'server_verified';
const MAX_CHECKPOINTS = 64;
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const SAFE_TEXT = /^[A-Za-z0-9._:-]{1,128}$/;
const MODES = ['pve', 'challenge', 'expedition'];
const NODE_TYPES = ['enemy', 'elite', 'trial', 'boss', 'ghost_duel'];
const STATUS_VALUES = ['active', 'settled', 'expired'];
const MODE_TTL_MS = {
    pve: 24 * 60 * 60 * 1000,
    challenge: 8 * 24 * 60 * 60 * 1000,
    expedition: 48 * 60 * 60 * 1000
};

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

async function withConnection(fn, { transaction = false, readTransaction = false } = {}) {
    const connection = openDb();
    const usesTransaction = transaction || readTransaction;
    try {
        if (transaction) await dbRun(connection, 'BEGIN IMMEDIATE');
        else if (readTransaction) await dbRun(connection, 'BEGIN');
        const result = await fn(connection);
        if (usesTransaction) await dbRun(connection, 'COMMIT');
        return result;
    } catch (error) {
        if (usesTransaction) {
            try {
                await dbRun(connection, 'ROLLBACK');
            } catch (rollbackError) {
                console.error('[VerifiedRuns] Rollback failed:', rollbackError);
            }
        }
        throw error;
    } finally {
        await closeDb(connection);
    }
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

function safeText(value) {
    const text = String(value || '').trim();
    return SAFE_TEXT.test(text) ? text : '';
}

function makeError(statusCode, reason, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.reason = reason;
    return error;
}

function digest(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function deterministicId(prefix, parts) {
    return `${prefix}-${digest(parts.join('|')).slice(0, 32)}`;
}

function getNonceSecret() {
    return String(process.env.DEFIER_HMAC_SECRET || getJwtSecret() || 'the-defier-local-dev-secret');
}

function deriveSettlementNonce(ticketId, userId) {
    return crypto.createHmac('sha256', getNonceSecret())
        .update('verified-run-nonce-v1\n', 'utf8')
        .update(String(ticketId || ''), 'utf8')
        .update('\n', 'utf8')
        .update(String(userId || ''), 'utf8')
        .digest('hex');
}

function nonceMatches(ticket, nonce) {
    const actualHash = digest(String(nonce || ''));
    const expectedHash = String(ticket && ticket.nonce_hash || '');
    const actualBuffer = Buffer.from(actualHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    return actualBuffer.length === expectedBuffer.length
        && actualBuffer.length > 0
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sanitizeContext(mode, rawContext) {
    const source = rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext) ? rawContext : {};
    const hasSaveSlot = source.saveSlot !== null && source.saveSlot !== undefined && source.saveSlot !== '';
    const saveSlotValue = hasSaveSlot ? Math.floor(Number(source.saveSlot)) : -1;
    const saveSlot = Number.isInteger(saveSlotValue) && saveSlotValue >= 0 && saveSlotValue <= 3 ? saveSlotValue : -1;
    if (mode === 'pve') {
        return {
            saveSlot,
            realm: clampInt(source.realm, 1, 18),
            characterId: safeText(source.characterId),
            runPathId: safeText(source.runPathId),
            runDestinyId: safeText(source.runDestinyId),
            spiritCompanionId: safeText(source.spiritCompanionId),
            mapSnapshotHash: safeText(source.mapSnapshotHash)
        };
    }
    if (mode === 'challenge') {
        const challengeMode = String(source.challengeMode || '').trim();
        return {
            saveSlot,
            challengeMode: ['daily', 'weekly', 'global'].includes(challengeMode) ? challengeMode : '',
            rotationKey: safeText(source.rotationKey),
            ruleId: safeText(source.ruleId),
            goalRealm: clampInt(source.goalRealm, 1, 18),
            seedSignature: safeText(source.seedSignature)
        };
    }
    return {
        saveSlot,
        realm: clampInt(source.realm, 1, 18),
        chapterIndex: clampInt(source.chapterIndex, 1, 6)
    };
}

function validateContext(mode, context) {
    if (mode === 'pve' && !context.mapSnapshotHash) {
        throw makeError(400, 'invalid_run_context', 'PVE run 缺少地图快照标识');
    }
    if (mode === 'challenge' && (!context.challengeMode || !context.rotationKey || !context.ruleId)) {
        throw makeError(400, 'invalid_run_context', '挑战 run 上下文不完整');
    }
    if (mode === 'expedition' && context.chapterIndex < 1) {
        throw makeError(400, 'invalid_run_context', '远征 run 上下文不完整');
    }
}

function normalizeTicketRequest(rawRequest) {
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    const clientRunId = safeId(source.clientRunId);
    const mode = String(source.mode || '').trim();
    const contentVersion = String(source.contentVersion || '').trim();
    if (!clientRunId) throw makeError(400, 'invalid_client_run_id', 'run id 非法');
    if (!MODES.includes(mode)) throw makeError(400, 'invalid_run_mode', 'run 模式不支持');
    if (contentVersion !== VERIFIED_RUN_CONTENT_VERSION) {
        throw makeError(409, 'unsupported_content_version', 'run 内容版本不受支持');
    }
    const context = sanitizeContext(mode, source.context);
    validateContext(mode, context);
    const contextJson = JSON.stringify(context);
    return {
        clientRunId,
        mode,
        contentVersion,
        context,
        contextJson,
        contextHash: digest(contextJson)
    };
}

function normalizeProof(rawProof) {
    const source = rawProof && typeof rawProof === 'object' && !Array.isArray(rawProof) ? rawProof : {};
    const proof = {};
    const nodeType = String(source.nodeType || '').trim();
    if (NODE_TYPES.includes(nodeType)) proof.nodeType = nodeType;
    if (Number.isFinite(Number(source.realm))) proof.realm = clampInt(source.realm, 1, 999);
    const runId = safeId(source.runId);
    if (runId) proof.runId = runId;
    const challengeMode = String(source.challengeMode || '').trim();
    if (['daily', 'weekly', 'global'].includes(challengeMode)) proof.challengeMode = challengeMode;
    const rotationKey = safeText(source.rotationKey);
    const ruleId = safeText(source.ruleId);
    if (rotationKey) proof.rotationKey = rotationKey;
    if (ruleId) proof.ruleId = ruleId;
    if (Number.isFinite(Number(source.chapterIndex))) proof.chapterIndex = clampInt(source.chapterIndex, 1, 999);
    const reason = String(source.reason || '').trim();
    if (reason === 'realm_clear') proof.reason = reason;
    return proof;
}

function parseJson(value, fallback = {}) {
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (error) {
        return fallback;
    }
}

function mapTicket(ticket, { idempotent = false } = {}) {
    return {
        ticketId: String(ticket.ticket_id || ''),
        clientRunId: String(ticket.client_run_id || ''),
        mode: String(ticket.activity_mode || ''),
        contentVersion: String(ticket.content_version || ''),
        status: String(ticket.status || 'active'),
        context: parseJson(ticket.context_json),
        checkpointCount: clampInt(ticket.checkpoint_count),
        battleWins: clampInt(ticket.battle_wins),
        bossWins: clampInt(ticket.boss_wins),
        issuedAt: clampInt(ticket.issued_at),
        expiresAt: clampInt(ticket.expires_at),
        settledAt: clampInt(ticket.settled_at),
        settlementNonce: deriveSettlementNonce(ticket.ticket_id, ticket.user_id),
        authorityLevel: VERIFIED_AUTHORITY_LEVEL,
        idempotent
    };
}

async function issueVerifiedRunTicket(userId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    if (!identity) throw makeError(401, 'missing_user', '登录账号缺失');
    const request = normalizeTicketRequest(rawRequest);
    const result = await withConnection(async connection => {
        const existing = await dbGet(
            connection,
            `SELECT * FROM progression_verified_runs
             WHERE user_id = ? AND client_run_id = ?`,
            [identity, request.clientRunId]
        );
        if (existing) {
            if (String(existing.activity_mode) !== request.mode
                || String(existing.content_version) !== request.contentVersion
                || String(existing.context_hash) !== request.contextHash) {
                return { error: makeError(409, 'client_run_conflict', '相同 run id 已绑定不同上下文') };
            }
            if (String(existing.status) === 'active' && clampInt(existing.expires_at) <= now) {
                await dbRun(
                    connection,
                    `UPDATE progression_verified_runs
                     SET status = 'expired', updated_at = ?
                     WHERE ticket_id = ? AND status = 'active'`,
                    [now, existing.ticket_id]
                );
                return { error: makeError(410, 'run_ticket_expired', 'run ticket 已过期') };
            }
            return { ticket: mapTicket(existing, { idempotent: true }) };
        }
        const ticketId = `vrun-${crypto.randomUUID()}`;
        const nonce = deriveSettlementNonce(ticketId, identity);
        const expiresAt = now + MODE_TTL_MS[request.mode];
        await dbRun(
            connection,
            `INSERT INTO progression_verified_runs
                (ticket_id, user_id, client_run_id, activity_mode, content_version, context_json,
                 context_hash, nonce_hash, status, checkpoint_count, battle_wins, boss_wins,
                 issued_at, expires_at, settled_at, settlement_source_ref, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, 0, ?, ?, 0, '', ?)`,
            [
                ticketId,
                identity,
                request.clientRunId,
                request.mode,
                request.contentVersion,
                request.contextJson,
                request.contextHash,
                digest(nonce),
                now,
                expiresAt,
                now
            ]
        );
        const created = await dbGet(connection, 'SELECT * FROM progression_verified_runs WHERE ticket_id = ?', [ticketId]);
        return { ticket: mapTicket(created) };
    }, { transaction: true });
    if (result.error) throw result.error;
    return {
        success: true,
        reportVersion: `${VERIFIED_RUN_REPORT_VERSION}-ticket`,
        ticket: result.ticket
    };
}

async function loadOwnedTicket(connection, userId, ticketId) {
    return dbGet(
        connection,
        `SELECT * FROM progression_verified_runs
         WHERE ticket_id = ? AND user_id = ?`,
        [ticketId, userId]
    );
}

function assertProofRunBinding(ticket, proof) {
    const expectedRunId = safeId(ticket && ticket.client_run_id);
    const proofRunId = safeId(proof && proof.runId);
    if (!expectedRunId || proofRunId !== expectedRunId) {
        throw makeError(409, 'verified_run_id_mismatch', '证明中的 run id 与 ticket 不一致');
    }
}

async function upsertVerifiedProgressionEvent(connection, {
    ticket,
    userId,
    eventType,
    sourceRef,
    proof,
    now,
    sourceKind
}) {
    const mode = String(ticket.activity_mode || '');
    const metrics = {
        battleWins: eventType === 'battle_won' ? 1 : 0,
        bossWins: eventType === 'battle_won' && proof.nodeType === 'boss' ? 1 : 0,
        activityCompletions: eventType === 'activity_completed' ? 1 : 0
    };
    const existing = await dbGet(
        connection,
        `SELECT event_id, activity_mode, trust_tier, proof_json
         FROM progression_events
         WHERE user_id = ? AND event_type = ? AND source_ref = ?`,
        [userId, eventType, sourceRef]
    );
    const eventProof = {
        ...proof,
        ticketId: String(ticket.ticket_id || ''),
        contentVersion: String(ticket.content_version || ''),
        authorityLevel: VERIFIED_AUTHORITY_LEVEL
    };
    if (!existing) {
        throw makeError(409, 'observed_event_required', '可信结算只能升级已接收的观察事件');
    }
    if (String(existing.activity_mode || '') !== mode) {
        throw makeError(409, 'progression_source_conflict', '进度来源已绑定其他玩法');
    }
    const existingProof = parseJson(existing.proof_json);
    const expectedRunId = safeId(ticket.client_run_id);
    if (safeId(existingProof.runId) !== expectedRunId) {
        throw makeError(409, 'observed_event_run_mismatch', '观察事件属于其他 run');
    }
    const existingTrust = String(existing.trust_tier || '');
    if (existingTrust === VERIFIED_TRUST_TIER) {
        if (safeId(existingProof.ticketId) !== safeId(ticket.ticket_id)) {
            throw makeError(409, 'verified_source_replay', '进度来源已被其他 ticket 使用');
        }
        return {
            eventId: String(existing.event_id || ''),
            upgraded: false,
            duplicate: true,
            metrics
        };
    }
    if (existingTrust !== 'client_observed') {
        throw makeError(409, 'progression_source_conflict', '进度来源信任等级不可升级');
    }
    await dbRun(
        connection,
        `UPDATE progression_events
         SET source_kind = ?, trust_tier = ?, proof_json = ?, received_at = ?
         WHERE user_id = ? AND event_type = ? AND source_ref = ?`,
        [sourceKind, VERIFIED_TRUST_TIER, JSON.stringify(eventProof), now, userId, eventType, sourceRef]
    );
    return {
        eventId: String(existing.event_id || ''),
        upgraded: true,
        duplicate: false,
        metrics
    };
}

function mapCheckpoint(row, eventResult, idempotent) {
    return {
        checkpointId: String(row.checkpoint_id || ''),
        ticketId: String(row.ticket_id || ''),
        sequence: clampInt(row.sequence),
        eventType: String(row.event_type || ''),
        sourceRef: String(row.source_ref || ''),
        nodeType: String(row.node_type || ''),
        realm: clampInt(row.realm, 1, 999),
        eventId: String(eventResult && eventResult.eventId || ''),
        trustTier: VERIFIED_TRUST_TIER,
        authorityLevel: VERIFIED_AUTHORITY_LEVEL,
        upgradedObservedEvent: !!(eventResult && eventResult.upgraded),
        idempotent: !!idempotent,
        createdAt: clampInt(row.created_at)
    };
}

async function recordVerifiedRunCheckpoint(userId, ticketId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    const safeTicketId = safeId(ticketId);
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    const sourceRef = safeId(source.sourceRef);
    const eventType = String(source.eventType || '').trim();
    if (!safeTicketId) throw makeError(400, 'invalid_ticket_id', 'ticket id 非法');
    if (!sourceRef) throw makeError(400, 'invalid_source_ref', 'checkpoint 来源非法');
    if (eventType !== 'battle_won') throw makeError(400, 'invalid_checkpoint_event', 'checkpoint 事件类型不支持');
    const proof = normalizeProof(source.proof);
    if (!proof.nodeType) throw makeError(400, 'invalid_checkpoint_proof', 'checkpoint 缺少节点类型');
    const result = await withConnection(async connection => {
        const ticket = await loadOwnedTicket(connection, identity, safeTicketId);
        if (!ticket) return { error: makeError(404, 'run_ticket_not_found', 'run ticket 不存在') };
        try {
            assertProofRunBinding(ticket, proof);
        } catch (error) {
            return { error };
        }
        if (String(ticket.status) === 'active' && clampInt(ticket.expires_at) <= now) {
            await dbRun(connection, `UPDATE progression_verified_runs SET status = 'expired', updated_at = ? WHERE ticket_id = ?`, [now, safeTicketId]);
            return { error: makeError(410, 'run_ticket_expired', 'run ticket 已过期') };
        }
        if (String(ticket.status) !== 'active') {
            return { error: makeError(409, 'run_not_active', 'run 已结束，不能继续写入 checkpoint') };
        }
        const replayedCheckpoint = await dbGet(
            connection,
            `SELECT ticket_id FROM progression_verified_run_checkpoints
             WHERE user_id = ? AND event_type = ? AND source_ref = ?`,
            [identity, eventType, sourceRef]
        );
        if (replayedCheckpoint && String(replayedCheckpoint.ticket_id || '') !== safeTicketId) {
            return { error: makeError(409, 'verified_source_replay', 'checkpoint 来源已被其他 ticket 使用') };
        }
        const existing = await dbGet(
            connection,
            `SELECT * FROM progression_verified_run_checkpoints
             WHERE ticket_id = ? AND source_ref = ?`,
            [safeTicketId, sourceRef]
        );
        if (existing) {
            const eventRow = await dbGet(
                connection,
                `SELECT event_id, trust_tier FROM progression_events
                 WHERE user_id = ? AND event_type = ? AND source_ref = ?`,
                [identity, eventType, sourceRef]
            );
            return {
                checkpoint: mapCheckpoint(existing, {
                    eventId: eventRow && eventRow.event_id,
                    upgraded: false
                }, true),
                ticket: mapTicket(ticket, { idempotent: true })
            };
        }
        const checkpointCount = clampInt(ticket.checkpoint_count);
        if (checkpointCount >= MAX_CHECKPOINTS) {
            return { error: makeError(409, 'checkpoint_limit_reached', 'run checkpoint 已达到上限') };
        }
        const sequence = checkpointCount + 1;
        const checkpointId = deterministicId('verified-checkpoint', [safeTicketId, sourceRef]);
        await dbRun(
            connection,
            `INSERT INTO progression_verified_run_checkpoints
                (checkpoint_id, ticket_id, user_id, sequence, event_type, source_ref,
                 node_type, realm, proof_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                checkpointId,
                safeTicketId,
                identity,
                sequence,
                eventType,
                sourceRef,
                proof.nodeType,
                clampInt(proof.realm, 1, 999),
                JSON.stringify(proof),
                now
            ]
        );
        const eventResult = await upsertVerifiedProgressionEvent(connection, {
            ticket,
            userId: identity,
            eventType,
            sourceRef,
            proof,
            now,
            sourceKind: 'verified_run_checkpoint'
        });
        await dbRun(
            connection,
            `UPDATE progression_verified_runs
             SET checkpoint_count = checkpoint_count + 1,
                 battle_wins = battle_wins + ?,
                 boss_wins = boss_wins + ?,
                 updated_at = ?
             WHERE ticket_id = ?`,
            [eventResult.metrics.battleWins, eventResult.metrics.bossWins, now, safeTicketId]
        );
        const checkpoint = await dbGet(connection, 'SELECT * FROM progression_verified_run_checkpoints WHERE checkpoint_id = ?', [checkpointId]);
        const updatedTicket = await loadOwnedTicket(connection, identity, safeTicketId);
        return {
            checkpoint: mapCheckpoint(checkpoint, eventResult, false),
            ticket: mapTicket(updatedTicket)
        };
    }, { transaction: true });
    if (result.error) throw result.error;
    return {
        success: true,
        reportVersion: `${VERIFIED_RUN_REPORT_VERSION}-checkpoint`,
        checkpoint: result.checkpoint,
        ticket: result.ticket
    };
}

function validateSettlement(ticket, proof, outcome) {
    if (outcome !== 'completed') throw makeError(400, 'invalid_run_outcome', '只接受已完成的 run 结算');
    const mode = String(ticket.activity_mode || '');
    const context = parseJson(ticket.context_json);
    if (clampInt(ticket.battle_wins) < 1) {
        throw makeError(409, 'insufficient_run_checkpoints', 'run 缺少可验证的战斗 checkpoint');
    }
    if (mode === 'pve') {
        if (clampInt(ticket.boss_wins) < 1 || proof.reason !== 'realm_clear') {
            throw makeError(409, 'pve_completion_not_verified', 'PVE run 尚未验证 Boss 完成');
        }
        if (proof.realm !== context.realm) throw makeError(409, 'run_context_mismatch', 'PVE 完成境界与 ticket 不一致');
    } else if (mode === 'challenge') {
        if (proof.challengeMode !== context.challengeMode
            || proof.rotationKey !== context.rotationKey
            || proof.ruleId !== context.ruleId
            || clampInt(proof.realm) < clampInt(context.goalRealm)) {
            throw makeError(409, 'run_context_mismatch', '挑战完成信息与 ticket 不一致');
        }
    } else if (mode === 'expedition') {
        if (proof.reason !== 'realm_clear' || proof.chapterIndex !== context.chapterIndex) {
            throw makeError(409, 'run_context_mismatch', '远征完成信息与 ticket 不一致');
        }
    }
}

function mapReceipt(row, { idempotent = false } = {}) {
    const payload = parseJson(row.receipt_json);
    return {
        ...payload,
        receiptId: String(row.receipt_id || payload.receiptId || ''),
        ticketId: String(row.ticket_id || payload.ticketId || ''),
        sourceRef: String(row.source_ref || payload.sourceRef || ''),
        eventId: String(row.event_id || payload.eventId || ''),
        authorityLevel: String(row.authority_level || VERIFIED_AUTHORITY_LEVEL),
        settledAt: clampInt(row.created_at || payload.settledAt),
        idempotent: !!idempotent
    };
}

async function settleVerifiedRun(userId, ticketId, rawRequest, now = Date.now()) {
    const identity = String(userId || '').trim();
    const safeTicketId = safeId(ticketId);
    const source = rawRequest && typeof rawRequest === 'object' && !Array.isArray(rawRequest) ? rawRequest : {};
    const sourceRef = safeId(source.sourceRef);
    const outcome = String(source.outcome || '').trim();
    const nonce = String(source.settlementNonce || '');
    const proof = normalizeProof(source.proof);
    if (!safeTicketId) throw makeError(400, 'invalid_ticket_id', 'ticket id 非法');
    if (!sourceRef) throw makeError(400, 'invalid_source_ref', '结算来源非法');
    if (!/^[0-9a-f]{64}$/i.test(nonce)) throw makeError(400, 'invalid_settlement_nonce', '结算 nonce 非法');
    const result = await withConnection(async connection => {
        const ticket = await loadOwnedTicket(connection, identity, safeTicketId);
        if (!ticket) return { error: makeError(404, 'run_ticket_not_found', 'run ticket 不存在') };
        if (!nonceMatches(ticket, nonce)) return { error: makeError(403, 'settlement_nonce_mismatch', '结算 nonce 不匹配') };
        const existingReceipt = await dbGet(
            connection,
            'SELECT * FROM progression_verified_run_receipts WHERE ticket_id = ?',
            [safeTicketId]
        );
        if (existingReceipt) {
            if (String(existingReceipt.source_ref || '') !== sourceRef) {
                return { error: makeError(409, 'run_already_settled', 'run 已使用其他来源完成结算') };
            }
            return {
                receipt: mapReceipt(existingReceipt, { idempotent: true }),
                ticket: mapTicket(ticket, { idempotent: true })
            };
        }
        if (String(ticket.status) === 'active' && clampInt(ticket.expires_at) <= now) {
            await dbRun(connection, `UPDATE progression_verified_runs SET status = 'expired', updated_at = ? WHERE ticket_id = ?`, [now, safeTicketId]);
            return { error: makeError(410, 'run_ticket_expired', 'run ticket 已过期') };
        }
        if (String(ticket.status) !== 'active') {
            return { error: makeError(409, 'run_not_active', 'run 已结束，不能结算') };
        }
        try {
            assertProofRunBinding(ticket, proof);
            validateSettlement(ticket, proof, outcome);
        } catch (error) {
            return { error };
        }
        const eventResult = await upsertVerifiedProgressionEvent(connection, {
            ticket,
            userId: identity,
            eventType: 'activity_completed',
            sourceRef,
            proof,
            now,
            sourceKind: 'verified_run_settlement'
        });
        const receiptId = deterministicId('verified-receipt', [safeTicketId, sourceRef]);
        const receiptPayload = {
            reportVersion: `${VERIFIED_RUN_REPORT_VERSION}-settlement`,
            receiptId,
            ticketId: safeTicketId,
            clientRunId: String(ticket.client_run_id || ''),
            mode: String(ticket.activity_mode || ''),
            contentVersion: String(ticket.content_version || ''),
            sourceRef,
            eventId: eventResult.eventId,
            trustTier: VERIFIED_TRUST_TIER,
            authorityLevel: VERIFIED_AUTHORITY_LEVEL,
            upgradedObservedEvent: !!eventResult.upgraded,
            progressDelta: {
                activityCompletions: eventResult.metrics.activityCompletions
            },
            settledAt: now
        };
        await dbRun(
            connection,
            `INSERT INTO progression_verified_run_receipts
                (receipt_id, ticket_id, user_id, activity_mode, content_version, source_ref,
                 authority_level, event_id, receipt_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                receiptId,
                safeTicketId,
                identity,
                ticket.activity_mode,
                ticket.content_version,
                sourceRef,
                VERIFIED_AUTHORITY_LEVEL,
                eventResult.eventId,
                JSON.stringify(receiptPayload),
                now
            ]
        );
        await dbRun(
            connection,
            `UPDATE progression_verified_runs
             SET status = 'settled', settled_at = ?, settlement_source_ref = ?, updated_at = ?
             WHERE ticket_id = ? AND status = 'active'`,
            [now, sourceRef, now, safeTicketId]
        );
        const receipt = await dbGet(connection, 'SELECT * FROM progression_verified_run_receipts WHERE receipt_id = ?', [receiptId]);
        const updatedTicket = await loadOwnedTicket(connection, identity, safeTicketId);
        return {
            receipt: mapReceipt(receipt),
            ticket: mapTicket(updatedTicket)
        };
    }, { transaction: true });
    if (result.error) throw result.error;
    return {
        success: true,
        reportVersion: `${VERIFIED_RUN_REPORT_VERSION}-settlement`,
        receipt: result.receipt,
        ticket: result.ticket
    };
}

function mapCounts(rows, key, values) {
    const output = Object.fromEntries(values.map(value => [value, 0]));
    rows.forEach(row => {
        const name = String(row[key] || '');
        if (Object.prototype.hasOwnProperty.call(output, name)) output[name] = clampInt(row.count);
    });
    return output;
}

async function getVerifiedRunOpsOverview(now = Date.now()) {
    return withConnection(async connection => {
        const [modeRows, statusRows, receiptCount, expiredActive] = await Promise.all([
            dbAll(connection, 'SELECT activity_mode, COUNT(*) AS count FROM progression_verified_runs GROUP BY activity_mode'),
            dbAll(connection, 'SELECT status, COUNT(*) AS count FROM progression_verified_runs GROUP BY status'),
            dbGet(connection, 'SELECT COUNT(*) AS count FROM progression_verified_run_receipts'),
            dbGet(connection, `SELECT COUNT(*) AS count FROM progression_verified_runs WHERE status = 'active' AND expires_at <= ?`, [now])
        ]);
        return {
            reportVersion: `${VERIFIED_RUN_REPORT_VERSION}-ops`,
            contentVersion: VERIFIED_RUN_CONTENT_VERSION,
            authorityLevel: VERIFIED_AUTHORITY_LEVEL,
            byMode: mapCounts(modeRows, 'activity_mode', MODES),
            byStatus: mapCounts(statusRows, 'status', STATUS_VALUES),
            receipts: clampInt(receiptCount && receiptCount.count),
            expiredActive: clampInt(expiredActive && expiredActive.count)
        };
    }, { readTransaction: true });
}

module.exports = {
    MAX_CHECKPOINTS,
    VERIFIED_AUTHORITY_LEVEL,
    VERIFIED_RUN_CONTENT_VERSION,
    VERIFIED_TRUST_TIER,
    deriveSettlementNonce,
    getVerifiedRunOpsOverview,
    issueVerifiedRunTicket,
    normalizeTicketRequest,
    recordVerifiedRunCheckpoint,
    settleVerifiedRun
};
