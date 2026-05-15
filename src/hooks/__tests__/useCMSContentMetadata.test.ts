import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockResult = { data: unknown; error: { message: string } | null };

const state = vi.hoisted(() => ({
  results: [] as MockResult[],
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
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

import {
  insertContentActions,
  fetchCMSReviewQueueMetadata,
  fetchRecordTitle,
  loadCMSContentMetadata,
  upsertCMSContentMetadata,
} from '../useCMSContentMetadata';

function withResults(...r: MockResult[]) { state.results.push(...r); }

beforeEach(() => {
  state.results.length = 0;
  state.calls.length = 0;
});

describe('insertContentActions', () => {
  it('returns null error on success', async () => {
    withResults({ data: null, error: null });
    const r = await insertContentActions([{ action: 'publish' }]);
    expect(r.error).toBeNull();
    expect(state.calls[0].table).toBe('content_actions');
  });

  it('wraps a supabase error in { message }', async () => {
    withResults({ data: null, error: { message: 'denied' } });
    const r = await insertContentActions([{}]);
    expect(r.error).toEqual({ message: 'denied' });
  });
});

describe('fetchCMSReviewQueueMetadata', () => {
  it('filters by workflow_state=review ordered by last_edited_at desc', async () => {
    withResults({ data: [{ id: 'm1' }, { id: 'm2' }], error: null });
    const result = await fetchCMSReviewQueueMetadata();
    expect(result).toEqual([{ id: 'm1' }, { id: 'm2' }]);

    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['workflow_state', 'review']);
    const order = state.calls[0].chain.find(s => s.method === 'order');
    expect(order?.args[0]).toBe('last_edited_at');
  });

  it('throws on supabase error', async () => {
    withResults({ data: null, error: { message: 'rls' } });
    await expect(fetchCMSReviewQueueMetadata()).rejects.toEqual({ message: 'rls' });
  });
});

describe('fetchRecordTitle', () => {
  it('selects titleField from table by id', async () => {
    withResults({ data: { name: 'Berghain' }, error: null });
    const r = await fetchRecordTitle('venues', 'id', 'v1', 'name');
    expect(r).toEqual({ name: 'Berghain' });
    expect(state.calls[0].table).toBe('venues');
    const select = state.calls[0].chain.find(s => s.method === 'select');
    expect(select?.args).toEqual(['name']);
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'v1']);
  });
});

describe('loadCMSContentMetadata', () => {
  it('returns null when no row exists', async () => {
    withResults({ data: null, error: null });
    expect(await loadCMSContentMetadata('venues', 'v1')).toBeNull();
  });

  it('returns the metadata when present', async () => {
    const row = { workflow_state: 'review', visibility_level: 'public', published_at: null, scheduled_publish_at: null };
    withResults({ data: row, error: null });
    expect(await loadCMSContentMetadata('venues', 'v1')).toEqual(row);
  });
});

describe('upsertCMSContentMetadata', () => {
  it('upserts with onConflict=source_table,source_id', async () => {
    withResults({ data: null, error: null });
    const r = await upsertCMSContentMetadata('venues', 'v1', { workflow_state: 'published' });
    expect(r.error).toBeNull();

    const upsert = state.calls[0].chain.find(s => s.method === 'upsert');
    const payload = upsert?.args[0] as Record<string, unknown>;
    expect(payload.source_table).toBe('venues');
    expect(payload.source_id).toBe('v1');
    expect(payload.workflow_state).toBe('published');
    expect(typeof payload.updated_at).toBe('string');
    expect(upsert?.args[1]).toEqual({ onConflict: 'source_table,source_id' });
  });

  it('wraps supabase errors in { message }', async () => {
    withResults({ data: null, error: { message: 'fail' } });
    const r = await upsertCMSContentMetadata('venues', 'v1', {});
    expect(r.error).toEqual({ message: 'fail' });
  });
});
