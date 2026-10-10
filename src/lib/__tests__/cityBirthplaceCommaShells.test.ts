import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `99991791574485_city_birthplace_comma_shells_disposition.sql`.
 *
 * 214 hand-classified birth-place shells ("Loschwitz, Dresden",
 * "Gleiwitz, Oberschlesien", ...). The file must never merge, never write
 * birth_place text, resolve targets at apply time instead of guessing, survive
 * a rename collision per row, and keep its three postconditions live.
 * Assertions run on comment-stripped SQL so header prose cannot satisfy them.
 */
const raw = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '99991791574485_city_birthplace_comma_shells_disposition.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/^\s*--.*$/, ''))
  .join('\n');
const list = raw.slice(raw.indexOf('$list$') + 6, raw.lastIndexOf('$list$'));
const rows = list
  .trim()
  .split('\n')
  .map((l) => l.split('|'));
const fix = sql.slice(sql.indexOf('do $fix$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('birth-place comma shell disposition', () => {
  it('classifies every row with a known action and a comma-qualified shell name', () => {
    expect(rows.length).toBe(214);
    for (const r of rows) {
      expect(['D', 'T', 'R', 'X']).toContain(r[2]);
      expect(r[0]).toContain(',');
      expect(r[1]).toMatch(/^[A-Z]{2}$/);
      if (r[2] !== 'X') expect(r[4]).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('renamed names carry no qualifier', () => {
    for (const r of rows.filter((x) => x[2] === 'R')) expect(r[3]).not.toContain(',');
  });

  it('lists each shell once', () => {
    const keys = rows.map((r) => `${r[0]}|${r[1]}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('processes renames before repoints', () => {
    expect(fix).toMatch(/order by \(split_part\(l, '\|', 3\) = 'R'\) desc/);
  });

  it('never merges and never writes birth/death place text', () => {
    expect(sql).not.toMatch(/merge_cities|set duplicate_of_id/);
    expect(fix).not.toMatch(/birth_place\s*=|death_place\s*=/);
  });

  it('archives via the reversible RPC and skips on refusal', () => {
    expect(fix).toMatch(/archive_city_as_nonplace\(\s*v_shell\.id/);
    expect(fix).toMatch(/exception when unique_violation then/);
  });

  it('restores review_status after the relink', () => {
    const relink = fix.indexOf('set city_id = v_target where id = v_person.id');
    const restore = fix.indexOf('set review_status = v_person.review_status');
    expect(relink).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(relink);
  });

  it('unlinks people from a non-settlement before archiving it', () => {
    const unlink = fix.indexOf('set city_id = null where city_id = v_shell.id');
    expect(unlink).toBeGreaterThan(-1);
    expect(unlink).toBeLessThan(fix.indexOf('archive_city_as_nonplace('));
  });

  it('verify block raises on each postcondition', () => {
    for (const p of ['P1', 'P2', 'P3']) {
      expect(verify).toMatch(new RegExp(`if v_bad <> 0 then\\s*raise exception '${p} failed`));
    }
    expect(verify).not.toMatch(/where false|if \(?false\)? then/);
  });
});
