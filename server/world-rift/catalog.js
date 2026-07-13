const { cloneJson, hashCanonical } = require('../progression/authoritative-runs/canonical');

const PROTOCOL_VERSION = 'authoritative-world-rift-v1';
const CATALOG_VERSION = 'world-rift-catalog-v1';
const ROTATION_RULE_VERSION = 'world-rift-rotation-v1';
const REWARD_CURRENCY = 'renown';
const REWARD_IMPACT = 'cosmetic_only';
const ATTEMPT_LIMIT = 5;
const SEED_SLOT_COUNT = 5;
const SETTLEMENT_GRACE_MS = 2 * 60 * 60 * 1000;
const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LEADERBOARD_LIMIT = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOTAL_HP = 10000;

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(entry => deepFreeze(entry));
    return value;
}

const PHASES = deepFreeze([
    {
        phaseIndex: 1,
        phaseId: 'phase_1',
        title: '裂隙前锋',
        hp: 2400,
        cumulativeThreshold: 2400,
        rewardMilestoneId: 'global-phase-1',
        rewardAmount: 50
    },
    {
        phaseIndex: 2,
        phaseId: 'phase_2',
        title: '噬界核心',
        hp: 3200,
        cumulativeThreshold: 5600,
        rewardMilestoneId: 'global-phase-2',
        rewardAmount: 90
    },
    {
        phaseIndex: 3,
        phaseId: 'phase_3',
        title: '天穹灾主',
        hp: 4400,
        cumulativeThreshold: 10000,
        rewardMilestoneId: 'global-phase-3',
        rewardAmount: 140
    }
]);

const PERSONAL_MILESTONES = deepFreeze([
    { milestoneId: 'personal-spark', title: '裂隙火种', targetContribution: 1500, rewardAmount: 40 },
    { milestoneId: 'personal-anchor', title: '界锚常驻', targetContribution: 4500, rewardAmount: 80 },
    { milestoneId: 'personal-vanguard', title: '天穹先驱', targetContribution: 8000, rewardAmount: 120 }
]);

const CONTRIBUTION_FORMULA = deepFreeze({
    qualityField: 'summary.score',
    remainingHpField: 'summary.remainingHp',
    turnsField: 'summary.turns',
    baseContribution: 300,
    qualityMultiplier: 2,
    survivalBonusPerHp: 3,
    survivalBonusCap: 180,
    tempoTurnPar: 18,
    tempoBonusPerTurn: 15,
    tempoBonusCap: 120,
    minContribution: 300,
    maxContribution: 2400,
    formulaText: 'clamp(300 + score * 2 + min(remainingHp * 3, 180) + min(max(18 - turns, 0) * 15, 120), 300, 2400)'
});

function buildMilestones() {
    return [
        ...PERSONAL_MILESTONES.map(entry => ({
            milestoneId: entry.milestoneId,
            milestoneType: 'personal',
            title: entry.title,
            targetContribution: entry.targetContribution,
            reward: {
                rewardType: 'world_rift_personal_milestone',
                currency: REWARD_CURRENCY,
                amount: entry.rewardAmount,
                rewardImpact: REWARD_IMPACT,
                spendPolicy: 'cosmetic_only'
            }
        })),
        ...PHASES.map(phase => ({
            milestoneId: phase.rewardMilestoneId,
            milestoneType: 'global',
            title: `${phase.title}击破`,
            phaseIndex: phase.phaseIndex,
            targetAppliedDamage: phase.cumulativeThreshold,
            reward: {
                rewardType: 'world_rift_global_milestone',
                currency: REWARD_CURRENCY,
                amount: phase.rewardAmount,
                rewardImpact: REWARD_IMPACT,
                spendPolicy: 'cosmetic_only'
            }
        }))
    ];
}

const CATALOG_SNAPSHOT = deepFreeze({
    protocolVersion: PROTOCOL_VERSION,
    catalogVersion: CATALOG_VERSION,
    rotationRuleVersion: ROTATION_RULE_VERSION,
    rewardCurrency: REWARD_CURRENCY,
    rewardImpact: REWARD_IMPACT,
    attemptLimit: ATTEMPT_LIMIT,
    seedSlotCount: SEED_SLOT_COUNT,
    settlementGraceMs: SETTLEMENT_GRACE_MS,
    claimWindowMs: CLAIM_WINDOW_MS,
    leaderboardLimit: LEADERBOARD_LIMIT,
    totalHp: TOTAL_HP,
    contributionFormula: CONTRIBUTION_FORMULA,
    phases: PHASES,
    milestones: buildMilestones()
});

const CATALOG_HASH = hashCanonical(CATALOG_SNAPSHOT);

function makeUtcWeekStart(now = Date.now()) {
    const at = new Date(now);
    const dayStart = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    const weekday = new Date(dayStart).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    return dayStart - daysSinceMonday * 24 * 60 * 60 * 1000;
}

function getIsoWeekParts(startMs) {
    const date = new Date(startMs);
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - weekday);
    const weekYear = target.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const weekNumber = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return { weekYear, weekNumber };
}

function buildRotationSnapshotForStart(startMs) {
    const start = makeUtcWeekStart(startMs);
    const endsAt = start + WEEK_MS;
    const graceEndsAt = endsAt + SETTLEMENT_GRACE_MS;
    const claimEndsAt = endsAt + CLAIM_WINDOW_MS;
    const { weekYear, weekNumber } = getIsoWeekParts(start);
    const snapshot = {
        rotationId: `rift-${weekYear}-w${String(weekNumber).padStart(2, '0')}`,
        protocolVersion: PROTOCOL_VERSION,
        catalogVersion: CATALOG_VERSION,
        rotationRuleVersion: ROTATION_RULE_VERSION,
        catalogHash: CATALOG_HASH,
        title: '天穹裂隙',
        description: '全服共享推进的权威裂隙远征，正式榜只计最佳三次贡献。',
        startsAt: start,
        endsAt,
        graceEndsAt,
        claimEndsAt,
        attemptLimit: ATTEMPT_LIMIT,
        seedSlotCount: SEED_SLOT_COUNT,
        leaderboardLimit: LEADERBOARD_LIMIT,
        totalHp: TOTAL_HP,
        contributionFormula: cloneJson(CONTRIBUTION_FORMULA),
        phases: cloneJson(PHASES),
        milestones: buildMilestones(),
        fairness: {
            sharedSeedSlots: true,
            settledBy: 'server_authoritative',
            rankingWindow: 'utc_week',
            settlementGraceMs: SETTLEMENT_GRACE_MS,
            claimWindowMs: CLAIM_WINDOW_MS,
            bestOfAttempts: 3
        }
    };
    return {
        ...snapshot,
        snapshotHash: hashCanonical(snapshot)
    };
}

function buildRotationSnapshot(now = Date.now()) {
    return buildRotationSnapshotForStart(makeUtcWeekStart(now));
}

module.exports = {
    ATTEMPT_LIMIT,
    CATALOG_HASH,
    CATALOG_SNAPSHOT,
    CATALOG_VERSION,
    CLAIM_WINDOW_MS,
    CONTRIBUTION_FORMULA,
    LEADERBOARD_LIMIT,
    PERSONAL_MILESTONES,
    PHASES,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    ROTATION_RULE_VERSION,
    SEED_SLOT_COUNT,
    SETTLEMENT_GRACE_MS,
    TOTAL_HP,
    WEEK_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart,
    cloneCatalogSnapshot: () => cloneJson(CATALOG_SNAPSHOT),
    makeUtcWeekStart
};
