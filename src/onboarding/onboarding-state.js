import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_INTERVAL_SECONDS = 3600;
const DEFAULT_MAX_PROJECTS = 10;

export function createDefaultOnboardingState() {
  return {
    onboardingCompletedAt: null,
    autoLearning: {
      enabled: false,
      intervalSeconds: DEFAULT_INTERVAL_SECONDS,
      mode: 'global',
      maxProjects: DEFAULT_MAX_PROJECTS,
      pid: null,
      startedAt: null,
      logPath: null,
      targetPath: null,
      packageVersion: null,
      cliPath: null,
      nodePath: null,
    },
  };
}

export async function loadOnboardingState(statePath) {
  try {
    const contents = await fs.readFile(statePath, 'utf8');
    const parsed = JSON.parse(contents);

    return {
      ...createDefaultOnboardingState(),
      ...parsed,
      autoLearning: {
        ...createDefaultOnboardingState().autoLearning,
        ...(parsed?.autoLearning || {}),
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return createDefaultOnboardingState();
    }

    throw error;
  }
}

export async function saveOnboardingState(statePath, state) {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
