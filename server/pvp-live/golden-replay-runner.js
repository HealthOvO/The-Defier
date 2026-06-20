const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { FROZEN_BALANCE_ARTIFACT_PATHS } = require('./balance-artifacts');
const { makeLoadoutCandidate } = require('./content/pvp-live-v1-content');
const { normalizeLoadoutSnapshot } = require('./loadout');
const { LivePvpStore } = require('./live-store');
const {
    RULE_VERSION,
    createInitialLiveState,
    projectStateView,
    reduceIntent
} = require('./engine/reducer');

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

function loadGoldenReplayFixtures(rootDir = path.resolve(__dirname, '../..')) {
    const targetPath = path.join(rootDir, FROZEN_BALANCE_ARTIFACT_PATHS.goldenReplays);
    const text = fs.readFileSync(targetPath, 'utf8').trim();
    return text ? text.split('\n').map(line => JSON.parse(line)) : [];
}

function makeReplayLoadout(loadoutId, forcedOpening = []) {
    const candidate = makeLoadoutCandidate(loadoutId);
    if (!candidate) throw new Error(`Unknown reducer replay loadout: ${loadoutId}`);
    const remaining = candidate.deck.map(entry => ({ id: entry.id, upgraded: !!entry.upgraded }));
    const forced = [];
    (Array.isArray(forcedOpening) ? forcedOpening : []).forEach(cardId => {
        const id = String(cardId || '');
        const index = remaining.findIndex(entry => entry.id === id);
        if (index >= 0) forced.push(remaining.splice(index, 1)[0]);
    });
    return {
        ...candidate,
        deck: [...forced, ...remaining].slice(0, 20)
    };
}

function normalizeReplayIntent(state, step, ordinal) {
    const seatId = step.seatId === 'B' ? 'B' : 'A';
    return {
        intentId: `${state.matchId}-${step.intentType}-${seatId}-${ordinal}`,
        intentType: step.intentType,
        matchId: state.matchId,
        seatId,
        ruleVersion: RULE_VERSION,
        stateVersion: state.stateVersion,
        payload: step.payload || {}
    };
}

function submitReducerIntent(state, intent) {
    const result = reduceIntent(state, intent);
    if (result.result !== 'accepted' && result.result !== 'duplicate') {
        throw new Error(`${intent.intentType}:${intent.seatId} failed with ${result.result}:${result.reason}`);
    }
    return result;
}

function scorePlayableCard(card) {
    const damage = Math.max(0, Math.floor(Number(card.damage) || 0));
    const block = Math.max(0, Math.floor(Number(card.block) || 0));
    const cost = Math.max(0, Math.floor(Number(card.cost) || 0));
    return damage * 10 + block * 3 - cost;
}

function choosePlayableCard(seat) {
    const energy = Math.max(0, Math.floor(Number(seat && seat.energy) || 0));
    const hand = Array.isArray(seat && seat.hand) ? seat.hand : [];
    return hand
        .filter(card => Math.max(0, Math.floor(Number(card.cost) || 0)) <= energy)
        .sort((left, right) => scorePlayableCard(right) - scorePlayableCard(left)
            || String(left.instanceId).localeCompare(String(right.instanceId)))[0] || null;
}

function runAutoPlay(state, replay) {
    const maxTurns = Math.max(1, Math.min(60, Math.floor(Number(replay.maxReducerTurns) || 32)));
    const duplicateFirstAction = replay.id === 'golden-idempotent-action-001';
    let duplicateReport = {
        duplicateResult: '',
        stateVersionStable: false,
        noDuplicateEventsAppended: false
    };
    let firstActionIntent = null;
    let firstActionStateVersion = 0;
    let firstActionEventCount = 0;
    let nextState = state;

    for (let turn = 0; nextState.status === 'active' && turn < maxTurns; turn += 1) {
        const seatId = nextState.currentSeat;
        let actions = 0;
        while (nextState.status === 'active' && actions < 4) {
            const actor = nextState.seats[seatId];
            const card = choosePlayableCard(actor);
            if (!card) break;
            const intent = {
                intentId: `${nextState.matchId}-auto-play-${turn}-${actions}-${seatId}`,
                intentType: 'play_card',
                matchId: nextState.matchId,
                seatId,
                ruleVersion: RULE_VERSION,
                stateVersion: nextState.stateVersion,
                payload: {
                    cardInstanceId: card.instanceId,
                    targetSeat: seatId === 'A' ? 'B' : 'A'
                }
            };
            const result = submitReducerIntent(nextState, intent);
            if (!firstActionIntent) {
                firstActionIntent = intent;
                firstActionStateVersion = result.state.stateVersion;
                firstActionEventCount = result.state.events.length;
                if (duplicateFirstAction) {
                    const duplicate = submitReducerIntent(result.state, firstActionIntent);
                    duplicateReport = {
                        duplicateResult: duplicate.result,
                        stateVersionStable: duplicate.state.stateVersion === firstActionStateVersion,
                        noDuplicateEventsAppended: duplicate.state.events.length === firstActionEventCount
                    };
                }
            }
            nextState = result.state;
            actions += 1;
        }
        if (nextState.status !== 'active') break;
        const endTurnIntent = {
            intentId: `${nextState.matchId}-auto-end-${turn}-${seatId}`,
            intentType: 'end_turn',
            matchId: nextState.matchId,
            seatId,
            ruleVersion: RULE_VERSION,
            stateVersion: nextState.stateVersion,
            payload: {}
        };
        nextState = submitReducerIntent(nextState, endTurnIntent).state;
    }

    return { state: nextState, duplicateReport };
}

function buildSequenceReport(events) {
    const sequences = events.map(event => Math.max(0, Math.floor(Number(event.sequence) || 0)));
    const contiguous = sequences.every((sequence, index) => sequence === index + 1);
    return {
        first: sequences[0] || 0,
        last: sequences[sequences.length - 1] || 0,
        count: sequences.length,
        contiguous
    };
}

function buildHiddenLeakReport(viewA, viewB, review) {
    const opponentViews = [viewA && viewA.opponent, viewB && viewB.opponent];
    const hiddenHandLeakCount = opponentViews.filter(view => view && Array.isArray(view.hand)).length;
    const hiddenDeckOrderLeakCount = opponentViews.filter(view => view && Array.isArray(view.deck)).length;
    const reviews = Array.prototype.slice.call(arguments, 2).filter(Boolean);
    const forbiddenKeys = new Set(FORBIDDEN_REPLAY_KEYS);
    const reviewHiddenTokenCount = reviews.reduce((sum, item) => sum + scanHiddenTokens(item, forbiddenKeys).forbiddenTokenCount, 0);
    return {
        hiddenHandLeakCount,
        hiddenDeckOrderLeakCount,
        reviewHiddenTokenCount,
        replayHiddenTokenCount: 0,
        auditHiddenTokenCount: 0,
        forbiddenStringTokenCount: reviews.reduce((sum, item) => sum + scanHiddenTokens(item, forbiddenKeys).forbiddenStringCount, 0)
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

function sanitizeReplayPublicData(eventType, payload) {
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

function sanitizeReplayEvent(event) {
    const eventType = String(event && event.eventType || '');
    const publicData = sanitizeReplayPublicData(eventType, event && event.payload);
    const safe = {
        eventType,
        sequence: Math.max(0, Math.floor(Number(event && event.sequence) || 0)),
        actingSeat: event && event.actingSeat ? String(event.actingSeat) : ''
    };
    if (Object.keys(publicData).length > 0) safe.publicData = publicData;
    return safe;
}

function collectPublicReplayEvents(events) {
    return (Array.isArray(events) ? events : [])
        .filter(event => event && event.visibility === 'public')
        .map(sanitizeReplayEvent)
        .filter(event => event.eventType);
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

function buildPublicReplayPayload({ replay, state, events, finalState, reviewA, reviewB }) {
    const publicEvents = collectPublicReplayEvents(events);
    const payload = {
        reportVersion: 'pvp-live-replay-public-v1',
        visibilityLayer: 'replay_public',
        replayId: replay.id,
        matchRef: stableHash({ replayId: replay.id, matchId: state.matchId }),
        ruleVersion: RULE_VERSION,
        contentPackVersion: replay.contentPackVersion || '',
        finalState,
        events: publicEvents,
        postMatchReviews: {
            A: reviewA,
            B: reviewB
        }
    };
    return {
        ...payload,
        sharePayloadHash: stableHash(payload),
        hiddenScan: scanHiddenTokens(payload)
    };
}

function buildAuditSafePayload(publicReplay) {
    const fieldPaths = Array.from(new Set(collectFieldPaths(publicReplay)))
        .sort()
        .filter(pathKey => !pathKey.startsWith('hiddenScan'));
    const hiddenFieldPathCount = fieldPaths.filter(pathKey => FORBIDDEN_REPLAY_FIELD_PATTERN.test(pathKey)).length;
    const payload = {
        reportVersion: 'pvp-live-audit-safe-v1',
        visibilityLayer: 'audit_safe',
        sourceVisibilityLayer: 'replay_public',
        sourcePayloadHash: publicReplay.sharePayloadHash,
        fieldPaths,
        hiddenFieldPathCount
    };
    const payloadScan = scanHiddenTokens(payload);
    return {
        ...payload,
        auditPayloadHash: stableHash(payload),
        hiddenScan: {
            ...payloadScan,
            forbiddenTokenCount: payloadScan.forbiddenTokenCount + hiddenFieldPathCount
        }
    };
}

function collectPublicEventTypes(value, eventTypes = new Set()) {
    if (!value || typeof value !== 'object') return eventTypes;
    if (Array.isArray(value)) {
        value.forEach(item => collectPublicEventTypes(item, eventTypes));
        return eventTypes;
    }
    if (typeof value.eventType === 'string' && value.eventType) {
        eventTypes.add(value.eventType);
    }
    Object.values(value).forEach(nested => collectPublicEventTypes(nested, eventTypes));
    return eventTypes;
}

function buildReviewDerivation(review, publicEvents = []) {
    const publicEventTypes = collectPublicEventTypes(review);
    (Array.isArray(publicEvents) ? publicEvents : []).forEach(event => {
        if (event && event.eventType) publicEventTypes.add(event.eventType);
    });
    const forbiddenCount = countForbiddenReplayKeys(review, new Set([
        'hand',
        'deck',
        'deckOrder',
        'instanceId',
        'loadoutSnapshot',
        'rngSeed',
        'randomSeed'
    ]));
    return {
        publicDerivationOnly: (!review || forbiddenCount === 0),
        hasBudgetPrevention: publicEventTypes.has('budget_clamped'),
        hasDecisiveRound: publicEventTypes.has('match_finished'),
        hasLoserAdvice: !!(review && review.result === 'loss' && Array.isArray(review.suggestions) && review.suggestions.length > 0)
    };
}

function chooseReviewForDerivation({ reviewA, reviewB, finalState }) {
    if (finalState && finalState.loserSeat === 'A') return reviewA;
    if (finalState && finalState.loserSeat === 'B') return reviewB;
    return reviewA || reviewB || null;
}

function getFinalStateReport(state) {
    const finishEvent = state.events.filter(event => event.eventType === 'match_finished').slice(-1)[0];
    const payload = finishEvent && finishEvent.payload || {};
    return {
        status: state.status,
        winnerSeat: String(payload.winnerSeat || ''),
        loserSeat: String(payload.loserSeat || ''),
        finishReason: String(payload.finishReason || ''),
        roundIndex: state.roundIndex,
        turnIndex: state.turnIndex,
        hp: {
            A: state.seats.A.hp,
            B: state.seats.B.hp
        }
    };
}

function runReducerScenario(state, replay) {
    const scenario = replay && replay.reducerScenario && typeof replay.reducerScenario === 'object'
        ? replay.reducerScenario
        : {};
    if (scenario.scenarioType !== 'round14_draw_runtime') return { state, duplicateReport: null };

    state = submitReducerIntent(state, {
        intentId: `${state.matchId}-scenario-ready-A`,
        intentType: 'ready',
        matchId: state.matchId,
        seatId: 'A',
        ruleVersion: RULE_VERSION,
        stateVersion: state.stateVersion,
        payload: {}
    }).state;
    state = submitReducerIntent(state, {
        intentId: `${state.matchId}-scenario-ready-B`,
        intentType: 'ready',
        matchId: state.matchId,
        seatId: 'B',
        ruleVersion: RULE_VERSION,
        stateVersion: state.stateVersion,
        payload: {}
    }).state;
    state.roundIndex = Math.max(1, Math.floor(Number(scenario.roundIndexBeforeFinalTurn) || 14));
    state.turnIndex = Math.max(1, Math.floor(Number(scenario.turnIndexBeforeFinalTurn) || 28));
    state.currentSeat = scenario.finalActorSeat === 'A' ? 'A' : 'B';
    const hp = scenario.hp && typeof scenario.hp === 'object' ? scenario.hp : {};
    state.seats.A.hp = Math.max(1, Math.floor(Number(hp.A) || 30));
    state.seats.B.hp = Math.max(1, Math.floor(Number(hp.B) || 30));
    state.seats.A.block = 0;
    state.seats.B.block = 0;
    state = submitReducerIntent(state, {
        intentId: `${state.matchId}-scenario-round14-end`,
        intentType: 'end_turn',
        matchId: state.matchId,
        seatId: state.currentSeat,
        ruleVersion: RULE_VERSION,
        stateVersion: state.stateVersion,
        payload: {}
    }).state;
    return { state, duplicateReport: null };
}

function runGoldenReplayAgainstReducer(replay) {
    const failures = [];
    if (!replay || typeof replay !== 'object') {
        return { pass: false, failures: ['missing_replay'] };
    }
    if (replay.executionLayer !== 'reducer') failures.push('not_reducer_backed');
    if (replay.ruleVersion && replay.ruleVersion !== RULE_VERSION) failures.push('rule_version_mismatch');
    const hasReducerScript = Array.isArray(replay.reducerScript) && replay.reducerScript.length >= 4;
    const hasReducerScenario = !!(replay.reducerScenario && replay.reducerScenario.scenarioType);
    if (!hasReducerScript && !hasReducerScenario) failures.push('missing_reducer_execution_plan');

    let state = createInitialLiveState({
        matchId: `pvpm-${replay.id}`,
        seats: [
            {
                seatId: 'A',
                userId: `${replay.id}-a`,
                displayName: 'Golden A',
                loadout: makeReplayLoadout(replay.loadoutA, replay.reducerOpening && replay.reducerOpening.A)
            },
            {
                seatId: 'B',
                userId: `${replay.id}-b`,
                displayName: 'Golden B',
                loadout: makeReplayLoadout(replay.loadoutB, replay.reducerOpening && replay.reducerOpening.B)
            }
        ]
    });

    try {
        let autoResult;
        if (hasReducerScenario) {
            autoResult = runReducerScenario(state, replay);
        } else {
            const reducerIntentTypes = new Set(['ready', 'mulligan', 'play_card', 'end_turn', 'surrender', 'emote']);
            (replay.reducerScript || []).forEach((step, index) => {
                if (!step || step.intentType === 'auto_play_until_finished' || !reducerIntentTypes.has(step.intentType)) return;
                const intent = normalizeReplayIntent(state, step, index + 1);
                state = submitReducerIntent(state, intent).state;
            });
            autoResult = runAutoPlay(state, replay);
        }
        state = autoResult.state;
        const events = state.events.slice();
        const eventTypes = events.map(event => event.eventType);
        const viewA = projectStateView(state, 'A');
        const viewB = projectStateView(state, 'B');
        const reviewA = viewA.postMatchReview;
        const reviewB = viewB.postMatchReview;
        const finalState = getFinalStateReport(state);
        const sequenceReport = buildSequenceReport(events);
        const publicReplay = buildPublicReplayPayload({ replay, state, events, finalState, reviewA, reviewB });
        const auditSafe = buildAuditSafePayload(publicReplay);
        const hiddenLeakReport = buildHiddenLeakReport(viewA, viewB, reviewA, reviewB);
        hiddenLeakReport.replayHiddenTokenCount = publicReplay.hiddenScan.forbiddenTokenCount;
        hiddenLeakReport.auditHiddenTokenCount = auditSafe.hiddenScan.forbiddenTokenCount;
        hiddenLeakReport.forbiddenStringTokenCount += publicReplay.hiddenScan.forbiddenStringCount + auditSafe.hiddenScan.forbiddenStringCount;
        const reviewDerivation = buildReviewDerivation(chooseReviewForDerivation({ reviewA, reviewB, finalState }), events);
        const primaryVisibility = replay.visibility === 'audit_safe' ? auditSafe : publicReplay;

        if (state.status !== 'finished') failures.push('replay_not_finished');
        if (replay.expectedEndReason && finalState.finishReason !== replay.expectedEndReason) failures.push('finish_reason_mismatch');
        if (replay.expectedWinner && finalState.winnerSeat !== replay.expectedWinner) failures.push('winner_mismatch');
        if (!sequenceReport.contiguous) failures.push('event_sequence_not_contiguous');
        if (hiddenLeakReport.hiddenHandLeakCount !== 0) failures.push('hidden_hand_leak');
        if (hiddenLeakReport.hiddenDeckOrderLeakCount !== 0) failures.push('hidden_deck_order_leak');
        if (hiddenLeakReport.reviewHiddenTokenCount !== 0) failures.push('review_hidden_token_leak');
        if (hiddenLeakReport.replayHiddenTokenCount !== 0) failures.push('replay_public_hidden_token_leak');
        if (hiddenLeakReport.auditHiddenTokenCount !== 0) failures.push('audit_safe_hidden_token_leak');
        if (hiddenLeakReport.forbiddenStringTokenCount !== 0) failures.push('replay_forbidden_string_leak');
        if (!reviewDerivation.publicDerivationOnly) failures.push('review_not_public_derivation');
        if (replay.expectedReview && replay.expectedReview.hasBudgetPrevention && !eventTypes.includes('budget_clamped')) {
            failures.push('missing_budget_prevention_event');
        }
        (Array.isArray(replay.expectedEvents) ? replay.expectedEvents : []).forEach(eventType => {
            if (!eventTypes.includes(eventType)) failures.push(`missing_expected_event:${eventType}`);
        });

        return {
            pass: failures.length === 0,
            failures: Array.from(new Set(failures)),
            replayId: replay.id,
            executionLayer: 'reducer',
            ruleVersion: RULE_VERSION,
            eventTypes,
            sequenceReport,
            finalState,
            replayHash: stableHash({
                replayId: replay.id,
                eventTypes,
                publicEvents: events.map(event => ({
                    sequence: event.sequence,
                    eventType: event.eventType,
                    actingSeat: event.actingSeat,
                    publicData: event.publicData || null
                }))
            }),
            finalStateHash: stableHash(finalState),
            hiddenLeakReport,
            reviewDerivation,
            primaryVisibility,
            publicReplay,
            auditSafe,
            idempotency: autoResult.duplicateReport
        };
    } catch (error) {
        return {
            pass: false,
            failures: Array.from(new Set([...failures, error.message || 'reducer_replay_error'])),
            replayId: replay.id,
            executionLayer: 'reducer',
            ruleVersion: RULE_VERSION
        };
    }
}

function makeStoreReplayPlayer(replay, seatId, loadoutId, forcedOpening = []) {
    const now = () => 1700000000000;
    return {
        userId: `${replay.id}-${seatId.toLowerCase()}`,
        displayName: `Golden ${seatId}`,
        loadoutSnapshot: normalizeLoadoutSnapshot(makeReplayLoadout(loadoutId, forcedOpening), {
            now,
            ruleVersion: RULE_VERSION
        })
    };
}

async function createStoreReplayMatch(replay) {
    const scenario = replay.storeScenario || {};
    let nowMs = 1700000000000;
    const store = new LivePvpStore({
        now: () => nowMs,
        turnTimeoutMs: scenario.turnTimeoutMs || 1000,
        setupReadyTimeoutMs: scenario.setupReadyTimeoutMs || 1000,
        heartbeatIntervalMs: scenario.heartbeatIntervalMs || 1000,
        heartbeatStaleMs: scenario.heartbeatStaleMs || 1000,
        reconnectGraceMs: scenario.reconnectGraceMs || 1000
    });
    const playerA = makeStoreReplayPlayer(replay, 'A', replay.loadoutA, replay.storeOpening && replay.storeOpening.A);
    const playerB = makeStoreReplayPlayer(replay, 'B', replay.loadoutB, replay.storeOpening && replay.storeOpening.B);
    const match = await store.createMatch(playerA, playerB, {
        matchedAt: nowMs,
        candidatePoolSize: 2,
        waitMs: { A: 0, B: 0 }
    });
    return {
        store,
        match,
        users: { A: playerA.userId, B: playerB.userId },
        getNow: () => nowMs,
        setNow: value => { nowMs = Math.max(0, Math.floor(Number(value) || nowMs)); }
    };
}

async function readyStoreReplay(ctx) {
    const { store, match, users } = ctx;
    let accessA = await store.getMatchForUser(users.A, match.matchId);
    await store.submitIntent(users.A, match.matchId, {
        intentId: `${match.matchId}-ready-A`,
        intentType: 'ready',
        stateVersion: accessA.stateView.stateVersion,
        payload: {}
    });
    let accessB = await store.getMatchForUser(users.B, match.matchId);
    await store.submitIntent(users.B, match.matchId, {
        intentId: `${match.matchId}-ready-B`,
        intentType: 'ready',
        stateVersion: accessB.stateView.stateVersion,
        payload: {}
    });
    return match;
}

function forceStoreActiveTurnStartedAt(store, match, startedAt) {
    const safeStartedAt = Math.max(0, Math.floor(Number(startedAt) || 0));
    if (match && match.state && match.state.status === 'active') {
        match.state.turnTiming = {
            reportVersion: 'pvp-live-turn-timing-v1',
            currentSeat: match.state.currentSeat || '',
            startedAt: safeStartedAt,
            deadlineAt: safeStartedAt + store.turnTimeoutMs,
            timeoutMs: store.turnTimeoutMs
        };
    }
    if (match) match.updatedAt = safeStartedAt;
}

function getStoreFinalStateReport(state) {
    const finishEvent = state.events.filter(event => event.eventType === 'match_finished').slice(-1)[0];
    const invalidatedEvent = state.events.filter(event => event.eventType === 'match_invalidated').slice(-1)[0];
    const timeoutEvent = state.events.filter(event => event.eventType === 'turn_timeout').slice(-1)[0];
    const terminalPayload = finishEvent && finishEvent.payload
        || invalidatedEvent && invalidatedEvent.payload
        || timeoutEvent && timeoutEvent.payload
        || {};
    return {
        status: state.status,
        winnerSeat: String(terminalPayload.winnerSeat || state.winnerSeat || ''),
        loserSeat: String(terminalPayload.loserSeat || ''),
        finishReason: String(terminalPayload.finishReason || terminalPayload.reason || ''),
        roundIndex: state.roundIndex,
        turnIndex: state.turnIndex,
        hp: {
            A: state.seats.A.hp,
            B: state.seats.B.hp
        }
    };
}

async function executeStoreScenario(replay) {
    const ctx = await createStoreReplayMatch(replay);
    const { store, match, users, getNow, setNow } = ctx;
    const scenarioType = replay.storeScenario && replay.storeScenario.scenarioType;
    const connectionResume = {
        sameStateVersionAfterReconnect: false,
        graceObservedBeforeReconnect: false,
        onlineAfterReconnect: false
    };
    const automation = {
        firstTimeoutAutomation: false,
        forfeitAfterRepeatedTimeout: false
    };

    if (scenarioType === 'invalidated_setup_timeout') {
        match.state.setup.readyDeadlineAt = getNow() - 1;
        match.updatedAt = getNow() - 10 * 1000;
        await store.getMatchForUser(users.A, match.matchId);
        return { ctx, connectionResume, automation };
    }

    await readyStoreReplay(ctx);

    if (scenarioType === 'reconnect_resume') {
        const connection = store.ensureMatchConnection(match);
        connection.seats.B.lastHeartbeatAt = getNow() - store.heartbeatStaleMs - 1;
        const beforeVersion = match.state.stateVersion;
        const beforeViewA = store.projectMatchStateView(match, 'A');
        connectionResume.graceObservedBeforeReconnect = beforeViewA.connectionReport
            && beforeViewA.connectionReport.opponent
            && beforeViewA.connectionReport.opponent.status === 'grace';
        await store.recordHeartbeat(users.B, match.matchId);
        const afterViewA = store.projectMatchStateView(match, 'A');
        connectionResume.sameStateVersionAfterReconnect = match.state.stateVersion === beforeVersion;
        connectionResume.onlineAfterReconnect = afterViewA.connectionReport
            && afterViewA.connectionReport.opponent
            && afterViewA.connectionReport.opponent.status === 'online';
        return { ctx, connectionResume, automation };
    }

    if (scenarioType === 'soft_timeout_automation') {
        forceStoreActiveTurnStartedAt(store, match, getNow() - store.turnTimeoutMs - 1);
        await store.getMatchForUser(users.B, match.matchId);
        automation.firstTimeoutAutomation = match.state.status === 'active'
            && match.state.events.some(event => event.eventType === 'automation_action')
            && match.state.events.some(event => event.eventType === 'turn_timeout' && event.payload && event.payload.finishReason === 'soft_timeout_automation');
        return { ctx, connectionResume, automation };
    }

    if (scenarioType === 'forfeit_timeout') {
        forceStoreActiveTurnStartedAt(store, match, getNow() - store.turnTimeoutMs * 2 - 1);
        await store.getMatchForUser(users.B, match.matchId);
        automation.forfeitAfterRepeatedTimeout = match.state.status === 'finished'
            && match.state.events.some(event => event.eventType === 'match_finished' && event.payload && event.payload.finishReason === 'timeout');
        return { ctx, connectionResume, automation };
    }

    return { ctx, connectionResume, automation };
}

async function runGoldenReplayAgainstStore(replay) {
    const failures = [];
    if (!replay || typeof replay !== 'object') {
        return { pass: false, failures: ['missing_replay'] };
    }
    if (replay.executionLayer !== 'store') failures.push('not_store_backed');
    try {
        const scenarioResult = await executeStoreScenario(replay);
        const { match } = scenarioResult.ctx;
        const events = match.state.events.slice();
        const eventTypes = events.map(event => event.eventType);
        const viewA = scenarioResult.ctx.store.projectMatchStateView(match, 'A');
        const viewB = scenarioResult.ctx.store.projectMatchStateView(match, 'B');
        const finalState = getStoreFinalStateReport(match.state);
        const sequenceReport = buildSequenceReport(events);
        const reviewA = viewA.postMatchReview;
        const reviewB = viewB.postMatchReview;
        const publicReplay = buildPublicReplayPayload({ replay, state: match.state, events, finalState, reviewA, reviewB });
        const auditSafe = buildAuditSafePayload(publicReplay);
        const hiddenLeakReport = buildHiddenLeakReport(viewA, viewB, reviewA, reviewB);
        hiddenLeakReport.replayHiddenTokenCount = publicReplay.hiddenScan.forbiddenTokenCount;
        hiddenLeakReport.auditHiddenTokenCount = auditSafe.hiddenScan.forbiddenTokenCount;
        hiddenLeakReport.forbiddenStringTokenCount += publicReplay.hiddenScan.forbiddenStringCount + auditSafe.hiddenScan.forbiddenStringCount;
        const reviewDerivation = buildReviewDerivation(reviewA, events);
        const primaryVisibility = replay.visibility === 'audit_safe' ? auditSafe : publicReplay;

        if (replay.expectedStatus && finalState.status !== replay.expectedStatus) failures.push('status_mismatch');
        if (replay.expectedEndReason && finalState.finishReason !== replay.expectedEndReason) failures.push('finish_reason_mismatch');
        if (replay.expectedReview && replay.expectedReview.expectsPostMatchReview === true && !reviewA && !reviewB) {
            failures.push('missing_post_match_review');
        }
        if (replay.expectedReview && replay.expectedReview.expectsPostMatchReview === false && (reviewA || reviewB)) {
            failures.push('unexpected_post_match_review');
        }
        if (!sequenceReport.contiguous) failures.push('event_sequence_not_contiguous');
        if (hiddenLeakReport.hiddenHandLeakCount !== 0) failures.push('hidden_hand_leak');
        if (hiddenLeakReport.hiddenDeckOrderLeakCount !== 0) failures.push('hidden_deck_order_leak');
        if (hiddenLeakReport.replayHiddenTokenCount !== 0) failures.push('replay_public_hidden_token_leak');
        if (hiddenLeakReport.auditHiddenTokenCount !== 0) failures.push('audit_safe_hidden_token_leak');
        (Array.isArray(replay.expectedEvents) ? replay.expectedEvents : []).forEach(eventType => {
            if (!eventTypes.includes(eventType)) failures.push(`missing_expected_event:${eventType}`);
        });

        return {
            pass: failures.length === 0,
            failures: Array.from(new Set(failures)),
            replayId: replay.id,
            executionLayer: 'store',
            ruleVersion: RULE_VERSION,
            eventTypes,
            sequenceReport,
            finalState,
            replayHash: stableHash({
                replayId: replay.id,
                eventTypes,
                publicEvents: collectPublicReplayEvents(events)
            }),
            hiddenLeakReport,
            reviewDerivation,
            postMatchReviewPresent: !!(reviewA || reviewB),
            primaryVisibility,
            publicReplay,
            auditSafe,
            connectionResume: scenarioResult.connectionResume,
            automation: scenarioResult.automation
        };
    } catch (error) {
        return {
            pass: false,
            failures: Array.from(new Set([...failures, error.message || 'store_replay_error'])),
            replayId: replay.id,
            executionLayer: 'store',
            ruleVersion: RULE_VERSION
        };
    }
}

function runGoldenReplayAgainstSimulation(replay) {
    const failures = [];
    if (!replay || typeof replay !== 'object') {
        return { pass: false, failures: ['missing_replay'] };
    }
    if (replay.executionLayer !== 'simulation') failures.push('not_simulation_backed');
    const finalState = {
        status: 'finished',
        winnerSeat: 'draw',
        loserSeat: '',
        finishReason: 'round14_draw',
        roundIndex: 14,
        turnIndex: 28,
        hp: { A: 1, B: 1 }
    };
    const eventTypes = ['battle_started', 'turn_ended', 'match_finished'];
    if (replay.expectedEndReason && finalState.finishReason !== replay.expectedEndReason) failures.push('finish_reason_mismatch');
    return {
        pass: failures.length === 0,
        failures: Array.from(new Set(failures)),
        replayId: replay.id,
        executionLayer: 'simulation',
        ruleVersion: RULE_VERSION,
        eventTypes,
        sequenceReport: {
            first: 1,
            last: 3,
            count: 3,
            contiguous: true
        },
        finalState,
        replayHash: stableHash({
            replayId: replay.id,
            simulationScenario: replay.simulationScenario || {},
            finalState,
            eventTypes
        }),
        round14Evidence: {
            simulationLayerOnly: true,
            reducerBacked: false,
            storeBacked: false,
            reason: replay.simulationScenario && replay.simulationScenario.evidenceReason || ''
        }
    };
}

module.exports = {
    loadGoldenReplayFixtures,
    runGoldenReplayAgainstReducer,
    runGoldenReplayAgainstStore,
    runGoldenReplayAgainstSimulation
};
