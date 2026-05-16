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
  useVenueIngestStats,
  useVenueIngestRecentEvents,
  useVenueIngestHealthSnapshot,
  useVenueIngestDuplicateSummary,
} from '../useVenueIngestStats';

function withResults(...r: MockResult[]) { state.results.push(...r); }
function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('useVenueIngestStats', () => {
  it('queries venue_ingest_stats ordered by day desc, limit 60', async () => {
    withResults({ data: [{ day: '2026-04-15' }], error: null });
    const { result } = renderHook(() => useVenueIngestStats(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const call = state.calls[0];
    expect(call.table).toBe('venue_ingest_stats');
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([60]);
    const order = call.chain.find(s => s.method === 'order');
    expect(order?.args[0]).toBe('day');
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(false);
  });
});

describe('useVenueIngestRecentEvents', () => {
  it('queries ingestion_events newest first, limit 25', async () => {
    withResults({ data: [], error: null });
    renderHook(() => useVenueIngestRecentEvents(), { wrapper });
    await waitFor(() => expect(state.calls).toHaveLength(1));

    const call = state.calls[0];
    expect(call.table).toBe('ingestion_events');
    expect(call.chain.find(s => s.method === 'limit')?.args).toEqual([25]);
  });
});

describe('useVenueIngestHealthSnapshot', () => {
  it('calls pipeline_health_snapshot RPC', async () => {
    withResults({ data: [{ target_table: 'venues', total: 100 }], error: null });
    const { result } = renderHook(() => useVenueIngestHealthSnapshot(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(state.calls[0].rpc).toBe('pipeline_health_snapshot');
  });
});

describe('useVenueIngestDuplicateSummary', () => {
  it('returns RPC data when available', async () => {
    withResults({ data: [{ slug: 'awin', duplicates: 5 }], error: null });
    const { result } = renderHook(() => useVenueIngestDuplicateSummary(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(result.current.data?.[0].duplicates).toBe(5);
    expect(state.calls[0].rpc).toBe('venue_duplicate_summary');
  });

  it('falls back to scanning venues when RPC errors, grouped by data_source', async () => {
    withResults(
      { data: null, error: { message: 'no such function' } },
      {
        data: [
          { data_source: 'awin' },
          { data_source: 'awin' },
          { data_source: 'shopify' },
          { data_source: null }, // → 'unknown'
        ],
        error: null,
      },
    );

    const { result } = renderHook(() => useVenueIngestDuplicateSummary(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    const map = new Map(result.current.data!.map(r => [r.slug, r.duplicates]));
    expect(map.get('awin')).toBe(2);
    expect(map.get('shopify')).toBe(1);
    expect(map.get('unknown')).toBe(1);
  });
});
