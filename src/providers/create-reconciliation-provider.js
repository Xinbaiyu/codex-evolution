import path from 'node:path';

import {
  createCodexExecProbe,
  createCodexExecReconciler,
} from './codex-exec-reconciler.js';
import {
  createOpenAICompatibleProbe,
  createOpenAICompatibleReconciler,
} from './openai-compatible-reconciler.js';

function resolveRuntimeRoot(appContext, folderName) {
  return path.join(appContext.homeDirectory, folderName);
}

export function createReconciliationProvider({ appContext }) {
  const config = appContext.reconcileConfig;

  if (config.provider === 'codex-exec') {
    return createCodexExecReconciler({
      codexBinary: appContext.codexBinary,
      sourceCodexHome: appContext.sourceCodexHome,
      runtimeRoot: resolveRuntimeRoot(appContext, 'codex-exec-runtime'),
      model: config.model || undefined,
      maxAttempts: config.maxAttempts,
      retryDelayMs: config.retryDelayMs,
      execTimeoutMs: config.timeoutMs,
    });
  }

  if (config.provider === 'openai-compatible') {
    return createOpenAICompatibleReconciler({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model || undefined,
      maxAttempts: config.maxAttempts,
      retryDelayMs: config.retryDelayMs,
      requestTimeoutMs: config.timeoutMs,
    });
  }

  throw new Error(`unsupported reconcile provider: ${config.provider}`);
}

export function createReconciliationProbe({ appContext }) {
  const config = appContext.reconcileConfig;

  if (config.provider === 'codex-exec') {
    return createCodexExecProbe({
      codexBinary: appContext.codexBinary,
      sourceCodexHome: appContext.sourceCodexHome,
      runtimeRoot: resolveRuntimeRoot(appContext, 'codex-exec-runtime'),
      model: config.model || undefined,
      maxAttempts: 1,
      retryDelayMs: 0,
      execTimeoutMs: config.timeoutMs,
    });
  }

  if (config.provider === 'openai-compatible') {
    return createOpenAICompatibleProbe({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model || undefined,
      maxAttempts: 1,
      retryDelayMs: 0,
      requestTimeoutMs: config.timeoutMs,
    });
  }

  throw new Error(`unsupported reconcile provider: ${config.provider}`);
}
