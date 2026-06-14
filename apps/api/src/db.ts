import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const dbPath = process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data', 'crm.db')
mkdirSync(dirname(dbPath), { recursive: true })

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

const migrations: { id: number; up: string }[] = [
  {
    id: 1,
    up: `
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        first_name TEXT NOT NULL,
        last_name TEXT,
        email TEXT,
        phone TEXT,
        type TEXT NOT NULL CHECK (type IN ('donor','volunteer','beneficiary','partner','staff','other')),
        lifecycle_stage TEXT NOT NULL DEFAULT 'lead' CHECK (lifecycle_stage IN ('lead','active','lapsed','archived')),
        organization TEXT,
        notes TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        email_opt_in INTEGER NOT NULL DEFAULT 1,
        sms_opt_in INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_contacts_type ON contacts(type);
      CREATE INDEX idx_contacts_lifecycle ON contacts(lifecycle_stage);
      CREATE INDEX idx_contacts_email ON contacts(email);
      CREATE INDEX idx_contacts_last_name ON contacts(last_name);
    `,
  },
]

const isApplied = db.prepare<[number]>('SELECT 1 FROM schema_migrations WHERE id = ?')
const record = db.prepare('INSERT INTO schema_migrations (id) VALUES (?)')

for (const m of migrations) {
  if (isApplied.get(m.id)) continue
  const tx = db.transaction(() => {
    db.exec(m.up)
    record.run(m.id)
  })
  tx()
}

export type Db = typeof db
