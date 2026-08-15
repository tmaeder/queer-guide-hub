/**
 * @vitest-environment jsdom
 *
 * These tests used to assert the venue-count batching: the directory fetched
 * cities, then counted venues in a second query chunked at 100 ids because
 * PostgREST/Cloudflare cap the URL near 8 KB.
 *
 * That whole mechanism is gone. `cities_directory()` returns the counts with the
 * rows, so what needs guarding now is the RESHAPE — the RPC is flat and every
 * consumer (filter, sorter, map pane) reads a nested `countries.continents`
 * object. A silent mistake there does not throw; it makes every continent filter
 * match nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: vi.fn(),
}));

import { useCitiesDirectory } from '@/hooks/useCitiesDirectory';
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

beforeEach(() => rpcMock.mockReset());

describe('useCitiesDirectory', () => {
  it('reshapes the flat RPC row into the nested country/continent shape', async () => {
    rpcMock.mockResolvedValue({ data: [row()], error: null });

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
      data: [row(), row({ id: 'id-2', slug: 'brighton', name: 'Brighton', venue_count: 184 })],
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
      data: [
        row({ id: 'a' }),
        row({ id: 'b' }),
        row({ id: 'c', continent_code: 'OC', continent_name: 'Oceania' }),
      ],
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
      data: [
        row({ id: 'a', name: 'Berlin' }),
        row({ id: 'b', name: 'Brighton', country_name: 'United Kingdom' }),
        row({ id: 'c', name: 'Sydney', continent_code: 'OC', continent_name: 'Oceania' }),
      ],
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

  it('surfaces an RPC error as a message', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.cities).toEqual([]);
  });
});
