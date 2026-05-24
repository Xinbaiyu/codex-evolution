import { ExperienceRepository } from './experience-repository.js';
import { LauncherSessionRepository } from './launcher-session-repository.js';
import { PromptEventRepository } from './prompt-event-repository.js';
import { ReconciliationRunRepository } from './reconciliation-run-repository.js';

export function createRepositories(database) {
  return {
    promptEvents: new PromptEventRepository(database),
    experiences: new ExperienceRepository(database),
    reconciliationRuns: new ReconciliationRunRepository(database),
    launcherSessions: new LauncherSessionRepository(database),
  };
}
