import fs from 'node:fs/promises';
import path from 'node:path';

import {
  getReconciliationPolicyTemplate,
  normalizePolicyLanguage,
} from '../reconciliation/reconciliation-policy-templates.js';
import { ensureReconciliationPolicyFile } from '../reconciliation/ensure-reconciliation-policy-file.js';
import { resolveReconciliationPolicyPath } from '../reconciliation/reconciliation-policy.js';

function readFlagValue(args, flagName) {
  const index = args.indexOf(flagName);

  if (index === -1) {
    return null;
  }

  return args[index + 1] && !args[index + 1].startsWith('-') ? args[index + 1] : null;
}

export function parsePolicyInitArgs(args = []) {
  return {
    force: args.includes('--force'),
    language: normalizePolicyLanguage(readFlagValue(args, '--lang') || 'zh'),
    policyPath: readFlagValue(args, '--path'),
  };
}

export async function runPolicyInitCommand({
  appContext,
  args = [],
}) {
  const options = parsePolicyInitArgs(args);
  const policyPath = options.policyPath
    ? resolveReconciliationPolicyPath({
        homeDirectory: appContext.homeDirectory,
        policyPath: options.policyPath,
      })
    : appContext.reconcileConfig.policyPath;
  const policyText = getReconciliationPolicyTemplate(options.language);

  if (!options.force) {
    const result = await ensureReconciliationPolicyFile({
      policyPath,
      language: options.language,
    });

    if (result.created) {
      console.log(
        `[codex-evolution] 经验提取策略已创建: ${policyPath} ` +
          `(lang=${options.language})`,
      );
      return;
    }

    console.log(
      `[codex-evolution] 经验提取策略已存在: ${policyPath} ` +
        '(如需覆盖请使用 policy:init --force)',
    );
    return;
  }

  await fs.mkdir(path.dirname(policyPath), { recursive: true });
  await fs.writeFile(policyPath, policyText, 'utf8');

  console.log(
    `[codex-evolution] 经验提取策略已覆盖: ${policyPath} ` +
      `(lang=${options.language})`,
  );
}
