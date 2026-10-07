import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791318321: three Zürich addresses where a club changed name or
 * operator. Same room under a new name -> merge; different operator -> close
 * the predecessor with a cited date; an event row -> archive as non-venue.
 * Text check, comments stripped first.
 */

const raw = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '99991791318321_zuerich_renamed_venues.sql'),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/^\s*--.*$/, '').replace(/\s+--\s.*$/, ''))
  .join('\n');
const main = sql.slice(sql.indexOf('do $zh$'), sql.indexOf('$zh$;'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('zuerich renamed venues', () => {
  it('merges the four same-room pairs, keep first', () => {
    expect(main).toMatch(
      /\(v_wunderbox, v_club04\),\s*\(v_wunderbox, v_club04_ew\),\s*\(v_space,\s*v_space_ev\),\s*\(v_maex,\s*v_haerterei\)/,
    );
    expect(main).toContain('perform public._venue_merge_core(p.keep_id, p.drop_id, null)');
  });

  it('closes Variété and Lexy instead of merging them, with a cited date', () => {
    expect(main).not.toMatch(/\(v_space,\s*v_variete\)|\(v_space,\s*v_lexy\)/);
    expect(main).toMatch(/where id = v_variete and closure_status in \('open', 'unknown'\)/);
    expect(main).toMatch(/where id = v_lexy and closure_status in \('open', 'unknown'\)/);
    expect((main.match(/closure_status = 'permanently_closed'/g) ?? []).length).toBe(2);
    expect((main.match(/closure_source = 'https:\/\//g) ?? []).length).toBe(2);
  });

  it('keeps Eventhaus Langstrasse and Maag Halle out of it', () => {
    expect(sql).not.toContain('d52c6eb0-0ba8-495c-b712-7e907bde6c34');
    expect(sql).not.toContain('5de01835-d0fa-4848-ae4a-97dc81e0527f');
  });

  it('archives the afterparty reversibly, never deletes a venue', () => {
    expect(main).toMatch(/public\.decide_venue_nonvenue\(v_rupaul, true,/);
    expect(sql).not.toMatch(/delete\s+from\s+public\.venues/i);
  });

  it('asserts merged, reversible, closed and not served', () => {
    expect((verify.match(/if v_bad <> 0 then/g) ?? []).length).toBe(4);
    expect(verify).toContain("a.details ->> 'schema' = '1'");
    expect(verify).toContain("closure_status in ('open', 'unknown') or seo_indexable");
  });
});
