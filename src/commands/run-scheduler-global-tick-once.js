import { createReconciliationProvider as defaultCreateReconciliationProvider } from '../providers/create-reconciliation-provider.js';
import { summarizeReconciliationProviderError } from '../providers/reconciliation-provider-error.js';
import { loadReconciliationPolicy as defaultLoadReconciliationPolicy } from '../reconciliation/reconciliation-policy.js';
import { runSchedulerTick as defaultRunSchedulerTick } from '../scheduler/run-scheduler-tick.js';
import { DEFAULT_MAX_PROJECTS_PER_TICK, normalizeMaxProjects } from '../scheduler/scheduler-mode.js';
import { ensureDatabaseReady } from '../storage/database.js';
import { buildReconciliationModelName } from './run-scheduler-tick-once.js';

function summarizeProjectResults(projectResults) {
  return projectResults.reduce(
    (summary, item) => ({
      successProjectCount: summary.successProjectCount + (item.status === 'success' ? 1 : 0),
      skippedProjectCount: summary.skippedProjectCount + (item.status === 'skipped' ? 1 : 0),
      failedProjectCount: summary.failedProjectCount + (item.status === 'failed' ? 1 : 0),
    }),
    {
      successProjectCount: 0,
      skippedProjectCount: 0,
      failedProjectCount: 0,
    },
  );
}

export async function runSchedulerGlobalTickOnce({
  appContext,
  maxProjects = DEFAULT_MAX_PROJECTS_PER_TICK,
  createReconciliationProviderFn = defaultCreateReconciliationProvider,
  loadReconciliationPolicyFn = defaultLoadReconciliationPolicy,
  runSchedulerTickFn = defaultRunSchedulerTick,
}) {
  const normalizedMaxProjects = normalizeMaxProjects(maxProjects);
  const database = appContext.createDatabase();

  try {
    ensureDatabaseReady(database);
    const repositories = appContext.createRepositories(database);
    const projectSummaries = repositories.promptEvents.listPendingProjectSummaries({
      limit: normalizedMaxProjects,
    });

    if (projectSummaries.length === 0) {
      return {
        result: {
          mode: 'global',
          skipped: true,
          reason: 'no-unprocessed-projects',
          maxProjects: normalizedMaxProjects,
          discoveredProjectCount: 0,
          attemptedProjectCount: 0,
          successProjectCount: 0,
          skippedProjectCount: 0,
          failedProjectCount: 0,
          projectResults: [],
        },
      };
    }

    const reconciler = createReconciliationProviderFn({
      appContext,
    });
    const policy = await loadReconciliationPolicyFn({
      appContext,
    });
    const projectResults = [];

    for (const projectSummary of projectSummaries) {
      try {
        const tickResult = await runSchedulerTickFn({
          database,
          repositories,
          projectKey: projectSummary.projectKey,
          reconciler,
          modelName: buildReconciliationModelName(appContext),
          policyText: policy.policyText,
          policySource: policy.source,
        });

        projectResults.push({
          projectKey: projectSummary.projectKey,
          pendingCount: projectSummary.pendingCount,
          oldestPendingAt: projectSummary.oldestPendingAt,
          newestPendingAt: projectSummary.newestPendingAt,
          status: tickResult.reconcile.skipped ? 'skipped' : 'success',
          result: tickResult,
        });
      } catch (error) {
        projectResults.push({
          projectKey: projectSummary.projectKey,
          pendingCount: projectSummary.pendingCount,
          oldestPendingAt: projectSummary.oldestPendingAt,
          newestPendingAt: projectSummary.newestPendingAt,
          status: 'failed',
          error: summarizeReconciliationProviderError(error),
        });
      }
    }

    return {
      result: {
        mode: 'global',
        skipped: false,
        maxProjects: normalizedMaxProjects,
        discoveredProjectCount: projectSummaries.length,
        attemptedProjectCount: projectResults.length,
        ...summarizeProjectResults(projectResults),
        projectResults,
      },
    };
  } finally {
    database.close();
  }
}
