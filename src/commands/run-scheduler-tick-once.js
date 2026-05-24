import path from 'node:path';

import { resolveProjectKey } from '../project/resolve-project-key.js';
import { createReconciliationProvider } from '../providers/create-reconciliation-provider.js';
import { loadReconciliationPolicy } from '../reconciliation/reconciliation-policy.js';
import { runSchedulerTick } from '../scheduler/run-scheduler-tick.js';
import { ensureDatabaseReady } from '../storage/database.js';

export function buildReconciliationModelName(appContext) {
  const { provider, model } = appContext.reconcileConfig;
  return model ? `${provider}:${model}` : provider;
}

export async function runSchedulerTickOnce({ appContext, targetPath }) {
  const launchCwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const project = await resolveProjectKey({ cwd: launchCwd });
    const reconciler = createReconciliationProvider({
      appContext,
    });
    const policy = await loadReconciliationPolicy({
      appContext,
    });

    const result = await runSchedulerTick({
      database,
      repositories,
      projectKey: project.projectKey,
      reconciler,
      modelName: buildReconciliationModelName(appContext),
      policyText: policy.policyText,
      policySource: policy.source,
    });

    return {
      launchCwd,
      projectKey: project.projectKey,
      result,
    };
  } finally {
    database.close();
  }
}
