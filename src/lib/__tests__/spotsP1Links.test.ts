import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const MIGRATION = 'supabase/migrations/99991795359695_spots_p1_links.sql';
const sql = readFileSync(MIGRATION, 'utf8')
  .replace(/--[^\n]*/g, '')
  .toLowerCase();
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
    expect(fn('spots_from_venue')).toMatch(
      /null::timestamptz, v\.organization_id\s*\)::public\.spots/,
    );
    expect(fn('spots_from_org')).toMatch(/null::timestamptz,\s*null::uuid\s*\)::public\.spots/);
    expect(fn('spots_sync')).toMatch(/parent_id = excluded\.parent_id/);
    expect(
      fn('spots_drift_check').match(
        /s\.created_at, null::timestamptz, s\.parent_id\)::public\.spots/g,
      ),
    ).toHaveLength(2);
  });

  it('links all five tables with the same FK action as organization_id', () => {
    for (const t of [
      'hotels',
      'marketplace_merchants',
      'marketplace_brands',
      'news_sources',
      'affiliate_partners',
    ]) {
      expect(sql).toContain(`'${t}'`);
    }
    expect(sql).toMatch(
      /add column spot_id uuid references public\.spots\(id\) on delete set null/,
    );
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
    expect(d).toMatch(
      /where c\.parent_id is not null\s+and \(p\.kind <> 'organization' or p\.parent_id is not null\)\)/,
    );
    // Stale links only where the org has a spot: the CI snapshot holds dangling org ids.
    expect(
      d.match(
        /spot_id is distinct from organization_id and exists \(select 1 from spots s where s\.id = organization_id\)/g,
      ),
    ).toHaveLength(5);
  });

  it('backfills spot_id only where the org has a spot (CI snapshot is a capped sample)', () => {
    expect(sql).toMatch(
      /set spot_id = organization_id where organization_id is not null '\s+'and exists \(select 1 from public\.spots s where s\.id = organization_id\)'/,
    );
  });

  it('aborts on inconsistent P1 links, a parent mismatch, and an incomplete backfill', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(
      /'bad_parents'\)::bigint, 0\) <> 0 or coalesce\(\(v ->> 'stale_links'\)::bigint, 0\) <> 0 then\s+raise exception/,
    );
    expect(verify).toMatch(
      /where s\.parent_id is distinct from v2\.organization_id;\s+if v_bad <> 0 then\s+raise exception/,
    );
    expect(verify).toMatch(/if v_linked <> v_eligible then\s+raise exception/);
    expect(verify).toMatch(/if v_eligible > 0 and v_linked = 0 then\s+raise exception/);
  });
});

describe('spots P1 lock order', () => {
  it('locks the five link tables before spots, inside a retry loop', () => {
    const loop = sql.slice(sql.indexOf('do $lock$'), sql.indexOf('$lock$;'));
    const links = loop.indexOf('lock table public.hotels');
    const spots = loop.indexOf('lock table public.spots in access exclusive mode');
    expect(links).toBeGreaterThan(-1);
    expect(spots).toBeGreaterThan(links);
    expect(loop).toMatch(/exception when lock_not_available then\s+perform pg_sleep/);
    expect(sql.indexOf('do $lock$')).toBeLessThan(
      sql.indexOf('alter table public.spots add column parent_id'),
    );
  });
});
