import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { summarizeReconciliationProviderError } from '../providers/reconciliation-provider-error.js';
import {
  acquireSchedulerWatchLock,
  releaseSchedulerWatchLock,
} from '../scheduler/start-detached-scheduler-watch.js';
import {
  DEFAULT_MAX_PROJECTS_PER_TICK,
  SCHEDULER_MODE_GLOBAL,
  SCHEDULER_MODE_SINGLE,
} from '../scheduler/scheduler-mode.js';
import { runSchedulerGlobalTickOnce } from './run-scheduler-global-tick-once.js';
import { runSchedulerTickOnce } from './run-scheduler-tick-once.js';

const DEFAULT_INTERVAL_SECONDS = 3600;

export function parseSchedulerWatchOptions(args) {
  let targetPath;
  let intervalSeconds = DEFAULT_INTERVAL_SECONDS;
  let maxRuns = null;
  let maxProjects = DEFAULT_MAX_PROJECTS_PER_TICK;
  let global = false;

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

    if (arg === '--max-runs') {
      const value = args[index + 1];

      if (!value) {
        throw new Error('missing value for --max-runs');
      }

      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`invalid --max-runs value: ${value}`);
      }

      maxRuns = parsed;
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

    if (arg.startsWith('--')) {
      throw new Error(`unsupported scheduler:watch option: ${arg}`);
    }

    if (targetPath) {
      throw new Error('scheduler:watch accepts at most one target path');
    }

    targetPath = arg;
  }

  if (global && targetPath) {
    throw new Error('scheduler:watch cannot use --global with a target path');
  }

  return {
    targetPath,
    intervalSeconds,
    maxRuns,
    maxProjects,
    mode: global ? SCHEDULER_MODE_GLOBAL : SCHEDULER_MODE_SINGLE,
  };
}

function formatSingleTickSummary(runResult) {
  const { projectKey, reconcile } = runResult;

  if (reconcile.skipped) {
    return `[codex-evolution] scheduler:watch project_key=${projectKey} skipped=${reconcile.reason}`;
  }

  return (
    `[codex-evolution] scheduler:watch project_key=${projectKey} ` +
    `processed_prompts=${reconcile.applied.processedPromptCount} ` +
    `touched_experiences=${reconcile.applied.touchedExperienceCount} ` +
    `archived_experiences=${reconcile.applied.archivedExperienceCount}`
  );
}

function formatGlobalProjectSummary(projectResult) {
  if (projectResult.status === 'failed') {
    return (
      `[codex-evolution] scheduler:watch project_key=${projectResult.projectKey} ` +
      `failed provider=${projectResult.error.provider} ` +
      `code=${projectResult.error.code} message=${projectResult.error.message}`
    );
  }

  return formatSingleTickSummary(projectResult.result);
}

function formatTickSummary(runResult) {
  if (runResult.mode !== SCHEDULER_MODE_GLOBAL) {
    return formatSingleTickSummary(runResult);
  }

  if (runResult.skipped) {
    return `[codex-evolution] scheduler:watch global skipped=${runResult.reason}`;
  }

  const summaryLine =
    `[codex-evolution] scheduler:watch global ` +
    `projects=${runResult.discoveredProjectCount} ` +
    `attempted=${runResult.attemptedProjectCount} ` +
    `success=${runResult.successProjectCount} ` +
    `skipped=${runResult.skippedProjectCount} ` +
    `failed=${runResult.failedProjectCount}`;
  const projectLines = runResult.projectResults.map(formatGlobalProjectSummary);

  return [summaryLine, ...projectLines].join('\n');
}

export async function runSchedulerWatchLoop({
  appContext,
  targetPath,
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  maxRuns = null,
  maxProjects = DEFAULT_MAX_PROJECTS_PER_TICK,
  sleep = delay,
  tickRunner = runSchedulerTickOnce,
  onIteration,
  onError,
}) {
  let stopRequested = false;
  let sleepAbortController = null;
  let iteration = 0;

  function requestStop(signal) {
    if (!stopRequested) {
      stopRequested = true;
      console.error(`[codex-evolution] scheduler:watch stopping after ${signal}`);
    }

    if (sleepAbortController) {
      sleepAbortController.abort();
    }
  }

  const handleSigint = () => requestStop('SIGINT');
  const handleSigterm = () => requestStop('SIGTERM');

  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);

  try {
    while (!stopRequested) {
      iteration += 1;

      try {
        const { result } = await tickRunner({
          appContext,
          targetPath,
          maxProjects,
          iteration,
        });

        if (onIteration) {
          await onIteration({
            iteration,
            result,
          });
        }

        console.error(formatTickSummary(result));
      } catch (error) {
        const summary = summarizeReconciliationProviderError(error);

        if (onError) {
          await onError({
            iteration,
            error,
            summary,
          });
        }

        console.error(
          `[codex-evolution] scheduler:watch iteration=${iteration} ` +
            `provider=${summary.provider} code=${summary.code} message=${summary.message}`,
        );
      }

      if (stopRequested || (maxRuns !== null && iteration >= maxRuns)) {
        break;
      }

      sleepAbortController = new AbortController();

      try {
        await sleep(intervalSeconds * 1000, undefined, {
          signal: sleepAbortController.signal,
        });
      } catch (error) {
        if (stopRequested && error && typeof error === 'object' && error.name === 'AbortError') {
          break;
        }

        throw error;
      } finally {
        sleepAbortController = null;
      }
    }
  } finally {
    process.off('SIGINT', handleSigint);
    process.off('SIGTERM', handleSigterm);
  }
}

export async function runSchedulerWatchCommand({ appContext, args }) {
  const options = parseSchedulerWatchOptions(args);
  const targetPath =
    options.mode === SCHEDULER_MODE_GLOBAL ? null : path.resolve(options.targetPath ?? process.cwd());
  const lock = await acquireSchedulerWatchLock({
    homeDirectory: appContext.homeDirectory,
    targetPath,
    mode: options.mode,
    maxProjects: options.maxProjects,
  });

  if (!lock.acquired) {
    console.error(
      `[codex-evolution] scheduler:watch already running pid=${lock.lock.pid} ` +
        `started_at=${lock.lock.startedAt ?? 'unknown'}`,
    );
    return;
  }

  try {
    console.error(
      `[codex-evolution] scheduler:watch started interval_seconds=${options.intervalSeconds} ` +
        `max_runs=${options.maxRuns ?? 'unbounded'} ` +
        `mode=${options.mode} ` +
        `max_projects=${options.maxProjects} ` +
        `version=${lock.lock.packageVersion ?? 'unknown'} ` +
        `target_path=${lock.lock.targetPath ?? targetPath ?? 'global'}`,
    );

    await runSchedulerWatchLoop({
      appContext,
      targetPath,
      intervalSeconds: options.intervalSeconds,
      maxRuns: options.maxRuns,
      maxProjects: options.maxProjects,
      tickRunner: options.mode === SCHEDULER_MODE_GLOBAL
        ? runSchedulerGlobalTickOnce
        : runSchedulerTickOnce,
    });
  } finally {
    await releaseSchedulerWatchLock({
      homeDirectory: appContext.homeDirectory,
    });
  }
}
