import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for the tag category TEXT mirror reconciler (20261006180000).
 *
 * `unified_tags.category` stores a category NAME as text. The junction
 * (`tag_category_assignments`) references the category by id, so a rename in
 * `tag_categories` updates the junction for free and silently rots every text
 * mirror. Taxonomy v3 renamed ~24 categories in place on 2026-08-29 and left 321
 * rows naming a category that exists under no name — which is exactly what
 * `tag_vocabulary_health().legacy_category_values` counts, and one of the five
 * hard zeros check #8 of scripts/data-quality/e2e-tag-taxonomy.mjs asserts.
 *
 * The repair function `run_tag_category_resync` had existed since 20260802105740
 * and was in no cron and no registry row, so nothing reconciled the mirror. These
 * tests fail if that scheduling is dropped again, or if the pair is split so that
 * only one half survives — the failure mode the cron-registry contract exists to
 * prevent (a live cron with no registry row is unregistered and never auto-killed;
 * a registry row with no cron for an `rpc` automation can never be rescheduled by
 * sync_automations_to_cron, because an rpc row carries no action.command).
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');
const SLUG = 'tag_category_text_resync';

/** The latest migration that schedules the reconciler, so a later re-scheduling wins. */
function latestSchedulingMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    if (sql.includes(`cron.schedule('${SLUG}'`)) return { file, sql };
  }
  throw new Error(
    `no migration schedules the "${SLUG}" cron — the tag category text mirror has no reconciler`,
  );
}

describe('tag category text mirror reconciler', () => {
  const { sql } = latestSchedulingMigration();

  it('schedules the cron against run_tag_category_resync', () => {
    expect(sql).toContain(`cron.schedule('${SLUG}'`);
    expect(sql).toMatch(/run_tag_category_resync\(\s*\d+\s*\)/);
  });

  it('registers the automation in the same migration, enabled', () => {
    // Registry row and cron must ship together: the registry is the record of
    // record, and a cron without one is reported as unregistered and never
    // auto-killed.
    expect(sql).toContain('insert into public.admin_automations');
    expect(sql).toContain(`'${SLUG}'`);
    expect(sql).toContain(`"fn":"run_tag_category_resync"`);
  });

  it('uses the same schedule in the registry row and in pg_cron', () => {
    // Drift between the two is invisible until sync_automations_to_cron runs.
    const schedules = [...sql.matchAll(/'(\d+ \d+ \* \* \*)'/g)].map((m) => m[1]);
    expect(schedules.length).toBeGreaterThanOrEqual(2);
    expect(new Set(schedules).size).toBe(1);
  });

  it('drains to a fixed point rather than assuming one batch', () => {
    // run_tag_category_resync is batch-capped and its LIMIT has no ORDER BY, so
    // a single call is not guaranteed to converge.
    expect(sql).toMatch(/loop/i);
    expect(sql).toMatch(/exit when/i);
  });

  it('asserts the health metric reaches zero, naming the offenders', () => {
    // The bare count was never enough to act on; the sample is what makes a
    // failure diagnosable.
    expect(sql).toContain('not in (select name from public.tag_categories)');
    expect(sql).toMatch(/raise exception[^;]*dead category/i);
    expect(sql).toMatch(/string_agg\(distinct category/);
  });

  it('sets the statement timeout at top level, not inside the DO block', () => {
    // The timer is armed when the top-level statement starts, so a function
    // cannot raise its own timeout — setting it inside the block is a no-op.
    const timeoutIdx = sql.indexOf('set local statement_timeout');
    const doIdx = sql.indexOf('do $mig$');
    expect(timeoutIdx).toBeGreaterThan(-1);
    expect(doIdx).toBeGreaterThan(-1);
    expect(timeoutIdx).toBeLessThan(doIdx);
  });
});
