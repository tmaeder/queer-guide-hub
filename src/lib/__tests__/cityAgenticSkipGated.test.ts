import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `skip_gated: true` in the hourly cron body emptied `gatedProposals` AFTER the
 * array was built, so every review-gated proposal the model produced was
 * discarded before the queue insert — 48 hooks, 42 ratings and 1
 * best_time_to_visit between 2026-09-03 and 2026-09-12, with nothing written
 * down. No queue-depth sentinel can see that: the loss happens before the row
 * exists.
 *
 * Asserted against COMMENT-STRIPPED SQL. The header names every string these
 * tests look for, so an unstripped check passes on the prose with the UPDATE
 * deleted — the trap CLAUDE.md records three times.
 */

function stripSql(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const sql = stripSql(
  readFileSync(
    join(
      process.cwd(),
      'supabase',
      'migrations',
      '20510305090000_city_agentic_enrich_stop_dropping_gated.sql',
    ),
    'utf8',
  ),
);

const body = sql.slice(0, sql.indexOf('$verify$'));
const verify = sql.slice(sql.indexOf('$verify$'));

describe('the registry stops discarding gated proposals', () => {
  it('has a body and a verify block to test against', () => {
    // Guards every assertion below: empty slices make them all vacuous.
    expect(body).toContain('UPDATE public.admin_automations');
    expect(verify).toContain('RAISE EXCEPTION');
  });

  it('removes the flag from the registry command', () => {
    expect(body).toMatch(/'\{"batch_limit": 5, "skip_gated": true\}'/);
    expect(body).toMatch(/'\{"batch_limit": 5\}'/);
  });

  it('is idempotent — guarded on the flag still being there', () => {
    // A concurrent session or the live fix may already have done this; an
    // unguarded UPDATE would be fine here but the guard is what lets the file
    // be re-run and what keeps it a no-op rather than a rewrite.
    expect(body).toMatch(/WHERE slug = 'city_agentic_enrich'[\s\S]{0,120}LIKE '%skip_gated%'/);
  });
});

describe('it does not reach past the registry', () => {
  it('never calls the GLOBAL reconciler', () => {
    // sync_automations_to_cron(true) recreates, re-wraps and KILLS other jobs
    // in the same pass. Whatever drift exists when CI applies this is not this
    // change's to apply. The nightly automation_cron_sync owns propagation.
    expect(sql).not.toMatch(/sync_automations_to_cron\s*\(\s*true\s*\)/);
  });

  it('never schedules or unschedules a cron job', () => {
    // Editing cron.job from a migration is the detect_stale_venues mistake:
    // not durable against the next reconciler pass.
    expect(sql).not.toMatch(/cron\.schedule|cron\.unschedule/);
  });
});

describe('postconditions', () => {
  it('fails if the flag survived', () => {
    expect(verify).toMatch(/v_cmd LIKE '%skip_gated%'[\s\S]{0,160}RAISE EXCEPTION/);
  });

  it('fails if the rewrite ate more than the flag', () => {
    // A replace() that over-matched would pass the skip_gated check and leave a
    // cron that posts nothing useful, or 401s on every call.
    for (const needle of ['batch_limit', 'city-agentic-enrich', 'city_quality_webhook_secret']) {
      expect(verify).toContain(needle);
    }
    expect(verify).toMatch(/NOT LIKE '%batch_limit%'[\s\S]{0,120}RAISE EXCEPTION/);
    expect(verify).toMatch(/NOT LIKE '%city_quality_webhook_secret%'[\s\S]{0,140}RAISE EXCEPTION/);
  });

  it('fails if a synced cron lost its run-tracking wrapper', () => {
    // A job that works but records no runs is how a failing cron reads healthy.
    expect(verify).toMatch(/NOT LIKE '%admin_automation_run_begin%'[\s\S]{0,140}RAISE EXCEPTION/);
  });

  it('reports a not-yet-synced pg_cron rather than asserting it', () => {
    // Between merge and the 05:10 sync the live job legitimately still carries
    // the old command; asserting it here would fail CI for being early.
    // Scoped to that ELSIF's OWN branch: a bare `skip_gated … RAISE NOTICE`
    // span is satisfied by the sibling "already clean" notice and stays green
    // when this branch is turned into an EXCEPTION — measured, that mutation
    // was missed.
    const start = verify.indexOf("ELSIF v_cron_cmd LIKE '%skip_gated%'");
    expect(start, 'the not-yet-synced branch moved or was renamed').toBeGreaterThan(-1);
    const branch = verify.slice(start, verify.indexOf('\n  ELSE', start));
    expect(branch).toMatch(/RAISE NOTICE/);
    expect(branch).not.toMatch(/RAISE EXCEPTION/);
  });

  it('refuses to silently re-enable a disabled automation', () => {
    expect(verify).toMatch(/NOT v_enabled[\s\S]{0,140}RAISE EXCEPTION/);
  });
});
