/**
 * Admin identity codes for a city: "US · US-ME".
 *
 * Since 99991791233840 a country may hold two cities of the same name in
 * different regions (Portland US-ME and Portland US-OR), so in the admin a
 * city name alone no longer identifies a row. Unlike the public
 * formatPlaceLabel (readable, region shown only where addresses carry one),
 * the admin always shows the raw ISO codes — and shows a missing region as
 * missing, because ~40% of cities have no region_code yet and that gap is
 * work, not noise.
 */

export interface CityCodesInput {
  /** ISO 3166-1 alpha-2, e.g. "US". */
  countryCode?: string | null;
  /** ISO 3166-2, e.g. "US-ME". */
  regionCode?: string | null;
}

export const MISSING_CODE = '–';

export function normalizeCode(code: string | null | undefined): string | null {
  const c = (code ?? '').trim().toUpperCase();
  return c || null;
}

/** Plain-text form for search values, trigger labels and titles. */
export function cityCodesText({ countryCode, regionCode }: CityCodesInput): string {
  return [
    normalizeCode(countryCode) ?? MISSING_CODE,
    normalizeCode(regionCode) ?? MISSING_CODE,
  ].join(' · ');
}

/** Pulls the codes out of a row that embeds `countries(code)` and selects `region_code`. */
export function cityCodesFromRow(row: Record<string, unknown> | null | undefined): CityCodesInput {
  const countries = row?.countries as { code?: string | null } | { code?: string | null }[] | null;
  const country = Array.isArray(countries) ? countries[0] : countries;
  return {
    countryCode: (country?.code as string | null | undefined) ?? null,
    regionCode: (row?.region_code as string | null | undefined) ?? null,
  };
}
