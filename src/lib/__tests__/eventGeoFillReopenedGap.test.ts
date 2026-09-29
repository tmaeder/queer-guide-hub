import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790719660_event_geo_fill_refills_a_reopened_gap.sql.
//
// `run_event_geo_fill` visited a row once, ever: its selector was
// `p_force or not (enrichment_status ? 'event_geo_fill')`, so a row whose gap re-opened
// was never refilled. Measured: 291 events visited-and-stuck, of which 50 could have
// coordinates filled from their city right now — including the 2 rows 99991789886174
// retracted, which that migration left permanently uncoordinated.
//
// The three things that must not drift:
//   1. the re-open arm is FILLABLE-GAP driven, so it terminates without an attempts
//      counter — the UPDATE closes exactly the condition that selected the row
//   2. it does NOT widen to every visited row: 240+ rows have nothing fillable and
//      would otherwise re-select nightly on a search-triggered table
//   3. the fill still excludes merged-away cities, or re-opening rows would newly let
//      it read a dead row's centroid — the exact defect this file exists near
//
// Assertions are scoped to the half of the statement they are about. This migration's
// header quotes the predicate, the counts and the column names in prose, so a bare
// toContain over the whole file passes against a gutted selector.

const MIGRATION = '99991790719660_event_geo_fill_refills_a_reopened_gap.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The fill function only. */
const fill = statements.slice(
  statements.indexOf('create or replace function public.run_event_geo_fill'),
  statements.indexOf('create or replace function public.event_geo_derivation_signals'),
);
/** The sentinel only. */
const sentinel = statements.slice(
  statements.indexOf('create or replace function public.event_geo_derivation_signals'),
  statements.indexOf('do $verify$'),
);
/** The postconditions only. */
const verify = statements.slice(statements.indexOf('do $verify$'));
/** The fill's WHERE predicate only — where every selector assertion belongs. */
const predicate = fill.slice(fill.indexOf('where e.duplicate_of_id is null'), fill.indexOf('order by'));

describe('the spans this file depends on', () => {
  it('found the fill, its predicate, the sentinel and the postconditions', () => {
    for (const [name, span] of [
      ['fill', fill],
      ['predicate', predicate],
      ['sentinel', sentinel],
      ['verify', verify],
    ] as const) {
      expect(span.length, `${name} span is empty`).toBeGreaterThan(80);
    }
    expect(predicate).not.toContain('order by');
    expect(fill).not.toContain('do $verify$');
  });
});

describe('the selector re-opens a fillable gap and nothing else', () => {
  it('keeps the never-visited arm, so first visits still happen', () => {
    expect(predicate).toMatch(/not \(coalesce\(e\.enrichment_status, '\{\}'::jsonb\) \? 'event_geo_fill'\)/);
  });

  it('re-opens ONLY when the city can actually supply the coordinates', () => {
    // Both halves are required: the gap, and the city being able to close it. Without
    // the second half the row re-selects every night with nothing to write.
    expect(predicate).toMatch(/\(e\.latitude is null or e\.longitude is null\)\s*\n?\s*and c\.latitude is not null and c\.longitude is not null/);
  });

  it('does not re-open on the stamp alone', () => {
    // The tempting form — treat a legacy stamp as unvisited — re-selects all 291
    // visited rows, 240 of them with nothing fillable, forever.
    expect(predicate).not.toMatch(/enrichment_status->'event_geo_fill'->>'attempts'/);
    expect(predicate).not.toMatch(/\? 'event_geo_fill'\)\s*(is false|= false)/);
  });

  it('re-opens the timezone only via the branch that fills unconditionally', () => {
    // `v_new_tz` takes the city's timezone whenever the city has one, with no reference
    // to c_multizone — so this form needs no copy of that list and the body always
    // closes what it selects.
    expect(predicate).toMatch(/e\.timezone is null and nullif\(btrim\(c\.timezone\), ''\) is not null/);
  });

  it('does NOT claim the country timezone fallback, which depends on a list it cannot see', () => {
    // c_multizone is a PL/pgSQL local. Mirroring it in SQL duplicates a list that can
    // drift, and a predicate claiming fillable while the body computes null is exactly
    // the nightly loop this design avoids.
    expect(predicate).not.toContain('c_multizone');
    expect(predicate).not.toContain('co.timezone');
    expect(predicate).not.toContain('co_tz');
  });

  it('still excludes merged-away cities', () => {
    expect(fill).toMatch(/join public\.cities c on c\.id = e\.city_id and c\.duplicate_of_id is null/);
  });

  it('writes coordinates only from the city, never inventing them', () => {
    const body = fill.slice(fill.indexOf('update public.events e set'));
    expect(body).toMatch(/latitude\s*=\s*case when e\.latitude\s*is null then r\.c_lat/);
    expect(body).toMatch(/'source', 'derived:city_centroid'/);
    // and it still stamps the cursor, or a filled row would be re-selected forever
    expect(body).toMatch(/'\{event_geo_fill\}'/);
  });
});

describe('the sentinel', () => {
  it('reports probe_ok and the totals separately from the counts', () => {
    // An empty table, a revoked grant and a clean corpus all give the same zero.
    expect(sentinel).toContain("'probe_ok', true");
    expect(sentinel).toContain("'events_with_gap'");
    expect(sentinel).toContain("'never_visited'");
  });

  it('carries the stale-centroid zero-invariant with its examples', () => {
    expect(sentinel).toContain("'stale_centroid_far'");
    expect(sentinel).toContain("'stale_centroid_examples'");
    // keyed on the merged-away row being a DIFFERENT place, not merely merged
    expect(sentinel).toMatch(/d\.duplicate_of_id is not null/);
    expect(sentinel).toMatch(/> 250000/);
  });

  it('separates the drainable backlog from the correctly-done rows, on BOTH axes', () => {
    expect(sentinel).toContain("'stuck_fillable_coords'");
    // the timezone axis is drainable too since 99991790714809 showed it can go stale
    expect(sentinel).toContain("'stuck_fillable_tz'");
    expect(sentinel).toContain("'stuck_nothing_fillable'");
  });

  it('excludes BOTH fillable axes from the nothing-fillable count', () => {
    // Otherwise a tz-fillable row is counted as "correctly exhausted" as well as
    // drainable, which inflates the number the widening mirror reads and weakens it.
    const nothing = sentinel.slice(sentinel.indexOf("'stuck_nothing_fillable'"));
    expect(nothing).toMatch(/not \(\(latitude is null or longitude is null\) and c_lat is not null/);
    expect(nothing).toMatch(/not \(tz is null and nullif\(btrim\(c_tz\), ''\) is not null\)/);
  });

  it('is service_role only — a definer aggregate granted to authenticated is public', () => {
    expect(statements).toMatch(/revoke all on function public\.event_geo_derivation_signals\(\) from anon, authenticated/);
    expect(statements).toMatch(/grant execute on function public\.event_geo_derivation_signals\(\) to service_role/);
    expect(statements).not.toMatch(/grant execute on function public\.event_geo_derivation_signals\(\) to (anon|authenticated)/);
  });
});

describe('postconditions', () => {
  it('asserts the arm is in the DEPLOYED body, not just in this file', () => {
    expect(verify).toContain('pg_get_functiondef');
    expect(verify).toContain('P1 failed');
    expect(verify).toContain('P2 failed');
  });

  it('proves the migration fixes something measurable', () => {
    // A selector change that reaches zero rows is indistinguishable from a no-op.
    // Anchored on CODE, not on 'P3': `verify` is comment-stripped, so the first
    // literal "P3" is inside the RAISE message itself and a slice from there is EMPTY —
    // which passes every assertion scoped to it. This test was written that way first.
    const p3 = verify.slice(verify.lastIndexOf('into v_n', verify.indexOf('P3 failed')), verify.indexOf('P3 failed'));
    expect(p3.length, 'the P3 span is empty, so this assertion checks nothing').toBeGreaterThan(60);
    expect(verify).toContain('fixes nothing measurable');
    expect(p3).toMatch(/\? 'event_geo_fill'/);
  });

  it('asserts the nothing-fillable cohort did NOT become reachable', () => {
    // The mirror. "The stuck rows are reachable" is equally satisfied by re-opening
    // all 291, which is the failure mode this whole design avoids.
    expect(verify).toContain('P5 failed');
    const p5 = verify.slice(verify.indexOf('P5 MIRROR') >= 0 ? verify.indexOf('stuck_nothing_fillable') : 0);
    expect(verify).toMatch(/stuck_nothing_fillable'\)::int = 0/);
    expect(p5).toBeTruthy();
  });

  it('asserts something actually drains the reopened rows', () => {
    // A selector that reaches rows nothing runs against is the "shipped and wired to
    // nothing" failure this repo keeps recording.
    expect(verify).toMatch(/from cron\.job/);
    expect(verify).toMatch(/run_event_geo_fill%' and active/);
    expect(verify).toContain('P6 failed');
  });

  it('uses no loosened comparison that would stop the checks counting', () => {
    expect(verify).not.toMatch(/\bfalse\b\s*(then|;)/);
    expect(verify).toMatch(/stale_centroid_far'\)::int <> 0/);
  });
});
