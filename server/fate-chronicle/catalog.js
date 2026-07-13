const { cloneJson, hashCanonical } = require('../progression/authoritative-runs/canonical');

const PROTOCOL_VERSION = 'authoritative-fate-chronicle-v1';
const CATALOG_VERSION = 'fate-chronicle-catalog-v1';
const ROTATION_RULE_VERSION = 'fate-chronicle-rotation-v1';
const REWARD_CURRENCY = 'renown';
const REWARD_IMPACT = 'cosmetic_only';
const POWER_IMPACT = 'none';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RUN_TTL_MS = 72 * 60 * 60 * 1000;
const SETTLEMENT_GRACE_MS = 72 * 60 * 60 * 1000;
const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(entry => deepFreeze(entry));
    return value;
}

const CHAPTERS = deepFreeze([
    {
        chapterId: 'chapter-1',
        chapterIndex: 1,
        title: '照火问心',
        description: '三战开卷，先建立节奏，再决定是稳守还是前压。',
        unlockRequirement: { type: 'none' },
        oaths: [
            {
                oathId: 'guard',
                scenarioId: 'chronicle-ember-guard',
                title: '守誓',
                description: '高生命与护盾牌组，容错更高。',
                encounterCount: 3,
                maxHp: 60,
                turnBudget: 0,
                betweenEncounterHeal: 4,
                scoreMultiplier: 1
            },
            {
                oathId: 'edge',
                scenarioId: 'chronicle-ember-edge',
                title: '锋誓',
                description: '更低容错、更主动的压缩路线。',
                encounterCount: 3,
                maxHp: 50,
                turnBudget: 20,
                betweenEncounterHeal: 2,
                scoreMultiplier: 1.12
            }
        ]
    },
    {
        chapterId: 'chapter-2',
        chapterIndex: 2,
        title: '镜命辨真',
        description: '四战中段，持续修复与主动收束会分出路线差异。',
        unlockRequirement: { type: 'chapter_clear', chapterId: 'chapter-1' },
        oaths: [
            {
                oathId: 'guard',
                scenarioId: 'chronicle-mirror-guard',
                title: '守誓',
                description: '回复与抽滤更强，允许一次判断失误。',
                encounterCount: 4,
                maxHp: 64,
                turnBudget: 0,
                betweenEncounterHeal: 5,
                scoreMultiplier: 1.08
            },
            {
                oathId: 'edge',
                scenarioId: 'chronicle-mirror-edge',
                title: '锋誓',
                description: '总回合预算更紧，强调能量循环与收束。',
                encounterCount: 4,
                maxHp: 52,
                turnBudget: 28,
                betweenEncounterHeal: 2,
                scoreMultiplier: 1.2
            }
        ]
    },
    {
        chapterId: 'chapter-3',
        chapterIndex: 3,
        title: '裂天归卷',
        description: '五战终章，长线损耗和收束速度都会被放大。',
        unlockRequirement: { type: 'chapter_clear', chapterId: 'chapter-2' },
        oaths: [
            {
                oathId: 'guard',
                scenarioId: 'chronicle-rift-guard',
                title: '守誓',
                description: '更高生命与战间回复，适合稳步归卷。',
                encounterCount: 5,
                maxHp: 70,
                turnBudget: 0,
                betweenEncounterHeal: 6,
                scoreMultiplier: 1.16
            },
            {
                oathId: 'edge',
                scenarioId: 'chronicle-rift-edge',
                title: '锋誓',
                description: '终章高压进攻路线，要求更高的节奏纪律。',
                encounterCount: 5,
                maxHp: 56,
                turnBudget: 38,
                betweenEncounterHeal: 3,
                scoreMultiplier: 1.3
            }
        ]
    }
]);

const MILESTONES = deepFreeze([
    {
        milestoneId: 'chapter-1-clear',
        milestoneType: 'chapter_clear',
        chapterId: 'chapter-1',
        title: '照火初卷',
        reward: { currency: REWARD_CURRENCY, amount: 30, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'chapter-2-clear',
        milestoneType: 'chapter_clear',
        chapterId: 'chapter-2',
        title: '镜命成卷',
        reward: { currency: REWARD_CURRENCY, amount: 40, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'chapter-3-clear',
        milestoneType: 'chapter_clear',
        chapterId: 'chapter-3',
        title: '裂天归卷',
        reward: { currency: REWARD_CURRENCY, amount: 50, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'chapter-1-dual',
        milestoneType: 'chapter_dual',
        chapterId: 'chapter-1',
        title: '照火双誓',
        reward: { currency: REWARD_CURRENCY, amount: 20, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'chapter-2-dual',
        milestoneType: 'chapter_dual',
        chapterId: 'chapter-2',
        title: '镜命双誓',
        reward: { currency: REWARD_CURRENCY, amount: 25, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'chapter-3-dual',
        milestoneType: 'chapter_dual',
        chapterId: 'chapter-3',
        title: '裂天双誓',
        reward: { currency: REWARD_CURRENCY, amount: 35, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'full-scroll',
        milestoneType: 'full_clear',
        chapterId: '',
        title: '三证归卷',
        reward: { currency: REWARD_CURRENCY, amount: 90, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    }
]);

const CATALOG_SNAPSHOT = deepFreeze({
    protocolVersion: PROTOCOL_VERSION,
    catalogVersion: CATALOG_VERSION,
    rotationRuleVersion: ROTATION_RULE_VERSION,
    rewardCurrency: REWARD_CURRENCY,
    rewardImpact: REWARD_IMPACT,
    powerImpact: POWER_IMPACT,
    runTtlMs: RUN_TTL_MS,
    settlementGraceMs: SETTLEMENT_GRACE_MS,
    claimWindowMs: CLAIM_WINDOW_MS,
    chapters: CHAPTERS,
    milestones: MILESTONES
});

const CATALOG_HASH = hashCanonical(CATALOG_SNAPSHOT);

function makeUtcWeekStart(now = Date.now()) {
    const at = new Date(now);
    const dayStart = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    const weekday = new Date(dayStart).getUTCDay();
    return dayStart - ((weekday + 6) % 7) * 24 * 60 * 60 * 1000;
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
    const startsAt = makeUtcWeekStart(startMs);
    const endsAt = startsAt + WEEK_MS;
    const graceEndsAt = endsAt + SETTLEMENT_GRACE_MS;
    const claimEndsAt = endsAt + CLAIM_WINDOW_MS;
    const { weekYear, weekNumber } = getIsoWeekParts(startsAt);
    const snapshot = {
        rotationId: `chronicle-${weekYear}-w${String(weekNumber).padStart(2, '0')}`,
        protocolVersion: PROTOCOL_VERSION,
        catalogVersion: CATALOG_VERSION,
        rotationRuleVersion: ROTATION_RULE_VERSION,
        catalogHash: CATALOG_HASH,
        title: '命途长卷',
        description: '三章双誓约的服务端主线篇章，同章无限重试，同账号同一时刻仅一条 active run。',
        startsAt,
        endsAt,
        graceEndsAt,
        claimEndsAt,
        runTtlMs: RUN_TTL_MS,
        rewardCurrency: REWARD_CURRENCY,
        rewardImpact: REWARD_IMPACT,
        powerImpact: POWER_IMPACT,
        chapters: cloneJson(CHAPTERS),
        milestones: cloneJson(MILESTONES),
        fairness: {
            settledBy: 'server_authoritative',
            sharedSeedPerWeek: true,
            accountWideSingleActiveRun: true,
            retries: 'unlimited',
            leaderboard: false
        }
    };
    return { ...snapshot, snapshotHash: hashCanonical(snapshot) };
}

function buildRotationSnapshot(now = Date.now()) {
    return buildRotationSnapshotForStart(makeUtcWeekStart(now));
}

function getChapter(chapterId) {
    const safeId = String(chapterId || '').trim();
    return CHAPTERS.find(entry => entry.chapterId === safeId) || null;
}

function getOath(chapterId, oathId) {
    const chapter = getChapter(chapterId);
    if (!chapter) return null;
    const safeId = String(oathId || '').trim();
    return chapter.oaths.find(entry => entry.oathId === safeId) || null;
}

module.exports = {
    CATALOG_HASH,
    CATALOG_SNAPSHOT,
    CATALOG_VERSION,
    CHAPTERS,
    CLAIM_WINDOW_MS,
    MILESTONES,
    POWER_IMPACT,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    ROTATION_RULE_VERSION,
    RUN_TTL_MS,
    SETTLEMENT_GRACE_MS,
    WEEK_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart,
    cloneCatalogSnapshot: () => cloneJson(CATALOG_SNAPSHOT),
    getChapter,
    getOath,
    makeUtcWeekStart
};
