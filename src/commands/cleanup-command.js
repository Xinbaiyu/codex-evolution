import fs from 'node:fs/promises';

import { uninstallCodexEvolutionHooks } from '../hooks/install-user-prompt-submit-hook.js';
import { loadOnboardingState, saveOnboardingState } from '../onboarding/onboarding-state.js';
import { isProcessAlive, stopDetachedSchedulerWatch } from '../scheduler/start-detached-scheduler-watch.js';

function parseCleanupArgs(args = []) {
  let includeHome = false;

  for (const arg of args) {
    if (arg === '--include-home') {
      includeHome = true;
      continue;
    }

    throw new Error(`unsupported cleanup option: ${arg}`);
  }

  return {
    includeHome,
  };
}

export async function runCleanupCommand({
  appContext,
  args = [],
  loadStateFn = loadOnboardingState,
  saveStateFn = saveOnboardingState,
  uninstallHookFn = uninstallCodexEvolutionHooks,
  isProcessAliveFn = isProcessAlive,
  stopWatchFn = stopDetachedSchedulerWatch,
  rmFn = fs.rm,
}) {
  const options = parseCleanupArgs(args);
  const state = await loadStateFn(appContext.statePath);
  const previousPid = state.autoLearning.pid;

  let watcherResult = {
    attempted: false,
    stopped: false,
    reason: 'not_running',
  };

  if (previousPid && isProcessAliveFn(previousPid)) {
    watcherResult = await stopWatchFn(previousPid);
  }

  await saveStateFn(appContext.statePath, {
    ...state,
    autoLearning: {
      ...state.autoLearning,
      enabled: false,
      pid: null,
      startedAt: null,
      targetPath: null,
      packageVersion: null,
      cliPath: null,
      nodePath: null,
    },
  });

  const hookResult = await uninstallHookFn();

  if (options.includeHome) {
    await rmFn(appContext.homeDirectory, {
      recursive: true,
      force: true,
    });
  }

  console.log('Codex Evolution 清理完成');
  console.log('');
  console.log(`- 自动学习: ${watcherResult.stopped ? '已停止' : '无需停止'}`);
  console.log(`- Codex hooks: ${hookResult.changed ? '已移除' : '未发现可移除项'}`);
  console.log(`- 本地数据目录: ${options.includeHome ? '已删除' : `已保留 (${appContext.homeDirectory})`}`);
  console.log('');
  if (options.includeHome) {
    console.log('现在可以直接执行 npm uninstall -g codex-evolution');
  } else {
    console.log('如果你准备彻底卸载，可继续执行:');
    console.log('- npm uninstall -g codex-evolution');
    console.log(`- 如需删除本地数据，再执行 cleanup --include-home 或手动删除 ${appContext.homeDirectory}`);
  }
}

export {
  parseCleanupArgs,
};
