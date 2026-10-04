import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991791059373_city_region_code_gaps.sql, the generator it mirrors, and
// its health-script section.
//
// What must not drift:
//   1. the dr5hn hierarchy repairs live in BOTH the migration and the generator —
//      a regeneration that drops them silently re-breaks Tuscany, Badajoz and the
//      three Spanish self-loops;
//   2. a city is placed by its OWN name only when that subdivision's centroid is
//      within 100 km and every match climbs to ONE root (this is what keeps
//      "Washington" out of US-WA and "Kansas City" out of US-KS);
//   3. the sentinel is service_role only and wired ABOVE the script's exit.

const MIGRATION = '99991791059373_city_region_code_gaps.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const generator = readFileSync(
  join(process.cwd(), 'scripts/data-quality/generate-geo-subdivisions.mjs'),
  'utf8',
);
const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const parents = statements.slice(
  statements.indexOf('set parent_code = v.parent'),
  statements.indexOf('update public.geo_subdivisions set parent_code = null'),
);
const selfName = statements.slice(
  statements.indexOf('do $selfname$'),
  statements.indexOf('do $numeric$'),
);
const numeric = statements.slice(
  statements.indexOf('do $numeric$'),
  statements.indexOf('create or replace function public.city_region_signals'),
);
const sentinel = statements.slice(
  statements.indexOf('create or replace function public.city_region_signals'),
  statements.indexOf('do $verify$'),
);
const verify = statements.slice(statements.indexOf('do $verify$'));

const PAIR = /\('([A-Z]{2}-[A-Z0-9]+)',\s*'([A-Z]{2}-[A-Z0-9]+)'\)/g;

describe('the spans this file depends on', () => {
  it('found all five', () => {
    for (const s of [parents, selfName, numeric, sentinel, verify]) {
      expect(s.length).toBeGreaterThan(40);
    }
  });
});

describe('hierarchy repairs', () => {
  const migrationPairs = Object.fromEntries([...parents.matchAll(PAIR)].map((m) => [m[1], m[2]]));
  const genBlock = generator.slice(
    generator.indexOf('const PARENT_OVERRIDES'),
    generator.indexOf('}', generator.indexOf('const PARENT_OVERRIDES')),
  );
  const generatorPairs = Object.fromEntries(
    [...genBlock.matchAll(/'([A-Z]{2}-[A-Z0-9]+)':\s*'([A-Z]{2}-[A-Z0-9]+)'/g)].map((m) => [m[1], m[2]]),
  );

  it('repairs the twelve known-wrong parents', () => {
    expect(Object.keys(migrationPairs)).toHaveLength(12);
    expect(migrationPairs['ES-BA']).toBe('ES-EX');
    expect(migrationPairs['ES-O']).toBe('ES-AS');
    for (const p of ['IT-GR', 'IT-LI', 'IT-LU', 'IT-MS', 'IT-PI', 'IT-PO', 'IT-PT', 'IT-SI']) {
      expect(migrationPairs[p]).toBe('IT-52');
    }
  });

  it('the generator carries exactly the same overrides', () => {
    expect(generatorPairs).toEqual(migrationPairs);
  });

  it('neither side lets a unit be its own parent', () => {
    expect(statements).toMatch(/set parent_code = null where parent_code = code/);
    expect(generator).toMatch(/listed === s\.iso3166_2 \? null : listed/);
  });

  it('Mexico City resolves on the name arm, and State of Mexico keeps resolving', () => {
    for (const src of [statements, generator]) {
      expect(src).toMatch(/'MX-CMX'[^\n]*'Mexico City'/);
      expect(src).toMatch(/'MX-MEX'[^\n]*'State of Mexico'/);
    }
  });
});

describe('placing a city by its own name', () => {
  it('requires the matched subdivision within 100 km', () => {
    expect(selfName).toMatch(/haversine_m\([^)]*\)\s*<=\s*100000(?!\d)/);
  });

  it('requires exactly one root and never a NULL one', () => {
    expect(selfName).toMatch(/having count\(distinct root\) = 1 and bool_and\(root is not null\)/);
  });

  it('only touches cities with no code yet', () => {
    expect(selfName.match(/region_code is null/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('writes region_name only when empty and only a value that resolves back', () => {
    expect(selfName).toMatch(
      /when nullif\(btrim\(c\.region_name\), ''\) is null\s+and public\.resolve_region_code\(co\.code, s\.name\) = r\.root/,
    );
  });
});

describe('numeric region_name', () => {
  it('is replaced only where the name round-trips to the stored code', () => {
    expect(numeric).toMatch(/public\.resolve_region_code\(co\.code, s\.name\) = c\.region_code/);
    expect(numeric).toMatch(/set region_name = pick\.name/);
  });
});

describe('sentinel', () => {
  it('is service_role only', () => {
    expect(statements).toMatch(
      /revoke all on function public\.city_region_signals\(\) from public, anon, authenticated;/,
    );
    expect(statements).toMatch(/grant execute on function public\.city_region_signals\(\) to service_role;/);
    expect(verify).toMatch(/if has_function_privilege\('anon', 'public\.city_region_signals\(\)', 'EXECUTE'\) then\s+raise exception/);
  });

  it('does not call the per-city resolver on every row (8 s PostgREST ceiling)', () => {
    expect(sentinel).not.toMatch(/resolve_region_code\(l\.cc, l\.region_name\)/);
  });

  it('postconditions raise on every zero-invariant', () => {
    for (const key of ['subdivision_root_null', 'region_code_wrong_country', 'numeric_region_name_resolvable']) {
      expect(verify).toMatch(new RegExp(`\\(v_sig->>'${key}'\\)::int <> 0`));
    }
    expect(verify).toMatch(/x\.rc is distinct from c\.region_code;\s+if v_n <> 0 then\s+raise exception 'P5 failed/);
  });

  it('named-city controls include Berlin, Hamburg and Mexico City', () => {
    expect(verify).toMatch(/\('Berlin', 'DE', 'DE-BE'\)/);
    expect(verify).toMatch(/\('Hamburg', 'DE', 'DE-HH'\)/);
    expect(verify).toMatch(/\('Mexico City', 'MX', 'MX-CMX'\)/);
  });
});

describe('health script', () => {
  const section = health.indexOf('/rpc/city_region_signals');
  it('calls the sentinel above the exit', () => {
    expect(section).toBeGreaterThan(0);
    expect(section).toBeLessThan(health.lastIndexOf('if (FAILED) {'));
  });

  it('fails on each zero-invariant and on a missing key', () => {
    const body = health.slice(section, health.indexOf('if (FAILED) {', section));
    for (const key of ['subdivision_root_null', 'region_code_wrong_country', 'numeric_region_name_resolvable']) {
      expect(body).toContain(`${key}:`);
    }
    expect(body).toMatch(/if \(!\(key in sig\)\) \{[\s\S]*?FAILED = true/);
    expect(body).toMatch(/if \(n > 0\) \{[\s\S]*?FAILED = true/);
  });
});
