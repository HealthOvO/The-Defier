const {
    WEEK_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart
} = require('./catalog');
const { stableStringify } = require('../progression/authoritative-runs/canonical');

const ROTATION_DRIFT_CODE = 'FATE_CHRONICLE_ROTATION_DRIFT';

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

async function ensureRotationRow(connection, snapshot, now = Date.now()) {
    const existing = await dbGet(
        connection,
        `SELECT snapshot_hash, snapshot_json
         FROM fate_chronicle_rotations
         WHERE rotation_id = ?`,
        [snapshot.rotationId]
    );
    const snapshotJson = stableStringify(snapshot);
    if (existing) {
        if (String(existing.snapshot_hash || '') !== String(snapshot.snapshotHash || '')
            || String(existing.snapshot_json || '') !== snapshotJson) {
            throw makeError(ROTATION_DRIFT_CODE, `fate chronicle rotation drift detected for ${snapshot.rotationId}`);
        }
        return;
    }
    await dbRun(
        connection,
        `INSERT INTO fate_chronicle_rotations (
            rotation_id,
            protocol_version,
            catalog_version,
            rule_version,
            catalog_hash,
            title,
            description,
            starts_at,
            ends_at,
            grace_ends_at,
            claim_ends_at,
            run_ttl_ms,
            reward_currency,
            reward_impact,
            power_impact,
            chapters_json,
            milestones_json,
            snapshot_hash,
            snapshot_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            snapshot.rotationId,
            snapshot.protocolVersion,
            snapshot.catalogVersion,
            snapshot.rotationRuleVersion,
            snapshot.catalogHash,
            snapshot.title,
            snapshot.description,
            snapshot.startsAt,
            snapshot.endsAt,
            snapshot.graceEndsAt,
            snapshot.claimEndsAt,
            snapshot.runTtlMs,
            snapshot.rewardCurrency,
            snapshot.rewardImpact,
            snapshot.powerImpact,
            stableStringify(snapshot.chapters),
            stableStringify(snapshot.milestones),
            snapshot.snapshotHash,
            snapshotJson,
            now
        ]
    );
}

async function ensureChapterProgressRows(connection) {
    await dbRun(
        connection,
        `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_progress_user_rotation
         ON fate_chronicle_progress(user_id, rotation_id, chapter_id)`
    );
}

async function ensureFateChronicleSchema(connection, now = Date.now()) {
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_rotations (
            rotation_id TEXT PRIMARY KEY,
            protocol_version TEXT NOT NULL,
            catalog_version TEXT NOT NULL,
            rule_version TEXT NOT NULL,
            catalog_hash TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            starts_at INTEGER NOT NULL,
            ends_at INTEGER NOT NULL,
            grace_ends_at INTEGER NOT NULL,
            claim_ends_at INTEGER NOT NULL,
            run_ttl_ms INTEGER NOT NULL,
            reward_currency TEXT NOT NULL DEFAULT 'renown',
            reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
            power_impact TEXT NOT NULL DEFAULT 'none',
            chapters_json TEXT NOT NULL DEFAULT '[]',
            milestones_json TEXT NOT NULL DEFAULT '[]',
            snapshot_hash TEXT NOT NULL UNIQUE,
            snapshot_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_rotations_window ON fate_chronicle_rotations(starts_at, ends_at, claim_ends_at)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_attempts (
            attempt_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            oath_id TEXT NOT NULL,
            scenario_id TEXT NOT NULL,
            client_attempt_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            request_body_json TEXT NOT NULL DEFAULT '{}',
            seed_fingerprint TEXT NOT NULL,
            client_run_id TEXT NOT NULL,
            run_id TEXT UNIQUE,
            status TEXT NOT NULL DEFAULT 'reserved',
            reserved_at INTEGER NOT NULL,
            started_at INTEGER NOT NULL DEFAULT 0,
            activated_at INTEGER NOT NULL DEFAULT 0,
            completed_at INTEGER NOT NULL DEFAULT 0,
            submitted_at INTEGER NOT NULL DEFAULT 0,
            terminal_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            UNIQUE(user_id, mutation_id),
            UNIQUE(user_id, rotation_id, client_attempt_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES fate_chronicle_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_attempts_user_status ON fate_chronicle_attempts(user_id, status, updated_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_attempts_rotation_user ON fate_chronicle_attempts(rotation_id, user_id, chapter_id, oath_id, updated_at DESC)`);
    await dbRun(
        connection,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_fate_chronicle_one_active_per_user
         ON fate_chronicle_attempts(user_id)
         WHERE status IN ('reserved', 'active', 'completed')`
    );

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_results (
            result_id TEXT PRIMARY KEY,
            attempt_id TEXT NOT NULL UNIQUE,
            run_id TEXT NOT NULL UNIQUE,
            receipt_id TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            oath_id TEXT NOT NULL,
            scenario_id TEXT NOT NULL,
            official_score INTEGER NOT NULL,
            grade TEXT NOT NULL DEFAULT '',
            turns INTEGER NOT NULL DEFAULT 0,
            remaining_hp INTEGER NOT NULL DEFAULT 0,
            damage_taken INTEGER NOT NULL DEFAULT 0,
            encounters_won INTEGER NOT NULL DEFAULT 0,
            boss_wins INTEGER NOT NULL DEFAULT 0,
            state_hash TEXT NOT NULL DEFAULT '',
            chain_head TEXT NOT NULL DEFAULT '',
            mutation_hash TEXT NOT NULL DEFAULT '',
            summary_json TEXT NOT NULL DEFAULT '{}',
            receipt_json TEXT NOT NULL DEFAULT '{}',
            submitted_at INTEGER NOT NULL,
            FOREIGN KEY(attempt_id) REFERENCES fate_chronicle_attempts(attempt_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES fate_chronicle_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_results_user_rotation ON fate_chronicle_results(user_id, rotation_id, chapter_id, submitted_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_results_oath ON fate_chronicle_results(user_id, rotation_id, chapter_id, oath_id, submitted_at DESC)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_progress (
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            chapter_id TEXT NOT NULL,
            completed_oaths_json TEXT NOT NULL DEFAULT '[]',
            best_result_id TEXT NOT NULL DEFAULT '',
            best_score INTEGER NOT NULL DEFAULT 0,
            first_completed_at INTEGER NOT NULL DEFAULT 0,
            dual_completed_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, rotation_id, chapter_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES fate_chronicle_rotations(rotation_id)
        )`
    );
    await ensureChapterProgressRows(connection);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_reward_claims (
            claim_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            milestone_id TEXT NOT NULL,
            milestone_type TEXT NOT NULL,
            chapter_id TEXT NOT NULL DEFAULT '',
            currency TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
            power_impact TEXT NOT NULL DEFAULT 'none',
            ledger_entry_id TEXT NOT NULL,
            claim_payload_json TEXT NOT NULL DEFAULT '{}',
            claimed_at INTEGER NOT NULL,
            UNIQUE(user_id, rotation_id, milestone_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES fate_chronicle_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_claims_user_rotation ON fate_chronicle_reward_claims(user_id, rotation_id, claimed_at DESC)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_mutations (
            user_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            request_type TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            request_body_json TEXT NOT NULL DEFAULT '{}',
            receipt_json TEXT NOT NULL DEFAULT '{}',
            attempt_id TEXT NOT NULL DEFAULT '',
            result_id TEXT NOT NULL DEFAULT '',
            claim_id TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, mutation_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES fate_chronicle_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_mutations_rotation_type ON fate_chronicle_mutations(rotation_id, request_type, created_at DESC)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_ops_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            rotation_id TEXT NOT NULL DEFAULT '',
            account_ref TEXT NOT NULL DEFAULT '',
            result_code TEXT NOT NULL DEFAULT 'ok',
            value INTEGER NOT NULL DEFAULT 0,
            detail_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_fate_chronicle_ops_events_type_created ON fate_chronicle_ops_events(event_type, created_at DESC)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS fate_chronicle_ops_counters (
            event_type TEXT NOT NULL,
            rotation_id TEXT NOT NULL DEFAULT '',
            result_code TEXT NOT NULL DEFAULT 'ok',
            event_count INTEGER NOT NULL DEFAULT 0,
            total_value INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(event_type, rotation_id, result_code)
        )`
    );

    const current = buildRotationSnapshot(now);
    const previous = buildRotationSnapshotForStart(current.startsAt - WEEK_MS);
    await ensureRotationRow(connection, previous, now);
    await ensureRotationRow(connection, current, now);
}

async function reconcileFateChronicleOpsCounters(connection) {
    await dbRun(connection, `DELETE FROM fate_chronicle_ops_counters`);
    await dbRun(
        connection,
        `INSERT INTO fate_chronicle_ops_counters (event_type, rotation_id, result_code, event_count, total_value, updated_at)
         SELECT
            event_type,
            rotation_id,
            result_code,
            COUNT(*) AS event_count,
            COALESCE(SUM(value), 0) AS total_value,
            COALESCE(MAX(created_at), 0) AS updated_at
         FROM fate_chronicle_ops_events
         GROUP BY event_type, rotation_id, result_code`
    );
}

async function bootstrapFateChronicleSchema(db, now = Date.now()) {
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
        await ensureFateChronicleSchema(db, now);
        await reconcileFateChronicleOpsCounters(db);
        await dbRun(db, 'COMMIT');
    } catch (error) {
        try {
            await dbRun(db, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[FateChronicle] Bootstrap rollback failed:', rollbackError);
        }
        throw error;
    }
}

module.exports = {
    ROTATION_DRIFT_CODE,
    bootstrapFateChronicleSchema,
    ensureFateChronicleSchema,
    ensureRotationRow,
    reconcileFateChronicleOpsCounters
};
