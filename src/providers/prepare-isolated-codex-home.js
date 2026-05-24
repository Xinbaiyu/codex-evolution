import fs from 'node:fs/promises';
import path from 'node:path';

const AUTH_FILES = ['auth.json', 'installation_id', 'version.json'];

async function copyFileIfExists(sourcePath, targetPath) {
  try {
    await fs.copyFile(sourcePath, targetPath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

export async function prepareIsolatedCodexHome({
  targetRoot,
  sourceCodexHome,
}) {
  const isolatedHome = path.join(targetRoot, 'home');
  const isolatedCodexHome = path.join(isolatedHome, '.codex');

  await fs.mkdir(isolatedCodexHome, { recursive: true });

  let copiedAuth = false;

  for (const fileName of AUTH_FILES) {
    const copied = await copyFileIfExists(
      path.join(sourceCodexHome, fileName),
      path.join(isolatedCodexHome, fileName),
    );

    if (fileName === 'auth.json' && copied) {
      copiedAuth = true;
    }
  }

  if (!copiedAuth) {
    throw new Error(`auth.json not found in source CODEX_HOME: ${sourceCodexHome}`);
  }

  return {
    home: isolatedHome,
    codexHome: isolatedCodexHome,
  };
}
