import path from 'node:path';
import process from 'node:process';

import { redactReconcileConfig } from '../config/redact-reconcile-config.js';
import { applyProjectGuidancePolicy } from '../guidance/apply-project-guidance-policy.js';
import { loadOnboardingState } from '../onboarding/onboarding-state.js';
import { resolveProjectKey } from '../project/resolve-project-key.js';
import { isProcessAlive } from '../scheduler/start-detached-scheduler-watch.js';
import { ensureDatabaseReady } from '../storage/database.js';

function parseRunSummary(summaryJson) {
  if (!summaryJson) {
    return null;
  }

  try {
    return JSON.parse(summaryJson);
  } catch {
    return {
      raw: summaryJson,
    };
  }
}

export async function runReconcileStatusCommand({ appContext, targetPath }) {
  const launchCwd = targetPath ? path.resolve(targetPath) : process.cwd();
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const project = await resolveProjectKey({ cwd: launchCwd });
    const onboardingState = await loadOnboardingState(appContext.statePath);
    applyProjectGuidancePolicy({
      repositories,
      projectKey: project.projectKey,
    });

    const promptTotal = repositories.promptEvents.countByProjectKey(project.projectKey);
    const promptPending = repositories.promptEvents.countPendingByProjectKey(project.projectKey);
    const promptIgnored = repositories.promptEvents.countIgnoredByProjectKey(project.projectKey);
    const promptIgnoredByEngine = repositories.promptEvents.countByLearningDecision({
      projectKey: project.projectKey,
      decisions: ['engine_ignored'],
    });
    const promptIgnoredByLlm = repositories.promptEvents.countByLearningDecision({
      projectKey: project.projectKey,
      decisions: ['llm_ignored'],
    });
    const promptSelectedByLlm = repositories.promptEvents.countByLearningDecision({
      projectKey: project.projectKey,
      decisions: ['llm_selected'],
    });
    const recentRuns = repositories.reconciliationRuns
      .listRecentByProjectKey(project.projectKey, 5)
      .map((run) => ({
        id: run.id,
        status: run.status,
        modelName: run.model_name,
        promptCount: run.prompt_count,
        inputExperienceCount: run.input_experience_count,
        outputExperienceCount: run.output_experience_count,
        createdAt: run.created_at,
        completedAt: run.completed_at,
        summary: parseRunSummary(run.summary_json),
      }));
    const activeExperiences = repositories.experiences
      .listByProjectAndStatuses({
        projectKey: project.projectKey,
        statuses: ['active', 'decaying'],
        limit: 10,
      })
      .map((experience) => ({
        id: experience.id,
        kind: experience.kind,
        title: experience.title,
        canonicalText: experience.canonical_text,
        canonicalLanguage: experience.canonical_language ?? 'zh',
        status: experience.status,
        rankOrder: experience.rank_order,
        hitCount: experience.hit_count,
        lastSeenAt: experience.last_seen_at,
        lastReconciledAt: experience.last_reconciled_at,
      }));
    const candidateExperiences = repositories.experiences
      .listByProjectAndStatuses({
        projectKey: project.projectKey,
        statuses: ['candidate'],
        limit: 5,
      })
      .map((experience) => ({
        id: experience.id,
        kind: experience.kind,
        title: experience.title,
        canonicalText: experience.canonical_text,
        canonicalLanguage: experience.canonical_language ?? 'zh',
        status: experience.status,
        rankOrder: experience.rank_order,
        hitCount: experience.hit_count,
        lastSeenAt: experience.last_seen_at,
        lastReconciledAt: experience.last_reconciled_at,
      }));

    console.log(
      JSON.stringify(
        {
          projectKey: project.projectKey,
          launchCwd: project.launchCwd,
          reconcile: redactReconcileConfig(appContext.reconcileConfig),
          autoLearning: {
            enabled: onboardingState.autoLearning.enabled,
            intervalSeconds: onboardingState.autoLearning.intervalSeconds,
            mode: onboardingState.autoLearning.mode ?? 'global',
            maxProjects: onboardingState.autoLearning.maxProjects ?? 10,
            pid: onboardingState.autoLearning.pid,
            running: isProcessAlive(onboardingState.autoLearning.pid),
            startedAt: onboardingState.autoLearning.startedAt,
            logPath: onboardingState.autoLearning.logPath,
            targetPath: onboardingState.autoLearning.targetPath ?? null,
            packageVersion: onboardingState.autoLearning.packageVersion ?? null,
            cliPath: onboardingState.autoLearning.cliPath ?? null,
            nodePath: onboardingState.autoLearning.nodePath ?? null,
            onboardingCompletedAt: onboardingState.onboardingCompletedAt,
          },
          prompts: {
            total: promptTotal,
            pending: promptPending,
            ignored: promptIgnored,
            ignoredByEngine: promptIgnoredByEngine,
            ignoredByLlm: promptIgnoredByLlm,
            selectedByLlm: promptSelectedByLlm,
            processed: promptTotal - promptPending,
          },
          recentRuns,
          activeExperiences,
          candidateExperiences,
        },
        null,
        2,
      ),
    );
  } finally {
    database.close();
  }
}
