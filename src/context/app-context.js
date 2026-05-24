import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { resolveReconciliationPolicyPath } from '../reconciliation/reconciliation-policy.js';
import { createDatabase } from '../storage/database.js';
import { createRepositories } from '../storage/repositories/index.js';

function resolveCodexEvolutionHome() {
  return process.env.CODEX_EVOLUTION_HOME || path.join(homedir(), '.codex-evolution');
}

function resolveDatabasePath(homeDirectory) {
  return process.env.CODEX_EVOLUTION_DB_PATH || path.join(homeDirectory, 'codex-evolution.db');
}

function resolveConfigPath(homeDirectory) {
  return process.env.CODEX_EVOLUTION_CONFIG_PATH || path.join(homeDirectory, 'config.json');
}

function resolveStatePath(homeDirectory) {
  return process.env.CODEX_EVOLUTION_STATE_PATH || path.join(homeDirectory, 'state.json');
}

function resolveCodexBinary() {
  return process.env.CODEX_EVOLUTION_CODEX_BIN || 'codex';
}

function resolveSourceCodexHome() {
  return process.env.CODEX_HOME || path.join(homedir(), '.codex');
}

function readJsonFileIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return {};
    }

    throw new Error(`failed to read config file ${filePath}: ${error.message}`);
  }
}

function resolveSecretValue({ explicitValue, envName, fallbackEnvNames = [] }) {
  if (explicitValue) {
    return explicitValue;
  }

  if (envName && process.env[envName]) {
    return process.env[envName];
  }

  for (const name of fallbackEnvNames) {
    if (process.env[name]) {
      return process.env[name];
    }
  }

  return null;
}

function resolveNumberOverride({ min = 0 }, ...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const parsed = Number.parseInt(String(value), 10);

    if (Number.isInteger(parsed) && parsed >= min) {
      return parsed;
    }
  }

  return undefined;
}

function resolveReconcileConfig(configFile, homeDirectory) {
  const fileConfig =
    configFile && typeof configFile === 'object' && configFile.reconcile
      ? configFile.reconcile
      : {};
  const policyPath = resolveReconciliationPolicyPath({
    homeDirectory,
    policyPath:
      process.env.CODEX_EVOLUTION_RECONCILE_POLICY_PATH
      || fileConfig.policyPath
      || fileConfig.promptTemplatePath
      || null,
  });

  return {
    provider: process.env.CODEX_EVOLUTION_RECONCILE_PROVIDER || fileConfig.provider || 'codex-exec',
    model: process.env.CODEX_EVOLUTION_RECONCILE_MODEL || fileConfig.model || null,
    baseUrl:
      process.env.CODEX_EVOLUTION_RECONCILE_BASE_URL
      || fileConfig.baseUrl
      || fileConfig.baseURL
      || process.env.OPENAI_BASE_URL
      || 'https://api.openai.com/v1',
    apiKey: resolveSecretValue({
      explicitValue: process.env.CODEX_EVOLUTION_RECONCILE_API_KEY || fileConfig.apiKey || null,
      envName: fileConfig.apiKeyEnv,
      fallbackEnvNames: ['OPENAI_API_KEY'],
    }),
    timeoutMs: resolveNumberOverride(
      { min: 1 },
      process.env.CODEX_EVOLUTION_RECONCILE_TIMEOUT_MS,
      fileConfig.timeoutMs,
    ),
    maxAttempts: resolveNumberOverride(
      { min: 1 },
      process.env.CODEX_EVOLUTION_RECONCILE_MAX_ATTEMPTS,
      fileConfig.maxAttempts,
    ),
    retryDelayMs: resolveNumberOverride(
      { min: 0 },
      process.env.CODEX_EVOLUTION_RECONCILE_RETRY_DELAY_MS,
      fileConfig.retryDelayMs,
    ),
    policyPath,
  };
}

export function createDefaultAppContext() {
  const homeDirectory = resolveCodexEvolutionHome();
  const databasePath = resolveDatabasePath(homeDirectory);
  const configPath = resolveConfigPath(homeDirectory);
  const statePath = resolveStatePath(homeDirectory);
  const codexBinary = resolveCodexBinary();
  const sourceCodexHome = resolveSourceCodexHome();
  const configFile = readJsonFileIfExists(configPath);
  const reconcileConfig = resolveReconcileConfig(configFile, homeDirectory);

  return {
    homeDirectory,
    databasePath,
    configPath,
    statePath,
    configFileExists: fs.existsSync(configPath),
    reconcileConfig,
    codexBinary,
    sourceCodexHome,
    createDatabase: () => createDatabase({ databasePath }),
    createRepositories(database) {
      return createRepositories(database);
    },
  };
}
