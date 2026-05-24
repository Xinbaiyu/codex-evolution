import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { runMigrations } from './migrations.js';

export function createDatabase({ databasePath }) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  return new DatabaseSync(databasePath, {
    open: true,
    timeout: 5_000,
  });
}

export function ensureDatabaseReady(database) {
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');
  database.exec('PRAGMA busy_timeout = 5000;');
  runMigrations(database);
}

export function withTransaction(database, fn) {
  database.exec('BEGIN IMMEDIATE;');

  try {
    const result = fn();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}
