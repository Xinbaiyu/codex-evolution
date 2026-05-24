const SUPPORTED_PROVIDERS = new Set(['openai-compatible', 'codex-exec']);

export function assertSupportedReconcileProvider(provider) {
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(
      `unsupported reconcile provider for config:init: ${provider}. ` +
        `Supported providers: ${Array.from(SUPPORTED_PROVIDERS).join(', ')}`,
    );
  }
}

export function buildDefaultConfig({
  provider = 'openai-compatible',
} = {}) {
  assertSupportedReconcileProvider(provider);

  if (provider === 'codex-exec') {
    return {
      reconcile: {
        provider: 'codex-exec',
        model: 'gpt-5.5',
        timeoutMs: 45000,
        maxAttempts: 2,
        retryDelayMs: 750,
      },
    };
  }

  return {
    reconcile: {
      provider: 'openai-compatible',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
      timeoutMs: 90000,
      maxAttempts: 2,
      retryDelayMs: 750,
    },
  };
}

export function stringifyConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}
