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
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import { useRecommendations } from '../useRecommendations';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  sessionStorage.clear();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: null });
});

describe('useRecommendations', () => {
  it('is disabled when no user and no session id', () => {
    renderHook(() => useRecommendations({ recType: 'hotel' }), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('user-mode returns user-based rows when present', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({
      data: [{ id: 'r1', user_id: 'u1', rec_type: 'hotel', score: 0.9 }],
      error: null,
    });

    const { result } = renderHook(
      () => useRecommendations({ recType: 'hotel' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0].id).toBe('r1');
    expect(state.calls[0].chain.some(s => s.method === 'eq' && (s.args as [string, unknown])[0] === 'user_id')).toBe(true);
  });

  it('falls back to session-based when user has none', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    sessionStorage.setItem('qg_session_id', 'sess-1');
    withResults(
      { data: [], error: null }, // user query empty
      { data: [{ id: 'r-anon' }], error: null }, // session query
    );

    const { result } = renderHook(
      () => useRecommendations({ recType: 'hotel' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.[0].id).toBe('r-anon');
  });

  it('anonymous mode uses session id only', async () => {
    sessionStorage.setItem('qg_session_id', 'sess-1');
    withResults({ data: [{ id: 'r-anon' }], error: null });

    const { result } = renderHook(
      () => useRecommendations({ recType: 'hotel' }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq').map(e => e.args[0]);
    expect(eqs).toContain('session_id');
    expect(eqs).not.toContain('user_id');
  });
});
