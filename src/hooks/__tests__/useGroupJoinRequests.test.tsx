/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const { state, useToastMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table?: string; rpc?: string; chain: Array<{ method: string; args: unknown[] }> }>,
    },
    useToastMock: vi.fn(),
    toastFn,
  };
});

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
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import { useGroupJoinRequests } from '../useGroupJoinRequests';

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
  toastFn.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useGroupJoinRequests — list', () => {
  it('queries pending requests, joining community_groups for name', async () => {
    withResults({
      data: [
        { id: 'r1', group_id: 'g1', user_id: 'u1', status: 'pending', community_groups: { name: 'Berlin Bears' } },
      ],
      error: null,
    });

    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.requests).toHaveLength(1));

    expect(result.current.requests[0].group_name).toBe('Berlin Bears');
    const call = state.calls[0];
    expect(call.table).toBe('group_join_requests');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['status', 'pending']);
  });

  it('adds .eq("group_id", id) when scoped to a group', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useGroupJoinRequests('g1'), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq').map(e => e.args);
    expect(eqs).toEqual(expect.arrayContaining([['status', 'pending'], ['group_id', 'g1']]));
  });

  it('coerces missing community_groups join to null', async () => {
    withResults({
      data: [{ id: 'r1', status: 'pending', community_groups: null }],
      error: null,
    });

    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.requests).toHaveLength(1));
    expect(result.current.requests[0].group_name).toBeNull();
  });
});

describe('approve / reject mutations', () => {
  it('approve calls approve_group_join_request RPC + success toast', async () => {
    withResults({ data: [], error: null }, { data: null, error: null });
    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.approve('r1');
    await waitFor(() => expect(toastFn).toHaveBeenCalled());

    const rpc = state.calls.find(c => c.rpc === 'approve_group_join_request');
    expect((rpc!.chain[0].args[1] as Record<string, unknown>).request_id).toBe('r1');
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Approved' }),
    );
  });

  it('reject calls reject_group_join_request RPC', async () => {
    withResults({ data: [], error: null }, { data: null, error: null });
    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.reject('r1');
    await waitFor(() => expect(toastFn).toHaveBeenCalled());

    const rpc = state.calls.find(c => c.rpc === 'reject_group_join_request');
    expect(rpc).toBeDefined();
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rejected' }));
  });

  it('mutation error fires destructive toast', async () => {
    withResults({ data: [], error: null }, { data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.approve('r1');
    await waitFor(() =>
      expect(toastFn).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error', variant: 'destructive' }),
      ),
    );
  });
});
