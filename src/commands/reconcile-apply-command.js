import process from 'node:process';

import { applyReconciliationOutput } from '../reconciliation/apply-reconciliation-output.js';
import { ensureDatabaseReady } from '../storage/database.js';

async function readJsonFromStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return { experiences: [] };
  }

  return JSON.parse(text);
}

export async function runReconcileApplyCommand({ appContext, runId }) {
  if (!runId) {
    throw new Error('reconcile:apply requires a run id');
  }

  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const run = repositories.reconciliationRuns.getById(runId);

    if (!run) {
      throw new Error(`reconciliation run not found: ${runId}`);
    }

    const output = await readJsonFromStdin();
    const result = applyReconciliationOutput({
      database,
      repositories,
      runId,
      projectKey: run.project_key,
      output,
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    database.close();
  }
}
