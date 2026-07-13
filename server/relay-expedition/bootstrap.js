const {
    WEEK_MS,
    buildLegacyV1RotationSnapshotForStart,
    buildRotationSnapshot,
    buildRotationSnapshotForStart
} = require('./catalog');
const { stableStringify } = require('../progression/authoritative-runs/canonical');

const ROTATION_DRIFT_CODE = 'RELAY_EXPEDITION_ROTATION_DRIFT';

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

function rotationRowMatchesSnapshot(row, snapshot) {
    if (!row || !snapshot) return false;
    const textFields = [
        ['rotation_id', 'rotationId'],
        ['protocol_version', 'protocolVersion'],
        ['catalog_version', 'catalogVersion'],
        ['rule_version', 'rotationRuleVersion'],
        ['catalog_hash', 'catalogHash'],
        ['title', 'title'],
        ['description', 'description'],
        ['snapshot_hash', 'snapshotHash']
    ];
    const numericFields = [
        ['starts_at', 'startsAt'],
        ['ends_at', 'endsAt'],
        ['grace_ends_at', 'graceEndsAt'],
        ['claim_ends_at', 'claimEndsAt'],
        ['leg_count', 'legCount'],
        ['priority_window_ms', 'priorityWindowMs'],
        ['open_claim_window_ms', 'openClaimWindowMs'],
        ['active_lease_ms', 'activeLeaseMs']
    ];
    return textFields.every(([column, key]) => String(row[column] || '') === String(snapshot[key] || ''))
        && numericFields.every(([column, key]) => Number(row[column]) === Number(snapshot[key]))
        && String(row.tactics_json || '') === stableStringify(snapshot.tactics)
        && String(row.score_formula_json || '') === stableStringify(snapshot.scoreFormula)
        && String(row.milestones_json || '') === stableStringify(snapshot.milestones)
        && String(row.snapshot_json || '') === stableStringify(snapshot);
}

async function ensureRotationRow(connection, snapshot, now = Date.now()) {
    const existing = await dbGet(
        connection,
        `SELECT rotation_id, protocol_version, catalog_version, rule_version, catalog_hash,
                title, description, starts_at, ends_at, grace_ends_at, claim_ends_at,
                leg_count, priority_window_ms, open_claim_window_ms, active_lease_ms,
                tactics_json, score_formula_json, milestones_json, snapshot_hash, snapshot_json
         FROM relay_expedition_rotations
         WHERE rotation_id = ?`,
        [snapshot.rotationId]
    );
    const snapshotJson = stableStringify(snapshot);
    if (existing) {
        if (rotationRowMatchesSnapshot(existing, snapshot)) return;
        const legacySnapshot = buildLegacyV1RotationSnapshotForStart(snapshot.startsAt);
        if (rotationRowMatchesSnapshot(existing, legacySnapshot)) return;
        throw makeError(ROTATION_DRIFT_CODE, `relay expedition rotation drift detected for ${snapshot.rotationId}`);
    }
    await dbRun(
        connection,
        `INSERT INTO relay_expedition_rotations (
            rotation_id, protocol_version, catalog_version, rule_version, catalog_hash,
            title, description, starts_at, ends_at, grace_ends_at, claim_ends_at,
            leg_count, priority_window_ms, open_claim_window_ms, active_lease_ms,
            tactics_json, score_formula_json, milestones_json, snapshot_hash, snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            snapshot.legCount,
            snapshot.priorityWindowMs,
            snapshot.openClaimWindowMs,
            snapshot.activeLeaseMs,
            stableStringify(snapshot.tactics),
            stableStringify(snapshot.scoreFormula),
            stableStringify(snapshot.milestones),
            snapshot.snapshotHash,
            snapshotJson,
            now
        ]
    );
}

async function ensureRelayExpeditionSchema(connection, now = Date.now()) {
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_rotations (
            rotation_id TEXT PRIMARY KEY,
            protocol_version TEXT NOT NULL,
            catalog_version TEXT NOT NULL,
            rule_version TEXT NOT NULL,
            catalog_hash TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            starts_at INTEGER NOT NULL,
            ends_at INTEGER NOT NULL,
            grace_ends_at INTEGER NOT NULL,
            claim_ends_at INTEGER NOT NULL,
            leg_count INTEGER NOT NULL,
            priority_window_ms INTEGER NOT NULL,
            open_claim_window_ms INTEGER NOT NULL,
            active_lease_ms INTEGER NOT NULL,
            tactics_json TEXT NOT NULL DEFAULT '[]',
            score_formula_json TEXT NOT NULL DEFAULT '{}',
            milestones_json TEXT NOT NULL DEFAULT '[]',
            snapshot_hash TEXT NOT NULL,
            snapshot_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_rotations_window ON relay_expedition_rotations(starts_at, ends_at, claim_ends_at)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_sessions (
            session_id TEXT PRIMARY KEY,
            rotation_id TEXT NOT NULL,
            source_squad_id TEXT NOT NULL,
            source_rotation_id TEXT NOT NULL,
            leader_user_id TEXT NOT NULL,
            client_session_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            current_leg_index INTEGER NOT NULL DEFAULT 1,
            active_leg_id TEXT NOT NULL DEFAULT '',
            route_score INTEGER NOT NULL DEFAULT 0,
            successful_legs INTEGER NOT NULL DEFAULT 0,
            processed_legs INTEGER NOT NULL DEFAULT 0,
            projected_legs INTEGER NOT NULL DEFAULT 0,
            participant_count INTEGER NOT NULL DEFAULT 0,
            route_json TEXT NOT NULL DEFAULT '[]',
            route_hash TEXT NOT NULL DEFAULT '',
            state_version INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL,
            completed_at INTEGER NOT NULL DEFAULT 0,
            terminal_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            UNIQUE(rotation_id, source_squad_id),
            UNIQUE(leader_user_id, rotation_id, client_session_id),
            FOREIGN KEY(rotation_id) REFERENCES relay_expedition_rotations(rotation_id),
            FOREIGN KEY(leader_user_id) REFERENCES users(id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_sessions_rotation_status ON relay_expedition_sessions(rotation_id, status, updated_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_sessions_source ON relay_expedition_sessions(source_squad_id, rotation_id)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_members (
            session_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            profile_id_snapshot TEXT NOT NULL DEFAULT '',
            display_name_snapshot TEXT NOT NULL DEFAULT '',
            seat INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            status TEXT NOT NULL DEFAULT 'active',
            claimed_legs INTEGER NOT NULL DEFAULT 0,
            projected_legs INTEGER NOT NULL DEFAULT 0,
            last_leg_index INTEGER NOT NULL DEFAULT 0,
            locked_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(session_id, user_id),
            UNIQUE(rotation_id, user_id),
            UNIQUE(session_id, seat),
            FOREIGN KEY(session_id) REFERENCES relay_expedition_sessions(session_id),
            FOREIGN KEY(rotation_id) REFERENCES relay_expedition_rotations(rotation_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_members_user_rotation ON relay_expedition_members(user_id, rotation_id, status)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_members_session_seat ON relay_expedition_members(session_id, seat)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_legs (
            leg_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            leg_index INTEGER NOT NULL,
            priority_user_id TEXT NOT NULL,
            runner_user_id TEXT NOT NULL DEFAULT '',
            tactic_id TEXT NOT NULL DEFAULT '',
            client_leg_id TEXT NOT NULL DEFAULT '',
            client_run_id TEXT NOT NULL DEFAULT '',
            run_id TEXT,
            receipt_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'queued',
            outcome TEXT NOT NULL DEFAULT '',
            request_hash TEXT NOT NULL DEFAULT '',
            request_body_json TEXT NOT NULL DEFAULT '{}',
            seed_fingerprint TEXT NOT NULL DEFAULT '',
            authoritative_summary_json TEXT NOT NULL DEFAULT '{}',
            route_score INTEGER NOT NULL DEFAULT 0,
            handoff_options_json TEXT NOT NULL DEFAULT '[]',
            queued_at INTEGER NOT NULL DEFAULT 0,
            priority_until INTEGER NOT NULL DEFAULT 0,
            open_claim_until INTEGER NOT NULL DEFAULT 0,
            reserved_at INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL DEFAULT 0,
            active_lease_until INTEGER NOT NULL DEFAULT 0,
            settled_at INTEGER NOT NULL DEFAULT 0,
            projected_at INTEGER NOT NULL DEFAULT 0,
            skipped_at INTEGER NOT NULL DEFAULT 0,
            terminal_at INTEGER NOT NULL DEFAULT 0,
            pass_count INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            UNIQUE(session_id, leg_index),
            FOREIGN KEY(session_id) REFERENCES relay_expedition_sessions(session_id),
            FOREIGN KEY(rotation_id) REFERENCES relay_expedition_rotations(rotation_id),
            FOREIGN KEY(priority_user_id) REFERENCES users(id)
        )`
    );
    await dbRun(connection, `CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_legs_run_unique ON relay_expedition_legs(run_id) WHERE run_id IS NOT NULL AND run_id <> ''`);
    await dbRun(connection, `CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_legs_runner_client_unique ON relay_expedition_legs(runner_user_id, client_leg_id) WHERE runner_user_id <> '' AND client_leg_id <> ''`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_legs_session_status ON relay_expedition_legs(session_id, status, leg_index)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_legs_runner_status ON relay_expedition_legs(runner_user_id, status, updated_at DESC)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_reward_claims (
            claim_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            milestone_id TEXT NOT NULL,
            currency TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
            power_impact TEXT NOT NULL DEFAULT 'none',
            ledger_entry_id TEXT NOT NULL,
            claim_payload_json TEXT NOT NULL DEFAULT '{}',
            claimed_at INTEGER NOT NULL,
            UNIQUE(user_id, session_id, milestone_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES relay_expedition_rotations(rotation_id),
            FOREIGN KEY(session_id) REFERENCES relay_expedition_sessions(session_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_claims_user_rotation ON relay_expedition_reward_claims(user_id, rotation_id, claimed_at DESC)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_mutations (
            user_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL DEFAULT '',
            session_id TEXT NOT NULL DEFAULT '',
            request_type TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            request_body_json TEXT NOT NULL DEFAULT '{}',
            receipt_json TEXT NOT NULL DEFAULT '{}',
            leg_id TEXT NOT NULL DEFAULT '',
            claim_id TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, mutation_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_mutations_session_type ON relay_expedition_mutations(session_id, request_type, created_at DESC)`);

    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_ops_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            rotation_id TEXT NOT NULL DEFAULT '',
            session_ref TEXT NOT NULL DEFAULT '',
            account_ref TEXT NOT NULL DEFAULT '',
            run_ref TEXT NOT NULL DEFAULT '',
            result_code TEXT NOT NULL DEFAULT 'ok',
            value INTEGER NOT NULL DEFAULT 0,
            detail_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_relay_ops_events_type_created ON relay_expedition_ops_events(event_type, created_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS relay_expedition_ops_counters (
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

async function reconcileRelayExpeditionOpsCounters(connection) {
    await dbRun(connection, `DELETE FROM relay_expedition_ops_counters`);
    await dbRun(
        connection,
        `INSERT INTO relay_expedition_ops_counters (event_type, rotation_id, result_code, event_count, total_value, updated_at)
         SELECT event_type, rotation_id, result_code, COUNT(*), COALESCE(SUM(value), 0), COALESCE(MAX(created_at), 0)
         FROM relay_expedition_ops_events
         GROUP BY event_type, rotation_id, result_code`
    );
}

async function bootstrapRelayExpeditionSchema(connection, now = Date.now()) {
    await dbRun(connection, 'BEGIN IMMEDIATE');
    try {
        await ensureRelayExpeditionSchema(connection, now);
        await reconcileRelayExpeditionOpsCounters(connection);
        await dbRun(connection, 'COMMIT');
    } catch (error) {
        try {
            await dbRun(connection, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[RelayExpedition] Bootstrap rollback failed:', rollbackError);
        }
        throw error;
    }
}

module.exports = {
    ROTATION_DRIFT_CODE,
    bootstrapRelayExpeditionSchema,
    ensureRelayExpeditionSchema,
    reconcileRelayExpeditionOpsCounters
};
