/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const { state, useAuthMock } = vi.hoisted(() => ({
  state: {
    results: [] as MockResult[],
    calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
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
    channel() {
      return { on() { return this; }, subscribe() { return this; } };
    },
    removeChannel() {},
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import { useTripChat, useSendTripMessage } from '../useTripChat';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: 'u1' } });
});

describe('useTripChat', () => {
  it('is disabled without tripId', () => {
    renderHook(() => useTripChat(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('queries trip_messages joined with sender, ordered asc', async () => {
    withResults({ data: [{ id: 'm1', trip_id: 't1', content: 'hi' }], error: null });
    const { result } = renderHook(() => useTripChat('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].table).toBe('trip_messages');
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['trip_id', 't1']);
    const order = state.calls[0].chain.find(s => s.method === 'order');
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(true);
  });
});

describe('useSendTripMessage', () => {
  it('rejects when no user', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useSendTripMessage('t1'), { wrapper });
    await expect(result.current.mutateAsync({ content: 'hi' })).rejects.toThrow('not authenticated');
  });

  it('rejects when no tripId', async () => {
    const { result } = renderHook(() => useSendTripMessage(undefined), { wrapper });
    await expect(result.current.mutateAsync({ content: 'hi' })).rejects.toThrow('not authenticated');
  });

  it('skips empty/whitespace messages without an insert', async () => {
    const { result } = renderHook(() => useSendTripMessage('t1'), { wrapper });
    await result.current.mutateAsync({ content: '   ' });
    expect(state.calls).toHaveLength(0);
  });

  it('inserts trimmed message with sender + reply_to', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSendTripMessage('t1'), { wrapper });
    await result.current.mutateAsync({ content: '  hello ', replyTo: 'm-prev' });

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual({
      trip_id: 't1',
      sender_id: 'u1',
      content: 'hello',
      reply_to: 'm-prev',
    });
  });

  it('coerces missing replyTo to null', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSendTripMessage('t1'), { wrapper });
    await result.current.mutateAsync({ content: 'hi' });

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect((insert?.args[0] as Record<string, unknown>).reply_to).toBeNull();
  });
});
