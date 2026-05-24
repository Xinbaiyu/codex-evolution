import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { prepareIsolatedCodexHome } from './prepare-isolated-codex-home.js';
import { ReconciliationProviderError } from './reconciliation-provider-error.js';
import { RECONCILIATION_OUTPUT_SCHEMA } from '../reconciliation/reconciliation-output-schema.js';

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 750;
const DEFAULT_EXEC_TIMEOUT_MS = 45_000;

const PROBE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: {
      type: 'string',
      const: 'ok',
    },
    summary: {
      type: 'string',
    },
  },
};

function getDefaultModel() {
  return process.env.CODEX_EVOLUTION_RECONCILE_MODEL || 'gpt-5.5';
}

function getDefaultMaxAttempts() {
  const raw = Number.parseInt(process.env.CODEX_EVOLUTION_RECONCILE_MAX_ATTEMPTS || '', 10);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_ATTEMPTS;
}

function getDefaultRetryDelayMs() {
  const raw = Number.parseInt(process.env.CODEX_EVOLUTION_RECONCILE_RETRY_DELAY_MS || '', 10);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_RETRY_DELAY_MS;
}

function getDefaultExecTimeoutMs() {
  const raw = Number.parseInt(process.env.CODEX_EVOLUTION_CODEX_EXEC_TIMEOUT_MS || '', 10);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_EXEC_TIMEOUT_MS;
}

export function buildCodexExecReconcileArgs({
  model = getDefaultModel(),
  schemaPath,
  outputPath,
  projectKey,
}) {
  return [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-user-config',
    '--ignore-rules',
    '--disable',
    'hooks',
    '--color',
    'never',
    '--model',
    model,
    '--output-schema',
    schemaPath,
    '--output-last-message',
    outputPath,
    '-C',
    projectKey,
    '-',
  ];
}

function buildCodexExecProbePrompt(projectKey) {
  return [
    'Return only a JSON object that matches the provided schema.',
    'Set `status` to `ok` and include a short `summary` string.',
    `The current project key is: ${projectKey}`,
  ].join('\n');
}

function createCommandFailureError({ exitCode, stdout, stderr }) {
  const error = new Error(
    `codex exec failed with exit code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
  error.exitCode = exitCode;
  error.stdout = stdout;
  error.stderr = stderr;
  return error;
}

function runCommand({
  command,
  args,
  cwd,
  stdinText,
  env,
  timeoutMs = getDefaultExecTimeoutMs(),
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');

      setTimeout(() => {
        child.kill('SIGKILL');
      }, 1_000).unref();
    }, timeoutMs);

    function clearAndReject(error) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutHandle);
      reject(error);
    }

    function clearAndResolve(value) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutHandle);
      resolve(value);
    }

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    child.on('error', (error) => {
      clearAndReject(error);
    });

    child.on('exit', (code, signal) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');

      if (timedOut) {
        clearAndReject(
          new CodexExecError({
            message: `codex exec timed out after ${timeoutMs}ms`,
            code: 'process_timeout',
            retryable: true,
            stdout,
            stderr,
            exitCode: code ?? null,
          }),
        );
        return;
      }

      if (signal) {
        clearAndReject(
          new CodexExecError({
            message: `codex exec exited due to signal ${signal}`,
            code: 'process_signal_exit',
            retryable: true,
            stdout,
            stderr,
            exitCode: code ?? null,
          }),
        );
        return;
      }

      if (code !== 0) {
        clearAndReject(createCommandFailureError({ exitCode: code, stdout, stderr }));
        return;
      }

      clearAndResolve({
        stdout,
        stderr,
      });
    });

    child.stdin.end(stdinText);
  });
}

function classifyCodexExecFailureMessage(haystack) {
  if (haystack.includes('auth.json not found')) {
    return { code: 'auth_missing', retryable: false };
  }

  if (
    haystack.includes('not logged in')
    || haystack.includes('login required')
    || haystack.includes('authentication')
    || haystack.includes('unauthorized')
  ) {
    return { code: 'auth_failed', retryable: false };
  }

  if (
    haystack.includes('tls handshake eof')
    || haystack.includes('failed to connect to websocket')
    || haystack.includes('transport channel closed')
    || haystack.includes('stream disconnected before completion')
    || haystack.includes('connection refused')
    || haystack.includes('connection reset')
  ) {
    return { code: 'transport_error', retryable: true };
  }

  if (
    haystack.includes('timeout waiting for child process to exit')
    || haystack.includes('timed out')
    || haystack.includes('deadline has elapsed')
    || haystack.includes('failed to refresh available models')
  ) {
    return { code: 'provider_timeout', retryable: true };
  }

  if (haystack.includes('yaml')) {
    return { code: 'config_parse_error', retryable: false };
  }

  return { code: 'unknown_provider_error', retryable: false };
}

export class CodexExecError extends ReconciliationProviderError {
  constructor({
    message,
    code,
    retryable,
    stdout = '',
    stderr = '',
    exitCode = null,
    cause = null,
  }) {
    super({
      name: 'CodexExecError',
      provider: 'codex-exec',
      message,
      code,
      retryable,
      stdout,
      stderr,
      exitCode,
      cause,
    });
  }
}

export function normalizeCodexExecError(error) {
  if (error instanceof CodexExecError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const stdout = error && typeof error === 'object' && 'stdout' in error ? error.stdout || '' : '';
  const stderr = error && typeof error === 'object' && 'stderr' in error ? error.stderr || '' : '';
  const exitCode =
    error && typeof error === 'object' && 'exitCode' in error ? error.exitCode ?? null : null;
  const haystack = `${message}\n${stdout}\n${stderr}`.toLowerCase();
  const classified = classifyCodexExecFailureMessage(haystack);

  return new CodexExecError({
    message,
    code: classified.code,
    retryable: classified.retryable,
    stdout,
    stderr,
    exitCode,
    cause: error instanceof Error ? error : null,
  });
}

export function summarizeCodexExecError(error) {
  const normalized = normalizeCodexExecError(error);

  return {
    name: normalized.name,
    provider: normalized.provider,
    code: normalized.code,
    retryable: normalized.retryable,
    status: null,
    exitCode: normalized.exitCode,
    message: normalized.message,
    stdout: normalized.stdout,
    stderr: normalized.stderr,
    responseBody: '',
  };
}

async function readJsonFileOrThrow(filePath) {
  let outputText;

  try {
    outputText = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new CodexExecError({
        message: `codex exec did not produce an output file: ${filePath}`,
        code: 'output_missing',
        retryable: true,
        cause: error,
      });
    }

    throw error;
  }

  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new CodexExecError({
      message: `codex exec produced invalid JSON output: ${filePath}`,
      code: 'invalid_output_json',
      retryable: false,
      cause: error,
    });
  }
}

async function runCodexExecJson({
  codexBinary,
  sourceCodexHome,
  runtimeRoot,
  model,
  runner,
  schema,
  prompt,
  projectKey,
  maxAttempts = getDefaultMaxAttempts(),
  retryDelayMs = getDefaultRetryDelayMs(),
  execTimeoutMs = getDefaultExecTimeoutMs(),
}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-evolution-reconcile-'));
    const schemaPath = path.join(tempDirectory, 'codex-output.schema.json');
    const outputPath = path.join(tempDirectory, 'codex-output.json');

    try {
      const isolatedCodex = await prepareIsolatedCodexHome({
        targetRoot: runtimeRoot || tempDirectory,
        sourceCodexHome,
      });

      await fs.writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');

      const args = buildCodexExecReconcileArgs({
        model,
        schemaPath,
        outputPath,
        projectKey,
      });

      const processResult = await runner({
        command: codexBinary,
        args,
        cwd: projectKey,
        stdinText: prompt,
        timeoutMs: execTimeoutMs,
        env: {
          ...process.env,
          HOME: isolatedCodex.home,
          CODEX_HOME: isolatedCodex.codexHome,
        },
      });

      const output = await readJsonFileOrThrow(outputPath);

      return {
        output,
        metadata: {
          model: model || getDefaultModel(),
          stdout: processResult.stdout,
          stderr: processResult.stderr,
          attempts: attempt,
        },
      };
    } catch (error) {
      const normalized = normalizeCodexExecError(error);
      lastError = normalized;

      if (!normalized.retryable || attempt >= maxAttempts) {
        throw normalized;
      }

      if (retryDelayMs > 0) {
        await delay(retryDelayMs);
      }
    } finally {
      await fs.rm(tempDirectory, { recursive: true, force: true });
    }
  }

  throw lastError;
}

export function createCodexExecReconciler({
  codexBinary,
  sourceCodexHome,
  runtimeRoot,
  model,
  runner = runCommand,
  maxAttempts,
  retryDelayMs,
  execTimeoutMs,
}) {
  return {
    async reconcile({ projectKey, prompt }) {
      return runCodexExecJson({
        codexBinary,
        sourceCodexHome,
        runtimeRoot,
        model,
        runner,
        schema: RECONCILIATION_OUTPUT_SCHEMA,
        prompt,
        projectKey,
        maxAttempts,
        retryDelayMs,
        execTimeoutMs,
      });
    },
  };
}

export function createCodexExecProbe({
  codexBinary,
  sourceCodexHome,
  runtimeRoot,
  model,
  runner = runCommand,
  maxAttempts = 1,
  retryDelayMs = 0,
  execTimeoutMs,
}) {
  return {
    async probe({ projectKey }) {
      return runCodexExecJson({
        codexBinary,
        sourceCodexHome,
        runtimeRoot,
        model,
        runner,
        schema: PROBE_OUTPUT_SCHEMA,
        prompt: buildCodexExecProbePrompt(projectKey),
        projectKey,
        maxAttempts,
        retryDelayMs,
        execTimeoutMs,
      });
    },
  };
}
