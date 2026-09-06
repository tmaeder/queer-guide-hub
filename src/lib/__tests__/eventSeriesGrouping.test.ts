import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Recurring-series collapse in the events feed, pinned.
 *
 * 2,181 of 3,076 upcoming live events (70.9%) were repeat dates of 289
 * same-title/same-city groups — a Zürich library's opening hours appeared 112
 * times. The dedup engine correctly refuses to merge them, so the feed read as
 * broken while every layer behaved as designed.
 *
 * The measurement that shaped this is the one worth defending: within a series the
 * rows are NOT redundant. "Pride and Prejudice" (20 rows) carries 20 distinct
 * descriptions, and `count(distinct ticket_url) = row count` on nearly every
 * series. `event_occurrences` has no ticket column, so a merge would destroy
 * per-date content and 112 booking links. Hence GROUPING, never merging — and the
 * assertions below are what stop a later change from quietly turning it back into
 * a merge or into a silent disappearance.
 *
 * Each assertion was mutation-tested against a scratch copy: breaking the
 * predicate it guards makes the test fail. A guard that passes on the broken input
 * guards nothing.
 *
 * Text check against the migrations directory — no credentials, same pattern as
 * `src/lib/__tests__/dedupEventArms.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * Strip `--` comments before scanning. These migrations carry long rationale
 * headers that quote the very SQL they explain, so an unstripped scan happily
 * matches the PROSE and reports a predicate present that the function does not
 * contain. Caught live: the collapse-clause assertion below matched the header's
 * `AND (e.series_next OR ...)` while the real clause was never checked.
 */
function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, '');
}

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return stripSqlComments(sql);
  }
  throw new Error(`no migration defines ${fn}`);
}

function latestMigrationMatching(pattern: RegExp): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (pattern.test(sql)) return stripSqlComments(sql);
  }
  throw new Error(`no migration matches ${pattern}`);
}

describe('run_event_series_recompute', () => {
  const sql = latestDefinitionOf('run_event_series_recompute').toLowerCase();

  it('groups on despaced title + city + venue, not on title alone', () => {
    // Title alone would fuse two different venues' identically-named nights into
    // one series and hide a real event. "Sunday Sex" in Berlin genuinely runs at
    // two venues and must stay two series.
    expect(sql).toMatch(/dedup_despace\(e\.title\)/);
    expect(sql).toMatch(/coalesce\(e\.city_id::text/);
    expect(sql).toMatch(/coalesce\(e\.venue_id::text/);
  });

  it('requires at least 3 members to call something a series', () => {
    // >=2 hides only 83 more rows and is exactly where "series or duplicate pair?"
    // is ambiguous — that question belongs to the dedup engine.
    expect(sql).toMatch(/having\s+count\(\*\)\s*>=\s*3/);
  });

  it('breaks representative ties on id so the choice cannot flip between runs', () => {
    // Two occurrences sharing a timestamp would otherwise alternate as the
    // representative, churning the UNSCOPED search-reindex trigger forever.
    expect(sql).toMatch(/order\s+by\s+l\.start_date,\s*l\.id/);
  });

  it('only writes rows whose grouping actually changed', () => {
    // trg_search_documents_event is AFTER INSERT OR DELETE OR UPDATE with no
    // `UPDATE OF`, so every row written here enqueues a search reindex.
    expect(sql).toMatch(/is\s+distinct\s+from/);
  });

  it('resets rows whose date has passed instead of leaving stale grouping', () => {
    expect(sql).toMatch(/e\.start_date\s*<\s*now\(\)/);
  });

  it('is not callable by anon or authenticated', () => {
    const migration = latestMigrationMatching(
      /create\s+or\s+replace\s+function\s+public\.run_event_series_recompute/i,
    ).toLowerCase();
    expect(migration).toMatch(/revoke\s+all\s+on\s+function\s+public\.run_event_series_recompute/);
    expect(migration).toMatch(/grant\s+execute[\s\S]{0,120}to\s+service_role/);
  });
});

describe('events.series_next column', () => {
  const migration = latestMigrationMatching(/add column if not exists series_next/i).toLowerCase();

  it('defaults to true so an unclassified or brand-new row is never hidden', () => {
    // The flag may only ever hide a row it positively identified as a repeat. A
    // false default would hide every row inserted between two recompute runs.
    expect(migration).toMatch(/series_next\s+boolean\s+not\s+null\s+default\s+true/);
  });

  it('asserts every series keeps exactly one visible representative', () => {
    // A series with zero representatives vanishes from the feed entirely — the one
    // way this feature can lose content rather than group it.
    expect(migration).toMatch(/reps\s*<>\s*1/);
  });

  it('fails when the recompute grouped nothing at all', () => {
    // Positive control: "no bad series" also passes on a corpus where nothing was
    // grouped, which is precisely the state the migration exists to change.
    expect(migration).toMatch(/v_hidden\s*=\s*0/);
  });
});

describe('search_events', () => {
  const sql = latestDefinitionOf('search_events');
  const lower = sql.toLowerCase();

  it('excludes merged duplicates', () => {
    // This RPC filtered `status = 'active'` and nothing else, so 598 upcoming
    // events already merged into another row were still served — while the sibling
    // PostgREST path in useEvents.tsx had always excluded them. The dedup engine's
    // entire output was invisible on the city-filtered feed.
    expect(lower).toMatch(/e\.duplicate_of_id\s+is\s+null/);
  });

  it('collapses a series only when no date window was requested', () => {
    // Hiding occurrences inside a range the reader explicitly asked for would drop
    // dates they came to see. The condition must therefore release the collapse
    // when p_start or p_end is supplied, or when past events are included.
    // A window from the anchor, NOT a non-greedy match to the first `)` — that
    // stops inside `coalesce(p_include_past, false)` and never reaches the
    // p_start/p_end arms, so the assertion silently checks a truncated clause.
    const idx = lower.indexOf('e.series_next');
    expect(idx, 'series_next collapse clause not found').toBeGreaterThan(-1);
    const text = lower.slice(idx, idx + 240);
    expect(text).toMatch(/p_start\s+is\s+not\s+null/);
    expect(text).toMatch(/p_end\s+is\s+not\s+null/);
    expect(text).toMatch(/coalesce\(p_include_past,\s*false\)/);
  });

  it('verifies against the whole corpus, not just the first page', () => {
    // `p_limit => 1000` would check one page and report clean while duplicates sat
    // past the cut.
    const migration = latestMigrationMatching(
      /create\s+or\s+replace\s+function\s+public\.search_events/i,
    );
    expect(migration).toMatch(/search_events\(p_limit\s*=>\s*1000000\)/);
  });

  it('refuses to pass when the function returns nothing', () => {
    // `v_ranged <= v_browse` is NULL on an empty result — no exception, a silent
    // pass proving nothing.
    const migration = latestMigrationMatching(
      /create\s+or\s+replace\s+function\s+public\.search_events/i,
    ).toLowerCase();
    expect(migration).toMatch(/v_browse\s+is\s+null\s+or\s+v_ranged\s+is\s+null/);
  });
});
