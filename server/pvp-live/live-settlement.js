const { db } = require('../db/database');
const {
    recordSeasonHonorArchiveFromCollection,
    recordSeasonRewardClaims,
    recordSeasonRewardClaimsFromCollection
} = require('./season-claims');
const { makeTrustedPvpProgressionEvent } = require('../progression/service');

const SEASON_ID = 's1-genesis';
const SEASON_NAME = '开天赛季';
const SEASON_HONOR_COLLECTION_VERSION = 'pvp-live-season-honor-collection-v1';
const SEASON_HONOR_REWARD_TRACK = [
    { targetGames: 1, rewardId: 's1_genesis_honor_mark_1', rewardType: 'cosmetic_badge', rewardName: '开天见证徽记' },
    { targetGames: 3, rewardId: 's1_genesis_honor_frame_3', rewardType: 'cosmetic_frame', rewardName: '三战问道边框' },
    { targetGames: 5, rewardId: 's1_genesis_honor_title_5', rewardType: 'cosmetic_title', rewardName: '称号·真人论道新锋' },
    { targetGames: 10, rewardId: 's1_genesis_honor_aura_10', rewardType: 'cosmetic_aura', rewardName: '开天十战辉光' },
    { targetGames: 20, rewardId: 's1_genesis_honor_banner_20', rewardType: 'cosmetic_banner', rewardName: '二十战荣誉旗' },
    { targetGames: 50, rewardId: 's1_genesis_honor_legend_50', rewardType: 'cosmetic_title', rewardName: '称号·开天不坠' }
];

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
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

let transactionTail = Promise.resolve();

async function withTransaction(fn) {
    let releaseQueue;
    const myTurn = new Promise(resolve => {
        releaseQueue = resolve;
    });
    const previousTurn = transactionTail;
    transactionTail = previousTurn.catch(() => {}).then(() => myTurn);
    await previousTurn.catch(() => {});
    try {
        await dbRun('BEGIN IMMEDIATE');
        const result = await fn();
        await dbRun('COMMIT');
        return result;
    } catch (error) {
        try {
            await dbRun('ROLLBACK');
        } catch (rollbackError) {
            console.error('[PVP Live] Settlement rollback failed:', rollbackError);
        }
        throw error;
    } finally {
        releaseQueue();
    }
}

async function withLiveSettlementReadGate(fn) {
    let releaseQueue;
    const myTurn = new Promise(resolve => {
        releaseQueue = resolve;
    });
    const previousTurn = transactionTail;
    transactionTail = previousTurn.catch(() => {}).then(() => myTurn);
    await previousTurn.catch(() => {});
    try {
        return await fn();
    } finally {
        releaseQueue();
    }
}

function makeRankId(userId) {
    return `pvp-rank-${userId}`;
}

function getDivisionByScore(score) {
    const s = Math.max(0, Math.floor(Number(score) || 0));
    if (s >= 1900) return '天穹榜';
    if (s >= 1600) return '凌霄榜';
    if (s >= 1300) return '问道榜';
    return '潜龙榜';
}

function parseJson(raw, fallback = null) {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return fallback;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return fallback;
    }
}

function getSeasonHonorRewardCount(collection) {
    const rewards = collection && collection.unlockedRewards && typeof collection.unlockedRewards === 'object' && !Array.isArray(collection.unlockedRewards)
        ? collection.unlockedRewards
        : {};
    return Object.keys(rewards).length;
}

function defaultEconomy(userId) {
    return {
        version: 1,
        userId,
        coins: 1200,
        totalEarned: 1200,
        totalSpent: 0,
        wins: 0,
        losses: 0,
        totalMatches: 0,
        winStreak: 0,
        lossStreak: 0,
        bestWinStreak: 0,
        purchases: {},
        ownedItems: {},
        seasonHonorCollection: normalizeSeasonHonorCollection(null),
        equippedSkinId: null,
        equippedTitleId: null,
        transactionLog: [],
        matchHistory: [],
        lastRewardAt: 0,
        lastPurchaseAt: 0
    };
}

function normalizeSeasonHonorCollection(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const unlockedRewards = {};
    if (src.unlockedRewards && typeof src.unlockedRewards === 'object' && !Array.isArray(src.unlockedRewards)) {
        Object.keys(src.unlockedRewards).forEach((key) => {
            const entry = src.unlockedRewards[key];
            if (!entry || typeof entry !== 'object') return;
            const rewardId = String(entry.rewardId || key || '').trim();
            if (!rewardId) return;
            unlockedRewards[rewardId] = {
                rewardId,
                rewardType: String(entry.rewardType || 'cosmetic_badge'),
                rewardName: String(entry.rewardName || '赛季荣誉外观'),
                targetGames: Math.max(1, Math.floor(Number(entry.targetGames) || 1)),
                source: 'live_ranked',
                rewardImpact: 'cosmetic_only',
                powerImpact: 'none',
                unlockedAt: Math.max(0, Math.floor(Number(entry.unlockedAt) || 0))
            };
        });
    }
    const rewardIds = Object.keys(unlockedRewards);
    const lastUnlockedRewardId = rewardIds.includes(src.lastUnlockedRewardId) ? String(src.lastUnlockedRewardId) : (rewardIds[rewardIds.length - 1] || null);
    return {
        reportVersion: SEASON_HONOR_COLLECTION_VERSION,
        seasonId: String(src.seasonId || SEASON_ID),
        source: 'live_ranked',
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none',
        unlockedRewards,
        totalUnlocked: rewardIds.length,
        lastUnlockedRewardId,
        boundary: '赛季荣誉收藏只保存外观成就，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
    };
}

function grantSeasonHonorCollection(economy, { gamesPlayed, now }) {
    const collection = normalizeSeasonHonorCollection(economy && economy.seasonHonorCollection);
    const played = Math.max(0, Math.floor(Number(gamesPlayed) || 0));
    const newlyUnlocked = [];
    SEASON_HONOR_REWARD_TRACK
        .filter(reward => played >= reward.targetGames)
        .forEach((reward) => {
            if (collection.unlockedRewards[reward.rewardId]) return;
            const entry = {
                rewardId: reward.rewardId,
                rewardType: reward.rewardType,
                rewardName: reward.rewardName,
                targetGames: reward.targetGames,
                source: 'live_ranked',
                rewardImpact: 'cosmetic_only',
                powerImpact: 'none',
                unlockedAt: now
            };
            collection.unlockedRewards[reward.rewardId] = entry;
            newlyUnlocked.push(entry);
        });
    const rewardIds = Object.keys(collection.unlockedRewards);
    if (newlyUnlocked.length > 0) {
        collection.lastUnlockedRewardId = newlyUnlocked[newlyUnlocked.length - 1].rewardId;
    } else if (!collection.lastUnlockedRewardId && rewardIds.length > 0) {
        collection.lastUnlockedRewardId = rewardIds[rewardIds.length - 1];
    }
    collection.totalUnlocked = rewardIds.length;
    const currentReward = SEASON_HONOR_REWARD_TRACK.slice().reverse().find(reward => played >= reward.targetGames) || null;
    const currentEntry = currentReward ? collection.unlockedRewards[currentReward.rewardId] : null;
    const currentNewUnlock = currentEntry && newlyUnlocked.some(reward => reward.rewardId === currentEntry.rewardId);
    return {
        economy: {
            ...economy,
            seasonHonorCollection: collection
        },
        collection,
        newlyUnlocked,
        currentEntry,
        claim: currentEntry ? {
            reportVersion: 'pvp-live-season-honor-claim-v1',
            rewardId: currentEntry.rewardId,
            rewardType: currentEntry.rewardType,
            rewardName: currentEntry.rewardName,
            collectionState: currentNewUnlock ? 'newly_unlocked' : 'owned',
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none',
            unlockedAt: currentEntry.unlockedAt,
            collectionSize: collection.totalUnlocked,
            collectionReport: {
                reportVersion: SEASON_HONOR_COLLECTION_VERSION,
                seasonId: collection.seasonId,
                rewardImpact: 'cosmetic_only',
                powerImpact: 'none',
                totalUnlocked: collection.totalUnlocked,
                lastUnlockedRewardId: collection.lastUnlockedRewardId,
                boundary: collection.boundary
            }
        } : null
    };
}

function normalizeEconomy(raw, userId) {
    const defaults = defaultEconomy(userId);
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const purchases = {};
    if (src.purchases && typeof src.purchases === 'object') {
        Object.keys(src.purchases).forEach((key) => {
            const count = Math.max(0, Math.floor(Number(src.purchases[key]) || 0));
            if (count > 0) purchases[key] = count;
        });
    }
    const ownedItems = {};
    if (src.ownedItems && typeof src.ownedItems === 'object') {
        Object.keys(src.ownedItems).forEach((key) => {
            if (src.ownedItems[key]) ownedItems[key] = true;
        });
    }
    const transactionLog = Array.isArray(src.transactionLog)
        ? src.transactionLog.filter(it => it && typeof it === 'object').slice(-40)
        : [];
    const matchHistory = Array.isArray(src.matchHistory)
        ? src.matchHistory.filter(it => it && typeof it === 'object').slice(-24)
        : [];
    return {
        ...defaults,
        coins: Math.max(0, Math.floor(Number(src.coins) || defaults.coins)),
        totalEarned: Math.max(0, Math.floor(Number(src.totalEarned) || defaults.totalEarned)),
        totalSpent: Math.max(0, Math.floor(Number(src.totalSpent) || 0)),
        wins: Math.max(0, Math.floor(Number(src.wins) || 0)),
        losses: Math.max(0, Math.floor(Number(src.losses) || 0)),
        totalMatches: Math.max(0, Math.floor(Number(src.totalMatches) || 0)),
        winStreak: Math.max(0, Math.floor(Number(src.winStreak) || 0)),
        lossStreak: Math.max(0, Math.floor(Number(src.lossStreak) || 0)),
        bestWinStreak: Math.max(0, Math.floor(Number(src.bestWinStreak) || 0)),
        purchases,
        ownedItems,
        seasonHonorCollection: normalizeSeasonHonorCollection(src.seasonHonorCollection),
        equippedSkinId: typeof src.equippedSkinId === 'string' ? src.equippedSkinId : null,
        equippedTitleId: typeof src.equippedTitleId === 'string' ? src.equippedTitleId : null,
        transactionLog,
        matchHistory,
        lastRewardAt: Math.max(0, Math.floor(Number(src.lastRewardAt) || 0)),
        lastPurchaseAt: Math.max(0, Math.floor(Number(src.lastPurchaseAt) || 0))
    };
}

async function getLiveUser(userId, fallbackName) {
    const row = await dbGet(`SELECT id, username FROM users WHERE id = ?`, [userId]);
    return {
        id: userId,
        username: row && row.username ? row.username : (fallbackName || userId)
    };
}

async function ensureRank(user) {
    const now = Date.now();
    const rankId = makeRankId(user.id);
    await dbRun(
        `INSERT OR IGNORE INTO pvp_ranks (id, user_id, user_name, score, wins, losses, realm, division, season_id, created_at, updated_at)
         VALUES (?, ?, ?, 1000, 0, 0, 1, ?, ?, ?, ?)`,
        [rankId, user.id, user.username, getDivisionByScore(1000), SEASON_ID, now, now]
    );
    await dbRun(
        `UPDATE pvp_ranks SET user_name = ? WHERE user_id = ?`,
        [user.username, user.id]
    );
    return dbGet(`SELECT * FROM pvp_ranks WHERE user_id = ?`, [user.id]);
}

async function ensureEconomy(userId) {
    const now = Date.now();
    const existing = await dbGet(`SELECT economy_data FROM pvp_economy WHERE user_id = ?`, [userId]);
    if (existing) {
        const rawEconomy = parseJson(existing.economy_data, {});
        const normalized = normalizeEconomy(rawEconomy, userId);
        if (rawEconomy && rawEconomy.seasonHonorCollection && typeof rawEconomy.seasonHonorCollection === 'object' && !Array.isArray(rawEconomy.seasonHonorCollection)) {
            normalized.rawSeasonHonorCollection = rawEconomy.seasonHonorCollection;
        }
        return normalized;
    }
    const economy = defaultEconomy(userId);
    await dbRun(
        `INSERT OR IGNORE INTO pvp_economy (user_id, economy_data, updated_at) VALUES (?, ?, ?)`,
        [userId, JSON.stringify(economy), now]
    );
    return economy;
}

async function migrateSeasonHonorCollectionForSettlement({ userId, economy, matchId, now }) {
    const rawCollection = economy && economy.rawSeasonHonorCollection && typeof economy.rawSeasonHonorCollection === 'object' && !Array.isArray(economy.rawSeasonHonorCollection)
        ? economy.rawSeasonHonorCollection
        : economy && economy.seasonHonorCollection;
    if (!rawCollection || typeof rawCollection !== 'object' || Array.isArray(rawCollection) || getSeasonHonorRewardCount(rawCollection) === 0) {
        return economy;
    }
    const rawSeasonId = String(rawCollection.seasonId || '').trim();
    if (rawSeasonId === SEASON_ID) {
        await recordSeasonRewardClaimsFromCollection(db, {
            userId,
            collection: rawCollection,
            seasonId: SEASON_ID,
            claimSource: 'economy_collection_backfill',
            sourceMatchId: '',
            claimedAt: now
        });
        return economy;
    }
    const archiveSeasonId = rawSeasonId || 'legacy-unversioned';
    await recordSeasonRewardClaimsFromCollection(db, {
        userId,
        collection: rawCollection,
        seasonId: archiveSeasonId,
        claimSource: 'legacy_economy_archive',
        sourceMatchId: matchId,
        claimedAt: now
    });
    await recordSeasonHonorArchiveFromCollection(db, {
        userId,
        collection: rawCollection,
        seasonId: archiveSeasonId,
        archiveSource: 'legacy_economy_archive',
        sourceMatchId: matchId,
        archivedAt: now
    });
    return {
        ...economy,
        seasonHonorCollection: normalizeSeasonHonorCollection(null),
        rawSeasonHonorCollection: null
    };
}

async function saveEconomy(userId, economy) {
    const normalized = normalizeEconomy(economy, userId);
    await dbRun(
        `INSERT INTO pvp_economy (user_id, economy_data, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET economy_data = excluded.economy_data, updated_at = excluded.updated_at`,
        [userId, JSON.stringify(normalized), Date.now()]
    );
    return normalized;
}

function calculateElo(myRating, opponentRating, didWin) {
    const my = Math.max(0, Number(myRating) || 1000);
    const opp = Math.max(0, Number(opponentRating) || 1000);
    const expected = 1 / (1 + Math.pow(10, (opp - my) / 400));
    const actual = didWin ? 1 : 0;
    let delta = Math.round(32 * (actual - expected));
    if (didWin) delta = Math.max(8, Math.min(32, delta));
    else delta = Math.min(-8, Math.max(-32, delta));
    return {
        newRating: Math.max(0, my + delta),
        delta
    };
}

function calculateReward({ didWin, opponentRating, currentRating, winStreak = 0, lossStreak = 0 }) {
    const division = getDivisionByScore(currentRating);
    const divisionMultiplier = division === '天穹榜' ? 1.2 : division === '凌霄榜' ? 1.12 : division === '问道榜' ? 1.06 : 1;
    const baseReward = didWin ? 65 : 30;
    const rankedBonus = 15;
    const ratingBonus = Math.max(0, Math.min(20, Math.floor((Math.max(0, Number(opponentRating) || 1000) - 1000) / 80)));
    const streakBase = didWin ? winStreak : lossStreak;
    const streakMultiplier = didWin ? Math.min(1.25, 1 + streakBase * 0.03) : Math.min(1.12, 1 + streakBase * 0.02);
    return Math.max(8, Math.floor((baseReward + rankedBonus + (didWin ? ratingBonus : Math.floor(ratingBonus / 2))) * streakMultiplier * divisionMultiplier));
}

function appendEconomyLog(economy, entry) {
    const logs = Array.isArray(economy.transactionLog) ? economy.transactionLog.slice(-39) : [];
    logs.push({
        type: entry.type || 'misc',
        itemId: entry.itemId || null,
        itemName: entry.itemName || null,
        coins: Math.floor(Number(entry.coins) || 0),
        detail: entry.detail || '',
        at: Math.max(0, Math.floor(Number(entry.at) || Date.now()))
    });
    return { ...economy, transactionLog: logs };
}

function appendMatchHistory(economy, entry) {
    const history = Array.isArray(economy.matchHistory) ? economy.matchHistory.slice(-23) : [];
    history.push(entry);
    return { ...economy, matchHistory: history };
}

function findFinishedEvent(match) {
    const events = match && match.state && Array.isArray(match.state.events) ? match.state.events : [];
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event && event.eventType === 'match_finished' && event.payload) {
            return event;
        }
    }
    return null;
}

function getSeat(state, seatId) {
    return state && state.seats && state.seats[seatId] ? state.seats[seatId] : null;
}

async function recordTrustedProgressionEvent(input, now) {
    const event = makeTrustedPvpProgressionEvent(input);
    if (!event) return false;
    const result = await dbRun(
        `INSERT OR IGNORE INTO progression_events
            (user_id, event_id, event_type, activity_mode, source_kind, trust_tier, source_ref,
             battle_wins, boss_wins, activity_completions, pvp_matches, pvp_wins, proof_json, occurred_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            input.userId,
            event.eventId,
            event.eventType,
            event.mode,
            event.sourceKind,
            event.trustTier,
            event.sourceRef,
            event.battleWins,
            event.bossWins,
            event.activityCompletions,
            event.pvpMatches,
            event.pvpWins,
            JSON.stringify(event.proof || {}),
            now,
            now
        ]
    );
    return result.changes > 0;
}

async function recordTrustedProgressionSettlement({ matchId, finishReason, winner, loser, now }) {
    const entries = [
        winner && { userId: winner.userId, didWin: true },
        loser && { userId: loser.userId, didWin: false }
    ].filter(entry => entry && entry.userId);
    for (const entry of entries) {
        await recordTrustedProgressionEvent({
            ...entry,
            matchId,
            finishReason
        }, now);
    }
}

function buildParticipantSummary({ user, rankRow, opponentUser, opponentRankRow, didWin, match, finishReason, calc, coinsAwarded, now }) {
    const opponentScore = Math.max(0, Math.floor(Number(opponentRankRow.score) || 1000));
    return {
        source: 'live_pvp',
        seasonId: SEASON_ID,
        seasonName: SEASON_NAME,
        matchId: match.matchId,
        opponentRankId: makeRankId(opponentUser.id),
        opponentUserId: opponentUser.id,
        opponentName: opponentUser.username || '未知对手',
        opponentDivision: opponentRankRow.division || getDivisionByScore(opponentScore),
        opponentRealm: Math.max(1, Math.floor(Number(opponentRankRow.realm) || 1)),
        didWin,
        verdictLabel: didWin ? '实时论道得胜' : '实时论道惜败',
        ratingDelta: calc.delta,
        scoreAfter: calc.newRating,
        coinsAwarded,
        finishReason,
        oldRating: Math.max(0, Math.floor(Number(rankRow.score) || 1000)),
        at: now
    };
}

async function settleParticipant({ user, opponentUser, rankRow, opponentRankRow, didWin, match, finishReason, now }) {
    const currentRating = Math.max(0, Math.floor(Number(rankRow.score) || 1000));
    const opponentRating = Math.max(0, Math.floor(Number(opponentRankRow.score) || 1000));
    const calc = calculateElo(currentRating, opponentRating, didWin);
    const wins = Math.max(0, Math.floor(Number(rankRow.wins) || 0)) + (didWin ? 1 : 0);
    const losses = Math.max(0, Math.floor(Number(rankRow.losses) || 0)) + (didWin ? 0 : 1);
    await dbRun(
        `UPDATE pvp_ranks SET score = ?, wins = ?, losses = ?, division = ?, updated_at = ? WHERE user_id = ?`,
        [calc.newRating, wins, losses, getDivisionByScore(calc.newRating), now, user.id]
    );

    const economy = await ensureEconomy(user.id);
    const settlementEconomy = await migrateSeasonHonorCollectionForSettlement({
        userId: user.id,
        economy,
        matchId: match.matchId,
        now
    });
    const coinsAwarded = calculateReward({
        didWin,
        opponentRating,
        currentRating,
        winStreak: settlementEconomy.winStreak,
        lossStreak: settlementEconomy.lossStreak
    });
    const nextEconomyBase = {
        ...settlementEconomy,
        coins: settlementEconomy.coins + coinsAwarded,
        totalEarned: settlementEconomy.totalEarned + coinsAwarded,
        wins: settlementEconomy.wins + (didWin ? 1 : 0),
        losses: settlementEconomy.losses + (didWin ? 0 : 1),
        totalMatches: settlementEconomy.totalMatches + 1,
        winStreak: didWin ? settlementEconomy.winStreak + 1 : 0,
        lossStreak: didWin ? 0 : settlementEconomy.lossStreak + 1,
        lastRewardAt: now
    };
    nextEconomyBase.bestWinStreak = Math.max(nextEconomyBase.bestWinStreak, nextEconomyBase.winStreak);
    const honorCollectionGrant = grantSeasonHonorCollection(nextEconomyBase, {
        gamesPlayed: wins + losses,
        now
    });
    await recordSeasonRewardClaims(db, {
        userId: user.id,
        seasonId: SEASON_ID,
        rewards: honorCollectionGrant.newlyUnlocked,
        claimSource: 'live_ranked_settlement',
        sourceMatchId: match.matchId,
        claimedAt: now
    });

    const historyEntry = buildParticipantSummary({
        user,
        rankRow,
        opponentUser,
        opponentRankRow,
        didWin,
        match,
        finishReason,
        calc,
        coinsAwarded,
        now
    });
    let nextEconomy = appendEconomyLog(honorCollectionGrant.economy, {
        type: 'live_match_reward',
        coins: coinsAwarded,
        detail: didWin ? '实时论道胜场奖励' : '实时论道参战奖励',
        at: now
    });
    honorCollectionGrant.newlyUnlocked.forEach((reward) => {
        nextEconomy = appendEconomyLog(nextEconomy, {
            type: 'live_season_honor_cosmetic',
            itemId: reward.rewardId,
            itemName: reward.rewardName,
            coins: 0,
            detail: '赛季荣誉外观入库',
            at: now
        });
    });
    nextEconomy = appendMatchHistory(nextEconomy, historyEntry);
    await saveEconomy(user.id, nextEconomy);

    await dbRun(
        `INSERT OR IGNORE INTO pvp_match_history
            (ticket_id, user_id, opponent_user_id, did_win, rating_delta, score_after, coins_awarded, payload, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`live:${match.matchId}:${user.id}`, user.id, opponentUser.id, didWin ? 1 : 0, calc.delta, calc.newRating, coinsAwarded, JSON.stringify(historyEntry), now]
    );

    return {
        userId: user.id,
        didWin,
        oldScore: currentRating,
        newScore: calc.newRating,
        ratingDelta: calc.delta,
        coinsAwarded,
        wins,
        losses,
        rankedGames: wins + losses,
        seasonId: SEASON_ID,
        seasonName: SEASON_NAME,
        seasonHonorClaim: honorCollectionGrant.claim
    };
}

function makeSqliteLivePvpSettlement() {
    return {
        async settleMatch(match) {
            if (!match || !match.state || match.state.status !== 'finished') {
                return { settled: false, reason: 'match_not_finished' };
            }
            if (match.mode === 'friendly' || match.state.mode === 'friendly') {
                return { settled: false, reason: 'friendly_no_ranked_impact', matchId: match.matchId };
            }
            const finishedEvent = findFinishedEvent(match);
            if (!finishedEvent) {
                return { settled: false, reason: 'missing_finished_event' };
            }
            const winnerSeatId = finishedEvent.payload.winnerSeat;
            const loserSeatId = finishedEvent.payload.loserSeat;
            const finishReason = String(finishedEvent.payload.finishReason || 'lethal');
            if (winnerSeatId === 'draw' || finishReason === 'round14_draw') {
                return {
                    settled: false,
                    reason: 'round14_draw_no_ranked_impact',
                    matchId: match.matchId,
                    finishReason
                };
            }
            const winnerSeat = getSeat(match.state, winnerSeatId);
            const loserSeat = getSeat(match.state, loserSeatId);
            if (!winnerSeat || !loserSeat || !winnerSeat.userId || !loserSeat.userId) {
                return { settled: false, reason: 'invalid_finished_seats' };
            }
            return withTransaction(async () => {
                const existing = await dbGet(
                    `SELECT * FROM pvp_live_match_settlements WHERE match_id = ?`,
                    [match.matchId]
                );
                if (existing) {
                    let payload = null;
                    try {
                        payload = existing.payload ? JSON.parse(existing.payload) : null;
                    } catch (error) {
                        payload = null;
                    }
                    const existingWinner = payload && payload.winner || { userId: existing.winner_user_id };
                    const existingLoser = payload && payload.loser || { userId: existing.loser_user_id };
                    await recordTrustedProgressionSettlement({
                        matchId: match.matchId,
                        finishReason: existing.finish_reason || finishReason,
                        winner: existingWinner,
                        loser: existingLoser,
                        now: Math.max(0, Math.floor(Number(existing.created_at) || Date.now()))
                    });
                    return {
                        settled: true,
                        alreadySettled: true,
                        matchId: match.matchId,
                        ...(payload && typeof payload === 'object' ? payload : {})
                    };
                }

                const winnerUser = await getLiveUser(winnerSeat.userId, winnerSeat.displayName);
                const loserUser = await getLiveUser(loserSeat.userId, loserSeat.displayName);
                const winnerRank = await ensureRank(winnerUser);
                const loserRank = await ensureRank(loserUser);
                const now = Date.now();
                const winnerResult = await settleParticipant({
                    user: winnerUser,
                    opponentUser: loserUser,
                    rankRow: winnerRank,
                    opponentRankRow: loserRank,
                    didWin: true,
                    match,
                    finishReason,
                    now
                });
                const loserResult = await settleParticipant({
                    user: loserUser,
                    opponentUser: winnerUser,
                    rankRow: loserRank,
                    opponentRankRow: winnerRank,
                    didWin: false,
                    match,
                    finishReason,
                    now
                });
                const payload = {
                    source: 'live_pvp',
                    matchId: match.matchId,
                    winner: winnerResult,
                    loser: loserResult,
                    finishReason,
                    settledAt: now
                };
                await dbRun(
                    `INSERT INTO pvp_live_match_settlements
                        (match_id, winner_user_id, loser_user_id, winner_seat, loser_seat, finish_reason,
                         rating_delta_winner, rating_delta_loser, winner_score_after, loser_score_after,
                         winner_coins_awarded, loser_coins_awarded, payload, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        match.matchId,
                        winnerUser.id,
                        loserUser.id,
                        winnerSeatId,
                        loserSeatId,
                        finishReason,
                        winnerResult.ratingDelta,
                        loserResult.ratingDelta,
                        winnerResult.newScore,
                        loserResult.newScore,
                        winnerResult.coinsAwarded,
                        loserResult.coinsAwarded,
                        JSON.stringify(payload),
                        now
                    ]
                );
                await recordTrustedProgressionSettlement({
                    matchId: match.matchId,
                    finishReason,
                    winner: winnerResult,
                    loser: loserResult,
                    now
                });
                return { settled: true, matchId: match.matchId, ...payload };
            });
        }
    };
}

module.exports = {
    SEASON_ID,
    SEASON_NAME,
    SEASON_HONOR_REWARD_TRACK,
    normalizeSeasonHonorCollection,
    makeSqliteLivePvpSettlement,
    withLiveSettlementReadGate
};
