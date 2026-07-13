const express = require('express');
const { verifyRequestIntegrity } = require('../utils/hmac');
const { authenticate } = require('../middleware/auth');
const {
    changePassword,
    getSecurityOverview,
    loginAccount,
    logoutAllSessions,
    logoutSession,
    registerAccount,
    revokeSession
} = require('../account-social/security-service');

const router = express.Router();

function asyncHandler(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function getClientIp(req) {
    return String(req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || '').trim();
}

function getClientUserAgent(req) {
    return String(req.headers['user-agent'] || '').trim();
}

function getClientDeviceContext(req) {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    return {
        deviceId: String(body.deviceId || req.headers['x-defier-device-id'] || '').trim(),
        deviceName: String(body.deviceName || req.headers['x-defier-device-name'] || '').trim()
    };
}

function getSignedPayload(body, extra = {}) {
    const source = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
    delete source.salt;
    delete source.signature;
    delete source.signatureMode;
    return {
        ...source,
        ...extra
    };
}

function requireSignedPayload(req, res, payload, route) {
    const signedRoute = `${String(req.method || '').toUpperCase()} ${req.baseUrl}${req.path}`;
    const integrity = verifyRequestIntegrity(JSON.stringify(payload), req.body && req.body.salt, req.body && req.body.signature, {
        route: signedRoute,
        userId: req.user && req.user.id,
        sessionToken: req.authToken,
        signatureMode: req.body && req.body.signatureMode
    });
    if (!integrity.ok || integrity.skipped || integrity.mode !== 'session-v2') {
        res.status(integrity.ok ? 400 : integrity.status).json({
            success: false,
            reason: integrity.ok ? (integrity.skipped ? 'missing-signature' : 'route-bound-signature-required') : integrity.reason,
            message: integrity.ok ? (integrity.skipped ? '缺少完整性签名' : '账号安全操作需要绑定请求路径的会话签名') : integrity.message,
            requestId: req.requestId
        });
        return false;
    }
    return true;
}

router.post('/register', asyncHandler(async (req, res) => {
    const { deviceId, deviceName } = getClientDeviceContext(req);
    const response = await registerAccount({
        username: req.body && req.body.username,
        password: req.body && req.body.password,
        deviceId,
        deviceName,
        ipAddress: getClientIp(req),
        userAgent: getClientUserAgent(req)
    });
    res.json(response);
}));

router.post('/login', asyncHandler(async (req, res) => {
    const { deviceId, deviceName } = getClientDeviceContext(req);
    const response = await loginAccount({
        username: req.body && req.body.username,
        password: req.body && req.body.password,
        deviceId,
        deviceName,
        ipAddress: getClientIp(req),
        userAgent: getClientUserAgent(req)
    });
    res.json(response);
}));

router.get('/security', authenticate, asyncHandler(async (req, res) => {
    res.json(await getSecurityOverview({
        userId: req.user.id,
        currentSessionId: req.authSession && req.authSession.sessionId || null,
        isLegacy: !!req.authLegacy
    }));
}));

router.post('/password/change', authenticate, asyncHandler(async (req, res) => {
    const payload = getSignedPayload(req.body);
    if (!requireSignedPayload(req, res, payload, 'POST /api/auth/password/change')) return;
    const { deviceId, deviceName } = getClientDeviceContext(req);
    res.json(await changePassword({
        userId: req.user.id,
        currentPassword: req.body && req.body.currentPassword,
        newPassword: req.body && req.body.newPassword,
        mutationId: req.body && req.body.mutationId,
        currentSessionId: req.authSession && req.authSession.sessionId || null,
        deviceId,
        deviceName,
        ipAddress: getClientIp(req),
        userAgent: getClientUserAgent(req)
    }));
}));

router.post('/sessions/:sessionId/revoke', authenticate, asyncHandler(async (req, res) => {
    const payload = getSignedPayload(req.body, {
        targetSessionId: String(req.params.sessionId || '').trim()
    });
    if (!requireSignedPayload(req, res, payload, 'POST /api/auth/sessions/:sessionId/revoke')) return;
    res.json(await revokeSession({
        userId: req.user.id,
        targetSessionId: req.params.sessionId,
        currentSessionId: req.authSession && req.authSession.sessionId || null,
        mutationId: req.body && req.body.mutationId
    }));
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
    res.json(await logoutSession({
        userId: req.user.id,
        currentSessionId: req.authSession && req.authSession.sessionId || null,
        isLegacy: !!req.authLegacy
    }));
}));

router.post('/logout-all', authenticate, asyncHandler(async (req, res) => {
    const payload = getSignedPayload(req.body);
    if (!requireSignedPayload(req, res, payload, 'POST /api/auth/logout-all')) return;
    res.json(await logoutAllSessions({
        userId: req.user.id,
        mutationId: req.body && req.body.mutationId
    }));
}));

router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error && error.status) || 500;
    if (status >= 500) {
        console.error('[Auth] Route failed:', error);
    }
    res.status(status).json({
        success: false,
        reason: error && error.reason || 'auth_error',
        message: error && error.message || '服务器内部错误',
        retryAfterSeconds: Number(error && error.retryAfterSeconds) > 0 ? Number(error.retryAfterSeconds) : undefined,
        requestId: req.requestId
    });
});

module.exports = router;
