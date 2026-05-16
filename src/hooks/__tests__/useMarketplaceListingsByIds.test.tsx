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

import { useMarketplaceListingsByIds } from '../useMarketplaceListingsByIds';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useMarketplaceListingsByIds', () => {
  it('returns empty for empty ids without hitting supabase', async () => {
    const { result } = renderHook(() => useMarketplaceListingsByIds([]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });

  it('queries .in(id, ids) + status=active, preserves input order', async () => {
    withResults({
      data: [
        { id: 'l2', title: 'Two' },
        { id: 'l1', title: 'One' },
        { id: 'l3', title: 'Three' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useMarketplaceListingsByIds(['l1', 'l2', 'l3']));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.map(l => l.id)).toEqual(['l1', 'l2', 'l3']);
    const call = state.calls[0];
    expect(call.table).toBe('marketplace_listings');
    const inCall = call.chain.find(s => s.method === 'in');
    expect(inCall?.args).toEqual(['id', ['l1', 'l2', 'l3']]);
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['status', 'active']);
  });

  it('drops ids that have no matching row', async () => {
    withResults({ data: [{ id: 'l1', title: 'Found' }], error: null });

    const { result } = renderHook(() => useMarketplaceListingsByIds(['l1', 'missing']));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data.map(l => l.id)).toEqual(['l1']);
  });

  it('returns empty on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useMarketplaceListingsByIds(['l1']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});
