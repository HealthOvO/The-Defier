const crypto = require('node:crypto');

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(error) {
            if (error) reject(error);
            else resolve(this);
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

function normalizeUsername(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase();
}

function makeLegacyNormalizedKey(baseNormalized, row) {
    const digest = crypto
        .createHash('sha256')
        .update(`${String(baseNormalized || '')}\n${String(row && row.username || '')}\n${String(row && row.id || '')}`, 'utf8')
        .digest('hex');
    return `legacy:${digest.slice(0, 24)}`;
}

async function addColumnIfMissing(connection, sql) {
    try {
        await dbRun(connection, sql);
    } catch (error) {
        if (!/duplicate column/i.test(String(error && error.message || ''))) {
            throw error;
        }
    }
}

async function backfillNormalizedUsernames(connection) {
    const rows = await dbAll(
        connection,
        `SELECT id, username, username_normalized, auth_version, password_changed_at, disabled_at
         FROM users
         ORDER BY created_at ASC, id ASC`
    );
    const groups = new Map();
    for (const row of rows) {
        const baseNormalized = normalizeUsername(row && row.username);
        const groupKey = baseNormalized || `legacy-empty:${String(row && row.id || '')}`;
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey).push({ ...row, baseNormalized });
    }

    for (const groupRows of groups.values()) {
        const hasCollision = groupRows.length > 1;
        for (const row of groupRows) {
            const desiredNormalized = hasCollision
                ? makeLegacyNormalizedKey(row.baseNormalized, row)
                : (row.baseNormalized || makeLegacyNormalizedKey('', row));
            const authVersion = Math.max(1, Math.floor(Number(row.auth_version) || 1));
            const passwordChangedAt = Math.max(0, Math.floor(Number(row.password_changed_at) || 0));
            const disabledAt = Math.max(0, Math.floor(Number(row.disabled_at) || 0));
            if (String(row.username_normalized || '') === desiredNormalized
                && authVersion === Number(row.auth_version || 0)
                && passwordChangedAt === Number(row.password_changed_at || 0)
                && disabledAt === Number(row.disabled_at || 0)) {
                continue;
            }
            await dbRun(
                connection,
                `UPDATE users
                 SET username_normalized = ?,
                     auth_version = ?,
                     password_changed_at = ?,
                     disabled_at = ?
                 WHERE id = ?`,
                [desiredNormalized, authVersion, passwordChangedAt, disabledAt, row.id]
            );
        }
    }
}

async function bootstrapAccountSocialSchema(connection, now = Date.now()) {
    await dbRun(connection, 'BEGIN IMMEDIATE');
    try {
        await addColumnIfMissing(connection, `ALTER TABLE users ADD COLUMN username_normalized TEXT`);
        await addColumnIfMissing(connection, `ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1`);
        await addColumnIfMissing(connection, `ALTER TABLE users ADD COLUMN password_changed_at INTEGER NOT NULL DEFAULT 0`);
        await addColumnIfMissing(connection, `ALTER TABLE users ADD COLUMN disabled_at INTEGER NOT NULL DEFAULT 0`);

        await backfillNormalizedUsernames(connection);

        await dbRun(
            connection,
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_normalized_unique
             ON users(username_normalized)`
        );

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS auth_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                auth_version INTEGER NOT NULL DEFAULT 1,
                device_id_hash TEXT NOT NULL,
                device_name TEXT NOT NULL DEFAULT '',
                ip_hash TEXT NOT NULL DEFAULT '',
                user_agent_hash TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL DEFAULT 0,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER NOT NULL DEFAULT 0,
                revoke_reason TEXT NOT NULL DEFAULT '',
                replaced_by_session_id TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_created ON auth_sessions(user_id, created_at DESC)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(user_id, revoked_at, expires_at)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS auth_login_limits (
                bucket_key TEXT PRIMARY KEY,
                scope TEXT NOT NULL,
                failures INTEGER NOT NULL DEFAULT 0,
                window_started_at INTEGER NOT NULL,
                last_failed_at INTEGER NOT NULL,
                blocked_until INTEGER NOT NULL DEFAULT 0,
                expires_at INTEGER NOT NULL
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_auth_login_limits_expires ON auth_login_limits(expires_at)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_auth_login_limits_scope_blocked ON auth_login_limits(scope, blocked_until)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS auth_security_mutations (
                user_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                request_hash TEXT NOT NULL,
                response_json TEXT NOT NULL DEFAULT '{}',
                status_code INTEGER NOT NULL DEFAULT 200,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, mutation_id, operation),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_auth_security_mutations_created ON auth_security_mutations(created_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS auth_security_events (
                event_id TEXT PRIMARY KEY,
                user_id TEXT,
                session_id TEXT NOT NULL DEFAULT '',
                event_type TEXT NOT NULL,
                event_payload_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_auth_security_events_user_created ON auth_security_events(user_id, created_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_profiles (
                user_id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL UNIQUE,
                discovery_policy TEXT NOT NULL DEFAULT 'exact_only',
                friend_request_policy TEXT NOT NULL DEFAULT 'exact_only',
                presence_visibility TEXT NOT NULL DEFAULT 'friends',
                pvp_invite_policy TEXT NOT NULL DEFAULT 'friends',
                squad_invite_policy TEXT NOT NULL DEFAULT 'friends',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE UNIQUE INDEX IF NOT EXISTS idx_social_profiles_profile_id ON social_profiles(profile_id)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_friend_requests (
                request_id TEXT PRIMARY KEY,
                sender_user_id TEXT NOT NULL,
                receiver_user_id TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                FOREIGN KEY(sender_user_id) REFERENCES users(id),
                FOREIGN KEY(receiver_user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_social_friend_requests_sender_status ON social_friend_requests(sender_user_id, status, created_at DESC)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_social_friend_requests_receiver_status ON social_friend_requests(receiver_user_id, status, created_at DESC)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_social_friend_requests_pair_status ON social_friend_requests(sender_user_id, receiver_user_id, status, updated_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_friendships (
                friendship_id TEXT PRIMARY KEY,
                user_low_id TEXT NOT NULL,
                user_high_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'accepted',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_low_id, user_high_id),
                FOREIGN KEY(user_low_id) REFERENCES users(id),
                FOREIGN KEY(user_high_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE UNIQUE INDEX IF NOT EXISTS idx_social_friendships_pair ON social_friendships(user_low_id, user_high_id)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_relationship_controls (
                owner_user_id TEXT NOT NULL,
                target_user_id TEXT NOT NULL,
                is_blocked INTEGER NOT NULL DEFAULT 0,
                is_muted INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(owner_user_id, target_user_id),
                FOREIGN KEY(owner_user_id) REFERENCES users(id),
                FOREIGN KEY(target_user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_social_relationship_controls_target ON social_relationship_controls(target_user_id, owner_user_id)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_presence (
                user_id TEXT PRIMARY KEY,
                activity TEXT NOT NULL DEFAULT 'menu',
                last_heartbeat_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_social_presence_updated ON social_presence(updated_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_mutations (
                actor_user_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                mutation_type TEXT NOT NULL DEFAULT '',
                request_fingerprint TEXT NOT NULL,
                response_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(actor_user_id, mutation_id),
                FOREIGN KEY(actor_user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_social_mutations_created ON social_mutations(created_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_ops_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                actor_user_id TEXT NOT NULL DEFAULT '',
                target_user_id TEXT NOT NULL DEFAULT '',
                entity_id TEXT NOT NULL DEFAULT '',
                payload_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_social_ops_events_created ON social_ops_events(created_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS social_ops_counters (
                event_type TEXT NOT NULL,
                target_scope TEXT NOT NULL DEFAULT '',
                result_code TEXT NOT NULL DEFAULT '',
                event_count INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(event_type, target_scope, result_code)
            )`
        );

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS world_rift_squads (
                squad_id TEXT PRIMARY KEY,
                rotation_id TEXT NOT NULL,
                leader_user_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id),
                FOREIGN KEY(leader_user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squads_rotation_status ON world_rift_squads(rotation_id, status, updated_at DESC)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squads_leader ON world_rift_squads(leader_user_id, rotation_id, status)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS world_rift_squad_members (
                squad_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                rotation_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                role TEXT NOT NULL DEFAULT 'member',
                joined_at INTEGER NOT NULL,
                left_at INTEGER NOT NULL DEFAULT 0,
                locked_at INTEGER NOT NULL DEFAULT 0,
                display_name_snapshot TEXT NOT NULL DEFAULT '',
                profile_id_snapshot TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(squad_id, user_id),
                FOREIGN KEY(squad_id) REFERENCES world_rift_squads(squad_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_members_rotation_user ON world_rift_squad_members(rotation_id, user_id, status)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_members_squad_status ON world_rift_squad_members(squad_id, status, role, joined_at)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS world_rift_squad_invites (
                invite_id TEXT PRIMARY KEY,
                squad_id TEXT NOT NULL,
                rotation_id TEXT NOT NULL,
                inviter_user_id TEXT NOT NULL,
                invitee_user_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                expires_at INTEGER NOT NULL,
                responded_at INTEGER NOT NULL DEFAULT 0,
                inviter_name_snapshot TEXT NOT NULL DEFAULT '',
                inviter_profile_id_snapshot TEXT NOT NULL DEFAULT '',
                invitee_name_snapshot TEXT NOT NULL DEFAULT '',
                invitee_profile_id_snapshot TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(squad_id) REFERENCES world_rift_squads(squad_id),
                FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id),
                FOREIGN KEY(inviter_user_id) REFERENCES users(id),
                FOREIGN KEY(invitee_user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_invites_invitee ON world_rift_squad_invites(invitee_user_id, rotation_id, status, created_at DESC)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_invites_squad ON world_rift_squad_invites(squad_id, status, created_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS world_rift_squad_contributions (
                contribution_id TEXT PRIMARY KEY,
                squad_id TEXT NOT NULL,
                rotation_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                contribution INTEGER NOT NULL DEFAULT 0,
                remaining_hp INTEGER NOT NULL DEFAULT 0,
                turns INTEGER NOT NULL DEFAULT 0,
                linked_at INTEGER NOT NULL,
                display_name_snapshot TEXT NOT NULL DEFAULT '',
                profile_id_snapshot TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(squad_id) REFERENCES world_rift_squads(squad_id),
                FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_contributions_squad ON world_rift_squad_contributions(squad_id, contribution DESC, remaining_hp DESC, turns ASC)`);
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_contributions_rotation_user ON world_rift_squad_contributions(rotation_id, user_id, linked_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS world_rift_squad_entries (
                rotation_id TEXT NOT NULL,
                squad_id TEXT NOT NULL,
                cooperative_score INTEGER NOT NULL DEFAULT 0,
                contributing_members INTEGER NOT NULL DEFAULT 0,
                best_remaining_hp_sum INTEGER NOT NULL DEFAULT 0,
                best_turns_sum INTEGER NOT NULL DEFAULT 0,
                member_count INTEGER NOT NULL DEFAULT 0,
                locked_member_count INTEGER NOT NULL DEFAULT 0,
                member_best_json TEXT NOT NULL DEFAULT '[]',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(rotation_id, squad_id),
                FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id),
                FOREIGN KEY(squad_id) REFERENCES world_rift_squads(squad_id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_entries_leaderboard ON world_rift_squad_entries(rotation_id, cooperative_score DESC, contributing_members DESC, best_remaining_hp_sum DESC, best_turns_sum ASC, squad_id ASC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS world_rift_squad_reward_claims (
                claim_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                rotation_id TEXT NOT NULL,
                squad_id TEXT NOT NULL,
                milestone_id TEXT NOT NULL,
                currency TEXT NOT NULL,
                amount INTEGER NOT NULL DEFAULT 0,
                reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
                ledger_entry_id TEXT NOT NULL DEFAULT '',
                claim_payload_json TEXT NOT NULL DEFAULT '{}',
                claimed_at INTEGER NOT NULL,
                UNIQUE(user_id, rotation_id, squad_id, milestone_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(rotation_id) REFERENCES world_rift_rotations(rotation_id),
                FOREIGN KEY(squad_id) REFERENCES world_rift_squads(squad_id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_reward_claims_user_rotation ON world_rift_squad_reward_claims(user_id, rotation_id, claimed_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS world_rift_squad_mutations (
                user_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                rotation_id TEXT NOT NULL DEFAULT '',
                request_type TEXT NOT NULL DEFAULT '',
                request_hash TEXT NOT NULL,
                request_body_json TEXT NOT NULL DEFAULT '{}',
                receipt_json TEXT NOT NULL DEFAULT '{}',
                squad_id TEXT NOT NULL DEFAULT '',
                invite_id TEXT NOT NULL DEFAULT '',
                claim_id TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, mutation_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`
        );
        await dbRun(connection, `CREATE INDEX IF NOT EXISTS idx_world_rift_squad_mutations_created ON world_rift_squad_mutations(created_at DESC)`);

        await dbRun(
            connection,
            `CREATE TABLE IF NOT EXISTS auth_security_counters (
                counter_key TEXT PRIMARY KEY,
                counter_value INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )`
        );

        await dbRun(
            connection,
            `INSERT INTO auth_security_counters (counter_key, counter_value, updated_at)
             VALUES ('account_social_bootstrap', 1, ?)
             ON CONFLICT(counter_key) DO UPDATE SET updated_at = excluded.updated_at`,
            [Math.max(0, Math.floor(Number(now) || Date.now()))]
        );

        await dbRun(connection, 'COMMIT');
    } catch (error) {
        try {
            await dbRun(connection, 'ROLLBACK');
        } catch (rollbackError) {}
        throw error;
    }
}

module.exports = {
    bootstrapAccountSocialSchema
};
