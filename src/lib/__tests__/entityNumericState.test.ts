import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991791146021_entity_numeric_state.sql.
//
// venues/events/hotels/organizations.state copied GeoNames numbers ("27") from
// cities.region_name. A row may only be rewritten when TWO signals agree: the
// number resolves to the city's region_code AND the city's region_name resolves
// back to that same code. Measured: 3,924 agree, 0 disagree.

const MIGRATION = '99991791146021_entity_numeric_state.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const fix = statements.slice(statements.indexOf('do $fix$'), statements.indexOf('$fix$;'));
const sentinel = statements.slice(
  statements.indexOf('create or replace function public.city_region_signals'),
  statements.indexOf('do $verify$'),
);
const verify = statements.slice(statements.indexOf('do $verify$'));

describe('the fix', () => {
  it('covers all four tables that derive state from the city', () => {
    expect(fix).toMatch(/array\['venues', 'events', 'hotels', 'organizations'\]/);
  });

  it('requires the number AND the city name to resolve to the city code', () => {
    expect(fix).toMatch(/resolve_region_code\(co\.code, btrim\(e\.state\)\) = c\.region_code/);
    expect(fix).toMatch(/resolve_region_code\(co\.code, c\.region_name\) = c\.region_code/);
  });

  it('only touches digits-only state and never writes a blank', () => {
    expect(fix).toMatch(/e\.state ~ '\^\\s\*\[0-9\]\+\\s\*\$'/);
    expect(fix).toMatch(/nullif\(btrim\(c\.region_name\), ''\) is not null/);
    expect(fix).toMatch(/set state = pick\.region_name/);
  });

  it('is batched', () => {
    expect(fix).toMatch(/limit 300/);
    expect(fix).toMatch(/exit when v_n = 0/);
  });
});

describe('sentinel', () => {
  it('keeps every earlier key and adds the entity one', () => {
    for (const key of [
      'subdivision_root_null',
      'region_code_wrong_country',
      'numeric_region_name_resolvable',
      'entity_numeric_state_resolvable',
      'real_without_region_code',
    ]) {
      expect(sentinel).toContain(`'${key}'`);
    }
  });

  it('stays service_role only', () => {
    expect(statements).toMatch(
      /revoke all on function public\.city_region_signals\(\) from public, anon, authenticated;/,
    );
    expect(verify).toMatch(/has_function_privilege\('anon', 'public\.city_region_signals\(\)', 'EXECUTE'\) then\s+raise exception/);
  });

  it('postcondition raises when the key is missing or non-zero', () => {
    expect(verify).toMatch(
      /\(v_sig->>'entity_numeric_state_resolvable'\) is null\s+or \(v_sig->>'entity_numeric_state_resolvable'\)::int <> 0 then\s+raise exception/,
    );
  });

  it('the health script fails on it', () => {
    const body = health.slice(health.indexOf('/rpc/city_region_signals'));
    expect(body).toContain('entity_numeric_state_resolvable:');
  });
});
