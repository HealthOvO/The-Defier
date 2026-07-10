const crypto = require('node:crypto');
const express = require('express');
const { db } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { verifyRequestIntegrity } = require('../utils/hmac');
const {
    CLOUD_STATE_PROTOCOL_VERSION,
    SAFE_ID,
    makeError
} = require('../cloud-state/common');
const {
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
} = require('../cloud-state/service');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row || null);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

function tokensEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length
        && leftBuffer.length > 0
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getOpsToken() {
    return String(process.env.DEFIER_OPS_TOKEN || '').trim();
}

function requireOpsToken(req, res) {
    const configured = getOpsToken();
    if (!configured) {
        res.status(404).json({ success: false, reason: 'ops_disabled', message: '运营接口不存在' });
        return false;
    }
    const provided = String(req.headers['x-defier-ops-token'] || '').trim();
    if (!provided) {
        res.status(404).json({ success: false, reason: 'ops_disabled', message: '运营接口不存在' });
        return false;
    }
    if (!tokensEqual(provided, configured)) {
        res.status(403).json({ success: false, reason: 'ops_auth_failed', message: '运营接口鉴权失败' });
        return false;
    }
    return true;
}

function parseMaybeJson(raw) {
    if (typeof raw !== 'string') return raw;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return raw;
    }
}

function enforceExactBody(body, requiredKeys, reason = 'invalid_payload_shape') {
    const source = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const allowedKeys = new Set([...requiredKeys, 'salt', 'signature', 'signatureMode']);
    for (const key of requiredKeys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) {
            throw makeError(400, reason, `缺少字段 ${key}`);
        }
    }
    for (const key of Object.keys(source)) {
        if (!allowedKeys.has(key)) {
            throw makeError(400, reason, `请求体包含未允许字段 ${key}`);
        }
    }
}

function requireSafeOptionalId(value, reason, message, { allowNull = false } = {}) {
    if (value === null && allowNull) return null;
    const text = String(value || '').trim();
    if (!SAFE_ID.test(text)) {
        throw makeError(400, reason, message);
    }
    return text;
}

function ensureSignedPayload(req, payload, route, { required = false } = {}) {
    const signedData = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const integrity = verifyRequestIntegrity(
        signedData,
        req.body && req.body.salt,
        req.body && req.body.signature,
        {
            route,
            userId: req.user && req.user.id,
            sessionToken: req.authToken,
            signatureMode: req.body && req.body.signatureMode
        }
    );
    if (integrity.ok && !integrity.skipped) {
        return;
    }
    if (integrity.ok && integrity.skipped && !required) {
        return;
    }
    if (integrity.ok && integrity.skipped) {
        throw makeError(400, 'missing-signature', '缺少完整性签名');
    }
    throw makeError(integrity.status, integrity.reason, integrity.message);
}

function buildV2SlotWritePayload(body) {
    enforceExactBody(body, ['protocolVersion', 'slotIndex', 'baseRevisionId', 'mutationId', 'saveData', 'saveTime']);
    if (body.protocolVersion !== CLOUD_STATE_PROTOCOL_VERSION) {
        throw makeError(400, 'invalid_protocol_version', 'protocolVersion 无效');
    }
    if (body.baseRevisionId !== null) {
        requireSafeOptionalId(body.baseRevisionId, 'invalid_base_revision_id', 'baseRevisionId 无效');
    }
    requireSafeOptionalId(body.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    return {
        protocolVersion: body.protocolVersion,
        slotIndex: body.slotIndex,
        baseRevisionId: body.baseRevisionId,
        mutationId: body.mutationId,
        saveData: body.saveData,
        saveTime: body.saveTime
    };
}

function buildV2GlobalWritePayload(body) {
    enforceExactBody(body, ['protocolVersion', 'baseRevisionId', 'mutationId', 'globalData', 'globalUpdatedAt']);
    if (body.protocolVersion !== CLOUD_STATE_PROTOCOL_VERSION) {
        throw makeError(400, 'invalid_protocol_version', 'protocolVersion 无效');
    }
    if (body.baseRevisionId !== null) {
        requireSafeOptionalId(body.baseRevisionId, 'invalid_base_revision_id', 'baseRevisionId 无效');
    }
    requireSafeOptionalId(body.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    return {
        protocolVersion: body.protocolVersion,
        baseRevisionId: body.baseRevisionId,
        mutationId: body.mutationId,
        globalData: body.globalData,
        globalUpdatedAt: body.globalUpdatedAt
    };
}

function buildV2SlotRestorePayload(body, slotIndex) {
    enforceExactBody(body, ['protocolVersion', 'slotIndex', 'baseRevisionId', 'sourceRevisionId', 'mutationId']);
    if (body.protocolVersion !== CLOUD_STATE_PROTOCOL_VERSION) {
        throw makeError(400, 'invalid_protocol_version', 'protocolVersion 无效');
    }
    if (Number(body.slotIndex) !== Number(slotIndex)) {
        throw makeError(400, 'slot_index_mismatch', '请求体 slotIndex 与路径不一致');
    }
    if (body.baseRevisionId !== null) {
        requireSafeOptionalId(body.baseRevisionId, 'invalid_base_revision_id', 'baseRevisionId 无效');
    }
    requireSafeOptionalId(body.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    requireSafeOptionalId(body.sourceRevisionId, 'invalid_source_revision_id', 'sourceRevisionId 无效');
    return {
        protocolVersion: body.protocolVersion,
        slotIndex: Number(body.slotIndex),
        baseRevisionId: body.baseRevisionId,
        sourceRevisionId: body.sourceRevisionId,
        mutationId: body.mutationId
    };
}

function buildV2GlobalRestorePayload(body) {
    enforceExactBody(body, ['protocolVersion', 'baseRevisionId', 'sourceRevisionId', 'mutationId']);
    if (body.protocolVersion !== CLOUD_STATE_PROTOCOL_VERSION) {
        throw makeError(400, 'invalid_protocol_version', 'protocolVersion 无效');
    }
    if (body.baseRevisionId !== null) {
        requireSafeOptionalId(body.baseRevisionId, 'invalid_base_revision_id', 'baseRevisionId 无效');
    }
    requireSafeOptionalId(body.mutationId, 'invalid_mutation_id', 'mutationId 无效');
    requireSafeOptionalId(body.sourceRevisionId, 'invalid_source_revision_id', 'sourceRevisionId 无效');
    return {
        protocolVersion: body.protocolVersion,
        baseRevisionId: body.baseRevisionId,
        sourceRevisionId: body.sourceRevisionId,
        mutationId: body.mutationId
    };
}

router.post('/', authenticate, asyncHandler(async (req, res) => {
    if (req.body && req.body.protocolVersion !== undefined && req.body.protocolVersion !== null) {
        if (req.body.protocolVersion !== CLOUD_STATE_PROTOCOL_VERSION) {
            throw makeError(400, 'invalid_protocol_version', 'protocolVersion 无效');
        }
        const payload = buildV2SlotWritePayload(req.body);
        ensureSignedPayload(req, payload, 'POST /api/saves', { required: true });
        res.json(await v2WriteSlot(req.user.id, payload));
        return;
    }

    const { slotIndex, saveData, saveTime } = req.body || {};
    if (slotIndex === undefined || !saveData) {
        throw makeError(400, 'missing_required_fields', '参数不完整');
    }
    ensureSignedPayload(req, typeof saveData === 'string' ? saveData : saveData, 'POST /api/saves', { required: false });
    res.json(await legacyWriteSlot(req.user.id, { slotIndex, saveData, saveTime }));
}));

router.get('/', authenticate, asyncHandler(async (req, res) => {
    const [rows, headMap] = await Promise.all([
        dbAll(
            `SELECT slot_index AS slotIndex, save_data AS saveData, save_time AS saveTime
             FROM game_saves
             WHERE user_id = ?
             ORDER BY slot_index ASC`,
            [req.user.id]
        ),
        getHeadMetadataMap(req.user.id)
    ]);
    const data = rows.map((row) => {
        const saveData = parseMaybeJson(row.saveData);
        const metadata = headMap.get(`slot:${Number(row.slotIndex)}`);
        return {
            slotIndex: Number(row.slotIndex),
            saveData,
            saveTime: Number(row.saveTime) || 0,
            revisionId: metadata ? metadata.revisionId : null,
            revisionNumber: metadata ? metadata.revisionNumber : null,
            contentHash: metadata ? metadata.contentHash : null,
            headUpdatedAt: metadata ? metadata.headUpdatedAt : null
        };
    });
    res.json({ success: true, data });
}));

router.get('/slots/:slotIndex/history', authenticate, asyncHandler(async (req, res) => {
    res.json(await listSlotHistory(req.user.id, req.params.slotIndex, req.query && req.query.limit));
}));

router.post('/slots/:slotIndex/restore', authenticate, asyncHandler(async (req, res) => {
    const payload = buildV2SlotRestorePayload(req.body || {}, req.params.slotIndex);
    ensureSignedPayload(req, payload, 'POST /api/saves/slots/:slotIndex/restore', { required: true });
    res.json(await restoreSlot(req.user.id, req.params.slotIndex, payload));
}));

router.post('/global', authenticate, asyncHandler(async (req, res) => {
    if (req.body && req.body.protocolVersion !== undefined && req.body.protocolVersion !== null) {
        if (req.body.protocolVersion !== CLOUD_STATE_PROTOCOL_VERSION) {
            throw makeError(400, 'invalid_protocol_version', 'protocolVersion 无效');
        }
        const payload = buildV2GlobalWritePayload(req.body);
        ensureSignedPayload(req, payload, 'POST /api/user/global', { required: true });
        res.json(await v2WriteGlobal(req.user.id, payload));
        return;
    }

    const { globalData, globalUpdatedAt } = req.body || {};
    if (globalData === undefined || globalData === null) {
        throw makeError(400, 'missing_required_fields', '参数不完整');
    }
    ensureSignedPayload(req, globalData, 'POST /api/user/global', { required: false });
    res.json(await legacyWriteGlobal(req.user.id, { globalData, globalUpdatedAt }));
}));

router.get('/global', authenticate, asyncHandler(async (req, res) => {
    const [row, metadata] = await Promise.all([
        dbGet(
            `SELECT global_data, global_updated_at
             FROM users
             WHERE id = ?`,
            [req.user.id]
        ),
        getGlobalHeadMetadata(req.user.id)
    ]);
    const data = row && row.global_data ? parseMaybeJson(row.global_data) : null;
    res.json({
        success: true,
        data,
        globalUpdatedAt: row && row.global_updated_at ? Number(row.global_updated_at) : 0,
        revisionId: metadata ? metadata.revisionId : null,
        revisionNumber: metadata ? metadata.revisionNumber : null,
        contentHash: metadata ? metadata.contentHash : null,
        headUpdatedAt: metadata ? metadata.headUpdatedAt : null
    });
}));

router.get('/global/history', authenticate, asyncHandler(async (req, res) => {
    res.json(await listGlobalHistory(req.user.id, req.query && req.query.limit));
}));

router.post('/global/restore', authenticate, asyncHandler(async (req, res) => {
    const payload = buildV2GlobalRestorePayload(req.body || {});
    ensureSignedPayload(req, payload, 'POST /api/user/global/restore', { required: true });
    res.json(await restoreGlobal(req.user.id, payload));
}));

router.get('/ops/overview', asyncHandler(async (req, res) => {
    if (!requireOpsToken(req, res)) return;
    res.json(await getOpsOverview());
}));

router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error && error.statusCode) || 500;
    if (status >= 500) {
        console.error('[CloudState] Route failed:', error);
    }
    const payload = {
        success: false,
        reason: error && error.reason ? error.reason : 'cloud_state_error',
        message: status >= 500 ? '云状态服务暂时不可用' : error.message
    };
    if (error && error.publicPayload && typeof error.publicPayload === 'object') {
        Object.assign(payload, error.publicPayload);
    }
    if (status >= 500) {
        payload.requestId = req.requestId;
    }
    res.status(status).json(payload);
});

module.exports = router;
