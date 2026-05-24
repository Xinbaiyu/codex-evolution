import { setTimeout as delay } from 'node:timers/promises';

import { ReconciliationProviderError } from './reconciliation-provider-error.js';

const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 750;
const DEFAULT_REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_MODEL = 'gpt-4.1-mini';

function getDefaultMaxAttempts() {
  const raw = Number.parseInt(process.env.CODEX_EVOLUTION_RECONCILE_MAX_ATTEMPTS || '', 10);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_ATTEMPTS;
}

function getDefaultRetryDelayMs() {
  const raw = Number.parseInt(process.env.CODEX_EVOLUTION_RECONCILE_RETRY_DELAY_MS || '', 10);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_RETRY_DELAY_MS;
}

function getDefaultRequestTimeoutMs() {
  const raw = Number.parseInt(process.env.CODEX_EVOLUTION_RECONCILE_TIMEOUT_MS || '', 10);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_REQUEST_TIMEOUT_MS;
}

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') {
    throw new OpenAICompatibleError({
      message: 'openai-compatible provider requires a baseUrl',
      code: 'provider_config_error',
      retryable: false,
    });
  }

  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function buildChatCompletionsUrl(baseUrl) {
  try {
    return new URL('chat/completions', normalizeBaseUrl(baseUrl)).toString();
  } catch (error) {
    throw new OpenAICompatibleError({
      message: `openai-compatible provider received an invalid baseUrl: ${baseUrl}`,
      code: 'provider_config_error',
      retryable: false,
      cause: error,
    });
  }
}

function buildDeveloperMessage() {
  return [
    'You reconcile project-specific user preferences into reusable structured experiences.',
    'Return only valid JSON.',
    'Do not wrap the JSON in markdown fences.',
    'Do not add explanatory text before or after the JSON.',
    'If you quote user text inside JSON strings, escape double quotes or use Chinese corner quotes.',
    'Follow any language requirements in the user prompt exactly.',
  ].join(' ');
}

function buildCompatibleUserPrompt(prompt) {
  return [
    'Provider instructions:',
    buildDeveloperMessage(),
    '',
    'User task:',
    prompt,
  ].join('\n');
}

function buildProbePrompt(projectKey) {
  return [
    'Return only a JSON object like {"status":"ok","summary":"..."} .',
    `Current project key: ${projectKey}`,
  ].join('\n');
}

function parseContentParts(parts) {
  return parts
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
        return part.text;
      }

      return '';
    })
    .join('');
}

function extractAssistantText(payload) {
  const message = payload?.choices?.[0]?.message;

  if (!message) {
    throw new OpenAICompatibleError({
      message: 'openai-compatible provider returned no assistant message',
      code: 'response_shape_error',
      retryable: false,
      responseBody: JSON.stringify(payload),
    });
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return parseContentParts(message.content);
  }

  throw new OpenAICompatibleError({
    message: 'openai-compatible provider returned unsupported message content',
    code: 'response_shape_error',
    retryable: false,
    responseBody: JSON.stringify(payload),
  });
}

function stripMarkdownCodeFence(text) {
  const trimmed = text.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const lines = trimmed.split('\n');

  if (lines.length >= 2 && lines.at(-1)?.startsWith('```')) {
    return lines.slice(1, -1).join('\n').trim();
  }

  return trimmed;
}

function getNextNonWhitespace(text, index) {
  for (let i = index + 1; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) {
      return text[i];
    }
  }

  return '';
}

function isEscapedQuote(text, index) {
  let backslashCount = 0;

  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function escapeBareQuotesInsideStrings(text) {
  let output = '';
  let inString = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char !== '"') {
      output += char;
      continue;
    }

    if (!inString) {
      inString = true;
      output += char;
      continue;
    }

    if (isEscapedQuote(text, index)) {
      output += char;
      continue;
    }

    const next = getNextNonWhitespace(text, index);
    const closesString = next === ':' || next === ',' || next === '}' || next === ']';

    if (closesString || next === '') {
      inString = false;
      output += char;
      continue;
    }

    output += '\\"';
  }

  return output;
}

function parseJsonOutput(text, payload) {
  const normalized = stripMarkdownCodeFence(text);

  try {
    return JSON.parse(normalized);
  } catch (error) {
    try {
      return JSON.parse(escapeBareQuotesInsideStrings(normalized));
    } catch {
      // Preserve the original parse error so diagnostics point to the model output as received.
    }

    throw new OpenAICompatibleError({
      message: 'openai-compatible provider returned invalid JSON content',
      code: 'invalid_output_json',
      retryable: false,
      responseBody: JSON.stringify(payload),
      cause: error,
    });
  }
}

function classifyHttpStatus(status) {
  if (status === 400) {
    return { code: 'bad_request', retryable: false };
  }

  if (status === 401 || status === 403) {
    return { code: 'auth_failed', retryable: false };
  }

  if (status === 404) {
    return { code: 'endpoint_not_found', retryable: false };
  }

  if (status === 408) {
    return { code: 'request_timeout', retryable: true };
  }

  if (status === 429) {
    return { code: 'rate_limited', retryable: true };
  }

  if (status >= 500) {
    return { code: 'server_error', retryable: true };
  }

  return { code: 'http_error', retryable: false };
}

export class OpenAICompatibleError extends ReconciliationProviderError {
  constructor({
    message,
    code,
    retryable,
    status = null,
    responseBody = '',
    cause = null,
  }) {
    super({
      name: 'OpenAICompatibleError',
      provider: 'openai-compatible',
      message,
      code,
      retryable,
      status,
      responseBody,
      cause,
    });
  }
}

async function postChatCompletion({
  baseUrl,
  apiKey,
  model,
  prompt,
  fetchImpl = fetch,
  timeoutMs = getDefaultRequestTimeoutMs(),
}) {
  if (!apiKey) {
    throw new OpenAICompatibleError({
      message: 'openai-compatible provider requires an API key',
      code: 'provider_config_error',
      retryable: false,
    });
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response;

  try {
    response = await fetchImpl(buildChatCompletionsUrl(baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: buildCompatibleUserPrompt(prompt),
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && typeof error === 'object' && error.name === 'AbortError') {
      throw new OpenAICompatibleError({
        message: `openai-compatible request timed out after ${timeoutMs}ms`,
        code: 'request_timeout',
        retryable: true,
        cause: error,
      });
    }

    throw new OpenAICompatibleError({
      message: error instanceof Error ? error.message : String(error),
      code: 'network_error',
      retryable: true,
      cause: error instanceof Error ? error : null,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  const responseBody = await response.text();

  if (!response.ok) {
    const classified = classifyHttpStatus(response.status);
    throw new OpenAICompatibleError({
      message: `openai-compatible request failed with status ${response.status}`,
      code: classified.code,
      retryable: classified.retryable,
      status: response.status,
      responseBody,
    });
  }

  let payload;

  try {
    payload = JSON.parse(responseBody);
  } catch (error) {
    throw new OpenAICompatibleError({
      message: 'openai-compatible provider returned invalid JSON response body',
      code: 'response_shape_error',
      retryable: false,
      responseBody,
      cause: error,
    });
  }

  const assistantText = extractAssistantText(payload);
  const output = parseJsonOutput(assistantText, payload);

  return {
    output,
    metadata: {
      provider: 'openai-compatible',
      model: payload.model || model || DEFAULT_MODEL,
      responseId: payload.id || null,
    },
  };
}

async function runWithRetries({
  baseUrl,
  apiKey,
  model,
  prompt,
  fetchImpl,
  maxAttempts = getDefaultMaxAttempts(),
  retryDelayMs = getDefaultRetryDelayMs(),
  requestTimeoutMs = getDefaultRequestTimeoutMs(),
}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await postChatCompletion({
        baseUrl,
        apiKey,
        model,
        prompt,
        fetchImpl,
        timeoutMs: requestTimeoutMs,
      });

      return {
        ...result,
        metadata: {
          ...result.metadata,
          attempts: attempt,
        },
      };
    } catch (error) {
      lastError = error;

      if (!(error instanceof OpenAICompatibleError) || !error.retryable || attempt >= maxAttempts) {
        throw error;
      }

      if (retryDelayMs > 0) {
        await delay(retryDelayMs);
      }
    }
  }

  throw lastError;
}

export function createOpenAICompatibleReconciler({
  baseUrl,
  apiKey,
  model,
  fetchImpl,
  maxAttempts,
  retryDelayMs,
  requestTimeoutMs,
}) {
  return {
    async reconcile({ prompt }) {
      return runWithRetries({
        baseUrl,
        apiKey,
        model,
        prompt,
        fetchImpl,
        maxAttempts,
        retryDelayMs,
        requestTimeoutMs,
      });
    },
  };
}

export function createOpenAICompatibleProbe({
  baseUrl,
  apiKey,
  model,
  fetchImpl,
  maxAttempts = 1,
  retryDelayMs = 0,
  requestTimeoutMs,
}) {
  return {
    async probe({ projectKey }) {
      return runWithRetries({
        baseUrl,
        apiKey,
        model,
        prompt: buildProbePrompt(projectKey),
        fetchImpl,
        maxAttempts,
        retryDelayMs,
        requestTimeoutMs,
      });
    },
  };
}
