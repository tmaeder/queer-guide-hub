import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `99991791573919_city_eidelstedt_district_shell.sql`.
 *
 * "Eidelstedt, Altona" is a Hamburg district minted as a city from one
 * personality's birth-place text. The repair repoints that personality at
 * Hamburg and ARCHIVES the shell — it must not merge it (a district merged
 * into its parent grows place_merge_name_signals().merged_uncorroborated),
 * must not rewrite the birth_place text, and must not let
 * trg_personalities_auto_approve make a review decision as a side effect.
 *
 * Assertions run on comment-stripped SQL so the header prose cannot satisfy them.
 */
const raw = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '99991791573919_city_eidelstedt_district_shell.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');
const fix = sql.slice(sql.indexOf('do $fix$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('Eidelstedt district shell repair', () => {
  it('declares an attributed actor', () => {
    expect(fix).toMatch(/set_config\('app\.actor',\s*'migration:99991791573919_city_eidelstedt_district_shell'/);
  });

  it('archives the shell instead of merging it', () => {
    expect(fix).toMatch(/archive_city_as_nonplace\(\s*v_shell/);
    expect(sql).not.toMatch(/merge_cities|duplicate_of_id\s*=\s*v_hamburg/);
  });

  it('fails loudly if the archive is refused', () => {
    expect(fix).toMatch(/raise exception 'archive_city_as_nonplace refused/);
  });

  it('restores review_status after the city relink', () => {
    const relink = fix.indexOf('set city_id = v_hamburg');
    const restore = fix.indexOf('set review_status = v_person.review_status');
    expect(relink).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(relink);
  });

  it('never writes birth_place', () => {
    expect(fix).not.toMatch(/birth_place\s*=/);
  });

  it('verify block raises on each postcondition', () => {
    for (const p of ['P1', 'P2', 'P3']) {
      expect(verify).toMatch(new RegExp(`if v_bad <> 0 then\\s*raise exception '${p} failed`));
    }
    expect(verify).not.toMatch(/where false|if \(?false\)? then/);
  });
});
