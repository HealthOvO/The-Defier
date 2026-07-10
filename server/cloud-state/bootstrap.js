const {
    CLOUD_STATE_ENTITY_GLOBAL,
    CLOUD_STATE_ENTITY_SLOT,
    CLOUD_STATE_OPERATION_LEGACY_IMPORT,
    deterministicId,
    digest,
    makeGlobalScope,
    makeSlotScope,
    normalizeLegacyStoredGlobal,
    normalizeLegacyStoredSlot
} = require('./common');

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

async function createCloudStateTables(db) {
    await dbRun(db, `CREATE TABLE IF NOT EXISTS cloud_state_revisions (
        revision_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        slot_index INTEGER,
        revision_number INTEGER NOT NULL,
        parent_revision_id TEXT,
        source_revision_id TEXT,
        operation TEXT NOT NULL,
        mutation_id TEXT,
        request_hash TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        data_json TEXT NOT NULL,
        data_size_bytes INTEGER NOT NULL DEFAULT 0,
        client_updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, entity_key, revision_number)
    )`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_revisions_entity_created
        ON cloud_state_revisions(user_id, entity_key, revision_number DESC)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_revisions_entity_created_at
        ON cloud_state_revisions(entity_type, created_at DESC)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_revisions_source_revision
        ON cloud_state_revisions(source_revision_id)`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS cloud_state_heads (
        user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        slot_index INTEGER,
        head_revision_id TEXT NOT NULL,
        head_revision_number INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        head_updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, entity_key)
    )`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_heads_type_updated
        ON cloud_state_heads(entity_type, head_updated_at DESC)`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS cloud_state_mutations (
        user_id TEXT NOT NULL,
        mutation_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(user_id, mutation_id)
    )`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_mutations_entity_created
        ON cloud_state_mutations(entity_type, created_at DESC)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_mutations_created
        ON cloud_state_mutations(created_at)`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS cloud_state_ops_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_key TEXT NOT NULL,
        byte_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_ops_events_type_created
        ON cloud_state_ops_events(event_type, created_at DESC)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cloud_state_ops_events_created
        ON cloud_state_ops_events(created_at)`);
    await dbRun(db, `CREATE TABLE IF NOT EXISTS cloud_state_ops_counters (
        event_type TEXT PRIMARY KEY,
        event_count INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
    )`);
    const existingCounters = await dbAll(
        db,
        `SELECT event_type, COUNT(*) AS event_count, COALESCE(SUM(byte_count), 0) AS total_bytes,
                COALESCE(MAX(created_at), 0) AS updated_at
         FROM cloud_state_ops_events
         GROUP BY event_type`
    );
    for (const counter of existingCounters) {
        await dbRun(
            db,
            `INSERT OR IGNORE INTO cloud_state_ops_counters (event_type, event_count, total_bytes, updated_at)
             VALUES (?, ?, ?, ?)`,
            [counter.event_type, Number(counter.event_count) || 0, Number(counter.total_bytes) || 0, Number(counter.updated_at) || Date.now()]
        );
    }
}

async function headExists(db, userId, scope) {
    const row = await dbGet(
        db,
        `SELECT head_revision_id
         FROM cloud_state_heads
         WHERE user_id = ? AND entity_key = ?`,
        [userId, scope.entityKey]
    );
    return !!(row && row.head_revision_id);
}

async function insertLegacyImport(db, userId, scope, normalized, createdAt) {
    if (await headExists(db, userId, scope)) {
        return;
    }
    const revisionId = deterministicId('cloudrev-legacy', [
        userId,
        scope.entityKey,
        normalized.contentHash,
        String(normalized.clientUpdatedAt)
    ]);
    const requestHash = digest([
        'legacy_import',
        userId,
        scope.entityKey,
        normalized.contentHash,
        String(normalized.clientUpdatedAt)
    ].join('|'));
    const insertedRevision = await dbRun(
        db,
        `INSERT OR IGNORE INTO cloud_state_revisions (
            revision_id, user_id, entity_type, entity_key, slot_index, revision_number,
            parent_revision_id, source_revision_id, operation, mutation_id, request_hash,
            content_hash, data_json, data_size_bytes, client_updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, 1, NULL, NULL, ?, NULL, ?, ?, ?, ?, ?, ?)`,
        [
            revisionId,
            userId,
            scope.entityType,
            scope.entityKey,
            scope.slotIndex,
            CLOUD_STATE_OPERATION_LEGACY_IMPORT,
            requestHash,
            normalized.contentHash,
            normalized.dataJson,
            normalized.dataSizeBytes,
            normalized.clientUpdatedAt,
            createdAt
        ]
    );
    await dbRun(
        db,
        `INSERT OR IGNORE INTO cloud_state_heads (
            user_id, entity_type, entity_key, slot_index, head_revision_id,
            head_revision_number, content_hash, head_updated_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
            userId,
            scope.entityType,
            scope.entityKey,
            scope.slotIndex,
            revisionId,
            normalized.contentHash,
            createdAt,
            createdAt,
            createdAt
        ]
    );
    if ((insertedRevision && insertedRevision.changes) > 0) {
        await dbRun(
            db,
            `INSERT INTO cloud_state_ops_events (event_type, entity_type, entity_key, byte_count, created_at)
             VALUES ('legacy_import', ?, ?, ?, ?)`,
            [scope.entityType, scope.entityKey, normalized.dataSizeBytes, createdAt]
        );
        await dbRun(
            db,
            `INSERT INTO cloud_state_ops_counters (event_type, event_count, total_bytes, updated_at)
             VALUES ('legacy_import', 1, ?, ?)
             ON CONFLICT(event_type) DO UPDATE SET
                event_count = cloud_state_ops_counters.event_count + 1,
                total_bytes = cloud_state_ops_counters.total_bytes + excluded.total_bytes,
                updated_at = excluded.updated_at`,
            [normalized.dataSizeBytes, createdAt]
        );
    }
}

async function backfillLegacyGameSaves(db) {
    const rows = await dbAll(
        db,
        `SELECT user_id, slot_index, save_data, save_time
         FROM game_saves
         ORDER BY user_id ASC, slot_index ASC`
    );
    for (const row of rows) {
        const scope = makeSlotScope(row.slot_index);
        const normalized = normalizeLegacyStoredSlot(row.save_data, row.save_time);
        const createdAt = Math.max(Date.now(), normalized.clientUpdatedAt || 0);
        await insertLegacyImport(db, row.user_id, scope, normalized, createdAt);
    }
}

async function backfillLegacyGlobalData(db) {
    const rows = await dbAll(
        db,
        `SELECT id AS user_id, global_data, global_updated_at
         FROM users
         WHERE global_data IS NOT NULL AND TRIM(COALESCE(global_data, '')) <> ''`
    );
    for (const row of rows) {
        const scope = makeGlobalScope();
        const normalized = normalizeLegacyStoredGlobal(row.global_data, row.global_updated_at);
        const createdAt = Math.max(Date.now(), normalized.clientUpdatedAt || 0);
        await insertLegacyImport(db, row.user_id, scope, normalized, createdAt);
    }
}

async function bootstrapCloudStateSchema(db) {
    await dbRun(db, 'BEGIN IMMEDIATE');
    try {
        await createCloudStateTables(db);
        await backfillLegacyGameSaves(db);
        await backfillLegacyGlobalData(db);
        await dbRun(db, 'COMMIT');
    } catch (error) {
        try {
            await dbRun(db, 'ROLLBACK');
        } catch (rollbackError) {
            console.error('[CloudState] Bootstrap rollback failed:', rollbackError);
        }
        throw error;
    }
}

module.exports = {
    bootstrapCloudStateSchema
};
