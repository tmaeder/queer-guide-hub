import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/99991795355506_spots_p1_links.sql';
const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '').toLowerCase();
const fn = (name: string) => {
  const i = sql.indexOf(`function public.${name}(`);
  expect(i, `${name} is defined`).toBeGreaterThan(-1);
  return sql.slice(i, sql.indexOf('$$;', sql.indexOf('as $$', i)));
};

describe('spots P1 migration', () => {
  it('adds parent_id without a foreign key (an FK failure would abort venue writes)', () => {
    expect(sql).toMatch(/alter table public\.spots add column parent_id uuid;/);
    expect(sql).not.toMatch(/parent_id uuid references/);
  });

  it('restates every function that builds a spots row, in the same file as the column', () => {
    expect(fn('spots_from_venue')).toMatch(/null::timestamptz, v\.organization_id\s*\)::public\.spots/);
    expect(fn('spots_from_org')).toMatch(/null::timestamptz,\s*null::uuid\s*\)::public\.spots/);
    expect(fn('spots_sync')).toMatch(/parent_id = excluded\.parent_id/);
    expect(fn('spots_drift_check').match(/s\.created_at, null::timestamptz, s\.parent_id\)::public\.spots/g)).toHaveLength(2);
  });

  it('links all five tables with the same FK action as organization_id', () => {
    for (const t of ['hotels', 'marketplace_merchants', 'marketplace_brands', 'news_sources', 'affiliate_partners']) {
      expect(sql).toContain(`'${t}'`);
    }
    expect(sql).toMatch(/add column spot_id uuid references public\.spots\(id\) on delete set null/);
    expect(sql).toMatch(/before insert or update of organization_id, spot_id on public\.%i/);
  });

  it('lets an explicit spot_id win over the organization_id derivation', () => {
    expect(fn('spots_link_from_org')).toMatch(
      /new\.organization_id is distinct from old\.organization_id\s+and new\.spot_id is not distinct from old\.spot_id/,
    );
  });

  it('checks parents and links in the nightly drift check', () => {
    const d = fn('spots_drift_check');
    expect(d).toMatch(/'bad_parents'/);
    expect(d).toMatch(/p\.id is null or p\.kind <> 'organization' or p\.parent_id is not null/);
    expect(d.match(/spot_id is distinct from organization_id/g)).toHaveLength(5);
  });

  it('aborts on drift and on an empty link backfill', () => {
    expect(sql).toMatch(/if \(v ->> 'drift_count'\)::int <> 0 then\s+raise exception/);
    expect(sql).toMatch(/if v_linked = 0 then\s+raise exception/);
    expect(sql).toMatch(/if v_parented <> \(select count\(\*\) from public\.venues where organization_id is not null\) then/);
  });
});
