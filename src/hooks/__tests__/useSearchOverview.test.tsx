import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook as rtlRenderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { mergeRecoveredGroups, useSearch, useSearchOverview } from '../useSearch';

const renderHook = <T,>(cb: () => T) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRenderHook(cb, {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
};
const okJson = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const sentBodies = () =>
  mockFetch.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit)?.body ?? '{}')));

describe('useSearchOverview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the worker for groups and keeps them in order', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        totalHits: 30,
        groups: [
          { type: 'city', total: 2, hits: [{ objectID: 'c1', title: 'Berlin', type: 'city' }] },
          { type: 'event', total: 28, hits: [{ objectID: 'e1', title: 'Pride', type: 'event' }] },
        ],
      }),
    );
    const { result } = renderHook(() => useSearchOverview('berlin'));
    await waitFor(() => expect(result.current.groups).toHaveLength(2), { timeout: 2000 });
    expect(result.current.groups.map((g) => [g.type, g.total])).toEqual([
      ['city', 2],
      ['event', 28],
    ]);
    expect(result.current.supported).toBe(true);
    const body = sentBodies()[0];
    expect(body.groupBy).toBe('type');
    expect(body.perType).toBe(4);
    expect(body.query).toBe('berlin');
  });

  it('drops groups left empty after sanitising, and never reports a total below the hits shown', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        groups: [
          { type: 'venue', total: 0, hits: [{ objectID: 'v1', title: 'Bar', type: 'venue' }] },
          { type: 'news', total: 5, hits: [] },
        ],
      }),
    );
    const { result } = renderHook(() => useSearchOverview('bar'));
    await waitFor(() => expect(result.current.groups).toHaveLength(1), { timeout: 2000 });
    expect(result.current.groups[0]).toMatchObject({ type: 'venue', total: 1 });
  });

  it('reports the types the worker could not search', async () => {
    mockFetch.mockResolvedValue(
      okJson({
        groups: [
          { type: 'event', total: 3, hits: [{ objectID: 'e1', title: 'Pride', type: 'event' }] },
        ],
        groupErrors: ['venue', 'news', 42],
      }),
    );
    const { result } = renderHook(() => useSearchOverview('pride'));
    await waitFor(() => expect(result.current.groups).toHaveLength(1), { timeout: 2000 });
    expect(result.current.failedTypes).toEqual(['venue', 'news']);
  });

  it('asks again for only the failed sections and puts a recovered one back in its place', async () => {
    mockFetch.mockImplementation(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.filters?.types) {
        // The retry: only the type that failed, and it loads this time.
        return okJson({
          groups: [
            { type: 'city', total: 2, hits: [{ objectID: 'c1', title: 'Berlin', type: 'city' }] },
          ],
        });
      }
      return okJson({
        groups: [
          { type: 'event', total: 9, hits: [{ objectID: 'e1', title: 'Pride', type: 'event' }] },
        ],
        groupErrors: ['city'],
        typeOrder: ['city', 'event'],
      });
    });
    const { result } = renderHook(() => useSearchOverview('berlin'));
    await waitFor(
      () => expect(result.current.groups.map((g) => g.type)).toEqual(['city', 'event']),
      {
        timeout: 2000,
      },
    );
    expect(result.current.failedTypes).toEqual([]);
    expect(result.current.pendingTypes).toEqual([]);
    const retry = sentBodies().find((b) => b.filters?.types);
    expect(retry.filters.types).toEqual(['city']);
    expect(retry.groupBy).toBe('type');
  });

  it('reports a section that failed twice, and treats one the retry found empty as empty', async () => {
    mockFetch.mockImplementation(async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.filters?.types) return okJson({ groups: [], groupErrors: ['news'] });
      return okJson({
        groups: [
          { type: 'event', total: 9, hits: [{ objectID: 'e1', title: 'Pride', type: 'event' }] },
        ],
        groupErrors: ['news', 'tag'],
        typeOrder: ['event', 'news'],
      });
    });
    const { result } = renderHook(() => useSearchOverview('pride'));
    await waitFor(() => expect(result.current.failedTypes).toEqual(['news']), { timeout: 2000 });
    expect(result.current.groups.map((g) => g.type)).toEqual(['event']);
  });

  it('reports itself unsupported when the worker answers without groups', async () => {
    mockFetch.mockResolvedValue(okJson({ hits: [{ objectID: '1', title: 'Bar', type: 'venue' }] }));
    const { result } = renderHook(() => useSearchOverview('bar'));
    await waitFor(() => expect(result.current.supported).toBe(false), { timeout: 2000 });
    expect(result.current.groups).toEqual([]);
  });

  it('sends nothing when disabled', async () => {
    renderHook(() => useSearchOverview('berlin', {}, {}, { enabled: false }));
    await new Promise((r) => setTimeout(r, 400));
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('useSearch enabled option', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends nothing when disabled, so the overview page makes one request', async () => {
    const { result } = renderHook(() =>
      useSearch('berlin', {}, 0, undefined, {}, { enabled: false }),
    );
    await new Promise((r) => setTimeout(r, 400));
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});

describe('mergeRecoveredGroups', () => {
  const g = (type: string) => ({ type, total: 1, hits: [] });
  it('orders by the mixed ranking and keeps unranked sections after, in their order', () => {
    const out = mergeRecoveredGroups(
      [g('event'), g('venue'), g('tag')],
      [g('city'), g('news')],
      ['city', 'event', 'venue'],
    );
    expect(out.map((x) => x.type)).toEqual(['city', 'event', 'venue', 'tag', 'news']);
  });
});
