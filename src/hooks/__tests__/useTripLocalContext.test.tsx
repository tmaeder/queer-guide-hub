/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

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
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
  },
}));

import { useTripLocalContext } from '../useTripLocalContext';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useTripLocalContext', () => {
  it('is disabled without trip', () => {
    renderHook(() => useTripLocalContext(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('is disabled when trip has no resolved cities', () => {
    renderHook(
      () => useTripLocalContext({ id: 't1', trip_places: [] } as never),
      { wrapper },
    );
    expect(state.calls).toHaveLength(0);
  });

  it('queries personalities + queer_villages in parallel for the trip cities', async () => {
    withResults(
      { data: [{ id: 'p1', name: 'Alice' }], error: null },
      { data: [{ id: 'v1', name: 'Schöneberg' }], error: null },
    );

    const trip = { id: 't1', trip_places: [{ city_id: 'c1' }, { city_id: 'c2' }, { city_id: null }] };
    const { result } = renderHook(() => useTripLocalContext(trip as never), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.personalities[0].name).toBe('Alice');
    expect(result.current.data?.villages[0].name).toBe('Schöneberg');

    const tables = state.calls.map(c => c.table);
    expect(tables).toContain('personalities');
    expect(tables).toContain('queer_villages');
  });

  it('throws when either sub-query errors', async () => {
    withResults(
      { data: null, error: { message: 'rls' } },
      { data: [], error: null },
    );
    const trip = { id: 't1', trip_places: [{ city_id: 'c1' }] };
    const { result } = renderHook(() => useTripLocalContext(trip as never), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
