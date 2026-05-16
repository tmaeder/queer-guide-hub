import { describe, it, expect, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; chain: Array<{ method: string; args: unknown[] }> }>,
  authUser: null as { id: string; email?: string } | null,
  authError: null as unknown,
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
              return (onFulfilled: (v: { data: null; error: null }) => unknown) =>
                Promise.resolve({ data: null, error: null }).then(onFulfilled);
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
    auth: {
      getUser() {
        if (state.authError) return Promise.reject(state.authError);
        return Promise.resolve({ data: { user: state.authUser }, error: null });
      },
    },
  },
}));

import { logAdminGeoEdit } from '../admin-audit';

beforeEach(() => {
  state.calls.length = 0;
  state.authUser = null;
  state.authError = null;
});

describe('logAdminGeoEdit', () => {
  it('inserts ingestion_events row with email as actor when signed in', async () => {
    state.authUser = { id: 'u1', email: 'admin@queer.guide' };
    await logAdminGeoEdit('venues', 'update', 'v1', { name: 'old' }, { name: 'new' });

    expect(state.calls[0].table).toBe('ingestion_events');
    const insert = state.calls[0].chain.find(s => s.method === 'insert');
    const payload = insert?.args[0] as Record<string, unknown>;
    expect(payload.stage).toBe('admin_edit');
    expect(payload.new_status).toBe('update');
    expect(payload.actor).toBe('admin@queer.guide');
    expect((payload.payload as Record<string, unknown>).table).toBe('venues');
    expect((payload.payload as Record<string, unknown>).entity_id).toBe('v1');
  });

  it('falls back to user id when email missing', async () => {
    state.authUser = { id: 'u1' };
    await logAdminGeoEdit('cities', 'create', 'c1', null, { name: 'X' });

    const payload = state.calls[0].chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(payload.actor).toBe('u1');
  });

  it("falls back to 'admin-ui' when no user", async () => {
    state.authUser = null;
    await logAdminGeoEdit('countries', 'delete', 'cn1', { name: 'X' }, null);

    const payload = state.calls[0].chain.find(s => s.method === 'insert')?.args[0] as Record<string, unknown>;
    expect(payload.actor).toBe('admin-ui');
  });

  it('never throws on auth failure', async () => {
    state.authError = new Error('auth down');
    await expect(
      logAdminGeoEdit('venues', 'update', 'v1', null, null),
    ).resolves.toBeUndefined();
  });
});
