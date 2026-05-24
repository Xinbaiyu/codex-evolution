import fs from 'node:fs/promises';
import path from 'node:path';

import { getReconciliationPolicyTemplate } from './reconciliation-policy-templates.js';

export async function ensureReconciliationPolicyFile({
  policyPath,
  language = 'zh',
  fsImpl = fs,
}) {
  try {
    await fsImpl.access(policyPath);
    return {
      created: false,
      policyPath,
    };
  } catch (error) {
    if (!(error && typeof error === 'object' && error.code === 'ENOENT')) {
      throw error;
    }
  }

  await fsImpl.mkdir(path.dirname(policyPath), { recursive: true });
  await fsImpl.writeFile(policyPath, getReconciliationPolicyTemplate(language), 'utf8');

  return {
    created: true,
    policyPath,
  };
}
