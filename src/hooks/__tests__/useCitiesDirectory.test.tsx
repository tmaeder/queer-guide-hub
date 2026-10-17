/**
 * @vitest-environment jsdom
 *
 * These tests used to assert the venue-count batching: the directory fetched
 * cities, then counted venues in a second query chunked at 100 ids because
 * PostgREST/Cloudflare cap the URL near 8 KB.
 *
 * That whole mechanism is gone. `cities_directory()` returns the counts with the
 * rows, so what needs guarding now is the RESHAPE — and since 99991792214568 the RPC
 * is COLUMNAR (`{countries, cols, rows}`, with the country block normalised over 212
 * entries) while every consumer (filter, sorter, map pane) reads a nested
 * `countries.continents` object. A silent mistake there does not throw; it makes every
 * continent filter match nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: vi.fn(),
}));

import { useCitiesDirectory, decodeCitiesDirectory } from '@/hooks/useCitiesDirectory';
import { untypedRpc } from '@/integrations/supabase/untyped';

const rpcMock = untypedRpc as unknown as ReturnType<typeof vi.fn>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const NEUTRAL_PARAMS = {
  q: '',
  continents: new Set<string>(),
  tiers: new Set<'very-high' | 'high' | 'moderate' | 'low' | 'very-low' | 'unknown'>(),
  sort: 'venues' as const,
};

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'id-1',
    slug: 'berlin',
    name: 'Berlin',
    name_en: null,
    name_de: null,
    region_name: null,
    population: 3_700_000,
    latitude: 52.5,
    longitude: 13.4,
    is_capital: true,
    editorial_hook: null,
    country_id: 'de',
    country_name: 'Germany',
    country_slug: 'germany',
    equality_score: 88,
    continent_code: 'EU',
    continent_name: 'Europe',
    venue_count: 870,
    upcoming_event_count: 4,
    village_count: 2,
    high_risk: false,
    ...over,
  };
}

/**
 * The columns the RPC ships in `cols`, in its order.
 *
 * Declared here only so `payload()` can encode; the HOOK must never rely on this
 * order — `decodes by name, not by position` below reverses it and asserts the decode
 * still works.
 */
const COLS = [
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
] as const;

/**
 * Encodes flat test rows into the columnar `{countries, cols, rows}` envelope the RPC
 * actually returns (99991792214568), normalising the country block exactly as the SQL
 * does.
 *
 * These tests keep DESCRIBING cities as objects — that part reads better — but they must
 * EXERCISE the real decoder. Feeding the hook a flat array it no longer receives is how
 * a test passes against a shape only the test knows about.
 */
function payload(rows: Record<string, unknown>[], cols: readonly string[] = COLS) {
  const countries: Record<string, unknown>[] = [];
  const seen = new Map<string, number>();
  const encoded = rows.map((r) => {
    let country: number | null = null;
    if (r.country_id != null) {
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
          id: r.country_id,
          name: r.country_name,
          slug: r.country_slug,
          equality_score: r.equality_score,
          continent_code: r.continent_code,
          continent_name: r.continent_name,
        });
      }
      country = seen.get(key)!;
    }
    return cols.map((col) => (col === 'country' ? country : (r[col] ?? null)));
  });
  return { countries, cols: [...cols], rows: encoded };
}

beforeEach(() => rpcMock.mockReset());

describe('useCitiesDirectory', () => {
  it('reshapes the flat RPC row into the nested country/continent shape', async () => {
    rpcMock.mockResolvedValue({ data: payload([row()]), error: null });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const city = result.current.cities[0];
    expect(city.countries?.name).toBe('Germany');
    expect(city.countries?.equality_score).toBe(88);
    // The nested continent is what every continent filter reads.
    expect(city.countries?.continents?.code).toBe('EU');
    expect(city.countries?.continents?.name).toBe('Europe');
    expect(city.venue_count).toBe(870);
    expect(city.village_count).toBe(2);
    expect(city.high_risk).toBe(false);
  });

  it('derives venueCounts from the same payload — no second query', async () => {
    rpcMock.mockResolvedValue({
      data: payload([
        row(),
        row({ id: 'id-2', slug: 'brighton', name: 'Brighton', venue_count: 184 }),
      ]),
      error: null,
    });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('cities_directory');
    expect(result.current.venueCounts.get('id-1')).toBe(870);
    expect(result.current.venueCounts.get('id-2')).toBe(184);
  });

  it('counts continents across the whole corpus, biggest first', async () => {
    rpcMock.mockResolvedValue({
      data: payload([
        row({ id: 'a' }),
        row({ id: 'b' }),
        row({ id: 'c', continent_code: 'OC', continent_name: 'Oceania' }),
      ]),
      error: null,
    });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.continents).toEqual([
      { code: 'EU', name: 'Europe', count: 2 },
      { code: 'OC', name: 'Oceania', count: 1 },
    ]);
  });

  it('facet counts honour the other filters but not the continent facet', async () => {
    rpcMock.mockResolvedValue({
      data: payload([
        row({ id: 'a', name: 'Berlin' }),
        row({ id: 'b', name: 'Brighton', country_name: 'United Kingdom' }),
        row({ id: 'c', name: 'Sydney', continent_code: 'OC', continent_name: 'Oceania' }),
      ]),
      error: null,
    });

    const { result } = renderHook(
      () =>
        useCitiesDirectory({
          ...NEUTRAL_PARAMS,
          // Standing at Oceania must not zero out Europe's tile — otherwise the
          // only tile with a number is the one you already chose.
          continents: new Set(['oc']),
        }),
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.continentFacets.get('eu')).toBe(2);
    expect(result.current.continentFacets.get('oc')).toBe(1);
    // …while the grid itself does respect it.
    expect(result.current.filtered.map((c) => c.name)).toEqual(['Sydney']);
  });

  it('decodes by name, not by position', async () => {
    // The whole reason `cols` ships with the data. Reverse the column order and the
    // hook must still read every field correctly; a decoder with the order hardcoded
    // would silently hand each city its neighbour's values.
    const reversed = [...COLS].reverse();
    rpcMock.mockResolvedValue({ data: payload([row()], reversed), error: null });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const city = result.current.cities[0];
    // `id` and `slug` are asserted FIRST because they are what a careless decoder
    // hardcodes: `id` sits at position 0 in the real payload, so `id: 0` is
    // indistinguishable from a correct decode until the order moves. A mutation doing
    // exactly that SURVIVED this test until these lines existed.
    expect(city.id).toBe('id-1');
    expect(city.slug).toBe('berlin');
    expect(city.name).toBe('Berlin');
    expect(city.population).toBe(3_700_000);
    expect(city.venue_count).toBe(870);
    expect(city.upcoming_event_count).toBe(4);
    expect(city.village_count).toBe(2);
    expect(city.is_capital).toBe(true);
    expect(city.high_risk).toBe(false);
    expect(city.countries?.continents?.code).toBe('EU');
    // venueCounts is keyed by id, so a wrong id silently empties the venues sort.
    expect(result.current.venueCounts.get('id-1')).toBe(870);
  });

  it('fails loudly when the payload loses a column it needs', async () => {
    // Absence of a column must not degrade to `undefined` on 16,206 cities. Dropping
    // `venue_count` from cols leaves the sort silently reading nothing.
    rpcMock.mockResolvedValue({
      data: payload(
        [row()],
        COLS.filter((c) => c !== 'venue_count'),
      ),
      error: null,
    });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.error).toMatch(/no "venue_count" column/));
    expect(result.current.cities).toEqual([]);
  });

  it('decodes a real cities_directory() envelope', () => {
    // Captured verbatim from prod (SELECT over the 99991792214568 shape), so this
    // fixture is SQL output rather than a shape invented by the test. Note jsonb
    // reorders object keys by length — `cols` first, `countries` last — which is one
    // more reason nothing may decode by position.
    const envelope = {
      cols: [
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
      ],
      rows: [
        [
          '5761c6c4-3ed6-4429-832b-025e508db544',
          'berlin',
          'Berlin',
          null,
          null,
          'Berlin',
          3700000,
          52.52,
          13.405,
          true,
          null,
          null,
          'Vibrant queer culture',
          0,
          0,
          0,
          false,
          1,
        ],
        [
          '01111a29-40ee-4497-82e5-a1be74bf93ba',
          's-o-paulo',
          'São Paulo',
          null,
          null,
          'São Paulo',
          22400000,
          -23.5558,
          -46.6396,
          false,
          true,
          'São Paulo',
          'Vibrant metropolis',
          0,
          0,
          0,
          false,
          0,
        ],
        [
          'bdbeb5bc-d2de-462a-a906-aed8e3b9f968',
          'sitges',
          'Sitges',
          null,
          null,
          'Catalonia',
          31954,
          41.2358212,
          1.8080251,
          false,
          null,
          null,
          null,
          0,
          0,
          0,
          false,
          2,
        ],
      ],
      countries: [
        {
          id: '79939873-bda8-4822-bdae-21ec2239b48a',
          name: 'Brazil',
          slug: 'brazil',
          continent_code: 'SA',
          continent_name: 'South America',
          equality_score: 100,
        },
        {
          id: 'fd9997de-bf8f-49a5-a641-9240a39541ff',
          name: 'Germany',
          slug: 'germany',
          continent_code: 'EU',
          continent_name: 'Europe',
          equality_score: 100,
        },
        {
          id: '4020d296-538c-4d6d-a728-33db16460181',
          name: 'Spain',
          slug: 'spain',
          continent_code: 'EU',
          continent_name: 'Europe',
          equality_score: 100,
        },
      ],
    };

    const { cities, continents, venueCounts } = decodeCitiesDirectory(envelope);
    const byName = Object.fromEntries(cities.map((c) => [c.name, c]));

    expect(cities).toHaveLength(3);
    expect(byName['Berlin'].countries?.name).toBe('Germany');
    expect(byName['Berlin'].countries?.continents?.code).toBe('EU');
    expect(byName['Berlin'].is_capital).toBe(true);
    expect(byName['Sitges'].countries?.slug).toBe('spain');
    expect(byName['Sitges'].region_name).toBe('Catalonia');
    // nullif(is_regional_capital, false) means the cell is null for most rows; the
    // hook must still surface a boolean.
    expect(byName['Berlin'].is_regional_capital).toBe(false);
    expect(byName['São Paulo'].is_regional_capital).toBe(true);
    expect(byName['São Paulo'].countries?.continents?.name).toBe('South America');
    // Two EU cities share one lookup entry each; the facet count must still be 2.
    expect(continents).toEqual([
      { code: 'EU', name: 'Europe', count: 2 },
      { code: 'SA', name: 'South America', count: 1 },
    ]);
    expect(venueCounts.get('5761c6c4-3ed6-4429-832b-025e508db544')).toBe(0);
  });

  it('still reads the PRE-columnar flat array', async () => {
    // `db push` and the Cloudflare Pages build both fire on the same push to main and
    // race. If Pages wins, this bundle talks to the old RPC for a minute or two — and
    // without this path /cities would render its "No cities found" empty state, which
    // is the exact symptom the change exists to remove. Delete with the shim.
    rpcMock.mockResolvedValue({
      data: [
        row(),
        row({ id: 'id-2', name: 'Sydney', continent_code: 'OC', continent_name: 'Oceania' }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const city = result.current.cities.find((c) => c.name === 'Berlin')!;
    expect(city.id).toBe('id-1');
    expect(city.countries?.name).toBe('Germany');
    expect(city.countries?.continents?.code).toBe('EU');
    expect(city.venue_count).toBe(870);
    expect(result.current.venueCounts.get('id-1')).toBe(870);
    // The country block is normalised on the way in, so the facets still work.
    expect(result.current.continents).toEqual([
      { code: 'EU', name: 'Europe', count: 1 },
      { code: 'OC', name: 'Oceania', count: 1 },
    ]);
  });

  it('surfaces an RPC error as a message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.cities).toEqual([]);
  });
});
