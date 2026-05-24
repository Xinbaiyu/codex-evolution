import { normalizeCanonicalLanguage } from './detect-text-language.js';

export function deriveProjectPreferredLanguage({
  prompts = [],
  experiences = [],
  defaultLanguage = 'zh',
}) {
  let zhWeight = 0;
  let enWeight = 0;

  for (const prompt of prompts) {
    if (prompt.promptLanguage === 'zh' || prompt.promptLanguage === 'mixed') {
      zhWeight += 2;
    } else if (prompt.promptLanguage === 'en') {
      enWeight += 2;
    }
  }

  for (const experience of experiences) {
    const language = normalizeCanonicalLanguage(experience.canonicalLanguage);
    if (language === 'zh') {
      zhWeight += 1;
    } else if (language === 'en') {
      enWeight += 1;
    }
  }

  if (zhWeight === 0 && enWeight === 0) {
    return defaultLanguage;
  }

  return zhWeight >= enWeight ? 'zh' : 'en';
}
