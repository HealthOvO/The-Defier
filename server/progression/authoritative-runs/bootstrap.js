const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PROTOCOL_VERSION = 'authoritative-run-v2';
const CATALOG_DRIFT_CODE = 'AUTHORITATIVE_RUN_CATALOG_DRIFT';
const CATALOG_HASH_MISMATCH_CODE = 'AUTHORITATIVE_RUN_CATALOG_HASH_MISMATCH';

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

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) reject(error);
            else resolve(rows || []);
        });
    });
}

async function addColumnIfMissing(db, tableName, columnName, definition) {
    const columns = await dbAll(db, `PRAGMA table_info(${tableName})`);
    if (columns.some(column => String(column.name || '') === columnName)) return;
    await dbRun(db, `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(item => stableStringify(item)).join(',')}]`;
    if (typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function digest(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function makeError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function normalizeCatalogSource(source, origin) {
    if (!source || typeof source !== 'object') {
        throw makeError(CATALOG_DRIFT_CODE, `authoritative runs catalog source is invalid (${origin})`);
    }
    const contentVersion = String(source.CONTENT_VERSION || '').trim();
    const expectedHash = String(source.CONTENT_HASH || '').trim().toLowerCase();
    const snapshot = source.CONTENT_SNAPSHOT;
    if (!contentVersion || !expectedHash || snapshot === undefined) {
        throw makeError(CATALOG_DRIFT_CODE, `authoritative runs catalog is incomplete (${origin})`);
    }
    const snapshotJson = stableStringify(snapshot);
    const actualHash = digest(snapshotJson);
    if (actualHash !== expectedHash) {
        throw makeError(
            CATALOG_HASH_MISMATCH_CODE,
            `authoritative runs catalog hash mismatch for ${contentVersion}: expected ${expectedHash}, got ${actualHash}`
        );
    }
    return {
        contentVersion,
        contentHash: expectedHash,
        contentJson: snapshotJson
    };
}

function loadCatalogFromEnv() {
    const contentVersion = String(process.env.DEFIER_AUTHORITATIVE_RUNS_CONTENT_VERSION || '').trim();
    const contentHash = String(process.env.DEFIER_AUTHORITATIVE_RUNS_CONTENT_HASH || '').trim().toLowerCase();
    const snapshotJson = process.env.DEFIER_AUTHORITATIVE_RUNS_CONTENT_SNAPSHOT_JSON;
    if (!contentVersion && !contentHash && !snapshotJson) {
        return null;
    }
    if (!contentVersion || !contentHash || snapshotJson === undefined) {
        throw makeError(CATALOG_DRIFT_CODE, 'authoritative runs env catalog is incomplete');
    }
    let snapshot;
    try {
        snapshot = JSON.parse(snapshotJson);
    } catch (error) {
        throw makeError(CATALOG_DRIFT_CODE, 'authoritative runs env catalog snapshot is not valid JSON');
    }
    return normalizeCatalogSource(
        {
            CONTENT_VERSION: contentVersion,
            CONTENT_HASH: contentHash,
            CONTENT_SNAPSHOT: snapshot
        },
        'env'
    );
}

function loadAuthoritativeRunsCatalog() {
    const catalogPath = path.join(__dirname, 'catalog.js');
    if (fs.existsSync(catalogPath)) {
        const catalogModule = require(catalogPath);
        return normalizeCatalogSource(catalogModule, catalogPath);
    }
    return loadCatalogFromEnv();
}

async function ensureCatalogRow(db, now) {
    const catalog = loadAuthoritativeRunsCatalog();
    if (!catalog) {
        return;
    }
    const existingByVersion = await dbGet(
        db,
        `SELECT protocol_version, content_hash, content_json
         FROM progression_authoritative_run_catalogs
         WHERE content_version = ?`,
        [catalog.contentVersion]
    );
    if (existingByVersion) {
        if (String(existingByVersion.protocol_version || '') !== PROTOCOL_VERSION
            || String(existingByVersion.content_hash || '').toLowerCase() !== catalog.contentHash
            || String(existingByVersion.content_json || '') !== catalog.contentJson) {
            throw makeError(
                CATALOG_DRIFT_CODE,
                `authoritative runs catalog drift detected for ${catalog.contentVersion}`
            );
        }
        return;
    }
    const existingByHash = await dbGet(
        db,
        `SELECT content_version
         FROM progression_authoritative_run_catalogs
         WHERE content_hash = ?`,
        [catalog.contentHash]
    );
    if (existingByHash && String(existingByHash.content_version || '') !== catalog.contentVersion) {
        throw makeError(
            CATALOG_DRIFT_CODE,
            `authoritative runs catalog hash reused by ${existingByHash.content_version}`
        );
    }
    await dbRun(
        db,
        `INSERT INTO progression_authoritative_run_catalogs (
            content_version,
            protocol_version,
            content_hash,
            content_json,
            created_at
        ) VALUES (?, ?, ?, ?, ?)`,
        [
            catalog.contentVersion,
            PROTOCOL_VERSION,
            catalog.contentHash,
            catalog.contentJson,
            now
        ]
    );
}

async function reconcileOpsCounters(db) {
    const rows = await dbAll(
        db,
        `SELECT event_type,
                COUNT(*) AS event_count,
                COALESCE(MAX(created_at), 0) AS updated_at
         FROM progression_authoritative_run_ops_events
         GROUP BY event_type`
    );
    for (const row of rows) {
        await dbRun(
            db,
            `INSERT INTO progression_authoritative_run_ops_counters (
                event_type,
                event_count,
                total_duration_ms,
                updated_at
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(event_type) DO UPDATE SET
                event_count = MAX(progression_authoritative_run_ops_counters.event_count, excluded.event_count),
                updated_at = MAX(progression_authoritative_run_ops_counters.updated_at, excluded.updated_at)`,
            [
                String(row.event_type || ''),
                Number(row.event_count) || 0,
                0,
                Number(row.updated_at) || 0
            ]
        );
    }
}

async function bootstrapAuthoritativeRunsSchema(db) {
    const now = Date.now();
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS progression_authoritative_run_catalogs (
                content_version TEXT PRIMARY KEY,
                protocol_version TEXT NOT NULL,
                content_hash TEXT NOT NULL UNIQUE,
                content_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS progression_authoritative_runs (
                run_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                client_run_id TEXT NOT NULL,
                activity_mode TEXT NOT NULL,
                scenario_id TEXT NOT NULL DEFAULT '',
                protocol_version TEXT NOT NULL DEFAULT '${PROTOCOL_VERSION}',
                content_version TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                state_version INTEGER NOT NULL DEFAULT 0,
                action_count INTEGER NOT NULL DEFAULT 0,
                state_json TEXT NOT NULL DEFAULT '{}',
                state_hash TEXT NOT NULL DEFAULT '',
                chain_head TEXT NOT NULL DEFAULT '',
                started_at INTEGER NOT NULL DEFAULT 0,
                expires_at INTEGER NOT NULL DEFAULT 0,
                completed_at INTEGER NOT NULL DEFAULT 0,
                settled_at INTEGER NOT NULL DEFAULT 0,
                abandoned_at INTEGER NOT NULL DEFAULT 0,
                last_action_at INTEGER NOT NULL DEFAULT 0,
                recovery_count INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT 0,
                UNIQUE(user_id, client_run_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(content_version) REFERENCES progression_authoritative_run_catalogs(content_version)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS progression_authoritative_run_actions (
                action_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                expected_version INTEGER NOT NULL,
                command_type TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                payload_hash TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                action_hash TEXT NOT NULL,
                result_state_hash TEXT NOT NULL,
                result_phase TEXT NOT NULL DEFAULT '',
                public_receipt_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                UNIQUE(run_id, sequence),
                FOREIGN KEY(run_id) REFERENCES progression_authoritative_runs(run_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS progression_authoritative_run_snapshots (
                snapshot_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                state_json TEXT NOT NULL,
                state_hash TEXT NOT NULL,
                chain_head TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(run_id, sequence),
                FOREIGN KEY(run_id) REFERENCES progression_authoritative_runs(run_id)
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS progression_authoritative_run_receipts (
                receipt_id TEXT PRIMARY KEY,
                run_id TEXT NOT NULL UNIQUE,
                user_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                activity_mode TEXT NOT NULL,
                event_id TEXT NOT NULL DEFAULT '',
                request_hash TEXT NOT NULL DEFAULT '',
                request_body_json TEXT NOT NULL DEFAULT '{}',
                receipt_json TEXT NOT NULL DEFAULT '{}',
                state_hash TEXT NOT NULL DEFAULT '',
                chain_head TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                UNIQUE(user_id, mutation_id),
                FOREIGN KEY(run_id) REFERENCES progression_authoritative_runs(run_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await addColumnIfMissing(
            db,
            'progression_authoritative_run_receipts',
            'request_hash',
            "TEXT NOT NULL DEFAULT ''"
        );
        await addColumnIfMissing(
            db,
            'progression_authoritative_run_receipts',
            'request_body_json',
            "TEXT NOT NULL DEFAULT '{}'"
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS progression_authoritative_run_ops_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                run_id TEXT,
                user_ref TEXT NOT NULL DEFAULT '',
                detail_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            )`
        );
        await dbRun(
            db,
            `CREATE TABLE IF NOT EXISTS progression_authoritative_run_ops_counters (
                event_type TEXT PRIMARY KEY,
                event_count INTEGER NOT NULL DEFAULT 0,
                total_duration_ms INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                CHECK(event_count >= 0),
                CHECK(total_duration_ms >= 0)
            )`
        );

        await dbRun(
            db,
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_progression_authoritative_runs_active_mode
             ON progression_authoritative_runs(user_id, activity_mode)
             WHERE status = 'active'`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_runs_user_updated
             ON progression_authoritative_runs(user_id, updated_at DESC, run_id)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_runs_status_updated
             ON progression_authoritative_runs(status, updated_at DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_runs_expires
             ON progression_authoritative_runs(status, expires_at)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_actions_run_sequence
             ON progression_authoritative_run_actions(run_id, sequence DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_actions_user_created
             ON progression_authoritative_run_actions(user_id, created_at DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_snapshots_run_sequence
             ON progression_authoritative_run_snapshots(run_id, sequence DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_receipts_user_created
             ON progression_authoritative_run_receipts(user_id, created_at DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_receipts_mode_created
             ON progression_authoritative_run_receipts(activity_mode, created_at DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_ops_events_type_created
             ON progression_authoritative_run_ops_events(event_type, created_at DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_ops_events_run_created
             ON progression_authoritative_run_ops_events(run_id, created_at DESC)`
        );
        await dbRun(
            db,
            `CREATE INDEX IF NOT EXISTS idx_progression_authoritative_ops_events_user_created
             ON progression_authoritative_run_ops_events(user_ref, created_at DESC)`
        );

        await ensureCatalogRow(db, now);
        await reconcileOpsCounters(db);
        await dbRun(db, 'COMMIT');
    } catch (error) {
        try {
            await dbRun(db, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[AuthoritativeRuns] Bootstrap rollback failed:', rollbackError);
        }
        throw error;
    }
}

module.exports = {
    bootstrapAuthoritativeRunsSchema
};
