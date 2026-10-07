import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the cities_anglicize_names migration: 22 cities get their English name
 * in `name`, two German shells are merged into the English row holding the
 * entity. Assertions run on COMMENT-STRIPPED sql (the header quotes every
 * rejected candidate, so raw-text checks would pass on prose alone).
 */

const dir = join(process.cwd(), 'supabase', 'migrations');
const file = readdirSync(dir).find((f) => f.endsWith('_cities_anglicize_names.sql'));
const raw = readFileSync(join(dir, file!), 'utf8');
const sql = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

const values = sql.slice(sql.indexOf('INSERT INTO _anglicize VALUES'), sql.indexOf('CREATE TEMP TABLE _anglicize_slugs'));
const rows = [...values.matchAll(/\('([0-9a-f-]{36})',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'(Q\d+)'\)/g)];

describe('rename list', () => {
  it('carries exactly 22 rows, each with a distinct id', () => {
    expect(rows.length).toBe(22);
    expect(new Set(rows.map((r) => r[1])).size).toBe(22);
  });

  it('includes the canonical examples and the one genuinely German shell with a QID', () => {
    const pairs = rows.map((r) => `${r[2]}->${r[3]}`);
    for (const p of ['Hannover->Hanover', 'Kemerowo->Kemerovo', 'Helgoland->Heligoland', 'Swinemünde->Świnoujście']) {
      expect(pairs).toContain(p);
    }
  });

  it('never renames to a label that adds an admin-unit word or a stale name', () => {
    for (const r of rows) {
      expect(r[3]).not.toMatch(/\b(District|Municipality|Province|sub-region|station|Council)\b/i);
    }
    const olds = rows.map((r) => r[2]);
    for (const refused of ['Braunschweig', 'Konstanz', 'Fort Cavazos', 'Gent', 'Luzern', 'Großbritannien']) {
      expect(olds).not.toContain(refused);
    }
  });

  it('writes no new name containing a comma (the split-name trigger would move it)', () => {
    for (const r of rows) expect(r[3]).not.toContain(',');
  });
});

describe('apply loop', () => {
  it('skips rows that moved and rows whose target name is taken, instead of aborting', () => {
    expect(sql).toContain('r.cur_name IS DISTINCT FROM r.old_name');
    expect(sql).toMatch(/already taken in this country\/region/);
    expect(sql.match(/CONTINUE;/g)?.length).toBe(2);
  });

  it('keeps the old name as an alias and never writes the slug or a wikidata_qid', () => {
    expect(sql).toContain('INSERT INTO public.city_aliases (city_id, alias, locale)');
    expect(sql).toContain('ON CONFLICT (city_id, alias_key) DO NOTHING');
    const update = sql.slice(sql.indexOf('UPDATE public.cities'), sql.indexOf('INSERT INTO public.city_aliases'));
    expect(update).not.toMatch(/\bslug\s*=/);
    expect(update).not.toMatch(/wikidata_qid\s*=/);
  });

  it('merges the two German shells through merge_cities, guarded on the shell still being live', () => {
    expect(sql.match(/PERFORM public\.merge_cities\(r\.keep_id, r\.drop_id, false\)/g)?.length).toBe(1);
    expect(sql).toContain("'3a6b6bf1-8779-4e93-a97f-2dcdf93735b9'::uuid, 'Daressalam'");
    expect(sql).toContain("'c245c9d2-b129-4634-b25b-d3ebea4a9582'::uuid, 'Santiago de Chile'");
  });
});

describe('postconditions', () => {
  it('raises on each of the four end-state checks', () => {
    for (const p of ['P1 failed', 'P2 failed', 'P3 failed', 'P4 failed']) {
      expect(sql).toMatch(new RegExp(`RAISE EXCEPTION '${p}`));
    }
  });

  it('snapshots slugs before the writes and compares after', () => {
    expect(sql.indexOf('CREATE TEMP TABLE _anglicize_slugs')).toBeLessThan(sql.indexOf('UPDATE public.cities'));
    expect(sql).toContain('WHERE c.slug IS DISTINCT FROM s.slug');
  });
});
