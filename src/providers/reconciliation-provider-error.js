export class ReconciliationProviderError extends Error {
  constructor({
    name = 'ReconciliationProviderError',
    provider,
    message,
    code,
    retryable,
    status = null,
    exitCode = null,
    stdout = '',
    stderr = '',
    responseBody = '',
    cause = null,
  }) {
    super(message);
    this.name = name;
    this.provider = provider;
    this.code = code;
    this.retryable = retryable;
    this.status = status;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.responseBody = responseBody;
    this.cause = cause;
  }
}

export function summarizeReconciliationProviderError(error) {
  if (error instanceof ReconciliationProviderError) {
    return {
      name: error.name,
      provider: error.provider,
      code: error.code,
      retryable: error.retryable,
      status: error.status,
      exitCode: error.exitCode,
      message: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
      responseBody: error.responseBody,
    };
  }

  const message = error instanceof Error ? error.message : String(error);

  return {
    name: error instanceof Error ? error.name : 'Error',
    provider: 'unknown',
    code: 'unknown_provider_error',
    retryable: false,
    status: null,
    exitCode: null,
    message,
    stdout: '',
    stderr: '',
    responseBody: '',
  };
}
