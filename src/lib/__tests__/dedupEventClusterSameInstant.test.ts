import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The "exact duplicates" cluster finder must not offer a recurring event series
 * as one mergeable cluster.
 *
 * `_find_duplicate_clusters_body('event')` clustered on
 * (normalized title, city) alone — the body contained the string `start_date`
 * zero times and `series` zero times — so a weekly event at one venue in one
 * city came out as exactly one cluster with one member per date. Measured on
 * prod 2026-10-22: 180 clusters / 580 events / 3,550 member pairs, 180 of 180
 * spanning more than one distinct start_date, 13 holding rows with a
 * series_key, 400 merges if a reviewer clicked through all of them. CLAUDE.md
 * states those repeats "are grouped, never merged", and a merge sets
 * duplicate_of_id, which removes the date from the feed for good.
 *
 * The rule the migration implements, anchored on what run_dedup_truth_sweep
 * already decided rather than on a new one: two event rows may share a cluster
 * only if they share an IDENTICAL start_date, and a row carrying a series_key
 * is not clustered at all.
 *
 * TEXT CHECK, no credentials. The runtime assertions (no cluster spans two
 * instants, no member carries a series_key, and the event output equals the
 * rule recomputed independently of the body) live in the migration's own
 * DO block, where they can reach the corpus. This file exists because a full
 * restatement of this function that drops one line is silent — which is how
 * 20260811100200 dropped the admin gate that 20260611034848 had added, the
 * defect `dedupClusterFinderGate.test.ts` was written for.
 *
 * Assertions run against COMMENT-STRIPPED SQL. Both the migration header and
 * the function body discuss `start_date`, `series_key` and `nd` in prose, so a
 * bare match over the raw file passes with the statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FN = '_find_duplicate_clusters_body';

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

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const file = latestDefinitionOf(FN);

/** The CREATE statement only, comment-free. */
function body(): string {
  const stripped = stripComments(file);
  const start = stripped.search(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${FN}\\s*\\(`, 'i'),
  );
  expect(start, `${FN} is created in its latest migration`).toBeGreaterThan(-1);
  const end = stripped.indexOf('$function$;', start);
  expect(end, `${FN} body is terminated`).toBeGreaterThan(start);
  return stripped.slice(start, end);
}

/** The verify DO block only, comment-free. */
function verify(): string {
  const stripped = stripComments(file);
  const start = stripped.indexOf('do $verify$');
  expect(start, 'the migration carries a verify block').toBeGreaterThan(-1);
  return stripped.slice(start);
}

describe('event clusters require an identical instant', () => {
  it('derives the event key from start_date, and nothing else from it', () => {
    // The whole defect was the absence of a date term.
    expect(body()).toMatch(
      /case when p_content_type = 'event'\s*\n\s*then coalesce\(sd\.start_date::text, sd\.entity_id::text\)\s*\n\s*else '' end as nd/,
    );
  });

  it('keys a dateless event on its own id, so it can never cluster', () => {
    // coalesce(..., '') would group every dateless event together under '' —
    // i.e. on the name alone, which is the defect. A row with no start_date has
    // no occurrence to be the same as. Measured: 0 such rows today, so this is
    // the branch no live data exercises.
    const nd = body().match(/then coalesce\(sd\.start_date::text, ([^)]*)\)/);
    expect(nd?.[1], 'the fallback must be unique per row').toBe('sd.entity_id::text');
  });

  it('excludes a row the series engine has already grouped', () => {
    expect(body()).toMatch(/and \(p_content_type <> 'event' or ev\.series_key is null\)/);
  });

  it('reaches series_key through a join that only fires for events', () => {
    expect(body()).toMatch(
      /left join public\.events ev\s*\n\s*on p_content_type = 'event' and ev\.id = sd\.entity_id/,
    );
  });

  it('threads nd through every key the grouping is built from', () => {
    // Asserting one site is satisfied by the surviving copies: the key is
    // restated five times over (candidate set, join, anchor correlation, group
    // by, and the city over-wide guard), and one that still omits nd regroups
    // the dates it was added to separate.
    const b = body();
    expect(b).toMatch(
      /select nt, nc, nco, nd from norm group by nt, nc, nco, nd having count\(\*\) > 1/,
    );
    expect(b).toMatch(/using \(nt, nc, nco, nd\)/);
    expect(b).toMatch(/a\.nt = n\.nt and a\.nc = n\.nc and a\.nco = n\.nco and a\.nd = n\.nd/);
    expect(b).toMatch(/group by nt, nc, nco, nd, anchor/);
    expect(b).toMatch(/a\.nco = b\.nco and a\.nd = b\.nd/);
    expect(b).toMatch(/a\.nco = anchored\.nco and a\.nd = anchored\.nd/);
  });

  it('leaves every non-event type on a constant key', () => {
    // This is the whole argument that the other 15 entity_types are unchanged:
    // nd is the literal '' on every non-event row, so each added predicate
    // reduces to '' = '' and the added group-by column is a constant. Verified
    // against live data in the same transaction — all 15 returned a jsonb value
    // equal to the old body's, news 208 clusters and venue 91 among them.
    const b = body();
    const nd = b.match(/case when p_content_type = 'event'[\s\S]*?else '' end as nd/);
    expect(nd, 'the nd case must fall through to the empty string').not.toBeNull();
  });

  it('does not reintroduce the sweep’s ±48h same-venue arm', () => {
    // despace_same_venue_48h is the sweep's third auto arm, and on this corpus
    // it selects RECURRENCES: all three such pairs the finder offered were read
    // by hand and not one is a duplicate (three consecutive nights of "I came
    // for you" at one Zurich venue, all carrying a series_key; two days of a
    // sauna's opening hours; two sessions of one workshop). A grouping key
    // cannot express a tolerance window without re-admitting them.
    const b = body();
    expect(b, 'no venue term belongs in the clustering key').not.toMatch(/venue/i);
    expect(b, 'no time tolerance belongs in the clustering key').not.toMatch(/interval|48/i);
  });

  it('keeps the city 50 km anchoring intact', () => {
    // 99991791735841 added it after 17 different places were merged as
    // "exact duplicates". A later restatement must not take it out.
    const b = body();
    expect(b).toMatch(/public\.haversine_m\(n\.lat, n\.lng, a\.lat, a\.lng\) <= 50000/);
    expect(b).toMatch(/public\.haversine_m\(a\.lat, a\.lng, b\.lat, b\.lng\) > 50000/);
  });
});

describe('the migration proves the result instead of asserting it', () => {
  it('fails when any event cluster spans two instants', () => {
    // Anchored on the CONDITION, not the message: a mutation that guts the
    // branch to `if false` leaves every string in place.
    const v = verify();
    expect(v).toMatch(/count\(distinct e\.start_date\)[\s\S]{0,200}> 1/);
    expect(v).toMatch(/if v_spanning <> 0 then/);
  });

  it('fails when any event cluster member carries a series_key', () => {
    const v = verify();
    expect(v).toMatch(/where e\.series_key is not null/);
    expect(v).toMatch(/if v_series <> 0 then/);
  });

  it('compares the event output against the rule recomputed independently', () => {
    // The two zero-invariants above also pass on an empty result, so a body
    // that returned '[]' for events would satisfy both. The equality fails in
    // both directions, which is what makes this check non-vacuous while the
    // corpus holds a same-instant collision — it holds exactly one today.
    const v = verify();
    expect(v).toMatch(/from public\.search_documents sd/);
    expect(v).toMatch(/and ev\.series_key is null/);
    expect(v).toMatch(/coalesce\(sd\.start_date::text, sd\.entity_id::text\)/);
    expect(v).toMatch(/if v_actual <> v_expect then/);
  });

  it('cannot be short-circuited', () => {
    // A `where false and ...` mutation leaves the slug list, the regex and the
    // comparison all intact while the check has stopped counting — recorded in
    // CLAUDE.md as a mutation that survived a fully string-anchored guard.
    const v = verify();
    expect(v, 'no literal false may appear in the verify block').not.toMatch(/\bfalse\b/);
    expect(v, 'counters must be read from the corpus, not seeded').toMatch(
      /select count\(\*\) into v_spanning/,
    );
    expect(v).toMatch(/select count\(\*\) into v_series/);
    expect(v).toMatch(/select count\(\*\) into v_expect/);
  });

  it('keeps the inner body revoked', () => {
    expect(stripComments(file)).toMatch(
      new RegExp(
        `revoke all on function public\\.${FN}\\(text, integer\\)\\s*\\n?\\s*from public, anon, authenticated`,
        'i',
      ),
    );
  });
});
