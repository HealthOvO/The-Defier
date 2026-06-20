const crypto = require('crypto');
const { RULE_VERSION } = require('./engine/rules');
const { projectStateView } = require('./engine/state-view');

const REPLAY_VISIBILITY_LAYERS = Object.freeze([
    'replay_self',
    'replay_public',
    'audit_safe'
]);

const PUBLIC_EVENT_DATA_KEYS = Object.freeze({
    mulligan_completed: ['seatId', 'count'],
    player_ready: ['seatId'],
    battle_started: ['firstSeat', 'roundIndex', 'turnIndex'],
    opening_second_seat_buffer_granted: ['seatId', 'block', 'totalBlock', 'firstSeat', 'source'],
    card_played: ['cost', 'remainingEnergy'],
    turn_ended: ['nextSeat', 'completedTurns', 'roundIndex', 'turnIndex'],
    cards_drawn: ['seatId', 'count', 'handCount', 'deckCount', 'capped'],
    block_gained: ['block', 'seatId', 'totalBlock'],
    opening_counterplay_granted: ['seatId', 'block', 'totalBlock', 'minimumHp', 'source'],
    opening_protection_triggered: ['protectedSeat', 'minimumHp', 'preventedDamage', 'wouldHaveHp'],
    budget_clamped: ['rawDamage', 'actualDamage', 'preventedDamage', 'targetSeat'],
    damage_applied: ['actualDamage', 'budgetedDamage', 'blockedDamage', 'hpDamage', 'targetSeat', 'targetHp'],
    status_applied: ['statusId', 'label', 'seatId', 'sourceSeat', 'stacks', 'appliedTurnIndex', 'earliestConsumeTurnIndex', 'expiresAtTurnIndex', 'responseWindow'],
    status_consumed: ['statusId', 'label', 'seatId', 'sourceSeat', 'damageBonus', 'consumedTurnIndex'],
    player_surrendered: ['loserSeat', 'winnerSeat'],
    match_finished: ['winnerSeat', 'loserSeat', 'finishReason', 'scoreA', 'scoreB', 'scoreDelta', 'scoreThreshold', 'roundIndex'],
    turn_timeout: ['seatId', 'winnerSeat', 'loserSeat', 'finishReason'],
    connection_timeout: ['seatId', 'disconnectedSeats', 'phase', 'elapsedMs'],
    emote_sent: ['seatId', 'emoteId', 'label'],
    ready_timeout: ['unreadySeats', 'readyDeadlineAt', 'elapsedMs'],
    match_invalidated: ['reason'],
    automation_action: ['seatId', 'actionType', 'reason', 'automationCount']
});

const FORBIDDEN_REPLAY_KEYS = Object.freeze([
    'hand',
    'deck',
    'deckOrder',
    'instanceId',
    'cardInstanceId',
    'cardInstanceIds',
    'cardId',
    'loadoutSnapshot',
    'rngSeed',
    'randomSeed',
    'payload'
]);

const FORBIDDEN_REPLAY_FIELD_PATTERN = /\b(payload|hand|deck|cardId|instanceId|cardInstanceId|loadoutSnapshot|rngSeed|randomSeed)\b/i;
const FORBIDDEN_REPLAY_STRING_PATTERN = /\b(instanceId|cardInstanceId|loadoutSnapshot|rngSeed|randomSeed)\b|[AB]-[a-zA-Z]+-\d+/i;

function stableHash(value) {
    return crypto.createHash('sha256')
        .update(JSON.stringify(value))
        .digest('hex')
        .slice(0, 16);
}

function normalizeReplayVisibility(input) {
    const visibility = String(input || 'replay_self').trim();
    return REPLAY_VISIBILITY_LAYERS.includes(visibility) ? visibility : '';
}

function isTerminalReplayState(state) {
    return !!(state && (state.status === 'finished' || state.status === 'invalidated'));
}

function sanitizePublicData(eventType, payload) {
    const allowedKeys = PUBLIC_EVENT_DATA_KEYS[eventType] || [];
    if (!payload || typeof payload !== 'object' || allowedKeys.length === 0) return {};
    return allowedKeys.reduce((data, key) => {
        const value = payload[key];
        if (value === undefined || value === null) return data;
        if (typeof value === 'number') {
            data[key] = Number.isFinite(value) ? value : 0;
        } else if (typeof value === 'boolean') {
            data[key] = value;
        } else if (typeof value === 'string') {
            data[key] = String(value).slice(0, 64);
        } else if (Array.isArray(value)) {
            data[key] = value.map(item => String(item || '')).filter(Boolean).slice(0, 4);
        }
        return data;
    }, {});
}

function sanitizeReplayEvent(event, matchRef) {
    const eventType = String(event && event.eventType || '');
    const sequence = Math.max(0, Math.floor(Number(event && event.sequence) || 0));
    const publicData = sanitizePublicData(eventType, event && event.payload);
    const safe = {
        eventId: `evt-${sequence}-${stableHash({ matchRef, sequence, eventType })}`,
        eventType,
        sequence,
        actingSeat: event && event.actingSeat ? String(event.actingSeat) : ''
    };
    if (Object.keys(publicData).length > 0) safe.publicData = publicData;
    return safe;
}

function collectPublicReplayEvents(events, matchRef) {
    return (Array.isArray(events) ? events : [])
        .filter(event => event && event.visibility === 'public')
        .map(event => sanitizeReplayEvent(event, matchRef))
        .filter(event => event.eventType);
}

function getFinalStateReport(state) {
    const events = Array.isArray(state && state.events) ? state.events : [];
    const finishEvent = events.filter(event => event && event.eventType === 'match_finished').slice(-1)[0];
    const invalidatedEvent = events.filter(event => event && event.eventType === 'match_invalidated').slice(-1)[0];
    const terminalPayload = finishEvent && finishEvent.payload
        || invalidatedEvent && invalidatedEvent.payload
        || {};
    const seats = state && state.seats || {};
    return {
        status: String(state && state.status || ''),
        winnerSeat: String(terminalPayload.winnerSeat || state && state.winnerSeat || ''),
        loserSeat: String(terminalPayload.loserSeat || ''),
        finishReason: String(terminalPayload.finishReason || terminalPayload.reason || ''),
        roundIndex: Math.max(0, Math.floor(Number(state && state.roundIndex) || 0)),
        turnIndex: Math.max(0, Math.floor(Number(state && state.turnIndex) || 0)),
        hp: {
            A: Math.max(0, Math.floor(Number(seats.A && seats.A.hp) || 0)),
            B: Math.max(0, Math.floor(Number(seats.B && seats.B.hp) || 0))
        }
    };
}

function countForbiddenReplayKeys(value, forbiddenKeys) {
    if (!value || typeof value !== 'object') return 0;
    if (Array.isArray(value)) {
        return value.reduce((sum, item) => sum + countForbiddenReplayKeys(item, forbiddenKeys), 0);
    }
    return Object.entries(value).reduce((sum, [key, nested]) => {
        const own = forbiddenKeys.has(key) ? 1 : 0;
        return sum + own + countForbiddenReplayKeys(nested, forbiddenKeys);
    }, 0);
}

function scanHiddenTokens(value, forbiddenKeys = new Set(FORBIDDEN_REPLAY_KEYS)) {
    const keyCount = countForbiddenReplayKeys(value, forbiddenKeys);
    const text = JSON.stringify(value || {});
    const stringCount = FORBIDDEN_REPLAY_STRING_PATTERN.test(text) ? 1 : 0;
    return {
        forbiddenTokenCount: keyCount + stringCount,
        forbiddenKeyCount: keyCount,
        forbiddenStringCount: stringCount
    };
}

function collectFieldPaths(value, prefix = '') {
    if (!value || typeof value !== 'object') return [];
    if (Array.isArray(value)) {
        const childPaths = value.flatMap(item => collectFieldPaths(item, `${prefix}[]`));
        return prefix ? [prefix, ...childPaths] : childPaths;
    }
    return Object.entries(value).flatMap(([key, nested]) => {
        const pathKey = prefix ? `${prefix}.${key}` : key;
        return [pathKey, ...collectFieldPaths(nested, pathKey)];
    });
}

function buildPublicSummary(finalState) {
    return {
        status: finalState.status,
        winnerSeat: finalState.winnerSeat,
        loserSeat: finalState.loserSeat,
        finishReason: finalState.finishReason,
        roundIndex: finalState.roundIndex,
        turnIndex: finalState.turnIndex
    };
}

function getEventMaxSequence(events) {
    return (Array.isArray(events) ? events : []).reduce((max, event) => (
        Math.max(max, Math.floor(Number(event && event.sequence) || 0))
    ), 0);
}

function hasSequenceCoverage(events, expectedSequence) {
    const expected = Math.max(0, Math.floor(Number(expectedSequence) || 0));
    if (!expected) return Array.isArray(events) && events.length > 0;
    const seen = new Set((Array.isArray(events) ? events : [])
        .map(event => Math.floor(Number(event && event.sequence) || 0))
        .filter(sequence => sequence > 0));
    for (let sequence = 1; sequence <= expected; sequence += 1) {
        if (!seen.has(sequence)) return false;
    }
    return true;
}

function hasTerminalEvent(events, status) {
    if (status !== 'finished' && status !== 'invalidated') return true;
    const terminalType = status === 'invalidated' ? 'match_invalidated' : 'match_finished';
    return (Array.isArray(events) ? events : []).some(event => event && event.eventType === terminalType);
}

function isCompleteReplayEventSource(events, expectedSequence, status) {
    return Array.isArray(events)
        && events.length > 0
        && hasSequenceCoverage(events, expectedSequence)
        && hasTerminalEvent(events, status);
}

function resolveReplayEvents(match, events = null) {
    const persistedEvents = Array.isArray(events) ? events : [];
    const stateEvents = Array.isArray(match && match.state && match.state.events) ? match.state.events : [];
    const expectedSequence = Math.max(
        Math.floor(Number(match && match.state && match.state.eventSeq) || 0),
        getEventMaxSequence(persistedEvents),
        getEventMaxSequence(stateEvents)
    );
    const status = String(match && match.state && match.state.status || '');
    if (persistedEvents.length === 0) {
        return isTerminalReplayState(match && match.state)
            ? (isCompleteReplayEventSource(stateEvents, expectedSequence, status) ? stateEvents : null)
            : stateEvents;
    }
    if (isCompleteReplayEventSource(persistedEvents, expectedSequence, status)) {
        return persistedEvents;
    }
    if (isCompleteReplayEventSource(stateEvents, expectedSequence, status)) {
        return stateEvents;
    }
    if (isTerminalReplayState(match && match.state)) {
        return null;
    }
    if (hasTerminalEvent(stateEvents, status) && !hasTerminalEvent(persistedEvents, status)) {
        return stateEvents;
    }
    return getEventMaxSequence(stateEvents) > getEventMaxSequence(persistedEvents)
        ? stateEvents
        : persistedEvents;
}

function makeReplayMatch(match, events = null) {
    const replayEvents = resolveReplayEvents(match, events);
    if (!Array.isArray(replayEvents)) return null;
    if (!match || !match.state || replayEvents === match.state.events) return match;
    return {
        ...match,
        state: {
            ...match.state,
            events: replayEvents
        }
    };
}

function buildBaseReplayPayload({ match, viewerSeat, events = null }) {
    const state = match && match.state;
    const matchRef = stableHash({ matchId: match && match.matchId, ruleVersion: state && state.ruleVersion || RULE_VERSION });
    const replayEvents = resolveReplayEvents(match, events);
    if (!Array.isArray(replayEvents)) return null;
    const publicEvents = collectPublicReplayEvents(replayEvents, matchRef);
    const replayState = state ? { ...state, events: replayEvents } : state;
    const finalState = getFinalStateReport(replayState);
    return {
        reportVersion: 'pvp-live-replay-v1',
        matchRef,
        ruleVersion: state && state.ruleVersion || RULE_VERSION,
        status: finalState.status,
        finalState,
        events: publicEvents,
        publicSummary: buildPublicSummary(finalState),
        viewerSeat
    };
}

function withReplayHash(payload) {
    const replayHash = stableHash(payload);
    const hiddenScan = scanHiddenTokens(payload);
    return {
        ...payload,
        replayHash,
        hiddenScan
    };
}

function buildReplaySelfPayload({ match, viewerSeat, events = null }) {
    const replayMatch = makeReplayMatch(match, events);
    if (!replayMatch) return null;
    const view = projectStateView(replayMatch.state, viewerSeat);
    const payload = buildBaseReplayPayload({ match: replayMatch, viewerSeat, events });
    if (!payload) return null;
    return withReplayHash({
        ...payload,
        visibilityLayer: 'replay_self',
        postMatchReview: view.postMatchReview || null
    });
}

function buildReplayPublicPayload({ match, events = null }) {
    const replayMatch = makeReplayMatch(match, events);
    if (!replayMatch) return null;
    const payload = buildBaseReplayPayload({ match: replayMatch, viewerSeat: undefined, events });
    if (!payload) return null;
    delete payload.viewerSeat;
    return withReplayHash({
        ...payload,
        visibilityLayer: 'replay_public'
    });
}

function buildAuditSafePayload(publicReplay) {
    const fieldPaths = Array.from(new Set(collectFieldPaths(publicReplay)))
        .sort()
        .filter(pathKey => !pathKey.startsWith('hiddenScan'));
    const hiddenFieldPathCount = fieldPaths.filter(pathKey => FORBIDDEN_REPLAY_FIELD_PATTERN.test(pathKey)).length;
    const payload = {
        reportVersion: 'pvp-live-replay-v1',
        visibilityLayer: 'audit_safe',
        sourceVisibilityLayer: 'replay_public',
        matchRef: publicReplay.matchRef,
        ruleVersion: publicReplay.ruleVersion,
        status: publicReplay.status,
        publicSummary: publicReplay.publicSummary,
        events: publicReplay.events,
        fieldPaths,
        hiddenFieldPathCount,
        sourceReplayHash: publicReplay.replayHash
    };
    const safe = withReplayHash(payload);
    return {
        ...safe,
        hiddenScan: {
            ...safe.hiddenScan,
            forbiddenTokenCount: safe.hiddenScan.forbiddenTokenCount + hiddenFieldPathCount
        }
    };
}

function buildMatchReplay(match, viewerSeat, visibilityLayer = 'replay_self', options = {}) {
    const visibility = normalizeReplayVisibility(visibilityLayer);
    if (!visibility || !match || !match.state || !viewerSeat) return null;
    if (!isTerminalReplayState(match.state)) return null;
    const events = options && Array.isArray(options.events) ? options.events : null;
    if (visibility === 'replay_self') return buildReplaySelfPayload({ match, viewerSeat, events });
    const publicReplay = buildReplayPublicPayload({ match, events });
    if (!publicReplay) return null;
    if (visibility === 'replay_public') return publicReplay;
    if (visibility === 'audit_safe') return buildAuditSafePayload(publicReplay);
    return null;
}

module.exports = {
    REPLAY_VISIBILITY_LAYERS,
    buildMatchReplay,
    normalizeReplayVisibility,
    scanHiddenTokens
};
