const crypto = require('crypto');
const { createInitialLiveState, reduceIntent, projectStateView } = require('./engine/reducer');
const { RULE_VERSION, RULES } = require('./engine/rules');
const { normalizeLoadoutSnapshot, publicLoadoutSummary } = require('./loadout');

const DEFAULT_TURN_TIMEOUT_MS = 90 * 1000;
const DEFAULT_SETUP_READY_TIMEOUT_MS = RULES.setupReadyTimeoutMs;
const DEFAULT_LONG_WAIT_THRESHOLD_MS = 120 * 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 1000;
const DEFAULT_HEARTBEAT_STALE_MS = 15 * 1000;
const DEFAULT_RECONNECT_GRACE_MS = 30 * 1000;
const DEFAULT_INVITE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REMATCH_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RECENT_OPPONENT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_AVOID_OPPONENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_QUEUE_CANCEL_WINDOW_MS = 2 * 60 * 1000;
const DEFAULT_QUEUE_CANCEL_COOLDOWN_MS = 60 * 1000;
const DEFAULT_QUEUE_CANCEL_COOLDOWN_THRESHOLD = 3;
const DEFAULT_READY_TIMEOUT_COOLDOWN_MS = 60 * 1000;
const DEFAULT_RATING_SCORE = 1000;
const STRICT_RATING_DELTA = 99;
const FAIR_RATING_DELTA = 199;
const EXPANDED_RATING_DELTA = 399;
const LOW_SAMPLE_PROTECTION_MATCHES = 5;

function makeId(prefix) {
    if (typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
}

function makeInviteCode() {
    return `TD${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function normalizeReplayShareRecord(share = {}) {
    const source = share && typeof share === 'object' ? share : {};
    const shareToken = String(source.shareToken || '').trim();
    const matchId = String(source.matchId || '').trim();
    const creatorUserId = String(source.creatorUserId || '').trim();
    if (!/^pvplrs-[a-zA-Z0-9_-]{24,80}$/.test(shareToken) || !matchId || !creatorUserId) return null;
    const createdAt = Math.max(0, Math.floor(Number(source.createdAt) || Date.now()));
    const expiresAt = Math.max(createdAt + 1000, Math.floor(Number(source.expiresAt) || (createdAt + 30 * 24 * 60 * 60 * 1000)));
    const revokedAt = Math.max(0, Math.floor(Number(source.revokedAt) || 0));
    return {
        shareToken,
        matchId,
        creatorUserId,
        creatorSeat: source.creatorSeat === 'B' ? 'B' : 'A',
        visibilityLayer: 'replay_public',
        sourceVisibility: 'replay_public',
        matchRef: String(source.matchRef || '').trim().slice(0, 64),
        replayHash: String(source.replayHash || '').trim().slice(0, 64),
        status: revokedAt > 0 || source.status === 'revoked' ? 'revoked' : 'active',
        createdAt,
        expiresAt,
        revokedAt,
        updatedAt: Math.max(createdAt, Math.floor(Number(source.updatedAt) || Date.now()))
    };
}

function normalizeSourceSeat(value, fallback = 'A') {
    if (value === 'A' || value === 'B') return value;
    if (fallback === 'A' || fallback === 'B') return fallback;
    return '';
}

function otherSourceSeat(seatId) {
    return seatId === 'A' ? 'B' : 'A';
}

function getFriendlySeriesOpenerSeat({ playerA, playerB, friendlySeries = null } = {}) {
    if (!friendlySeries || typeof friendlySeries !== 'object') return '';
    const sourceSeat = normalizeSourceSeat(friendlySeries.roundFirstSourceSeat || friendlySeries.round_first_source_seat, '');
    if (sourceSeat !== 'A' && sourceSeat !== 'B') return '';
    const participants = friendlySeries.sourceParticipants && typeof friendlySeries.sourceParticipants === 'object'
        ? friendlySeries.sourceParticipants
        : {};
    const firstUserId = String(participants[sourceSeat] && participants[sourceSeat].userId || '');
    if (!firstUserId) return '';
    if (playerA && playerA.userId === firstUserId) return 'A';
    if (playerB && playerB.userId === firstUserId) return 'B';
    return '';
}

function makeAuthoritativeOpenerAssignment({ matchId, playerA, playerB, mode = 'ranked', friendlySeries = null, testOpenerSeed = '' } = {}) {
    const seriesTag = friendlySeries && typeof friendlySeries === 'object'
        ? `${friendlySeries.seriesId || ''}:${friendlySeries.roundIndex || ''}:${friendlySeries.sourceMatchId || ''}`
        : '';
    const friendlyFirstSeat = mode === 'friendly'
        ? getFriendlySeriesOpenerSeat({ playerA, playerB, friendlySeries })
        : '';
    if (friendlyFirstSeat === 'A' || friendlyFirstSeat === 'B') {
        const seedInput = [
            'pvp-live-friendly-opener-v1',
            String(matchId || ''),
            seriesTag,
            String(friendlySeries.roundFirstSourceSeat || ''),
            String(friendlySeries.openingFirstSourceSeat || '')
        ].join('|');
        const digest = crypto.createHash('sha256').update(seedInput).digest('hex');
        return {
            reportVersion: 'pvp-live-opener-assignment-v1',
            sourceVisibility: 'server_authoritative_series_contract',
            usesHiddenInformation: false,
            rankedImpact: 'none',
            firstSeat: friendlyFirstSeat,
            secondSeat: friendlyFirstSeat === 'A' ? 'B' : 'A',
            policy: 'friendly_series_rotating_opener',
            seedTag: digest.slice(0, 12),
            queueOrderBinding: false,
            hostBinding: false,
            boundaryLine: '友谊 Bo3 按源对局席位轮换先手；换边再战时，首动窗口也会随源玩家轮换。'
        };
    }
    const safeTestOpenerSeed = normalizeLivePvpTestOpenerSeed(testOpenerSeed);
    const serverSeed = safeTestOpenerSeed || crypto.randomBytes(16).toString('hex');
    const seedInput = safeTestOpenerSeed
        ? ['pvp-live-test-opener-v1', safeTestOpenerSeed].join('|')
        : [
            'pvp-live-opener-v1',
            String(matchId || ''),
            String(mode || 'ranked'),
            seriesTag,
            serverSeed
        ].join('|');
    const digest = crypto.createHash('sha256').update(seedInput).digest('hex');
    const firstSeat = parseInt(digest.slice(0, 2), 16) % 2 === 0 ? 'A' : 'B';
    return {
        reportVersion: 'pvp-live-opener-assignment-v1',
        sourceVisibility: 'server_authoritative_public_seed',
        usesHiddenInformation: false,
        rankedImpact: 'none',
        firstSeat,
        secondSeat: firstSeat === 'A' ? 'B' : 'A',
        policy: 'server_seeded_fair_opener',
        seedTag: digest.slice(0, 12),
        queueOrderBinding: false,
        hostBinding: false,
        boundaryLine: '先后手由服务端公开种子分配，不绑定排队顺序或房主身份。'
    };
}

function normalizeInviteCode(inviteCode) {
    return String(inviteCode || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 16);
}

function normalizePlayerIdentity(player) {
    const userId = player && typeof player.userId === 'string' ? player.userId : '';
    if (!userId) {
        throw new Error('Live PVP player requires userId');
    }
    return {
        userId,
        displayName: player && typeof player.displayName === 'string' && player.displayName.trim()
            ? player.displayName.trim().slice(0, 40)
            : userId
    };
}

function normalizePlayer(player, now = () => Date.now()) {
    const identity = normalizePlayerIdentity(player);
    const loadoutSnapshot = normalizeLoadoutSnapshot(player && player.loadout, { now });
    return {
        ...identity,
        loadoutSnapshot
    };
}

function normalizeWideMatchConsent(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function makeWideMatchConsentReport({ viewerAccepted = false, acceptedPlayerCount = 0, candidatePoolSize = 1, matchReady = false } = {}) {
    const safeAcceptedPlayerCount = Math.max(0, Math.floor(Number(acceptedPlayerCount) || 0));
    const safeCandidatePoolSize = Math.max(1, Math.floor(Number(candidatePoolSize) || 1));
    const accepted = viewerAccepted === true;
    const ready = accepted && matchReady === true;
    return {
        reportVersion: 'pvp-live-wide-match-consent-v1',
        viewerAccepted: accepted,
        requiresBothPlayers: true,
        requiredAcceptedPlayers: 2,
        acceptedPlayerCount: Math.min(safeCandidatePoolSize, safeAcceptedPlayerCount),
        candidatePoolSize: safeCandidatePoolSize,
        matchReady: ready,
        status: ready ? 'ready' : accepted ? 'waiting_for_peer' : 'waiting_for_viewer',
        detail: ready
            ? '双方已确认宽分差，正在等待服务端撮合。'
            : accepted
                ? '你已确认接受宽分差，仍需对方也确认才会放行 200-399 分差真人局。'
                : '仅在双方都确认后，才允许 200-399 分差真人局。'
    };
}

function normalizeLivePvpTestMatchScope(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 64);
    return normalized && normalized !== 'none' ? normalized : '';
}

function normalizeLivePvpTestOpenerSeed(value) {
    const normalized = String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 96);
    return normalized && normalized !== 'none' ? normalized : '';
}

function getQueueEntryTestMatchScope(entry) {
    return normalizeLivePvpTestMatchScope(entry && entry.testMatchScope);
}

function makeRecentOpponentPairKey(userIdA, userIdB) {
    const ids = [String(userIdA || '').trim(), String(userIdB || '').trim()]
        .filter(Boolean)
        .sort();
    return ids.length === 2 && ids[0] !== ids[1] ? `${ids[0]}::${ids[1]}` : '';
}

function normalizeRecentOpponentPair(pair = {}) {
    const source = pair && typeof pair === 'object' ? pair : {};
    const pairKey = makeRecentOpponentPairKey(source.userIdA || source.user_id_a, source.userIdB || source.user_id_b);
    if (!pairKey) return null;
    const [userIdA, userIdB] = pairKey.split('::');
    return {
        pairKey,
        userIdA,
        userIdB,
        lastMatchId: String(source.lastMatchId || source.last_match_id || ''),
        lastMatchedAt: Math.max(0, Math.floor(Number(source.lastMatchedAt || source.last_matched_at) || 0))
    };
}

function makeAvoidedOpponentPreferenceKey(avoiderUserId, avoidedUserId) {
    const avoider = String(avoiderUserId || '').trim();
    const avoided = String(avoidedUserId || '').trim();
    return avoider && avoided && avoider !== avoided ? `${avoider}::${avoided}` : '';
}

function normalizeAvoidOpponentReason(value) {
    const normalized = String(value || 'post_match_avoid')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 48);
    return normalized || 'post_match_avoid';
}

function normalizeAvoidedOpponentPair(pair = {}) {
    const source = pair && typeof pair === 'object' ? pair : {};
    const avoiderUserId = String(source.avoiderUserId || source.avoider_user_id || '').trim();
    const avoidedUserId = String(source.avoidedUserId || source.avoided_user_id || '').trim();
    const preferenceKey = makeAvoidedOpponentPreferenceKey(avoiderUserId, avoidedUserId);
    if (!preferenceKey) return null;
    return {
        preferenceKey,
        pairKey: makeRecentOpponentPairKey(avoiderUserId, avoidedUserId),
        avoiderUserId,
        avoidedUserId,
        sourceMatchId: String(source.sourceMatchId || source.source_match_id || ''),
        reason: normalizeAvoidOpponentReason(source.reason),
        message: String(source.message || '').trim().slice(0, 240),
        avoidedAt: Math.max(0, Math.floor(Number(source.avoidedAt || source.avoided_at) || 0)),
        expiresAt: Math.max(0, Math.floor(Number(source.expiresAt || source.expires_at || source.avoidUntil || source.avoid_until) || 0))
    };
}

function appendUniqueString(list, value, limit = 12) {
    const items = Array.isArray(list) ? list.map(item => String(item || '')).filter(Boolean) : [];
    const normalized = String(value || '').trim();
    if (normalized && !items.includes(normalized)) items.push(normalized);
    return items.slice(0, limit);
}

function normalizeMatchmakingGuardProfile(profile = {}) {
    const source = profile && typeof profile === 'object' ? profile : {};
    const userId = String(source.userId || source.user_id || '').trim();
    if (!userId) return null;
    return {
        userId,
        cooldownUntil: Math.max(0, Math.floor(Number(source.cooldownUntil || source.cooldown_until) || 0)),
        cooldownSource: String(source.cooldownSource || source.cooldown_source || '').slice(0, 40),
        cancelWindowStartedAt: Math.max(0, Math.floor(Number(source.cancelWindowStartedAt || source.cancel_window_started_at) || 0)),
        cancelCount: Math.max(0, Math.floor(Number(source.cancelCount || source.cancel_count) || 0))
    };
}

function makeMatchmakingGuardReport(profile, now = Date.now()) {
    const normalized = normalizeMatchmakingGuardProfile(profile);
    if (!normalized) return null;
    const retryAt = Math.max(0, Math.floor(Number(normalized.cooldownUntil) || 0));
    const cooldownRemainingMs = Math.max(0, retryAt - Math.max(0, Math.floor(Number(now) || Date.now())));
    const source = normalized.cooldownSource || 'queue_cooldown';
    const sourceLabel = source === 'ready_timeout'
        ? '准备超时冷却'
        : source === 'connection_timeout'
            ? '连接超时冷却'
            : source === 'queue_cancel_abuse' ? '频繁取消冷却' : '排队冷却';
    return {
        reportVersion: 'pvp-live-matchmaking-guard-v1',
        status: cooldownRemainingMs > 0 ? 'blocked' : 'clear',
        reason: 'queue_cooldown',
        cooldownSource: source,
        sourceLabel,
        retryAt,
        cooldownUntil: retryAt,
        cooldownRemainingMs,
        rankedImpact: 'none',
        message: cooldownRemainingMs > 0
            ? `${sourceLabel}触发真人排位短暂冷却；可先进入问道练习，不写正式积分。`
            : '真人排位冷却已结束，可以重新入队。',
        safeguards: ['temporary_queue_cooldown', 'no_score_change', 'practice_available'],
        actions: [
            {
                id: 'retry_queue_later',
                label: '稍后重试',
                detail: '冷却结束后重新检测并进入真人排位。'
            },
            {
                id: 'practice',
                label: '问道练习',
                detail: '练习不写正式积分。'
            }
        ]
    };
}

function normalizeRatingScore(value) {
    const numeric = Number(value);
    return Math.max(0, Math.min(9999, Math.floor(Number.isFinite(numeric) ? numeric : DEFAULT_RATING_SCORE)));
}

function makeRatingBucket(score) {
    const safeScore = normalizeRatingScore(score);
    const floor = Math.floor(safeScore / 100) * 100;
    return `${floor}_${floor + 99}`;
}

function normalizeRatingSnapshot(snapshot = {}, { provisionalDefault = true } = {}) {
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const score = normalizeRatingScore(source.score);
    const provisional = source.provisional === true
        ? true
        : source.provisional === false ? false : provisionalDefault;
    const rankedGamesSource = source.rankedGames ?? source.ranked_games;
    const hasRankedGames = Number.isFinite(Number(rankedGamesSource));
    const rankedGames = hasRankedGames
        ? Math.max(0, Math.floor(Number(rankedGamesSource)))
        : provisional ? 0 : LOW_SAMPLE_PROTECTION_MATCHES;
    const lowSampleProtected = (source.lowSampleProtected === false || source.low_sample_protected === false)
        ? false
        : (source.lowSampleProtected === true || source.low_sample_protected === true || hasRankedGames || source.provisional === true)
            && (provisional || rankedGames < LOW_SAMPLE_PROTECTION_MATCHES);
    return {
        score,
        bucket: String(source.bucket || makeRatingBucket(score)).slice(0, 24),
        seasonId: String(source.seasonId || source.season_id || 's1-genesis').slice(0, 40),
        provisional,
        rankedGames,
        lowSampleProtected
    };
}

function makeDefaultRatingSnapshot() {
    return normalizeRatingSnapshot({
        score: DEFAULT_RATING_SCORE,
        bucket: 'unrated',
        seasonId: 's1-genesis',
        provisional: true,
        rankedGames: LOW_SAMPLE_PROTECTION_MATCHES,
        lowSampleProtected: false
    });
}

function shouldUseRatedMatching(leftSnapshot, rightSnapshot) {
    const left = normalizeRatingSnapshot(leftSnapshot);
    const right = normalizeRatingSnapshot(rightSnapshot);
    return !(left.provisional && right.provisional);
}

function isLowSampleRatingSnapshot(snapshot) {
    const rating = normalizeRatingSnapshot(snapshot);
    return !!rating.lowSampleProtected;
}

function getLowSampleMatchPolicy(leftSnapshot, rightSnapshot, waitMsA, waitMsB, longWaitThresholdMs, candidatePoolSize = 2) {
    const leftLowSample = isLowSampleRatingSnapshot(leftSnapshot);
    const rightLowSample = isLowSampleRatingSnapshot(rightSnapshot);
    const maxWaitMs = Math.max(
        Math.max(0, Math.floor(Number(waitMsA) || 0)),
        Math.max(0, Math.floor(Number(waitMsB) || 0))
    );
    const safeThresholdMs = Math.max(1000, Math.floor(Number(longWaitThresholdMs) || DEFAULT_LONG_WAIT_THRESHOLD_MS));
    if (!leftLowSample && !rightLowSample) {
        return { allowed: true, priority: 1, safeguards: [] };
    }
    if (leftLowSample && rightLowSample) {
        if (Math.max(1, Math.floor(Number(candidatePoolSize) || 2)) < 3 && maxWaitMs < safeThresholdMs) {
            return {
                allowed: false,
                priority: 2,
                reason: 'low_sample_protection',
                safeguards: ['low_sample_protection']
            };
        }
        return {
            allowed: true,
            priority: 0,
            expansionStage: 'low_sample_pairing',
            safeguards: ['low_sample_protection', 'low_sample_pairing']
        };
    }
    if (maxWaitMs >= safeThresholdMs) {
        return {
            allowed: true,
            priority: 1,
            safeguards: ['low_sample_protection', 'low_sample_long_wait_release']
        };
    }
    return {
        allowed: false,
        priority: 2,
        reason: 'low_sample_protection',
        safeguards: ['low_sample_protection']
    };
}

function applyMatchQualitySafeguards(qualityInput, policy = {}) {
    if (!qualityInput || !policy || !Array.isArray(policy.safeguards) || policy.safeguards.length === 0) return qualityInput;
    return {
        ...qualityInput,
        ...(policy.expansionStage ? { expansionStage: policy.expansionStage } : {}),
        safeguards: policy.safeguards.reduce(
            (items, item) => appendUniqueString(items, item, 12),
            Array.isArray(qualityInput.safeguards) ? qualityInput.safeguards : []
        )
    };
}

function getRatingDeltaBucket(delta) {
    const safeDelta = Math.max(0, Math.floor(Number(delta) || 0));
    if (safeDelta <= STRICT_RATING_DELTA) return 'near_0_99';
    if (safeDelta <= FAIR_RATING_DELTA) return 'fair_100_199';
    if (safeDelta <= EXPANDED_RATING_DELTA) return 'expanded_200_399';
    return 'outside_400_plus';
}

function getRatingExpansionPolicy(waitMsA, waitMsB, longWaitThresholdMs) {
    const maxWaitMs = Math.max(
        Math.max(0, Math.floor(Number(waitMsA) || 0)),
        Math.max(0, Math.floor(Number(waitMsB) || 0))
    );
    const safeThresholdMs = Math.max(1000, Math.floor(Number(longWaitThresholdMs) || DEFAULT_LONG_WAIT_THRESHOLD_MS));
    if (maxWaitMs >= safeThresholdMs) {
        return {
            threshold: FAIR_RATING_DELTA,
            expansionStage: 'expanded_100_199',
            tag: 'expanded',
            wideMatchReason: 'long_wait_expansion'
        };
    }
    return {
        threshold: STRICT_RATING_DELTA,
        expansionStage: 'strict_rating',
        tag: 'good',
        wideMatchReason: ''
    };
}

function normalizeInviteTarget(target) {
    if (!target || typeof target !== 'object') return null;
    const userId = typeof target.userId === 'string' ? target.userId.trim() : '';
    if (!userId) return null;
    const displayName = typeof target.displayName === 'string' && target.displayName.trim()
        ? target.displayName.trim().slice(0, 40)
        : userId;
    return { userId, displayName };
}

function makeMatchQualityReport({
    matchedAt = Date.now(),
    waitMs = {},
    candidatePoolSize = 2,
    safeguards = null,
    expansionStage = 'mvp_open_pool',
    ratingDeltaBucket = 'unrated_mvp',
    tag = 'good',
    wideMatchReason = '',
    connectionHealthSummary = null
} = {}) {
    const safeSafeguards = Array.isArray(safeguards) && safeguards.length > 0
        ? safeguards.map(item => String(item || '')).filter(Boolean).slice(0, 8)
        : ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'first_action_budget'];
    const healthSummary = normalizeConnectionHealthSummary(connectionHealthSummary);
    const healthSafeguards = healthSummary
        ? Array.from(new Set([...safeSafeguards, 'connection_health_gate'])).slice(0, 10)
        : safeSafeguards;
    return {
        reportVersion: 'pvp-live-match-quality-v1',
        tag: tag === 'expanded' || tag === 'wide_but_accepted' || tag === 'rejected' ? tag : 'good',
        ruleVersion: RULE_VERSION,
        seasonId: 'mvp-local',
        matchedAt: Math.max(0, Math.floor(Number(matchedAt) || Date.now())),
        expansionStage: String(expansionStage || 'mvp_open_pool').slice(0, 40),
        ratingDeltaBucket: String(ratingDeltaBucket || 'unrated_mvp').slice(0, 40),
        waitMs: {
            A: Math.max(0, Math.floor(Number(waitMs.A) || 0)),
            B: Math.max(0, Math.floor(Number(waitMs.B) || 0))
        },
        candidatePoolSize: Math.max(1, Math.floor(Number(candidatePoolSize) || 2)),
        connectionHealth: healthSummary ? healthSummary.status : 'not_measured',
        connectionHealthSummary: healthSummary,
        wideMatchReason: String(wideMatchReason || '').slice(0, 80),
        safeguards: healthSafeguards
    };
}

function normalizeTelemetryToken(value, fallback = 'sample') {
    const token = String(value || fallback)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
    return token || fallback;
}

function makeFairnessTelemetryReason(prefix, value) {
    const safePrefix = normalizeTelemetryToken(prefix, 'fairness');
    const safeValue = normalizeTelemetryToken(value, 'sample');
    return `${safePrefix}_${safeValue}`.slice(0, 64);
}

function getMatchTelemetryStateVersion(match, stateView = null) {
    return Math.max(
        0,
        Math.floor(Number(stateView && stateView.stateVersion) || 0),
        Math.floor(Number(match && match.state && match.state.stateVersion) || 0)
    );
}

function collectStateViewFairnessTelemetryReasons(stateView = {}) {
    const reasons = [];
    const tempoState = String(stateView.connectionTempoReport && stateView.connectionTempoReport.tempoState || '');
    if (tempoState && tempoState !== 'stable') {
        reasons.push(makeFairnessTelemetryReason('connection', tempoState));
    }
    const receiptState = String(
        stateView.postMatchReview
        && stateView.postMatchReview.fairnessReceipt
        && stateView.postMatchReview.fairnessReceipt.receiptState
        || ''
    );
    if (receiptState === 'watch' || receiptState === 'accepted') {
        reasons.push(makeFairnessTelemetryReason('fairness_receipt', receiptState));
    }
    return Array.from(new Set(reasons));
}

function normalizeConnectionHealthSummary(summary) {
    if (!summary || typeof summary !== 'object') return null;
    const status = ['pass', 'risky', 'blocked'].includes(summary.status) ? summary.status : '';
    if (!status) return null;
    return {
        reportVersion: 'pvp-live-queue-connection-health-v1',
        status,
        sampleTag: String(summary.sampleTag || 'client_preflight').slice(0, 40)
    };
}

function makeQueueConnectionHealthReport(probe = null) {
    const source = probe && typeof probe === 'object' && !Array.isArray(probe) ? probe : null;
    if (!source) return null;
    const explicitStatus = String(source.status || '').trim().toLowerCase();
    const sampleWindowMs = Math.max(0, Math.floor(Number(source.sampleWindowMs) || 0));
    const missedHeartbeatCount = Math.max(0, Math.floor(Number(source.missedHeartbeatCount) || 0));
    const reconnectCount = Math.max(0, Math.floor(Number(source.reconnectCount ?? source.recentReconnectCount) || 0));
    const rttP95Ms = Math.max(0, Math.floor(Number(source.rttP95Ms ?? source.rttP95) || 0));
    const reasons = [];
    if (missedHeartbeatCount >= 2) reasons.push('missed_heartbeat');
    if (reconnectCount > 0) reasons.push('recent_reconnect');
    if (rttP95Ms > 2500) reasons.push('high_rtt');
    if (explicitStatus === 'blocked' || explicitStatus === 'risky') reasons.push(`client_${explicitStatus}`);
    const status = explicitStatus === 'blocked' || reasons.length > 0 ? 'blocked' : explicitStatus === 'risky' ? 'risky' : 'pass';
    const report = {
        reportVersion: 'pvp-live-queue-connection-health-v1',
        status,
        sampleTag: String(source.sampleTag || 'client_preflight').slice(0, 40),
        sampleWindowMs,
        reasons: Array.from(new Set(reasons)).slice(0, 6),
        actions: status === 'pass' ? [] : [
            { id: 'retry_connection_check', label: '重试检测', detail: '重新检测连接稳定性后再进入正式真人排位。' },
            { id: 'practice', label: '问道练习', detail: '练习不写正式积分。' }
        ]
    };
    return report;
}

function makeMatchConnectionHealthSummary(playerA, playerB) {
    const reports = [playerA && playerA.connectionHealth, playerB && playerB.connectionHealth]
        .map(report => normalizeConnectionHealthSummary(report));
    if (reports.length < 2 || reports.some(report => !report)) return null;
    const blocked = reports.find(report => report.status === 'blocked');
    const risky = reports.find(report => report.status === 'risky');
    const status = blocked ? 'blocked' : risky ? 'risky' : 'pass';
    return {
        reportVersion: 'pvp-live-queue-connection-health-v1',
        status,
        sampleTag: reports.every(report => report.sampleTag === 'client_preflight') ? 'client_preflight' : 'mixed_preflight'
    };
}

function makeInviteReport({ inviteCode, status = 'waiting', host = null, target = null, createdAt = Date.now(), inviteTtlMs = DEFAULT_INVITE_TTL_MS } = {}) {
    const safeStatus = ['matched', 'cancelled', 'expired'].includes(status) ? status : 'waiting';
    const safeCreatedAt = Math.max(0, Math.floor(Number(createdAt) || Date.now()));
    const safeTtlMs = Math.max(1000, Math.floor(Number(inviteTtlMs) || DEFAULT_INVITE_TTL_MS));
    const safeTarget = normalizeInviteTarget(target);
    const safeguards = ['invite_only_match', 'friendly_no_ranked_impact', 'server_authoritative', 'snapshot_locked'];
    if (safeTarget) safeguards.splice(1, 0, 'targeted_invite_only');
    return {
        reportVersion: 'pvp-live-invite-v1',
        inviteCode: normalizeInviteCode(inviteCode),
        status: safeStatus,
        mode: 'friendly',
        createdAt: safeCreatedAt,
        expiresAt: safeCreatedAt + safeTtlMs,
        host: {
            displayName: String(host && host.displayName || '邀请者').slice(0, 40)
        },
        target: safeTarget ? {
            displayName: safeTarget.displayName
        } : null,
        rankedImpact: 'none',
        formalResultPolicy: 'practice_only',
        safeguards
    };
}

function makeWaitingReport({ waitMs = 0, thresholdMs = DEFAULT_LONG_WAIT_THRESHOLD_MS, safeguards = [], createdAt = 0, now = Date.now(), candidatePoolSize = 1, wideMatchConsent = null } = {}) {
    const safeWaitMs = Math.max(0, Math.floor(Number(waitMs) || 0));
    const safeThresholdMs = Math.max(1000, Math.floor(Number(thresholdMs) || DEFAULT_LONG_WAIT_THRESHOLD_MS));
    const safeNow = Math.max(0, Math.floor(Number(now) || Date.now()));
    const safeCreatedAt = Math.max(0, Math.floor(Number(createdAt) || Math.max(0, safeNow - safeWaitMs)));
    const safeCandidatePoolSize = Math.max(1, Math.floor(Number(candidatePoolSize) || 1));
    const longWait = safeWaitMs >= safeThresholdMs;
    const mergedSafeguards = [
        'real_player_only',
        'no_ghost_fallback',
        'no_score_change',
        ...(Array.isArray(safeguards) ? safeguards.map(item => String(item || '')).filter(Boolean) : [])
    ].reduce((items, item) => appendUniqueString(items, item, 12), []);
    const hasAvoidOpponentSuppression = mergedSafeguards.includes('player_avoid_opponent');
    const hasRecentOpponentSuppression = mergedSafeguards.includes('recent_opponent_suppression');
    const hasLowSampleProtection = mergedSafeguards.includes('low_sample_protection');
    const releaseAt = hasLowSampleProtection ? safeCreatedAt + safeThresholdMs : 0;
    const releaseInMs = hasLowSampleProtection ? Math.max(0, releaseAt - safeNow) : 0;
    const protectionReason = hasLowSampleProtection
        ? 'low_sample_protection'
        : hasAvoidOpponentSuppression ? 'player_avoid_opponent'
        : hasRecentOpponentSuppression ? 'recent_opponent_suppression' : '';
    const releaseMode = hasLowSampleProtection
        ? longWait ? 'long_wait_release' : 'need_third_player'
        : hasAvoidOpponentSuppression ? 'quality_safeguard_wait'
        : hasRecentOpponentSuppression ? 'quality_safeguard_wait' : longWait ? 'long_wait_no_real_player' : 'standard_wait';
    const requiresPoolSize = hasLowSampleProtection ? 3 : 2;
    const actions = [
        {
            id: 'continue_waiting',
            label: '继续等待',
            detail: '继续等待真人，不自动切残影。'
        },
        {
            id: 'accept_wide_match',
            label: '接受宽分差',
            detail: '仅在双方都确认后，才允许 200-399 分差真人局。'
        },
        {
            id: 'practice',
            label: '问道练习',
            detail: '练习不写正式积分。'
        },
        {
            id: 'cancel_queue',
            label: '取消匹配',
            detail: '取消本次排队，不影响正式积分。'
        }
    ];
    return {
        reportVersion: 'pvp-live-waiting-report-v1',
        waitMs: safeWaitMs,
        longWaitThresholdMs: safeThresholdMs,
        longWait,
        protectionReason,
        releaseMode,
        releaseAt,
        releaseInMs,
        requiresPoolSize,
        candidatePoolSize: safeCandidatePoolSize,
        currentEligibleActions: actions.map(action => action.id),
        wideMatchConsent: wideMatchConsent && typeof wideMatchConsent === 'object'
            ? makeWideMatchConsentReport({
                ...wideMatchConsent,
                candidatePoolSize: safeCandidatePoolSize
            })
            : null,
        message: hasAvoidOpponentSuppression
            ? '已优先避开你赛后屏蔽的对手，正在为你换一位真人；若真人池过小，系统会继续解释等待原因。'
            : hasRecentOpponentSuppression
            ? '刚刚交手的近期对手会被暂时跳过，正在为你换一位真人；不会自动切残影。'
            : hasLowSampleProtection
                ? '低样本保护正在优先寻找更稳妥的真人对手；可继续等待、接受宽分差或先进入问道练习，不会自动切残影。'
            : longWait
                ? '当前真人较少，可继续等待、进入问道练习或取消匹配；不会自动切残影。'
                : '正在等待真实玩家加入；不会自动切残影。',
        safeguards: mergedSafeguards,
        actions
    };
}

const FRIENDLY_SERIES_TARGET_WINS = 2;

function normalizeFriendlyScore(score = {}) {
    const source = score && typeof score === 'object' ? score : {};
    return {
        A: Math.max(0, Math.floor(Number(source.A) || 0)),
        B: Math.max(0, Math.floor(Number(source.B) || 0))
    };
}

function normalizeTargetWins(value) {
    return Math.max(2, Math.min(5, Math.floor(Number(value) || FRIENDLY_SERIES_TARGET_WINS)));
}

function getFriendlyMaxRounds(targetWins) {
    return Math.max(1, targetWins * 2 - 1);
}

function getFriendlySeriesWinnerSeat(score, targetWins) {
    if (score.A >= targetWins && score.A > score.B) return 'A';
    if (score.B >= targetWins && score.B > score.A) return 'B';
    return '';
}

function getFriendlySeriesStatus(score, targetWins) {
    return getFriendlySeriesWinnerSeat(score, targetWins) ? 'complete' : 'ongoing';
}

function makeFriendlyRoundLabel(roundIndex, seriesStatus, targetWins = FRIENDLY_SERIES_TARGET_WINS) {
    if (seriesStatus === 'complete') return 'Bo3 已结束';
    const safeRound = Math.max(1, Math.floor(Number(roundIndex) || 2));
    return safeRound >= getFriendlyMaxRounds(normalizeTargetWins(targetWins))
        ? 'Bo3 决胜局 · 换边再战'
        : `Bo3 第 ${safeRound} 局 · 换边再战`;
}

function normalizeFriendlyParticipant(participant, fallbackSeat) {
    const source = participant && typeof participant === 'object' ? participant : {};
    const seatId = fallbackSeat === 'B' ? 'B' : 'A';
    return {
        sourceSeat: seatId,
        userId: String(source.userId || ''),
        displayName: String(source.displayName || source.userId || seatId).slice(0, 40)
    };
}

function normalizeFriendlyParticipants(participants = null) {
    const source = participants && typeof participants === 'object' ? participants : {};
    return {
        A: normalizeFriendlyParticipant(source.A, 'A'),
        B: normalizeFriendlyParticipant(source.B, 'B')
    };
}

function makeFriendlySeriesReport({
    sourceMatchId,
    originMatchId = '',
    seriesId,
    status = 'waiting_rematch',
    confirmationCount = 1,
    createdAt = Date.now(),
    sourceParticipants = null,
    scoreBySourceSeat = null,
    targetWins = FRIENDLY_SERIES_TARGET_WINS,
    roundIndex = null,
    openingFirstSourceSeat = 'A',
    roundFirstSourceSeat = '',
    lastRecordedMatchId = ''
} = {}) {
    const safeTargetWins = normalizeTargetWins(targetWins);
    const maxRounds = getFriendlyMaxRounds(safeTargetWins);
    const score = normalizeFriendlyScore(scoreBySourceSeat);
    const gamesAccountedFor = score.A + score.B;
    const seriesStatus = getFriendlySeriesStatus(score, safeTargetWins);
    const safeStatus = ['matched', 'finished', 'cancelled', 'expired'].includes(status) ? status : 'waiting_rematch';
    const safeRoundIndex = Math.max(1, Math.min(maxRounds, Math.floor(Number(roundIndex) || Math.min(maxRounds, gamesAccountedFor + 1) || 2)));
    const winnerSourceSeat = getFriendlySeriesWinnerSeat(score, safeTargetWins);
    const safeOpeningFirstSourceSeat = normalizeSourceSeat(openingFirstSourceSeat, 'A');
    const defaultRoundFirstSourceSeat = safeRoundIndex % 2 === 1
        ? safeOpeningFirstSourceSeat
        : otherSourceSeat(safeOpeningFirstSourceSeat);
    const safeRoundFirstSourceSeat = normalizeSourceSeat(roundFirstSourceSeat, defaultRoundFirstSourceSeat);
    return {
        reportVersion: 'pvp-live-friendly-series-v1',
        sourceMatchId: String(sourceMatchId || ''),
        originMatchId: String(originMatchId || sourceMatchId || ''),
        seriesId: String(seriesId || ''),
        status: safeStatus,
        format: 'bo3_mvp',
        targetWins: safeTargetWins,
        maxRounds,
        roundIndex: safeRoundIndex,
        roundLabel: makeFriendlyRoundLabel(safeRoundIndex, seriesStatus, safeTargetWins),
        seriesStatus,
        scoreBySourceSeat: score,
        sourceParticipants: normalizeFriendlyParticipants(sourceParticipants),
        leaderSourceSeat: score.A === score.B ? '' : score.A > score.B ? 'A' : 'B',
        winnerSourceSeat,
        canRequestNextRound: safeStatus === 'finished' && seriesStatus !== 'complete' && gamesAccountedFor < maxRounds,
        rankedImpact: 'none',
        formalResultPolicy: 'practice_only',
        seatPolicy: 'swap_sides',
        openerPolicy: 'friendly_series_rotating_opener',
        openingFirstSourceSeat: safeOpeningFirstSourceSeat,
        roundFirstSourceSeat: safeRoundFirstSourceSeat,
        loadoutPolicy: 'per_game_change_allowed',
        confirmationCount: Math.max(1, Math.min(2, Math.floor(Number(confirmationCount) || 1))),
        createdAt: Math.max(0, Math.floor(Number(createdAt) || Date.now())),
        safeguards: ['both_participants_confirmed', 'friendly_no_ranked_impact', 'seat_rotation', 'alternating_opener', 'loadout_change_allowed'],
        lastRecordedMatchId: String(lastRecordedMatchId || '')
    };
}

class LivePvpStore {
    constructor({
        now = () => Date.now(),
        turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
        setupReadyTimeoutMs = DEFAULT_SETUP_READY_TIMEOUT_MS,
        longWaitThresholdMs = DEFAULT_LONG_WAIT_THRESHOLD_MS,
        heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
        heartbeatStaleMs = DEFAULT_HEARTBEAT_STALE_MS,
        reconnectGraceMs = DEFAULT_RECONNECT_GRACE_MS,
        inviteTtlMs = DEFAULT_INVITE_TTL_MS,
        rematchTtlMs = DEFAULT_REMATCH_TTL_MS,
        recentOpponentCooldownMs = DEFAULT_RECENT_OPPONENT_COOLDOWN_MS,
        avoidOpponentCooldownMs = DEFAULT_AVOID_OPPONENT_COOLDOWN_MS,
        queueCancelWindowMs = DEFAULT_QUEUE_CANCEL_WINDOW_MS,
        queueCancelCooldownMs = DEFAULT_QUEUE_CANCEL_COOLDOWN_MS,
        queueCancelCooldownThreshold = DEFAULT_QUEUE_CANCEL_COOLDOWN_THRESHOLD,
        readyTimeoutCooldownMs = DEFAULT_READY_TIMEOUT_COOLDOWN_MS,
        persistence = null,
        settlement = null,
        ratingProvider = null
    } = {}) {
        this.now = now;
        this.turnTimeoutMs = Math.max(1000, Math.floor(Number(turnTimeoutMs) || DEFAULT_TURN_TIMEOUT_MS));
        this.setupReadyTimeoutMs = Math.max(1000, Math.floor(Number(setupReadyTimeoutMs) || DEFAULT_SETUP_READY_TIMEOUT_MS));
        this.longWaitThresholdMs = Math.max(1000, Math.floor(Number(longWaitThresholdMs) || DEFAULT_LONG_WAIT_THRESHOLD_MS));
        this.heartbeatIntervalMs = Math.max(1000, Math.floor(Number(heartbeatIntervalMs) || DEFAULT_HEARTBEAT_INTERVAL_MS));
        this.heartbeatStaleMs = Math.max(this.heartbeatIntervalMs, Math.floor(Number(heartbeatStaleMs) || DEFAULT_HEARTBEAT_STALE_MS));
        this.reconnectGraceMs = Math.max(1000, Math.floor(Number(reconnectGraceMs) || DEFAULT_RECONNECT_GRACE_MS));
        this.inviteTtlMs = Math.max(5000, Math.floor(Number(inviteTtlMs) || DEFAULT_INVITE_TTL_MS));
        this.rematchTtlMs = Math.max(5000, Math.floor(Number(rematchTtlMs) || DEFAULT_REMATCH_TTL_MS));
        this.recentOpponentCooldownMs = Number.isFinite(Number(recentOpponentCooldownMs))
            ? Math.max(0, Math.floor(Number(recentOpponentCooldownMs)))
            : DEFAULT_RECENT_OPPONENT_COOLDOWN_MS;
        this.avoidOpponentCooldownMs = Number.isFinite(Number(avoidOpponentCooldownMs))
            ? Math.max(0, Math.floor(Number(avoidOpponentCooldownMs)))
            : DEFAULT_AVOID_OPPONENT_COOLDOWN_MS;
        this.queueCancelWindowMs = Math.max(1000, Math.floor(Number(queueCancelWindowMs) || DEFAULT_QUEUE_CANCEL_WINDOW_MS));
        this.queueCancelCooldownMs = Math.max(0, Math.floor(Number(queueCancelCooldownMs) || DEFAULT_QUEUE_CANCEL_COOLDOWN_MS));
        this.queueCancelCooldownThreshold = Math.max(1, Math.floor(Number(queueCancelCooldownThreshold) || DEFAULT_QUEUE_CANCEL_COOLDOWN_THRESHOLD));
        this.readyTimeoutCooldownMs = Math.max(0, Math.floor(Number(readyTimeoutCooldownMs) || DEFAULT_READY_TIMEOUT_COOLDOWN_MS));
        this.persistence = persistence;
        this.settlement = settlement;
        this.ratingProvider = ratingProvider;
        this.reset();
    }

    reset() {
        this.waitingQueue = [];
        this.queueTickets = new Map();
        this.pendingQueueResults = new Map();
        this.consumedQueueTickets = new Set();
        this.matches = new Map();
        this.activeMatchByUserId = new Map();
        this.friendlyRematchRequests = new Map();
        this.inviteRooms = new Map();
        this.inviteCodeByHostUserId = new Map();
        this.recentOpponentPairs = new Map();
        this.avoidedOpponentPairs = new Map();
        this.matchmakingGuards = new Map();
        this.replayShares = new Map();
    }

    setPersistence(persistence = null) {
        this.persistence = persistence;
    }

    setSettlement(settlement = null) {
        this.settlement = settlement;
    }

    setRatingProvider(ratingProvider = null) {
        this.ratingProvider = ratingProvider;
    }

    rememberQueueEntry(queueEntry) {
        if (!queueEntry || !queueEntry.queueTicket || !queueEntry.player || !queueEntry.player.userId) return null;
        if (queueEntry.ratingSnapshot) {
            queueEntry.ratingSnapshot = normalizeRatingSnapshot(queueEntry.ratingSnapshot);
        }
        const existing = this.queueTickets.get(queueEntry.queueTicket);
        if (existing) {
            if (!existing.ratingSnapshot && queueEntry.ratingSnapshot) {
                existing.ratingSnapshot = queueEntry.ratingSnapshot;
            }
            if (queueEntry.wideMatchConsent === true) {
                existing.wideMatchConsent = true;
            }
            if (!existing.player.connectionHealth && queueEntry.player.connectionHealth) {
                existing.player.connectionHealth = queueEntry.player.connectionHealth;
            }
            if (!existing.testMatchScope && queueEntry.testMatchScope) {
                existing.testMatchScope = queueEntry.testMatchScope;
            }
            if (!existing.testOpenerSeed && queueEntry.testOpenerSeed) {
                existing.testOpenerSeed = queueEntry.testOpenerSeed;
            }
            if (queueEntry.matchmakingSuppressionReasons && queueEntry.matchmakingSuppressionReasons.length > 0) {
                existing.matchmakingSuppressionReasons = this.mergeQueueSuppressionReasons(
                    existing.matchmakingSuppressionReasons,
                    queueEntry.matchmakingSuppressionReasons
                );
            }
            return existing;
        }
        const duplicateUserTicket = this.waitingQueue.find(entry => entry.player && entry.player.userId === queueEntry.player.userId);
        if (duplicateUserTicket) {
            if (!duplicateUserTicket.ratingSnapshot && queueEntry.ratingSnapshot) {
                duplicateUserTicket.ratingSnapshot = queueEntry.ratingSnapshot;
            }
            if (queueEntry.wideMatchConsent === true) {
                duplicateUserTicket.wideMatchConsent = true;
            }
            if (!duplicateUserTicket.player.connectionHealth && queueEntry.player.connectionHealth) {
                duplicateUserTicket.player.connectionHealth = queueEntry.player.connectionHealth;
            }
            if (!duplicateUserTicket.testMatchScope && queueEntry.testMatchScope) {
                duplicateUserTicket.testMatchScope = queueEntry.testMatchScope;
            }
            if (!duplicateUserTicket.testOpenerSeed && queueEntry.testOpenerSeed) {
                duplicateUserTicket.testOpenerSeed = queueEntry.testOpenerSeed;
            }
            if (queueEntry.matchmakingSuppressionReasons && queueEntry.matchmakingSuppressionReasons.length > 0) {
                duplicateUserTicket.matchmakingSuppressionReasons = this.mergeQueueSuppressionReasons(
                    duplicateUserTicket.matchmakingSuppressionReasons,
                    queueEntry.matchmakingSuppressionReasons
                );
            }
            return duplicateUserTicket;
        }
        this.waitingQueue.push(queueEntry);
        this.queueTickets.set(queueEntry.queueTicket, queueEntry);
        return queueEntry;
    }

    async resolveRatingSnapshot(userId) {
        if (!this.ratingProvider || typeof this.ratingProvider.getLivePvpRating !== 'function') {
            return makeDefaultRatingSnapshot();
        }
        try {
            const rating = await this.ratingProvider.getLivePvpRating(userId);
            if (!rating || !Number.isFinite(Number(rating.score))) {
                return makeDefaultRatingSnapshot();
            }
            return normalizeRatingSnapshot(rating, {
                provisionalDefault: false
            });
        } catch (error) {
            return makeDefaultRatingSnapshot();
        }
    }

    async ensureQueueEntryRating(queueEntry) {
        if (!queueEntry || !queueEntry.player || !queueEntry.player.userId) return makeDefaultRatingSnapshot();
        if (!queueEntry.ratingSnapshot) {
            queueEntry.ratingSnapshot = await this.resolveRatingSnapshot(queueEntry.player.userId);
        } else {
            queueEntry.ratingSnapshot = normalizeRatingSnapshot(queueEntry.ratingSnapshot);
        }
        return queueEntry.ratingSnapshot;
    }

    async saveQueueEntry(queueEntry) {
        if (!this.persistence || typeof this.persistence.saveQueueEntry !== 'function') return;
        await this.persistence.saveQueueEntry(queueEntry);
    }

    mergeQueueSuppressionReasons(existingReasons, incomingReasons) {
        const existing = Array.isArray(existingReasons) ? existingReasons : [];
        const incoming = Array.isArray(incomingReasons) ? incomingReasons : [incomingReasons];
        return incoming.reduce((items, reason) => appendUniqueString(items, reason, 12), existing);
    }

    markQueueSuppression(queueEntry, reason) {
        if (!queueEntry || !reason) return;
        queueEntry.matchmakingSuppressionReasons = this.mergeQueueSuppressionReasons(
            queueEntry.matchmakingSuppressionReasons,
            [reason]
        );
    }

    async saveRecentOpponentPair(pair) {
        if (!this.persistence || typeof this.persistence.saveRecentOpponentPair !== 'function') return;
        await this.persistence.saveRecentOpponentPair(pair);
    }

    async loadRecentOpponentPair(userIdA, userIdB) {
        if (!this.persistence || typeof this.persistence.loadRecentOpponentPair !== 'function') return null;
        const pair = await this.persistence.loadRecentOpponentPair(userIdA, userIdB);
        return normalizeRecentOpponentPair(pair);
    }

    async saveAvoidedOpponentPair(pair) {
        const normalized = normalizeAvoidedOpponentPair(pair);
        if (!normalized || !normalized.expiresAt) return null;
        this.avoidedOpponentPairs.set(normalized.preferenceKey, normalized);
        if (this.persistence && typeof this.persistence.saveAvoidedOpponentPair === 'function') {
            await this.persistence.saveAvoidedOpponentPair(normalized);
        }
        return normalized;
    }

    async loadAvoidedOpponentPair(userIdA, userIdB) {
        if (!this.persistence || typeof this.persistence.loadAvoidedOpponentPair !== 'function') return null;
        const pair = await this.persistence.loadAvoidedOpponentPair(userIdA, userIdB);
        return normalizeAvoidedOpponentPair(pair);
    }

    async saveMatchmakingGuard(profile) {
        const normalized = normalizeMatchmakingGuardProfile(profile);
        if (!normalized) return null;
        this.matchmakingGuards.set(normalized.userId, normalized);
        if (this.persistence && typeof this.persistence.saveMatchmakingGuard === 'function') {
            await this.persistence.saveMatchmakingGuard(normalized);
        }
        return normalized;
    }

    async loadMatchmakingGuard(userId) {
        const id = String(userId || '').trim();
        if (!id) return null;
        const local = normalizeMatchmakingGuardProfile(this.matchmakingGuards.get(id));
        if (local) return local;
        if (!this.persistence || typeof this.persistence.loadMatchmakingGuard !== 'function') return null;
        const persisted = normalizeMatchmakingGuardProfile(await this.persistence.loadMatchmakingGuard(id));
        if (persisted) this.matchmakingGuards.set(id, persisted);
        return persisted;
    }

    async getActiveMatchmakingGuard(userId) {
        const profile = await this.loadMatchmakingGuard(userId);
        if (!profile) return null;
        const report = makeMatchmakingGuardReport(profile, this.now());
        if (!report || report.status !== 'blocked') return null;
        return report;
    }

    async recordQueueCancellation(userId) {
        const id = String(userId || '').trim();
        if (!id) return null;
        const now = this.now();
        const existing = normalizeMatchmakingGuardProfile(await this.loadMatchmakingGuard(id)) || { userId: id };
        const withinWindow = existing.cancelWindowStartedAt > 0 && now - existing.cancelWindowStartedAt <= this.queueCancelWindowMs;
        const nextCount = (withinWindow ? existing.cancelCount : 0) + 1;
        const nextProfile = {
            ...existing,
            userId: id,
            cancelWindowStartedAt: withinWindow ? existing.cancelWindowStartedAt : now,
            cancelCount: nextCount
        };
        if (this.queueCancelCooldownMs > 0 && nextCount >= this.queueCancelCooldownThreshold) {
            nextProfile.cooldownUntil = now + this.queueCancelCooldownMs;
            nextProfile.cooldownSource = 'queue_cancel_abuse';
            nextProfile.cancelWindowStartedAt = 0;
            nextProfile.cancelCount = 0;
        }
        await this.saveMatchmakingGuard(nextProfile);
        return makeMatchmakingGuardReport(nextProfile, now);
    }

    async applyQueueCooldown(userId, cooldownSource, durationMs) {
        const id = String(userId || '').trim();
        const duration = Math.max(0, Math.floor(Number(durationMs) || 0));
        if (!id || duration <= 0) return null;
        const now = this.now();
        const existing = normalizeMatchmakingGuardProfile(await this.loadMatchmakingGuard(id)) || { userId: id };
        const cooldownUntil = now + duration;
        const nextProfile = {
            ...existing,
            userId: id,
            cooldownUntil: Math.max(existing.cooldownUntil || 0, cooldownUntil),
            cooldownSource: cooldownUntil >= (existing.cooldownUntil || 0) ? String(cooldownSource || 'queue_cooldown').slice(0, 40) : existing.cooldownSource,
            cancelWindowStartedAt: 0,
            cancelCount: 0
        };
        await this.saveMatchmakingGuard(nextProfile);
        return makeMatchmakingGuardReport(nextProfile, now);
    }

    async recordReadyTimeoutCooldowns(match) {
        if (!match || !match.state || match.state.status !== 'invalidated' || this.readyTimeoutCooldownMs <= 0) return [];
        if (match.mode === 'friendly' || match.state.mode === 'friendly') return [];
        const events = Array.isArray(match.state.events) ? match.state.events : [];
        const timeoutEvent = events.slice().reverse().find(event => event && event.eventType === 'ready_timeout' && event.payload);
        const unreadySeats = Array.isArray(timeoutEvent && timeoutEvent.payload && timeoutEvent.payload.unreadySeats)
            ? timeoutEvent.payload.unreadySeats.map(seatId => String(seatId || '')).filter(Boolean)
            : [];
        const uniqueUserIds = Array.from(new Set(unreadySeats
            .map(seatId => this.getSourceSeatUserId(match, seatId))
            .filter(Boolean)));
        const reports = [];
        for (const userId of uniqueUserIds) {
            reports.push(await this.applyQueueCooldown(userId, 'ready_timeout', this.readyTimeoutCooldownMs));
        }
        return reports.filter(Boolean);
    }

    async recordSetupConnectionTimeoutCooldowns(match) {
        if (!match || !match.state || match.state.status !== 'invalidated' || this.readyTimeoutCooldownMs <= 0) return [];
        if (match.mode === 'friendly' || match.state.mode === 'friendly') return [];
        const events = Array.isArray(match.state.events) ? match.state.events : [];
        const invalidatedEvent = events.slice().reverse().find(event => event && event.eventType === 'match_invalidated' && event.payload);
        if (!invalidatedEvent || invalidatedEvent.payload.reason !== 'connection_timeout') return [];
        const timeoutEvent = events.slice().reverse().find(event => event && event.eventType === 'connection_timeout' && event.payload && event.payload.phase === 'setup');
        const disconnectedSeats = Array.isArray(timeoutEvent && timeoutEvent.payload && timeoutEvent.payload.disconnectedSeats)
            ? timeoutEvent.payload.disconnectedSeats.map(seatId => String(seatId || '')).filter(Boolean)
            : [];
        const uniqueUserIds = Array.from(new Set(disconnectedSeats
            .map(seatId => this.getSourceSeatUserId(match, seatId))
            .filter(Boolean)));
        const reports = [];
        for (const userId of uniqueUserIds) {
            reports.push(await this.applyQueueCooldown(userId, 'connection_timeout', this.readyTimeoutCooldownMs));
        }
        return reports.filter(Boolean);
    }

    async rememberRecentOpponentPair(match) {
        if (!match || !match.seatsByUserId || !match.state || match.state.status !== 'finished') return;
        if (match.mode === 'friendly' || match.state.mode === 'friendly') return;
        const participants = Object.keys(match.seatsByUserId).filter(Boolean);
        if (participants.length !== 2) return;
        const pairKey = makeRecentOpponentPairKey(participants[0], participants[1]);
        if (!pairKey) return;
        const [userIdA, userIdB] = pairKey.split('::');
        const pair = {
            pairKey,
            userIdA,
            userIdB,
            lastMatchId: String(match.matchId || ''),
            lastMatchedAt: this.now()
        };
        this.recentOpponentPairs.set(pairKey, pair);
        await this.saveRecentOpponentPair(pair);
    }

    isRecentOpponentPairFresh(pair) {
        const normalized = normalizeRecentOpponentPair(pair);
        if (!normalized || !normalized.lastMatchedAt || this.recentOpponentCooldownMs <= 0) return false;
        return this.now() - normalized.lastMatchedAt < this.recentOpponentCooldownMs;
    }

    async isRecentOpponentPair(userIdA, userIdB) {
        if (this.recentOpponentCooldownMs <= 0) return false;
        const pairKey = makeRecentOpponentPairKey(userIdA, userIdB);
        if (!pairKey) return false;
        const localPair = this.recentOpponentPairs.get(pairKey);
        if (this.isRecentOpponentPairFresh(localPair)) return true;
        if (localPair) this.recentOpponentPairs.delete(pairKey);
        const persistedPair = await this.loadRecentOpponentPair(userIdA, userIdB);
        if (!persistedPair) return false;
        if (!this.isRecentOpponentPairFresh(persistedPair)) return false;
        this.recentOpponentPairs.set(pairKey, persistedPair);
        return true;
    }

    isAvoidedOpponentPairFresh(pair) {
        const normalized = normalizeAvoidedOpponentPair(pair);
        if (!normalized || !normalized.expiresAt || this.avoidOpponentCooldownMs <= 0) return false;
        return normalized.expiresAt > this.now();
    }

    async isAvoidedOpponentPair(userIdA, userIdB) {
        if (this.avoidOpponentCooldownMs <= 0) return false;
        const firstKey = makeAvoidedOpponentPreferenceKey(userIdA, userIdB);
        const secondKey = makeAvoidedOpponentPreferenceKey(userIdB, userIdA);
        for (const key of [firstKey, secondKey].filter(Boolean)) {
            const localPair = this.avoidedOpponentPairs.get(key);
            if (this.isAvoidedOpponentPairFresh(localPair)) return true;
            if (localPair) this.avoidedOpponentPairs.delete(key);
        }
        const persistedPair = await this.loadAvoidedOpponentPair(userIdA, userIdB);
        if (!persistedPair) return false;
        if (!this.isAvoidedOpponentPairFresh(persistedPair)) return false;
        this.avoidedOpponentPairs.set(persistedPair.preferenceKey, persistedPair);
        return true;
    }

    async avoidOpponentForUser(userId, matchId, request = {}) {
        const matchAccess = await this.getMatchForUser(userId, matchId);
        if (!matchAccess) return null;
        const { match, seatId, stateView } = matchAccess;
        const status = String(stateView && stateView.status || match && match.state && match.state.status || '');
        if (!this.isTerminalStatus(status)) {
            return {
                success: false,
                reason: 'avoid_opponent_not_ready',
                message: '对局结束后才能设置赛后避开对手'
            };
        }
        const opponentUserId = this.getSourceSeatUserId(match, otherSourceSeat(seatId));
        const avoiderUserId = String(userId || '').trim();
        if (!avoiderUserId || !opponentUserId || opponentUserId === avoiderUserId) return null;
        const avoidedAt = this.now();
        const pair = await this.saveAvoidedOpponentPair({
            avoiderUserId,
            avoidedUserId: opponentUserId,
            sourceMatchId: match.matchId,
            reason: request && request.reason,
            message: request && request.message,
            avoidedAt,
            expiresAt: avoidedAt + this.avoidOpponentCooldownMs
        });
        if (!pair) {
            return {
                success: false,
                reason: 'avoid_opponent_disabled',
                message: '赛后避开对手功能暂不可用'
            };
        }
        return {
            reportVersion: 'pvp-live-avoid-opponent-receipt-v1',
            status: 'active',
            reason: pair.reason,
            message: pair.message,
            sourceVisibility: 'account_preference',
            usesHiddenInformation: false,
            rankedImpact: 'none',
            formalResultPolicy: 'no_result_change',
            safeguard: 'player_avoid_opponent',
            sourceMatchId: String(match.matchId || ''),
            avoidedAt: pair.avoidedAt,
            expiresAt: pair.expiresAt,
            avoidWindowMs: this.avoidOpponentCooldownMs,
            nextStepLine: '已记录：后续匹配会优先避开此对手；这不会改写本局结算，真人池过小时系统会解释等待原因。',
            boundary: '避开对手只影响后续匹配优先级，不保证永久不匹配，不影响积分、奖励或隐藏信息。'
        };
    }

    async deleteQueueEntry(queueTicket) {
        if (!this.persistence || typeof this.persistence.deleteQueueEntry !== 'function') return;
        await this.persistence.deleteQueueEntry(queueTicket);
    }

    async claimQueueEntry(queueEntry) {
        if (!queueEntry || !queueEntry.queueTicket || !queueEntry.player || !queueEntry.player.userId) {
            return { claimed: false };
        }
        this.waitingQueue = this.waitingQueue.filter(entry => entry !== queueEntry);
        this.queueTickets.delete(queueEntry.queueTicket);
        if (!this.persistence || typeof this.persistence.claimQueueEntry !== 'function') {
            return { claimed: true, queueEntry };
        }
        const result = await this.persistence.claimQueueEntry(queueEntry.queueTicket, queueEntry.player.userId);
        if (result && result.claimed) return { claimed: true, queueEntry };
        return { claimed: false };
    }

    async claimQueueEntries(queueEntries) {
        const entries = Array.isArray(queueEntries) ? queueEntries : [];
        const claims = entries.map(entry => ({
            queueEntry: entry,
            queueTicket: String(entry && entry.queueTicket || '').trim(),
            userId: String(entry && entry.player && entry.player.userId || '').trim()
        }));
        if (claims.length === 0 || claims.some(claim => !claim.queueTicket || !claim.userId)) {
            return { claimed: false };
        }
        const uniqueTickets = new Set(claims.map(claim => claim.queueTicket));
        if (uniqueTickets.size !== claims.length) return { claimed: false };
        this.waitingQueue = this.waitingQueue.filter(entry => !entries.includes(entry));
        claims.forEach(claim => this.queueTickets.delete(claim.queueTicket));
        if (!this.persistence || typeof this.persistence.claimQueueEntries !== 'function') {
            return { claimed: true, queueEntries: entries };
        }
        const result = await this.persistence.claimQueueEntries(claims.map(claim => ({
            queueTicket: claim.queueTicket,
            userId: claim.userId
        })));
        if (result && result.claimed) return { claimed: true, queueEntries: entries };
        return { claimed: false };
    }

    async deleteQueueEntryForUser(userId) {
        const id = String(userId || '').trim();
        if (!id) return;
        this.waitingQueue = this.waitingQueue.filter(entry => !(entry.player && entry.player.userId === id));
        for (const [ticket, entry] of this.queueTickets.entries()) {
            if (entry && entry.player && entry.player.userId === id) {
                this.queueTickets.delete(ticket);
            }
        }
        if (!this.persistence || typeof this.persistence.deleteQueueEntryForUser !== 'function') return;
        await this.persistence.deleteQueueEntryForUser(id);
    }

    async saveQueueHandoff(handoff) {
        if (!this.persistence || typeof this.persistence.saveQueueHandoff !== 'function') return;
        await this.persistence.saveQueueHandoff(handoff);
    }

    async loadQueueHandoff(queueTicket, userId) {
        if (!this.persistence || typeof this.persistence.loadQueueHandoff !== 'function') return null;
        return this.persistence.loadQueueHandoff(queueTicket, userId);
    }

    async saveMatchedQueueHandoff(queueEntry, match) {
        if (!queueEntry || !queueEntry.queueTicket || !queueEntry.player || !queueEntry.player.userId || !match || !match.matchId) return;
        await this.saveQueueHandoff({
            queueTicket: queueEntry.queueTicket,
            userId: queueEntry.player.userId,
            matchId: match.matchId,
            createdAt: this.now()
        });
    }

    async saveFriendlyRematchRequest(request) {
        if (!this.persistence || typeof this.persistence.saveRematchRequest !== 'function') return;
        await this.persistence.saveRematchRequest(request);
    }

    async deleteFriendlyRematchRequest(sourceMatchId) {
        if (!this.persistence || typeof this.persistence.deleteRematchRequest !== 'function') return;
        await this.persistence.deleteRematchRequest(sourceMatchId);
    }

    async hydrateFriendlyRematchRequest(sourceMatchId, participantIds = []) {
        const matchId = String(sourceMatchId || '').trim();
        if (!matchId || !this.persistence || typeof this.persistence.loadRematchRequest !== 'function') return null;
        const request = await this.persistence.loadRematchRequest(matchId);
        if (!request || request.sourceMatchId !== matchId || !request.playersByUserId || typeof request.playersByUserId.forEach !== 'function') return null;
        const allowed = new Set((Array.isArray(participantIds) ? participantIds : []).map(id => String(id || '')).filter(Boolean));
        const playersByUserId = new Map();
        request.playersByUserId.forEach((player, userId) => {
            if (allowed.size > 0 && !allowed.has(userId)) return;
            if (!player || !player.userId || !player.loadoutSnapshot) return;
            playersByUserId.set(userId, player);
        });
        if (playersByUserId.size === 0) return null;
        const hydrated = {
            sourceMatchId: matchId,
            seriesId: String(request.seriesId || ''),
            createdAt: Math.max(0, Math.floor(Number(request.createdAt) || this.now())),
            seriesCreatedAt: Math.max(0, Math.floor(Number(request.seriesCreatedAt) || 0)),
            playersByUserId
        };
        if (!hydrated.seriesId) return null;
        this.friendlyRematchRequests.set(matchId, hydrated);
        return hydrated;
    }

    async clearWaitingEntriesForMatch(match) {
        if (!match || !match.seatsByUserId) return;
        await Promise.all(Object.keys(match.seatsByUserId).map(userId => this.deleteQueueEntryForUser(userId)));
    }

    async hydrateWaitingQueueEntryForUser(userId) {
        if (!this.persistence || typeof this.persistence.loadQueueEntryForUser !== 'function') return null;
        const queueEntry = await this.persistence.loadQueueEntryForUser(userId);
        return this.rememberQueueEntry(queueEntry);
    }

    async hydrateWaitingQueueEntryByTicket(queueTicket) {
        if (!this.persistence || typeof this.persistence.loadQueueEntryByTicket !== 'function') return null;
        const queueEntry = await this.persistence.loadQueueEntryByTicket(queueTicket);
        return this.rememberQueueEntry(queueEntry);
    }

    async hydrateOldestWaitingOpponent(userId) {
        if (!this.persistence || typeof this.persistence.loadOldestQueueEntryExceptUser !== 'function') return null;
        const queueEntry = await this.persistence.loadOldestQueueEntryExceptUser(userId);
        return this.rememberQueueEntry(queueEntry);
    }

    async hydrateWaitingQueueEntriesExceptUser(userId) {
        if (!this.persistence || typeof this.persistence.loadQueueEntriesExceptUser !== 'function') {
            const oldest = await this.hydrateOldestWaitingOpponent(userId);
            return oldest ? [oldest] : [];
        }
        const queueEntries = await this.persistence.loadQueueEntriesExceptUser(userId);
        return (Array.isArray(queueEntries) ? queueEntries : [])
            .map(queueEntry => this.rememberQueueEntry(queueEntry))
            .filter(Boolean);
    }

    rememberInviteRoom(inviteRoom) {
        if (!inviteRoom || !inviteRoom.inviteCode || !inviteRoom.host || !inviteRoom.host.userId) return null;
        const inviteCode = normalizeInviteCode(inviteRoom.inviteCode);
        if (!inviteCode) return null;
        const existing = this.inviteRooms.get(inviteCode);
        if (existing) return existing;
        const hostExistingCode = this.inviteCodeByHostUserId.get(inviteRoom.host.userId);
        if (hostExistingCode && this.inviteRooms.get(hostExistingCode)) {
            return this.inviteRooms.get(hostExistingCode);
        }
        const normalized = {
            inviteCode,
            host: inviteRoom.host,
            target: normalizeInviteTarget(inviteRoom.target),
            createdAt: Math.max(0, Math.floor(Number(inviteRoom.createdAt) || this.now()))
        };
        this.inviteRooms.set(inviteCode, normalized);
        this.inviteCodeByHostUserId.set(normalized.host.userId, inviteCode);
        return normalized;
    }

    async saveInviteRoom(inviteRoom) {
        if (!this.persistence || typeof this.persistence.saveInviteRoom !== 'function') return;
        await this.persistence.saveInviteRoom(inviteRoom);
    }

    async deleteInviteRoom(inviteCode) {
        const code = normalizeInviteCode(inviteCode);
        const inviteRoom = this.inviteRooms.get(code);
        if (inviteRoom && inviteRoom.host && inviteRoom.host.userId) {
            this.inviteCodeByHostUserId.delete(inviteRoom.host.userId);
        }
        this.inviteRooms.delete(code);
        if (!this.persistence || typeof this.persistence.deleteInviteRoom !== 'function') return;
        await this.persistence.deleteInviteRoom(code);
    }

    async hydrateInviteRoomByCode(inviteCode) {
        const code = normalizeInviteCode(inviteCode);
        if (!code) return null;
        const existing = this.inviteRooms.get(code);
        if (existing) return existing;
        if (!this.persistence || typeof this.persistence.loadInviteRoomByCode !== 'function') return null;
        return this.rememberInviteRoom(await this.persistence.loadInviteRoomByCode(code));
    }

    async hydrateInviteRoomForHost(userId) {
        const id = String(userId || '').trim();
        if (!id) return null;
        const existingCode = this.inviteCodeByHostUserId.get(id);
        if (existingCode && this.inviteRooms.get(existingCode)) return this.inviteRooms.get(existingCode);
        if (!this.persistence || typeof this.persistence.loadInviteRoomForHost !== 'function') return null;
        return this.rememberInviteRoom(await this.persistence.loadInviteRoomForHost(id));
    }

    isInviteExpired(inviteRoom) {
        if (!inviteRoom) return false;
        const createdAt = Math.max(0, Math.floor(Number(inviteRoom.createdAt) || 0));
        return createdAt > 0 && this.now() - createdAt >= this.inviteTtlMs;
    }

    async deleteIfInviteExpired(inviteRoom) {
        if (!inviteRoom || !this.isInviteExpired(inviteRoom)) return false;
        await this.deleteInviteRoom(inviteRoom.inviteCode);
        return true;
    }

    makeInviteResult(inviteRoom) {
        return {
            status: 'waiting_invite',
            inviteCode: inviteRoom.inviteCode,
            loadoutHash: inviteRoom.host && inviteRoom.host.loadoutSnapshot && inviteRoom.host.loadoutSnapshot.loadoutHash || '',
            loadoutSummary: publicLoadoutSummary(inviteRoom.host && inviteRoom.host.loadoutSnapshot),
            inviteReport: makeInviteReport({
                inviteCode: inviteRoom.inviteCode,
                status: 'waiting',
                host: inviteRoom.host,
                target: inviteRoom.target,
                createdAt: inviteRoom.createdAt,
                inviteTtlMs: this.inviteTtlMs
            })
        };
    }

    async getInviteInbox(userId) {
        const id = String(userId || '').trim();
        if (!id) return { status: 'invite_inbox', invites: [] };
        const roomsByCode = new Map();
        for (const room of this.inviteRooms.values()) {
            if (room && room.target && room.target.userId === id) {
                roomsByCode.set(room.inviteCode, room);
            }
        }
        if (this.persistence && typeof this.persistence.loadInviteRoomsForTarget === 'function') {
            const persistedRooms = await this.persistence.loadInviteRoomsForTarget(id);
            (Array.isArray(persistedRooms) ? persistedRooms : []).forEach(room => {
                const remembered = this.rememberInviteRoom(room);
                if (remembered && remembered.target && remembered.target.userId === id) {
                    roomsByCode.set(remembered.inviteCode, remembered);
                }
            });
        }
        const invites = [];
        for (const room of roomsByCode.values()) {
            if (!room || await this.deleteIfInviteExpired(room)) continue;
            invites.push({
                inviteCode: room.inviteCode,
                createdAt: room.createdAt,
                inviteReport: makeInviteReport({
                    inviteCode: room.inviteCode,
                    status: 'waiting',
                    host: room.host,
                    target: room.target,
                    createdAt: room.createdAt,
                    inviteTtlMs: this.inviteTtlMs
                })
            });
        }
        invites.sort((left, right) => Math.max(0, Math.floor(Number(right.createdAt) || 0)) - Math.max(0, Math.floor(Number(left.createdAt) || 0)));
        return {
            status: 'invite_inbox',
            invites: invites.slice(0, 20)
        };
    }

    async createInvite(playerInput = {}) {
        const identity = normalizePlayerIdentity(playerInput);
        const target = normalizeInviteTarget(playerInput.target);
        if (target && target.userId === identity.userId) {
            return {
                status: 'blocked',
                reason: 'invite_self_target',
                message: '不能邀请自己进行好友约战'
            };
        }
        const active = await this.getActiveMatchForUser(identity.userId);
        if (active && active.match && !this.isTerminalStatus(active.match.state && active.match.state.status)) {
            return {
                status: 'blocked',
                reason: 'active_match_exists',
                message: '当前已有进行中的真人对局'
            };
        }
        if (active && active.match && this.isTerminalStatus(active.match.state && active.match.state.status)) {
            await this.releaseIfTerminal(active.match);
        }

        const existingInvite = await this.hydrateInviteRoomForHost(identity.userId);
        if (existingInvite) {
            if (!await this.deleteIfInviteExpired(existingInvite)) {
                return this.makeInviteResult(existingInvite);
            }
        }

        await this.deleteQueueEntryForUser(identity.userId);
        const player = normalizePlayer(playerInput, this.now);
        let inviteCode = makeInviteCode();
        while (this.inviteRooms.has(inviteCode)) {
            inviteCode = makeInviteCode();
        }
        const inviteRoom = this.rememberInviteRoom({
            inviteCode,
            host: player,
            target,
            createdAt: this.now()
        });
        await this.saveInviteRoom(inviteRoom);
        return this.makeInviteResult(inviteRoom);
    }

    async getCurrentInvite(userId) {
        const inviteRoom = await this.hydrateInviteRoomForHost(userId);
        if (!inviteRoom) return null;
        if (await this.deleteIfInviteExpired(inviteRoom)) {
            return {
                status: 'expired',
                reason: 'invite_expired',
                message: '好友约战邀请码已过期'
            };
        }
        return this.makeInviteResult(inviteRoom);
    }

    async joinInvite(userId, inviteCode, playerInput = {}) {
        const code = normalizeInviteCode(inviteCode);
        if (!code) return null;
        const inviteRoom = await this.hydrateInviteRoomByCode(code);
        if (!inviteRoom || !inviteRoom.host || !inviteRoom.host.userId) return null;
        if (await this.deleteIfInviteExpired(inviteRoom)) {
            return {
                status: 'expired',
                reason: 'invite_expired',
                message: '好友约战邀请码已过期'
            };
        }
        if (inviteRoom.host.userId === userId) {
            return {
                status: 'blocked',
                reason: 'invite_self_join',
                message: '不能加入自己创建的好友约战'
            };
        }
        if (inviteRoom.target && inviteRoom.target.userId && inviteRoom.target.userId !== userId) {
            return {
                status: 'blocked',
                reason: 'invite_target_mismatch',
                message: '该好友约战只邀请了指定道友'
            };
        }

        const hostActive = await this.getActiveMatchForUser(inviteRoom.host.userId);
        if (hostActive && hostActive.match && !this.isTerminalStatus(hostActive.match.state && hostActive.match.state.status)) {
            await this.deleteInviteRoom(code);
            return {
                status: 'blocked',
                reason: 'invite_host_active_match',
                message: '邀请者已有进行中的真人对局'
            };
        }
        const guestActive = await this.getActiveMatchForUser(userId);
        if (guestActive && guestActive.match && !this.isTerminalStatus(guestActive.match.state && guestActive.match.state.status)) {
            return {
                status: 'blocked',
                reason: 'active_match_exists',
                message: '当前已有进行中的真人对局'
            };
        }
        if (hostActive && hostActive.match && this.isTerminalStatus(hostActive.match.state && hostActive.match.state.status)) {
            await this.releaseIfTerminal(hostActive.match);
        }
        if (guestActive && guestActive.match && this.isTerminalStatus(guestActive.match.state && guestActive.match.state.status)) {
            await this.releaseIfTerminal(guestActive.match);
        }

        const guest = normalizePlayer({
            ...playerInput,
            userId
        }, this.now);
        const matchedAt = this.now();
        const match = await this.createMatch(inviteRoom.host, guest, {
            matchedAt,
            candidatePoolSize: 2,
            expansionStage: 'friend_invite',
            ratingDeltaBucket: 'friend_invite',
            waitMs: {
                A: Math.max(0, matchedAt - Math.floor(Number(inviteRoom.createdAt) || matchedAt)),
                B: 0
            },
            safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'first_action_budget', 'invite_only_match', 'friendly_no_ranked_impact']
        }, {
            mode: 'friendly'
        });
        await this.deleteQueueEntryForUser(inviteRoom.host.userId);
        await this.deleteQueueEntryForUser(guest.userId);
        await this.deleteInviteRoom(code);
        return {
            ...this.makeMatchedQueueResult(match, userId),
            inviteCode: code,
            inviteReport: makeInviteReport({
                inviteCode: code,
                status: 'matched',
                host: inviteRoom.host,
                target: inviteRoom.target,
                createdAt: inviteRoom.createdAt,
                inviteTtlMs: this.inviteTtlMs
            })
        };
    }

    async cancelInvite(userId, inviteCode) {
        const code = normalizeInviteCode(inviteCode);
        if (!code) return null;
        const inviteRoom = await this.hydrateInviteRoomByCode(code);
        if (!inviteRoom || !inviteRoom.host || inviteRoom.host.userId !== userId) return null;
        if (await this.deleteIfInviteExpired(inviteRoom)) {
            return {
                status: 'expired',
                reason: 'invite_expired',
                message: '好友约战邀请码已过期'
            };
        }
        await this.deleteInviteRoom(code);
        return {
            status: 'cancelled',
            inviteCode: code,
            inviteReport: makeInviteReport({
                inviteCode: code,
                status: 'cancelled',
                host: inviteRoom.host,
                target: inviteRoom.target,
                createdAt: inviteRoom.createdAt,
                inviteTtlMs: this.inviteTtlMs
            })
        };
    }

    makeOpenPoolMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize) {
        const opponentCreatedAt = Math.floor(Number(opponentTicket && opponentTicket.createdAt) || matchedAt);
        const requesterCreatedAt = Math.floor(Number(requesterEntry && requesterEntry.createdAt) || matchedAt);
        return {
            matchedAt,
            candidatePoolSize,
            waitMs: {
                A: Math.max(0, matchedAt - opponentCreatedAt),
                B: Math.max(0, matchedAt - requesterCreatedAt)
            },
            connectionHealthSummary: makeMatchConnectionHealthSummary(
                opponentTicket && opponentTicket.player,
                requesterEntry && requesterEntry.player
            )
        };
    }

    makeRatedMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize, delta) {
        const base = this.makeOpenPoolMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize);
        const policy = getRatingExpansionPolicy(base.waitMs.A, base.waitMs.B, this.longWaitThresholdMs);
        return {
            ...base,
            tag: policy.tag,
            expansionStage: policy.expansionStage,
            ratingDeltaBucket: getRatingDeltaBucket(delta),
            wideMatchReason: policy.wideMatchReason,
            safeguards: [
                'server_authoritative',
                'snapshot_locked',
                'setup_ready_required',
                'first_action_budget',
                'rating_bucketed',
                'closest_rating_candidate',
                'no_exact_rating_exposure'
            ]
        };
    }

    makeAcceptedWideMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize, delta) {
        const base = this.makeOpenPoolMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize);
        return {
            ...base,
            tag: 'wide_but_accepted',
            expansionStage: 'accepted_200_399',
            ratingDeltaBucket: getRatingDeltaBucket(delta),
            wideMatchReason: 'two_sided_explicit_consent',
            safeguards: [
                'server_authoritative',
                'snapshot_locked',
                'setup_ready_required',
                'first_action_budget',
                'rating_bucketed',
                'closest_rating_candidate',
                'no_exact_rating_exposure',
                'explicit_wide_match_consent'
            ]
        };
    }

    async selectQueueOpponent(requesterEntry) {
        await this.ensureQueueEntryRating(requesterEntry);
        const requesterTestMatchScope = getQueueEntryTestMatchScope(requesterEntry);
        const candidatePoolSize = this.waitingQueue
            .filter(ticket => ticket && ticket.player && ticket.player.userId !== requesterEntry.player.userId)
            .filter(ticket => getQueueEntryTestMatchScope(ticket) === requesterTestMatchScope)
            .length + 1;
        let openPoolChoice = null;
        const ratedChoices = [];
        const matchedAt = this.now();
        for (let index = 0; index < this.waitingQueue.length; index += 1) {
            const opponentTicket = this.waitingQueue[index];
            if (!opponentTicket || !opponentTicket.player || opponentTicket.player.userId === requesterEntry.player.userId) continue;
            if (getQueueEntryTestMatchScope(opponentTicket) !== requesterTestMatchScope) continue;
            if (await this.isAvoidedOpponentPair(opponentTicket.player.userId, requesterEntry.player.userId)) {
                this.markQueueSuppression(opponentTicket, 'player_avoid_opponent');
                this.markQueueSuppression(requesterEntry, 'player_avoid_opponent');
                await this.saveQueueEntry(opponentTicket);
                continue;
            }
            if (await this.isRecentOpponentPair(opponentTicket.player.userId, requesterEntry.player.userId)) {
                this.markQueueSuppression(opponentTicket, 'recent_opponent_suppression');
                this.markQueueSuppression(requesterEntry, 'recent_opponent_suppression');
                await this.saveQueueEntry(opponentTicket);
                continue;
            }
            await this.ensureQueueEntryRating(opponentTicket);
            const waitMsA = Math.max(0, matchedAt - Math.floor(Number(opponentTicket.createdAt) || matchedAt));
            const waitMsB = Math.max(0, matchedAt - Math.floor(Number(requesterEntry.createdAt) || matchedAt));
            const lowSamplePolicy = getLowSampleMatchPolicy(
                opponentTicket.ratingSnapshot,
                requesterEntry.ratingSnapshot,
                waitMsA,
                waitMsB,
                this.longWaitThresholdMs,
                candidatePoolSize
            );
            if (!lowSamplePolicy.allowed) {
                this.markQueueSuppression(opponentTicket, lowSamplePolicy.reason || 'low_sample_protection');
                this.markQueueSuppression(requesterEntry, lowSamplePolicy.reason || 'low_sample_protection');
                await this.saveQueueEntry(opponentTicket);
                continue;
            }
            const useRatedMatching = shouldUseRatedMatching(opponentTicket.ratingSnapshot, requesterEntry.ratingSnapshot);
            if (!useRatedMatching) {
                if (!openPoolChoice) {
                    openPoolChoice = {
                        index,
                        testMatchScope: requesterTestMatchScope,
                        lowSamplePriority: lowSamplePolicy.priority,
                        qualityInput: applyMatchQualitySafeguards(
                            this.makeOpenPoolMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize),
                            lowSamplePolicy
                        )
                    };
                }
                continue;
            }
            const policy = getRatingExpansionPolicy(waitMsA, waitMsB, this.longWaitThresholdMs);
            const delta = Math.abs(
                normalizeRatingScore(opponentTicket.ratingSnapshot && opponentTicket.ratingSnapshot.score)
                - normalizeRatingScore(requesterEntry.ratingSnapshot && requesterEntry.ratingSnapshot.score)
            );
            if (delta <= policy.threshold) {
                ratedChoices.push({
                    index,
                    delta,
                    createdAt: Math.max(0, Math.floor(Number(opponentTicket.createdAt) || 0)),
                    testMatchScope: requesterTestMatchScope,
                    lowSamplePriority: lowSamplePolicy.priority,
                    qualityInput: applyMatchQualitySafeguards(
                        this.makeRatedMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize, delta),
                        lowSamplePolicy
                    )
                });
            } else if (
                delta <= EXPANDED_RATING_DELTA
                && policy.expansionStage === 'expanded_100_199'
                && opponentTicket.wideMatchConsent === true
                && requesterEntry.wideMatchConsent === true
            ) {
                ratedChoices.push({
                    index,
                    delta,
                    createdAt: Math.max(0, Math.floor(Number(opponentTicket.createdAt) || 0)),
                    testMatchScope: requesterTestMatchScope,
                    lowSamplePriority: lowSamplePolicy.priority,
                    qualityInput: applyMatchQualitySafeguards(
                        this.makeAcceptedWideMatchQualityInput(opponentTicket, requesterEntry, matchedAt, candidatePoolSize, delta),
                        lowSamplePolicy
                    )
                });
            }
        }
        if (ratedChoices.length > 0) {
            ratedChoices.sort((left, right) => {
                if (left.lowSamplePriority !== right.lowSamplePriority) return left.lowSamplePriority - right.lowSamplePriority;
                if (left.delta !== right.delta) return left.delta - right.delta;
                return left.createdAt - right.createdAt;
            });
            if (openPoolChoice && openPoolChoice.lowSamplePriority < ratedChoices[0].lowSamplePriority) return openPoolChoice;
            return ratedChoices[0];
        }
        return openPoolChoice;
    }

    async joinQueue(playerInput) {
        const identity = normalizePlayerIdentity(playerInput);
        const connectionHealth = makeQueueConnectionHealthReport(playerInput && playerInput.connectionHealthProbe);
        if (connectionHealth && connectionHealth.status !== 'pass') {
            return {
                status: 'blocked',
                reason: 'connection_health_failed',
                message: '当前连接不适合进入正式真人排位，请重试检测或先进入问道练习。',
                connectionHealth
            };
        }
        const existingInvite = await this.hydrateInviteRoomForHost(identity.userId);
        if (existingInvite) {
            if (!await this.deleteIfInviteExpired(existingInvite)) {
                return {
                    status: 'blocked',
                    reason: 'pending_invite_exists',
                    message: '已有等待中的好友约战，不能同时进入公共匹配'
                };
            }
        }

        let activeMatchId = this.activeMatchByUserId.get(identity.userId);
        if (!activeMatchId) {
            const hydratedMatch = await this.hydrateActiveMatchForUser(identity.userId);
            activeMatchId = hydratedMatch && hydratedMatch.matchId;
        }
        if (activeMatchId) {
            const activeMatch = this.matches.get(activeMatchId);
            if (activeMatch) {
                await this.sweepMatchTimeout(activeMatch);
            }
            if (activeMatch && activeMatch.state && this.isTerminalStatus(activeMatch.state.status)) {
                await this.releaseIfTerminal(activeMatch);
            } else if (activeMatch) {
                return this.makeMatchedQueueResult(activeMatch, identity.userId);
            } else {
                this.activeMatchByUserId.delete(identity.userId);
            }
        }

        const matchmakingGuard = await this.getActiveMatchmakingGuard(identity.userId);
        if (matchmakingGuard) {
            return {
                status: 'blocked',
                reason: 'queue_cooldown',
                message: matchmakingGuard.message,
                matchmakingGuard,
                retryAt: matchmakingGuard.retryAt,
                cooldownUntil: matchmakingGuard.cooldownUntil,
                cooldownSource: matchmakingGuard.cooldownSource
            };
        }

        const existingTicket = this.waitingQueue.find(ticket => ticket.player.userId === identity.userId)
            || await this.hydrateWaitingQueueEntryForUser(identity.userId);
        if (existingTicket) {
            if (normalizeWideMatchConsent(playerInput && playerInput.wideMatchConsent) && existingTicket.wideMatchConsent !== true) {
                existingTicket.wideMatchConsent = true;
                await this.saveQueueEntry(existingTicket);
            }
            if (connectionHealth && !existingTicket.player.connectionHealth) {
                existingTicket.player.connectionHealth = connectionHealth;
                await this.saveQueueEntry(existingTicket);
            }
            if (existingTicket.wideMatchConsent === true) {
                await this.hydrateWaitingQueueEntriesExceptUser(identity.userId);
                const selectedOpponent = await this.selectQueueOpponent(existingTicket);
                if (selectedOpponent && selectedOpponent.index >= 0) {
                    const opponentTicket = this.waitingQueue[selectedOpponent.index];
                    if (opponentTicket && opponentTicket.player && opponentTicket.player.userId !== identity.userId) {
                        const pairClaim = await this.claimQueueEntries([existingTicket, opponentTicket]);
                        if (!pairClaim.claimed) {
                            return this.makeWaitingQueueResult(existingTicket);
                        }
                        const match = await this.createMatch(opponentTicket.player, existingTicket.player, selectedOpponent.qualityInput, {
                            testMatchScope: selectedOpponent.testMatchScope,
                            testOpenerSeed: selectedOpponent.testMatchScope
                                ? existingTicket.testOpenerSeed || opponentTicket.testOpenerSeed || ''
                                : ''
                        });
                        await this.saveMatchedQueueHandoff(opponentTicket, match);
                        await this.saveMatchedQueueHandoff(existingTicket, match);
                        await this.deleteQueueEntry(opponentTicket.queueTicket);
                        await this.deleteQueueEntry(existingTicket.queueTicket);
                        const opponentResult = this.makeMatchedQueueResult(match, opponentTicket.player.userId);
                        this.pendingQueueResults.set(opponentTicket.queueTicket, opponentResult);
                        return this.makeMatchedQueueResult(match, existingTicket.player.userId);
                    }
                }
            }
            return this.makeWaitingQueueResult(existingTicket);
        }

        const player = normalizePlayer(playerInput, this.now);
        if (connectionHealth) player.connectionHealth = connectionHealth;
        const requesterEntry = {
            queueTicket: '',
            player,
            ratingSnapshot: await this.resolveRatingSnapshot(player.userId),
            wideMatchConsent: normalizeWideMatchConsent(playerInput && playerInput.wideMatchConsent),
            testMatchScope: normalizeLivePvpTestMatchScope(playerInput && playerInput.testMatchScope),
            testOpenerSeed: normalizeLivePvpTestOpenerSeed(playerInput && playerInput.testOpenerSeed),
            matchmakingSuppressionReasons: [],
            createdAt: this.now()
        };
        await this.hydrateWaitingQueueEntriesExceptUser(identity.userId);
        const selectedOpponent = await this.selectQueueOpponent(requesterEntry);
        if (selectedOpponent && selectedOpponent.index >= 0) {
            const opponentTicket = this.waitingQueue[selectedOpponent.index];
            const opponentClaim = await this.claimQueueEntry(opponentTicket);
            if (opponentClaim.claimed) {
                const match = await this.createMatch(opponentTicket.player, player, selectedOpponent.qualityInput, {
                    testMatchScope: selectedOpponent.testMatchScope,
                    testOpenerSeed: selectedOpponent.testMatchScope
                        ? requesterEntry.testOpenerSeed || opponentTicket.testOpenerSeed || ''
                        : ''
                });
                await this.saveMatchedQueueHandoff(opponentTicket, match);
                await this.deleteQueueEntryForUser(player.userId);
                const opponentResult = this.makeMatchedQueueResult(match, opponentTicket.player.userId);
                this.pendingQueueResults.set(opponentTicket.queueTicket, opponentResult);
                return this.makeMatchedQueueResult(match, player.userId);
            }
        }

        const queueTicket = makeId('pvplq');
        const queueEntry = {
            queueTicket,
            player,
            ratingSnapshot: requesterEntry.ratingSnapshot,
            wideMatchConsent: requesterEntry.wideMatchConsent,
            testMatchScope: requesterEntry.testMatchScope,
            testOpenerSeed: requesterEntry.testMatchScope ? requesterEntry.testOpenerSeed : '',
            matchmakingSuppressionReasons: requesterEntry.matchmakingSuppressionReasons || [],
            createdAt: this.now()
        };
        this.waitingQueue.push(queueEntry);
        this.queueTickets.set(queueTicket, queueEntry);
        await this.saveQueueEntry(queueEntry);
        return this.makeWaitingQueueResult(queueEntry);
    }

    getWaitingEntriesForQueuePool(queueEntry) {
        const queueScope = getQueueEntryTestMatchScope(queueEntry);
        return this.waitingQueue.filter(entry =>
            entry
            && entry.player
            && entry.queueTicket
            && !this.consumedQueueTickets.has(entry.queueTicket)
            && getQueueEntryTestMatchScope(entry) === queueScope
        );
    }

    makeWideMatchConsentWaitingInput(queueEntry, candidatePoolSize = 1, poolEntries = null) {
        const activeQueueEntries = Array.isArray(poolEntries)
            ? poolEntries
            : this.getWaitingEntriesForQueuePool(queueEntry);
        return {
            viewerAccepted: queueEntry && queueEntry.wideMatchConsent === true,
            acceptedPlayerCount: activeQueueEntries.filter(entry => entry && entry.wideMatchConsent === true).length,
            candidatePoolSize,
            matchReady: false
        };
    }

    makeWaitingQueueResult(queueEntry) {
        const createdAt = Math.floor(Number(queueEntry && queueEntry.createdAt) || this.now());
        const waitMs = Math.max(0, this.now() - createdAt);
        const poolEntries = this.getWaitingEntriesForQueuePool(queueEntry);
        const candidatePoolSize = Math.max(1, poolEntries.length);
        return {
            status: 'waiting',
            queueTicket: queueEntry.queueTicket,
            loadoutHash: queueEntry.player && queueEntry.player.loadoutSnapshot && queueEntry.player.loadoutSnapshot.loadoutHash || '',
            loadoutSummary: publicLoadoutSummary(queueEntry.player && queueEntry.player.loadoutSnapshot),
            waitingReport: makeWaitingReport({
                waitMs,
                thresholdMs: this.longWaitThresholdMs,
                safeguards: queueEntry.matchmakingSuppressionReasons || [],
                createdAt,
                now: this.now(),
                candidatePoolSize,
                wideMatchConsent: this.makeWideMatchConsentWaitingInput(queueEntry, candidatePoolSize, poolEntries)
            })
        };
    }

    async getQueueStatus(userId, queueTicket) {
        const ticket = String(queueTicket || '').trim();
        if (!ticket) return null;
        const pendingResult = this.pendingQueueResults.get(ticket);
        if (pendingResult) {
            if (pendingResult.userId !== userId) return null;
            const match = this.matches.get(pendingResult.matchId);
            if (!match || !match.seatsByUserId[userId]) {
                this.pendingQueueResults.delete(ticket);
                return null;
            }
            await this.sweepMatchTimeout(match);
            if (this.isTerminalStatus(match.state.status)) {
                await this.releaseIfTerminal(match);
                this.pendingQueueResults.delete(ticket);
                return null;
            }
            this.pendingQueueResults.delete(ticket);
            this.consumedQueueTickets.add(ticket);
            return {
                status: 'matched',
                matchId: match.matchId,
                seatId: match.seatsByUserId[userId],
                stateView: this.projectMatchStateView(match, match.seatsByUserId[userId])
            };
        }

        if (this.consumedQueueTickets.has(ticket)) return null;

        const localQueueEntry = this.queueTickets.get(ticket);
        const queueEntry = localQueueEntry || await this.hydrateWaitingQueueEntryByTicket(ticket);
        const handoff = await this.loadQueueHandoff(ticket, userId);
        if (queueEntry && queueEntry.player.userId !== userId && !handoff) return null;

        const activeMatch = await this.getActiveMatchForUser(userId);
        if (activeMatch && activeMatch.match && !this.isTerminalStatus(activeMatch.match.state && activeMatch.match.state.status)) {
            await this.deleteQueueEntry(ticket);
            const handoffMatchesActive = handoff && handoff.matchId === activeMatch.match.matchId;
            const localEntryMatchesUser = localQueueEntry && localQueueEntry.player && localQueueEntry.player.userId === userId;
            if (!handoffMatchesActive && !localEntryMatchesUser) return null;
            this.consumedQueueTickets.add(ticket);
            return {
                status: 'matched',
                matchId: activeMatch.match.matchId,
                seatId: activeMatch.seatId,
                stateView: activeMatch.stateView
            };
        }

        if (!queueEntry) return null;
        if (!localQueueEntry) {
            await this.hydrateWaitingQueueEntriesExceptUser(queueEntry.player.userId);
        }
        const poolEntries = this.getWaitingEntriesForQueuePool(queueEntry);
        const candidatePoolSize = Math.max(1, poolEntries.length);
        return {
            status: 'waiting',
            queueTicket: ticket,
            loadoutHash: queueEntry.player && queueEntry.player.loadoutSnapshot && queueEntry.player.loadoutSnapshot.loadoutHash || '',
            loadoutSummary: publicLoadoutSummary(queueEntry.player && queueEntry.player.loadoutSnapshot),
            waitingReport: makeWaitingReport({
                waitMs: Math.max(0, this.now() - Math.floor(Number(queueEntry.createdAt) || this.now())),
                thresholdMs: this.longWaitThresholdMs,
                safeguards: queueEntry.matchmakingSuppressionReasons || [],
                createdAt: Math.floor(Number(queueEntry.createdAt) || this.now()),
                now: this.now(),
                candidatePoolSize,
                wideMatchConsent: this.makeWideMatchConsentWaitingInput(queueEntry, candidatePoolSize, poolEntries)
            })
        };
    }

    async cancelQueue(userId, queueTicket) {
        const ticket = String(queueTicket || '').trim();
        if (!ticket) return null;
        const pendingResult = this.pendingQueueResults.get(ticket);
        if (pendingResult) {
            if (pendingResult.userId !== userId) return null;
            const cachedMatch = this.matches.get(pendingResult.matchId);
            const seatId = cachedMatch && cachedMatch.seatsByUserId ? cachedMatch.seatsByUserId[userId] : '';
            let matchedAccess = cachedMatch && seatId
                ? { match: cachedMatch, seatId, stateView: this.projectMatchStateView(cachedMatch, seatId) }
                : await this.rehydrateAuthoritativeMatchForUser(userId, pendingResult.matchId);
            if (!matchedAccess || !matchedAccess.match || !matchedAccess.seatId) {
                this.pendingQueueResults.delete(ticket);
                return null;
            }
            await this.sweepMatchTimeout(matchedAccess.match);
            if (this.isTerminalStatus(matchedAccess.match.state && matchedAccess.match.state.status)) {
                await this.releaseIfTerminal(matchedAccess.match);
                this.pendingQueueResults.delete(ticket);
                return null;
            }
            this.queueTickets.delete(ticket);
            this.waitingQueue = this.waitingQueue.filter(entry => entry.queueTicket !== ticket);
            await this.deleteQueueEntry(ticket);
            this.pendingQueueResults.delete(ticket);
            this.consumedQueueTickets.add(ticket);
            return {
                status: 'matched',
                matchId: matchedAccess.match.matchId,
                seatId: matchedAccess.seatId,
                stateView: this.projectMatchStateView(matchedAccess.match, matchedAccess.seatId)
            };
        }
        const localQueueEntry = this.queueTickets.get(ticket);
        const queueEntry = localQueueEntry
            || await this.hydrateWaitingQueueEntryByTicket(ticket);

        const handoff = await this.loadQueueHandoff(ticket, userId);
        if (!queueEntry && !handoff) return null;
        if (queueEntry && queueEntry.player.userId !== userId && !handoff) return null;

        const activeMatch = await this.getActiveMatchForUser(userId);
        const hasActiveMatch = activeMatch && activeMatch.match && !this.isTerminalStatus(activeMatch.match.state && activeMatch.match.state.status);
        const handoffMatch = !hasActiveMatch && handoff && handoff.matchId
            ? await this.rehydrateAuthoritativeMatchForUser(userId, handoff.matchId)
            : null;
        const matchedAccess = hasActiveMatch ? activeMatch : handoffMatch;
        if ((handoff && handoff.matchId) || hasActiveMatch) {
            this.queueTickets.delete(ticket);
            this.waitingQueue = this.waitingQueue.filter(entry => entry.queueTicket !== ticket);
            await this.deleteQueueEntry(ticket);
            if (!matchedAccess || !matchedAccess.match || this.isTerminalStatus(matchedAccess.match.state && matchedAccess.match.state.status)) return null;
            this.consumedQueueTickets.add(ticket);
            return {
                status: 'matched',
                matchId: matchedAccess.match.matchId,
                seatId: matchedAccess.seatId,
                stateView: matchedAccess.stateView
            };
        }

        this.queueTickets.delete(ticket);
        this.waitingQueue = this.waitingQueue.filter(entry => entry.queueTicket !== ticket);
        await this.deleteQueueEntry(ticket);
        const matchmakingGuard = await this.recordQueueCancellation(userId);
        const cooldownBlocked = matchmakingGuard && matchmakingGuard.status === 'blocked';
        return {
            status: 'cancelled',
            queueTicket: ticket,
            ...(cooldownBlocked ? {
                reason: 'queue_cooldown',
                message: matchmakingGuard.message,
                matchmakingGuard,
                retryAt: matchmakingGuard.retryAt,
                cooldownUntil: matchmakingGuard.cooldownUntil,
                cooldownSource: matchmakingGuard.cooldownSource
            } : {})
        };
    }

    async saveMatch(match, { liveWsSourceInstanceId = '', forceConnectionSnapshot = false } = {}) {
        if (!this.persistence || typeof this.persistence.saveMatch !== 'function') return { saved: true, skipped: false, reason: 'no_persistence' };
        const result = await this.persistence.saveMatch(match, { liveWsSourceInstanceId, forceConnectionSnapshot });
        const saveResult = result && typeof result === 'object' ? result : { saved: true, skipped: false, reason: 'legacy_persistence' };
        if (saveResult.saved === false) return saveResult;
        if (typeof this.persistence.saveMatchEvents === 'function' && match && match.state && Array.isArray(match.state.events)) {
            await this.persistence.saveMatchEvents(match.matchId, match.state.events);
        }
        return saveResult;
    }

    async appendOpsEvent(event = {}) {
        if (!this.persistence || typeof this.persistence.appendOpsEvent !== 'function') return null;
        try {
            return await this.persistence.appendOpsEvent({
                ...event,
                createdAt: Math.max(0, Math.floor(Number(event.createdAt) || this.now()))
            });
        } catch (error) {
            console.warn('[PVP Live] ops event append failed:', error);
            return null;
        }
    }

    async recordConnectionTimeoutOpsEvents(match, {
        reason = 'connection_timeout',
        phase = '',
        resolution = '',
        disconnectedSeats = [],
        loserSeat = '',
        winnerSeat = '',
        elapsedMs = 0,
        source = 'live_store_timeout_sweep'
    } = {}) {
        if (!match || !match.matchId || !match.state) return [];
        const seatIds = Array.from(new Set((Array.isArray(disconnectedSeats) ? disconnectedSeats : [])
            .concat(loserSeat ? [loserSeat] : [])
            .map(seatId => String(seatId || '').trim())
            .filter(seatId => seatId === 'A' || seatId === 'B')));
        if (seatIds.length === 0) return [];
        const safeReason = String(reason || 'connection_timeout')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 64) || 'connection_timeout';
        const matchId = String(match.matchId || '');
        const commonEvidence = {
            reportVersion: 'pvp-live-connection-timeout-ops-v1',
            phase: String(phase || match.state.phase || match.state.status || ''),
            status: String(match.state.status || ''),
            resolution: String(resolution || ''),
            disconnectedSeats: seatIds,
            loserSeat: String(loserSeat || ''),
            winnerSeat: String(winnerSeat || ''),
            currentSeat: String(match.state.currentSeat || ''),
            stateVersion: Math.max(0, Math.floor(Number(match.state.stateVersion) || 0)),
            eventSeq: Math.max(0, Math.floor(Number(match.state.eventSeq) || 0)),
            elapsedMs: Math.max(0, Math.floor(Number(elapsedMs) || 0)),
            heartbeatStaleMs: this.heartbeatStaleMs,
            reconnectGraceMs: this.reconnectGraceMs,
            rankedImpact: resolution === 'match_invalidated' ? 'none' : 'settlement_rule',
            usesHiddenInformation: false
        };
        const results = [];
        for (const seatId of seatIds) {
            const subjectUserId = this.getSourceSeatUserId(match, seatId);
            if (!subjectUserId) continue;
            const result = await this.appendOpsEvent({
                eventId: `pvploe:${matchId}:connection_timeout:${safeReason}:${seatId}`,
                eventType: 'connection_timeout',
                subjectUserId,
                matchId,
                severity: 'warning',
                reason: safeReason,
                source,
                evidence: {
                    ...commonEvidence,
                    seatId
                },
                createdAt: match.updatedAt || this.now()
            });
            if (result) results.push(result);
        }
        return results;
    }

    isStaleStateSaveResult(saveResult) {
        return !!(
            saveResult
            && saveResult.saved === false
            && (saveResult.reason === 'stale_state_version' || saveResult.reason === 'conflicting_state_version')
        );
    }

    evictMatchCache(matchId) {
        const id = String(matchId || '').trim();
        if (!id) return;
        const localMatch = this.matches.get(id);
        if (localMatch && localMatch.seatsByUserId) {
            Object.keys(localMatch.seatsByUserId).forEach(participantUserId => {
                if (this.activeMatchByUserId.get(participantUserId) === id) {
                    this.activeMatchByUserId.delete(participantUserId);
                }
            });
        }
        for (const [participantUserId, activeMatchId] of this.activeMatchByUserId.entries()) {
            if (activeMatchId === id) {
                this.activeMatchByUserId.delete(participantUserId);
            }
        }
        this.matches.delete(id);
        this.clearPendingResultsForMatch(id);
    }

    async rehydrateAuthoritativeMatchForUser(userId, matchId) {
        if (!this.persistence || typeof this.persistence.loadMatchForUser !== 'function') return null;
        const requestedMatchId = String(matchId || '').trim();
        const persisted = await this.persistence.loadMatchForUser(userId, requestedMatchId);
        if (!persisted || persisted.matchId !== requestedMatchId || !persisted.seatsByUserId || !persisted.seatsByUserId[userId]) {
            this.evictMatchCache(requestedMatchId);
            return null;
        }
        this.matches.set(persisted.matchId, persisted);
        const active = persisted.state && !this.isTerminalStatus(persisted.state.status);
        Object.keys(persisted.seatsByUserId).forEach(participantUserId => {
            if (active) {
                this.activeMatchByUserId.set(participantUserId, persisted.matchId);
            } else {
                this.activeMatchByUserId.delete(participantUserId);
            }
        });
        if (!active) {
            this.clearPendingResultsForMatch(persisted.matchId);
        }
        const seatId = persisted.seatsByUserId[userId];
        return {
            match: persisted,
            seatId,
            stateView: this.projectMatchStateView(persisted, seatId)
        };
    }

    makeStaleStateSyncResult(authoritative, saveResult) {
        if (!authoritative) return null;
        return {
            result: 'sync_required',
            reason: saveResult && saveResult.reason || 'stale_state_version',
            state: authoritative.match && authoritative.match.state,
            events: [],
            stateView: authoritative.stateView,
            saveResult
        };
    }

    makeAuthoritativeDuplicateIntentResult(authoritative, intent, saveResult) {
        if (!authoritative || !authoritative.match || !authoritative.match.state || !intent) return null;
        const processedIntents = authoritative.match.state.processedIntents || {};
        if (!processedIntents[`${intent.seatId}:${intent.intentId}`]) return null;
        const duplicateResult = reduceIntent(authoritative.match.state, intent);
        if (duplicateResult.result !== 'duplicate' && duplicateResult.reason !== 'duplicate_action_conflict') return null;
        return {
            ...duplicateResult,
            state: authoritative.match.state,
            stateView: authoritative.stateView || duplicateResult.stateView,
            saveResult
        };
    }

    async loadMatchEvents(matchId) {
        if (!this.persistence || typeof this.persistence.loadMatchEvents !== 'function') return [];
        return this.persistence.loadMatchEvents(matchId);
    }

    async loadMatchForReplayShare(matchId) {
        const id = String(matchId || '').trim();
        if (!id) return null;
        const local = this.matches.get(id);
        if (local) return local;
        if (!this.persistence || typeof this.persistence.loadMatchById !== 'function') return null;
        const persisted = await this.persistence.loadMatchById(id);
        if (!persisted || persisted.matchId !== id) return null;
        this.matches.set(persisted.matchId, persisted);
        return persisted;
    }

    async saveReplayShare(share) {
        const normalized = normalizeReplayShareRecord(share);
        if (!normalized) return null;
        if (this.persistence && typeof this.persistence.saveReplayShare === 'function') {
            const saved = await this.persistence.saveReplayShare(normalized);
            if (saved) {
                this.replayShares.set(saved.shareToken, saved);
                return saved;
            }
        }
        this.replayShares.set(normalized.shareToken, normalized);
        return normalized;
    }

    async loadReplayShare(shareToken) {
        const token = String(shareToken || '').trim();
        if (!/^pvplrs-[a-zA-Z0-9_-]{24,80}$/.test(token)) return null;
        if (this.persistence && typeof this.persistence.loadReplayShare === 'function') {
            const persisted = await this.persistence.loadReplayShare(token);
            if (persisted) {
                this.replayShares.set(persisted.shareToken, persisted);
                return persisted;
            }
        }
        return this.replayShares.get(token) || null;
    }

    async revokeReplayShareForUser(userId, matchId) {
        const id = String(userId || '').trim();
        const match = String(matchId || '').trim();
        if (!id || !match) return null;
        if (this.persistence && typeof this.persistence.revokeReplayShareForUser === 'function') {
            const revoked = await this.persistence.revokeReplayShareForUser(id, match);
            if (revoked) {
                this.replayShares.set(revoked.shareToken, revoked);
                return revoked;
            }
        }
        const now = this.now();
        const shares = Array.from(this.replayShares.values())
            .filter(item => item && item.matchId === match && item.creatorUserId === id && item.status === 'active' && !item.revokedAt)
            .sort((a, b) => Math.max(0, Number(b.createdAt) || 0) - Math.max(0, Number(a.createdAt) || 0));
        if (shares.length === 0) return null;
        shares.forEach(share => {
            this.replayShares.set(share.shareToken, {
                ...share,
                status: 'revoked',
                revokedAt: now,
                updatedAt: now
            });
        });
        const share = shares[0];
        const revoked = {
            ...share,
            status: 'revoked',
            revokedAt: now,
            updatedAt: now
        };
        this.replayShares.set(revoked.shareToken, revoked);
        return revoked;
    }

    async settleFinishedMatch(match) {
        if (!match || !match.state || match.state.status !== 'finished') return null;
        if (!this.settlement || typeof this.settlement.settleMatch !== 'function') return null;
        return this.settlement.settleMatch(match);
    }

    buildSettlementReport(match, settlementResult) {
        if (!match || !match.state || match.state.status !== 'finished') return null;
        if (match.mode === 'friendly' || match.state.mode === 'friendly') return null;
        if (!settlementResult || settlementResult.settled !== true) return null;
        const participants = {};
        const buildSeasonHonorReport = (result) => {
            const wins = Math.max(0, Math.floor(Number(result && result.wins) || (result && result.didWin ? 1 : 0)));
            const losses = Math.max(0, Math.floor(Number(result && result.losses) || (result && result.didWin ? 0 : 1)));
            const gamesPlayed = Math.max(1, Math.floor(Number(result && result.rankedGames) || wins + losses || 1));
            const milestones = [1, 3, 5, 10, 20, 50];
            const targetGames = milestones.find(target => target > gamesPlayed) || Math.max(gamesPlayed, milestones[milestones.length - 1]);
            const remainingGames = Math.max(0, targetGames - gamesPlayed);
            const didWin = !!(result && result.didWin);
            const rewardTrack = [
                { targetGames: 1, rewardId: 's1_genesis_honor_mark_1', rewardType: 'cosmetic_badge', rewardName: '开天见证徽记' },
                { targetGames: 3, rewardId: 's1_genesis_honor_frame_3', rewardType: 'cosmetic_frame', rewardName: '三战问道边框' },
                { targetGames: 5, rewardId: 's1_genesis_honor_title_5', rewardType: 'cosmetic_title', rewardName: '称号·真人论道新锋' },
                { targetGames: 10, rewardId: 's1_genesis_honor_aura_10', rewardType: 'cosmetic_aura', rewardName: '开天十战辉光' },
                { targetGames: 20, rewardId: 's1_genesis_honor_banner_20', rewardType: 'cosmetic_banner', rewardName: '二十战荣誉旗' },
                { targetGames: 50, rewardId: 's1_genesis_honor_legend_50', rewardType: 'cosmetic_title', rewardName: '称号·开天不坠' }
            ];
            const earnedReward = rewardTrack.slice().reverse().find(reward => gamesPlayed >= reward.targetGames) || rewardTrack[0];
            const upcomingReward = rewardTrack.find(reward => reward.targetGames > gamesPlayed) || earnedReward;
            const rewardRemaining = Math.max(0, upcomingReward.targetGames - gamesPlayed);
            const honorClaim = result && result.seasonHonorClaim && typeof result.seasonHonorClaim === 'object' ? result.seasonHonorClaim : {};
            const collectionReport = honorClaim.collectionReport && typeof honorClaim.collectionReport === 'object' ? honorClaim.collectionReport : null;
            return {
                reportVersion: 'pvp-live-season-honor-v1',
                seasonId: String(result && result.seasonId || 's1-genesis'),
                seasonName: String(result && result.seasonName || '开天赛季'),
                sourceVisibility: 'server_authoritative_settlement',
                usesHiddenInformation: false,
                rankedImpact: 'honor_only',
                powerImpact: 'none',
                gamesPlayed,
                wins,
                losses,
                resultTag: didWin ? 'win_logged' : 'loss_logged',
                milestoneLabel: gamesPlayed === 1 ? '首场入账' : `本季 ${gamesPlayed} 场`,
                nextMilestone: {
                    targetGames,
                    remainingGames,
                    label: remainingGames === 0 ? `已达 ${targetGames} 场荣誉节点` : `距 ${targetGames} 场荣誉节点还差 ${remainingGames} 场`
                },
                cosmeticReward: {
                    reportVersion: 'pvp-live-season-honor-reward-v1',
                    rewardId: earnedReward.rewardId,
                    rewardType: earnedReward.rewardType,
                    rewardName: earnedReward.rewardName,
                    rewardState: 'earned',
                    collectionState: honorClaim.collectionState === 'newly_unlocked' ? 'newly_unlocked' : honorClaim.collectionState === 'owned' ? 'owned' : 'earned',
                    rewardImpact: 'cosmetic_only',
                    powerImpact: 'none',
                    sourceVisibility: 'server_authoritative_settlement',
                    usesHiddenInformation: false,
                    unlockedAt: Math.max(0, Math.floor(Number(honorClaim.unlockedAt) || 0)),
                    collectionSize: Math.max(0, Math.floor(Number(honorClaim.collectionSize) || 0)),
                    collectionReport: collectionReport ? {
                        reportVersion: 'pvp-live-season-honor-collection-v1',
                        seasonId: String(collectionReport.seasonId || result && result.seasonId || 's1-genesis'),
                        rewardImpact: 'cosmetic_only',
                        powerImpact: 'none',
                        totalUnlocked: Math.max(0, Math.floor(Number(collectionReport.totalUnlocked) || 0)),
                        lastUnlockedRewardId: String(collectionReport.lastUnlockedRewardId || ''),
                        boundary: '赛季荣誉收藏只保存外观成就，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
                    } : null,
                    unlockLine: `已点亮外观目标：${earnedReward.rewardName}`,
                    progressLine: rewardRemaining === 0
                        ? `本季 ${gamesPlayed} 场 · 最高外观档已达成`
                        : `本季 ${gamesPlayed}/${upcomingReward.targetGames} 场 · 下一档还差 ${rewardRemaining} 场`,
                    nextReward: {
                        targetGames: upcomingReward.targetGames,
                        remainingGames: rewardRemaining,
                        rewardId: upcomingReward.rewardId,
                        rewardType: upcomingReward.rewardType,
                        rewardName: upcomingReward.rewardName,
                        label: rewardRemaining === 0
                            ? `已达成 ${upcomingReward.rewardName}`
                            : `下一档 ${upcomingReward.targetGames} 场：${upcomingReward.rewardName}`
                    },
                    boundary: '仅用于赛季荣誉展示和外观回访，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
                },
                summaryLine: `赛季荣誉 ${gamesPlayed} 场 · 胜 ${wins} / 负 ${losses}`,
                nextGoalLine: didWin
                    ? '本局胜场已进入本季荣誉账本；下一局继续验证同一套节奏是否稳定。'
                    : '本局败场也进入本季复盘账本；先练公开失守窗口，再回到真人排位。',
                boundary: '只记录赛季荣誉、复盘目标和外观向回访，不改变生命、伤害、抽牌、灵力、起手或匹配。'
            };
        };
        const addParticipant = (key, result) => {
            if (!result || !result.userId) return;
            const seatId = Object.entries(match.seatsByUserId || {})
                .find(([userId]) => userId === result.userId)?.[1] || '';
            if (!seatId) return;
            participants[seatId] = {
                result: result.didWin ? 'win' : 'loss',
                didWin: !!result.didWin,
                oldScore: Math.max(0, Math.floor(Number(result.oldScore) || 0)),
                scoreAfter: Math.max(0, Math.floor(Number(result.newScore) || 0)),
                ratingDelta: Math.floor(Number(result.ratingDelta) || 0),
                coinsAwarded: Math.max(0, Math.floor(Number(result.coinsAwarded) || 0)),
                seasonHonorReport: buildSeasonHonorReport(result),
                role: key
            };
        };
        addParticipant('winner', settlementResult.winner);
        addParticipant('loser', settlementResult.loser);
        if (!participants.A && !participants.B) return null;
        return {
            reportVersion: 'pvp-live-settlement-report-v1',
            sourceVisibility: 'server_authoritative_settlement',
            usesHiddenInformation: false,
            rankedImpact: 'official',
            settlementSource: 'live_ranked',
            formalResultPolicy: 'ranked_authoritative',
            matchId: match.matchId,
            finishReason: String(settlementResult.finishReason || ''),
            settledAt: Math.max(0, Math.floor(Number(settlementResult.settledAt) || this.now())),
            participants
        };
    }

    attachSettlementReport(match, settlementResult) {
        const report = this.buildSettlementReport(match, settlementResult);
        if (!report) return null;
        match.state.settlementReport = report;
        return report;
    }

    getFinishedOutcome(state) {
        const source = state && typeof state === 'object' ? state : {};
        const events = Array.isArray(source.events) ? source.events : [];
        const finishedEvent = events.slice().reverse().find(event => event && event.eventType === 'match_finished');
        const payload = finishedEvent && finishedEvent.payload && typeof finishedEvent.payload === 'object'
            ? finishedEvent.payload
            : {};
        return {
            finishReason: String(source.finishReason || payload.finishReason || ''),
            winnerSeat: String(source.winnerSeat || payload.winnerSeat || ''),
            loserSeat: String(source.loserSeat || payload.loserSeat || '')
        };
    }

    canApplySettlementReportCompensation(sourceMatch, authoritativeMatch) {
        if (!sourceMatch || !sourceMatch.state || !sourceMatch.state.settlementReport) return false;
        if (!authoritativeMatch || !authoritativeMatch.state || authoritativeMatch.state.status !== 'finished') return false;
        if (authoritativeMatch.state.settlementReport) return false;
        const sourceOutcome = this.getFinishedOutcome(sourceMatch.state);
        const authoritativeOutcome = this.getFinishedOutcome(authoritativeMatch.state);
        if (!sourceOutcome.finishReason || !sourceOutcome.winnerSeat || (!sourceOutcome.loserSeat && sourceOutcome.winnerSeat !== 'draw')) {
            return false;
        }
        return sourceOutcome.finishReason === authoritativeOutcome.finishReason
            && sourceOutcome.winnerSeat === authoritativeOutcome.winnerSeat
            && sourceOutcome.loserSeat === authoritativeOutcome.loserSeat;
    }

    async compensateSettlementReportSaveLoss(match, saveResult, options = {}) {
        if (!this.isStaleStateSaveResult(saveResult)) return null;
        if (!match || !match.matchId || !match.seatsByUserId || !match.state || !match.state.settlementReport) return null;
        const [userId] = Object.keys(match.seatsByUserId);
        if (!userId) return null;
        const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
        const authoritativeMatch = authoritative && authoritative.match;
        if (!this.canApplySettlementReportCompensation(match, authoritativeMatch)) return null;
        authoritativeMatch.state.settlementReport = JSON.parse(JSON.stringify(match.state.settlementReport));
        authoritativeMatch.updatedAt = this.now();
        const compensationSaveResult = await this.saveMatch(authoritativeMatch, options);
        if (compensationSaveResult && compensationSaveResult.saved === false) {
            return { completed: false, saveResult: compensationSaveResult, match: authoritativeMatch };
        }
        match.state = authoritativeMatch.state;
        match.updatedAt = authoritativeMatch.updatedAt;
        match.connection = authoritativeMatch.connection;
        match.seatsByUserId = authoritativeMatch.seatsByUserId;
        await this.releaseMatch(authoritativeMatch);
        return { completed: true, saveResult: compensationSaveResult, match: authoritativeMatch };
    }

    isTerminalStatus(status) {
        return status === 'finished' || status === 'invalidated';
    }

    async completeFinishedMatch(match, options = {}) {
        if (!match || !match.state || match.state.status !== 'finished') {
            return { completed: false, saveResult: null };
        }
        this.updateFriendlySeriesAfterFinish(match);
        const initialSaveResult = await this.saveMatch(match, options);
        if (initialSaveResult && initialSaveResult.saved === false) {
            return { completed: false, saveResult: initialSaveResult };
        }
        if (match.state.settlementReport && match.state.settlementReport.reportVersion === 'pvp-live-settlement-report-v1') {
            await this.recordTerminalFairnessTelemetry(match, options);
            await this.releaseMatch(match);
            return { completed: true, saveResult: initialSaveResult };
        }
        const settlementResult = await this.settleFinishedMatch(match);
        let settlementSaveResult = null;
        if (this.attachSettlementReport(match, settlementResult)) {
            settlementSaveResult = await this.saveMatch(match, options);
            if (settlementSaveResult && settlementSaveResult.saved === false) {
                const compensation = await this.compensateSettlementReportSaveLoss(match, settlementSaveResult, options);
                if (compensation && compensation.completed) return compensation;
                return { completed: false, saveResult: settlementSaveResult };
            }
        }
        await this.recordTerminalFairnessTelemetry(match, options);
        await this.releaseMatch(match);
        return { completed: true, saveResult: settlementSaveResult || initialSaveResult };
    }

    async completeInvalidatedMatch(match) {
        if (!match || !match.state || match.state.status !== 'invalidated') {
            return { completed: false, saveResult: null };
        }
        const hasActiveParticipants = Object.keys(match.seatsByUserId || {})
            .some(userId => this.activeMatchByUserId.get(userId) === match.matchId);
        const saveResult = await this.saveMatch(match);
        if (saveResult && saveResult.saved === false) {
            return { completed: false, saveResult };
        }
        if (hasActiveParticipants) {
            await this.recordReadyTimeoutCooldowns(match);
            await this.recordSetupConnectionTimeoutCooldowns(match);
        }
        await this.releaseMatch(match);
        return { completed: true, saveResult };
    }

    async releaseIfTerminal(match) {
        if (!match || !match.state || !this.isTerminalStatus(match.state.status)) {
            return { completed: false, saveResult: null };
        }
        if (match.state.status === 'finished') {
            return this.completeFinishedMatch(match);
        }
        return this.completeInvalidatedMatch(match);
    }

    makeTurnTimer(match, seatId) {
        if (!match || !match.state) return null;
        const state = match.state;
        const now = this.now();
        if (state.status === 'setup' && state.setup) {
            const startedAt = Math.max(0, Math.floor(Number(state.setup.startedAt) || Number(match.createdAt) || Number(match.updatedAt) || now));
            const deadlineAt = Math.max(0, Math.floor(Number(state.setup.readyDeadlineAt) || 0));
            if (!deadlineAt) return null;
            const timeoutMs = Math.max(1000, deadlineAt - startedAt || this.setupReadyTimeoutMs);
            return {
                reportVersion: 'pvp-live-turn-timer-v1',
                phase: 'setup',
                currentSeat: '',
                viewerSeat: seatId,
                isViewerTurn: false,
                viewerCanAct: true,
                startedAt,
                deadlineAt,
                timeoutMs,
                remainingMs: Math.max(0, deadlineAt - now)
            };
        }
        if (state.status === 'active') {
            const timing = this.ensureActiveTurnTiming(match);
            const startedAt = timing.startedAt;
            const timeoutMs = timing.timeoutMs;
            const deadlineAt = timing.deadlineAt;
            const currentSeat = state.currentSeat || '';
            return {
                reportVersion: 'pvp-live-turn-timer-v1',
                phase: 'active',
                currentSeat,
                viewerSeat: seatId,
                isViewerTurn: currentSeat === seatId,
                viewerCanAct: currentSeat === seatId,
                startedAt,
                deadlineAt,
                timeoutMs,
                remainingMs: Math.max(0, deadlineAt - now)
            };
        }
        return null;
    }

    makeActiveTurnTiming(match, startedAt = this.now()) {
        const state = match && match.state;
        if (!state || state.status !== 'active') return null;
        const safeStartedAt = Math.max(0, Math.floor(Number(startedAt) || this.now()));
        const timeoutMs = this.turnTimeoutMs;
        return {
            reportVersion: 'pvp-live-turn-timing-v1',
            currentSeat: state.currentSeat || '',
            startedAt: safeStartedAt,
            deadlineAt: safeStartedAt + timeoutMs,
            timeoutMs
        };
    }

    startActiveTurn(match, startedAt = this.now()) {
        const timing = this.makeActiveTurnTiming(match, startedAt);
        if (timing && match.state) {
            match.state.turnTiming = timing;
        }
        return timing;
    }

    ensureActiveTurnTiming(match) {
        const state = match && match.state;
        if (!state || state.status !== 'active') return null;
        const timing = state.turnTiming && typeof state.turnTiming === 'object' ? state.turnTiming : null;
        const currentSeat = state.currentSeat || '';
        const startedAt = timing ? Math.max(0, Math.floor(Number(timing.startedAt) || 0)) : 0;
        const timeoutMs = timing ? Math.max(1000, Math.floor(Number(timing.timeoutMs) || this.turnTimeoutMs)) : this.turnTimeoutMs;
        const deadlineAt = timing ? Math.max(0, Math.floor(Number(timing.deadlineAt) || 0)) : 0;
        if (timing && timing.currentSeat === currentSeat && startedAt > 0 && deadlineAt > startedAt) {
            state.turnTiming = {
                reportVersion: 'pvp-live-turn-timing-v1',
                currentSeat,
                startedAt,
                deadlineAt,
                timeoutMs
            };
            return state.turnTiming;
        }
        const fallbackStartedAt = Math.max(0, Math.floor(
            Number(state.setup && state.setup.battleStartedAt)
            || Number(match.createdAt)
            || (this.now() - this.turnTimeoutMs)
        ));
        return this.startActiveTurn(match, fallbackStartedAt);
    }

    syncTurnTimingAfterAcceptedIntent(match, previousState, events = []) {
        const state = match && match.state;
        if (!state || state.status !== 'active') return null;
        const previousStatus = previousState && previousState.status;
        const previousSeat = previousState && previousState.currentSeat;
        const becameActive = previousStatus !== 'active';
        const changedSeat = previousSeat && previousSeat !== state.currentSeat;
        const hasTurnBoundaryEvent = Array.isArray(events) && events.some(event => (
            event && (event.eventType === 'battle_started' || event.eventType === 'turn_ended')
        ));
        if (becameActive || changedSeat || hasTurnBoundaryEvent) {
            return this.startActiveTurn(match);
        }
        return this.ensureActiveTurnTiming(match);
    }

    ensureMatchConnection(match) {
        if (!match || !match.seatsByUserId) return null;
        const now = this.now();
        const baselineAt = Math.max(0, Math.floor(Number(match.createdAt) || Number(match.updatedAt) || now));
        const raw = match.connection && typeof match.connection === 'object' ? match.connection : {};
        const seats = raw.seats && typeof raw.seats === 'object' ? raw.seats : {};
        const nextSeats = {};
        Object.values(match.seatsByUserId).forEach(seatId => {
            if (seatId !== 'A' && seatId !== 'B') return;
            const rawSeat = seats[seatId] && typeof seats[seatId] === 'object' ? seats[seatId] : {};
            const lastHeartbeatAt = Math.max(0, Math.floor(Number(rawSeat.lastHeartbeatAt) || baselineAt));
            nextSeats[seatId] = {
                seatId,
                connectedAt: Math.max(0, Math.floor(Number(rawSeat.connectedAt) || baselineAt)),
                lastHeartbeatAt,
                reconnectedAt: Math.max(0, Math.floor(Number(rawSeat.reconnectedAt) || 0))
            };
        });
        match.connection = {
            reportVersion: 'pvp-live-connection-v1',
            heartbeatIntervalMs: this.heartbeatIntervalMs,
            heartbeatStaleMs: this.heartbeatStaleMs,
            reconnectGraceMs: this.reconnectGraceMs,
            seats: nextSeats
        };
        return match.connection;
    }

    makeConnectionSeatReport(match, seatId, viewerSeat) {
        const connection = this.ensureMatchConnection(match);
        const seat = connection && connection.seats ? connection.seats[seatId] : null;
        if (!seat) return null;
        const now = this.now();
        const lastHeartbeatAt = Math.max(0, Math.floor(Number(seat.lastHeartbeatAt) || 0));
        const elapsedMs = Math.max(0, now - lastHeartbeatAt);
        const graceDeadlineAt = lastHeartbeatAt + this.heartbeatStaleMs + this.reconnectGraceMs;
        let status = 'online';
        if (elapsedMs > this.heartbeatStaleMs + this.reconnectGraceMs) {
            status = 'disconnected';
        } else if (elapsedMs > this.heartbeatStaleMs) {
            status = 'grace';
        }
        return {
            seatId,
            status,
            isViewer: seatId === viewerSeat,
            lastHeartbeatAt,
            elapsedMs,
            graceDeadlineAt: status === 'online' ? 0 : graceDeadlineAt,
            remainingGraceMs: status === 'grace' ? Math.max(0, graceDeadlineAt - now) : 0
        };
    }

    makeConnectionReport(match, viewerSeat) {
        if (!match || !viewerSeat) return null;
        const opponentSeat = viewerSeat === 'A' ? 'B' : 'A';
        const viewer = this.makeConnectionSeatReport(match, viewerSeat, viewerSeat);
        const opponent = this.makeConnectionSeatReport(match, opponentSeat, viewerSeat);
        if (!viewer || !opponent) return null;
        let connectionHealth = 'good';
        if (viewer.status === 'disconnected' || opponent.status === 'disconnected') {
            connectionHealth = viewer.status === 'disconnected' && opponent.status === 'disconnected'
                ? 'both_disconnected'
                : viewer.status === 'disconnected' ? 'viewer_disconnected' : 'opponent_disconnected';
        } else if (viewer.status === 'grace' || opponent.status === 'grace') {
            connectionHealth = viewer.status === 'grace' && opponent.status === 'grace'
                ? 'both_grace'
                : viewer.status === 'grace' ? 'viewer_grace' : 'opponent_grace';
        }
        return {
            reportVersion: 'pvp-live-connection-v1',
            connectionHealth,
            viewerSeat,
            opponentSeat,
            heartbeatIntervalMs: this.heartbeatIntervalMs,
            heartbeatStaleMs: this.heartbeatStaleMs,
            graceMs: this.reconnectGraceMs,
            viewer,
            opponent
        };
    }

    makeConnectionTempoReport(match, viewerSeat, connectionReport = null) {
        const state = match && match.state;
        const report = connectionReport || this.makeConnectionReport(match, viewerSeat);
        if (!state || !report || !report.viewer || !report.opponent) return null;
        const phase = String(state.status || state.phase || 'unknown').trim() || 'unknown';
        const currentSeat = String(state.currentSeat || '').trim();
        const viewerStatus = ['online', 'grace', 'disconnected'].includes(report.viewer.status)
            ? report.viewer.status
            : 'online';
        const opponentStatus = ['online', 'grace', 'disconnected'].includes(report.opponent.status)
            ? report.opponent.status
            : 'online';
        const viewerSeatId = String(report.viewerSeat || report.viewer.seatId || viewerSeat || '').trim();
        const opponentSeatId = String(report.opponentSeat || report.opponent.seatId || (viewerSeatId === 'A' ? 'B' : 'A')).trim();
        const labels = {
            online: '在线',
            grace: '重连宽限',
            disconnected: '断线'
        };
        const viewerLabel = labels[viewerStatus] || viewerStatus;
        const opponentLabel = labels[opponentStatus] || opponentStatus;
        const viewerGraceSec = Math.ceil(Math.max(0, Math.floor(Number(report.viewer.remainingGraceMs) || 0)) / 1000);
        const opponentGraceSec = Math.ceil(Math.max(0, Math.floor(Number(report.opponent.remainingGraceMs) || 0)) / 1000);
        const setupCanAct = (phase === 'setup' || phase === 'matched') && viewerStatus !== 'disconnected';
        const viewerCanAct = (
            (phase === 'active' && currentSeat === viewerSeatId)
            || setupCanAct
        ) && viewerStatus !== 'disconnected';
        const makeTempo = (tempoState, affectedSeat, severity, statusLine, detailLine, action = null, options = {}) => ({
            reportVersion: 'pvp-live-connection-tempo-v1',
            sourceVisibility: 'server_authoritative_connection_state',
            usesHiddenInformation: false,
            rankedImpact: 'none',
            tempoState,
            severity,
            phase,
            currentSeat,
            viewerSeat: viewerSeatId,
            opponentSeat: opponentSeatId,
            affectedSeat: String(affectedSeat || ''),
            statusLine,
            detailLine,
            action,
            actionBoundary: String(options.actionBoundary || 'continue'),
            canSubmitIntent: Object.prototype.hasOwnProperty.call(options, 'canSubmitIntent')
                ? options.canSubmitIntent === true
                : viewerCanAct,
            shouldWaitForAuthority: options.shouldWaitForAuthority === true,
            remainingGraceMs: Math.max(0, Math.floor(Number(options.remainingGraceMs) || 0)),
            safeguards: [
                'server_authoritative_projection',
                'public_connection_state_only',
                'ranked_settlement_unaffected'
            ]
        });
        if (viewerStatus === 'grace') {
            return makeTempo(
                'viewer_reconnect_grace',
                viewerSeatId,
                'warning',
                `连接：我方重连宽限 ${viewerGraceSec}s · 切回页面将自动恢复权威连接 · 对方${opponentLabel}`,
                '本地画面可能落后，恢复后会同步服务端权威状态；不要用旧画面判断胜负。',
                { id: 'refresh_match', label: '刷新权威状态' },
                {
                    actionBoundary: 'recover_connection',
                    canSubmitIntent: false,
                    shouldWaitForAuthority: true,
                    remainingGraceMs: Math.max(0, Math.floor(Number(report.viewer.remainingGraceMs) || 0))
                }
            );
        }
        if (viewerStatus === 'disconnected') {
            return makeTempo(
                'viewer_refresh_required',
                viewerSeatId,
                'danger',
                `连接：我方断线 · 刷新同步权威结果；若仍在可恢复窗口会自动重连，否则按连接超时结算 · 对方${opponentLabel}`,
                '先刷新权威局面，避免本地旧状态覆盖真实回合。',
                { id: 'refresh_match', label: '刷新权威状态' },
                {
                    actionBoundary: 'recover_connection',
                    canSubmitIntent: false,
                    shouldWaitForAuthority: true
                }
            );
        }
        if (opponentStatus === 'grace') {
            if (phase === 'active' && currentSeat && currentSeat !== opponentSeatId) {
                return makeTempo(
                    'opponent_non_turn_grace',
                    opponentSeatId,
                    'info',
                    `连接：我方${viewerLabel} · 对方重连宽限 ${opponentGraceSec}s · 当前行动仍可提交；轮到对手仍未恢复才会处理`,
                    '对局继续：对手不在当前行动窗口，服务端不会提前宣判胜负；本方当前行动仍可提交。',
                    null,
                    {
                        actionBoundary: 'continue_current_action',
                        canSubmitIntent: viewerCanAct,
                        remainingGraceMs: Math.max(0, Math.floor(Number(report.opponent.remainingGraceMs) || 0))
                    }
                );
            }
            if (phase === 'active' && currentSeat === opponentSeatId) {
                return makeTempo(
                    'opponent_action_grace',
                    opponentSeatId,
                    'warning',
                    `连接：我方${viewerLabel} · 对方重连宽限 ${opponentGraceSec}s · 对方当前行动，宽限结束才会按连接超时权威结算`,
                    '胜负仍等服务端终局事件，不由前端提前判定。',
                    null,
                    {
                        actionBoundary: 'wait_for_authoritative_timeout',
                        canSubmitIntent: false,
                        shouldWaitForAuthority: true,
                        remainingGraceMs: Math.max(0, Math.floor(Number(report.opponent.remainingGraceMs) || 0))
                    }
                );
            }
            return makeTempo(
                'opponent_setup_grace',
                opponentSeatId,
                'warning',
                `连接：我方${viewerLabel} · 对方重连宽限 ${opponentGraceSec}s · 不会立即判负`,
                '准备阶段断线会等待权威判定；若未开战成功，本局不写正式积分。',
                null,
                {
                    actionBoundary: setupCanAct ? 'continue_setup_action' : 'wait_for_setup_resolution',
                    canSubmitIntent: setupCanAct,
                    shouldWaitForAuthority: true,
                    remainingGraceMs: Math.max(0, Math.floor(Number(report.opponent.remainingGraceMs) || 0))
                }
            );
        }
        if (opponentStatus === 'disconnected') {
            if (phase === 'active' && currentSeat && currentSeat !== opponentSeatId) {
                return makeTempo(
                    'opponent_non_turn_disconnected',
                    opponentSeatId,
                    'info',
                    `连接：我方${viewerLabel} · 对方断线 · 对局继续，当前行动仍可提交；轮到对手仍未恢复才会由服务端处理`,
                    '对局继续：非当前行动方断线不会立刻触发连接超时；当前行动仍可提交，轮到对手仍未恢复才会处理。',
                    null,
                    {
                        actionBoundary: 'continue_current_action',
                        canSubmitIntent: viewerCanAct
                    }
                );
            }
            if (phase === 'active' && currentSeat === opponentSeatId) {
                return makeTempo(
                    'opponent_action_timeout_pending',
                    opponentSeatId,
                    'warning',
                    `连接：我方${viewerLabel} · 对方断线 · 对方当前行动，等待连接超时权威结算`,
                    '只有当前行动方断线超过宽限，服务端才会发布终局；胜负以 match_finished 为准。',
                    null,
                    {
                        actionBoundary: 'wait_for_authoritative_timeout',
                        canSubmitIntent: false,
                        shouldWaitForAuthority: true
                    }
                );
            }
            if (phase === 'setup' || phase === 'matched') {
                return makeTempo(
                    'opponent_setup_disconnected',
                    opponentSeatId,
                    'warning',
                    `连接：我方${viewerLabel} · 对方断线 · 准备阶段等待权威无效局判定`,
                    '若未开战成功，本局不计正式积分，也不会把断线方直接判成正式败局。',
                    null,
                    {
                        actionBoundary: setupCanAct ? 'continue_setup_action' : 'wait_for_setup_resolution',
                        canSubmitIntent: setupCanAct,
                        shouldWaitForAuthority: true
                    }
                );
            }
            return makeTempo(
                'opponent_disconnected',
                opponentSeatId,
                'warning',
                `连接：我方${viewerLabel} · 对方断线 · 等待权威同步`,
                '连接状态只作为公开提示，终局仍以服务端事件为准。',
                null,
                {
                    actionBoundary: 'wait_for_authoritative_timeout',
                    canSubmitIntent: false,
                    shouldWaitForAuthority: true
                }
            );
        }
        return makeTempo(
            'stable',
            '',
            'normal',
            `连接：我方${viewerLabel} · 对方${opponentLabel}`,
            '双方在线，按当前行动窗口继续。',
            null,
            {
                actionBoundary: setupCanAct ? 'continue_setup_action' : viewerCanAct ? 'continue_current_action' : 'continue',
                canSubmitIntent: viewerCanAct
            }
        );
    }

    projectMatchStateView(match, seatId) {
        const stateView = projectStateView(match.state, seatId);
        stateView.turnTimer = this.makeTurnTimer(match, seatId);
        stateView.connectionReport = this.makeConnectionReport(match, seatId);
        stateView.connectionTempoReport = this.makeConnectionTempoReport(match, seatId, stateView.connectionReport);
        return stateView;
    }

    async appendFairnessTelemetrySignal(match, reason, options = {}) {
        if (!this.persistence || typeof this.persistence.appendLiveWsSignal !== 'function') return null;
        const id = String(match && match.matchId || '').trim();
        const safeReason = String(reason || '').trim().slice(0, 64);
        if (!id || !safeReason) return null;
        try {
            return await this.persistence.appendLiveWsSignal({
                matchId: id,
                signalType: 'fairness_telemetry',
                stateVersion: getMatchTelemetryStateVersion(match, options.stateView),
                reason: safeReason,
                sourceInstanceId: String(options.liveWsSourceInstanceId || '').trim().slice(0, 96),
                createdAt: this.now()
            });
        } catch (error) {
            console.warn('[PVP Live] fairness telemetry signal failed:', error);
            return null;
        }
    }

    async recordMatchQualityTelemetry(match, options = {}) {
        const quality = match && match.state && match.state.matchQuality;
        if (!quality || typeof quality !== 'object') return null;
        const reason = makeFairnessTelemetryReason('match_quality', quality.tag || quality.expansionStage || 'sample');
        return this.appendFairnessTelemetrySignal(match, reason, options);
    }

    async recordFairnessTelemetryFromStateView(match, stateView, options = {}) {
        const reasons = collectStateViewFairnessTelemetryReasons(stateView);
        if (reasons.length === 0) return [];
        const results = [];
        for (const reason of reasons) {
            const result = await this.appendFairnessTelemetrySignal(match, reason, {
                ...options,
                stateView
            });
            if (result) results.push(result);
        }
        return results;
    }

    async recordTerminalFairnessTelemetry(match, options = {}) {
        if (!match || !match.state || !this.isTerminalStatus(match.state.status)) return [];
        const viewerSeat = Object.values(match.seatsByUserId || {}).find(seatId => seatId === 'A' || seatId === 'B')
            || match.state.winnerSeat
            || 'A';
        return this.recordFairnessTelemetryFromStateView(match, this.projectMatchStateView(match, viewerSeat), options);
    }

    getMatchTestScope(match) {
        return normalizeLivePvpTestMatchScope(
            match && (match.testMatchScope || match.state && match.state.testMatchScope)
        );
    }

    async createMatch(playerA, playerB, qualityInput = {}, options = {}) {
        const matchId = makeId('pvplm');
        const mode = options && options.mode === 'friendly' ? 'friendly' : 'ranked';
        const testMatchScope = normalizeLivePvpTestMatchScope(options && options.testMatchScope);
        const testOpenerSeed = testMatchScope
            ? normalizeLivePvpTestOpenerSeed(options && options.testOpenerSeed)
            : '';
        const openerAssignment = makeAuthoritativeOpenerAssignment({
            matchId,
            playerA,
            playerB,
            mode,
            friendlySeries: mode === 'friendly' ? options.friendlySeries : null,
            testOpenerSeed: mode === 'ranked' ? testOpenerSeed : ''
        });
        const state = createInitialLiveState({
            matchId,
            matchQuality: makeMatchQualityReport(qualityInput),
            mode,
            friendlySeries: mode === 'friendly' ? options.friendlySeries : null,
            firstSeat: openerAssignment.firstSeat,
            openerAssignment,
            seats: [
                { seatId: 'A', userId: playerA.userId, displayName: playerA.displayName, loadoutSnapshot: playerA.loadoutSnapshot },
                { seatId: 'B', userId: playerB.userId, displayName: playerB.displayName, loadoutSnapshot: playerB.loadoutSnapshot }
            ]
        });
        if (testMatchScope) {
            state.testMatchScope = testMatchScope;
        }
        const createdAt = this.now();
        state.setup.startedAt = createdAt;
        state.setup.readyDeadlineAt = createdAt + this.setupReadyTimeoutMs;
        const match = {
            matchId,
            mode,
            ...(testMatchScope ? { testMatchScope } : {}),
            createdAt,
            updatedAt: createdAt,
            state,
            seatsByUserId: {
                [playerA.userId]: 'A',
                [playerB.userId]: 'B'
            }
        };
        this.ensureMatchConnection(match);
        await this.saveMatch(match);
        await this.recordMatchQualityTelemetry(match);
        this.matches.set(matchId, match);
        this.activeMatchByUserId.set(playerA.userId, matchId);
        this.activeMatchByUserId.set(playerB.userId, matchId);
        return match;
    }

    getSourceSeatUserId(match, seatId) {
        if (!match || !match.seatsByUserId) return '';
        return Object.keys(match.seatsByUserId).find(userId => match.seatsByUserId[userId] === seatId) || '';
    }

    getFinishedEventPayload(state) {
        if (!state || !Array.isArray(state.events)) return null;
        const finishedEvent = state.events.slice().reverse().find(event => event && event.eventType === 'match_finished' && event.payload);
        if (!finishedEvent || !finishedEvent.payload) return null;
        const winnerSeat = String(finishedEvent.payload.winnerSeat || '');
        const loserSeat = String(finishedEvent.payload.loserSeat || '');
        const finishReason = String(finishedEvent.payload.finishReason || 'lethal');
        const drawFinished = winnerSeat === 'draw' && finishReason.endsWith('_draw');
        if (!winnerSeat || (!loserSeat && !drawFinished)) return null;
        return {
            winnerSeat,
            loserSeat,
            finishReason
        };
    }

    makeSourceParticipantsFromMatch(match, fallbackParticipants = null) {
        const fallback = normalizeFriendlyParticipants(fallbackParticipants);
        const seats = match && match.state && match.state.seats ? match.state.seats : {};
        return {
            A: {
                sourceSeat: 'A',
                userId: String(seats.A && seats.A.userId || fallback.A.userId || ''),
                displayName: String(seats.A && seats.A.displayName || fallback.A.displayName || fallback.A.userId || 'A').slice(0, 40)
            },
            B: {
                sourceSeat: 'B',
                userId: String(seats.B && seats.B.userId || fallback.B.userId || ''),
                displayName: String(seats.B && seats.B.displayName || fallback.B.displayName || fallback.B.userId || 'B').slice(0, 40)
            }
        };
    }

    getSourceSeatForUser(series, userId) {
        const id = String(userId || '');
        const participants = normalizeFriendlyParticipants(series && series.sourceParticipants);
        if (id && participants.A.userId === id) return 'A';
        if (id && participants.B.userId === id) return 'B';
        return '';
    }

    getSourceSeatForMatchSeat(match, series, seatId) {
        const userId = match && match.state && match.state.seats && match.state.seats[seatId]
            ? match.state.seats[seatId].userId
            : '';
        return this.getSourceSeatForUser(series, userId);
    }

    makeFriendlySeriesForSource(sourceMatch, request, status, confirmationCount) {
        const sourceState = sourceMatch && sourceMatch.state ? sourceMatch.state : null;
        const targetWins = normalizeTargetWins(sourceState && sourceState.friendlySeries && sourceState.friendlySeries.targetWins);
        const isFriendly = sourceState && sourceState.mode === 'friendly';
        const previousSeries = isFriendly ? sourceState.friendlySeries : null;
        const finishedPayload = this.getFinishedEventPayload(sourceState);
        let scoreBySourceSeat = normalizeFriendlyScore(previousSeries && previousSeries.scoreBySourceSeat);
        let sourceParticipants = previousSeries && previousSeries.sourceParticipants
            ? normalizeFriendlyParticipants(previousSeries.sourceParticipants)
            : this.makeSourceParticipantsFromMatch(sourceMatch);
        let originMatchId = previousSeries && previousSeries.originMatchId
            ? String(previousSeries.originMatchId)
            : sourceMatch.matchId;
        let openingFirstSourceSeat = normalizeSourceSeat(previousSeries && previousSeries.openingFirstSourceSeat, '');

        if (!isFriendly && finishedPayload && finishedPayload.winnerSeat !== 'draw') {
            const winnerSourceSeat = finishedPayload.winnerSeat === 'B' ? 'B' : 'A';
            scoreBySourceSeat = normalizeFriendlyScore({
                ...scoreBySourceSeat,
                [winnerSourceSeat]: scoreBySourceSeat[winnerSourceSeat] + 1
            });
            sourceParticipants = this.makeSourceParticipantsFromMatch(sourceMatch);
            originMatchId = sourceMatch.matchId;
        }
        if (!openingFirstSourceSeat) {
            const sourceFirstSeat = sourceState && sourceState.openerAssignment && sourceState.openerAssignment.firstSeat
                || sourceState && sourceState.setup && sourceState.setup.firstSeat;
            if (isFriendly && previousSeries) {
                const previousRoundFirstSourceSeat = this.getSourceSeatForMatchSeat(sourceMatch, previousSeries, sourceFirstSeat);
                const previousRoundIndex = Math.max(1, Math.floor(Number(previousSeries.roundIndex) || 1));
                openingFirstSourceSeat = previousRoundFirstSourceSeat === 'A' || previousRoundFirstSourceSeat === 'B'
                    ? previousRoundIndex % 2 === 1
                        ? previousRoundFirstSourceSeat
                        : otherSourceSeat(previousRoundFirstSourceSeat)
                    : 'A';
            } else {
                openingFirstSourceSeat = normalizeSourceSeat(sourceFirstSeat, 'A');
            }
        }

        const maxRounds = getFriendlyMaxRounds(targetWins);
        const nextRoundIndex = Math.max(2, Math.min(maxRounds, scoreBySourceSeat.A + scoreBySourceSeat.B + 1));
        const seriesCreatedAt = Math.max(
            0,
            Math.floor(Number(
                request && request.seriesCreatedAt
                || previousSeries && previousSeries.createdAt
                || request && request.createdAt
                || this.now()
            ) || this.now())
        );
        return makeFriendlySeriesReport({
            sourceMatchId: sourceMatch.matchId,
            originMatchId,
            seriesId: request.seriesId,
            status,
            confirmationCount,
            createdAt: seriesCreatedAt,
            sourceParticipants,
            scoreBySourceSeat,
            targetWins,
            roundIndex: nextRoundIndex,
            openingFirstSourceSeat
        });
    }

    updateFriendlySeriesAfterFinish(match) {
        if (!match || !match.state || match.state.status !== 'finished' || match.state.mode !== 'friendly') return;
        const series = match.state.friendlySeries;
        if (!series || series.lastRecordedMatchId === match.matchId) return;
        const finishedPayload = this.getFinishedEventPayload(match.state);
        const scoreBySourceSeat = normalizeFriendlyScore(series.scoreBySourceSeat);
        if (finishedPayload && finishedPayload.winnerSeat !== 'draw') {
            const winnerSourceSeat = this.getSourceSeatForMatchSeat(match, series, finishedPayload.winnerSeat);
            if (winnerSourceSeat !== 'A' && winnerSourceSeat !== 'B') return;
            scoreBySourceSeat[winnerSourceSeat] += 1;
        }
        const targetWins = normalizeTargetWins(series.targetWins);
        const maxRounds = getFriendlyMaxRounds(targetWins);
        const canRequestNextRound = scoreBySourceSeat.A < targetWins
            && scoreBySourceSeat.B < targetWins
            && scoreBySourceSeat.A + scoreBySourceSeat.B < maxRounds;
        match.state.friendlySeries = makeFriendlySeriesReport({
            ...series,
            sourceMatchId: series.sourceMatchId || match.matchId,
            originMatchId: series.originMatchId || series.sourceMatchId || match.matchId,
            seriesId: series.seriesId,
            status: 'finished',
            confirmationCount: 2,
            createdAt: series.createdAt,
            sourceParticipants: series.sourceParticipants,
            scoreBySourceSeat,
            targetWins,
            roundIndex: series.roundIndex,
            lastRecordedMatchId: match.matchId,
            canRequestNextRound
        });
    }

    async hasBlockingActiveMatch(userId, sourceMatchId) {
        const active = await this.getActiveMatchForUser(userId);
        if (!active || !active.match || !active.match.matchId) return false;
        if (active.match.matchId === sourceMatchId && this.isTerminalStatus(active.match.state && active.match.state.status)) return false;
        return active.match.matchId !== sourceMatchId && !this.isTerminalStatus(active.match.state && active.match.state.status);
    }

    isFriendlyRematchRequestExpired(request) {
        if (!request) return false;
        const createdAt = Math.max(0, Math.floor(Number(request.createdAt) || 0));
        return createdAt > 0 && createdAt + this.rematchTtlMs <= this.now();
    }

    async getFriendlyRematchAccess(userId, sourceMatchId) {
        const matchAccess = await this.getMatchForUser(userId, sourceMatchId);
        if (!matchAccess || !matchAccess.match || !matchAccess.match.state) return null;
        const sourceMatch = matchAccess.match;
        const participantIds = Object.keys(sourceMatch.seatsByUserId || {});
        if (participantIds.length !== 2 || !participantIds.includes(userId)) return null;
        const request = this.friendlyRematchRequests.get(sourceMatch.matchId)
            || await this.hydrateFriendlyRematchRequest(sourceMatch.matchId, participantIds);
        return {
            sourceMatch,
            participantIds,
            request
        };
    }

    async getFriendlyRematchStatus(userId, sourceMatchId) {
        const access = await this.getFriendlyRematchAccess(userId, sourceMatchId);
        if (!access || !access.request) return null;
        if (this.isFriendlyRematchRequestExpired(access.request)) {
            this.friendlyRematchRequests.delete(access.sourceMatch.matchId);
            await this.deleteFriendlyRematchRequest(access.sourceMatch.matchId);
            return {
                status: 'expired',
                reason: 'rematch_expired',
                message: '低压力再战等待已过期，可回到复盘后重新发起。',
                matchId: access.sourceMatch.matchId,
                sourceMatchId: access.sourceMatch.matchId,
                friendlySeries: this.makeFriendlySeriesForSource(
                    access.sourceMatch,
                    access.request,
                    'expired',
                    access.request.playersByUserId.size
                )
            };
        }
        return {
            status: 'waiting_rematch',
            matchId: access.sourceMatch.matchId,
            sourceMatchId: access.sourceMatch.matchId,
            friendlySeries: this.makeFriendlySeriesForSource(
                access.sourceMatch,
                access.request,
                'waiting_rematch',
                access.request.playersByUserId.size
            )
        };
    }

    async cancelFriendlyRematch(userId, sourceMatchId) {
        const access = await this.getFriendlyRematchAccess(userId, sourceMatchId);
        if (!access || !access.request) return null;
        if (!access.request.playersByUserId || !access.request.playersByUserId.has(userId)) return null;
        if (this.isFriendlyRematchRequestExpired(access.request)) {
            this.friendlyRematchRequests.delete(access.sourceMatch.matchId);
            await this.deleteFriendlyRematchRequest(access.sourceMatch.matchId);
            return {
                status: 'expired',
                reason: 'rematch_expired',
                message: '低压力再战等待已过期，可回到复盘后重新发起。',
                matchId: access.sourceMatch.matchId,
                sourceMatchId: access.sourceMatch.matchId,
                friendlySeries: this.makeFriendlySeriesForSource(
                    access.sourceMatch,
                    access.request,
                    'expired',
                    access.request.playersByUserId.size
                )
            };
        }
        this.friendlyRematchRequests.delete(access.sourceMatch.matchId);
        await this.deleteFriendlyRematchRequest(access.sourceMatch.matchId);
        return {
            status: 'cancelled',
            reason: 'rematch_cancelled',
            message: '已取消低压力再战等待；本局复盘保留，不写正式积分。',
            matchId: access.sourceMatch.matchId,
            sourceMatchId: access.sourceMatch.matchId,
            friendlySeries: this.makeFriendlySeriesForSource(
                access.sourceMatch,
                access.request,
                'cancelled',
                access.request.playersByUserId.size
            )
        };
    }

    async requestFriendlyRematch(userId, sourceMatchId, playerInput = {}) {
        const matchAccess = await this.getMatchForUser(userId, sourceMatchId);
        if (!matchAccess || !matchAccess.match || !matchAccess.match.state) return null;
        const sourceMatch = matchAccess.match;
        if (sourceMatch.state.status !== 'finished') return null;
        const sourceState = sourceMatch.state;
        if (sourceState.mode === 'friendly') {
            const series = sourceState.friendlySeries;
            const score = normalizeFriendlyScore(series && series.scoreBySourceSeat);
            const targetWins = normalizeTargetWins(series && series.targetWins);
            const maxRounds = getFriendlyMaxRounds(targetWins);
            const seriesStatus = getFriendlySeriesStatus(score, targetWins);
            if (!series || seriesStatus === 'complete' || series.canRequestNextRound !== true || score.A + score.B >= maxRounds) {
                return null;
            }
        }
        const participantIds = Object.keys(sourceMatch.seatsByUserId || {});
        if (participantIds.length !== 2 || !participantIds.includes(userId)) return null;
        if (await this.hasBlockingActiveMatch(userId, sourceMatch.matchId)) {
            return {
                status: 'blocked',
                reason: 'active_match_exists',
                message: '当前已有进行中的真人对局'
            };
        }

        const player = normalizePlayer({
            ...playerInput,
            userId
        }, this.now);
        let request = this.friendlyRematchRequests.get(sourceMatch.matchId)
            || await this.hydrateFriendlyRematchRequest(sourceMatch.matchId, participantIds);
        if (this.isFriendlyRematchRequestExpired(request)) {
            this.friendlyRematchRequests.delete(sourceMatch.matchId);
            await this.deleteFriendlyRematchRequest(sourceMatch.matchId);
            request = null;
        }
        if (!request) {
            const inheritedSeriesId = sourceState.mode === 'friendly' && sourceState.friendlySeries && sourceState.friendlySeries.seriesId
                ? String(sourceState.friendlySeries.seriesId)
                : '';
            request = {
                sourceMatchId: sourceMatch.matchId,
                seriesId: inheritedSeriesId || makeId('pvpls'),
                createdAt: this.now(),
                seriesCreatedAt: Math.max(0, Math.floor(Number(sourceState.friendlySeries && sourceState.friendlySeries.createdAt) || this.now())),
                playersByUserId: new Map()
            };
            this.friendlyRematchRequests.set(sourceMatch.matchId, request);
        }
        request.playersByUserId.set(userId, player);
        const acceptedIds = Array.from(request.playersByUserId.keys()).filter(id => participantIds.includes(id));
        const friendlySeries = this.makeFriendlySeriesForSource(
            sourceMatch,
            request,
            acceptedIds.length >= 2 ? 'matched' : 'waiting_rematch',
            acceptedIds.length
        );
        if (acceptedIds.length < 2) {
            await this.saveFriendlyRematchRequest(request);
            return {
                status: 'waiting_rematch',
                matchId: sourceMatch.matchId,
                sourceMatchId: sourceMatch.matchId,
                friendlySeries
            };
        }

        for (const participantId of participantIds) {
            if (await this.hasBlockingActiveMatch(participantId, sourceMatch.matchId)) {
                await this.saveFriendlyRematchRequest(request);
                return {
                    status: 'waiting_rematch',
                    matchId: sourceMatch.matchId,
                    sourceMatchId: sourceMatch.matchId,
                    friendlySeries: this.makeFriendlySeriesForSource(
                        sourceMatch,
                        request,
                        'waiting_rematch',
                        acceptedIds.length
                    )
                };
            }
        }

        const sourceSeatAUserId = this.getSourceSeatUserId(sourceMatch, 'A');
        const sourceSeatBUserId = this.getSourceSeatUserId(sourceMatch, 'B');
        const playerA = request.playersByUserId.get(sourceSeatBUserId);
        const playerB = request.playersByUserId.get(sourceSeatAUserId);
        if (!playerA || !playerB) return null;

        this.friendlyRematchRequests.delete(sourceMatch.matchId);
        await this.deleteFriendlyRematchRequest(sourceMatch.matchId);
        const rematch = await this.createMatch(playerA, playerB, {
            matchedAt: this.now(),
            candidatePoolSize: 2,
            waitMs: { A: 0, B: 0 },
            safeguards: ['server_authoritative', 'snapshot_locked', 'setup_ready_required', 'first_action_budget', 'friendly_no_ranked_impact']
        }, {
            mode: 'friendly',
            friendlySeries
        });
        const result = this.makeMatchedQueueResult(rematch, userId);
        return {
            ...result,
            friendlySeries
        };
    }

    makeStoreEvent(match, eventType, actingSeat, payload = {}) {
        const nextSequence = match.state.eventSeq + 1;
        return {
            eventId: `${match.matchId}-evt-${nextSequence}`,
            sequence: nextSequence,
            eventType,
            matchId: match.matchId,
            actingSeat,
            visibility: 'public',
            payload
        };
    }

    async releaseMatch(match) {
        if (!match || !match.seatsByUserId) return;
        await this.rememberRecentOpponentPair(match);
        Object.keys(match.seatsByUserId).forEach(participantUserId => {
            this.activeMatchByUserId.delete(participantUserId);
        });
        this.clearPendingResultsForMatch(match.matchId);
    }

    async hydrateActiveMatchForUser(userId) {
        if (!this.persistence || typeof this.persistence.loadActiveMatchForUser !== 'function') return null;
        const match = await this.persistence.loadActiveMatchForUser(userId);
        if (!match || !match.matchId || !match.seatsByUserId || !match.seatsByUserId[userId]) return null;
        this.matches.set(match.matchId, match);
        Object.keys(match.seatsByUserId).forEach(participantUserId => {
            this.activeMatchByUserId.set(participantUserId, match.matchId);
        });
        await this.clearWaitingEntriesForMatch(match);
        return match;
    }

    async finishMatchByTimeout(match) {
        if (!match || !match.state || match.state.status !== 'active') return false;
        const timing = this.ensureActiveTurnTiming(match);
        const startedAt = timing ? timing.startedAt : match.updatedAt;
        const elapsed = this.now() - startedAt;
        if (elapsed < this.turnTimeoutMs) return false;
        const loserSeat = match.state.currentSeat;
        const winnerSeat = loserSeat === 'A' ? 'B' : 'A';
        const timeoutCounts = match.state.timeoutAutomationBySeat && typeof match.state.timeoutAutomationBySeat === 'object'
            ? match.state.timeoutAutomationBySeat
            : {};
        const previousAutomationCount = Math.max(0, Math.floor(Number(timeoutCounts[loserSeat]) || 0));
        if (elapsed < this.turnTimeoutMs * 2 && previousAutomationCount <= 0) {
            const automationResult = await this.executeFirstTimeoutAutomation(match, loserSeat, elapsed);
            return automationResult || { match, saveResult: null };
        }
        const timeoutEvent = this.makeStoreEvent(match, 'turn_timeout', loserSeat, {
            loserSeat,
            winnerSeat,
            timeoutMs: this.turnTimeoutMs,
            elapsedMs: elapsed,
            automationCount: previousAutomationCount
        });
        match.state.eventSeq += 1;
        const finishedEvent = this.makeStoreEvent(match, 'match_finished', loserSeat, {
            winnerSeat,
            loserSeat,
            finishReason: 'timeout'
        });
        match.state.eventSeq += 1;
        match.state.status = 'finished';
        match.state.events.push(timeoutEvent, finishedEvent);
        match.state.stateVersion += 1;
        match.updatedAt = this.now();
        return this.completeFinishedMatch(match);
    }

    chooseTimeoutAutomationCard(seat) {
        if (!seat || !Array.isArray(seat.hand)) return null;
        const energy = Math.max(0, Math.floor(Number(seat.energy) || 0));
        return seat.hand
            .filter(card => Math.max(0, Math.floor(Number(card.block) || 0)) > 0)
            .filter(card => Math.max(0, Math.floor(Number(card.damage) || 0)) <= 0)
            .filter(card => Math.max(0, Math.floor(Number(card.cost) || 0)) <= energy)
            .sort((left, right) => Math.max(0, Math.floor(Number(right.block) || 0)) - Math.max(0, Math.floor(Number(left.block) || 0))
                || Math.max(0, Math.floor(Number(left.cost) || 0)) - Math.max(0, Math.floor(Number(right.cost) || 0))
                || String(left.instanceId).localeCompare(String(right.instanceId)))[0] || null;
    }

    applyAutomationResult(match, result) {
        if (!result || result.result !== 'accepted' || !result.state) return false;
        match.state = result.state;
        return true;
    }

    async executeFirstTimeoutAutomation(match, seatId, elapsed) {
        if (!match || !match.state || match.state.status !== 'active') return false;
        const actor = match.state.seats && match.state.seats[seatId];
        if (!actor) return false;
        const timeoutEvent = this.makeStoreEvent(match, 'turn_timeout', seatId, {
            seatId,
            timeoutMs: this.turnTimeoutMs,
            elapsedMs: elapsed,
            finishReason: 'soft_timeout_automation'
        });
        match.state.eventSeq += 1;
        match.state.events.push(timeoutEvent);
        match.state.stateVersion += 1;
        match.state.timeoutAutomationBySeat = {
            ...(match.state.timeoutAutomationBySeat || {}),
            [seatId]: Math.max(0, Math.floor(Number(match.state.timeoutAutomationBySeat && match.state.timeoutAutomationBySeat[seatId]) || 0)) + 1
        };

        const previousTurnSeat = match.state.currentSeat;
        const automationCard = this.chooseTimeoutAutomationCard(match.state.seats[seatId]);
        let automationType = 'end_turn';
        if (automationCard) {
            const playResult = reduceIntent(match.state, {
                intentId: `${match.matchId}-automation-play-${seatId}-${match.state.eventSeq + 1}`,
                intentType: 'play_card',
                matchId: match.matchId,
                seatId,
                ruleVersion: match.state.ruleVersion,
                stateVersion: match.state.stateVersion,
                payload: {
                    cardInstanceId: automationCard.instanceId,
                    targetSeat: seatId,
                    automated: true
                }
            });
            if (this.applyAutomationResult(match, playResult)) {
                automationType = 'defense_card';
            }
        }

        if (match.state.status === 'active' && match.state.currentSeat === seatId) {
            const endResult = reduceIntent(match.state, {
                intentId: `${match.matchId}-automation-end-${seatId}-${match.state.eventSeq + 1}`,
                intentType: 'end_turn',
                matchId: match.matchId,
                seatId,
                ruleVersion: match.state.ruleVersion,
                stateVersion: match.state.stateVersion,
                payload: {
                    automated: true
                }
            });
            this.applyAutomationResult(match, endResult);
        }
        if (match.state.status === 'active' && previousTurnSeat && previousTurnSeat !== match.state.currentSeat) {
            this.startActiveTurn(match);
        }

        if (match.state.status === 'active') {
            const automationEvent = this.makeStoreEvent(match, 'automation_action', seatId, {
                seatId,
                actionType: automationType,
                reason: 'soft_timeout',
                automationCount: Math.max(0, Math.floor(Number(match.state.timeoutAutomationBySeat && match.state.timeoutAutomationBySeat[seatId]) || 0))
            });
            match.state.eventSeq += 1;
            match.state.events.push(automationEvent);
            match.state.stateVersion += 1;
        }
        match.updatedAt = this.now();
        const saveResult = await this.saveMatch(match);
        return { match, saveResult };
    }

    getConnectionTimeoutSeats(match) {
        if (!match || !match.state || !match.state.seats) return [];
        return Object.keys(match.state.seats)
            .map(seatId => this.makeConnectionSeatReport(match, seatId, seatId))
            .filter(report => report && report.status === 'disconnected');
    }

    async invalidateSetupByConnectionTimeout(match) {
        if (!match || !match.state || match.state.status !== 'setup') return false;
        const disconnectedSeats = this.getConnectionTimeoutSeats(match);
        if (disconnectedSeats.length === 0) return false;
        const timeoutSeatIds = disconnectedSeats.map(report => report.seatId);
        const maxElapsedMs = disconnectedSeats.reduce((max, report) => Math.max(max, report.elapsedMs || 0), 0);
        const timeoutEvent = this.makeStoreEvent(match, 'connection_timeout', null, {
            seatId: timeoutSeatIds[0] || '',
            disconnectedSeats: timeoutSeatIds,
            phase: 'setup',
            heartbeatStaleMs: this.heartbeatStaleMs,
            reconnectGraceMs: this.reconnectGraceMs,
            elapsedMs: maxElapsedMs
        });
        match.state.eventSeq += 1;
        const invalidatedEvent = this.makeStoreEvent(match, 'match_invalidated', null, {
            reason: 'connection_timeout',
            disconnectedSeats: timeoutSeatIds
        });
        match.state.eventSeq += 1;
        match.state.status = 'invalidated';
        match.state.phase = 'invalidated';
        match.state.events.push(timeoutEvent, invalidatedEvent);
        match.state.stateVersion += 1;
        match.updatedAt = this.now();
        const completion = await this.completeInvalidatedMatch(match);
        if (completion && completion.completed) {
            await this.recordConnectionTimeoutOpsEvents(match, {
                reason: 'setup_connection_timeout',
                phase: 'setup',
                resolution: 'match_invalidated',
                disconnectedSeats: timeoutSeatIds,
                elapsedMs: maxElapsedMs
            });
        }
        return completion;
    }

    async finishMatchByConnectionTimeout(match) {
        if (!match || !match.state || match.state.status !== 'active') return false;
        const loserSeat = match.state.currentSeat;
        if (!loserSeat) return false;
        const loserReport = this.makeConnectionSeatReport(match, loserSeat, loserSeat);
        if (!loserReport || loserReport.status !== 'disconnected') return false;
        const winnerSeat = loserSeat === 'A' ? 'B' : 'A';
        const timeoutMs = this.heartbeatStaleMs + this.reconnectGraceMs;
        const timeoutEvent = this.makeStoreEvent(match, 'turn_timeout', loserSeat, {
            seatId: loserSeat,
            loserSeat,
            winnerSeat,
            finishReason: 'connection_timeout',
            timeoutMs,
            elapsedMs: loserReport.elapsedMs,
            heartbeatStaleMs: this.heartbeatStaleMs,
            reconnectGraceMs: this.reconnectGraceMs
        });
        match.state.eventSeq += 1;
        const finishedEvent = this.makeStoreEvent(match, 'match_finished', loserSeat, {
            winnerSeat,
            loserSeat,
            finishReason: 'connection_timeout'
        });
        match.state.eventSeq += 1;
        match.state.status = 'finished';
        match.state.events.push(timeoutEvent, finishedEvent);
        match.state.stateVersion += 1;
        match.updatedAt = this.now();
        const completion = await this.completeFinishedMatch(match);
        if (completion && completion.completed) {
            await this.recordConnectionTimeoutOpsEvents(match, {
                reason: 'active_turn_connection_timeout',
                phase: 'active',
                resolution: 'connection_timeout',
                disconnectedSeats: [loserSeat],
                loserSeat,
                winnerSeat,
                elapsedMs: loserReport.elapsedMs
            });
        }
        return completion;
    }

    async invalidateActiveByDoubleConnectionTimeout(match) {
        if (!match || !match.state || match.state.status !== 'active') return false;
        const disconnectedSeats = this.getConnectionTimeoutSeats(match);
        const timeoutSeatIds = disconnectedSeats.map(report => report.seatId).filter(Boolean);
        if (timeoutSeatIds.length < 2) return false;
        const maxElapsedMs = disconnectedSeats.reduce((max, report) => Math.max(max, report.elapsedMs || 0), 0);
        const timeoutEvent = this.makeStoreEvent(match, 'connection_timeout', null, {
            seatId: timeoutSeatIds[0] || '',
            disconnectedSeats: timeoutSeatIds,
            phase: 'active',
            heartbeatStaleMs: this.heartbeatStaleMs,
            reconnectGraceMs: this.reconnectGraceMs,
            elapsedMs: maxElapsedMs
        });
        match.state.eventSeq += 1;
        const invalidatedEvent = this.makeStoreEvent(match, 'match_invalidated', null, {
            reason: 'connection_timeout',
            disconnectedSeats: timeoutSeatIds
        });
        match.state.eventSeq += 1;
        match.state.status = 'invalidated';
        match.state.phase = 'invalidated';
        match.state.events.push(timeoutEvent, invalidatedEvent);
        match.state.stateVersion += 1;
        match.updatedAt = this.now();
        const completion = await this.completeInvalidatedMatch(match);
        if (completion && completion.completed) {
            await this.recordConnectionTimeoutOpsEvents(match, {
                reason: 'double_connection_timeout',
                phase: 'active',
                resolution: 'match_invalidated',
                disconnectedSeats: timeoutSeatIds,
                elapsedMs: maxElapsedMs
            });
        }
        return completion;
    }

    async invalidateSetupByReadyTimeout(match) {
        if (!match || !match.state || match.state.status !== 'setup') return false;
        const readyDeadlineAt = Math.floor(Number(match.state.setup && match.state.setup.readyDeadlineAt) || 0);
        if (!readyDeadlineAt || this.now() < readyDeadlineAt) return false;

        const elapsed = Math.max(0, this.now() - readyDeadlineAt);
        const unreadySeats = Object.keys(match.state.seats || {})
            .filter(seatId => match.state.seats[seatId] && !match.state.seats[seatId].ready);
        const timeoutEvent = this.makeStoreEvent(match, 'ready_timeout', null, {
            unreadySeats,
            readyDeadlineAt,
            elapsedMs: elapsed
        });
        match.state.eventSeq += 1;
        const invalidatedEvent = this.makeStoreEvent(match, 'match_invalidated', null, {
            reason: 'ready_timeout',
            unreadySeats
        });
        match.state.eventSeq += 1;
        match.state.status = 'invalidated';
        match.state.phase = 'invalidated';
        match.state.events.push(timeoutEvent, invalidatedEvent);
        match.state.stateVersion += 1;
        match.updatedAt = this.now();
        return this.completeInvalidatedMatch(match);
    }

    async sweepMatchTimeout(match) {
        const results = [
            await this.invalidateSetupByReadyTimeout(match),
            await this.invalidateSetupByConnectionTimeout(match),
            await this.invalidateActiveByDoubleConnectionTimeout(match),
            await this.finishMatchByConnectionTimeout(match),
            await this.finishMatchByTimeout(match)
        ];
        const staleCompletion = results.find(result => this.isStaleStateSaveResult(result && result.saveResult));
        return staleCompletion || { match, saveResult: null };
    }

    async getActiveMatchForUser(userId) {
        const matchId = this.activeMatchByUserId.get(userId);
        if (!matchId) {
            const hydrated = await this.hydrateActiveMatchForUser(userId);
            if (!hydrated) return null;
        }
        const activeMatchId = this.activeMatchByUserId.get(userId);
        let match = this.matches.get(activeMatchId);
        if (activeMatchId && this.persistence && typeof this.persistence.loadMatchForUser === 'function') {
            const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, activeMatchId);
            if (!authoritative) return null;
            match = authoritative.match;
        }
        if (!match) {
            this.activeMatchByUserId.delete(userId);
            return null;
        }
        await this.clearWaitingEntriesForMatch(match);
        const sweepResult = await this.sweepMatchTimeout(match);
        if (this.isStaleStateSaveResult(sweepResult && sweepResult.saveResult)) {
            return this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
        }
        const seatId = match.seatsByUserId[userId];
        if (!seatId) return null;
        const releaseResult = await this.releaseIfTerminal(match);
        if (this.isStaleStateSaveResult(releaseResult && releaseResult.saveResult)) {
            return this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
        }
        return {
            match,
            seatId,
            stateView: this.projectMatchStateView(match, seatId)
        };
    }

    makeMatchedQueueResult(match, userId) {
        const seatId = match.seatsByUserId[userId];
        return {
            status: 'matched',
            userId,
            matchId: match.matchId,
            seatId,
            stateView: this.projectMatchStateView(match, seatId)
        };
    }

    clearPendingResultsForMatch(matchId) {
        for (const [queueTicket, result] of this.pendingQueueResults.entries()) {
            if (result && result.matchId === matchId) {
                this.pendingQueueResults.delete(queueTicket);
            }
        }
    }

    async getMatchForUser(userId, matchId) {
        let match = this.matches.get(matchId);
        if (this.persistence && typeof this.persistence.loadMatchForUser === 'function') {
            const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, matchId);
            match = authoritative && authoritative.match || null;
        }
        if (!match && this.persistence && typeof this.persistence.loadActiveMatchForUser === 'function') {
            const hydrated = await this.hydrateActiveMatchForUser(userId);
            if (hydrated && hydrated.matchId === matchId) {
                match = hydrated;
            }
        }
        if (!match) return null;
        const sweepResult = await this.sweepMatchTimeout(match);
        if (this.isStaleStateSaveResult(sweepResult && sweepResult.saveResult)) {
            return this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
        }
        const seatId = match.seatsByUserId[userId];
        if (!seatId) return null;
        const releaseResult = await this.releaseIfTerminal(match);
        if (this.isStaleStateSaveResult(releaseResult && releaseResult.saveResult)) {
            return this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
        }
        const stateView = this.projectMatchStateView(match, seatId);
        await this.recordFairnessTelemetryFromStateView(match, stateView);
        return {
            match,
            seatId,
            stateView
        };
    }

    async recordHeartbeat(userId, matchId) {
        const matchAccess = await this.getMatchForUser(userId, matchId);
        if (!matchAccess) return null;
        const { match, seatId } = matchAccess;
        const previousReport = this.makeConnectionSeatReport(match, seatId, seatId);
        const connection = this.ensureMatchConnection(match);
        const seat = connection && connection.seats ? connection.seats[seatId] : null;
        if (!seat) return null;
        const previousStatus = previousReport ? previousReport.status : 'online';
        const now = this.now();
        seat.lastHeartbeatAt = now;
        if (!seat.connectedAt) seat.connectedAt = now;
        if (previousStatus !== 'online') seat.reconnectedAt = now;
        const saveResult = await this.saveMatch(match);
        if (this.isStaleStateSaveResult(saveResult)) {
            const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
            return authoritative ? { ...authoritative, saveResult } : null;
        }
        return {
            match,
            seatId,
            stateView: this.projectMatchStateView(match, seatId)
        };
    }

    async forceSeatStateForTest(userId, matchId, targetSeatId, patch = {}) {
        const matchAccess = await this.getMatchForUser(userId, matchId);
        if (!matchAccess) return null;
        const { match, seatId } = matchAccess;
        const safeTargetSeatId = String(targetSeatId || '').trim().toUpperCase();
        if (!(safeTargetSeatId === 'A' || safeTargetSeatId === 'B')) return null;
        if (!match.state || this.isTerminalStatus(match.state.status)) return null;
        const matchTestScope = this.getMatchTestScope(match);
        const requestTestScope = normalizeLivePvpTestMatchScope(patch && patch.testMatchScope);
        if (!matchTestScope || requestTestScope !== matchTestScope) return null;
        const targetSeat = match.state.seats && match.state.seats[safeTargetSeatId];
        if (!targetSeat) return null;
        const changedFields = [];

        const maxHp = Math.max(1, Math.floor(Number(targetSeat.maxHp) || RULES.startingHp));
        if (Object.prototype.hasOwnProperty.call(patch, 'hp')) {
            targetSeat.hp = Math.max(1, Math.min(maxHp, Math.floor(Number(patch.hp) || 1)));
            changedFields.push('hp');
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'block')) {
            targetSeat.block = Math.max(0, Math.floor(Number(patch.block) || 0));
            changedFields.push('block');
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'energy')) {
            const maxEnergy = Math.max(0, Math.floor(Number(targetSeat.maxEnergy) || RULES.startingEnergy));
            targetSeat.energy = Math.max(0, Math.min(maxEnergy, Math.floor(Number(patch.energy) || 0)));
            changedFields.push('energy');
        }
        if (patch.publicStatus && typeof patch.publicStatus === 'object') {
            const statusPatch = patch.publicStatus;
            const statusId = String(statusPatch.statusId || '').trim();
            if (statusId !== 'vulnerable_mark') {
                return {
                    rejected: true,
                    statusCode: 400,
                    reason: 'unsupported_test_public_status',
                    message: '实时论道测试状态只支持公开破绽注入'
                };
            }
            const currentTurn = Math.max(0, Math.floor(Number(match.state.turnIndex) || 0));
            const sourceSeat = normalizeSourceSeat(statusPatch.sourceSeat, otherSourceSeat(safeTargetSeatId));
            const publicStatus = {
                statusId,
                label: String(statusPatch.label || '破绽').trim().slice(0, 24) || '破绽',
                seatId: safeTargetSeatId,
                sourceSeat: sourceSeat === safeTargetSeatId ? otherSourceSeat(safeTargetSeatId) : sourceSeat,
                stacks: Math.max(1, Math.min(3, Math.floor(Number(statusPatch.stacks) || 1))),
                appliedTurnIndex: Math.max(0, Math.floor(Number(statusPatch.appliedTurnIndex) || currentTurn)),
                earliestConsumeTurnIndex: Math.max(currentTurn + 1, Math.floor(Number(statusPatch.earliestConsumeTurnIndex) || (currentTurn + 1))),
                expiresAtTurnIndex: Math.max(currentTurn + 1, Math.floor(Number(statusPatch.expiresAtTurnIndex) || (currentTurn + 3))),
                responseWindow: String(statusPatch.responseWindow || 'defender_turn_before_payoff').trim().slice(0, 48) || 'defender_turn_before_payoff',
                summary: '破绽已公开；防守方至少拥有一个行动窗口后才可被兑现。'
            };
            targetSeat.publicStatuses = Array.isArray(targetSeat.publicStatuses)
                ? targetSeat.publicStatuses.filter(status => status && status.statusId !== publicStatus.statusId)
                : [];
            targetSeat.publicStatuses.push(publicStatus);
            changedFields.push('publicStatus');
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'heartbeatElapsedMs')) {
            const connection = this.ensureMatchConnection(match);
            const targetConnectionSeat = connection && connection.seats ? connection.seats[safeTargetSeatId] : null;
            if (targetConnectionSeat) {
                const now = this.now();
                const elapsedMs = Math.max(0, Math.min(
                    24 * 60 * 60 * 1000,
                    Math.floor(Number(patch.heartbeatElapsedMs) || 0)
                ));
                targetConnectionSeat.lastHeartbeatAt = Math.max(1, now - elapsedMs);
                if (!targetConnectionSeat.connectedAt) targetConnectionSeat.connectedAt = now;
                if (elapsedMs <= this.heartbeatStaleMs) targetConnectionSeat.reconnectedAt = now;
                changedFields.push('heartbeatElapsedMs');
            }
        }

        const event = this.makeStoreEvent(match, 'test_state_forced', seatId, {
            targetSeatId: safeTargetSeatId,
            fields: changedFields,
            scope: matchTestScope
        });
        match.state.eventSeq += 1;
        match.state.events.push(event);
        match.state.stateVersion += 1;
        match.updatedAt = this.now();
        const saveResult = await this.saveMatch(match, {
            forceConnectionSnapshot: changedFields.includes('heartbeatElapsedMs')
        });
        if (this.isStaleStateSaveResult(saveResult)) {
            const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
            return authoritative ? { ...authoritative, targetSeatId: safeTargetSeatId, saveResult } : null;
        }
        return {
            match,
            seatId,
            targetSeatId: safeTargetSeatId,
            stateView: this.projectMatchStateView(match, seatId),
            saveResult
        };
    }

    async submitIntent(userId, matchId, intentInput, { liveWsSourceInstanceId = '' } = {}) {
        const matchAccess = await this.getMatchForUser(userId, matchId);
        if (!matchAccess) return null;
        const { match, seatId } = matchAccess;
        const previousState = match.state ? {
            status: match.state.status,
            currentSeat: match.state.currentSeat
        } : null;
        const intent = {
            intentId: intentInput && intentInput.intentId,
            intentType: intentInput && intentInput.intentType,
            matchId: match.matchId,
            seatId,
            ruleVersion: match.state.ruleVersion,
            stateVersion: intentInput && intentInput.stateVersion,
            payload: intentInput && intentInput.payload ? intentInput.payload : {}
        };
        const reduced = reduceIntent(match.state, intent);
        let acceptedSaveResult = null;
        if (reduced.result === 'accepted') {
            match.state = reduced.state;
            this.syncTurnTimingAfterAcceptedIntent(match, previousState, reduced.events);
            if (!reduced.nonCombat) {
                match.updatedAt = this.now();
            }
            if (match.state.status === 'finished') {
                const completion = await this.completeFinishedMatch(match, { liveWsSourceInstanceId });
                if (this.isStaleStateSaveResult(completion && completion.saveResult)) {
                    const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
                    return (!match.state.settlementReport
                        ? this.makeAuthoritativeDuplicateIntentResult(authoritative, intent, completion.saveResult)
                        : null)
                        || this.makeStaleStateSyncResult(authoritative, completion.saveResult);
                }
                acceptedSaveResult = completion && completion.saveResult || null;
                if (completion && completion.match && completion.match.state) {
                    reduced.state = completion.match.state;
                }
            } else {
                const saveResult = await this.saveMatch(match, { liveWsSourceInstanceId });
                acceptedSaveResult = saveResult;
                if (this.isStaleStateSaveResult(saveResult)) {
                    const authoritative = await this.rehydrateAuthoritativeMatchForUser(userId, match.matchId);
                    return this.makeAuthoritativeDuplicateIntentResult(authoritative, intent, saveResult)
                        || this.makeStaleStateSyncResult(authoritative, saveResult);
                }
            }
        } else if (match.state && this.isTerminalStatus(match.state.status)) {
            await this.releaseIfTerminal(match);
        }
        reduced.stateView = this.projectMatchStateView(match, seatId);
        await this.recordFairnessTelemetryFromStateView(match, reduced.stateView, { liveWsSourceInstanceId });
        if (acceptedSaveResult) {
            reduced.saveResult = acceptedSaveResult;
        }
        return reduced;
    }
}

function createLivePvpStore(options) {
    return new LivePvpStore(options);
}

module.exports = {
    DEFAULT_TURN_TIMEOUT_MS,
    DEFAULT_SETUP_READY_TIMEOUT_MS,
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    DEFAULT_HEARTBEAT_STALE_MS,
    DEFAULT_RECONNECT_GRACE_MS,
    LivePvpStore,
    createLivePvpStore
};
