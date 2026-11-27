import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nextEdition, type Festival } from '@/hooks/useFestivals';

const MIGRATION = 'supabase/migrations/99991795355942_festival_brands.sql';
// Comments stripped: the header quotes the rules being asserted.
const sql = readFileSync(MIGRATION, 'utf8')
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
  .toLowerCase();
const linker = sql.slice(
  sql.indexOf('create or replace function public.run_festival_brand_link'),
  sql.indexOf('create or replace view public.festivals_crawlable'),
);
const view = sql.slice(
  sql.indexOf('create or replace view public.festivals_crawlable'),
  sql.indexOf('insert into public.admin_automations'),
);
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('festival brands migration', () => {
  it('slices the linker, view and postconditions (positive control)', () => {
    for (const part of [linker, view, verify]) expect(part.length).toBeGreaterThan(150);
  });

  it('gates public reads of a brand like its editions', () => {
    expect(sql).toContain('drop policy if exists "public read festivals" on public.festivals');
    expect(sql).toMatch(
      /using \(not public\.location_is_high_risk\(country_id, city_id\) or \(select auth\.uid\(\)\) is not null\)/,
    );
  });

  it('gates the service-role crawler view and keeps it away from anon', () => {
    expect(view).toContain('not public.location_is_high_risk(f.country_id, f.city_id)');
    expect(view).toContain(
      'revoke all on public.festivals_crawlable from public, anon, authenticated',
    );
    expect(verify).toContain("has_table_privilege('anon', 'public.festivals_crawlable', 'select')");
  });

  it('only brands bounded, live, top-level editions that are not standing schedules', () => {
    for (const guard of [
      'e.festival_id is null',
      'e.duplicate_of_id is null',
      'e.parent_event_id is null',
      "not in ('recurrence', 'opening_hours')",
      "between interval '20 hours' and interval '62 days'",
    ]) {
      expect(linker).toContain(guard);
    }
  });

  it('keys a brand by name AND city', () => {
    expect(linker).toContain('where f.brand_key = v_key and f.city_id = r.city_id');
    expect(sql).toContain('on public.festivals (brand_key, city_id) where brand_key is not null');
  });

  it('keeps the linker off the public API', () => {
    expect(sql).toContain(
      'revoke all on function public.run_festival_brand_link(integer) from public, anon, authenticated',
    );
  });

  it('raises on every postcondition', () => {
    expect(verify.match(/raise exception 'p\d failed/g)?.length).toBe(6);
  });
});

describe('nextEdition', () => {
  const f = (dates: Array<[string, string | null]>): Festival => ({
    id: 'f',
    name: 'X',
    slug: 'x',
    festival_type: 'festival',
    description: null,
    website: null,
    city: null,
    country: null,
    editions: dates.map(([s, e], i) => ({
      id: String(i),
      slug: `e${i}`,
      title: `E${i}`,
      start_date: s,
      end_date: e,
      programme_size: null,
      venue_name: null,
    })),
  });
  const now = new Date('2027-09-10T12:00:00Z');

  it('returns an edition that is running now', () => {
    expect(nextEdition(f([['2027-09-08', '2027-09-12']]), now)?.id).toBe('0');
  });
  it('skips ended editions', () => {
    expect(
      nextEdition(
        f([
          ['2026-09-08', '2026-09-12'],
          ['2028-09-08', '2028-09-12'],
        ]),
        now,
      )?.id,
    ).toBe('1');
  });
  it('is null when every edition has ended', () => {
    expect(nextEdition(f([['2026-09-08', null]]), now)).toBeNull();
  });
});
