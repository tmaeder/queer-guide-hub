import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `99991791576204_city_region_qualified_bare_names.sql`: six real cities
 * lose their comma qualifier because region_code now disambiguates them. Each
 * rename must be pinned to the qualified row's own region_code (so the
 * namesake in another state is never touched) and survive a collision.
 */
const raw = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '99991791576204_city_region_qualified_bare_names.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/^\s*--.*$/, ''))
  .join('\n');
const fix = sql.slice(sql.indexOf('do $fix$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('region-qualified bare city names', () => {
  it('renames exactly six rows, each pinned to its region_code', () => {
    const rows = [...fix.matchAll(/\('([^']+, [^']+)',\s*'([^']+)',\s*'([A-Z]{2})',\s*'([A-Z]{2}-[A-Z]{2,3})'\)/g)];
    expect(rows.length).toBe(6);
    for (const [, oldName, newName, cc, rc] of rows) {
      expect(oldName.startsWith(newName + ', ')).toBe(true);
      expect(rc.startsWith(cc + '-')).toBe(true);
    }
    expect(fix).toMatch(/and c\.region_code = r\.region_code/);
  });

  it('only writes the name and provenance, never slug or region', () => {
    const upd = fix.slice(fix.indexOf('update public.cities set'), fix.indexOf('where id = v_id;'));
    expect(upd).not.toMatch(/slug\s*=|region_code\s*=|region_name\s*=/);
  });

  it('skips on a unique violation instead of failing', () => {
    expect(fix).toMatch(/exception when unique_violation then/);
  });

  it('verify block raises on each postcondition', () => {
    for (const p of ['P1', 'P2']) {
      expect(verify).toMatch(new RegExp(`if v_bad <> 0 then\\s*raise exception '${p} failed`));
    }
  });
});
