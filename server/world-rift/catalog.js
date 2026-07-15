const { cloneJson, hashCanonical } = require('../progression/authoritative-runs/canonical');

const PROTOCOL_VERSION = 'authoritative-world-rift-v1';
const CATALOG_VERSION = 'world-rift-catalog-v2';
const ROTATION_RULE_VERSION = 'world-rift-rotation-v2';
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

function makeDirective({
    directiveId,
    scope,
    title,
    description,
    goalText,
    metric,
    targetValue,
    criteria,
    rewardAmount,
    sortOrder
}) {
    return {
        directiveId,
        scope,
        title,
        description,
        goalText,
        metric,
        targetValue,
        criteria,
        sortOrder,
        reward: {
            rewardType: 'world_rift_campaign_directive',
            currency: REWARD_CURRENCY,
            amount: rewardAmount,
            rewardImpact: REWARD_IMPACT,
            spendPolicy: 'cosmetic_only'
        }
    };
}

const DIRECTIVE_TEMPLATES = deepFreeze([
    {
        templateId: 'threefold-reading',
        title: '三衡会卷',
        description: '本周鼓励根据题面切换路线，不把稳进、争衡或险锋固定成唯一答案。',
        directives: [
            makeDirective({
                directiveId: 'personal-two-paths',
                scope: 'personal',
                title: '辨势改卷',
                description: '在一场完整出征中采用至少两类路线合同。',
                goalText: '完成 1 场包含至少两类路线的正式出征',
                metric: 'qualified_runs',
                targetValue: 1,
                criteria: { requireCompleted: true, minDistinctContracts: 2 },
                rewardAmount: 35,
                sortOrder: 10
            }),
            makeDirective({
                directiveId: 'squad-three-contracts',
                scope: 'squad',
                title: '三衡同证',
                description: '小队成员共同留下稳进、争衡与险锋三类权威路线记录。',
                goalText: '小队共同覆盖 3 类路线合同',
                metric: 'distinct_contracts',
                targetValue: 3,
                criteria: { requireCompleted: true, allowedContracts: ['steady', 'contested', 'perilous'] },
                rewardAmount: 60,
                sortOrder: 20
            }),
            makeDirective({
                directiveId: 'global-route-selections',
                scope: 'global',
                title: '万修合卷',
                description: '全服把每次完成的权威路线汇入同一卷面。',
                goalText: '全服累计完成 12 段路线合同',
                metric: 'contract_selections',
                targetValue: 12,
                criteria: { requireCompleted: true, allowedContracts: ['steady', 'contested', 'perilous'] },
                rewardAmount: 45,
                sortOrder: 30
            })
        ]
    },
    {
        templateId: 'pressed-front',
        title: '争锋破界',
        description: '本周公开奖题偏向增压路线，但险锋仍是可选题，不影响基础裂隙奖励。',
        directives: [
            makeDirective({
                directiveId: 'personal-pressed-clear',
                scope: 'personal',
                title: '迎压成卷',
                description: '完成一场至少包含一次争衡或险锋路线的正式出征。',
                goalText: '完成 1 场带有增压路线的正式出征',
                metric: 'qualified_runs',
                targetValue: 1,
                criteria: { requireCompleted: true, minMatchedContracts: 1, allowedContracts: ['contested', 'perilous'] },
                rewardAmount: 35,
                sortOrder: 10
            }),
            makeDirective({
                directiveId: 'squad-pressed-selections',
                scope: 'squad',
                title: '合力争锋',
                description: '小队共同完成争衡或险锋路线，不要求同一成员独自承担。',
                goalText: '小队累计完成 5 段增压路线',
                metric: 'contract_selections',
                targetValue: 5,
                criteria: { requireCompleted: true, allowedContracts: ['contested', 'perilous'] },
                rewardAmount: 60,
                sortOrder: 20
            }),
            makeDirective({
                directiveId: 'global-route-bonus',
                scope: 'global',
                title: '破界锋值',
                description: '全服汇总完成出征的路线分，不奖励未封卷的冒进。',
                goalText: '全服累计获得 250 路线分',
                metric: 'route_bonus',
                targetValue: 250,
                criteria: { requireCompleted: true },
                rewardAmount: 45,
                sortOrder: 30
            })
        ]
    },
    {
        templateId: 'measured-return',
        title: '守衡归卷',
        description: '本周鼓励保留余力与稳定通关，速度和险锋不会额外垄断指令进度。',
        directives: [
            makeDirective({
                directiveId: 'personal-steady-survivor',
                scope: 'personal',
                title: '稳脉归卷',
                description: '采用至少一次稳进路线，并以足够余力完成正式出征。',
                goalText: '以至少 18 点剩余生命完成 1 场含稳进路线的出征',
                metric: 'qualified_runs',
                targetValue: 1,
                criteria: { requireCompleted: true, minRemainingHp: 18, minMatchedContracts: 1, allowedContracts: ['steady'] },
                rewardAmount: 35,
                sortOrder: 10
            }),
            makeDirective({
                directiveId: 'squad-safe-clears',
                scope: 'squad',
                title: '同道守界',
                description: '小队共同完成三场保有余力的权威出征。',
                goalText: '小队完成 3 场剩余生命不少于 12 的出征',
                metric: 'qualified_runs',
                targetValue: 3,
                criteria: { requireCompleted: true, minRemainingHp: 12 },
                rewardAmount: 60,
                sortOrder: 20
            }),
            makeDirective({
                directiveId: 'global-completed-runs',
                scope: 'global',
                title: '众修镇界',
                description: '全服只统计完整封卷的权威出征，不把失败或放弃算作进度。',
                goalText: '全服共同完成 5 场正式出征',
                metric: 'completed_runs',
                targetValue: 5,
                criteria: { requireCompleted: true },
                rewardAmount: 45,
                sortOrder: 30
            })
        ]
    }
]);

function getDirectiveTemplate(startMs) {
    const index = Math.floor(startMs / WEEK_MS);
    const normalized = ((index % DIRECTIVE_TEMPLATES.length) + DIRECTIVE_TEMPLATES.length) % DIRECTIVE_TEMPLATES.length;
    return DIRECTIVE_TEMPLATES[normalized];
}

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
    milestones: buildMilestones(),
    directiveTemplates: DIRECTIVE_TEMPLATES
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
    const directiveTemplate = getDirectiveTemplate(start);
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
        directiveSetId: directiveTemplate.templateId,
        directiveTitle: directiveTemplate.title,
        directiveDescription: directiveTemplate.description,
        directives: cloneJson(directiveTemplate.directives),
        fairness: {
            sharedSeedSlots: true,
            settledBy: 'server_authoritative',
            directiveFactsSource: 'server_replayed_receipt',
            directiveRewards: 'cosmetic_only',
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
    DIRECTIVE_TEMPLATES,
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
