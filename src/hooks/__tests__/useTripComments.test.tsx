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
// useTripComments imports getViewerFingerprint from useTripReactions —
// stub it to avoid the real localStorage dance.
vi.mock('@/hooks/useTripReactions', () => ({
  getViewerFingerprint: () => 'fp-test',
}));

import {
  useTripComments,
  usePostTripComment,
  useDeleteTripComment,
  getViewerDisplayName,
  setViewerDisplayName,
} from '../useTripComments';

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
  localStorage.clear();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: null });
});

describe('display-name helpers', () => {
  it('round-trips through localStorage, capping length to 60', () => {
    setViewerDisplayName('A'.repeat(100));
    expect(getViewerDisplayName()?.length).toBe(60);
  });

  it('returns null when nothing stored', () => {
    expect(getViewerDisplayName()).toBeNull();
  });
});

describe('useTripComments', () => {
  it('is disabled without tripId', () => {
    renderHook(() => useTripComments(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('buckets comments by place_id, oldest first per bucket', async () => {
    withResults({
      data: [
        { id: 'c1', trip_id: 't1', place_id: 'p1', body: 'a', created_at: '2026-01-01' },
        { id: 'c2', trip_id: 't1', place_id: 'p1', body: 'b', created_at: '2026-01-02' },
        { id: 'c3', trip_id: 't1', place_id: 'p2', body: 'c', created_at: '2026-01-03' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTripComments('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data!.get('p1')!.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(result.current.data!.get('p2')!.map(c => c.id)).toEqual(['c3']);
  });
});

describe('usePostTripComment', () => {
  it('rejects empty body or empty name', async () => {
    const { result } = renderHook(() => usePostTripComment(), { wrapper });
    await expect(
      result.current.mutateAsync({ tripId: 't1', placeId: 'p1', body: '   ', displayName: 'Alice' }),
    ).rejects.toThrow('body and name required');
    await expect(
      result.current.mutateAsync({ tripId: 't1', placeId: 'p1', body: 'hi', displayName: '' }),
    ).rejects.toThrow('body and name required');
  });

  it('inserts trimmed body + name (capped) when signed out, sets fp + persists name', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => usePostTripComment(), { wrapper });
    await result.current.mutateAsync({
      tripId: 't1',
      placeId: 'p1',
      body: '  great place  ',
      displayName: '  A'.repeat(40), // > 60 after trim → cap to 60
    });

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload.body).toBe('great place');
    expect((payload.display_name as string).length).toBe(60);
    expect(payload.viewer_id).toBeNull();
    expect(payload.viewer_fingerprint).toBe('fp-test');

    // Anonymous post should persist the chosen display name.
    expect(getViewerDisplayName()?.length).toBe(60);
  });

  it('signed-in users carry viewer_id + null fp; display name not persisted', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: null });
    const { result } = renderHook(() => usePostTripComment(), { wrapper });
    await result.current.mutateAsync({
      tripId: 't1',
      placeId: 'p1',
      body: 'cool',
      displayName: 'Alice',
    });

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload.viewer_id).toBe('u1');
    expect(payload.viewer_fingerprint).toBeNull();
    expect(getViewerDisplayName()).toBeNull();
  });
});

describe('useDeleteTripComment', () => {
  it('deletes by id', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useDeleteTripComment(), { wrapper });
    await result.current.mutateAsync({ id: 'c1', tripId: 't1' });

    expect(state.calls[0].chain.some(s => s.method === 'delete')).toBe(true);
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'c1']);
  });
});
