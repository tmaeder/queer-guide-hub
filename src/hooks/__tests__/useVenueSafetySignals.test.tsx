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
    calls: [] as Array<{ rpc: string; chain: Array<{ method: string; args: unknown[] }> }>,
  },
  useAuthMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: useAuthMock }));

import {
  useVenueSafetyScore,
  useVenueSafetyPrompts,
  useSubmitSafetySignal,
} from '../useVenueSafetySignals';

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

describe('useVenueSafetyScore', () => {
  it('is disabled without venueId', () => {
    renderHook(() => useVenueSafetyScore(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('calls get_venue_safety_score RPC with venueId', async () => {
    withResults({ data: [{ question_slug: 'lgbt-friendly', score: 0.92 }], error: null });
    const { result } = renderHook(() => useVenueSafetyScore('v1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].rpc).toBe('get_venue_safety_score');
    expect((state.calls[0].chain[0].args[1] as Record<string, unknown>).p_venue_id).toBe('v1');
  });
});

describe('useVenueSafetyPrompts', () => {
  it('is disabled without a user', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useVenueSafetyPrompts('v1'), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('is disabled without venueId', () => {
    renderHook(() => useVenueSafetyPrompts(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('calls get_venue_safety_questions RPC when both are present', async () => {
    withResults({
      data: [{ question_id: 'q1', slug: 's', prompt: 'Was the staff welcoming?' }],
      error: null,
    });
    const { result } = renderHook(() => useVenueSafetyPrompts('v1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].rpc).toBe('get_venue_safety_questions');
  });
});

describe('useSubmitSafetySignal', () => {
  it('submits and unwraps array-form RPC response', async () => {
    withResults({ data: [{ ok: true, reason: null }], error: null });

    const { result } = renderHook(() => useSubmitSafetySignal('v1'), { wrapper });
    const out = await result.current.mutateAsync({ questionId: 'q1', answer: true });
    expect(out.ok).toBe(true);

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({ p_venue_id: 'v1', p_question_id: 'q1', p_answer: true });
  });

  it('throws when RPC reports ok=false', async () => {
    withResults({ data: { ok: false, reason: 'cooldown' }, error: null });
    const { result } = renderHook(() => useSubmitSafetySignal('v1'), { wrapper });
    await expect(
      result.current.mutateAsync({ questionId: 'q1', answer: false }),
    ).rejects.toThrow('cooldown');
  });

  it("throws 'submit_failed' when RPC returns null", async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useSubmitSafetySignal('v1'), { wrapper });
    await expect(
      result.current.mutateAsync({ questionId: 'q1', answer: false }),
    ).rejects.toThrow('submit_failed');
  });

  it('propagates RPC errors', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    const { result } = renderHook(() => useSubmitSafetySignal('v1'), { wrapper });
    await expect(
      result.current.mutateAsync({ questionId: 'q1', answer: true }),
    ).rejects.toEqual({ message: 'rls' });
  });
});
