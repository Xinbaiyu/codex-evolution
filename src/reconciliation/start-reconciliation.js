import { withTransaction } from '../storage/database.js';
import { claimPromptEvents } from './claim-prompt-events.js';
import { createReconciliationRun } from './create-reconciliation-run.js';
import { prepareReconciliationInput } from './prepare-reconciliation-input.js';

const DEFAULT_RUNNING_RUN_TIMEOUT_MS = 30 * 60 * 1000;

function isRunningRunStale(run, now, timeoutMs) {
  const createdAtMs = Date.parse(run.created_at);

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  return now.getTime() - createdAtMs > timeoutMs;
}

function buildStaleRunSummary({ run, now, timeoutMs }) {
  const createdAtMs = Date.parse(run.created_at);
  const ageMs = Number.isFinite(createdAtMs) ? now.getTime() - createdAtMs : null;

  return JSON.stringify({
    provider: 'codex-evolution',
    code: 'stale_running_run',
    message: 'running reconciliation run exceeded the stale timeout and was released',
    staleRunId: run.id,
    staleTimeoutMs: timeoutMs,
    staleAgeMs: ageMs,
  });
}

export function startReconciliation({
  database,
  repositories,
  projectKey,
  modelName,
  now = new Date(),
  claimTimeoutMs,
  runningRunTimeoutMs = DEFAULT_RUNNING_RUN_TIMEOUT_MS,
  limit,
}) {
  const existingRun = repositories.reconciliationRuns.findRunningByProjectKey(projectKey);
  if (existingRun) {
    if (!isRunningRunStale(existingRun, now, runningRunTimeoutMs)) {
      return {
        skipped: true,
        reason: 'running-run-exists',
        run: existingRun,
      };
    }

    withTransaction(database, () => {
      repositories.reconciliationRuns.markFailed({
        id: existingRun.id,
        completedAt: now.toISOString(),
        summaryJson: buildStaleRunSummary({
          run: existingRun,
          now,
          timeoutMs: runningRunTimeoutMs,
        }),
      });
      repositories.promptEvents.releaseClaimByRunId(existingRun.id);
    });
  }

  const run = createReconciliationRun({
    projectKey,
    modelName,
    now: now.toISOString(),
  });

  const claimedPrompts = withTransaction(database, () => {
    repositories.reconciliationRuns.insert(run);
    return claimPromptEvents({
      repositories,
      projectKey,
      runId: run.id,
      now,
      claimTimeoutMs,
      limit,
    });
  });

  const input = prepareReconciliationInput({
    repositories,
    projectKey,
    runId: run.id,
    now: now.toISOString(),
  });

  if (claimedPrompts.length === 0) {
    repositories.reconciliationRuns.markSucceeded({
      id: run.id,
      promptCount: 0,
      inputExperienceCount: input.experiences.length,
      outputExperienceCount: 0,
      summaryJson: JSON.stringify({
        reason: 'no-unprocessed-prompts',
      }),
    });

    return {
      skipped: true,
      reason: 'no-unprocessed-prompts',
      run: repositories.reconciliationRuns.getById(run.id),
      claimedPrompts: [],
      input,
    };
  }

  return {
    skipped: false,
    run,
    claimedPrompts,
    input,
  };
}

export function getDefaultRunningRunTimeoutMs() {
  return DEFAULT_RUNNING_RUN_TIMEOUT_MS;
}
