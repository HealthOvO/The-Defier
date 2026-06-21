const express = require('express');
const { authenticate } = require('../middleware/auth');
const { db } = require('../db/database');
const { createLivePvpStore } = require('../pvp-live/live-store');
const { buildMatchReplay, normalizeReplayVisibility } = require('../pvp-live/replay');
const { sanitizePublicEvent } = require('../pvp-live/engine/state-view');

const router = express.Router();
const livePvpStore = createLivePvpStore({
    turnTimeoutMs: Number(process.env.PVP_LIVE_TURN_TIMEOUT_MS),
    setupReadyTimeoutMs: Number(process.env.PVP_LIVE_SETUP_READY_TIMEOUT_MS || process.env.PVP_LIVE_TURN_TIMEOUT_MS),
    longWaitThresholdMs: Number(process.env.PVP_LIVE_LONG_WAIT_THRESHOLD_MS),
    heartbeatIntervalMs: Number(process.env.PVP_LIVE_HEARTBEAT_INTERVAL_MS),
    heartbeatStaleMs: Number(process.env.PVP_LIVE_HEARTBEAT_STALE_MS),
    reconnectGraceMs: Number(process.env.PVP_LIVE_RECONNECT_GRACE_MS),
    inviteTtlMs: Number(process.env.PVP_LIVE_INVITE_TTL_MS),
    rematchTtlMs: Number(process.env.PVP_LIVE_REMATCH_TTL_MS),
    ratingProvider: makeDefaultRatingProvider()
});
let userDirectory = makeDefaultUserDirectory();

function asyncHandler(fn) {
    return (req, res) => {
        Promise.resolve(fn(req, res)).catch((error) => {
            if (error && error.code === 'loadout_illegal') {
                return res.status(400).json({
                    success: false,
                    reason: error.reason || 'loadout_illegal',
                    message: error.message || '斗法谱未通过排位校验'
                });
            }
            console.error('[PVP Live] Route failed:', error);
            res.status(500).json({ success: false, message: '实时论道服务异常' });
        });
    };
}

function getDisplayName(req) {
    if (req.body && typeof req.body.displayName === 'string' && req.body.displayName.trim()) {
        return req.body.displayName;
    }
    return req.user && (req.user.username || req.user.id);
}

function makeDefaultUserDirectory() {
    return {
        async findUserByUsername(username) {
            const name = String(username || '').trim();
            if (!name) return null;
            return await new Promise((resolve, reject) => {
                db.get(
                    `SELECT id, username FROM users
                     WHERE username = ?
                     LIMIT 1`,
                    [name],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row ? { id: row.id, username: row.username } : null);
                    }
                );
            });
        }
    };
}

function makeDefaultRatingProvider() {
    return {
        async getLivePvpRating(userId) {
            const id = String(userId || '').trim();
            if (!id) {
                return { score: 1000, division: '玄阶', seasonId: 's1-genesis', provisional: true, rankedGames: 0, lowSampleProtected: true };
            }
            const row = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT score, division, season_id, wins, losses FROM pvp_ranks
                     WHERE user_id = ?
                     LIMIT 1`,
                    [id],
                    (err, resultRow) => {
                        if (err) reject(err);
                        else resolve(resultRow || null);
                    }
                );
            });
            if (!row) {
                return { score: 1000, division: '玄阶', seasonId: 's1-genesis', provisional: true, rankedGames: 0, lowSampleProtected: true };
            }
            return {
                score: row.score,
                division: row.division || '玄阶',
                seasonId: row.season_id || 's1-genesis',
                provisional: false,
                rankedGames: Math.max(0, Math.floor(Number(row.wins) || 0) + Math.floor(Number(row.losses) || 0))
            };
        }
    };
}

function getTargetUsername(req) {
    return String(req.body && req.body.targetUsername || '').trim();
}

function isLivePvpTestModeEnabled() {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return false;
    return ['1', 'true', 'yes', 'on'].includes(String(process.env.DEFIER_PVP_TEST_MODE || '').toLowerCase());
}

async function resolveInviteTarget(req, res) {
    const targetUsername = getTargetUsername(req);
    if (!targetUsername) return null;
    if (targetUsername === (req.user && req.user.username)) {
        res.status(409).json({ success: false, reason: 'invite_self_target', message: '不能邀请自己进行好友约战' });
        return false;
    }
    if (!userDirectory || typeof userDirectory.findUserByUsername !== 'function') {
        res.status(404).json({ success: false, reason: 'target_user_not_found', message: '没有找到该道友' });
        return false;
    }
    const targetUser = await userDirectory.findUserByUsername(targetUsername);
    if (!targetUser || !targetUser.id) {
        res.status(404).json({ success: false, reason: 'target_user_not_found', message: '没有找到该道友' });
        return false;
    }
    if (targetUser.id === req.user.id) {
        res.status(409).json({ success: false, reason: 'invite_self_target', message: '不能邀请自己进行好友约战' });
        return false;
    }
    return {
        userId: String(targetUser.id),
        displayName: String(targetUser.username || targetUsername).trim().slice(0, 40) || targetUsername
    };
}

router.post('/test/matches/:matchId/seats/:seatId', authenticate, asyncHandler(async (req, res) => {
    if (!isLivePvpTestModeEnabled()) {
        return res.status(404).json({ success: false, message: '实时论道测试入口不存在' });
    }
    const result = await livePvpStore.forceSeatStateForTest(req.user.id, req.params.matchId, req.params.seatId, req.body || {});
    if (!result) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    res.json({
        success: true,
        matchId: result.match.matchId,
        seatId: result.seatId,
        targetSeatId: result.targetSeatId,
        stateView: result.stateView
    });
}));

router.post('/queue/join', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.joinQueue({
        userId: req.user.id,
        displayName: getDisplayName(req),
        loadout: req.body && req.body.loadout,
        wideMatchConsent: req.body && req.body.wideMatchConsent,
        testMatchScope: isLivePvpTestModeEnabled() ? req.body && req.body.testMatchScope : '',
        connectionHealthProbe: req.body && req.body.connectionHealthProbe
    });
    if (result && result.status === 'blocked') {
        return res.status(409).json({
            success: false,
            reason: result.reason,
            message: result.message || '当前无法进入公共匹配',
            connectionHealth: result.connectionHealth || null,
            matchmakingGuard: result.matchmakingGuard || null,
            retryAt: result.retryAt || result.matchmakingGuard && result.matchmakingGuard.retryAt || 0,
            cooldownUntil: result.cooldownUntil || result.matchmakingGuard && result.matchmakingGuard.cooldownUntil || 0,
            cooldownSource: result.cooldownSource || result.matchmakingGuard && result.matchmakingGuard.cooldownSource || ''
        });
    }
    res.json({ success: true, ...result });
}));

router.get('/queue/status/:queueTicket', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.getQueueStatus(req.user.id, req.params.queueTicket);
    if (!result) {
        return res.status(404).json({ success: false, message: '实时论道队列票据不存在' });
    }
    res.json({ success: true, ...result });
}));

router.post('/queue/cancel', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.cancelQueue(req.user.id, req.body && req.body.queueTicket);
    if (!result) {
        return res.status(404).json({ success: false, message: '实时论道队列票据不存在' });
    }
    res.json({ success: true, ...result });
}));

router.post('/invites', authenticate, asyncHandler(async (req, res) => {
    const target = await resolveInviteTarget(req, res);
    if (target === false) return;
    const result = await livePvpStore.createInvite({
        userId: req.user.id,
        displayName: getDisplayName(req),
        loadout: req.body && req.body.loadout,
        target
    });
    if (!result) {
        return res.status(404).json({ success: false, message: '实时论道邀请创建失败' });
    }
    if (result.status === 'blocked') {
        return res.status(409).json({ success: false, reason: result.reason, message: result.message || '当前无法创建好友约战' });
    }
    res.json({ success: true, ...result });
}));

router.get('/invites/inbox', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.getInviteInbox(req.user.id);
    res.json({ success: true, ...result });
}));

router.get('/invites/current', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.getCurrentInvite(req.user.id);
    if (!result) {
        return res.status(404).json({ success: false, reason: 'no_current_invite', message: '当前没有等待中的好友约战' });
    }
    if (result.status === 'expired') {
        return res.status(404).json({ success: false, reason: result.reason, message: result.message || '好友约战邀请码已过期' });
    }
    res.json({ success: true, ...result });
}));

router.post('/invites/:inviteCode/join', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.joinInvite(req.user.id, req.params.inviteCode, {
        displayName: getDisplayName(req),
        loadout: req.body && req.body.loadout
    });
    if (!result) {
        return res.status(404).json({ success: false, message: '实时论道邀请不存在或已失效' });
    }
    if (result.status === 'expired') {
        return res.status(404).json({ success: false, reason: result.reason, message: result.message || '好友约战邀请码已过期' });
    }
    if (result.status === 'blocked') {
        return res.status(409).json({ success: false, reason: result.reason, message: result.message || '当前无法加入好友约战' });
    }
    res.json({ success: true, ...result });
}));

router.post('/invites/:inviteCode/cancel', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.cancelInvite(req.user.id, req.params.inviteCode);
    if (!result) {
        return res.status(404).json({ success: false, message: '实时论道邀请不存在或已失效' });
    }
    if (result.status === 'expired') {
        return res.status(404).json({ success: false, reason: result.reason, message: result.message || '好友约战邀请码已过期' });
    }
    res.json({ success: true, ...result });
}));

router.get('/matches/current', authenticate, asyncHandler(async (req, res) => {
    const matchAccess = await livePvpStore.getActiveMatchForUser(req.user.id);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '当前没有进行中的实时论道' });
    }
    res.json({
        success: true,
        matchId: matchAccess.match.matchId,
        seatId: matchAccess.seatId,
        stateView: matchAccess.stateView
    });
}));

router.get('/matches/:matchId', authenticate, asyncHandler(async (req, res) => {
    const matchAccess = await livePvpStore.getMatchForUser(req.user.id, req.params.matchId);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    res.json({
        success: true,
        matchId: matchAccess.match.matchId,
        seatId: matchAccess.seatId,
        stateView: matchAccess.stateView
    });
}));

router.get('/matches/:matchId/replay', authenticate, asyncHandler(async (req, res) => {
    const visibility = normalizeReplayVisibility(req.query && req.query.visibility || 'replay_self');
    if (!visibility) {
        return res.status(400).json({
            success: false,
            reason: 'invalid_replay_visibility',
            message: '不支持的回放可见性'
        });
    }
    const matchAccess = await livePvpStore.getMatchForUser(req.user.id, req.params.matchId);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    const replayEvents = await livePvpStore.loadMatchEvents(matchAccess.match.matchId);
    const replay = buildMatchReplay(matchAccess.match, matchAccess.seatId, visibility, {
        events: replayEvents
    });
    if (!replay) {
        return res.status(409).json({
            success: false,
            reason: 'replay_not_ready',
            message: '对局结束后才能生成赛后回放'
        });
    }
    res.json({
        success: true,
        replay
    });
}));

router.get('/matches/:matchId/rematch', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.getFriendlyRematchStatus(req.user.id, req.params.matchId);
    if (!result) {
        return res.status(404).json({ success: false, reason: 'no_pending_rematch', message: '当前没有等待中的低压力再战' });
    }
    if (result.status === 'expired') {
        return res.status(404).json({ success: false, status: result.status, reason: result.reason, message: result.message || '低压力再战等待已过期', friendlySeries: result.friendlySeries });
    }
    res.json({ success: true, ...result });
}));

router.post('/matches/:matchId/rematch', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.requestFriendlyRematch(req.user.id, req.params.matchId, {
        displayName: getDisplayName(req),
        loadout: req.body && req.body.loadout
    });
    if (!result) {
        return res.status(404).json({ success: false, message: '实时论道再战入口不存在' });
    }
    if (result.status === 'blocked') {
        return res.status(409).json({ success: false, reason: result.reason, message: result.message || '当前已有进行中的真人对局' });
    }
    res.json({ success: true, ...result });
}));

router.post('/matches/:matchId/rematch/cancel', authenticate, asyncHandler(async (req, res) => {
    const result = await livePvpStore.cancelFriendlyRematch(req.user.id, req.params.matchId);
    if (!result) {
        return res.status(404).json({ success: false, reason: 'no_pending_rematch', message: '当前没有等待中的低压力再战' });
    }
    if (result.status === 'expired') {
        return res.status(404).json({ success: false, status: result.status, reason: result.reason, message: result.message || '低压力再战等待已过期', friendlySeries: result.friendlySeries });
    }
    res.json({ success: true, ...result });
}));

router.post('/matches/:matchId/heartbeat', authenticate, asyncHandler(async (req, res) => {
    const matchAccess = await livePvpStore.recordHeartbeat(req.user.id, req.params.matchId);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    res.json({
        success: true,
        matchId: matchAccess.match.matchId,
        seatId: matchAccess.seatId,
        stateView: matchAccess.stateView
    });
}));

router.post('/matches/:matchId/intents', authenticate, asyncHandler(async (req, res) => {
    const reduced = await livePvpStore.submitIntent(req.user.id, req.params.matchId, req.body || {});
    if (!reduced) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    res.json({
        success: true,
        result: reduced.result,
        reason: reduced.reason,
        events: Array.isArray(reduced.events) ? reduced.events.map(sanitizePublicEvent) : [],
        stateView: reduced.stateView
    });
}));

router.__livePvpStore = livePvpStore;
router.__attachPersistence = (persistence) => {
    livePvpStore.setPersistence(persistence);
};
router.__attachSettlement = (settlement) => {
    livePvpStore.setSettlement(settlement);
};
router.__attachServices = ({ persistence, settlement, ratingProvider, userDirectory: nextUserDirectory } = {}) => {
    if (persistence !== undefined) livePvpStore.setPersistence(persistence);
    if (settlement !== undefined) livePvpStore.setSettlement(settlement);
    if (ratingProvider !== undefined) livePvpStore.setRatingProvider(ratingProvider);
    if (nextUserDirectory !== undefined) userDirectory = nextUserDirectory || makeDefaultUserDirectory();
};

module.exports = router;
