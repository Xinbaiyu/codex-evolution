export const SCHEDULER_MODE_GLOBAL = 'global';
export const SCHEDULER_MODE_SINGLE = 'single';
export const DEFAULT_MAX_PROJECTS_PER_TICK = 10;

export function normalizeSchedulerMode(mode) {
  return mode === SCHEDULER_MODE_SINGLE ? SCHEDULER_MODE_SINGLE : SCHEDULER_MODE_GLOBAL;
}

export function normalizeMaxProjects(value, fallback = DEFAULT_MAX_PROJECTS_PER_TICK) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function modeFromTargetPath(targetPath) {
  return targetPath ? SCHEDULER_MODE_SINGLE : SCHEDULER_MODE_GLOBAL;
}
