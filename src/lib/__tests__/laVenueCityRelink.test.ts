import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790978994_la_venue_city_relink.sql.
//
// /venues/yard-house (Burbank, CA 91502) rendered "City: Los Angeles". The cause was
// a `city_aliases` row folding "Burbank" into Los Angeles — one of ten independent
// cities a 2026-05-01 batch aliased onto LA — so the resolver matched by alias instead
// of creating Burbank.
//
// What must not drift:
//   1. the aliases are deleted BEFORE the resolver runs, or "Burbank" still matches LA
//   2. the resolver result is checked: refused OR still-Los-Angeles both abort
//   3. every venue move needs TWO signals, evaluated in SQL: address names the city,
//      AND postal code of that city or coordinates within 10 km
//   4. the move is guarded on the row still being on Los Angeles
//   5. neighbourhood aliases (Silver Lake, Venice, Playa Vista, Studio City) survive,
//      and the controls (neighbourhood venues + the ambiguous Pasta Sisters) stay
//   6. the stamp is built with `||`, never jsonb_set(create_missing)

const MIGRATION = '99991790978994_la_venue_city_relink.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Full-line comments removed, so the header's prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const LA = '3beb0554-c93b-415a-92cd-4adfa40f5615';

const aliasDelete = statements.slice(
  statements.indexOf('delete from public.city_aliases'),
  statements.indexOf('do $create$'),
);
const create = statements.slice(statements.indexOf('do $create$'), statements.indexOf('$create$;'));
const relink = statements.slice(statements.indexOf('do $relink$'), statements.indexOf('$relink$;'));
const verify = statements.slice(statements.indexOf('do $verify$'));

describe('the spans this file depends on', () => {
  it('found every block', () => {
    expect(aliasDelete.length, 'alias delete span').toBeGreaterThan(200);
    expect(create.length, 'create span').toBeGreaterThan(300);
    expect(relink.length, 'relink span').toBeGreaterThan(600);
    expect(verify.length, 'verify span').toBeGreaterThan(600);
  });
});

describe('alias removal', () => {
  it('runs before the resolver', () => {
    expect(statements.indexOf('delete from public.city_aliases')).toBeLessThan(
      statements.indexOf('city_resolve_or_create('),
    );
  });

  it('is scoped to Los Angeles and to exactly ten ids', () => {
    expect(aliasDelete).toContain(`city_id = '${LA}'::uuid`);
    expect(aliasDelete.match(/'[0-9a-f-]{36}',?\s+--/g)?.length).toBe(10);
  });
});

describe('city creation', () => {
  it('goes through the resolver, never a bare insert', () => {
    expect(create).toContain('public.city_resolve_or_create(');
    expect(statements).not.toMatch(/insert\s+into\s+public\.cities/i);
  });

  it('aborts on a refusal and on a Los Angeles match', () => {
    expect(create).toMatch(/if v\.city_id is null then\s+raise exception/);
    expect(create).toMatch(new RegExp(`if v\\.city_id = '${LA}'::uuid then\\s+raise exception`));
  });

  it('passes region and identifier for all four', () => {
    expect(create).toContain("p_region_hint   => 'California'");
    for (const q of ['Q39561', 'Q493378', 'Q851027', 'Q174026']) expect(create).toContain(`'${q}'`);
  });
});

describe('venue relink', () => {
  it('requires the address to name the target city', () => {
    expect(relink).toMatch(/not ilike '%' \|\| r\.target_name \|\| '%' then[\s\S]*?continue;/);
  });

  it('requires a second signal: postal code or coordinates within 10 km', () => {
    expect(relink).toContain('r.postal_code = any (r.zips)');
    expect(relink).toMatch(/haversine_m\([^)]*\)\s*<=\s*10000(?!\d)/);
    expect(relink).toMatch(/if v_signal is null then[\s\S]*?continue;/);
  });

  it('only moves rows still on Los Angeles', () => {
    expect(relink).toMatch(new RegExp(`where id = r\\.venue_id\\s+and city_id = '${LA}'::uuid`));
  });

  it('stamps with || rather than jsonb_set(create_missing)', () => {
    expect(relink).toContain("|| jsonb_build_object('city_relink'");
    expect(statements).not.toMatch(/jsonb_set\([^)]*true\)/);
  });

  it('never moves the ambiguous Pasta Sisters', () => {
    const values = statements.slice(statements.indexOf('create temp table _la_relink'), statements.indexOf(') t(venue_id'));
    expect(values).not.toContain('0f93291a-7237-48b5-ad0a-b794377dfb5a');
    expect(values.match(/\('[0-9a-f-]{36}', '/g)?.length).toBe(15);
  });
});

describe('postconditions', () => {
  it('assert the end state on all five arms', () => {
    for (const p of ['P1 failed', 'P2 failed', 'P3 failed', 'P4 failed', 'P5 failed']) expect(verify).toContain(p);
    expect(verify).toMatch(/if v_bad <> 0 then\s+raise exception 'P2 failed/);
    expect(verify).toMatch(/if v_bad < 250 then/);
  });

  it('keeps the neighbourhood aliases and the control venues', () => {
    expect(verify).toContain("'silver lake','venice','playa vista','studio city'");
    expect(verify).toMatch(/if v_bad <> 4 then/);
    expect(verify).toContain("'0f93291a-7237-48b5-ad0a-b794377dfb5a'");
  });

  it('has no neutered predicate or pre-seeded counter', () => {
    expect(verify).not.toMatch(/where\s+false/i);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
  });
});
