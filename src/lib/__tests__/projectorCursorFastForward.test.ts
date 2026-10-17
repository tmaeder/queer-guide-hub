import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * admin_automation_project_cron_runs must keep its cursor at the head of
 * cron.job_run_details.
 *
 * cron.job_run_details carries exactly one index -- the pkey on (runid) alone --
 * and cannot be given another (owned by supabase_admin; `create index` on it
 * returns 42501 must be owner of table job_run_details). So the plan for
 * `where jobid = X and runid > cursor` depends entirely on how far back the
 * cursor sits: at the head it is an index scan of 77 blocks, far behind it is a
 * seq scan of 11,551. Before the fix, 286 of 322 automations had zero new rows
 * and never advanced, making admin_automation_project_tick the heaviest
 * statement in the database at 35,266 MB/call and 7.43% of all execution time.
 *
 * These assertions run against the LATEST migration that defines the function,
 * not a pinned filename, so a later CREATE OR REPLACE that drops a guard fails
 * here rather than silently reinstating 322 full scans.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const FN = 'admin_automation_project_cron_runs';

/**
 * Strip SQL comments. Load-bearing: this file's migration explains each guard in
 * prose directly above it, so an assertion over raw source is satisfied by the
 * comment even when the guard itself is gone -- a vacuous test that passes while
 * the defect is live.
 */
function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

function latestDefinition(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let found: { file: string; body: string } | null = null;
  for (const f of files) {
    const raw = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`(create|replace)\\s+function\\s+public\\.${FN}`, 'i').test(stripComments(raw))
    ) {
      found = { file: f, body: raw };
    }
  }
  if (!found) throw new Error(`no migration defines public.${FN}`);
  return found;
}

/** Everything between the function's own dollar-quoted body markers. */
function functionBody(raw: string): string {
  const sql = stripComments(raw);
  const start = sql.indexOf('$function$');
  const end = sql.lastIndexOf('$function$');
  if (start < 0 || end <= start) throw new Error('could not locate $function$ body');
  return sql.slice(start, end);
}

describe('projector cursor fast-forward', () => {
  const { file, body: raw } = latestDefinition();
  const body = functionBody(raw);

  it('is defined by a migration (positive control)', () => {
    // Without this, every assertion below is vacuous against an empty match set.
    expect(file).toMatch(/^\d{14}_.*\.sql$/);
    expect(body.length).toBeGreaterThan(2000);
    expect(body).toContain('cron.job_run_details');
  });

  it('reads the head ONCE, before the outer loop', () => {
    // The whole safety argument is monotonicity: runid comes from a global
    // sequence, so a head read before any row is examined means anything
    // inserted during the call sorts above the cursor and survives to the next
    // tick. Read it inside the loop and that argument collapses.
    const read = body.indexOf('into v_global_max');
    const loop = body.indexOf('for a in');
    expect(read).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(-1);
    expect(read).toBeLessThan(loop);
  });

  it('refuses to jump past a non-terminal run', () => {
    // A run with no outcome yet must be re-read next tick. Assert the CONDITION,
    // not the message or the comment naming it.
    expect(body).toMatch(/v_hit_barrier\s*:=\s*true/);
    expect(body).toMatch(/not\s+v_hit_barrier/);
    // ...and the barrier must be set in the same branch that stops the loop.
    const barrierBranch = body.match(
      /if\s+d\.status\s+not\s+in\s*\(\s*'succeeded'\s*,\s*'failed'\s*\)\s*then([\s\S]{0,200}?)end\s+if/i,
    );
    expect(barrierBranch, 'non-terminal branch missing').not.toBeNull();
    expect(barrierBranch![1]).toMatch(/v_hit_barrier\s*:=\s*true/);
    expect(barrierBranch![1]).toMatch(/\bexit\b/);
  });

  it('refuses to jump past an unread tail', () => {
    // A batch that filled p_limit may have more rows behind it.
    expect(body).toMatch(/v_rows_this_job\s*<\s*p_limit/);
    expect(body).toMatch(/v_rows_this_job\s*:=\s*v_rows_this_job\s*\+\s*1/);
  });

  it('applies both guards to the same jump', () => {
    // Either guard alone is insufficient, so they must gate ONE condition --
    // not sit in separate branches where one can be true while the other is not.
    const jump = body.match(/if\s+not\s+v_hit_barrier([\s\S]{0,400}?)end\s+if/i);
    expect(jump, 'fast-forward branch missing').not.toBeNull();
    expect(jump![1]).toMatch(/v_rows_this_job\s*<\s*p_limit/);
    expect(jump![1]).toMatch(/v_cursor\s*:=\s*v_global_max/);
  });

  it('keeps the failure branch intact', () => {
    // This function is the only evidence of failure for the ~94 net.http_post
    // and enqueue_workflow cron families, and it feeds consecutive_failures ->
    // auto_pause_threshold. The fix must not touch this path.
    expect(body).toMatch(/d\.status\s*=\s*'failed'/);
    expect(body).toContain('cron_startup_timeout');
    expect(body).toMatch(/'job startup timeout'/);
    // A startup timeout is 'partial', never 'error' -- it must not count toward
    // auto-pause.
    expect(body).toMatch(/then\s*'partial'\s*else\s*'error'\s*end/i);
  });

  it('keeps the semantic-run linking intact', () => {
    expect(body).toMatch(/v_linked\s*:=\s*v_linked\s*\+\s*1/);
    expect(body).toContain('linked_semantic_runs');
    expect(body).toMatch(/cron_runid\s+is\s+null/);
  });

  it('still advances the cursor only forward', () => {
    // Forward-only is the invariant the install migration established by seeding
    // every cursor with max(runid). A backwards jump would re-project rows.
    expect(body).toMatch(/v_global_max\s*>\s*v_cursor/);
    expect(body).toMatch(/v_cursor\s*>\s*a\.last_cron_runid/);
  });

  it('does not try to index the cron table', () => {
    // Owned by supabase_admin: `create index` on it returns 42501. Recorded so a
    // future pass does not re-attempt it.
    expect(stripComments(raw)).not.toMatch(/create\s+(unique\s+)?index[^;]*cron\.job_run_details/i);
  });

  it('carries its own apply-time verification', () => {
    const sql = stripComments(raw);
    expect(sql).toMatch(/do\s+\$verify\$/);
    expect(sql).toMatch(/raise\s+exception/i);
  });
});
