import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { TestProviders } from '@/test/test-utils';

const { auth, result, calls } = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null },
  result: vi.fn(),
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (table: string) => {
      const rec = { table, ops: [] as Array<[string, unknown[]]> };
      calls.push(rec);
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'order', 'or', 'ilike', 'eq', 'in', 'range', 'limit']) {
        b[m] = (...args: unknown[]) => {
          rec.ops.push([m, args]);
          return b;
        };
      }
      b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(result(rec)).then(resolve, reject);
      return b;
    },
  },
}));

import { useHotelsFeed, type HotelsFeedRequest } from '../useHotels';

const hotelsCalls = () =>
  calls.filter((c) => c.table === 'hotels' && c.ops.some(([m]) => m === 'range'));
const rangeOf = (c: { ops: Array<[string, unknown[]]> }) => c.ops.find(([m]) => m === 'range')?.[1];

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('useHotelsFeed', () => {
  beforeEach(() => {
    auth.user = null;
    calls.length = 0;
    result.mockReset();
    result.mockImplementation((rec: { ops: Array<[string, unknown[]]> }) => {
      const range = rangeOf(rec) as [number, number] | undefined;
      if (!range) return { count: 30 };
      const ids = range[0] === 0 ? ['a', 'b'] : ['b', 'c'];
      return { data: ids.map((id) => ({ id })), error: null, count: 30 };
    });
  });

  it('loads page 2 of the SAME request and dedupes by id', async () => {
    const req: HotelsFeedRequest = { filters: { hotel_type: 'bnb' }, mapMode: false };
    const { result: r } = renderHook(() => useHotelsFeed(req), { wrapper: TestProviders });
    await waitFor(() => expect(r.current.hotels.map((h) => h.id)).toEqual(['a', 'b']));
    expect(r.current.hasMore).toBe(true);

    act(() => r.current.loadMore());
    await waitFor(() => expect(r.current.hotels.map((h) => h.id)).toEqual(['a', 'b', 'c']));
    const [, pageTwo] = hotelsCalls();
    expect(rangeOf(pageTwo)).toEqual([24, 47]);
    expect(pageTwo.ops).toContainEqual(['ilike', ['hotel_type', 'bnb']]);
  });

  it('the map view is one capped page with no next page', async () => {
    const req: HotelsFeedRequest = { filters: {}, mapMode: true };
    const { result: r } = renderHook(() => useHotelsFeed(req), { wrapper: TestProviders });
    await waitFor(() => expect(r.current.loading).toBe(false));
    expect(rangeOf(hotelsCalls()[0])).toEqual([0, 499]);
    expect(r.current.hasMore).toBe(false);
  });

  it('a vibe with no tagged hotels returns empty without querying hotels', async () => {
    result.mockImplementation((rec: { table: string }) =>
      rec.table === 'unified_tag_assignments' ? { data: [], error: null } : { count: 30 },
    );
    const req: HotelsFeedRequest = { filters: { tagSlug: 'nothing' }, mapMode: false };
    const { result: r } = renderHook(() => useHotelsFeed(req), { wrapper: TestProviders });
    await waitFor(() => expect(r.current.loading).toBe(false));
    expect(r.current.hotels).toEqual([]);
    expect(r.current.hasMore).toBe(false);
    expect(hotelsCalls()).toHaveLength(0);
  });

  // hotels are safety-gated by RLS and the cache is not cleared on sign-out.
  it('never serves a signed-in result to the anonymous viewer', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(TestProviders, { queryClient: client, children });
    result.mockImplementation((rec: { ops: Array<[string, unknown[]]> }) =>
      rangeOf(rec) ? { data: [{ id: 'gated' }], error: null, count: 1 } : { count: 1 },
    );
    const req: HotelsFeedRequest = { filters: {}, mapMode: false };
    auth.user = { id: 'u1' };
    const { result: r, rerender } = renderHook(() => useHotelsFeed(req), { wrapper });
    await waitFor(() => expect(r.current.hotels).toEqual([{ id: 'gated' }]));

    const anon = deferred<unknown>();
    result.mockImplementation((rec: { ops: Array<[string, unknown[]]> }) =>
      rangeOf(rec) ? anon.promise : { count: 1 },
    );
    auth.user = null;
    rerender();
    expect(r.current.hotels).toEqual([]);
    await act(async () => {
      anon.resolve({ data: [{ id: 'public' }], error: null, count: 1 });
    });
    await waitFor(() => expect(r.current.hotels).toEqual([{ id: 'public' }]));
  });
});
