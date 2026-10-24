import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TestProviders } from '@/test/test-utils';

/**
 * The /events feed on useInfiniteQuery. Ported from the old
 * useEvents.raceOrder suite: the hand-rolled request-sequence counter is gone,
 * so these assert the same user-visible properties against the query key.
 *
 * A broad query is SLOWER than the narrow one that supersedes it, so a stale
 * response routinely resolves last — the list must still show the newest
 * request, and `loading` must belong to it.
 */

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/blueskyActivity', () => ({ mirrorRsvp: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => {
      const p = rpcMock(name, args) as Promise<unknown>;
      return Object.assign(p, { abortSignal: () => p });
    },
    from: () => {
      const handler: ProxyHandler<object> = {
        get: (_t, prop) =>
          prop === 'then' ? undefined : (..._a: unknown[]) => new Proxy(() => {}, handler),
        apply: () => new Proxy(() => {}, handler),
      };
      return new Proxy(() => {}, handler);
    },
  },
}));
vi.mock('@/utils/fetchWithRetry', () => ({
  queryWithRetry: (fn: () => Promise<unknown>) => fn(),
}));

import { useEventsFeed } from '../useEvents';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const row = (id: string, total = 1) => ({
  total,
  event: { id, title: id, start_date: '2026-09-11T10:00:00Z' },
});

function searchCalls() {
  return rpcMock.mock.calls.filter(([name]) => name === 'search_events') as Array<
    [string, Record<string, unknown>]
  >;
}

describe('useEventsFeed', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: [], error: null });
  });

  it('shows the newest request even when a stale response resolves after it', async () => {
    const stale = deferred<unknown>();
    const fresh = deferred<unknown>();
    rpcMock.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name !== 'search_events') return Promise.resolve({ data: [] });
      return args?.p_city === 'StaleCity' ? stale.promise : fresh.promise;
    });

    const { result } = renderHook(() => useEventsFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchEvents({ city: 'StaleCity' });
    });
    await waitFor(() => expect(searchCalls()).toHaveLength(1));
    act(() => {
      void result.current.fetchEvents({ city: 'FreshCity' });
    });
    await waitFor(() => expect(searchCalls()).toHaveLength(2));
    expect(result.current.loading).toBe(true);

    // The superseded response settles first: it must not paint, nor end loading.
    await act(async () => {
      stale.resolve({ data: [row('stale-1')], error: null });
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.events).toEqual([]);

    await act(async () => {
      fresh.resolve({ data: [row('fresh-1')], error: null });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map((e) => e.id)).toEqual(['fresh-1']);
  });

  it('loads page 2 of the SAME request and appends it', async () => {
    rpcMock.mockImplementation((name: string, args?: Record<string, unknown>) => {
      if (name !== 'search_events') return Promise.resolve({ data: [] });
      const ids = args?.p_offset === 0 ? ['a', 'b'] : ['b', 'c'];
      return Promise.resolve({ data: ids.map((id) => row(id, 4)), error: null });
    });

    const { result } = renderHook(() => useEventsFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchEvents({ cityId: 'zrh' }, { page: 1, pageSize: 2 });
    });
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual(['a', 'b']));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    const [, pageTwo] = searchCalls()[1];
    // The property, not a pinned value: page 2 carries page 1's filters.
    expect(pageTwo).toMatchObject({ p_city_id: 'zrh', p_offset: 2, p_limit: 2 });
    // Deduped by id across pages, as the old append merge did.
    await waitFor(() => expect(result.current.events.map((e) => e.id)).toEqual(['a', 'b', 'c']));
    expect(result.current.hasMore).toBe(false);
  });

  it('re-issuing the identical request refetches (RSVP refresh, retry)', async () => {
    const { result } = renderHook(() => useEventsFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchEvents({ cityId: 'zrh' }, { page: 1 });
    });
    await waitFor(() => expect(searchCalls()).toHaveLength(1));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      // undefined keys do not make it a different request
      void result.current.fetchEvents({ cityId: 'zrh', search: undefined }, { page: 1 });
    });
    await waitFor(() => expect(searchCalls()).toHaveLength(2));
  });

  it('surfaces a query error', async () => {
    rpcMock.mockImplementation((name: string) =>
      name === 'search_events'
        ? Promise.resolve({ data: null, error: new Error('rpc boom') })
        : Promise.resolve({ data: [] }),
    );
    const { result } = renderHook(() => useEventsFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchEvents({ city: 'Zurich' });
    });
    await waitFor(() => expect(result.current.error).toMatch(/rpc boom/));
  });

  it('stays idle until the first request', () => {
    const { result } = renderHook(() => useEventsFeed(), { wrapper: TestProviders });
    expect(result.current.loading).toBe(false);
    expect(result.current.events).toEqual([]);
    expect(searchCalls()).toHaveLength(0);
  });
});
