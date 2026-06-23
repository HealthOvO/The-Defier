const { db } = require('../db/database');

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
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

function serializeState(state) {
    return JSON.stringify(state || {});
}

function serializeSnapshot(snapshot) {
    return JSON.stringify(snapshot || {});
}

function serializeQueueConnectionHealth(report) {
    return JSON.stringify(report && typeof report === 'object' ? report : {});
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

function normalizeRatingScore(value) {
    const numeric = Number(value);
    return Math.max(0, Math.min(9999, Math.floor(Number.isFinite(numeric) ? numeric : 1000)));
}

function makeRatingBucket(score) {
    const safeScore = normalizeRatingScore(score);
    const floor = Math.floor(safeScore / 100) * 100;
    return `${floor}_${floor + 99}`;
}

function normalizeRatingSnapshot(snapshot = {}) {
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const score = normalizeRatingScore(source.score);
    const rankedGamesSource = source.rankedGames ?? source.ranked_games;
    return {
        score,
        bucket: String(source.bucket || makeRatingBucket(score)).slice(0, 24),
        seasonId: String(source.seasonId || source.season_id || 's1-genesis').slice(0, 40),
        provisional: source.provisional !== false,
        rankedGames: Math.max(0, Math.floor(Number(rankedGamesSource) || 0))
    };
}

function serializeConnection(connection) {
    return JSON.stringify(connection || {});
}

function makeConnectionTimestampSql(jsonExpression, jsonPath) {
    return `CAST(COALESCE(json_extract(${jsonExpression}, '${jsonPath}'), 0) AS INTEGER)`;
}

function makeConnectionTimelineMaxSql(currentJsonExpression, incomingJsonExpression) {
    const currentJson = `COALESCE(NULLIF(${currentJsonExpression}, ''), '{}')`;
    const incomingJson = `COALESCE(NULLIF(${incomingJsonExpression}, ''), '{}')`;
    let mergedJson = `json_patch(${currentJson}, ${incomingJson})`;
    ['A', 'B'].forEach(seatId => {
        ['connectedAt', 'lastHeartbeatAt', 'reconnectedAt'].forEach(field => {
            const jsonPath = `$.seats.${seatId}.${field}`;
            mergedJson = `json_set(${mergedJson}, '${jsonPath}', MAX(${makeConnectionTimestampSql(currentJson, jsonPath)}, ${makeConnectionTimestampSql(incomingJson, jsonPath)}))`;
        });
    });
    return mergedJson;
}

const ACTIVE_CONNECTION_TIMELINE_SQL = makeConnectionTimelineMaxSql(
    'pvp_live_matches.connection_json',
    'excluded.connection_json'
);

function getStateVersion(state) {
    return Math.max(0, Math.floor(Number(state && state.stateVersion) || 0));
}

function makeLiveWsSignalFromRow(row) {
    if (!row || !row.match_id) return null;
    const signalId = Math.max(0, Math.floor(Number(row.signal_id) || 0));
    if (!signalId) return null;
    return {
        signalId,
        id: signalId,
        matchId: String(row.match_id),
        signalType: String(row.signal_type || 'state_sync'),
        stateVersion: Math.max(0, Math.floor(Number(row.state_version) || 0)),
        reason: String(row.reason || 'match_saved'),
        sourceInstanceId: String(row.source_instance_id || ''),
        createdAt: Math.max(0, Math.floor(Number(row.created_at) || 0))
    };
}

async function appendLiveWsSignalRow({
    matchId,
    signalType = 'state_sync',
    stateVersion = 0,
    reason = 'match_saved',
    sourceInstanceId = '',
    createdAt = Date.now()
} = {}) {
    const id = String(matchId || '').trim();
    if (!id) return null;
    const safeSignalType = String(signalType || 'state_sync').trim().slice(0, 40) || 'state_sync';
    const safeStateVersion = Math.max(0, Math.floor(Number(stateVersion) || 0));
    const safeReason = String(reason || 'match_saved').trim().slice(0, 64) || 'match_saved';
    const safeSourceInstanceId = String(sourceInstanceId || '').trim().slice(0, 96);
    const safeCreatedAt = Math.max(0, Math.floor(Number(createdAt) || Date.now()));
    const shouldDedupeSignal = safeReason === 'sync_required' || safeReason === 'duplicate_action';
    if (shouldDedupeSignal) {
        const result = await dbRun(
            `INSERT INTO pvp_live_state_signals
                (match_id, signal_type, state_version, reason, source_instance_id, created_at)
             SELECT ?, ?, ?, ?, ?, ?
              WHERE NOT EXISTS (
                    SELECT 1
                      FROM pvp_live_state_signals
                     WHERE match_id = ?
                       AND signal_type = ?
                       AND state_version = ?
                       AND reason = ?
                     LIMIT 1
              )`,
            [
                id,
                safeSignalType,
                safeStateVersion,
                safeReason,
                safeSourceInstanceId,
                safeCreatedAt,
                id,
                safeSignalType,
                safeStateVersion,
                safeReason
            ]
        );
        if (!result || result.changes === 0) return null;
        const signalId = Math.max(0, Math.floor(Number(result.lastID) || 0));
        return {
            signalId,
            id: signalId,
            matchId: id,
            signalType: safeSignalType,
            stateVersion: safeStateVersion,
            reason: safeReason,
            sourceInstanceId: safeSourceInstanceId,
            createdAt: safeCreatedAt
        };
    }
    const result = await dbRun(
        `INSERT INTO pvp_live_state_signals
            (match_id, signal_type, state_version, reason, source_instance_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            id,
            safeSignalType,
            safeStateVersion,
            safeReason,
            safeSourceInstanceId,
            safeCreatedAt
        ]
    );
    const signalId = Math.max(0, Math.floor(Number(result && result.lastID) || 0));
    return {
        signalId,
        id: signalId,
        matchId: id,
        signalType: safeSignalType,
        stateVersion: safeStateVersion,
        reason: safeReason,
        sourceInstanceId: safeSourceInstanceId,
        createdAt: safeCreatedAt
    };
}

async function loadPersistedMatchStateSnapshot(matchId) {
    const id = String(matchId || '').trim();
    if (!id) return null;
    const row = await dbGet(
        'SELECT state_version, state_json FROM pvp_live_matches WHERE match_id = ? LIMIT 1',
        [id]
    );
    if (!row) return null;
    return {
        stateVersion: Math.max(
            Math.max(0, Math.floor(Number(row.state_version) || 0)),
            getStateVersion(parseState(row))
        ),
        stateJson: String(row.state_json || '')
    };
}

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

function normalizeEvent(event, fallbackMatchId = '') {
    const source = event && typeof event === 'object' ? event : {};
    const sequence = Math.max(0, Math.floor(Number(source.sequence) || 0));
    const matchId = String(source.matchId || fallbackMatchId || '').trim();
    const eventType = String(source.eventType || '').trim();
    const eventId = String(source.eventId || (matchId && sequence ? `${matchId}-evt-${sequence}` : '')).trim();
    if (!matchId || !eventId || !sequence || !eventType) return null;
    return {
        eventId,
        sequence,
        eventType,
        matchId,
        actingSeat: source.actingSeat === null || source.actingSeat === undefined ? null : String(source.actingSeat),
        visibility: String(source.visibility || 'public').trim() || 'public',
        payload: source.payload && typeof source.payload === 'object' && !Array.isArray(source.payload)
            ? source.payload
            : {}
    };
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

function parseEventJson(value) {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        return null;
    }
}

function makeEventFromRow(row) {
    if (!row || !row.match_id) return null;
    const parsed = normalizeEvent(parseEventJson(row.event_json), row.match_id);
    if (parsed) return parsed;
    return normalizeEvent({
        matchId: row.match_id,
        eventId: row.event_id,
        sequence: row.event_sequence,
        eventType: row.event_type,
        actingSeat: row.acting_seat || null,
        visibility: row.visibility || 'public',
        payload: parseEventJson(row.public_data_json) || {}
    }, row.match_id);
}

function serializeRematchPlayers(playersByUserId) {
    const entries = [];
    if (playersByUserId && typeof playersByUserId.forEach === 'function') {
        playersByUserId.forEach((player, userId) => {
            if (!player || !userId || !player.loadoutSnapshot) return;
            entries.push({
                userId: String(userId),
                displayName: String(player.displayName || userId),
                loadoutSnapshot: player.loadoutSnapshot
            });
        });
    }
    return JSON.stringify(entries);
}

function parseState(row) {
    if (!row || !row.state_json) return null;
    try {
        return JSON.parse(row.state_json);
    } catch (error) {
        return null;
    }
}

function parseConnection(row) {
    if (!row || !row.connection_json) return null;
    try {
        const parsed = JSON.parse(row.connection_json);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (error) {
        return null;
    }
}

function makeMatchFromRow(row) {
    const state = parseState(row);
    if (!state || !state.matchId) return null;
    return {
        matchId: row.match_id,
        createdAt: Number(row.created_at) || 0,
        updatedAt: Number(row.updated_at) || 0,
        state,
        connection: parseConnection(row),
        seatsByUserId: {
            [row.seat_a_user_id]: 'A',
            [row.seat_b_user_id]: 'B'
        }
    };
}

function parseSnapshot(row) {
    if (!row || !row.loadout_snapshot_json) return null;
    try {
        return JSON.parse(row.loadout_snapshot_json);
    } catch (error) {
        return null;
    }
}

function parseQueueConnectionHealth(row) {
    if (!row || !row.connection_health_json) return null;
    try {
        const parsed = JSON.parse(row.connection_health_json);
        return parsed && typeof parsed === 'object' && parsed.reportVersion === 'pvp-live-queue-connection-health-v1'
            ? parsed
            : null;
    } catch (error) {
        return null;
    }
}

function makeQueueEntryFromRow(row) {
    const loadoutSnapshot = parseSnapshot(row);
    if (!row || !row.queue_ticket || !row.user_id || !loadoutSnapshot || !loadoutSnapshot.loadoutHash) return null;
    const ratingSnapshot = normalizeRatingSnapshot({
        score: row.rating_score,
        bucket: row.rating_bucket,
        seasonId: row.rating_season_id,
        provisional: Number(row.rating_provisional) !== 0,
        rankedGames: row.rating_ranked_games
    });
    return {
        queueTicket: row.queue_ticket,
        player: {
            userId: row.user_id,
            displayName: row.display_name || row.user_id,
            loadoutSnapshot,
            connectionHealth: parseQueueConnectionHealth(row) || undefined
        },
        ratingSnapshot,
        wideMatchConsent: Number(row.wide_match_consent) === 1,
        createdAt: Number(row.created_at) || 0
    };
}

function makeQueueHandoffFromRow(row) {
    if (!row || !row.queue_ticket || !row.user_id || !row.match_id) return null;
    return {
        queueTicket: String(row.queue_ticket),
        userId: String(row.user_id),
        matchId: String(row.match_id),
        createdAt: Math.max(0, Math.floor(Number(row.created_at) || 0))
    };
}

function makeRematchRequestFromRow(row) {
    if (!row || !row.source_match_id || !row.series_id || !row.players_json) return null;
    let players = [];
    try {
        const parsed = JSON.parse(row.players_json);
        players = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return null;
    }
    const playersByUserId = new Map();
    players.forEach(player => {
        if (!player || !player.userId || !player.loadoutSnapshot || !player.loadoutSnapshot.loadoutHash) return;
        playersByUserId.set(String(player.userId), {
            userId: String(player.userId),
            displayName: String(player.displayName || player.userId),
            loadoutSnapshot: player.loadoutSnapshot
        });
    });
    if (playersByUserId.size === 0) return null;
    return {
        sourceMatchId: row.source_match_id,
        seriesId: row.series_id,
        createdAt: Math.max(0, Math.floor(Number(row.created_at) || 0)),
        playersByUserId
    };
}

function makeInviteRoomFromRow(row) {
    const loadoutSnapshot = parseSnapshot({
        loadout_snapshot_json: row && row.host_loadout_snapshot_json
    });
    if (!row || !row.invite_code || !row.host_user_id || !loadoutSnapshot || !loadoutSnapshot.loadoutHash) return null;
    return {
        inviteCode: String(row.invite_code),
        host: {
            userId: String(row.host_user_id),
            displayName: String(row.host_display_name || row.host_user_id),
            loadoutSnapshot
        },
        target: row.target_user_id ? {
            userId: String(row.target_user_id),
            displayName: String(row.target_user_name || row.target_user_id)
        } : null,
        createdAt: Math.max(0, Math.floor(Number(row.created_at) || 0))
    };
}

function makeRecentOpponentPairFromRow(row) {
    if (!row || !row.pair_key || !row.user_id_a || !row.user_id_b) return null;
    const normalized = normalizeRecentOpponentPair({
        userIdA: row.user_id_a,
        userIdB: row.user_id_b,
        lastMatchId: row.last_match_id,
        lastMatchedAt: row.last_matched_at
    });
    if (!normalized || normalized.pairKey !== row.pair_key) return null;
    return normalized;
}

function makeAvoidedOpponentPairFromRow(row) {
    if (!row || !row.avoider_user_id || !row.avoided_user_id) return null;
    return normalizeAvoidedOpponentPair({
        avoiderUserId: row.avoider_user_id,
        avoidedUserId: row.avoided_user_id,
        sourceMatchId: row.source_match_id,
        reason: row.reason,
        message: row.message,
        avoidedAt: row.avoided_at,
        expiresAt: row.avoid_until
    });
}

function makeMatchmakingGuardProfileFromRow(row) {
    if (!row || !row.user_id) return null;
    return normalizeMatchmakingGuardProfile({
        userId: row.user_id,
        cooldownUntil: row.cooldown_until,
        cooldownSource: row.cooldown_source,
        cancelWindowStartedAt: row.cancel_window_started_at,
        cancelCount: row.cancel_count
    });
}

function makeSqliteLivePvpPersistence() {
    return {
        async saveQueueEntry(queueEntry) {
            if (!queueEntry || !queueEntry.queueTicket || !queueEntry.player || !queueEntry.player.userId || !queueEntry.player.loadoutSnapshot) return;
            const createdAt = Math.max(0, Math.floor(Number(queueEntry.createdAt) || Date.now()));
            const ratingSnapshot = normalizeRatingSnapshot(queueEntry.ratingSnapshot);
            const wideMatchConsent = queueEntry.wideMatchConsent === true ? 1 : 0;
            const connectionHealthJson = serializeQueueConnectionHealth(queueEntry.player.connectionHealth);
            await dbRun(
                `INSERT INTO pvp_live_queue_tickets
                    (queue_ticket, user_id, display_name, loadout_snapshot_json, rating_score, rating_bucket, rating_season_id, rating_provisional, rating_ranked_games, wide_match_consent, connection_health_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id) DO UPDATE SET
                    queue_ticket = excluded.queue_ticket,
                    display_name = excluded.display_name,
                    loadout_snapshot_json = excluded.loadout_snapshot_json,
                    rating_score = excluded.rating_score,
                    rating_bucket = excluded.rating_bucket,
                    rating_season_id = excluded.rating_season_id,
                    rating_provisional = excluded.rating_provisional,
                    rating_ranked_games = excluded.rating_ranked_games,
                    wide_match_consent = excluded.wide_match_consent,
                    connection_health_json = excluded.connection_health_json,
                    created_at = excluded.created_at`,
                [
                    queueEntry.queueTicket,
                    queueEntry.player.userId,
                    queueEntry.player.displayName || queueEntry.player.userId,
                    serializeSnapshot(queueEntry.player.loadoutSnapshot),
                    ratingSnapshot.score,
                    ratingSnapshot.bucket,
                    ratingSnapshot.seasonId,
                    ratingSnapshot.provisional ? 1 : 0,
                    ratingSnapshot.rankedGames,
                    wideMatchConsent,
                    connectionHealthJson,
                    createdAt
                ]
            );
        },
        async deleteQueueEntry(queueTicket) {
            const ticket = String(queueTicket || '').trim();
            if (!ticket) return;
            await dbRun('DELETE FROM pvp_live_queue_tickets WHERE queue_ticket = ?', [ticket]);
        },
        async claimQueueEntry(queueTicket, userId) {
            const ticket = String(queueTicket || '').trim();
            const id = String(userId || '').trim();
            if (!ticket || !id) return { claimed: false };
            const result = await dbRun(
                'DELETE FROM pvp_live_queue_tickets WHERE queue_ticket = ? AND user_id = ?',
                [ticket, id]
            );
            return { claimed: !!(result && result.changes > 0) };
        },
        async claimQueueEntries(queueClaims) {
            const claims = (Array.isArray(queueClaims) ? queueClaims : []).map(claim => ({
                queueTicket: String(claim && claim.queueTicket || '').trim(),
                userId: String(claim && claim.userId || '').trim()
            }));
            if (claims.length === 0 || claims.some(claim => !claim.queueTicket || !claim.userId)) {
                return { claimed: false, claimedCount: 0 };
            }
            const uniqueTickets = new Set(claims.map(claim => claim.queueTicket));
            if (uniqueTickets.size !== claims.length) return { claimed: false, claimedCount: 0 };
            const valuesSql = claims.map(() => '(?, ?)').join(', ');
            const claimParams = claims.flatMap(claim => [claim.queueTicket, claim.userId]);
            const result = await dbRun(
                `WITH requested(queue_ticket, user_id) AS (VALUES ${valuesSql}),
                    claimable AS MATERIALIZED (
                        SELECT q.queue_ticket
                          FROM pvp_live_queue_tickets q
                          JOIN requested r
                            ON q.queue_ticket = r.queue_ticket
                           AND q.user_id = r.user_id
                    ),
                    claim_count AS MATERIALIZED (
                        SELECT COUNT(*) AS total FROM claimable
                    )
                 DELETE FROM pvp_live_queue_tickets
                  WHERE queue_ticket IN (SELECT queue_ticket FROM claimable)
                    AND (SELECT total FROM claim_count) = ?`,
                [...claimParams, claims.length]
            );
            const claimedCount = Math.max(0, Math.floor(Number(result && result.changes) || 0));
            return { claimed: claimedCount === claims.length, claimedCount };
        },
        async deleteQueueEntryForUser(userId) {
            const id = String(userId || '').trim();
            if (!id) return;
            await dbRun('DELETE FROM pvp_live_queue_tickets WHERE user_id = ?', [id]);
        },
        async saveQueueHandoff(handoff) {
            if (!handoff || !handoff.queueTicket || !handoff.userId || !handoff.matchId) return;
            await dbRun(
                `INSERT INTO pvp_live_queue_handoffs
                    (queue_ticket, user_id, match_id, created_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(queue_ticket) DO UPDATE SET
                    user_id = excluded.user_id,
                    match_id = excluded.match_id,
                    created_at = excluded.created_at`,
                [
                    String(handoff.queueTicket),
                    String(handoff.userId),
                    String(handoff.matchId),
                    Math.max(0, Math.floor(Number(handoff.createdAt) || Date.now()))
                ]
            );
        },
        async loadQueueHandoff(queueTicket, userId) {
            const ticket = String(queueTicket || '').trim();
            const id = String(userId || '').trim();
            if (!ticket || !id) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_queue_handoffs
                 WHERE queue_ticket = ?
                   AND user_id = ?
                 LIMIT 1`,
                [ticket, id]
            );
            return makeQueueHandoffFromRow(row);
        },
        async loadQueueEntryByTicket(queueTicket) {
            const ticket = String(queueTicket || '').trim();
            if (!ticket) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_queue_tickets
                 WHERE queue_ticket = ?
                 LIMIT 1`,
                [ticket]
            );
            return makeQueueEntryFromRow(row);
        },
        async loadQueueEntryForUser(userId) {
            const id = String(userId || '').trim();
            if (!id) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_queue_tickets
                 WHERE user_id = ?
                 ORDER BY created_at ASC
                 LIMIT 1`,
                [id]
            );
            return makeQueueEntryFromRow(row);
        },
        async loadOldestQueueEntryExceptUser(userId) {
            const id = String(userId || '').trim();
            if (!id) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_queue_tickets
                 WHERE user_id != ?
                 ORDER BY created_at ASC
                 LIMIT 1`,
                [id]
            );
            return makeQueueEntryFromRow(row);
        },
        async loadQueueEntriesExceptUser(userId) {
            const id = String(userId || '').trim();
            if (!id) return [];
            const rows = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM pvp_live_queue_tickets
                     WHERE user_id != ?
                     ORDER BY created_at ASC`,
                    [id],
                    (err, resultRows) => {
                        if (err) reject(err);
                        else resolve(Array.isArray(resultRows) ? resultRows : []);
                    }
                );
            });
            return rows.map(makeQueueEntryFromRow).filter(Boolean);
        },
        async saveRecentOpponentPair(pair) {
            const normalized = normalizeRecentOpponentPair(pair);
            if (!normalized || !normalized.lastMatchedAt) return;
            const now = Date.now();
            await dbRun(
                `INSERT INTO pvp_live_recent_opponents
                    (pair_key, user_id_a, user_id_b, last_match_id, last_matched_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(pair_key) DO UPDATE SET
                    last_match_id = excluded.last_match_id,
                    last_matched_at = excluded.last_matched_at,
                    updated_at = excluded.updated_at`,
                [
                    normalized.pairKey,
                    normalized.userIdA,
                    normalized.userIdB,
                    normalized.lastMatchId,
                    normalized.lastMatchedAt,
                    now
                ]
            );
        },
        async loadRecentOpponentPair(userIdA, userIdB) {
            const pairKey = makeRecentOpponentPairKey(userIdA, userIdB);
            if (!pairKey) return null;
            const row = await dbGet(
                `SELECT *
                 FROM pvp_live_recent_opponents
                 WHERE pair_key = ?
                 LIMIT 1`,
                [pairKey]
            );
            return makeRecentOpponentPairFromRow(row);
        },
        async saveAvoidedOpponentPair(pair) {
            const normalized = normalizeAvoidedOpponentPair(pair);
            if (!normalized || !normalized.expiresAt) return;
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
                    normalized.avoiderUserId,
                    normalized.avoidedUserId,
                    normalized.pairKey,
                    normalized.sourceMatchId,
                    normalized.reason,
                    normalized.message,
                    normalized.avoidedAt,
                    normalized.expiresAt,
                    now
                ]
            );
        },
        async loadAvoidedOpponentPair(userIdA, userIdB) {
            const pairKey = makeRecentOpponentPairKey(userIdA, userIdB);
            if (!pairKey) return null;
            const row = await dbGet(
                `SELECT *
                 FROM pvp_live_avoid_opponents
                 WHERE pair_key = ?
                 ORDER BY avoid_until DESC
                 LIMIT 1`,
                [pairKey]
            );
            return makeAvoidedOpponentPairFromRow(row);
        },
        async saveMatchmakingGuard(profile) {
            const normalized = normalizeMatchmakingGuardProfile(profile);
            if (!normalized) return;
            await dbRun(
                `INSERT INTO pvp_live_matchmaking_guards
                    (user_id, cooldown_until, cooldown_source, cancel_window_started_at, cancel_count, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(user_id) DO UPDATE SET
                    cooldown_until = excluded.cooldown_until,
                    cooldown_source = excluded.cooldown_source,
                    cancel_window_started_at = excluded.cancel_window_started_at,
                    cancel_count = excluded.cancel_count,
                    updated_at = excluded.updated_at`,
                [
                    normalized.userId,
                    normalized.cooldownUntil,
                    normalized.cooldownSource,
                    normalized.cancelWindowStartedAt,
                    normalized.cancelCount,
                    Date.now()
                ]
            );
        },
        async loadMatchmakingGuard(userId) {
            const id = String(userId || '').trim();
            if (!id) return null;
            const row = await dbGet(
                `SELECT *
                 FROM pvp_live_matchmaking_guards
                 WHERE user_id = ?
                 LIMIT 1`,
                [id]
            );
            return makeMatchmakingGuardProfileFromRow(row);
        },
        async saveMatch(match, { liveWsSourceInstanceId = '', forceConnectionSnapshot = false } = {}) {
            if (!match || !match.state || !match.matchId || !match.state.seats) return { saved: false, skipped: true, reason: 'invalid_match' };
            const seatA = match.state.seats.A;
            const seatB = match.state.seats.B;
            if (!seatA || !seatB || !seatA.userId || !seatB.userId) return { saved: false, skipped: true, reason: 'invalid_seats' };
            const status = String(match.state.status || 'active');
            const stateVersion = getStateVersion(match.state);
            const serializedState = serializeState(match.state);
            const persistedState = await loadPersistedMatchStateSnapshot(match.matchId);
            const persistedStateVersion = persistedState ? persistedState.stateVersion : null;
            if (persistedStateVersion !== null && stateVersion < persistedStateVersion) {
                return {
                    saved: false,
                    skipped: true,
                    reason: 'stale_state_version',
                    stateVersion,
                    persistedStateVersion
                };
            }
            if (
                status === 'active'
                && persistedState
                && stateVersion === persistedStateVersion
                && persistedState.stateJson
                && persistedState.stateJson !== serializedState
            ) {
                return {
                    saved: false,
                    skipped: true,
                    reason: 'conflicting_state_version',
                    stateVersion,
                    persistedStateVersion
                };
            }
            const now = Math.max(0, Math.floor(Number(match.updatedAt) || Date.now()));
            const createdAt = Math.max(0, Math.floor(Number(match.createdAt) || now));
            const finishedAt = status === 'finished' || status === 'invalidated' ? now : 0;
            const connectionAssignmentSql = forceConnectionSnapshot
                ? 'excluded.connection_json'
                : `CASE
                        WHEN pvp_live_matches.status = 'active' AND excluded.status = 'active'
                        THEN ${ACTIVE_CONNECTION_TIMELINE_SQL}
                        ELSE excluded.connection_json
                    END`;
            const writeResult = await dbRun(
                `INSERT INTO pvp_live_matches
                    (match_id, status, seat_a_user_id, seat_b_user_id, state_version, state_json, connection_json, created_at, updated_at, finished_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(match_id) DO UPDATE SET
                    status = excluded.status,
                    seat_a_user_id = excluded.seat_a_user_id,
                    seat_b_user_id = excluded.seat_b_user_id,
                    state_version = excluded.state_version,
                    state_json = excluded.state_json,
                    connection_json = ${connectionAssignmentSql},
                    updated_at = excluded.updated_at,
                    finished_at = excluded.finished_at
                 WHERE
                    excluded.state_version > pvp_live_matches.state_version
                    OR pvp_live_matches.status != 'active'
                    OR excluded.status != 'active'
                    OR (
                        excluded.state_version = pvp_live_matches.state_version
                        AND pvp_live_matches.state_json = excluded.state_json
                    )`,
                [
                    match.matchId,
                    status,
                    seatA.userId,
                    seatB.userId,
                    stateVersion,
                    serializedState,
                    serializeConnection(match.connection),
                    createdAt,
                    now,
                    finishedAt
                ]
            );
            if (writeResult && writeResult.changes === 0) {
                const latestPersistedState = await loadPersistedMatchStateSnapshot(match.matchId);
                const latestPersistedStateVersion = latestPersistedState ? latestPersistedState.stateVersion : null;
                if (latestPersistedStateVersion !== null && stateVersion < latestPersistedStateVersion) {
                    return {
                        saved: false,
                        skipped: true,
                        reason: 'stale_state_version',
                        stateVersion,
                        persistedStateVersion: latestPersistedStateVersion
                    };
                }
                if (
                    latestPersistedStateVersion !== null
                    && stateVersion === latestPersistedStateVersion
                    && latestPersistedState
                    && latestPersistedState.stateJson === serializedState
                ) {
                    return {
                        saved: true,
                        skipped: false,
                        reason: 'saved',
                        stateVersion,
                        persistedStateVersion: latestPersistedStateVersion
                    };
                }
                return {
                    saved: false,
                    skipped: true,
                    reason: 'conflicting_state_version',
                    stateVersion,
                    persistedStateVersion: latestPersistedStateVersion || persistedStateVersion || stateVersion
                };
            }
            const shouldAppendLiveWsSignal = persistedStateVersion === null
                || stateVersion > persistedStateVersion
                || status === 'finished'
                || status === 'invalidated';
            const liveWsSignal = shouldAppendLiveWsSignal
                ? await appendLiveWsSignalRow({
                    matchId: match.matchId,
                    stateVersion,
                    reason: 'match_saved',
                    sourceInstanceId: liveWsSourceInstanceId
                })
                : null;
            return {
                saved: true,
                skipped: false,
                reason: 'saved',
                stateVersion,
                persistedStateVersion: Math.max(stateVersion, persistedStateVersion || 0),
                liveWsSignalId: liveWsSignal ? liveWsSignal.signalId : 0,
                liveWsSignalAppended: !!liveWsSignal
            };
        },
        async saveMatchEvents(matchId, events = []) {
            const id = String(matchId || '').trim();
            if (!id || !Array.isArray(events) || events.length === 0) return;
            for (const event of events) {
                const normalized = normalizeEvent(event, id);
                if (!normalized || normalized.matchId !== id) continue;
                const publicData = sanitizePublicData(normalized.eventType, normalized.payload);
                await dbRun(
                    `INSERT OR IGNORE INTO pvp_live_match_events
                        (match_id, event_id, event_sequence, event_type, acting_seat, visibility, public_data_json, event_json, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        id,
                        normalized.eventId,
                        normalized.sequence,
                        normalized.eventType,
                        normalized.actingSeat || '',
                        normalized.visibility,
                        JSON.stringify(publicData),
                        JSON.stringify(normalized),
                        Date.now()
                    ]
                );
            }
        },
        async loadMatchEvents(matchId) {
            const id = String(matchId || '').trim();
            if (!id) return [];
            const rows = await dbAll(
                `SELECT *
                 FROM pvp_live_match_events
                 WHERE match_id = ?
                 ORDER BY event_sequence ASC`,
                [id]
            );
            return rows.map(makeEventFromRow).filter(Boolean);
        },
        async appendLiveWsSignal(signal = {}) {
            return appendLiveWsSignalRow(signal);
        },
        async getLiveWsLatestSignalId() {
            const row = await dbGet('SELECT COALESCE(MAX(signal_id), 0) AS signal_id FROM pvp_live_state_signals');
            return Math.max(0, Math.floor(Number(row && row.signal_id) || 0));
        },
        async loadLiveWsSignalsSince(signalId, limit = 100) {
            const cursor = Math.max(0, Math.floor(Number(signalId) || 0));
            const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
            const rows = await dbAll(
                `SELECT *
                 FROM pvp_live_state_signals
                 WHERE signal_id > ?
                 ORDER BY signal_id ASC
                 LIMIT ?`,
                [cursor, safeLimit]
            );
            return rows.map(makeLiveWsSignalFromRow).filter(Boolean);
        },
        async loadActiveMatchForUser(userId) {
            const id = String(userId || '').trim();
            if (!id) return null;
            const row = await dbGet(
                `SELECT m.* FROM pvp_live_matches m
                 LEFT JOIN pvp_live_match_settlements s ON s.match_id = m.match_id
                 WHERE ((m.status != 'finished' AND m.status != 'invalidated') OR (m.status = 'finished' AND s.match_id IS NULL))
                   AND (m.seat_a_user_id = ? OR m.seat_b_user_id = ?)
                 ORDER BY m.updated_at DESC
                 LIMIT 1`,
                [id, id]
            );
            return makeMatchFromRow(row);
        },
        async loadMatchForUser(userId, matchId) {
            const id = String(userId || '').trim();
            const match = String(matchId || '').trim();
            if (!id || !match) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_matches
                 WHERE match_id = ?
                   AND (seat_a_user_id = ? OR seat_b_user_id = ?)
                 LIMIT 1`,
                [match, id, id]
            );
            return makeMatchFromRow(row);
        },
        async saveRematchRequest(request) {
            if (!request || !request.sourceMatchId || !request.seriesId || !request.playersByUserId) return;
            const playersJson = serializeRematchPlayers(request.playersByUserId);
            if (!playersJson || playersJson === '[]') return;
            const createdAt = Math.max(0, Math.floor(Number(request.createdAt) || Date.now()));
            const updatedAt = Date.now();
            await dbRun(
                `INSERT INTO pvp_live_rematch_requests
                    (source_match_id, series_id, players_json, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(source_match_id) DO UPDATE SET
                    series_id = excluded.series_id,
                    players_json = excluded.players_json,
                    updated_at = excluded.updated_at`,
                [
                    request.sourceMatchId,
                    request.seriesId,
                    playersJson,
                    createdAt,
                    updatedAt
                ]
            );
        },
        async loadRematchRequest(sourceMatchId) {
            const match = String(sourceMatchId || '').trim();
            if (!match) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_rematch_requests
                 WHERE source_match_id = ?
                 LIMIT 1`,
                [match]
            );
            return makeRematchRequestFromRow(row);
        },
        async deleteRematchRequest(sourceMatchId) {
            const match = String(sourceMatchId || '').trim();
            if (!match) return;
            await dbRun('DELETE FROM pvp_live_rematch_requests WHERE source_match_id = ?', [match]);
        },
        async saveInviteRoom(inviteRoom) {
            if (!inviteRoom || !inviteRoom.inviteCode || !inviteRoom.host || !inviteRoom.host.userId || !inviteRoom.host.loadoutSnapshot) return;
            const createdAt = Math.max(0, Math.floor(Number(inviteRoom.createdAt) || Date.now()));
            const target = inviteRoom.target && inviteRoom.target.userId ? inviteRoom.target : null;
            await dbRun(
                `INSERT INTO pvp_live_invites
                    (invite_code, host_user_id, host_display_name, host_loadout_snapshot_json, target_user_id, target_user_name, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(host_user_id) DO UPDATE SET
                    invite_code = excluded.invite_code,
                    host_display_name = excluded.host_display_name,
                    host_loadout_snapshot_json = excluded.host_loadout_snapshot_json,
                    target_user_id = excluded.target_user_id,
                    target_user_name = excluded.target_user_name,
                    created_at = excluded.created_at`,
                [
                    inviteRoom.inviteCode,
                    inviteRoom.host.userId,
                    inviteRoom.host.displayName || inviteRoom.host.userId,
                    serializeSnapshot(inviteRoom.host.loadoutSnapshot),
                    target ? target.userId : '',
                    target ? target.displayName || target.userId : '',
                    createdAt
                ]
            );
        },
        async loadInviteRoomByCode(inviteCode) {
            const code = String(inviteCode || '').trim().toUpperCase();
            if (!code) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_invites
                 WHERE invite_code = ?
                 LIMIT 1`,
                [code]
            );
            return makeInviteRoomFromRow(row);
        },
        async loadInviteRoomForHost(userId) {
            const id = String(userId || '').trim();
            if (!id) return null;
            const row = await dbGet(
                `SELECT * FROM pvp_live_invites
                 WHERE host_user_id = ?
                 LIMIT 1`,
                [id]
            );
            return makeInviteRoomFromRow(row);
        },
        async loadInviteRoomsForTarget(userId) {
            const id = String(userId || '').trim();
            if (!id) return [];
            const rows = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT * FROM pvp_live_invites
                     WHERE target_user_id = ?
                     ORDER BY created_at DESC
                     LIMIT 20`,
                    [id],
                    (err, resultRows) => {
                        if (err) reject(err);
                        else resolve(Array.isArray(resultRows) ? resultRows : []);
                    }
                );
            });
            return rows.map(makeInviteRoomFromRow).filter(Boolean);
        },
        async deleteInviteRoom(inviteCode) {
            const code = String(inviteCode || '').trim().toUpperCase();
            if (!code) return;
            await dbRun('DELETE FROM pvp_live_invites WHERE invite_code = ?', [code]);
        },
        async deleteInviteRoomForHost(userId) {
            const id = String(userId || '').trim();
            if (!id) return;
            await dbRun('DELETE FROM pvp_live_invites WHERE host_user_id = ?', [id]);
        }
    };
}

module.exports = {
    makeSqliteLivePvpPersistence
};
