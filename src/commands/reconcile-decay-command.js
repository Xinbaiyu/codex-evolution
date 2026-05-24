import path from 'node:path';

import { applyProjectDecay } from '../decay/apply-project-decay.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { ensureDatabaseReady } from '../storage/database.js';

export async function runReconcileDecayCommand({ appContext, targetPath }) {
  const launchCwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const project = await resolveProjectKey({ cwd: launchCwd });

    const result = applyProjectDecay({
      repositories,
      projectKey: project.projectKey,
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    database.close();
  }
}
