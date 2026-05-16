/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };
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
      const builder: unknown = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            return (onFulfilled: (v: MockResult) => unknown) => {
              const next = state.results.shift() ?? { data: [], error: null, count: 0 };
              return Promise.resolve(next).then(onFulfilled);
            };
          }
          return (...args: unknown[]) => { record.chain.push({ method: prop, args }); return builder; };
        },
      });
      return builder;
    },
    channel: () => ({
      on() { return this; },
      subscribe() { return this; },
    }),
    removeChannel: () => {},
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import { useInboxBadge } from '../useInboxBadge';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
});

describe('useInboxBadge', () => {
  it('returns 0 when signed out', () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useInboxBadge(), { wrapper });
    expect(result.current).toBe(0);
    expect(state.calls).toHaveLength(0);
  });

  it('queries reservations with trip_id null + status not in cancelled/completed', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: null, count: 3 });

    const { result } = renderHook(() => useInboxBadge(), { wrapper });
    await waitFor(() => expect(result.current).toBe(3));

    const call = state.calls[0];
    expect(call.table).toBe('reservations');
    expect(call.chain.find(s => s.method === 'eq')?.args).toEqual(['user_id', 'u1']);
    expect(call.chain.find(s => s.method === 'is')?.args).toEqual(['trip_id', null]);
    const notCall = call.chain.find(s => s.method === 'not');
    expect(notCall?.args[0]).toBe('status');
  });

  it('returns 0 on supabase error (swallowed)', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: { message: '5xx' } });

    const { result } = renderHook(() => useInboxBadge(), { wrapper });
    await waitFor(() => expect(result.current).toBe(0));
  });
});
