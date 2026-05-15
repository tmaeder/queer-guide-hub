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
  calls: [] as Array<{ table?: string; invoke?: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
    functions: {
      invoke: (name: string, opts: unknown) => {
        state.calls.push({ invoke: name, chain: [{ method: 'invoke', args: [name, opts] }] });
        const next = state.results.shift() ?? { data: null, error: null };
        return Promise.resolve(next);
      },
    },
  },
}));

import { useTripRecap, useGenerateTripRecap } from '../useTripRecap';

function withResults(...r: MockResult[]) { state.results.push(...r); }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useTripRecap', () => {
  it('is disabled when tripId is undefined', () => {
    renderHook(() => useTripRecap(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('returns null when no recap row exists', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useTripRecap('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('returns the recap row when present', async () => {
    const row = {
      trip_id: 'trip-1',
      summary: 'A great trip',
      highlights: { top_places: [], cities: [], countries: [], place_count: 0, day_count: 0, total_spent: [] },
      generated_at: '2026-04-01',
      generated_by: 'system',
    };
    withResults({ data: row, error: null });

    const { result } = renderHook(() => useTripRecap('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.summary).toBe('A great trip');
  });
});

describe('useGenerateTripRecap', () => {
  it('invokes the trip-recap edge function with the trip id', async () => {
    const recap = {
      trip_id: 'trip-1',
      summary: 'Generated',
      highlights: { top_places: [], cities: [], countries: [], place_count: 0, day_count: 0, total_spent: [] },
      generated_at: '2026-04-01',
      generated_by: 'edge',
    };
    withResults({ data: recap, error: null });

    const { result } = renderHook(() => useGenerateTripRecap('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.mutate).toBeDefined());

    const data = await result.current.mutateAsync();
    expect(data.summary).toBe('Generated');

    const call = state.calls[0];
    expect(call.invoke).toBe('trip-recap');
    const [, opts] = call.chain[0].args as [string, { body: { trip_id: string; refresh: boolean } }];
    expect(opts.body).toEqual({ trip_id: 'trip-1', refresh: false });
  });

  it('passes refresh:true when requested', async () => {
    withResults({ data: { trip_id: 'trip-1', summary: '' }, error: null });
    const { result } = renderHook(() => useGenerateTripRecap('trip-1'), { wrapper });
    await result.current.mutateAsync({ refresh: true });

    const [, opts] = state.calls[0].chain[0].args as [string, { body: { refresh: boolean } }];
    expect(opts.body.refresh).toBe(true);
  });

  it('throws when the edge function errors', async () => {
    withResults({ data: null, error: { message: 'no data' } });
    const { result } = renderHook(() => useGenerateTripRecap('trip-1'), { wrapper });
    await expect(result.current.mutateAsync()).rejects.toEqual({ message: 'no data' });
  });
});
