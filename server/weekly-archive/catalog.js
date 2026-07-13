const crypto = require('node:crypto');

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const CLAIM_GRACE_MS = WEEK_MS;

const PROTOCOL_VERSION = 'weekly-archive-v1';
const CATALOG_VERSION = 'weekly-archive-catalog-v1';
const RULE_VERSION = 'weekly-archive-rules-v1';
const REPORT_VERSION = 'weekly-archive';
const REWARD_CURRENCY = 'renown';
const REWARD_IMPACT = 'cosmetic_only';
const POWER_IMPACT = 'none';
const FOUNDATION_REWARD_ID = 'foundation';
const FOUNDATION_REWARD_AMOUNT = 120;
const FOUNDATION_THRESHOLD = 2;

const SLOT_DEFINITIONS = Object.freeze([
    {
        slotId: 'fate_chronicle',
        mode: 'fate_chronicle',
        title: '长卷证',
        evidenceLabel: '命途长卷权威回执'
    },
    {
        slotId: 'challenge_ladder',
        mode: 'challenge_ladder',
        title: '众生证',
        evidenceLabel: '众生试炼权威回执'
    },
    {
        slotId: 'world_rift',
        mode: 'world_rift',
        title: '裂隙证',
        evidenceLabel: '世界裂隙权威贡献'
    },
    {
        slotId: 'pvp_live',
        mode: 'pvp_live',
        title: '论道证',
        evidenceLabel: '真人论道权威结算'
    },
    {
        slotId: 'relay_expedition',
        mode: 'relay_expedition',
        title: '同道证',
        evidenceLabel: '同道远征权威接力'
    }
]);

const SLOT_MODE_SET = new Set(SLOT_DEFINITIONS.map(slot => slot.mode));

const GRADE_DEFINITIONS = Object.freeze([
    {
        gradeId: 'unarchived',
        title: '未归卷',
        minProofs: 0,
        maxProofs: 1,
        displayLevel: 0,
        rewardAmount: 0
    },
    {
        gradeId: 'foundation',
        title: '基础归卷',
        minProofs: 2,
        maxProofs: 2,
        displayLevel: 1,
        rewardAmount: FOUNDATION_REWARD_AMOUNT
    },
    {
        gradeId: 'ascendant',
        title: '升格',
        minProofs: 3,
        maxProofs: 3,
        displayLevel: 2,
        rewardAmount: FOUNDATION_REWARD_AMOUNT
    },
    {
        gradeId: 'radiant',
        title: '辉卷',
        minProofs: 4,
        maxProofs: 4,
        displayLevel: 3,
        rewardAmount: FOUNDATION_REWARD_AMOUNT
    },
    {
        gradeId: 'complete',
        title: '全证',
        minProofs: 5,
        maxProofs: 5,
        displayLevel: 4,
        rewardAmount: FOUNDATION_REWARD_AMOUNT
    }
]);

function clampInt(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function hashValue(value) {
    return crypto.createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function getUtcWeekStart(now = Date.now()) {
    const at = clampInt(now);
    const date = new Date(at);
    const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const weekday = new Date(dayStart).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    return dayStart - daysSinceMonday * DAY_MS;
}

function makeCycleId(startsAt) {
    return `weekly:${new Date(clampInt(startsAt)).toISOString().slice(0, 10)}`;
}

function parseCycleId(rawCycleId) {
    const text = String(rawCycleId || '').trim();
    const match = /^weekly:(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const startsAt = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    if (!Number.isFinite(startsAt)) return null;
    if (makeCycleId(startsAt) !== text) return null;
    if (new Date(startsAt).getUTCDay() !== 1) return null;
    return startsAt;
}

function getCycleState(snapshotOrNow, maybeNow) {
    const snapshot = typeof snapshotOrNow === 'object' && snapshotOrNow
        ? snapshotOrNow
        : buildCycleSnapshotForTime(snapshotOrNow);
    const now = clampInt(typeof snapshotOrNow === 'object' && snapshotOrNow ? maybeNow : snapshotOrNow);
    if (now < clampInt(snapshot.startsAt)) {
        return {
            state: 'upcoming',
            isUpcoming: true,
            isActive: false,
            isGrace: false,
            isExpired: false
        };
    }
    if (now < clampInt(snapshot.endsAt)) {
        return {
            state: 'active',
            isUpcoming: false,
            isActive: true,
            isGrace: false,
            isExpired: false
        };
    }
    if (now < clampInt(snapshot.claimEndsAt)) {
        return {
            state: 'grace',
            isUpcoming: false,
            isActive: false,
            isGrace: true,
            isExpired: false
        };
    }
    return {
        state: 'expired',
        isUpcoming: false,
        isActive: false,
        isGrace: false,
        isExpired: true
    };
}

function getArchiveGrade(proofCount) {
    const proofs = clampInt(proofCount, 0, SLOT_DEFINITIONS.length);
    for (let index = GRADE_DEFINITIONS.length - 1; index >= 0; index -= 1) {
        const grade = GRADE_DEFINITIONS[index];
        if (proofs >= grade.minProofs) return grade;
    }
    return GRADE_DEFINITIONS[0];
}

function buildCycleSnapshotForStart(startsAt) {
    const cycleStart = clampInt(startsAt);
    const endsAt = cycleStart + WEEK_MS;
    const snapshot = {
        cycleId: makeCycleId(cycleStart),
        protocolVersion: PROTOCOL_VERSION,
        catalogVersion: CATALOG_VERSION,
        ruleVersion: RULE_VERSION,
        title: '三证归卷',
        startsAt: cycleStart,
        endsAt,
        claimEndsAt: endsAt + CLAIM_GRACE_MS,
        rewardCurrency: REWARD_CURRENCY,
        rewardImpact: REWARD_IMPACT,
        powerImpact: POWER_IMPACT,
        foundationReward: {
            rewardId: FOUNDATION_REWARD_ID,
            threshold: FOUNDATION_THRESHOLD,
            currency: REWARD_CURRENCY,
            amount: FOUNDATION_REWARD_AMOUNT,
            rewardImpact: REWARD_IMPACT,
            powerImpact: POWER_IMPACT
        },
        slots: SLOT_DEFINITIONS,
        grades: GRADE_DEFINITIONS,
        authorityBoundary: {
            allowedModes: SLOT_DEFINITIONS.map(slot => slot.mode),
            trustTier: 'server_authoritative',
            requiresActivityCompletions: true,
            sourceOfTruth: 'progression_events'
        }
    };
    snapshot.snapshotHash = hashValue(snapshot);
    return snapshot;
}

function buildCycleSnapshotForTime(now = Date.now()) {
    return buildCycleSnapshotForStart(getUtcWeekStart(now));
}

function buildCycleSnapshotFromId(cycleId) {
    const startsAt = parseCycleId(cycleId);
    return startsAt === null ? null : buildCycleSnapshotForStart(startsAt);
}

function getBootstrapCycleSnapshots(now = Date.now(), extraCycleIds = []) {
    const currentStart = getUtcWeekStart(now);
    const starts = new Set([currentStart - WEEK_MS, currentStart, currentStart + WEEK_MS]);
    for (const cycleId of extraCycleIds || []) {
        const parsed = parseCycleId(cycleId);
        if (parsed !== null) starts.add(parsed);
    }
    return Array.from(starts)
        .sort((left, right) => left - right)
        .map(start => buildCycleSnapshotForStart(start));
}

module.exports = {
    CATALOG_VERSION,
    CLAIM_GRACE_MS,
    DAY_MS,
    FOUNDATION_REWARD_AMOUNT,
    FOUNDATION_REWARD_ID,
    FOUNDATION_THRESHOLD,
    GRADE_DEFINITIONS,
    POWER_IMPACT,
    PROTOCOL_VERSION,
    REPORT_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    RULE_VERSION,
    SLOT_DEFINITIONS,
    SLOT_MODE_SET,
    WEEK_MS,
    buildCycleSnapshotForStart,
    buildCycleSnapshotForTime,
    buildCycleSnapshotFromId,
    clampInt,
    getArchiveGrade,
    getBootstrapCycleSnapshots,
    getCycleState,
    getUtcWeekStart,
    hashValue,
    makeCycleId,
    parseCycleId,
    stableStringify
};
