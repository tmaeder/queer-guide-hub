/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table?: string; invoke?: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
                const next = state.results.shift() ?? { data: null, error: null };
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
    functions: {
      invoke: (name: string, opts: unknown) => {
        state.calls.push({ invoke: name, chain: [{ method: 'invoke', args: [name, opts] }] });
        const next = state.results.shift() ?? { data: null, error: null };
        return Promise.resolve(next);
      },
    },
  },
}));

import {
  useTripSafetyBriefing,
  useGenerateTripSafetyBriefing,
} from '../useTripSafetyNarrative';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useTripSafetyBriefing', () => {
  it('is disabled without tripId', () => {
    renderHook(() => useTripSafetyBriefing(undefined), { wrapper });
    expect(state.calls).toHaveLength(0);
  });

  it('returns null when no briefing row exists', async () => {
    withResults({ data: null, error: null });
    const { result } = renderHook(() => useTripSafetyBriefing('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('returns the briefing row when present', async () => {
    const row = {
      trip_id: 'trip-1',
      narrative: 'Be cautious in X.',
      country_ids: ['x'],
      article_count: 4,
      risk_level: 'moderate' as const,
      generated_at: '2026-01-01',
    };
    withResults({ data: row, error: null });

    const { result } = renderHook(() => useTripSafetyBriefing('trip-1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.narrative).toBe('Be cautious in X.');
  });
});

describe('useGenerateTripSafetyBriefing', () => {
  it('invokes trip-safety-narrative edge with trip id', async () => {
    const briefing = {
      trip_id: 'trip-1',
      narrative: 'gen',
      country_ids: ['x'],
      article_count: 0,
      risk_level: null,
      generated_at: '2026-01-01',
    };
    withResults({ data: briefing, error: null });

    const { result } = renderHook(() => useGenerateTripSafetyBriefing(), { wrapper });
    const data = await result.current.mutateAsync({ tripId: 'trip-1' });
    expect(data.narrative).toBe('gen');

    const [, opts] = state.calls[0].chain[0].args as [string, { body: { trip_id: string; refresh: boolean } }];
    expect(opts.body).toEqual({ trip_id: 'trip-1', refresh: false });
  });

  it('passes refresh:true when requested', async () => {
    withResults({ data: { trip_id: 'trip-1', narrative: '' }, error: null });
    const { result } = renderHook(() => useGenerateTripSafetyBriefing(), { wrapper });
    await result.current.mutateAsync({ tripId: 'trip-1', refresh: true });

    const [, opts] = state.calls[0].chain[0].args as [string, { body: { refresh: boolean } }];
    expect(opts.body.refresh).toBe(true);
  });

  it('throws on edge error', async () => {
    withResults({ data: null, error: { message: 'down' } });
    const { result } = renderHook(() => useGenerateTripSafetyBriefing(), { wrapper });
    await expect(
      result.current.mutateAsync({ tripId: 'trip-1' }),
    ).rejects.toEqual({ message: 'down' });
  });
});
