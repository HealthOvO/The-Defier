const sqlite3 = require('sqlite3').verbose();
const crypto = require('node:crypto');
const { dbPath } = require('../db/database');
const {
    CLOUD_STATE_ENTITY_GLOBAL,
    CLOUD_STATE_ENTITY_SLOT,
    CLOUD_STATE_GLOBAL_MAX_BYTES,
    CLOUD_STATE_HISTORY_LIMIT_MAX,
    CLOUD_STATE_OPERATION_RESTORE,
    CLOUD_STATE_OPERATION_WRITE,
    CLOUD_STATE_PROTOCOL_VERSION,
    CLOUD_STATE_REPORT_VERSION,
    CLOUD_STATE_SLOT_MAX_BYTES,
    compareLegacyTimestampForLww,
    ensureSafeId,
    formatRevisionRecord,
    makeError,
    makeGlobalScope,
    makeSlotScope,
    normalizeGlobalWritePayload,
    normalizeSlotWritePayload,
    parseHistoryLimit
} = require('./common');

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

async function withReadConnection(fn) {
    const connection = openDb();
    try {
        return await fn(connection);
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
            console.error('[CloudState] Rollback failed:', rollbackError);
        }
        if (error && error.opsEventType && error.opsScope) {
            try {
                await withReadConnection(async (auditConnection) => {
                    await dbRun(
                        auditConnection,
                        `INSERT INTO cloud_state_ops_events (event_type, entity_type, entity_key, byte_count, created_at)
                         VALUES (?, ?, ?, 0, ?)`,
                        [error.opsEventType, error.opsScope.entityType, error.opsScope.entityKey, Date.now()]
                    );
                });
            } catch (auditError) {
                console.error('[CloudState] Failed to write detached ops event:', auditError);
            }
        }
        throw error;
    } finally {
        await closeDb(connection);
        releaseQueue();
    }
}

function makeRevisionId() {
    if (typeof crypto?.randomUUID === 'function') {
        return `cloudrev-${crypto.randomUUID()}`;
    }
    return `cloudrev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeRequestHash(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

async function recordOpsEvent(connection, eventType, scope, byteCount = 0) {
    await dbRun(
        connection,
        `INSERT INTO cloud_state_ops_events (event_type, entity_type, entity_key, byte_count, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [eventType, scope.entityType, scope.entityKey, Math.max(0, Number(byteCount) || 0), Date.now()]
    );
}

async function getHeadRow(connection, userId, scope) {
    return dbGet(
        connection,
        `SELECT
            h.user_id,
            h.entity_type,
            h.entity_key,
            h.slot_index,
            h.head_revision_id,
            h.head_revision_number,
            h.content_hash AS head_content_hash,
            h.head_updated_at,
            r.revision_id,
            r.revision_number,
            r.parent_revision_id,
            r.source_revision_id,
            r.operation,
            r.mutation_id,
            r.request_hash,
            r.content_hash,
            r.data_json,
            r.data_size_bytes,
            r.client_updated_at,
            r.created_at
         FROM cloud_state_heads h
         JOIN cloud_state_revisions r ON r.revision_id = h.head_revision_id
         WHERE h.user_id = ? AND h.entity_key = ?`,
        [userId, scope.entityKey]
    );
}

async function getRevisionRow(connection, userId, scope, revisionId) {
    return dbGet(
        connection,
        `SELECT
            r.user_id,
            r.entity_type,
            r.entity_key,
            r.slot_index,
            r.revision_id,
            r.revision_number,
            r.parent_revision_id,
            r.source_revision_id,
            r.operation,
            r.mutation_id,
            r.request_hash,
            r.content_hash,
            r.data_json,
            r.data_size_bytes,
            r.client_updated_at,
            r.created_at,
            h.head_updated_at
         FROM cloud_state_revisions r
         LEFT JOIN cloud_state_heads h ON h.user_id = r.user_id AND h.entity_key = r.entity_key AND h.head_revision_id = r.revision_id
         WHERE r.user_id = ? AND r.entity_key = ? AND r.revision_id = ?`,
        [userId, scope.entityKey, revisionId]
    );
}

function makeConflictError(scope, currentRow) {
    const isSlot = scope.entityType === CLOUD_STATE_ENTITY_SLOT;
    return makeError(
        409,
        isSlot ? 'save_conflict' : 'global_conflict',
        isSlot ? '云存档版本冲突，请先拉取最新存档' : '全局数据版本冲突，请先拉取最新状态',
        { current: currentRow ? formatRevisionRecord(scope.entityType, currentRow) : null }
    );
}

function makeMutationConflictError(scope) {
    const isSlot = scope.entityType === CLOUD_STATE_ENTITY_SLOT;
    const error = makeError(
        409,
        isSlot ? 'save_mutation_reused' : 'global_mutation_reused',
        isSlot ? 'mutationId 已被其他请求占用' : 'mutationId 已被其他请求占用'
    );
    error.opsEventType = 'mutation_conflict';
    error.opsScope = scope;
    return error;
}

async function getMutationRow(connection, userId, mutationId) {
    return dbGet(
        connection,
        `SELECT user_id, mutation_id, entity_type, entity_key, request_hash, revision_id, receipt_json
         FROM cloud_state_mutations
         WHERE user_id = ? AND mutation_id = ?`,
        [userId, mutationId]
    );
}

async function ensureMutationAvailable(connection, userId, scope, mutationId, requestHash) {
    const mutationRow = await getMutationRow(connection, userId, mutationId);
    if (!mutationRow) return null;
    if (mutationRow.request_hash === requestHash && mutationRow.entity_key === scope.entityKey) {
        await recordOpsEvent(connection, 'idempotent_replay', scope, 0);
        try {
            return JSON.parse(mutationRow.receipt_json);
        } catch (error) {
            throw makeError(500, 'cloud_state_corrupt_mutation_receipt', '云状态幂等回执损坏');
        }
    }
    await recordOpsEvent(connection, 'mutation_conflict', scope, 0);
    throw makeMutationConflictError(scope);
}

async function insertRevision(connection, {
    userId,
    scope,
    headRow,
    operation,
    mutationId = null,
    requestHash,
    normalized,
    sourceRevisionId = null
}) {
    const revisionId = makeRevisionId();
    const revisionNumber = headRow ? (Number(headRow.head_revision_number) || 0) + 1 : 1;
    const createdAt = Date.now();
    await dbRun(
        connection,
        `INSERT INTO cloud_state_revisions (
            revision_id, user_id, entity_type, entity_key, slot_index, revision_number,
            parent_revision_id, source_revision_id, operation, mutation_id, request_hash,
            content_hash, data_json, data_size_bytes, client_updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            revisionId,
            userId,
            scope.entityType,
            scope.entityKey,
            scope.slotIndex,
            revisionNumber,
            headRow ? headRow.head_revision_id : null,
            sourceRevisionId,
            operation,
            mutationId,
            requestHash,
            normalized.contentHash,
            normalized.dataJson,
            normalized.dataSizeBytes,
            normalized.clientUpdatedAt,
            createdAt
        ]
    );
    await dbRun(
        connection,
        `INSERT INTO cloud_state_heads (
            user_id, entity_type, entity_key, slot_index, head_revision_id, head_revision_number,
            content_hash, head_updated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, entity_key) DO UPDATE SET
            entity_type = excluded.entity_type,
            slot_index = excluded.slot_index,
            head_revision_id = excluded.head_revision_id,
            head_revision_number = excluded.head_revision_number,
            content_hash = excluded.content_hash,
            head_updated_at = excluded.head_updated_at,
            updated_at = excluded.updated_at`,
        [
            userId,
            scope.entityType,
            scope.entityKey,
            scope.slotIndex,
            revisionId,
            revisionNumber,
            normalized.contentHash,
            createdAt,
            createdAt,
            createdAt
        ]
    );
    const revisionRow = await getRevisionRow(connection, userId, scope, revisionId);
    return formatRevisionRecord(scope.entityType, revisionRow);
}

async function saveMutationReceipt(connection, userId, scope, mutationId, requestHash, receipt) {
    await dbRun(
        connection,
        `INSERT INTO cloud_state_mutations (
            user_id, mutation_id, entity_type, entity_key, request_hash, revision_id, receipt_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            mutationId,
            scope.entityType,
            scope.entityKey,
            requestHash,
            receipt.revisionId,
            JSON.stringify(receipt),
            Date.now()
        ]
    );
}

async function persistLegacySlotRow(connection, userId, slotIndex, normalized) {
    await dbRun(
        connection,
        `INSERT INTO game_saves (user_id, slot_index, save_data, save_time)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, slot_index)
         DO UPDATE SET save_data = excluded.save_data, save_time = excluded.save_time`,
        [userId, slotIndex, normalized.storedLegacyData, normalized.clientUpdatedAt]
    );
}

async function persistLegacyGlobalRow(connection, userId, normalized) {
    const result = await dbRun(
        connection,
        `UPDATE users
         SET global_data = ?, global_updated_at = ?
         WHERE id = ?`,
        [normalized.storedLegacyData, normalized.clientUpdatedAt, userId]
    );
    if ((result && result.changes) === 0) {
        throw makeError(404, 'user_not_found', '用户不存在');
    }
}

function makeWriteReceipt(scope, revisionRecord, { protocolVersion = null, skipped = false, restoredFromRevisionId = null } = {}) {
    const base = {
        success: true,
        skipped,
        protocolVersion,
        revisionId: revisionRecord ? revisionRecord.revisionId : null,
        revisionNumber: revisionRecord ? revisionRecord.revisionNumber : null,
        contentHash: revisionRecord ? revisionRecord.contentHash : null,
        headUpdatedAt: revisionRecord ? revisionRecord.headUpdatedAt : null
    };
    if (scope.entityType === CLOUD_STATE_ENTITY_SLOT) {
        return {
            ...base,
            slotIndex: scope.slotIndex,
            saveTime: revisionRecord ? revisionRecord.saveTime : null,
            restoredFromRevisionId
        };
    }
    return {
        ...base,
        globalUpdatedAt: revisionRecord ? revisionRecord.globalUpdatedAt : null,
        restoredFromRevisionId
    };
}

async function getHeadMetadataMap(userId) {
    return withReadConnection(async (connection) => {
        const rows = await dbAll(
            connection,
            `SELECT entity_key, slot_index, head_revision_id, head_revision_number, content_hash, head_updated_at
             FROM cloud_state_heads
             WHERE user_id = ?`,
            [userId]
        );
        const map = new Map();
        for (const row of rows) {
            map.set(row.entity_key, {
                revisionId: row.head_revision_id,
                revisionNumber: Number(row.head_revision_number) || 0,
                contentHash: row.content_hash,
                headUpdatedAt: Number(row.head_updated_at) || 0,
                slotIndex: row.slot_index === null || row.slot_index === undefined ? null : Number(row.slot_index)
            });
        }
        return map;
    });
}

async function getGlobalHeadMetadata(userId) {
    const metadataMap = await getHeadMetadataMap(userId);
    return metadataMap.get(CLOUD_STATE_ENTITY_GLOBAL) || null;
}

async function legacyWriteSlot(userId, { slotIndex, saveData, saveTime }) {
    const scope = makeSlotScope(slotIndex);
    const normalized = normalizeSlotWritePayload(saveData, saveTime);
    return withWriteTransaction(async (connection) => {
        const existing = await dbGet(
            connection,
            `SELECT save_time
             FROM game_saves
             WHERE user_id = ? AND slot_index = ?`,
            [userId, scope.slotIndex]
        );
        const existingTime = existing ? Number(existing.save_time) || 0 : 0;
        const comparableTime = compareLegacyTimestampForLww(existingTime);
        if (!(normalized.clientUpdatedAt > comparableTime)) {
            const currentHead = await getHeadRow(connection, userId, scope);
            const currentRevision = currentHead ? formatRevisionRecord(scope.entityType, currentHead) : null;
            return {
                success: true,
                skipped: true,
                saveTime: normalized.clientUpdatedAt,
                message: 'stale-save-ignored',
                revisionId: currentRevision ? currentRevision.revisionId : null,
                revisionNumber: currentRevision ? currentRevision.revisionNumber : null,
                contentHash: currentRevision ? currentRevision.contentHash : null,
                headUpdatedAt: currentRevision ? currentRevision.headUpdatedAt : null
            };
        }
        const headRow = await getHeadRow(connection, userId, scope);
        await persistLegacySlotRow(connection, userId, scope.slotIndex, normalized);
        const revisionRecord = await insertRevision(connection, {
            userId,
            scope,
            headRow,
            operation: CLOUD_STATE_OPERATION_WRITE,
            requestHash: makeRequestHash({
                mode: 'legacy-slot-write',
                slotIndex: scope.slotIndex,
                saveTime: normalized.clientUpdatedAt,
                saveData: normalized.dataJson
            }),
            normalized
        });
        await recordOpsEvent(connection, 'write', scope, normalized.dataSizeBytes);
        return {
            success: true,
            skipped: false,
            saveTime: normalized.clientUpdatedAt,
            revisionId: revisionRecord.revisionId,
            revisionNumber: revisionRecord.revisionNumber,
            contentHash: revisionRecord.contentHash,
            headUpdatedAt: revisionRecord.headUpdatedAt
        };
    });
}

async function legacyWriteGlobal(userId, { globalData, globalUpdatedAt }) {
    const scope = makeGlobalScope();
    const normalized = normalizeGlobalWritePayload(globalData, globalUpdatedAt);
    return withWriteTransaction(async (connection) => {
        const existing = await dbGet(
            connection,
            `SELECT global_updated_at
             FROM users
             WHERE id = ?`,
            [userId]
        );
        const existingTime = existing ? Number(existing.global_updated_at) || 0 : 0;
        const comparableTime = compareLegacyTimestampForLww(existingTime);
        if (!(normalized.clientUpdatedAt > comparableTime)) {
            const currentHead = await getHeadRow(connection, userId, scope);
            const currentRevision = currentHead ? formatRevisionRecord(scope.entityType, currentHead) : null;
            return {
                success: true,
                skipped: true,
                globalUpdatedAt: normalized.clientUpdatedAt,
                message: 'stale-global-data-ignored',
                revisionId: currentRevision ? currentRevision.revisionId : null,
                revisionNumber: currentRevision ? currentRevision.revisionNumber : null,
                contentHash: currentRevision ? currentRevision.contentHash : null,
                headUpdatedAt: currentRevision ? currentRevision.headUpdatedAt : null
            };
        }
        const headRow = await getHeadRow(connection, userId, scope);
        await persistLegacyGlobalRow(connection, userId, normalized);
        const revisionRecord = await insertRevision(connection, {
            userId,
            scope,
            headRow,
            operation: CLOUD_STATE_OPERATION_WRITE,
            requestHash: makeRequestHash({
                mode: 'legacy-global-write',
                globalUpdatedAt: normalized.clientUpdatedAt,
                globalData: normalized.dataJson
            }),
            normalized
        });
        await recordOpsEvent(connection, 'write', scope, normalized.dataSizeBytes);
        return {
            success: true,
            skipped: false,
            globalUpdatedAt: normalized.clientUpdatedAt,
            revisionId: revisionRecord.revisionId,
            revisionNumber: revisionRecord.revisionNumber,
            contentHash: revisionRecord.contentHash,
            headUpdatedAt: revisionRecord.headUpdatedAt
        };
    });
}

function validateBaseRevisionId(baseRevisionId) {
    if (baseRevisionId === null) return null;
    return ensureSafeId(baseRevisionId, 'invalid_base_revision_id', 'baseRevisionId 无效');
}

async function v2WriteSlot(userId, payload) {
    const scope = makeSlotScope(payload.slotIndex);
    const normalized = normalizeSlotWritePayload(payload.saveData, payload.saveTime);
    const mutationId = ensureSafeId(payload.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    const baseRevisionId = validateBaseRevisionId(payload.baseRevisionId);
    const requestHash = makeRequestHash(payload);
    return withWriteTransaction(async (connection) => {
        const replayReceipt = await ensureMutationAvailable(connection, userId, scope, mutationId, requestHash);
        if (replayReceipt) return replayReceipt;
        const headRow = await getHeadRow(connection, userId, scope);
        const currentRevisionId = headRow ? headRow.head_revision_id : null;
        if (baseRevisionId !== currentRevisionId) {
            const error = makeConflictError(scope, headRow);
            error.opsEventType = 'cas_conflict';
            error.opsScope = scope;
            throw error;
        }
        await persistLegacySlotRow(connection, userId, scope.slotIndex, normalized);
        const revisionRecord = await insertRevision(connection, {
            userId,
            scope,
            headRow,
            operation: CLOUD_STATE_OPERATION_WRITE,
            mutationId,
            requestHash,
            normalized
        });
        const receipt = makeWriteReceipt(scope, revisionRecord, {
            protocolVersion: CLOUD_STATE_PROTOCOL_VERSION
        });
        await saveMutationReceipt(connection, userId, scope, mutationId, requestHash, receipt);
        await recordOpsEvent(connection, 'write', scope, normalized.dataSizeBytes);
        return receipt;
    });
}

async function v2WriteGlobal(userId, payload) {
    const scope = makeGlobalScope();
    const normalized = normalizeGlobalWritePayload(payload.globalData, payload.globalUpdatedAt);
    const mutationId = ensureSafeId(payload.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    const baseRevisionId = validateBaseRevisionId(payload.baseRevisionId);
    const requestHash = makeRequestHash(payload);
    return withWriteTransaction(async (connection) => {
        const replayReceipt = await ensureMutationAvailable(connection, userId, scope, mutationId, requestHash);
        if (replayReceipt) return replayReceipt;
        const headRow = await getHeadRow(connection, userId, scope);
        const currentRevisionId = headRow ? headRow.head_revision_id : null;
        if (baseRevisionId !== currentRevisionId) {
            const error = makeConflictError(scope, headRow);
            error.opsEventType = 'cas_conflict';
            error.opsScope = scope;
            throw error;
        }
        await persistLegacyGlobalRow(connection, userId, normalized);
        const revisionRecord = await insertRevision(connection, {
            userId,
            scope,
            headRow,
            operation: CLOUD_STATE_OPERATION_WRITE,
            mutationId,
            requestHash,
            normalized
        });
        const receipt = makeWriteReceipt(scope, revisionRecord, {
            protocolVersion: CLOUD_STATE_PROTOCOL_VERSION
        });
        await saveMutationReceipt(connection, userId, scope, mutationId, requestHash, receipt);
        await recordOpsEvent(connection, 'write', scope, normalized.dataSizeBytes);
        return receipt;
    });
}

async function listSlotHistory(userId, slotIndex, limit) {
    const scope = makeSlotScope(slotIndex);
    const normalizedLimit = parseHistoryLimit(limit);
    return withReadConnection(async (connection) => {
        const rows = await dbAll(
            connection,
            `SELECT r.revision_id, r.revision_number, r.parent_revision_id, r.source_revision_id, r.operation,
                    r.mutation_id, r.request_hash, r.content_hash, r.data_json, r.data_size_bytes,
                    client_updated_at, r.created_at, r.slot_index,
                    h.head_revision_id, h.head_updated_at,
                    CASE WHEN h.head_revision_id = r.revision_id THEN 1 ELSE 0 END AS is_head
             FROM cloud_state_revisions r
             LEFT JOIN cloud_state_heads h ON h.user_id = r.user_id AND h.entity_key = r.entity_key
             WHERE r.user_id = ? AND r.entity_key = ?
             ORDER BY revision_number DESC
             LIMIT ?`,
            [userId, scope.entityKey, normalizedLimit]
        );
        return {
            success: true,
            slotIndex: scope.slotIndex,
            headRevisionId: rows[0] ? rows[0].head_revision_id || null : null,
            history: rows.map(row => formatRevisionRecord(scope.entityType, row))
        };
    });
}

async function listGlobalHistory(userId, limit) {
    const scope = makeGlobalScope();
    const normalizedLimit = parseHistoryLimit(limit);
    return withReadConnection(async (connection) => {
        const rows = await dbAll(
            connection,
            `SELECT r.revision_id, r.revision_number, r.parent_revision_id, r.source_revision_id, r.operation,
                    r.mutation_id, r.request_hash, r.content_hash, r.data_json, r.data_size_bytes,
                    client_updated_at, r.created_at, r.slot_index,
                    h.head_revision_id, h.head_updated_at,
                    CASE WHEN h.head_revision_id = r.revision_id THEN 1 ELSE 0 END AS is_head
             FROM cloud_state_revisions r
             LEFT JOIN cloud_state_heads h ON h.user_id = r.user_id AND h.entity_key = r.entity_key
             WHERE r.user_id = ? AND r.entity_key = ?
             ORDER BY revision_number DESC
             LIMIT ?`,
            [userId, scope.entityKey, normalizedLimit]
        );
        return {
            success: true,
            headRevisionId: rows[0] ? rows[0].head_revision_id || null : null,
            history: rows.map(row => formatRevisionRecord(scope.entityType, row))
        };
    });
}

async function restoreSlot(userId, slotIndex, payload) {
    const scope = makeSlotScope(slotIndex);
    const sourceRevisionId = ensureSafeId(payload.sourceRevisionId, 'invalid_source_revision_id', 'sourceRevisionId 无效');
    const mutationId = ensureSafeId(payload.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    const baseRevisionId = validateBaseRevisionId(payload.baseRevisionId);
    const requestHash = makeRequestHash(payload);
    return withWriteTransaction(async (connection) => {
        const replayReceipt = await ensureMutationAvailable(connection, userId, scope, mutationId, requestHash);
        if (replayReceipt) return replayReceipt;
        const headRow = await getHeadRow(connection, userId, scope);
        const currentRevisionId = headRow ? headRow.head_revision_id : null;
        if (baseRevisionId !== currentRevisionId) {
            const error = makeConflictError(scope, headRow);
            error.opsEventType = 'cas_conflict';
            error.opsScope = scope;
            throw error;
        }
        const sourceRow = await getRevisionRow(connection, userId, scope, sourceRevisionId);
        if (!sourceRow) {
            throw makeError(404, 'save_revision_not_found', '待恢复的存档版本不存在');
        }
        const restoredValue = JSON.parse(sourceRow.data_json);
        const restoredCanonicalTime = Date.now();
        const normalized = normalizeSlotWritePayload(restoredValue, restoredCanonicalTime);
        await persistLegacySlotRow(connection, userId, scope.slotIndex, normalized);
        const revisionRecord = await insertRevision(connection, {
            userId,
            scope,
            headRow,
            operation: CLOUD_STATE_OPERATION_RESTORE,
            mutationId,
            requestHash,
            normalized,
            sourceRevisionId
        });
        const receipt = makeWriteReceipt(scope, revisionRecord, {
            protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
            restoredFromRevisionId: sourceRevisionId
        });
        await saveMutationReceipt(connection, userId, scope, mutationId, requestHash, receipt);
        await recordOpsEvent(connection, 'restore', scope, normalized.dataSizeBytes);
        return receipt;
    });
}

async function restoreGlobal(userId, payload) {
    const scope = makeGlobalScope();
    const sourceRevisionId = ensureSafeId(payload.sourceRevisionId, 'invalid_source_revision_id', 'sourceRevisionId 无效');
    const mutationId = ensureSafeId(payload.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    const baseRevisionId = validateBaseRevisionId(payload.baseRevisionId);
    const requestHash = makeRequestHash(payload);
    return withWriteTransaction(async (connection) => {
        const replayReceipt = await ensureMutationAvailable(connection, userId, scope, mutationId, requestHash);
        if (replayReceipt) return replayReceipt;
        const headRow = await getHeadRow(connection, userId, scope);
        const currentRevisionId = headRow ? headRow.head_revision_id : null;
        if (baseRevisionId !== currentRevisionId) {
            const error = makeConflictError(scope, headRow);
            error.opsEventType = 'cas_conflict';
            error.opsScope = scope;
            throw error;
        }
        const sourceRow = await getRevisionRow(connection, userId, scope, sourceRevisionId);
        if (!sourceRow) {
            throw makeError(404, 'global_revision_not_found', '待恢复的全局版本不存在');
        }
        const restoredValue = JSON.parse(sourceRow.data_json);
        const restoredCanonicalTime = Date.now();
        const normalized = normalizeGlobalWritePayload(restoredValue, restoredCanonicalTime);
        await persistLegacyGlobalRow(connection, userId, normalized);
        const revisionRecord = await insertRevision(connection, {
            userId,
            scope,
            headRow,
            operation: CLOUD_STATE_OPERATION_RESTORE,
            mutationId,
            requestHash,
            normalized,
            sourceRevisionId
        });
        const receipt = makeWriteReceipt(scope, revisionRecord, {
            protocolVersion: CLOUD_STATE_PROTOCOL_VERSION,
            restoredFromRevisionId: sourceRevisionId
        });
        await saveMutationReceipt(connection, userId, scope, mutationId, requestHash, receipt);
        await recordOpsEvent(connection, 'restore', scope, normalized.dataSizeBytes);
        return receipt;
    });
}

async function getOpsOverview() {
    return withReadConnection(async (connection) => {
        const [eventRows, headSummary, revisionSummary, currentHeadBytes] = await Promise.all([
            dbAll(
                connection,
                `SELECT event_type, COUNT(*) AS count, COALESCE(SUM(byte_count), 0) AS bytes
                 FROM cloud_state_ops_events
                 GROUP BY event_type`
            ),
            dbGet(
                connection,
                `SELECT
                    COUNT(*) AS total_heads,
                    SUM(CASE WHEN entity_type = 'slot' THEN 1 ELSE 0 END) AS slot_heads,
                    SUM(CASE WHEN entity_type = 'global' THEN 1 ELSE 0 END) AS global_heads
                 FROM cloud_state_heads`
            ),
            dbGet(
                connection,
                `SELECT COUNT(*) AS revision_count, COALESCE(SUM(data_size_bytes), 0) AS revision_bytes
                 FROM cloud_state_revisions`
            ),
            dbGet(
                connection,
                `SELECT COALESCE(SUM(r.data_size_bytes), 0) AS head_bytes
                 FROM cloud_state_heads h
                 JOIN cloud_state_revisions r ON r.revision_id = h.head_revision_id`
            )
        ]);
        const counters = new Map(eventRows.map(row => [row.event_type, {
            count: Number(row.count) || 0,
            bytes: Number(row.bytes) || 0
        }]));
        const casConflicts = counters.get('cas_conflict')?.count || 0;
        const mutationConflicts = counters.get('mutation_conflict')?.count || 0;
        return {
            success: true,
            reportVersion: CLOUD_STATE_REPORT_VERSION,
            activity: {
                acceptedWrites: counters.get('write')?.count || 0,
                restores: counters.get('restore')?.count || 0,
                legacyImports: counters.get('legacy_import')?.count || 0,
                conflicts: casConflicts + mutationConflicts,
                casConflicts,
                mutationConflicts,
                idempotentReplays: counters.get('idempotent_replay')?.count || 0
            },
            storage: {
                totalHeads: Number(headSummary?.total_heads) || 0,
                slotHeads: Number(headSummary?.slot_heads) || 0,
                globalHeads: Number(headSummary?.global_heads) || 0,
                revisionCount: Number(revisionSummary?.revision_count) || 0,
                currentHeadBytes: Number(currentHeadBytes?.head_bytes) || 0,
                revisionBytes: Number(revisionSummary?.revision_bytes) || 0
            },
            limits: {
                slotMaxBytes: CLOUD_STATE_SLOT_MAX_BYTES,
                globalMaxBytes: CLOUD_STATE_GLOBAL_MAX_BYTES,
                historyLimitMax: CLOUD_STATE_HISTORY_LIMIT_MAX
            }
        };
    });
}

module.exports = {
    CLOUD_STATE_PROTOCOL_VERSION,
    getGlobalHeadMetadata,
    getHeadMetadataMap,
    getOpsOverview,
    legacyWriteGlobal,
    legacyWriteSlot,
    listGlobalHistory,
    listSlotHistory,
    restoreGlobal,
    restoreSlot,
    v2WriteGlobal,
    v2WriteSlot
};
