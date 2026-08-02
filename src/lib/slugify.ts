/**
 * Canonical URL/ID slug: lowercase, accents folded (NFKD), every run of
 * non-alphanumerics collapsed to a single hyphen, no leading/trailing hyphens.
 * "Café & Bar!" → "cafe-bar". Callers add their own length caps / fallbacks /
 * uniqueness suffixes where needed.
 */
/**
 * Characters NFKD does not decompose, because they are distinct letters rather
 * than a base letter plus a combining mark. Without these, `Straße` slugifies to
 * "stra-e" and `Łódź` to "odz" — and, more to the point, differently from
 * Postgres `normalize_tag_slug()`, which this function has to agree with
 * character-for-character (see `supabase/migrations/*_tag_slug_unaccent.sql`).
 * `useTagContent.ts` slugifies a tag name and looks the result up against the
 * stored slug, so any divergence here is a silent miss rather than an error.
 */
const NON_DECOMPOSING: ReadonlyArray<readonly [RegExp, string]> = [
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/þ/g, 'th'],
  [/ð/g, 'd'],
  [/ø/g, 'o'],
  [/ł/g, 'l'],
  [/đ/g, 'd'],
  [/ı/g, 'i'],
  [/ħ/g, 'h'],
  [/ŧ/g, 't'],
];

export function slugify(input: string): string {
  let s = input.toLowerCase();
  for (const [pattern, replacement] of NON_DECOMPOSING) s = s.replace(pattern, replacement);
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
