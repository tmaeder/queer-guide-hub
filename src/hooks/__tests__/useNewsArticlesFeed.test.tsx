import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { TestProviders } from '@/test/test-utils';

/**
 * The old useNews had no request ordering: its unfiltered mount fetch could
 * resolve after the page's URL-filtered one and overwrite it. The feed keys
 * the query on the request instead.
 */

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }));

vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => {
  const make = () => {
    const calls: Array<[string, unknown[]]> = [];
    const b: Record<string, unknown> = {};
    for (const m of [
      'select',
      'not',
      'neq',
      'or',
      'is',
      'order',
      'overlaps',
      'eq',
      'in',
      'contains',
      'gte',
      'lte',
    ]) {
      b[m] = (...args: unknown[]) => {
        calls.push([m, args]);
        return b;
      };
    }
    b.limit = () => limitMock(calls);
    return b;
  };
  return { supabase: { from: make, rpc: vi.fn() } };
});

import { useNewsArticlesFeed } from '../useNews';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const hasEq = (calls: Array<[string, unknown[]]>, col: string, val: unknown) =>
  calls.some(([m, a]) => m === 'eq' && a[0] === col && a[1] === val);

describe('useNewsArticlesFeed', () => {
  beforeEach(() => limitMock.mockReset());

  it('sends the initial (URL) filters on the first request', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    renderHook(() => useNewsArticlesFeed(() => ({ sourceId: 's1' })), { wrapper: TestProviders });
    await waitFor(() => expect(limitMock).toHaveBeenCalled());
    expect(hasEq(limitMock.mock.calls[0][0], 'source_id', 's1')).toBe(true);
  });

  it('shows the newest request even when a stale one resolves after it', async () => {
    const stale = deferred<unknown>();
    const fresh = deferred<unknown>();
    limitMock.mockImplementation((calls: Array<[string, unknown[]]>) => {
      return hasEq(calls ?? [], 'source_id', 's1') ? fresh.promise : stale.promise;
    });
    const { result } = renderHook(() => useNewsArticlesFeed(), { wrapper: TestProviders });
    await waitFor(() => expect(limitMock).toHaveBeenCalledTimes(1));
    act(() => {
      void result.current.fetchArticles({ sourceId: 's1' });
    });
    await waitFor(() => expect(limitMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      fresh.resolve({ data: [{ id: 'fresh', url: 'f' }], error: null });
    });
    await waitFor(() => expect(result.current.articles.map((a) => a.id)).toEqual(['fresh']));
    await act(async () => {
      stale.resolve({ data: [{ id: 'stale', url: 's' }], error: null });
    });
    expect(result.current.articles.map((a) => a.id)).toEqual(['fresh']);
  });

  it('re-issuing the identical request refetches (retry, refresh)', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useNewsArticlesFeed(), { wrapper: TestProviders });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => {
      void result.current.fetchArticles();
    });
    await waitFor(() => expect(limitMock).toHaveBeenCalledTimes(2));
  });

  it('surfaces the page error copy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    limitMock.mockResolvedValue({ data: null, error: new Error('boom') });
    const { result } = renderHook(() => useNewsArticlesFeed(), { wrapper: TestProviders });
    await waitFor(() =>
      expect(result.current.error).toBe('Failed to load articles. Please try again.'),
    );
  });

  it('refetch re-runs the current request with its filters', async () => {
    limitMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useNewsArticlesFeed(() => ({ sourceId: 's1' })), {
      wrapper: TestProviders,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.refetch());
    await waitFor(() => expect(limitMock).toHaveBeenCalledTimes(2));
    expect(hasEq(limitMock.mock.calls[1][0], 'source_id', 's1')).toBe(true);
  });
});
