import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `run_event_tag_link` gained an approved-alias arm in
 * `20261213100000_event_tag_link_reads_approved_aliases.sql`, and nothing pinned
 * it. This file does.
 *
 * ## Why the `review_status = 'approved'` gate is the load-bearing part
 *
 * Every tag alias is a silent auto-tagging rule: match an entity's `tags[]`
 * element by lowercase equality against a tag name, slug or alias and the
 * assignment is created. `tag_aliases` currently holds ~12,090 rows at
 * `review_status = 'auto'`, almost all `alias_type = 'multilingual'`, against
 * ~412 approved ones.
 *
 * The unreviewed bulk is not hypothetical noise — it is measured damage. Before
 * `run_tag_assignment_reconcile` was gated to approved aliases only (PR #2816),
 * 67 collisions were live, including `culture` → **Crops** on 2,609 news
 * articles (French *culture* = cultivation), `art` → Antiretroviral Therapy on
 * 322, `cbt` (cognitive behavioural therapy) → Cock & Ball Torture, and
 * `maga` → Enchantress (Italian *maga* = sorceress).
 *
 * Dropping the gate here would replay that across the events corpus. It would
 * also be invisible: the links would simply appear, indistinguishable from
 * correct ones, and `event_tag_pairs_unlinked` would still read 0 because the
 * pairs WOULD have been created.
 *
 * ## Why a text test rather than widening the sentinel
 *
 * The obvious alternative was to give `tag_hygiene_stats().event_tag_pairs_unlinked`
 * the same alias vocabulary, so the sentinel could observe the arm failing.
 * Measured on prod 2026-09-03: that costs **+1,087 ms** on a counter that reads 0
 * either way, taking the whole function from ~1.9 s to ~3.5 s against its 8 s
 * PostgREST ceiling — a function that already broke that ceiling once
 * (`20260928143000`, one counter at 6.4 s failing roughly half of all PRs). Two
 * cheaper formulations were tried and measured no better (2,605 ms correlated
 * `not exists`, 2,652 ms left-join anti-join), so the cost is intrinsic to the
 * wider vocabulary rather than to the join shape.
 *
 * A text check costs nothing at runtime and catches the regression at PR time,
 * which is where this repo's other guards for these functions live.
 *
 * **Known and deliberate asymmetry:** the sentinel's vocabulary is therefore
 * NARROWER than the linker's. That direction is the safe one — it can
 * under-detect but can never false-alarm. The opposite (sentinel wider than
 * linker) is what produces an unreachable floor, which is exactly how
 * `events_with_tags_unlinked` read "non-zero" through 1,106 wedged runs. If you
 * widen one, widen the other, and re-time the function first.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// Read once: this directory holds ~1,470 files on an iCloud-synced checkout and
// re-reading per assertion is what put a sibling suite over its own timeout.
const sources = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

/**
 * Newest migration that DEFINES the function.
 *
 * Case-insensitive on purpose: `pg_get_functiondef()` emits
 * `CREATE OR REPLACE FUNCTION` in upper case, so a migration based on the live
 * body — the correct way to avoid dropping keys — is invisible to a
 * case-sensitive scan, which then silently reads an older definition and
 * asserts against the wrong text.
 */
function latestDefinitionOf(fn: string): string {
  for (let i = files.length - 1; i >= 0; i -= 1) {
    if (new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sources[i]))
      return sources[i];
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('run_event_tag_link');

/**
 * ONLY the function body, bounded by its dollar-quote.
 *
 * Bounding is load-bearing, and this test caught its own bug by mutation: the
 * migration that adds the arm also contains a verification DO block and a
 * release assertion that quote the same predicates. An unbounded scan matched
 * THOSE, so deleting `review_status = 'approved'` from the actual function still
 * passed — the assertion was measuring the migration's prose about the gate
 * rather than the gate.
 */
function bodyOf(fnSql: string): string {
  const start = fnSql.search(
    /create\s+(or\s+replace\s+)?function\s+public\.run_event_tag_link\s*\(/i,
  );
  expect(start, 'function definition not found').toBeGreaterThan(-1);
  const tag = fnSql.slice(start).match(/\$([a-z_]*)\$/i);
  expect(tag, 'function has no dollar-quote').not.toBeNull();
  const open = fnSql.indexOf(tag![0], start) + tag![0].length;
  const close = fnSql.indexOf(tag![0], open);
  expect(close, 'unterminated dollar-quote').toBeGreaterThan(open);
  return fnSql.slice(open, close);
}

/** The function body, with SQL line comments stripped. */
const code = bodyOf(sql)
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('run_event_tag_link resolves approved aliases, and only approved ones', () => {
  it('consults tag_aliases at all', () => {
    // Until 20261213100000 it read unified_tags only, so a German string that
    // had been merged into its English canonical (`bühne` → stage) stopped
    // linking the moment the merge minted it as an alias.
    expect(code, 'the alias arm is gone — events tagged in German stop linking').toContain(
      'tag_aliases',
    );
  });

  it("requires review_status = 'approved'", () => {
    expect(
      code,
      "the approved gate is gone: ~12,090 unreviewed aliases become auto-tagging rules for events (culture -> Crops, cbt -> Cock & Ball Torture)",
    ).toMatch(/review_status\s*=\s*'approved'/);
  });

  it('only trusts an alias whose canonical tag is active and unmerged', () => {
    // An alias pointing at a merged tag would link events to a row that is a
    // redirect trail rather than a live concept.
    const arm = code.slice(code.indexOf('tag_aliases'));
    expect(arm).toMatch(/status\s*=\s*'active'/);
    expect(arm).toMatch(/merged_into_id\s+is\s+null/);
  });

  it('consults an alias ONLY for a key the tag map does not already have', () => {
    // Otherwise an alias could shadow or repoint a real tag name — the arm must
    // be a fallback, never an override.
    const arm = code.slice(code.indexOf('tag_aliases'));
    expect(arm).toMatch(/not\s+exists\s*\(\s*select\s+1\s+from\s+_raw/i);
  });

  it('still refuses an alias key that resolves to more than one tag', () => {
    const arm = code.slice(code.indexOf('tag_aliases'));
    expect(arm).toMatch(/having\s+count\s*\(\s*distinct\s+al\.tag_id\s*\)\s*=\s*1/i);
  });

  it('keeps resuming by missing pair, so new vocabulary backfills itself', () => {
    // The alias arm is only useful because the work-list is self-consuming: a
    // string that becomes resolvable later reappears on the next tick. Under the
    // old resume-by-absence work-list it would never have been revisited.
    expect(code).toMatch(/_todo/);
    expect(code).toMatch(/entity_type\s*=\s*'event'/);
  });
});
