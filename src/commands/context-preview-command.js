import path from 'node:path';

import { applyProjectGuidancePolicy } from '../guidance/apply-project-guidance-policy.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { renderRuntimeContext } from '../runtime/render-runtime-context.js';
import { ensureDatabaseReady } from '../storage/database.js';

export async function runContextPreviewCommand({ appContext, targetPath }) {
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
    const experiences = repositories.experiences.listByProjectAndStatuses({
      projectKey: project.projectKey,
      statuses: ['active', 'decaying'],
      limit: 50,
    });

    const runtimeContext = renderRuntimeContext({
      projectKey: project.projectKey,
      experiences,
    });

    console.log(runtimeContext);
  } finally {
    database.close();
  }
}
