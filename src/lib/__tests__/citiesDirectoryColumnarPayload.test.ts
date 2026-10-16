import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991792192213 — the columnar `{countries, cols, rows}` payload.
 *
 * Over COMMENT-STRIPPED SQL, which is load-bearing: the migration's header quotes
 * every phrase asserted here, including the shapes it replaced, so an unstripped
 * `toContain` would pass against a deleted statement.
 */

const MIGRATION = '99991792192213_cities_directory_columnar_payload.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const fn = sql.slice(
  sql.indexOf('create or replace function public.cities_directory'),
  sql.indexOf('do $verify$'),
);
const verify = sql.slice(sql.indexOf('do $verify$'), sql.indexOf('$verify$;'));

const hook = readFileSync(join(process.cwd(), 'src/hooks/useCitiesDirectory.ts'), 'utf8');
const maps = readFileSync(join(process.cwd(), 'scripts/generate-country-maps.mjs'), 'utf8');
const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

describe('the columnar envelope', () => {
  it('ships countries, cols and rows', () => {
    for (const key of ["'countries',", "'cols',", "'rows',"]) {
      expect(fn).toContain(key);
    }
  });

  it('ships cols WITH the data, so consumers can decode by name', () => {
    // Dropping `cols` and letting clients index by constant is the one change that
    // turns a column insert into a silent, total corruption. See the header.
    expect(fn).toMatch(/'cols', jsonb_build_array\(/);
  });

  it('normalises the country block instead of repeating it per row', () => {
    // 212 distinct tuples were costing 2,673 kB across 16,206 rows.
    expect(fn).toMatch(/ctry as \(/);
    expect(fn).toMatch(/row_number\(\) over \(order by country_slug nulls last\) - 1 as ix/);
    expect(fn).toMatch(/left join ctry k on k\.country_id = r\.country_id/);
    // The row carries the INDEX, not the country fields.
    expect(fn).toMatch(/r\.high_risk, k\.ix\)/);
  });

  it('materialises rows, which is read twice', () => {
    // `ctry` and the row build both scan it; without `materialized` the whole join
    // runs twice.
    expect(fn).toContain('rows as materialized (');
  });

  it('orders on the aggregate, which the maps script pins on', () => {
    expect(fn).toMatch(
      /order by r\.venue_count desc, r\.population desc nulls last, r\.name asc\)/,
    );
  });

  it('drops the two columns no consumer reads', () => {
    const cols = fn.slice(fn.indexOf("'cols', jsonb_build_array("));
    expect(cols).not.toContain('name_local');
    expect(cols).not.toContain('name_local_lang');
  });

  it('carries forward every property 99991792192204 established', () => {
    expect(fn).toContain('hr as materialized (');
    expect(fn).toContain("where gp.id = c.id and gp.place_type = 'city'");
    expect(fn).toContain('(hr.country_id is not null) as high_risk');
    expect(fn).not.toMatch(/exists\s*\(\s*select 1 from hr/);
    expect(fn).not.toMatch(/in \(select .*from hr/);
  });
});

describe('postconditions', () => {
  it('every P1..P7 RAISES rather than merely being present', () => {
    // P1 x4, P2 x3, P3 x2, P4 x2, P5 x2, P6 x1, P7 x1. Asserting the condition is not
    // enough when the raise can be replaced with `null;` — a recorded survivor class.
    expect((verify.match(/raise exception/g) ?? []).length).toBe(15);
    for (const label of [
      'P1 failed',
      'P2 failed',
      'P3 failed',
      'P4 failed',
      'P5 failed',
      'P6 failed',
      'P7 failed',
    ]) {
      expect(verify).toContain(label);
    }
  });

  it('resolves column indexes FROM cols rather than hardcoding ordinals', () => {
    // Hardcoding `r.value->>17` inside the check would reproduce, in the check, the
    // brittleness `cols` exists to remove — and would then pass against a reordered
    // payload.
    expect(verify).toMatch(/min\(ord\) filter \(where col = 'id'\)\s+- 1/);
    expect(verify).toContain("jsonb_array_elements_text(v_p->'cols') with ordinality");
    expect(verify).not.toMatch(/r\.value->>\d+/);
  });

  it('asserts cols length equals every row length', () => {
    // The invariant that makes positional decoding safe at all.
    expect(verify).toMatch(/jsonb_array_length\(r\.value\) <> v_cols/);
  });

  it('asserts the dead columns are gone AND the live ones present', () => {
    // Absence alone would be satisfied by a payload that had lost half its fields.
    expect(verify).toMatch(/\?\| array\['name_local', 'name_local_lang'\]/);
    expect(verify).toMatch(/foreach v_col in array array\['id','slug','name'/);
  });

  it('derives cardinality live and refuses an empty payload', () => {
    expect(verify).toContain('select count(*) into v_expected');
    expect(verify).not.toMatch(/v_rows\s*<>\s*\d/);
    expect(verify).not.toMatch(/\b16206\b/);
    expect(verify).toContain('directory is empty');
  });

  it('refuses a dangling country index, and proves the lookup is non-empty', () => {
    expect(verify).toMatch(/dangling country indexes|country index with no entry/);
    expect(verify).toContain('the country lookup is empty');
  });

  it('asserts the row order', () => {
    expect(verify).toMatch(/lag\(\(r\.value->>ix_vc\)::int\) over \(order by r\.ordinality\)/);
  });

  it('compares high_risk against the EXISTS form in ONE statement', () => {
    expect(verify).toMatch(/\(r\.value->>ix_hr\)::boolean <> exists \(/);
    expect(verify).toContain('hr as materialized (');
  });

  it('is not short-circuited', () => {
    expect(verify).not.toMatch(/where false/i);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    expect(verify).not.toMatch(/v_(bad|disagree)\s+int\s*:=/);
  });
});

describe('every consumer decodes the new shape', () => {
  it('the hook decodes by name and throws on a missing column', () => {
    expect(hook).toContain('function columnLookup(');
    expect(hook).toMatch(/payload has no "\$\{col\}" column/);
    expect(hook).toContain("requireColumn('country')");
    // Flat-row reads are allowed ONLY inside the named legacy shim, which exists for
    // the db-push/Pages deploy race. Outside it they would mean a stale decode path
    // silently returning undefined for every field.
    const legacyStart = hook.indexOf('function decodeLegacyFlatRows');
    const legacyEnd = hook.indexOf('export function decodeCitiesDirectory');
    expect(legacyStart).toBeGreaterThan(0);
    expect(legacyEnd).toBeGreaterThan(legacyStart);
    const live = hook.slice(0, legacyStart) + hook.slice(legacyEnd);
    expect(live).not.toMatch(/\br\.country_slug|\br\.continent_code|\brow\.venue_count/);
    // The shim must carry its removal condition, or it becomes permanent by default.
    expect(hook).toMatch(/REMOVE once 99991792192213 is applied/);
  });

  it('the hook resolves the country through the lookup', () => {
    expect(hook).toMatch(/lookup\[countryIx\]/);
    // A dangling index must degrade to "no country", not throw on one bad row.
    expect(hook).toMatch(/countryIx === null \|\| countryIx === undefined/);
  });

  it('the maps script decodes by name too', () => {
    // It reads the RPC directly, so it breaks independently of the hook.
    expect(maps).toMatch(/payload\?\.cols \?\? \[\]/);
    expect(maps).toMatch(/payload has no "\$\{col\}" column/);
    expect(maps).toMatch(/countryLookup\[row\[ix\.country\]\]\?\.slug/);
    expect(maps).not.toMatch(/const cities = await dirRes\.json\(\)/);
  });

  it('the health watcher counts rows from the envelope, not from .length', () => {
    // `JSON.parse(text)?.length` on an object is `undefined`, which this gate reports
    // as "returned no rows" — a hard fail on a perfectly healthy directory.
    const section = health.slice(
      health.indexOf('rpc/cities_directory'),
      health.lastIndexOf('process.exit(1)'),
    );
    expect(section).toMatch(/Array\.isArray\(parsed\?\.rows\) \? parsed\.rows\.length : null/);
    expect(section).not.toMatch(/JSON\.parse\(text\)\?\.length/);
  });
});
