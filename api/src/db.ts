import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'voting.db')
    // Ensure parent directory exists for file-based paths
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath)
      fs.mkdirSync(dir, { recursive: true })
    }
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
  }
  return db
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      user_id TEXT NOT NULL,
      vote_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      UNIQUE(feature_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_votes_feature ON votes(feature_id);
    CREATE INDEX IF NOT EXISTS idx_votes_user ON votes(user_id);
  `)
}

/** For testing: close and reset the database */
export function closeDb(): void {
  if (db) {
    db.close()
    db = undefined as unknown as Database.Database
  }
}
