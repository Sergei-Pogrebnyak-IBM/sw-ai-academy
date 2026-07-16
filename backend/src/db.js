/**
 * db.js — SQLite database initialisation (BE-02)
 *
 * Creates the database file and the `contracts` table on first run.
 * Idempotent: safe to call on every server startup.
 *
 * Data model (design §8.1):
 *   id            — system-generated UUID, immutable
 *   file_name     — original file name as provided by the user
 *   uploaded_at   — ISO 8601 timestamp, set at creation
 *   status        — 'Pending' | 'Complete', default 'Pending'
 *   file_path     — path to the saved file in the file store (internal; never exposed to frontend)
 *
 * Status model (design §9):
 *   Only Pending → Complete transition is valid.
 *   No Failed status in MVP.
 */

const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');
const logger = require('./logger');

const DB_PATH = process.env.DB_PATH || 'data/app.db';

let db;

function getDb() {
  if (db) return db;

  // Ensure the directory exists before opening the file
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency (safe for single-user MVP)
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id          TEXT PRIMARY KEY NOT NULL,
      file_name   TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Complete')),
      file_path   TEXT NOT NULL
    )
  `);

  logger.info('database_initialised', { db_path: DB_PATH });

  return db;
}

module.exports = { getDb };
