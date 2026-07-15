const {
    WEEK_MS,
    buildRotationSnapshot,
    buildRotationSnapshotForStart
} = require('./catalog');
const { hashCanonical, stableStringify } = require('../progression/authoritative-runs/canonical');

const ROTATION_DRIFT_CODE = 'FATE_CHRONICLE_ROTATION_DRIFT';
const LEGACY_CATALOG_VERSION = 'fate-chronicle-catalog-v1';
const LEGACY_ROTATION_RULE_VERSION = 'fate-chronicle-rotation-v1';
const LEGACY_CATALOG_HASH = 'fedf4ecb07da4a5acabced56b0e8aa3a6941bb920595e5b670bb76e26b70896c';
const LEGACY_DESCRIPTION = '三章双誓约的服务端主线篇章，同章无限重试，同账号同一时刻仅一条 active run。';
const LEGACY_DUAL_TITLES = Object.freeze({
    'chapter-1-dual': '照火双誓',
    'chapter-2-dual': '镜命双誓',
    'chapter-3-dual': '裂天双誓'
});

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

function rotationRowMatchesSnapshot(row, snapshot, snapshotJson = stableStringify(snapshot)) {
    if (!row || !snapshot) return false;
    return String(row.rotation_id || '') === String(snapshot.rotationId || '')
        && String(row.protocol_version || '') === String(snapshot.protocolVersion || '')
        && String(row.catalog_version || '') === String(snapshot.catalogVersion || '')
        && String(row.rule_version || '') === String(snapshot.rotationRuleVersion || '')
        && String(row.catalog_hash || '') === String(snapshot.catalogHash || '')
        && String(row.title || '') === String(snapshot.title || '')
        && String(row.description || '') === String(snapshot.description || '')
        && Number(row.starts_at) === Number(snapshot.startsAt)
        && Number(row.ends_at) === Number(snapshot.endsAt)
        && Number(row.grace_ends_at) === Number(snapshot.graceEndsAt)
        && Number(row.claim_ends_at) === Number(snapshot.claimEndsAt)
        && Number(row.run_ttl_ms) === Number(snapshot.runTtlMs)
        && String(row.reward_currency || '') === String(snapshot.rewardCurrency || '')
        && String(row.reward_impact || '') === String(snapshot.rewardImpact || '')
        && String(row.power_impact || '') === String(snapshot.powerImpact || '')
        && String(row.chapters_json || '') === stableStringify(snapshot.chapters)
        && String(row.milestones_json || '') === stableStringify(snapshot.milestones)
        && String(row.snapshot_hash || '') === String(snapshot.snapshotHash || '')
        && String(row.snapshot_json || '') === snapshotJson;
}

function loadRotationRow(connection, rotationId) {
    return dbGet(
        connection,
        `SELECT rotation_id, protocol_version, catalog_version, rule_version, catalog_hash,
                title, description, starts_at, ends_at, grace_ends_at, claim_ends_at, run_ttl_ms,
                reward_currency, reward_impact, power_impact, chapters_json, milestones_json,
                snapshot_hash, snapshot_json
         FROM fate_chronicle_rotations
         WHERE rotation_id = ?`,
        [rotationId]
    );
}

function buildKnownLegacyRotation(nextSnapshot) {
    if (!nextSnapshot || !Array.isArray(nextSnapshot.chapters) || !Array.isArray(nextSnapshot.milestones)) {
        return null;
    }
    const chapters = nextSnapshot.chapters.map(chapter => ({
        ...chapter,
        oaths: Array.isArray(chapter.oaths) ? chapter.oaths.slice(0, 2) : []
    }));
    const milestones = nextSnapshot.milestones.map(milestone => ({
        ...milestone,
        title: LEGACY_DUAL_TITLES[milestone.milestoneId] || milestone.title
    }));
    const legacyCatalog = {
        protocolVersion: nextSnapshot.protocolVersion,
        catalogVersion: LEGACY_CATALOG_VERSION,
        rotationRuleVersion: LEGACY_ROTATION_RULE_VERSION,
        rewardCurrency: nextSnapshot.rewardCurrency,
        rewardImpact: nextSnapshot.rewardImpact,
        powerImpact: nextSnapshot.powerImpact,
        runTtlMs: nextSnapshot.runTtlMs,
        settlementGraceMs: Number(nextSnapshot.graceEndsAt) - Number(nextSnapshot.endsAt),
        claimWindowMs: Number(nextSnapshot.claimEndsAt) - Number(nextSnapshot.endsAt),
        chapters,
        milestones
    };
    if (hashCanonical(legacyCatalog) !== LEGACY_CATALOG_HASH) return null;
    const legacy = {
        rotationId: nextSnapshot.rotationId,
        protocolVersion: nextSnapshot.protocolVersion,
        catalogVersion: LEGACY_CATALOG_VERSION,
        rotationRuleVersion: LEGACY_ROTATION_RULE_VERSION,
        catalogHash: LEGACY_CATALOG_HASH,
        title: '命途长卷',
        description: LEGACY_DESCRIPTION,
        startsAt: nextSnapshot.startsAt,
        endsAt: nextSnapshot.endsAt,
        graceEndsAt: nextSnapshot.graceEndsAt,
        claimEndsAt: nextSnapshot.claimEndsAt,
        runTtlMs: nextSnapshot.runTtlMs,
        rewardCurrency: nextSnapshot.rewardCurrency,
        rewardImpact: nextSnapshot.rewardImpact,
        powerImpact: nextSnapshot.powerImpact,
        chapters,
        milestones,
        fairness: {
            settledBy: 'server_authoritative',
            sharedSeedPerWeek: true,
            accountWideSingleActiveRun: true,
            retries: 'unlimited',
            leaderboard: false
        }
    };
    return { ...legacy, snapshotHash: hashCanonical(legacy) };
}

function isKnownLegacyRotation(existing, nextSnapshot) {
    let parsed;
    try {
        parsed = JSON.parse(String(existing && existing.snapshot_json || ''));
    } catch (error) {
        return false;
    }
    const expected = buildKnownLegacyRotation(nextSnapshot);
    if (!expected || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const expectedJson = stableStringify(expected);
    return stableStringify(parsed) === expectedJson
        && rotationRowMatchesSnapshot(existing, expected, expectedJson);
}

async function ensureRotationRow(connection, snapshot, now = Date.now()) {
    const existing = await loadRotationRow(connection, snapshot.rotationId);
    const snapshotJson = stableStringify(snapshot);
    if (existing) {
        if (rotationRowMatchesSnapshot(existing, snapshot, snapshotJson)) return;
        if (isKnownLegacyRotation(existing, snapshot)) return;
        throw makeError(ROTATION_DRIFT_CODE, `fate chronicle rotation drift detected for ${snapshot.rotationId}`);
    }
    await dbRun(
        connection,
        `INSERT OR IGNORE INTO fate_chronicle_rotations (
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
    const persisted = await loadRotationRow(connection, snapshot.rotationId);
    if (rotationRowMatchesSnapshot(persisted, snapshot, snapshotJson)) return;
    if (isKnownLegacyRotation(persisted, snapshot)) return;
    throw makeError(ROTATION_DRIFT_CODE, `fate chronicle rotation drift detected for ${snapshot.rotationId}`);
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
