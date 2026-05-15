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

import { useProfessions } from '../useProfessions';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useProfessions', () => {
  it('maps profession rows to their names', async () => {
    withResults({
      data: [{ name: 'writer' }, { name: 'activist' }, { name: 'designer' }],
      error: null,
    });

    const { result } = renderHook(() => useProfessions());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.professions).toEqual(['writer', 'activist', 'designer']);
  });

  it('filters to is_active=true and orders by sort_order', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useProfessions());
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const call = state.calls[0];
    expect(call.table).toBe('professions');
    const eqCall = call.chain.find(s => s.method === 'eq');
    expect(eqCall?.args).toEqual(['is_active', true]);
    const orderCall = call.chain.find(s => s.method === 'order');
    expect(orderCall?.args[0]).toBe('sort_order');
  });

  it('swallows errors and ends loading', async () => {
    withResults({ data: null, error: { message: 'boom' } });
    const { result } = renderHook(() => useProfessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.professions).toEqual([]);
  });
});
