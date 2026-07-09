const crypto = require('crypto');

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(Array.isArray(rows) ? rows : []));
    });
}

function makeClaimId(userId, seasonId, rewardId) {
    const digest = crypto.createHash('sha256')
        .update(['pvp-season-reward-claim-v1', userId, seasonId, rewardId].join('|'))
        .digest('hex')
        .slice(0, 32);
    return `pvpsrc-${digest}`;
}

function makeArchiveId(userId, seasonId) {
    const digest = crypto.createHash('sha256')
        .update(['pvp-season-honor-archive-v1', userId, seasonId].join('|'))
        .digest('hex')
        .slice(0, 32);
    return `pvpsha-${digest}`;
}

function normalizeToken(value, fallback) {
    const normalized = String(value || fallback || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 96);
    return normalized || String(fallback || 'unknown');
}

function normalizeRewardClaim(reward) {
    const src = reward && typeof reward === 'object' && !Array.isArray(reward) ? reward : {};
    const rewardId = String(src.rewardId || '').trim();
    if (!rewardId) return null;
    return {
        rewardId,
        rewardType: String(src.rewardType || 'cosmetic_badge').trim().slice(0, 64) || 'cosmetic_badge',
        rewardName: String(src.rewardName || '赛季荣誉外观').trim().slice(0, 96) || '赛季荣誉外观',
        targetGames: Math.max(1, Math.floor(Number(src.targetGames) || 1)),
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none',
        claimedAt: Math.max(0, Math.floor(Number(src.unlockedAt || src.claimedAt) || 0))
    };
}

function collectionRewards(collection) {
    const rewards = collection && collection.unlockedRewards && typeof collection.unlockedRewards === 'object' && !Array.isArray(collection.unlockedRewards)
        ? collection.unlockedRewards
        : {};
    return Object.keys(rewards)
        .map(key => normalizeRewardClaim({ rewardId: key, ...rewards[key] }))
        .filter(Boolean);
}

function summarizeCollectionArchive(collection) {
    const rewards = collectionRewards(collection);
    if (rewards.length === 0) return null;
    const latest = rewards.slice().sort((left, right) => {
        const claimedDelta = Math.max(0, Math.floor(Number(right.claimedAt) || 0)) - Math.max(0, Math.floor(Number(left.claimedAt) || 0));
        if (claimedDelta !== 0) return claimedDelta;
        const targetDelta = Math.max(1, Math.floor(Number(right.targetGames) || 1)) - Math.max(1, Math.floor(Number(left.targetGames) || 1));
        if (targetDelta !== 0) return targetDelta;
        return String(right.rewardId || '').localeCompare(String(left.rewardId || ''));
    })[0] || null;
    return {
        reportVersion: 'pvp-live-season-honor-archive-payload-v1',
        totalUnlocked: rewards.length,
        lastUnlockedRewardId: latest ? latest.rewardId : '',
        rewards: rewards.map(reward => ({
            rewardId: reward.rewardId,
            rewardType: reward.rewardType,
            rewardName: reward.rewardName,
            targetGames: reward.targetGames,
            claimedAt: reward.claimedAt,
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none'
        }))
    };
}

function makeSeasonArchiveEntryFromCollection({
    collection,
    seasonId,
    archiveSource = 'economy_snapshot',
    archivedAt = Date.now()
} = {}) {
    const safeSeasonId = String(seasonId || collection && collection.seasonId || 'legacy-unversioned').trim() || 'legacy-unversioned';
    const summary = summarizeCollectionArchive(collection);
    if (!summary) return null;
    const latestClaimedAt = summary.rewards.reduce((latest, reward) => Math.max(latest, Math.max(0, Math.floor(Number(reward.claimedAt) || 0))), 0);
    const safeArchivedAt = Math.max(0, Math.floor(Number(archivedAt) || latestClaimedAt || Date.now()));
    return {
        reportVersion: 'pvp-live-season-archive-season-v1',
        seasonId: safeSeasonId,
        totalClaims: summary.totalUnlocked,
        totalUnlocked: summary.totalUnlocked,
        archiveSource: normalizeToken(archiveSource, 'economy_snapshot'),
        latestClaimedAt: latestClaimedAt || safeArchivedAt,
        archivedAt: safeArchivedAt,
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none'
    };
}

function mergeSeasonArchiveSummary(summary, extraEntries = []) {
    const src = summary && typeof summary === 'object' && !Array.isArray(summary) ? summary : {};
    const bySeason = new Map();
    (Array.isArray(src.seasons) ? src.seasons : []).forEach((entry) => {
        const seasonId = String(entry && entry.seasonId || '').trim();
        if (!seasonId) return;
        bySeason.set(seasonId, entry);
    });
    (Array.isArray(extraEntries) ? extraEntries : []).forEach((entry) => {
        const seasonId = String(entry && entry.seasonId || '').trim();
        if (!seasonId || bySeason.has(seasonId)) return;
        bySeason.set(seasonId, entry);
    });
    const seasons = Array.from(bySeason.values())
        .sort((left, right) => {
            const rightTime = Math.max(Number(right.archivedAt) || 0, Number(right.latestClaimedAt) || 0);
            const leftTime = Math.max(Number(left.archivedAt) || 0, Number(left.latestClaimedAt) || 0);
            if (rightTime !== leftTime) return rightTime - leftTime;
            return String(left.seasonId || '').localeCompare(String(right.seasonId || ''));
        })
        .slice(0, 12);
    return {
        reportVersion: 'pvp-live-season-archive-v1',
        archivedSeasonCount: seasons.length,
        seasons
    };
}

async function recordSeasonRewardClaims(db, {
    userId,
    seasonId,
    rewards,
    claimSource = 'live_ranked_settlement',
    sourceMatchId = '',
    claimedAt = Date.now()
} = {}) {
    const safeUserId = String(userId || '').trim();
    const safeSeasonId = String(seasonId || '').trim();
    if (!safeUserId || !safeSeasonId || !Array.isArray(rewards) || rewards.length === 0) return [];
    const now = Math.max(0, Math.floor(Number(claimedAt) || Date.now()));
    const safeSource = normalizeToken(claimSource, 'live_ranked_settlement');
    const safeMatchId = String(sourceMatchId || '').trim().slice(0, 96);
    const recorded = [];
    for (const rawReward of rewards) {
        const reward = normalizeRewardClaim(rawReward);
        if (!reward) continue;
        const claimId = makeClaimId(safeUserId, safeSeasonId, reward.rewardId);
        await dbRun(
            db,
            `INSERT OR IGNORE INTO pvp_season_reward_claims
                (claim_id, user_id, season_id, reward_id, reward_type, reward_name, target_games,
                 claim_source, source_match_id, reward_impact, power_impact, claim_payload_json, claimed_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cosmetic_only', 'none', ?, ?, ?)`,
            [
                claimId,
                safeUserId,
                safeSeasonId,
                reward.rewardId,
                reward.rewardType,
                reward.rewardName,
                reward.targetGames,
                safeSource,
                safeMatchId,
                JSON.stringify({
                    reportVersion: 'pvp-live-season-claim-payload-v1',
                    rewardId: reward.rewardId,
                    sourceMatchId: safeMatchId,
                    claimSource: safeSource,
                    rewardImpact: 'cosmetic_only',
                    powerImpact: 'none'
                }),
                reward.claimedAt || now,
                now
            ]
        );
        recorded.push({
            claimId,
            userId: safeUserId,
            seasonId: safeSeasonId,
            ...reward,
            claimSource: safeSource,
            sourceMatchId: safeMatchId,
            claimedAt: reward.claimedAt || now
        });
    }
    return recorded;
}

async function recordSeasonRewardClaimsFromCollection(db, {
    userId,
    collection,
    seasonId,
    claimSource,
    sourceMatchId = '',
    claimedAt = Date.now()
} = {}) {
    return recordSeasonRewardClaims(db, {
        userId,
        seasonId,
        rewards: collectionRewards(collection),
        claimSource,
        sourceMatchId,
        claimedAt
    });
}

async function recordSeasonHonorArchiveFromCollection(db, {
    userId,
    collection,
    seasonId,
    archiveSource = 'legacy_economy_archive',
    sourceMatchId = '',
    archivedAt = Date.now()
} = {}) {
    const safeUserId = String(userId || '').trim();
    const safeSeasonId = String(seasonId || '').trim();
    if (!safeUserId || !safeSeasonId) return null;
    const summary = summarizeCollectionArchive(collection);
    if (!summary) return null;
    const now = Math.max(0, Math.floor(Number(archivedAt) || Date.now()));
    const safeSource = normalizeToken(archiveSource, 'legacy_economy_archive');
    const safeMatchId = String(sourceMatchId || '').trim().slice(0, 96);
    const archiveId = makeArchiveId(safeUserId, safeSeasonId);
    await dbRun(
        db,
        `INSERT INTO pvp_season_honor_archives
            (archive_id, user_id, season_id, total_unlocked, last_unlocked_reward_id,
             archive_source, source_match_id, reward_impact, power_impact, collection_payload_json,
             archived_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'cosmetic_only', 'none', ?, ?, ?)
         ON CONFLICT(user_id, season_id) DO UPDATE SET
            total_unlocked = excluded.total_unlocked,
            last_unlocked_reward_id = excluded.last_unlocked_reward_id,
            archive_source = excluded.archive_source,
            source_match_id = excluded.source_match_id,
            reward_impact = excluded.reward_impact,
            power_impact = excluded.power_impact,
            collection_payload_json = excluded.collection_payload_json,
            archived_at = excluded.archived_at,
            updated_at = excluded.updated_at`,
        [
            archiveId,
            safeUserId,
            safeSeasonId,
            summary.totalUnlocked,
            summary.lastUnlockedRewardId,
            safeSource,
            safeMatchId,
            JSON.stringify({
                ...summary,
                seasonId: safeSeasonId,
                archiveSource: safeSource,
                sourceMatchId: safeMatchId,
                rewardImpact: 'cosmetic_only',
                powerImpact: 'none'
            }),
            now,
            now
        ]
    );
    return {
        archiveId,
        userId: safeUserId,
        seasonId: safeSeasonId,
        totalUnlocked: summary.totalUnlocked,
        lastUnlockedRewardId: summary.lastUnlockedRewardId,
        archiveSource: safeSource,
        sourceMatchId: safeMatchId,
        archivedAt: now,
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none'
    };
}

async function loadSeasonRewardClaims(db, userId, seasonId) {
    const safeUserId = String(userId || '').trim();
    const safeSeasonId = String(seasonId || '').trim();
    if (!safeUserId || !safeSeasonId) return [];
    return dbAll(
        db,
        `SELECT claim_id, user_id, season_id, reward_id, reward_type, reward_name, target_games,
                claim_source, source_match_id, reward_impact, power_impact, claimed_at, updated_at
         FROM pvp_season_reward_claims
         WHERE user_id = ? AND season_id = ?
         ORDER BY target_games ASC, claimed_at ASC, reward_id ASC`,
        [safeUserId, safeSeasonId]
    );
}

async function loadSeasonArchiveSummary(db, userId, currentSeasonId) {
    const safeUserId = String(userId || '').trim();
    const safeSeasonId = String(currentSeasonId || '').trim();
    if (!safeUserId || !safeSeasonId) {
        return {
            reportVersion: 'pvp-live-season-archive-v1',
            archivedSeasonCount: 0,
            seasons: []
        };
    }
    const claimRows = await dbAll(
        db,
        `SELECT season_id, COUNT(*) AS total_claims, MAX(claimed_at) AS latest_claimed_at
         FROM pvp_season_reward_claims
         WHERE user_id = ? AND season_id != ?
         GROUP BY season_id
         ORDER BY latest_claimed_at DESC, season_id ASC
         LIMIT 12`,
        [safeUserId, safeSeasonId]
    );
    const archiveRows = await dbAll(
        db,
        `SELECT season_id, total_unlocked, archive_source, archived_at
         FROM pvp_season_honor_archives
         WHERE user_id = ? AND season_id != ?
         ORDER BY archived_at DESC, season_id ASC
         LIMIT 12`,
        [safeUserId, safeSeasonId]
    );
    const bySeason = new Map();
    for (const row of claimRows) {
        const seasonId = String(row.season_id || '');
        if (!seasonId) continue;
        const totalClaims = Math.max(0, Math.floor(Number(row.total_claims) || 0));
        const latestClaimedAt = Math.max(0, Math.floor(Number(row.latest_claimed_at) || 0));
        bySeason.set(seasonId, {
            reportVersion: 'pvp-live-season-archive-season-v1',
            seasonId,
            totalClaims,
            totalUnlocked: totalClaims,
            archiveSource: 'reward_claim_ledger',
            latestClaimedAt,
            archivedAt: latestClaimedAt,
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none'
        });
    }
    for (const row of archiveRows) {
        const seasonId = String(row.season_id || '');
        if (!seasonId) continue;
        const existing = bySeason.get(seasonId) || {
            reportVersion: 'pvp-live-season-archive-season-v1',
            seasonId,
            totalClaims: 0,
            latestClaimedAt: 0,
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none'
        };
        existing.totalUnlocked = Math.max(0, Math.floor(Number(row.total_unlocked) || existing.totalClaims || 0));
        existing.archiveSource = normalizeToken(row.archive_source, 'legacy_economy_archive');
        existing.archivedAt = Math.max(0, Math.floor(Number(row.archived_at) || existing.latestClaimedAt || 0));
        bySeason.set(seasonId, existing);
    }
    const seasons = Array.from(bySeason.values())
        .sort((left, right) => {
            const rightTime = Math.max(Number(right.archivedAt) || 0, Number(right.latestClaimedAt) || 0);
            const leftTime = Math.max(Number(left.archivedAt) || 0, Number(left.latestClaimedAt) || 0);
            if (rightTime !== leftTime) return rightTime - leftTime;
            return String(left.seasonId || '').localeCompare(String(right.seasonId || ''));
        })
        .slice(0, 12);
    return {
        reportVersion: 'pvp-live-season-archive-v1',
        archivedSeasonCount: seasons.length,
        seasons
    };
}

function makeClaimLedger(rows) {
    return (Array.isArray(rows) ? rows : []).map(row => ({
        reportVersion: 'pvp-live-season-claim-ledger-entry-v1',
        ledgerId: String(row.claim_id || ''),
        seasonId: String(row.season_id || ''),
        rewardId: String(row.reward_id || ''),
        rewardType: String(row.reward_type || 'cosmetic_badge'),
        rewardName: String(row.reward_name || '赛季荣誉外观'),
        targetGames: Math.max(1, Math.floor(Number(row.target_games) || 1)),
        claimSource: normalizeToken(row.claim_source, 'live_ranked_settlement'),
        sourceMatchId: String(row.source_match_id || ''),
        claimedAt: Math.max(0, Math.floor(Number(row.claimed_at) || 0)),
        rewardImpact: 'cosmetic_only',
        powerImpact: 'none'
    }));
}

function makeClaimLedgerFromCollection({
    collection,
    seasonId,
    claimSource = 'economy_snapshot',
    sourceMatchId = '',
    claimedAt = Date.now()
} = {}) {
    const safeSeasonId = String(seasonId || collection && collection.seasonId || '').trim();
    if (!safeSeasonId) return [];
    const safeSource = normalizeToken(claimSource, 'economy_snapshot');
    const safeMatchId = String(sourceMatchId || '').trim().slice(0, 96);
    const fallbackClaimedAt = Math.max(0, Math.floor(Number(claimedAt) || Date.now()));
    return collectionRewards(collection)
        .sort((left, right) => {
            const targetDelta = Math.max(1, Math.floor(Number(left.targetGames) || 1)) - Math.max(1, Math.floor(Number(right.targetGames) || 1));
            if (targetDelta !== 0) return targetDelta;
            const claimedDelta = Math.max(0, Math.floor(Number(left.claimedAt) || 0)) - Math.max(0, Math.floor(Number(right.claimedAt) || 0));
            if (claimedDelta !== 0) return claimedDelta;
            return String(left.rewardId || '').localeCompare(String(right.rewardId || ''));
        })
        .map(reward => ({
            reportVersion: 'pvp-live-season-claim-ledger-entry-v1',
            ledgerId: makeClaimId('economy_snapshot', safeSeasonId, reward.rewardId),
            seasonId: safeSeasonId,
            rewardId: reward.rewardId,
            rewardType: reward.rewardType,
            rewardName: reward.rewardName,
            targetGames: reward.targetGames,
            claimSource: safeSource,
            sourceMatchId: safeMatchId,
            claimedAt: reward.claimedAt || fallbackClaimedAt,
            rewardImpact: 'cosmetic_only',
            powerImpact: 'none'
        }));
}

function mergeClaimLedgers(primaryLedger, fallbackLedger) {
    const byReward = new Map();
    (Array.isArray(fallbackLedger) ? fallbackLedger : []).forEach((entry) => {
        const rewardId = String(entry && entry.rewardId || '').trim();
        if (rewardId) byReward.set(rewardId, entry);
    });
    (Array.isArray(primaryLedger) ? primaryLedger : []).forEach((entry) => {
        const rewardId = String(entry && entry.rewardId || '').trim();
        if (rewardId) byReward.set(rewardId, entry);
    });
    return Array.from(byReward.values()).sort((left, right) => {
        const targetDelta = Math.max(1, Math.floor(Number(left.targetGames) || 1)) - Math.max(1, Math.floor(Number(right.targetGames) || 1));
        if (targetDelta !== 0) return targetDelta;
        const claimedDelta = Math.max(0, Math.floor(Number(left.claimedAt) || 0)) - Math.max(0, Math.floor(Number(right.claimedAt) || 0));
        if (claimedDelta !== 0) return claimedDelta;
        return String(left.rewardId || '').localeCompare(String(right.rewardId || ''));
    });
}

module.exports = {
    loadSeasonArchiveSummary,
    loadSeasonRewardClaims,
    makeClaimLedgerFromCollection,
    makeClaimLedger,
    makeSeasonArchiveEntryFromCollection,
    mergeClaimLedgers,
    mergeSeasonArchiveSummary,
    recordSeasonHonorArchiveFromCollection,
    recordSeasonRewardClaims,
    recordSeasonRewardClaimsFromCollection
};
