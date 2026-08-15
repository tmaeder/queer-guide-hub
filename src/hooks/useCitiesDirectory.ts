import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { untypedRpc } from '@/integrations/supabase/untyped';
import {
  continentFacetCounts,
  filterAndSortCities,
  type CitiesFilterParams,
  type CityForFilter,
} from '@/utils/citiesFilter';

/**
 * Cities directory data hook — ONE round trip for the whole corpus.
 *
 * This used to be a `.limit(400)` select ordered by population, plus a venue-count
 * query batched at 100 ids because PostgREST/Cloudflare cap the URL near 8 KB. Two
 * things were wrong with that:
 *
 *   1. The cap chose cities by POPULATION, which deleted 1,768 cities that have
 *      approved venues — 40% of the venue corpus was unreachable from /cities.
 *      Brighton, Sitges, Palm Springs, Puerto Vallarta, West Hollywood, Tel Aviv.
 *   2. Scaling that batching to the real corpus is 22 round trips.
 *
 * `cities_directory()` (migration 20260905100000) returns all 2,142 seo-indexable,
 * non-ghost cities WITH their counts in a single 98 ms statement. See the migration
 * for the gate and for why it is SECURITY DEFINER.
 */

/** A row exactly as `cities_directory()` returns it — flat, one level. */
interface CitiesDirectoryRow {
  id: string;
  slug: string;
  name: string;
  name_en: string | null;
  name_de: string | null;
  region_name: string | null;
  population: number | null;
  latitude: number | null;
  longitude: number | null;
  is_capital: boolean | null;
  editorial_hook: string | null;
  country_id: string | null;
  country_name: string | null;
  country_slug: string | null;
  equality_score: number | null;
  continent_code: string | null;
  continent_name: string | null;
  venue_count: number;
  upcoming_event_count: number;
  village_count: number;
  high_risk: boolean;
}

/**
 * The nested `countries` shape is kept deliberately. `filterAndSortCities`,
 * `CitiesMapPane` and the filter unit tests all read `city.countries?.…`, and
 * flattening them would be a wide, untested edit for no behavioural gain. The RPC
 * returns flat columns; this hook is the one place that reshapes them.
 *
 * `image_url` / `curated_image_url` are GONE, not optional. The redesigned card has
 * no photo, and leaving the fields on the type would let a stale reader render
 * nothing instead of failing to compile.
 */
export interface DirectoryCity extends CityForFilter {
  slug: string;
  latitude?: number | null;
  longitude?: number | null;
  is_capital?: boolean | null;
  editorial_hook?: string | null;
  /** Approved venues. Counted for gated cities too — see the migration. */
  venue_count: number;
  /** Events starting from today onward, not the ~99%-past archive. */
  upcoming_event_count: number;
  village_count: number;
  /** Resolved by `location_is_high_risk` server-side, never re-derived here. */
  high_risk: boolean;
  countries:
    | (CityForFilter['countries'] & {
        id?: string;
        slug?: string | null;
      })
    | null;
}

export interface DirectoryContinent {
  code: string;
  name: string;
  /** Unfiltered total for this continent across the whole directory. */
  count: number;
}

interface CitiesDirectoryFetch {
  cities: DirectoryCity[];
  continents: DirectoryContinent[];
  venueCounts: ReadonlyMap<string, number>;
}

const CACHE_TIME = 30 * 60 * 1000;
const STALE_TIME = 15 * 60 * 1000;

function toDirectoryCity(row: CitiesDirectoryRow): DirectoryCity {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    name_en: row.name_en,
    name_de: row.name_de,
    region_name: row.region_name,
    population: row.population,
    latitude: row.latitude,
    longitude: row.longitude,
    is_capital: row.is_capital,
    editorial_hook: row.editorial_hook,
    venue_count: row.venue_count,
    upcoming_event_count: row.upcoming_event_count,
    village_count: row.village_count,
    high_risk: row.high_risk,
    countries: row.country_id
      ? {
          id: row.country_id,
          name: row.country_name,
          slug: row.country_slug,
          equality_score: row.equality_score,
          continents: row.continent_code
            ? { code: row.continent_code, name: row.continent_name }
            : null,
        }
      : null,
  };
}

async function fetchCitiesDirectory(): Promise<CitiesDirectoryFetch> {
  // `untypedRpc` until types.ts is regenerated against prod — the function only
  // reaches the live schema when its migration merges to main, and the generated
  // types are produced from the live schema.
  const { data, error } = await untypedRpc<CitiesDirectoryRow[]>('cities_directory');
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const cities: DirectoryCity[] = [];
  const venueCounts = new Map<string, number>();
  const continentsMap = new Map<string, DirectoryContinent>();

  for (const row of rows) {
    cities.push(toDirectoryCity(row));
    venueCounts.set(row.id, row.venue_count);
    if (row.continent_code && row.continent_name) {
      const existing = continentsMap.get(row.continent_code);
      if (existing) existing.count += 1;
      else
        continentsMap.set(row.continent_code, {
          code: row.continent_code,
          name: row.continent_name,
          count: 1,
        });
    }
  }

  const continents = Array.from(continentsMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );

  return { cities, continents, venueCounts };
}

export interface UseCitiesDirectoryResult {
  cities: DirectoryCity[];
  filtered: DirectoryCity[];
  continents: DirectoryContinent[];
  venueCounts: ReadonlyMap<string, number>;
  /** Per-continent counts honouring every filter EXCEPT continent. */
  continentFacets: ReadonlyMap<string, number>;
  loading: boolean;
  error: string | null;
}

const EMPTY_COUNTS: ReadonlyMap<string, number> = new Map();

export function useCitiesDirectory(filterParams: CitiesFilterParams): UseCitiesDirectoryResult {
  const citiesQ = useQuery({
    queryKey: ['cities-directory'],
    queryFn: fetchCitiesDirectory,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const cities = useMemo(() => citiesQ.data?.cities ?? [], [citiesQ.data?.cities]);
  const venueCounts = citiesQ.data?.venueCounts ?? EMPTY_COUNTS;

  const filtered = useMemo(
    () => filterAndSortCities(cities, venueCounts, filterParams),
    [cities, venueCounts, filterParams],
  );

  const continentFacets = useMemo(
    () => continentFacetCounts(cities, filterParams),
    [cities, filterParams],
  );

  return {
    cities,
    filtered,
    continents: citiesQ.data?.continents ?? [],
    venueCounts,
    continentFacets,
    loading: citiesQ.isLoading,
    error: citiesQ.error ? (citiesQ.error as Error).message : null,
  };
}
