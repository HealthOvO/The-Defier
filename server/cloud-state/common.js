const crypto = require('node:crypto');
const { getMaxAcceptedClientTimestamp, normalizeClientTimestamp } = require('../utils/timestamps');

const CLOUD_STATE_PROTOCOL_VERSION = 'cloud-state-v2';
const CLOUD_STATE_REPORT_VERSION = 'cloud-state-ops-overview-v1';
const CLOUD_STATE_SLOT_MAX_BYTES = 256 * 1024;
const CLOUD_STATE_GLOBAL_MAX_BYTES = 128 * 1024;
const CLOUD_STATE_HISTORY_LIMIT_MAX = 20;
const CLOUD_STATE_MAX_RETAINED_REVISIONS_PER_SCOPE = CLOUD_STATE_HISTORY_LIMIT_MAX * 2;
const CLOUD_STATE_MUTATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLOUD_STATE_OPS_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLOUD_STATE_ENTITY_SLOT = 'slot';
const CLOUD_STATE_ENTITY_GLOBAL = 'global';
const CLOUD_STATE_OPERATION_WRITE = 'write';
const CLOUD_STATE_OPERATION_RESTORE = 'restore';
const CLOUD_STATE_OPERATION_LEGACY_IMPORT = 'legacy_import';
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

function makeError(statusCode, reason, message, publicPayload) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.reason = reason;
    if (publicPayload && typeof publicPayload === 'object') {
        error.publicPayload = publicPayload;
    }
    return error;
}

function digest(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function deterministicId(prefix, parts) {
    return `${prefix}-${digest(parts.join('|')).slice(0, 32)}`;
}

function safeJsonParse(raw, fallback = null) {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

function clampStoredTimestamp(value, fallback = 0) {
    const fallbackNumber = Number(fallback);
    const normalizedFallback = Number.isFinite(fallbackNumber) && fallbackNumber >= 0
        ? Math.floor(fallbackNumber)
        : 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return normalizedFallback;
    return Math.floor(numeric);
}

function parseSlotIndex(slotIndex) {
    if (slotIndex === null || slotIndex === '') return null;
    if (typeof slotIndex !== 'number' && typeof slotIndex !== 'string') return null;
    const normalized = Number(slotIndex);
    if (!Number.isInteger(normalized) || normalized < 0 || normalized > 3) return null;
    return normalized;
}

function makeSlotScope(slotIndex) {
    const normalized = parseSlotIndex(slotIndex);
    if (normalized === null) {
        throw makeError(400, 'invalid_slot_index', '非法的存档槽位');
    }
    return {
        entityType: CLOUD_STATE_ENTITY_SLOT,
        entityKey: `slot:${normalized}`,
        slotIndex: normalized
    };
}

function makeGlobalScope() {
    return {
        entityType: CLOUD_STATE_ENTITY_GLOBAL,
        entityKey: CLOUD_STATE_ENTITY_GLOBAL,
        slotIndex: null
    };
}

function ensureSafeId(value, reason, message, { allowNull = false } = {}) {
    if (value === null && allowNull) return null;
    const text = String(value || '').trim();
    if (!SAFE_ID.test(text)) {
        throw makeError(400, reason, message);
    }
    return text;
}

function buildStoredSaveData(saveData, canonicalSaveTime) {
    if (saveData && typeof saveData === 'object' && !Array.isArray(saveData)) {
        return JSON.stringify({ ...saveData, timestamp: canonicalSaveTime });
    }
    if (typeof saveData === 'string') {
        try {
            const parsed = JSON.parse(saveData);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return JSON.stringify({ ...parsed, timestamp: canonicalSaveTime });
            }
        } catch (error) {
            // Preserve raw legacy string payloads.
        }
    }
    return typeof saveData === 'string' ? saveData : JSON.stringify(saveData);
}

function finalizeDataEnvelope(scopeType, dataValue, clientUpdatedAt, { enforceSizeLimit = true } = {}) {
    const dataJson = JSON.stringify(dataValue);
    const isSlot = scopeType === CLOUD_STATE_ENTITY_SLOT;
    if (typeof dataJson !== 'string') {
        throw makeError(
            400,
            isSlot ? 'invalid_save_payload' : 'invalid_global_payload',
            isSlot ? '存档数据无法序列化' : '全局数据无法序列化'
        );
    }
    const dataSizeBytes = Buffer.byteLength(dataJson, 'utf8');
    const maxBytes = isSlot ? CLOUD_STATE_SLOT_MAX_BYTES : CLOUD_STATE_GLOBAL_MAX_BYTES;
    if (enforceSizeLimit && dataSizeBytes > maxBytes) {
        throw makeError(
            413,
            isSlot ? 'save_payload_too_large' : 'global_payload_too_large',
            isSlot ? '存档数据体积超出限制' : '全局数据体积超出限制'
        );
    }
    return {
        dataValue,
        dataJson,
        dataSizeBytes,
        contentHash: digest(dataJson),
        clientUpdatedAt
    };
}

function normalizeSlotWritePayload(saveData, saveTime) {
    const clientUpdatedAt = normalizeClientTimestamp(saveTime);
    const storedLegacyData = buildStoredSaveData(saveData, clientUpdatedAt);
    if (typeof storedLegacyData !== 'string') {
        throw makeError(400, 'invalid_save_payload', '存档数据无法序列化');
    }
    let dataValue;
    try {
        dataValue = JSON.parse(storedLegacyData);
    } catch (error) {
        dataValue = storedLegacyData;
    }
    return {
        ...finalizeDataEnvelope(CLOUD_STATE_ENTITY_SLOT, dataValue, clientUpdatedAt),
        storedLegacyData
    };
}

function normalizeLegacyStoredSlot(saveData, saveTime) {
    const storedLegacyData = typeof saveData === 'string' ? saveData : JSON.stringify(saveData);
    if (typeof storedLegacyData !== 'string') {
        throw makeError(400, 'invalid_save_payload', '存档数据无法序列化');
    }
    let dataValue;
    try {
        dataValue = JSON.parse(storedLegacyData);
    } catch (error) {
        dataValue = storedLegacyData;
    }
    return {
        ...finalizeDataEnvelope(CLOUD_STATE_ENTITY_SLOT, dataValue, clampStoredTimestamp(saveTime), { enforceSizeLimit: false }),
        storedLegacyData
    };
}

function normalizeGlobalWritePayload(globalData, globalUpdatedAt) {
    if (!globalData || typeof globalData !== 'object' || Array.isArray(globalData)) {
        throw makeError(400, 'invalid_global_payload', '全局数据格式无效');
    }
    const embeddedUpdatedAt = clampStoredTimestamp(globalData.updatedAt, 0);
    const normalizedEmbeddedUpdatedAt = embeddedUpdatedAt > 0
        ? normalizeClientTimestamp(globalData.updatedAt)
        : 0;
    const clientUpdatedAt = normalizeClientTimestamp(
        globalUpdatedAt,
        normalizedEmbeddedUpdatedAt > 0 ? normalizedEmbeddedUpdatedAt : Date.now()
    );
    const storedGlobalData = { ...globalData, updatedAt: clientUpdatedAt };
    return {
        ...finalizeDataEnvelope(CLOUD_STATE_ENTITY_GLOBAL, storedGlobalData, clientUpdatedAt),
        storedLegacyData: JSON.stringify(storedGlobalData)
    };
}

function normalizeLegacyStoredGlobal(globalData, globalUpdatedAt) {
    const parsed = safeJsonParse(globalData, {});
    const safeObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    const embeddedUpdatedAt = clampStoredTimestamp(safeObject.updatedAt, 0);
    const clientUpdatedAt = clampStoredTimestamp(globalUpdatedAt, embeddedUpdatedAt);
    const storedGlobalData = { ...safeObject, updatedAt: clientUpdatedAt };
    return {
        ...finalizeDataEnvelope(CLOUD_STATE_ENTITY_GLOBAL, storedGlobalData, clientUpdatedAt, { enforceSizeLimit: false }),
        storedLegacyData: JSON.stringify(storedGlobalData)
    };
}

function compareLegacyTimestampForLww(existingTimestamp, referenceTime = Date.now()) {
    const stored = clampStoredTimestamp(existingTimestamp, 0);
    return stored > getMaxAcceptedClientTimestamp(referenceTime) ? 0 : stored;
}

function parseHistoryLimit(value) {
    if (value === undefined || value === null || value === '') {
        return CLOUD_STATE_HISTORY_LIMIT_MAX;
    }
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > CLOUD_STATE_HISTORY_LIMIT_MAX) {
        throw makeError(400, 'invalid_history_limit', '历史记录数量必须在 1 到 20 之间');
    }
    return limit;
}

function formatRevisionRecord(scopeType, row) {
    if (!row) return null;
    const dataValue = safeJsonParse(row.data_json, null);
    const base = {
        revisionId: row.revision_id,
        revisionNumber: Number(row.revision_number) || 0,
        parentRevisionId: row.parent_revision_id || null,
        sourceRevisionId: row.source_revision_id || null,
        operation: row.operation,
        contentHash: row.content_hash,
        clientUpdatedAt: Number(row.client_updated_at) || 0,
        createdAt: Number(row.created_at) || 0,
        headUpdatedAt: Number(row.head_updated_at) || Number(row.created_at) || 0,
        isHead: row.is_head === 1 || row.is_head === true
    };
    if (scopeType === CLOUD_STATE_ENTITY_SLOT) {
        return {
            ...base,
            slotIndex: Number(row.slot_index),
            saveTime: base.clientUpdatedAt,
            saveData: dataValue
        };
    }
    return {
        ...base,
        globalUpdatedAt: base.clientUpdatedAt,
        globalData: dataValue
    };
}

module.exports = {
    CLOUD_STATE_ENTITY_GLOBAL,
    CLOUD_STATE_ENTITY_SLOT,
    CLOUD_STATE_GLOBAL_MAX_BYTES,
    CLOUD_STATE_HISTORY_LIMIT_MAX,
    CLOUD_STATE_MAX_RETAINED_REVISIONS_PER_SCOPE,
    CLOUD_STATE_MUTATION_RETENTION_MS,
    CLOUD_STATE_OPS_EVENT_RETENTION_MS,
    CLOUD_STATE_OPERATION_LEGACY_IMPORT,
    CLOUD_STATE_OPERATION_RESTORE,
    CLOUD_STATE_OPERATION_WRITE,
    CLOUD_STATE_PROTOCOL_VERSION,
    CLOUD_STATE_REPORT_VERSION,
    CLOUD_STATE_SLOT_MAX_BYTES,
    SAFE_ID,
    buildStoredSaveData,
    clampStoredTimestamp,
    compareLegacyTimestampForLww,
    deterministicId,
    digest,
    ensureSafeId,
    finalizeDataEnvelope,
    formatRevisionRecord,
    makeError,
    makeGlobalScope,
    makeSlotScope,
    normalizeGlobalWritePayload,
    normalizeLegacyStoredGlobal,
    normalizeLegacyStoredSlot,
    normalizeSlotWritePayload,
    parseHistoryLimit,
    parseSlotIndex,
    safeJsonParse
};
