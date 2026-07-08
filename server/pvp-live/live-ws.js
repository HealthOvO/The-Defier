const crypto = require('crypto');
const { URL } = require('url');
const jwt = require('jsonwebtoken');
const { WebSocket, WebSocketServer } = require('ws');
const { getJwtSecret } = require('../middleware/auth');

const PUBLIC_EVENT_DATA_KEYS = Object.freeze({
    mulligan_completed: ['seatId', 'count'],
    player_ready: ['seatId'],
    battle_started: ['firstSeat', 'roundIndex', 'turnIndex'],
    opening_second_seat_buffer_granted: ['seatId', 'block', 'totalBlock', 'firstSeat', 'source'],
    card_played: ['cost', 'remainingEnergy'],
    turn_ended: ['nextSeat', 'completedTurns', 'roundIndex', 'turnIndex'],
    cards_drawn: ['seatId', 'count', 'handCount', 'deckCount', 'capped'],
    card_cycled: ['seatId', 'count', 'handCount', 'deckCount', 'capped'],
    block_gained: ['block', 'seatId', 'totalBlock'],
    hp_recovered: ['seatId', 'recoveredHp', 'hp', 'maxHp', 'capped'],
    opening_counterplay_granted: ['seatId', 'block', 'totalBlock', 'minimumHp', 'source'],
    opening_protection_triggered: ['protectedSeat', 'minimumHp', 'preventedDamage', 'wouldHaveHp'],
    budget_clamped: ['rawDamage', 'actualDamage', 'preventedDamage', 'targetSeat'],
    damage_applied: ['actualDamage', 'budgetedDamage', 'blockedDamage', 'hpDamage', 'targetSeat', 'targetHp'],
    status_applied: ['statusId', 'label', 'seatId', 'sourceSeat', 'stacks', 'mitigationAmount', 'appliedTurnIndex', 'earliestConsumeTurnIndex', 'expiresAtTurnIndex', 'responseWindow'],
    status_consumed: ['statusId', 'label', 'seatId', 'sourceSeat', 'damageBonus', 'consumedTurnIndex'],
    status_mitigated: ['statusId', 'label', 'seatId', 'sourceSeat', 'mitigatedBySeat', 'mitigatedTurnIndex', 'responseWindow', 'mitigation', 'preventedDamage'],
    player_surrendered: ['loserSeat', 'winnerSeat'],
    match_finished: ['winnerSeat', 'loserSeat', 'finishReason', 'scoreA', 'scoreB', 'scoreDelta', 'scoreThreshold', 'roundIndex'],
    turn_timeout: ['seatId', 'winnerSeat', 'loserSeat', 'finishReason'],
    connection_timeout: ['seatId', 'disconnectedSeats', 'phase', 'elapsedMs'],
    emote_sent: ['seatId', 'emoteId', 'label'],
    ready_timeout: ['unreadySeats', 'readyDeadlineAt', 'elapsedMs'],
    match_invalidated: ['reason'],
    automation_action: ['seatId', 'actionType', 'reason', 'automationCount'],
    test_state_forced: ['targetSeatId', 'fields', 'scope']
});

function makeConnectionId() {
    if (typeof crypto.randomUUID === 'function') return `ws-${crypto.randomUUID()}`;
    return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeInstanceId() {
    if (typeof crypto.randomUUID === 'function') return `pvp-live-ws-${crypto.randomUUID()}`;
    return `pvp-live-ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sendJson(ws, payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload || {}));
    return true;
}

function parseJson(value) {
    try {
        const parsed = JSON.parse(String(value || ''));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        return null;
    }
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

function makePublicEvent(event) {
    const eventType = String(event && event.eventType || '').trim();
    const sequence = Math.max(0, Math.floor(Number(event && event.sequence) || 0));
    if (!eventType || !sequence) return null;
    return {
        eventType,
        sequence,
        actingSeat: event && event.actingSeat ? String(event.actingSeat) : '',
        publicData: sanitizePublicData(eventType, event && event.payload)
    };
}

function makeEventReplay(events, lastSeenRevision) {
    const revision = Math.max(0, Math.floor(Number(lastSeenRevision) || 0));
    return (Array.isArray(events) ? events : [])
        .filter(event => event && event.visibility === 'public')
        .filter(event => Math.max(0, Math.floor(Number(event.sequence) || 0)) > revision)
        .map(makePublicEvent)
        .filter(Boolean);
}

function decodeBase64Url(value) {
    const input = String(value || '').trim();
    if (!input) return '';
    try {
        const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - input.length % 4) % 4);
        return Buffer.from(padded, 'base64').toString('utf8');
    } catch (error) {
        return '';
    }
}

function getTokenFromProtocolHeader(protocolHeader) {
    const header = Array.isArray(protocolHeader) ? protocolHeader.join(',') : String(protocolHeader || '');
    const protocols = header.split(',').map(protocol => protocol.trim()).filter(Boolean);
    const authProtocol = protocols.find(protocol => protocol.startsWith('defier-auth.'));
    if (!authProtocol) return '';
    return decodeBase64Url(authProtocol.slice('defier-auth.'.length));
}

function getTokenFromRequest(request, path) {
    const url = new URL(request.url || '', 'http://127.0.0.1');
    if (url.pathname !== path) return null;
    return getTokenFromProtocolHeader(request.headers && request.headers['sec-websocket-protocol']);
}

function makeConnectedReport(livePvpStore) {
    return {
        reportVersion: 'pvp-live-ws-v1',
        heartbeatIntervalMs: Math.max(1000, Math.floor(Number(livePvpStore && livePvpStore.heartbeatIntervalMs) || 5000))
    };
}

function attachLivePvpWebSocket(server, {
    livePvpStore,
    path = '/api/pvp/live/ws',
    liveWsSignalStore = null,
    liveWsSignalPollIntervalMs = Number(process.env.PVP_LIVE_WS_SIGNAL_POLL_INTERVAL_MS),
    now = () => Date.now()
} = {}) {
    if (!server || !livePvpStore) {
        throw new Error('attachLivePvpWebSocket requires server and livePvpStore');
    }

    const wss = new WebSocketServer({ noServer: true });
    const clients = new Set();
    const instanceId = makeInstanceId();
    const signalStore = liveWsSignalStore || livePvpStore.persistence || null;
    const signalPollIntervalMs = Math.max(25, Math.floor(Number(liveWsSignalPollIntervalMs) || 250));
    const signalDedupWindowMs = Math.max(1000, signalPollIntervalMs * 4);
    let signalCursor = 0;
    let signalPollTimer = null;
    let signalDrainRunning = false;
    let signalPollingClosed = false;
    const recentSignalAppendKeys = new Map();

    function canUseSignalStore() {
        return !!(
            signalStore
            && typeof signalStore.loadLiveWsSignalsSince === 'function'
        );
    }

    function removeClient(client) {
        clients.delete(client);
    }

    function matchClients(matchId) {
        const id = String(matchId || '').trim();
        return Array.from(clients).filter(client => client.matchId === id && client.ws && client.ws.readyState === WebSocket.OPEN);
    }

    async function sendStateSync(client, matchId) {
        const matchAccess = await livePvpStore.getMatchForUser(client.user.id, matchId);
        if (!matchAccess) {
            sendJson(client.ws, {
                type: 'error',
                reason: 'match_not_found',
                message: '实时论道战局不存在'
            });
            return null;
        }
        client.matchId = matchAccess.match.matchId;
        client.seatId = matchAccess.seatId;
        sendJson(client.ws, {
            type: 'state_sync',
            matchId: matchAccess.match.matchId,
            seatId: matchAccess.seatId,
            stateView: matchAccess.stateView,
            serverTime: now()
        });
        return matchAccess;
    }

    async function broadcastState(matchId) {
        await Promise.all(matchClients(matchId).map(client => sendStateSync(client, matchId)));
    }

    function markClientSignalSeen(client, signalId) {
        if (!client) return;
        client.liveWsSignalCursor = Math.max(
            Math.max(0, Math.floor(Number(client.liveWsSignalCursor) || 0)),
            Math.max(0, Math.floor(Number(signalId) || 0))
        );
    }

    async function getLatestLiveWsSignalId() {
        if (!canUseSignalStore() || typeof signalStore.getLiveWsLatestSignalId !== 'function') return signalCursor;
        return Math.max(0, Math.floor(Number(await signalStore.getLiveWsLatestSignalId()) || 0));
    }

    async function snapshotLiveWsSignalCursor() {
        try {
            return await getLatestLiveWsSignalId();
        } catch (error) {
            console.error('[PVP Live WS] signal cursor snapshot failed:', error);
            return signalCursor;
        }
    }

    function syncClientSignalCursor(client, signalId) {
        markClientSignalSeen(client, signalId);
    }

    async function broadcastStateForSignal(matchId, signalId) {
        const recipients = matchClients(matchId).filter(client => (
            Math.max(0, Math.floor(Number(client.liveWsSignalCursor) || 0)) < signalId
        ));
        await Promise.all(recipients.map(client => sendStateSync(client, matchId)));
        recipients.forEach(client => markClientSignalSeen(client, signalId));
    }

    function getSignalId(signal) {
        return Math.max(0, Math.floor(Number(signal && (signal.signalId || signal.id)) || 0));
    }

    function getSignalMatchId(signal) {
        return String(signal && (signal.matchId || signal.match_id) || '').trim();
    }

    function getSignalType(signal) {
        return String(signal && (signal.signalType || signal.signal_type || 'state_sync') || 'state_sync').trim();
    }

    function getSignalSourceInstanceId(signal) {
        return String(signal && (signal.sourceInstanceId || signal.source_instance_id) || '').trim();
    }

    function getResultStateVersion(result) {
        const stateView = result && result.stateView;
        const state = result && result.state;
        return Math.max(0, Math.floor(Number(
            stateView && stateView.stateVersion
            || state && state.stateVersion
            || 0
        ) || 0));
    }

    function pruneRecentSignalAppendKeys(referenceTime) {
        if (recentSignalAppendKeys.size <= 256) return;
        for (const [key, expiresAt] of recentSignalAppendKeys.entries()) {
            if (expiresAt <= referenceTime) {
                recentSignalAppendKeys.delete(key);
            }
        }
    }

    function shouldSkipDuplicateSignal(matchId, stateVersion, reason) {
        if (reason !== 'sync_required' && reason !== 'duplicate_action') return false;
        const key = `${matchId}:${stateVersion}:${reason}`;
        const referenceTime = now();
        pruneRecentSignalAppendKeys(referenceTime);
        const expiresAt = Math.max(0, Math.floor(Number(recentSignalAppendKeys.get(key)) || 0));
        if (expiresAt > referenceTime) return true;
        recentSignalAppendKeys.set(key, referenceTime + signalDedupWindowMs);
        return false;
    }

    async function appendLiveWsSignal(matchId, result, reason) {
        if (!signalStore || typeof signalStore.appendLiveWsSignal !== 'function') return null;
        const stateVersion = getResultStateVersion(result);
        if (shouldSkipDuplicateSignal(matchId, stateVersion, reason)) return null;
        return signalStore.appendLiveWsSignal({
            matchId,
            signalType: 'state_sync',
            stateVersion,
            reason,
            sourceInstanceId: instanceId,
            createdAt: now()
        });
    }

    async function drainLiveWsSignals() {
        if (!canUseSignalStore() || signalDrainRunning || signalPollingClosed) return;
        signalDrainRunning = true;
        try {
            const signals = await signalStore.loadLiveWsSignalsSince(signalCursor, 100);
            for (const signal of Array.isArray(signals) ? signals : []) {
                const signalId = getSignalId(signal);
                if (signalId > signalCursor) signalCursor = signalId;
                if (getSignalType(signal) !== 'state_sync') continue;
                if (getSignalSourceInstanceId(signal) === instanceId) continue;
                const matchId = getSignalMatchId(signal);
                if (!matchId || matchClients(matchId).length === 0) continue;
                await broadcastStateForSignal(matchId, signalId);
            }
        } catch (error) {
            console.error('[PVP Live WS] signal drain failed:', error);
        } finally {
            signalDrainRunning = false;
        }
    }

    async function initializeSignalCursor() {
        if (!canUseSignalStore() || typeof signalStore.getLiveWsLatestSignalId !== 'function') return;
        const latestSignalId = await getLatestLiveWsSignalId();
        if (clients.size === 0) {
            signalCursor = latestSignalId;
        }
    }

    function startLiveWsSignalPolling() {
        if (!canUseSignalStore()) return;
        Promise.resolve(initializeSignalCursor())
            .catch((error) => {
                console.error('[PVP Live WS] signal cursor init failed:', error);
            })
            .finally(() => {
                if (signalPollingClosed || signalPollTimer) return;
                signalPollTimer = setInterval(drainLiveWsSignals, signalPollIntervalMs);
                if (typeof signalPollTimer.unref === 'function') signalPollTimer.unref();
            });
    }

    function closeLiveWsSignalPolling() {
        signalPollingClosed = true;
        if (signalPollTimer) {
            clearInterval(signalPollTimer);
            signalPollTimer = null;
        }
    }

    async function sendEventsReplay(client, matchAccess, lastSeenRevision) {
        const matchId = matchAccess && matchAccess.match && matchAccess.match.matchId || client.matchId;
        const persistedEvents = typeof livePvpStore.loadMatchEvents === 'function'
            ? await livePvpStore.loadMatchEvents(matchId)
            : [];
        const sourceEvents = persistedEvents.length > 0
            ? persistedEvents
            : matchAccess && matchAccess.match && matchAccess.match.state && matchAccess.match.state.events || [];
        sendJson(client.ws, {
            type: 'events_replay',
            matchId,
            fromRevision: Math.max(0, Math.floor(Number(lastSeenRevision) || 0)),
            events: makeEventReplay(sourceEvents, lastSeenRevision),
            serverTime: now()
        });
    }

    async function handleJoinMatch(client, message) {
        const matchId = String(message && message.matchId || '').trim();
        if (!matchId) {
            sendJson(client.ws, { type: 'error', reason: 'missing_match_id', message: '缺少实时论道战局' });
            return;
        }
        const joinSignalCursor = await snapshotLiveWsSignalCursor();
        const matchAccess = await sendStateSync(client, matchId);
        if (matchAccess) {
            await sendEventsReplay(client, matchAccess, message.lastSeenRevision);
            syncClientSignalCursor(client, joinSignalCursor);
        }
    }

    async function handleHeartbeat(client, message) {
        const matchId = String(message && message.matchId || client.matchId || '').trim();
        if (!matchId || typeof livePvpStore.recordHeartbeat !== 'function') {
            sendJson(client.ws, { type: 'error', reason: 'missing_match_id', message: '缺少实时论道战局' });
            return;
        }
        const matchAccess = await livePvpStore.recordHeartbeat(client.user.id, matchId);
        if (!matchAccess) {
            sendJson(client.ws, { type: 'error', reason: 'match_not_found', message: '实时论道战局不存在' });
            return;
        }
        client.matchId = matchAccess.match.matchId;
        client.seatId = matchAccess.seatId;
        sendJson(client.ws, {
            type: 'presence',
            matchId: matchAccess.match.matchId,
            seatId: matchAccess.seatId,
            connectionReport: matchAccess.stateView && matchAccess.stateView.connectionReport || null,
            connectionTempoReport: matchAccess.stateView && matchAccess.stateView.connectionTempoReport || null,
            serverTime: now()
        });
        if (Object.prototype.hasOwnProperty.call(message || {}, 'lastSeenRevision')) {
            await sendEventsReplay(client, matchAccess, message.lastSeenRevision);
        }
        await broadcastState(matchAccess.match.matchId);
    }

    async function handleIntent(client, message) {
        const matchId = String(message && message.matchId || client.matchId || '').trim();
        const intent = message && message.intent && typeof message.intent === 'object' ? message.intent : {};
        if (!matchId || typeof livePvpStore.submitIntent !== 'function') {
            sendJson(client.ws, { type: 'error', reason: 'missing_match_id', message: '缺少实时论道战局' });
            return;
        }
        const result = await livePvpStore.submitIntent(client.user.id, matchId, intent, {
            liveWsSourceInstanceId: instanceId
        });
        if (!result) {
            sendJson(client.ws, { type: 'error', reason: 'match_not_found', message: '实时论道战局不存在' });
            return;
        }
        sendJson(client.ws, {
            type: 'intent_result',
            matchId,
            intentId: String(intent.intentId || ''),
            result: result.result,
            reason: result.reason,
            events: Array.isArray(result.events) ? makeEventReplay(result.events, 0) : [],
            stateView: result.stateView,
            serverTime: now()
        });
        const shouldFanoutState = result.result === 'accepted'
            || (result.result === 'sync_required' && result.stateView)
            || (result.result === 'duplicate' && result.reason === 'duplicate_action' && result.stateView);
        if (shouldFanoutState) {
            const signalReason = result.result === 'sync_required'
                ? 'sync_required'
                : result.result === 'duplicate' ? 'duplicate_action' : 'intent_accepted';
            const signalAlreadyAppended = !!(result.saveResult && result.saveResult.liveWsSignalAppended);
            if (result.result !== 'accepted' || !signalAlreadyAppended) {
                await appendLiveWsSignal(matchId, result, signalReason);
            }
            await broadcastState(matchId);
        }
    }

    async function handleMessage(client, data) {
        const message = parseJson(data);
        if (!message || !message.type) {
            sendJson(client.ws, { type: 'error', reason: 'invalid_message', message: '实时论道 WS 消息格式错误' });
            return;
        }
        if (message.type === 'join_match') {
            await handleJoinMatch(client, message);
        } else if (message.type === 'heartbeat') {
            await handleHeartbeat(client, message);
        } else if (message.type === 'intent') {
            await handleIntent(client, message);
        } else {
            sendJson(client.ws, { type: 'error', reason: 'unsupported_message', message: '不支持的实时论道 WS 消息' });
        }
    }

    server.on('upgrade', (request, socket, head) => {
        const token = getTokenFromRequest(request, path);
        if (token === null) return;
        let user = null;
        try {
            user = jwt.verify(token, getJwtSecret());
        } catch (error) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request, user);
        });
    });

    wss.on('connection', (ws, request, user) => {
        const client = {
            ws,
            user,
            connectionId: makeConnectionId(),
            matchId: '',
            seatId: '',
            liveWsSignalCursor: 0
        };
        clients.add(client);
        sendJson(ws, {
            type: 'connected',
            connectionId: client.connectionId,
            serverTime: now(),
            connectionReport: makeConnectedReport(livePvpStore)
        });
        ws.on('message', (data) => {
            Promise.resolve(handleMessage(client, data)).catch((error) => {
                console.error('[PVP Live WS] message failed:', error);
                sendJson(ws, { type: 'error', reason: 'ws_message_failed', message: '实时论道 WS 处理失败' });
            });
        });
        ws.on('close', () => removeClient(client));
        ws.on('error', () => removeClient(client));
    });

    server.on('close', closeLiveWsSignalPolling);
    wss.on('close', closeLiveWsSignalPolling);
    startLiveWsSignalPolling();

    return {
        wss,
        close: () => new Promise(resolve => {
            closeLiveWsSignalPolling();
            wss.close(resolve);
        }),
        getClientCount: () => clients.size
    };
}

module.exports = {
    attachLivePvpWebSocket,
    makeEventReplay
};
