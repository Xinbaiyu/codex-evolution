import path from 'node:path';
import process from 'node:process';

import {
  createCodexExecProbe,
  summarizeCodexExecError,
} from '../providers/codex-exec-reconciler.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';

export async function runCodexProbeCommand({ appContext, targetPath }) {
  const launchCwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const project = await resolveProjectKey({ cwd: launchCwd });
  const probe = createCodexExecProbe({
    codexBinary: appContext.codexBinary,
    sourceCodexHome: appContext.sourceCodexHome,
    runtimeRoot: path.join(appContext.homeDirectory, 'codex-exec-runtime'),
  });

  try {
    const result = await probe.probe({
      projectKey: project.projectKey,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
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
          projectKey: project.projectKey,
          launchCwd: project.launchCwd,
          error: summarizeCodexExecError(error),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
