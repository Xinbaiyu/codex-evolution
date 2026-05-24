import fs from 'node:fs/promises';
import path from 'node:path';

import {
  getDefaultHooksPath,
  getSessionStartHookCommand,
  getUserPromptSubmitHookCommand,
  isEquivalentSessionStartHookCommand,
  isEquivalentUserPromptSubmitHookCommand,
  loadHooksConfig,
} from './install-user-prompt-submit-hook.js';

export function getDefaultCodexConfigPath(sourceCodexHome) {
  return path.join(sourceCodexHome, 'config.toml');
}

function normalizeHooksEntries(hooksConfig, eventName) {
  return Array.isArray(hooksConfig?.hooks?.[eventName])
    ? hooksConfig.hooks[eventName]
    : [];
}

export function inspectHookEntries({
  hooksConfig,
  eventName,
  expectedCommand,
  isEquivalentCommand,
}) {
  const entries = normalizeHooksEntries(hooksConfig, eventName);
  const matchingHooks = [];
  const allHooks = [];

  entries.forEach((entry, entryIndex) => {
    const hooks = Array.isArray(entry?.hooks) ? entry.hooks : [];

    hooks.forEach((hook, hookIndex) => {
      if (!hook || typeof hook !== 'object') {
        return;
      }

      const summary = {
        entryIndex,
        hookIndex,
        type: hook.type ?? null,
        command: typeof hook.command === 'string' ? hook.command : null,
        timeout: Number.isInteger(hook.timeout) ? hook.timeout : null,
        matchesExpectedCommand:
          hook.type === 'command'
          && (hook.command === expectedCommand || isEquivalentCommand(hook.command)),
      };

      allHooks.push(summary);

      if (summary.matchesExpectedCommand) {
        matchingHooks.push(summary);
      }
    });
  });

  return {
    totalEntries: entries.length,
    totalHooks: allHooks.length,
    installed: matchingHooks.length > 0,
    matchingHooks,
    allHooks,
  };
}

export function inspectUserPromptSubmitHooks({
  hooksConfig,
  expectedCommand,
}) {
  return inspectHookEntries({
    hooksConfig,
    eventName: 'UserPromptSubmit',
    expectedCommand,
    isEquivalentCommand: isEquivalentUserPromptSubmitHookCommand,
  });
}

export function inspectSessionStartHooks({
  hooksConfig,
  expectedCommand,
}) {
  return inspectHookEntries({
    hooksConfig,
    eventName: 'SessionStart',
    expectedCommand,
    isEquivalentCommand: isEquivalentSessionStartHookCommand,
  });
}

function extractSectionName(line) {
  const match = line.match(/^\[(.+)\]\s*$/);
  return match ? match[1] : null;
}

export function extractHooksFeatureEnabled(configTomlText) {
  const lines = configTomlText.split(/\r?\n/);
  let currentSection = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const sectionName = extractSectionName(line);

    if (sectionName) {
      currentSection = sectionName;
      continue;
    }

    if (currentSection !== 'features') {
      continue;
    }

    const match = line.match(/^hooks\s*=\s*(true|false)\s*$/);
    if (match) {
      return match[1] === 'true';
    }
  }

  return null;
}

export function extractTrustedHookStates(configTomlText) {
  const lines = configTomlText.split(/\r?\n/);
  const stateMap = new Map();
  let currentStateKey = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const sectionMatch = line.match(/^\[hooks\.state\."(.+)"\]\s*$/);

    if (sectionMatch) {
      currentStateKey = sectionMatch[1];
      stateMap.set(currentStateKey, {
        present: true,
        trustedHash: null,
      });
      continue;
    }

    if (!currentStateKey) {
      continue;
    }

    const trustedMatch = line.match(/^trusted_hash\s*=\s*"(.+)"\s*$/);
    if (trustedMatch) {
      stateMap.set(currentStateKey, {
        present: true,
        trustedHash: trustedMatch[1],
      });
    }
  }

  return stateMap;
}

function buildHookStateKey({ hooksPath, stateEventName, entryIndex, hookIndex }) {
  return `${hooksPath}:${stateEventName}:${entryIndex}:${hookIndex}`;
}

function summarizeDiagnosis({
  hooksFeatureEnabled,
  inspection,
  trustedMatches,
  codexConfigExists,
  hookLabel,
  hookCommandName,
}) {
  if (!inspection.installed) {
    return {
      status: 'missing_hook',
      message: `未发现 codex-evolution 的 ${hookLabel} hook，请先运行 \`cdxe hooks:install\`。`,
    };
  }

  if (!codexConfigExists) {
    return {
      status: 'missing_codex_config',
      message: '未找到 Codex 的 config.toml，暂时无法确认 hook trust 状态。',
    };
  }

  if (hooksFeatureEnabled === false) {
    return {
      status: 'hooks_disabled',
      message: 'Codex hooks 功能当前未启用，请在 ~/.codex/config.toml 的 [features] 中开启 hooks = true。',
    };
  }

  if (trustedMatches.length === 0) {
    return {
      status: 'untrusted_hook',
      message:
        `hook 已安装但尚未被 Codex trust。请启动 Codex 后执行 /hooks，并 trust 我们这条 ${hookCommandName} 命令。`,
    };
  }

  return {
    status: 'ready',
    message: `${hookLabel} hook 已安装且已 trust。`,
  };
}

async function readTextFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function doctorHook({
  sourceCodexHome,
  hooksPath,
  expectedCommand,
  eventName,
  stateEventName,
  hookLabel,
  hookCommandName,
  isEquivalentCommand,
  loadHooksConfigFn = loadHooksConfig,
  readTextFileIfExistsFn = readTextFileIfExists,
}) {
  const [hooksConfig, codexConfigText] = await Promise.all([
    loadHooksConfigFn(hooksPath),
    readTextFileIfExistsFn(getDefaultCodexConfigPath(sourceCodexHome)),
  ]);

  const inspection = inspectHookEntries({
    hooksConfig,
    eventName,
    expectedCommand,
    isEquivalentCommand,
  });
  const codexConfigPath = getDefaultCodexConfigPath(sourceCodexHome);
  const codexConfigExists = codexConfigText !== null;
  const hooksFeatureEnabled = codexConfigText
    ? extractHooksFeatureEnabled(codexConfigText)
    : null;
  const trustedStateMap = codexConfigText
    ? extractTrustedHookStates(codexConfigText)
    : new Map();
  const trustedMatches = inspection.matchingHooks
    .map((hook) => {
      const stateKey = buildHookStateKey({
        hooksPath,
        stateEventName,
        entryIndex: hook.entryIndex,
        hookIndex: hook.hookIndex,
      });
      const trustedState = trustedStateMap.get(stateKey);

      return {
        ...hook,
        stateKey,
        trusted: Boolean(trustedState?.trustedHash),
        trustedHash: trustedState?.trustedHash ?? null,
      };
    })
    .filter((hook) => hook.trusted);

  return {
    hooksPath,
    codexConfigPath,
    expectedCommand,
    eventName,
    stateEventName,
    hookLabel,
    hooksFeatureEnabled,
    inspection: {
      ...inspection,
      matchingHooks: inspection.matchingHooks.map((hook) => {
        const stateKey = buildHookStateKey({
          hooksPath,
          stateEventName,
          entryIndex: hook.entryIndex,
          hookIndex: hook.hookIndex,
        });
        const trustedState = trustedStateMap.get(stateKey);

        return {
          ...hook,
          stateKey,
          trusted: Boolean(trustedState?.trustedHash),
          trustedHash: trustedState?.trustedHash ?? null,
        };
      }),
    },
    diagnosis: summarizeDiagnosis({
      hooksFeatureEnabled,
      inspection,
      trustedMatches,
      codexConfigExists,
      hookLabel,
      hookCommandName,
    }),
  };
}

export async function doctorUserPromptSubmitHook({
  sourceCodexHome,
  hooksPath = getDefaultHooksPath(),
  expectedCommand = getUserPromptSubmitHookCommand(),
  loadHooksConfigFn = loadHooksConfig,
  readTextFileIfExistsFn = readTextFileIfExists,
}) {
  return doctorHook({
    sourceCodexHome,
    hooksPath,
    expectedCommand,
    eventName: 'UserPromptSubmit',
    stateEventName: 'user_prompt_submit',
    hookLabel: 'UserPromptSubmit',
    hookCommandName: 'UserPromptSubmit',
    isEquivalentCommand: isEquivalentUserPromptSubmitHookCommand,
    loadHooksConfigFn,
    readTextFileIfExistsFn,
  });
}

export async function doctorSessionStartHook({
  sourceCodexHome,
  hooksPath = getDefaultHooksPath(),
  expectedCommand = getSessionStartHookCommand(),
  loadHooksConfigFn = loadHooksConfig,
  readTextFileIfExistsFn = readTextFileIfExists,
}) {
  return doctorHook({
    sourceCodexHome,
    hooksPath,
    expectedCommand,
    eventName: 'SessionStart',
    stateEventName: 'session_start',
    hookLabel: 'SessionStart',
    hookCommandName: 'SessionStart',
    isEquivalentCommand: isEquivalentSessionStartHookCommand,
    loadHooksConfigFn,
    readTextFileIfExistsFn,
  });
}

export async function doctorCodexEvolutionHooks({
  sourceCodexHome,
  hooksPath = getDefaultHooksPath(),
  loadHooksConfigFn = loadHooksConfig,
  readTextFileIfExistsFn = readTextFileIfExists,
}) {
  const [userPromptSubmit, sessionStart] = await Promise.all([
    doctorUserPromptSubmitHook({
      sourceCodexHome,
      hooksPath,
      loadHooksConfigFn,
      readTextFileIfExistsFn,
    }),
    doctorSessionStartHook({
      sourceCodexHome,
      hooksPath,
      loadHooksConfigFn,
      readTextFileIfExistsFn,
    }),
  ]);

  const allReady =
    userPromptSubmit.diagnosis.status === 'ready'
    && sessionStart.diagnosis.status === 'ready';
  const firstProblem = [userPromptSubmit, sessionStart].find(
    (result) => result.diagnosis.status !== 'ready',
  );

  return {
    hooksPath,
    codexConfigPath: userPromptSubmit.codexConfigPath,
    hooksFeatureEnabled: userPromptSubmit.hooksFeatureEnabled,
    events: {
      UserPromptSubmit: userPromptSubmit,
      SessionStart: sessionStart,
    },
    diagnosis: allReady
      ? {
          status: 'ready',
          message: 'UserPromptSubmit 和 SessionStart hooks 均已安装且已 trust。',
        }
      : firstProblem.diagnosis,
  };
}
