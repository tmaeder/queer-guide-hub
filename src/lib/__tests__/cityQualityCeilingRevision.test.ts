import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the 2026-09-29 city-quality ceiling revision and the one-row repair beside it.
//
// The gate `Critical data-quality gates` compares `city_quality_scorecard()` against
// scripts/city-quality-baseline.json and had gone red on SEVEN counters, reddening every
// open PR in the repo. Five were one bulk import (3,336 gayout venues on 2026-09-28) and
// are renegotiated with derived headroom. TWO WERE ZERO-INVARIANTS AND ARE NOT
// RENEGOTIATED -- `run_event_city_link` quarantined the three mislinked events on its own
// and 99991790714809 cleared the stale timezone that quarantine left behind.
//
// Verified on prod after applying: all seven counters under their ceilings
// (publication_blocked 1037<=1122, ambiguous 416<=501, image_reused 279<=343,
// namesake 0<=0, country_mismatch 0<=0, unlinked_venues 6827<=10163,
// unlinked_events 815<=851).

const MIGRATION = '99991790714809_city_link_namesake_country_repair.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Comment-stripped. The header names the rows, the excluded cohort and the mechanism in
// prose, so a whole-file `toContain` would be satisfiable by the comments alone.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const stmt = sql.split('do $verify$')[0];
const verify = sql.slice(sql.indexOf('do $verify$'));
// The SET clause alone. The WHERE clause guards on `e.timezone = 'Europe/London'`, so
// an assertion about what the migration WRITES must not be able to match the
// precondition that decides whether it writes at all.
const setClause = stmt.slice(stmt.indexOf('set '), stmt.lastIndexOf('where '));

const baseline = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/city-quality-baseline.json'), 'utf8'),
);

describe('the city-quality baseline revision', () => {
  it('never raises a zero-invariant', () => {
    // A zero-invariant gets repaired, never renegotiated. These two are the whole
    // reason the revision is legitimate: the other five moved with an import, these
    // two were defects.
    expect(baseline.issues.CITY_LINK_NAMESAKE).toBe(0);
    expect(baseline.issues.CITY_LINK_COUNTRY_MISMATCH).toBe(0);
    expect(baseline.issues.CITY_DUPLICATE_UNRESOLVED).toBe(0);
    expect(baseline.issues.CITY_GHOST_EXPOSED).toBe(0);
    expect(baseline.issues.CITY_PLACEHOLDER_EXPOSED).toBe(0);
  });

  it('raises exactly the five import-driven counters', () => {
    expect(baseline.publication_blocked).toBe(1122);
    expect(baseline.issues.CITY_IDENTITY_AMBIGUOUS).toBe(501);
    expect(baseline.issues.CITY_IMAGE_REUSED).toBe(343);
    expect(baseline.operations.unlinked_venues).toBe(10163);
    expect(baseline.operations.unlinked_events).toBe(851);
  });

  it('records a reason for the revision that names the measured cause', () => {
    const rev = baseline.revisions.at(-1);
    expect(rev.revised_at).toBe('2026-09-29T00:00:00Z');
    // Every raise must be accounted for by a measurement, not by "it went up".
    for (const needle of ['gayout', '3,336', '72.3%', 'venue-city-match', 'queer_image_backfill']) {
      expect(rev.reason).toContain(needle);
    }
    // And it must say why the zero-invariants are NOT in the raise set.
    expect(rev.reason).toMatch(/zero-invariant gets repaired, never renegotiated/i);
    expect(Object.keys(rev.raised)).not.toContain('issues.CITY_LINK_NAMESAKE');
    expect(Object.keys(rev.raised)).not.toContain('issues.CITY_LINK_COUNTRY_MISMATCH');
  });

  it('names the wrong-instrument cost instead of hiding it', () => {
    // A depth ceiling on a self-draining inflow queue is the wrong instrument, and the
    // headroom it needs could hide a real producer regression. That cost is stated and
    // the existing right instrument is named, rather than the number being quietly
    // loosened.
    const rev = baseline.revisions.at(-1);
    expect(rev.reason).toContain('image_automation_no_progress');
    expect(rev.reason).toMatch(/could hide|worse trade|real cost/i);
  });

  it('keeps every ceiling at or above the value measured on prod', () => {
    // Pinning at the exact snapshot with zero headroom is the defect the previous
    // revision diagnosed: it makes the gate a coin flip that reds PRs at random.
    const measured = {
      publication_blocked: 1037,
      CITY_IDENTITY_AMBIGUOUS: 416,
      CITY_IMAGE_REUSED: 279,
      unlinked_venues: 6827,
      unlinked_events: 815,
    };
    expect(baseline.publication_blocked).toBeGreaterThan(measured.publication_blocked);
    expect(baseline.issues.CITY_IDENTITY_AMBIGUOUS).toBeGreaterThan(
      measured.CITY_IDENTITY_AMBIGUOUS,
    );
    expect(baseline.issues.CITY_IMAGE_REUSED).toBeGreaterThan(measured.CITY_IMAGE_REUSED);
    expect(baseline.operations.unlinked_venues).toBeGreaterThan(measured.unlinked_venues);
    expect(baseline.operations.unlinked_events).toBeGreaterThan(measured.unlinked_events);
  });
});

describe('the stale-timezone repair', () => {
  it('clears the timezone and records the value it removed', () => {
    expect(stmt).toMatch(/timezone\s*=\s*null/);
    expect(stmt).toContain("'stale_timezone_cleared', 'Europe/London'");
  });

  it('does not write a replacement timezone', () => {
    // Prefer NULL to a guess: the row has no city link to corroborate against and
    // Canada spans six zones, so run_event_timezone_fill derives it later.
    //
    // Asserted as "no string is ever ASSIGNED to timezone", not as "America/Toronto
    // does not appear". The statement legitimately names that zone inside the
    // `reason` it stamps, to record why it was NOT written — a substring ban fires on
    // the explanation and would force the reasoning out of the row to keep the test
    // green. Caught by running these assertions before committing.
    //
    // Scoped to the SET clause: the WHERE clause guards on
    // `e.timezone = 'Europe/London'`, and a whole-statement match is satisfied by that
    // precondition — an assertion about what a statement WRITES must not be able to
    // match the condition deciding whether it writes.
    expect(setClause).not.toBe('');
    expect(setClause).not.toMatch(/timezone\s*=\s*'/);
    expect(setClause).toMatch(/timezone\s*=\s*null/);
  });

  it('touches exactly one row, by id, guarded on the value it expects', () => {
    const ids = stmt.match(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/g) ?? [];
    expect(new Set(ids).size).toBe(1);
    expect(stmt).toMatch(/and e\.timezone = 'Europe\/London'/);
  });

  it('is soft on preconditions so a cron that got there first cannot abort db push', () => {
    expect(stmt).not.toMatch(/get diagnostics/);
  });

  it('builds provenance with || and never jsonb_set create_missing', () => {
    expect(stmt).not.toMatch(/jsonb_set/);
    expect(stmt).toMatch(/coalesce\(e\.enrichment_status,\s*'\{\}'::jsonb\)\s*\n?\s*\|\|/);
  });

  it('asserts the corpus-wide condition, not just the one row', () => {
    // A future guard that leaves another cross-region timezone behind must fail here.
    expect(verify).toMatch(/v_contradict\s*<>\s*0/);
    expect(verify).toMatch(
      /split_part\(e\.timezone, '\/', 1\) is distinct from split_part\(co\.timezone, '\/', 1\)/,
    );
  });

  it('keeps the unprovable rows as an explicit control', () => {
    // 20 within-region timezones are deliberately NOT swept. A migration that nulled
    // every quarantined timezone would satisfy every other assertion here.
    expect(verify).toMatch(/v_control_kept\s*<\s*15/);
  });

  it('asserts the row stays unlinked and keeps its city text', () => {
    expect(verify).toMatch(/v_still_null\s*<>\s*1/);
    expect(verify).toMatch(/v_city_text\s*<>\s*1/);
  });
});
