/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table?: string; rpc?: string; chain: Array<{ method: string; args: unknown[] }> }>,
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
    rpc(name: string, args: unknown) {
      state.calls.push({ rpc: name, chain: [{ method: 'rpc', args: [name, args] }] });
      const next = state.results.shift() ?? { data: null, error: null };
      return Promise.resolve(next);
    },
  },
}));

import {
  useFeedbackDailyVolume,
  useFeedbackSlaStats,
  useApiErrorDailySeries,
  toDailySeries,
} from '../useFeedbackAnalytics';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useFeedbackDailyVolume', () => {
  it('queries v_feedback_analytics_daily', async () => {
    withResults({ data: [{ day: '2026-04-01', n: 3 }], error: null });
    const { result } = renderHook(() => useFeedbackDailyVolume(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(state.calls[0].table).toBe('v_feedback_analytics_daily');
  });
});

describe('useFeedbackSlaStats', () => {
  it('calls feedback_sla_stats RPC with default 90d window', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useFeedbackSlaStats(), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({ p_days_window: 90 });
  });

  it('honors custom daysWindow', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useFeedbackSlaStats(30), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const [, args] = state.calls[0].chain[0].args as [string, Record<string, unknown>];
    expect(args.p_days_window).toBe(30);
  });
});

describe('useApiErrorDailySeries', () => {
  it('queries v_api_error_daily', async () => {
    withResults({ data: [{ submission_id: 's1', fingerprint: 'fp', day: '2026-04-01', n: 5 }], error: null });
    const { result } = renderHook(() => useApiErrorDailySeries(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(state.calls[0].table).toBe('v_api_error_daily');
  });
});

describe('toDailySeries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns zero-filled array of requested length', () => {
    const series = toDailySeries([], 7);
    expect(series).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('places values at the day-aligned slot, sums duplicates', () => {
    const rows = [
      { submission_id: 's', fingerprint: 'fp', day: '2026-04-13', n: 2 },
      { submission_id: 's', fingerprint: 'fp', day: '2026-04-13', n: 1 }, // same day → summed
      { submission_id: 's', fingerprint: 'fp', day: '2026-04-15', n: 4 }, // today
    ];
    // 7-day window ending today: indexes 0..6 = 2026-04-09 .. 2026-04-15
    const series = toDailySeries(rows, 7);
    expect(series[6]).toBe(4); // today
    expect(series[4]).toBe(3); // 2026-04-13 → 2 days before today → index 4
    expect(series[0]).toBe(0); // 2026-04-09
  });

  it('drops rows outside the window', () => {
    const rows = [
      { submission_id: 's', fingerprint: 'fp', day: '2026-03-01', n: 99 }, // way back
    ];
    expect(toDailySeries(rows, 14).every(v => v === 0)).toBe(true);
  });
});
