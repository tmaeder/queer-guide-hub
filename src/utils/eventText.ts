// Event text utilities. Extend as more helpers land.

const GENERIC_TAGS = new Set([
  'event',
  'events',
  'misc',
  'other',
  'general',
  'uncategorized',
]);

/**
 * Returns true if a tag carries real signal — i.e. not empty, not a single
 * character, and not on the generic blocklist. Used to filter low-value
 * tags out of event chips.
 */
/**
 * Strip HTML tags, collapse whitespace, trim. Returns an empty string for
 * nullish input so call sites can use it in truthiness checks.
 */
export function sanitizeExcerpt(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMeaningfulTag(tag: string | null | undefined): boolean {
  if (!tag) return false;
  const trimmed = tag.trim().toLowerCase();
  if (trimmed.length < 2) return false;
  return !GENERIC_TAGS.has(trimmed);
}
