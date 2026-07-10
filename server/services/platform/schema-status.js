const crypto = require('crypto');

const makeMigration = ({ id, version, description, resources }) => ({
    id,
    version,
    description,
    checksum: crypto
        .createHash('sha256')
        .update(['the-defier-backend', id, String(version), ...resources].join('|'))
        .digest('hex')
});

const SCHEMA_MIGRATIONS = [
    makeMigration({
        id: '0001_startup_schema',
        version: 1,
        description: 'Initial additive startup schema',
        resources: [
            'users',
            'game_saves',
            'game_ghosts',
            'pvp_ranks',
            'pvp_live_matches',
            'pvp_live_state_signals',
            'pvp_live_ops_events',
            'pvp_live_dispute_reports',
            'pvp_live_match_settlements',
            'pvp_live_replay_shares',
            'pvp_season_reward_claims',
            'pvp_season_honor_archives'
        ]
    }),
    makeMigration({
        id: '0002_progression_platform',
        version: 2,
        description: 'Cross-mode account progression and economy ledger',
        resources: [
            'progression_events',
            'progression_objective_progress',
            'progression_reward_claims',
            'progression_economy_balances',
            'progression_economy_ledger'
        ]
    }),
    makeMigration({
        id: '0003_verified_runs',
        version: 3,
        description: 'Account-bound verified run tickets, checkpoints, and receipts',
        resources: [
            'progression_verified_runs',
            'progression_verified_run_checkpoints',
            'progression_verified_run_receipts'
        ]
    }),
    makeMigration({
        id: '0004_cloud_state_v2',
        version: 4,
        description: 'Cloud state revisions, heads, restore history, and ops overview',
        resources: [
            'cloud_state_revisions',
            'cloud_state_heads',
            'cloud_state_mutations',
            'cloud_state_ops_events'
        ]
    })
];
const CURRENT_MIGRATION = SCHEMA_MIGRATIONS[SCHEMA_MIGRATIONS.length - 1];
const SCHEMA_VERSION = CURRENT_MIGRATION.version;
const CURRENT_MIGRATION_ID = CURRENT_MIGRATION.id;
const CURRENT_MIGRATION_DESCRIPTION = CURRENT_MIGRATION.description;
const CURRENT_MIGRATION_CHECKSUM = CURRENT_MIGRATION.checksum;

const createSchemaMigrationsTableSql = () => `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    applied_at INTEGER NOT NULL
)`;

const recordCurrentSchemaMigration = (db, callback) => {
    let index = 0;
    const recordNext = (previousError) => {
        if (previousError || index >= SCHEMA_MIGRATIONS.length) {
            callback(previousError || null);
            return;
        }
        const migration = SCHEMA_MIGRATIONS[index++];
        db.run(
            `INSERT INTO schema_migrations (id, version, checksum, description, applied_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                version = excluded.version,
                checksum = excluded.checksum,
                description = excluded.description`,
            [migration.id, migration.version, migration.checksum, migration.description, Date.now()],
            recordNext
        );
    };
    recordNext();
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
    SCHEMA_MIGRATIONS,
    createSchemaMigrationsTableSql,
    getSchemaStatus,
    recordCurrentSchemaMigration
};
