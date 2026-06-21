const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { db } = require('../db/database');
const { createLivePvpStore } = require('../pvp-live/live-store');
const { buildMatchReplay, normalizeReplayVisibility } = require('../pvp-live/replay');
const { sanitizePublicEvent } = require('../pvp-live/engine/state-view');
const { RULE_VERSION } = require('../pvp-live/engine/rules');

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

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function makeDisputeReportId() {
    if (typeof crypto.randomUUID === 'function') return `pvplr-${crypto.randomUUID()}`;
    return `pvplr-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

function sanitizeDisputeReason(reason) {
    const normalized = String(reason || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 48);
    return normalized || 'player_report';
}

function getDisputeFinishReason(stateView) {
    const review = stateView && stateView.postMatchReview && typeof stateView.postMatchReview === 'object'
        ? stateView.postMatchReview
        : null;
    return String(review && review.finishReason || '');
}

function buildDisputeRiskTags(stateView, reason) {
    const tags = new Set(['player_reported']);
    const safeReason = sanitizeDisputeReason(reason);
    if (/fair|first|opener|budget|lethal|review/.test(safeReason)) tags.add('fairness_review_requested');
    if (/connect|timeout|network|disconnect/.test(safeReason)) tags.add('connection_review_requested');
    if (/settle|rank|reward|score/.test(safeReason)) tags.add('settlement_review_requested');
    const finishReason = getDisputeFinishReason(stateView);
    if (finishReason === 'connection_timeout' || finishReason === 'timeout') tags.add(`${finishReason}_finish`);
    const review = stateView && stateView.postMatchReview && typeof stateView.postMatchReview === 'object'
        ? stateView.postMatchReview
        : null;
    const fairnessReceipt = review && review.fairnessReceipt && typeof review.fairnessReceipt === 'object'
        ? review.fairnessReceipt
        : null;
    if (fairnessReceipt && fairnessReceipt.receiptState === 'watch') tags.add('fairness_receipt_watch');
    return Array.from(tags).slice(0, 8);
}

function compactDisputeEvent(event) {
    const safe = event && typeof event === 'object' ? sanitizePublicEvent({
        eventType: event.eventType,
        sequence: event.sequence,
        actingSeat: event.actingSeat,
        payload: event.publicData || event.payload || {}
    }) : null;
    if (!safe || !safe.eventType) return null;
    return safe;
}

function buildDisputeEvidencePackage(matchAccess, reason) {
    const stateView = matchAccess && matchAccess.stateView && typeof matchAccess.stateView === 'object'
        ? matchAccess.stateView
        : {};
    const review = stateView.postMatchReview && typeof stateView.postMatchReview === 'object'
        ? stateView.postMatchReview
        : null;
    const evidence = Array.isArray(review && review.evidence)
        ? review.evidence.map(compactDisputeEvent).filter(Boolean)
        : Array.isArray(stateView.recentEvents)
            ? stateView.recentEvents.map(compactDisputeEvent).filter(Boolean)
            : [];
    const settlementReport = review && review.settlementReport && typeof review.settlementReport === 'object'
        ? review.settlementReport
        : null;
    const matchQuality = stateView.matchQuality && typeof stateView.matchQuality === 'object'
        ? stateView.matchQuality
        : null;
    return {
        reportVersion: 'pvp-live-dispute-evidence-v1',
        sourceVisibility: 'audit_safe_public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        matchId: String(matchAccess && matchAccess.match && matchAccess.match.matchId || stateView.matchId || ''),
        reporterSeat: String(matchAccess && matchAccess.seatId || ''),
        ruleVersion: String(matchQuality && matchQuality.ruleVersion || RULE_VERSION),
        matchStatus: String(stateView.status || ''),
        stateVersion: Math.max(0, Math.floor(Number(stateView.stateVersion) || 0)),
        finishReason: getDisputeFinishReason(stateView),
        riskTags: buildDisputeRiskTags(stateView, reason),
        eventCount: evidence.length,
        publicEventRefs: evidence.slice(0, 12),
        settlementSnapshot: settlementReport ? {
            reportVersion: String(settlementReport.reportVersion || 'pvp-live-settlement-report-v1'),
            result: String(settlementReport.result || ''),
            finishReason: String(settlementReport.finishReason || ''),
            ratingDelta: Math.floor(Number(settlementReport.ratingDelta) || 0),
            coinsAwarded: Math.max(0, Math.floor(Number(settlementReport.coinsAwarded) || 0)),
            boundary: String(settlementReport.boundary || '')
        } : null,
        matchQualitySnapshot: matchQuality ? {
            reportVersion: String(matchQuality.reportVersion || 'pvp-live-match-quality-v1'),
            tag: String(matchQuality.tag || ''),
            expansionStage: String(matchQuality.expansionStage || ''),
            ratingDeltaBucket: String(matchQuality.ratingDeltaBucket || ''),
            connectionHealth: String(matchQuality.connectionHealth || ''),
            safeguards: Array.isArray(matchQuality.safeguards)
                ? matchQuality.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 10)
                : []
        } : null,
        boundary: '异常反馈证据包只包含公开事件、公开结算摘要和脱敏匹配质量，不读取隐藏手牌、牌库顺序、随机种子或完整斗法谱。'
    };
}

function makeDisputeReceipt({ reportId, reason, message, matchAccess }) {
    const evidencePackage = buildDisputeEvidencePackage(matchAccess, reason);
    return {
        reportVersion: 'pvp-live-dispute-report-receipt-v1',
        reportId,
        status: 'reported',
        reason: sanitizeDisputeReason(reason),
        message: String(message || '').trim().slice(0, 240),
        sourceVisibility: 'audit_safe_public_state',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        evidencePackage,
        nextStepLine: '异常反馈已提交；复核不会立即改写本局结算，若确认异常会按公告处理。',
        boundary: '提交举报、拉黑或静音不能逃避失败结算，也不会即时改变正式积分、奖励、匹配评分或隐藏信息边界。'
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

router.post('/matches/:matchId/reports', authenticate, asyncHandler(async (req, res) => {
    const matchAccess = await livePvpStore.getMatchForUser(req.user.id, req.params.matchId);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    const stateView = matchAccess.stateView || null;
    if (!stateView || (stateView.status !== 'finished' && stateView.status !== 'invalidated')) {
        return res.status(409).json({
            success: false,
            reason: 'dispute_report_not_ready',
            message: '对局结束后才能提交异常反馈'
        });
    }
    const reason = sanitizeDisputeReason(req.body && req.body.reason);
    const message = String(req.body && req.body.message || '').trim().slice(0, 240);
    const reportId = makeDisputeReportId();
    const report = makeDisputeReceipt({
        reportId,
        reason,
        message,
        matchAccess
    });
    const now = Date.now();
    await dbRun(
        `INSERT INTO pvp_live_dispute_reports
          (report_id, match_id, reporter_user_id, reporter_seat, reason, status, message, evidence_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'reported', ?, ?, ?, ?)`,
        [
            report.reportId,
            matchAccess.match.matchId,
            req.user.id,
            matchAccess.seatId,
            report.reason,
            report.message,
            JSON.stringify(report.evidencePackage),
            now,
            now
        ]
    );
    res.json({
        success: true,
        report
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
