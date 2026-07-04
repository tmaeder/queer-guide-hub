/**
 * Canonical URL/ID slug: lowercase, accents folded (NFKD), every run of
 * non-alphanumerics collapsed to a single hyphen, no leading/trailing hyphens.
 * "Café & Bar!" → "cafe-bar". Callers add their own length caps / fallbacks /
 * uniqueness suffixes where needed.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
