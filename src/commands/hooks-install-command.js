import path from 'node:path';

import { installCodexEvolutionHooks } from '../hooks/install-user-prompt-submit-hook.js';

export async function runHooksInstallCommand({ appContext, hooksPathArg }) {
  const hooksPath = hooksPathArg ? path.resolve(hooksPathArg) : undefined;
  const result = await installCodexEvolutionHooks({
    hooksPath,
  });

  const action = result.changed ? '已更新' : '已存在';
  console.log(`[codex-evolution] hooks ${action}: ${result.hooksPath}`);
  console.log(
    `[codex-evolution] UserPromptSubmit: ${
      result.hooks.UserPromptSubmit.changed ? '已更新' : '已存在'
    }`,
  );
  console.log(
    `[codex-evolution] SessionStart: ${
      result.hooks.SessionStart.changed ? '已更新' : '已存在'
    }`,
  );
}
