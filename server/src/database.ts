import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)), created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company TEXT NOT NULL, role TEXT NOT NULL, location TEXT NOT NULL, work_mode TEXT NOT NULL CHECK(work_mode IN ('hybrid','remote','onsite')),
        status TEXT NOT NULL CHECK(status IN ('saved','applied','interview','offer','closed')),
        url TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL DEFAULT '', applied_on TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS applications_owner_status ON applications(user_id, status);
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY, application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
        title TEXT NOT NULL, due_date TEXT NOT NULL DEFAULT '', completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)), created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS tasks_application ON tasks(application_id);
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS activities_owner ON activities(user_id, id DESC);
      PRAGMA user_version = 1;
    `);
    this.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  }
  one<T>(sql: string, ...values: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...values) as unknown as T | undefined;
  }
  all<T>(sql: string, ...values: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...values) as unknown as T[];
  }
  run(sql: string, ...values: SQLInputValue[]) {
    return this.db.prepare(sql).run(...values);
  }
  transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
