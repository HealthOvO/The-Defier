const { cloneJson, hashCanonical } = require('../progression/authoritative-runs/canonical');

const PROTOCOL_VERSION = 'relay-expedition-v1';
const CATALOG_VERSION = 'relay-expedition-catalog-v2';
const ROTATION_RULE_VERSION = 'relay-expedition-rotation-v2';
const LEGACY_V1_CATALOG_VERSION = 'relay-expedition-catalog-v1';
const LEGACY_V1_ROTATION_RULE_VERSION = 'relay-expedition-rotation-v1';
const REWARD_CURRENCY = 'renown';
const REWARD_IMPACT = 'cosmetic_only';
const POWER_IMPACT = 'none';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LEG_COUNT = 4;
const PRIORITY_WINDOW_MS = 6 * 60 * 60 * 1000;
const OPEN_CLAIM_WINDOW_MS = 18 * 60 * 60 * 1000;
const ACTIVE_LEASE_MS = 2 * 60 * 60 * 1000;
const LEGACY_V1_SETTLEMENT_GRACE_MS = LEG_COUNT * (PRIORITY_WINDOW_MS + OPEN_CLAIM_WINDOW_MS) + ACTIVE_LEASE_MS;
const SETTLEMENT_GRACE_MS = LEG_COUNT * (PRIORITY_WINDOW_MS + OPEN_CLAIM_WINDOW_MS + ACTIVE_LEASE_MS);
const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FAST_TURN_THRESHOLD = 18;
const HIGH_LIFE_RATIO = 0.6;

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(entry => deepFreeze(entry));
    return value;
}

const TACTICS = deepFreeze([
    {
        tacticId: 'vanguard',
        scenarioId: 'vanguard',
        title: '破阵谱',
        description: '主动压缩战线，以较高风险争取更快收束。',
        starterDeckCardCount: 10
    },
    {
        tacticId: 'bulwark',
        scenarioId: 'bulwark',
        title: '守脉谱',
        description: '依靠护盾与稳定交换提高整段容错。',
        starterDeckCardCount: 10
    },
    {
        tacticId: 'insight',
        scenarioId: 'insight',
        title: '观星谱',
        description: '强化抽滤与节奏调整，保留更多路线选择。',
        starterDeckCardCount: 10
    }
]);

const MILESTONES = deepFreeze([
    {
        milestoneId: 'relay-first-handoff',
        title: '接力初鸣',
        condition: 'projected_legs',
        target: 1,
        reward: { currency: REWARD_CURRENCY, amount: 30, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'relay-route-complete',
        title: '四脉归途',
        condition: 'processed_legs',
        target: LEG_COUNT,
        reward: { currency: REWARD_CURRENCY, amount: 60, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    },
    {
        milestoneId: 'relay-harmony',
        title: '同道和鸣',
        condition: 'route_score',
        target: 5000,
        reward: { currency: REWARD_CURRENCY, amount: 100, rewardImpact: REWARD_IMPACT, powerImpact: POWER_IMPACT }
    }
]);

const SCORE_FORMULA = deepFreeze({
    completedBase: 800,
    completedMin: 800,
    completedMax: 1600,
    incompletePerEncounter: 200,
    incompleteMax: 400,
    skippedScore: 0,
    routeMax: 6400,
    formulaText: 'completed: clamp(800 + summary.score, 800, 1600); incomplete: clamp(summary.encountersWon * 200, 0, 400); skipped: 0'
});

function makeCatalogSnapshot({ catalogVersion, rotationRuleVersion, settlementGraceMs }) {
    return {
        protocolVersion: PROTOCOL_VERSION,
        catalogVersion,
        rotationRuleVersion,
        legCount: LEG_COUNT,
        priorityWindowMs: PRIORITY_WINDOW_MS,
        openClaimWindowMs: OPEN_CLAIM_WINDOW_MS,
        activeLeaseMs: ACTIVE_LEASE_MS,
        settlementGraceMs,
        claimWindowMs: CLAIM_WINDOW_MS,
        rewardCurrency: REWARD_CURRENCY,
        rewardImpact: REWARD_IMPACT,
        powerImpact: POWER_IMPACT,
        fastTurnThreshold: FAST_TURN_THRESHOLD,
        highLifeRatio: HIGH_LIFE_RATIO,
        tactics: TACTICS,
        scoreFormula: SCORE_FORMULA,
        milestones: MILESTONES
    };
}

const CATALOG_SNAPSHOT = deepFreeze(makeCatalogSnapshot({
    catalogVersion: CATALOG_VERSION,
    rotationRuleVersion: ROTATION_RULE_VERSION,
    settlementGraceMs: SETTLEMENT_GRACE_MS
}));
const LEGACY_V1_CATALOG_SNAPSHOT = deepFreeze(makeCatalogSnapshot({
    catalogVersion: LEGACY_V1_CATALOG_VERSION,
    rotationRuleVersion: LEGACY_V1_ROTATION_RULE_VERSION,
    settlementGraceMs: LEGACY_V1_SETTLEMENT_GRACE_MS
}));

const CATALOG_HASH = hashCanonical(CATALOG_SNAPSHOT);
const LEGACY_V1_CATALOG_HASH = hashCanonical(LEGACY_V1_CATALOG_SNAPSHOT);

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

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

function buildRotationSnapshotForStart(startMs, {
    catalogVersion = CATALOG_VERSION,
    rotationRuleVersion = ROTATION_RULE_VERSION,
    catalogHash = CATALOG_HASH,
    settlementGraceMs = SETTLEMENT_GRACE_MS
} = {}) {
    const startsAt = makeUtcWeekStart(startMs);
    const endsAt = startsAt + WEEK_MS;
    const graceEndsAt = endsAt + settlementGraceMs;
    const claimEndsAt = graceEndsAt + CLAIM_WINDOW_MS;
    const { weekYear, weekNumber } = getIsoWeekParts(startsAt);
    const snapshot = {
        rotationId: `relay-${weekYear}-w${String(weekNumber).padStart(2, '0')}`,
        protocolVersion: PROTOCOL_VERSION,
        catalogVersion,
        rotationRuleVersion,
        catalogHash,
        title: '同道远征',
        description: '四棒异步权威远征，共享路线与选择，不共享残血、牌组或临时状态。',
        startsAt,
        endsAt,
        graceEndsAt,
        claimEndsAt,
        legCount: LEG_COUNT,
        priorityWindowMs: PRIORITY_WINDOW_MS,
        openClaimWindowMs: OPEN_CLAIM_WINDOW_MS,
        activeLeaseMs: ACTIVE_LEASE_MS,
        tactics: cloneJson(TACTICS),
        scoreFormula: cloneJson(SCORE_FORMULA),
        milestones: cloneJson(MILESTONES),
        fairness: {
            settledBy: 'server_authoritative',
            sharedState: 'route_only',
            inheritedCombatState: false,
            maxLegsPerMember: 2,
            avoidConsecutiveRunner: true,
            publicLeaderboard: false
        }
    };
    return { ...snapshot, snapshotHash: hashCanonical(snapshot) };
}

function buildLegacyV1RotationSnapshotForStart(startMs) {
    return buildRotationSnapshotForStart(startMs, {
        catalogVersion: LEGACY_V1_CATALOG_VERSION,
        rotationRuleVersion: LEGACY_V1_ROTATION_RULE_VERSION,
        catalogHash: LEGACY_V1_CATALOG_HASH,
        settlementGraceMs: LEGACY_V1_SETTLEMENT_GRACE_MS
    });
}

function buildRotationSnapshot(now = Date.now()) {
    return buildRotationSnapshotForStart(makeUtcWeekStart(now));
}

function buildLegWindows(queuedAt) {
    const startedAt = clampInt(queuedAt);
    const priorityUntil = startedAt + PRIORITY_WINDOW_MS;
    return {
        queuedAt: startedAt,
        priorityUntil,
        openClaimUntil: priorityUntil + OPEN_CLAIM_WINDOW_MS
    };
}

function getTactic(tacticId) {
    const id = String(tacticId || '').trim();
    return TACTICS.find(entry => entry.tacticId === id) || null;
}

function deriveHandoffOptions(outcome, summary = {}) {
    const result = String(outcome || summary.result || '').trim();
    if (result !== 'completed') return ['bulwark', 'insight'];
    const turns = clampInt(summary.turns);
    const remainingHp = clampInt(summary.remainingHp);
    const maxHp = Math.max(1, clampInt(summary.maxHp, 1));
    if (turns > 0 && turns <= FAST_TURN_THRESHOLD) return ['vanguard', 'insight'];
    if (remainingHp / maxHp >= HIGH_LIFE_RATIO) return ['bulwark', 'insight'];
    return ['vanguard', 'bulwark'];
}

function computeLegScore(outcome, summary = {}) {
    const result = String(outcome || summary.result || '').trim();
    if (result === 'completed') {
        return clampInt(SCORE_FORMULA.completedBase + clampInt(summary.score), SCORE_FORMULA.completedMin, SCORE_FORMULA.completedMax);
    }
    if (result === 'skipped') return 0;
    return clampInt(clampInt(summary.encountersWon) * SCORE_FORMULA.incompletePerEncounter, 0, SCORE_FORMULA.incompleteMax);
}

function getMilestone(milestoneId) {
    const id = String(milestoneId || '').trim();
    return MILESTONES.find(entry => entry.milestoneId === id) || null;
}

function isMilestoneUnlocked(milestone, session) {
    if (!milestone || !session) return false;
    if (milestone.condition === 'projected_legs') return clampInt(session.projectedLegs ?? session.projected_legs) >= milestone.target;
    if (milestone.condition === 'processed_legs') return clampInt(session.processedLegs ?? session.processed_legs) >= milestone.target;
    if (milestone.condition === 'route_score') return clampInt(session.routeScore ?? session.route_score) >= milestone.target;
    return false;
}

module.exports = {
    ACTIVE_LEASE_MS,
    CATALOG_HASH,
    CATALOG_SNAPSHOT,
    CATALOG_VERSION,
    CLAIM_WINDOW_MS,
    FAST_TURN_THRESHOLD,
    HIGH_LIFE_RATIO,
    LEG_COUNT,
    LEGACY_V1_CATALOG_HASH,
    LEGACY_V1_CATALOG_SNAPSHOT,
    LEGACY_V1_CATALOG_VERSION,
    LEGACY_V1_ROTATION_RULE_VERSION,
    LEGACY_V1_SETTLEMENT_GRACE_MS,
    MILESTONES,
    OPEN_CLAIM_WINDOW_MS,
    POWER_IMPACT,
    PRIORITY_WINDOW_MS,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    ROTATION_RULE_VERSION,
    SCORE_FORMULA,
    SETTLEMENT_GRACE_MS,
    TACTICS,
    WEEK_MS,
    buildLegWindows,
    buildLegacyV1RotationSnapshotForStart,
    buildRotationSnapshot,
    buildRotationSnapshotForStart,
    cloneCatalogSnapshot: () => cloneJson(CATALOG_SNAPSHOT),
    computeLegScore,
    deriveHandoffOptions,
    getMilestone,
    getTactic,
    isMilestoneUnlocked,
    makeUtcWeekStart
};
