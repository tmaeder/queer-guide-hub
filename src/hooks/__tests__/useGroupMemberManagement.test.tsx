/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const { state, useToastMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import { useGroupMemberManagement } from '../useGroupMemberManagement';

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

// (useSearchProfiles is intentionally not covered here — its 300ms debounce
//  + unmounted-setTimeout cleanup race hangs the vitest forks worker.
//  Integration tests at the page level cover this surface.)

describe('useGroupMemberManagement — addMember', () => {
  it('inserts a member row with role=member + group/user ids', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useGroupMemberManagement('g1'), { wrapper });
    await result.current.addMember.mutateAsync({ userId: 'u1' });

    const call = state.calls[0];
    expect(call.table).toBe('group_memberships');
    const insert = call.chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual({ group_id: 'g1', user_id: 'u1', role: 'member' });
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Member added' }));
  });
});

describe('useGroupMemberManagement — changeRole', () => {
  it('updates role and filters by group_id + user_id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useGroupMemberManagement('g1'), { wrapper });
    await result.current.changeRole.mutateAsync({ userId: 'u1', newRole: 'admin' });

    const call = state.calls[0];
    const update = call.chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ role: 'admin' });
    const eqs = call.chain.filter(s => s.method === 'eq').map(e => e.args);
    expect(eqs).toEqual(expect.arrayContaining([['group_id', 'g1'], ['user_id', 'u1']]));
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Role updated' }));
  });
});

describe('useGroupMemberManagement — removeMember', () => {
  it('deletes by group + user id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useGroupMemberManagement('g1'), { wrapper });
    await result.current.removeMember.mutateAsync({ userId: 'u1' });

    const call = state.calls[0];
    expect(call.chain.some(s => s.method === 'delete')).toBe(true);
    const eqs = call.chain.filter(s => s.method === 'eq').map(e => e.args);
    expect(eqs).toEqual(expect.arrayContaining([['group_id', 'g1'], ['user_id', 'u1']]));
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ title: 'Member removed' }));
  });

  it('toasts on error', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useGroupMemberManagement('g1'), { wrapper });
    await expect(result.current.removeMember.mutateAsync({ userId: 'u1' })).rejects.toBeDefined();
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Error', variant: 'destructive' }),
    );
  });
});
