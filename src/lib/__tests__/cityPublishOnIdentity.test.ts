import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791903202, which stopped `city_resolve_or_create` publishing a city on a DDL default
 * and made publication conditional on an external identifier.
 *
 * Asserted over COMMENT-STRIPPED sql. That migration's header quotes the old column list, the
 * classifier's CASE expression, the rejected alternatives and the measured counts, so an
 * unstripped `toContain` passes with every executable line deleted.
 */

const MIGRATION = '99991791903202_city_publish_on_identity';
const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const FN = join(process.cwd(), 'supabase/functions/backfill-venue-cities/index.ts');
const HEALTH = join(process.cwd(), 'scripts/check-pipeline-health.mjs');

function migrationSql(): string {
  const file = readdirSync(MIG_DIR).find((f) => f.startsWith(MIGRATION));
  if (!file) throw new Error(`migration ${MIGRATION} not found -- renumbered without updating me?`);
  return readFileSync(join(MIG_DIR, file), 'utf8');
}

/** Strip only line-leading `--`; a mid-line `--` may sit inside a SQL string literal. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

const RAW = migrationSql();
const SQL = stripComments(RAW);
const PATCH = SQL.slice(SQL.indexOf('$patch$'), SQL.indexOf('create or replace function'));
const VERIFY = SQL.slice(SQL.indexOf('$verify$'));

describe('a city is published only when an external identifier corroborates it', () => {
  it('patches the live definition and never restates the resolver', () => {
    expect(PATCH).toContain('pg_get_functiondef');
    expect(PATCH).toContain('execute v_src');
    // city_resolve_or_create is every city creator's only door and carries ten arms including the
    // locality registry and the identifier-conflict refusal. A transcription slip there mints
    // duplicates silently.
    expect(SQL).not.toMatch(/create\s+or\s+replace\s+function\s+public\.city_resolve_or_create/i);
  });

  it('refuses to patch unless each anchor occurs exactly once', () => {
    // Two anchors -- the column list and the values tail -- and BOTH must be counted, or a
    // duplicated INSERT this file never read gets patched blind.
    expect((PATCH.match(/coalesce\(v_n,\s*0\)\s*<>\s*1/g) ?? []).length).toBe(2);
    expect(PATCH).toMatch(/raise exception 'column anchor occurs % times/);
    expect(PATCH).toMatch(/raise exception 'values anchor occurs % times/);
  });

  it('is idempotent, so a re-run or a concurrent patch is a no-op rather than a double column', () => {
    expect(PATCH).toMatch(/if position\(v_cols_after in v_src\) > 0 then[\s\S]{0,200}return;/);
  });

  it('gates on the identifier and NOT on the caller', () => {
    // Pinning this to p_source_slug = 'nominatim-geocode' is the one-slug-out-of-240 trap that
    // hid the search_reindex_drain auto-pause for three occurrences. The rule is uniform.
    // NOTE the BACKSLASH-escaped quotes. The value expression sits inside an `E'...'` literal, so
    // in the patch it reads `nullif(btrim(p_wikidata_qid),\'\')`. Asserting the plain form fails
    // on correct code -- it only ever matches the P1 postcondition, which uses doubled quotes
    // instead. Same class as the `interval ''1 year''` trap in 99991791888795, different dialect:
    // quote-doubling inside a plain literal, backslashes inside an E-string.
    expect(PATCH).toContain("nullif(btrim(p_wikidata_qid),\\'\\') IS NOT NULL");
    expect(VERIFY).toContain("nullif(btrim(p_wikidata_qid),'''') IS NOT NULL");
    expect(PATCH).not.toMatch(/p_source_slug\s*=/);
    expect(PATCH).not.toContain('nominatim-geocode');
    expect(PATCH).not.toContain('photon');
  });

  it('writes seo_indexable into the INSERT, column and value together', () => {
    // Half of this change is inert: the column with no value is a syntax error, and the value with
    // no column silently lands in field_provenance's position. Both anchors, asserted by count --
    // each string appears in the patch and again in the P1 postcondition that checks it, so a bare
    // toContain over the file stays green when the executable copy is dropped.
    expect((SQL.match(/field_provenance, seo_indexable\)/g) ?? []).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(PATCH).toContain('field_provenance, seo_indexable)');
  });

  it('asserts behaviourally in BOTH directions with real probe cities', () => {
    // A source-text check cannot tell a live predicate from a dead one, and P2 alone is satisfied
    // perfectly by a patch that hardcodes `false` and deindexes every creator.
    expect(VERIFY).toMatch(/raise exception 'P2 failed: a city created with no identifier/);
    expect(VERIFY).toMatch(/raise exception 'P3 failed: a city created WITH an identifier/);
    expect(VERIFY).toMatch(/p_wikidata_qid => 'Q'/);
    // Both probes must be proven CREATED, or P2 and P3 are assertions about nothing.
    expect(VERIFY).toMatch(/raise exception 'P2\/P3 failed: a probe city was not created/);
  });

  it('places the two probes at DIFFERENT coordinates', () => {
    // A first draft put both at 51.0/9.0 and the resolver absorbed the mirror into the probe it
    // mirrors, so the mirror read as a failure of the gate it exists to check.
    const lats = VERIFY.match(/p_lat => ([\d.]+), p_lng => ([\d.]+)/g) ?? [];
    expect(lats.length).toBe(2);
    expect(new Set(lats).size).toBe(2);
  });

  it('discards its probes by rolling back a subtransaction, never by deleting from cities', () => {
    // A delete from public.cities fires the spine and search-reindex chain. plpgsql variables are
    // not transactional, so the captured flags survive the rollback and are asserted after it.
    // The RAISE is what discards them. Asserting only the handler leaves the probes COMMITTED
    // when the raise is replaced by `null;` -- a mutation that survived the first round.
    expect(VERIFY).toMatch(/raise exception 'ZZPROBE_ROLLBACK';/);
    expect(VERIFY).toMatch(/if sqlerrm <> 'ZZPROBE_ROLLBACK' then raise; end if;/);
    expect(SQL).not.toMatch(/delete\s+from\s+public\.cities/i);
    // ...and the probes must provably not have survived.
    expect(VERIFY).toMatch(/raise exception 'P6 failed: a probe city survived/);
  });

  it('touches no existing row', () => {
    // The standing cohort is a disposition backlog and a retro-deindex of 13k content-bearing
    // pages was put to the owner and declined. A sweep hidden in a producer change would be
    // invisible in the diff.
    expect(SQL).not.toMatch(/update\s+public\.cities/i);
    expect(SQL).not.toMatch(/\bseo_indexable\s*=\s*(true|false)\b/i);
  });

  it('reports the sentinel denominators before the count it gates on', () => {
    const fn = SQL.slice(SQL.indexOf('create or replace function public.city_publication_signals'));
    const iMade = fn.indexOf("'created_recent'");
    const iBad = fn.indexOf("'published_without_identity_recent'");
    expect(iMade).toBeGreaterThan(-1);
    expect(iBad).toBeGreaterThan(iMade);
    // The gate on the gate: a sentinel that cannot see the predicate it watches reports a clean
    // corpus on the day a CREATE OR REPLACE drops it.
    expect(fn).toContain("'resolver_sets_seo_indexable'");
    // The PREDICATE, not just the key: `(select count(*) > 0` can be replaced by `(select true`
    // leaving the key and the regexp_replace below it intact, and the gate-on-the-gate then
    // reports true whatever the function says. That mutation survived the first round.
    expect(fn).toMatch(/'resolver_sets_seo_indexable',\s*\n\s*\(select count\(\*\) > 0/);
    // Stripped before matching, or the sentinel matches the resolver's own comments.
    expect(fn).toContain('regexp_replace(pg_get_functiondef(p.oid)');
  });

  it('keeps the sentinel off anon and off every signed-in member', () => {
    expect(SQL).toMatch(
      /revoke all on function public\.city_publication_signals\(\) from anon, authenticated;/,
    );
    expect(SQL).toMatch(
      /grant execute on function public\.city_publication_signals\(\) to service_role;/,
    );
    // `to service_role` is a prefix of `to service_role, authenticated` -- the leak this exists to
    // refuse -- so the grant is asserted terminated.
    expect(SQL).not.toMatch(/to service_role\s*,/);
    expect(VERIFY).toMatch(
      /raise exception 'P5 failed: city_publication_signals is reachable by anon/,
    );
  });

  it('pins no measured count in an executable position', () => {
    // The corpus moves: a postcondition asserting 13,611 or 12,955 fails on correct code the next
    // time the geocoder runs.
    const stmts = SQL.slice(0, SQL.lastIndexOf('$verify$'));
    expect(stmts).not.toMatch(/\b(13611|13125|12955|12893|2807|2706)\b/);
  });

  it('every postcondition actually raises rather than merely computing', () => {
    expect((VERIFY.match(/raise exception\s*\n?\s*'P[1-6]/g) ?? []).length).toBeGreaterThanOrEqual(
      6,
    );
    expect(VERIFY).not.toMatch(/if\s+false\s+then/i);
    expect(VERIFY).not.toMatch(/where\s+false/i);
  });
});

describe('the geocoder names its real provider', () => {
  const SRC = readFileSync(FN, 'utf8');

  it('takes the provider from the caller instead of hardcoding one label for all four', () => {
    // `data_source` said all 13,125 rows came from Nominatim while two of the four call sites call
    // Photon, and that mislabel cost a whole diagnosis: the obvious fix for those rows having no
    // identifier was "stop discarding the extratags.wikidata Nominatim returns", and Nominatim is
    // not the producer.
    expect(SRC).toMatch(
      /sourceSlug: 'photon-geocode' \| 'nominatim-geocode' = 'nominatim-geocode'/,
    );
    expect(SRC).toContain('p_source_slug: sourceSlug');
    // Every call site passes one explicitly, so the default can never silently mislabel again.
    const calls = SRC.match(/await matchCity\([\s\S]{0,220}?\)\n/g) ?? [];
    expect(calls.length).toBe(4);
    for (const c of calls) expect(c).toMatch(/'(photon|nominatim)-geocode'/);
    // Two Photon batch sites, and the single-venue site picks by which provider it actually used.
    expect((SRC.match(/'photon-geocode'\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(SRC).toMatch(/hasCoords \? 'nominatim-geocode' : 'photon-geocode'/);
  });
});

describe('the health section is wired before the exit gate', () => {
  const H = readFileSync(HEALTH, 'utf8');

  it('runs before process.exit(1) rather than after it', () => {
    // A section appended after the terminal exit prints its failure and still exits 0 -- the trap
    // 99991790796466 recorded. lastIndexOf, because this script has an early env-guard exit too.
    expect(H.indexOf('city_publication_signals')).toBeGreaterThan(-1);
    expect(H.indexOf('city_publication_signals')).toBeLessThan(H.lastIndexOf('process.exit(1)'));
  });

  it('fails on a broken probe, a missing gate and a published-without-identity row', () => {
    const sec = H.slice(H.indexOf('city_publication_signals'), H.lastIndexOf('if (FAILED) {'));
    // Anchored on the assignments, not on the text they print: a message can survive while the
    // branch that sets it is neutered.
    // Line-anchored, because `// FAILED = true` CONTAINS `FAILED = true` -- commenting every
    // assignment out left a bare count assertion green while the section could no longer fail.
    expect((sec.match(/^\s*FAILED = true$/gm) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(sec).toMatch(/cp\.probe_ok !== true/);
    expect(sec).toMatch(/cp\.resolver_sets_seo_indexable !== true/);
    expect(sec).toMatch(/\bbad > 0\b/);
    // An empty denominator must WARN, never pass silently.
    expect(sec).toMatch(/made === 0/);
    expect(sec).toMatch(/UNTESTED/);
    // The standing backlog must not gate.
    expect(sec).toMatch(/cohort > 0[\s\S]{0,400}console\.warn/);
  });
});

describe('the invariant window starts at the gate, not two days before it', () => {
  const FOLLOWUP = '99991791906577_city_publication_window_since_gate';

  function followupSql(): string {
    const file = readdirSync(MIG_DIR).find((f) => f.startsWith(FOLLOWUP));
    if (!file)
      throw new Error(`migration ${FOLLOWUP} not found -- renumbered without updating me?`);
    return stripComments(readFileSync(join(MIG_DIR, file), 'utf8'));
  }

  const F = followupSql();
  const FN = F.slice(F.indexOf('create or replace function'), F.indexOf('$verify$'));

  it('bounds the window below by the gate and above by a rolling two days', () => {
    // Both halves. Without the lower bound this counts rows the gate could not have governed --
    // 2,679 of them on the day it shipped, which would have hard-failed the first scheduled run.
    // Without the upper bound it becomes an all-time counter that can never return to zero, which
    // is the advisory shape cohort_total already occupies.
    expect(FN).toMatch(/greatest\(now\(\) - interval '2 days', g\.since\)/);
    expect(FN).toMatch(/to_timestamp\(substr\('99991791903202', 5\)::bigint\)/);
  });

  it('derives the moment from the version rather than pinning a date literal', () => {
    // The repo's versions are 9999 + ten digits of Unix epoch seconds, so the version IS the
    // timestamp. Written as the derivation so a reader can check it instead of trusting it.
    expect(FN).not.toMatch(/'2026-10-13/);
    expect(FN).not.toMatch(/to_timestamp\(1791903202\)/);
  });

  it('reports the window alongside the count', () => {
    // A count without its window cannot be read: a clean gate and a gate narrowed to nothing give
    // the same zero.
    expect(FN).toContain("'gate_since'");
    const iSince = FN.indexOf("'gate_since'");
    const iBad = FN.indexOf("'published_without_identity_recent'");
    expect(iSince).toBeGreaterThan(-1);
    expect(iBad).toBeGreaterThan(iSince);
  });

  it('asserts the bound BEHAVIOURALLY, not only as source text', () => {
    // A source check cannot tell a live bound from a dead one. P3 looks for an actual pre-gate row
    // inside the window.
    expect(F).toMatch(/raise exception 'P3 failed: the window still reaches back past the gate'/);
    expect(F).toMatch(/created_at < to_timestamp\(substr\('99991791903202', 5\)::bigint\)/);
    // ...and the mirror, so the fix cannot become a way to report nothing.
    expect(F).toMatch(/raise exception 'P4 failed: the rolling 2-day ceiling is gone/);
  });

  it('restates and re-asserts the grants, in both directions', () => {
    // CREATE OR REPLACE preserves privileges, so the restatement is belt-and-braces -- but the
    // assertion is what catches a later rewrite that widens them.
    expect(F).toMatch(
      /revoke all on function public\.city_publication_signals\(\) from anon, authenticated;/,
    );
    expect(F).toMatch(
      /grant execute on function public\.city_publication_signals\(\) to service_role;/,
    );
    expect(F).not.toMatch(/to service_role\s*,/);
    expect(F).toMatch(/raise exception 'P5 failed: city_publication_signals is reachable by anon/);
    expect(F).toMatch(/raise exception 'P5 failed: service_role lost execute/);
  });

  it('prints the window in the health section rather than keeping it in the RPC', () => {
    const H = readFileSync(HEALTH, 'utf8');
    const sec = H.slice(H.indexOf('city_publication_signals'), H.lastIndexOf('if (FAILED) {'));
    expect(sec).toMatch(/cp\.gate_since/);
    // Every one of the three readings names the window; a bare "in the last 2 days" line would
    // now be a false statement about what was counted.
    expect((sec.match(/\$\{since\}/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(sec).not.toMatch(/in the last 2 days/);
  });
});
