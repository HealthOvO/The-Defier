const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const initDb = () => {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Users table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                global_data TEXT,
                created_at INTEGER NOT NULL
            )`);

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
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });

            // Index for fast random ghost fetching
            db.run(`CREATE INDEX IF NOT EXISTS idx_game_ghosts_realm ON game_ghosts(realm)`);
        });
    });
};

module.exports = {
    db,
    initDb
};
