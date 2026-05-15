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
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import { useMyTripSaves, useToggleTripSave } from '../useTripSaves';

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
});

describe('useMyTripSaves', () => {
  it('is disabled when signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useMyTripSaves(), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('returns a Set of trip ids on success', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({
      data: [{ trip_id: 't1' }, { trip_id: 't2' }],
      error: null,
    });

    const { result } = renderHook(() => useMyTripSaves(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data instanceof Set).toBe(true);
    expect(Array.from(result.current.data!).sort()).toEqual(['t1', 't2']);
  });

  it('returns an empty set on error (table missing / RLS)', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: { message: 'no such table' } });

    const { result } = renderHook(() => useMyTripSaves(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.size).toBe(0);
  });
});

describe('useToggleTripSave', () => {
  it('throws when not signed in', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useToggleTripSave(), { wrapper });
    await expect(
      result.current.mutateAsync({ tripId: 't1', saved: false }),
    ).rejects.toThrow('Sign in to save trips');
  });

  it("saved=true → deletes by trip_id + user_id", async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useToggleTripSave(), { wrapper });
    await result.current.mutateAsync({ tripId: 't1', saved: true });

    const call = state.calls[0];
    expect(call.table).toBe('trip_saves');
    expect(call.chain.some(s => s.method === 'delete')).toBe(true);
    const eqs = call.chain.filter(s => s.method === 'eq').map(e => e.args[0]);
    expect(eqs).toEqual(expect.arrayContaining(['trip_id', 'user_id']));
  });

  it('saved=false → inserts a row', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useToggleTripSave(), { wrapper });
    await result.current.mutateAsync({ tripId: 't1', saved: false });

    const call = state.calls[0];
    const insert = call.chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual({ trip_id: 't1', user_id: 'u1' });
  });
});
