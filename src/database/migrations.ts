import type Database from 'better-sqlite3';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => (row as { name: string }).name)
  );
  const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const apply = db.transaction((name: string, sql: string) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(
      name,
      new Date().toISOString()
    );
  });

  for (const name of migrations) {
    if (!applied.has(name)) apply(name, readFileSync(path.join(migrationsDir, name), 'utf8'));
  }
}
