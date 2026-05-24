import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  filterAndSortCities,
  type CitiesFilterParams,
  type CityForFilter,
} from '@/utils/citiesFilter';

/**
 * Cities directory data hook — single round trip for cities + country
 * equality + continent, plus a separate batched fetch for venue counts.
 *
 * Returns the full list and a memoized filtered/sorted view. Filtering
 * happens client-side so chip toggles + search are instant.
 */

export interface DirectoryCity extends CityForFilter {
  slug: string;
  image_url?: string | null;
  curated_image_url?: string | null;
  is_capital?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
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
}

interface CitiesDirectoryFetch {
  cities: DirectoryCity[];
  continents: DirectoryContinent[];
}

const CACHE_TIME = 30 * 60 * 1000;
const STALE_TIME = 15 * 60 * 1000;

async function fetchCitiesDirectory(): Promise<CitiesDirectoryFetch> {
  const { data, error } = await supabase
    .from('cities')
    .select(
      `
      id, slug, name, name_en, name_de, region_name,
      population, image_url, curated_image_url, is_capital,
      latitude, longitude,
      countries:country_id (
        id, name, slug, equality_score,
        continents:continent_id ( code, name )
      )
    `,
    )
    .is('duplicate_of_id', null)
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('population', { ascending: false })
    .limit(400);

  if (error) throw error;

  const cities = (data ?? []) as unknown as DirectoryCity[];

  const continentsMap = new Map<string, DirectoryContinent>();
  for (const c of cities) {
    const cont = c.countries?.continents;
    if (cont?.code && cont.name && !continentsMap.has(cont.code)) {
      continentsMap.set(cont.code, { code: cont.code, name: cont.name });
    }
  }
  const continents = Array.from(continentsMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return { cities, continents };
}

/**
 * Chunk size for the venue-count IN() query. PostgREST + Cloudflare cap URL
 * length around 8KB; 36-char UUIDs + %2C separators ≈ 39 chars each, so 100
 * IDs ≈ 4KB — well under the limit and leaves room for the rest of the
 * request. Without batching, a 400-city payload trips a 400 response.
 */
export const VENUE_COUNT_BATCH_SIZE = 100;

async function fetchVenueCounts(cityIds: string[]): Promise<Map<string, number>> {
  if (cityIds.length === 0) return new Map();

  const batches: string[][] = [];
  for (let i = 0; i < cityIds.length; i += VENUE_COUNT_BATCH_SIZE) {
    batches.push(cityIds.slice(i, i + VENUE_COUNT_BATCH_SIZE));
  }

  const counts = new Map<string, number>();

  const results = await Promise.all(
    batches.map((batch) =>
      supabase
        .from('venues')
        .select('city_id')
        .eq('status', 'approved')
        .not('city_id', 'is', null)
        .in('city_id', batch),
    ),
  );

  for (const { data, error } of results) {
    // Venue counts are decoration — never block the directory on a failed
    // batch. Surface zero for those city ids; the row simply omits the
    // venue suffix.
    if (error) continue;
    for (const row of (data ?? []) as Array<{ city_id: string | null }>) {
      if (!row.city_id) continue;
      counts.set(row.city_id, (counts.get(row.city_id) ?? 0) + 1);
    }
  }

  return counts;
}

export interface UseCitiesDirectoryResult {
  cities: DirectoryCity[];
  filtered: DirectoryCity[];
  continents: DirectoryContinent[];
  venueCounts: ReadonlyMap<string, number>;
  loading: boolean;
  error: string | null;
}

export function useCitiesDirectory(
  filterParams: CitiesFilterParams,
): UseCitiesDirectoryResult {
  const citiesQ = useQuery({
    queryKey: ['cities-directory'],
    queryFn: fetchCitiesDirectory,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  const cityIds = useMemo(
    () => (citiesQ.data?.cities ?? []).map((c) => c.id),
    [citiesQ.data?.cities],
  );

  const venuesQ = useQuery({
    queryKey: ['cities-directory-venue-counts', cityIds.length],
    queryFn: () => fetchVenueCounts(cityIds),
    enabled: cityIds.length > 0,
    gcTime: CACHE_TIME,
    staleTime: STALE_TIME,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const venueCounts: ReadonlyMap<string, number> = useMemo(
    () => venuesQ.data ?? new Map(),
    [venuesQ.data],
  );

  const filtered = useMemo(() => {
    const all = citiesQ.data?.cities ?? [];
    return filterAndSortCities(all, venueCounts, filterParams);
  }, [citiesQ.data?.cities, venueCounts, filterParams]);

  return {
    cities: citiesQ.data?.cities ?? [],
    filtered,
    continents: citiesQ.data?.continents ?? [],
    venueCounts,
    loading: citiesQ.isLoading,
    error: citiesQ.error ? (citiesQ.error as Error).message : null,
  };
}
