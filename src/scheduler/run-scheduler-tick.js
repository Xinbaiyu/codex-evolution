import { applyProjectDecay } from '../decay/apply-project-decay.js';
import { applyProjectGuidancePolicy } from '../guidance/apply-project-guidance-policy.js';
import { summarizeReconciliationProviderError } from '../providers/reconciliation-provider-error.js';
import { applyReconciliationOutput } from '../reconciliation/apply-reconciliation-output.js';
import { buildReconciliationPrompt } from '../reconciliation/build-reconciliation-prompt.js';
import { startReconciliation } from '../reconciliation/start-reconciliation.js';
import { validateReconciliationOutput } from '../reconciliation/validate-reconciliation-output.js';

function toErrorSummary(error) {
  const details = summarizeReconciliationProviderError(error);
  return JSON.stringify(details);
}

export async function runSchedulerTick({
  database,
  repositories,
  projectKey,
  reconciler,
  modelName = 'pending-llm',
  policyText,
  policySource,
}) {
  const maintenance = applyProjectGuidancePolicy({
    repositories,
    projectKey,
  });
  const decay = applyProjectDecay({
    repositories,
    projectKey,
  });

  const reconcile = startReconciliation({
    database,
    repositories,
    projectKey,
    modelName,
  });

  if (reconcile.skipped) {
    return {
      projectKey,
      maintenance,
      decay,
      reconcile,
    };
  }

  const prompt = buildReconciliationPrompt(reconcile.input, {
    policyText,
    policySource,
  });

  try {
    const providerResult = await reconciler.reconcile({
      projectKey,
      prompt,
    });
    const validatedOutput = validateReconciliationOutput(providerResult.output);
    const applied = applyReconciliationOutput({
      database,
      repositories,
      runId: reconcile.run.id,
      projectKey,
      output: {
        inputExperienceCount: reconcile.input.experiences.length,
        experiences: validatedOutput.experiences,
      },
    });

    return {
      projectKey,
      maintenance,
      decay,
      reconcile: {
        skipped: false,
        run: repositories.reconciliationRuns.getById(reconcile.run.id),
        claimedPromptCount: reconcile.claimedPrompts.length,
        applied,
        modelOutput: validatedOutput,
      },
    };
  } catch (error) {
    repositories.reconciliationRuns.markFailed({
      id: reconcile.run.id,
      summaryJson: toErrorSummary(error),
    });
    repositories.promptEvents.releaseClaimByRunId(reconcile.run.id);
    throw error;
  }
}
