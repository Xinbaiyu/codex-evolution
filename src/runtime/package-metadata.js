import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const cliPath = fileURLToPath(new URL('../cli.js', import.meta.url));

let cachedPackageVersion = null;

export function readPackageVersion({ readFileSyncFn = fs.readFileSync } = {}) {
  if (cachedPackageVersion) {
    return cachedPackageVersion;
  }

  const packageJson = JSON.parse(readFileSyncFn(packageJsonPath, 'utf8'));
  cachedPackageVersion = packageJson.version ?? null;

  return cachedPackageVersion;
}

export function getCurrentRuntimeMetadata({
  packageVersion = readPackageVersion(),
  resolvedCliPath = cliPath,
  nodePath = process.execPath,
} = {}) {
  return {
    packageVersion,
    cliPath: path.resolve(resolvedCliPath),
    nodePath,
  };
}

export function isWatcherRuntimeCurrent(watcherRuntime, currentRuntime = getCurrentRuntimeMetadata()) {
  return (
    Boolean(watcherRuntime?.packageVersion)
    && watcherRuntime.packageVersion === currentRuntime.packageVersion
    && Boolean(watcherRuntime?.cliPath)
    && path.resolve(watcherRuntime.cliPath) === path.resolve(currentRuntime.cliPath)
    && Boolean(watcherRuntime?.nodePath)
    && watcherRuntime.nodePath === currentRuntime.nodePath
  );
}
