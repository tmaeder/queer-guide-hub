/**
 * Shared, dependency-free formatting for the competition surfaces.
 *
 * `formatAired` parses the ISO day by hand and renders it in UTC. `new
 * Date('2009-02-02')` is UTC midnight, so `toLocaleDateString` in any negative
 * offset renders the PREVIOUS day — a season would be recorded as premiering
 * the evening before it aired, on every page load, west of Greenwich.
 */

/** A list column is an ARRAY on every one of these fields — several seasons
 *  have two runners-up and at least one has a Miss Congeniality tie. Rendering
 *  `[0]` silently deletes a person from the record. */
export function formatList(values: string[] | undefined | null): string {
  if (!values || values.length === 0) return '—';
  return values.join(', ');
}

export function formatAired(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Year of an ISO day, without constructing a Date at all. */
export function airedYear(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})/.exec(iso);
  return m ? Number(m[1]) : null;
}

/**
 * Sort comparator that keeps a missing value LAST in BOTH directions.
 *
 * `dir` is applied only to the value comparison, never to the null test: an
 * announced season with no air date yet is absence of information, and flipping
 * the sort should not promote it to the top of the table as though it were the
 * earliest thing on record.
 */
export function compareNullable(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  dir: 1 | -1,
): number {
  const aMissing = a === null || a === undefined || a === '';
  const bMissing = b === null || b === undefined || b === '';
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === 'number' && typeof b === 'number') return dir * (a - b);
  return dir * String(a).localeCompare(String(b));
}
