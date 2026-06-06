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
            db.run(`CREATE INDEX IF NOT EXISTS idx_pvp_tickets_expires ON pvp_match_tickets(expires_at)`, (err) => {
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
