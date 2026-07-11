const crypto = require('node:crypto');
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { verifyRequestIntegrity } = require('../utils/hmac');
const { getStatus: getProgressionStatus } = require('../progression/service');
const {
    createLeaderboardSnapshot,
    getDashboard,
    getLeaderboard,
    getOpsOverview,
    getSeasonLedger,
    grantCompensation,
    purchaseOffer,
    reconcileSeason,
    settleSeason
} = require('../season-ops/service');

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

function getOpsToken() {
    return String(process.env.DEFIER_OPS_TOKEN || '').trim();
}

function tokensEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length === rightBuffer.length
        && leftBuffer.length > 0
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function requireOpsToken(req, res) {
    const configured = getOpsToken();
    const provided = String(req.headers['x-defier-ops-token'] || '').trim();
    if (!configured || !provided) {
        res.status(404).json({ success: false, message: '运营接口不存在' });
        return false;
    }
    if (!tokensEqual(provided, configured)) {
        res.status(403).json({ success: false, message: '运营接口鉴权失败' });
        return false;
    }
    return true;
}

function requireOpsTokenMiddleware(req, res, next) {
    if (!requireOpsToken(req, res)) return;
    next();
}

function getOpsContext(req) {
    return {
        actorId: String(req.user && req.user.id || ''),
        requestId: String(req.requestId || '')
    };
}

function requireSeasonConfirmation(req, res, seasonId) {
    const confirmed = String(req.body && req.body.confirmSeasonId || '').trim();
    if (!seasonId || confirmed !== seasonId) {
        res.status(400).json({
            success: false,
            reason: 'season_confirmation_required',
            message: '运营操作必须明确确认目标赛季'
        });
        return false;
    }
    return true;
}

router.get('/current', authenticate, asyncHandler(async (req, res) => {
    const [dashboard, progression] = await Promise.all([
        getDashboard(req.user.id),
        getProgressionStatus(req.user.id)
    ]);
    res.json({
        ...dashboard,
        cycles: progression.cycles,
        objectives: (progression.objectives || []).filter(entry => ['daily', 'weekly', 'season'].includes(entry.scope)),
        authorityBoundary: progression.authorityBoundary
    });
}));

router.get('/leaderboard', authenticate, asyncHandler(async (req, res) => {
    res.json(await getLeaderboard({
        userId: req.user.id,
        seasonId: req.query && req.query.seasonId,
        limit: req.query && req.query.limit
    }));
}));

router.get('/ledger', authenticate, asyncHandler(async (req, res) => {
    res.json(await getSeasonLedger(req.user.id, {
        limit: req.query && req.query.limit,
        cursor: req.query && req.query.cursor
    }));
}));

router.post('/store/purchases', authenticate, asyncHandler(async (req, res) => {
    const payload = {
        protocolVersion: String(req.body && req.body.protocolVersion || '').trim(),
        seasonId: String(req.body && req.body.seasonId || '').trim(),
        offerId: String(req.body && req.body.offerId || '').trim(),
        mutationId: String(req.body && req.body.mutationId || '').trim()
    };
    if (!requireSignedPayload(req, res, payload, 'POST /api/season-ops/store/purchases')) return;
    res.json(await purchaseOffer(req.user.id, payload));
}));

router.get('/ops/overview', requireOpsTokenMiddleware, authenticate, asyncHandler(async (req, res) => {
    res.json(await getOpsOverview());
}));

router.post('/ops/compensations', requireOpsTokenMiddleware, authenticate, asyncHandler(async (req, res) => {
    res.json(await grantCompensation(getOpsContext(req), {
        protocolVersion: String(req.body && req.body.protocolVersion || '').trim(),
        seasonId: String(req.body && req.body.seasonId || '').trim(),
        targetUserId: String(req.body && req.body.targetUserId || '').trim(),
        confirmTargetUserId: String(req.body && req.body.confirmTargetUserId || '').trim(),
        mutationId: String(req.body && req.body.mutationId || '').trim(),
        reasonCode: String(req.body && req.body.reasonCode || '').trim(),
        amount: req.body && req.body.amount
    }));
}));

router.post('/ops/seasons/:seasonId/snapshot', requireOpsTokenMiddleware, authenticate, asyncHandler(async (req, res) => {
    const seasonId = String(req.params.seasonId || '').trim();
    if (!requireSeasonConfirmation(req, res, seasonId)) return;
    res.json(await createLeaderboardSnapshot(seasonId, getOpsContext(req)));
}));

router.post('/ops/seasons/:seasonId/settle', requireOpsTokenMiddleware, authenticate, asyncHandler(async (req, res) => {
    const seasonId = String(req.params.seasonId || '').trim();
    if (!requireSeasonConfirmation(req, res, seasonId)) return;
    res.json(await settleSeason(seasonId, getOpsContext(req)));
}));

router.post('/ops/seasons/:seasonId/reconcile', requireOpsTokenMiddleware, authenticate, asyncHandler(async (req, res) => {
    const seasonId = String(req.params.seasonId || '').trim();
    if (!requireSeasonConfirmation(req, res, seasonId)) return;
    res.json(await reconcileSeason(seasonId, getOpsContext(req)));
}));

router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error && error.statusCode) || 500;
    if (status >= 500) console.error('[SeasonOps] Route failed:', error);
    res.status(status).json({
        success: false,
        reason: error && error.reason || 'season_ops_error',
        message: status >= 500 ? '赛季运营服务暂时不可用' : error.message,
        requestId: req.requestId
    });
});

module.exports = router;
