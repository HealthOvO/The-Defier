const { cloneJson, hashCanonical } = require('../progression/authoritative-runs/canonical');

const PROTOCOL_VERSION = 'authoritative-challenge-ladder-v1';
const CATALOG_VERSION = 'challenge-ladder-catalog-v1';
const ROTATION_RULE_VERSION = 'challenge-ladder-rotation-v1';
const REWARD_CURRENCY = 'renown';
const REWARD_IMPACT = 'cosmetic_only';
const ATTEMPT_LIMIT = 3;
const SEED_SLOT_COUNT = 3;
const SETTLEMENT_GRACE_MS = 2 * 60 * 60 * 1000;
const LEADERBOARD_LIMIT = 20;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(entry => deepFreeze(entry));
    return value;
}

const ROTATION_TEMPLATES = deepFreeze([
    {
        templateId: 'balanced',
        title: '衡常试卷',
        description: '以权威基础分作为正式分，鼓励稳定通关与高质量路线。',
        scoring: {
            mode: 'balanced',
            bonusCap: 0,
            formulaText: 'officialScore = baseScore'
        },
        milestones: [
            { milestoneId: 'clear', title: '初试众生', targetScore: 320, reward: 60 },
            { milestoneId: 'refine', title: '稳步精修', targetScore: 460, reward: 100 },
            { milestoneId: 'mastery', title: '衡卷通明', targetScore: 620, reward: 160 }
        ]
    },
    {
        templateId: 'tempo',
        title: '疾策试卷',
        description: '在基础分之外追加低回合奖励，鼓励更快完成试炼。',
        scoring: {
            mode: 'tempo',
            turnPar: 16,
            bonusPerTurn: 12,
            bonusCap: 96,
            formulaText: 'officialScore = baseScore + min(max(turnPar - turns, 0) * bonusPerTurn, bonusCap)'
        },
        milestones: [
            { milestoneId: 'clear', title: '快刀开卷', targetScore: 360, reward: 60 },
            { milestoneId: 'refine', title: '行云压线', targetScore: 520, reward: 110 },
            { milestoneId: 'mastery', title: '疾策无滞', targetScore: 700, reward: 180 }
        ]
    },
    {
        templateId: 'survival',
        title: '守衡试卷',
        description: '在基础分之外追加剩余生命奖励，鼓励更稳的终局控制。',
        scoring: {
            mode: 'survival',
            bonusPerHp: 4,
            bonusCap: 140,
            formulaText: 'officialScore = baseScore + min(remainingHp * bonusPerHp, bonusCap)'
        },
        milestones: [
            { milestoneId: 'clear', title: '守住命灯', targetScore: 360, reward: 60 },
            { milestoneId: 'refine', title: '气脉绵长', targetScore: 540, reward: 120 },
            { milestoneId: 'mastery', title: '守衡无缺', targetScore: 740, reward: 200 }
        ]
    }
]);

const CATALOG_SNAPSHOT = deepFreeze({
    protocolVersion: PROTOCOL_VERSION,
    catalogVersion: CATALOG_VERSION,
    rotationRuleVersion: ROTATION_RULE_VERSION,
    attemptLimit: ATTEMPT_LIMIT,
    seedSlotCount: SEED_SLOT_COUNT,
    settlementGraceMs: SETTLEMENT_GRACE_MS,
    leaderboardLimit: LEADERBOARD_LIMIT,
    rewardCurrency: REWARD_CURRENCY,
    rewardImpact: REWARD_IMPACT,
    templates: ROTATION_TEMPLATES
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

function getRotationTemplate(startMs) {
    const index = Math.floor(startMs / WEEK_MS);
    const normalized = ((index % ROTATION_TEMPLATES.length) + ROTATION_TEMPLATES.length) % ROTATION_TEMPLATES.length;
    return ROTATION_TEMPLATES[normalized];
}

function buildMilestones(template) {
    return template.milestones.map(entry => ({
        milestoneId: entry.milestoneId,
        title: entry.title,
        targetScore: entry.targetScore,
        reward: {
            rewardType: 'rotation_milestone',
            currency: REWARD_CURRENCY,
            amount: entry.reward,
            rewardImpact: REWARD_IMPACT,
            spendPolicy: 'cosmetic_only'
        }
    }));
}

function buildRotationSnapshotForStart(startMs) {
    const start = makeUtcWeekStart(startMs);
    const endsAt = start + WEEK_MS;
    const graceEndsAt = endsAt + SETTLEMENT_GRACE_MS;
    const { weekYear, weekNumber } = getIsoWeekParts(start);
    const template = getRotationTemplate(start);
    const snapshot = {
        rotationId: `acl-${weekYear}-w${String(weekNumber).padStart(2, '0')}`,
        protocolVersion: PROTOCOL_VERSION,
        catalogVersion: CATALOG_VERSION,
        rotationRuleVersion: ROTATION_RULE_VERSION,
        catalogHash: CATALOG_HASH,
        templateId: template.templateId,
        title: template.title,
        description: template.description,
        startsAt: start,
        endsAt,
        graceEndsAt,
        attemptLimit: ATTEMPT_LIMIT,
        seedSlotCount: SEED_SLOT_COUNT,
        leaderboardLimit: LEADERBOARD_LIMIT,
        scoring: cloneJson(template.scoring),
        milestones: buildMilestones(template),
        fairness: {
            sharedSeedSlots: true,
            settledBy: 'server_authoritative',
            rankingWindow: 'utc_week',
            settlementGraceMs: SETTLEMENT_GRACE_MS
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
    LEADERBOARD_LIMIT,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    ROTATION_RULE_VERSION,
    SEED_SLOT_COUNT,
    SETTLEMENT_GRACE_MS,
    WEEK_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart,
    cloneCatalogSnapshot: () => cloneJson(CATALOG_SNAPSHOT),
    makeUtcWeekStart
};
