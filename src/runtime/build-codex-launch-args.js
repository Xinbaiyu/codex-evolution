const KNOWN_SUBCOMMANDS = new Set([
  'exec',
  'e',
  'review',
  'login',
  'logout',
  'mcp',
  'plugin',
  'mcp-server',
  'app-server',
  'remote-control',
  'app',
  'completion',
  'update',
  'sandbox',
  'debug',
  'apply',
  'a',
  'resume',
  'fork',
  'cloud',
  'exec-server',
  'features',
  'help',
]);

function hasKnownSubcommand(args) {
  return args.some((arg) => KNOWN_SUBCOMMANDS.has(arg));
}

function hasPromptLikeArgument(args) {
  return args.some((arg) => !arg.startsWith('-') && !KNOWN_SUBCOMMANDS.has(arg));
}

export function buildCodexLaunchArgs({
  codexArgs,
  runtimeContext,
  injectionMode = process.env.CODEX_EVOLUTION_INJECTION_MODE || 'none',
}) {
  if (injectionMode === 'none') {
    return [...codexArgs];
  }

  if (injectionMode === 'developer_instructions') {
    return [
      '-c',
      `developer_instructions=${JSON.stringify(runtimeContext)}`,
      ...codexArgs,
    ];
  }

  if (injectionMode === 'startup_prompt') {
    if (hasKnownSubcommand(codexArgs)) {
      throw new Error('startup_prompt injection mode does not support codex subcommands yet');
    }

    if (hasPromptLikeArgument(codexArgs)) {
      throw new Error('startup_prompt injection mode does not support passthrough prompt args yet');
    }

    return [...codexArgs, runtimeContext];
  }

  throw new Error(`unsupported injection mode: ${injectionMode}`);
}
