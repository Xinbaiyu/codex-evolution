import { randomUUID } from 'node:crypto';

export function createReconciliationRun({
  projectKey,
  modelName = 'pending-llm',
  now = new Date().toISOString(),
}) {
  return {
    id: randomUUID(),
    projectKey,
    windowStart: now,
    windowEnd: now,
    status: 'running',
    promptCount: 0,
    inputExperienceCount: 0,
    outputExperienceCount: 0,
    modelName,
    createdAt: now,
  };
}
