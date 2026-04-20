/**
 * Tiny dependency-free language detector for short text (event titles,
 * venue names). Returns an ISO 639-1 code from a small set of European
 * languages, or null when the input is too short / ambiguous.
 */

const MIN_LENGTH = 8;

// Characteristic stopwords / particles. Chosen to be short + high-frequency
// and to discriminate between the supported languages without a full corpus.
const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'and', 'of', 'to', 'for', 'with', 'at', 'in', 'on', 'a', 'an', 'is', 'night', 'party', 'pride'],
  de: ['der', 'die', 'das', 'und', 'mit', 'für', 'von', 'im', 'auf', 'ein', 'eine', 'zum', 'zur', 'des', 'den', 'nacht', 'veranstaltung'],
  fr: ['le', 'la', 'les', 'et', 'de', 'du', 'des', 'avec', 'pour', 'à', 'un', 'une', 'au', 'aux', 'soirée', 'fête'],
  es: ['el', 'la', 'los', 'las', 'y', 'de', 'del', 'con', 'para', 'por', 'en', 'un', 'una', 'noche', 'fiesta'],
  it: ['il', 'la', 'lo', 'gli', 'le', 'e', 'di', 'del', 'della', 'con', 'per', 'un', 'una', 'notte', 'festa'],
  pt: ['o', 'a', 'os', 'as', 'e', 'de', 'do', 'da', 'dos', 'das', 'com', 'para', 'um', 'uma', 'noite', 'festa'],
};

// Unicode hints for non-Latin scripts.
const SCRIPT_HINTS: Array<[RegExp, string]> = [
  [/[\u3040-\u309F\u30A0-\u30FF]/, 'ja'], // Hiragana / Katakana
  [/[\uAC00-\uD7AF]/, 'ko'], // Hangul
  [/[\u4E00-\u9FFF]/, 'zh'], // CJK
  [/[\u0400-\u04FF]/, 'ru'], // Cyrillic
  [/[\u0600-\u06FF]/, 'ar'], // Arabic
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function detectLanguage(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length < MIN_LENGTH) return null;

  for (const [pattern, code] of SCRIPT_HINTS) {
    if (pattern.test(trimmed)) return code;
  }

  const tokens = tokenize(trimmed);
  if (tokens.length < 2) return null;

  const scores: Record<string, number> = {};
  for (const [code, words] of Object.entries(STOPWORDS)) {
    const set = new Set(words);
    scores[code] = tokens.reduce((acc, tok) => acc + (set.has(tok) ? 1 : 0), 0);
  }

  if (/[äöüß]/i.test(trimmed)) scores.de += 2;
  if (/[àâçéèêëîïôûùüÿœ]/i.test(trimmed)) scores.fr += 1;
  if (/[áéíóúñ¿¡]/i.test(trimmed)) scores.es += 1;
  if (/[àèéìòù]/i.test(trimmed)) scores.it += 1;
  if (/[ãõâêôç]/i.test(trimmed)) scores.pt += 1;

  let best: string | null = null;
  let bestScore = 0;
  for (const [code, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }
  if (bestScore < 1) return null;
  return best;
}
