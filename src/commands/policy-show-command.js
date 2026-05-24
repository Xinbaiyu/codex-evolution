import { loadReconciliationPolicy } from '../reconciliation/reconciliation-policy.js';

function parsePolicyShowArgs(args = []) {
  return {
    json: args.includes('--json'),
  };
}

export async function runPolicyShowCommand({
  appContext,
  args = [],
}) {
  const options = parsePolicyShowArgs(args);
  const policy = await loadReconciliationPolicy({
    appContext,
  });

  if (options.json) {
    console.log(JSON.stringify(policy, null, 2));
    return;
  }

  const sourceLabel = policy.source === 'file'
    ? '用户文件'
    : '内置默认中文模板';

  console.log(
    [
      '[codex-evolution] 当前经验提取策略',
      `来源: ${sourceLabel}`,
      `路径: ${policy.path}`,
      '',
      policy.policyText.trimEnd(),
    ].join('\n'),
  );
}
