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

import { logAdminGeoEdit, logCmsAudit } from '../admin-audit';
import { formatAction, formatRelativeTime } from '../audit-format';

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

describe('logCmsAudit', () => {
  it('writes one cms_audit_log row per id with the actor', async () => {
    state.authUser = { id: 'u-9' };
    await logCmsAudit('venues', ['a', 'b'], 'bulk_update');
    expect(state.calls[0].table).toBe('cms_audit_log');
    const rows = state.calls[0].chain.find((s) => s.method === 'insert')?.args[0] as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      source_table: 'venues',
      source_id: 'a',
      action: 'bulk_update',
      actor_id: 'u-9',
    });
  });

  it('is a no-op for an empty id list', async () => {
    await logCmsAudit('venues', [], 'bulk_update');
    expect(state.calls).toHaveLength(0);
  });

  it('caps at 200 rows', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `id-${i}`);
    await logCmsAudit('events', ids, 'bulk_delete');
    const rows = state.calls[0].chain.find((s) => s.method === 'insert')?.args[0] as unknown[];
    expect(rows).toHaveLength(200);
  });

  it('never throws on auth failure', async () => {
    state.authError = new Error('auth down');
    await expect(logCmsAudit('venues', ['x'], 'bulk_update')).resolves.toBeUndefined();
  });
});

describe('audit-format', () => {
  it('humanizes snake_case actions', () => {
    expect(formatAction('workflow_draft_to_review')).toBe('Workflow Draft To Review');
    expect(formatAction('bulk_update')).toBe('Bulk Update');
  });

  it('formats relative time', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
    expect(formatRelativeTime(new Date(Date.now() - 2 * 3600 * 1000).toISOString())).toBe('2h ago');
  });
});
