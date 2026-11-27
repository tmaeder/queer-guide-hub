import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// guard_explicit_address_country fills a NULL country_id from the address. The
// gate triggers are column-scoped and an `address`-only UPDATE names none of
// their columns, so without this the filled country never reaches the gate.
// See 99991795807275.

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const FIX = '99991795807275_address_country_fill_gates_row.sql';

const stripped = (f: string) =>
  readFileSync(join(MIG_DIR, f), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');

const sql = stripped(FIX);
const patch = sql.slice(sql.indexOf('do $patch$'), sql.indexOf('end $patch$'));
const verify = sql.slice(sql.indexOf('do $verify$'), sql.indexOf('end $verify$'));

describe('the address guard gates the country it fills', () => {
  it('positive control: both blocks are present', () => {
    expect(readdirSync(MIG_DIR)).toContain(FIX);
    expect(patch.length).toBeGreaterThan(0);
    expect(verify.length).toBeGreaterThan(0);
  });

  it('adds the location term right after the fill', () => {
    expect(patch).toMatch(
      /new\.country_id:=resolved_id;\s+if resolved_id is not null and public\.location_is_high_risk\(resolved_id, new\.city_id\) then\s+new\.safety_gated:=true;/,
    );
  });

  it('only ever sets the gate, never clears it', () => {
    expect(patch).not.toMatch(/safety_gated\s*:=\s*false/i);
    expect(patch).not.toMatch(/safety_gated\s*:=\s*public\./i);
  });

  it('patches the live body by exactly-once anchor and is idempotent', () => {
    expect(patch).toMatch(
      /pg_get_functiondef\('public\.guard_explicit_address_country'::regproc\)/,
    );
    expect(patch).toMatch(/if v_hits <> 1 then\s+raise exception/);
    expect(patch).toMatch(/execute replace\(v_src, v_old, v_new\)/);
    expect(patch).toMatch(
      /if position\('location_is_high_risk\(resolved_id' in v_src\) > 0 then\s+return;/,
    );
    expect(sql).not.toMatch(/create or replace function public\.guard_explicit_address_country/i);
  });

  it('raises on every postcondition', () => {
    expect(verify).toMatch(/= 0 then\s+raise exception 'P1 failed/);
    expect(verify).toMatch(/safety_gated\\s\*:=\\s\*false' then\s+raise exception 'P2 failed/);
    expect(verify).toMatch(/if v_bad is not null then\s+raise exception 'P3 failed/);
  });
});
