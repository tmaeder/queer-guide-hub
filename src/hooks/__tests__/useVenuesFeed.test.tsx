import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { TestProviders } from '@/test/test-utils';

const { auth, rpcMock, fromResult, fromCalls } = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null },
  rpcMock: vi.fn(),
  fromResult: vi.fn(),
  fromCalls: [] as Array<[string, unknown[]]>,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));
vi.mock('@/utils/fetchWithRetry', () => ({
  queryWithRetry: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (name: string, args: Record<string, unknown>) => rpcMock(name, args),
}));
vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const m of [
    'select',
    'neq',
    'is',
    'or',
    'eq',
    'ilike',
    'order',
    'range',
    'limit',
    'overlaps',
    'gte',
    'lte',
  ]) {
    builder[m] = (...args: unknown[]) => {
      fromCalls.push([m, args]);
      return builder;
    };
  }
  builder.abortSignal = () => builder;
  builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(fromResult()).then(resolve, reject);
  return { supabase: { from: () => builder } };
});

import { useVenuesFeed, useVenuesQuery } from '../useVenues';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const rankedRows = (ids: string[], total = ids.length) =>
  ids.map((id) => ({ venue: { id, name: id }, score: 1, distance_m: null, total_count: total }));

describe('useVenuesFeed', () => {
  beforeEach(() => {
    auth.user = null;
    rpcMock.mockReset();
    fromResult.mockReset();
    fromResult.mockReturnValue({ data: [], error: null, count: 0 });
    fromCalls.length = 0;
  });

  it('shows the newest request even when a stale response resolves after it', async () => {
    // The old hook had no ordering at all: a slow broad response could
    // overwrite the narrow one the reader asked for afterwards.
    const stale = deferred<unknown>();
    const fresh = deferred<unknown>();
    rpcMock.mockImplementation((_n: string, args: { p_filters: { search?: string } }) =>
      args.p_filters.search === 'stale' ? stale.promise : fresh.promise,
    );
    const { result } = renderHook(() => useVenuesFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchVenues({ search: 'stale' }, { page: 1, useRanking: true });
    });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    act(() => {
      void result.current.fetchVenues({ search: 'fresh' }, { page: 1, useRanking: true });
    });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      fresh.resolve({ data: rankedRows(['fresh-1']), error: null });
    });
    await waitFor(() => expect(result.current.venues.map((v) => v.id)).toEqual(['fresh-1']));
    await act(async () => {
      stale.resolve({ data: rankedRows(['stale-1']), error: null });
    });
    expect(result.current.venues.map((v) => v.id)).toEqual(['fresh-1']);
  });

  it('loads page 2 of the SAME request and dedupes by id', async () => {
    rpcMock.mockImplementation((_n: string, args: { p_offset: number }) =>
      Promise.resolve({
        data: rankedRows(args.p_offset === 0 ? ['a', 'b'] : ['b', 'c'], 4),
        error: null,
      }),
    );
    const { result } = renderHook(() => useVenuesFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchVenues(
        { category: 'bar' },
        { page: 1, pageSize: 2, sort: 'name', useRanking: true, userId: 'u1' },
      );
    });
    await waitFor(() => expect(result.current.venues.map((v) => v.id)).toEqual(['a', 'b']));
    expect(result.current.hasMore).toBe(true);
    expect(result.current.filteredTotal).toBe(4);

    await act(async () => {
      await result.current.loadMore();
    });
    const [, pageTwo] = rpcMock.mock.calls[1];
    expect(pageTwo).toMatchObject({
      p_filters: { category: 'bar' },
      p_sort: 'name',
      p_user_id: 'u1',
      p_offset: 2,
      p_limit: 2,
    });
    await waitFor(() => expect(result.current.venues.map((v) => v.id)).toEqual(['a', 'b', 'c']));
    expect(result.current.hasMore).toBe(false);
  });

  it('re-issuing the identical request refetches', async () => {
    rpcMock.mockResolvedValue({ data: rankedRows(['a']), error: null });
    const { result } = renderHook(() => useVenuesFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchVenues({ category: 'bar' }, { page: 1, useRanking: true });
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      void result.current.fetchVenues(
        { category: 'bar', search: undefined },
        { page: 1, useRanking: true },
      );
    });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
  });

  it('falls back to the direct query when the ranked RPC fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: new Error('rpc down') });
    fromResult.mockReturnValue({ data: [{ id: 'direct-1' }], error: null, count: 1 });
    const { result } = renderHook(() => useVenuesFeed(), { wrapper: TestProviders });
    act(() => {
      void result.current.fetchVenues({ category: 'bar' }, { page: 1, useRanking: true });
    });
    await waitFor(() => expect(result.current.venues.map((v) => v.id)).toEqual(['direct-1']));
    expect(fromCalls).toContainEqual(['eq', ['category', 'bar']]);
    warn.mockRestore();
  });
});

describe('useVenuesQuery', () => {
  beforeEach(() => {
    auth.user = null;
    fromResult.mockReset();
    fromCalls.length = 0;
  });

  it('stays idle while the scope is unknown', () => {
    const { result } = renderHook(() => useVenuesQuery(null), { wrapper: TestProviders });
    expect(result.current.loading).toBe(false);
    expect(fromCalls).toHaveLength(0);
  });

  // venues are safety-gated by RLS and the cache is not cleared on sign-out.
  it('never serves a signed-in result to the anonymous viewer, even with keepPrevious', async () => {
    fromResult.mockReturnValue({ data: [{ id: 'gated' }], error: null, count: 1 });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(TestProviders, { queryClient: client, children });
    auth.user = { id: 'u1' };
    const { result, rerender } = renderHook(
      () => useVenuesQuery({ countryId: 'de', limit: 12 }, { keepPrevious: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.venues).toEqual([{ id: 'gated' }]));

    const anon = deferred<unknown>();
    fromResult.mockReturnValue(anon.promise);
    auth.user = null;
    rerender();
    expect(result.current.venues).toEqual([]);
    await act(async () => {
      anon.resolve({ data: [{ id: 'public' }], error: null, count: 1 });
    });
    await waitFor(() => expect(result.current.venues).toEqual([{ id: 'public' }]));
  });
});
