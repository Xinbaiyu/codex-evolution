export function redactReconcileConfig(config) {
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs ?? null,
    maxAttempts: config.maxAttempts ?? null,
    retryDelayMs: config.retryDelayMs ?? null,
    policyPath: config.policyPath ?? null,
    apiKeyPresent: Boolean(config.apiKey),
  };
}
