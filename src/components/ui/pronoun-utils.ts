export const PRONOUN_SUGGESTIONS = [
  'she/her',
  'he/him',
  'they/them',
  'ze/zir',
  'ze/hir',
  'xe/xem',
  'it/its',
  'fae/faer',
  'any pronouns',
  'ask me',
];

export const MAX_PRONOUN_SETS = 3;

/**
 * Display rule: multiple known sets join by first segment ("she/her" +
 * "they/them" → "she/they"); a single set renders in full; free text
 * renders verbatim.
 */
export function pronounDisplay(tags: string[]): string {
  const cleaned = tags.map((t) => t.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  const firsts = cleaned.map((t) => {
    const slash = t.indexOf('/');
    return slash > 0 ? t.slice(0, slash) : t;
  });
  return firsts.join('/');
}
