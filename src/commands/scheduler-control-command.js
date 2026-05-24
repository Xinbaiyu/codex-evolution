import path from 'node:path';

import { createReconciliationProbe } from '../providers/create-reconciliation-provider.js';
import { loadOnboardingState, saveOnboardingState } from '../onboarding/onboarding-state.js';
import {
  isProcessAlive,
  startDetachedSchedulerWatch,
  stopDetachedSchedulerWatch,
} from '../scheduler/start-detached-scheduler-watch.js';
import {
  DEFAULT_MAX_PROJECTS_PER_TICK,
  normalizeMaxProjects,
  normalizeSchedulerMode,
  SCHEDULER_MODE_GLOBAL,
  SCHEDULER_MODE_SINGLE,
} from '../scheduler/scheduler-mode.js';
import { summarizeReconciliationProviderError } from '../providers/reconciliation-provider-error.js';

const DEFAULT_INTERVAL_SECONDS = 3600;

function normalizeStoppedState(state, enabledOverride = state.autoLearning.enabled) {
  return {
    ...state,
    autoLearning: {
      ...state.autoLearning,
      enabled: enabledOverride,
      pid: null,
      startedAt: null,
      packageVersion: null,
      cliPath: null,
      nodePath: null,
    },
  };
}

function parseEnableOptions(args) {
  let intervalSeconds = null;
  let targetPath = null;
  let global = false;
  let maxProjects = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--interval-seconds') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('missing value for --interval-seconds');
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`invalid --interval-seconds value: ${value}`);
      }

      intervalSeconds = parsed;
      index += 1;
      continue;
    }

    if (arg === '--global') {
      global = true;
      continue;
    }

    if (arg === '--max-projects') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('missing value for --max-projects');
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`invalid --max-projects value: ${value}`);
      }

      maxProjects = parsed;
      index += 1;
      continue;
    }

    if (!arg.startsWith('--') && !targetPath) {
      targetPath = arg;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error('scheduler:enable accepts at most one target path');
    }

    throw new Error(`unsupported scheduler:enable option: ${arg}`);
  }

  if (global && targetPath) {
    throw new Error('scheduler:enable cannot use --global with a target path');
  }

  return {
    intervalSeconds,
    targetPath,
    global,
    maxProjects,
  };
}

function resolveEnableMode(options) {
  if (options.global || !options.targetPath) {
    return SCHEDULER_MODE_GLOBAL;
  }

  return SCHEDULER_MODE_SINGLE;
}

function hasSameWatcherSettings({
  state,
  mode,
  targetPath,
  intervalSeconds,
  maxProjects,
}) {
  return (
    normalizeSchedulerMode(state.autoLearning.mode) === mode
    && (mode !== SCHEDULER_MODE_SINGLE || state.autoLearning.targetPath === targetPath)
    && state.autoLearning.intervalSeconds === intervalSeconds
    && (mode === SCHEDULER_MODE_SINGLE
      || normalizeMaxProjects(state.autoLearning.maxProjects) === maxProjects)
  );
}

async function runProbeIfPossible({
  appContext,
  projectKey = process.cwd(),
  createProbeFn = createReconciliationProbe,
}) {
  const probe = createProbeFn({
    appContext,
  });

  try {
    await probe.probe({
      projectKey,
    });

    return {
      ok: true,
    };
  } catch (error) {
    return {
      ok: false,
      error: summarizeReconciliationProviderError(error),
    };
  }
}

export async function runSchedulerStopCommand({
  appContext,
  loadStateFn = loadOnboardingState,
  saveStateFn = saveOnboardingState,
  isProcessAliveFn = isProcessAlive,
  stopWatchFn = stopDetachedSchedulerWatch,
}) {
  const state = await loadStateFn(appContext.statePath);
  const { pid } = state.autoLearning;

  let result = {
    attempted: false,
    stopped: false,
    reason: 'not_running',
  };

  if (pid && isProcessAliveFn(pid)) {
    result = await stopWatchFn(pid);
  }

  const nextState = normalizeStoppedState(state);
  await saveStateFn(appContext.statePath, nextState);

  console.log(
    JSON.stringify(
      {
        action: 'scheduler:stop',
        enabled: nextState.autoLearning.enabled,
        previousPid: pid,
        result,
      },
      null,
      2,
    ),
  );
}

export async function runSchedulerDisableCommand({
  appContext,
  loadStateFn = loadOnboardingState,
  saveStateFn = saveOnboardingState,
  isProcessAliveFn = isProcessAlive,
  stopWatchFn = stopDetachedSchedulerWatch,
}) {
  const state = await loadStateFn(appContext.statePath);
  const { pid } = state.autoLearning;

  let result = {
    attempted: false,
    stopped: false,
    reason: 'not_running',
  };

  if (pid && isProcessAliveFn(pid)) {
    result = await stopWatchFn(pid);
  }

  const nextState = normalizeStoppedState(state, false);
  await saveStateFn(appContext.statePath, nextState);

  console.log(
    JSON.stringify(
      {
        action: 'scheduler:disable',
        enabled: nextState.autoLearning.enabled,
        previousPid: pid,
        result,
      },
      null,
      2,
    ),
  );
}

export async function runSchedulerEnableCommand({
  appContext,
  args = [],
  loadStateFn = loadOnboardingState,
  saveStateFn = saveOnboardingState,
  isProcessAliveFn = isProcessAlive,
  startWatchFn = startDetachedSchedulerWatch,
  stopWatchFn = stopDetachedSchedulerWatch,
  createProbeFn = createReconciliationProbe,
}) {
  const options = parseEnableOptions(args);
  const state = await loadStateFn(appContext.statePath);
  const intervalSeconds =
    options.intervalSeconds ?? state.autoLearning.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  const mode = resolveEnableMode(options);
  const maxProjects = normalizeMaxProjects(
    options.maxProjects ?? state.autoLearning.maxProjects,
    DEFAULT_MAX_PROJECTS_PER_TICK,
  );
  const targetPath =
    mode === SCHEDULER_MODE_SINGLE
      ? path.resolve(options.targetPath ?? state.autoLearning.targetPath ?? process.cwd())
      : null;

  const nextState = {
    ...state,
    autoLearning: {
      ...state.autoLearning,
      enabled: true,
      intervalSeconds,
      mode,
      maxProjects,
      targetPath,
    },
  };

  if (state.autoLearning.pid && isProcessAliveFn(state.autoLearning.pid)) {
    if (hasSameWatcherSettings({
      state,
      mode,
      targetPath,
      intervalSeconds,
      maxProjects,
    })) {
      await saveStateFn(appContext.statePath, nextState);
      console.log(
        JSON.stringify(
          {
            action: 'scheduler:enable',
            enabled: true,
            intervalSeconds,
            mode,
            maxProjects,
            result: {
              status: 'already-running',
              pid: state.autoLearning.pid,
            },
          },
          null,
          2,
        ),
      );
      return;
    }

    await stopWatchFn(state.autoLearning.pid, {
      timeoutMs: 2000,
      forceAfterTimeout: true,
    });
  }

  const probeResult = await runProbeIfPossible({
    appContext,
    projectKey: targetPath ?? process.cwd(),
    createProbeFn,
  });

  const started = await startWatchFn({
    appContext,
    intervalSeconds,
    targetPath,
    mode,
    maxProjects,
  });
  const startedState = {
    ...nextState,
    autoLearning: {
      ...nextState.autoLearning,
      pid: started.pid,
      startedAt: started.startedAt,
      logPath: started.logPath,
      targetPath: started.targetPath ?? targetPath,
      mode: started.mode ?? mode,
      maxProjects: started.maxProjects ?? maxProjects,
      packageVersion: started.packageVersion ?? null,
      cliPath: started.cliPath ?? null,
      nodePath: started.nodePath ?? null,
    },
  };

  await saveStateFn(appContext.statePath, startedState);

  console.log(
    JSON.stringify(
      {
        action: 'scheduler:enable',
        enabled: true,
        intervalSeconds,
        mode,
        maxProjects,
        probe: probeResult,
        result: {
          status: started.alreadyRunning ? 'already-running' : 'started',
          pid: started.pid,
          logPath: started.logPath,
          startedAt: started.startedAt,
          targetPath: started.targetPath ?? targetPath,
          mode: started.mode ?? mode,
          maxProjects: started.maxProjects ?? maxProjects,
        },
      },
      null,
      2,
    ),
  );
}
