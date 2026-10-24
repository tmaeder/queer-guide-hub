import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const { rpcMock, maybeSingleMock, fromMock } = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  return {
    rpcMock: vi.fn(),
    maybeSingleMock,
    fromMock: vi.fn(() => ({ select: selectMock })),
  };
});

vi.mock('@/integrations/supabase/untyped', () => ({
  untypedRpc: rpcMock,
  untypedSupabase: { from: fromMock },
}));

import { landmarkContentType, landmarkFields } from '../landmark';
import { getContentType } from '@/config/contentTypes';

const MIGRATION = readdirSync(join(process.cwd(), 'supabase/migrations')).find((f) =>
  f.endsWith('_cms_landmarks_content_type.sql'),
)!;
const sql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

function arrayLiteral(name: string): string[] {
  const m = new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`).exec(sql);
  if (!m) throw new Error(`no ${name} in migration`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

function viewColumns(): string[] {
  const body =
    /create or replace view public\.cms_landmarks[\s\S]*?select([\s\S]*?)from public\.geo_places/.exec(
      sql,
    );
  if (!body) throw new Error('no cms_landmarks view in migration');
  return [...body[1].matchAll(/\b[pl]\.([a-z_0-9]+)/g)].map((x) => x[1]);
}

describe('landmarks content type', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    maybeSingleMock.mockReset();
    fromMock.mockClear();
  });

  it('is registered, reads the view and cannot create', () => {
    expect(getContentType('landmarks')).toBe(landmarkContentType);
    expect(landmarkContentType.tableName).toBe('cms_landmarks');
    expect(landmarkContentType.canCreate).toBe(false);
    expect(landmarkContentType.publicPath?.({ slug: 'tiergarten' })).toBe('/place/tiergarten');
  });

  it('saves through cms_landmark_save with the concurrency token', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'l1', address: 'A' }], error: null });
    const row = await landmarkContentType.editorApi!.save('l1', { address: 'A' }, '2026-01-01');
    expect(rpcMock).toHaveBeenCalledWith('cms_landmark_save', {
      p_id: 'l1',
      p_data: { address: 'A' },
      p_expected_updated_at: '2026-01-01',
    });
    expect(row).toEqual({ id: 'l1', address: 'A' });
  });

  it('surfaces a refused save instead of returning nothing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('changed by someone else') });
    await expect(landmarkContentType.editorApi!.save('l1', {}, null)).rejects.toThrow(
      'changed by someone else',
    );
  });

  it('refuses to create a landmark from the CMS', async () => {
    await expect(landmarkContentType.editorApi!.save(null, { name: 'x' }, null)).rejects.toThrow(
      /admin\/geography/,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('loads one landmark from the view and fails on a missing one', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'l1' }, error: null });
    await expect(landmarkContentType.editorApi!.load('l1')).resolves.toEqual({ id: 'l1' });
    expect(fromMock).toHaveBeenCalledWith('cms_landmarks');
    maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(landmarkContentType.editorApi!.load('nope')).rejects.toThrow(/No landmark/);
  });
});

describe('landmark fields agree with the migration', () => {
  const editable = [...arrayLiteral('v_spine_keys'), ...arrayLiteral('v_profile_keys')];
  const columns = viewColumns();

  it('parses the migration at all', () => {
    expect(editable.length).toBeGreaterThan(8);
    expect(columns).toContain('landmark_kind');
    expect(columns).toContain('updated_at');
  });

  it('every field is a column of cms_landmarks', () => {
    const missing = landmarkFields.map((f) => f.name).filter((n) => !columns.includes(n));
    expect(missing).toEqual([]);
  });

  it('every editable field is accepted by cms_landmark_save', () => {
    const refused = landmarkFields
      .filter((f) => !f.readOnly && !f.virtual)
      .map((f) => f.name)
      .filter((n) => !editable.includes(n));
    expect(refused).toEqual([]);
  });

  it('read-only fields stay out of the save whitelist', () => {
    const writable = landmarkFields
      .filter((f) => f.readOnly)
      .map((f) => f.name)
      .filter((n) => editable.includes(n));
    expect(writable).toEqual([]);
  });

  it('keeps base-table RLS in charge and the view staff-only', () => {
    expect(sql).toMatch(
      /create or replace view public\.cms_landmarks\s+with \(security_invoker = true\)/,
    );
    expect(sql).toMatch(/security invoker\s+set search_path/);
    expect(sql).toMatch(/revoke all on public\.cms_landmarks from anon, authenticated;/);
    expect(sql).toMatch(
      /revoke all on function public\.cms_landmark_save\(uuid, jsonb, timestamptz\) from public, anon;/,
    );
  });
});
