import { redactReconcileConfig } from '../config/redact-reconcile-config.js';

export async function runConfigShowCommand({ appContext }) {
  console.log(
    JSON.stringify(
      {
        homeDirectory: appContext.homeDirectory,
        configPath: appContext.configPath,
        statePath: appContext.statePath,
        configFileExists: appContext.configFileExists,
        reconcile: redactReconcileConfig(appContext.reconcileConfig),
      },
      null,
      2,
    ),
  );
}
