import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 99991792250145 bounds admin_automation_reap_runs' request->response window on
 * BOTH sides. It already had the lower half ("a response cannot predate its own
 * request"); what was missing is the upper half, so an old request could absorb a
 * much later response that merely reused its pg_net id.
 *
 * The migration's own `do $verify$` block is the behavioural gate -- it reads the
 * live function and the live data. This file guards the SHAPE, because the failure
 * mode is a later CREATE OR REPLACE restating the join with only one bound, which
 * looks correct in isolation.
 *
 * Comments are stripped first: this migration's header quotes the one-sided join
 * and the composite PRIMARY KEY in order to explain them, so a naive scan of the
 * raw file would match the explanation rather than the code.
 */

const MIGRATION = '99991792250145_reaper_two_sided_response_window.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const sql = stripComments(raw);
/** Only the executable half -- the verify block is asserted separately. */
const body = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('reaper two-sided response window', () => {
  it('the comment stripper removes the header that quotes the defect', () => {
    // Positive control. Without it every "not.toMatch" below is vacuous, because
    // the header discusses the one-sided form at length.
    expect(raw).toMatch(/PRIMARY KEY \(run_id, request_id\)/);
    expect(verify).not.toMatch(/PRIMARY KEY \(run_id, request_id\)/);
  });

  it('keeps the lower bound: a response cannot predate its request', () => {
    expect(body).toMatch(/resp\.created >= req\.created_at/);
  });

  it('adds the upper bound: a response cannot arrive after timeout + grace', () => {
    expect(body).toMatch(/resp\.created <= req\.created_at/);
  });

  it('derives the upper bound from the request timeout AND p_grace_seconds', () => {
    // A hardcoded interval would drift from the abandoned branch, and the two
    // would then disagree about what "too late" means.
    expect(body).toMatch(
      /resp\.created <= req\.created_at\s*\+ make_interval\(secs => \(COALESCE\(req\.timeout_ms, 5000\) \/ 1000\.0\) \+ p_grace_seconds\)\)\)/,
    );
  });

  it('preserves the NULL created_at fail-open', () => {
    // Dropping it silently reclassifies every row filed before that column
    // existed as abandoned.
    expect(body).toMatch(/req\.created_at IS NULL\s*\n?\s*OR \(resp\.created >= req\.created_at/);
  });

  it('still joins on the request id, and never on recency or url', () => {
    expect(body).toMatch(/ON resp\.id = req\.request_id/);
    // The two ways CLAUDE.md forbids resolving a pg_net response. `_http_response`
    // has no url column at all, and newest-row matching already mis-read one
    // response during the #2795 verification.
    expect(body).not.toMatch(/order by resp\.created desc/i);
    expect(body).not.toMatch(/resp\.url/i);
  });

  it('leaves the three verdict branches and the grace parameter intact', () => {
    // The window change must not alter how a matched response is judged.
    expect(body).toMatch(/WHEN r\.n_bad > 0 THEN 'error'/);
    expect(body).toMatch(/WHEN r\.n_timeout > 0 THEN 'partial'/);
    expect(body).toMatch(/p_grace_seconds integer default 120/);
    // An unmatched request must stay unverifiable, never an error.
    expect(body).toMatch(/status = 'partial'[\s\S]{0,400}abandoned/);
  });

  it('asserts both bounds in the verify block, not just the join', () => {
    expect(verify).toMatch(/position\('resp\.created >= req\.created_at' in v_src\) = 0/);
    expect(verify).toMatch(/position\('resp\.created <= req\.created_at' in v_src\) = 0/);
  });

  it('asserts the change is a no-op on live open runs', () => {
    // Anchored on the CONDITION, not the message: neutering it to a tautology
    // leaves the RAISE text intact and would otherwise stay green.
    expect(verify).toMatch(/if v_late_open <> 0 then/);
    expect(verify).toMatch(/where run\.status = 'running'/);
  });

  it('has no loosened comparison or short-circuited predicate in the verify block', () => {
    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/if false then/i);
    expect(verify).not.toMatch(/v_late_open\s*(<|>)\s*0/);
    // Every postcondition must actually read something.
    expect((verify.match(/raise exception/gi) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
