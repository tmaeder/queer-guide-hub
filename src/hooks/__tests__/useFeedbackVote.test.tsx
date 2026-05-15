/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null; count?: number };

const { state, useAuthMock, useToastMock, toastFn } = vi.hoisted(() => {
  const toastFn = vi.fn();
  return {
    state: {
      results: [] as MockResult[],
      calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
vi.mock('@/hooks/use-toast', () => ({ useToast: useToastMock }));

import { useFeedbackVote, useFeedbackVoteCounts } from '../useFeedbackVote';

function withResults(...r: MockResult[]) { state.results.push(...r); }

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
  useAuthMock.mockReset();
  useToastMock.mockReset();
  toastFn.mockReset();
  useToastMock.mockReturnValue({ toast: toastFn });
});

describe('useFeedbackVote — query', () => {
  it('counts votes without checking user vote when signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    withResults({ data: null, error: null, count: 7 });

    const { result } = renderHook(() => useFeedbackVote('sub-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.voteCount).toBe(7);
    expect(result.current.hasVoted).toBe(false);
    // Only the count query — no second user-vote check.
    expect(state.calls).toHaveLength(1);
  });

  it("fires a second query to check the user's own vote when signed in", async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    withResults(
      { data: null, error: null, count: 3 },
      { data: { id: 'v1' }, error: null },
    );

    const { result } = renderHook(() => useFeedbackVote('sub-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.voteCount).toBe(3);
    expect(result.current.hasVoted).toBe(true);
    expect(state.calls).toHaveLength(2);
  });
});

describe('useFeedbackVote — toggleVote', () => {
  it('shows a toast and bails when the user is signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    withResults({ data: null, error: null, count: 0 });

    const { result } = renderHook(() => useFeedbackVote('sub-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.toggleVote());
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Log in to vote' }),
    );
  });
});

describe('useFeedbackVoteCounts', () => {
  it('returns empty object for empty input', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    const { result } = renderHook(() => useFeedbackVoteCounts([]), { wrapper });
    // Disabled when submissionIds.length === 0.
    expect(result.current.isFetching).toBe(false);
    expect(state.calls).toHaveLength(0);
  });

  it('aggregates votes per submission and flags user-voted ids', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' } });
    // First call: all votes for these submissions
    // Second call: this user's votes
    withResults(
      {
        data: [
          { submission_id: 's1' },
          { submission_id: 's1' },
          { submission_id: 's2' },
        ],
        error: null,
      },
      { data: [{ submission_id: 's2' }], error: null },
    );

    const { result } = renderHook(
      () => useFeedbackVoteCounts(['s1', 's2', 's3']),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({
      s1: { count: 2, hasVoted: false },
      s2: { count: 1, hasVoted: true },
      s3: { count: 0, hasVoted: false },
    });
  });

  it('returns counts only (hasVoted=false) when signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    withResults({
      data: [{ submission_id: 's1' }, { submission_id: 's1' }],
      error: null,
    });

    const { result } = renderHook(() => useFeedbackVoteCounts(['s1']), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data).toEqual({ s1: { count: 2, hasVoted: false } });
    // Only the counts query — no user-vote query.
    expect(state.calls).toHaveLength(1);
  });
});
