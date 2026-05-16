/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));

import { useDiscoverableTrips } from '../useDiscoverableTrips';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseRow = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Berlin Pride',
  description: null,
  start_date: '2026-06-01',
  end_date: '2026-06-05',
  cover_image_url: null,
  owner_id: 'u1',
  created_at: '2026-04-01',
  primary_city_id: 'c-berlin',
  primary_country_id: 'co-de',
  is_staff_pick: true,
  fork_count: 1,
  save_count: 5,
  traveler_type: 'solo',
  vibe_tags: ['lgbtq'],
  primary_city: { name: 'Berlin', latitude: 52.52, longitude: 13.405 },
  primary_country: { code: 'DE' },
  trip_places: [
    { cities: { name: 'Berlin' }, countries: { name: 'Germany', equality_score: 8 } },
    { cities: { name: 'Hamburg' }, countries: { name: 'Germany', equality_score: 8 } },
  ],
  owner: { display_name: 'Alice', avatar_url: null },
  ...over,
});

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useDiscoverableTrips — happy path', () => {
  it('maps trip rows including aggregated cities, countries, duration', async () => {
    withResults({ data: [baseRow()], error: null });
    const { result } = renderHook(() => useDiscoverableTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const trip = result.current.data![0];
    expect(trip.cities.sort()).toEqual(['Berlin', 'Hamburg']);
    expect(trip.countries).toEqual(['Germany']);
    expect(trip.duration_days).toBe(5); // June 1 → June 5 inclusive
    expect(trip.min_equality_score).toBe(8);
    expect(trip.is_staff_pick).toBe(true);
    expect(trip.primary_city_name).toBe('Berlin');
    expect(trip.primary_country_code).toBe('DE');
    expect(trip.owner?.display_name).toBe('Alice');
  });

  it("coerces invalid traveler_type to null + non-array vibe_tags to []", async () => {
    withResults({
      data: [baseRow({ traveler_type: 'caravan', vibe_tags: null })],
      error: null,
    });
    const { result } = renderHook(() => useDiscoverableTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data![0].traveler_type).toBeNull();
    expect(result.current.data![0].vibe_tags).toEqual([]);
  });

  it('duration_days is 0 when start or end missing', async () => {
    withResults({
      data: [baseRow({ start_date: null, end_date: null })],
      error: null,
    });
    const { result } = renderHook(() => useDiscoverableTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data![0].duration_days).toBe(0);
  });
});

describe('useDiscoverableTrips — city filter', () => {
  it('filters trips by case-insensitive city substring', async () => {
    withResults({
      data: [
        baseRow({ id: 'a', trip_places: [{ cities: { name: 'Berlin' }, countries: null }] }),
        baseRow({ id: 'b', trip_places: [{ cities: { name: 'Madrid' }, countries: null }] }),
      ],
      error: null,
    });

    const { result } = renderHook(() => useDiscoverableTrips('BER'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.map(t => t.id)).toEqual(['a']);
  });
});

describe('useDiscoverableTrips — fallbacks', () => {
  it('retries without owner embed when first query errors', async () => {
    withResults(
      { data: null, error: { message: 'owner table missing' } }, // first attempt
      { data: [baseRow({ owner: null })], error: null }, // no-owner retry
    );

    const { result } = renderHook(() => useDiscoverableTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data![0].owner).toBeNull();
  });

  it('retries minimal columns when no-owner retry also errors', async () => {
    withResults(
      { data: null, error: { message: 'first' } },
      { data: null, error: { message: 'signal cols missing' } },
      { data: [baseRow({ owner: null, is_staff_pick: null, fork_count: null, save_count: null })], error: null },
    );

    const { result } = renderHook(() => useDiscoverableTrips(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data![0].is_staff_pick).toBe(false);
    expect(result.current.data![0].fork_count).toBe(0);
  });

  it('throws when minimal retry also fails', async () => {
    withResults(
      { data: null, error: { message: 'a' } },
      { data: null, error: { message: 'b' } },
      { data: null, error: { message: 'c' } },
    );
    const { result } = renderHook(() => useDiscoverableTrips(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
