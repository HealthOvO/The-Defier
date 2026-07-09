const {
    SEASON_ID,
    SEASON_NAME,
    SEASON_HONOR_REWARD_TRACK,
    withLiveSettlementReadGate
} = require('./live-settlement');
const {
    loadSeasonArchiveSummary,
    loadSeasonRewardClaims,
    makeClaimLedgerFromCollection,
    makeSeasonArchiveEntryFromCollection,
    makeClaimLedger,
    mergeClaimLedgers,
    mergeSeasonArchiveSummary
} = require('./season-claims');

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

function makeCollectionReportFromClaims(claimLedger) {
    const claims = Array.isArray(claimLedger) ? claimLedger : [];
    const latest = claims.slice().sort((left, right) => {
        const claimedDelta = Math.max(0, Math.floor(Number(right.claimedAt) || 0)) - Math.max(0, Math.floor(Number(left.claimedAt) || 0));
        if (claimedDelta !== 0) return claimedDelta;
        return Math.max(1, Math.floor(Number(right.targetGames) || 1)) - Math.max(1, Math.floor(Number(left.targetGames) || 1));
    })[0] || null;
    return {
        reportVersion: 'pvp-live-season-honor-collection-v1',
        seasonId: SEASON_ID,
        totalUnlocked: claims.length,
        lastUnlockedRewardId: latest ? latest.rewardId : null,
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none',
        boundary: '赛季荣誉收藏只保存外观成就，不授予卡牌、属性、资源、起手、匹配或战斗效果。'
    };
}

function getCollectionRewardCount(rawCollection) {
    const rewards = rawCollection.unlockedRewards && typeof rawCollection.unlockedRewards === 'object' && !Array.isArray(rawCollection.unlockedRewards)
        ? rawCollection.unlockedRewards
        : {};
    return Object.keys(rewards).length;
}

function makeReadOnlyEconomyArchiveEntry(rawCollection, economyUpdatedAt) {
    if (!rawCollection || typeof rawCollection !== 'object' || Array.isArray(rawCollection) || getCollectionRewardCount(rawCollection) === 0) return null;
    const rawSeasonId = String(rawCollection.seasonId || '').trim();
    const seasonId = rawSeasonId || 'legacy-unversioned';
    if (seasonId === SEASON_ID) return null;
    return makeSeasonArchiveEntryFromCollection({
        collection: rawCollection,
        seasonId,
        archiveSource: 'economy_snapshot',
        archivedAt: Math.max(0, Math.floor(Number(economyUpdatedAt) || Date.now()))
    });
}

function makeReadOnlyCurrentSeasonClaimLedger(rawCollection, economyUpdatedAt) {
    if (!rawCollection || typeof rawCollection !== 'object' || Array.isArray(rawCollection) || getCollectionRewardCount(rawCollection) === 0) return [];
    const rawSeasonId = String(rawCollection.seasonId || '').trim();
    if (rawSeasonId !== SEASON_ID) return [];
    return makeClaimLedgerFromCollection({
        collection: rawCollection,
        seasonId: SEASON_ID,
        claimSource: 'economy_snapshot',
        sourceMatchId: '',
        claimedAt: Math.max(0, Math.floor(Number(economyUpdatedAt) || Date.now()))
    });
}

async function buildLivePvpSeasonStatus(db, userId) {
    const id = String(userId || '').trim();
    return withLiveSettlementReadGate(async () => {
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
        `SELECT economy_data, updated_at
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
    const economySeasonIsCurrent = rawCollectionSeasonId === SEASON_ID;
    const rankSeasonId = String(rankRow && rankRow.season_id || '');
    const rankIsCurrentSeason = !!rankRow && (!rankSeasonId || rankSeasonId === SEASON_ID);
    const wins = Math.max(0, Math.floor(Number(rankIsCurrentSeason ? rankRow.wins : economySeasonIsCurrent && economy && economy.wins) || 0));
    const losses = Math.max(0, Math.floor(Number(rankIsCurrentSeason ? rankRow.losses : economySeasonIsCurrent && economy && economy.losses) || 0));
    const rankedGames = wins + losses;
    const rewardTrack = makeSeasonRewardTrack();
    const nextReward = rewardTrack.find(reward => reward.targetGames > rankedGames) || rewardTrack[rewardTrack.length - 1] || null;
    const claimLedger = mergeClaimLedgers(
        makeClaimLedger(await loadSeasonRewardClaims(db, id, SEASON_ID)),
        makeReadOnlyCurrentSeasonClaimLedger(rawCollection, economyRow && economyRow.updated_at)
    );
    const collection = makeCollectionReportFromClaims(claimLedger);
    const archive = mergeSeasonArchiveSummary(
        await loadSeasonArchiveSummary(db, id, SEASON_ID),
        [makeReadOnlyEconomyArchiveEntry(rawCollection, economyRow && economyRow.updated_at)].filter(Boolean)
    );
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
            collection,
            claimLedger,
            nextReward,
            boundary: '赛季进度只来自服务端排位结算和经济收藏记录，不读取隐藏对局信息。'
        },
        archive
    };
    });
}

module.exports = {
    buildLivePvpSeasonStatus,
    makeSeasonRewardTrack
};
