import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The event dedup sweep's arms, pinned.
 *
 * Before 20270822093513 the two auto arms both required a venue and matched ZERO
 * pairs on the live corpus — 5.4% of events carry a venue_id, 17.5% a venue_name —
 * so the nightly sweep ran green in mode='full' and merged nothing for eleven days
 * while 84 pairs aged in the review queue.
 *
 * The arm that replaced that silence comes from the reviewers, not from a hunch: all
 * 50 event pairs a human has ever rejected carry the note "separate showtimes of one
 * production", and every one has a DIFFERENT start_date. Same title + same instant +
 * same city is therefore a duplicate, and the vetoes below are what keep it that way.
 *
 * Each of these assertions was mutation-tested against a scratch copy of the branch:
 * flipping the predicate it guards makes the test fail. A guard that also passes on
 * the broken input is guarding nothing.
 *
 * Text check against the migrations directory — no credentials, same pattern as
 * `src/lib/__tests__/dedupCityGeoArm.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('run_dedup_truth_sweep');

/** The `when 'event' then $q$ … $q$` candidate query, and only that branch. */
function eventBranch(): string {
  const start = sql.indexOf("when 'event' then $q$");
  expect(start, "the sweep has a `when 'event'` branch").toBeGreaterThan(-1);
  const end = sql.indexOf('$q$', start + "when 'event' then $q$".length);
  return sql.slice(start, end);
}

describe('run_dedup_truth_sweep event arms', () => {
  it('carries the exact-instant auto arm', () => {
    expect(eventBranch()).toContain('exact_instant_same_city');
  });

  // The veto that matters most. `is not distinct from` is the tempting spelling and
  // it is wrong: two NULL city_ids satisfy it, and 2 live pairs are exactly that.
  // "Dining out for Life" runs the same day in Asheville, Seattle and Minneapolis.
  it('requires a real, equal city — never `is not distinct from`', () => {
    const branch = eventBranch();
    expect(branch).toMatch(/a\.city_id is not null and a\.city_id = b\.city_id/);
    expect(branch).not.toMatch(/city_id is not distinct from/);
  });

  // A midnight stamp is a placeholder. Two of them agree only on the date, which is
  // already the blocking key, so they add no evidence and must not auto-merge.
  it('treats a midnight timestamp as a placeholder, not a measurement', () => {
    const branch = eventBranch();
    expect(branch).toMatch(/start_date::time = time '00:00:00'/);
    expect(branch).toMatch(/not midnight/);
  });

  // Containment is the reverted 20260510110000 rule. It comes back as a candidate
  // generator only: its failure mode is sub-events ("Muscle Classic V Pre-Party" vs
  // "Muscle Classic V"), which are programme relationships, not duplicates.
  it('never lets a containment pair reach is_auto', () => {
    const branch = eventBranch();
    expect(branch).toContain('title_containment_same_instant');
    // `not same_title` is the FIRST rung, so every later rung is implicitly
    // same_title. Widening the blocking key without this let 10 containment pairs
    // reach the 0.97/0.96 venue arms.
    expect(branch).toMatch(/case when not same_title then 'title_containment_same_instant'/);
    // Assert against the is_auto LIST itself, not everything after the word
    // "is_auto" — the confidence ladder below it legitimately names the containment
    // arm (at 0.85), so a looser slice fails on correct code.
    const autoList = branch.match(/arm in \(([\s\S]*?)\) is_auto/);
    expect(autoList, 'is_auto must be an `arm in (...)` list').toBeTruthy();
    expect(autoList![1]).not.toContain('title_containment_same_instant');
    expect(autoList![1]).toContain('exact_instant_same_city');
  });

  // One ladder: is_auto, conf and reason all read off `arm`. Two parallel CASE
  // expressions is what let them disagree in an earlier draft — measured, it emitted
  // 'exact_instant_midnight' at both 0.85 and 0.80, the 0.80 rows being pairs that
  // shared no instant at all.
  it('derives is_auto, confidence and reason from a single arm ladder', () => {
    const branch = eventBranch();
    expect(branch).toMatch(/end arm/);
    expect(branch).toMatch(/case arm when 'despace_same_venue_48h'/);
    expect(branch).toMatch(
      /arm in \('despace_same_venue_48h','despace_same_venue_name_exact_ts',\s*'exact_instant_same_city'\) is_auto/,
    );
  });

  it('keeps the showtime suppressor and its coalesce', () => {
    const branch = eventBranch();
    // The coalesce is load-bearing: a NULL source_slug on one side makes the
    // conjunction NULL, and NULL is not false.
    expect(branch).toMatch(
      /coalesce\(a\.source_slug = b\.source_slug[\s\S]*?a\.start_date <> b\.start_date, false\) is_showtime/,
    );
    expect(branch).toMatch(/where not is_showtime/);
  });

  // A NULL is_auto reached the reviewer as `auto_eligible: null` and made
  // `order by is_auto desc` meaningless. Every arm predicate is coalesced.
  it('never yields a null arm predicate', () => {
    const branch = eventBranch();
    for (const pred of [
      'same_title',
      'same_instant_city',
      'midnight',
      'venue_conflict',
      'arm_venue_id',
      'arm_venue_name',
      'arm_cross_source',
    ]) {
      expect(branch, `${pred} must be coalesced to false`).toMatch(
        new RegExp(`coalesce\\([\\s\\S]*?, false\\) ${pred}`),
      );
    }
  });

  // Widening the blocking key must not widen the 0.80 fallback, whose queue a human
  // already had to clear 50 rows of.
  it('drops containment pairs that do not also share an instant and city', () => {
    expect(eventBranch()).toMatch(/where not is_showtime and \(same_title or same_instant_city\)/);
  });

  it('keeps the pre-existing venue arms intact', () => {
    const branch = eventBranch();
    expect(branch).toContain('despace_same_venue_48h');
    expect(branch).toContain('despace_same_venue_name_exact_ts');
    expect(branch).toContain('cross_source_venue_substring_2h');
  });
});

describe('event dedup review payload', () => {
  it('gives the reviewer the start time the decision turns on', () => {
    // Every one of the 50 rejections hinged on start_date, which the old payload
    // (two titles, a null distance, a match_type) did not carry.
    const helper = latestDefinitionOf('_dedup_event_cluster_side');
    for (const field of ['start_date', 'city', 'venue_name', 'source']) {
      expect(helper, `cluster side must carry ${field}`).toContain(`'${field}'`);
    }
    expect(sql).toContain('_dedup_event_cluster_side(v_keep)');
    expect(sql).toContain('_dedup_event_cluster_side(v_drop)');
  });
});
