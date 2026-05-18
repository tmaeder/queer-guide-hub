/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

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
      const builder: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (onFulfilled: (v: MockResult) => unknown) => {
                const next = state.results.shift() ?? { data: [], error: null };
                return Promise.resolve(next).then(onFulfilled);
              };
            }
            return (...args: unknown[]) => {
              record.chain.push({ method: prop, args });
              return builder;
            };
          },
        },
      );
      return builder;
    },
  },
}));

import { useRecentVenues } from '../useRecentVenues';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useRecentVenues', () => {
  it('returns an empty array and skips the query when disabled', async () => {
    const { result } = renderHook(() => useRecentVenues(8, false));
    expect(result.current.venues).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('fetches venues ordered by created_at desc, excluding refuge_restrooms and category=other', async () => {
    withResults({
      data: [
        { id: 'v1', name: 'Berghain', images: ['x.jpg'] },
        { id: 'v2', name: 'SchwuZ', logo_url: 'y.jpg' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useRecentVenues(2));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.venues.map(v => v.id)).toEqual(['v1', 'v2']);

    const call = state.calls[0];
    expect(call.table).toBe('venues');
    const neqs = call.chain.filter(s => s.method === 'neq');
    expect(neqs.map(n => n.args)).toEqual(
      expect.arrayContaining([
        ['data_source', 'refuge_restrooms'],
        ['category', 'other'],
      ]),
    );
    const limit = call.chain.find(s => s.method === 'limit');
    expect(limit?.args).toEqual([8]); // over-fetches limit*4
  });

  it('filters out venues without an image', async () => {
    withResults({
      data: [
        { id: 'v1', name: 'NoImg' },
        { id: 'v2', name: 'WithImg', images: ['x.jpg'] },
        { id: 'v3', name: 'WithLogo', logo_url: 'y.jpg' },
      ],
      error: null,
    });
    const { result } = renderHook(() => useRecentVenues(5));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.venues.map(v => v.id)).toEqual(['v2', 'v3']);
  });

  it('keeps venues empty when supabase returns null', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useRecentVenues(8));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.venues).toEqual([]);
  });
});
