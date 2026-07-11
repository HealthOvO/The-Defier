const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SETTLEMENT_FINALIZATION_DELAY_MS = 60 * 60 * 1000;

const CATALOG_VERSION = 'season-ops-catalog-v1';
const PROTOCOL_VERSION = 'season-ops-v1';
const REWARD_IMPACT = 'cosmetic_only';
const REWARD_CURRENCY = 'renown';

const SEASON_STARTS_AT = Date.UTC(2026, 6, 6, 0, 0, 0, 0);
const SEASON_ENDS_AT = SEASON_STARTS_AT + 6 * WEEK_MS;
const SEASON_GRACE_ENDS_AT = SEASON_ENDS_AT + WEEK_MS;

const SETTLEMENT_TIERS = [
    {
        tierId: 'champion',
        title: '冠首',
        renown: 1200,
        entitlementType: 'title',
        entitlementKey: 'title.season_champion',
        rewardImpact: REWARD_IMPACT
    },
    {
        tierId: 'top_10_percent',
        title: '前 10%',
        renown: 700,
        entitlementType: 'frame',
        entitlementKey: 'frame.season_top_10',
        rewardImpact: REWARD_IMPACT
    },
    {
        tierId: 'top_25_percent',
        title: '前 25%',
        renown: 400,
        entitlementType: 'badge',
        entitlementKey: 'badge.season_top_25',
        rewardImpact: REWARD_IMPACT
    },
    {
        tierId: 'participant',
        title: '参赛',
        renown: 200,
        entitlementType: 'banner',
        entitlementKey: 'banner.season_participant',
        rewardImpact: REWARD_IMPACT
    }
];

const SEASONS = [
    {
        seasonId: 's1-genesis',
        title: '开天赛季',
        ruleVersion: 'season-ops-v1-s1',
        startsAt: SEASON_STARTS_AT,
        endsAt: SEASON_ENDS_AT,
        graceEndsAt: SEASON_GRACE_ENDS_AT,
        rewardCurrency: REWARD_CURRENCY,
        rewardImpact: REWARD_IMPACT,
        settlementTiers: SETTLEMENT_TIERS,
        boundary: '赛季奖励只允许 cosmetic_only，不授予卡牌、属性、起手、匹配或战斗资源。'
    }
];

const OFFERS = [
    {
        offerId: 'offer-genesis-badge',
        seasonId: 's1-genesis',
        title: '开天见证徽记',
        offerType: 'badge',
        entitlementType: 'badge',
        entitlementKey: 'badge.genesis_witness',
        priceCurrency: REWARD_CURRENCY,
        priceAmount: 180,
        purchaseLimit: 1,
        rewardImpact: REWARD_IMPACT
    },
    {
        offerId: 'offer-path-walker-title',
        seasonId: 's1-genesis',
        title: '诸途行者称号',
        offerType: 'title',
        entitlementType: 'title',
        entitlementKey: 'title.path_walker',
        priceCurrency: REWARD_CURRENCY,
        priceAmount: 360,
        purchaseLimit: 1,
        rewardImpact: REWARD_IMPACT
    },
    {
        offerId: 'offer-star-trace-card-back',
        seasonId: 's1-genesis',
        title: '星痕卡背',
        offerType: 'card_back',
        entitlementType: 'card_back',
        entitlementKey: 'card_back.star_trace',
        priceCurrency: REWARD_CURRENCY,
        priceAmount: 620,
        purchaseLimit: 1,
        rewardImpact: REWARD_IMPACT
    },
    {
        offerId: 'offer-dao-seeker-frame',
        seasonId: 's1-genesis',
        title: '问道边框',
        offerType: 'frame',
        entitlementType: 'frame',
        entitlementKey: 'frame.dao_seeker',
        priceCurrency: REWARD_CURRENCY,
        priceAmount: 900,
        purchaseLimit: 1,
        rewardImpact: REWARD_IMPACT
    },
    {
        offerId: 'offer-defier-banner',
        seasonId: 's1-genesis',
        title: '逆命旌旗',
        offerType: 'banner',
        entitlementType: 'banner',
        entitlementKey: 'banner.defier',
        priceCurrency: REWARD_CURRENCY,
        priceAmount: 1400,
        purchaseLimit: 1,
        rewardImpact: REWARD_IMPACT
    }
];

const SEASON_OBJECTIVES = [
    {
        objectiveId: 'season_verified_activity_completions',
        seasonId: 's1-genesis',
        scope: 'season',
        metric: 'activity_completions',
        target: 12,
        title: '可信行脚',
        reward: 240,
        trustRequirement: 'server_verified'
    },
    {
        objectiveId: 'season_verified_mode_variety',
        seasonId: 's1-genesis',
        scope: 'season',
        metric: 'distinct_modes',
        target: 3,
        title: '三途验卷',
        reward: 300,
        trustRequirement: 'server_verified'
    },
    {
        objectiveId: 'season_live_pvp_matches',
        seasonId: 's1-genesis',
        scope: 'season',
        metric: 'pvp_matches',
        target: 10,
        title: '天道应战',
        reward: 260,
        trustRequirement: 'server_authoritative'
    },
    {
        objectiveId: 'season_live_pvp_wins',
        seasonId: 's1-genesis',
        scope: 'season',
        metric: 'pvp_wins',
        target: 4,
        title: '天道胜场',
        reward: 320,
        trustRequirement: 'server_authoritative'
    }
];

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

function getSeasonById(seasonId) {
    const id = String(seasonId || '').trim();
    return SEASONS.find(entry => entry.seasonId === id) || null;
}

function getSeasonState(seasonOrId, now = Date.now()) {
    const season = typeof seasonOrId === 'string' ? getSeasonById(seasonOrId) : seasonOrId;
    if (!season) {
        return {
            state: 'inactive',
            isUpcoming: false,
            isActive: false,
            isGrace: false,
            isEnded: true
        };
    }
    const at = clampInt(now);
    if (at < season.startsAt) {
        return {
            state: 'upcoming',
            isUpcoming: true,
            isActive: false,
            isGrace: false,
            isEnded: false,
            startsAt: season.startsAt,
            endsAt: season.endsAt,
            graceEndsAt: season.graceEndsAt
        };
    }
    if (at < season.endsAt) {
        return {
            state: 'active',
            isUpcoming: false,
            isActive: true,
            isGrace: false,
            isEnded: false,
            startsAt: season.startsAt,
            endsAt: season.endsAt,
            graceEndsAt: season.graceEndsAt
        };
    }
    if (at < season.graceEndsAt) {
        return {
            state: 'grace',
            isUpcoming: false,
            isActive: false,
            isGrace: true,
            isEnded: false,
            startsAt: season.startsAt,
            endsAt: season.endsAt,
            graceEndsAt: season.graceEndsAt
        };
    }
    return {
        state: 'ended',
        isUpcoming: false,
        isActive: false,
        isGrace: false,
        isEnded: true,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        graceEndsAt: season.graceEndsAt
    };
}

function getSeasonForTime(now = Date.now(), { includeGrace = true } = {}) {
    const at = clampInt(now);
    for (const season of SEASONS) {
        const state = getSeasonState(season, at);
        if (state.isActive) return season;
        if (includeGrace && state.isGrace) return season;
    }
    if (SEASONS.length === 0) return null;
    if (at < SEASONS[0].startsAt) return SEASONS[0];
    return SEASONS[SEASONS.length - 1];
}

function normalizeSeasonAndNow(input, maybeNow) {
    if (typeof input === 'number' || input instanceof Date || input === undefined || input === null) {
        const now = input instanceof Date ? input.getTime() : (input === undefined || input === null ? Date.now() : input);
        return { season: getSeasonForTime(now), now: clampInt(now) };
    }
    if (typeof input === 'string') {
        return {
            season: getSeasonById(input),
            now: clampInt(maybeNow === undefined ? Date.now() : maybeNow)
        };
    }
    return {
        season: input || null,
        now: clampInt(maybeNow === undefined ? Date.now() : maybeNow)
    };
}

function getSeasonCycle(input, maybeNow) {
    const { season, now } = normalizeSeasonAndNow(input, maybeNow);
    if (!season) {
        return {
            type: 'season',
            id: 'season:none',
            seasonId: '',
            startsAt: 0,
            endsAt: 0,
            graceEndsAt: 0,
            state: 'inactive'
        };
    }
    const state = getSeasonState(season, now);
    return {
        type: 'season',
        id: `season:${season.seasonId}`,
        seasonId: season.seasonId,
        startsAt: season.startsAt,
        endsAt: season.endsAt,
        graceEndsAt: season.graceEndsAt,
        state: state.state
    };
}

function getOffer(offerId) {
    const id = String(offerId || '').trim();
    return OFFERS.find(entry => entry.offerId === id) || null;
}

function getSettlementTier(input, maybeTotalPlayers, maybeRankedGames) {
    const rank = typeof input === 'object' && input
        ? clampInt(input.rank, 0)
        : clampInt(input, 0);
    const totalPlayers = typeof input === 'object' && input
        ? clampInt(input.totalPlayers, 0)
        : clampInt(maybeTotalPlayers, 0);
    const rankedGames = typeof input === 'object' && input
        ? clampInt(input.rankedGames, 0)
        : clampInt(maybeRankedGames, 0);
    if (rank <= 0 || totalPlayers <= 0) {
        return rankedGames >= 1 ? SETTLEMENT_TIERS[3] : null;
    }
    if (rank === 1) return SETTLEMENT_TIERS[0];
    const topTenCutoff = Math.ceil(totalPlayers * 0.10);
    if (rank > 1 && rank <= topTenCutoff) return SETTLEMENT_TIERS[1];
    const topTwentyFiveCutoff = Math.ceil(totalPlayers * 0.25);
    if (rank <= topTwentyFiveCutoff) return SETTLEMENT_TIERS[2];
    if (rankedGames >= 1) return SETTLEMENT_TIERS[3];
    return null;
}

module.exports = {
    CATALOG_VERSION,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    SETTLEMENT_FINALIZATION_DELAY_MS,
    SEASONS,
    OFFERS,
    SEASON_OBJECTIVES,
    getSeasonById,
    getSeasonForTime,
    getSeasonCycle,
    getSeasonState,
    getOffer,
    getSettlementTier
};
