import { ensureDatabaseReady } from '../storage/database.js';

export async function runDbInitCommand({ appContext }) {
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
  } finally {
    database.close();
  }

  console.log(`[codex-evolution] database ready: ${appContext.databasePath}`);
}
