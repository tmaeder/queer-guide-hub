import { beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from './fixture';
import { applyImport, previewImport } from '../service';
import type { RecordData } from '../plan';
const transport = vi.hoisted(() => ({ from: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: transport.getUser } },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: transport.from,
  untypedRpc: vi.fn(),
}));
vi.mock('@/hooks/useManagedOptions', () => ({ invalidateManagedOptions: vi.fn() }));
let instance = 0;
let rows: RecordData[], patches: Array<{ url: URL; body: RecordData }>;
beforeEach(() => {
  rows = [
    {
      id: 'one',
      name: 'Before',
      tags: ['a', 'b'],
      details: { note: 'old' },
      updated_at: '2026-10-23T00:00:00Z',
    },
  ];
  patches = [];
  transport.getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  const client = createClient('http://127.0.0.1:49999', 'local-test-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: `import-http-${++instance}`,
    },
    global: {
      fetch: async (request, init) => {
        const url = new URL(String(request));
        const headers = new Headers(init?.headers);
        const method = init?.method ?? 'GET';
        if (method === 'PATCH') {
          const body = JSON.parse(String(init?.body)) as RecordData;
          patches.push({ url, body });
          Object.assign(rows[0], body);
          return new Response(JSON.stringify(rows[0]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (headers.get('accept')?.includes('vnd.pgrst.object'))
          return new Response(JSON.stringify(rows[0]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        const offset = Number(url.searchParams.get('offset') ?? 0);
        return new Response(JSON.stringify(rows.slice(offset, offset + 1)), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-range': `${offset}-${offset}/${rows.length}`,
          },
        });
      },
    },
  });
  transport.from.mockImplementation((table: string) => client.from(table));
});
it('uses actual PostgREST serialization for atomic array, JSON and version predicates', async () => {
  const content = {
    ...config,
    fields: [
      ...config.fields,
      { name: 'tags', label: 'Tags', type: 'tags' as const, group: 'basic' as const },
      { name: 'details', label: 'Details', type: 'json' as const, group: 'basic' as const },
    ],
  };
  const preview = await previewImport(
    content,
    {
      name: 'Sheet',
      headers: ['ID', 'Tags', 'Details'],
      rows: [['one', '["c"]', '{"note":"new"}']],
    },
    { mode: 'update', matchField: 'id', clearBlanks: false, mapping: ['id', 'tags', 'details'] },
  );
  const result = await applyImport(
    content,
    preview,
    new Set(),
    new AbortController().signal,
    vi.fn(),
  );
  expect(result[0].status).toBe('updated');
  expect(patches).toHaveLength(1);
  expect(patches[0].url.searchParams.get('id')).toBe('eq.one');
  expect(patches[0].url.searchParams.get('tags')).toBe('eq.{"a","b"}');
  expect(patches[0].url.searchParams.get('details')).toBe('eq.{"note":"old"}');
  expect(patches[0].url.searchParams.get('updated_at')).toBe('eq.2026-10-23T00:00:00Z');
  expect(patches[0].body).toMatchObject({ tags: ['c'], details: { note: 'new' } });
});

it('serializes PostgreSQL NULL and literal newlines without JSON array escaping', async () => {
  rows[0].tags = ['line\nbreak', null];
  const content = {
    ...config,
    fields: [
      ...config.fields,
      { name: 'tags', label: 'Tags', type: 'tags' as const, group: 'basic' as const },
    ],
  };
  const preview = await previewImport(
    content,
    { name: 'Data', headers: ['ID', 'Tags'], rows: [['one', '["fixed"]']] },
    { mode: 'update', matchField: 'id', clearBlanks: false, mapping: ['id', 'tags'] },
  );
  const result = await applyImport(
    content,
    preview,
    new Set(),
    new AbortController().signal,
    vi.fn(),
  );
  expect(result[0].status).toBe('updated');
  expect(patches[0].url.searchParams.get('tags')).toBe('eq.{"line\nbreak",NULL}');
});

it('guards either null JSON representation without relaxing record identity', async () => {
  rows[0].details = null;
  const content = {
    ...config,
    fields: [
      ...config.fields,
      { name: 'details', label: 'Details', type: 'json' as const, group: 'basic' as const },
    ],
  };
  const preview = await previewImport(
    content,
    { name: 'Data', headers: ['ID', 'Details'], rows: [['one', '{"source":"upload"}']] },
    { mode: 'enrich', matchField: 'id', clearBlanks: false, mapping: ['id', 'details'] },
  );
  const result = await applyImport(
    content,
    preview,
    new Set(),
    new AbortController().signal,
    vi.fn(),
  );
  expect(result[0].status).toBe('updated');
  expect(patches[0].url.searchParams.get('or')).toBe('(details.is.null,details.eq.null)');
  expect(patches[0].url.searchParams.get('id')).toBe('eq.one');
  expect(patches[0].url.searchParams.get('updated_at')).toBe('eq.2026-10-23T00:00:00Z');
});
