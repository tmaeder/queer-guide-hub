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
 * `cities_directory()` returns every seo-indexable, non-ghost city WITH its counts in
 * one statement — 16,206 rows in ~720 ms as of 2026-10-16. See the migration for the
 * gate and for why it is SECURITY DEFINER.
 *
 * THE PAYLOAD IS COLUMNAR, and that is a size decision with numbers behind it
 * (99991792214568). As an array of 25-key objects it was 7,514 kB, of which the KEY
 * NAMES were 3,675 kB — 55% — and a denormalised country block another 2,673 kB over
 * just 212 distinct countries. As `{countries, cols, rows}` it is 2,831 kB, which took
 * the RPC from 1,620 ms to ~720 ms against anon's 3s statement_timeout.
 *
 * Pagination was the obvious alternative and is the wrong one here: `filterAndSortCities`,
 * `continentFacetCounts` and `CitiesMapPane` all read the WHOLE corpus client-side, so
 * paginating breaks search, the continent counts and the map at once, and only pays off
 * once all three move server-side.
 */

/** One entry of the payload's country lookup. Rows reference it by index. */
interface DirectoryCountryEntry {
  id: string | null;
  name: string | null;
  slug: string | null;
  equality_score: number | null;
  continent_code: string | null;
  continent_name: string | null;
}

/**
 * `cols` names each position in `rows`, and this hook decodes BY NAME.
 *
 * Decoding against a column order hardcoded here would break silently and
 * catastrophically the first time the migration inserts a column — every city would
 * read a neighbouring field with no error raised anywhere. `requireColumn` throws
 * instead, which is the one failure mode worth having on a shape like this.
 */
interface CitiesDirectoryPayload {
  countries?: DirectoryCountryEntry[] | null;
  cols?: string[] | null;
  rows?: unknown[][] | null;
}

function columnLookup(cols: readonly string[]) {
  const index = new Map<string, number>();
  cols.forEach((col, i) => index.set(col, i));
  return function requireColumn(col: string): number {
    const i = index.get(col);
    if (i === undefined) {
      throw new Error(
        `cities_directory: payload has no "${col}" column (cols: ${cols.join(', ') || 'none'})`,
      );
    }
    return i;
  };
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
  /** Capital of a first-level subdivision (Bundesland, state, région). */
  is_regional_capital?: boolean | null;
  capital_of_region?: string | null;
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

/**
 * DELETE-ME WINDOW: tolerates the pre-99991792214568 flat array.
 *
 * `supabase db push` (deploy-supabase-functions.yml) and the Cloudflare Pages build
 * both trigger on the same push to main and RACE. If Pages wins, this bundle is live
 * against the old RPC for a minute or two — and `requireColumn` would throw, which
 * react-query surfaces as an error, which /cities renders as its "No cities found"
 * empty state. That is the exact symptom this whole change exists to remove, so
 * shipping a fix that briefly reproduces it is not acceptable.
 *
 * This is a correct read of the OLD shape, not a reconstruction of data the new shape
 * dropped — the hazard #3332 records. Columnar is detected by `Array.isArray`, which
 * the two shapes cannot both satisfy.
 *
 * REMOVE once 99991792214568 is applied to prod (check `schema_migrations` by NAME,
 * not by version). Nothing breaks if it lingers; it is just dead weight.
 */
function decodeLegacyFlatRows(rows: Record<string, unknown>[]): CitiesDirectoryPayload {
  const cols = [
    'id',
    'slug',
    'name',
    'name_en',
    'name_de',
    'region_name',
    'population',
    'latitude',
    'longitude',
    'is_capital',
    'is_regional_capital',
    'capital_of_region',
    'editorial_hook',
    'venue_count',
    'upcoming_event_count',
    'village_count',
    'high_risk',
    'country',
  ];
  const countries: DirectoryCountryEntry[] = [];
  const seen = new Map<string, number>();
  return {
    cols,
    countries,
    rows: rows.map((r) => {
      let country: number | null = null;
      if (r.country_id != null) {
        // Keyed on the FULL tuple, matching the SQL's GROUP BY — not on country_id
        // alone. Keying on the id assumes country -> continent is 1:1, which holds in
        // real data and silently drops a row's own continent when it does not.
        const key = [
          r.country_id,
          r.country_name,
          r.country_slug,
          r.equality_score,
          r.continent_code,
          r.continent_name,
        ].join('|');
        if (!seen.has(key)) {
          seen.set(key, countries.length);
          countries.push({
            id: r.country_id as string,
            name: (r.country_name as string | null) ?? null,
            slug: (r.country_slug as string | null) ?? null,
            equality_score: (r.equality_score as number | null) ?? null,
            continent_code: (r.continent_code as string | null) ?? null,
            continent_name: (r.continent_name as string | null) ?? null,
          });
        }
        country = seen.get(key)!;
      }
      return cols.map((col) => (col === 'country' ? country : (r[col] ?? null)));
    }),
  };
}

/** Decodes the columnar payload into the nested shape every consumer already reads. */
export function decodeCitiesDirectory(
  input: CitiesDirectoryPayload | Record<string, unknown>[],
): CitiesDirectoryFetch {
  const payload = Array.isArray(input) ? decodeLegacyFlatRows(input) : input;
  const requireColumn = columnLookup(payload.cols ?? []);
  const lookup = payload.countries ?? [];
  const rows = payload.rows ?? [];

  // Resolved once, outside the row loop. Every one of these throws if absent, so a
  // payload that has lost a column fails loudly here rather than rendering 16,206
  // cities with one field quietly shifted.
  const I = {
    id: requireColumn('id'),
    slug: requireColumn('slug'),
    name: requireColumn('name'),
    nameEn: requireColumn('name_en'),
    nameDe: requireColumn('name_de'),
    regionName: requireColumn('region_name'),
    population: requireColumn('population'),
    latitude: requireColumn('latitude'),
    longitude: requireColumn('longitude'),
    isCapital: requireColumn('is_capital'),
    isRegionalCapital: requireColumn('is_regional_capital'),
    capitalOfRegion: requireColumn('capital_of_region'),
    editorialHook: requireColumn('editorial_hook'),
    venueCount: requireColumn('venue_count'),
    upcomingEventCount: requireColumn('upcoming_event_count'),
    villageCount: requireColumn('village_count'),
    highRisk: requireColumn('high_risk'),
    country: requireColumn('country'),
  };

  const cities: DirectoryCity[] = [];
  const venueCounts = new Map<string, number>();
  const continentsMap = new Map<string, DirectoryContinent>();

  for (const row of rows) {
    const id = row[I.id] as string;
    const venueCount = (row[I.venueCount] as number | null) ?? 0;
    const countryIx = row[I.country] as number | null;
    // A dangling index would be a bug in the RPC (its P5 asserts against it), but it
    // must degrade to "no country" rather than throw on one bad row.
    const country = countryIx === null || countryIx === undefined ? undefined : lookup[countryIx];

    cities.push({
      id,
      slug: row[I.slug] as string,
      name: row[I.name] as string,
      name_en: (row[I.nameEn] as string | null) ?? null,
      name_de: (row[I.nameDe] as string | null) ?? null,
      region_name: (row[I.regionName] as string | null) ?? null,
      population: (row[I.population] as number | null) ?? null,
      latitude: (row[I.latitude] as number | null) ?? null,
      longitude: (row[I.longitude] as number | null) ?? null,
      is_capital: (row[I.isCapital] as boolean | null) ?? null,
      // Null, not false, for ~16,000 rows — the RPC nullifs it so the columnar cell is
      // the 4-byte `null` rather than `false`.
      is_regional_capital: (row[I.isRegionalCapital] as boolean | null) ?? false,
      capital_of_region: (row[I.capitalOfRegion] as string | null) ?? null,
      editorial_hook: (row[I.editorialHook] as string | null) ?? null,
      venue_count: venueCount,
      upcoming_event_count: (row[I.upcomingEventCount] as number | null) ?? 0,
      village_count: (row[I.villageCount] as number | null) ?? 0,
      high_risk: (row[I.highRisk] as boolean | null) ?? false,
      countries: country
        ? {
            id: country.id ?? undefined,
            name: country.name,
            slug: country.slug,
            equality_score: country.equality_score,
            continents: country.continent_code
              ? { code: country.continent_code, name: country.continent_name }
              : null,
          }
        : null,
    });

    venueCounts.set(id, venueCount);
    if (country?.continent_code && country.continent_name) {
      const existing = continentsMap.get(country.continent_code);
      if (existing) existing.count += 1;
      else
        continentsMap.set(country.continent_code, {
          code: country.continent_code,
          name: country.continent_name,
          count: 1,
        });
    }
  }

  const continents = Array.from(continentsMap.values()).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );

  return { cities, continents, venueCounts };
}

async function fetchCitiesDirectory(): Promise<CitiesDirectoryFetch> {
  // `untypedRpc` until types.ts is regenerated against prod — the function only
  // reaches the live schema when its migration merges to main, and the generated
  // types are produced from the live schema.
  const { data, error } = await untypedRpc<CitiesDirectoryPayload | Record<string, unknown>[]>(
    'cities_directory',
  );
  if (error) throw new Error(error.message);
  return decodeCitiesDirectory(data ?? {});
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
