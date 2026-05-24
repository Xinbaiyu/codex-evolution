import fs from 'node:fs/promises';
import path from 'node:path';

import { createDefaultAppContext } from '../context/app-context.js';
import { buildDefaultConfig, stringifyConfig } from '../config/build-default-config.js';
import { installCodexEvolutionHooks } from '../hooks/install-user-prompt-submit-hook.js';
import { createReconciliationProbe } from '../providers/create-reconciliation-provider.js';
import { summarizeReconciliationProviderError } from '../providers/reconciliation-provider-error.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { ensureReconciliationPolicyFile } from '../reconciliation/ensure-reconciliation-policy-file.js';
import {
  isProcessAlive,
  startDetachedSchedulerWatch,
} from '../scheduler/start-detached-scheduler-watch.js';
import {
  DEFAULT_MAX_PROJECTS_PER_TICK,
  normalizeMaxProjects,
  normalizeSchedulerMode,
  SCHEDULER_MODE_GLOBAL,
} from '../scheduler/scheduler-mode.js';
import { createInteractivePromptIO } from './prompt-io.js';
import { loadOnboardingState, saveOnboardingState } from './onboarding-state.js';

const PROVIDER_OPTIONS = ['openai-compatible（推荐）', 'codex-exec（快速试用）'];

function printLine(output, message) {
  output(message);
}

function printHookTrustReminder(output) {
  printLine(output, '[codex-evolution] 重要提示：真实 Codex 会话需要你手动 trust hooks。');
  printLine(output, '[codex-evolution] 请在接下来启动的 Codex 里执行 `/hooks`，然后 trust 我们的 UserPromptSubmit 和 SessionStart 命令。');
  printLine(output, '[codex-evolution] 在 trust 之前，prompt 采集和会话开始时的记忆注入可能不会生效；如需排查，可执行 `cdxe hooks:doctor`。');
}

function buildOpenAICompatibleConfig({ model, baseUrl, apiKey }) {
  const config = buildDefaultConfig({
    provider: 'openai-compatible',
  });

  config.reconcile.model = model || config.reconcile.model;
  config.reconcile.baseUrl = baseUrl || config.reconcile.baseUrl;

  if (apiKey) {
    config.reconcile.apiKey = apiKey;
    delete config.reconcile.apiKeyEnv;
  } else {
    config.reconcile.apiKeyEnv = 'OPENAI_API_KEY';
    delete config.reconcile.apiKey;
  }

  return config;
}

async function writeConfig(configPath, config) {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, stringifyConfig(config), 'utf8');
}

async function promptForProviderConfig({ promptIO }) {
  const providerIndex = await promptIO.select({
    message: '请选择学习模型 provider',
    options: PROVIDER_OPTIONS,
    defaultIndex: 0,
  });

  if (providerIndex === 1) {
    return buildDefaultConfig({
      provider: 'codex-exec',
    });
  }

  const defaults = buildDefaultConfig({
    provider: 'openai-compatible',
  }).reconcile;

  const model = await promptIO.text({
    message: '学习模型',
    defaultValue: defaults.model,
  });
  const baseUrl = await promptIO.text({
    message: 'Base URL',
    defaultValue: defaults.baseUrl,
  });
  const apiKey = await promptIO.text({
    message: 'API Key（留空则使用环境变量 OPENAI_API_KEY）',
    defaultValue: '',
  });

  return buildOpenAICompatibleConfig({
    model,
    baseUrl,
    apiKey: apiKey || null,
  });
}

async function runProviderProbe({
  appContext,
  launchCwd,
  createProbeFn = createReconciliationProbe,
  resolveProjectKeyFn = resolveProjectKey,
}) {
  const project = await resolveProjectKeyFn({
    cwd: launchCwd,
  });
  const probe = createProbeFn({
    appContext,
  });

  try {
    const result = await probe.probe({
      projectKey: project.projectKey,
    });

    return {
      ok: true,
      projectKey: project.projectKey,
      metadata: result.metadata,
      output: result.output,
    };
  } catch (error) {
    return {
      ok: false,
      projectKey: project.projectKey,
      error: summarizeReconciliationProviderError(error),
    };
  }
}

export async function ensureAutoLearningWatcher({
  appContext,
  state,
  targetPath = process.cwd(),
  saveStateFn = saveOnboardingState,
  isProcessAliveFn = isProcessAlive,
  startWatchFn = startDetachedSchedulerWatch,
  output = console.error,
}) {
  if (!state.autoLearning.enabled) {
    return {
      status: 'disabled',
      state,
    };
  }

  if (state.autoLearning.pid && isProcessAliveFn(state.autoLearning.pid)) {
    return {
      status: 'already-running',
      state,
    };
  }

  const started = await startWatchFn({
    appContext,
    intervalSeconds: state.autoLearning.intervalSeconds,
    targetPath: state.autoLearning.targetPath ?? targetPath,
    mode: normalizeSchedulerMode(state.autoLearning.mode),
    maxProjects: normalizeMaxProjects(state.autoLearning.maxProjects, DEFAULT_MAX_PROJECTS_PER_TICK),
  });
  const mode = started.mode ?? normalizeSchedulerMode(state.autoLearning.mode);
  const maxProjects = started.maxProjects
    ?? normalizeMaxProjects(state.autoLearning.maxProjects, DEFAULT_MAX_PROJECTS_PER_TICK);
  const nextState = {
    ...state,
    autoLearning: {
      ...state.autoLearning,
      pid: started.pid,
      startedAt: started.startedAt,
      logPath: started.logPath,
      targetPath: mode === SCHEDULER_MODE_GLOBAL
        ? null
        : started.targetPath ?? state.autoLearning.targetPath ?? targetPath,
      mode,
      maxProjects,
      packageVersion: started.packageVersion ?? null,
      cliPath: started.cliPath ?? null,
      nodePath: started.nodePath ?? null,
    },
  };

  await saveStateFn(appContext.statePath, nextState);
  printLine(
    output,
    `[codex-evolution] 已启动后台自动学习 pid=${started.pid ?? 'unknown'} ` +
      `interval_seconds=${nextState.autoLearning.intervalSeconds}`,
  );

  return {
    status: 'started',
    state: nextState,
    metadata: started,
  };
}

export async function runLaunchOnboarding({
  appContext,
  launchCwd,
  promptIO,
  installHookFn = installCodexEvolutionHooks,
  loadStateFn = loadOnboardingState,
  saveStateFn = saveOnboardingState,
  reloadAppContext = createDefaultAppContext,
  createProbeFn = createReconciliationProbe,
  resolveProjectKeyFn = resolveProjectKey,
  startWatchFn = startDetachedSchedulerWatch,
  isProcessAliveFn = isProcessAlive,
  output = console.error,
}) {
  const ownedPromptIO = promptIO || createInteractivePromptIO();
  const shouldClosePromptIO = !promptIO;

  try {
    const hookResult = await installHookFn();

    if (hookResult.changed) {
      printLine(output, `[codex-evolution] 已安装 Codex hooks: ${hookResult.hooksPath}`);
      printHookTrustReminder(output);
    }

    let state = await loadStateFn(appContext.statePath);
    let activeAppContext = appContext;
    const interactive = ownedPromptIO.isInteractive();
    let providerProbe = null;

    if (!state.onboardingCompletedAt) {
      printLine(output, '[codex-evolution] 欢迎使用 codex-evolution。');
      printLine(output, '[codex-evolution] 已完成本地数据库初始化和 hook 检查。');
      if (!hookResult.changed) {
        printHookTrustReminder(output);
      }

      if (!activeAppContext.configFileExists) {
        if (interactive) {
          const config = await promptForProviderConfig({
            promptIO: ownedPromptIO,
          });

          await writeConfig(activeAppContext.configPath, config);
          activeAppContext = reloadAppContext();

          printLine(
            output,
            `[codex-evolution] 已创建学习配置: ${activeAppContext.configPath}`,
          );
        } else {
          printLine(
            output,
            '[codex-evolution] 未检测到学习配置，已跳过交互式引导。' +
              '可稍后运行 `cdxe config:init` 完成配置。',
          );
        }
      }

      if (activeAppContext.configFileExists) {
        const policy = await ensureReconciliationPolicyFile({
          policyPath: activeAppContext.reconcileConfig.policyPath,
        });

        if (policy.created) {
          printLine(
            output,
            `[codex-evolution] 已创建默认经验提取策略: ${policy.policyPath}`,
          );
          printLine(
            output,
            '[codex-evolution] 你可以编辑这个 Markdown 来调整经验提取偏好；修改后下次学习会自动生效。',
          );
        } else {
          printLine(
            output,
            `[codex-evolution] 已检测到经验提取策略: ${policy.policyPath}`,
          );
        }
      }

      if (interactive && activeAppContext.configFileExists) {
        providerProbe = await runProviderProbe({
          appContext: activeAppContext,
          launchCwd,
          createProbeFn,
          resolveProjectKeyFn,
        });

        if (providerProbe.ok) {
          printLine(
            output,
            `[codex-evolution] 学习 provider 连通性检查成功 provider=${activeAppContext.reconcileConfig.provider}`,
          );
        } else {
          printLine(
            output,
            `[codex-evolution] 学习 provider 连通性检查失败 code=${providerProbe.error.code} ` +
              `message=${providerProbe.error.message}`,
          );
          printLine(
            output,
            '[codex-evolution] 仍会继续启动 Codex；你稍后可以单独运行 `codex-evolution reconcile:probe` 排查。',
          );
          printLine(
            output,
            '[codex-evolution] 建议使用短命令 `cdxe reconcile:probe` 进行排查。',
          );
        }
      }

      if (interactive) {
        let enableAutoLearning = false;

        if (providerProbe && !providerProbe.ok) {
          printLine(
            output,
            '[codex-evolution] 已跳过后台自动学习启动，因为学习 provider 连通性检查未通过。',
          );
        } else {
          enableAutoLearning = await ownedPromptIO.confirm({
            message: '是否开启后台自动学习',
            defaultValue: false,
          });
        }

        state = {
          ...state,
          onboardingCompletedAt: new Date().toISOString(),
          autoLearning: {
            ...state.autoLearning,
            enabled: enableAutoLearning,
            mode: 'global',
            maxProjects: DEFAULT_MAX_PROJECTS_PER_TICK,
            targetPath: null,
          },
        };
        await saveStateFn(activeAppContext.statePath, state);
      } else if (activeAppContext.configFileExists) {
        state = {
          ...state,
          onboardingCompletedAt: new Date().toISOString(),
        };
        await saveStateFn(activeAppContext.statePath, state);
      }
    }

    let watcher = null;

    if (state.autoLearning.enabled && activeAppContext.configFileExists) {
      watcher = await ensureAutoLearningWatcher({
        appContext: activeAppContext,
        state,
        targetPath: launchCwd,
        saveStateFn,
        isProcessAliveFn,
        startWatchFn,
        output,
      });
      state = watcher.state;
    }

    return {
      appContext: activeAppContext,
      hookResult,
      onboardingState: state,
      providerProbe,
      watcher,
    };
  } finally {
    if (shouldClosePromptIO) {
      ownedPromptIO.close();
    }
  }
}
