// Known acronyms forced to uppercase regardless of input casing.
const KNOWN_ACRONYMS = [
  'LGBT',
  'LGBTQ',
  'LGBTQI',
  'LGBTQIA',
  'LGBTQIAP',
  'LGBTI',
  'BIPOC',
  'POC',
  'BDSM',
  'HIV',
  'AIDS',
  'STI',
  'STD',
  'NSFW',
  'SFW',
  'FTM',
  'MTF',
  'AFAB',
  'AMAB',
  'NB',
  'TERF',
  'PrEP',
  'PEP',
  'DJ',
  'VJ',
  'MC',
];

const ACRONYM_LOOKUP = new Map(KNOWN_ACRONYMS.map((a) => [a.toUpperCase(), a]));

/**
 * Normalize a tag display name to consistent Title Case while preserving
 * acronyms (e.g. LGBTQ+, BIPOC). Whitespace runs collapse to a single space.
 * Each letter-run inside a word is capitalized independently so separators
 * like `-` or `/` produce proper title case (Non-Binary, Sister/Brother).
 */
export function normalizeTagName(input: string): string {
  if (!input) return '';
  const collapsed = input.trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';

  return collapsed.replace(/\p{L}+(?:['’]\p{L}+)*/gu, (run) => {
    const upper = run.toUpperCase();
    const canonical = ACRONYM_LOOKUP.get(upper);
    if (canonical) return canonical;
    if (run.length >= 2 && run === upper) return run;
    return run.charAt(0).toUpperCase() + run.slice(1).toLowerCase();
  });
}
