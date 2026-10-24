/** Optional real PostgreSQL + PostgREST contract. See fixtures/README.md. */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from './fixture';
import { applyImport, loadImportMatches, previewImport } from '../service';
import { buildImportPlan } from '../plan';
const transport = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), getUser: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getUser: transport.getUser } },
}));
vi.mock('@/integrations/supabase/untyped', () => ({
  untypedFrom: transport.from,
  untypedRpc: transport.rpc,
}));
vi.mock('@/hooks/useManagedOptions', () => ({ invalidateManagedOptions: vi.fn() }));
const restUrl = process.env.QG_IMPORT_TEST_REST_URL;
const databaseUrl = process.env.QG_IMPORT_TEST_DATABASE_URL;
const psql = process.env.QG_IMPORT_TEST_PSQL ?? 'psql';
const enabled = !!restUrl && !!databaseUrl;
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const existingId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const newId = '00000000-0000-4000-8000-000000000003';
const secret = 'local-import-contract-only-not-a-production-secret';
const content = {
  ...config,
  tableName: 'import_contract_rows',
  writeCreatedBy: true,
  fields: [
    ...config.fields,
    { name: 'tags', label: 'Tags', type: 'tags' as const, group: 'basic' as const },
    { name: 'details', label: 'Details', type: 'json' as const, group: 'basic' as const },
  ],
};
function sql(statement: string): string {
  return execFileSync(
    psql,
    [
      '--dbname',
      databaseUrl!,
      '--set',
      'ON_ERROR_STOP=1',
      '--tuples-only',
      '--no-align',
      '--command',
      statement,
    ],
    { encoding: 'utf8' },
  ).trim();
}
function token() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      role: 'import_contract_actor',
      sub: owner,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
}
const options = {
  mode: 'upsert' as const,
  matchField: 'id',
  clearBlanks: false,
  mapping: ['id', 'name', 'description'],
};
let raceOnPatch = false;
describe.runIf(enabled)('real local database import contract', () => {
  beforeAll(() => {
    const rest = new URL(restUrl!),
      database = new URL(databaseUrl!);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(rest.hostname) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
      database.pathname !== '/qg_import_contract'
    )
      throw new Error('Only the named disposable loopback database is allowed.');
    const client = createClient(restUrl!, 'local-fixture-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${token()}` },
        fetch: async (input, init) => {
          if (raceOnPatch && init?.method === 'PATCH') {
            raceOnPatch = false;
            sql(
              `UPDATE import_contract_rows SET description='Concurrent writer' WHERE id='${existingId}'`,
            );
          }
          return fetch(String(input).replace('/rest/v1/', '/'), init);
        },
      },
    });
    transport.from.mockImplementation((table: string) => client.from(table));
    transport.rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
      client.rpc(name, args),
    );
    transport.getUser.mockResolvedValue({ data: { user: { id: owner } }, error: null });
  });
  beforeEach(() => {
    raceOnPatch = false;
    sql(
      `TRUNCATE import_contract_rows; INSERT INTO import_contract_rows(id,name,description,tags,details,created_by) VALUES ('${existingId}','Before','',ARRAY['a','b'],'{}','${owner}'),('${otherId}','Other owner','Private',ARRAY[]::text[],'{}','${other}');`,
    );
  });
  it('creates and corrects actual rows under RLS with the authenticated actor', async () => {
    const preview = await previewImport(
      content,
      {
        name: 'Data',
        headers: ['ID', 'Name', 'Description'],
        rows: [
          [existingId, 'Corrected', 'Correction'],
          [newId, 'Created', 'New row'],
        ],
      },
      options,
    );
    const result = await applyImport(
      content,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.map((r) => r.status)).toEqual(['updated', 'created']);
    expect(sql(`SELECT name FROM import_contract_rows WHERE id='${existingId}'`)).toBe('Corrected');
    expect(sql(`SELECT created_by FROM import_contract_rows WHERE id='${newId}'`)).toBe(owner);
  });
  it('enriches empty JSON and text without changing a populated name or false boolean', async () => {
    const preview = await previewImport(
      content,
      {
        name: 'Data',
        headers: ['ID', 'Name', 'Description', 'Details', 'Active'],
        rows: [[existingId, 'Do not replace', 'Enriched', '{"source":"upload"}', 'true']],
      },
      { ...options, mode: 'enrich', mapping: ['id', 'name', 'description', 'details', 'active'] },
    );
    const result = await applyImport(
      content,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('updated');
    expect(
      sql(
        `SELECT name || ':' || active::text || ':' || (details->>'source') FROM import_contract_rows WHERE id='${existingId}'`,
      ),
    ).toBe('Before:false:upload');
  });
  it('performs actual array and JSON compare-and-set updates', async () => {
    const preview = await previewImport(
      content,
      {
        name: 'Data',
        headers: ['ID', 'Tags', 'Details'],
        rows: [[existingId, '["c","d"]', '["new"]']],
      },
      { ...options, mode: 'update', mapping: ['id', 'tags', 'details'] },
    );
    const result = await applyImport(
      content,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('updated');
    expect(
      sql(
        `SELECT array_to_json(tags)::text || ':' || details::text FROM import_contract_rows WHERE id='${existingId}'`,
      ),
    ).toBe('["c","d"]:["new"]');
  });
  it('rejects a real database race after the preflight read', async () => {
    const preview = await previewImport(
      content,
      { name: 'Data', headers: ['ID', 'Description'], rows: [[existingId, 'Import value']] },
      { ...options, mode: 'update', mapping: ['id', 'description'] },
    );
    raceOnPatch = true;
    const result = await applyImport(
      content,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('failed');
    expect(sql(`SELECT description FROM import_contract_rows WHERE id='${existingId}'`)).toBe(
      'Concurrent writer',
    );
  });
  it('cannot read or overwrite another owner even with a forged preview', async () => {
    const rows = buildImportPlan(
      content,
      { name: 'Data', headers: ['ID', 'Name'], rows: [[otherId, 'Overwrite']] },
      { ...options, mode: 'update', mapping: ['id', 'name'] },
      [{ id: otherId, name: 'Other owner', created_by: other }],
    );
    const result = await applyImport(
      content,
      { actorId: owner, options, rows },
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('failed');
    expect(sql(`SELECT name FROM import_contract_rows WHERE id='${otherId}'`)).toBe('Other owner');
  });
  it('loads every matching row across an actual two-row API cap, with RLS-scoped counts', async () => {
    sql(
      `INSERT INTO import_contract_rows(name,created_by) SELECT 'Capped','${owner}' FROM generate_series(1,1007); INSERT INTO import_contract_rows(name,created_by) SELECT 'Capped','${other}' FROM generate_series(1,20);`,
    );
    const rows = await loadImportMatches(content, 'name', ['Capped']);
    expect(rows).toHaveLength(1007);
    expect(new Set(rows.map((r) => r.id)).size).toBe(1007);
    expect(rows.every((r) => r.created_by === owner)).toBe(true);
  }, 60000);
  it('uses governed read/save RPCs with a real expected-version condition', async () => {
    const managed = {
      ...content,
      editorRpc: { load: 'import_contract_read', save: 'import_contract_save' },
    };
    const preview = await previewImport(
      managed,
      { name: 'Data', headers: ['ID', 'Description'], rows: [[existingId, 'RPC correction']] },
      { ...options, mode: 'update', mapping: ['id', 'description'] },
    );
    const result = await applyImport(
      managed,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('updated');
    expect(sql(`SELECT description FROM import_contract_rows WHERE id='${existingId}'`)).toBe(
      'RPC correction',
    );
  });
  it('corrects legacy arrays containing quoted values, control characters and NULL elements', async () => {
    const prior = JSON.stringify([
      'comma,value',
      'quote"value',
      'slash\\value',
      'line\nbreak',
      null,
    ]).replaceAll("'", "''");
    sql(
      `UPDATE import_contract_rows SET tags=ARRAY(SELECT jsonb_array_elements_text('${prior}'::jsonb)) WHERE id='${existingId}'`,
    );
    const preview = await previewImport(
      content,
      { name: 'Data', headers: ['ID', 'Tags'], rows: [[existingId, '["fixed"]']] },
      { ...options, mode: 'update', mapping: ['id', 'tags'] },
    );
    const result = await applyImport(
      content,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('updated');
    expect(
      sql(`SELECT array_to_json(tags)::text FROM import_contract_rows WHERE id='${existingId}'`),
    ).toBe('["fixed"]');
  });
  it('enriches an existing JSON null instead of treating it as a conflicting SQL NULL', async () => {
    sql(`UPDATE import_contract_rows SET details='null'::jsonb WHERE id='${existingId}'`);
    const preview = await previewImport(
      content,
      { name: 'Data', headers: ['ID', 'Details'], rows: [[existingId, '{"source":"upload"}']] },
      { ...options, mode: 'enrich', mapping: ['id', 'details'] },
    );
    const result = await applyImport(
      content,
      preview,
      new Set(),
      new AbortController().signal,
      vi.fn(),
    );
    expect(result[0].status).toBe('updated');
    expect(
      sql(`SELECT details->>'source' FROM import_contract_rows WHERE id='${existingId}'`),
    ).toBe('upload');
  });
});
