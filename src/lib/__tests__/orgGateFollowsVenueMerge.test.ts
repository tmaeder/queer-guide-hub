import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/99991792753155_org_safety_gate_follows_venue_merge.sql'),
  'utf8',
)
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const between = (a: string, b: string) => {
  const i = sql.indexOf(a);
  const j = sql.indexOf(b, i + a.length);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
};

const rule = between('as $fn$', 'end $fn$');
const prop = between('as $prop$', 'end $prop$');
const verify = between('do $verify$', 'end $verify$');

describe('org safety gate follows a venue merge', () => {
  it('gates on the live primary venue OR its merge survivor', () => {
    expect(rule).toContain('location_is_high_risk(new.country_id, new.city_id)');
    expect(rule).toContain('left join public.venues s on s.id = v.duplicate_of_id');
    expect(rule).toMatch(
      /\(v\.duplicate_of_id is null and v\.safety_gated is true\)\s*or s\.safety_gated is true/,
    );
  });

  it('re-decides orgs on gate AND merge changes, including orgs merged into the venue', () => {
    expect(sql).toMatch(/after update of safety_gated, duplicate_of_id on public\.venues/);
    expect(sql).toMatch(/old\.duplicate_of_id is distinct from new\.duplicate_of_id/);
    expect(sql).toMatch(/old\.safety_gated is distinct from new\.safety_gated/);
    expect(prop).toContain('where o.primary_venue_id = new.id');
    expect(prop).toContain('d.duplicate_of_id = new.id');
    expect(prop).not.toContain('o.duplicate_of_id');
  });

  it('teaches both gate arms the survivor term', () => {
    expect(sql).toContain("pg_get_functiondef('public.release_gate_checks_raw'::regproc)");
    expect(sql).toContain('or ps.safety_gated is true)), false)');
    expect(sql).toContain("pg_get_functiondef('public.release_gate_checks'::regproc)");
    expect(sql).toContain('OR s.safety_gated IS TRUE);');
    expect([...sql.matchAll(/execute replace\(v_src, v_old, v_new\)/g)].length).toBe(2);
  });

  it('heals every merged-primary org through the seal', () => {
    expect(sql).toMatch(
      /set primary_venue_id = o\.primary_venue_id\s*\n\s*from public\.venues v\s*\n\s*where v\.id = o\.primary_venue_id\s*\n\s*and v\.duplicate_of_id is not null;/,
    );
    expect(sql).not.toMatch(/set safety_gated\s*=/);
  });

  it('asserts no org is ungated under a gated survivor, by raising', () => {
    expect(verify).toMatch(
      /where s\.safety_gated is true and coalesce\(o\.safety_gated, false\) is false/,
    );
    expect([...verify.matchAll(/raise exception 'P[1-4] failed/g)].length).toBe(4);
    expect(verify).not.toMatch(/\bwhere false\b|if \(?false\)? then/);
  });
});
