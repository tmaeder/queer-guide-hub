import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from './fixture';
import { applyImport, loadImportMatches, previewImport } from '../service';
import { type RecordData } from '../plan';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
vi.mock('@/integrations/supabase/untyped', () => ({ untypedFrom: vi.fn(), untypedRpc: vi.fn() }));
vi.mock('@/hooks/useManagedOptions', () => ({ invalidateManagedOptions: vi.fn() }));
let records: RecordData[], actor: string, writes: number, onUpdate: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  records = [{ id: 'one', name: 'Before', description: '', updated_at: 'v1' }];
  actor = 'admin';
  writes = 0;
  onUpdate = undefined;
  vi.mocked(supabase.auth.getUser).mockImplementation(
    async () => ({ data: { user: { id: actor } }, error: null }) as never,
  );
  vi.mocked(untypedFrom).mockImplementation(() => {
    let action = 'read',
      patch: RecordData = {},
      offset = 0,
      end = Infinity;
    const filters: Array<(r: RecordData) => boolean> = [];
    const query = {
      select: () => query,
      order: () => query,
      in: (key: string, values: string[]) => {
        filters.push((r) => values.includes(String(r[key])));
        return query;
      },
      eq: (key: string, value: unknown) => {
        filters.push((r) => r[key] === value);
        return query;
      },
      is: (key: string) => {
        filters.push((r) => r[key] == null);
        return query;
      },
      range: (from: number, to: number) => {
        offset = from;
        end = Math.min(to, from + 1);
        return query;
      },
      insert: (data: RecordData) => {
        action = 'insert';
        patch = data;
        return query;
      },
      update: (data: RecordData) => {
        action = 'update';
        patch = data;
        onUpdate?.();
        return query;
      },
      single: async () => {
        if (action === 'insert') {
          writes++;
          const row = { id: `new-${writes}`, ...patch };
          records.push(row);
          return { data: row, error: null };
        }
        const row = records.find((r) => filters.every((f) => f(r)));
        if (!row) return { data: null, error: { message: 'Conflict or denied' } };
        if (action === 'update') {
          writes++;
          Object.assign(row, patch);
        }
        return { data: structuredClone(row), error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        const matches = records.filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({
          data: structuredClone(matches.slice(offset, end + 1)),
          count: matches.length,
          error: null,
        }).then(resolve);
      },
    };
    return query as never;
  });
});
const sheet = {
  name: 'File',
  headers: ['ID', 'Name', 'Description'],
  rows: [
    ['one', 'After', 'Enriched'],
    ['two', 'New', 'Created'],
  ],
};
const options = {
  mode: 'upsert' as const,
  matchField: 'id',
  mapping: ['id', 'name', 'description'],
  clearBlanks: false,
};
describe('import execution', () => {
  it('reads all matching pages even when the server returns less than the requested size', async () => {
    records = Array.from({ length: 1007 }, (_, i) => ({ id: String(i), name: 'Same' }));
    expect(await loadImportMatches(config, 'name', ['Same'])).toHaveLength(1007);
  });
  it('previews without writes and applies exact deltas, retaining a supplied new ID', async () => {
    const preview = await previewImport(config, sheet, options);
    expect(writes).toBe(0);
    const results = await applyImport(
      config,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(results.map((r) => r.status)).toEqual(['updated', 'created']);
    expect(records[0]).toMatchObject({
      id: 'one',
      name: 'After',
      description: 'Enriched',
    });
    expect(records[1]).toMatchObject({ id: 'two', name: 'New', active: false });
    await expect(
      applyImport(config, preview, new Set(), new AbortController().signal, vi.fn()),
    ).rejects.toThrow(/already applied/);
  });
  it('rejects stale previews and stops subsequent rows', async () => {
    const preview = await previewImport(config, sheet, options);
    records[0].description = 'Someone else';
    const result = await applyImport(
      config,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.map((r) => r.status)).toEqual(['failed', 'cancelled']);
    expect(writes).toBe(0);
  });
  it('uses atomic column predicates when a change races the preflight read', async () => {
    const preview = await previewImport(config, sheet, options);
    onUpdate = () => {
      records[0].description = 'Concurrent';
    };
    const result = await applyImport(
      config,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('failed');
    expect(writes).toBe(0);
  });
  it('stops without writes if the account changes', async () => {
    const preview = await previewImport(config, sheet, options);
    actor = 'other';
    await expect(
      applyImport(config, preview, new Set(), new AbortController().signal, vi.fn()),
    ).rejects.toThrow(/account changed/);
    expect(writes).toBe(0);
  });
  it('supports excluding invalid rows and cancellation', async () => {
    const preview = await previewImport(config, sheet, options);
    const result = await applyImport(config, preview, new Set([2]), AbortSignal.abort(), vi.fn());
    expect(result).toMatchObject([{ row: 3, status: 'cancelled' }]);
    expect(writes).toBe(0);
  });
  it('uses the governed editor API and expected version for corrections', async () => {
    const save = vi.fn(async (_id, patch) => ({ ...records[0], ...patch }));
    const managed = {
      ...config,
      editorApi: { load: vi.fn(async () => structuredClone(records[0])), save },
    };
    const preview = await previewImport(managed, { ...sheet, rows: [sheet.rows[0]] }, options);
    await applyImport(managed, preview, new Set(), new AbortController().signal, vi.fn());
    expect(save).toHaveBeenCalledWith('one', { name: 'After', description: 'Enriched' }, 'v1');
    expect(writes).toBe(0);
  });
  it('preserves governed RPC save behavior', async () => {
    const managed = { ...config, editorRpc: { load: 'load_example', save: 'save_example' } };
    vi.mocked(untypedRpc).mockImplementation(
      async (name) =>
        ({
          data:
            name === 'load_example'
              ? structuredClone(records[0])
              : { ...records[0], name: 'After', description: 'Enriched' },
          error: null,
        }) as never,
    );
    const preview = await previewImport(managed, { ...sheet, rows: [sheet.rows[0]] }, options);
    const results = await applyImport(
      managed,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(results[0].status).toBe('updated');
    expect(untypedRpc).toHaveBeenCalledWith('save_example', {
      p_id: 'one',
      p_data: { name: 'After', description: 'Enriched' },
      p_locations: null,
      p_expected_updated_at: 'v1',
    });
    expect(writes).toBe(0);
  });
  it('uses the creation resolver without the interactive admin evidence waiver and applies remaining fields', async () => {
    records = [];
    const city = {
      ...config,
      fields: [
        ...config.fields,
        { name: 'country_id', label: 'Country ID', type: 'text' as const, group: 'basic' as const },
        { name: 'latitude', label: 'Latitude', type: 'number' as const, group: 'basic' as const },
        { name: 'longitude', label: 'Longitude', type: 'number' as const, group: 'basic' as const },
      ],
      createRpc: {
        fn: 'city_resolve_or_create',
        args: (data: RecordData) => ({ p_name: data.name, p_actor: 'admin' }),
      },
    };
    vi.mocked(untypedRpc).mockImplementation(async () => {
      records.push({
        id: 'created-city',
        name: 'New City',
        country_id: 'country',
        latitude: 12,
        longitude: 34,
        description: '',
        updated_at: 'v1',
      });
      return { data: [{ city_id: 'created-city', action: 'created' }], error: null } as never;
    });
    const preview = await previewImport(
      city,
      {
        name: 'Cities',
        headers: ['ID', 'name', 'country_id', 'latitude', 'longitude', 'description'],
        rows: [['', 'New City', 'country', '12', '34', 'Enriched city']],
      },
      {
        mode: 'create',
        matchField: 'id',
        clearBlanks: false,
        mapping: ['id', 'name', 'country_id', 'latitude', 'longitude', 'description'],
      },
    );
    const result = await applyImport(
      city,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('created');
    expect(records[0].description).toBe('Enriched city');
    expect(untypedRpc).toHaveBeenCalledWith('city_resolve_or_create', {
      p_name: 'New City',
      p_actor: 'table-import',
      p_source_slug: 'admin-table-import',
    });
  });
});
