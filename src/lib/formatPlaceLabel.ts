/**
 * "Portland, ME · United States".
 *
 * Since 99991791233840 a country may hold two cities of the same name in
 * different regions (Portland, Maine and Portland, Oregon), so "Portland,
 * United States" no longer identifies a place. The region is shown where a
 * reader expects it — countries whose addresses carry a state or province
 * abbreviation — and omitted elsewhere, where "Hamburg · Germany" is how
 * the place is written.
 */

const REGION_SHOWN = new Set(['US', 'CA', 'AU', 'MX', 'BR', 'IN']);

export interface PlaceLabelInput {
  city?: string | null;
  /** ISO 3166-2, e.g. "US-ME". */
  regionCode?: string | null;
  country?: string | null;
}

/** "US-ME" -> "ME"; null when the code is not a plain ISO 3166-2 code. */
export function regionAbbrev(regionCode: string | null | undefined): string | null {
  const m = /^([A-Z]{2})-([A-Z0-9]{1,3})$/.exec((regionCode ?? '').trim());
  if (!m || !REGION_SHOWN.has(m[1])) return null;
  // Numeric subdivision codes ("BR-27") read as noise, not as a place.
  return /^[0-9]+$/.test(m[2]) ? null : m[2];
}

export function formatPlaceLabel({ city, regionCode, country }: PlaceLabelInput): string {
  const c = city?.trim() || '';
  const n = country?.trim() || '';
  const r = c ? regionAbbrev(regionCode) : null;
  const left = r ? `${c}, ${r}` : c;
  return [left, n].filter(Boolean).join(' · ');
}
