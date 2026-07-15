const {
    CATALOG_VERSION,
    FOUNDATION_REWARD_AMOUNT,
    FOUNDATION_THRESHOLD,
    POWER_IMPACT,
    PROTOCOL_VERSION,
    REWARD_CURRENCY,
    REWARD_IMPACT,
    RULE_VERSION,
    SLOT_DEFINITIONS,
    buildCycleSnapshotForStart,
    getBootstrapCycleSnapshots,
    parseCycleId,
    stableStringify
} = require('./catalog');

const CYCLE_DRIFT_CODE = 'WEEKLY_ARCHIVE_CYCLE_DRIFT';

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this);
        });
    });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) reject(error);
            else resolve(row || null);
        });
    });
}

function makeError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function assertCycleSnapshot(existing, snapshot, snapshotJson) {
    if (!existing
        || String(existing.snapshot_hash || '') !== String(snapshot.snapshotHash || '')
        || String(existing.snapshot_json || '') !== snapshotJson) {
        throw makeError(
            CYCLE_DRIFT_CODE,
            `weekly archive cycle drift detected for ${snapshot.cycleId}`
        );
    }
}

async function ensureCycleRow(connection, snapshot, now = Date.now()) {
    const existing = await dbGet(
        connection,
        `SELECT snapshot_hash, snapshot_json
         FROM weekly_archive_cycles
         WHERE cycle_id = ?`,
        [snapshot.cycleId]
    );
    const snapshotJson = stableStringify(snapshot);
    if (existing) {
        assertCycleSnapshot(existing, snapshot, snapshotJson);
        return;
    }
    await dbRun(
        connection,
        `INSERT OR IGNORE INTO weekly_archive_cycles (
            cycle_id,
            protocol_version,
            catalog_version,
            rule_version,
            title,
            starts_at,
            ends_at,
            claim_ends_at,
            reward_currency,
            reward_impact,
            power_impact,
            slot_count,
            foundation_threshold,
            foundation_reward_amount,
            slots_json,
            grades_json,
            snapshot_hash,
            snapshot_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            snapshot.cycleId,
            snapshot.protocolVersion,
            snapshot.catalogVersion,
            snapshot.ruleVersion,
            snapshot.title,
            snapshot.startsAt,
            snapshot.endsAt,
            snapshot.claimEndsAt,
            snapshot.rewardCurrency,
            snapshot.rewardImpact,
            snapshot.powerImpact,
            SLOT_DEFINITIONS.length,
            FOUNDATION_THRESHOLD,
            FOUNDATION_REWARD_AMOUNT,
            stableStringify(snapshot.slots),
            stableStringify(snapshot.grades),
            snapshot.snapshotHash,
            snapshotJson,
            now
        ]
    );
    const persisted = await dbGet(
        connection,
        `SELECT snapshot_hash, snapshot_json
         FROM weekly_archive_cycles
         WHERE cycle_id = ?`,
        [snapshot.cycleId]
    );
    assertCycleSnapshot(persisted, snapshot, snapshotJson);
}

async function bootstrapWeeklyArchiveSchema(connection, now = Date.now(), { extraCycleIds = [] } = {}) {
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS weekly_archive_cycles (
            cycle_id TEXT PRIMARY KEY,
            protocol_version TEXT NOT NULL,
            catalog_version TEXT NOT NULL,
            rule_version TEXT NOT NULL,
            title TEXT NOT NULL,
            starts_at INTEGER NOT NULL,
            ends_at INTEGER NOT NULL,
            claim_ends_at INTEGER NOT NULL,
            reward_currency TEXT NOT NULL DEFAULT '${REWARD_CURRENCY}',
            reward_impact TEXT NOT NULL DEFAULT '${REWARD_IMPACT}',
            power_impact TEXT NOT NULL DEFAULT '${POWER_IMPACT}',
            slot_count INTEGER NOT NULL DEFAULT ${SLOT_DEFINITIONS.length},
            foundation_threshold INTEGER NOT NULL DEFAULT ${FOUNDATION_THRESHOLD},
            foundation_reward_amount INTEGER NOT NULL DEFAULT ${FOUNDATION_REWARD_AMOUNT},
            slots_json TEXT NOT NULL DEFAULT '[]',
            grades_json TEXT NOT NULL DEFAULT '[]',
            snapshot_hash TEXT NOT NULL UNIQUE,
            snapshot_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS weekly_archive_reward_claims (
            claim_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            cycle_id TEXT NOT NULL,
            reward_id TEXT NOT NULL DEFAULT 'foundation',
            grade_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL DEFAULT '',
            request_hash TEXT NOT NULL,
            ledger_entry_id TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0,
            currency TEXT NOT NULL DEFAULT '${REWARD_CURRENCY}',
            reward_impact TEXT NOT NULL DEFAULT '${REWARD_IMPACT}',
            power_impact TEXT NOT NULL DEFAULT '${POWER_IMPACT}',
            proof_count INTEGER NOT NULL DEFAULT 0,
            grade_display_level INTEGER NOT NULL DEFAULT 0,
            receipt_json TEXT NOT NULL DEFAULT '{}',
            claimed_at INTEGER NOT NULL,
            UNIQUE(user_id, cycle_id, reward_id),
            UNIQUE(user_id, mutation_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(cycle_id) REFERENCES weekly_archive_cycles(cycle_id)
        )`
    );
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS weekly_archive_mutations (
            user_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL,
            cycle_id TEXT NOT NULL,
            request_type TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            request_body_json TEXT NOT NULL DEFAULT '{}',
            claim_id TEXT NOT NULL DEFAULT '',
            receipt_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, mutation_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(cycle_id) REFERENCES weekly_archive_cycles(cycle_id)
        )`
    );
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS weekly_archive_ops_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            cycle_id TEXT NOT NULL DEFAULT '',
            grade_id TEXT NOT NULL DEFAULT '',
            result_code TEXT NOT NULL DEFAULT '',
            value INTEGER NOT NULL DEFAULT 0,
            detail_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS weekly_archive_ops_counters (
            event_type TEXT NOT NULL,
            cycle_id TEXT NOT NULL DEFAULT '',
            grade_id TEXT NOT NULL DEFAULT '',
            result_code TEXT NOT NULL DEFAULT '',
            event_count INTEGER NOT NULL DEFAULT 0,
            total_value INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(event_type, cycle_id, grade_id, result_code)
        )`
    );

    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_weekly_archive_cycles_window ON weekly_archive_cycles(starts_at, ends_at, claim_ends_at)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_weekly_archive_claims_user_claimed ON weekly_archive_reward_claims(user_id, claimed_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_weekly_archive_claims_cycle ON weekly_archive_reward_claims(cycle_id, claimed_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_weekly_archive_mutations_cycle ON weekly_archive_mutations(cycle_id, created_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_weekly_archive_ops_events_created ON weekly_archive_ops_events(event_type, created_at DESC)`);

    const snapshots = getBootstrapCycleSnapshots(now, extraCycleIds);
    for (const snapshot of snapshots) {
        await ensureCycleRow(connection, snapshot, now);
    }
}

function buildSnapshotFromCycleId(cycleId) {
    const startsAt = parseCycleId(cycleId);
    return startsAt === null ? null : buildCycleSnapshotForStart(startsAt);
}

module.exports = {
    CATALOG_VERSION,
    CYCLE_DRIFT_CODE,
    PROTOCOL_VERSION,
    RULE_VERSION,
    bootstrapWeeklyArchiveSchema,
    buildSnapshotFromCycleId,
    ensureCycleRow,
    ensureWeeklyArchiveSchema: bootstrapWeeklyArchiveSchema
};
