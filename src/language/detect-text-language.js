function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

export function detectTextLanguage(text) {
  const normalizedText = String(text ?? '').trim();

  if (!normalizedText) {
    return 'other';
  }

  const hanCount = countMatches(normalizedText, /[\p{Script=Han}]/gu);
  const latinWordCount = countMatches(normalizedText, /\b[A-Za-z][A-Za-z'-]*\b/g);

  if (hanCount > 0 && latinWordCount === 0) {
    return 'zh';
  }

  if (latinWordCount > 0 && hanCount === 0) {
    return 'en';
  }

  if (hanCount > 0 && latinWordCount > 0) {
    return 'mixed';
  }

  return 'other';
}

export function normalizeCanonicalLanguage(language) {
  if (language === 'zh' || language === 'en') {
    return language;
  }

  if (language === 'mixed') {
    return 'zh';
  }

  return 'zh';
}
