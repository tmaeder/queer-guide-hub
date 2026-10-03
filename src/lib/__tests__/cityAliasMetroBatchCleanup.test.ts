import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790993808_city_alias_metro_batch_cleanup.sql.
//
// A 2026-05-01 city_aliases batch folded independent municipalities into core
// cities (Jersey City → New York, Yokohama → Tokyo, Haarlem → Amsterdam …), so the
// resolver matched them by alias. This file deletes 31 of those aliases, creates or
// repairs the missing cities, and moves venues on two signals.
//
// What must not drift:
//   1. aliases go BEFORE the resolver runs, or it still matches the core city
//   2. the delete is scoped to the batch's own timestamp window
//   3. a PRESENT postal code must belong to the target — coordinates only when
//      there is no postal code. "Porte d'Aubervilliers, 75018" is Paris 18e.
//   4. moves are guarded on the venue still sitting on its core city
//   5. Sabadell's placeholder is repaired, not duplicated
//   6. kept aliases and control venues are asserted to survive

const MIGRATION = '99991790993808_city_alias_metro_batch_cleanup.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Full-line comments removed, so the header's prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const aliasDelete = statements.slice(
  statements.indexOf('delete from public.city_aliases'),
  statements.indexOf('update public.cities'),
);
const create = statements.slice(statements.indexOf('do $create$'), statements.indexOf('$create$;'));
const values = statements.slice(
  statements.indexOf('create temp table _metro_relink'),
  statements.indexOf(') t(venue_id'),
);
const relink = statements.slice(statements.indexOf('do $relink$'), statements.indexOf('$relink$;'));
const verify = statements.slice(statements.indexOf('do $verify$'));

describe('the spans this file depends on', () => {
  it('found every block', () => {
    expect(aliasDelete.length).toBeGreaterThan(500);
    expect(create.length).toBeGreaterThan(500);
    expect(values.length).toBeGreaterThan(2000);
    expect(relink.length).toBeGreaterThan(800);
    expect(verify.length).toBeGreaterThan(800);
  });
});

describe('alias removal', () => {
  it('runs before the resolver', () => {
    expect(statements.indexOf('delete from public.city_aliases')).toBeLessThan(
      statements.indexOf('city_resolve_or_create('),
    );
  });

  it('is scoped to the batch window and to exactly 31 ids', () => {
    expect(aliasDelete).toContain("created_at between '2026-05-01 07:53' and '2026-05-01 07:54'");
    expect(aliasDelete.match(/'[0-9a-f-]{36}',?\s+--/g)?.length).toBe(31);
  });
});

describe('city creation', () => {
  it('goes through the resolver, never a bare insert', () => {
    expect(create).toContain('public.city_resolve_or_create(');
    expect(statements).not.toMatch(/insert\s+into\s+public\.cities/i);
  });

  it('aborts on a refusal and on a core-city match', () => {
    expect(create).toMatch(/if v\.city_id is null then\s+raise exception/);
    expect(create).toMatch(/if v\.city_id = r\.core_id then\s+raise exception/);
  });

  it('repairs the Sabadell placeholder instead of creating Sabadell', () => {
    expect(create).not.toContain("'Sabadell',");
    expect(statements).toMatch(/set name\s+= 'Sabadell'[\s\S]*?and name = 'Sabadell, Katalonien'/);
    expect(verify).toMatch(/lower\(c\.name\) like 'sabadell%'[\s\S]*?if v_bad <> 1 then/);
  });
});

describe('venue relink', () => {
  it('requires the address to name the target', () => {
    expect(relink).toMatch(/not ilike '%' \|\| r\.target_name \|\| '%' then[\s\S]*?continue;/);
  });

  it('a present postal code decides — coordinates only without one', () => {
    expect(relink).toMatch(
      /when v_pc is not null then\s+case when exists \(select 1 from unnest\(r\.zips\) z where v_pc like z \|\| '%'\)/,
    );
    // the coordinate arm is the SECOND branch, reachable only when v_pc is null
    expect(relink.indexOf('when v_pc is not null')).toBeLessThan(relink.indexOf('haversine_m('));
    expect(relink).toMatch(/haversine_m\([^)]*\)\s*<=\s*10000(?!\d)/);
    expect(relink).toMatch(/if v_signal is null then[\s\S]*?continue;/);
  });

  it('only moves rows still on their core city', () => {
    expect(relink).toMatch(/where id = r\.venue_id\s+and city_id = r\.from_city_id/);
  });

  it('never lists the Paris 18e Beach Club or the Shinjuku/Ginza venues', () => {
    for (const id of [
      '5934480d-4a27-44ba-86d5-121252fc07ed',
      '25350147-9992-46f5-b8dd-6d733e074feb',
      '215c4932-7ac3-4a6e-bf22-74872cf1a061',
      'baee58c6-7ec8-4511-a13c-0d9906b17e53',
      '6e1b3bb9-1ca6-4045-b10a-9896fbadd234',
    ])
      expect(values).not.toContain(id);
    expect(values.match(/\('[0-9a-f-]{36}','/g)?.length).toBe(33);
  });

  it('stamps with || rather than jsonb_set(create_missing)', () => {
    expect(relink).toContain("|| jsonb_build_object('city_relink'");
    expect(statements).not.toMatch(/jsonb_set\([^)]*true\)/);
  });
});

describe('postconditions', () => {
  it('assert all six arms', () => {
    for (const p of ['P1 failed', 'P2 failed', 'P3 failed', 'P4 failed', 'P5 failed', 'P6 failed'])
      expect(verify).toContain(p);
    expect(verify).toMatch(/if v_bad <> 7 then\s+raise exception 'P2 failed/);
    expect(verify).toMatch(/if v_bad <> 0 then\s+raise exception 'P5 failed/);
  });

  it('has no neutered predicate or pre-seeded counter', () => {
    expect(verify).not.toMatch(/where\s+false/i);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
  });
});
