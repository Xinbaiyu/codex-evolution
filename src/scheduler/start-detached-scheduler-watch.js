import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { getCurrentRuntimeMetadata } from '../runtime/package-metadata.js';
import {
  DEFAULT_MAX_PROJECTS_PER_TICK,
  modeFromTargetPath,
  normalizeMaxProjects,
  normalizeSchedulerMode,
  SCHEDULER_MODE_GLOBAL,
} from './scheduler-mode.js';

const DEFAULT_INTERVAL_SECONDS = 3600;

function getCliPath() {
  return fileURLToPath(new URL('../cli.js', import.meta.url));
}

export function getSchedulerWatchLogPath(homeDirectory) {
  return path.join(homeDirectory, 'scheduler-watch.log');
}

export function getSchedulerWatchLockPath(homeDirectory) {
  return path.join(homeDirectory, 'scheduler-watch.lock.json');
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EPERM') {
      return true;
    }

    return false;
  }
}

async function waitForProcessExit({
  pid,
  timeoutMs,
  intervalMs = 50,
  isProcessAliveFn = isProcessAlive,
  sleep = delay,
}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAliveFn(pid)) {
      return true;
    }

    await sleep(intervalMs);
  }

  return !isProcessAliveFn(pid);
}

export async function stopDetachedSchedulerWatch(pid, options = {}) {
  const normalizedOptions = typeof options === 'string' ? { signal: options } : options;
  const signal = normalizedOptions.signal ?? 'SIGTERM';
  const timeoutMs = normalizedOptions.timeoutMs ?? 2000;
  const forceAfterTimeout = normalizedOptions.forceAfterTimeout ?? true;
  const forceSignal = normalizedOptions.forceSignal ?? 'SIGKILL';
  const isProcessAliveFn = normalizedOptions.isProcessAliveFn ?? isProcessAlive;

  if (!Number.isInteger(pid) || pid <= 0) {
    return {
      attempted: false,
      stopped: false,
      reason: 'invalid_pid',
    };
  }

  try {
    process.kill(pid, signal);

    const exited = await waitForProcessExit({
      pid,
      timeoutMs,
      isProcessAliveFn,
    });

    if (exited) {
      return {
        attempted: true,
        stopped: true,
        signal,
      };
    }

    if (!forceAfterTimeout) {
      return {
        attempted: true,
        stopped: false,
        signal,
        reason: 'timeout',
      };
    }

    process.kill(pid, forceSignal);
    const forceExited = await waitForProcessExit({
      pid,
      timeoutMs,
      isProcessAliveFn,
    });

    return {
      attempted: true,
      stopped: forceExited,
      signal,
      forced: true,
      forceSignal,
      reason: forceExited ? undefined : 'force_timeout',
    };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') {
      return {
        attempted: true,
        stopped: false,
        reason: 'not_running',
      };
    }

    throw error;
  }
}

async function readJsonFileIfExists(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

export async function readSchedulerWatchLock({
  homeDirectory,
  readJsonFileIfExistsFn = readJsonFileIfExists,
}) {
  return readJsonFileIfExistsFn(getSchedulerWatchLockPath(homeDirectory));
}

export async function acquireSchedulerWatchLock({
  homeDirectory,
  pid = process.pid,
  startedAt = new Date().toISOString(),
  host = os.hostname(),
  targetPath = null,
  mode = modeFromTargetPath(targetPath),
  maxProjects = DEFAULT_MAX_PROJECTS_PER_TICK,
  runtimeMetadata = getCurrentRuntimeMetadata(),
  isProcessAliveFn = isProcessAlive,
  readSchedulerWatchLockFn = readSchedulerWatchLock,
  writeFileFn = fsp.writeFile,
  mkdirFn = fsp.mkdir,
}) {
  const existing = await readSchedulerWatchLockFn({
    homeDirectory,
  });

  if (existing?.pid && existing.pid !== pid && isProcessAliveFn(existing.pid)) {
    return {
      acquired: false,
      lock: existing,
      reason: 'already-running',
    };
  }

  const nextLock = {
    pid,
    startedAt,
    host,
    targetPath,
    mode: normalizeSchedulerMode(mode),
    maxProjects: normalizeMaxProjects(maxProjects),
    packageVersion: runtimeMetadata.packageVersion,
    cliPath: runtimeMetadata.cliPath,
    nodePath: runtimeMetadata.nodePath,
  };
  const lockPath = getSchedulerWatchLockPath(homeDirectory);
  await mkdirFn(path.dirname(lockPath), {
    recursive: true,
  });
  await writeFileFn(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`, 'utf8');

  return {
    acquired: true,
    lock: nextLock,
    reason: existing?.pid && existing.pid !== pid ? 'replaced-stale-lock' : 'created',
  };
}

export async function releaseSchedulerWatchLock({
  homeDirectory,
  pid = process.pid,
  readSchedulerWatchLockFn = readSchedulerWatchLock,
  rmFn = fsp.rm,
}) {
  const existing = await readSchedulerWatchLockFn({
    homeDirectory,
  });

  if (!existing?.pid || existing.pid !== pid) {
    return {
      released: false,
      reason: 'lock-owned-by-other-process',
    };
  }

  await rmFn(getSchedulerWatchLockPath(homeDirectory), {
    force: true,
  });

  return {
    released: true,
    reason: 'removed',
  };
}

export async function startDetachedSchedulerWatch({
  appContext,
  intervalSeconds = DEFAULT_INTERVAL_SECONDS,
  targetPath = null,
  mode = modeFromTargetPath(targetPath),
  maxProjects = DEFAULT_MAX_PROJECTS_PER_TICK,
  cliPath = getCliPath(),
  readSchedulerWatchLockFn = readSchedulerWatchLock,
  isProcessAliveFn = isProcessAlive,
  runtimeMetadata = getCurrentRuntimeMetadata(),
}) {
  const normalizedMode = normalizeSchedulerMode(mode);
  const normalizedMaxProjects = normalizeMaxProjects(maxProjects);
  const normalizedTargetPath = normalizedMode === SCHEDULER_MODE_GLOBAL ? null : targetPath;
  const existingLock = await readSchedulerWatchLockFn({
    homeDirectory: appContext.homeDirectory,
  });

  if (existingLock?.pid && isProcessAliveFn(existingLock.pid)) {
    return {
      pid: existingLock.pid,
      logPath: getSchedulerWatchLogPath(appContext.homeDirectory),
      startedAt: existingLock.startedAt ?? null,
      host: existingLock.host ?? null,
      targetPath: existingLock.targetPath ?? null,
      mode: normalizeSchedulerMode(existingLock.mode ?? modeFromTargetPath(existingLock.targetPath)),
      maxProjects: normalizeMaxProjects(existingLock.maxProjects),
      packageVersion: existingLock.packageVersion ?? null,
      cliPath: existingLock.cliPath ?? null,
      nodePath: existingLock.nodePath ?? null,
      alreadyRunning: true,
    };
  }

  const logPath = getSchedulerWatchLogPath(appContext.homeDirectory);
  fs.mkdirSync(appContext.homeDirectory, { recursive: true });

  const outputFd = fs.openSync(logPath, 'a');
  const errorFd = fs.openSync(logPath, 'a');
  const watchArgs = [
    cliPath,
    'scheduler:watch',
    ...(normalizedMode === SCHEDULER_MODE_GLOBAL
      ? ['--global', '--max-projects', String(normalizedMaxProjects)]
      : normalizedTargetPath
        ? [normalizedTargetPath]
        : []),
    '--interval-seconds',
    String(intervalSeconds),
  ];
  const child = spawn(
    process.execPath,
    watchArgs,
    {
      detached: true,
      stdio: ['ignore', outputFd, errorFd],
      env: {
        ...process.env,
        CODEX_EVOLUTION_HOME: appContext.homeDirectory,
        CODEX_EVOLUTION_DB_PATH: appContext.databasePath,
        CODEX_EVOLUTION_CONFIG_PATH: appContext.configPath,
        CODEX_EVOLUTION_STATE_PATH: appContext.statePath,
        CODEX_EVOLUTION_PACKAGE_VERSION: runtimeMetadata.packageVersion ?? '',
      },
      cwd: process.cwd(),
    },
  );

  child.unref();
  fs.closeSync(outputFd);
  fs.closeSync(errorFd);

  return {
    pid: child.pid ?? null,
    logPath,
    startedAt: new Date().toISOString(),
    host: os.hostname(),
    targetPath: normalizedTargetPath,
    mode: normalizedMode,
    maxProjects: normalizedMaxProjects,
    packageVersion: runtimeMetadata.packageVersion,
    cliPath,
    nodePath: runtimeMetadata.nodePath,
  };
}
