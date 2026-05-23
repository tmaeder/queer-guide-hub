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

const YEAR_ONLY_PLACEHOLDER = /^\d{4}-01-01(T|$)/;

function formatPersonYear(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, { year: 'numeric' }).format(d);
  } catch {
    return null;
  }
}

/**
 * Format a (birth, death) pair, downgrading both to year-only when each is a
 * `YYYY-01-01` Wikidata year-precision placeholder. Real January-1 dates with
 * a non-Jan-1 counterpart still render in full. Avoids the "1. Januar 1885 –
 * 1. Januar 1959" false-equality that triggered the "Datum falsch" report.
 */
export function formatPersonDateRange(
  birthIso: string | null | undefined,
  deathIso: string | null | undefined,
): { birth: string | null; death: string | null; precision: 'day' | 'year' } {
  const bothYearOnly =
    !!birthIso &&
    !!deathIso &&
    YEAR_ONLY_PLACEHOLDER.test(birthIso) &&
    YEAR_ONLY_PLACEHOLDER.test(deathIso);
  if (bothYearOnly) {
    return {
      birth: formatPersonYear(birthIso as string),
      death: formatPersonYear(deathIso as string),
      precision: 'year',
    };
  }
  return {
    birth: formatPersonDate(birthIso),
    death: formatPersonDate(deathIso),
    precision: 'day',
  };
}
