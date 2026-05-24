import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

import { applyProjectGuidancePolicy } from '../guidance/apply-project-guidance-policy.js';
import { runLaunchOnboarding } from '../onboarding/run-launch-onboarding.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { buildCodexLaunchArgs } from '../runtime/build-codex-launch-args.js';
import { renderRuntimeContext } from '../runtime/render-runtime-context.js';
import { ensureDatabaseReady } from '../storage/database.js';

export async function runLaunchCommand({ appContext, codexArgs }) {
  const launchCwd = process.cwd();
  const bootstrapDatabase = appContext.createDatabase();

  try {
    ensureDatabaseReady(bootstrapDatabase);
  } finally {
    bootstrapDatabase.close();
  }

  const onboarding = await runLaunchOnboarding({
    appContext,
    launchCwd,
  });
  const activeAppContext = onboarding.appContext;
  const database = activeAppContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = activeAppContext.createRepositories(database);

    const project = await resolveProjectKey({
      cwd: launchCwd,
    });
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
    const contextHash = createHash('sha256').update(runtimeContext).digest('hex');
    const launchArgs = buildCodexLaunchArgs({
      codexArgs,
      runtimeContext,
    });

    repositories.launcherSessions.insert({
      id: randomUUID(),
      projectKey: project.projectKey,
      launchCwd: project.launchCwd,
      contextHash,
      startedAt: new Date().toISOString(),
      codexArgsJson: JSON.stringify(launchArgs),
    });

    console.error(
      `[codex-evolution] launch project_key=${project.projectKey} launch_cwd=${project.launchCwd} experiences=${experiences.length}`,
    );

    await spawnCodexProcess({
      binary: activeAppContext.codexBinary,
      args: launchArgs,
      cwd: launchCwd,
      runtimeContext,
      projectKey: project.projectKey,
    });
  } finally {
    database.close();
  }
}

function spawnCodexProcess({ binary, args, cwd, runtimeContext, projectKey }) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        CODEX_EVOLUTION_LAUNCH_CWD: cwd,
        CODEX_EVOLUTION_PROJECT_KEY: projectKey,
        CODEX_EVOLUTION_RUNTIME_CONTEXT: runtimeContext,
      },
    });

    child.on('error', (error) => {
      const reason = error instanceof Error ? error.message : String(error);
      reject(new Error(`failed to start ${path.basename(binary)}: ${reason}`));
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exitCode = code ?? 0;
      resolve();
    });
  });
}
