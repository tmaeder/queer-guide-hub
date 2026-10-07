import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `99991791356589_cities_name_local.sql` and the link-phase writer.
 *
 * cities.name_local holds the city's name in its country's own language
 * (München for Munich). The column has to exist in SIX objects at once —
 * cities, geo_city_profiles, sync_geo_spine_city(), cities_admin,
 * cities_directory(), commit_city_staging_item() — because
 * geo_spine_drift_check() compares only name/slug/parent_id and would never
 * notice a satellite column that stopped syncing.
 *
 * The functions are PATCHED from pg_get_functiondef rather than restated, so the
 * assertions check the patch statements and their exactly-once anchor guards.
 * Everything runs on COMMENT-STRIPPED sql: the header names every object.
 */

const ROOT = process.cwd();
const raw = readFileSync(
  join(ROOT, 'supabase', 'migrations', '99991791356589_cities_name_local.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

const verify = sql.slice(sql.indexOf('DO $verify$'));
const statements = sql.slice(0, sql.indexOf('DO $verify$'));

function block(open: string): string {
  const start = statements.indexOf(open);
  expect(start, `block ${open} not found`).toBeGreaterThanOrEqual(0);
  const tag = open.match(/\$[a-z]+\$/)![0];
  const end = statements.indexOf(tag, start + open.length);
  return statements.slice(start, end);
}

describe('cities.name_local schema', () => {
  it('adds both columns to cities AND the geo_city_profiles satellite', () => {
    for (const table of ['public.cities', 'public.geo_city_profiles']) {
      const at = statements.indexOf(`ALTER TABLE ${table}\n  ADD COLUMN IF NOT EXISTS name_local `);
      expect(at, table).toBeGreaterThanOrEqual(0);
      expect(statements.slice(at, at + 200)).toContain('name_local_lang text');
    }
  });

  it('constrains the language tag and forbids a tag without a name', () => {
    const at = statements.indexOf('ADD CONSTRAINT cities_name_local_shape CHECK');
    expect(at).toBeGreaterThanOrEqual(0);
    const check = statements.slice(at, statements.indexOf(');', at));
    expect(check).toContain("name_local_lang ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$'");
    expect(check).toContain('name_local_lang IS NULL OR name_local IS NOT NULL');
  });
});

describe('lockstep patches', () => {
  it('patches sync_geo_spine_city from its live definition, with exactly-once anchors', () => {
    const b = block('DO $patch$\nDECLARE\n  v_def text := pg_get_functiondef(\'public.sync_geo_spine_city()');
    expect(b).toContain("RAISE EXCEPTION 'sync_geo_spine_city: an anchor did not match exactly once");
    expect(b).toContain('new.wikidata_qid, new.wikipedia_title, new.name_local, new.name_local_lang)');
    expect(b).toContain('name_local = excluded.name_local, name_local_lang = excluded.name_local_lang;');
    expect(b).toContain('EXECUTE v_new;');
  });

  it('appends both columns to cities_admin via CREATE OR REPLACE (grants survive)', () => {
    const b = block('DO $view$');
    expect(b).toContain("'CREATE OR REPLACE VIEW public.cities_admin AS '");
    expect(b).toContain('c.name_local,\\n    c.name_local_lang\\n   FROM');
    expect(b).not.toMatch(/DROP\s+VIEW/i);
  });

  it('emits both keys from cities_directory and stages fill-if-empty in commit_city_staging_item', () => {
    expect(statements).toContain("pg_get_functiondef('public.cities_directory()'::regprocedure)");
    expect(statements).toContain('c.name_local,\\n      c.name_local_lang,');
    const commit = block(
      "DO $patch$\nDECLARE\n  v_def text := pg_get_functiondef('public.commit_city_staging_item(uuid, text)'",
    );
    // Both writes are gated on the column being empty: a curated value is never replaced.
    expect(commit.match(/CASE WHEN name_local IS NULL AND/g)?.length).toBe(2);
  });
});

describe('verify block', () => {
  it('counts name_local_lang four times in the spine function (list, values, target, excluded.)', () => {
    expect(verify).toMatch(/length\('name_local_lang'\) <> 4 THEN\s+RAISE EXCEPTION 'P2 failed/);
  });

  it('asserts every object and still executes the directory', () => {
    for (const p of ['P1 failed', 'P3 failed', 'P4 failed', 'P5 failed']) {
      expect(verify).toContain(p);
    }
    expect(verify).toContain('PERFORM public.cities_directory();');
  });
});

describe('link-phase writer', () => {
  const fn = readFileSync(
    join(ROOT, 'supabase', 'functions', 'city-factual-backfill', 'index.ts'),
    'utf8',
  );

  it('fills name_local only inside the adopted-settlement branch and only when empty', () => {
    const settlement = fn.indexOf("} else if (cls.verdict === 'settlement') {");
    const refused = fn.indexOf("} else if (cls.verdict === 'refused') {");
    const write = fn.indexOf('update.name_local = native.name');
    expect(settlement).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(settlement);
    expect(write).toBeLessThan(refused);
    expect(fn.slice(write - 120, write)).toContain('if (!c.name_local) {');
  });

  it('selects the country languages the native-name parser needs', () => {
    expect(fn).toContain("'name_local, name_local_lang, countries(name, languages)'");
  });
});
