/**
 * Pure helpers for `geo-link-content` — kept out of the handler so they can be
 * tested without a Supabase client.
 *
 * Two jobs:
 *
 *  1. A coordinate corroboration arm for a name-resolved city link.
 *     `cities` holds at most one row per (name, country), so a name + country
 *     match cannot tell Springfield, Missouri from the one Springfield row the
 *     table holds. The state / metro-slug guards in `city-collision-guard.ts`
 *     only fire when the row carries that text, and most venues do not. The
 *     row's own coordinates are a second, independent signal that almost every
 *     row does carry.
 *
 *  2. A round-robin cursor for the work list. The work list used to be an
 *     unordered `LIMIT 200` over rows with a NULL city or country, so every run
 *     re-read roughly the same physical first 200 rows. Rows that cannot be
 *     resolved never leave that set, which starved everything behind them:
 *     measured 2026-09-29, four consecutive runs each processed 200 venues and
 *     linked 0.
 */

/**
 * Largest distance, in km, between a row's own coordinates and the city it is
 * name-matched to before the match is refused as a namesake.
 *
 * Measured 2026-09-29 against links that already exist, not chosen:
 *   - venues (15% sample, 3,962 links): p50 1.9 km, p95 28.7 km, and only 9
 *     links between 50 and 100 km — the distribution is bimodal, with the far
 *     mode (119 over 250 km) being existing wrong links, not a tail;
 *   - events (10% sample, 4,836 links): p99 5.6 km, nothing over 50 km;
 *   - the 485 gayout venues this change exists to reach: max 21.5 km.
 * 100 km sits in the gap: 4.6x the largest distance among the rows being
 * rescued, and below every far-mode wrong link.
 */
export const CITY_COORD_MAX_KM = 100;

export interface LatLng {
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
}

function toCoord(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Great-circle distance in km, or null when either side has no coordinates. */
export function distanceKm(a: LatLng, b: LatLng): number | null {
  const lat1 = toCoord(a.latitude);
  const lng1 = toCoord(a.longitude);
  const lat2 = toCoord(b.latitude);
  const lng2 = toCoord(b.longitude);
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return null;

  const rad = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  // Clamp: near-antipodal pairs can round h to 1.0000000000000004, and an
  // unclamped asin() of that is NaN.
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/**
 * Reason to refuse a name-resolved city link, or null when the coordinates do
 * not contradict it.
 *
 * Fails OPEN when either side lacks coordinates: absence of evidence is not
 * disagreement, and refusing coordless rows would leave them unlinked for a
 * reason nobody could see.
 */
export function cityCoordContradiction(
  row: LatLng,
  city: LatLng & { name: string },
  maxKm: number = CITY_COORD_MAX_KM,
): string | null {
  const km = distanceKm(row, city);
  if (km === null || km <= maxKm) return null;
  return `row coordinates are ${Math.round(km)} km from "${city.name}" (limit ${maxKm} km) — likely a same-name city`;
}

/**
 * Full corroboration rule for a name match. Missing coordinates remain
 * acceptable when the city agrees with the source country, but they cannot
 * justify overriding a contradictory source country. The latter used to fall
 * through to D10 and silently rewrite the country from a bare globally-unique
 * name; loading the full city table makes that fallback much wider.
 */
export function cityLinkContradiction(
  row: LatLng,
  city: LatLng & { name: string; country_id: string },
  sourceCountryId: string | null | undefined,
  maxKm: number = CITY_COORD_MAX_KM,
): string | null {
  const km = distanceKm(row, city);
  if (sourceCountryId && sourceCountryId !== city.country_id && km === null) {
    return `"${city.name}" is in a different country and the row has no coordinates to corroborate it`;
  }
  return cityCoordContradiction(row, city, maxKm);
}

/**
 * Merge the two halves of a round-robin read: rows after the cursor, then —
 * when that half came back short — rows from the start of the key space. The
 * wrap half can overlap the first half when the whole work list is smaller
 * than the batch, so duplicates are dropped.
 *
 * Returns the rows to process and the cursor to persist: the id of the last
 * row taken, or null when there was nothing to take (the next run then starts
 * from the beginning, which is correct for an empty list).
 */
export function mergeRoundRobin<T extends { id: string }>(
  afterCursor: T[],
  fromStart: T[],
  limit: number,
): { rows: T[]; cursor: string | null } {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const r of [...afterCursor, ...fromStart]) {
    if (rows.length >= limit) break;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    rows.push(r);
  }
  return { rows, cursor: rows.length > 0 ? rows[rows.length - 1].id : null };
}

/**
 * The status a row's link attempt reports, from what was actually WRITTEN.
 *
 * The old rule reported `partial` whenever a city was not found but a country
 * was known — including when that country was already on the row, i.e. when
 * nothing changed. The run log then sums `linked + partial` into
 * `total_linked`, so a venue that already had a country and found no city
 * counted as a link every hour it was revisited. Measured 2026-09-30 over 17
 * runs: 1,445 of 1,835 reported venue "links" were that no-op, and the log
 * read ~100 links/run while `city_id` gained ~23/run.
 *
 *  - `linked`  a city was written and the row ends with both ids set;
 *  - `partial` something was written but the row still lacks one of them;
 *  - `skipped` nothing was written.
 */
export function linkWriteStatus(p: {
  existingCityId: string | null;
  existingCountryId: string | null;
  newCityId: string | null;
  newCountryId: string | null;
}): 'linked' | 'partial' | 'skipped' {
  const wroteCity = !!p.newCityId && !p.existingCityId;
  const wroteCountry = !!p.newCountryId && !p.existingCountryId;
  if (!wroteCity && !wroteCountry) return 'skipped';
  const hasCity = !!(p.existingCityId || p.newCityId);
  const hasCountry = !!(p.existingCountryId || p.newCountryId);
  return hasCity && hasCountry ? 'linked' : 'partial';
}
