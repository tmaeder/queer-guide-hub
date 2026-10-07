import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791318782: Heldenbar (Sihlquai 240) re-filed from Winterthur to
 * Zürich, then the hidden live duplicate `helden` merged into it.
 */

const raw = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '99991791318782_heldenbar_zuerich_city_fix.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/^\s*--.*$/, ''))
  .join('\n');
const main = sql.slice(sql.indexOf('do $hb$'), sql.indexOf('$hb$;'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('heldenbar Zürich city fix', () => {
  it('re-files to Zürich only while the address is still Sihlquai 240', () => {
    expect(main).toMatch(/set city_id = c_zuerich, city = 'Zürich', postal_code = '8005'/);
    expect(main).toContain("address ilike 'Sihlquai 240%'");
  });

  it('re-files BEFORE merging, so the same-city check can pass', () => {
    const refile = main.indexOf('set city_id = c_zuerich');
    const merge = main.indexOf('perform public._venue_merge_core(v_heldenbar, v_helden, null)');
    expect(refile).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(refile);
  });

  it('asserts not Winterthur, no live pair, reversible merge', () => {
    expect((verify.match(/if v_bad <> 0 then/g) ?? []).length).toBe(3);
    expect(verify).toContain("c.name = 'Winterthur'");
    expect(verify).toContain("a.details ->> 'schema' = '1'");
  });
});
