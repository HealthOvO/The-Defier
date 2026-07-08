const {
    SEASON_ID,
    SEASON_NAME,
    SEASON_HONOR_REWARD_TRACK,
    normalizeSeasonHonorCollection
} = require('./live-settlement');

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => err ? reject(err) : resolve(row || null));
    });
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

function makeSeasonRewardTrack() {
    return SEASON_HONOR_REWARD_TRACK.map(reward => ({
        reportVersion: 'pvp-live-season-reward-v1',
        seasonId: SEASON_ID,
        rewardId: reward.rewardId,
        rewardType: reward.rewardType,
        rewardName: reward.rewardName,
        targetGames: Math.max(1, Math.floor(Number(reward.targetGames) || 1)),
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none'
    }));
}

function makeClaimLedger(collection) {
    const rewards = collection && collection.unlockedRewards && typeof collection.unlockedRewards === 'object'
        ? collection.unlockedRewards
        : {};
    return Object.keys(rewards)
        .map(rewardId => rewards[rewardId])
        .filter(Boolean)
        .sort((left, right) => (left.targetGames || 0) - (right.targetGames || 0))
        .map(entry => ({
            rewardId: String(entry.rewardId || ''),
            rewardType: String(entry.rewardType || 'cosmetic_badge'),
            rewardName: String(entry.rewardName || '赛季荣誉外观'),
            targetGames: Math.max(1, Math.floor(Number(entry.targetGames) || 1)),
            unlockedAt: Math.max(0, Math.floor(Number(entry.unlockedAt) || 0)),
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none'
        }));
}

async function buildLivePvpSeasonStatus(db, userId) {
    const id = String(userId || '').trim();
    const rankRow = id ? await dbGet(
        db,
        `SELECT score, division, season_id, wins, losses
         FROM pvp_ranks
         WHERE user_id = ?
         LIMIT 1`,
        [id]
    ) : null;
    const economyRow = id ? await dbGet(
        db,
        `SELECT economy_data
         FROM pvp_economy
         WHERE user_id = ?
         LIMIT 1`,
        [id]
    ) : null;
    const economy = parseJson(economyRow && economyRow.economy_data, {});
    const rawCollection = economy && economy.seasonHonorCollection && typeof economy.seasonHonorCollection === 'object' && !Array.isArray(economy.seasonHonorCollection)
        ? economy.seasonHonorCollection
        : null;
    const rawCollectionSeasonId = String(rawCollection && rawCollection.seasonId || '');
    const normalizedCollection = normalizeSeasonHonorCollection(rawCollection);
    const economySeasonIsCurrent = rawCollectionSeasonId === SEASON_ID;
    const collection = economySeasonIsCurrent
        ? normalizedCollection
        : normalizeSeasonHonorCollection(null);
    const rankSeasonId = String(rankRow && rankRow.season_id || '');
    const rankIsCurrentSeason = !!rankRow && (!rankSeasonId || rankSeasonId === SEASON_ID);
    const wins = Math.max(0, Math.floor(Number(rankIsCurrentSeason ? rankRow.wins : economySeasonIsCurrent && economy && economy.wins) || 0));
    const losses = Math.max(0, Math.floor(Number(rankIsCurrentSeason ? rankRow.losses : economySeasonIsCurrent && economy && economy.losses) || 0));
    const rankedGames = wins + losses;
    const rewardTrack = makeSeasonRewardTrack();
    const nextReward = rewardTrack.find(reward => reward.targetGames > rankedGames) || rewardTrack[rewardTrack.length - 1] || null;
    return {
        reportVersion: 'pvp-live-season-status-v1',
        config: {
            reportVersion: 'pvp-live-season-config-v1',
            seasonId: SEASON_ID,
            seasonName: SEASON_NAME,
            ruleVersion: 'pvp-live-v1',
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none',
            rankedImpact: 'honor_only',
            rewardTrack,
            boundary: '真人论道赛季奖励只发外观荣誉，不授予卡牌、属性、资源、匹配、起手或战斗效果。'
        },
        userProgress: {
            reportVersion: 'pvp-live-season-progress-v1',
            userId: id,
            seasonId: SEASON_ID,
            score: Math.max(0, Math.floor(Number(rankIsCurrentSeason && rankRow && rankRow.score) || 1000)),
            division: String(rankIsCurrentSeason && rankRow && rankRow.division || '潜龙榜'),
            wins,
            losses,
            rankedGames,
            collection: {
                reportVersion: collection.reportVersion,
                seasonId: collection.seasonId,
                totalUnlocked: Math.max(0, Math.floor(Number(collection.totalUnlocked) || 0)),
                lastUnlockedRewardId: collection.lastUnlockedRewardId || null,
                rewardImpact: 'cosmetic_only',
                powerImpact: 'none',
                boundary: collection.boundary
            },
            claimLedger: makeClaimLedger(collection),
            nextReward,
            boundary: '赛季进度只来自服务端排位结算和经济收藏记录，不读取隐藏对局信息。'
        }
    };
}

module.exports = {
    buildLivePvpSeasonStatus,
    makeSeasonRewardTrack
};
