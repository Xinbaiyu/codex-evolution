#!/usr/bin/env node

import process from 'node:process';

import { buildHelpText } from './cli-help.js';
import { runCodexProbeCommand } from './commands/codex-probe-command.js';
import { runCleanupCommand } from './commands/cleanup-command.js';
import { runConfigInitCommand } from './commands/config-init-command.js';
import { runConfigShowCommand } from './commands/config-show-command.js';
import { createDefaultAppContext } from './context/app-context.js';
import { runContextPreviewCommand } from './commands/context-preview-command.js';
import { runDbInitCommand } from './commands/db-init-command.js';
import { runDemoExperienceCommand } from './commands/demo-experience-command.js';
import { runDoctorCommand } from './commands/doctor-command.js';
import { runHookSessionStartCommand } from './commands/hook-session-start-command.js';
import { runHookUserPromptSubmitCommand } from './commands/hook-user-prompt-submit-command.js';
import { runHooksDoctorCommand } from './commands/hooks-doctor-command.js';
import { runHooksInstallCommand } from './commands/hooks-install-command.js';
import { runHooksUninstallCommand } from './commands/hooks-uninstall-command.js';
import { runLaunchCommand } from './commands/launch-command.js';
import { runOnboardingResetCommand } from './commands/onboarding-reset-command.js';
import { runPolicyInitCommand } from './commands/policy-init-command.js';
import { runPolicyShowCommand } from './commands/policy-show-command.js';
import { runProjectKeyCommand } from './commands/project-key-command.js';
import { runPromptsListCommand } from './commands/prompts-list-command.js';
import { runReconcileApplyCommand } from './commands/reconcile-apply-command.js';
import { runReconcileDecayCommand } from './commands/reconcile-decay-command.js';
import { runReconcileProbeCommand } from './commands/reconcile-probe-command.js';
import { runReconcilePrepareCommand } from './commands/reconcile-prepare-command.js';
import { runReconcileStatusCommand } from './commands/reconcile-status-command.js';
import { runSchedulerTickCommand } from './commands/scheduler-tick-command.js';
import {
  runSchedulerDisableCommand,
  runSchedulerEnableCommand,
  runSchedulerStopCommand,
} from './commands/scheduler-control-command.js';
import { runSchedulerLogsCommand } from './commands/scheduler-logs-command.js';
import { runSchedulerHistoryCommand } from './commands/scheduler-history-command.js';
import { runSchedulerWatchCommand } from './commands/scheduler-watch-command.js';
import { syncAutoLearningWatcherIfNeeded } from './scheduler/sync-auto-learning-watcher.js';

function printHelp() {
  console.log(buildHelpText());
}

function shouldSyncAutoLearningForCommand(command) {
  if (command === 'help' || command === '--help' || command === '-h' || command === '-help') {
    return false;
  }

  if (command?.startsWith('hook:')) {
    return false;
  }

  return !new Set([
    'scheduler:watch',
    'scheduler:enable',
    'scheduler:stop',
    'scheduler:disable',
    'cleanup',
    'config:init',
    'onboarding:reset',
  ]).has(command);
}

async function syncAutoLearningBeforeCommand({ appContext, command }) {
  if (!shouldSyncAutoLearningForCommand(command)) {
    return;
  }

  try {
    const result = await syncAutoLearningWatcherIfNeeded({
      appContext,
    });

    if (result.status === 'restarted') {
      console.error(
        `[codex-evolution] 已同步后台自动学习版本: ` +
          `previous_pid=${result.previousPid ?? 'unknown'} ` +
          `pid=${result.state.autoLearning.pid ?? 'unknown'} ` +
          `version=${result.state.autoLearning.packageVersion ?? 'unknown'}`,
      );
    } else if (result.status === 'started' || result.status === 'attached-existing') {
      console.error(
        `[codex-evolution] 已恢复后台自动学习 watcher ` +
          `pid=${result.state.autoLearning.pid ?? 'unknown'}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[codex-evolution] 自动学习版本同步失败，已跳过: ${message}`);
  }
}

async function main(argv) {
  const args = argv.slice(2);
  const command = args[0];

  if (command === 'help' || command === '--help' || command === '-h' || command === '-help') {
    printHelp();
    return;
  }

  const appContext = createDefaultAppContext();

  if (!command) {
    await syncAutoLearningBeforeCommand({
      appContext,
      command,
    });

    return runLaunchCommand({
      appContext,
      codexArgs: [],
    });
  }

  await syncAutoLearningBeforeCommand({
    appContext,
    command,
  });

  if (command === 'db:init') {
    return runDbInitCommand({
      appContext,
    });
  }

  if (command === 'cleanup') {
    return runCleanupCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'demo:experience') {
    return runDemoExperienceCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'config:init') {
    const providerArg = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
    const force = args.includes('--force');

    return runConfigInitCommand({
      appContext,
      providerArg,
      force,
    });
  }

  if (command === 'config:show') {
    return runConfigShowCommand({
      appContext,
    });
  }

  if (command === 'doctor') {
    return runDoctorCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'codex:probe') {
    return runCodexProbeCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'context:preview') {
    return runContextPreviewCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'project-key') {
    return runProjectKeyCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'prompts:list') {
    return runPromptsListCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'policy:init') {
    return runPolicyInitCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'policy:show') {
    return runPolicyShowCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'hooks:install') {
    return runHooksInstallCommand({
      appContext,
      hooksPathArg: args[1],
    });
  }

  if (command === 'hooks:doctor') {
    return runHooksDoctorCommand({
      appContext,
    });
  }

  if (command === 'hooks:uninstall') {
    return runHooksUninstallCommand({
      appContext,
      hooksPathArg: args[1],
    });
  }

  if (command === 'hook:user-prompt-submit') {
    return runHookUserPromptSubmitCommand({
      appContext,
    });
  }

  if (command === 'hook:session-start') {
    return runHookSessionStartCommand({
      appContext,
    });
  }

  if (command === 'onboarding:reset') {
    return runOnboardingResetCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'reconcile:prepare') {
    return runReconcilePrepareCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'reconcile:apply') {
    return runReconcileApplyCommand({
      appContext,
      runId: args[1],
    });
  }

  if (command === 'reconcile:decay') {
    return runReconcileDecayCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'reconcile:probe') {
    return runReconcileProbeCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'reconcile:status') {
    return runReconcileStatusCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'scheduler:tick') {
    return runSchedulerTickCommand({
      appContext,
      targetPath: args[1],
    });
  }

  if (command === 'scheduler:enable') {
    return runSchedulerEnableCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'scheduler:stop') {
    return runSchedulerStopCommand({
      appContext,
    });
  }

  if (command === 'scheduler:disable') {
    return runSchedulerDisableCommand({
      appContext,
    });
  }

  if (command === 'scheduler:logs') {
    return runSchedulerLogsCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'scheduler:history') {
    return runSchedulerHistoryCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'scheduler:watch') {
    return runSchedulerWatchCommand({
      appContext,
      args: args.slice(1),
    });
  }

  if (command === 'launch') {
    return runLaunchCommand({
      appContext,
      codexArgs: args.slice(1),
    });
  }

  return runLaunchCommand({
    appContext,
    codexArgs: args,
  });
}

main(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[codex-evolution] ${message}`);
  process.exitCode = 1;
});
