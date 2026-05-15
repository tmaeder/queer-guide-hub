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

import { useTripConcierge, useSendConciergeMessage } from '../useTripConcierge';

function withResults(...r: MockResult[]) { state.results.push(...r); }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useTripConcierge', () => {
  it('is disabled without a tripId', () => {
    renderHook(() => useTripConcierge(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries the trip_concierge_messages thread for a trip', async () => {
    withResults({
      data: [
        { id: 'm1', trip_id: 'trip-1', role: 'user', content: 'hi', draft: null, created_at: '2026-01-01' },
        { id: 'm2', trip_id: 'trip-1', role: 'assistant', content: 'hello', draft: null, created_at: '2026-01-02' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTripConcierge('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.map(m => m.id)).toEqual(['m1', 'm2']);

    const call = state.calls[0];
    expect(call.table).toBe('trip_concierge_messages');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['trip_id', 'trip-1']);
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useTripConcierge('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useSendConciergeMessage', () => {
  it('rejects when tripId is missing', async () => {
    const { result } = renderHook(() => useSendConciergeMessage(undefined), { wrapper });
    await expect(result.current.mutateAsync('hello')).rejects.toThrow('no trip');
    expect(state.calls).toHaveLength(0);
  });

  it('rejects empty / whitespace-only messages without hitting the edge', async () => {
    const { result } = renderHook(() => useSendConciergeMessage('trip-1'), { wrapper });
    await expect(result.current.mutateAsync('   ')).rejects.toThrow('empty message');
    expect(state.calls).toHaveLength(0);
  });

  it('invokes the trip-concierge edge function with trimmed text', async () => {
    withResults({ data: { reply: 'sure', candidates_used: 2 }, error: null });

    const { result } = renderHook(() => useSendConciergeMessage('trip-1'), { wrapper });
    const data = await result.current.mutateAsync('  add a museum  ');

    expect(data.reply).toBe('sure');
    const call = state.calls[0];
    expect(call.invoke).toBe('trip-concierge');
    const [, opts] = call.chain[0].args as [string, { body: { trip_id: string; message: string } }];
    expect(opts.body).toEqual({ trip_id: 'trip-1', message: 'add a museum' });
  });

  it('throws when the edge function errors', async () => {
    withResults({ data: null, error: { message: 'no inventory' } });
    const { result } = renderHook(() => useSendConciergeMessage('trip-1'), { wrapper });
    await expect(result.current.mutateAsync('hi')).rejects.toEqual({ message: 'no inventory' });
  });
});
