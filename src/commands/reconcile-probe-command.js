import path from 'node:path';
import process from 'node:process';

import { createReconciliationProbe } from '../providers/create-reconciliation-provider.js';
import { summarizeReconciliationProviderError } from '../providers/reconciliation-provider-error.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';

export async function runReconcileProbeCommand({ appContext, targetPath }) {
  const launchCwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const project = await resolveProjectKey({ cwd: launchCwd });
  const probe = createReconciliationProbe({ appContext });

  try {
    const result = await probe.probe({
      projectKey: project.projectKey,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          provider: appContext.reconcileConfig.provider,
          projectKey: project.projectKey,
          launchCwd: project.launchCwd,
          metadata: result.metadata,
          output: result.output,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          provider: appContext.reconcileConfig.provider,
          projectKey: project.projectKey,
          launchCwd: project.launchCwd,
          error: summarizeReconciliationProviderError(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
