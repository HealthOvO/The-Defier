const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const {
    createSchemaMigrationsTableSql,
    getSchemaStatus,
    recordCurrentSchemaMigration
} = require('../services/platform/schema-status');
const { bootstrapCloudStateSchema } = require('../cloud-state/bootstrap');
const { bootstrapSeasonOpsSchema } = require('../season-ops/bootstrap');
const { bootstrapAuthoritativeRunsSchema } = require('../progression/authoritative-runs/bootstrap');
const { bootstrapChallengeLadderSchema } = require('../challenge-ladder/bootstrap');
const { bootstrapWorldRiftSchema } = require('../world-rift/bootstrap');
const { bootstrapAccountSocialSchema } = require('../account-social/bootstrap');
const { bootstrapRelayExpeditionSchema } = require('../relay-expedition/bootstrap');
const { bootstrapFateChronicleSchema } = require('../fate-chronicle/bootstrap');
const { bootstrapWeeklyArchiveSchema } = require('../weekly-archive/bootstrap');

const dbPath = process.env.DEFIER_DB_PATH
    ? path.resolve(process.env.DEFIER_DB_PATH)
    : path.resolve(__dirname, 'database.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);
db.configure('busyTimeout', Number(process.env.DEFIER_SQLITE_BUSY_TIMEOUT_MS || 5000));

const initDb = () => {
    return new Promise((resolve, reject) => {
        let settled = false;
        const fail = (err) => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        };
        const done = () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        };
        db.serialize(() => {
            db.run('PRAGMA journal_mode = WAL', (err) => {
                // A second process may open a brand-new database while the first
                // process is switching it to WAL. The winner persists WAL for the
                // database; the loser can safely continue after the transient lock.
                if (err && !/SQLITE_BUSY|database is locked/i.test(String(err.message || err))) {
                    fail(err);
                }
            });
            db.run(createSchemaMigrationsTableSql(), (err) => {
                if (err) fail(err);
            });

            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                global_data TEXT,
                created_at INTEGER NOT NULL
            )`);
            db.run(`ALTER TABLE users ADD COLUMN global_updated_at INTEGER DEFAULT 0`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });

            // Game Saves table
            db.run(`CREATE TABLE IF NOT EXISTS game_saves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                slot_index INTEGER NOT NULL,
                save_data TEXT NOT NULL,
                save_time INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id),
                UNIQUE(user_id, slot_index)
            )`);

            // Game Ghosts table
            db.run(`CREATE TABLE IF NOT EXISTS game_ghosts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                realm INTEGER NOT NULL,
                ghost_data TEXT NOT NULL,
                upload_time INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);

            // Index for fast random ghost fetching
            db.run(`CREATE INDEX IF NOT EXISTS idx_game_ghosts_realm ON game_ghosts(realm)`);
            db.run(`DELETE FROM game_ghosts
                WHERE id NOT IN (
                    SELECT keep_id FROM (
                        SELECT g.id AS keep_id
                        FROM game_ghosts g
                        WHERE g.id = (
                            SELECT latest.id
                            FROM game_ghosts latest
                            WHERE latest.user_id = g.user_id
                            ORDER BY latest.upload_time DESC, latest.id DESC
                            LIMIT 1
                        )
                    )
                )`);
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_game_ghosts_user_id ON game_ghosts(user_id)`, (err) => {
                if (err) fail(err);
            });

            // PVP rank / matchmaking state. Schema changes follow the repo's
            // startup migration style: additive tables and indexes only.
            db.run(`CREATE TABLE IF NOT EXISTS pvp_ranks (
                id TEXT PRIMARY KEY,
                user_id TEXT UNIQUE NOT NULL,
                user_name TEXT NOT NULL,
                score INTEGER NOT NULL DEFAULT 1000,
                wins INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0,
                realm INTEGER NOT NULL DEFAULT 1,
                division TEXT NOT NULL,
                season_id TEXT NOT NULL DEFAULT 's1-genesis',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS pvp_defense_snapshots (
                id TEXT PRIMARY KEY,
                user_id TEXT UNIQUE NOT NULL,
                user_name TEXT NOT NULL,
                power_score INTEGER NOT NULL DEFAULT 100,
                realm INTEGER NOT NULL DEFAULT 1,
                battle_data TEXT NOT NULL,
                config_data TEXT,
                save_time INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS pvp_match_tickets (
                ticket_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                opponent_user_id TEXT NOT NULL,
                opponent_rank_id TEXT NOT NULL,
                opponent_score INTEGER NOT NULL,
                issued_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                consumed_at INTEGER NOT NULL DEFAULT 0,
                result_data TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(opponent_user_id) REFERENCES users(id)
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS pvp_economy (
                user_id TEXT PRIMARY KEY,
                economy_data TEXT NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS pvp_season_reward_claims (
                claim_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                season_id TEXT NOT NULL,
                reward_id TEXT NOT NULL,
                reward_type TEXT NOT NULL DEFAULT 'cosmetic_badge',
                reward_name TEXT NOT NULL DEFAULT '',
                target_games INTEGER NOT NULL DEFAULT 1,
                claim_source TEXT NOT NULL DEFAULT 'live_ranked_settlement',
                source_match_id TEXT NOT NULL DEFAULT '',
                reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
                power_impact TEXT NOT NULL DEFAULT 'none',
                claim_payload_json TEXT NOT NULL DEFAULT '{}',
                claimed_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, season_id, reward_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_season_claims_user_season ON pvp_season_reward_claims(user_id, season_id, claimed_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_season_claims_season_reward ON pvp_season_reward_claims(season_id, reward_id, claimed_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_season_honor_archives (
                archive_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                season_id TEXT NOT NULL,
                total_unlocked INTEGER NOT NULL DEFAULT 0,
                last_unlocked_reward_id TEXT NOT NULL DEFAULT '',
                archive_source TEXT NOT NULL DEFAULT 'legacy_economy_archive',
                source_match_id TEXT NOT NULL DEFAULT '',
                reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
                power_impact TEXT NOT NULL DEFAULT 'none',
                collection_payload_json TEXT NOT NULL DEFAULT '{}',
                archived_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, season_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_season_archives_user_season ON pvp_season_honor_archives(user_id, season_id, archived_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_match_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT UNIQUE NOT NULL,
                user_id TEXT NOT NULL,
                opponent_user_id TEXT NOT NULL,
                did_win INTEGER NOT NULL,
                rating_delta INTEGER NOT NULL,
                score_after INTEGER NOT NULL,
                coins_awarded INTEGER NOT NULL,
                payload TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(opponent_user_id) REFERENCES users(id)
            )`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_ranks_score ON pvp_ranks(score DESC)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_ranks_realm ON pvp_ranks(realm)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_tickets_user_consumed ON pvp_match_tickets(user_id, consumed_at)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_tickets_expires ON pvp_match_tickets(expires_at)`);

            // Live PVP authoritative snapshots. Waiting queue tickets are
            // persisted separately from active/finished match state so a
            // backend restart can recover a still-waiting player without
            // replaying consumed matched tickets.
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_queue_tickets (
                queue_ticket TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                loadout_snapshot_json TEXT NOT NULL,
                rating_score INTEGER NOT NULL DEFAULT 1000,
                rating_bucket TEXT NOT NULL DEFAULT 'unrated',
                rating_season_id TEXT NOT NULL DEFAULT 's1-genesis',
                rating_provisional INTEGER NOT NULL DEFAULT 1,
                rating_ranked_games INTEGER NOT NULL DEFAULT 0,
                wide_match_consent INTEGER NOT NULL DEFAULT 0,
                connection_health_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            [
                `ALTER TABLE pvp_live_queue_tickets ADD COLUMN rating_score INTEGER NOT NULL DEFAULT 1000`,
                `ALTER TABLE pvp_live_queue_tickets ADD COLUMN rating_bucket TEXT NOT NULL DEFAULT 'unrated'`,
                `ALTER TABLE pvp_live_queue_tickets ADD COLUMN rating_season_id TEXT NOT NULL DEFAULT 's1-genesis'`,
                `ALTER TABLE pvp_live_queue_tickets ADD COLUMN rating_provisional INTEGER NOT NULL DEFAULT 1`,
                `ALTER TABLE pvp_live_queue_tickets ADD COLUMN rating_ranked_games INTEGER NOT NULL DEFAULT 0`,
                `ALTER TABLE pvp_live_queue_tickets ADD COLUMN wide_match_consent INTEGER NOT NULL DEFAULT 0`,
                `ALTER TABLE pvp_live_queue_tickets ADD COLUMN connection_health_json TEXT NOT NULL DEFAULT '{}'`
            ].forEach((sql) => {
                db.run(sql, (err) => {
                    if (err && !/duplicate column/i.test(String(err.message || ''))) {
                        fail(err);
                    }
                });
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_queue_created ON pvp_live_queue_tickets(created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_queue_rating ON pvp_live_queue_tickets(rating_score, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_queue_handoffs (
                queue_ticket TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                match_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(match_id) REFERENCES pvp_live_matches(match_id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_queue_handoffs_user ON pvp_live_queue_handoffs(user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_matches (
                match_id TEXT PRIMARY KEY,
                status TEXT NOT NULL,
                seat_a_user_id TEXT NOT NULL,
                seat_b_user_id TEXT NOT NULL,
                state_version INTEGER NOT NULL DEFAULT 0,
                state_json TEXT NOT NULL,
                connection_json TEXT NOT NULL DEFAULT '{}',
                source_invite_code TEXT NOT NULL DEFAULT '',
                source_rematch_match_id TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                finished_at INTEGER NOT NULL DEFAULT 0
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_matches ADD COLUMN connection_json TEXT NOT NULL DEFAULT '{}'`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`ALTER TABLE pvp_live_matches ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`ALTER TABLE pvp_live_matches ADD COLUMN source_invite_code TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_matches ADD COLUMN source_rematch_match_id TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_live_matches_source_invite_unique
                ON pvp_live_matches(source_invite_code)
                WHERE source_invite_code != ''`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pvp_live_matches_source_rematch_unique
                ON pvp_live_matches(source_rematch_match_id)
                WHERE source_rematch_match_id != ''`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_matches_seat_a_status ON pvp_live_matches(seat_a_user_id, status, updated_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_matches_seat_b_status ON pvp_live_matches(seat_b_user_id, status, updated_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_match_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                event_sequence INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                acting_seat TEXT NOT NULL DEFAULT '',
                visibility TEXT NOT NULL DEFAULT 'public',
                public_data_json TEXT NOT NULL DEFAULT '{}',
                event_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(match_id, event_id),
                UNIQUE(match_id, event_sequence),
                FOREIGN KEY(match_id) REFERENCES pvp_live_matches(match_id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_match_events_match_sequence ON pvp_live_match_events(match_id, event_sequence)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_match_events_type_created ON pvp_live_match_events(event_type, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_state_signals (
                signal_id INTEGER PRIMARY KEY AUTOINCREMENT,
                match_id TEXT NOT NULL,
                signal_type TEXT NOT NULL DEFAULT 'state_sync',
                state_version INTEGER NOT NULL DEFAULT 0,
                reason TEXT NOT NULL DEFAULT 'match_saved',
                source_instance_id TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(match_id) REFERENCES pvp_live_matches(match_id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_state_signals_match_created ON pvp_live_state_signals(match_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_rematch_requests (
                source_match_id TEXT PRIMARY KEY,
                series_id TEXT NOT NULL,
                players_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'waiting',
                claim_id TEXT NOT NULL DEFAULT '',
                claimed_at INTEGER NOT NULL DEFAULT 0,
                matched_match_id TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(source_match_id) REFERENCES pvp_live_matches(match_id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_rematch_updated ON pvp_live_rematch_requests(updated_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_rematch_requests ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting'`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_rematch_requests ADD COLUMN claim_id TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_rematch_requests ADD COLUMN claimed_at INTEGER NOT NULL DEFAULT 0`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_rematch_requests ADD COLUMN matched_match_id TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_rematch_status_updated ON pvp_live_rematch_requests(status, updated_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_invites (
                invite_code TEXT PRIMARY KEY,
                host_user_id TEXT NOT NULL UNIQUE,
                host_display_name TEXT NOT NULL,
                host_loadout_snapshot_json TEXT NOT NULL,
                target_user_id TEXT NOT NULL DEFAULT '',
                target_user_name TEXT NOT NULL DEFAULT '',
                claimed_by_user_id TEXT NOT NULL DEFAULT '',
                claim_id TEXT NOT NULL DEFAULT '',
                claimed_at INTEGER NOT NULL DEFAULT 0,
                matched_match_id TEXT NOT NULL DEFAULT '',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(host_user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_invites ADD COLUMN target_user_id TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`ALTER TABLE pvp_live_invites ADD COLUMN target_user_name TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`ALTER TABLE pvp_live_invites ADD COLUMN claimed_by_user_id TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`ALTER TABLE pvp_live_invites ADD COLUMN claimed_at INTEGER NOT NULL DEFAULT 0`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`ALTER TABLE pvp_live_invites ADD COLUMN claim_id TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_invites ADD COLUMN matched_match_id TEXT NOT NULL DEFAULT ''`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_invites_created ON pvp_live_invites(created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_invites_target ON pvp_live_invites(target_user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_recent_opponents (
                pair_key TEXT PRIMARY KEY,
                user_id_a TEXT NOT NULL,
                user_id_b TEXT NOT NULL,
                last_match_id TEXT NOT NULL DEFAULT '',
                last_matched_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_recent_opponents_a ON pvp_live_recent_opponents(user_id_a, last_matched_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_recent_opponents_b ON pvp_live_recent_opponents(user_id_b, last_matched_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_avoid_opponents (
                avoider_user_id TEXT NOT NULL,
                avoided_user_id TEXT NOT NULL,
                pair_key TEXT NOT NULL,
                source_match_id TEXT NOT NULL DEFAULT '',
                reason TEXT NOT NULL DEFAULT 'post_match_avoid',
                message TEXT NOT NULL DEFAULT '',
                avoided_at INTEGER NOT NULL,
                avoid_until INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (avoider_user_id, avoided_user_id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_avoid_opponents_pair ON pvp_live_avoid_opponents(pair_key, avoid_until)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_avoid_opponents_source_match ON pvp_live_avoid_opponents(source_match_id, avoider_user_id)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_matchmaking_guards (
                user_id TEXT PRIMARY KEY,
                cooldown_until INTEGER NOT NULL DEFAULT 0,
                cooldown_source TEXT NOT NULL DEFAULT '',
                cancel_window_started_at INTEGER NOT NULL DEFAULT 0,
                cancel_count INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_matchmaking_guards_cooldown ON pvp_live_matchmaking_guards(cooldown_until)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_dispute_reports (
                report_id TEXT PRIMARY KEY,
                match_id TEXT NOT NULL,
                reporter_user_id TEXT NOT NULL,
                reporter_seat TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'reported',
                message TEXT NOT NULL DEFAULT '',
                resolution TEXT NOT NULL DEFAULT '',
                reviewer_user_id TEXT NOT NULL DEFAULT '',
                review_note TEXT NOT NULL DEFAULT '',
                evidence_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                resolved_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(match_id) REFERENCES pvp_live_matches(match_id),
                FOREIGN KEY(reporter_user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            [
                `ALTER TABLE pvp_live_dispute_reports ADD COLUMN resolution TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE pvp_live_dispute_reports ADD COLUMN reviewer_user_id TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE pvp_live_dispute_reports ADD COLUMN review_note TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE pvp_live_dispute_reports ADD COLUMN resolved_at INTEGER NOT NULL DEFAULT 0`
            ].forEach((statement) => {
                db.run(statement, (err) => {
                    if (err && !/duplicate column/i.test(String(err.message || ''))) {
                        fail(err);
                    }
                });
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_dispute_reports_match ON pvp_live_dispute_reports(match_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_dispute_reports_user ON pvp_live_dispute_reports(reporter_user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_dispute_reports_status ON pvp_live_dispute_reports(status, updated_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_dispute_reports_user_status ON pvp_live_dispute_reports(reporter_user_id, status, updated_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_ops_events (
                event_id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                subject_user_id TEXT NOT NULL DEFAULT '',
                match_id TEXT NOT NULL DEFAULT '',
                severity TEXT NOT NULL DEFAULT 'info',
                reason TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'pvp_live',
                evidence_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_ops_events_subject ON pvp_live_ops_events(subject_user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_ops_events_match ON pvp_live_ops_events(match_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_ops_events_type ON pvp_live_ops_events(event_type, severity, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_match_settlements (
                match_id TEXT PRIMARY KEY,
                winner_user_id TEXT NOT NULL,
                loser_user_id TEXT NOT NULL,
                winner_seat TEXT NOT NULL,
                loser_seat TEXT NOT NULL,
                finish_reason TEXT NOT NULL,
                rating_delta_winner INTEGER NOT NULL,
                rating_delta_loser INTEGER NOT NULL,
                winner_score_after INTEGER NOT NULL,
                loser_score_after INTEGER NOT NULL,
                winner_coins_awarded INTEGER NOT NULL,
                loser_coins_awarded INTEGER NOT NULL,
                payload TEXT,
                match_started_at INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY(match_id) REFERENCES pvp_live_matches(match_id),
                FOREIGN KEY(winner_user_id) REFERENCES users(id),
                FOREIGN KEY(loser_user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`ALTER TABLE pvp_live_match_settlements ADD COLUMN match_started_at INTEGER NOT NULL DEFAULT 0`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_settlements_winner ON pvp_live_match_settlements(winner_user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_settlements_loser ON pvp_live_match_settlements(loser_user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_replay_shares (
                share_token TEXT PRIMARY KEY,
                match_id TEXT NOT NULL,
                creator_user_id TEXT NOT NULL,
                creator_seat TEXT NOT NULL,
                visibility_layer TEXT NOT NULL DEFAULT 'replay_public',
                source_visibility TEXT NOT NULL DEFAULT 'replay_public',
                match_ref TEXT NOT NULL DEFAULT '',
                replay_hash TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(match_id) REFERENCES pvp_live_matches(match_id),
                FOREIGN KEY(creator_user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_replay_shares_match ON pvp_live_replay_shares(match_id, creator_user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_replay_shares_expires ON pvp_live_replay_shares(status, expires_at)`, (err) => {
                if (err) {
                    fail(err);
                    return;
                }
            });

            // Cross-mode account progression. Client-observed activity is kept
            // separate from server-authoritative settlements through trust_tier.
            db.run(`CREATE TABLE IF NOT EXISTS progression_events (
                user_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                activity_mode TEXT NOT NULL,
                source_kind TEXT NOT NULL,
                trust_tier TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                battle_wins INTEGER NOT NULL DEFAULT 0,
                boss_wins INTEGER NOT NULL DEFAULT 0,
                activity_completions INTEGER NOT NULL DEFAULT 0,
                pvp_matches INTEGER NOT NULL DEFAULT 0,
                pvp_wins INTEGER NOT NULL DEFAULT 0,
                proof_json TEXT NOT NULL DEFAULT '{}',
                occurred_at INTEGER NOT NULL,
                received_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, event_id),
                UNIQUE(user_id, event_type, source_ref),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`ALTER TABLE progression_events ADD COLUMN occurred_at INTEGER NOT NULL DEFAULT 0`, (err) => {
                if (err && !/duplicate column/i.test(String(err.message || ''))) {
                    fail(err);
                }
            });
            db.run(`UPDATE progression_events SET occurred_at = received_at WHERE occurred_at <= 0`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_events_user_received ON progression_events(user_id, received_at DESC)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_events_user_occurred ON progression_events(user_id, occurred_at DESC, event_id)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_events_type_received ON progression_events(event_type, activity_mode, received_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_events_type_occurred ON progression_events(event_type, activity_mode, occurred_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_events_trust_received ON progression_events(trust_tier, received_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS progression_objective_progress (
                user_id TEXT NOT NULL,
                cycle_type TEXT NOT NULL,
                cycle_id TEXT NOT NULL,
                objective_id TEXT NOT NULL,
                current_value INTEGER NOT NULL DEFAULT 0,
                target_value INTEGER NOT NULL,
                completed_at INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, cycle_id, objective_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_objectives_cycle ON progression_objective_progress(cycle_type, cycle_id, objective_id, completed_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS progression_reward_claims (
                claim_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                cycle_type TEXT NOT NULL,
                cycle_id TEXT NOT NULL,
                objective_id TEXT NOT NULL,
                reward_type TEXT NOT NULL,
                currency TEXT NOT NULL,
                amount INTEGER NOT NULL,
                reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
                trust_requirement TEXT NOT NULL DEFAULT 'client_observed',
                claim_payload_json TEXT NOT NULL DEFAULT '{}',
                claimed_at INTEGER NOT NULL,
                UNIQUE(user_id, cycle_id, objective_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_claims_user_claimed ON progression_reward_claims(user_id, claimed_at DESC)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS progression_economy_balances (
                user_id TEXT NOT NULL,
                currency TEXT NOT NULL,
                balance INTEGER NOT NULL DEFAULT 0,
                lifetime_earned INTEGER NOT NULL DEFAULT 0,
                lifetime_spent INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY(user_id, currency),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS progression_economy_ledger (
                entry_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                currency TEXT NOT NULL,
                delta INTEGER NOT NULL,
                balance_after INTEGER NOT NULL,
                reason TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_id TEXT NOT NULL,
                reward_impact TEXT NOT NULL DEFAULT 'cosmetic_only',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                UNIQUE(user_id, source_type, source_id, currency),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_ledger_user_created ON progression_economy_ledger(user_id, created_at DESC, entry_id)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_ledger_source ON progression_economy_ledger(source_type, source_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS progression_verified_runs (
                ticket_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                client_run_id TEXT NOT NULL,
                activity_mode TEXT NOT NULL,
                content_version TEXT NOT NULL,
                context_json TEXT NOT NULL DEFAULT '{}',
                context_hash TEXT NOT NULL,
                nonce_hash TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                checkpoint_count INTEGER NOT NULL DEFAULT 0,
                battle_wins INTEGER NOT NULL DEFAULT 0,
                boss_wins INTEGER NOT NULL DEFAULT 0,
                issued_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                settled_at INTEGER NOT NULL DEFAULT 0,
                settlement_source_ref TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                UNIQUE(user_id, client_run_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_verified_runs_user_status ON progression_verified_runs(user_id, status, expires_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_verified_runs_mode_status ON progression_verified_runs(activity_mode, status, issued_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS progression_verified_run_checkpoints (
                checkpoint_id TEXT PRIMARY KEY,
                ticket_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                sequence INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                node_type TEXT NOT NULL DEFAULT 'enemy',
                realm INTEGER NOT NULL DEFAULT 1,
                proof_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                UNIQUE(ticket_id, source_ref),
                UNIQUE(ticket_id, sequence),
                FOREIGN KEY(ticket_id) REFERENCES progression_verified_runs(ticket_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_verified_checkpoints_user_created ON progression_verified_run_checkpoints(user_id, created_at DESC)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_progression_verified_checkpoints_user_source ON progression_verified_run_checkpoints(user_id, event_type, source_ref)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS progression_verified_run_receipts (
                receipt_id TEXT PRIMARY KEY,
                ticket_id TEXT NOT NULL UNIQUE,
                user_id TEXT NOT NULL,
                activity_mode TEXT NOT NULL,
                content_version TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                authority_level TEXT NOT NULL DEFAULT 'verified_envelope',
                event_id TEXT NOT NULL,
                receipt_json TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(ticket_id) REFERENCES progression_verified_runs(ticket_id),
                FOREIGN KEY(user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_verified_receipts_user_created ON progression_verified_run_receipts(user_id, created_at DESC)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_progression_verified_receipts_mode_created ON progression_verified_run_receipts(activity_mode, created_at)`, (err) => {
                if (err) {
                    fail(err);
                    return;
                }
                (async () => {
                    try {
                        await bootstrapCloudStateSchema(db);
                        await bootstrapSeasonOpsSchema(db);
                        await bootstrapAuthoritativeRunsSchema(db);
                        await bootstrapChallengeLadderSchema(db);
                        await bootstrapWorldRiftSchema(db);
                        await bootstrapAccountSocialSchema(db);
                        await bootstrapRelayExpeditionSchema(db);
                        await bootstrapFateChronicleSchema(db);
                        await bootstrapWeeklyArchiveSchema(db);
                        recordCurrentSchemaMigration(db, (migrationErr) => {
                            if (migrationErr) fail(migrationErr);
                            else done();
                        });
                    } catch (bootstrapError) {
                        fail(bootstrapError);
                    }
                })();
            });
        });
    });
};

module.exports = {
    db,
    dbPath,
    getSchemaStatus: () => getSchemaStatus(db),
    initDb
};
