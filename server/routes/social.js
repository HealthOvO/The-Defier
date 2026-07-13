const express = require('express');
const { authenticate } = require('../middleware/auth');
const { verifyRequestIntegrity } = require('../utils/hmac');
const {
    acceptFriendRequest,
    cancelFriendRequest,
    declineFriendRequest,
    getSocialDashboard,
    recordPresenceHeartbeat,
    removeFriend,
    searchProfile,
    sendFriendRequest,
    setRelationshipControl,
    updateSocialPreferences
} = require('../account-social/social-service');
const {
    acceptRiftSquadInvite,
    claimRiftSquadReward,
    createRiftSquad,
    declineRiftSquadInvite,
    getRiftSquadDashboard,
    inviteRiftSquadFriend,
    leaveRiftSquad
} = require('../account-social/squad-service');

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
            message: integrity.ok ? (integrity.skipped ? '缺少完整性签名' : '道友操作需要绑定请求路径的会话签名') : integrity.message
        });
        return false;
    }
    return true;
}

function signedMutation(route, handler, bindPayload = (req, payload) => payload) {
    return [authenticate, asyncHandler(async (req, res) => {
        const payload = bindPayload(req, getSignedBusinessPayload(req.body));
        if (!requireSignedPayload(req, res, payload, route)) return;
        res.json(await handler(req, payload));
    })];
}

router.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
    const [social, riftSquad] = await Promise.all([
        getSocialDashboard(req.user.id),
        getRiftSquadDashboard(req.user.id)
    ]);
    res.json({
        ...(social && typeof social === 'object' ? social : { success: true }),
        riftSquad
    });
}));

router.get('/search', authenticate, asyncHandler(async (req, res) => {
    res.json(await searchProfile(req.user.id, { targetUsername: String(req.query.username || '') }));
}));

router.post('/requests', ...signedMutation('POST /api/social/requests', (req, payload) => (
    sendFriendRequest(req.user.id, payload)
)));
router.post('/requests/:requestId/accept', ...signedMutation('POST /api/social/requests/:requestId/accept', (req, payload) => (
    acceptFriendRequest(req.user.id, payload)
), (req, payload) => ({ ...payload, requestId: String(req.params.requestId || '') })));
router.post('/requests/:requestId/decline', ...signedMutation('POST /api/social/requests/:requestId/decline', (req, payload) => (
    declineFriendRequest(req.user.id, payload)
), (req, payload) => ({ ...payload, requestId: String(req.params.requestId || '') })));
router.post('/requests/:requestId/cancel', ...signedMutation('POST /api/social/requests/:requestId/cancel', (req, payload) => (
    cancelFriendRequest(req.user.id, payload)
), (req, payload) => ({ ...payload, requestId: String(req.params.requestId || '') })));
router.post('/friends/:profileId/remove', ...signedMutation('POST /api/social/friends/:profileId/remove', (req, payload) => (
    removeFriend(req.user.id, payload)
), (req, payload) => ({ ...payload, profileId: String(req.params.profileId || '') })));

for (const action of ['block', 'unblock', 'mute', 'unmute']) {
    router.post(`/controls/:profileId/${action}`, ...signedMutation(`POST /api/social/controls/:profileId/${action}`, (req, payload) => (
        setRelationshipControl(req.user.id, payload)
    ), (req, payload) => ({ ...payload, profileId: String(req.params.profileId || ''), action })));
}

router.post('/preferences', ...signedMutation('POST /api/social/preferences', (req, payload) => (
    updateSocialPreferences(req.user.id, payload)
)));
router.post('/presence/heartbeat', ...signedMutation('POST /api/social/presence/heartbeat', (req, payload) => (
    recordPresenceHeartbeat(req.user.id, payload)
)));

router.post('/rift-squads', ...signedMutation('POST /api/social/rift-squads', (req, payload) => (
    createRiftSquad(req.user.id, payload)
)));
router.post('/rift-squads/invites', ...signedMutation('POST /api/social/rift-squads/invites', (req, payload) => {
    const { squadId, rotationId, ...request } = payload;
    return inviteRiftSquadFriend(req.user.id, String(squadId || ''), request);
}));
router.post('/rift-squads/invites/:inviteId/accept', ...signedMutation('POST /api/social/rift-squads/invites/:inviteId/accept', (req, payload) => {
    const { inviteId, ...request } = payload;
    return acceptRiftSquadInvite(req.user.id, String(inviteId || ''), request);
}, (req, payload) => ({ ...payload, inviteId: String(req.params.inviteId || '') })));
router.post('/rift-squads/invites/:inviteId/decline', ...signedMutation('POST /api/social/rift-squads/invites/:inviteId/decline', (req, payload) => {
    const { inviteId, ...request } = payload;
    return declineRiftSquadInvite(req.user.id, String(inviteId || ''), request);
}, (req, payload) => ({ ...payload, inviteId: String(req.params.inviteId || '') })));
router.post('/rift-squads/leave', ...signedMutation('POST /api/social/rift-squads/leave', (req, payload) => {
    const { squadId, rotationId, ...request } = payload;
    return leaveRiftSquad(req.user.id, String(squadId || ''), request);
}));
router.post('/rift-squads/rewards/:milestoneId/claim', ...signedMutation('POST /api/social/rift-squads/rewards/:milestoneId/claim', (req, payload) => {
    const { squadId, ...request } = payload;
    return claimRiftSquadReward(req.user.id, String(squadId || ''), String(req.params.milestoneId || ''), request);
}, (req, payload) => ({ ...payload, milestoneId: String(req.params.milestoneId || '') })));

router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number(error && error.statusCode) || 500;
    if (status >= 500) console.error('[AccountSocial] Route failed:', error);
    res.status(status).json({
        success: false,
        reason: error && error.reason || 'account_social_error',
        message: status >= 500 ? '道友录服务暂时不可用' : error.message,
        details: status < 500 && error && error.details || undefined,
        requestId: req.requestId
    });
});

module.exports = router;
