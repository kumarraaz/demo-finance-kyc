import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Db = Database.Database;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE,
    applicant_name TEXT NOT NULL,
    email TEXT NOT NULL,
    loan_product TEXT NOT NULL CHECK (loan_product IN ('personal','education','home')),
    requested_amount INTEGER NOT NULL CHECK (requested_amount > 0),
    purpose TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN
      ('submitted','in_review','more_info_needed','simulated_check_passed','simulated_check_failed','closed')),
    is_simulated INTEGER NOT NULL DEFAULT 1 CHECK (is_simulated = 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_applications_status ON applications(status);
  CREATE INDEX idx_applications_created ON applications(created_at DESC);

  CREATE TABLE status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id),
    from_status TEXT,
    to_status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    changed_by TEXT NOT NULL,
    changed_at TEXT NOT NULL
  );
  CREATE INDEX idx_history_application ON status_history(application_id, id);

  -- The audit trail is append-only.
  CREATE TRIGGER status_history_no_update BEFORE UPDATE ON status_history
  BEGIN SELECT RAISE(ABORT, 'status_history is append-only'); END;
  CREATE TRIGGER status_history_no_delete BEFORE DELETE ON status_history
  BEGIN SELECT RAISE(ABORT, 'status_history is append-only'); END;
  `,
];

export function migrate(db: Db): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function openDatabase(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function defaultPath(): string {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  // Vercel's filesystem is read-only except /tmp, which is ephemeral.
  return process.env.VERCEL ? "/tmp/demo-kyc.db" : path.join(process.cwd(), "data", "demo-kyc.db");
}

const globalForDb = globalThis as unknown as { __demoKycDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__demoKycDb) globalForDb.__demoKycDb = openDatabase(defaultPath());
  return globalForDb.__demoKycDb;
}
