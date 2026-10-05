import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 99991791233840 makes region_code part of a city's identity, so Portland,
 * Maine and Portland, Oregon can both exist. Every property below is one a
 * later CREATE OR REPLACE could quietly undo:
 *
 *  - the three unique keys carry coalesce(region_code, '');
 *  - among same-name cities, population NEVER decides (that is how
 *    Springfield MO became Springfield VT);
 *  - a region hint alone never mints a second city — venues.state is
 *    near-random on this corpus — only an admin or coordinates > 50 km from
 *    every candidate do;
 *  - the resolver refuses a bare name when several same-name cities exist.
 *
 * Assertions run over comment-stripped SQL: the header quotes several of the
 * phrases being asserted, which would make a raw toContain vacuous.
 */

const FILE = join(
  process.cwd(),
  'supabase',
  'migrations',
  '99991791233840_city_region_identity_key.sql',
);
const raw = readFileSync(FILE, 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const between = (from: string, to: string) => {
  const a = sql.indexOf(from);
  const b = sql.indexOf(to, a + from.length);
  return a >= 0 && b > a ? sql.slice(a, b) : '';
};

const pick = between('create or replace function public.city_region_pick', '$fn$;');
const resolver = between(
  'create or replace function public.city_resolve_or_create',
  'END; $function$;',
);
const patches = between('do $patch$', '$patch$;');
const verify = between('do $verify$', '$verify$;');

describe('city region identity key', () => {
  it('slices every section it asserts on', () => {
    for (const [name, s] of Object.entries({ pick, resolver, patches, verify })) {
      expect(s.length, `${name} slice is empty — anchors moved`).toBeGreaterThan(200);
    }
  });

  it('puts region_code into all three unique keys, under their old names', () => {
    for (const idx of [
      /create unique index idx_cities_name_country_unique\s+on public\.cities \(lower\(name\), country_id, coalesce\(region_code, ''\)\)/,
      /create unique index cities_country_canonical_key_uniq\s+on public\.cities \(country_id, coalesce\(region_code, ''\), canonical_key\)/,
      /create unique index uk_cities_country_name_active\s+on public\.cities \(country_id, coalesce\(region_code, ''\), name_normalized\)\s+where duplicate_of_id is null/,
    ]) {
      expect(sql).toMatch(idx);
    }
  });

  it('never breaks a tie by population', () => {
    expect(pick).not.toMatch(/order by[^;]*population/i);
    expect(resolver).not.toMatch(/order by[^;]*population/i);
    // Every replacement text in the patch block drops the ORDER BY.
    const replacements = patches.match(/\$n\d\$[\s\S]*?\$n\d\$/g) ?? [];
    expect(replacements).toHaveLength(4);
    for (const r of replacements) expect(r).not.toMatch(/order by[^;]*population/i);
  });

  it('calls several same-name cities with no region ambiguous', () => {
    // Scoped to the no-region branch only: the same if/else shape recurs at
    // the end of the function, which would satisfy an unbounded slice.
    const noRegion = pick.slice(
      pick.indexOf('if p_region_code is null then'),
      pick.indexOf('select count(*) filter'),
    );
    expect(noRegion.length).toBeGreaterThan(50);
    expect(noRegion).toMatch(/if v_n = 1 then\s+return query select v_one, 'match'::text;\s+else\s+return query select null::uuid, 'ambiguous'::text;/);
  });

  it('mints a twin only with corroboration, never on a hint alone', () => {
    const tail = pick.slice(pick.indexOf('if p_allow_twin then'));
    expect(tail).toMatch(/if p_allow_twin then\s+return query select null::uuid, 'twin'/);
    // Coordinates must be present on BOTH sides and > 50 km from EVERY candidate.
    expect(tail).toMatch(/bool_and\(s\.latitude is not null and s\.longitude is not null\s+and public\.haversine_m\(p_lat, p_lng, s\.latitude, s\.longitude\) > 50000\)/);
    // Without corroboration a single candidate is still returned (old behaviour).
    expect(tail).toMatch(/if v_n = 1 then\s+return query select v_one, 'match'::text;/);
    // Only the admin actor bypasses the coordinate test.
    expect(resolver).toContain("v_admin       boolean := (p_actor = 'admin');");
  });

  it('lookups never create a twin', () => {
    expect(sql).toMatch(/city_region_pick\(v_ids, v_code, null, null, false\)/);
  });

  it('routes all four resolver name arms through the pick rule and refuses ambiguity', () => {
    const calls = resolver.match(/city_region_pick\(v_ids, v_region_code, p_lat, p_lng, v_admin\)/g) ?? [];
    expect(calls).toHaveLength(4);
    const refusals = resolver.match(/'refused', '\w+', 0::numeric, 'ambiguous_region'/g) ?? [];
    expect(refusals).toHaveLength(4);
    // No LIMIT 1 left on a name arm.
    const arms = resolver.slice(resolver.indexOf("canonical_key = v_key"), resolver.indexOf('v_postal := '));
    expect(arms).not.toMatch(/LIMIT 1/);
  });

  it('re-probes a unique_violation in the same region', () => {
    const handler = resolver.slice(resolver.indexOf('EXCEPTION WHEN unique_violation'));
    expect(handler.match(/coalesce\(c\.region_code, ''\) = coalesce\(v_region_code, ''\)/g)).toHaveLength(2);
  });

  it('patches each target exactly once, or aborts', () => {
    expect(patches).toMatch(/<> 1 then\s+raise exception 'patch target not found exactly once/);
    for (const fn of [
      'commit_venue_staging_item(uuid,text)',
      'commit_event_staging_item(uuid,text)',
      'resolve_city_and_country(text,text)',
    ]) {
      expect(patches).toContain(`'public.${fn}'`);
    }
  });

  it('proves the behaviour on live data and rolls the probe back', () => {
    expect(verify).toContain("'__probe_rollback__'");
    expect(verify).toMatch(/if sqlerrm <> '__probe_rollback__' then raise; end if;/);
    for (const k of ['plain', 'hint_only', 'twin', 'after_plain', 'after_or']) {
      expect(verify).toContain(`jsonb_build_object('${k}', v_j)`);
    }
    expect(verify).toContain("(v_res #>> '{after_plain,reason}')   is distinct from 'ambiguous_region'");
    expect(verify).toContain("(v_res #>> '{hint_only,city_id}')    is distinct from v_or::text");
    expect(verify).toContain("raise exception 'P3 failed: %', v_res;");
    expect(verify).toContain("raise exception 'P4 failed: probe city survived';");
  });

  it('keeps both helpers away from anon', () => {
    expect(sql).toMatch(/revoke all on function public\.city_region_pick\([^)]*\) from public, anon, authenticated;/);
    expect(sql).toMatch(/revoke all on function public\.city_pick_in_country\([^)]*\) from public, anon, authenticated;/);
  });
});
