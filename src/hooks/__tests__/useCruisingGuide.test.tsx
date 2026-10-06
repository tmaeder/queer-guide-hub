/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null; count?: number | null };

const { state } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{
      table?: string;
      rpc?: string;
      args?: Record<string, unknown>;
      chain: Array<{ method: string; args: unknown[] }>;
    }>,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from(table: string) {
      const record = { table, chain: [] as Array<{ method: string; args: unknown[] }> };
      state.calls.push(record);
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, property: string) {
            if (property === 'then') {
              return (onFulfilled: (value: MockResult) => unknown) =>
                Promise.resolve(state.results.shift() ?? { data: [], error: null, count: 0 }).then(
                  onFulfilled,
                );
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: property, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
    rpc(name: string, args?: Record<string, unknown>) {
      state.calls.push({ rpc: name, args, chain: [] });
      return Promise.resolve(state.results.shift() ?? { data: [], error: null });
    },
  },
}));

import {
  useCruisingMapSpots,
  useCruisingPresenceAreas,
  useCruisingSpotsList,
} from '../useCruisingGuide';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.calls.length = 0;
  state.results.length = 0;
});

describe('cruising spot queries', () => {
  it('never queries while the authenticated gate is closed', () => {
    renderHook(() => useCruisingSpotsList(false, '', 1), { wrapper });
    renderHook(() => useCruisingMapSpots(false, '', null), { wrapper });
    renderHook(() => useCruisingPresenceAreas(false), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('lists every cruising row, including rows without map coordinates', async () => {
    state.results.push({
      data: [
        {
          id: 'spot-1',
          slug: 'old-bridge',
          name: 'Old Bridge',
          latitude: null,
          longitude: null,
          total_count: 1,
        },
      ],
      error: null,
      count: 1,
    });

    const { result } = renderHook(() => useCruisingSpotsList(true, 'bridge', 1, 40), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data?.total).toBe(1));

    expect(result.current.data?.spots[0]).toMatchObject({
      id: 'spot-1',
      latitude: null,
      longitude: null,
    });
    expect(state.calls[0]).toMatchObject({
      rpc: 'cruising_spots_search',
      args: {
        p_search: 'bridge',
        p_mapped_only: false,
        p_limit: 40,
        p_offset: 0,
      },
    });
  });

  it('limits the map query to cruising spots with coordinates and requested bounds', async () => {
    state.results.push({ data: [], error: null, count: 0 });
    renderHook(
      () =>
        useCruisingMapSpots(true, '', {
          west: 7,
          south: 46,
          east: 9,
          north: 48,
        }),
      { wrapper },
    );
    await waitFor(() => expect(state.calls).toHaveLength(1));

    expect(state.calls[0]).toMatchObject({
      rpc: 'cruising_spots_search',
      args: {
        p_west: 7,
        p_south: 46,
        p_east: 9,
        p_north: 48,
        p_mapped_only: true,
        p_limit: 1200,
        p_offset: 0,
      },
    });
  });
});

describe('cruising presence', () => {
  it('uses only the aggregate city-area RPC', async () => {
    state.results.push({
      data: [
        {
          city_id: 'city-1',
          city_name: 'Zürich',
          city_slug: 'zurich',
          latitude: '47.37',
          longitude: '8.54',
          active_count: '3',
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useCruisingPresenceAreas(true), { wrapper });
    await waitFor(() => expect(result.current.data?.[0].active_count).toBe(3));

    expect(state.calls).toEqual([{ rpc: 'cruising_presence_areas', args: undefined, chain: [] }]);
  });
});
