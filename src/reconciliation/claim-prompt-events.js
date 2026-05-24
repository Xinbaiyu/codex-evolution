const DEFAULT_CLAIM_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 50;

function toIsoString(date) {
  return date.toISOString();
}

export function claimPromptEvents({
  repositories,
  projectKey,
  runId,
  now = new Date(),
  claimTimeoutMs = DEFAULT_CLAIM_TIMEOUT_MS,
  limit = DEFAULT_BATCH_LIMIT,
}) {
  const claimAt = toIsoString(now);
  const claimTimeoutBefore = toIsoString(new Date(now.getTime() - claimTimeoutMs));

  return repositories.promptEvents.claimBatch({
    projectKey,
    runId,
    claimAt,
    claimTimeoutBefore,
    limit,
  });
}

export function getDefaultClaimTimeoutMs() {
  return DEFAULT_CLAIM_TIMEOUT_MS;
}
