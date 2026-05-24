import fs from 'node:fs/promises';
import path from 'node:path';

async function normalizeDirectoryPath(inputPath) {
  const resolvedPath = path.resolve(inputPath);

  try {
    return await fs.realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findGitRoot(startDirectory) {
  let currentDirectory = startDirectory;

  while (true) {
    const gitDirectory = path.join(currentDirectory, '.git');
    if (await pathExists(gitDirectory)) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

export async function resolveProjectKey({ cwd }) {
  const launchCwd = await normalizeDirectoryPath(cwd);
  const gitRoot = await findGitRoot(launchCwd);
  const projectKey = gitRoot ? await normalizeDirectoryPath(gitRoot) : launchCwd;

  return {
    projectKey,
    launchCwd,
  };
}
