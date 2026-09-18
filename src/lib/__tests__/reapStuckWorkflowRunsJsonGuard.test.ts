import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `reap_stuck_workflow_runs()` is the ONLY writer that clears stale
 * `workflow_runs.status = 'running'`, and the `workflow-dispatcher` refuses to dispatch above a
 * max-concurrency ceiling counted from exactly those rows. So when this function dies, the count
 * only ever grows, the dispatcher stops dispatching, `pgmq.q_pipeline_steps` stops being consumed
 * and every ingestion DAG stalls — measured 2026-09-18: 225 stale rows, 174 queue messages with
 * `read_ct = 0`, eight pipelines alerting at once, 36 hours.
 *
 * It died on a ONE-CHARACTER test. The old guard was
 *
 *     left(ltrim(COALESCE(resp.content,'')), 1) IN ('{','[')
 *
 * which asks "does this body begin like JSON", not "is this body JSON". A truncated response that
 * starts with `[` passes it and then raises on `::jsonb`, aborting the whole UPDATE:
 *
 *     ERROR: invalid input syntax for type json
 *     DETAIL: Token ""8ad04290-f646-423" is invalid.
 *
 * 43 consecutive failures tripped `auto_pause_threshold = 3`, and the nightly
 * `automation_cron_sync` then unscheduled the job.
 *
 * THE FAILURE IS INVISIBLE TO EVERY COUNTER, which is why it is pinned here rather than left to a
 * health probe: the dispatcher answers `HTTP 200 {"success":true,"message":"Max concurrency
 * reached, skipping dispatch"}`, so pg_net books a success, `consecutive_failures` stays 0 and
 * auto-pause can never fire on the dispatcher itself.
 */

const MIGRATION = '20260918164734_reap_stuck_workflow_runs_tolerates_truncated_json.sql';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** The repo keeps its reasoning in migration headers, and a comment must never satisfy a guard. */
const statements = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/**
 * The function body ONLY. The migration's own `do $verify$` postcondition necessarily quotes the
 * broken guard verbatim in order to assert it is gone, so a "must not contain" check run over the
 * whole file fails on correct code — the mirror of the vacuous-assertion trap: anchor a negative
 * on what is WRITTEN, not on the statement that checks it.
 */
const functionBody = statements.split('do $verify$')[0];

describe('reap_stuck_workflow_runs tolerates a truncated response body', () => {
  it('validates the whole body, not its first character', () => {
    expect(statements).toContain("pg_input_is_valid(COALESCE(resp.content,''), 'jsonb')");
  });

  it('does not reintroduce the first-character test', () => {
    expect(functionBody).not.toContain("left(ltrim(COALESCE(resp.content,'')), 1)");
    // Positive control: the postcondition that asserts its absence must still be present, or the
    // check above is satisfied by a migration that simply stopped checking.
    expect(statements).toContain("left(ltrim(COALESCE(resp.content,'')), 1)");
  });

  it('still casts only what validated, and still nulls what did not', () => {
    // The point is a NULL output_result for an unparseable body — never an aborted statement, and
    // never an unguarded cast.
    expect(statements).toMatch(/pg_input_is_valid[\s\S]{0,80}THEN resp\.content::jsonb ELSE NULL END/);
  });

  it('keeps both reap branches — the fix must not narrow what the reaper clears', () => {
    // If either branch were dropped, stale rows would accumulate again and the ceiling would
    // re-pin. The definition-timeout branch and the orphan branch each clear rows the other
    // cannot see.
    expect(statements).toContain('reaped: workflow_run running > %s s without completion');
    expect(statements).toContain('reaped: orphan workflow_run running > 30min');
  });

  it('refuses to re-enable a row it cannot also reschedule', () => {
    // Re-enabling an `rpc` row leaves it on-but-unscheduled, which reads healthy and is not —
    // the documented recovery trap. The guard must check the action type, not just flip `enabled`.
    expect(statements).toContain("a.action->>'type'");
    expect(statements).toContain("(a.action->>'command') is not null");
    expect(statements).toMatch(/if v_kind <> 'cron' or not v_has_command then[\s\S]{0,200}raise exception/);
  });

  it('asserts the reached state rather than counting its own writes', () => {
    expect(statements).toMatch(/if position\('pg_input_is_valid' in v_src\) = 0 then[\s\S]{0,120}raise exception/);
    expect(statements).toMatch(/if not v_enabled then[\s\S]{0,120}raise exception/);
  });
});
