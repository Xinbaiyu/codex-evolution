import { loadOnboardingState, saveOnboardingState } from '../onboarding/onboarding-state.js';
import { getCurrentRuntimeMetadata, isWatcherRuntimeCurrent } from '../runtime/package-metadata.js';
import {
  isProcessAlive,
  readSchedulerWatchLock,
  startDetachedSchedulerWatch,
  stopDetachedSchedulerWatch,
} from './start-detached-scheduler-watch.js';
import {
  DEFAULT_MAX_PROJECTS_PER_TICK,
  modeFromTargetPath,
  normalizeMaxProjects,
  normalizeSchedulerMode,
  SCHEDULER_MODE_SINGLE,
} from './scheduler-mode.js';

const DEFAULT_INTERVAL_SECONDS = 3600;

function toWatcherRuntime(source) {
  if (!source?.pid) {
    return null;
  }

  return {
    pid: source.pid,
    startedAt: source.startedAt ?? null,
    logPath: source.logPath ?? null,
    targetPath: source.targetPath ?? null,
    mode: normalizeSchedulerMode(source.mode ?? modeFromTargetPath(source.targetPath)),
    maxProjects: normalizeMaxProjects(source.maxProjects),
    packageVersion: source.packageVersion ?? null,
    cliPath: source.cliPath ?? null,
    nodePath: source.nodePath ?? null,
  };
}

function mergeStartedWatcher(state, started, { intervalSeconds, targetPath, mode, maxProjects }) {
  return {
    ...state,
    autoLearning: {
      ...state.autoLearning,
      enabled: true,
      intervalSeconds,
      pid: started.pid,
      startedAt: started.startedAt,
      logPath: started.logPath,
      targetPath: started.targetPath ?? targetPath ?? null,
      mode,
      maxProjects,
      packageVersion: started.packageVersion ?? null,
      cliPath: started.cliPath ?? null,
      nodePath: started.nodePath ?? null,
    },
  };
}

export async function syncAutoLearningWatcherIfNeeded({
  appContext,
  loadStateFn = loadOnboardingState,
  saveStateFn = saveOnboardingState,
  readLockFn = readSchedulerWatchLock,
  isProcessAliveFn = isProcessAlive,
  stopWatchFn = stopDetachedSchedulerWatch,
  startWatchFn = startDetachedSchedulerWatch,
  getRuntimeMetadataFn = getCurrentRuntimeMetadata,
  allowCwdFallback = true,
  fallbackTargetPath = process.cwd(),
}) {
  const state = await loadStateFn(appContext.statePath);

  if (!state.autoLearning.enabled) {
    return {
      status: 'disabled',
      state,
    };
  }

  const intervalSeconds = state.autoLearning.intervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
  const mode = normalizeSchedulerMode(state.autoLearning.mode);
  const maxProjects = normalizeMaxProjects(
    state.autoLearning.maxProjects,
    DEFAULT_MAX_PROJECTS_PER_TICK,
  );
  const currentRuntime = getRuntimeMetadataFn();
  const lock = await readLockFn({
    homeDirectory: appContext.homeDirectory,
  });
  const targetPath =
    mode === SCHEDULER_MODE_SINGLE
      ? state.autoLearning.targetPath ?? lock?.targetPath ?? (allowCwdFallback ? fallbackTargetPath : null)
      : null;
  const stateWatcher = toWatcherRuntime(state.autoLearning);
  const lockWatcher = toWatcherRuntime(lock);
  const stateAlive = Boolean(stateWatcher?.pid) && isProcessAliveFn(stateWatcher.pid);
  const lockAlive = Boolean(lockWatcher?.pid) && isProcessAliveFn(lockWatcher.pid);
  const liveWatcher =
    stateAlive && lockAlive && stateWatcher.pid === lockWatcher.pid
      ? {
          ...stateWatcher,
          ...lockWatcher,
          logPath: stateWatcher.logPath ?? lockWatcher.logPath,
        }
      : stateAlive
        ? stateWatcher
        : lockAlive
          ? lockWatcher
          : null;

  const watcherShapeMatches =
    liveWatcher
    && liveWatcher.mode === mode
    && (mode !== SCHEDULER_MODE_SINGLE || liveWatcher.targetPath === targetPath)
    && (mode === SCHEDULER_MODE_SINGLE || liveWatcher.maxProjects === maxProjects);

  if (liveWatcher && watcherShapeMatches && isWatcherRuntimeCurrent(liveWatcher, currentRuntime)) {
    if (
      state.autoLearning.pid !== liveWatcher.pid
      || (targetPath && state.autoLearning.targetPath !== targetPath)
      || state.autoLearning.mode !== mode
      || normalizeMaxProjects(state.autoLearning.maxProjects) !== maxProjects
    ) {
      const nextState = mergeStartedWatcher(
        state,
        {
          ...liveWatcher,
          logPath: state.autoLearning.logPath,
        },
        {
          intervalSeconds,
          targetPath,
          mode,
          maxProjects,
        },
      );
      await saveStateFn(appContext.statePath, nextState);

      return {
        status: 'attached-existing',
        state: nextState,
        previousPid: state.autoLearning.pid ?? null,
        watcher: liveWatcher,
      };
    }

    return {
      status: 'current',
      state,
      watcher: liveWatcher,
    };
  }

  let stopResult = {
    attempted: false,
    stopped: false,
    reason: 'not_running',
  };

  if (mode === SCHEDULER_MODE_SINGLE && !targetPath) {
    return {
      status: 'missing-target-path',
      state,
      previousPid: liveWatcher?.pid ?? null,
      watcher: liveWatcher,
    };
  }

  if (liveWatcher?.pid) {
    stopResult = await stopWatchFn(liveWatcher.pid, {
      timeoutMs: 2000,
      forceAfterTimeout: true,
    });
  }

  const started = await startWatchFn({
    appContext,
    intervalSeconds,
    targetPath,
    mode,
    maxProjects,
    runtimeMetadata: currentRuntime,
  });
  const nextState = mergeStartedWatcher(state, started, {
    intervalSeconds,
    targetPath,
    mode,
    maxProjects,
  });
  await saveStateFn(appContext.statePath, nextState);

  return {
    status: liveWatcher ? 'restarted' : 'started',
    state: nextState,
    previousPid: liveWatcher?.pid ?? null,
    stopResult,
    watcher: started,
  };
}
