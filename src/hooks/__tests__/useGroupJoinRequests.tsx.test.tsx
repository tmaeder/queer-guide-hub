/**
 * @vitest-environment jsdom
 *
 * The .tsx variant of useGroupJoinRequests is a slimmer admin-only hook;
 * the .ts variant (already covered) takes an optional groupId.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };
const { state, useAuthMock, useToastMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table?: string; rpc?: string; chain: Array<{ method: string; args: unknown[] }> }>,
    },
    useAuthMock: vi.fn(),
    useToastMock: vi.fn(),
    toastFn,
  };
});

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
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import { useGroupJoinRequests } from '../useGroupJoinRequests.tsx';

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
  useAuthMock.mockReset();
  useToastMock.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useGroupJoinRequests (admin tsx variant)', () => {
  it('is disabled when no user', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useGroupJoinRequests(), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it("hides the caller's own requests from the admin queue", async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-1' } });
    withResults({
      data: [
        { id: 'r1', group_id: 'g1', user_id: 'admin-1', status: 'pending', message: null, created_at: '', community_groups: { name: 'A' } },
        { id: 'r2', group_id: 'g1', user_id: 'user-2', status: 'pending', message: null, created_at: '', community_groups: { name: 'A' } },
      ],
      error: null,
    });

    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.requests.length).toBeGreaterThan(0));

    expect(result.current.requests.map(r => r.id)).toEqual(['r2']);
    expect(result.current.requests[0].group_name).toBe('A');
  });

  it('approve fires approve_group_join_request RPC + success toast', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-1' } });
    withResults({ data: [], error: null }, { data: null, error: null });

    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.approve('r1');
    await waitFor(() => expect(toastFn).toHaveBeenCalled());

    const rpc = state.calls.find(c => c.rpc === 'approve_group_join_request');
    expect(rpc).toBeDefined();
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Request approved' }));
  });

  it('reject fires reject_group_join_request RPC', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-1' } });
    withResults({ data: [], error: null }, { data: null, error: null });

    const { result } = renderHook(() => useGroupJoinRequests(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    result.current.reject('r1');
    await waitFor(() => expect(toastFn).toHaveBeenCalled());

    expect(state.calls.some(c => c.rpc === 'reject_group_join_request')).toBe(true);
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Request rejected' }));
  });

  it('mutation error fires destructive toast', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'admin-1' } });
    withResults({ data: [], error: null }, { data: null, error: { message: 'rls' } });

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
