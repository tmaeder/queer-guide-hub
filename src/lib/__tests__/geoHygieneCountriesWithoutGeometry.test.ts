/**
 * Guards 99991790515886_geo_hygiene_countries_without_geometry.sql and the
 * health-script probe that reads it.
 *
 * The invariant: a country holding venues or events must have either its own
 * boundary polygon or a derived sovereign parent. Without one, `geo_country_at`
 * resolves nothing inside it and every row under that country reports as a
 * containment mismatch that is not one.
 *
 * It used to be an e2e test that had never passed — wrong role AND wrong keys —
 * and a blanket `test.skip(!ANON_KEY)` hid both. This file guards the three
 * pieces of the real fix: the function returns the quantity, the sentinel gates
 * on it, and the dead e2e test is gone rather than left skipped.
 *
 * Assertions run over COMMENT-STRIPPED SQL. The migration header quotes the
 * broken assertions and both key names verbatim, so an unstripped `toContain`
 * is satisfied by the prose while the statement is missing.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991790515886_geo_hygiene_countries_without_geometry';
const DIR = join(process.cwd(), 'supabase/migrations');

function migrationSource(): string {
  const file = readdirSync(DIR).find((f) => f.startsWith(MIGRATION));
  if (!file) throw new Error(`migration ${MIGRATION} not found in ${DIR}`);
  return readFileSync(join(DIR, file), 'utf8');
}

const raw = migrationSource();
/** Line-start comments only — a mid-line `--` may sit inside a literal. */
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');
const body = sql.split('do $verify$')[0];
const verify = sql.slice(sql.indexOf('do $verify$'));

const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
const spec = readFileSync(join(process.cwd(), 'e2e/geo-boundaries.spec.ts'), 'utf8');

/**
 * The spec's executable lines only. Its comment now explains where the invariant
 * went and quotes both `geo_hygiene_stats` and `test.skip(!ANON_KEY)` verbatim —
 * so a `not.toContain` over the raw file fails on correct code, which is what the
 * first draft of this test did. Assert on what RUNS.
 */
const specCode = spec
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

/** The health script's own comments quote the key name, so strip them too. */
const healthCode = health
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

describe('geo_hygiene_stats gains the containment-resolvability quantity', () => {
  it('returns both the numerator and its denominator', () => {
    expect(body).toContain("'countries_without_geometry'");
    // The denominator is not decoration: a zero numerator is equally true of a
    // corpus with no content at all.
    expect(body).toContain("'countries_holding_content'");
  });

  it('defines the invariant as polygon OR derived parent, not polygon alone', () => {
    // Territories like RE, MQ, GP and BQ have NO polygon of their own and are
    // resolvable only through geo_country_parent. Requiring a polygon would
    // report all four as defects.
    expect(body).toMatch(/not exists\s*\([\s\S]{0,200}geo_boundaries b/);
    expect(body).toMatch(/not exists\s*\([\s\S]{0,160}geo_country_parent p/);
  });

  it('counts with EXISTS rather than per-country aggregates', () => {
    // A count(*) per country would scan venues and events once per row. Measured
    // at 3.9ms with EXISTS, against an 8s PostgREST statement_timeout.
    expect(body).toMatch(/exists \(select 1 from public\.venues v where v\.country_id = c\.id\)/);
    expect(body).toMatch(/exists \(select 1 from public\.events e where e\.country_id = c\.id\)/);
    expect(body).not.toMatch(/select count\(\*\) from public\.venues v where v\.country_id/);
  });

  it('keeps the function SECURITY DEFINER with a pinned search_path', () => {
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path to 'public'/i);
  });

  it('re-applies the grant and revokes anon, rather than trusting the replace', () => {
    expect(body).toMatch(/revoke all on function public\.geo_hygiene_stats\(\) from public, anon;/);
    expect(body).toMatch(
      /grant execute on function public\.geo_hygiene_stats\(\) to authenticated, service_role;/,
    );
    // Never granted to anon — a SECURITY DEFINER aggregate granted broadly is
    // granted to every visitor.
    expect(body).not.toMatch(/grant execute on function public\.geo_hygiene_stats\(\)[^;]*anon/);
  });
});

describe('the migration proves the restatement rather than trusting it', () => {
  it('asserts every pre-existing key survived, behaviourally', () => {
    // CREATE OR REPLACE restates a 70-line body. A dropped key would silently
    // blind whichever branch of the health script reads it.
    for (const k of [
      'boundary_rows',
      'boundary_cells',
      'boundary_iso_codes',
      'containment',
      'containment_total',
      'city_coord_defects',
      'city_coord_defects_with_content',
      'integrity_violations',
      'address_queue',
      'findings_age_hours',
    ])
      expect(verify).toContain(`'${k}'`);
    expect(verify).toMatch(/LOST pre-existing key/);
  });

  it('gates the invariant at zero rather than baselining it', () => {
    // Measured 0 of 191 on prod before the migration was written, which is what
    // makes a hard gate safe instead of a baseline that ships red.
    expect(verify).toMatch(/if v_without <> 0 then/);
    expect(verify).not.toMatch(/v_without >\s*\d/);
  });

  it('refuses a zero measured over an empty corpus', () => {
    expect(verify).toMatch(/if v_holding < 150 then/);
    expect(verify).toMatch(/measuring almost nothing/);
  });

  it('asserts anon holds no EXECUTE, via the catalog', () => {
    expect(verify).toContain('aclexplode');
    expect(verify).toMatch(/rolname in \('anon','public'\)/);
    expect(verify).toMatch(/if v_anon <> 0 then/);
    expect(verify).toMatch(/definer leak/);
  });

  it('cannot be neutered by a loosened comparison or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/if v_\w+ < 0 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_\w+\s+int\s*:=/);
  });
});

describe('the sentinel reads it, and tells absence apart from zero', () => {
  it('probes the new key', () => {
    expect(healthCode).toContain('geo.countries_without_geometry');
    expect(healthCode).toContain('geo.countries_holding_content');
  });

  it('reports an ABSENT key separately from a zero', () => {
    // An undeployed sentinel must never read as a clean corpus — it warns and
    // names the migration rather than passing.
    expect(healthCode).toMatch(/holding === undefined \|\| withoutGeom === undefined/);
    expect(healthCode).toMatch(/99991790515886/);
    expect(healthCode).toMatch(/absence of a check, not absence of defects/);
  });

  it('hard-fails on a non-zero count and on a meaningless denominator', () => {
    const block = healthCode.slice(healthCode.indexOf('const withoutGeom'));
    expect(block).toMatch(/withoutGeom > 0[\s\S]{0,400}FAILED = true/);
    expect(block).toMatch(/holding < 150[\s\S]{0,300}FAILED = true/);
  });

  it('states the consequence, not just the number', () => {
    // A bare count teaches nobody why it matters; the failure names the
    // false-positive class it produces.
    expect(health).toMatch(/reported as a containment mismatch that is not one/);
  });
});

describe('the dead e2e test is gone, not left skipped', () => {
  it('no longer calls geo_hygiene_stats from the anon spec', () => {
    // It returned 401 there, and asserted on two keys the function never had.
    expect(specCode).not.toContain('geo_hygiene_stats');
  });

  it('carries no skipped test at all', () => {
    expect(specCode).not.toMatch(/test\.skip\(/);
  });

  it('keeps the half that IS an anon question', () => {
    // "No country polygons loaded" is answerable from the anon-readable
    // geo_boundaries table, and those two tests pass.
    expect(specCode).toContain('boundary geometry is actually loaded');
    expect(specCode).toContain('microstates survived the load');
  });

  it('records where the invariant went, so it does not read as dropped', () => {
    const prose = spec
      .split('\n')
      .filter((l) => /^\s*\/\//.test(l))
      .join(' ')
      .replace(/\s+/g, ' ');
    expect(prose).toMatch(/MOVED, not dropped/);
    expect(prose).toContain('check-pipeline-health.mjs');
    expect(prose).toContain('countries_without_geometry');
    // Both reasons it never passed are recorded, because "wrong role" alone
    // would invite someone to re-add it under another role.
    expect(prose).toMatch(/401/);
    expect(prose).toMatch(/NEITHER key/);
  });
});
