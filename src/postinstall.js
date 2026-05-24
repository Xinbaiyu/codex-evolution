#!/usr/bin/env node

import { createDefaultAppContext } from './context/app-context.js';
import { runPostinstallCommand } from './commands/postinstall-command.js';

runPostinstallCommand({
  appContext: createDefaultAppContext(),
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[codex-evolution] postinstall 自动学习同步失败，已跳过: ${message}`);
});
