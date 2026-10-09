import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991791538336_flagged_geocode_cities_review.sql'),
  'utf8',
);
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

describe('flagged geocode cities review migration', () => {
  it('only the two rows filed under the wrong country merge across a border', () => {
    const crossing = [...code.matchAll(/\('[0-9a-f-]+', '[0-9a-f-]+', '([^']+)', true\)/g)].map(
      (m) => m[1],
    );
    expect(crossing.sort()).toEqual(['חדרה', '澳門 Macau'].sort());
  });

  it('merges go through merge_cities with the per-row cross-country flag', () => {
    expect(code).toContain('perform public.merge_cities(r.keep_id, r.drop_id, r.cross_country)');
    expect(code).not.toMatch(/delete\s+from\s+public\.cities/i);
  });

  it('renames keep the old label as an alias and assert it', () => {
    expect(code).toMatch(
      /insert into public\.city_aliases \(city_id, alias, locale\)\s+values \(r\.id, r\.old_name, null\)/,
    );
    expect(code).toMatch(/raise exception 'P3 failed/);
  });

  it('the eight unresolved rows must stay flagged', () => {
    expect(code).toMatch(
      /enrichment_status \? 'admin_unit_review'\) <> 8 then\s+raise exception 'P5 failed/,
    );
  });
});
