import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { getReconciliationPolicyTemplate } from './reconciliation-policy-templates.js';

export const DEFAULT_RECONCILIATION_POLICY_FILENAME = 'reconciliation-policy.md';

function expandHomePath(filePath) {
  if (filePath === '~') {
    return homedir();
  }

  if (filePath.startsWith('~/')) {
    return path.join(homedir(), filePath.slice(2));
  }

  return filePath;
}

export function resolveReconciliationPolicyPath({
  homeDirectory,
  policyPath,
}) {
  if (!policyPath) {
    return path.join(homeDirectory, DEFAULT_RECONCILIATION_POLICY_FILENAME);
  }

  const expanded = expandHomePath(policyPath);

  if (path.isAbsolute(expanded)) {
    return expanded;
  }

  return path.join(homeDirectory, expanded);
}

export function isDefaultReconciliationPolicyPath({
  homeDirectory,
  policyPath,
}) {
  return path.resolve(policyPath) === path.resolve(
    path.join(homeDirectory, DEFAULT_RECONCILIATION_POLICY_FILENAME),
  );
}

export async function loadReconciliationPolicy({
  appContext,
  fsImpl = fs,
}) {
  const policyPath = appContext.reconcileConfig.policyPath;

  try {
    const policyText = await fsImpl.readFile(policyPath, 'utf8');
    return {
      source: 'file',
      path: policyPath,
      policyText,
    };
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
      throw error;
    }

    if (!isDefaultReconciliationPolicyPath({
      homeDirectory: appContext.homeDirectory,
      policyPath,
    })) {
      throw new Error(`reconciliation policy file not found: ${policyPath}`);
    }

    return {
      source: 'builtin:zh',
      path: policyPath,
      policyText: getReconciliationPolicyTemplate('zh'),
    };
  }
}
