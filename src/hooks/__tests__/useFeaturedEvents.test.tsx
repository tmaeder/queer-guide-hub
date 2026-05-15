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

import { useFeaturedEvents } from '../useFeaturedEvents';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useFeaturedEvents', () => {
  it('filters to active + featured upcoming events', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useFeaturedEvents());
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const call = state.calls[0];
    expect(call.table).toBe('events');

    const eqCalls = call.chain.filter(s => s.method === 'eq');
    const eqMap = Object.fromEntries(eqCalls.map(c => c.args as [string, unknown]));
    expect(eqMap.status).toBe('active');
    expect(eqMap.is_featured).toBe(true);

    const gteCall = call.chain.find(s => s.method === 'gte');
    expect(gteCall?.args[0]).toBe('start_date');

    const limitCall = call.chain.find(s => s.method === 'limit');
    expect(limitCall?.args).toEqual([8]);
  });

  it('appends an ilike filter when city is provided', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useFeaturedEvents({ city: 'Berlin', limit: 3 }));
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const call = state.calls[0];
    const ilikeCall = call.chain.find(s => s.method === 'ilike');
    expect(ilikeCall?.args).toEqual(['city', 'Berlin']);
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([3]);
  });

  it('returns the fetched rows', async () => {
    withResults({
      data: [
        { id: 'e1', title: 'Pride', is_featured: true },
        { id: 'e2', title: 'Drag Night', is_featured: true },
      ],
      error: null,
    });

    const { result } = renderHook(() => useFeaturedEvents());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events.map(e => e.id)).toEqual(['e1', 'e2']);
  });
});
