/**
 * Locale-aware "long" date formatter for person Born/Died labels.
 *
 * The bug we're fixing: PersonalityDetail rendered Born and Died with
 * `new Date(iso).toLocaleDateString()`, which gives the user's locale's
 * default short style — `02/07/1951` for an EU user, `7/2/1951` for a US
 * user. Both are ambiguous and locale-flipped readers misread the month.
 *
 * `dateStyle: 'long'` always spells the month out (e.g. "2 July 1951" /
 * "July 2, 1951"), removing the slash ambiguity in every locale.
 *
 * Returns null for unparseable input so callers can fall back to the raw
 * ISO string instead of crashing on `new Date('garbage').toLocaleString()`
 * (which silently returns "Invalid Date").
 */
export function formatPersonDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(d);
  } catch {
    return null;
  }
}

/**
 * Strict ISO-8601 date prefix for the `<time datetime="…">` attribute.
 * Always YYYY-MM-DD regardless of the user's locale — required for SEO and
 * copy-paste portability.
 */
export function isoDateAttr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
