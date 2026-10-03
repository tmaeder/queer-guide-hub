/**
 * Guards `99991791024657_venue_linker_distance_gate.sql`.
 *
 * `link_event_venues` auto-linked on `name_exact AND distance_m < 500`. That
 * 500 m measured the gap between an event's CITY CENTROID and a venue's street
 * address, not a disagreement — `find_event_venue_candidates` already joins
 * `venues v ON v.city_id = ev.city_id`, so same-city is structural. Measured on
 * prod: 334 of 540 unique name-exact events passed; at 100 km it is 540, and
 * the largest distance in the whole candidate set is 11.29 km.
 *
 * Assertions run against COMMENT-STRIPPED source. The header quotes the old
 * bound, the new bound and the predicate verbatim, so a search over raw text
 * passes while the executable statement is gone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991791024657_venue_linker_distance_gate';
const SRC = readFileSync(join(process.cwd(), 'supabase/migrations', `${MIGRATION}.sql`), 'utf8');

const code = SRC.split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const patchBlock = (() => {
  const from = code.indexOf('do $patch$');
  const to = code.indexOf('do $verify$');
  expect(from, 'the patch block must exist').toBeGreaterThan(-1);
  expect(to, 'the verify block must follow the patch').toBeGreaterThan(from);
  return code.slice(from, to);
})();

const verifyBlock = code.slice(code.indexOf('do $verify$'));

describe('venue linker gate — patches rather than restates', () => {
  it('reads the live definition instead of retyping the function', () => {
    // Restating ~70 lines would silently revert a concurrent change to the only
    // function that auto-creates event→venue links (the 99991790719601 trap).
    expect(patchBlock).toContain('pg_get_functiondef(p.oid)');
    expect(patchBlock).toContain('execute v_new');
  });

  it('never contains a CREATE OR REPLACE of the function itself', () => {
    expect(code).not.toMatch(/create\s+or\s+replace\s+function\s+public\.link_event_venues/i);
  });

  it('resolves the function by its exact signature', () => {
    // There must be no ambiguity about which overload is patched; PostgREST
    // resolves by argument name and a stray overload is a silent 404.
    expect(patchBlock).toContain(
      "pg_get_function_identity_arguments(p.oid) = 'p_limit integer, p_active_only boolean, p_dry_run boolean'",
    );
  });

  it('substitutes only the bound, not the predicate', () => {
    expect(patchBlock).toContain("replace(v_def, 'distance_m < 500', 'distance_m < 100000')");
  });

  it('substitutes EXACTLY 100 km — a digit-suffix typo must not pass', () => {
    // `100000` is a PREFIX of `100000000`, so a bare substring check accepts a
    // bound of 100,000 km — larger than Earth's circumference, which disables
    // the distance test entirely and breaks the alignment with
    // `event_venue_link_signals()`'s 100 km. Anchor on a non-digit.
    expect(patchBlock).toMatch(/'distance_m < 100000(?!\d)'/);
    expect(patchBlock).not.toMatch(/'distance_m < 100000\d+'/);
  });
});

describe('venue linker gate — refuses a shape it does not recognise', () => {
  it('aborts when the occurrence count is not exactly two', () => {
    // Report pass and write pass must move together, or the dry run and the
    // UPDATE would disagree about what auto-links.
    expect(patchBlock).toMatch(/if v_n500 <> 2 then\s*\n?\s*raise exception/);
  });

  it('is idempotent — a re-run at 100 km is a no-op, not an abort', () => {
    expect(patchBlock).toMatch(/if v_n500 = 0[\s\S]*?raise notice[\s\S]*?return;/);
  });

  it('aborts when the function is absent rather than patching nothing', () => {
    expect(patchBlock).toMatch(/if v_def is null then\s*\n?\s*raise exception/);
  });
});

describe('venue linker gate — postconditions', () => {
  it('asserts against the LIVE catalog, not this file', () => {
    // `execute` is what decides whether the patch took; the file's own text
    // proves nothing about the installed function.
    expect(verifyBlock).toContain('pg_get_functiondef(p.oid)');
  });

  it('requires the old bound to be gone and the new one present twice', () => {
    expect(verifyBlock).toMatch(/position\('distance_m < 500' in v_def\) <> 0[\s\S]*?'P1 failed/);
    expect(verifyBlock).toMatch(/distance_m < 100000[\s\S]*?v_n <> 2[\s\S]*?'P1 failed/);
  });

  it('asserts the signals that DO the corroborating survive', () => {
    // Widening a bound must not loosen the exact-name match or the ambiguity
    // veto — those are what make the link safe once same-city is structural.
    expect(verifyBlock).toMatch(/name_exact AND[\s\S]*?'P2 failed/);
    expect(verifyBlock).toMatch(/HAVING count\(\*\) = 1[\s\S]*?v_n <> 2[\s\S]*?'P2 failed/);
  });

  it('counts occurrences with a divisor that MATCHES its needle', () => {
    // The count is `(len - len(replace(x, N, ''))) / len(N)`. If the needle and
    // the divisor literal drift apart the quotient is silently wrong, and a
    // single-occurrence edit to either one leaves the other satisfying a bare
    // substring assertion. Both literals must appear exactly twice per check.
    for (const needle of ['HAVING count(*) = 1', 'distance_m < 100000']) {
      const n = verifyBlock.split(needle).length - 1;
      expect(n, `${needle} must appear twice (replace needle + length divisor)`).toBe(2);
    }
  });

  it('asserts a NULL distance still fails open', () => {
    expect(verifyBlock).toMatch(/distance_m IS NULL OR[\s\S]*?'P3 failed/);
  });

  it('proves the gate BEHAVIOURALLY, not just by source text', () => {
    // A source check cannot tell a live gate from a dead one, so P4 runs the
    // function's own dry run and requires it to beat the 500 m yield.
    expect(verifyBlock).toContain('public.link_event_venues(2000, true, true)');
    expect(verifyBlock).toMatch(/<= 334[\s\S]*?'P4 failed/);
  });

  it('asserts the behavioural probe did not write', () => {
    expect(verifyBlock).toMatch(/'dry_run'\)::boolean is not true[\s\S]*?'P4 failed/);
  });

  it('has no neutered condition in either block', () => {
    expect(patchBlock + verifyBlock).not.toMatch(/\bwhere false\b|\band false\b|\bif false\b/i);
  });

  it('counts exactly four guarded postconditions', () => {
    const raises = verifyBlock.match(/raise exception 'P\d failed/g) ?? [];
    // P1 x2, P2 x2, P3 x1, P4 x2 — seven RAISEs across four numbered checks.
    expect(raises.length).toBe(7);
    expect(new Set(raises.map((r) => r.slice(-9, -7))).size).toBe(4);
  });
});
