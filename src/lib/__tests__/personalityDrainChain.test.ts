import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 929 personality staging rows sat pending for 24 days with ZERO
 * ingestion_events while the nightly DAG reported completed/items_succeeded=979.
 * Cause: rows staged outside a DAG run carry `pipeline_run_id IS NULL`, and
 * validate/deduplicate/review-gate/commit all filter `.eq('pipeline_run_id', …)`,
 * which never matches NULL.
 *
 * Asserted against COMMENT-STRIPPED SQL. This migration's header is long and
 * names every string these tests look for, so an unstripped check would pass on
 * the prose with the statement deleted — the trap CLAUDE.md records three times.
 *
 * The migration is located by NAME SUFFIX, not by version: these versions get
 * renumbered when main's ceiling moves, and a test pinned to a literal filename
 * fails with ENOENT rather than an assertion.
 */

function stripSql(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const SUFFIX = '_personality_drain_chain_and_orphan_sentinel.sql';

const migrationFile = readdirSync(MIGRATIONS).find((f) => f.endsWith(SUFFIX));

const sql = stripSql(readFileSync(join(MIGRATIONS, migrationFile!), 'utf8'));

/**
 * The body of staging_orphan_signals() alone. Load-bearing: `COMMENT ON … IS '…'`
 * is a SQL string literal that stripSql() cannot remove, and its text restates
 * the very predicates these tests look for — so a whole-file assertion passes
 * with the real WHERE clause deleted.
 */
const fnBody = sql.match(/AS \$fn\$([\s\S]*?)\$fn\$;/)?.[1] ?? '';

const health = readFileSync(join(process.cwd(), 'scripts', 'check-pipeline-health.mjs'), 'utf8');

describe('personality drain chain migration', () => {
  it('exists', () => {
    expect(migrationFile).toBeDefined();
  });

  it('the sentinel selects on pipeline_run_id IS NULL — the whole point', () => {
    // `.eq()` never matches NULL, which is why these rows are invisible to the
    // DAG. Without this predicate the function measures an unrelated backlog.
    //
    // Asserted against the FUNCTION BODY, not the file: `COMMENT ON … IS '…'` is
    // a SQL string literal, so stripSql() does not remove it and a whole-file
    // toMatch stayed green with the WHERE clause mutated away. Caught by
    // mutation testing, which is the only reason this is scoped.
    expect(fnBody).toMatch(/pipeline_run_id\s+IS\s+NULL/i);
  });

  it('judges progress by ingestion_events, never by updated_at', () => {
    // The 2026-09-13 visibility repair touched all 929 rows, so updated_at reads
    // "recently touched" for a cohort nothing has ever processed. A stage-advance
    // event cannot be forged by an unrelated UPDATE. Scoped for the same reason
    // as the assertion above — the COMMENT ON text names ingestion_events too.
    expect(fnBody).toMatch(/JOIN\s+public\.ingestion_events/i);
    expect(fnBody).toMatch(/max\(\s*e\.created_at\s*\)/i);
    expect(fnBody).not.toMatch(/updated_at/i);
  });

  it('derives unconsumed_targets from a missing advance, not from a row count', () => {
    // A depth threshold is what hid this for 24 days. The hard-fail key must be
    // "nothing advanced it", which is independent of how big the backlog is.
    expect(fnBody).not.toBe('');
    const key = fnBody.match(/'unconsumed_targets'[\s\S]{0,400}/i)?.[0] ?? '';
    expect(key).toMatch(/last_advance\s+IS\s+NULL/i);
  });

  it('reports probe_ok so an absent answer cannot read as a clean corpus', () => {
    expect(sql).toMatch(/'probe_ok'\s*,\s*true/i);
  });

  it('keeps the sentinel service_role-only and SECURITY INVOKER', () => {
    // Definer-by-reflex is what leaked safety-gated events to anon via
    // _dedup_venue_cluster_side. service_role bypasses RLS on its own.
    expect(sql).toMatch(/SECURITY\s+INVOKER/i);
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.staging_orphan_signals\(\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.staging_orphan_signals\(\)\s+TO\s+service_role/i,
    );
  });

  it('schedules crons with the WRAPPED command, so they are tracked from the first fire', () => {
    // A cron installed by a migration carries the RAW command and runs untracked
    // until the nightly 05:10 reconciler rewrites it: no admin_automation_runs
    // row, consecutive_failures never moves, auto-pause cannot fire.
    const sched = sql.match(/DO \$sched\$[\s\S]*?\$sched\$;/)?.[0] ?? '';
    expect(sched).toMatch(/admin_automation_effective_command/);
    expect(sched).toMatch(/cron\.schedule/);
  });

  it('never calls the global reconciler', () => {
    // sync_automations_to_cron(true) is global and can recreate, re-wrap and
    // unschedule unrelated jobs in the same pass.
    expect(sql).not.toMatch(/sync_automations_to_cron\s*\(\s*true\s*\)/i);
  });

  it('is soft on preconditions and hard on postconditions', () => {
    // A concurrent session may already have enabled these; aborting then would
    // block every migration queued behind it on main.
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.admin_automations/i);
    const verify = sql.match(/DO \$verify\$[\s\S]*?\$verify\$;/)?.[0] ?? '';
    expect(verify).toMatch(/expected 4 enabled/i);
    expect(verify).toMatch(/expected 4 active/i);
    expect(verify).toMatch(/scheduled unwrapped/i);
  });

  it('asserts the http drains are wrapped but exempts the pure-SQL commit stage', () => {
    const verify = sql.match(/DO \$verify\$[\s\S]*?\$verify\$;/)?.[0] ?? '';
    // Scoped to the SELECT that computes v_unwrapped. A window opened at the
    // DECLARE swallows the v_scheduled block, which legitimately names all four
    // jobs — and the negative assertion below then fails on a correct migration.
    const unwrapCheck = verify.match(/SELECT count\(\*\) INTO v_unwrapped[\s\S]*?;/)?.[0] ?? '';
    expect(unwrapCheck).not.toBe('');
    expect(unwrapCheck).toMatch(/personality-drain-validate/);
    expect(unwrapCheck).toMatch(/personality-drain-review/);
    // commit_personality_staging_batch is family C: no http post, so requiring
    // automation_http_post on it would fail a correct deploy.
    expect(unwrapCheck).not.toMatch(/personality-drain-commit/);
  });
});

describe('check-pipeline-health wiring', () => {
  it('calls the sentinel', () => {
    expect(health).toMatch(/rpc\/staging_orphan_signals/);
  });

  it('hard-fails on unconsumed targets, and only warns while a drain is advancing them', () => {
    const block = health.match(/staging_orphan_signals[\s\S]{0,2600}/)?.[0] ?? '';
    expect(block).toMatch(/unconsumed_targets\.length\s*>\s*0/);
    // The FAILED assignment must live in the unconsumed branch, not the warn one.
    const failBranch = block.match(
      /unconsumed_targets\.length\s*>\s*0[\s\S]*?FAILED\s*=\s*true/,
    )?.[0];
    expect(failBranch).toBeDefined();
    expect(block).toMatch(/console\.warn\([^)]*Staging orphans draining/);
  });

  it('treats a broken or absent probe as a failure, never as clean', () => {
    const block = health.match(/staging_orphan_signals[\s\S]{0,2600}/)?.[0] ?? '';
    expect(block).toMatch(/probe_ok\s*!==\s*true/);
    expect(block).toMatch(/measured NOTHING/);
  });
});
