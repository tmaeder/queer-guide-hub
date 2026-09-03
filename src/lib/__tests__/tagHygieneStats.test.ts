import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `tag_hygiene_stats()` is called by `scripts/check-tag-hygiene.mjs`, a CRITICAL
 * CI gate, through PostgREST — where `authenticator` carries
 * `statement_timeout = 8s`.
 *
 * Measured on prod 2026-08-24, one counter was 95% of the function:
 *
 *     event_tag_strings_unresolved   6437 ms
 *     the other 13 counters (total)   214 ms
 *     events_with_tags_unlinked       124 ms
 *
 * The cause was `lower(u.name) = s OR lower(u.slug) = s`. The OR blocks a hash
 * join, so the planner fell back to a nested loop over a materialized 9,546-row
 * `unified_tags` — `Rows Removed by Join Filter: 4045647`, ~8M `lower()` calls,
 * entirely CPU (the plan reported `read=0`, so no amount of cache warming helped).
 * The function landed at 7.6-12.0 s against an 8 s ceiling and failed roughly
 * half of all PRs, on metrics none of which can even fail the gate.
 *
 * `NOT (A OR B)` is `NOT A AND NOT B`; split that way each arm uses its own
 * functional index and the counter is 147 ms. Both halves are load-bearing —
 * re-merging the OR, or dropping either index, silently restores the 4M-row
 * nested loop and the gate goes back to flaking on unrelated PRs. Nothing else
 * would catch that: the function still returns the correct number, just slowly.
 *
 * Text check against the migrations directory, so it runs in CI without
 * credentials — same pattern as `src/lib/__tests__/citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/**
 * Every migration, read ONCE.
 *
 * This file used to `readFileSync` inside each `.some()` predicate, which meant
 * up to four full passes over the directory — and the `dropped` check can never
 * short-circuit, because the string it looks for is absent by design. At 1,322
 * migrations on an iCloud-synced checkout that measured 73 s cold and 25 s warm,
 * against this file's 15 s timeout: the gate fails on repo SIZE, not on the
 * invariant it guards, and it gets worse with every migration anyone adds.
 * Reading once is O(files) instead of O(files x assertions).
 */
const sources = files.map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'));

function latestDefinitionOf(fn: string): string {
  for (let i = files.length - 1; i >= 0; i -= 1) {
    const sql = sources[i];
    // `create [or replace] function`, not merely `function`: a GRANT, REVOKE,
    // COMMENT ON, DROP or ALTER naming the function also contains
    // "function public.<fn>(" and would otherwise win the reverse scan.
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('tag_hygiene_stats');

/** The `event_tag_strings_unresolved` counter body, up to the next counter key. */
const counter = (() => {
  const start = sql.indexOf("'event_tag_strings_unresolved'");
  expect(
    start,
    'tag_hygiene_stats no longer has an event_tag_strings_unresolved counter',
  ).toBeGreaterThan(-1);
  const end = sql.indexOf("'events_with_tags_unlinked'", start);
  return sql.slice(start, end > -1 ? end : undefined);
})();

describe('tag_hygiene_stats() stays under the PostgREST statement timeout', () => {
  it('resolves tag strings with two separate NOT EXISTS arms, never one OR', () => {
    // The exact shape that cost 6.3 s: a single anti-join whose filter ORs the
    // two lower() comparisons together.
    expect(counter).not.toMatch(/or\s+lower\s*\(\s*u\.slug\s*\)/i);
    expect(counter).not.toMatch(/or\s+lower\s*\(\s*u\.name\s*\)/i);

    const arms = counter.match(/not\s+exists\s*\(/gi) ?? [];
    expect(arms.length, 'expected one NOT EXISTS per indexed column').toBe(2);
    expect(counter).toMatch(/lower\s*\(\s*u\.name\s*\)\s*=/i);
    expect(counter).toMatch(/lower\s*\(\s*u\.slug\s*\)\s*=/i);
  });

  it('keeps the functional indexes the split arms depend on', () => {
    for (const idx of ['idx_unified_tags_lower_name', 'idx_unified_tags_lower_slug']) {
      const created = sources.some((sql) =>
        new RegExp(`create\\s+index[^;]*${idx}`, 'i').test(sql),
      );
      expect(created, `${idx} is never created`).toBe(true);

      const dropped = sources.some((sql) => new RegExp(`drop\\s+index[^;]*${idx}`, 'i').test(sql));
      expect(dropped, `${idx} is dropped; the OR-free rewrite then seq-scans again`).toBe(false);
    }
  });
});

/**
 * The 2026-09-02 language sentinels.
 *
 * These guard a repair that has already been made, so the thing worth asserting
 * is not that the keys exist but that their PREDICATES keep their two scoping
 * terms. Both were established by measurement and both are load-bearing:
 *
 *   name ~ '[^\x00-\x7F]'   without it the lossy-slug predicate matches 115
 *                           active rows of which 8 are defects; the other 106
 *                           are deliberate namespace prefixes on ASCII names
 *                           (mat-silicone = 4,643 uses), and "repairing" them
 *                           renames them and breaks thousands of links.
 *
 *   status <> 'merged'      a merged row keeps its slug as its redirect trail
 *                           and resolves via merged_into_id, so repairing
 *                           caf -> cafe breaks the historical /tags/caf URL.
 *                           Ten rows are legitimately lossy for that reason; a
 *                           sentinel counting them reports 10 and reds CI on
 *                           day one.
 *
 * A previous version of the sibling guard in tagSlugSeal.test.ts counted these
 * terms across the whole FILE and was satisfied by an occurrence inside a
 * comment, which let the scope be deleted from three of four arms while staying
 * green. So: strip comments first, then read the counter's own body.
 */
describe('tag_hygiene_stats language sentinels', () => {
  /** The named counter's body, up to the next counter key, comments removed. */
  function counterBody(key: string): string {
    const stripped = sql.replace(/^\s*--.*$/gm, '');
    const start = stripped.indexOf(`'${key}'`);
    expect(start, `${key} is not defined`).toBeGreaterThan(-1);
    const next = stripped.slice(start + key.length + 2).search(/\n\s+'[a-z_]+',\s*\(/);
    return next === -1 ? stripped.slice(start) : stripped.slice(start, start + key.length + 2 + next);
  }

  it('defines all four sentinels', () => {
    for (const k of [
      'slug_diacritic_lossy',
      'name_mojibake',
      'name_contains_hashtag',
      'non_latin_name',
    ]) {
      expect(sql).toContain(`'${k}'`);
    }
  });

  it('scopes slug_diacritic_lossy to non-ASCII names', () => {
    // Dropping this term turns the sentinel into the unqualified drift
    // predicate, which reports 106 deliberate namespace prefixes as defects.
    expect(counterBody('slug_diacritic_lossy')).toMatch(/\[\^\\x00-\\x7F\]/);
  });

  it('excludes merged rows from both slug and mojibake sentinels', () => {
    // A merged row's slug and name are frozen redirect keys, not live content.
    for (const k of ['slug_diacritic_lossy', 'name_mojibake']) {
      expect(counterBody(k), `${k} must exclude merged rows`).toMatch(/status\s*<>\s*'merged'/);
    }
  });

  it('keeps every pre-existing counter', () => {
    // A CREATE OR REPLACE that silently drops a key breaks TagHygienePanel and
    // makes check-tag-hygiene.mjs stop guarding whatever it dropped.
    for (const k of [
      'uncategorized_active', 'dangling_category_id', 'denorm_category_missing',
      'placeholder_description_active', 'active_tags_with_image_url',
      'assignment_to_non_active_tag', 'nonclean_entity_type', 'duplicate_active_name',
      'redirect_to_non_canonical', 'merged_but_not_status_merged',
      'sensitive_without_description', 'indexable_without_description',
      'event_tag_strings_unresolved', 'events_with_tags_unlinked', 'alias_equals_name',
      'alias_mojibake', 'refusal_prose_active', 'unreviewed_typed_alias',
      'relations_pending_review', 'prose_unreviewed',
    ]) {
      expect(sql, `${k} was dropped from tag_hygiene_stats`).toContain(`'${k}'`);
    }
  });

  it('has a baseline entry for every sentinel', () => {
    // check-tag-hygiene.mjs iterates the keys of the LIVE prod response, so a
    // new key is invisible until the migration applies — and then hard-fails as
    // `missing` if the baseline has no entry. The entries must ship together.
    const baseline = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts', 'tag-hygiene-baseline.json'), 'utf8'),
    );
    // Three are true zero-invariants. name_mojibake is NOT: prod carries one
    // merged row (M-FFFD-Llerian) whose NAME holds a U+FFFD, and nothing in
    // this branch repairs it — its "corrected" slug would still be garbage, and
    // it is merged, so nothing renders it. Baselining it at 0 would hard-fail
    // the gate the moment the sentinel migration applied. The accepted level is
    // the measured one; a SECOND mojibake row is the regression worth catching.
    const expected: Record<string, number> = {
      slug_diacritic_lossy: 0,
      name_mojibake: 1,
      name_contains_hashtag: 0,
      non_latin_name: 0,
    };
    for (const [k, v] of Object.entries(expected)) {
      expect(baseline[k], `${k} has no baseline entry`).toBe(v);
    }
  });
});

/**
 * `event_tag_pairs_unlinked` is the sentinel for `run_event_tag_link`, and the
 * only one of the two events counters that can reach 0 — `events_with_tags_unlinked`
 * is floored at the ~3,856 events whose tags the ambiguity guard blocks by design,
 * so it reads "non-zero" both when the linker is healthy and when it is wedged.
 * It read exactly that through 1,106 consecutive wedged runs.
 *
 * Two ways it could silently disappear, which is why this is a test and not a
 * comment:
 *
 *  1. Adding any key to `tag_hygiene_stats()` means restating the WHOLE function.
 *     Two branches that each do so do not conflict in git — the second to merge
 *     overwrites the first's body wholesale. `claude/tag-language-normalization-27e39c`
 *     (PR #3301) restates this function right now.
 *  2. `scripts/check-tag-hygiene.mjs` derives its metric list FROM the function's
 *     own output, so a key that vanishes is simply not checked. There is no
 *     "expected metric missing" failure — the gate goes green with one fewer
 *     invariant, and the stale baseline entry is ignored.
 *
 * Together those make a dropped sentinel invisible at every layer. This test is
 * the layer that notices.
 */
describe('tag_hygiene_stats() keeps the event-linker sentinel', () => {
  // Must match the KEY-DEFINITION form `'name', (`, not a bare mention. The
  // migration's own header prose and its post-apply verification block both
  // contain the quoted string, so a substring check passes even when the counter
  // itself has been deleted — verified by mutation while writing this.
  const KEY_DEF = /'event_tag_pairs_unlinked'\s*,\s*\(/;

  it('still defines event_tag_pairs_unlinked as a counter', () => {
    expect(
      KEY_DEF.test(sql),
      'the run_event_tag_link sentinel was dropped from tag_hygiene_stats() — most likely by a ' +
        'concurrent branch restating the function; re-add the counter rather than re-baselining',
    ).toBe(true);
  });

  it('resolves ambiguity with a GROUP BY, never a correlated NOT EXISTS', () => {
    const start = sql.search(KEY_DEF);
    expect(start, 'no counter body to check').toBeGreaterThan(-1);
    const end = sql.indexOf("'alias_equals_name'", start);
    const counterSql = sql.slice(start, end > -1 ? end : undefined);

    // Measured 2026-09-03 on prod: the correlated form took 51.1 s against this
    // function's 8 s PostgREST ceiling; the GROUP BY form takes 708 ms for the
    // identical answer. Same class of regression as the OR above, and equally
    // invisible — the counter stays correct, just ruinously slow.
    expect(counterSql).toMatch(/group\s+by\s+key\s+having\s+count\s*\(\s*distinct\s+tag_id\s*\)/i);
    expect(counterSql).not.toMatch(/from\s+resolved\s+r2/i);

    // The grace period is what stops normal ingest lag from reding unrelated PRs:
    // the cron runs every 10 minutes, so recent events are legitimately unlinked.
    expect(counterSql).toMatch(/created_at\s*<\s*now\(\)\s*-\s*interval\s*'1 hour'/i);
  });

  it('baselines the sentinel at 0 and does NOT mark it advisory', () => {
    const baseline = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts', 'tag-hygiene-baseline.json'), 'utf8'),
    );
    expect(baseline.event_tag_pairs_unlinked, 'sentinel has no baseline entry').toBe(0);
    // Advisory metrics only ever "drift" — they cannot fail the gate, which is
    // precisely the weakness that made events_with_tags_unlinked useless.
    expect(
      baseline._advisory ?? [],
      'the sentinel must be able to FAIL the gate, not merely drift',
    ).not.toContain('event_tag_pairs_unlinked');
  });
});
