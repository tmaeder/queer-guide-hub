/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  invokes: [] as Array<{ name: string; body: unknown }>,
  rpcs: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from() {
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
            return () => builder;
          },
        },
      );
      return builder;
    },
    functions: {
      invoke: (name: string, opts: { body: unknown }) => {
        state.invokes.push({ name, body: opts.body });
        return Promise.resolve(state.results.shift() ?? { data: null, error: null });
      },
    },
  },
}));

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: (name: string, args: unknown) => {
    state.rpcs.push({ name, args });
    return Promise.resolve({ data: null, error: null });
  },
}));

import { useTripEmailThread } from '../useTripEmailThread';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.invokes.length = 0;
  state.rpcs.length = 0;
});

describe('useTripEmailThread', () => {
  it('send() invokes trip-inbox-chat with the item id + message', async () => {
    // item + turns initial queries resolve empty; then the invoke result.
    state.results.push(
      { data: null, error: null },
      { data: [], error: null },
      { data: { reply: 'ok', item: {} }, error: null },
    );
    const { result } = renderHook(() => useTripEmailThread('item-1'), { wrapper });
    await act(async () => {
      await result.current.send.mutateAsync('check-in is the 12th');
    });
    expect(state.invokes).toContainEqual({
      name: 'trip-inbox-chat',
      body: { item_id: 'item-1', message: 'check-in is the 12th' },
    });
  });

  it('confirm() invokes the existing trip-inbox-slot fn', async () => {
    state.results.push(
      { data: null, error: null },
      { data: [], error: null },
      { data: { success: true, reservation_id: 'r1' }, error: null },
    );
    const { result } = renderHook(() => useTripEmailThread('item-2'), { wrapper });
    await act(async () => {
      await result.current.confirm.mutateAsync();
    });
    expect(state.invokes).toContainEqual({
      name: 'trip-inbox-slot',
      body: { item_id: 'item-2' },
    });
  });

  it('markRead() calls the mark_trip_inbox_item_read RPC', async () => {
    state.results.push({ data: null, error: null }, { data: [], error: null });
    const { result } = renderHook(() => useTripEmailThread('item-3'), { wrapper });
    await waitFor(() => expect(result.current.markRead).toBeTruthy());
    await act(async () => {
      await result.current.markRead.mutateAsync();
    });
    expect(state.rpcs).toContainEqual({
      name: 'mark_trip_inbox_item_read',
      args: { p_item: 'item-3' },
    });
  });
});
