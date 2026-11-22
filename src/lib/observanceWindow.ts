export interface ObservanceDateRow {
  country_id: string | null;
  country_name: string | null;
  starts: string; // YYYY-MM-DD
  ends: string;
}

function shift(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Date range to fetch linked events for: earliest start − before … latest end + after. */
export function eventWindow(
  rows: ObservanceDateRow[],
  before: number,
  after: number,
): { from: string; to: string } | null {
  if (rows.length === 0) return null;
  const from = rows.map((r) => r.starts).sort()[0];
  const to = rows
    .map((r) => r.ends)
    .sort()
    .at(-1)!;
  return { from: shift(from, -before), to: shift(to, after) };
}

function yearBack(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4)) - 1;
  const md = isoDate.slice(5);
  return `${y}-${md === '02-29' ? '02-28' : md}`;
}

/**
 * The same rules one calendar year earlier, for a "last time" section.
 * ponytail: shifting by a calendar year is approximate for nth_weekday rules (Spirit Day
 * moves by a few days); the fetch window is padded and links already enforce each
 * country's real window, so it is safe.
 */
export function previousOccurrence(rows: ObservanceDateRow[]): ObservanceDateRow[] {
  return rows.map((r) => ({ ...r, starts: yearBack(r.starts), ends: yearBack(r.ends) }));
}
