/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };

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
                const next = state.results.shift() ?? { data: null, error: null };
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

import { useEventSpotlight } from '../useEventSpotlight';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useEventSpotlight', () => {
  it('returns null when no featured + no pride/festival match', async () => {
    // featured query → null, fallback pride/festival query → null
    withResults({ data: null, error: null }, { data: null, error: null });

    const { result } = renderHook(() => useEventSpotlight());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.spotlight).toBeNull();
  });

  it('uses the featured event when one exists; counts cluster in the same city', async () => {
    const event = {
      id: 'e1',
      title: 'Pride Berlin',
      city: 'Berlin',
      start_date: '2026-07-01T00:00:00Z',
    };
    withResults(
      { data: event, error: null },
      // cluster count query
      { data: null, error: null, count: 47 },
    );

    const { result } = renderHook(() => useEventSpotlight());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.spotlight?.event.id).toBe('e1');
    expect(result.current.spotlight?.clusterCount).toBe(47);

    // Cluster query should ilike on city.
    const clusterCall = state.calls.find(
      c => c.table === 'events' && c.chain.some(s => s.method === 'ilike'),
    );
    const ilike = clusterCall?.chain.find(s => s.method === 'ilike');
    expect(ilike?.args).toEqual(['city', 'Berlin']);
  });

  it('falls back to pride/festival event_type when no featured event', async () => {
    withResults(
      { data: null, error: null }, // featured: nothing
      { data: { id: 'e2', title: 'Madrid Pride', city: 'Madrid', start_date: '2026-07-01' }, error: null },
      { data: null, error: null, count: 12 },
    );

    const { result } = renderHook(() => useEventSpotlight());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.spotlight?.event.id).toBe('e2');
    expect(result.current.spotlight?.clusterCount).toBe(12);

    // Verify the second query used .in('event_type', ['pride', 'festival']).
    const fallbackCall = state.calls[1];
    const inCall = fallbackCall.chain.find(s => s.method === 'in');
    expect(inCall?.args[0]).toBe('event_type');
    expect(inCall?.args[1]).toEqual(['pride', 'festival']);
  });

  it('skips cluster query when event has no city', async () => {
    const event = { id: 'e3', title: 'Online Event', city: null, start_date: '2026-07-01' };
    withResults({ data: event, error: null });

    const { result } = renderHook(() => useEventSpotlight());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.spotlight?.event.id).toBe('e3');
    expect(result.current.spotlight?.clusterCount).toBe(0);
    // Only the featured query was made — no cluster follow-up.
    expect(state.calls).toHaveLength(1);
  });
});
