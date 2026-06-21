const assert = require('assert');
const express = require('../server/node_modules/express');
const pvpLiveRoutes = require('../server/routes/pvp-live');
const { generateToken } = require('../server/middleware/auth');
const { RULES } = require('../server/pvp-live/engine/rules');
const { db, initDb } = require('../server/db/database');

function listen(app) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
        server.once('error', reject);
    });
}

function close(server) {
    return new Promise(resolve => server.close(resolve));
}

async function request(baseUrl, path, { method = 'GET', token, body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch (error) {
        payload = { raw: text };
    }
    return { status: response.status, ok: response.ok, payload };
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

async function setRouteRank({ userId, username, score = 1000, wins = 6, losses = 0, division = '玄阶' }) {
    const now = Date.now();
    await dbRun(
        `INSERT INTO users (id, username, password_hash, created_at, global_updated_at)
         VALUES (?, ?, 'pvp-live-route-default-rating-test', ?, 0)
         ON CONFLICT(id) DO UPDATE SET username = excluded.username`,
        [userId, username, now]
    );
    await dbRun(
        `INSERT INTO pvp_ranks
          (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, 's1-genesis', ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
          user_name = excluded.user_name,
          score = excluded.score,
          wins = excluded.wins,
          losses = excluded.losses,
          division = excluded.division,
          updated_at = excluded.updated_at`,
        [`rank-${userId}`, userId, username, score, wins, losses, division, now, now]
    );
}

async function submitIntent(baseUrl, token, matchId, body) {
    return request(baseUrl, `/api/pvp/live/matches/${matchId}/intents`, {
        method: 'POST',
        token,
        body
    });
}

function eventPublicData(event) {
    return event && (event.publicData || event.payload) || {};
}

function currentSeatUserId(stateView, seatId) {
    if (!stateView || !seatId) return '';
    if (stateView.self && stateView.self.seatId === seatId) return stateView.self.userId || '';
    if (stateView.opponent && stateView.opponent.seatId === seatId) return stateView.opponent.userId || '';
    return '';
}

function makeLoadout(identitySlot, pattern) {
    const deck = [];
    for (let index = 0; index < 20; index += 1) {
        deck.push({ id: pattern[index % pattern.length], upgraded: false });
    }
    return {
        identitySlot,
        label: `${identitySlot}-测试谱`,
        deck
    };
}

function makeRouteLiveCard(instanceId, cardId) {
    const definition = RULES.cards[cardId];
    return {
        instanceId,
        cardId,
        name: definition.name,
        cost: definition.cost,
        damage: definition.damage || 0,
        block: definition.block || 0,
        heal: definition.heal || 0
    };
}

function makeRouteSettlementStub() {
    const seatUserId = (match, seatId) => Object.entries(match && match.seatsByUserId || {})
        .find(([, sourceSeat]) => sourceSeat === seatId)?.[0] || '';
    const makeSeasonHonorClaim = () => ({
        reportVersion: 'pvp-live-season-honor-claim-v1',
        rewardId: 's1_genesis_honor_mark_1',
        rewardType: 'cosmetic_badge',
        rewardName: '开天见证徽记',
        collectionState: 'newly_unlocked',
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none',
        unlockedAt: Date.now(),
        collectionSize: 1,
        collectionReport: {
            reportVersion: 'pvp-live-season-honor-collection-v1',
            seasonId: 's1-genesis',
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none',
            totalUnlocked: 1,
            lastUnlockedRewardId: 's1_genesis_honor_mark_1',
            boundary: '赛季荣誉收藏只保存外观成就，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
        }
    });
    return {
        async settleMatch(match) {
            if (!match || !match.state || match.state.status !== 'finished' || match.state.mode === 'friendly') {
                return { settled: false, reason: 'not_ranked_finished' };
            }
            const finishedEvent = match.state.events.slice().reverse()
                .find(event => event && event.eventType === 'match_finished' && event.payload);
            const winnerSeat = String(finishedEvent && finishedEvent.payload && finishedEvent.payload.winnerSeat || '');
            if (winnerSeat !== 'A' && winnerSeat !== 'B') return { settled: false, reason: 'no_ranked_winner' };
            const loserSeat = winnerSeat === 'A' ? 'B' : 'A';
            const finishReason = String(finishedEvent.payload.finishReason || 'lethal');
            return {
                settled: true,
                matchId: match.matchId,
                finishReason,
                settledAt: Date.now(),
                winner: {
                    userId: seatUserId(match, winnerSeat),
                    didWin: true,
                    oldScore: 1000,
                    newScore: 1024,
                    ratingDelta: 24,
                    coinsAwarded: 38,
                    rankedGames: 1,
                    seasonHonorClaim: makeSeasonHonorClaim()
                },
                loser: {
                    userId: seatUserId(match, loserSeat),
                    didWin: false,
                    oldScore: 1000,
                    newScore: 988,
                    ratingDelta: -12,
                    coinsAwarded: 12,
                    rankedGames: 1,
                    seasonHonorClaim: makeSeasonHonorClaim()
                }
            };
        }
    };
}

function assertTurnTimer(timer, expectedPhase, messagePrefix) {
    assert.equal(timer?.reportVersion, 'pvp-live-turn-timer-v1', `${messagePrefix} should expose turn timer report version`);
    assert.equal(timer?.phase, expectedPhase, `${messagePrefix} should expose ${expectedPhase} timer phase`);
    assert.ok(Number.isFinite(timer?.startedAt) && timer.startedAt > 0, `${messagePrefix} should expose timer start`);
    assert.ok(Number.isFinite(timer?.deadlineAt) && timer.deadlineAt > timer.startedAt, `${messagePrefix} should expose future deadline`);
    assert.ok(Number.isFinite(timer?.timeoutMs) && timer.timeoutMs >= 1000, `${messagePrefix} should expose timeout budget`);
    assert.ok(Number.isFinite(timer?.remainingMs) && timer.remainingMs >= 0, `${messagePrefix} should expose remaining time`);
}

function assertConnectionReport(report, messagePrefix) {
    assert.equal(report?.reportVersion, 'pvp-live-connection-v1', `${messagePrefix} should expose connection report version`);
    assert.ok(report.viewer && report.opponent, `${messagePrefix} should expose viewer and opponent connection seats`);
    assert.ok(['online', 'grace', 'disconnected'].includes(report.viewer.status), `${messagePrefix} should expose viewer connection status`);
    assert.ok(['online', 'grace', 'disconnected'].includes(report.opponent.status), `${messagePrefix} should expose opponent connection status`);
    assert.ok(Number.isFinite(report.heartbeatIntervalMs) && report.heartbeatIntervalMs >= 1000, `${messagePrefix} should expose heartbeat interval`);
    assert.ok(Number.isFinite(report.graceMs) && report.graceMs >= 1000, `${messagePrefix} should expose reconnect grace budget`);
}

function assertConnectionTempoReport(report, expectedTempoState, messagePrefix) {
    assert.equal(report?.reportVersion, 'pvp-live-connection-tempo-v1', `${messagePrefix} should expose connection tempo report version`);
    assert.equal(report.sourceVisibility, 'server_authoritative_connection_state', `${messagePrefix} should be server-authoritative`);
    assert.equal(report.usesHiddenInformation, false, `${messagePrefix} should not use hidden information`);
    assert.equal(report.rankedImpact, 'none', `${messagePrefix} should not affect ranked state`);
    assert.equal(report.tempoState, expectedTempoState, `${messagePrefix} should expose ${expectedTempoState} tempo state`);
    assert.ok(['normal', 'info', 'warning', 'danger'].includes(report.severity), `${messagePrefix} should expose a UI severity`);
    assert.ok(typeof report.statusLine === 'string' && report.statusLine.length > 0, `${messagePrefix} should expose readable status`);
    assert.ok(typeof report.detailLine === 'string' && report.detailLine.length > 0, `${messagePrefix} should expose readable detail`);
    assert.ok(!/hand|deck|cardId|instanceId|sourceCardId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(report)), `${messagePrefix} must not leak hidden combat or matchmaking data`);
}

function assertRankedOpponentConcealed(opponent, messagePrefix) {
    assert.ok(opponent, `${messagePrefix} should expose an opponent seat`);
    assert.equal(opponent.publicProfile?.reportVersion, 'pvp-live-ranked-opponent-profile-v1', `${messagePrefix} should expose coarse ranked opponent profile`);
    assert.equal(opponent.publicProfile?.usesHiddenInformation, false, `${messagePrefix} public profile must not use hidden information`);
    assert.equal(opponent.publicProfile?.rankedImpact, 'none', `${messagePrefix} public profile should not write ranked state`);
    assert.ok(typeof opponent.publicProfile?.archetypeLabel === 'string' && opponent.publicProfile.archetypeLabel.length > 0, `${messagePrefix} should expose a readable archetype label`);
    assert.ok(!Object.prototype.hasOwnProperty.call(opponent, 'userId'), `${messagePrefix} must not expose opponent user id`);
    assert.ok(!Object.prototype.hasOwnProperty.call(opponent, 'displayName'), `${messagePrefix} must not expose raw opponent display name`);
    assert.ok(!Object.prototype.hasOwnProperty.call(opponent, 'loadoutHash'), `${messagePrefix} must not expose opponent loadout hash`);
    assert.ok(!Object.prototype.hasOwnProperty.call(opponent, 'loadoutSummary'), `${messagePrefix} must not expose opponent loadout summary`);
    assert.ok(!opponent.loadoutSnapshot, `${messagePrefix} must not expose full opponent loadout snapshot`);
    assert.ok(!Array.isArray(opponent.hand), `${messagePrefix} must not leak opponent hand`);
    assert.ok(!Array.isArray(opponent.deck), `${messagePrefix} must not leak opponent deck order`);
    assert.doesNotMatch(JSON.stringify(opponent), /"userId"|"displayName"|"loadoutHash"|"loadoutSummary"|"loadoutSnapshot"|"identitySlot"|"label"|"hand":|"deck":|"cardId"|"instanceId"/i, `${messagePrefix} must not leak hidden opponent build or account fields`);
}

async function heartbeat(baseUrl, token, matchId) {
    return request(baseUrl, `/api/pvp/live/matches/${matchId}/heartbeat`, {
        method: 'POST',
        token,
        body: {}
    });
}

function forceSeatDisconnected(match, seatId) {
    const store = pvpLiveRoutes.__livePvpStore;
    const elapsedMs = store.heartbeatStaleMs + store.reconnectGraceMs + 1000;
    match.connection.seats[seatId].lastHeartbeatAt = Date.now() - elapsedMs;
    return elapsedMs;
}

function forceSeatIntoReconnectGrace(match, seatId) {
    const store = pvpLiveRoutes.__livePvpStore;
    const elapsedMs = store.heartbeatStaleMs + 1000;
    match.connection.seats[seatId].lastHeartbeatAt = Date.now() - elapsedMs;
    return elapsedMs;
}

function forceActiveTurnStartedAt(match, startedAt) {
    const store = pvpLiveRoutes.__livePvpStore;
    const safeStartedAt = Math.max(0, Math.floor(Number(startedAt) || Date.now()));
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

async function readyBoth(baseUrl, { matchId, tokenA, tokenB, stateVersionA, prefix }) {
    const readyA = await submitIntent(baseUrl, tokenA, matchId, {
        intentId: `${prefix}-ready-a`,
        intentType: 'ready',
        stateVersion: stateVersionA,
        payload: {}
    });
    assert.equal(readyA.payload.result, 'accepted', `${prefix} first ready should be accepted`);
    assert.equal(readyA.payload.stateView.status, 'setup', `${prefix} first ready should keep match in setup`);
    const readyB = await submitIntent(baseUrl, tokenB, matchId, {
        intentId: `${prefix}-ready-b`,
        intentType: 'ready',
        stateVersion: readyA.payload.stateView.stateVersion,
        payload: {}
    });
    assert.equal(readyB.payload.result, 'accepted', `${prefix} second ready should be accepted`);
    assert.equal(readyB.payload.stateView.status, 'active', `${prefix} both ready should start battle`);
    assertTurnTimer(readyB.payload.stateView.turnTimer, 'active', `${prefix} active state`);
    assert.equal(readyB.payload.stateView.turnTimer.currentSeat, readyB.payload.stateView.currentSeat, `${prefix} active timer should point at current seat`);
    assert.ok(readyB.payload.events.some(event => event.eventType === 'battle_started'), `${prefix} second ready should emit battle_started`);
    return readyB;
}

(async () => {
    await initDb();
    pvpLiveRoutes.__livePvpStore.reset();
    pvpLiveRoutes.__attachServices({ settlement: makeRouteSettlementStub() });

    const app = express();
    app.use(express.json());
    app.use('/api/pvp/live', pvpLiveRoutes);
    const server = await listen(app);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
        const tokenA = generateToken({ id: 'live-user-a', username: '甲' });
        const tokenB = generateToken({ id: 'live-user-b', username: '乙' });
        const tokenC = generateToken({ id: 'live-user-c', username: '丙' });
        const tokenD = generateToken({ id: 'live-user-d', username: '丁' });
        const tokenE = generateToken({ id: 'live-user-e', username: '戊' });
        const tokenF = generateToken({ id: 'live-user-f', username: '己' });
        const tokenG = generateToken({ id: 'live-user-g', username: '庚' });
        const tokenH = generateToken({ id: 'live-user-h', username: '辛' });
        const tokenI = generateToken({ id: 'live-user-i', username: '壬' });
        const tokenJ = generateToken({ id: 'live-user-j', username: '癸' });
        const tokenK = generateToken({ id: 'live-user-k', username: '子' });
        pvpLiveRoutes.__attachServices({
            userDirectory: {
                async findUserByUsername(username) {
                    const users = {
                        '庚': { id: 'live-user-g', username: '庚' },
                        '辛': { id: 'live-user-h', username: '辛' },
                        '壬': { id: 'live-user-i', username: '壬' }
                    };
                    return users[String(username || '').trim()] || null;
                }
            }
        });
        const loadoutA = makeLoadout('sword', ['pvp_burst', 'pvp_strike', 'pvp_guard', 'pvp_strike']);
        const loadoutAChanged = makeLoadout('curse', ['pvp_guard', 'pvp_guard', 'pvp_strike', 'pvp_burst']);
        const loadoutB = makeLoadout('shield', ['pvp_guard', 'pvp_strike', 'pvp_burst', 'pvp_guard']);
        const illegalShortLoadout = {
            identitySlot: 'illegal',
            label: '非法短谱',
            deck: [{ id: 'pvp_strike', upgraded: false }]
        };

        const unauthorized = await request(baseUrl, '/api/pvp/live/queue/join', { method: 'POST' });
        assert.equal(unauthorized.status, 401, 'live PVP queue must require auth');

        const illegalFirstJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: illegalShortLoadout }
        });
        assert.equal(illegalFirstJoin.status, 400, 'first queue join should reject illegal loadout');
        assert.equal(illegalFirstJoin.payload.reason, 'invalid_deck_size', 'illegal loadout response should expose validation reason');

        const joinC = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenC,
            body: { displayName: '丙' }
        });
        assert.equal(joinC.payload.status, 'waiting', 'single queued player should wait before cancel');
        const cancelC = await request(baseUrl, '/api/pvp/live/queue/cancel', {
            method: 'POST',
            token: tokenC,
            body: { queueTicket: joinC.payload.queueTicket }
        });
        assert.equal(cancelC.status, 200, 'queued player should cancel queue ticket');
        assert.equal(cancelC.payload.status, 'cancelled', 'cancel queue should return cancelled status');
        const cancelledStatus = await request(baseUrl, `/api/pvp/live/queue/status/${joinC.payload.queueTicket}`, {
            token: tokenC
        });
        assert.equal(cancelledStatus.status, 404, 'cancelled queue ticket should not stay readable');

        const routeRunId = `${Date.now()}-${process.pid}`;
        const defaultMatureA = { userId: `route-default-mature-a-${routeRunId}`, username: `默甲_${routeRunId}` };
        const defaultMatureB = { userId: `route-default-mature-b-${routeRunId}`, username: `默乙_${routeRunId}` };
        const defaultLowSample = { userId: `route-default-low-${routeRunId}`, username: `默新_${routeRunId}` };
        const tokenDefaultMatureA = generateToken({ id: defaultMatureA.userId, username: defaultMatureA.username });
        const tokenDefaultMatureB = generateToken({ id: defaultMatureB.userId, username: defaultMatureB.username });
        const tokenDefaultLowSample = generateToken({ id: defaultLowSample.userId, username: defaultLowSample.username });
        await setRouteRank(defaultMatureA);
        await setRouteRank(defaultMatureB);
        const defaultMatureJoinA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenDefaultMatureA,
            body: { displayName: defaultMatureA.username, loadout: loadoutA }
        });
        assert.equal(defaultMatureJoinA.payload.status, 'waiting', 'default rating provider first mature player should wait');
        const defaultMatureJoinB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenDefaultMatureB,
            body: { displayName: defaultMatureB.username, loadout: loadoutB }
        });
        assert.equal(defaultMatureJoinB.payload.status, 'matched', 'default rating provider should read ranked games from pvp_ranks and match mature players');
        assert.equal(defaultMatureJoinB.payload.stateView.matchQuality?.expansionStage, 'strict_rating', 'default rating provider mature route should keep strict rating stage');
        assert.ok(!/rankedGames|ranked_games|lowSampleProtected|low_sample_protected/.test(JSON.stringify(defaultMatureJoinB.payload)), 'default rating provider matched route should not leak rating sample counters');
        pvpLiveRoutes.__livePvpStore.reset();

        const defaultLowJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenDefaultLowSample,
            body: { displayName: defaultLowSample.username, loadout: loadoutA }
        });
        assert.equal(defaultLowJoin.payload.status, 'waiting', 'default rating provider should treat no-rank route user as low-sample waiting player');
        const defaultMatureVsLowJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenDefaultMatureB,
            body: { displayName: defaultMatureB.username, loadout: loadoutB }
        });
        assert.equal(defaultMatureVsLowJoin.payload.status, 'waiting', 'default rating provider should not immediately pair no-rank low-sample user into mature player');
        assert.ok(defaultMatureVsLowJoin.payload.waitingReport?.safeguards?.includes('low_sample_protection'), 'default provider low-sample waiting report should expose low-sample protection');
        assert.equal(defaultMatureVsLowJoin.payload.waitingReport?.protectionReason, 'low_sample_protection', 'default provider low-sample waiting report should expose structured protection reason');
        assert.equal(defaultMatureVsLowJoin.payload.waitingReport?.releaseMode, 'need_third_player', 'default provider low-sample waiting report should explain that a third player can release the pool');
        assert.equal(defaultMatureVsLowJoin.payload.waitingReport?.requiresPoolSize, 3, 'default provider low-sample waiting report should expose required pool size');
        assert.ok(defaultMatureVsLowJoin.payload.waitingReport?.candidatePoolSize >= 2, 'default provider low-sample waiting report should expose current candidate pool size');
        assert.ok(defaultMatureVsLowJoin.payload.waitingReport?.releaseAt > Date.now(), 'default provider low-sample waiting report should expose long-wait release timestamp');
        assert.ok(defaultMatureVsLowJoin.payload.waitingReport?.releaseInMs > 0, 'default provider low-sample waiting report should expose remaining release time before threshold');
        assert.ok(defaultMatureVsLowJoin.payload.waitingReport?.currentEligibleActions?.includes('accept_wide_match'), 'default provider low-sample waiting report should expose explicit wide-match action id');
        assert.ok(defaultMatureVsLowJoin.payload.waitingReport?.currentEligibleActions?.includes('practice'), 'default provider low-sample waiting report should expose explicit practice action id');
        assert.ok(!/rankedGames|ranked_games|lowSampleProtected|low_sample_protected/.test(JSON.stringify(defaultMatureVsLowJoin.payload)), 'default provider low-sample waiting payload should not leak rating sample counters');
        pvpLiveRoutes.__livePvpStore.reset();

        pvpLiveRoutes.__attachServices({
            ratingProvider: {
                async getLivePvpRating(userId) {
                    const ratings = {
                        'live-user-c': { score: 1800, division: '天阶', seasonId: 's1-genesis' },
                        'live-user-d': { score: 1040, division: '玄阶', seasonId: 's1-genesis' },
                        'live-user-e': { score: 1000, division: '玄阶', seasonId: 's1-genesis' },
                        'live-user-j': { score: 1250, division: '玄阶', seasonId: 's1-genesis' },
                        'live-user-k': { score: 1000, division: '玄阶', seasonId: 's1-genesis' }
                    };
                    return ratings[userId] || { score: 1000, division: '玄阶', seasonId: 's1-genesis' };
                }
            }
        });
        const farRatedJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenC,
            body: { displayName: '高分远端', loadout: loadoutA }
        });
        assert.equal(farRatedJoin.payload.status, 'waiting', 'far-rated queue player should wait for rating quality test');
        const nearRatedJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenD,
            body: { displayName: '近分对手', loadout: loadoutB }
        });
        assert.equal(nearRatedJoin.payload.status, 'waiting', 'near-rated queue player should wait instead of instantly matching far player');
        const ratedRequesterJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenE,
            body: { displayName: '新入近分', loadout: loadoutAChanged }
        });
        assert.equal(ratedRequesterJoin.payload.status, 'matched', 'rated requester should match an existing waiting player');
        assertRankedOpponentConcealed(ratedRequesterJoin.payload.stateView.opponent, 'rated requester closest-candidate opponent view');
        assert.equal(ratedRequesterJoin.payload.stateView.matchQuality?.ratingDeltaBucket, 'near_0_99', 'matched view should expose near rating delta bucket');
        assert.equal(ratedRequesterJoin.payload.stateView.matchQuality?.expansionStage, 'strict_rating', 'matched view should expose strict rating expansion stage');
        assert.equal(ratedRequesterJoin.payload.stateView.matchQuality?.candidatePoolSize, 3, 'matched view should count rated candidate pool');
        assert.ok(ratedRequesterJoin.payload.stateView.matchQuality?.safeguards?.includes('closest_rating_candidate'), 'matched quality should explain closest rating safeguard');
        assert.ok(!/1800|1040|1000/.test(JSON.stringify(ratedRequesterJoin.payload.stateView.matchQuality || {})), 'matched quality should not expose exact player ratings');
        const nearRatedMatched = await request(baseUrl, `/api/pvp/live/queue/status/${nearRatedJoin.payload.queueTicket}`, {
            token: tokenD
        });
        assert.equal(nearRatedMatched.payload.status, 'matched', 'near-rated candidate should be the consumed matched ticket');
        assert.equal(nearRatedMatched.payload.matchId, ratedRequesterJoin.payload.matchId, 'near-rated candidate should match the requester match id');
        const farRatedStillWaiting = await request(baseUrl, `/api/pvp/live/queue/status/${farRatedJoin.payload.queueTicket}`, {
            token: tokenC
        });
        assert.equal(farRatedStillWaiting.payload.status, 'waiting', 'far-rated first queue player should remain waiting after closer match is selected');
        pvpLiveRoutes.__livePvpStore.reset();

        const wideGapWaiting = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenJ,
            body: { displayName: '宽差等待者', loadout: loadoutA }
        });
        assert.equal(wideGapWaiting.payload.status, 'waiting', 'wide rating gap seed player should wait');
        const wideGapTicket = pvpLiveRoutes.__livePvpStore.waitingQueue.find(ticket => ticket.queueTicket === wideGapWaiting.payload.queueTicket);
        assert.ok(wideGapTicket, 'wide rating gap waiting ticket should exist in store for long-wait probe');
        wideGapTicket.createdAt = Date.now() - (pvpLiveRoutes.__livePvpStore.longWaitThresholdMs * 3);
        const wideGapRequester = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenK,
            body: { displayName: '宽差新入', loadout: loadoutB }
        });
        assert.equal(wideGapRequester.payload.status, 'waiting', 'long-wait wide rating gap should not auto-match without explicit acceptance');
        pvpLiveRoutes.__livePvpStore.reset();

        const oneSidedWideSeed = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenJ,
            body: { displayName: '单方宽差等待者', loadout: loadoutA }
        });
        assert.equal(oneSidedWideSeed.payload.status, 'waiting', 'wide rating gap seed should wait before one-sided consent probe');
        const oneSidedWideTicket = pvpLiveRoutes.__livePvpStore.waitingQueue.find(ticket => ticket.queueTicket === oneSidedWideSeed.payload.queueTicket);
        assert.ok(oneSidedWideTicket, 'one-sided wide gap waiting ticket should exist in store');
        oneSidedWideTicket.createdAt = Date.now() - (pvpLiveRoutes.__livePvpStore.longWaitThresholdMs * 3);
        const oneSidedWideRequester = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenK,
            body: { displayName: '单方宽差新入', loadout: loadoutB, wideMatchConsent: true }
        });
        assert.equal(oneSidedWideRequester.payload.status, 'waiting', 'one-sided wide rating consent should not match without the waiting player consent');
        pvpLiveRoutes.__livePvpStore.reset();

        const acceptedWideSeed = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenJ,
            body: { displayName: '双方宽差等待者', loadout: loadoutA, wideMatchConsent: true }
        });
        assert.equal(acceptedWideSeed.payload.status, 'waiting', 'wide rating accepted seed should wait until another accepted player joins');
        const acceptedWideTicket = pvpLiveRoutes.__livePvpStore.waitingQueue.find(ticket => ticket.queueTicket === acceptedWideSeed.payload.queueTicket);
        assert.ok(acceptedWideTicket, 'accepted wide gap waiting ticket should exist in store');
        acceptedWideTicket.createdAt = Date.now() - (pvpLiveRoutes.__livePvpStore.longWaitThresholdMs * 3);
        const acceptedWideRequester = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenK,
            body: { displayName: '双方宽差新入', loadout: loadoutB, wideMatchConsent: true }
        });
        assert.equal(acceptedWideRequester.payload.status, 'matched', 'two-sided wide rating consent should allow an explicit wide match');
        assert.equal(acceptedWideRequester.payload.stateView.matchQuality?.tag, 'wide_but_accepted', 'accepted wide match should expose wide_but_accepted quality tag');
        assert.equal(acceptedWideRequester.payload.stateView.matchQuality?.expansionStage, 'accepted_200_399', 'accepted wide match should expose accepted 200-399 stage');
        assert.equal(acceptedWideRequester.payload.stateView.matchQuality?.ratingDeltaBucket, 'expanded_200_399', 'accepted wide match should expose bucketed wide rating delta');
        assert.equal(acceptedWideRequester.payload.stateView.matchQuality?.wideMatchReason, 'two_sided_explicit_consent', 'accepted wide match should explain explicit two-sided consent');
        assert.ok(acceptedWideRequester.payload.stateView.matchQuality?.safeguards?.includes('explicit_wide_match_consent'), 'accepted wide match should keep explicit consent safeguard');
        assert.ok(!/1250|1000/.test(JSON.stringify(acceptedWideRequester.payload.stateView.matchQuality || {})), 'accepted wide match quality should not expose exact player ratings');
        pvpLiveRoutes.__livePvpStore.reset();

        const laterConsentSeed = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenJ,
            body: { displayName: '后确认宽差等待者', loadout: loadoutA }
        });
        assert.equal(laterConsentSeed.payload.status, 'waiting', 'later wide consent seed should start as waiting without consent');
        const laterConsentRequester = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenK,
            body: { displayName: '后确认宽差新入', loadout: loadoutB }
        });
        assert.equal(laterConsentRequester.payload.status, 'waiting', 'later wide consent requester should also wait before either player confirms');
        pvpLiveRoutes.__livePvpStore.waitingQueue.forEach(ticket => {
            if (ticket && (ticket.queueTicket === laterConsentSeed.payload.queueTicket || ticket.queueTicket === laterConsentRequester.payload.queueTicket)) {
                ticket.createdAt = Date.now() - (pvpLiveRoutes.__livePvpStore.longWaitThresholdMs * 3);
            }
        });
        const laterSeedConsent = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenJ,
            body: { displayName: '后确认宽差等待者', loadout: loadoutAChanged, wideMatchConsent: true }
        });
        assert.equal(laterSeedConsent.payload.status, 'waiting', 'first later wide consent should only update consent and preserve waiting');
        assert.equal(laterSeedConsent.payload.loadoutHash, laterConsentSeed.payload.loadoutHash, 'first later wide consent should not overwrite the locked waiting loadout');
        assert.equal(laterSeedConsent.payload.waitingReport?.wideMatchConsent?.viewerAccepted, true, 'wide consent waiting report should remember the viewer acceptance');
        assert.equal(laterSeedConsent.payload.waitingReport?.wideMatchConsent?.requiresBothPlayers, true, 'wide consent waiting report should expose two-sided consent requirement');
        assert.equal(laterSeedConsent.payload.waitingReport?.wideMatchConsent?.matchReady, false, 'one-sided wide consent should remain visibly not ready to match');
        assert.equal(laterSeedConsent.payload.waitingReport?.wideMatchConsent?.status, 'waiting_for_peer', 'one-sided wide consent should explain that it is waiting for the peer acceptance');
        const laterRequesterConsent = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenK,
            body: { displayName: '后确认宽差新入', loadout: loadoutB, wideMatchConsent: true }
        });
        assert.equal(laterRequesterConsent.payload.status, 'matched', 'second later wide consent should immediately match two existing waiting players');
        assert.equal(laterRequesterConsent.payload.stateView.matchQuality?.tag, 'wide_but_accepted', 'later accepted wide match should expose wide_but_accepted quality tag');
        assert.equal(laterRequesterConsent.payload.stateView.matchQuality?.wideMatchReason, 'two_sided_explicit_consent', 'later accepted wide match should explain explicit two-sided consent');
        pvpLiveRoutes.__livePvpStore.reset();

        const previousWideScopeTestMode = process.env.DEFIER_PVP_TEST_MODE;
        process.env.DEFIER_PVP_TEST_MODE = '1';
        try {
            const scopedWideA = await request(baseUrl, '/api/pvp/live/queue/join', {
                method: 'POST',
                token: tokenJ,
                body: { displayName: '分池宽差甲', loadout: loadoutA, wideMatchConsent: true, testMatchScope: 'wide-scope-a' }
            });
            assert.equal(scopedWideA.payload.status, 'waiting', 'first scoped wide consent player should wait in its own pool');
            const scopedWideB = await request(baseUrl, '/api/pvp/live/queue/join', {
                method: 'POST',
                token: tokenK,
                body: { displayName: '分池宽差乙', loadout: loadoutB, wideMatchConsent: true, testMatchScope: 'wide-scope-b' }
            });
            assert.equal(scopedWideB.payload.status, 'waiting', 'different scoped wide consent player should not match across pools');
            assert.equal(scopedWideB.payload.waitingReport?.candidatePoolSize, 1, 'wide consent waiting report should count only the scoped candidate pool');
            assert.equal(scopedWideB.payload.waitingReport?.wideMatchConsent?.acceptedPlayerCount, 1, 'wide consent report should count only accepted players in the same scoped pool');
            const scopedWideAStatus = await request(baseUrl, `/api/pvp/live/queue/status/${scopedWideA.payload.queueTicket}`, {
                token: tokenJ
            });
            assert.equal(scopedWideAStatus.payload.status, 'waiting', 'scoped wide queue status should remain waiting in its own pool');
            assert.equal(scopedWideAStatus.payload.waitingReport?.candidatePoolSize, 1, 'queue status waiting report should keep scoped candidate pool size');
            assert.equal(scopedWideAStatus.payload.waitingReport?.wideMatchConsent?.acceptedPlayerCount, 1, 'queue status wide consent report should keep scoped accepted count');
        } finally {
            if (previousWideScopeTestMode === undefined) delete process.env.DEFIER_PVP_TEST_MODE;
            else process.env.DEFIER_PVP_TEST_MODE = previousWideScopeTestMode;
            pvpLiveRoutes.__livePvpStore.reset();
        }
        pvpLiveRoutes.__attachServices({ ratingProvider: null });

        const inviteC = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenC,
            body: { displayName: '丙', loadout: loadoutB }
        });
        assert.equal(inviteC.status, 200, 'private invite creator should receive 200');
        assert.equal(inviteC.payload.status, 'waiting_invite', 'private invite creator should wait for invited opponent');
        assert.ok(inviteC.payload.inviteCode, 'private invite should expose shareable invite code');
        assert.equal(inviteC.payload.inviteReport?.reportVersion, 'pvp-live-invite-v1', 'private invite should expose invite report version');
        assert.equal(inviteC.payload.inviteReport?.rankedImpact, 'none', 'private invite should not affect ranked score');
        assert.ok(inviteC.payload.inviteReport?.safeguards?.includes('invite_only_match'), 'private invite should explain invite-only matching');
        assert.ok(!/reward|rating|elo/i.test(JSON.stringify(inviteC.payload.inviteReport)), 'private invite report should not promise reward or exact rating compensation');

        const selfInviteJoin = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(inviteC.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenC,
            body: { displayName: '丙', loadout: loadoutB }
        });
        assert.equal(selfInviteJoin.status, 409, 'private invite creator should not join their own invite as opponent');
        assert.equal(selfInviteJoin.payload.reason, 'invite_self_join', 'self invite join should expose stable reason');

        const hostQueueWhileInviteWaits = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenC,
            body: { displayName: '丙', loadout: loadoutB }
        });
        assert.equal(hostQueueWhileInviteWaits.status, 409, 'private invite host should not enter public queue while invite waits');
        assert.equal(hostQueueWhileInviteWaits.payload.reason, 'pending_invite_exists', 'pending private invite should block public queue with stable reason');

        const currentInviteC = await request(baseUrl, '/api/pvp/live/invites/current', {
            token: tokenC
        });
        assert.equal(currentInviteC.status, 200, 'private invite host should recover pending invite through current invite endpoint');
        assert.equal(currentInviteC.payload.status, 'waiting_invite', 'current private invite should keep waiting invite status');
        assert.equal(currentInviteC.payload.inviteCode, inviteC.payload.inviteCode, 'current private invite should expose original invite code');
        assert.equal(currentInviteC.payload.inviteReport?.status, 'waiting', 'current private invite should expose waiting invite report');

        const currentInviteD = await request(baseUrl, '/api/pvp/live/invites/current', {
            token: tokenD
        });
        assert.equal(currentInviteD.status, 404, 'non-host without pending invite should not recover another private invite');

        const publicJoinDWhileInviteWaits = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenD,
            body: { displayName: '丁', loadout: loadoutA }
        });
        assert.equal(publicJoinDWhileInviteWaits.payload.status, 'waiting', 'public queue player should not match a private invite host');
        await request(baseUrl, '/api/pvp/live/queue/cancel', {
            method: 'POST',
            token: tokenD,
            body: { queueTicket: publicJoinDWhileInviteWaits.payload.queueTicket }
        });

        const invitedD = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(inviteC.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenD,
            body: { displayName: '丁', loadout: loadoutA }
        });
        assert.equal(invitedD.status, 200, 'invited opponent should join private invite');
        assert.equal(invitedD.payload.status, 'matched', 'invited opponent should create a private live match');
        assert.equal(invitedD.payload.stateView.mode, 'friendly', 'private invite match should be friendly no-score mode');
        assert.equal(invitedD.payload.stateView.matchQuality?.expansionStage, 'friend_invite', 'private invite match should expose invite match quality stage');
        assert.ok(invitedD.payload.stateView.matchQuality?.safeguards?.includes('invite_only_match'), 'private invite match quality should keep invite-only safeguard');
        assert.ok(invitedD.payload.stateView.firstMatchGuide?.safeguards?.includes('friendly_no_ranked_impact'), 'private invite guide should explain no-ranked-impact safeguard');
        assert.equal(invitedD.payload.stateView.matchQuality?.ratingDeltaBucket, 'friend_invite', 'private invite match quality should use friend invite bucket instead of exact rating');
        assert.ok(!/reward|elo/i.test(JSON.stringify(invitedD.payload.stateView.matchQuality || {})), 'private invite match quality should not leak reward or ELO promises');
        assert.equal(invitedD.payload.stateView.openerAssignment?.reportVersion, 'pvp-live-opener-assignment-v1', 'private invite match should expose authoritative opener assignment');
        assert.equal(invitedD.payload.stateView.openerAssignment?.firstSeat, invitedD.payload.stateView.setup?.firstSeat, 'private invite opener assignment should match setup firstSeat');
        assert.equal(invitedD.payload.stateView.openerAssignment?.queueOrderBinding, false, 'private invite opener assignment must not be tied to queue order');
        assert.equal(invitedD.payload.stateView.openerAssignment?.hostBinding, false, 'private invite opener assignment must not be tied to host seat');

        const inviteHostCurrent = await request(baseUrl, '/api/pvp/live/matches/current', {
            token: tokenC
        });
        assert.equal(inviteHostCurrent.status, 200, 'private invite host should recover accepted invite through current match');
        assert.equal(inviteHostCurrent.payload.matchId, invitedD.payload.matchId, 'private invite host current match should point to accepted invite match');
        assert.equal(inviteHostCurrent.payload.stateView.mode, 'friendly', 'private invite host current match should stay friendly');

        const consumedInvite = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(inviteC.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenE,
            body: { displayName: '戊', loadout: loadoutB }
        });
        assert.equal(consumedInvite.status, 404, 'consumed private invite should not be reusable');

        const cancellableInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenE,
            body: { displayName: '戊', loadout: loadoutB }
        });
        assert.equal(cancellableInvite.payload.status, 'waiting_invite', 'cancellable private invite should enter waiting invite state');
        const nonOwnerInviteCancel = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(cancellableInvite.payload.inviteCode)}/cancel`, {
            method: 'POST',
            token: tokenD,
            body: {}
        });
        assert.equal(nonOwnerInviteCancel.status, 404, 'non-owner should not cancel another private invite');
        const cancelledInvite = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(cancellableInvite.payload.inviteCode)}/cancel`, {
            method: 'POST',
            token: tokenE,
            body: {}
        });
        assert.equal(cancelledInvite.status, 200, 'private invite host should cancel waiting invite');
        assert.equal(cancelledInvite.payload.status, 'cancelled', 'cancel private invite should return cancelled status');
        assert.equal(cancelledInvite.payload.inviteReport?.status, 'cancelled', 'cancel private invite should expose cancelled invite report');
        const joinCancelledInvite = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(cancellableInvite.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: loadoutA }
        });
        assert.equal(joinCancelledInvite.status, 404, 'cancelled private invite should not be joinable');
        const queueAfterInviteCancel = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenE,
            body: { displayName: '戊', loadout: loadoutB }
        });
        assert.equal(queueAfterInviteCancel.payload.status, 'waiting', 'private invite host should enter public queue after cancelling invite');
        await request(baseUrl, '/api/pvp/live/queue/cancel', {
            method: 'POST',
            token: tokenE,
            body: { queueTicket: queueAfterInviteCancel.payload.queueTicket }
        });

        const friendlyDisconnectInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenE,
            body: { displayName: '戊', loadout: loadoutB }
        });
        assert.equal(friendlyDisconnectInvite.payload.status, 'waiting_invite', 'friendly setup disconnect invite should enter waiting invite state');
        const friendlyDisconnectJoin = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(friendlyDisconnectInvite.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: loadoutA }
        });
        assert.equal(friendlyDisconnectJoin.payload.status, 'matched', 'friendly setup disconnect guest should create friendly match');
        assert.equal(friendlyDisconnectJoin.payload.stateView.mode, 'friendly', 'friendly setup disconnect match should stay no-ranked mode');
        const friendlyDisconnectMatch = pvpLiveRoutes.__livePvpStore.matches.get(friendlyDisconnectJoin.payload.matchId);
        forceSeatDisconnected(friendlyDisconnectMatch, 'B');
        const friendlyDisconnectState = await request(baseUrl, `/api/pvp/live/matches/${friendlyDisconnectJoin.payload.matchId}`, {
            token: tokenE
        });
        assert.equal(friendlyDisconnectState.payload.stateView.status, 'invalidated', 'friendly setup connection timeout should invalidate without settlement');
        assert.ok(friendlyDisconnectState.payload.stateView.recentEvents.some(event => event.eventType === 'connection_timeout' && eventPublicData(event).seatId === 'B'), 'friendly setup disconnect should still emit public connection_timeout evidence');
        const friendlyDisconnectGuestQueue = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: loadoutA }
        });
        assert.equal(friendlyDisconnectGuestQueue.status, 200, 'friendly setup connection timeout should not apply ranked queue cooldown');
        assert.equal(friendlyDisconnectGuestQueue.payload.status, 'waiting', 'friendly setup disconnected guest should be able to enter public queue after no-score invalidation');
        await request(baseUrl, '/api/pvp/live/queue/cancel', {
            method: 'POST',
            token: tokenF,
            body: { queueTicket: friendlyDisconnectGuestQueue.payload.queueTicket }
        });

        const friendlyReadyTimeoutInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenE,
            body: { displayName: '戊', loadout: loadoutB }
        });
        assert.equal(friendlyReadyTimeoutInvite.payload.status, 'waiting_invite', 'friendly setup ready timeout invite should enter waiting invite state');
        const friendlyReadyTimeoutJoin = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(friendlyReadyTimeoutInvite.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: loadoutA }
        });
        assert.equal(friendlyReadyTimeoutJoin.payload.status, 'matched', 'friendly ready timeout guest should create friendly match');
        assert.equal(friendlyReadyTimeoutJoin.payload.stateView.mode, 'friendly', 'friendly ready timeout match should stay no-ranked mode');
        const friendlyReadyTimeoutHostReady = await submitIntent(baseUrl, tokenE, friendlyReadyTimeoutJoin.payload.matchId, {
            intentId: 'friendly-ready-timeout-host-ready',
            intentType: 'ready',
            stateVersion: friendlyReadyTimeoutJoin.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(friendlyReadyTimeoutHostReady.payload.result, 'accepted', 'friendly ready timeout host ready should be accepted before guest timeout');
        const friendlyReadyTimeoutMatch = pvpLiveRoutes.__livePvpStore.matches.get(friendlyReadyTimeoutJoin.payload.matchId);
        const originalFriendlyReadyTimeoutNow = pvpLiveRoutes.__livePvpStore.now;
        const friendlyReadyTimeoutBaseNow = Date.now();
        friendlyReadyTimeoutMatch.state.setup.readyDeadlineAt = friendlyReadyTimeoutBaseNow - 1;
        friendlyReadyTimeoutMatch.updatedAt = friendlyReadyTimeoutBaseNow - 10 * 60 * 1000;
        pvpLiveRoutes.__livePvpStore.now = () => friendlyReadyTimeoutBaseNow + 30 * 1000;
        const friendlyReadyTimeoutState = await request(baseUrl, `/api/pvp/live/matches/${friendlyReadyTimeoutJoin.payload.matchId}`, {
            token: tokenF
        });
        pvpLiveRoutes.__livePvpStore.now = originalFriendlyReadyTimeoutNow;
        assert.equal(friendlyReadyTimeoutState.payload.stateView.status, 'invalidated', 'friendly setup ready timeout should invalidate without settlement');
        assert.ok(friendlyReadyTimeoutState.payload.stateView.recentEvents.some(event => event.eventType === 'ready_timeout' && eventPublicData(event).unreadySeats?.includes('B')), 'friendly setup ready timeout should emit public ready_timeout evidence');
        assert.ok(friendlyReadyTimeoutState.payload.stateView.recentEvents.some(event => event.eventType === 'match_invalidated' && eventPublicData(event).reason === 'ready_timeout'), 'friendly setup ready timeout should expose ready_timeout invalidation reason');
        const friendlyReadyTimeoutGuestQueue = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: loadoutA }
        });
        assert.equal(friendlyReadyTimeoutGuestQueue.status, 200, 'friendly setup ready timeout should not apply ranked queue cooldown');
        assert.equal(friendlyReadyTimeoutGuestQueue.payload.status, 'waiting', 'friendly setup unready guest should be able to enter public queue after no-score invalidation');
        await request(baseUrl, '/api/pvp/live/queue/cancel', {
            method: 'POST',
            token: tokenF,
            body: { queueTicket: friendlyReadyTimeoutGuestQueue.payload.queueTicket }
        });

        const expiringInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: loadoutA }
        });
        assert.equal(expiringInvite.payload.status, 'waiting_invite', 'expiring private invite should enter waiting invite state');
        const expiringRoom = pvpLiveRoutes.__livePvpStore.inviteRooms.get(expiringInvite.payload.inviteCode);
        expiringRoom.createdAt = Date.now() - pvpLiveRoutes.__livePvpStore.inviteTtlMs - 1000;
        const joinExpiredInvite = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(expiringInvite.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenE,
            body: { displayName: '戊', loadout: loadoutB }
        });
        assert.equal(joinExpiredInvite.status, 404, 'expired private invite should not be joinable');
        assert.equal(joinExpiredInvite.payload.reason, 'invite_expired', 'expired private invite should expose stable expiry reason');

        const expiringCurrentInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenF,
            body: { displayName: '己', loadout: loadoutA }
        });
        assert.equal(expiringCurrentInvite.payload.status, 'waiting_invite', 'current-expiring private invite should enter waiting invite state');
        const expiringCurrentRoom = pvpLiveRoutes.__livePvpStore.inviteRooms.get(expiringCurrentInvite.payload.inviteCode);
        expiringCurrentRoom.createdAt = Date.now() - pvpLiveRoutes.__livePvpStore.inviteTtlMs - 1000;
        const currentExpiredInvite = await request(baseUrl, '/api/pvp/live/invites/current', {
            token: tokenF
        });
        assert.equal(currentExpiredInvite.status, 404, 'expired current private invite should not keep host waiting');
        assert.equal(currentExpiredInvite.payload.reason, 'invite_expired', 'expired current private invite should expose stable expiry reason');

        const missingTargetInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenG,
            body: { displayName: '庚', targetUsername: '不存在道友', loadout: loadoutA }
        });
        assert.equal(missingTargetInvite.status, 404, 'targeted private invite should reject an unknown target username');
        assert.equal(missingTargetInvite.payload.reason, 'target_user_not_found', 'unknown targeted private invite should expose stable reason');

        const selfTargetInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenG,
            body: { displayName: '庚', targetUsername: '庚', loadout: loadoutA }
        });
        assert.equal(selfTargetInvite.status, 409, 'targeted private invite should reject targeting self');
        assert.equal(selfTargetInvite.payload.reason, 'invite_self_target', 'self targeted private invite should expose stable reason');

        const targetedInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenG,
            body: { displayName: '庚', targetUsername: ' 辛 ', loadout: loadoutA }
        });
        assert.equal(targetedInvite.status, 200, 'targeted private invite creator should receive 200');
        assert.equal(targetedInvite.payload.status, 'waiting_invite', 'targeted private invite should wait for the selected player');
        assert.equal(targetedInvite.payload.inviteReport?.target?.displayName, '辛', 'targeted private invite report should expose selected target display name');
        assert.ok(targetedInvite.payload.inviteReport?.safeguards?.includes('targeted_invite_only'), 'targeted private invite should expose targeted-only safeguard');

        const targetInbox = await request(baseUrl, '/api/pvp/live/invites/inbox', {
            token: tokenH
        });
        assert.equal(targetInbox.status, 200, 'targeted invite recipient should read private invite inbox');
        assert.equal(targetInbox.payload.status, 'invite_inbox', 'targeted invite inbox should expose invite_inbox status');
        assert.equal(targetInbox.payload.invites.length, 1, 'targeted invite inbox should include the pending targeted invite');
        assert.equal(targetInbox.payload.invites[0].inviteCode, targetedInvite.payload.inviteCode, 'targeted invite inbox should include matching invite code');
        assert.equal(targetInbox.payload.invites[0].inviteReport?.host?.displayName, '庚', 'targeted invite inbox should expose host display name');
        assert.equal(targetInbox.payload.invites[0].inviteReport?.target?.displayName, '辛', 'targeted invite inbox should expose target display name');

        const bystanderTargetedJoin = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(targetedInvite.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenI,
            body: { displayName: '壬', loadout: loadoutB }
        });
        assert.equal(bystanderTargetedJoin.status, 409, 'non-target player should not join a targeted private invite even with code');
        assert.equal(bystanderTargetedJoin.payload.reason, 'invite_target_mismatch', 'non-target join should expose stable target mismatch reason');

        const acceptedTargetedInvite = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(targetedInvite.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenH,
            body: { displayName: '辛', loadout: loadoutB }
        });
        assert.equal(acceptedTargetedInvite.status, 200, 'targeted invite recipient should join their private invite');
        assert.equal(acceptedTargetedInvite.payload.status, 'matched', 'targeted invite recipient should create a live match');
        assert.equal(acceptedTargetedInvite.payload.stateView.mode, 'friendly', 'targeted invite match should stay friendly no-score mode');
        assert.equal(acceptedTargetedInvite.payload.inviteReport?.target?.displayName, '辛', 'accepted targeted invite report should keep target display name');
        const targetInboxAfterAccept = await request(baseUrl, '/api/pvp/live/invites/inbox', {
            token: tokenH
        });
        assert.equal(targetInboxAfterAccept.payload.invites.length, 0, 'accepted targeted invite should disappear from recipient inbox');

        pvpLiveRoutes.__livePvpStore.reset();
        const durableInvite = await request(baseUrl, '/api/pvp/live/invites', {
            method: 'POST',
            token: tokenG,
            body: { displayName: '庚', targetUsername: '辛', loadout: loadoutA }
        });
        assert.equal(durableInvite.status, 200, 'durable targeted invite should be created before persistence failure simulation');
        pvpLiveRoutes.__attachServices({
            persistence: {
                async saveMatch() {
                    throw new Error('simulated-save-match-failure');
                },
                async deleteInviteRoom() {
                    throw new Error('invite must not be deleted before match persistence succeeds');
                }
            }
        });
        const failedDurableJoin = await request(baseUrl, `/api/pvp/live/invites/${encodeURIComponent(durableInvite.payload.inviteCode)}/join`, {
            method: 'POST',
            token: tokenH,
            body: { displayName: '辛', loadout: loadoutB }
        });
        assert.equal(failedDurableJoin.status, 500, 'targeted invite join should fail when match persistence fails');
        pvpLiveRoutes.__attachServices({ persistence: null });
        const stillCurrentDurableInvite = await request(baseUrl, '/api/pvp/live/invites/current', {
            token: tokenG
        });
        assert.equal(stillCurrentDurableInvite.status, 200, 'failed invite join should keep host invite recoverable');
        assert.equal(stillCurrentDurableInvite.payload.inviteCode, durableInvite.payload.inviteCode, 'failed invite join should keep original invite code');
        const noGhostDurableMatch = await request(baseUrl, '/api/pvp/live/matches/current', {
            token: tokenG
        });
        assert.equal(noGhostDurableMatch.status, 404, 'failed invite join should not leave an unpersisted current match');

        const blockedHealthJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenI,
            body: {
                displayName: '壬',
                loadout: loadoutA,
                connectionHealthProbe: {
                    sampleWindowMs: 60000,
                    missedHeartbeatCount: 2,
                    reconnectCount: 1,
                    rttP95Ms: 2800
                }
            }
        });
        assert.equal(blockedHealthJoin.status, 409, 'high-risk connection should not enter ranked live queue');
        assert.equal(blockedHealthJoin.payload.reason, 'connection_health_failed', 'high-risk connection block should expose stable reason');
        assert.equal(blockedHealthJoin.payload.connectionHealth?.reportVersion, 'pvp-live-queue-connection-health-v1', 'blocked queue join should expose connection health report');
        assert.equal(blockedHealthJoin.payload.connectionHealth?.status, 'blocked', 'blocked queue join should classify connection health as blocked');
        assert.ok(blockedHealthJoin.payload.connectionHealth?.reasons?.includes('missed_heartbeat'), 'blocked queue join should explain missed heartbeat risk');
        assert.ok(blockedHealthJoin.payload.connectionHealth?.reasons?.includes('recent_reconnect'), 'blocked queue join should explain recent reconnect risk');
        assert.ok(blockedHealthJoin.payload.connectionHealth?.reasons?.includes('high_rtt'), 'blocked queue join should explain high RTT risk');
        assert.ok(blockedHealthJoin.payload.connectionHealth?.actions?.some(action => action.id === 'retry_connection_check'), 'blocked queue join should offer retry action');
        assert.ok(blockedHealthJoin.payload.connectionHealth?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail)), 'blocked queue join should offer no-score practice instead of ghost fallback');

        pvpLiveRoutes.__livePvpStore.reset();

        const legacyNoProbeJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenI,
            body: {
                displayName: '壬',
                loadout: loadoutA
            }
        });
        assert.equal(legacyNoProbeJoin.status, 200, 'legacy client without connection probe should still enter waiting queue');
        assert.equal(legacyNoProbeJoin.payload.status, 'waiting', 'legacy no-probe player should wait for real opponent');

        const mixedProbeJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenK,
            body: {
                displayName: '子',
                loadout: loadoutB,
                connectionHealthProbe: {
                    sampleWindowMs: 60000,
                    missedHeartbeatCount: 0,
                    reconnectCount: 0,
                    rttP95Ms: 520
                }
            }
        });
        assert.equal(mixedProbeJoin.status, 200, 'measured opponent should match legacy no-probe ticket');
        assert.equal(mixedProbeJoin.payload.status, 'matched', 'mixed measured/no-probe pair should still create a real-player match');
        assert.equal(mixedProbeJoin.payload.stateView.matchQuality.connectionHealth, 'not_measured', 'mixed measured/no-probe pair must not overstate connection health as passed');
        assert.equal(mixedProbeJoin.payload.stateView.matchQuality.connectionHealthSummary, null, 'mixed measured/no-probe pair should not expose a pass summary');
        assert.ok(!mixedProbeJoin.payload.stateView.matchQuality.safeguards.includes('connection_health_gate'), 'mixed measured/no-probe pair should not claim connection health gate safeguard');

        pvpLiveRoutes.__livePvpStore.reset();
        const cancelCooldownTickets = [];
        for (let index = 0; index < 3; index += 1) {
            const joinForCancel = await request(baseUrl, '/api/pvp/live/queue/join', {
                method: 'POST',
                token: tokenA,
                body: {
                    displayName: '甲',
                    loadout: loadoutA
                }
            });
            assert.equal(joinForCancel.status, 200, `cancel cooldown seed join ${index + 1} should enter queue`);
            assert.equal(joinForCancel.payload.status, 'waiting', `cancel cooldown seed join ${index + 1} should wait`);
            cancelCooldownTickets.push(joinForCancel.payload.queueTicket);
            const cancelForCooldown = await request(baseUrl, '/api/pvp/live/queue/cancel', {
                method: 'POST',
                token: tokenA,
                body: { queueTicket: joinForCancel.payload.queueTicket }
            });
            assert.equal(cancelForCooldown.status, 200, `cancel cooldown cancel ${index + 1} should succeed`);
            assert.equal(cancelForCooldown.payload.status, 'cancelled', `cancel cooldown cancel ${index + 1} should return cancelled`);
        }
        assert.equal(new Set(cancelCooldownTickets).size, 3, 'cancel cooldown seed should create three distinct queue tickets before blocking');
        const cooldownBlockedJoin = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: {
                displayName: '甲',
                loadout: loadoutA
            }
        });
        assert.equal(cooldownBlockedJoin.status, 409, 'frequent queue cancellation should block the next ranked join');
        assert.equal(cooldownBlockedJoin.payload.reason, 'queue_cooldown', 'cancel abuse block should expose queue_cooldown reason');
        assert.equal(cooldownBlockedJoin.payload.matchmakingGuard?.reportVersion, 'pvp-live-matchmaking-guard-v1', 'queue cooldown response should expose matchmaking guard report');
        assert.equal(cooldownBlockedJoin.payload.matchmakingGuard?.cooldownSource, 'queue_cancel_abuse', 'cancel abuse cooldown should expose the source');
        assert.ok(cooldownBlockedJoin.payload.matchmakingGuard?.retryAt > Date.now(), 'queue cooldown should expose a future retryAt');
        assert.ok(cooldownBlockedJoin.payload.matchmakingGuard?.actions?.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail)), 'queue cooldown should offer no-score practice');
        assert.ok(!/reward|rating|elo/i.test(JSON.stringify(cooldownBlockedJoin.payload.matchmakingGuard)), 'queue cooldown guard should not imply reward or rating compensation');

        pvpLiveRoutes.__livePvpStore.reset();

        const joinA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: {
                displayName: '甲',
                loadout: loadoutA,
                connectionHealthProbe: {
                    sampleWindowMs: 60000,
                    missedHeartbeatCount: 0,
                    reconnectCount: 0,
                    rttP95Ms: 480
                }
            }
        });
        assert.equal(joinA.status, 200, 'first queue join should return 200');
        assert.equal(joinA.payload.status, 'waiting', 'first queue join should wait');
        assert.ok(joinA.payload.queueTicket, 'waiting response should include queue ticket');
        assert.ok(joinA.payload.loadoutHash, 'first queue join should return locked loadout hash');
        assert.equal(joinA.payload.loadoutSummary.identitySlot, 'sword', 'waiting response should expose own locked loadout summary');

        const cancelByWrongUser = await request(baseUrl, '/api/pvp/live/queue/cancel', {
            method: 'POST',
            token: tokenB,
            body: { queueTicket: joinA.payload.queueTicket }
        });
        assert.equal(cancelByWrongUser.status, 404, 'another user should not cancel an owner queue ticket');

        const statusAfterWrongCancel = await request(baseUrl, `/api/pvp/live/queue/status/${joinA.payload.queueTicket}`, {
            token: tokenA
        });
        assert.equal(statusAfterWrongCancel.status, 200, 'wrong-user cancel should not remove owner queue ticket');
        assert.equal(statusAfterWrongCancel.payload.status, 'waiting', 'owner queue ticket should remain waiting after wrong-user cancel');

        const originalNow = pvpLiveRoutes.__livePvpStore.now;
        pvpLiveRoutes.__livePvpStore.now = () => originalNow() + 121000;
        const longWaitStatus = await request(baseUrl, `/api/pvp/live/queue/status/${joinA.payload.queueTicket}`, {
            token: tokenA
        });
        pvpLiveRoutes.__livePvpStore.now = originalNow;
        assert.equal(longWaitStatus.status, 200, 'long waiting queue ticket should remain readable');
        assert.equal(longWaitStatus.payload.status, 'waiting', 'long waiting queue ticket should stay waiting instead of matching a ghost');
        assert.equal(longWaitStatus.payload.waitingReport.reportVersion, 'pvp-live-waiting-report-v1', 'long waiting queue status should expose waiting report version');
        assert.equal(longWaitStatus.payload.waitingReport.longWait, true, 'long waiting report should mark 120s no-real-player branch');
        assert.ok(longWaitStatus.payload.waitingReport.waitMs >= 120000, 'long waiting report should expose public wait duration');
        assert.ok(longWaitStatus.payload.waitingReport.actions.some(action => action.id === 'continue_waiting'), 'long waiting report should offer continue waiting');
        assert.ok(longWaitStatus.payload.waitingReport.actions.some(action => action.id === 'practice' && /不写正式积分/.test(action.detail)), 'long waiting report should offer no-score practice');
        assert.ok(longWaitStatus.payload.waitingReport.actions.some(action => action.id === 'cancel_queue'), 'long waiting report should offer cancel queue');
        assert.ok(longWaitStatus.payload.waitingReport.safeguards.includes('no_ghost_fallback'), 'long waiting report should explicitly forbid ghost fallback');
        assert.ok(!/reward|rating|elo/i.test(JSON.stringify(longWaitStatus.payload.waitingReport)), 'long waiting report should not imply reward or rating compensation');

        const rejoinAWithChangedLoadout = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: loadoutAChanged }
        });
        assert.equal(rejoinAWithChangedLoadout.payload.status, 'waiting', 'queued player should keep existing queue ticket on repeated join');
        assert.equal(rejoinAWithChangedLoadout.payload.queueTicket, joinA.payload.queueTicket, 'repeated join should keep original queue ticket');
        assert.equal(rejoinAWithChangedLoadout.payload.loadoutHash, joinA.payload.loadoutHash, 'repeated join with changed loadout should keep original locked loadout hash');
        assert.equal(rejoinAWithChangedLoadout.payload.loadoutSummary.identitySlot, 'sword', 'repeated join should not change locked identity slot');

        const rejoinAWithIllegalLoadout = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: illegalShortLoadout }
        });
        assert.equal(rejoinAWithIllegalLoadout.status, 200, 'queued player should not be rejected when a later local loadout is illegal');
        assert.equal(rejoinAWithIllegalLoadout.payload.queueTicket, joinA.payload.queueTicket, 'illegal repeated join should still keep original queue ticket');
        assert.equal(rejoinAWithIllegalLoadout.payload.loadoutHash, joinA.payload.loadoutHash, 'illegal repeated join should not overwrite locked loadout hash');

        const joinB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: {
                displayName: '乙',
                loadout: loadoutB,
                connectionHealthProbe: {
                    sampleWindowMs: 60000,
                    missedHeartbeatCount: 0,
                    reconnectCount: 0,
                    rttP95Ms: 520
                }
            }
        });
        assert.equal(joinB.status, 200, 'second queue join should return 200');
        assert.equal(joinB.payload.status, 'matched', 'second queue join should match');
        assert.equal(joinB.payload.seatId, 'B', 'second player should receive B seat in deterministic test');
        assert.ok(joinB.payload.matchId, 'matched response should include match id');
        assert.equal(joinB.payload.stateView.status, 'setup', 'matched live route should expose setup before battle starts');
        assertTurnTimer(joinB.payload.stateView.turnTimer, 'setup', 'matched setup view');
        assertConnectionReport(joinB.payload.stateView.connectionReport, 'matched setup view');
        assertConnectionTempoReport(joinB.payload.stateView.connectionTempoReport, 'stable', 'matched setup view');
        assert.equal(joinB.payload.stateView.connectionTempoReport.canSubmitIntent, true, 'matched setup tempo should allow ready and mulligan intents');
        assert.equal(joinB.payload.stateView.connectionTempoReport.actionBoundary, 'continue_setup_action', 'matched setup tempo should name setup action boundary');
        assert.equal(joinB.payload.stateView.connectionReport.opponent.status, 'online', 'matched setup view should treat the opponent as online initially');
        assert.equal(joinB.payload.stateView.self.loadoutSummary.identitySlot, 'shield', 'matched self view should expose own locked identity slot');
        assertRankedOpponentConcealed(joinB.payload.stateView.opponent, 'matched ranked opponent view');
        assert.equal(joinB.payload.stateView.matchQuality.reportVersion, 'pvp-live-match-quality-v1', 'matched view should expose match quality report version');
        assert.equal(joinB.payload.stateView.matchQuality.tag, 'good', 'matched view should expose good match quality tag for MVP open pool');
        assert.equal(joinB.payload.stateView.matchQuality.expansionStage, 'mvp_open_pool', 'matched view should expose MVP open-pool expansion stage');
        assert.equal(joinB.payload.stateView.matchQuality.ratingDeltaBucket, 'unrated_mvp', 'matched view should bucket rating delta instead of exposing exact hidden rating');
        assert.ok(joinB.payload.stateView.matchQuality.waitMs.B >= 0, 'matched view should expose own queue wait in match quality report');
        assert.equal(joinB.payload.stateView.matchQuality.connectionHealth, 'pass', 'matched view should expose passed connection health instead of not_measured');
        assert.equal(joinB.payload.stateView.matchQuality.connectionHealthSummary?.status, 'pass', 'matched view should expose connection health summary status');
        assert.equal(joinB.payload.stateView.matchQuality.connectionHealthSummary?.sampleTag, 'client_preflight', 'matched view should expose preflight sample tag without network detail leakage');
        assert.ok(joinB.payload.stateView.matchQuality.safeguards.includes('connection_health_gate'), 'matched view should record connection health gate safeguard');
        assert.ok(!/rttP95Ms|missedHeartbeatCount|reconnectCount|sampleWindowMs|reasons/.test(JSON.stringify(joinB.payload.stateView.matchQuality)), 'matched view should not leak raw connection probe details');
        assert.equal(joinB.payload.stateView.firstMatchGuide.reportVersion, 'pvp-live-first-match-guide-v1', 'matched view should expose first-match guide report version');
        assert.ok(joinB.payload.stateView.firstMatchGuide.safeguards.includes('opening_protection'), 'matched view first-match guide should explain opening protection');
        assert.ok(joinB.payload.stateView.firstMatchGuide.steps.some(step => step.id === 'setup_ready'), 'matched view first-match guide should explain setup ready step');
        assert.ok(!/reward|rating|elo/i.test(JSON.stringify(joinB.payload.stateView.firstMatchGuide)), 'matched view first-match guide should not imply hidden reward or rating compensation');
        assert.equal(joinB.payload.stateView.openerAssignment?.reportVersion, 'pvp-live-opener-assignment-v1', 'matched view should expose authoritative opener assignment report');
        assert.equal(joinB.payload.stateView.openerAssignment?.sourceVisibility, 'server_authoritative_public_seed', 'opener assignment should be server-authoritative and public-seed scoped');
        assert.equal(joinB.payload.stateView.openerAssignment?.firstSeat, joinB.payload.stateView.setup?.firstSeat, 'opener assignment should match setup firstSeat');
        assert.ok(['A', 'B'].includes(joinB.payload.stateView.openerAssignment?.firstSeat), 'opener assignment should expose a legal first seat');
        assert.equal(joinB.payload.stateView.openerAssignment?.queueOrderBinding, false, 'opener assignment must not be bound to queue order');
        assert.equal(joinB.payload.stateView.openerAssignment?.hostBinding, false, 'opener assignment must not be bound to invite host');
        assert.ok(!/userId|loadout|hand|deck|rating|elo/i.test(JSON.stringify(joinB.payload.stateView.openerAssignment || {})), 'opener assignment should not leak hidden player data');

        const rejoinA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: loadoutAChanged }
        });
        assert.equal(rejoinA.payload.status, 'matched', 'player with an active live match should not re-enter waiting queue');
        assert.equal(rejoinA.payload.matchId, joinB.payload.matchId, 'active live match rejoin should return same match id');
        assert.equal(rejoinA.payload.stateView.self.loadoutHash, joinA.payload.loadoutHash, 'active match rejoin must preserve original locked loadout hash');
        assert.equal(rejoinA.payload.stateView.self.loadoutSummary.identitySlot, 'sword', 'active match rejoin must not change locked identity slot');

        const rejoinAActiveWithIllegalLoadout = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: illegalShortLoadout }
        });
        assert.equal(rejoinAActiveWithIllegalLoadout.status, 200, 'active player should not be rejected by a later illegal local loadout');
        assert.equal(rejoinAActiveWithIllegalLoadout.payload.matchId, joinB.payload.matchId, 'active illegal rejoin should return same match id');
        assert.equal(rejoinAActiveWithIllegalLoadout.payload.stateView.self.loadoutHash, joinA.payload.loadoutHash, 'active illegal rejoin should preserve locked loadout hash');

        const cancelMatchedTicket = await request(baseUrl, '/api/pvp/live/queue/cancel', {
            method: 'POST',
            token: tokenA,
            body: { queueTicket: joinA.payload.queueTicket }
        });
        assert.equal(cancelMatchedTicket.status, 404, 'matched queue ticket should not be cancellable as a waiting ticket');

        const pollWrongUser = await request(baseUrl, `/api/pvp/live/queue/status/${joinA.payload.queueTicket}`, {
            token: tokenB
        });
        assert.equal(pollWrongUser.status, 404, 'queue ticket should not be readable by another user');

        const pollA = await request(baseUrl, `/api/pvp/live/queue/status/${joinA.payload.queueTicket}`, {
            token: tokenA
        });
        assert.equal(pollA.status, 200, 'first player should poll queue status');
        assert.equal(pollA.payload.status, 'matched', 'first player should receive matched status');
        assert.equal(pollA.payload.matchId, joinB.payload.matchId, 'both seats should receive same match id');
        assert.equal(pollA.payload.seatId, 'A', 'first player should receive A seat');
        assert.equal(pollA.payload.stateView.status, 'setup', 'first player matched status should begin in setup');
        assertTurnTimer(pollA.payload.stateView.turnTimer, 'setup', 'first player setup poll');
        assertConnectionReport(pollA.payload.stateView.connectionReport, 'first player setup poll');
        assertConnectionTempoReport(pollA.payload.stateView.connectionTempoReport, 'stable', 'first player setup poll');
        assert.equal(pollA.payload.stateView.connectionTempoReport.canSubmitIntent, true, 'first player setup poll tempo should allow setup intents');
        assert.equal(pollA.payload.stateView.connectionReport.viewer.status, 'online', 'first player setup poll should treat viewer as online');
        assert.equal(pollA.payload.stateView.self.loadoutHash, joinA.payload.loadoutHash, 'first player matched status should expose own locked loadout hash');
        assertRankedOpponentConcealed(pollA.payload.stateView.opponent, 'first player ranked status opponent view');

        const heartbeatA = await heartbeat(baseUrl, tokenA, joinB.payload.matchId);
        assert.equal(heartbeatA.status, 200, 'heartbeat route should accept a participant heartbeat');
        assertConnectionReport(heartbeatA.payload.stateView.connectionReport, 'heartbeat response');
        assertConnectionTempoReport(heartbeatA.payload.stateView.connectionTempoReport, 'stable', 'heartbeat response');
        assert.equal(heartbeatA.payload.stateView.connectionTempoReport.canSubmitIntent, true, 'setup heartbeat tempo should allow setup intents');
        assert.equal(heartbeatA.payload.stateView.connectionReport.viewer.status, 'online', 'heartbeat response should mark the sender online');

        const connectionMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinB.payload.matchId);
        connectionMatch.connection.seats.B.lastHeartbeatAt = Date.now() - 20 * 1000;
        const connectionGraceA = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}`, {
            token: tokenA
        });
        assert.equal(connectionGraceA.status, 200, 'opponent grace state should stay readable');
        assertConnectionReport(connectionGraceA.payload.stateView.connectionReport, 'opponent grace state');
        assertConnectionTempoReport(connectionGraceA.payload.stateView.connectionTempoReport, 'opponent_setup_grace', 'opponent grace state');
        assert.equal(connectionGraceA.payload.stateView.connectionTempoReport.canSubmitIntent, true, 'opponent setup grace should still allow the connected viewer to submit setup intents');
        assert.equal(connectionGraceA.payload.stateView.connectionTempoReport.actionBoundary, 'continue_setup_action', 'opponent setup grace should keep the connected viewer setup action boundary');
        assert.equal(connectionGraceA.payload.stateView.connectionReport.opponent.status, 'grace', 'stale opponent should enter reconnect grace instead of immediate loss');
        assert.ok(connectionGraceA.payload.stateView.connectionReport.opponent.remainingGraceMs > 0, 'opponent grace state should expose remaining grace time');
        assert.equal(connectionGraceA.payload.stateView.status, 'setup', 'opponent grace should not end the match immediately');

        const heartbeatB = await heartbeat(baseUrl, tokenB, joinB.payload.matchId);
        assert.equal(heartbeatB.status, 200, 'stale participant should be able to reconnect with heartbeat');
        assert.equal(heartbeatB.payload.stateView.connectionReport.viewer.status, 'online', 'reconnected participant should become online');
        assertConnectionTempoReport(heartbeatB.payload.stateView.connectionTempoReport, 'stable', 'reconnected participant heartbeat');
        const connectionRecoveredA = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}`, {
            token: tokenA
        });
        assert.equal(connectionRecoveredA.payload.stateView.connectionReport.opponent.status, 'online', 'opponent heartbeat should recover the viewer-facing connection status');
        assertConnectionTempoReport(connectionRecoveredA.payload.stateView.connectionTempoReport, 'stable', 'opponent recovered state');

        const pollASecondRead = await request(baseUrl, `/api/pvp/live/queue/status/${joinA.payload.queueTicket}`, {
            token: tokenA
        });
        assert.equal(pollASecondRead.status, 404, 'matched queue ticket should be consumed after first successful matched poll');

        const outsiderState = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}`, {
            token: tokenC
        });
        assert.equal(outsiderState.status, 404, 'non-participant should not read live match state');

        const currentA = await request(baseUrl, '/api/pvp/live/matches/current', {
            token: tokenA
        });
        assert.equal(currentA.status, 200, 'participant should recover current live match without queue ticket');
        assert.equal(currentA.payload.matchId, joinB.payload.matchId, 'current live match should return active match id');
        assert.equal(currentA.payload.seatId, 'A', 'current live match should preserve participant seat');
        assert.ok(!Array.isArray(currentA.payload.stateView.opponent.hand), 'current live match view must not leak opponent hand');

        const emoteA = await submitIntent(baseUrl, tokenA, joinB.payload.matchId, {
            intentId: 'route-intent-emote-a-1',
            intentType: 'emote',
            stateVersion: currentA.payload.stateView.stateVersion,
            payload: { emoteId: 'respect' }
        });
        assert.equal(emoteA.status, 200, 'participant should be able to submit a preset emote');
        assert.equal(emoteA.payload.result, 'accepted', 'preset emote should be accepted');
        assert.equal(emoteA.payload.stateView.status, 'setup', 'preset emote should not change setup status');
        assert.equal(emoteA.payload.stateView.stateVersion, currentA.payload.stateView.stateVersion + 1, 'preset emote should advance public state version without starting combat');
        assert.ok(emoteA.payload.events.some(event => event.eventType === 'emote_sent' && eventPublicData(event).emoteId === 'respect'), 'preset emote should return public emote event');
        const emoteVisibleToB = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}`, {
            token: tokenB
        });
        assert.ok(emoteVisibleToB.payload.stateView.recentEvents.some(event => event.eventType === 'emote_sent' && eventPublicData(event).seatId === 'A'), 'opponent should see preset emote in public event feed');
        const emoteRateLimitedA = await submitIntent(baseUrl, tokenA, joinB.payload.matchId, {
            intentId: 'route-intent-emote-a-2',
            intentType: 'emote',
            stateVersion: emoteA.payload.stateView.stateVersion,
            payload: { emoteId: 'thinking' }
        });
        assert.equal(emoteRateLimitedA.payload.result, 'rejected', 'repeat emote should be rate limited');
        assert.equal(emoteRateLimitedA.payload.reason, 'emote_rate_limited', 'repeat emote should expose rate limit reason');
        const invalidEmoteA = await submitIntent(baseUrl, tokenA, joinB.payload.matchId, {
            intentId: 'route-intent-emote-a-invalid',
            intentType: 'emote',
            stateVersion: emoteA.payload.stateView.stateVersion,
            payload: { emoteId: 'free_text_payload' }
        });
        assert.equal(invalidEmoteA.payload.result, 'rejected', 'non-whitelisted emote should be rejected');
        assert.equal(invalidEmoteA.payload.reason, 'invalid_emote', 'non-whitelisted emote should expose invalid_emote reason');

        const currentOutsider = await request(baseUrl, '/api/pvp/live/matches/current', {
            token: tokenC
        });
        assert.equal(currentOutsider.status, 404, 'user without active live match should not receive current match');

        const setupPlayA = await submitIntent(baseUrl, tokenA, joinB.payload.matchId, {
            intentId: 'route-intent-setup-play-a-1',
            intentType: 'play_card',
            stateVersion: emoteA.payload.stateView.stateVersion,
            payload: { cardInstanceId: 'A-burst-1', targetSeat: 'B' }
        });
        assert.equal(setupPlayA.payload.result, 'rejected', 'setup phase should reject card play before ready');
        assert.equal(setupPlayA.payload.reason, 'setup_not_ready', 'setup card play should expose setup_not_ready reason');

        const readyMain = await readyBoth(baseUrl, {
            matchId: joinB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: emoteA.payload.stateView.stateVersion,
            prefix: 'route-main'
        });

        const activeMainMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinB.payload.matchId);
        forceActiveTurnStartedAt(activeMainMatch, Date.now() - 5000);
        const firstSeat = readyMain.payload.stateView.currentSeat;
        const secondSeat = firstSeat === 'A' ? 'B' : 'A';
        const firstToken = firstSeat === 'A' ? tokenA : tokenB;
        const secondToken = firstSeat === 'A' ? tokenB : tokenA;
        const firstBurstCard = firstSeat === 'A' ? 'A-burst-1' : 'B-burst-1';
        const secondStrikeCard = secondSeat === 'A' ? 'A-strike-1' : 'B-strike-1';
        const firstDisplayName = firstSeat === 'A' ? '甲' : '乙';
        const secondDisplayName = secondSeat === 'A' ? '甲' : '乙';
        const firstLoadout = firstSeat === 'A' ? loadoutA : loadoutB;
        const secondLoadout = secondSeat === 'A' ? loadoutA : loadoutB;
        const beforePlayTimerA = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}`, {
            token: firstToken
        });
        assertTurnTimer(beforePlayTimerA.payload.stateView.turnTimer, 'active', 'before live card play');
        const activeTurnStartedAt = beforePlayTimerA.payload.stateView.turnTimer.startedAt;
        const activeTurnDeadlineAt = beforePlayTimerA.payload.stateView.turnTimer.deadlineAt;

        const playA = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-burst-1',
                intentType: 'play_card',
                stateVersion: beforePlayTimerA.payload.stateView.stateVersion,
                payload: { cardInstanceId: firstBurstCard, targetSeat: secondSeat }
        });
        assert.equal(playA.status, 200, 'legal live PVP intent should return 200');
        assert.equal(playA.payload.result, 'accepted', 'legal live PVP intent should be accepted');
        assert.equal(playA.payload.stateView.turnTimer.startedAt, activeTurnStartedAt, 'accepted play_card should keep current turn timer start');
        assert.equal(playA.payload.stateView.turnTimer.deadlineAt, activeTurnDeadlineAt, 'accepted play_card should not extend current turn deadline');
        assert.equal(playA.payload.stateView.opponent.hp, 35, 'route should expose server-clamped opponent hp after public second-seat buffer');
        assert.ok(playA.payload.events.some(event => event.eventType === 'budget_clamped'), 'route should return clamp event');

        const routeDrawMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinB.payload.matchId);
        const routeDrawSeat = routeDrawMatch.state.seats[firstSeat];
        routeDrawSeat.energy = Math.max(routeDrawSeat.energy, RULES.cards.surgeStep.cost);
        routeDrawSeat.hand = [makeRouteLiveCard(`${firstSeat}-surgeStep-route-1`, 'surgeStep')];
        routeDrawSeat.deck = [makeRouteLiveCard(`${firstSeat}-hidden-draw-route-1`, 'pvp_strike')];
        const routeDraw = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-card-draw-1',
                intentType: 'play_card',
                stateVersion: playA.payload.stateView.stateVersion,
                payload: { cardInstanceId: `${firstSeat}-surgeStep-route-1`, targetSeat: secondSeat }
        });
        assert.equal(routeDraw.payload.result, 'accepted', 'route draw-tag card should resolve as a normal paid play_card intent');
        const routeDrawEvent = routeDraw.payload.events.find(event => event.eventType === 'card_cycled');
        assert.ok(routeDrawEvent, 'HTTP play_card response should include public card_cycled event');
        assert.deepEqual(Object.keys(routeDrawEvent.publicData || {}).sort(), ['capped', 'count', 'deckCount', 'handCount', 'seatId'], 'HTTP card_cycled event should expose only public draw count fields');
        assert.ok(!Object.prototype.hasOwnProperty.call(routeDrawEvent, 'payload'), 'HTTP card_cycled event must not return raw reducer payload');
        assert.ok(!/sourceCardId|effect|cardId|instanceId|hidden-draw|pvp_strike|hand":\[|deck":\[|rating|reward/i.test(JSON.stringify(routeDrawEvent)), 'HTTP card_cycled event must not leak internal card identity, effect tags, hand, deck, rating, or rewards');
        assert.equal(routeDraw.payload.stateView.actionReceiptReport?.cardDraw?.count, 1, 'route action receipt should preserve public card cycle count');
        assert.ok(!/sourceCardId|effect|cardId|instanceId|hidden-draw|pvp_strike|hand":\[|deck":\[|rating|reward/i.test(JSON.stringify(routeDraw.payload.stateView.actionReceiptReport?.cardDraw || {})), 'route cardDraw receipt must not leak internal card identity, effect tags, hand, deck, rating, or rewards');

        const routeGuardStanceMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinB.payload.matchId);
        const routeGuardStanceSeat = routeGuardStanceMatch.state.seats[firstSeat];
        routeGuardStanceSeat.energy = Math.max(routeGuardStanceSeat.energy, RULES.cards.pvp_guard.cost);
        routeGuardStanceSeat.hand = [makeRouteLiveCard(`${firstSeat}-guard-stance-route-1`, 'pvp_guard')];
        const routeGuardStance = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-guard-stance-1',
                intentType: 'play_card',
                stateVersion: routeDraw.payload.stateView.stateVersion,
                payload: { cardInstanceId: `${firstSeat}-guard-stance-route-1`, targetSeat: secondSeat }
        });
        assert.equal(routeGuardStance.payload.result, 'accepted', 'route guard card should resolve as a normal paid play_card intent');
        const routeGuardStanceEvent = routeGuardStance.payload.events.find(event => event.eventType === 'status_applied' && event.publicData?.statusId === 'guard_stance');
        assert.ok(routeGuardStanceEvent, 'HTTP play_card response should include public guard_stance event');
        assert.deepEqual(Object.keys(routeGuardStanceEvent.publicData || {}).sort(), ['appliedTurnIndex', 'earliestConsumeTurnIndex', 'expiresAtTurnIndex', 'label', 'mitigationAmount', 'responseWindow', 'seatId', 'sourceSeat', 'stacks', 'statusId'], 'HTTP guard_stance event should expose only public status fields');
        assert.equal(routeGuardStanceEvent.publicData.mitigationAmount, 2, 'HTTP guard_stance event should expose the public damage reduction amount');
        assert.ok(!Object.prototype.hasOwnProperty.call(routeGuardStanceEvent, 'payload'), 'HTTP guard_stance event must not return raw reducer payload');
        assert.ok(!/sourceCardId|cardId|instanceId|hand":\[|deck":\[|rating|reward/i.test(JSON.stringify(routeGuardStanceEvent)), 'HTTP guard_stance event must not leak internal card identity, hand, deck, rating, or rewards');
        assert.ok(routeGuardStance.payload.stateView.actionReceiptReport?.statusEffects?.applied?.some(status => status.statusId === 'guard_stance' && status.mitigationAmount === 2), 'route guard receipt should preserve public guard stance setup');

        const routeWeakFocusMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinB.payload.matchId);
        const routeWeakFocusSeat = routeWeakFocusMatch.state.seats[firstSeat];
        routeWeakFocusSeat.energy = Math.max(routeWeakFocusSeat.energy, RULES.cards.stormWard.cost);
        routeWeakFocusSeat.hand = [makeRouteLiveCard(`${firstSeat}-stormWard-weak-route-1`, 'stormWard')];
        const routeWeakFocus = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-weak-focus-1',
                intentType: 'play_card',
                stateVersion: routeGuardStance.payload.stateView.stateVersion,
                payload: { cardInstanceId: `${firstSeat}-stormWard-weak-route-1`, targetSeat: secondSeat }
        });
        assert.equal(routeWeakFocus.payload.result, 'accepted', 'route soft-control card should resolve as a normal paid play_card intent');
        const routeWeakFocusEvent = routeWeakFocus.payload.events.find(event => event.eventType === 'status_applied' && event.publicData?.statusId === 'weak_focus');
        assert.ok(routeWeakFocusEvent, 'HTTP play_card response should include public weak_focus event');
        assert.deepEqual(Object.keys(routeWeakFocusEvent.publicData || {}).sort(), ['appliedTurnIndex', 'earliestConsumeTurnIndex', 'expiresAtTurnIndex', 'label', 'mitigationAmount', 'responseWindow', 'seatId', 'sourceSeat', 'stacks', 'statusId'], 'HTTP weak_focus event should expose only public status fields');
        assert.equal(routeWeakFocusEvent.publicData.mitigationAmount, 2, 'HTTP weak_focus event should expose the public damage reduction amount');
        assert.ok(!Object.prototype.hasOwnProperty.call(routeWeakFocusEvent, 'payload'), 'HTTP weak_focus event must not return raw reducer payload');
        assert.ok(!/sourceCardId|cardId|instanceId|hand":\[|deck":\[|rating|reward/i.test(JSON.stringify(routeWeakFocusEvent)), 'HTTP weak_focus event must not leak internal card identity, hand, deck, rating, or rewards');
        assert.ok(routeWeakFocus.payload.stateView.actionReceiptReport?.statusEffects?.applied?.some(status => status.statusId === 'weak_focus' && status.mitigationAmount === 2), 'route weak_focus receipt should preserve public soft-control setup');

        const routeHealMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinB.payload.matchId);
        const routeHealSeat = routeHealMatch.state.seats[firstSeat];
        routeHealSeat.hp = 41;
        routeHealSeat.energy = Math.max(routeHealSeat.energy, RULES.cards.innerPeace.cost);
        routeHealSeat.hand = [makeRouteLiveCard(`${firstSeat}-innerPeace-heal-route-1`, 'innerPeace')];
        const routeHeal = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-heal-1',
                intentType: 'play_card',
                stateVersion: routeWeakFocus.payload.stateView.stateVersion,
                payload: { cardInstanceId: `${firstSeat}-innerPeace-heal-route-1`, targetSeat: secondSeat }
        });
        assert.equal(routeHeal.payload.result, 'accepted', 'route heal card should resolve as a normal paid play_card intent');
        const routeHealEvent = routeHeal.payload.events.find(event => event.eventType === 'hp_recovered');
        assert.ok(routeHealEvent, 'HTTP play_card response should include public hp_recovered event');
        assert.deepEqual(Object.keys(routeHealEvent.publicData || {}).sort(), ['capped', 'hp', 'maxHp', 'recoveredHp', 'seatId'], 'HTTP hp_recovered event should expose only public hp fields');
        assert.equal(routeHealEvent.publicData.recoveredHp, 3, 'HTTP hp_recovered event should expose the public recovered hp amount');
        assert.equal(routeHealEvent.publicData.hp, 44, 'HTTP hp_recovered event should expose the public post-heal hp');
        assert.ok(!Object.prototype.hasOwnProperty.call(routeHealEvent, 'payload'), 'HTTP hp_recovered event must not return raw reducer payload');
        assert.ok(!/sourceCardId|cardId|instanceId|hand":\[|deck":\[|rating|reward/i.test(JSON.stringify(routeHealEvent)), 'HTTP hp_recovered event must not leak internal card identity, hand, deck, rating, or rewards');
        assert.ok(routeHeal.payload.stateView.actionReceiptReport?.healing?.recoveredHp === 3, 'route heal receipt should preserve public recovered hp');
        assert.ok(!/sourceCardId|cardId|instanceId|hand":\[|deck":\[|rating|reward/i.test(JSON.stringify(routeHeal.payload.stateView.actionReceiptReport?.healing || {})), 'route heal receipt must not leak internal card identity, hand, deck, rating, or rewards');

        const duplicateA = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-burst-1',
                intentType: 'play_card',
                stateVersion: readyMain.payload.stateView.stateVersion,
                payload: { cardInstanceId: firstBurstCard, targetSeat: secondSeat }
        });
        assert.equal(duplicateA.payload.result, 'duplicate', 'same live intent should be idempotent');
        assert.equal(duplicateA.payload.stateView.opponent.hp, 35, 'duplicate live intent must not damage twice');

        const wrongSeatB = await submitIntent(baseUrl, secondToken, joinB.payload.matchId, {
                intentId: 'route-intent-wrong-seat-1',
                intentType: 'play_card',
                stateVersion: routeHeal.payload.stateView.stateVersion,
                payload: { cardInstanceId: secondStrikeCard, targetSeat: firstSeat }
        });
        assert.equal(wrongSeatB.payload.result, 'rejected', 'non-current live seat action should be rejected');
        assert.equal(wrongSeatB.payload.reason, 'not_current_turn', 'non-current live seat should receive not_current_turn reason');

        const endTurnA = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-end-turn-1',
                intentType: 'end_turn',
                stateVersion: routeHeal.payload.stateView.stateVersion,
                payload: {}
        });
        assert.equal(endTurnA.payload.result, 'accepted', 'current live seat should end turn');
        assert.equal(endTurnA.payload.stateView.currentSeat, secondSeat, 'end turn should switch current live seat');
        assertTurnTimer(endTurnA.payload.stateView.turnTimer, 'active', 'end turn response');
        assert.equal(endTurnA.payload.stateView.turnTimer.currentSeat, secondSeat, 'end turn timer should switch to next seat');
        assert.ok(endTurnA.payload.stateView.turnTimer.startedAt > activeTurnStartedAt, 'end turn should start a fresh timer for next seat');
        assert.ok(endTurnA.payload.stateView.turnTimer.deadlineAt > activeTurnDeadlineAt, 'end turn should move deadline to next seat timer');

        const staleAAfterEnd = await submitIntent(baseUrl, firstToken, joinB.payload.matchId, {
                intentId: 'route-intent-a-after-end-1',
                intentType: 'play_card',
                stateVersion: endTurnA.payload.stateView.stateVersion,
                payload: { cardInstanceId: firstSeat === 'A' ? 'A-strike-1' : 'B-strike-1', targetSeat: secondSeat }
        });
        assert.equal(staleAAfterEnd.payload.result, 'rejected', 'first seat should not act after ending turn');
        assert.equal(staleAAfterEnd.payload.reason, 'not_current_turn', 'first seat after end turn should receive not_current_turn reason');

        const stateB = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}`, {
            token: secondToken
        });
        assert.equal(stateB.status, 200, 'opponent should fetch live match state');
        assert.equal(stateB.payload.stateView.self.hp, 35, 'opponent self view should include own damaged hp after public second-seat buffer');
        assert.ok(Array.isArray(stateB.payload.stateView.self.hand), 'self view should expose own hand');
        assert.ok(!Array.isArray(stateB.payload.stateView.opponent.hand), 'opponent view must still hide hand after state update');

        const surrenderB = await submitIntent(baseUrl, secondToken, joinB.payload.matchId, {
                intentId: 'route-intent-surrender-b-1',
                intentType: 'surrender',
                stateVersion: endTurnA.payload.stateView.stateVersion,
                payload: {}
        });
        assert.equal(surrenderB.status, 200, 'participant should be able to surrender through live route');
        assert.equal(surrenderB.payload.result, 'accepted', 'live surrender should be accepted');
        assert.equal(surrenderB.payload.stateView.status, 'finished', 'live surrender should finish match');
        assert.ok(surrenderB.payload.events.some(event => event.eventType === 'player_surrendered'), 'live surrender should return public surrender event');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.reportVersion, 'pvp-live-post-match-review-v1', 'live surrender should expose post-match review version');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.result, 'loss', 'surrendering live seat should receive a loss review');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.finishReason, 'surrender', 'surrender review should expose surrender finish reason');
        assert.ok(surrenderB.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'queue_again'), 'surrender review should include queue again next action');
        assert.ok(surrenderB.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'friendly_rematch'), 'surrender review should include friendly rematch next action');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.reportVersion, 'pvp-live-settlement-report-v1', 'ranked surrender review should expose authoritative settlement report');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.sourceVisibility, 'server_authoritative_settlement', 'ranked surrender settlement report should expose server authoritative source visibility');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.settlementSource, 'live_ranked', 'ranked surrender settlement report should identify live ranked source');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.formalResultPolicy, 'ranked_authoritative', 'ranked surrender settlement report should be formal authoritative');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.result, 'loss', 'surrendering seat should see its own loss settlement');
        assert.ok(surrenderB.payload.stateView.postMatchReview?.settlementReport?.ratingDelta < 0, 'surrendering seat should see negative score delta');
        assert.ok(surrenderB.payload.stateView.postMatchReview?.settlementReport?.coinsAwarded > 0, 'surrendering seat should still see participation reward');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.reportVersion, 'pvp-live-season-honor-v1', 'ranked surrender settlement report should include season honor progress');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.powerImpact, 'none', 'ranked season honor progress should not grant combat power');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.reportVersion, 'pvp-live-season-honor-reward-v1', 'ranked surrender season honor should include cosmetic-only reward track');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.rewardImpact, 'cosmetic_only', 'ranked season honor reward should be cosmetic only');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.powerImpact, 'none', 'ranked season honor reward should not grant combat power');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionState, 'newly_unlocked', 'ranked season honor reward should expose new collection unlock state');
        assert.equal(surrenderB.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport?.cosmeticReward?.collectionReport?.reportVersion, 'pvp-live-season-honor-collection-v1', 'ranked season honor reward should include collection report');

        const rematchA = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            method: 'POST',
            token: firstToken,
            body: { displayName: firstDisplayName, loadout: firstLoadout }
        });
        assert.equal(rematchA.status, 200, 'winner should be able to request a friendly rematch from the finished live match');
        assert.equal(rematchA.payload.status, 'waiting_rematch', 'first friendly rematch request should wait for the original opponent');
        assert.equal(rematchA.payload.friendlySeries?.reportVersion, 'pvp-live-friendly-series-v1', 'friendly rematch wait should expose friendly series report version');
        assert.equal(rematchA.payload.friendlySeries?.rankedImpact, 'none', 'friendly rematch wait should not imply ranked impact');
        assert.equal(rematchA.payload.friendlySeries?.sourceMatchId, joinB.payload.matchId, 'friendly rematch should link to the source live match');
        assert.ok(!/reward|rating|elo/i.test(JSON.stringify(rematchA.payload.friendlySeries || {})), 'friendly rematch waiting report must not promise reward or exact rating compensation');

        const rematchStatusA = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            token: firstToken
        });
        assert.equal(rematchStatusA.status, 200, 'friendly rematch requester should be able to read pending rematch status');
        assert.equal(rematchStatusA.payload.status, 'waiting_rematch', 'pending rematch status should remain waiting before opponent accepts');
        assert.equal(rematchStatusA.payload.friendlySeries?.seriesId, rematchA.payload.friendlySeries?.seriesId, 'pending rematch status should preserve series id');

        const outsiderCancelRematch = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch/cancel`, {
            method: 'POST',
            token: tokenC
        });
        assert.equal(outsiderCancelRematch.status, 404, 'non-participant should not be able to cancel a pending friendly rematch');

        const opponentCancelRematch = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch/cancel`, {
            method: 'POST',
            token: secondToken
        });
        assert.equal(opponentCancelRematch.status, 404, 'non-requesting opponent should not cancel a pending friendly rematch by surprise');

        const cancelledRematchA = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch/cancel`, {
            method: 'POST',
            token: firstToken
        });
        assert.equal(cancelledRematchA.status, 200, 'friendly rematch requester should be able to cancel pending rematch');
        assert.equal(cancelledRematchA.payload.status, 'cancelled', 'cancelled friendly rematch should return cancelled status');
        assert.equal(cancelledRematchA.payload.reason, 'rematch_cancelled', 'cancelled friendly rematch should expose stable reason');
        assert.equal(cancelledRematchA.payload.friendlySeries?.status, 'cancelled', 'cancelled friendly rematch should project cancelled series status');

        const statusAfterCancel = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            token: firstToken
        });
        assert.equal(statusAfterCancel.status, 404, 'cancelled friendly rematch should no longer expose a pending status');
        assert.equal(statusAfterCancel.payload.reason, 'no_pending_rematch', 'cancelled friendly rematch status should expose stable missing reason');

        const rematchBWait = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            method: 'POST',
            token: secondToken,
            body: { displayName: secondDisplayName, loadout: secondLoadout }
        });
        assert.equal(rematchBWait.status, 200, 'opponent should be able to start a fresh rematch after requester cancellation');
        assert.equal(rematchBWait.payload.status, 'waiting_rematch', 'fresh rematch after cancellation should wait instead of matching stale cancelled request');

        const outsiderRematch = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            method: 'POST',
            token: tokenC,
            body: { displayName: '丙' }
        });
        assert.equal(outsiderRematch.status, 404, 'non-participant should not be able to join a friendly rematch');

        const rematchB = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            method: 'POST',
            token: firstToken,
            body: { displayName: firstDisplayName, loadout: firstLoadout }
        });
        assert.equal(rematchB.status, 200, 'loser should be able to accept the friendly rematch');
        assert.equal(rematchB.payload.status, 'matched', 'second friendly rematch request should create a new live match');
        assert.notEqual(rematchB.payload.matchId, joinB.payload.matchId, 'friendly rematch should create a new match id');
        assert.equal(rematchB.payload.stateView.mode, 'friendly', 'friendly rematch state view should mark low-pressure friendly mode');
        assert.equal(rematchB.payload.stateView.friendlySeries?.reportVersion, 'pvp-live-friendly-series-v1', 'friendly rematch match should expose friendly series report');
        assert.equal(rematchB.payload.stateView.friendlySeries?.sourceMatchId, joinB.payload.matchId, 'friendly rematch match should retain source match id');
        assert.equal(rematchB.payload.stateView.friendlySeries?.rankedImpact, 'none', 'friendly rematch match should not imply ranked impact');
        assert.equal(rematchB.payload.stateView.friendlySeries?.targetWins, 2, 'friendly rematch match should expose Bo3 target wins');
        assert.deepEqual(rematchB.payload.stateView.friendlySeries?.scoreBySourceSeat, firstSeat === 'A' ? { A: 1, B: 0 } : { A: 0, B: 1 }, 'friendly rematch match should carry source score into Bo3');
        assert.equal(rematchB.payload.stateView.friendlySeries?.roundIndex, 2, 'friendly rematch match should be Bo3 round 2');
        assert.ok(rematchB.payload.stateView.firstMatchGuide?.safeguards?.includes('friendly_no_ranked_impact'), 'friendly rematch guide should explain no-ranked-impact safeguard');
        assert.equal(rematchB.payload.stateView.openerAssignment?.policy, 'friendly_series_rotating_opener', 'friendly rematch should use source-seat alternating opener policy');
        assert.equal(rematchB.payload.stateView.openerAssignment?.firstSeat, joinB.payload.stateView.openerAssignment?.firstSeat, 'friendly rematch should keep the first-seat slot so swapped source players alternate opening windows');
        assert.equal(rematchB.payload.stateView.friendlySeries?.openerPolicy, 'friendly_series_rotating_opener', 'friendly rematch series should expose alternating opener policy');
        assert.equal(rematchB.payload.stateView.friendlySeries?.openingFirstSourceSeat, joinB.payload.stateView.openerAssignment?.firstSeat, 'friendly rematch should remember the source match opening source seat');
        assert.equal(rematchB.payload.stateView.friendlySeries?.roundFirstSourceSeat, secondSeat, 'friendly rematch round 2 should rotate first source seat');
        assert.equal(rematchB.payload.stateView.self?.seatId, firstSeat === 'A' ? 'B' : 'A', 'friendly rematch requester should swap seats from the source match');
        assert.equal(currentSeatUserId(rematchB.payload.stateView, 'A'), 'live-user-b', 'friendly rematch round 2 should put original source B on runtime seat A');
        assert.equal(currentSeatUserId(rematchB.payload.stateView, 'B'), 'live-user-a', 'friendly rematch round 2 should put original source A on runtime seat B');
        assert.equal(currentSeatUserId(rematchB.payload.stateView, firstSeat), firstSeat === 'A' ? 'live-user-b' : 'live-user-a', 'friendly rematch first-seat slot should now belong to the opposite source player');
        assert.ok(/换边|轮换/.test(rematchB.payload.stateView.openerAssignment?.boundaryLine || ''), 'friendly rematch opener assignment should explain seat rotation boundary');
        assert.ok(rematchB.payload.stateView.friendlySeries?.safeguards?.includes('alternating_opener'), 'friendly series should expose alternating opener safeguard');
        assert.ok(!/userId|reward|rating|elo/i.test(JSON.stringify(rematchB.payload.stateView.friendlySeries || {})), 'friendly rematch match report must not expose userId, reward, or exact rating compensation');

        const currentAfterRematchA = await request(baseUrl, '/api/pvp/live/matches/current', {
            token: secondToken
        });
        assert.equal(currentAfterRematchA.status, 200, 'friendly rematch requester should recover accepted rematch through current match');
        assert.equal(currentAfterRematchA.payload.matchId, rematchB.payload.matchId, 'friendly rematch requester current match should point to the accepted friendly match');
        assert.equal(currentAfterRematchA.payload.stateView.mode, 'friendly', 'friendly rematch requester current match should keep friendly mode');
        assert.equal(currentAfterRematchA.payload.stateView.friendlySeries?.sourceMatchId, joinB.payload.matchId, 'friendly rematch requester current match should retain source match link');

        const requeueAfterFinish = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: secondToken,
            body: { displayName: secondDisplayName }
        });
        assert.equal(requeueAfterFinish.payload.status, 'matched', 'accepted friendly rematch should become the current live match instead of opening a parallel queue');
        assert.equal(requeueAfterFinish.payload.matchId, rematchB.payload.matchId, 'friendly rematch should be returned as the active live match');
        assert.equal(requeueAfterFinish.payload.stateView.mode, 'friendly', 'current live match should keep friendly mode');

        const friendlyReady = await readyBoth(baseUrl, {
            matchId: rematchB.payload.matchId,
            tokenA: tokenB,
            tokenB: tokenA,
            stateVersionA: rematchB.payload.stateView.stateVersion,
            prefix: 'route-friendly-bo3'
        });
        const friendlySurrenderA = await submitIntent(baseUrl, firstToken, rematchB.payload.matchId, {
            intentId: 'route-friendly-bo3-surrender-a-1',
            intentType: 'surrender',
            stateVersion: friendlyReady.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(friendlySurrenderA.payload.result, 'accepted', 'friendly Bo3 round 2 surrender should be accepted');
        assert.deepEqual(friendlySurrenderA.payload.stateView.postMatchReview?.friendlySeries?.scoreBySourceSeat, { A: 1, B: 1 }, 'friendly Bo3 round 2 should update tied source score');
        assert.equal(friendlySurrenderA.payload.stateView.postMatchReview?.friendlySeries?.canRequestNextRound, true, 'tied Bo3 should allow a decider rematch');
        assert.ok(friendlySurrenderA.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'friendly_rematch'), 'tied Bo3 review should expose decider action');
        assert.equal(friendlySurrenderA.payload.stateView.postMatchReview?.settlementReport, null, 'friendly review must not expose formal ranked settlement report');
        assert.equal(friendlySurrenderA.payload.stateView.postMatchReview?.settlementReport?.seasonHonorReport, undefined, 'friendly review must not expose ranked season honor progress');

        const friendlyDrawWait = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙', loadout: loadoutB }
        });
        assert.equal(friendlyDrawWait.status, 200, 'friendly draw setup should allow first participant to request rematch');
        assert.equal(friendlyDrawWait.payload.status, 'waiting_rematch', 'friendly draw setup first rematch should wait');
        const friendlyDrawMatch = await request(baseUrl, `/api/pvp/live/matches/${joinB.payload.matchId}/rematch`, {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: loadoutA }
        });
        assert.equal(friendlyDrawMatch.status, 200, 'friendly draw setup should create a friendly match after both confirm');
        const friendlyDrawSourceScore = friendlyDrawMatch.payload.stateView.friendlySeries?.scoreBySourceSeat;
        const friendlyDrawReady = await readyBoth(baseUrl, {
            matchId: friendlyDrawMatch.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: friendlyDrawMatch.payload.stateView.stateVersion,
            prefix: 'route-friendly-round14-draw'
        });
        const friendlyDrawRuntimeMatch = pvpLiveRoutes.__livePvpStore.matches.get(friendlyDrawMatch.payload.matchId);
        friendlyDrawRuntimeMatch.state.roundIndex = 14;
        friendlyDrawRuntimeMatch.state.turnIndex = 28;
        friendlyDrawRuntimeMatch.state.currentSeat = 'B';
        friendlyDrawRuntimeMatch.state.seats.A.hp = 30;
        friendlyDrawRuntimeMatch.state.seats.B.hp = 30;
        const friendlyDrawViewTokenA = await request(baseUrl, `/api/pvp/live/matches/${friendlyDrawMatch.payload.matchId}`, {
            token: tokenA
        });
        const friendlyDrawViewTokenB = await request(baseUrl, `/api/pvp/live/matches/${friendlyDrawMatch.payload.matchId}`, {
            token: tokenB
        });
        const friendlyDrawTokenByRuntimeSeat = {
            [friendlyDrawViewTokenA.payload.stateView.self.seatId]: tokenA,
            [friendlyDrawViewTokenB.payload.stateView.self.seatId]: tokenB
        };
        const friendlyDrawEndSeat = friendlyDrawRuntimeMatch.state.currentSeat;
        const friendlyDrawEndToken = friendlyDrawTokenByRuntimeSeat[friendlyDrawEndSeat];
        const friendlyRound14Draw = await submitIntent(baseUrl, friendlyDrawEndToken, friendlyDrawMatch.payload.matchId, {
            intentId: `route-friendly-round14-draw-end-${friendlyDrawEndSeat.toLowerCase()}`,
            intentType: 'end_turn',
            stateVersion: friendlyDrawReady.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(friendlyRound14Draw.payload.result, 'accepted', 'friendly round14 draw final end turn should be accepted');
        assert.equal(friendlyRound14Draw.payload.stateView.postMatchReview?.result, 'draw', 'friendly round14 draw should expose draw review');
        assert.deepEqual(friendlyRound14Draw.payload.stateView.postMatchReview?.friendlySeries?.scoreBySourceSeat, friendlyDrawSourceScore, 'friendly round14 draw should not award either Bo3 side');
        assert.equal(friendlyRound14Draw.payload.stateView.postMatchReview?.friendlySeries?.canRequestNextRound, true, 'friendly round14 draw should keep next-round rematch available');
        assert.ok(friendlyRound14Draw.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'friendly_rematch'), 'friendly round14 draw review should expose next-round rematch action');

        const longSeriesSourceMatch = pvpLiveRoutes.__livePvpStore.matches.get(rematchB.payload.matchId);
        longSeriesSourceMatch.state.friendlySeries.createdAt = Date.now() - pvpLiveRoutes.__livePvpStore.rematchTtlMs - 1000;
        const deciderWait = await request(baseUrl, `/api/pvp/live/matches/${rematchB.payload.matchId}/rematch`, {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙', loadout: loadoutB }
        });
        assert.equal(deciderWait.status, 200, 'friendly winner should be able to request Bo3 decider');
        assert.equal(deciderWait.payload.status, 'waiting_rematch', 'first Bo3 decider request should wait');
        assert.equal(deciderWait.payload.friendlySeries?.seriesId, rematchB.payload.stateView.friendlySeries?.seriesId, 'Bo3 decider should keep the original series id');
        assert.deepEqual(deciderWait.payload.friendlySeries?.scoreBySourceSeat, { A: 1, B: 1 }, 'Bo3 decider wait should carry tied score');
        assert.equal(deciderWait.payload.friendlySeries?.createdAt, longSeriesSourceMatch.state.friendlySeries.createdAt, 'Bo3 decider should keep the original series created time for display');

        const deciderPendingStatus = await request(baseUrl, `/api/pvp/live/matches/${rematchB.payload.matchId}/rematch`, {
            token: tokenB
        });
        assert.equal(deciderPendingStatus.status, 200, 'fresh Bo3 decider pending should not expire just because the series is old');
        assert.equal(deciderPendingStatus.payload.status, 'waiting_rematch', 'fresh Bo3 decider pending should remain readable while waiting for opponent');

        const deciderMatch = await request(baseUrl, `/api/pvp/live/matches/${rematchB.payload.matchId}/rematch`, {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: loadoutA }
        });
        assert.equal(deciderMatch.status, 200, 'friendly loser should be able to accept Bo3 decider');
        assert.equal(deciderMatch.payload.status, 'matched', 'Bo3 decider accept should create a live match');
        assert.equal(deciderMatch.payload.stateView.mode, 'friendly', 'Bo3 decider should stay friendly');
        assert.equal(deciderMatch.payload.stateView.friendlySeries?.seriesId, rematchB.payload.stateView.friendlySeries?.seriesId, 'Bo3 decider match should keep same series id');
        assert.equal(deciderMatch.payload.stateView.friendlySeries?.roundIndex, 3, 'Bo3 decider should be round 3');
        assert.equal(deciderMatch.payload.stateView.openerAssignment?.policy, 'friendly_series_rotating_opener', 'Bo3 decider should keep source-seat alternating opener policy');
        assert.equal(deciderMatch.payload.stateView.openerAssignment?.firstSeat, joinB.payload.stateView.openerAssignment?.firstSeat, 'Bo3 decider should keep the first-seat slot so source players alternate across the seat-rotation series');
        assert.equal(deciderMatch.payload.stateView.friendlySeries?.openingFirstSourceSeat, joinB.payload.stateView.openerAssignment?.firstSeat, 'Bo3 decider should preserve the original source opening seat');
        assert.equal(deciderMatch.payload.stateView.friendlySeries?.roundFirstSourceSeat, joinB.payload.stateView.openerAssignment?.firstSeat, 'Bo3 decider should rotate source first seat back for round 3');
        assert.equal(currentSeatUserId(deciderMatch.payload.stateView, 'A'), 'live-user-a', 'Bo3 decider should put original source A back on runtime seat A');
        assert.equal(currentSeatUserId(deciderMatch.payload.stateView, 'B'), 'live-user-b', 'Bo3 decider should put original source B back on runtime seat B');
        assert.equal(currentSeatUserId(deciderMatch.payload.stateView, firstSeat), firstSeat === 'A' ? 'live-user-a' : 'live-user-b', 'Bo3 decider first-seat slot should swap back to the original source first-seat player');
        assert.ok(deciderMatch.payload.stateView.friendlySeries?.safeguards?.includes('alternating_opener'), 'Bo3 decider series should preserve alternating opener safeguard');
        assert.ok(!/userId|reward|rating|elo/i.test(JSON.stringify(deciderMatch.payload.stateView.friendlySeries || {})), 'Bo3 decider report must not expose userId, reward, or exact rating compensation');

        const deciderReady = await readyBoth(baseUrl, {
            matchId: deciderMatch.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: deciderMatch.payload.stateView.stateVersion,
            prefix: 'route-friendly-bo3-decider'
        });
        const deciderSurrenderB = await submitIntent(baseUrl, tokenB, deciderMatch.payload.matchId, {
            intentId: 'route-friendly-bo3-decider-surrender-b-1',
            intentType: 'surrender',
            stateVersion: deciderReady.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(deciderSurrenderB.payload.result, 'accepted', 'Bo3 decider surrender should be accepted');
        assert.deepEqual(deciderSurrenderB.payload.stateView.postMatchReview?.friendlySeries?.scoreBySourceSeat, { A: 2, B: 1 }, 'Bo3 decider should close at 2-1');
        assert.equal(deciderSurrenderB.payload.stateView.postMatchReview?.friendlySeries?.seriesStatus, 'complete', 'Bo3 decider should mark series complete');
        assert.equal(deciderSurrenderB.payload.stateView.postMatchReview?.friendlySeries?.canRequestNextRound, false, 'completed Bo3 should not allow next round');
        assert.ok(!deciderSurrenderB.payload.stateView.postMatchReview?.nextActions?.some(action => action.id === 'friendly_rematch'), 'completed Bo3 review should remove decider action');

        const blockedAfterSeries = await request(baseUrl, `/api/pvp/live/matches/${deciderMatch.payload.matchId}/rematch`, {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: loadoutA }
        });
        assert.equal(blockedAfterSeries.status, 404, 'completed Bo3 should reject another friendly rematch');

        pvpLiveRoutes.__livePvpStore.reset();
        const routeTestMatchScope = 'route_protected_counterplay';
        const previousQueueTestMode = process.env.DEFIER_PVP_TEST_MODE;
        process.env.DEFIER_PVP_TEST_MODE = '1';
        const joinProtectA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲', loadout: loadoutA, testMatchScope: routeTestMatchScope }
        });
        assert.equal(joinProtectA.payload.status, 'waiting', 'opening protection first player should wait');
        const joinProtectB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙', loadout: loadoutB, testMatchScope: routeTestMatchScope }
        });
        if (previousQueueTestMode === undefined) delete process.env.DEFIER_PVP_TEST_MODE;
        else process.env.DEFIER_PVP_TEST_MODE = previousQueueTestMode;
        assert.equal(joinProtectB.payload.status, 'matched', 'opening protection second player should match');
        const readyProtect = await readyBoth(baseUrl, {
            matchId: joinProtectB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinProtectB.payload.stateView.stateVersion,
            prefix: 'route-opening-protection'
        });
        const protectFirstSeat = readyProtect.payload.stateView.currentSeat;
        const protectSecondSeat = protectFirstSeat === 'A' ? 'B' : 'A';
        const protectFirstToken = protectFirstSeat === 'A' ? tokenA : tokenB;
        const protectSecondToken = protectSecondSeat === 'A' ? tokenA : tokenB;
        const protectFirstBurstCard = `${protectFirstSeat}-burst-1`;
        const protectSecondBurstCard = `${protectSecondSeat}-burst-1`;
        const routePreviewFirst = await request(baseUrl, `/api/pvp/live/matches/${joinProtectB.payload.matchId}`, {
            token: protectFirstToken
        });
        assert.equal(routePreviewFirst.payload.stateView.actionPreviewReport?.reportVersion, 'pvp-live-action-preview-v1', 'route state view should expose authoritative action preview report');
        assert.equal(routePreviewFirst.payload.stateView.actionPreviewReport?.sourceVisibility, 'viewer_public_state', 'route action preview should be viewer-scoped public state');
        assert.equal(routePreviewFirst.payload.stateView.actionPreviewReport?.usesHiddenInformation, false, 'route action preview must not use hidden information');
        assert.equal(routePreviewFirst.payload.stateView.actionPreviewReport?.rankedImpact, 'none', 'route action preview should not write ranked result');
        assert.equal(routePreviewFirst.payload.stateView.actionPreviewReport?.viewerSeat, protectFirstSeat, 'route acting preview should be scoped to first seat viewer');
        assert.equal(routePreviewFirst.payload.stateView.actionPreviewReport?.currentSeat, protectFirstSeat, 'route acting preview should identify dynamic first actor');
        const routeBurstPreview = routePreviewFirst.payload.stateView.actionPreviewReport?.playableCards?.find(card => card.cardInstanceId === protectFirstBurstCard);
        assert.ok(routeBurstPreview, `route action preview should include ${protectFirstBurstCard} for acting first seat`);
        assert.equal(routeBurstPreview.damageBudget, 18, 'route action preview should expose first-action budget');
        assert.equal(routeBurstPreview.blockedDamage, 3, 'route action preview should account for public second-seat shield');
        assert.equal(routeBurstPreview.targetHpAfter, 35, 'route action preview should expose expected target HP');
        const routePreviewSecond = await request(baseUrl, `/api/pvp/live/matches/${joinProtectB.payload.matchId}`, {
            token: protectSecondToken
        });
        assert.equal(routePreviewSecond.payload.stateView.actionPreviewReport?.reportVersion, 'pvp-live-action-preview-v1', 'route non-acting state view should still expose preview report envelope');
        assert.equal(routePreviewSecond.payload.stateView.actionPreviewReport?.viewerSeat, protectSecondSeat, 'route non-acting preview should be scoped to second-seat viewer');
        assert.equal(routePreviewSecond.payload.stateView.actionPreviewReport?.currentSeat, protectFirstSeat, 'route non-acting preview should identify current actor');
        assert.equal(routePreviewSecond.payload.stateView.actionPreviewReport?.isViewerTurn, false, 'route non-acting preview should not mark viewer turn');
        assert.deepEqual(routePreviewSecond.payload.stateView.actionPreviewReport?.playableCards, [], 'route non-acting preview must not expose acting seat card projections');
        assert.equal(routePreviewSecond.payload.stateView.actionPreviewReport?.endTurn, null, 'route non-acting preview must not expose actionable end-turn projection');
        const blockedTestForce = await request(baseUrl, `/api/pvp/live/test/matches/${joinProtectB.payload.matchId}/seats/${protectSecondSeat}`, {
            method: 'POST',
            token: protectFirstToken,
            body: { hp: 10, testMatchScope: routeTestMatchScope }
        });
        assert.equal(blockedTestForce.status, 404, 'live PVP test-only state route should stay unavailable outside DEFIER_PVP_TEST_MODE');
        const previousProdMode = process.env.NODE_ENV;
        const previousProdTestMode = process.env.DEFIER_PVP_TEST_MODE;
        process.env.NODE_ENV = 'production';
        process.env.DEFIER_PVP_TEST_MODE = '1';
        const blockedProductionTestForce = await request(baseUrl, `/api/pvp/live/test/matches/${joinProtectB.payload.matchId}/seats/${protectSecondSeat}`, {
            method: 'POST',
            token: protectFirstToken,
            body: { hp: 10, testMatchScope: routeTestMatchScope }
        });
        if (previousProdMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousProdMode;
        if (previousProdTestMode === undefined) delete process.env.DEFIER_PVP_TEST_MODE;
        else process.env.DEFIER_PVP_TEST_MODE = previousProdTestMode;
        assert.equal(blockedProductionTestForce.status, 404, 'live PVP test-only state route should stay unavailable in production even when test mode is set');
        const previousTestMode = process.env.DEFIER_PVP_TEST_MODE;
        process.env.DEFIER_PVP_TEST_MODE = '1';
        const routeDisconnectedHeartbeatElapsedMs = pvpLiveRoutes.__livePvpStore.heartbeatStaleMs + pvpLiveRoutes.__livePvpStore.reconnectGraceMs + 1000;
        const blockedMissingScopeForce = await request(baseUrl, `/api/pvp/live/test/matches/${joinProtectB.payload.matchId}/seats/${protectSecondSeat}`, {
            method: 'POST',
            token: protectFirstToken,
            body: { hp: 10 }
        });
        const routeForceConnectionDisconnected = await request(baseUrl, `/api/pvp/live/test/matches/${joinProtectB.payload.matchId}/seats/${protectSecondSeat}`, {
            method: 'POST',
            token: protectFirstToken,
            body: { heartbeatElapsedMs: routeDisconnectedHeartbeatElapsedMs, testMatchScope: routeTestMatchScope }
        });
        const routeForceProtectedSecond = await request(baseUrl, `/api/pvp/live/test/matches/${joinProtectB.payload.matchId}/seats/${protectSecondSeat}`, {
            method: 'POST',
            token: protectFirstToken,
            body: { hp: 10, heartbeatElapsedMs: 0, testMatchScope: routeTestMatchScope }
        });
        if (previousTestMode === undefined) delete process.env.DEFIER_PVP_TEST_MODE;
        else process.env.DEFIER_PVP_TEST_MODE = previousTestMode;
        assert.equal(blockedMissingScopeForce.status, 404, 'live PVP test-only state route should reject scoped test matches without matching testMatchScope');
        assert.equal(routeForceConnectionDisconnected.status, 200, 'live PVP test-only state route should support scoped heartbeat elapsed injection');
        assert.equal(routeForceConnectionDisconnected.payload.stateView.status, 'active', 'active non-turn heartbeat elapsed injection should keep match active');
        assert.equal(routeForceConnectionDisconnected.payload.stateView.currentSeat, protectFirstSeat, 'active non-turn heartbeat elapsed injection should not steal the current action window');
        assert.equal(routeForceConnectionDisconnected.payload.stateView.connectionReport?.opponent?.status, 'disconnected', 'active non-turn heartbeat elapsed injection should mark the public opponent disconnected for the actor');
        assert.ok(routeForceConnectionDisconnected.payload.stateView.recentEvents.some(event => event.eventType === 'test_state_forced' && (event.publicData?.fields || []).includes('heartbeatElapsedMs')), 'live PVP test-only state route should expose public heartbeatElapsedMs test evidence');
        assert.equal(routeForceProtectedSecond.status, 200, 'live PVP test-only state route should allow authenticated participants in DEFIER_PVP_TEST_MODE');
        assert.equal(routeForceProtectedSecond.payload.targetSeatId, protectSecondSeat, 'live PVP test-only state route should identify the forced public seat');
        assert.equal(routeForceProtectedSecond.payload.stateView.opponent.hp, 10, 'live PVP test-only state route should return the updated public opponent hp');
        assert.equal(routeForceProtectedSecond.payload.stateView.connectionReport?.opponent?.status, 'online', 'live PVP test-only state route should restore forced connection status before follow-up combat checks');
        assert.ok(routeForceProtectedSecond.payload.stateView.recentEvents.some(event => event.eventType === 'test_state_forced' && event.publicData?.scope === routeTestMatchScope), 'live PVP test-only state route should expose a public scoped setup event');
        const routeLethalPreviewFirst = await request(baseUrl, `/api/pvp/live/matches/${joinProtectB.payload.matchId}`, {
            token: protectFirstToken
        });
        const routeProtectedPreview = routeLethalPreviewFirst.payload.stateView.actionPreviewReport?.playableCards?.find(card => card.cardInstanceId === protectFirstBurstCard);
        assert.equal(routeProtectedPreview?.openingProtection?.willTrigger, true, 'route action preview should predict opening protection for protected lethal');
        assert.equal(routeProtectedPreview?.openingProtection?.preventedDamage, 6, 'route action preview should expose protected lethal prevented damage');
        assert.equal(routeProtectedPreview?.targetHpAfter, 1, 'route action preview should expose protected target HP');
        const protectedBurstFirst = await submitIntent(baseUrl, protectFirstToken, joinProtectB.payload.matchId, {
            intentId: `route-intent-opening-protected-burst-${protectFirstSeat.toLowerCase()}`,
            intentType: 'play_card',
            stateVersion: routeForceProtectedSecond.payload.stateView.stateVersion,
            payload: { cardInstanceId: protectFirstBurstCard, targetSeat: protectSecondSeat }
        });
        assert.equal(protectedBurstFirst.payload.result, 'accepted', 'opening protected burst should be accepted');
        assert.equal(protectedBurstFirst.payload.stateView.status, 'active', 'opening protected burst should keep match active');
        assert.equal(protectedBurstFirst.payload.stateView.opponent.hp, 1, 'opening protected burst should leave unacted defender at 1 hp');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.reportVersion, 'pvp-live-action-receipt-v1', 'opening protected burst should return public action receipt');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.sourceVisibility, 'authoritative_public_projection', 'route action receipt should be a server authoritative public projection');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.usesHiddenInformation, false, 'route action receipt must not use hidden information');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.rankedImpact, 'none', 'route action receipt should not write ranked result');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.actionType, 'play_card', 'route action receipt should identify card action');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.openingProtection?.triggered, true, 'route action receipt should explain opening protection trigger');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.openingProtection?.protectedSeat, protectSecondSeat, 'route action receipt should expose protected seat');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.openingProtection?.preventedDamage, 6, 'route action receipt should expose protected damage prevention');
        assert.equal(protectedBurstFirst.payload.stateView.actionReceiptReport?.damage?.targetHpAfter, 1, 'route action receipt should expose protected target HP');
        assert.ok(/护体/.test(protectedBurstFirst.payload.stateView.actionReceiptReport?.summaryLine || ''), 'route action receipt should give readable protection summary');
        assert.ok(!/hand|deck|cardId|instanceId|sourceCardId|loadoutSnapshot|rating|elo|reward/i.test(JSON.stringify(protectedBurstFirst.payload.stateView.actionReceiptReport)), 'route action receipt must not expose hidden ids or hidden state');
        const routeProtectionEvent = protectedBurstFirst.payload.events.find(event => event.eventType === 'opening_protection_triggered');
        const routeProtectionData = eventPublicData(routeProtectionEvent);
        assert.ok(routeProtectionEvent && routeProtectionData.protectedSeat === protectSecondSeat, 'opening protected burst should return public protection event');
        assert.equal(routeProtectionData.minimumHp, 1, 'opening protected burst should expose minimum hp');
        assert.equal(routeProtectionData.preventedDamage, 6, 'opening protected burst should expose prevented lethal damage after public second-seat buffer');
        assert.equal(routeProtectionData.wouldHaveHp, 0, 'opening protected burst should expose would-have hp');
        assert.ok(!protectedBurstFirst.payload.events.some(event => event.eventType === 'match_finished'), 'opening protected burst should not return match_finished');
        const protectedEndTurnFirst = await submitIntent(baseUrl, protectFirstToken, joinProtectB.payload.matchId, {
            intentId: `route-intent-opening-protected-end-${protectFirstSeat.toLowerCase()}`,
            intentType: 'end_turn',
            stateVersion: protectedBurstFirst.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(protectedEndTurnFirst.payload.result, 'accepted', 'opening protected attacker should still end turn');
        assert.equal(protectedEndTurnFirst.payload.stateView.currentSeat, protectSecondSeat, 'opening protected defender should receive the next action window');
        assert.equal(protectedEndTurnFirst.payload.stateView.opponent.block, 8, 'opening protected defender should receive counterplay buffer on first turn');
        assert.equal(protectedEndTurnFirst.payload.stateView.actionReceiptReport?.actionType, 'end_turn', 'route end-turn response should expose handoff action receipt');
        assert.equal(protectedEndTurnFirst.payload.stateView.actionReceiptReport?.nextSeat, protectSecondSeat, 'route end-turn receipt should expose next seat');
        assert.equal(protectedEndTurnFirst.payload.stateView.actionReceiptReport?.draw?.count, 3, 'route end-turn receipt should expose public draw count');
        assert.equal(protectedEndTurnFirst.payload.stateView.actionReceiptReport?.counterplay?.granted, true, 'route end-turn receipt should expose counterplay grant');
        assert.equal(protectedEndTurnFirst.payload.stateView.actionReceiptReport?.counterplay?.block, 8, 'route end-turn receipt should expose counterplay block');
        assert.ok(protectedEndTurnFirst.payload.events.some(event => event.eventType === 'opening_counterplay_granted' && eventPublicData(event).seatId === protectSecondSeat && eventPublicData(event).block === 8), 'opening protected defender should expose public counterplay buffer event');
        const protectedStateSecond = await request(baseUrl, `/api/pvp/live/matches/${joinProtectB.payload.matchId}`, {
            token: protectSecondToken
        });
        assert.equal(protectedStateSecond.payload.stateView.self.block, 8, 'opening protected defender should read own counterplay block through route state view');
        assert.ok(protectedStateSecond.payload.stateView.recentEvents.some(event => event.eventType === 'opening_counterplay_granted'), 'opening protected defender should see counterplay evidence in recent events');
        assert.equal(protectedStateSecond.payload.stateView.actionReceiptReport?.viewerSeat, protectSecondSeat, 'route GET should scope action receipt to protected viewer');
        assert.equal(protectedStateSecond.payload.stateView.actionReceiptReport?.actionType, 'end_turn', 'route GET should keep latest end-turn receipt');
        assert.equal(protectedStateSecond.payload.stateView.actionReceiptReport?.counterplay?.seatId, protectSecondSeat, 'route GET should keep public counterplay receipt');
        const previousFinishTestMode = process.env.DEFIER_PVP_TEST_MODE;
        process.env.DEFIER_PVP_TEST_MODE = '1';
        const routeForceFinishFirst = await request(baseUrl, `/api/pvp/live/test/matches/${joinProtectB.payload.matchId}/seats/${protectFirstSeat}`, {
            method: 'POST',
            token: protectSecondToken,
            body: { hp: 10, testMatchScope: routeTestMatchScope }
        });
        if (previousFinishTestMode === undefined) delete process.env.DEFIER_PVP_TEST_MODE;
        else process.env.DEFIER_PVP_TEST_MODE = previousFinishTestMode;
        assert.equal(routeForceFinishFirst.status, 200, 'live PVP test-only state route should support protected defender follow-up setup');
        assert.equal(routeForceFinishFirst.payload.stateView.opponent.hp, 10, 'live PVP test-only state route should return lowered opponent hp for protected defender');
        const normalFinishSecond = await submitIntent(baseUrl, protectSecondToken, joinProtectB.payload.matchId, {
            intentId: `route-intent-opening-normal-finish-${protectSecondSeat.toLowerCase()}`,
            intentType: 'play_card',
            stateVersion: routeForceFinishFirst.payload.stateView.stateVersion,
            payload: { cardInstanceId: protectSecondBurstCard, targetSeat: protectFirstSeat }
        });
        assert.equal(normalFinishSecond.payload.result, 'accepted', 'normal lethal after opponent turn should be accepted');
        assert.equal(normalFinishSecond.payload.stateView.status, 'finished', 'normal lethal after opponent turn should finish');
        assert.ok(normalFinishSecond.payload.events.some(event => event.eventType === 'match_finished' && eventPublicData(event).winnerSeat === protectSecondSeat), 'normal lethal after opponent turn should emit match_finished');
        assert.equal(normalFinishSecond.payload.stateView.postMatchReview?.reportVersion, 'pvp-live-post-match-review-v1', 'normal lethal should expose post-match review version');
        assert.equal(normalFinishSecond.payload.stateView.postMatchReview?.result, 'win', 'winning live seat should receive a win review');
        assert.equal(normalFinishSecond.payload.stateView.postMatchReview?.finishReason, 'lethal', 'normal lethal review should expose lethal finish reason');
        assert.ok(normalFinishSecond.payload.stateView.postMatchReview?.evidence?.some(event => event.eventType === 'damage_applied'), 'normal lethal review should cite public damage evidence');
        assert.equal(normalFinishSecond.payload.stateView.postMatchReview?.loadoutRecommendation?.recommendedPresetId, 'sword', 'normal lethal winner should be recommended the pressure MVP preset');
        assert.equal(normalFinishSecond.payload.stateView.postMatchReview?.settlementReport?.reportVersion, 'pvp-live-settlement-report-v1', 'normal lethal winner should receive settlement report');
        assert.equal(normalFinishSecond.payload.stateView.postMatchReview?.settlementReport?.result, 'win', 'normal lethal winner settlement should be winner-scoped');
        assert.ok(normalFinishSecond.payload.stateView.postMatchReview?.settlementReport?.ratingDelta > 0, 'normal lethal winner should see positive score delta');
        assert.ok(normalFinishSecond.payload.stateView.postMatchReview?.settlementReport?.coinsAwarded > 0, 'normal lethal winner should see coin reward');
        const normalFinishLoserFirst = await request(baseUrl, `/api/pvp/live/matches/${joinProtectB.payload.matchId}`, {
            token: protectFirstToken
        });
        assert.equal(normalFinishLoserFirst.status, 200, 'normal lethal loser should still be able to read terminal match state');
        assert.equal(normalFinishLoserFirst.payload.stateView.postMatchReview?.result, 'loss', 'normal lethal loser should receive a loss review');
        assert.equal(normalFinishLoserFirst.payload.stateView.postMatchReview?.finishReason, 'lethal', 'normal lethal loser review should expose lethal finish reason');
        assert.ok(normalFinishLoserFirst.payload.stateView.postMatchReview?.suggestions?.length >= 1, 'normal lethal loser review should include learning suggestions');
        assert.equal(normalFinishLoserFirst.payload.stateView.postMatchReview?.settlementReport?.result, 'loss', 'normal lethal loser settlement should be loser-scoped');
        assert.ok(normalFinishLoserFirst.payload.stateView.postMatchReview?.settlementReport?.ratingDelta < 0, 'normal lethal loser should see negative score delta');
        const loserLoadoutRecommendation = normalFinishLoserFirst.payload.stateView.postMatchReview?.loadoutRecommendation;
        assert.equal(loserLoadoutRecommendation?.reportVersion, 'pvp-live-loadout-recommendation-v1', 'normal lethal loser review should expose a loadout recommendation report');
        assert.equal(loserLoadoutRecommendation?.recommendedPresetId, 'shield', 'normal lethal loser should be recommended the defensive MVP preset');
        assert.equal(loserLoadoutRecommendation?.sourceVisibility, 'public_events_and_public_content', 'loadout recommendation should be based on public replay and public content only');
        assert.equal(loserLoadoutRecommendation?.usesHiddenInformation, false, 'loadout recommendation must not use hidden information');
        assert.equal(loserLoadoutRecommendation?.rankedImpact, 'none', 'loadout recommendation must not affect ranked state');
        assert.ok(loserLoadoutRecommendation?.evidenceRefs?.some(event => event.eventType === 'damage_applied'), 'loadout recommendation should cite public damage evidence');
        assert.ok(/下一局|套用/.test(loserLoadoutRecommendation?.boundaryLine || ''), 'loadout recommendation should explain it only applies to the next game');
        assert.ok(!/hand|deck|cardId|instanceId|loadoutSnapshot|reward|rating|elo|payload/i.test(JSON.stringify(loserLoadoutRecommendation || {})), 'loadout recommendation must not leak hidden payloads or reward/rating data');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinD = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenD,
            body: { displayName: '丁' }
        });
        assert.equal(joinD.payload.status, 'waiting', 'new isolated first player should wait');
        const joinE = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenE,
            body: { displayName: '戊' }
        });
        assert.equal(joinE.payload.status, 'matched', 'new isolated second player should match');
        const readyDE = await readyBoth(baseUrl, {
            matchId: joinE.payload.matchId,
            tokenA: tokenD,
            tokenB: tokenE,
            stateVersionA: joinE.payload.stateView.stateVersion,
            prefix: 'route-unpolled'
        });
        const surrenderE = await submitIntent(baseUrl, tokenE, joinE.payload.matchId, {
                intentId: 'route-intent-surrender-e-1',
                intentType: 'surrender',
                stateVersion: readyDE.payload.stateView.stateVersion,
                payload: {}
        });
        assert.equal(surrenderE.payload.result, 'accepted', 'matched opponent should be able to surrender before owner polls ticket');
        const staleUnpolledTicket = await request(baseUrl, `/api/pvp/live/queue/status/${joinD.payload.queueTicket}`, {
            token: tokenD
        });
        assert.equal(staleUnpolledTicket.status, 404, 'finished match should clear unpolled matched queue ticket');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinSetupDisconnectA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        assert.equal(joinSetupDisconnectA.payload.status, 'waiting', 'setup disconnect first player should wait');
        const joinSetupDisconnectB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        assert.equal(joinSetupDisconnectB.payload.status, 'matched', 'setup disconnect second player should match');
        const setupDisconnectMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinSetupDisconnectB.payload.matchId);
        forceSeatDisconnected(setupDisconnectMatch, 'B');
        const setupDisconnectStateA = await request(baseUrl, `/api/pvp/live/matches/${joinSetupDisconnectB.payload.matchId}`, {
            token: tokenA
        });
        assert.equal(setupDisconnectStateA.status, 200, 'connected setup participant should read connection invalidated state');
        assert.equal(setupDisconnectStateA.payload.stateView.status, 'invalidated', 'setup disconnect after grace should invalidate instead of awarding a win');
        assert.equal(setupDisconnectStateA.payload.stateView.postMatchReview, null, 'setup connection invalidation should not expose post-match review');
        assert.ok(setupDisconnectStateA.payload.stateView.recentEvents.some(event => event.eventType === 'connection_timeout' && eventPublicData(event).seatId === 'B'), 'setup disconnect should emit public connection_timeout event for stale seat');
        assert.ok(setupDisconnectStateA.payload.stateView.recentEvents.some(event => event.eventType === 'match_invalidated' && eventPublicData(event).reason === 'connection_timeout'), 'setup disconnect should invalidate with connection_timeout reason');
        const requeueReadySideAfterSetupDisconnect = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        assert.equal(requeueReadySideAfterSetupDisconnect.status, 200, 'connected setup participant should be released after opponent setup connection invalidation');
        assert.equal(requeueReadySideAfterSetupDisconnect.payload.status, 'waiting', 'connected setup participant should be able to queue again without settlement');
        const blockedDisconnectSideAfterSetupTimeout = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        assert.equal(blockedDisconnectSideAfterSetupTimeout.status, 409, 'setup disconnected participant should receive queue cooldown');
        assert.equal(blockedDisconnectSideAfterSetupTimeout.payload.reason, 'queue_cooldown', 'setup disconnected participant block should expose queue_cooldown reason');
        assert.equal(blockedDisconnectSideAfterSetupTimeout.payload.matchmakingGuard?.reportVersion, 'pvp-live-matchmaking-guard-v1', 'setup disconnected participant block should expose matchmaking guard report');
        assert.equal(blockedDisconnectSideAfterSetupTimeout.payload.matchmakingGuard?.cooldownSource, 'connection_timeout', 'setup disconnected participant block should expose connection_timeout source');
        assert.equal(blockedDisconnectSideAfterSetupTimeout.payload.matchmakingGuard?.rankedImpact, 'none', 'setup disconnect cooldown should not change ranked score');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinNonBlockingDisconnectA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        const joinNonBlockingDisconnectB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        const activeNonBlocking = await readyBoth(baseUrl, {
            matchId: joinNonBlockingDisconnectB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinNonBlockingDisconnectB.payload.stateView.stateVersion,
            prefix: 'route-nonblocking-disconnect'
        });
        const nonBlockingMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinNonBlockingDisconnectB.payload.matchId);
        const currentSeat = activeNonBlocking.payload.stateView.currentSeat;
        const nonCurrentSeat = currentSeat === 'A' ? 'B' : 'A';
        const currentToken = currentSeat === 'A' ? tokenA : tokenB;
        forceSeatDisconnected(nonBlockingMatch, nonCurrentSeat);
        const nonBlockingRead = await request(baseUrl, `/api/pvp/live/matches/${joinNonBlockingDisconnectB.payload.matchId}`, {
            token: currentToken
        });
        assert.equal(nonBlockingRead.status, 200, 'current actor should still read active match when non-current opponent is disconnected');
        assert.equal(nonBlockingRead.payload.stateView.status, 'active', 'non-current disconnected seat should not auto-finish before becoming the action owner');
        assert.equal(nonBlockingRead.payload.stateView.connectionReport.opponent.status, 'disconnected', 'current actor should still see non-current opponent disconnected');
        assertConnectionTempoReport(nonBlockingRead.payload.stateView.connectionTempoReport, 'opponent_non_turn_disconnected', 'active non-current disconnect state');
        assert.equal(nonBlockingRead.payload.stateView.connectionTempoReport.actionBoundary, 'continue_current_action', 'non-current disconnected tempo should keep the current action window usable');
        assert.equal(nonBlockingRead.payload.stateView.connectionTempoReport.canSubmitIntent, true, 'current actor should be allowed to submit while non-current opponent is disconnected');
        const nonBlockingHandoff = await submitIntent(baseUrl, currentToken, joinNonBlockingDisconnectB.payload.matchId, {
            intentId: `route-nonblocking-disconnect-end-turn-${currentSeat.toLowerCase()}`,
            intentType: 'end_turn',
            stateVersion: nonBlockingRead.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(nonBlockingHandoff.payload.result, 'accepted', 'current actor should still submit end_turn while non-current opponent is disconnected');
        assert.equal(nonBlockingHandoff.payload.stateView.status, 'active', 'handoff to disconnected opponent should not finish inside the accepted end_turn response');
        assert.equal(nonBlockingHandoff.payload.stateView.currentSeat, nonCurrentSeat, 'handoff should move the action window to the disconnected seat');
        assertConnectionTempoReport(nonBlockingHandoff.payload.stateView.connectionTempoReport, 'opponent_action_timeout_pending', 'handoff disconnected action owner state');
        assert.equal(nonBlockingHandoff.payload.stateView.connectionTempoReport.actionBoundary, 'wait_for_authoritative_timeout', 'handoff tempo should wait for authoritative timeout');
        const nonBlockingTimeoutRead = await request(baseUrl, `/api/pvp/live/matches/${joinNonBlockingDisconnectB.payload.matchId}`, {
            token: currentToken
        });
        assert.equal(nonBlockingTimeoutRead.status, 200, 'previous actor should read connection-timeout finish after handing action to disconnected opponent');
        assert.equal(nonBlockingTimeoutRead.payload.stateView.status, 'finished', 'disconnected seat should only lose after becoming the action owner');
        assert.ok(nonBlockingTimeoutRead.payload.stateView.recentEvents.some(event => event.eventType === 'turn_timeout' && eventPublicData(event).seatId === nonCurrentSeat && eventPublicData(event).finishReason === 'connection_timeout'), 'handoff connection timeout should emit public turn_timeout for the disconnected action owner');
        assert.ok(nonBlockingTimeoutRead.payload.stateView.recentEvents.some(event => event.eventType === 'match_finished' && eventPublicData(event).winnerSeat === currentSeat && eventPublicData(event).finishReason === 'connection_timeout'), 'handoff connection timeout should award the previous active seat only after authority passes');
        assert.equal(nonBlockingTimeoutRead.payload.stateView.postMatchReview?.finishReason, 'connection_timeout', 'handoff connection timeout review should expose connection timeout reason');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinActiveReconnectA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        const joinActiveReconnectB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        const activeReconnect = await readyBoth(baseUrl, {
            matchId: joinActiveReconnectB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinActiveReconnectB.payload.stateView.stateVersion,
            prefix: 'route-active-reconnect-grace'
        });
        const activeReconnectMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinActiveReconnectB.payload.matchId);
        const reconnectSeat = activeReconnect.payload.stateView.currentSeat;
        const reconnectToken = reconnectSeat === 'A' ? tokenA : tokenB;
        const observingToken = reconnectSeat === 'A' ? tokenB : tokenA;
        const reconnectStartedAt = activeReconnect.payload.stateView.turnTimer.startedAt;
        const reconnectDeadlineAt = activeReconnect.payload.stateView.turnTimer.deadlineAt;
        forceSeatIntoReconnectGrace(activeReconnectMatch, reconnectSeat);
        const activeGraceObserverRead = await request(baseUrl, `/api/pvp/live/matches/${joinActiveReconnectB.payload.matchId}`, {
            token: observingToken
        });
        assert.equal(activeGraceObserverRead.status, 200, 'opponent should read active match while current actor is still in reconnect grace');
        assert.equal(activeGraceObserverRead.payload.stateView.status, 'active', 'current actor reconnect grace should not finish the match before grace expires');
        assert.equal(activeGraceObserverRead.payload.stateView.currentSeat, reconnectSeat, 'current actor reconnect grace should preserve the action owner');
        assert.equal(activeGraceObserverRead.payload.stateView.connectionReport.opponent.status, 'grace', 'observer should see the current actor in reconnect grace');
        assertConnectionTempoReport(activeGraceObserverRead.payload.stateView.connectionTempoReport, 'opponent_action_grace', 'active current actor reconnect grace state');
        assert.equal(activeGraceObserverRead.payload.stateView.turnTimer.startedAt, reconnectStartedAt, 'current actor reconnect grace should not reset turn timer start');
        assert.equal(activeGraceObserverRead.payload.stateView.turnTimer.deadlineAt, reconnectDeadlineAt, 'current actor reconnect grace should not extend turn timer deadline');
        const activeReconnectHeartbeat = await heartbeat(baseUrl, reconnectToken, joinActiveReconnectB.payload.matchId);
        assert.equal(activeReconnectHeartbeat.status, 200, 'current actor should be able to heartbeat back before reconnect grace expires');
        assert.equal(activeReconnectHeartbeat.payload.stateView.status, 'active', 'current actor heartbeat inside reconnect grace should keep match active');
        assert.equal(activeReconnectHeartbeat.payload.stateView.currentSeat, reconnectSeat, 'current actor heartbeat inside reconnect grace should preserve action owner');
        assert.equal(activeReconnectHeartbeat.payload.stateView.connectionReport.viewer.status, 'online', 'heartbeat sender should become online after reconnect');
        assert.equal(activeReconnectHeartbeat.payload.stateView.turnTimer.startedAt, reconnectStartedAt, 'current actor heartbeat should keep original turn timer start');
        assert.equal(activeReconnectHeartbeat.payload.stateView.turnTimer.deadlineAt, reconnectDeadlineAt, 'current actor heartbeat should not extend original turn deadline');
        assert.equal(activeReconnectHeartbeat.payload.stateView.postMatchReview, null, 'current actor heartbeat inside reconnect grace should not create a terminal review');
        assert.equal(activeReconnectHeartbeat.payload.stateView.recentEvents.some(event => ['turn_timeout', 'connection_timeout', 'match_finished'].includes(event.eventType)), false, 'current actor heartbeat inside reconnect grace should not emit terminal timeout events');
        const activeReconnectObserverRead = await request(baseUrl, `/api/pvp/live/matches/${joinActiveReconnectB.payload.matchId}`, {
            token: observingToken
        });
        assert.equal(activeReconnectObserverRead.status, 200, 'opponent should read active match after current actor reconnects');
        assert.equal(activeReconnectObserverRead.payload.stateView.status, 'active', 'opponent should still see active match after current actor reconnects');
        assert.equal(activeReconnectObserverRead.payload.stateView.connectionReport.opponent.status, 'online', 'opponent should see the current actor back online after heartbeat');
        assert.equal(activeReconnectObserverRead.payload.stateView.turnTimer.deadlineAt, reconnectDeadlineAt, 'opponent view should preserve the original turn deadline after reconnect');
        assert.equal(activeReconnectObserverRead.payload.stateView.recentEvents.some(event => ['turn_timeout', 'connection_timeout', 'match_finished'].includes(event.eventType)), false, 'opponent view after reconnect should not contain terminal timeout events');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinDoubleDisconnectA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        const joinDoubleDisconnectB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        await readyBoth(baseUrl, {
            matchId: joinDoubleDisconnectB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinDoubleDisconnectB.payload.stateView.stateVersion,
            prefix: 'route-double-disconnect'
        });
        const doubleDisconnectMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinDoubleDisconnectB.payload.matchId);
        forceSeatDisconnected(doubleDisconnectMatch, 'A');
        forceSeatDisconnected(doubleDisconnectMatch, 'B');
        const doubleDisconnectStateA = await request(baseUrl, `/api/pvp/live/matches/${joinDoubleDisconnectB.payload.matchId}`, {
            token: tokenA
        });
        assert.equal(doubleDisconnectStateA.status, 200, 'participant should read double-disconnect terminal state');
        assert.equal(doubleDisconnectStateA.payload.stateView.status, 'invalidated', 'both seats disconnected after grace should invalidate instead of awarding a win');
        assert.equal(doubleDisconnectStateA.payload.stateView.postMatchReview, null, 'double-disconnect invalidation should not expose post-match review');
        assert.ok(doubleDisconnectStateA.payload.stateView.recentEvents.some(event => event.eventType === 'connection_timeout' && eventPublicData(event).disconnectedSeats?.length === 2), 'double disconnect should emit public connection_timeout event for both seats');
        assert.ok(doubleDisconnectStateA.payload.stateView.recentEvents.some(event => event.eventType === 'match_invalidated' && eventPublicData(event).reason === 'connection_timeout'), 'double disconnect should invalidate with connection_timeout reason');
        const requeueAfterDoubleDisconnect = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        assert.equal(requeueAfterDoubleDisconnect.payload.status, 'waiting', 'double-disconnect invalidation should release player without settlement');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinConnectionTimeoutA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        const joinConnectionTimeoutB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        const activeConnectionTimeout = await readyBoth(baseUrl, {
            matchId: joinConnectionTimeoutB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinConnectionTimeoutB.payload.stateView.stateVersion,
            prefix: 'route-connection-timeout'
        });
        const connectionTimeoutMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinConnectionTimeoutB.payload.matchId);
        const disconnectedSeat = activeConnectionTimeout.payload.stateView.currentSeat;
        const winnerSeat = disconnectedSeat === 'A' ? 'B' : 'A';
        const winnerToken = winnerSeat === 'A' ? tokenA : tokenB;
        const loserToken = disconnectedSeat === 'A' ? tokenA : tokenB;
        forceSeatDisconnected(connectionTimeoutMatch, disconnectedSeat);
        connectionTimeoutMatch.updatedAt = Date.now();
        const connectionTimeoutWinner = await request(baseUrl, `/api/pvp/live/matches/${joinConnectionTimeoutB.payload.matchId}`, {
            token: winnerToken
        });
        assert.equal(connectionTimeoutWinner.status, 200, 'opponent should read connection-timeout finished match');
        assert.equal(connectionTimeoutWinner.payload.stateView.status, 'finished', 'current actor disconnected after grace should finish the active match');
        assert.ok(connectionTimeoutWinner.payload.stateView.recentEvents.some(event => event.eventType === 'turn_timeout' && eventPublicData(event).finishReason === 'connection_timeout'), 'connection timeout should emit public turn_timeout evidence with connection source');
        assert.ok(connectionTimeoutWinner.payload.stateView.recentEvents.some(event => event.eventType === 'match_finished' && eventPublicData(event).finishReason === 'connection_timeout'), 'connection timeout should finish with connection_timeout reason');
        assert.equal(connectionTimeoutWinner.payload.stateView.postMatchReview?.result, 'win', 'connection timeout winner should receive a win review');
        assert.equal(connectionTimeoutWinner.payload.stateView.postMatchReview?.finishReason, 'connection_timeout', 'connection timeout review should expose connection timeout reason');
        assert.equal(eventPublicData(connectionTimeoutWinner.payload.stateView.recentEvents.find(event => event.eventType === 'match_finished')).winnerSeat, winnerSeat, 'connection timeout should award the non-disconnected seat');
        const connectionTimeoutLoser = await request(baseUrl, `/api/pvp/live/matches/${joinConnectionTimeoutB.payload.matchId}`, {
            token: loserToken
        });
        assert.equal(connectionTimeoutLoser.status, 200, 'connection timeout loser should still read terminal state');
        assert.equal(connectionTimeoutLoser.payload.stateView.postMatchReview?.result, 'loss', 'connection timeout loser should receive a loss review');
        assert.ok(connectionTimeoutLoser.payload.stateView.postMatchReview?.suggestions?.some(line => /重连|连接|网络/.test(line)), 'connection timeout loser review should include reconnect learning suggestions');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinTimeoutA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        const joinTimeoutB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        const readyTimeout = await readyBoth(baseUrl, {
            matchId: joinTimeoutB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinTimeoutB.payload.stateView.stateVersion,
            prefix: 'route-timeout'
        });
        const timeoutActingSeat = readyTimeout.payload.stateView.currentSeat;
        const timeoutWinningSeat = timeoutActingSeat === 'A' ? 'B' : 'A';
        const timeoutWinnerToken = timeoutWinningSeat === 'A' ? tokenA : tokenB;
        const timeoutLoserToken = timeoutActingSeat === 'A' ? tokenA : tokenB;
        const timeoutMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinTimeoutB.payload.matchId);
        forceActiveTurnStartedAt(timeoutMatch, Date.now() - 10 * 60 * 1000);
        const timeoutStateWinner = await request(baseUrl, `/api/pvp/live/matches/${joinTimeoutB.payload.matchId}`, {
            token: timeoutWinnerToken
        });
        assert.equal(timeoutStateWinner.status, 200, 'opponent should receive timeout-finished match state');
        assert.equal(timeoutStateWinner.payload.stateView.status, 'finished', 'stale active live match should finish by timeout');
        assert.ok(timeoutStateWinner.payload.stateView.recentEvents.some(event => event.eventType === 'turn_timeout'), 'timeout finish should emit public timeout event');
        assert.ok(timeoutStateWinner.payload.stateView.recentEvents.some(event => event.eventType === 'match_finished' && eventPublicData(event).finishReason === 'timeout'), 'timeout finish should emit match_finished timeout reason');
        assert.equal(eventPublicData(timeoutStateWinner.payload.stateView.recentEvents.find(event => event.eventType === 'match_finished')).winnerSeat, timeoutWinningSeat, 'waiting opponent should win when current seat times out');
        assert.equal(timeoutStateWinner.payload.stateView.postMatchReview?.reportVersion, 'pvp-live-post-match-review-v1', 'timeout finish should expose post-match review version');
        assert.equal(timeoutStateWinner.payload.stateView.postMatchReview?.result, 'win', 'timeout winner should receive a win review');
        assert.equal(timeoutStateWinner.payload.stateView.postMatchReview?.finishReason, 'timeout', 'timeout review should expose timeout finish reason');
        const timeoutStateLoser = await request(baseUrl, `/api/pvp/live/matches/${joinTimeoutB.payload.matchId}`, {
            token: timeoutLoserToken
        });
        assert.equal(timeoutStateLoser.status, 200, 'timeout loser should still be able to read terminal match state');
        assert.equal(timeoutStateLoser.payload.stateView.postMatchReview?.result, 'loss', 'timeout loser should receive a loss review');
        assert.equal(timeoutStateLoser.payload.stateView.postMatchReview?.finishReason, 'timeout', 'timeout loser review should expose timeout finish reason');
        assert.ok(timeoutStateLoser.payload.stateView.postMatchReview?.suggestions?.some(line => /超时|关键回合/.test(line)), 'timeout loser review should include timeout learning suggestions');
        const requeueAfterTimeout = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: timeoutLoserToken,
            body: { displayName: timeoutActingSeat === 'A' ? '甲' : '乙' }
        });
        assert.equal(requeueAfterTimeout.payload.status, 'waiting', 'timed-out live match should release player for a new queue');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinRound14DrawA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        const joinRound14DrawB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        const readyRound14Draw = await readyBoth(baseUrl, {
            matchId: joinRound14DrawB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinRound14DrawB.payload.stateView.stateVersion,
            prefix: 'route-round14-draw'
        });
        const round14DrawMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinRound14DrawB.payload.matchId);
        round14DrawMatch.state.roundIndex = 14;
        round14DrawMatch.state.turnIndex = 28;
        round14DrawMatch.state.currentSeat = 'B';
        round14DrawMatch.state.seats.A.hp = 30;
        round14DrawMatch.state.seats.B.hp = 30;
        const round14DrawEnd = await submitIntent(baseUrl, tokenB, joinRound14DrawB.payload.matchId, {
            intentId: 'route-round14-draw-end-b',
            intentType: 'end_turn',
            stateVersion: readyRound14Draw.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(round14DrawEnd.payload.result, 'accepted', 'round14 draw final end turn should be accepted through route');
        assert.equal(round14DrawEnd.payload.stateView.status, 'finished', 'round14 draw route should return finished state');
        assert.ok(round14DrawEnd.payload.stateView.recentEvents.some(event => event.eventType === 'match_finished' && eventPublicData(event).finishReason === 'round14_draw'), 'round14 draw route should emit match_finished round14_draw');
        assert.equal(round14DrawEnd.payload.stateView.postMatchReview?.result, 'draw', 'round14 draw route should expose draw review');
        assert.equal(round14DrawEnd.payload.stateView.postMatchReview?.winnerSeat, 'draw', 'round14 draw route should expose draw winner marker');
        assert.equal(round14DrawEnd.payload.stateView.postMatchReview?.loserSeat, '', 'round14 draw route should not invent a loser');
        assert.equal(round14DrawEnd.payload.stateView.postMatchReview?.loadoutRecommendation?.recommendedPresetId, 'balanced', 'round14 draw route should recommend the default balanced loadout');
        assert.ok(round14DrawEnd.payload.stateView.postMatchReview?.experienceReport?.fairnessChecks?.some(item => item.id === 'round14_resolution'), 'round14 draw route review should expose long-game fairness check');
        const round14DrawAView = await request(baseUrl, `/api/pvp/live/matches/${joinRound14DrawB.payload.matchId}`, {
            token: tokenA
        });
        assert.equal(round14DrawAView.payload.stateView.postMatchReview?.result, 'draw', 'round14 draw other seat should also receive draw review');
        const requeueAfterRound14Draw = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        assert.equal(requeueAfterRound14Draw.payload.status, 'waiting', 'round14 draw should release player for a fresh queue');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinRound14ScoreA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenA,
            body: { displayName: '甲' }
        });
        const joinRound14ScoreB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenB,
            body: { displayName: '乙' }
        });
        const readyRound14Score = await readyBoth(baseUrl, {
            matchId: joinRound14ScoreB.payload.matchId,
            tokenA,
            tokenB,
            stateVersionA: joinRound14ScoreB.payload.stateView.stateVersion,
            prefix: 'route-round14-score'
        });
        const round14ScoreMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinRound14ScoreB.payload.matchId);
        round14ScoreMatch.state.roundIndex = 14;
        round14ScoreMatch.state.turnIndex = 28;
        round14ScoreMatch.state.currentSeat = 'B';
        round14ScoreMatch.state.seats.A.hp = 45;
        round14ScoreMatch.state.seats.B.hp = 35;
        const round14ScoreEnd = await submitIntent(baseUrl, tokenB, joinRound14ScoreB.payload.matchId, {
            intentId: 'route-round14-score-end-b',
            intentType: 'end_turn',
            stateVersion: readyRound14Score.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(round14ScoreEnd.payload.result, 'accepted', 'round14 score final end turn should be accepted through route');
        assert.equal(round14ScoreEnd.payload.stateView.status, 'finished', 'round14 score route should return finished state');
        assert.ok(round14ScoreEnd.payload.stateView.recentEvents.some(event => event.eventType === 'match_finished' && eventPublicData(event).finishReason === 'round14_score'), 'round14 score route should emit match_finished round14_score');
        const round14ScoreAView = await request(baseUrl, `/api/pvp/live/matches/${joinRound14ScoreB.payload.matchId}`, {
            token: tokenA
        });
        assert.equal(round14ScoreAView.payload.stateView.postMatchReview?.result, 'win', 'round14 score winner should receive win review');
        assert.equal(round14ScoreAView.payload.stateView.postMatchReview?.finishReason, 'round14_score', 'round14 score review should expose round14_score');
        const reportAction = round14ScoreAView.payload.stateView.postMatchReview?.nextActions
            ?.find(action => action.id === 'report_issue');
        assert.equal(reportAction?.auditActionId, 'report_issue', 'finished review should expose a real dispute report action');
        assert.ok(
            round14ScoreAView.payload.stateView.postMatchReview?.postGameActionBridge?.uiActionIdsByAuditAction?.report_issue?.includes('report_issue'),
            'post-game action bridge should map report_issue to the report UI action'
        );
        const disputeReport = await request(baseUrl, `/api/pvp/live/matches/${joinRound14ScoreB.payload.matchId}/reports`, {
            method: 'POST',
            token: tokenA,
            body: {
                reason: 'fairness_review',
                message: '第 14 轮判分窗口需要复核公开事件。'
            }
        });
        assert.equal(disputeReport.status, 200, 'finished live match should accept an audit-safe dispute report');
        assert.equal(disputeReport.payload.report?.reportVersion, 'pvp-live-dispute-report-receipt-v1', 'dispute report should return a stable receipt contract');
        assert.equal(disputeReport.payload.report?.status, 'reported', 'dispute report should be received without immediate punishment');
        assert.equal(disputeReport.payload.report?.rankedImpact, 'none', 'dispute report should not immediately change ranked state');
        assert.equal(disputeReport.payload.report?.evidencePackage?.reportVersion, 'pvp-live-dispute-evidence-v1', 'dispute report should include an audit-safe evidence package');
        assert.equal(disputeReport.payload.report?.evidencePackage?.usesHiddenInformation, false, 'dispute evidence package should not use hidden information');
        assert.ok(disputeReport.payload.report?.evidencePackage?.eventCount >= 1, 'dispute evidence package should reference public event evidence');
        assert.ok(disputeReport.payload.report?.evidencePackage?.riskTags?.includes('fairness_review_requested'), 'fairness dispute should carry a review risk tag');
        assert.doesNotMatch(JSON.stringify(disputeReport.payload), /hand|deck|cardId|instanceId|loadoutSnapshot|randomSeed/i, 'dispute receipt must not leak hidden cards, decks, loadouts, or seeds');
        const persistedDisputeReport = await dbGet(
            'SELECT report_id, status, reason, evidence_json FROM pvp_live_dispute_reports WHERE match_id = ? AND reporter_user_id = ? LIMIT 1',
            [joinRound14ScoreB.payload.matchId, 'live-user-a']
        );
        assert.equal(persistedDisputeReport?.report_id, disputeReport.payload.report.reportId, 'dispute report should be persisted for later review');
        assert.equal(persistedDisputeReport?.status, 'reported', 'persisted dispute report should stay in reported status');
        assert.equal(persistedDisputeReport?.reason, 'fairness_review', 'persisted dispute report should store the player reason');
        assert.ok(JSON.parse(persistedDisputeReport?.evidence_json || '{}').riskTags.includes('fairness_review_requested'), 'persisted dispute evidence should keep risk tags');
        const outsiderDispute = await request(baseUrl, `/api/pvp/live/matches/${joinRound14ScoreB.payload.matchId}/reports`, {
            method: 'POST',
            token: tokenC,
            body: { reason: 'fairness_review' }
        });
        assert.equal(outsiderDispute.status, 404, 'non-participant should not be able to report or inspect another live match');

        pvpLiveRoutes.__livePvpStore.reset();
        const joinSetupTimeoutA = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenC,
            body: { displayName: '丙' }
        });
        assert.equal(joinSetupTimeoutA.payload.status, 'waiting', 'setup timeout first player should wait');
        const joinSetupTimeoutB = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenD,
            body: { displayName: '丁' }
        });
        assert.equal(joinSetupTimeoutB.payload.status, 'matched', 'setup timeout second player should match');
        const setupReadyC = await submitIntent(baseUrl, tokenC, joinSetupTimeoutB.payload.matchId, {
            intentId: 'setup-timeout-ready-c',
            intentType: 'ready',
            stateVersion: joinSetupTimeoutB.payload.stateView.stateVersion,
            payload: {}
        });
        assert.equal(setupReadyC.payload.result, 'accepted', 'setup timeout ready participant should be accepted before opponent timeout');
        assert.equal(setupReadyC.payload.stateView.status, 'setup', 'single ready should keep match in setup before timeout');
        const setupTimeoutMatch = pvpLiveRoutes.__livePvpStore.matches.get(joinSetupTimeoutB.payload.matchId);
        const originalSetupTimeoutNow = pvpLiveRoutes.__livePvpStore.now;
        const setupTimeoutBaseNow = Date.now();
        const setupTimeoutTickMs = 30 * 1000;
        let setupTimeoutTick = 0;
        setupTimeoutMatch.state.setup.readyDeadlineAt = setupTimeoutBaseNow - 1;
        setupTimeoutMatch.updatedAt = setupTimeoutBaseNow - 10 * 60 * 1000;
        pvpLiveRoutes.__livePvpStore.now = () => setupTimeoutBaseNow + (++setupTimeoutTick * setupTimeoutTickMs);
        const setupTimeoutStateB = await request(baseUrl, `/api/pvp/live/matches/${joinSetupTimeoutB.payload.matchId}`, {
            token: tokenD
        });
        const readyTimeoutGuardAfterInvalidation = await pvpLiveRoutes.__livePvpStore.loadMatchmakingGuard('live-user-d');
        pvpLiveRoutes.__livePvpStore.now = originalSetupTimeoutNow;
        assert.equal(setupTimeoutStateB.status, 200, 'setup timeout participant should receive invalidated match state');
        assert.equal(setupTimeoutStateB.payload.stateView.status, 'invalidated', 'stale setup live match should invalidate instead of finishing as a win/loss');
        assert.equal(setupTimeoutStateB.payload.stateView.postMatchReview, null, 'invalidated setup timeout should not expose post-match review');
        assert.ok(setupTimeoutStateB.payload.stateView.recentEvents.some(event => event.eventType === 'ready_timeout'), 'setup timeout should emit public ready_timeout event');
        assert.ok(setupTimeoutStateB.payload.stateView.recentEvents.some(event => event.eventType === 'match_invalidated' && eventPublicData(event).reason === 'ready_timeout'), 'setup timeout should emit match_invalidated ready_timeout reason');
        assert.ok(readyTimeoutGuardAfterInvalidation, 'setup timeout should persist a matchmaking guard for the unready participant');
        assert.ok(
            readyTimeoutGuardAfterInvalidation.cooldownUntil <= setupTimeoutMatch.updatedAt + pvpLiveRoutes.__livePvpStore.readyTimeoutCooldownMs + setupTimeoutTickMs + 1000,
            'setup timeout should record unready cooldown only once during a single invalidation release chain'
        );
        const staleSetupTicket = await request(baseUrl, `/api/pvp/live/queue/status/${joinSetupTimeoutA.payload.queueTicket}`, {
            token: tokenC
        });
        assert.equal(staleSetupTicket.status, 404, 'setup timeout should clear unpolled matched queue ticket');
        const requeueAfterSetupTimeout = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenC,
            body: { displayName: '丙' }
        });
        assert.equal(requeueAfterSetupTimeout.status, 200, 'ready participant should not be punished after opponent setup timeout');
        assert.equal(requeueAfterSetupTimeout.payload.status, 'waiting', 'ready participant should be released for a new queue without settlement');
        const blockedUnreadyAfterSetupTimeout = await request(baseUrl, '/api/pvp/live/queue/join', {
            method: 'POST',
            token: tokenD,
            body: { displayName: '丁' }
        });
        assert.equal(blockedUnreadyAfterSetupTimeout.status, 409, 'unready setup timeout participant should receive queue cooldown');
        assert.equal(blockedUnreadyAfterSetupTimeout.payload.reason, 'queue_cooldown', 'unready setup timeout block should expose queue_cooldown reason');
        assert.equal(blockedUnreadyAfterSetupTimeout.payload.matchmakingGuard?.cooldownSource, 'ready_timeout', 'unready setup timeout block should expose ready_timeout source');

        console.log('sanity_pvp_live_route_checks passed');
    } finally {
        await close(server);
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
