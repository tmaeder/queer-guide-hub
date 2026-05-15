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

import {
  useTripNudges,
  useDismissTripNudge,
  useScanTripNudges,
} from '../useTripNudges';

function withResults(...r: MockResult[]) { state.results.push(...r); }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useTripNudges', () => {
  it('is disabled without a tripId', () => {
    renderHook(() => useTripNudges(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries trip_nudges filtered to trip + non-dismissed, ordered by severity then created_at', async () => {
    withResults({
      data: [{ id: 'n1', kind: 'event_overlap', severity: 'warning', dismissed_at: null }],
      error: null,
    });

    const { result } = renderHook(() => useTripNudges('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0].id).toBe('n1');

    const call = state.calls[0];
    expect(call.table).toBe('trip_nudges');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['trip_id', 'trip-1']);
    const is = call.chain.find(s => s.method === 'is');
    expect(is?.args).toEqual(['dismissed_at', null]);

    const orderCalls = call.chain.filter(s => s.method === 'order');
    expect(orderCalls.map(o => o.args[0])).toEqual(['severity', 'created_at']);
  });

  it('throws on query error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useTripNudges('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useDismissTripNudge', () => {
  it('updates dismissed_at to a timestamp on the matching id', async () => {
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useDismissTripNudge(), { wrapper });
    await result.current.mutateAsync({ id: 'n1', tripId: 'trip-1' });

    const call = state.calls[0];
    expect(call.table).toBe('trip_nudges');
    const update = call.chain.find(s => s.method === 'update');
    const payload = update?.args[0] as Record<string, unknown>;
    expect(typeof payload.dismissed_at).toBe('string');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'n1']);
  });

  it('throws when supabase returns an error', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useDismissTripNudge(), { wrapper });
    await expect(
      result.current.mutateAsync({ id: 'n1', tripId: 'trip-1' }),
    ).rejects.toEqual({ message: 'denied' });
  });
});

describe('useScanTripNudges', () => {
  it('invokes the trip-nudges edge function with the trip id', async () => {
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useScanTripNudges(), { wrapper });
    await result.current.mutateAsync({ tripId: 'trip-1' });

    const call = state.calls[0];
    expect(call.invoke).toBe('trip-nudges');
    const [, opts] = call.chain[0].args as [string, { body: { trip_id: string } }];
    expect(opts.body).toEqual({ trip_id: 'trip-1' });
  });

  it('throws on edge function error', async () => {
    withResults({ data: null, error: { message: 'timeout' } });
    const { result } = renderHook(() => useScanTripNudges(), { wrapper });
    await expect(result.current.mutateAsync({ tripId: 'trip-1' })).rejects.toEqual({
      message: 'timeout',
    });
  });
});
