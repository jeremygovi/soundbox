import Database from 'better-sqlite3';
import path from 'node:path';
import { loadConfig } from './config.js';

const config = loadConfig();
const destination = process.argv[2] ?? path.join(config.dataDir, 'soundbox.backup.db');
const db = new Database(config.databasePath, { readonly: true });

try {
  await db.backup(destination);
  process.stdout.write(`${destination}\n`);
} finally {
  db.close();
}
