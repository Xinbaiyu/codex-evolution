import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function getDefaultHooksPath() {
  return process.env.CODEX_EVOLUTION_HOOKS_PATH || path.join(os.homedir(), '.codex', 'hooks.json');
}

export function getCliPathForUserPromptSubmitHook() {
  return fileURLToPath(new URL('../cli.js', import.meta.url));
}

function getCliPathForHook() {
  return getCliPathForUserPromptSubmitHook();
}

function getHookCommand(commandName) {
  const cliPath = getCliPathForHook();
  return `"${process.execPath}" "${cliPath}" ${commandName}`;
}

export function getUserPromptSubmitHookCommand() {
  return getHookCommand('hook:user-prompt-submit');
}

export function getSessionStartHookCommand() {
  return getHookCommand('hook:session-start');
}

function isEquivalentHookCommand(command, commandName) {
  if (typeof command !== 'string') {
    return false;
  }

  const cliPath = getCliPathForUserPromptSubmitHook();
  return command.includes(cliPath) && command.includes(commandName);
}

export function isEquivalentUserPromptSubmitHookCommand(command) {
  return isEquivalentHookCommand(command, 'hook:user-prompt-submit');
}

export function isEquivalentSessionStartHookCommand(command) {
  return isEquivalentHookCommand(command, 'hook:session-start');
}

export async function loadHooksConfig(hooksPath) {
  try {
    const contents = await fs.readFile(hooksPath, 'utf8');
    return JSON.parse(contents);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { hooks: {} };
    }

    throw error;
  }
}

function hasMatchingCommand(entries, command, isEquivalentCommand) {
  return entries.some((entry) =>
    Array.isArray(entry.hooks) &&
    entry.hooks.some(
      (hook) =>
        hook?.type === 'command'
        && (hook.command === command || isEquivalentCommand(hook.command)),
    ),
  );
}

function replaceEquivalentCommand(entries, command, isEquivalentCommand) {
  let changed = false;

  const nextEntries = entries.map((entry) => {
    if (!Array.isArray(entry?.hooks)) {
      return entry;
    }

    const nextHooks = entry.hooks.map((hook) => {
      if (
        hook?.type === 'command'
        && typeof hook.command === 'string'
        && hook.command !== command
        && isEquivalentCommand(hook.command)
      ) {
        changed = true;
        return {
          ...hook,
          command,
        };
      }

      return hook;
    });

    return {
      ...entry,
      hooks: nextHooks,
    };
  });

  return {
    changed,
    entries: nextEntries,
  };
}

function mergeHook(config, { eventName, command, isEquivalentCommand, timeout = 10 }) {
  const hooks = config.hooks && typeof config.hooks === 'object' ? config.hooks : {};
  const entries = Array.isArray(hooks[eventName]) ? [...hooks[eventName]] : [];
  const replaced = replaceEquivalentCommand(entries, command, isEquivalentCommand);

  if (hasMatchingCommand(replaced.entries, command, isEquivalentCommand)) {
    return {
      changed: replaced.changed,
      config: {
        ...config,
        hooks: {
          ...hooks,
          [eventName]: replaced.entries,
        },
      },
    };
  }

  replaced.entries.push({
    hooks: [
      {
        type: 'command',
        command,
        timeout,
      },
    ],
  });

  return {
    changed: true,
    config: {
      ...config,
      hooks: {
        ...hooks,
        [eventName]: replaced.entries,
      },
    },
  };
}

function mergeUserPromptSubmitHook(config, command) {
  return mergeHook(config, {
    eventName: 'UserPromptSubmit',
    command,
    isEquivalentCommand: isEquivalentUserPromptSubmitHookCommand,
  });
}

function mergeSessionStartHook(config, command) {
  return mergeHook(config, {
    eventName: 'SessionStart',
    command,
    isEquivalentCommand: isEquivalentSessionStartHookCommand,
  });
}

function removeMatchingCommand(entries, command, isEquivalentCommand) {
  let changed = false;

  const nextEntries = entries
    .map((entry) => {
      if (!Array.isArray(entry?.hooks)) {
        return entry;
      }

      const nextHooks = entry.hooks.filter((hook) => {
        const shouldRemove =
          hook?.type === 'command'
          && (hook.command === command || isEquivalentCommand(hook.command));

        if (shouldRemove) {
          changed = true;
          return false;
        }

        return true;
      });

      if (nextHooks.length === 0) {
        changed = true;
        return null;
      }

      return {
        ...entry,
        hooks: nextHooks,
      };
    })
    .filter(Boolean);

  return {
    changed,
    entries: nextEntries,
  };
}

function removeHook(config, { eventName, command, isEquivalentCommand }) {
  const hooks = config.hooks && typeof config.hooks === 'object' ? config.hooks : {};
  const entries = Array.isArray(hooks[eventName]) ? [...hooks[eventName]] : [];
  const removed = removeMatchingCommand(entries, command, isEquivalentCommand);

  if (!removed.changed) {
    return {
      changed: false,
      config,
    };
  }

  const nextHooks = {
    ...hooks,
  };

  if (removed.entries.length === 0) {
    delete nextHooks[eventName];
  } else {
    nextHooks[eventName] = removed.entries;
  }

  return {
    changed: true,
    config: {
      ...config,
      hooks: nextHooks,
    },
  };
}

function removeUserPromptSubmitHook(config, command) {
  return removeHook(config, {
    eventName: 'UserPromptSubmit',
    command,
    isEquivalentCommand: isEquivalentUserPromptSubmitHookCommand,
  });
}

function removeSessionStartHook(config, command) {
  return removeHook(config, {
    eventName: 'SessionStart',
    command,
    isEquivalentCommand: isEquivalentSessionStartHookCommand,
  });
}

export async function installUserPromptSubmitHook({ hooksPath = getDefaultHooksPath() } = {}) {
  const command = getUserPromptSubmitHookCommand();
  const existingConfig = await loadHooksConfig(hooksPath);
  const merged = mergeUserPromptSubmitHook(existingConfig, command);

  if (merged.changed) {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.writeFile(hooksPath, `${JSON.stringify(merged.config, null, 2)}\n`, 'utf8');
  }

  return {
    changed: merged.changed,
    hooksPath,
    command,
  };
}

export async function installSessionStartHook({ hooksPath = getDefaultHooksPath() } = {}) {
  const command = getSessionStartHookCommand();
  const existingConfig = await loadHooksConfig(hooksPath);
  const merged = mergeSessionStartHook(existingConfig, command);

  if (merged.changed) {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.writeFile(hooksPath, `${JSON.stringify(merged.config, null, 2)}\n`, 'utf8');
  }

  return {
    changed: merged.changed,
    hooksPath,
    command,
  };
}

export async function installCodexEvolutionHooks({ hooksPath = getDefaultHooksPath() } = {}) {
  const userPromptCommand = getUserPromptSubmitHookCommand();
  const sessionStartCommand = getSessionStartHookCommand();
  const existingConfig = await loadHooksConfig(hooksPath);
  const withUserPromptSubmit = mergeUserPromptSubmitHook(existingConfig, userPromptCommand);
  const withSessionStart = mergeSessionStartHook(withUserPromptSubmit.config, sessionStartCommand);
  const changed = withUserPromptSubmit.changed || withSessionStart.changed;

  if (changed) {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.writeFile(hooksPath, `${JSON.stringify(withSessionStart.config, null, 2)}\n`, 'utf8');
  }

  return {
    changed,
    hooksPath,
    hooks: {
      UserPromptSubmit: {
        changed: withUserPromptSubmit.changed,
        command: userPromptCommand,
      },
      SessionStart: {
        changed: withSessionStart.changed,
        command: sessionStartCommand,
      },
    },
  };
}

export function mergeUserPromptSubmitHookConfig(config, command) {
  return mergeUserPromptSubmitHook(config, command);
}

export function mergeSessionStartHookConfig(config, command) {
  return mergeSessionStartHook(config, command);
}

export async function uninstallUserPromptSubmitHook({ hooksPath = getDefaultHooksPath() } = {}) {
  const command = getUserPromptSubmitHookCommand();
  const existingConfig = await loadHooksConfig(hooksPath);
  const removed = removeUserPromptSubmitHook(existingConfig, command);

  if (removed.changed) {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.writeFile(hooksPath, `${JSON.stringify(removed.config, null, 2)}\n`, 'utf8');
  }

  return {
    changed: removed.changed,
    hooksPath,
    command,
  };
}

export async function uninstallSessionStartHook({ hooksPath = getDefaultHooksPath() } = {}) {
  const command = getSessionStartHookCommand();
  const existingConfig = await loadHooksConfig(hooksPath);
  const removed = removeSessionStartHook(existingConfig, command);

  if (removed.changed) {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.writeFile(hooksPath, `${JSON.stringify(removed.config, null, 2)}\n`, 'utf8');
  }

  return {
    changed: removed.changed,
    hooksPath,
    command,
  };
}

export async function uninstallCodexEvolutionHooks({ hooksPath = getDefaultHooksPath() } = {}) {
  const userPromptCommand = getUserPromptSubmitHookCommand();
  const sessionStartCommand = getSessionStartHookCommand();
  const existingConfig = await loadHooksConfig(hooksPath);
  const withoutUserPromptSubmit = removeUserPromptSubmitHook(existingConfig, userPromptCommand);
  const withoutSessionStart = removeSessionStartHook(withoutUserPromptSubmit.config, sessionStartCommand);
  const changed = withoutUserPromptSubmit.changed || withoutSessionStart.changed;

  if (changed) {
    await fs.mkdir(path.dirname(hooksPath), { recursive: true });
    await fs.writeFile(hooksPath, `${JSON.stringify(withoutSessionStart.config, null, 2)}\n`, 'utf8');
  }

  return {
    changed,
    hooksPath,
    hooks: {
      UserPromptSubmit: {
        changed: withoutUserPromptSubmit.changed,
        command: userPromptCommand,
      },
      SessionStart: {
        changed: withoutSessionStart.changed,
        command: sessionStartCommand,
      },
    },
  };
}

export function removeUserPromptSubmitHookConfig(config, command) {
  return removeUserPromptSubmitHook(config, command);
}

export function removeSessionStartHookConfig(config, command) {
  return removeSessionStartHook(config, command);
}
