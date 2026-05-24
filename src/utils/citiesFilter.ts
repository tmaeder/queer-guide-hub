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

export type CitiesSortKey = 'population' | 'name' | 'equality' | 'venues';

export const CITIES_SORT_KEYS: CitiesSortKey[] = [
  'population',
  'name',
  'equality',
  'venues',
];

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
    continents?: { code?: string | null } | null;
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
  const haystack = [
    city.name,
    city.name_en,
    city.name_de,
    city.region_name,
    city.countries?.name,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return haystack.includes(q);
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
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av;
      };
    case 'venues':
      return (a, b) => (venueCounts.get(b.id) ?? 0) - (venueCounts.get(a.id) ?? 0);
    case 'population':
    default:
      return (a, b) => {
        const av = a.population ?? -1;
        const bv = b.population ?? -1;
        return bv - av;
      };
  }
}

export function filterAndSortCities<T extends CityForFilter>(
  cities: readonly T[],
  venueCounts: ReadonlyMap<string, number>,
  params: CitiesFilterParams,
): T[] {
  const q = params.q.trim().toLowerCase();
  const filtered = cities.filter((c) => {
    if (!matchesText(c, q)) return false;
    if (params.continents.size) {
      const code = c.countries?.continents?.code?.toLowerCase();
      if (!code || !params.continents.has(code)) return false;
    }
    if (params.tiers.size) {
      if (!params.tiers.has(tierFor(c.countries?.equality_score))) return false;
    }
    return true;
  });
  return filtered.slice().sort(sorter(params.sort, venueCounts));
}

/** Parse a comma-separated URL param into a Set, dropping empties. */
export function parseSetParam(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function isCitiesSortKey(v: string | null | undefined): v is CitiesSortKey {
  return !!v && (CITIES_SORT_KEYS as string[]).includes(v);
}

export function isEqualityTier(v: string): v is EqualityTier {
  return (EQUALITY_TIERS as string[]).includes(v);
}
