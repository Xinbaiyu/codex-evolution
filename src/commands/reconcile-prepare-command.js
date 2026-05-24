import path from 'node:path';

import { applyProjectGuidancePolicy } from '../guidance/apply-project-guidance-policy.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { startReconciliation } from '../reconciliation/start-reconciliation.js';
import { ensureDatabaseReady } from '../storage/database.js';

export async function runReconcilePrepareCommand({ appContext, targetPath }) {
  const launchCwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const project = await resolveProjectKey({ cwd: launchCwd });
    applyProjectGuidancePolicy({
      repositories,
      projectKey: project.projectKey,
    });

    const result = startReconciliation({
      database,
      repositories,
      projectKey: project.projectKey,
      modelName: 'pending-llm',
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    database.close();
  }
}
