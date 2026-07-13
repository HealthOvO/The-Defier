const crypto = require('node:crypto');
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { verifyRequestIntegrity } = require('../utils/hmac');
const {
    claimChallengeLadderReward,
    getChallengeLadderOpsOverview,
    getCurrentChallengeLadder,
    startChallengeLadderAttempt,
    submitChallengeLadderResult
} = require('../challenge-ladder/service');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function getSignedBusinessPayload(body) {
    const source = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
    delete source.salt;
    delete source.signature;
    delete source.signatureMode;
    return source;
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

function requireOpsToken(req, res, next) {
    const configured = getOpsToken();
    const provided = String(req.headers['x-defier-ops-token'] || '').trim();
    if (!configured || !provided) {
        res.status(404).json({ success: false, message: '运营接口不存在' });
        return;
    }
    if (!tokensEqual(provided, configured)) {
        res.status(403).json({ success: false, message: '运营接口鉴权失败' });
        return;
    }
    next();
}

router.get('/current', authenticate, asyncHandler(async (req, res) => {
    res.json(await getCurrentChallengeLadder(req.user.id));
}));

router.post('/attempts', authenticate, asyncHandler(async (req, res) => {
    const payload = getSignedBusinessPayload(req.body);
    if (!requireSignedPayload(req, res, payload, 'POST /api/challenge-ladder/attempts')) return;
    res.json(await startChallengeLadderAttempt(req.user.id, payload));
}));

router.post('/results', authenticate, asyncHandler(async (req, res) => {
    const payload = getSignedBusinessPayload(req.body);
    if (!requireSignedPayload(req, res, payload, 'POST /api/challenge-ladder/results')) return;
    res.json(await submitChallengeLadderResult(req.user.id, payload));
}));

router.post('/rewards/:milestoneId/claim', authenticate, asyncHandler(async (req, res) => {
    const milestoneId = String(req.params.milestoneId || '').trim();
    const payload = getSignedBusinessPayload(req.body);
    if (!milestoneId || String(payload.milestoneId || '').trim() !== milestoneId) {
        return res.status(400).json({
            success: false,
            reason: 'milestone_id_mismatch',
            message: '里程碑与请求路径不一致'
        });
    }
    if (!requireSignedPayload(req, res, payload, 'POST /api/challenge-ladder/rewards/:milestoneId/claim')) return;
    res.json(await claimChallengeLadderReward(req.user.id, milestoneId, payload));
}));

router.get('/ops/overview', authenticate, requireOpsToken, asyncHandler(async (req, res) => {
    res.json(await getChallengeLadderOpsOverview());
}));

router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error && error.statusCode) || 500;
    if (status >= 500) console.error('[ChallengeLadder] Route failed:', error);
    res.status(status).json({
        success: false,
        reason: error && error.reason || 'challenge_ladder_error',
        message: status >= 500 ? '众生试炼服务暂时不可用' : error.message,
        details: status < 500 && error && error.details || undefined,
        requestId: req.requestId
    });
});

module.exports = router;
