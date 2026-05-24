import { syncAutoLearningWatcherIfNeeded } from '../scheduler/sync-auto-learning-watcher.js';

export async function runPostinstallCommand({
  appContext,
  syncWatcherFn = syncAutoLearningWatcherIfNeeded,
  env = process.env,
  output = console.error,
}) {
  if (env.CODEX_EVOLUTION_SKIP_POSTINSTALL_SYNC === '1') {
    return {
      skipped: true,
      reason: 'env-disabled',
    };
  }

  const result = await syncWatcherFn({
    appContext,
    allowCwdFallback: false,
  });

  if (result.status === 'restarted') {
    output(
      `[codex-evolution] 已同步后台自动学习 watcher: ` +
        `previous_pid=${result.previousPid ?? 'unknown'} ` +
        `pid=${result.state.autoLearning.pid ?? 'unknown'} ` +
        `version=${result.state.autoLearning.packageVersion ?? 'unknown'}`,
    );
  } else if (result.status === 'started' || result.status === 'attached-existing') {
    output(
      `[codex-evolution] 已恢复后台自动学习 watcher ` +
        `pid=${result.state.autoLearning.pid ?? 'unknown'}`,
    );
  } else if (result.status === 'missing-target-path') {
    output(
      '[codex-evolution] 后台自动学习已开启，但缺少历史项目路径；' +
        '安装阶段暂不重启 watcher，下一次执行 cdxe 时会自动补齐。',
    );
  }

  return result;
}
