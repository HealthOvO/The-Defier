const DAY_MS = 24 * 60 * 60 * 1000;
const CATALOG_VERSION = 'account-progression-v1';
const REWARD_IMPACT = 'cosmetic_only';
const REWARD_CURRENCY = 'renown';

const OBJECTIVES = [
    {
        objectiveId: 'daily_battle_wins',
        scope: 'daily',
        metric: 'battle_wins',
        target: 3,
        title: '三战热身',
        reward: 30,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'daily_activity_completions',
        scope: 'daily',
        metric: 'activity_completions',
        target: 1,
        title: '今日收官',
        reward: 20,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'daily_mode_variety',
        scope: 'daily',
        metric: 'distinct_modes',
        target: 2,
        title: '换一种打法',
        reward: 40,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'weekly_activity_completions',
        scope: 'weekly',
        metric: 'activity_completions',
        target: 5,
        title: '七日历练',
        reward: 100,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'weekly_boss_wins',
        scope: 'weekly',
        metric: 'boss_wins',
        target: 3,
        title: '破关问道',
        reward: 100,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'weekly_mode_variety',
        scope: 'weekly',
        metric: 'distinct_modes',
        target: 3,
        title: '诸途并进',
        reward: 120,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'weekly_live_pvp_matches',
        scope: 'weekly',
        metric: 'pvp_matches',
        target: 3,
        title: '真人论道',
        reward: 80,
        trustRequirement: 'server_authoritative'
    },
    {
        objectiveId: 'milestone_first_completion',
        scope: 'lifetime',
        metric: 'activity_completions',
        target: 1,
        title: '第一份答卷',
        reward: 50,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'milestone_ten_completions',
        scope: 'lifetime',
        metric: 'activity_completions',
        target: 10,
        title: '十次收官',
        reward: 200,
        trustRequirement: 'client_observed'
    },
    {
        objectiveId: 'milestone_mode_variety',
        scope: 'lifetime',
        metric: 'distinct_modes',
        target: 3,
        title: '三途同修',
        reward: 150,
        trustRequirement: 'client_observed'
    }
];

function makeUtcDayCycle(now = Date.now()) {
    const at = new Date(now);
    const start = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    return {
        type: 'daily',
        id: `daily:${new Date(start).toISOString().slice(0, 10)}`,
        startsAt: start,
        endsAt: start + DAY_MS
    };
}

function makeUtcWeekCycle(now = Date.now()) {
    const day = makeUtcDayCycle(now);
    const weekday = new Date(day.startsAt).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const start = day.startsAt - daysSinceMonday * DAY_MS;
    return {
        type: 'weekly',
        id: `weekly:${new Date(start).toISOString().slice(0, 10)}`,
        startsAt: start,
        endsAt: start + 7 * DAY_MS
    };
}

function makeLifetimeCycle() {
    return {
        type: 'lifetime',
        id: 'lifetime',
        startsAt: 0,
        endsAt: 0
    };
}

function getCycles(now = Date.now()) {
    return {
        daily: makeUtcDayCycle(now),
        weekly: makeUtcWeekCycle(now),
        lifetime: makeLifetimeCycle()
    };
}

function getObjective(objectiveId) {
    return OBJECTIVES.find(entry => entry.objectiveId === objectiveId) || null;
}

function makeReward(objective) {
    return {
        rewardType: 'currency',
        currency: REWARD_CURRENCY,
        amount: objective.reward,
        rewardImpact: REWARD_IMPACT,
        spendPolicy: 'cosmetic_only'
    };
}

module.exports = {
    CATALOG_VERSION,
    DAY_MS,
    OBJECTIVES,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    getCycles,
    getObjective,
    makeReward
};
