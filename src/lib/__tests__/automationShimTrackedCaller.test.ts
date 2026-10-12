import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A cron command already re-pointed at `automation_http_post` matched NEITHER arm of
 * `admin_automation_effective_command`, so it could never acquire the
 * `admin_automation_run_begin` prefix and its pg_net request was filed against no run.
 *
 * Arm 1 keys on `net.http_post` (which a shim-direct command does not contain); arm 2
 * keys on `admin_automation_tracked_callers`, which held only `enqueue_workflow` and
 * `admin_enqueue_workflow`. Registering the shim makes arm 2 match. Measured on prod:
 * exactly ONE registry row is in that blind spot (`enrich_logos_organizations`) and it
 * posts exactly once, which is what makes arm 2's hardcoded `v_expected_requests := 1`
 * correct for it.
 *
 * These assertions guard the two ways this gets quietly undone, and the two things the
 * fix deliberately REFUSES to do — restating the deriver that serves all ~95 wrapped
 * crons, and calling the global reconciler from a migration.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

function latestMatching(pattern: RegExp): { name: string; sql: string } {
  const hit = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))
    .find(({ sql }) => pattern.test(stripComments(sql)));
  if (!hit) throw new Error(`no migration matches ${pattern}`);
  return hit;
}

describe('the automation tracking shim is a registered tracked caller', () => {
  // Found by content, not by filename, so a later migration that re-registers or
  // supersedes this is what gets read.
  const { sql } = latestMatching(
    /insert\s+into\s+public\.admin_automation_tracked_callers[\s\S]*'automation_http_post'/i,
  );
  const body = stripComments(sql);

  it('registers the shim, idempotently', () => {
    expect(body).toMatch(/insert\s+into\s+public\.admin_automation_tracked_callers/i);
    expect(body).toContain("'automation_http_post'");
    // The table's PK is fn_name; without the conflict target a re-run raises 23505.
    expect(body).toMatch(/on\s+conflict\s*\(\s*fn_name\s*\)\s*do\s+nothing/i);
  });

  it('asserts the END STATE, not that a row was inserted', () => {
    // `on conflict do nothing` makes an insert-count assertion pass on a re-run
    // while proving nothing, so P1 tests existence.
    expect(body).toMatch(
      /if\s+not\s+exists\s*\([\s\S]{0,200}admin_automation_tracked_callers[\s\S]{0,200}fn_name\s*=\s*'automation_http_post'/i,
    );
  });

  it('asserts the derivation now wraps the blind-spot row, with the right request count', () => {
    expect(body).toMatch(/admin_automation_effective_command/);
    expect(body).toMatch(/not\s+ilike\s+'%admin\\_automation\\_run\\_begin%'/i);
    // A wrap claiming more requests than the command makes leaves the run
    // permanently short, so the count is asserted and not just the prefix.
    expect(body).toMatch(/admin\\_automation\\_run\\_begin\(''' \|\| v_slug \|\| ''', 1\)/);
  });

  it('bounds its own blast radius and proves arm 1 still carries the fleet', () => {
    // The shim-direct set must still be the ONE row measured: a second row posting
    // twice would be wrapped expecting one request by arm 2's hardcoded count.
    expect(body).toMatch(/v_shim_rows\s*<>\s*1/);
    // And the ~95 already-wrapped rows must still enter arm 1, whose request total
    // is COUNTED rather than flattened to 1. This is the regression the insert
    // could plausibly cause, so it is asserted rather than assumed.
    expect(body).toMatch(/v_arm1_rows\s*<\s*50/);
  });

  it('does NOT restate the deriver that serves every wrapped cron', () => {
    // admin_automation_effective_command derives the command for all ~95 wrapped
    // crons, and this layer has taken the ingest engine down for 40 hours. A
    // one-row insert has a measurable blast radius; a CREATE OR REPLACE does not.
    expect(body).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.admin_automation_effective_command/i,
    );
  });

  it('does NOT call the global reconciler from a migration', () => {
    // sync_automations_to_cron is global: it recreates, re-wraps and unschedules
    // other jobs in the same pass. Whatever drift exists at CI time is not this
    // file's to apply — the nightly automation_cron_sync at 05:10 picks it up.
    expect(body).not.toMatch(/sync_automations_to_cron\s*\(/i);
  });

  it('raises on every gating postcondition rather than only naming it', () => {
    const verify = body.slice(body.indexOf('$verify$'));
    // P1-P4 gate; P5 only reports, because it reads the LIVE cron which the
    // nightly sync has not rewritten yet — gating it would fail on correct code.
    expect((verify.match(/raise exception/g) ?? []).length).toBe(6);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    expect(verify).toMatch(/raise notice[\s\S]{0,200}untracked_http_dispatchers/i);
  });
});
