import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791315749: Apollo Tel Aviv un-merged from Apollo Zürich, and the
 * Heaven Zürich shell moved off Heaven WARSAW onto Heaven Club Zürich.
 * Text check over the migration with comments stripped.
 */

const raw = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '99991791315749_venue_wrong_cross_country_merges_undo.sql',
  ),
  'utf8',
);
const sql = raw
  .split('\n')
  .map((l) => l.replace(/^\s*--.*$/, ''))
  .join('\n');
const undo = sql.slice(sql.indexOf('do $undo$'), sql.indexOf('$undo$;'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('wrong cross-country venue merges undo', () => {
  it('clears Apollo Tel Aviv only while it still points at Apollo Zürich', () => {
    expect(undo).toMatch(/where id = v_apollo_tlv and duplicate_of_id = v_apollo_zrh/);
  });

  it('re-points the Heaven shell to Heaven Club via the audited merge core, after clearing it', () => {
    const clear = undo.indexOf('where id = v_heaven_shell;');
    const merge = undo.indexOf(
      'perform public._venue_merge_core(v_heaven_club, v_heaven_shell, null)',
    );
    expect(clear).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(clear);
    expect(undo).toContain("'6bada896-6e57-4ca6-9c5b-5d819c8f540f'");
  });

  it('merges heaven-19 into Heaven Club after taking its own website', () => {
    const web = undo.indexOf("k.website ilike '%display-magazin.ch%'");
    const merge = undo.indexOf(
      'perform public._venue_merge_core(v_heaven_club, v_heaven_19, null)',
    );
    expect(web).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(web);
    expect(undo).toContain("'32862d33-65ed-499d-bc09-a6215f65bfbb'");
  });

  it('never raises in the undo block (soft preconditions)', () => {
    expect(undo).not.toMatch(/raise exception/i);
  });

  it('asserts both wrong merges are gone and the re-point is reversible', () => {
    expect((verify.match(/if v_bad <> 0 then/g) ?? []).length).toBe(4);
    expect(verify).toContain("duplicate_of_id = '26a409ae-d1d0-4518-ad5e-813a3a78ba82'");
    expect(verify).toContain("duplicate_of_id = '0ded6843-8fe6-4587-9cd6-7b88ca551af7'");
    expect(verify).toContain("a.details ->> 'schema' = '1'");
    expect(verify).toContain('from public.events e where e.venue_id = d.id');
  });
});
