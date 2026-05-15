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

import {
  useUserTravelPreferences,
  useUpdateUserTravelPreferences,
} from '../useUserTravelPreferences';

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

describe('useUserTravelPreferences', () => {
  it('is disabled when no user is signed in', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useUserTravelPreferences(), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('returns null when no row exists for the user', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useUserTravelPreferences(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('returns the preferences row when present', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    const row = {
      user_id: 'u1',
      budget_tier: 'mid',
      preferred_transport: ['rail'],
      home_city_id: 'c1',
      home_country_id: 'co1',
      travel_style: {},
      updated_at: '2026-01-01',
    };
    withResults({ data: row, error: null });

    const { result } = renderHook(() => useUserTravelPreferences(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(row));

    const call = state.calls[0];
    expect(call.table).toBe('user_travel_preferences');
    const eq = call.chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['user_id', 'u1']);
  });

  it('throws on supabase error', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useUserTravelPreferences(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useUpdateUserTravelPreferences', () => {
  it('rejects when not signed in', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useUpdateUserTravelPreferences(), { wrapper });
    await expect(
      result.current.mutateAsync({ budget_tier: 'budget' }),
    ).rejects.toThrow('not authenticated');
    expect(state.calls).toHaveLength(0);
  });

  it('upserts with the signed-in user_id and patch', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    const updated = { user_id: 'u1', budget_tier: 'luxury', preferred_transport: [] };
    withResults({ data: updated, error: null });

    const { result } = renderHook(() => useUpdateUserTravelPreferences(), { wrapper });
    const data = await result.current.mutateAsync({ budget_tier: 'luxury' });
    expect(data.budget_tier).toBe('luxury');

    const call = state.calls[0];
    expect(call.table).toBe('user_travel_preferences');
    const upsert = call.chain.find(s => s.method === 'upsert');
    expect(upsert?.args[0]).toEqual({ user_id: 'u1', budget_tier: 'luxury' });
    expect(upsert?.args[1]).toEqual({ onConflict: 'user_id' });
  });

  it('throws on supabase error', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: { message: 'denied' } });
    const { result } = renderHook(() => useUpdateUserTravelPreferences(), { wrapper });
    await expect(
      result.current.mutateAsync({ budget_tier: 'budget' }),
    ).rejects.toEqual({ message: 'denied' });
  });
});
