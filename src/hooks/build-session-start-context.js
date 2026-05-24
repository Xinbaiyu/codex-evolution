import { resolveProjectKey } from '../project/resolve-project-key.js';
import { renderRuntimeContext } from '../runtime/render-runtime-context.js';
import { normalizeSessionStartPayload } from './normalize-session-start-payload.js';

export async function buildSessionStartContext({
  payload,
  fallbackCwd,
  repositories,
  resolveProjectKeyFn = resolveProjectKey,
  renderRuntimeContextFn = renderRuntimeContext,
}) {
  const normalizedPayload = normalizeSessionStartPayload({
    payload,
    fallbackCwd,
  });
  const project = await resolveProjectKeyFn({
    cwd: normalizedPayload.cwd,
  });

  const experiences = repositories.experiences.listByProjectAndStatuses({
    projectKey: project.projectKey,
    statuses: ['active', 'decaying'],
    limit: 50,
  });

  return {
    projectKey: project.projectKey,
    launchCwd: project.launchCwd,
    experienceCount: experiences.length,
    additionalContext: renderRuntimeContextFn({
      projectKey: project.projectKey,
      experiences,
    }),
  };
}
