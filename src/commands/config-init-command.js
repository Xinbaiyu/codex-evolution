import fs from 'node:fs/promises';

import {
  buildDefaultConfig,
  stringifyConfig,
} from '../config/build-default-config.js';
import { ensureReconciliationPolicyFile } from '../reconciliation/ensure-reconciliation-policy-file.js';

export async function runConfigInitCommand({
  appContext,
  providerArg,
  force = false,
}) {
  const provider = providerArg || 'openai-compatible';
  const config = buildDefaultConfig({ provider });

  await fs.mkdir(appContext.homeDirectory, { recursive: true });

  let alreadyExists = false;

  try {
    await fs.access(appContext.configPath);
    alreadyExists = true;
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
      throw error;
    }
  }

  if (alreadyExists && !force) {
    console.log(
      `[codex-evolution] config already exists: ${appContext.configPath} ` +
        `(use config:init ${provider} --force to overwrite)`,
    );
    return;
  }

  await fs.writeFile(appContext.configPath, stringifyConfig(config), 'utf8');
  const policy = await ensureReconciliationPolicyFile({
    policyPath: appContext.reconcileConfig.policyPath,
  });

  const action = alreadyExists ? 'overwritten' : 'created';
  console.log(
    `[codex-evolution] config ${action}: ${appContext.configPath} ` +
      `(provider=${provider})`,
  );
  if (policy.created) {
    console.log(
      `[codex-evolution] 已创建默认经验提取策略: ${policy.policyPath}`,
    );
    console.log(
      '[codex-evolution] 你可以编辑这个 Markdown 来调整经验提取偏好；修改后下次学习会自动生效。',
    );
  }
}
