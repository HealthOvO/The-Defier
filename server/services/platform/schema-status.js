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
            'cloud_state_ops_events',
            'cloud_state_ops_counters'
        ]
    }),
    makeMigration({
        id: '0005_season_ops_economy',
        version: 5,
        description: 'Versioned seasons, authoritative economy, ladder snapshots, and settlement recovery',
        resources: [
            'season_ops_seasons',
            'season_ops_offers',
            'season_ops_mutations',
            'season_ops_purchases',
            'season_ops_compensations',
            'season_ops_entitlements',
            'pvp_season_ladders',
            'pvp_season_ladder_results',
            'season_ops_leaderboard_snapshots',
            'season_ops_leaderboard_entries',
            'season_ops_settlements',
            'season_ops_ops_events',
            'season_ops_ops_counters'
        ]
    }),
    makeMigration({
        id: '0006_authoritative_runs_v2',
        version: 6,
        description: 'Server-authoritative deterministic run catalog, journals, receipts, and ops telemetry',
        resources: [
            'progression_authoritative_run_catalogs',
            'progression_authoritative_runs',
            'progression_authoritative_run_actions',
            'progression_authoritative_run_snapshots',
            'progression_authoritative_run_receipts',
            'progression_authoritative_run_ops_events',
            'progression_authoritative_run_ops_counters'
        ]
    }),
    makeMigration({
        id: '0007_authoritative_challenge_ladder',
        version: 7,
        description: 'Authoritative rotating challenge attempts, results, leaderboard, rewards, and ops telemetry',
        resources: [
            'challenge_ladder_rotations',
            'challenge_ladder_attempts',
            'challenge_ladder_results',
            'challenge_ladder_entries',
            'challenge_ladder_reward_claims',
            'challenge_ladder_mutations',
            'challenge_ladder_ops_events',
            'challenge_ladder_ops_counters'
        ]
    }),
    makeMigration({
        id: '0008_authoritative_world_rift',
        version: 8,
        description: 'Authoritative asynchronous world-rift rotations, shared state, contributions, rewards, and ops telemetry',
        resources: [
            'world_rift_rotations',
            'world_rift_states',
            'world_rift_attempts',
            'world_rift_contributions',
            'world_rift_entries',
            'world_rift_reward_claims',
            'world_rift_mutations',
            'world_rift_ops_events',
            'world_rift_ops_counters'
        ]
    }),
    makeMigration({
        id: '0009_account_social_coop',
        version: 9,
        description: 'Revocable account sessions, social graph, presence, friend invites, and world-rift squads',
        resources: [
            'users.username_normalized',
            'users.auth_version',
            'auth_sessions',
            'auth_login_limits',
            'auth_security_mutations',
            'auth_security_events',
            'social_profiles',
            'social_friend_requests',
            'social_friendships',
            'social_relationship_controls',
            'social_presence',
            'social_mutations',
            'social_ops_events',
            'world_rift_squads',
            'world_rift_squad_members',
            'world_rift_squad_invites',
            'world_rift_squad_contributions',
            'world_rift_squad_entries',
            'world_rift_squad_reward_claims'
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
