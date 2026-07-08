const crypto = require('crypto');

const SCHEMA_VERSION = 1;
const CURRENT_MIGRATION_ID = '0001_startup_schema';
const CURRENT_MIGRATION_DESCRIPTION = 'Initial additive startup schema';
const CURRENT_MIGRATION_CHECKSUM = crypto
    .createHash('sha256')
    .update([
        'the-defier-backend',
        CURRENT_MIGRATION_ID,
        String(SCHEMA_VERSION),
        'users',
        'game_saves',
        'game_ghosts',
        'pvp_ranks',
        'pvp_live_matches',
        'pvp_live_state_signals',
        'pvp_live_ops_events',
        'pvp_live_match_settlements',
        'pvp_live_replay_shares'
    ].join('|'))
    .digest('hex');

const createSchemaMigrationsTableSql = () => `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    applied_at INTEGER NOT NULL
)`;

const recordCurrentSchemaMigration = (db, callback) => {
    const appliedAt = Date.now();
    db.run(
        `INSERT INTO schema_migrations (id, version, checksum, description, applied_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            version = excluded.version,
            checksum = excluded.checksum,
            description = excluded.description`,
        [
            CURRENT_MIGRATION_ID,
            SCHEMA_VERSION,
            CURRENT_MIGRATION_CHECKSUM,
            CURRENT_MIGRATION_DESCRIPTION,
            appliedAt
        ],
        callback
    );
};

const queryAppliedMigrations = (db) => new Promise((resolve, reject) => {
    db.all(
        `SELECT id, version, checksum, description, applied_at
         FROM schema_migrations
         ORDER BY version ASC, id ASC`,
        (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        }
    );
});

const getSchemaStatus = async (db) => {
    const rows = await queryAppliedMigrations(db);
    return {
        version: SCHEMA_VERSION,
        currentMigrationId: CURRENT_MIGRATION_ID,
        appliedMigrations: rows.map(row => ({
            id: row.id,
            version: Number(row.version) || 0,
            checksum: row.checksum,
            description: row.description || '',
            appliedAt: Number(row.applied_at) || 0
        }))
    };
};

module.exports = {
    SCHEMA_VERSION,
    CURRENT_MIGRATION_ID,
    CURRENT_MIGRATION_CHECKSUM,
    createSchemaMigrationsTableSql,
    getSchemaStatus,
    recordCurrentSchemaMigration
};
