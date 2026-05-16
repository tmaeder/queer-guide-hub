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
  useTripReactions,
  useToggleReaction,
  getViewerFingerprint,
  REACTION_EMOJIS,
} from '../useTripReactions';

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

describe('getViewerFingerprint', () => {
  it('persists a UUID across calls', () => {
    const a = getViewerFingerprint();
    const b = getViewerFingerprint();
    expect(a).toBe(b);
    expect(localStorage.getItem('qg.viewerFingerprint')).toBe(a);
  });

  it('matches UUID v4 shape', () => {
    expect(getViewerFingerprint()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('REACTION_EMOJIS', () => {
  it('exposes 5 reactions', () => {
    expect(REACTION_EMOJIS.length).toBe(5);
  });
});

describe('useTripReactions', () => {
  it('is disabled without tripId', () => {
    renderHook(() => useTripReactions(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('aggregates emoji counts and flags my reactions (signed-in path)', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({
      data: [
        { id: 'r1', trip_id: 't1', place_id: 'p1', emoji: '❤️', viewer_id: 'u1', viewer_fingerprint: null },
        { id: 'r2', trip_id: 't1', place_id: 'p1', emoji: '❤️', viewer_id: 'u2', viewer_fingerprint: null },
        { id: 'r3', trip_id: 't1', place_id: 'p1', emoji: '✨', viewer_id: 'u3', viewer_fingerprint: null },
        { id: 'r4', trip_id: 't1', place_id: 'p2', emoji: '🌈', viewer_id: 'u1', viewer_fingerprint: null },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTripReactions('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const p1 = result.current.data!.get('p1')!;
    expect(p1.counts).toEqual({ '❤️': 2, '✨': 1 });
    expect(Array.from(p1.mine).sort()).toEqual(['❤️']);
    const p2 = result.current.data!.get('p2')!;
    expect(p2.mine.has('🌈')).toBe(true);
  });

  it('uses viewer_fingerprint when signed out', async () => {
    const fp = getViewerFingerprint();
    withResults({
      data: [
        { id: 'r1', trip_id: 't1', place_id: 'p1', emoji: '✨', viewer_id: null, viewer_fingerprint: fp },
        { id: 'r2', trip_id: 't1', place_id: 'p1', emoji: '✨', viewer_id: null, viewer_fingerprint: 'someone-else' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useTripReactions('t1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const p1 = result.current.data!.get('p1')!;
    expect(p1.counts['✨']).toBe(2);
    expect(p1.mine.has('✨')).toBe(true);
  });
});

describe('useToggleReaction', () => {
  it('active=true (signed in) deletes by viewer_id + place + emoji', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: null });

    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await result.current.mutateAsync({ tripId: 't1', placeId: 'p1', emoji: '❤️', active: true });

    const call = state.calls[0];
    expect(call.chain.some(s => s.method === 'delete')).toBe(true);
    const eqs = call.chain.filter(s => s.method === 'eq').map(e => e.args);
    expect(eqs).toEqual(expect.arrayContaining([
      ['place_id', 'p1'],
      ['emoji', '❤️'],
      ['viewer_id', 'u1'],
    ]));
  });

  it('active=true (signed out) deletes by viewer_fingerprint', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await result.current.mutateAsync({ tripId: 't1', placeId: 'p1', emoji: '❤️', active: true });

    const eqs = state.calls[0].chain.filter(s => s.method === 'eq').map(e => e.args[0]);
    expect(eqs).toContain('viewer_fingerprint');
    expect(eqs).not.toContain('viewer_id');
  });

  it('active=false inserts a new reaction (signed in: viewer_id, fp null)', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await result.current.mutateAsync({ tripId: 't1', placeId: 'p1', emoji: '✨', active: false });

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual({
      trip_id: 't1',
      place_id: 'p1',
      emoji: '✨',
      viewer_id: 'u1',
      viewer_fingerprint: null,
    });
  });

  it('active=false (signed out) inserts with viewer_id null + fingerprint set', async () => {
    withResults({ data: null, error: null });
    const fp = getViewerFingerprint();
    const { result } = renderHook(() => useToggleReaction(), { wrapper });
    await result.current.mutateAsync({ tripId: 't1', placeId: 'p1', emoji: '🌈', active: false });

    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload.viewer_id).toBeNull();
    expect(payload.viewer_fingerprint).toBe(fp);
  });
});
