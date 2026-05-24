/**
 * @vitest-environment jsdom
 *
 * Focused on the venue-count batching behaviour. Hitting prod with 400+
 * city ids in a single PostgREST `in(...)` filter trips an 8KB URL limit
 * and returns 400 — these tests assert we split the request into chunks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

import { useCitiesDirectory, VENUE_COUNT_BATCH_SIZE } from '@/hooks/useCitiesDirectory';
import { supabase } from '@/integrations/supabase/client';

const fromMock = supabase.from as ReturnType<typeof vi.fn>;

function makeBuilder(result: { data: unknown; error: unknown }, spies: {
  inCalls: string[][];
  filterChain: string[];
}) {
  const builder: Record<string, unknown> = {};
  const passthrough = [
    'select', 'eq', 'neq', 'gte', 'gt', 'lt', 'lte', 'order', 'limit',
    'is', 'not', 'or',
  ];
  for (const m of passthrough) {
    builder[m] = vi.fn((...args: unknown[]) => {
      spies.filterChain.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')})`);
      return builder;
    });
  }
  builder.in = vi.fn((_col: string, values: string[]) => {
    spies.inCalls.push(values);
    return Promise.resolve(result);
  });
  builder.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled);
  return builder;
}

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
  sort: 'population' as const,
};

beforeEach(() => fromMock.mockReset());

describe('useCitiesDirectory venue-count batching', () => {
  it('issues one venues query per VENUE_COUNT_BATCH_SIZE chunk', async () => {
    const TOTAL = 350;
    const cityIds = Array.from({ length: TOTAL }, (_, i) =>
      `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    const citiesPayload = cityIds.map((id) => ({
      id,
      slug: `c-${id.slice(-4)}`,
      name: `City ${id.slice(-4)}`,
      countries: { name: 'X', equality_score: 50, continents: { code: 'EU', name: 'Europe' } },
    }));

    const venueInCalls: string[][] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === 'cities') {
        return makeBuilder(
          { data: citiesPayload, error: null },
          { inCalls: [], filterChain: [] },
        );
      }
      if (table === 'venues') {
        return makeBuilder(
          { data: cityIds.slice(0, 3).map((id) => ({ city_id: id })), error: null },
          { inCalls: venueInCalls, filterChain: [] },
        );
      }
      // Stray no-arg calls from internal cleanup paths are ignored.
      return makeBuilder({ data: [], error: null }, { inCalls: [], filterChain: [] });
    });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(venueInCalls.length).toBeGreaterThan(0));

    const expectedBatches = Math.ceil(TOTAL / VENUE_COUNT_BATCH_SIZE);
    expect(venueInCalls).toHaveLength(expectedBatches);
    for (const batch of venueInCalls) {
      expect(batch.length).toBeLessThanOrEqual(VENUE_COUNT_BATCH_SIZE);
    }
    // Cover every id exactly once across the batches.
    const flat = venueInCalls.flat().sort();
    expect(flat).toEqual([...cityIds].sort());
  });

  it('does not query venues when there are no cities', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'cities') {
        return makeBuilder({ data: [], error: null }, { inCalls: [], filterChain: [] });
      }
      return makeBuilder({ data: [], error: null }, { inCalls: [], filterChain: [] });
    });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.venueCounts.size).toBe(0);
  });

  it('a failing batch does not block the others', async () => {
    const cityIds = Array.from({ length: 150 }, (_, i) =>
      `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    const citiesPayload = cityIds.map((id) => ({
      id,
      slug: id.slice(-4),
      name: id.slice(-4),
      countries: { name: 'X', equality_score: 50, continents: { code: 'EU', name: 'Europe' } },
    }));

    let venuesCall = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'cities') {
        return makeBuilder(
          { data: citiesPayload, error: null },
          { inCalls: [], filterChain: [] },
        );
      }
      if (table === 'venues') {
        const result =
          venuesCall++ === 0
            ? { data: null, error: { message: 'simulated 400' } }
            : { data: cityIds.slice(100, 103).map((id) => ({ city_id: id })), error: null };
        return makeBuilder(result, { inCalls: [], filterChain: [] });
      }
      return makeBuilder({ data: [], error: null }, { inCalls: [], filterChain: [] });
    });

    const { result } = renderHook(() => useCitiesDirectory(NEUTRAL_PARAMS), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.venueCounts.size).toBe(3));
    // The successful batch's counts should still be present.
    expect(result.current.venueCounts.get(cityIds[100])).toBe(1);
  });
});
