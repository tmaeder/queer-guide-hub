import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991790384573_dedup_close_burst_sentinel.sql';
const migrationPath = join(process.cwd(), 'supabase', 'migrations', MIGRATION);
const raw = readFileSync(migrationPath, 'utf8');
const healthScript = readFileSync(
  join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'),
  'utf8',
);

/**
 * The migration's own header quotes the defect verbatim, so a plain `toContain` over the
 * whole file is satisfied by the PROSE while the statement is gone. Every structural
 * assertion below runs against comment-stripped SQL.
 */
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

describe('dedup close-burst sentinel', () => {
  it('counts rejected only — superseded is a merge cascade, not a close decision', () => {
    // The first draft counted both and fired on 2026-09-06, which was 530 `superseded`
    // rows produced mechanically by one legitimate merge wave. Counting it ships red.
    expect(sql).toContain("status = 'rejected'");
    expect(sql).not.toMatch(/status\s+in\s*\(\s*'rejected'\s*,\s*'superseded'\s*\)/);
    expect(sql).not.toContain("'superseded'");
  });

  it('reports liveness separately from the burst list', () => {
    // An empty `bursts` must not be indistinguishable from a probe that measured nothing.
    expect(sql).toContain("'probe_ok'");
    expect(sql).toContain("'closes_total_ever'");
  });

  it('carries a positive control proving the burst arm is reachable', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toContain('p_threshold => 0');
    expect(verify).toMatch(/positive control failed/i);
    // The control must assert a NON-empty result; `= 0` is the direction that proves
    // the arm fired. Asserting length >= 0 would pass against a dead arm.
    expect(verify).toMatch(/jsonb_array_length\(ctrl->'bursts'\)\s*=\s*0/);
  });

  it('refuses to treat an empty corpus as healthy', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).toMatch(/closes_total_ever.*\)\s*=\s*0/s);
    expect(verify).toMatch(/measuring nothing/i);
  });

  it('is service_role only — a DEFINER aggregate must not reach authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function public\.dedup_close_burst_signals\(int, int\) from public/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.dedup_close_burst_signals\(int, int\) from authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.dedup_close_burst_signals\(int, int\) to service_role/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.dedup_close_burst_signals\(int, int\) to authenticated/,
    );
  });

  it('aliases the date column explicitly (bare `day` is a syntax error here)', () => {
    expect(sql).toMatch(/reviewed_at::date\s+as\s+day/);
  });
});

describe('check-pipeline-health wiring', () => {
  const section = healthScript.slice(healthScript.indexOf('dedup_close_burst_signals'));

  it('hard-fails on a burst rather than warning', () => {
    const upto = section.slice(0, section.indexOf('// 4b.'));
    expect(upto).toContain('FAILED = true');
    // The failure must be driven by the burst list being non-empty.
    expect(upto).toMatch(/bursts\.length\s*>\s*0/);
  });

  it('treats a missing RPC as "measured nothing", never as a pass', () => {
    const upto = section.slice(0, section.indexOf('// 4b.'));
    expect(upto).toMatch(/measured NOTHING/i);
    expect(upto).toContain(MIGRATION.split('_')[0]);
  });

  it('names the day and the note so a human can act without querying', () => {
    const upto = section.slice(0, section.indexOf('// 4b.'));
    expect(upto).toContain('b.day');
    expect(upto).toContain('b.sample_note');
  });
});
