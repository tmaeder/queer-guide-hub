/**
 * Pure helpers for the /cities directory. Kept out of the data hook so the
 * filter / sort / tier logic is testable without supabase or React.
 *
 * Tier types + thresholds live in src/utils/equalityScore.ts as the single
 * source of truth — re-exported here for ergonomic imports by the cities
 * surface and to preserve the historical `tierFor` name.
 */

import { tierForScore, EQUALITY_TIERS, type EqualityTier } from '@/utils/equalityScore';

export { EQUALITY_TIERS, type EqualityTier };

/** Back-compat alias for the cities surface's pre-refactor name. */
export const tierFor = tierForScore;

export type CitiesSortKey = 'venues' | 'population' | 'name' | 'equality';

/** Order here is the order the sort control offers. `venues` leads because it is
 *  the default — see DEFAULT_SORT in useCitiesUrlState. */
export const CITIES_SORT_KEYS: CitiesSortKey[] = ['venues', 'population', 'name', 'equality'];

export interface CityForFilter {
  id: string;
  name: string;
  name_en?: string | null;
  name_de?: string | null;
  region_name?: string | null;
  population?: number | null;
  countries?: {
    name?: string | null;
    equality_score?: number | null;
    // `name` is carried alongside `code` because the continent line index labels
    // its tiles from the same payload the filter reads — the code alone ("EU") is
    // a filter key, not something to put in front of a reader.
    continents?: { code?: string | null; name?: string | null } | null;
  } | null;
}

export interface CitiesFilterParams {
  q: string;
  continents: Set<string>;
  tiers: Set<EqualityTier>;
  sort: CitiesSortKey;
}

function matchesText(city: CityForFilter, q: string): boolean {
  if (!q) return true;
  const haystack = [city.name, city.name_en, city.name_de, city.region_name, city.countries?.name]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Every sorter must be TOTAL, not merely correct on its own key.
 *
 * `cities_directory()` has no ORDER BY, so the rows arrive in whatever order the
 * planner emitted. Array.prototype.sort is stable, which means ties keep that
 * arbitrary order — and ties are the common case here, not the edge: 1,269 of the
 * 2,142 cities have between 1 and 4 venues. Without a tie-break the same filter
 * could render two different orders across two fetches. Population then name breaks
 * every remaining tie deterministically.
 */
function byPopulationThenName(a: CityForFilter, b: CityForFilter): number {
  const pop = (b.population ?? -1) - (a.population ?? -1);
  if (pop !== 0) return pop;
  return a.name.localeCompare(b.name);
}

function sorter(
  key: CitiesSortKey,
  venueCounts: ReadonlyMap<string, number>,
): (a: CityForFilter, b: CityForFilter) => number {
  switch (key) {
    case 'name':
      return (a, b) => a.name.localeCompare(b.name);
    case 'equality':
      return (a, b) => {
        const av = a.countries?.equality_score;
        const bv = b.countries?.equality_score;
        // Unknown sorts last in both directions rather than reading as zero — an
        // unmeasured country is not a bad one.
        if (av == null && bv == null) return byPopulationThenName(a, b);
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av || byPopulationThenName(a, b);
      };
    case 'population':
      return byPopulationThenName;
    case 'venues':
    default:
      return (a, b) =>
        (venueCounts.get(b.id) ?? 0) - (venueCounts.get(a.id) ?? 0) || byPopulationThenName(a, b);
  }
}

function matchesContinent(city: CityForFilter, continents: Set<string>): boolean {
  if (!continents.size) return true;
  const code = city.countries?.continents?.code?.toLowerCase();
  return !!code && continents.has(code);
}

function matchesTier(city: CityForFilter, tiers: Set<EqualityTier>): boolean {
  if (!tiers.size) return true;
  return tiers.has(tierFor(city.countries?.equality_score));
}

export function filterAndSortCities<T extends CityForFilter>(
  cities: readonly T[],
  venueCounts: ReadonlyMap<string, number>,
  params: CitiesFilterParams,
): T[] {
  const q = params.q.trim().toLowerCase();
  const filtered = cities.filter(
    (c) =>
      matchesText(c, q) && matchesContinent(c, params.continents) && matchesTier(c, params.tiers),
  );
  return filtered.slice().sort(sorter(params.sort, venueCounts));
}

/**
 * How many cities each continent tile would open, given every OTHER active filter.
 *
 * Deliberately ignores `params.continents` — a facet count that applied its own
 * facet would read 0 for every tile you are not standing on, which is the number
 * being wrong in the most confusing possible direction. Applying the rest of the
 * filters is the point: with an equality tier selected, a tile reading 40 must open
 * to 40 cities, not to the unfiltered total.
 *
 * Keys are LOWERCASED continent codes, matching the URL param and `parseSetParam`.
 */
export function continentFacetCounts(
  cities: readonly CityForFilter[],
  params: CitiesFilterParams,
): Map<string, number> {
  const q = params.q.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const c of cities) {
    if (!matchesText(c, q)) continue;
    if (!matchesTier(c, params.tiers)) continue;
    const code = c.countries?.continents?.code?.toLowerCase();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

/** Parse a comma-separated URL param into a Set, dropping empties. */
export function parseSetParam(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isCitiesSortKey(v: string | null | undefined): v is CitiesSortKey {
  return !!v && (CITIES_SORT_KEYS as string[]).includes(v);
}

export function isEqualityTier(v: string): v is EqualityTier {
  return (EQUALITY_TIERS as string[]).includes(v);
}
