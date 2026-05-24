import { createHash } from 'node:crypto';

export function buildPromptEventFingerprint(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}
