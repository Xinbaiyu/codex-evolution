import path from 'node:path';

import { uninstallCodexEvolutionHooks } from '../hooks/install-user-prompt-submit-hook.js';

export async function runHooksUninstallCommand({ appContext, hooksPathArg }) {
  const hooksPath = hooksPathArg ? path.resolve(hooksPathArg) : undefined;
  const result = await uninstallCodexEvolutionHooks({
    hooksPath,
  });

  const action = result.changed ? '已移除' : '未发现可移除的 hook';
  console.log(`[codex-evolution] hooks ${action}: ${result.hooksPath}`);
  console.log(
    `[codex-evolution] UserPromptSubmit: ${
      result.hooks.UserPromptSubmit.changed ? '已移除' : '未发现'
    }`,
  );
  console.log(
    `[codex-evolution] SessionStart: ${
      result.hooks.SessionStart.changed ? '已移除' : '未发现'
    }`,
  );
}
