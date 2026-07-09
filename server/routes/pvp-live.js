const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { db } = require('../db/database');
const { createLivePvpStore } = require('../pvp-live/live-store');
const { buildLivePvpSeasonStatus } = require('../pvp-live/live-season');
const { recordPvpLiveOpsEvent } = require('../pvp-live/live-ops-events');
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
    avoidOpponentCooldownMs: Number(process.env.PVP_LIVE_AVOID_OPPONENT_COOLDOWN_MS),
    ratingProvider: makeDefaultRatingProvider()
});
let userDirectory = makeDefaultUserDirectory();
let opsEventRecorder = (event) => recordPvpLiveOpsEvent(db, event);

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

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(Array.isArray(rows) ? rows : []);
        });
    });
}

async function appendPvpLiveOpsEvent(event) {
    if (typeof opsEventRecorder !== 'function') return null;
    try {
        return await opsEventRecorder(event);
    } catch (error) {
        console.warn('[PVP Live] Ops event append failed:', error);
        return null;
    }
}

const REPLAY_SHARE_DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REPLAY_SHARE_MIN_TTL_MS = 60 * 60 * 1000;
const REPLAY_SHARE_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function makeDisputeReportId() {
    if (typeof crypto.randomUUID === 'function') return `pvplr-${crypto.randomUUID()}`;
    return `pvplr-${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}`;
}

function makeReplayShareToken() {
    return `pvplrs-${crypto.randomBytes(24).toString('base64url')}`;
}

function normalizeReplayShareToken(value) {
    const token = String(value || '').trim();
    return /^pvplrs-[a-zA-Z0-9_-]{24,80}$/.test(token) ? token : '';
}

function getReplayShareTtlMs(body = {}) {
    const ttlDays = Math.floor(Number(body && body.ttlDays));
    if (Number.isFinite(ttlDays) && ttlDays > 0) {
        return Math.max(REPLAY_SHARE_MIN_TTL_MS, Math.min(REPLAY_SHARE_MAX_TTL_MS, ttlDays * 24 * 60 * 60 * 1000));
    }
    return REPLAY_SHARE_DEFAULT_TTL_MS;
}

function getRequestOrigin(req) {
    const host = req && typeof req.get === 'function' ? req.get('host') : '';
    if (!host) return '';
    const forwardedProto = req.get('x-forwarded-proto');
    const proto = String(forwardedProto || req.protocol || 'http').split(',')[0].trim() || 'http';
    return `${proto}://${host}`;
}

function makeReplayShareApiPath(shareToken) {
    return `/api/pvp/live/replay-shares/${encodeURIComponent(shareToken)}`;
}

function makeReplaySharePath(shareToken) {
    return `/?pvpReplayShare=${encodeURIComponent(shareToken)}`;
}

function makeReplayShareEnvelope(share, req) {
    const token = String(share && share.shareToken || '');
    const apiPath = makeReplayShareApiPath(token);
    const sharePath = makeReplaySharePath(token);
    const origin = getRequestOrigin(req);
    const revokedAt = Math.max(0, Math.floor(Number(share && share.revokedAt) || 0));
    return {
        reportVersion: 'pvp-live-replay-share-v1',
        shareToken: token,
        apiPath,
        sharePath,
        shareUrl: origin ? `${origin}${sharePath}` : sharePath,
        visibilityLayer: 'replay_public',
        sourceVisibility: 'replay_public',
        matchRef: String(share && share.matchRef || ''),
        replayHash: String(share && share.replayHash || ''),
        createdAt: Math.max(0, Math.floor(Number(share && share.createdAt) || 0)),
        expiresAt: Math.max(0, Math.floor(Number(share && share.expiresAt) || 0)),
        revoked: revokedAt > 0 || share && share.status === 'revoked',
        revokedAt,
        rankedImpact: 'none',
        rewardImpact: 'none',
        boundary: '公开战报分享只暴露 replay_public 脱敏回放，不包含原始战局 ID、隐藏手牌、牌库、随机种子、本人结算或赛季荣誉进度。'
    };
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

function getLiveOpsToken() {
    return String(process.env.DEFIER_LIVE_OPS_TOKEN || '').trim();
}

function isSameSecret(provided, configured) {
    const providedBuffer = Buffer.from(String(provided || ''));
    const configuredBuffer = Buffer.from(String(configured || ''));
    if (providedBuffer.length !== configuredBuffer.length) return false;
    return crypto.timingSafeEqual(providedBuffer, configuredBuffer);
}

function verifyLiveOpsToken(req, res) {
    const configured = getLiveOpsToken();
    if (configured.length < 32) {
        res.status(403).json({
            success: false,
            reason: 'live_ops_disabled',
            message: '实时论道运营接口未启用'
        });
        return false;
    }
    const provided = String(req.get('x-defier-live-ops-token') || '').trim();
    if (!provided || !isSameSecret(provided, configured)) {
        res.status(403).json({
            success: false,
            reason: 'live_ops_forbidden',
            message: '实时论道运营凭证无效'
        });
        return false;
    }
    return true;
}

function sanitizeDisputeStatus(value) {
    const status = String(value || '').trim().toLowerCase();
    return ['reported', 'reviewing', 'resolved', 'rejected'].includes(status) ? status : '';
}

function sanitizeDisputeResolution(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 64);
}

function sanitizeReviewNote(value) {
    return String(value || '').trim().slice(0, 240);
}

function sanitizeLiveOpsActor(req) {
    const headerActor = req && typeof req.get === 'function' ? req.get('x-defier-live-ops-actor') : '';
    const scopedActor = String(headerActor || 'live-ops')
        .trim()
        .replace(/[^a-zA-Z0-9:_-]/g, '_')
        .slice(0, 80) || 'live-ops';
    return `live-ops-token:${scopedActor}`.slice(0, 96);
}

function parseJson(raw, fallback = null) {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

const LIVE_OPS_FORBIDDEN_AUDIT_KEYS = /hand|deck|deckOrder|cardId|instanceId|cardInstanceId|cardInstanceIds|loadoutSnapshot|randomSeed|rngSeed|payload|state_json|event_json|stateJson|eventJson/i;

function sanitizeLiveOpsAuditValue(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 5) return null;
    if (Array.isArray(value)) {
        return value.slice(0, 50)
            .map(item => sanitizeLiveOpsAuditValue(item, depth + 1))
            .filter(item => item !== undefined);
    }
    if (typeof value === 'object') {
        return Object.entries(value).reduce((safe, [key, entry]) => {
            const safeKey = String(key || '');
            if (!safeKey || LIVE_OPS_FORBIDDEN_AUDIT_KEYS.test(safeKey)) return safe;
            const safeValue = sanitizeLiveOpsAuditValue(entry, depth + 1);
            if (safeValue !== undefined) safe[safeKey] = safeValue;
            return safe;
        }, {});
    }
    if (typeof value === 'string') return value.slice(0, 240);
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value;
    return undefined;
}

function getMatchFinishedEvent(state = {}) {
    const events = Array.isArray(state && state.events) ? state.events : [];
    return events.slice().reverse().find(event => event && event.eventType === 'match_finished') || null;
}

function getEventPayload(event) {
    return event && typeof event === 'object' && event.payload && typeof event.payload === 'object'
        ? event.payload
        : {};
}

function sanitizeLiveOpsMatchQuality(state = {}) {
    const quality = state && state.matchQuality && typeof state.matchQuality === 'object'
        ? state.matchQuality
        : {};
    return {
        reportVersion: String(quality.reportVersion || 'pvp-live-match-quality-v1'),
        sourceVisibility: 'ops_match_quality_public_summary',
        tag: String(quality.tag || ''),
        expansionStage: String(quality.expansionStage || ''),
        ratingDeltaBucket: String(quality.ratingDeltaBucket || ''),
        connectionHealth: String(quality.connectionHealth || ''),
        wideMatchReason: String(quality.wideMatchReason || ''),
        candidatePoolSize: Math.max(0, Math.floor(Number(quality.candidatePoolSize) || 0)),
        safeguards: Array.isArray(quality.safeguards)
            ? quality.safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 12)
            : []
    };
}

function sanitizeLiveOpsPublicEvent(row) {
    const publicData = sanitizeLiveOpsAuditValue(parseJson(row && row.public_data_json, {}) || {}) || {};
    return {
        eventId: String(row && row.event_id || ''),
        sequence: Math.max(0, Math.floor(Number(row && row.event_sequence) || 0)),
        eventType: String(row && row.event_type || ''),
        actingSeat: String(row && row.acting_seat || ''),
        visibility: String(row && row.visibility || 'public'),
        publicData,
        createdAt: Math.max(0, Math.floor(Number(row && row.created_at) || 0))
    };
}

function sanitizeLiveOpsSignal(row) {
    const hasRuntimeSource = Boolean(String(row && row.source_instance_id || '').trim());
    return {
        signalId: Math.max(0, Math.floor(Number(row && row.signal_id) || 0)),
        signalType: String(row && row.signal_type || 'state_sync'),
        stateVersion: Math.max(0, Math.floor(Number(row && row.state_version) || 0)),
        reason: String(row && row.reason || 'match_saved'),
        source: hasRuntimeSource ? 'redacted_runtime_source' : '',
        createdAt: Math.max(0, Math.floor(Number(row && row.created_at) || 0))
    };
}

function sanitizeLiveOpsEvent(row) {
    return {
        eventId: String(row && row.event_id || ''),
        eventType: String(row && row.event_type || ''),
        subjectUserId: String(row && row.subject_user_id || ''),
        matchId: String(row && row.match_id || ''),
        severity: String(row && row.severity || 'info'),
        reason: String(row && row.reason || ''),
        source: String(row && row.source || ''),
        evidence: sanitizeLiveOpsAuditValue(parseJson(row && row.evidence_json, {}) || {}) || {},
        createdAt: Math.max(0, Math.floor(Number(row && row.created_at) || 0))
    };
}

function sanitizeLiveOpsReplayShare(row) {
    const revokedAt = Math.max(0, Math.floor(Number(row && row.revoked_at) || 0));
    return {
        shareToken: String(row && row.share_token || ''),
        creatorUserId: String(row && row.creator_user_id || ''),
        creatorSeat: row && row.creator_seat === 'B' ? 'B' : 'A',
        visibilityLayer: String(row && row.visibility_layer || 'replay_public'),
        sourceVisibility: String(row && row.source_visibility || 'replay_public'),
        matchRef: String(row && row.match_ref || ''),
        replayHash: String(row && row.replay_hash || ''),
        status: revokedAt > 0 ? 'revoked' : String(row && row.status || 'active'),
        createdAt: Math.max(0, Math.floor(Number(row && row.created_at) || 0)),
        expiresAt: Math.max(0, Math.floor(Number(row && row.expires_at) || 0)),
        revokedAt
    };
}

function getSeatUserIdFromMatch(match, seatId) {
    const seat = String(seatId || '');
    if (!match || (seat !== 'A' && seat !== 'B')) return '';
    if (match.state && match.state.seats && match.state.seats[seat] && match.state.seats[seat].userId) {
        return String(match.state.seats[seat].userId || '');
    }
    if (match.seatsByUserId && typeof match.seatsByUserId === 'object') {
        return Object.entries(match.seatsByUserId)
            .find(([, sourceSeat]) => sourceSeat === seat)?.[0] || '';
    }
    return '';
}

function makeLiveOpsMatchRowFromMemory(match) {
    if (!match || !match.matchId || !match.state) return null;
    return {
        match_id: String(match.matchId),
        status: String(match.state.status || ''),
        seat_a_user_id: getSeatUserIdFromMatch(match, 'A'),
        seat_b_user_id: getSeatUserIdFromMatch(match, 'B'),
        state_version: Math.max(0, Math.floor(Number(match.state.stateVersion) || 0)),
        state_json: JSON.stringify(match.state || {}),
        connection_json: JSON.stringify(match.connection || {}),
        created_at: Math.max(0, Math.floor(Number(match.createdAt) || 0)),
        updated_at: Math.max(0, Math.floor(Number(match.updatedAt) || Date.now())),
        finished_at: ['finished', 'invalidated'].includes(String(match.state.status || ''))
            ? Math.max(0, Math.floor(Number(match.updatedAt) || Date.now()))
            : 0
    };
}

function getLiveOpsMemoryMatch(matchId) {
    const id = String(matchId || '').trim();
    if (!id || !livePvpStore || !livePvpStore.matches || typeof livePvpStore.matches.get !== 'function') return null;
    return livePvpStore.matches.get(id) || null;
}

function getLiveOpsMemoryMatchRows(limit = 500, since = 0) {
    const minTimestamp = Math.max(0, Math.floor(Number(since) || 0));
    if (!livePvpStore || !livePvpStore.matches || typeof livePvpStore.matches.values !== 'function') return [];
    return Array.from(livePvpStore.matches.values())
        .map(makeLiveOpsMatchRowFromMemory)
        .filter(Boolean)
        .filter(row => {
            if (minTimestamp <= 0) return true;
            return Math.max(
                Math.floor(Number(row.created_at) || 0),
                Math.floor(Number(row.updated_at) || 0),
                Math.floor(Number(row.finished_at) || 0)
            ) >= minTimestamp;
        })
        .sort((left, right) => Math.max(0, Number(right.updated_at) || 0) - Math.max(0, Number(left.updated_at) || 0))
        .slice(0, Math.max(1, Math.min(500, Math.floor(Number(limit) || 500))));
}

function mergeLiveOpsMatchRows(persistedRows = [], memoryRows = []) {
    const byId = new Map();
    [...memoryRows, ...persistedRows].forEach(row => {
        const id = String(row && row.match_id || '').trim();
        if (!id) return;
        byId.set(id, row);
    });
    return Array.from(byId.values())
        .sort((left, right) => Math.max(0, Number(right.updated_at) || 0) - Math.max(0, Number(left.updated_at) || 0));
}

function makeLiveOpsEventRowsFromMemory(match) {
    const events = match && match.state && Array.isArray(match.state.events) ? match.state.events : [];
    return events.map((event, index) => {
        const safe = sanitizePublicEvent(event || {});
        const publicData = safe && typeof safe === 'object'
            ? safe.publicData || safe.payload || {}
            : {};
        return {
            event_id: String(event && event.eventId || `${match.matchId}-memory-event-${index + 1}`),
            event_sequence: Math.max(0, Math.floor(Number(event && event.sequence) || index + 1)),
            event_type: String(event && event.eventType || ''),
            acting_seat: String(event && event.actingSeat || ''),
            visibility: String(event && event.visibility || 'public'),
            public_data_json: JSON.stringify(publicData),
            created_at: Math.max(0, Math.floor(Number(match && match.updatedAt) || Date.now()))
        };
    }).filter(row => row.event_type);
}

function makeLiveOpsSignalRowsFromMemory(match) {
    if (!match || !match.matchId || !match.state) return [];
    return [{
        signal_id: 0,
        signal_type: 'memory_snapshot',
        state_version: Math.max(0, Math.floor(Number(match.state.stateVersion) || 0)),
        reason: 'memory_snapshot',
        source_instance_id: '',
        created_at: Math.max(0, Math.floor(Number(match.updatedAt) || Date.now()))
    }];
}

function makeLiveOpsMatchTrace({ matchRow, eventRows, signalRows, disputeRows, opsRows, replayShareRows, settlementRow }) {
    const state = parseJson(matchRow && matchRow.state_json, {}) || {};
    const finishedEvent = getMatchFinishedEvent(state);
    const finishedPayload = getEventPayload(finishedEvent);
    const connection = parseJson(matchRow && matchRow.connection_json, {}) || {};
    return {
        success: true,
        reportVersion: 'pvp-live-ops-match-trace-v1',
        matchId: String(matchRow && matchRow.match_id || ''),
        sourceVisibility: 'ops_audit_safe_match_trace',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        rewardImpact: 'none',
        state: {
            status: String(matchRow && matchRow.status || state.status || ''),
            mode: String(state.mode || ''),
            ruleVersion: String(state.ruleVersion || RULE_VERSION),
            stateVersion: Math.max(0, Math.floor(Number(matchRow && matchRow.state_version || state.stateVersion) || 0)),
            roundIndex: Math.max(0, Math.floor(Number(state.roundIndex) || 0)),
            turnIndex: Math.max(0, Math.floor(Number(state.turnIndex) || 0)),
            currentSeat: String(state.currentSeat || ''),
            createdAt: Math.max(0, Math.floor(Number(matchRow && matchRow.created_at) || 0)),
            updatedAt: Math.max(0, Math.floor(Number(matchRow && matchRow.updated_at) || 0)),
            finishedAt: Math.max(0, Math.floor(Number(matchRow && matchRow.finished_at) || 0))
        },
        participants: {
            A: { seatId: 'A', userId: String(matchRow && matchRow.seat_a_user_id || '') },
            B: { seatId: 'B', userId: String(matchRow && matchRow.seat_b_user_id || '') }
        },
        postMatch: {
            winnerSeat: String(finishedPayload.winnerSeat || ''),
            loserSeat: String(finishedPayload.loserSeat || ''),
            finishReason: String(finishedPayload.finishReason || ''),
            scoreA: Math.floor(Number(finishedPayload.scoreA) || 0),
            scoreB: Math.floor(Number(finishedPayload.scoreB) || 0)
        },
        matchQuality: sanitizeLiveOpsMatchQuality(state),
        connection: {
            reportVersion: 'pvp-live-ops-connection-summary-v1',
            seatAStatus: String(connection && connection.seats && connection.seats.A && connection.seats.A.status || ''),
            seatBStatus: String(connection && connection.seats && connection.seats.B && connection.seats.B.status || ''),
            lastHeartbeatAtMax: Math.max(
                0,
                Math.floor(Number(connection && connection.seats && connection.seats.A && connection.seats.A.lastHeartbeatAt) || 0),
                Math.floor(Number(connection && connection.seats && connection.seats.B && connection.seats.B.lastHeartbeatAt) || 0)
            )
        },
        settlement: settlementRow ? {
            finishReason: String(settlementRow.finish_reason || ''),
            winnerSeat: String(settlementRow.winner_seat || ''),
            loserSeat: String(settlementRow.loser_seat || ''),
            winnerUserId: String(settlementRow.winner_user_id || ''),
            loserUserId: String(settlementRow.loser_user_id || ''),
            createdAt: Math.max(0, Math.floor(Number(settlementRow.created_at) || 0)),
            rankedImpact: 'settlement_recorded',
            rewardImpact: 'settlement_recorded'
        } : null,
        publicEvents: eventRows.map(sanitizeLiveOpsPublicEvent),
        stateSignals: signalRows.map(sanitizeLiveOpsSignal),
        disputeReports: disputeRows.map(row => makeDisputeStatusReceipt(row, { includeEvidence: true })),
        opsEvents: opsRows.map(sanitizeLiveOpsEvent),
        replayShares: replayShareRows.map(sanitizeLiveOpsReplayShare),
        boundary: '运营追踪只汇总公开状态、脱敏事件、争议状态和同步信号，不暴露隐藏手牌、牌库、随机种子或完整斗法谱。'
    };
}

function getLiveOpsWindowMs(value) {
    const windowMs = Math.floor(Number(value));
    if (!Number.isFinite(windowMs) || windowMs <= 0) return 24 * 60 * 60 * 1000;
    return Math.max(60 * 1000, Math.min(90 * 24 * 60 * 60 * 1000, windowMs));
}

function incrementCount(target, key) {
    const safeKey = String(key || 'unknown').slice(0, 64) || 'unknown';
    target[safeKey] = (target[safeKey] || 0) + 1;
}

function makeLiveOpsFairnessMetrics({ matchRows, disputeRows, opsRows, avoidRows, windowMs, now }) {
    const qualityTags = {};
    const expansionStages = {};
    const ratingDeltaBuckets = {};
    const connectionHealth = {};
    let finishedMatches = 0;
    let invalidatedMatches = 0;
    let firstSeatStarted = 0;
    let firstSeatWon = 0;
    matchRows.forEach(row => {
        const state = parseJson(row && row.state_json, {}) || {};
        const status = String(row && row.status || state.status || '');
        if (status === 'finished') finishedMatches += 1;
        if (status === 'invalidated') invalidatedMatches += 1;
        const quality = state.matchQuality && typeof state.matchQuality === 'object' ? state.matchQuality : {};
        if (quality.tag) incrementCount(qualityTags, quality.tag);
        if (quality.expansionStage) incrementCount(expansionStages, quality.expansionStage);
        if (quality.ratingDeltaBucket) incrementCount(ratingDeltaBuckets, quality.ratingDeltaBucket);
        if (quality.connectionHealth) incrementCount(connectionHealth, quality.connectionHealth);
        const firstSeat = String(state && state.openerAssignment && state.openerAssignment.firstSeat || '');
        const finishedEvent = getMatchFinishedEvent(state);
        const winnerSeat = String(getEventPayload(finishedEvent).winnerSeat || '');
        if ((firstSeat === 'A' || firstSeat === 'B') && status === 'finished') {
            firstSeatStarted += 1;
            if (winnerSeat === firstSeat) firstSeatWon += 1;
        }
    });
    const disputesByStatus = {};
    const disputeRiskTags = {};
    disputeRows.forEach(row => {
        incrementCount(disputesByStatus, sanitizeDisputeStatus(row && row.status) || 'reported');
        const evidence = parseJson(row && row.evidence_json, {}) || {};
        if (Array.isArray(evidence.riskTags)) {
            evidence.riskTags.forEach(tag => incrementCount(disputeRiskTags, tag));
        }
    });
    const opsByType = {};
    let reviewEvents = 0;
    opsRows.forEach(row => {
        incrementCount(opsByType, row && row.event_type);
        if (String(row && row.severity || '') === 'review') reviewEvents += 1;
    });
    return {
        success: true,
        reportVersion: 'pvp-live-ops-fairness-metrics-v1',
        sourceVisibility: 'ops_aggregate_public_safety_metrics',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        rewardImpact: 'none',
        generatedAt: now,
        windowMs,
        since: Math.max(0, now - windowMs),
        matchSummary: {
            totalMatches: matchRows.length,
            finishedMatches,
            invalidatedMatches,
            activeOrSetupMatches: matchRows.length - finishedMatches - invalidatedMatches,
            firstSeatStarted,
            firstSeatWon,
            firstSeatWinRate: firstSeatStarted > 0 ? Number((firstSeatWon / firstSeatStarted).toFixed(4)) : 0
        },
        matchQualitySummary: {
            qualityTags,
            expansionStages,
            ratingDeltaBuckets,
            connectionHealth
        },
        disputeSummary: {
            totalReports: disputeRows.length,
            byStatus: disputesByStatus,
            riskTags: disputeRiskTags
        },
        opsSummary: {
            totalEvents: opsRows.length,
            reviewEvents,
            byType: opsByType
        },
        avoidanceSummary: {
            activePreferences: avoidRows.filter(row => Math.max(0, Math.floor(Number(row && row.avoid_until) || 0)) > now).length,
            recentPreferences: avoidRows.length
        },
        boundary: '运营公平性指标只统计聚合状态、公开质量桶、争议风险标签和事件数量，不暴露隐藏手牌、牌库、随机种子、完整斗法谱或精确评分。'
    };
}

function makeDisputeStatusReceipt(row, { includeEvidence = false } = {}) {
    const evidence = parseJson(row && row.evidence_json, {});
    const riskTags = Array.isArray(evidence && evidence.riskTags)
        ? evidence.riskTags.map(tag => String(tag || '').trim()).filter(Boolean).slice(0, 12)
        : [];
    const status = sanitizeDisputeStatus(row && row.status) || 'reported';
    const receipt = {
        reportVersion: 'pvp-live-dispute-status-v1',
        reportId: String(row && row.report_id || ''),
        matchId: String(row && row.match_id || ''),
        reporterSeat: row && row.reporter_seat === 'B' ? 'B' : 'A',
        reason: sanitizeDisputeReason(row && row.reason),
        status,
        message: String(row && row.message || '').slice(0, 240),
        resolution: sanitizeDisputeResolution(row && row.resolution),
        reviewNote: sanitizeReviewNote(row && row.review_note),
        riskTags,
        eventCount: Math.max(0, Math.floor(Number(evidence && evidence.eventCount) || 0)),
        rankedImpact: 'none',
        rewardImpact: 'none',
        usesHiddenInformation: false,
        createdAt: Math.max(0, Math.floor(Number(row && row.created_at) || 0)),
        updatedAt: Math.max(0, Math.floor(Number(row && row.updated_at) || 0)),
        resolvedAt: Math.max(0, Math.floor(Number(row && row.resolved_at) || 0)),
        boundary: '争议处理只改变反馈工单状态，不直接改写本局胜负、积分、奖励、手牌或牌库。'
    };
    if (includeEvidence) {
        receipt.evidencePackage = sanitizeLiveOpsAuditValue(evidence && typeof evidence === 'object' ? evidence : {}) || {};
    }
    return receipt;
}

function getDisputeReportLimit(value) {
    const limit = Math.floor(Number(value));
    if (!Number.isFinite(limit) || limit <= 0) return 20;
    return Math.max(1, Math.min(50, limit));
}

function isValidDisputeTransition(previousStatus, nextStatus) {
    const allowed = {
        reported: ['reviewing', 'rejected'],
        reviewing: ['resolved', 'rejected'],
        resolved: [],
        rejected: []
    };
    return (allowed[previousStatus] || []).includes(nextStatus);
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
    if (result.rejected) {
        return res.status(result.statusCode || 400).json({
            success: false,
            reason: result.reason || 'test_state_rejected',
            message: result.message || '实时论道测试状态不支持'
        });
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
        testOpenerSeed: isLivePvpTestModeEnabled() ? req.body && req.body.testOpenerSeed : '',
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
        return res.status(404).json({ success: false, reason: 'invite_not_found', message: '实时论道邀请不存在或已失效' });
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

router.get('/season', authenticate, asyncHandler(async (req, res) => {
    res.json(await buildLivePvpSeasonStatus(db, req.user.id));
}));

router.get('/reports/mine', authenticate, asyncHandler(async (req, res) => {
    const rawStatus = String(req.query && req.query.status || '').trim();
    const status = sanitizeDisputeStatus(rawStatus);
    if (rawStatus && !status) {
        return res.status(400).json({
            success: false,
            reason: 'invalid_dispute_status',
            message: '争议状态必须是 reported、reviewing、resolved 或 rejected'
        });
    }
    const limit = getDisputeReportLimit(req.query && req.query.limit);
    const cursor = Math.max(0, Math.floor(Number(req.query && req.query.cursor) || 0));
    const where = ['reporter_user_id = ?'];
    const params = [req.user.id];
    if (status) {
        where.push('status = ?');
        params.push(status);
    }
    if (cursor > 0) {
        where.push('updated_at < ?');
        params.push(cursor);
    }
    params.push(limit + 1);
    const rows = await dbAll(
        `SELECT *
         FROM pvp_live_dispute_reports
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC, created_at DESC, report_id DESC
         LIMIT ?`,
        params
    );
    const reports = rows.slice(0, limit);
    res.json({
        success: true,
        reportVersion: 'pvp-live-dispute-report-list-v1',
        reports: reports.map(row => makeDisputeStatusReceipt(row)),
        nextCursor: rows.length > limit && reports.length
            ? Math.max(0, Math.floor(Number(reports[reports.length - 1].updated_at) || 0))
            : 0
    });
}));

router.get('/reports/:reportId', authenticate, asyncHandler(async (req, res) => {
    const reportId = String(req.params.reportId || '').trim();
    const row = reportId ? await dbGet(
        `SELECT *
         FROM pvp_live_dispute_reports
         WHERE report_id = ? AND reporter_user_id = ?
         LIMIT 1`,
        [reportId, req.user.id]
    ) : null;
    if (!row) {
        return res.status(404).json({
            success: false,
            reason: 'dispute_report_not_found',
            message: '争议反馈不存在'
        });
    }
    res.json({
        success: true,
        report: makeDisputeStatusReceipt(row)
    });
}));

router.get('/ops/dispute-reports', asyncHandler(async (req, res) => {
    if (!verifyLiveOpsToken(req, res)) return;
    const rawStatus = String(req.query && req.query.status || '').trim();
    const status = sanitizeDisputeStatus(rawStatus);
    if (rawStatus && !status) {
        return res.status(400).json({
            success: false,
            reason: 'invalid_dispute_status',
            message: '争议状态必须是 reported、reviewing、resolved 或 rejected'
        });
    }
    const limit = getDisputeReportLimit(req.query && req.query.limit);
    const cursor = Math.max(0, Math.floor(Number(req.query && req.query.cursor) || 0));
    const where = [];
    const params = [];
    if (status) {
        where.push('status = ?');
        params.push(status);
    }
    if (cursor > 0) {
        where.push('updated_at < ?');
        params.push(cursor);
    }
    params.push(limit + 1);
    const rows = await dbAll(
        `SELECT *
         FROM pvp_live_dispute_reports
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY updated_at DESC, created_at DESC, report_id DESC
         LIMIT ?`,
        params
    );
    const reports = rows.slice(0, limit);
    res.json({
        success: true,
        reportVersion: 'pvp-live-dispute-ops-list-v1',
        reports: reports.map(row => makeDisputeStatusReceipt(row, { includeEvidence: true })),
        nextCursor: rows.length > limit && reports.length
            ? Math.max(0, Math.floor(Number(reports[reports.length - 1].updated_at) || 0))
            : 0
    });
}));

router.get('/ops/matches/:matchId/trace', asyncHandler(async (req, res) => {
    if (!verifyLiveOpsToken(req, res)) return;
    const matchId = String(req.params.matchId || '').trim();
    const persistedMatchRow = matchId ? await dbGet(
        `SELECT *
         FROM pvp_live_matches
         WHERE match_id = ?
         LIMIT 1`,
        [matchId]
    ) : null;
    const memoryMatch = getLiveOpsMemoryMatch(matchId);
    const matchRow = persistedMatchRow || makeLiveOpsMatchRowFromMemory(memoryMatch);
    if (!matchRow) {
        return res.status(404).json({
            success: false,
            reason: 'live_ops_match_trace_not_found',
            message: '实时论道运营追踪不存在'
        });
    }
    const [
        eventRows,
        signalRows,
        disputeRows,
        opsRows,
        replayShareRows,
        settlementRow
    ] = await Promise.all([
        dbAll(
            `SELECT event_id, event_sequence, event_type, acting_seat, visibility, public_data_json, created_at
             FROM pvp_live_match_events
             WHERE match_id = ?
             ORDER BY event_sequence ASC
             LIMIT 80`,
            [matchId]
        ),
        dbAll(
            `SELECT signal_id, signal_type, state_version, reason, source_instance_id, created_at
             FROM pvp_live_state_signals
             WHERE match_id = ?
             ORDER BY signal_id ASC
             LIMIT 80`,
            [matchId]
        ),
        dbAll(
            `SELECT *
             FROM pvp_live_dispute_reports
             WHERE match_id = ?
             ORDER BY created_at ASC, report_id ASC
             LIMIT 50`,
            [matchId]
        ),
        dbAll(
            `SELECT event_id, event_type, subject_user_id, match_id, severity, reason, source, evidence_json, created_at
             FROM pvp_live_ops_events
             WHERE match_id = ?
             ORDER BY created_at ASC, event_id ASC
             LIMIT 80`,
            [matchId]
        ),
        dbAll(
            `SELECT share_token, creator_user_id, creator_seat, visibility_layer, source_visibility, match_ref, replay_hash, status, created_at, expires_at, revoked_at
             FROM pvp_live_replay_shares
             WHERE match_id = ?
             ORDER BY created_at ASC, share_token ASC
             LIMIT 20`,
            [matchId]
        ),
        dbGet(
            `SELECT *
             FROM pvp_live_match_settlements
             WHERE match_id = ?
             LIMIT 1`,
            [matchId]
        )
    ]);
    const effectiveEventRows = eventRows.length ? eventRows : makeLiveOpsEventRowsFromMemory(memoryMatch);
    const effectiveSignalRows = signalRows.length ? signalRows : makeLiveOpsSignalRowsFromMemory(memoryMatch);
    res.json(makeLiveOpsMatchTrace({
        matchRow,
        eventRows: effectiveEventRows,
        signalRows: effectiveSignalRows,
        disputeRows,
        opsRows,
        replayShareRows,
        settlementRow
    }));
}));

router.get('/ops/metrics/fairness', asyncHandler(async (req, res) => {
    if (!verifyLiveOpsToken(req, res)) return;
    const windowMs = getLiveOpsWindowMs(req.query && req.query.windowMs);
    const now = Date.now();
    const since = Math.max(0, now - windowMs);
    const [
        persistedMatchRows,
        disputeRows,
        opsRows,
        avoidRows
    ] = await Promise.all([
        dbAll(
            `SELECT match_id, status, state_version, state_json, created_at, updated_at, finished_at
             FROM pvp_live_matches
             WHERE created_at >= ? OR updated_at >= ? OR finished_at >= ?
             ORDER BY updated_at DESC, match_id DESC
             LIMIT 500`,
            [since, since, since]
        ),
        dbAll(
            `SELECT status, evidence_json, created_at, updated_at
             FROM pvp_live_dispute_reports
             WHERE created_at >= ? OR updated_at >= ?
             ORDER BY updated_at DESC, report_id DESC
             LIMIT 500`,
            [since, since]
        ),
        dbAll(
            `SELECT event_type, severity, created_at
             FROM pvp_live_ops_events
             WHERE created_at >= ?
             ORDER BY created_at DESC, event_id DESC
             LIMIT 1000`,
            [since]
        ),
        dbAll(
            `SELECT avoid_until, avoided_at
             FROM pvp_live_avoid_opponents
             WHERE avoided_at >= ? OR avoid_until >= ?
             ORDER BY updated_at DESC
             LIMIT 500`,
            [since, now]
        )
    ]);
    const matchRows = mergeLiveOpsMatchRows(persistedMatchRows, getLiveOpsMemoryMatchRows(500, since));
    res.json(makeLiveOpsFairnessMetrics({
        matchRows,
        disputeRows,
        opsRows,
        avoidRows,
        windowMs,
        now
    }));
}));

router.post('/ops/dispute-reports/:reportId/status', asyncHandler(async (req, res) => {
    if (!verifyLiveOpsToken(req, res)) return;
    const reportId = String(req.params.reportId || '').trim();
    const nextStatus = sanitizeDisputeStatus(req.body && req.body.status);
    if (!reportId || !nextStatus) {
        return res.status(400).json({
            success: false,
            reason: 'invalid_dispute_status',
            message: '争议状态必须是 reported、reviewing、resolved 或 rejected'
        });
    }
    const existing = await dbGet(
        `SELECT *
         FROM pvp_live_dispute_reports
         WHERE report_id = ?
         LIMIT 1`,
        [reportId]
    );
    if (!existing) {
        return res.status(404).json({
            success: false,
            reason: 'dispute_report_not_found',
            message: '争议反馈不存在'
        });
    }
    const previousStatus = sanitizeDisputeStatus(existing.status) || 'reported';
    if (previousStatus === nextStatus && previousStatus !== 'reported') {
        return res.json({
            success: true,
            idempotent: true,
            report: makeDisputeStatusReceipt(existing, { includeEvidence: true })
        });
    }
    if (!isValidDisputeTransition(previousStatus, nextStatus)) {
        return res.status(409).json({
            success: false,
            reason: 'invalid_dispute_status_transition',
            message: '争议反馈状态只能按 reported -> reviewing/rejected -> resolved/rejected 流转'
        });
    }
    const now = Date.now();
    const terminal = nextStatus === 'resolved' || nextStatus === 'rejected';
    const resolution = sanitizeDisputeResolution(req.body && req.body.resolution);
    const reviewNote = sanitizeReviewNote(req.body && req.body.reviewNote);
    const reviewerUserId = sanitizeLiveOpsActor(req);
    const updateResult = await dbRun(
        `UPDATE pvp_live_dispute_reports
         SET status = ?,
             resolution = ?,
             reviewer_user_id = ?,
             review_note = ?,
             resolved_at = ?,
             updated_at = ?
         WHERE report_id = ? AND status = ?`,
        [
            nextStatus,
            terminal ? resolution || nextStatus : resolution,
            reviewerUserId,
            reviewNote,
            terminal ? now : 0,
            now,
            reportId,
            previousStatus
        ]
    );
    if (!updateResult || updateResult.changes !== 1) {
        const latest = await dbGet(
            `SELECT *
             FROM pvp_live_dispute_reports
             WHERE report_id = ?
             LIMIT 1`,
            [reportId]
        );
        if (!latest) {
            return res.status(404).json({
                success: false,
                reason: 'dispute_report_not_found',
                message: '争议反馈不存在'
            });
        }
        const latestStatus = sanitizeDisputeStatus(latest.status) || 'reported';
        if (latestStatus === nextStatus && latestStatus !== 'reported') {
            return res.json({
                success: true,
                idempotent: true,
                report: makeDisputeStatusReceipt(latest, { includeEvidence: true })
            });
        }
        return res.status(409).json({
            success: false,
            reason: 'dispute_status_conflict',
            currentStatus: latestStatus,
            message: '争议反馈状态已被其他运营操作更新，请刷新后重试'
        });
    }
    const updated = await dbGet(
        `SELECT *
         FROM pvp_live_dispute_reports
         WHERE report_id = ?
         LIMIT 1`,
        [reportId]
    );
    await appendPvpLiveOpsEvent({
        eventType: 'dispute_status_changed',
        subjectUserId: updated && updated.reporter_user_id,
        matchId: updated && updated.match_id,
        severity: terminal ? 'info' : 'review',
        reason: nextStatus,
        source: 'live_ops_review',
        evidence: {
            reportVersion: 'pvp-live-dispute-status-change-v1',
            reportId,
            previousStatus,
            nextStatus,
            resolution: terminal ? resolution || nextStatus : resolution,
            reviewerUserId,
            reviewNoteProvided: !!reviewNote,
            rankedImpact: 'none',
            rewardImpact: 'none',
            usesHiddenInformation: false
        },
        createdAt: now
    });
    res.json({
        success: true,
        report: makeDisputeStatusReceipt(updated, { includeEvidence: true })
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

router.post('/matches/:matchId/replay-share', authenticate, asyncHandler(async (req, res) => {
    const matchAccess = await livePvpStore.getMatchForUser(req.user.id, req.params.matchId);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    const replayEvents = await livePvpStore.loadMatchEvents(matchAccess.match.matchId);
    const replay = buildMatchReplay(matchAccess.match, matchAccess.seatId, 'replay_public', {
        events: replayEvents
    });
    if (!replay) {
        return res.status(409).json({
            success: false,
            reason: 'replay_share_not_ready',
            message: '对局结束后才能生成公开战报分享'
        });
    }
    const now = Date.now();
    const share = await livePvpStore.saveReplayShare({
        shareToken: makeReplayShareToken(),
        matchId: matchAccess.match.matchId,
        creatorUserId: req.user.id,
        creatorSeat: matchAccess.seatId,
        visibilityLayer: 'replay_public',
        sourceVisibility: 'replay_public',
        matchRef: replay.matchRef,
        replayHash: replay.replayHash,
        status: 'active',
        createdAt: now,
        expiresAt: now + getReplayShareTtlMs(req.body || {}),
        revokedAt: 0,
        updatedAt: now
    });
    if (!share) {
        return res.status(500).json({ success: false, reason: 'replay_share_create_failed', message: '公开战报分享生成失败' });
    }
    res.json({
        success: true,
        share: makeReplayShareEnvelope(share, req)
    });
}));

router.get('/replay-shares/:shareToken', asyncHandler(async (req, res) => {
    const shareToken = normalizeReplayShareToken(req.params.shareToken);
    if (!shareToken) {
        return res.status(404).json({ success: false, reason: 'replay_share_not_found', message: '公开战报分享不存在' });
    }
    const share = await livePvpStore.loadReplayShare(shareToken);
    if (!share) {
        return res.status(404).json({ success: false, reason: 'replay_share_not_found', message: '公开战报分享不存在' });
    }
    if (share.revokedAt > 0 || share.status === 'revoked') {
        return res.status(410).json({ success: false, reason: 'replay_share_revoked', message: '公开战报分享已撤销' });
    }
    if (Math.max(0, Math.floor(Number(share.expiresAt) || 0)) <= Date.now()) {
        return res.status(410).json({ success: false, reason: 'replay_share_expired', message: '公开战报分享已过期' });
    }
    const match = await livePvpStore.loadMatchForReplayShare(share.matchId);
    if (!match) {
        return res.status(404).json({ success: false, reason: 'replay_share_not_found', message: '公开战报分享不存在' });
    }
    const replayEvents = await livePvpStore.loadMatchEvents(match.matchId);
    const replay = buildMatchReplay(match, share.creatorSeat || 'A', 'replay_public', {
        events: replayEvents
    });
    if (!replay) {
        return res.status(409).json({
            success: false,
            reason: 'replay_share_not_ready',
            message: '公开战报分享暂不可用'
        });
    }
    res.json({
        success: true,
        share: makeReplayShareEnvelope({
            ...share,
            matchRef: replay.matchRef || share.matchRef,
            replayHash: replay.replayHash || share.replayHash
        }, req),
        replay
    });
}));

router.post('/matches/:matchId/replay-share/revoke', authenticate, asyncHandler(async (req, res) => {
    const matchAccess = await livePvpStore.getMatchForUser(req.user.id, req.params.matchId);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    const share = await livePvpStore.revokeReplayShareForUser(req.user.id, matchAccess.match.matchId);
    if (!share) {
        return res.status(404).json({ success: false, reason: 'replay_share_not_found', message: '公开战报分享不存在' });
    }
    res.json({
        success: true,
        share: makeReplayShareEnvelope(share, req)
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
    await appendPvpLiveOpsEvent({
        eventType: 'dispute_reported',
        subjectUserId: req.user.id,
        matchId: matchAccess.match.matchId,
        severity: 'review',
        reason: report.reason,
        source: 'player_report',
        evidence: report.evidencePackage,
        createdAt: now
    });
    res.json({
        success: true,
        report
    });
}));

router.post('/matches/:matchId/avoid-opponent', authenticate, asyncHandler(async (req, res) => {
    const matchAccess = await livePvpStore.getMatchForUser(req.user.id, req.params.matchId);
    if (!matchAccess) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    const report = await livePvpStore.avoidOpponentForUser(req.user.id, req.params.matchId, {
        reason: req.body && req.body.reason,
        message: req.body && req.body.message
    });
    if (!report) {
        return res.status(404).json({ success: false, message: '实时论道战局不存在' });
    }
    if (report.success === false) {
        return res.status(409).json({
            success: false,
            reason: report.reason || 'avoid_opponent_not_ready',
            message: report.message || '赛后避开对手暂不可用'
        });
    }
    const opponentSeatId = matchAccess.seatId === 'A' ? 'B' : 'A';
    const avoidedUserId = livePvpStore.getSourceSeatUserId(matchAccess.match, opponentSeatId);
    const pairKey = [String(req.user.id || ''), String(avoidedUserId || '')]
        .filter(Boolean)
        .sort()
        .join('::');
    if (avoidedUserId && pairKey.includes('::')) {
        const now = Date.now();
        await dbRun(
            `INSERT INTO pvp_live_avoid_opponents
                (avoider_user_id, avoided_user_id, pair_key, source_match_id, reason, message, avoided_at, avoid_until, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(avoider_user_id, avoided_user_id) DO UPDATE SET
                pair_key = excluded.pair_key,
                source_match_id = excluded.source_match_id,
                reason = excluded.reason,
                message = excluded.message,
                avoided_at = excluded.avoided_at,
                avoid_until = excluded.avoid_until,
                updated_at = excluded.updated_at`,
            [
                req.user.id,
                avoidedUserId,
                pairKey,
                report.sourceMatchId || matchAccess.match.matchId,
                report.reason || 'post_match_avoid',
                report.message || '',
                report.avoidedAt || now,
                report.expiresAt || now,
                now
            ]
        );
        await appendPvpLiveOpsEvent({
            eventType: 'avoid_opponent',
            subjectUserId: req.user.id,
            matchId: report.sourceMatchId || matchAccess.match.matchId,
            severity: 'info',
            reason: report.reason || 'post_match_avoid',
            source: 'player_preference',
            evidence: {
                avoidedUserId,
                pairKey,
                expiresAt: report.expiresAt || now,
                safeguard: report.safeguard || 'player_avoid_opponent'
            },
            createdAt: now
        });
    }
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
router.__attachServices = ({ persistence, settlement, ratingProvider, userDirectory: nextUserDirectory, opsEventRecorder: nextOpsEventRecorder } = {}) => {
    if (persistence !== undefined) livePvpStore.setPersistence(persistence);
    if (settlement !== undefined) livePvpStore.setSettlement(settlement);
    if (ratingProvider !== undefined) livePvpStore.setRatingProvider(ratingProvider);
    if (nextUserDirectory !== undefined) userDirectory = nextUserDirectory || makeDefaultUserDirectory();
    if (nextOpsEventRecorder !== undefined) {
        opsEventRecorder = typeof nextOpsEventRecorder === 'function'
            ? nextOpsEventRecorder
            : (event) => recordPvpLiveOpsEvent(db, event);
    }
};

module.exports = router;
