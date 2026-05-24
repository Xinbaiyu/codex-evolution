import fs from 'node:fs/promises';

import { loadOnboardingState } from '../onboarding/onboarding-state.js';
import {
  isProcessAlive,
  stopDetachedSchedulerWatch,
} from '../scheduler/start-detached-scheduler-watch.js';

export function parseOnboardingResetOptions(args = []) {
  let includeConfig = false;

  for (const arg of args) {
    if (arg === '--include-config') {
      includeConfig = true;
      continue;
    }

    throw new Error(`unsupported onboarding:reset option: ${arg}`);
  }

  return {
    includeConfig,
  };
}

async function removeFileIfExists(filePath) {
  try {
    await fs.rm(filePath, {
      force: true,
    });
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

export async function runOnboardingResetCommand({
  appContext,
  args = [],
  loadStateFn = loadOnboardingState,
  isProcessAliveFn = isProcessAlive,
  stopWatchFn = stopDetachedSchedulerWatch,
  removeFileFn = removeFileIfExists,
}) {
  const options = parseOnboardingResetOptions(args);
  const state = await loadStateFn(appContext.statePath);
  const { pid } = state.autoLearning;

  let watcher = {
    attempted: false,
    stopped: false,
    reason: 'not_running',
  };

  if (pid && isProcessAliveFn(pid)) {
    watcher = await stopWatchFn(pid);
  }

  const removedState = await removeFileFn(appContext.statePath);
  const removedConfig = options.includeConfig
    ? await removeFileFn(appContext.configPath)
    : false;

  console.log(
    JSON.stringify(
      {
        action: 'onboarding:reset',
        includeConfig: options.includeConfig,
        previousPid: pid,
        watcher,
        removed: {
          state: removedState,
          config: removedConfig,
        },
        nextStep: options.includeConfig
          ? '重新执行 `node src/cli.js` 将重新进入完整初始化流程'
          : '重新执行 `node src/cli.js` 将重新进入引导流程，并保留现有学习配置',
      },
      null,
      2,
    ),
  );
}
