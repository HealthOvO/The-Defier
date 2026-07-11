const crypto = require('node:crypto');
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { verifyRequestIntegrity } = require('../utils/hmac');
const {
    claimReward,
    getLedger,
    getOpsOverview,
    getStatus,
    recordClientEvents
} = require('../progression/service');
const {
    issueVerifiedRunTicket,
    recordVerifiedRunCheckpoint,
    settleVerifiedRun
} = require('../progression/verified-runs');
const {
    getAuthoritativeRun,
    getAuthoritativeRunOpsOverview,
    getAuthoritativeRunReplay,
    getCurrentAuthoritativeRun,
    issueAuthoritativeRun,
    pruneAuthoritativeRunHistory,
    settleAuthoritativeRun,
    submitAuthoritativeRunAction
} = require('../progression/authoritative-runs/service');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireSignedPayload(req, res, payload, route) {
    const integrity = verifyRequestIntegrity(JSON.stringify(payload), req.body && req.body.salt, req.body && req.body.signature, {
        route,
        userId: req.user && req.user.id,
        sessionToken: req.authToken,
        signatureMode: req.body && req.body.signatureMode
    });
    if (!integrity.ok || integrity.skipped) {
        res.status(integrity.ok ? 400 : integrity.status).json({
            success: false,
            reason: integrity.ok ? 'missing-signature' : integrity.reason,
            message: integrity.ok ? '缺少完整性签名' : integrity.message
        });
        return false;
    }
    return true;
}

function getSignedBusinessPayload(body) {
    const source = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
    delete source.salt;
    delete source.signature;
    delete source.signatureMode;
    return source;
}

function getOpsToken() {
    return String(process.env.DEFIER_OPS_TOKEN || '').trim();
}

function tokensEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length && leftBuffer.length > 0 && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireOpsToken(req, res) {
    const configured = getOpsToken();
    if (!configured) {
        res.status(404).json({ success: false, message: '运营接口不存在' });
        return false;
    }
    const provided = String(req.headers['x-defier-ops-token'] || '').trim();
    if (!provided) {
        res.status(404).json({ success: false, message: '运营接口不存在' });
        return false;
    }
    if (!tokensEqual(provided, configured)) {
        res.status(403).json({ success: false, message: '运营接口鉴权失败' });
        return false;
    }
    return true;
}

router.get('/status', authenticate, asyncHandler(async (req, res) => {
    res.json(await getStatus(req.user.id));
}));

router.post('/authoritative-runs', authenticate, asyncHandler(async (req, res) => {
    const payload = getSignedBusinessPayload(req.body);
    if (!requireSignedPayload(req, res, payload, 'POST /api/progression/authoritative-runs')) return;
    res.json(await issueAuthoritativeRun(req.user.id, payload));
}));

router.get('/authoritative-runs/current', authenticate, asyncHandler(async (req, res) => {
    res.json(await getCurrentAuthoritativeRun(req.user.id, req.query && req.query.mode));
}));

router.get('/authoritative-runs/:runId/replay', authenticate, asyncHandler(async (req, res) => {
    res.json(await getAuthoritativeRunReplay(req.user.id, req.params.runId));
}));

router.get('/authoritative-runs/:runId', authenticate, asyncHandler(async (req, res) => {
    res.json(await getAuthoritativeRun(req.user.id, req.params.runId));
}));

router.post('/authoritative-runs/:runId/actions', authenticate, asyncHandler(async (req, res) => {
    const runId = String(req.params.runId || '').trim();
    const payload = getSignedBusinessPayload(req.body);
    if (!runId || String(payload.runId || '').trim() !== runId) {
        return res.status(400).json({
            success: false,
            reason: 'authoritative_run_id_mismatch',
            message: '动作 run 与请求路径不一致'
        });
    }
    if (!requireSignedPayload(req, res, payload, 'POST /api/progression/authoritative-runs/:runId/actions')) return;
    res.json(await submitAuthoritativeRunAction(req.user.id, runId, payload));
}));

router.post('/authoritative-runs/:runId/settle', authenticate, asyncHandler(async (req, res) => {
    const runId = String(req.params.runId || '').trim();
    const payload = getSignedBusinessPayload(req.body);
    if (!runId || String(payload.runId || '').trim() !== runId) {
        return res.status(400).json({
            success: false,
            reason: 'authoritative_run_id_mismatch',
            message: '结算 run 与请求路径不一致'
        });
    }
    if (!requireSignedPayload(req, res, payload, 'POST /api/progression/authoritative-runs/:runId/settle')) return;
    res.json(await settleAuthoritativeRun(req.user.id, runId, payload));
}));

router.post('/verified-runs/tickets', authenticate, asyncHandler(async (req, res) => {
    const payload = getSignedBusinessPayload(req.body);
    if (!requireSignedPayload(req, res, payload, 'POST /api/progression/verified-runs/tickets')) return;
    res.json(await issueVerifiedRunTicket(req.user.id, payload));
}));

router.post('/verified-runs/:ticketId/checkpoints', authenticate, asyncHandler(async (req, res) => {
    const ticketId = String(req.params.ticketId || '').trim();
    const payload = getSignedBusinessPayload(req.body);
    if (!ticketId || String(payload.ticketId || '').trim() !== ticketId) {
        return res.status(400).json({
            success: false,
            reason: 'verified_run_ticket_mismatch',
            message: 'checkpoint ticket 与请求路径不一致'
        });
    }
    if (!requireSignedPayload(req, res, payload, 'POST /api/progression/verified-runs/:ticketId/checkpoints')) return;
    res.json(await recordVerifiedRunCheckpoint(req.user.id, ticketId, payload));
}));

router.post('/verified-runs/:ticketId/settle', authenticate, asyncHandler(async (req, res) => {
    const ticketId = String(req.params.ticketId || '').trim();
    const payload = getSignedBusinessPayload(req.body);
    if (!ticketId || String(payload.ticketId || '').trim() !== ticketId) {
        return res.status(400).json({
            success: false,
            reason: 'verified_run_ticket_mismatch',
            message: 'settlement ticket 与请求路径不一致'
        });
    }
    if (!requireSignedPayload(req, res, payload, 'POST /api/progression/verified-runs/:ticketId/settle')) return;
    res.json(await settleVerifiedRun(req.user.id, ticketId, payload));
}));

router.post('/events', authenticate, asyncHandler(async (req, res) => {
    const events = req.body && req.body.events;
    if (!requireSignedPayload(req, res, { events }, 'POST /api/progression/events')) return;
    res.json(await recordClientEvents(req.user.id, events));
}));

router.post('/rewards/:objectiveId/claim', authenticate, asyncHandler(async (req, res) => {
    const objectiveId = String(req.params.objectiveId || '').trim();
    const bodyObjectiveId = String(req.body && req.body.objectiveId || '').trim();
    const cycleId = String(req.body && req.body.cycleId || '').trim();
    if (!objectiveId || bodyObjectiveId !== objectiveId) {
        return res.status(400).json({
            success: false,
            reason: 'objective_id_mismatch',
            message: '领奖目标与请求路径不一致'
        });
    }
    if (!requireSignedPayload(req, res, { objectiveId, cycleId }, 'POST /api/progression/rewards/:objectiveId/claim')) return;
    res.json(await claimReward(req.user.id, objectiveId, cycleId));
}));

router.get('/ledger', authenticate, asyncHandler(async (req, res) => {
    res.json(await getLedger(req.user.id, {
        limit: req.query && req.query.limit,
        cursor: req.query && req.query.cursor
    }));
}));

router.get('/ops/overview', asyncHandler(async (req, res) => {
    if (!requireOpsToken(req, res)) return;
    res.json(await getOpsOverview());
}));

router.get('/ops/authoritative-runs', asyncHandler(async (req, res) => {
    if (!requireOpsToken(req, res)) return;
    res.json(await getAuthoritativeRunOpsOverview());
}));

router.post('/ops/authoritative-runs/retention', asyncHandler(async (req, res) => {
    if (!requireOpsToken(req, res)) return;
    res.json(await pruneAuthoritativeRunHistory(req.body && req.body.retentionDays));
}));

router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error && error.statusCode) || 500;
    if (status >= 500) console.error('[Progression] Route failed:', error);
    res.status(status).json({
        success: false,
        reason: error && error.reason || 'progression_error',
        message: status >= 500 ? '长期进度服务暂时不可用' : error.message,
        details: status < 500 && error && error.details || undefined,
        run: status < 500 && error && error.details && error.details.run || undefined,
        requestId: req.requestId
    });
});

module.exports = router;
