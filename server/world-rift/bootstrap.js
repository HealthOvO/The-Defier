const {
    CATALOG_VERSION,
    PHASES,
    TOTAL_HP,
    WEEK_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart
} = require('./catalog');
const { stableStringify } = require('../progression/authoritative-runs/canonical');

const ROTATION_DRIFT_CODE = 'WORLD_RIFT_ROTATION_DRIFT';

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
         FROM world_rift_rotations
         WHERE rotation_id = ?`,
        [snapshot.rotationId]
    );
    const snapshotJson = stableStringify(snapshot);
    if (existing) {
        if (String(existing.snapshot_hash || '') !== String(snapshot.snapshotHash || '')
            || String(existing.snapshot_json || '') !== snapshotJson) {
            throw makeError(
                ROTATION_DRIFT_CODE,
                `world rift rotation drift detected for ${snapshot.rotationId}`
            );
        }
        return;
    }
    await dbRun(
        connection,
        `INSERT INTO world_rift_rotations (
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
            attempt_limit,
            seed_slot_count,
            leaderboard_limit,
            total_hp,
            contribution_formula_json,
            phases_json,
            milestones_json,
            snapshot_hash,
            snapshot_json,
            created_at
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
            snapshot.attemptLimit,
            snapshot.seedSlotCount,
            snapshot.leaderboardLimit,
            snapshot.totalHp,
            stableStringify(snapshot.contributionFormula),
            stableStringify(snapshot.phases),
            stableStringify(snapshot.milestones),
            snapshot.snapshotHash,
            snapshotJson,
            now
        ]
    );
}

async function ensureRotationWindow(connection, snapshot, now = Date.now()) {
    const existing = await dbGet(
        connection,
        `SELECT rotation_id, catalog_version, snapshot_json
         FROM world_rift_rotations
         WHERE starts_at = ? AND ends_at = ?
         ORDER BY created_at DESC, rotation_id DESC
         LIMIT 1`,
        [snapshot.startsAt, snapshot.endsAt]
    );
    if (!existing) {
        await ensureRotationRow(connection, snapshot, now);
        return snapshot;
    }
    if (String(existing.catalog_version || '') === CATALOG_VERSION) {
        await ensureRotationRow(connection, snapshot, now);
        return snapshot;
    }
    try {
        const legacySnapshot = JSON.parse(String(existing.snapshot_json || ''));
        if (!legacySnapshot || String(legacySnapshot.rotationId || '') !== String(existing.rotation_id || '')) {
            throw new Error('legacy rotation snapshot identity mismatch');
        }
        const activeWindow = snapshot.startsAt <= now && snapshot.endsAt > now;
        if (activeWindow) {
            if (String(existing.rotation_id || '') !== String(snapshot.rotationId || '')) {
                throw new Error('active rotation upgrade identity mismatch');
            }
            const snapshotJson = stableStringify(snapshot);
            await dbRun(
                connection,
                `UPDATE world_rift_rotations
                 SET protocol_version = ?, catalog_version = ?, rule_version = ?, catalog_hash = ?,
                     title = ?, description = ?, starts_at = ?, ends_at = ?, grace_ends_at = ?, claim_ends_at = ?,
                     attempt_limit = ?, seed_slot_count = ?, leaderboard_limit = ?, total_hp = ?,
                     contribution_formula_json = ?, phases_json = ?, milestones_json = ?,
                     snapshot_hash = ?, snapshot_json = ?
                 WHERE rotation_id = ?`,
                [
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
                    snapshot.attemptLimit,
                    snapshot.seedSlotCount,
                    snapshot.leaderboardLimit,
                    snapshot.totalHp,
                    stableStringify(snapshot.contributionFormula),
                    stableStringify(snapshot.phases),
                    stableStringify(snapshot.milestones),
                    snapshot.snapshotHash,
                    snapshotJson,
                    snapshot.rotationId
                ]
            );
            return snapshot;
        }
        return legacySnapshot;
    } catch (error) {
        throw makeError(
            ROTATION_DRIFT_CODE,
            `world rift legacy rotation snapshot is invalid for ${existing.rotation_id}`
        );
    }
}

async function ensureStateRow(connection, snapshot, now = Date.now()) {
    const existing = await dbGet(
        connection,
        `SELECT rotation_id
         FROM world_rift_states
         WHERE rotation_id = ?`,
        [snapshot.rotationId]
    );
    if (existing) return;
    await dbRun(
        connection,
        `INSERT INTO world_rift_states (
            rotation_id,
            applied_damage,
            total_contribution,
            current_phase_index,
            cleared_at,
            phase_unlocks_json,
            state_version,
            last_contribution_id,
            last_result_at,
            updated_at
        ) VALUES (?, 0, 0, 1, 0, ?, 0, '', 0, ?)`,
        [
            snapshot.rotationId,
            stableStringify(
                Object.fromEntries(PHASES.map(phase => [phase.rewardMilestoneId, 0]))
            ),
            now
        ]
    );
}

async function ensureWorldRiftSchema(connection, now = Date.now()) {
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_rotations (
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
            attempt_limit INTEGER NOT NULL DEFAULT 5,
            seed_slot_count INTEGER NOT NULL DEFAULT 5,
            leaderboard_limit INTEGER NOT NULL DEFAULT 20,
            total_hp INTEGER NOT NULL DEFAULT ${TOTAL_HP},
            contribution_formula_json TEXT NOT NULL DEFAULT '{}',
            phases_json TEXT NOT NULL DEFAULT '[]',
            milestones_json TEXT NOT NULL DEFAULT '[]',
            snapshot_hash TEXT NOT NULL UNIQUE,
            snapshot_json TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_states (
            rotation_id TEXT PRIMARY KEY,
            applied_damage INTEGER NOT NULL DEFAULT 0,
            total_contribution INTEGER NOT NULL DEFAULT 0,
            current_phase_index INTEGER NOT NULL DEFAULT 1,
            cleared_at INTEGER NOT NULL DEFAULT 0,
            phase_unlocks_json TEXT NOT NULL DEFAULT '{}',
            state_version INTEGER NOT NULL DEFAULT 0,
            last_contribution_id TEXT NOT NULL DEFAULT '',
            last_result_at INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
        )`
    );
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_attempts (
            attempt_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            client_attempt_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            request_body_json TEXT NOT NULL DEFAULT '{}',
            attempt_index INTEGER NOT NULL,
            seed_slot INTEGER NOT NULL,
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
            UNIQUE(user_id, rotation_id, attempt_index),
            UNIQUE(user_id, rotation_id, client_attempt_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_attempts_user_status ON world_rift_attempts(user_id, status, updated_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_attempts_rotation_user ON world_rift_attempts(rotation_id, user_id, attempt_index)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_contributions (
            contribution_id TEXT PRIMARY KEY,
            attempt_id TEXT NOT NULL UNIQUE,
            run_id TEXT NOT NULL UNIQUE,
            receipt_id TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            turns INTEGER NOT NULL DEFAULT 0,
            remaining_hp INTEGER NOT NULL DEFAULT 0,
            survival_bonus INTEGER NOT NULL DEFAULT 0,
            tempo_bonus INTEGER NOT NULL DEFAULT 0,
            contribution INTEGER NOT NULL,
            applied_damage INTEGER NOT NULL DEFAULT 0,
            echo_contribution INTEGER NOT NULL DEFAULT 0,
            previous_phase_index INTEGER NOT NULL DEFAULT 1,
            next_phase_index INTEGER NOT NULL DEFAULT 1,
            previous_applied_damage INTEGER NOT NULL DEFAULT 0,
            next_applied_damage INTEGER NOT NULL DEFAULT 0,
            state_version INTEGER NOT NULL DEFAULT 0,
            mutation_hash TEXT NOT NULL DEFAULT '',
            summary_json TEXT NOT NULL DEFAULT '{}',
            receipt_json TEXT NOT NULL DEFAULT '{}',
            submitted_at INTEGER NOT NULL,
            FOREIGN KEY(attempt_id) REFERENCES world_rift_attempts(attempt_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_contributions_rotation_rank ON world_rift_contributions(rotation_id, contribution DESC, remaining_hp DESC, turns ASC, submitted_at ASC, contribution_id ASC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_contributions_user_rotation ON world_rift_contributions(user_id, rotation_id, submitted_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_entries (
            rotation_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            entry_id TEXT NOT NULL UNIQUE,
            ranked_contribution INTEGER NOT NULL DEFAULT 0,
            best_contribution INTEGER NOT NULL DEFAULT 0,
            ranked_remaining_hp INTEGER NOT NULL DEFAULT 0,
            ranked_turns INTEGER NOT NULL DEFAULT 0,
            total_contribution INTEGER NOT NULL DEFAULT 0,
            completed_attempts INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(rotation_id, user_id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_entries_rank ON world_rift_entries(rotation_id, ranked_contribution DESC, best_contribution DESC, ranked_remaining_hp DESC, ranked_turns ASC, entry_id ASC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_reward_claims (
            claim_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            milestone_id TEXT NOT NULL,
            milestone_type TEXT NOT NULL,
            contribution_id TEXT NOT NULL DEFAULT '',
            currency TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
            ledger_entry_id TEXT NOT NULL,
            claim_payload_json TEXT NOT NULL DEFAULT '{}',
            claimed_at INTEGER NOT NULL,
            UNIQUE(user_id, rotation_id, milestone_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_claims_user_rotation ON world_rift_reward_claims(user_id, rotation_id, claimed_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_mutations (
            user_id TEXT NOT NULL,
            mutation_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            request_type TEXT NOT NULL,
            request_hash TEXT NOT NULL,
            request_body_json TEXT NOT NULL DEFAULT '{}',
            receipt_json TEXT NOT NULL DEFAULT '{}',
            attempt_id TEXT NOT NULL DEFAULT '',
            contribution_id TEXT NOT NULL DEFAULT '',
            claim_id TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            PRIMARY KEY(user_id, mutation_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_mutations_rotation_type ON world_rift_mutations(rotation_id, request_type, created_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_directive_states (
            rotation_id TEXT NOT NULL,
            directive_id TEXT NOT NULL,
            scope TEXT NOT NULL,
            owner_type TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            progress_value INTEGER NOT NULL DEFAULT 0,
            target_value INTEGER NOT NULL DEFAULT 0,
            progress_json TEXT NOT NULL DEFAULT '{}',
            state_version INTEGER NOT NULL DEFAULT 0,
            completed_at INTEGER NOT NULL DEFAULT 0,
            last_projection_id TEXT NOT NULL DEFAULT '',
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(rotation_id, directive_id, owner_type, owner_id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_directive_states_owner ON world_rift_directive_states(owner_type, owner_id, updated_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_directive_states_rotation_scope ON world_rift_directive_states(rotation_id, scope, completed_at, updated_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_directive_projections (
            projection_id TEXT PRIMARY KEY,
            rotation_id TEXT NOT NULL,
            directive_id TEXT NOT NULL,
            contribution_id TEXT NOT NULL,
            owner_type TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            delta_value INTEGER NOT NULL DEFAULT 0,
            delta_json TEXT NOT NULL DEFAULT '{}',
            result_progress_value INTEGER NOT NULL DEFAULT 0,
            result_state_version INTEGER NOT NULL DEFAULT 0,
            completed_now INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            UNIQUE(rotation_id, directive_id, contribution_id, owner_type, owner_id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id),
            FOREIGN KEY(contribution_id) REFERENCES world_rift_contributions(contribution_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_directive_projections_rotation_created ON world_rift_directive_projections(rotation_id, created_at, projection_id)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_directive_projections_owner ON world_rift_directive_projections(owner_type, owner_id, created_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_directive_claims (
            claim_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            directive_id TEXT NOT NULL,
            scope TEXT NOT NULL,
            owner_type TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            contribution_id TEXT NOT NULL DEFAULT '',
            currency TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
            ledger_entry_id TEXT NOT NULL,
            claim_payload_json TEXT NOT NULL DEFAULT '{}',
            claimed_at INTEGER NOT NULL,
            UNIQUE(user_id, rotation_id, directive_id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_directive_claims_owner ON world_rift_directive_claims(rotation_id, owner_type, owner_id, claimed_at DESC)`);
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_directive_claims_user_rotation ON world_rift_directive_claims(user_id, rotation_id, claimed_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_ops_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            account_ref TEXT NOT NULL DEFAULT '',
            result_code TEXT NOT NULL DEFAULT 'ok',
            value INTEGER NOT NULL DEFAULT 0,
            detail_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL
        )`
    );
    await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_ops_events_type_created ON world_rift_ops_events(event_type, created_at DESC)`);
    await dbRun(
        connection,
        `CREATE TABLE IF NOT EXISTS world_rift_ops_counters (
            event_type TEXT NOT NULL,
            rotation_id TEXT NOT NULL,
            result_code TEXT NOT NULL DEFAULT 'ok',
            event_count INTEGER NOT NULL DEFAULT 0,
            total_value INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(event_type, rotation_id, result_code)
        )`
    );
    const current = buildRotationSnapshot(now);
    const previous = buildRotationSnapshotForStart(current.startsAt - WEEK_MS);
    const selectedPrevious = await ensureRotationWindow(connection, previous, now);
    const selectedCurrent = await ensureRotationWindow(connection, current, now);
    await ensureStateRow(connection, selectedPrevious, now);
    await ensureStateRow(connection, selectedCurrent, now);
}

async function reconcileWorldRiftOpsCounters(connection) {
    await dbRun(connection, `DELETE FROM world_rift_ops_counters`);
    await dbRun(
        connection,
        `INSERT INTO world_rift_ops_counters (event_type, rotation_id, result_code, event_count, total_value, updated_at)
         SELECT
            event_type,
            rotation_id,
            result_code,
            COUNT(*) AS event_count,
            COALESCE(SUM(value), 0) AS total_value,
            COALESCE(MAX(created_at), 0) AS updated_at
         FROM world_rift_ops_events
         GROUP BY event_type, rotation_id, result_code`
    );
}

async function bootstrapWorldRiftSchema(db, now = Date.now()) {
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
        await ensureWorldRiftSchema(db, now);
        await reconcileWorldRiftOpsCounters(db);
        await dbRun(db, 'COMMIT');
    } catch (error) {
        try {
            await dbRun(db, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[WorldRift] Bootstrap rollback failed:', rollbackError);
        }
        throw error;
    }
}

module.exports = {
    ROTATION_DRIFT_CODE,
    bootstrapWorldRiftSchema,
    ensureWorldRiftSchema,
    reconcileWorldRiftOpsCounters
};
