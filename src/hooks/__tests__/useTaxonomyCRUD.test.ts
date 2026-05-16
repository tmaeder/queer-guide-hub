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

import { useTaxonomyCRUD } from '../useTaxonomyCRUD';

beforeEach(() => { state.results.length = 0; state.calls.length = 0; });

describe('useTaxonomyCRUD', () => {
  it('upsert with editingId → update', async () => {
    state.results.push({ data: null, error: null });
    const api = useTaxonomyCRUD('venue_categories');
    const r = await api.upsert({ name: 'Bar' }, 'cat-1');
    expect(r.error).toBeNull();
    expect(state.calls[0].table).toBe('venue_categories');
    const update = state.calls[0].chain.find(s => s.method === 'update');
    expect(update?.args[0]).toEqual({ name: 'Bar' });
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'cat-1']);
  });

  it('upsert without editingId → insert (wrapped in array)', async () => {
    state.results.push({ data: null, error: null });
    const api = useTaxonomyCRUD('venue_categories');
    await api.upsert({ name: 'Bar' }, null);
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    expect(insert?.args[0]).toEqual([{ name: 'Bar' }]);
  });

  it('remove deletes by id', async () => {
    state.results.push({ data: null, error: null });
    const api = useTaxonomyCRUD('venue_categories');
    await api.remove('cat-1');
    expect(state.calls[0].chain.some(s => s.method === 'delete')).toBe(true);
    const eq = state.calls[0].chain.find(s => s.method === 'eq');
    expect(eq?.args).toEqual(['id', 'cat-1']);
  });

  it('wraps supabase errors in result.error', async () => {
    state.results.push({ data: null, error: { message: 'rls' } });
    const api = useTaxonomyCRUD('venue_categories');
    const r = await api.remove('cat-1');
    expect((r.error as Error | null)?.message).toBe('rls');
  });
});
