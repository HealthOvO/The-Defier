const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DEFIER_DB_PATH
    ? path.resolve(process.env.DEFIER_DB_PATH)
    : path.resolve(__dirname, 'database.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);

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
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(source_match_id) REFERENCES pvp_live_matches(match_id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_rematch_updated ON pvp_live_rematch_requests(updated_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE TABLE IF NOT EXISTS pvp_live_invites (
                invite_code TEXT PRIMARY KEY,
                host_user_id TEXT NOT NULL UNIQUE,
                host_display_name TEXT NOT NULL,
                host_loadout_snapshot_json TEXT NOT NULL,
                target_user_id TEXT NOT NULL DEFAULT '',
                target_user_name TEXT NOT NULL DEFAULT '',
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
                created_at INTEGER NOT NULL,
                FOREIGN KEY(match_id) REFERENCES pvp_live_matches(match_id),
                FOREIGN KEY(winner_user_id) REFERENCES users(id),
                FOREIGN KEY(loser_user_id) REFERENCES users(id)
            )`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_settlements_winner ON pvp_live_match_settlements(winner_user_id, created_at)`, (err) => {
                if (err) fail(err);
            });
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_live_settlements_loser ON pvp_live_match_settlements(loser_user_id, created_at)`, (err) => {
                if (err) fail(err);
                else done();
            });
        });
    });
};

module.exports = {
    db,
    initDb
};
