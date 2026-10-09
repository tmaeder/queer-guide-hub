import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two migrations, one rule: an Ortsteil is not a city.
 *
 *   - `99991791576384_city_locality_resolves_to_municipality.sql` patches
 *     `city_resolve_or_create` (every city creator's only door) with a locality
 *     arm, and `commit_city_staging_item` so GeoNames PPLX may match but never
 *     create.
 *   - `99991791575994_delete_hinterzarten_placeholder_city.sql` removes the
 *     placeholder that prompted it, in the same order the 2026-10-01 non-place
 *     delete established.
 *
 * Assertions run over COMMENT-STRIPPED SQL: both headers quote the phrases
 * being asserted, so an unstripped `toContain` would pass with the statement
 * deleted.
 */

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8');
const strip = (sql: string) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

const LOCALITY_RAW = read('99991791576384_city_locality_resolves_to_municipality.sql');
const LOCALITY = strip(LOCALITY_RAW);
const DELETE = strip(read('99991791575994_delete_hinterzarten_placeholder_city.sql'));

describe('locality arm in city_resolve_or_create', () => {
  const arm = LOCALITY.slice(LOCALITY.indexOf('$ins$'), LOCALITY.lastIndexOf('$ins$'));

  it('patches the live body, never restates it', () => {
    expect(LOCALITY).toMatch(/pg_get_functiondef\('public\.city_resolve_or_create\(/);
    expect(LOCALITY).not.toMatch(/create or replace function public\.city_resolve_or_create/i);
    expect(LOCALITY).toMatch(/exactly once in city_resolve_or_create/);
  });

  it('runs before the name arms, so a same-named city elsewhere cannot win', () => {
    // The anchor is itself a SQL comment inside a string, so read it unstripped.
    expect(LOCALITY_RAW).toContain("v_arm_anchor  text := '  -- (c)-(f) Name arms.");
    expect(LOCALITY).toMatch(/\$ins\$ \|\| v_arm_anchor\)/);
  });

  it('never fires on a bare name: QID, or name AND coordinates within radius', () => {
    expect(arm).toMatch(/l\.locality_qid = btrim\(p_wikidata_qid\)/);
    expect(arm).toMatch(
      /l\.locality_key = v_key AND p_lat IS NOT NULL AND p_lng IS NOT NULL\s+AND public\.haversine_m\(p_lat, p_lng, l\.anchor_lat, l\.anchor_lng\) <= l\.radius_m/,
    );
  });

  it('answers with the municipality, or refuses — it never falls through to create', () => {
    expect(arm).toMatch(/RETURN QUERY SELECT v_muni, 'matched', 'locality_of_municipality'/);
    expect(arm).toMatch(/'locality_of_unresolved_municipality'/);
    // Both outcomes RETURN inside the FOUND branch.
    const found = arm.slice(arm.indexOf('IF FOUND THEN'));
    expect((found.match(/RETURN;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('postconditions probe behaviour with a write-proof call and a far-away mirror', () => {
    const verify = LOCALITY.slice(LOCALITY.indexOf('$verify$'));
    expect(verify).toMatch(/p_name => 'Alpersbach'[\s\S]*?p_allow_create => false/);
    expect(verify).toMatch(/is distinct from 'locality_of_municipality'[\s\S]*?raise exception/);
    expect(verify).toMatch(/p_name => 'Windeck'[\s\S]*?p_lat => 50\.77/);
    expect(verify).toMatch(/if v_r\.match_type = 'locality_of_municipality' then\s+raise exception/);
  });

  it('seeds Hinterzarten against its Wikidata municipality, coordinate-gated', () => {
    expect(LOCALITY).toMatch(/'Hinterzarten', 'Q515356', 47\.907778, 8\.100833, 9000/);
    for (const n of ['Alpersbach', 'Erlenbruck', 'Windeck', 'Oberzarten', 'Bruderhalde']) {
      expect(LOCALITY).toContain(`('${n}',`);
    }
  });
});

describe('GeoNames PPLX may match, never create', () => {
  it('passes p_allow_create false for PPLX and names the reason', () => {
    expect(LOCALITY).toMatch(
      /p_allow_create {5}=> upper\(coalesce\(v_meta->>''feature_code'', ''''\)\) <> ''PPLX''/,
    );
    expect(LOCALITY).toContain("''geonames_pplx_locality''");
  });
});

describe('Hinterzarten placeholder delete', () => {
  const at = (s: string) => {
    const i = DELETE.indexOf(s);
    expect(i, s).toBeGreaterThan(-1);
    return i;
  };

  it('targets exactly the reviewed id', () => {
    expect(DELETE).toContain("('4c3590e0-7cb8-4764-878c-dedcf431e6f5'::uuid)");
  });

  it('aborts when the row gained identity or content, no-ops when already gone', () => {
    expect(DELETE).toMatch(/OR c\.wikidata_qid IS NOT NULL/);
    expect(DELETE).toMatch(/EXISTS \(SELECT 1 FROM public\.venues v WHERE v\.city_id = c\.id\)/);
    expect(DELETE).toMatch(/IF v_bad > 0 THEN\s+RAISE EXCEPTION/);
    expect(DELETE).toMatch(/IF v_present = 0 THEN[\s\S]*?RETURN;/);
  });

  it('snapshots, then clears pointers, then deletes — in that order', () => {
    const snap = at('INSERT INTO public.nonplace_city_deletion_audit');
    const unlink = at('UPDATE public.personalities SET city_id = NULL');
    const del = at('DELETE FROM public.cities WHERE id IN');
    expect(snap).toBeLessThan(unlink);
    expect(unlink).toBeLessThan(del);
  });

  it('asserts no dangling personality pointer and no surviving spine row', () => {
    expect(DELETE).toMatch(/IF v_personal <> 0 THEN RAISE EXCEPTION/);
    expect(DELETE).toMatch(/IF v_spine <> 0 THEN RAISE EXCEPTION/);
  });
});
