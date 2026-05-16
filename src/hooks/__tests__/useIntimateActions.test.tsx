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
              const next = state.results.shift() ?? { data: null, error: null };
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

import {
  useVerifiedEmail,
  useProfileDisplay,
  useSendFriendRequest,
  useBlockUser,
} from '../useIntimateActions';

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

describe('useVerifiedEmail', () => {
  it('returns true when profile.verified_email is true', async () => {
    withResults({ data: { verified_email: true }, error: null });
    const { result } = renderHook(() => useVerifiedEmail(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBe(true);
  });

  it('returns false when profile missing or value falsy', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useVerifiedEmail(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBe(false);
  });

  it('disabled without user', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useVerifiedEmail(), { wrapper });
    expect(state.calls).toHaveLength(0);
  });
});

describe('useProfileDisplay', () => {
  it('returns display data for the user', async () => {
    withResults({ data: { display_name: 'Alice', avatar_url: 'a.png' }, error: null });
    const { result } = renderHook(() => useProfileDisplay('u2'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.display_name).toBe('Alice');
  });
});

describe('useSendFriendRequest', () => {
  it('inserts user_relationships with friend+pending', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSendFriendRequest(), { wrapper });
    await result.current.mutateAsync('u2');

    expect(state.calls[0].table).toBe('user_relationships');
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual({
      user_id: 'u1', target_user_id: 'u2', relationship_type: 'friend', status: 'pending',
    });
  });

  it('rejects when no user', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useSendFriendRequest(), { wrapper });
    await expect(result.current.mutateAsync('u2')).rejects.toThrow('not signed in');
  });
});

describe('useBlockUser', () => {
  it('inserts block+accepted', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useBlockUser(), { wrapper });
    await result.current.mutateAsync('u2');

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect((insert?.args[0] as Record<string, unknown>).relationship_type).toBe('block');
  });
});
