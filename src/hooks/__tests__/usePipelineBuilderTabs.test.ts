/**
 * Despite the filename, usePipelineBuilderTabs.ts exports imperative
 * async helpers (no React state) — we test them as a data-access module.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

function withResults(...results: MockResult[]) {
  state.results.push(...results);
}

import {
  fetchDataOpsAlerts,
  ackDataOpsAlert,
  fetchSourceCoverageTargets,
  fetchHotelIngestStats,
  fetchDlqRows,
  retryDlqItem,
  fetchPendingDedupDecisions,
  setDedupDecision,
  resolveGeoMergeCandidate,
} from '../usePipelineBuilderTabs';

beforeEach(() => {
  state.calls.length = 0;
  state.results.length = 0;
});

function chainHas(call: typeof state.calls[number], method: string) {
  return call.chain.some(s => s.method === method);
}

describe('fetchDataOpsAlerts', () => {
  it("filters by acked_at IS NULL when filter='open'", async () => {
    withResults({ data: [{ id: 1 }], error: null });
    const r = await fetchDataOpsAlerts('open');
    expect(r).toEqual([{ id: 1 }]);
    expect(state.calls[0].table).toBe('data_ops_alerts');
    expect(chainHas(state.calls[0], 'is')).toBe(true);
  });

  it("does NOT add the is() filter when filter='all'", async () => {
    withResults({ data: [], error: null });
    await fetchDataOpsAlerts('all');
    expect(chainHas(state.calls[0], 'is')).toBe(false);
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(fetchDataOpsAlerts('open')).rejects.toEqual({ message: 'rls' });
  });
});

describe('ackDataOpsAlert', () => {
  it('updates acked_at and acked_by on the matching id', async () => {
    withResults({ data: null, error: null });
    await ackDataOpsAlert(42, 'admin-1');

    const call = state.calls[0];
    expect(call.table).toBe('data_ops_alerts');
    const updateCall = call.chain.find(s => s.method === 'update');
    expect(updateCall).toBeDefined();
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload.acked_by).toBe('admin-1');
    expect(typeof payload.acked_at).toBe('string');
    const eqCall = call.chain.find(s => s.method === 'eq');
    expect(eqCall?.args).toEqual(['id', 42]);
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'lock' } });
    await expect(ackDataOpsAlert(1, null)).rejects.toEqual({ message: 'lock' });
  });
});

describe('fetchSourceCoverageTargets', () => {
  it('queries source_coverage_targets ordered by source_slug', async () => {
    withResults({ data: [{ id: 1, source_slug: 'awin' }], error: null });
    const r = await fetchSourceCoverageTargets();
    expect(r[0].source_slug).toBe('awin');
    expect(state.calls[0].table).toBe('source_coverage_targets');
    expect(chainHas(state.calls[0], 'order')).toBe(true);
  });

  it('returns empty array when data is null', async () => {
    withResults({ data: null, error: null });
    expect(await fetchSourceCoverageTargets()).toEqual([]);
  });
});

describe('fetchHotelIngestStats', () => {
  it('reads from hotel_ingest_stats', async () => {
    withResults({ data: [{ source: 'awin', staged: 10 }], error: null });
    const r = await fetchHotelIngestStats();
    expect(r[0].staged).toBe(10);
    expect(state.calls[0].table).toBe('hotel_ingest_stats');
  });
});

describe('fetchDlqRows', () => {
  it("filters by status when filter !== 'all'", async () => {
    withResults({ data: [{ id: 1, status: 'pending' }], error: null });
    await fetchDlqRows('pending');
    const eqCall = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eqCall?.args).toEqual(['status', 'pending']);
  });

  it("omits status filter when filter='all'", async () => {
    withResults({ data: [], error: null });
    await fetchDlqRows('all');
    expect(chainHas(state.calls[0], 'eq')).toBe(false);
  });
});

describe('retryDlqItem', () => {
  it('resets status, next_retry_at, and locked_until on the row', async () => {
    withResults({ data: null, error: null });
    await retryDlqItem(7);

    const call = state.calls[0];
    expect(call.table).toBe('ingestion_dlq');
    const updateCall = call.chain.find(s => s.method === 'update');
    const payload = updateCall!.args[0] as Record<string, unknown>;
    expect(payload.status).toBe('pending');
    expect(payload.locked_until).toBeNull();
    expect(typeof payload.next_retry_at).toBe('string');
  });
});

describe('fetchPendingDedupDecisions', () => {
  it("filters by entity_type when entityFilter !== 'all'", async () => {
    // First call returns the pending decisions; subsequent calls return
    // empty hydration data for each entity table.
    withResults(
      {
        data: [
          {
            id: 'd1',
            entity_type: 'venues',
            entity_a_id: 'a',
            entity_b_id: 'b',
            confidence: 0.9,
            decision: 'pending',
          },
        ],
        error: null,
      },
      { data: [{ id: 'a', name: 'Bar A' }, { id: 'b', name: 'Bar B' }], error: null },
    );

    const r = await fetchPendingDedupDecisions('venues');
    expect(r[0].entity_a_name).toBe('Bar A');
    expect(r[0].entity_b_name).toBe('Bar B');

    const first = state.calls[0];
    expect(first.table).toBe('scraper_dedupe_decisions');
    const eqVenue = first.chain.find(s => s.method === 'eq' && (s.args[0] === 'entity_type'));
    expect(eqVenue?.args).toEqual(['entity_type', 'venues']);
  });

  it("omits the entity_type filter when entityFilter='all'", async () => {
    withResults({ data: [], error: null });
    await fetchPendingDedupDecisions('all');
    const first = state.calls[0];
    const entityEq = first.chain.find(s => s.method === 'eq' && s.args[0] === 'entity_type');
    expect(entityEq).toBeUndefined();
  });

  it('skips name hydration for unknown entity_type', async () => {
    withResults({
      data: [{
        id: 'd1',
        entity_type: 'mystery',
        entity_a_id: 'a',
        entity_b_id: 'b',
        decision: 'pending',
      }],
      error: null,
    });

    const r = await fetchPendingDedupDecisions('all');
    // Names stay nullish for unknown entity types.
    expect(r[0].entity_a_name == null).toBe(true);
    // Only the initial query — no hydration call queued.
    expect(state.calls).toHaveLength(1);
  });
});

describe('setDedupDecision', () => {
  it('updates the decision row by id', async () => {
    withResults({ data: null, error: null });
    await setDedupDecision('d1', 'merge');

    const call = state.calls[0];
    expect(call.table).toBe('scraper_dedupe_decisions');
    const updateCall = call.chain.find(s => s.method === 'update');
    expect(updateCall?.args[0]).toEqual({ decision: 'merge' });
    const eqCall = call.chain.find(s => s.method === 'eq');
    expect(eqCall?.args).toEqual(['id', 'd1']);
  });
});

describe('resolveGeoMergeCandidate', () => {
  it("calls the resolve_geo_merge_candidate RPC with actor='admin-ui'", async () => {
    withResults({ data: null, error: null });
    await resolveGeoMergeCandidate('staging-1', 'merge');

    const call = state.calls[0];
    expect(call.rpc).toBe('resolve_geo_merge_candidate');
    const [, args] = call.chain[0].args as [string, Record<string, unknown>];
    expect(args).toEqual({
      p_staging_id: 'staging-1',
      p_decision: 'merge',
      p_actor: 'admin-ui',
    });
  });

  it('throws on RPC error', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    await expect(
      resolveGeoMergeCandidate('s', 'not_duplicate'),
    ).rejects.toEqual({ message: 'denied' });
  });
});
