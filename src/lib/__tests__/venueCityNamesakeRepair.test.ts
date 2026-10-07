import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791358024: venues linked to a same-name city far (>100 km) from
 * their own coordinates are relinked only when their own city text names
 * exactly one nearby city, otherwise detached (city_id := NULL) with the
 * country corrected only where the nearby cities agree on one.
 *
 * Assertions read comment-stripped SQL: the header quotes the rejected
 * "relink to the nearest city" rule, which would satisfy a raw toContain.
 */

const raw = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '99991791358024_venue_city_namesake_repair.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const selection = sql.slice(sql.indexOf('create temp table _vcr'), sql.indexOf('update public.venues'));
const relink = sql.slice(sql.indexOf("r.action = 'relink'") - 900, sql.indexOf("r.action = 'relink'") + 60);
const detachStart = sql.indexOf('set city_id = null');
const detach = sql.slice(detachStart, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('venue city namesake repair', () => {
  it('selects only venues > 100 km from their city with another city within 25 km', () => {
    expect(selection).toMatch(/b\.km > 100\b/);
    expect(selection).toMatch(/<= 25000\b/);
    expect(selection).toContain('c2.latitude = b.lat and c2.longitude = b.lng');
  });

  it('relinks only on exactly ONE name-corroborated, non-tmp candidate', () => {
    expect(selection).toContain("case when a.n_name = 1 then 'relink' else 'detach' end");
    expect(selection).toContain("c.slug not like 'tmp-%'");
    expect(selection).not.toMatch(/order by[^;]*haversine/i);
  });

  it('corrects the country only when all nearby cities agree on one', () => {
    expect(selection).toContain('case when a.n_countries = 1 then a.one_country end');
    expect(detach).toContain('country_id = coalesce(r.new_country_id, v.country_id)');
    expect(detach).toContain('needs_attention = case when r.new_country_id is null then true');
  });

  it('guards every write on the venue still pointing at the city the rule read', () => {
    expect((sql.match(/and v\.city_id = r\.old_city_id;/g) ?? []).length).toBe(2);
    expect(relink).toContain('set city_id = r.new_city_id');
  });

  it('clears state only when it came from the wrong city', () => {
    expect(
      (sql.match(/state = case when v\.state is not distinct from r\.old_region then null else v\.state end/g) ?? [])
        .length,
    ).toBe(2);
  });

  it('stamps a reversible record in both arms', () => {
    expect((sql.match(/'city_namesake_repair', jsonb_build_object\(/g) ?? []).length).toBe(2);
    expect((sql.match(/'from_city_id', r\.old_city_id/g) ?? []).length).toBe(2);
  });

  it('asserts four hard postconditions including the safety gate', () => {
    expect((verify.match(/if v_bad <> 0 then\s+raise exception/g) ?? []).length).toBe(4);
    expect(verify).toContain('public.location_is_high_risk(v.country_id, v.city_id)');
    expect(verify).toContain('and not v.safety_gated');
    expect(verify).not.toMatch(/where false|if \(?false/);
  });
});
