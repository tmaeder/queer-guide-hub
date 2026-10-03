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
    return next === -1
      ? stripped.slice(start)
      : stripped.slice(start, start + key.length + 2 + next);
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
      'uncategorized_active',
      'dangling_category_id',
      'denorm_category_missing',
      'placeholder_description_active',
      'active_tags_with_image_url',
      'assignment_to_non_active_tag',
      'nonclean_entity_type',
      'duplicate_active_name',
      'redirect_to_non_canonical',
      'merged_but_not_status_merged',
      'sensitive_without_description',
      'indexable_without_description',
      'event_tag_strings_unresolved',
      'events_with_tags_unlinked',
      'alias_equals_name',
      'alias_mojibake',
      'refusal_prose_active',
      'unreviewed_typed_alias',
      'relations_pending_review',
      'prose_unreviewed',
      'indexable_marketplace_facet',
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
    // All five are zero-invariants as of 2026-09-30. name_mojibake was the
    // exception and is no longer: this said "prod carries one merged row
    // (M-FFFD-Llerian) whose NAME holds a U+FFFD ... baselining it at 0 would
    // hard-fail the gate", and live now measures 0 — the counter excludes
    // status = 'merged', which is exactly where that row sits. So 0 is the
    // accepted level and any count is a LIVE row, not the known artifact.
    //
    // slug_diacritic_lossy briefly stopped being one on 2026-09-14, when
    // 50900101100100 (#3705) demoted three mojibake person rows
    // 'merged' -> 'deprecated' and this counter, which excludes only 'merged',
    // went 0 -> 3. It is a zero-invariant again: the repair that looked
    // unavailable was RESTORING THE MERGE (20260914175649), not transliterating
    // -- which really would collide with the correctly-spelled twin that
    // already exists. Live reads 0, so a FOURTH row is a real defect.
    //
    // These are VALUES, not just key presence, so a re-baseline that moves one
    // has to come here and justify it. That is deliberate friction: it is what
    // turned the 2026-09-30 sweep from eleven silent "improvements" into a
    // decision about each counter.
    const expected: Record<string, number> = {
      slug_diacritic_lossy: 0,
      name_mojibake: 0,
      name_contains_hashtag: 0,
      non_latin_name: 0,
      indexable_marketplace_facet: 0,
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

/**
 * `indexable_marketplace_facet` — a marketplace attribute facet publishing a
 * glossary page at /tags/:slug.
 *
 * 15 rows carried this on 2026-09-04 (mat-spandex 3,237 uses, vibe-vintage
 * 2,021, mat-lace 1,168 ...). Being unfiled was never the defect: the
 * 2026-08-29 taxonomy rebuild unfiled 92 of 98 marketplace-namespaced tags on
 * purpose, because they carry the corpus's highest usage counts and OWNED the
 * head of 25 glossary stops. What was never carried through was `seo_indexable`,
 * so a tag deliberately given no place in the information architecture kept
 * publishing a page in it — four of them about the wrong subject entirely
 * (vibe-vintage on winemaking, genre-ya on the medical sense of "young adult").
 *
 * Two things here are load-bearing and neither is visible from the counter's
 * value, which is why they are asserted rather than commented:
 *
 *   is_marketplace_facet()  is the term that separates PERMANENTLY uncategorized
 *                           (a facet, by decision) from TEMPORARILY uncategorized
 *                           (a new glossary tag, filed by the two-hourly sweep).
 *                           Rewriting this counter as "indexable and has no
 *                           category" reads non-zero every time ingest lands
 *                           ahead of that sweep — the exact sawtooth that forced
 *                           uncategorized_active to become advisory — and the
 *                           matching gate would deindex legitimate new glossary
 *                           tags with no way back, since only 'thin' is ever
 *                           auto-reversed.
 *
 *   trg_tag_facet_page_gate is what makes the count STRUCTURAL rather than a
 *                           queue depth, and therefore fair to gate on at all.
 *                           Without it the backlog simply regrows: seo_indexable
 *                           DEFAULTs to true, so any producer that never names
 *                           the column publishes a facet page.
 */
describe('tag_hygiene_stats() facet-page sentinel', () => {
  // Key-DEFINITION form, not a bare mention: the migration's header prose and
  // its assertion block both contain the quoted string, so `toContain` passes
  // even when the counter itself has been deleted.
  const KEY_DEF = /'indexable_marketplace_facet'\s*,\s*\(/;

  it('defines indexable_marketplace_facet as a counter', () => {
    expect(
      KEY_DEF.test(sql),
      'the facet-page sentinel was dropped from tag_hygiene_stats() — most likely by a ' +
        'concurrent branch restating the function; re-add the counter rather than re-baselining',
    ).toBe(true);
  });

  it('scopes the counter with is_marketplace_facet, not with a missing category', () => {
    const start = sql.search(KEY_DEF);
    expect(start, 'no counter body to check').toBeGreaterThan(-1);
    const end = sql.indexOf("'event_tag_strings_unresolved'", start);
    const body = sql.slice(start, end > -1 ? end : undefined).replace(/^\s*--.*$/gm, '');

    expect(body).toMatch(/is_marketplace_facet\s*\(\s*slug\s*,\s*entity_kind\s*\)/i);
    expect(body).toMatch(/seo_indexable/);
    // The sawtooth rewrite. `category_id is null` here would count every tag
    // waiting on the category sweep.
    expect(body, 'counting uncategorized tags makes this a queue depth').not.toMatch(
      /category_id\s+is\s+null/i,
    );
  });

  it('is backed by a write-time gate that only ever forces seo_indexable false', () => {
    const gate = (() => {
      for (let i = files.length - 1; i >= 0; i -= 1) {
        if (/create\s+trigger\s+trg_tag_facet_page_gate/i.test(sources[i])) return sources[i];
      }
      throw new Error('trg_tag_facet_page_gate is never created');
    })();

    // BEFORE, and column-scoped on the predicate's own inputs. A trigger scoped
    // only to seo_indexable would miss a tag re-slugged into a facet namespace.
    expect(gate).toMatch(/before\s+insert\s+or\s+update\s+of[^\n]*slug/i);
    expect(gate).toMatch(/before\s+insert\s+or\s+update\s+of[^\n]*entity_kind/i);

    // Only ever forces false. An assignment to `true` anywhere in the gate
    // function would make it a writer that can republish pages other writers
    // took down — the defect 20261030100000 exists to have removed.
    const fn = gate.slice(
      gate.search(/create\s+or\s+replace\s+function\s+public\.enforce_tag_facet_page_gate/i),
    );
    const body = fn.slice(0, fn.indexOf('$fn$;') + 1).replace(/^\s*--.*$/gm, '');
    expect(body).toMatch(/new\.seo_indexable\s*:=\s*false/i);
    expect(body).not.toMatch(/new\.seo_indexable\s*:=\s*true/i);

    // Stamped with a reason that is never auto-reversed. 'thin' is the ONLY
    // value run_tag_thin_page_reindex reverses, and a facet never gains a
    // category, so stamping 'thin' here would republish all 15 the next night.
    expect(body).toMatch(/seo_deindex_reason\s*:=\s*'facet'/i);
  });
});

/**
 * One pass per hot table (2026-09-15).
 *
 * The 2026-08-24 split above fixed the `event_tag_strings_unresolved` OR and
 * the function crept back to 20-40% of the 8s PostgREST ceiling anyway. On
 * 2026-09-14 it spent 8.3s and failed PR #3719 with 57014, on a diff it has
 * nothing to do with; it passed on re-run, and three other PRs called the same
 * function against the same database inside 40 seconds and passed.
 *
 * The arm that was looked at was not the cause. Measured on prod by BUFFERS
 * rather than wall time — a warm block is a shared_buffers hit, so warm
 * milliseconds hide physical I/O and are what pointed at the wrong arm:
 *
 *     totals.assignments            153,102 blk   <- index-only scan
 *     assignment_to_non_active_tag  153,102 blk   <- the SAME scan again
 *     event_tag_pairs_unlinked       76,631 blk
 *     events_with_tags_unlinked      62,288 blk
 *     event_tag_strings_unresolved   18,005 blk
 *     TOTAL                         494,997 blk / 1,718 ms warm
 *
 * Two thirds is `unified_tag_assignments`, not `events`. Three shared CTEs took
 * it to 57,585 blocks (8.6x): `events` 3 scans -> 1, `unified_tag_assignments`
 * 5 -> 2. Output verified byte-identical against the old body in ONE snapshot.
 *
 * The migration's own `do $verify$` block asserts this, but only for the
 * migration that carries it. `create or replace` overwrites the whole body, so
 * the NEXT migration to restate this function — and several have — would
 * silently reinstate five scans and pass its own postconditions. This is the
 * layer that notices. Same reason the OR-split above is a test and not a
 * comment.
 */
describe('tag_hygiene_stats() reads each hot table once', () => {
  /** The function body only: the header prose and the verify block name these
   *  same tables, and a whole-file scan is satisfied by either. */
  const body = (() => {
    const at = sql.search(/create\s+(or\s+replace\s+)?function\s+public\.tag_hygiene_stats\s*\(/i);
    const end = sql.indexOf('$function$;', at);
    expect(end, 'the function body is not $function$-quoted').toBeGreaterThan(at);
    return sql.slice(at, end).replace(/^\s*--.*$/gm, '');
  })();

  it('declares the three shared CTEs', () => {
    for (const cte of ['uta_rollup', 'ev_assign', 'ev']) {
      expect(body, `the ${cte} CTE is gone`).toMatch(
        new RegExp(`\\b${cte}\\s+as\\s+materialized\\s*\\(`, 'i'),
      );
    }
  });

  it('reads unified_tag_assignments exactly twice and events exactly once', () => {
    // Two, not one: uta_rollup aggregates the whole table to a single row while
    // ev_assign keeps 90k rows of the entity_type='event' slice — different
    // shapes, and that table is only 3,597 blocks, so a second seq scan is
    // cheap. A THIRD is a counter that went back to scanning for itself.
    expect((body.match(/from\s+unified_tag_assignments\b/gi) ?? []).length).toBe(2);
    expect((body.match(/from\s+events\b/gi) ?? []).length).toBe(1);
  });

  it('folds the three whole-table counters into one rollup', () => {
    // These are the two that ran the identical 153,102-block index-only scan,
    // plus the third counter that also reads the whole table.
    for (const key of ['assignments', 'assignment_to_non_active_tag', 'nonclean_entity_type']) {
      expect(body).toMatch(
        new RegExp(`'${key}',\\s*\\(select\\s+\\w+\\s+from\\s+uta_rollup\\)`, 'i'),
      );
    }
  });
});

// The gate script, not the function. A 57014 is the 8s statement_timeout on
// `authenticator` — no metric was evaluated, so the PR goes red for a reason
// unrelated to its diff. Measured 2026-09-14: the function is 1.3s warm against
// that ceiling (6x headroom) and the one recorded failure passed on re-run while
// three other PRs hit the same database and passed. Contention, not cost.
//
// Guards against the retry being tidied away. check-data-quality-gates.mjs and
// check-search-facets-parity.mjs carry the same handling and neither is guarded;
// this one is, because losing it turns a flake back into a blocked release.
describe('the tag-hygiene gate survives a statement timeout', () => {
  const SCRIPT = readFileSync(join(process.cwd(), 'scripts/check-tag-hygiene.mjs'), 'utf8');

  it('retries once on 57014 instead of failing the PR', () => {
    expect(SCRIPT).toMatch(/57014/);
    // Anchored on the RETRY, not just the code: printing 57014 in an error
    // message also matches a bare mention.
    expect(SCRIPT).toMatch(/includes\('57014'\)[\s\S]{0,400}?await callStats\(\)/);
  });

  it('retries exactly once', () => {
    // A retry that quietly succeeds is how a function creeps back toward the
    // ceiling unnoticed. Two calls total: the first and one retry.
    expect(SCRIPT.match(/await callStats\(\)/g) ?? []).toHaveLength(2);
  });

  it('still fails when the timeout persists', () => {
    // The retry must not swallow a real failure.
    expect(SCRIPT).toMatch(/if \(!res\.ok\) \{[\s\S]{0,200}?process\.exit\(1\)/);
  });

  // 2026-09-28. The retry existed and still could not save the gate: it fired
  // IMMEDIATELY, so both attempts landed in the same contention window and both
  // timed out, ~9s apart, measured twice on #3996. Contention on this instance
  // lasts minutes — re-measured the same day, the function is 1,523 ms on a quiet
  // instance (5.3x headroom under the 8s ceiling) and 4.2-19.4 s under 76
  // backends. So the delay, not the retry, is what makes this gate report
  // hygiene instead of load.
  it('waits before retrying, so the retry samples a DIFFERENT load window', () => {
    // Anchored from the 57014 branch THROUGH an awaited timer and INTO the retry
    // call. A delay declared at the top of the file and never awaited, or awaited
    // after the retry, does not satisfy this.
    expect(SCRIPT).toMatch(
      /includes\('57014'\)[\s\S]{0,400}?await new Promise[\s\S]{0,120}?setTimeout\([\s\S]{0,200}?await callStats\(\)/,
    );
  });

  it('delays long enough to outlast a spike, not a token pause', () => {
    // A 100ms sleep would satisfy the structural assertion above while changing
    // nothing: the window that broke #3996 was >9s wide.
    const m = SCRIPT.match(/RETRY_DELAY_MS\s*=\s*([0-9_]+)/);
    expect(m, 'RETRY_DELAY_MS must be a literal so its magnitude is reviewable').not.toBeNull();
    expect(Number(m![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(10_000);
  });
});

/**
 * No index-only scans (2026-09-18).
 *
 * The one-pass rewrite above held, and the gate still timed out with 57014 four
 * times — most recently 2026-09-18 — always on an unrelated diff, always green
 * on re-run. The arm it fixed was not the one that came back.
 *
 * Measured on prod by BUFFERS, never warm wall time (which has pointed at the
 * wrong arm twice in this function's history):
 *
 *     ev_assign (index-only scan, 64,714 heap fetches)  45,945 blk   46%
 *     event_tag_strings_unresolved (incl. the ev scan)  17,990 blk   18%
 *     uta_rollup (seq scan, the WHOLE same table)        3,675 blk
 *     TOTAL                                            100,299 blk
 *
 * `uta_rollup` reads all 264,185 rows of `unified_tag_assignments` in 3,675
 * blocks; `ev_assign` spends 45,945 reading an 88,144-row SUBSET of that same
 * table. The planner picks an index-only scan because `pg_class.relallvisible`
 * says every page is all-visible — it reads 3,675 of 3,675 — so it costs the
 * heap fetches at zero. The scan performs 64,714 of them. relallvisible only
 * moves on VACUUM/ANALYZE and these tables are written continuously, so on this
 * instance EVERY index-only scan is a latent 12x regression waiting on
 * autovacuum lag. This is its third recorded occurrence.
 *
 * A migration cannot fix a visibility map (VACUUM cannot run in a transaction),
 * so the fix is to stop depending on one: `SET enable_indexonlyscan TO 'off'`
 * on the function. 100,299 -> 55,149 blocks, output structurally unchanged
 * because a planner directive cannot change a result.
 *
 * Why this is a test and not just the migration's own verify block: `create or
 * replace function` RESETS proconfig wholesale when the new definition omits
 * the SET clause. Several branches restate this function, and the one that
 * applies last silently wins. A restatement that drops this line reinstates the
 * 45,945-block scan while every other assertion — here and in the migration —
 * still passes, and the gate goes back to flaking with nothing saying why.
 */
describe('tag_hygiene_stats() does not use index-only scans', () => {
  /**
   * The function SIGNATURE only — from `create ... function` to the body
   * delimiter, comments stripped.
   *
   * Scoping matters more than usual here. The migration's header prose and its
   * `do $verify$` block both contain the literal string `enable_indexonlyscan`,
   * so a whole-file `toContain` passes with the SET clause deleted — the
   * vacuous-assertion class this suite has already been bitten by twice.
   * Verified by mutation while writing this.
   */
  const signature = (() => {
    const at = sql.search(/create\s+(or\s+replace\s+)?function\s+public\.tag_hygiene_stats\s*\(/i);
    expect(at, 'no tag_hygiene_stats definition').toBeGreaterThan(-1);
    const end = sql.indexOf('AS $function$', at);
    expect(end, 'the function body is not $function$-quoted').toBeGreaterThan(at);
    return sql.slice(at, end).replace(/^\s*--.*$/gm, '');
  })();

  it('sets enable_indexonlyscan off in the function header', () => {
    expect(
      signature,
      'tag_hygiene_stats lost SET enable_indexonlyscan — the 45,945-block ev_assign ' +
        'index-only scan is back; re-add the setting rather than re-baselining the gate',
    ).toMatch(/\bSET\s+enable_indexonlyscan\s+TO\s+'off'/i);
  });

  it('keeps search_path on the SECURITY DEFINER function', () => {
    // Adding the second SET must not cost the first. Losing search_path on a
    // SECURITY DEFINER function is a security defect, not a performance one.
    expect(signature).toMatch(/\bSET\s+search_path\s+TO\s+'public'/i);
    expect(signature).toMatch(/SECURITY\s+DEFINER/i);
  });

  it('does not reintroduce a covering index on events', () => {
    // Measured and REJECTED on prod, recorded so it is not re-derived: a
    // covering partial index on events takes the `ev` CTE 16,112 -> 6,294
    // blocks, ~7k better than this fix, and buys back the exact dependency the
    // fix removes — it only pays while the visibility map is fresh, and its
    // reading already carried 5,868 heap fetches 7 minutes after an autovacuum.
    // It also needs a write-blocking SHARE lock on a 126 MB ingest table.
    const created = sources.some((s) =>
      /create\s+index[^;]*\bon\s+(public\.)?events\b[^;]*\binclude\s*\([^)]*\btags\b/i.test(s),
    );
    expect(
      created,
      'a covering index on events.tags was added; it is only a win while the ' +
        'visibility map is fresh — fix autovacuum on events instead',
    ).toBe(false);
  });
});

/**
 * 99991790719601 — one pass over `unified_tags`, and stop spilling to disk.
 *
 * SIXTH time this gate flaked. Measured on prod 2026-09-29 from
 * pg_stat_statements, i.e. from REAL CI calls rather than a timing someone took:
 * 1,983 calls mean 1,883 ms max 7,812 ms, and 1,269 calls mean 2,714 ms max
 * 7,854 ms — against an 8,000 ms ceiling. pg_stat_statements only records calls
 * that COMPLETED, so the real tail is past 8s and 7,854 is the largest survivor.
 * #3784's "6x headroom, therefore contention" no longer holds, and its retry
 * cannot help because the cause persists across both attempts.
 *
 * Two measured costs: `unified_tags` was scanned ELEVEN times (40,542 of 82,500
 * blocks, 49%), and `active as (select * from unified_tags ...)` spilled 10.5 MB
 * past work_mem = 12MB and 11 CTE Scans re-read it — ~100 MB of temp I/O per
 * call, which no previous pass on this function had measured.
 *
 * THE POINT OF THIS BLOCK IS THE APPLICATION METHOD, NOT THE NUMBERS. The live
 * body is NOT what any repo file says: live prosrc md5 is
 * 4102ec7c7ae4e7eecf3dcf7a4e765e26 while 99991789807686 — the newest file that
 * CONTAINS a definition — claims a7ed49bf570ac4e02b43dbf2d5936bde in its header,
 * because 99991789930597 narrowed four counters to `publication_role = 'article'`
 * by string surgery on pg_get_functiondef(). A `create or replace` built from the
 * newest FILE therefore silently reverts that work. This migration's first draft
 * did exactly that; its prod dry run caught it (four counters differed, because
 * the stale body was WIDER than production). Hence: patch, never restate.
 *
 * Note the consequence for `latestDefinitionOf` above — it returns
 * 99991789807686, which is NOT the deployed body. Every assertion in this file
 * that reads `sql` is checking a definition production no longer has. That gap
 * predates this migration and is recorded here rather than silently relied upon.
 */
describe('99991790719601 folds unified_tags without reverting the live body', () => {
  const MIG = '99991790719601_tag_hygiene_stats_one_pass_over_unified_tags.sql';
  const mig = (() => {
    const i = files.indexOf(MIG);
    expect(i, `${MIG} is missing`).toBeGreaterThan(-1);
    return sources[i];
  })();

  it('PATCHES the live definition and never restates it', () => {
    // The whole lesson. A restatement reverts 99991789930597's surgery.
    expect(
      /create\s+(or\s+replace\s+)?function\s+public\.tag_hygiene_stats\s*\(/i.test(mig),
      'this migration restates tag_hygiene_stats; it must patch pg_get_functiondef() ' +
        'instead, or it reverts 99991789930597 publication_role scoping',
    ).toBe(false);
    expect(mig).toMatch(
      /pg_get_functiondef\s*\(\s*'public\.tag_hygiene_stats\(\)'::regprocedure\s*\)/i,
    );
  });

  it('adds the shared `ut` CTE as a select * drop-in', () => {
    expect(mig).toMatch(/ut as materialized \(\s*\n\s*select \* from unified_tags\s*\n\s*\),/);
  });

  it('restores the two index-served arms after the global repoint', () => {
    // A CTE Scan has no index, so leaving these on `ut` restores the 4M-row
    // nested loop that 20260928143000 exists to prevent.
    for (const col of ['name', 'slug']) {
      expect(
        mig,
        `the lower(u.${col}) arm is not restored to unified_tags and loses its index`,
      ).toContain(`'from unified_tags u where lower(u.${col}) = e.s'`);
    }
  });

  it('asserts the OUTCOME is exactly three direct reads, twice', () => {
    // Once before installing (refuse) and once after (verify). 1 would mean the
    // index arms lost their index; >3 that a reader was not folded.
    const checks = mig.match(/expected 3 \(once in `ut`, twice in the index-served/g) ?? [];
    expect(checks.length, 'the 3-read outcome must be asserted pre- AND post-install').toBe(2);
    // COUNT, not presence. There are two `if n <> 3` — the pre-install refusal and
    // the post-install verify — so `toMatch` alone is satisfied by whichever one
    // survives, and loosening the other passes silently. Mutation testing caught
    // exactly that: `if n <> 3` -> `if n <> 4` on the first occurrence survived.
    const bounds = mig.match(/if n <> 3 then/g) ?? [];
    expect(
      bounds.length,
      'both the pre-install refusal and the post-install verify must bound at 3',
    ).toBe(2);
  });

  it('compares the answer before and after inside one transaction', () => {
    // Two separate calls prove nothing: this corpus moves between them.
    expect(mig).toMatch(/select public\.tag_hygiene_stats\(\) into v_before/);
    expect(mig).toMatch(/select public\.tag_hygiene_stats\(\) into v_after/);
    expect(mig).toMatch(/v_before is distinct from v_after/);
  });

  it('sets work_mem on the function and asserts all three settings survive', () => {
    // `create or replace` resets proconfig wholesale, so a later restatement that
    // forgets one SET silently reinstates the cost it removed.
    expect(mig).toMatch(/alter function public\.tag_hygiene_stats\(\) set work_mem to '48MB'/i);
    for (const k of ['search_path=public', 'enable_indexonlyscan=off', 'work_mem=48MB']) {
      expect(mig, `${k} is not asserted in the verify block`).toContain(`'${k}' = any(cfg)`);
    }
  });

  it('guards 99991789930597 publication_role scoping against a future revert', () => {
    expect(mig).toContain("position('publication_role = ''article''' in src) = 0");
  });

  it('is soft on preconditions so a re-run cannot block the repo', () => {
    // `db push` aborts the whole queue on a failing file. Already-folded is a
    // NOTICE, not an exception.
    expect(mig).toMatch(
      /if position\('ut as materialized' in v_def\) > 0 then\s*\n\s*raise notice/,
    );
  });
});

/**
 * The baseline FILE contract, as opposed to the SQL above.
 *
 * `--update` used to rebuild the baseline as `{_comment, ...metrics, _notes}`,
 * naming two control keys and silently dropping the third. Since
 * `ADVISORY = new Set(baseline._advisory ?? [])`, that turned all NINE advisory
 * metrics into HARD gates in one commit with nothing in the output saying so —
 * and the regression message tells you to run `--update`, so the trap was on the
 * documented path. Every one of the nine is advisory precisely because an
 * instantaneous value is not an invariant for it, so the next ordinary drift in
 * any of them would have red every open PR for a change its author did not make.
 *
 * Fixed on 2026-09-30 by carrying control keys generically. These tests exist so
 * a future rewrite of that block cannot reintroduce it by naming keys again.
 */
describe('tag-hygiene baseline file contract', () => {
  const script = readFileSync(join(process.cwd(), 'scripts', 'check-tag-hygiene.mjs'), 'utf8');
  const baseline = JSON.parse(
    readFileSync(join(process.cwd(), 'scripts', 'tag-hygiene-baseline.json'), 'utf8'),
  ) as Record<string, unknown>;

  /** The `if (UPDATE) { ... }` block only. */
  const updateBlock = (() => {
    const start = script.indexOf('if (UPDATE) {');
    expect(start, 'the --update block is gone').toBeGreaterThan(-1);
    const end = script.indexOf('\n}', start);
    return script.slice(start, end);
  })();

  it('carries control keys GENERICALLY, never by name', () => {
    // The whole defect: an enumerated list drops whatever it forgets.
    expect(updateBlock).toMatch(/Object\.keys\(baseline\)[\s\S]*startsWith\('_'\)/);
  });

  it('preserves _advisory across a re-baseline', () => {
    // Asserted on the block, because the failure is silent: the file is written,
    // exit code is 0, and nine gates change class with no output.
    expect(
      updateBlock,
      '--update must carry _advisory, or every advisory metric becomes a hard gate',
    ).toMatch(/_advisory|startsWith\('_'\)/);
  });

  it('reports which control keys it carried', () => {
    // A silent carry is indistinguishable from a silent drop.
    expect(updateBlock).toMatch(/carried/);
  });

  it('has a non-empty _advisory list whose every entry is a real metric', () => {
    // A typo here does not error — it silently promotes that metric to a hard
    // gate, which is the same outcome as dropping the key.
    const advisory = baseline._advisory as string[];
    expect(Array.isArray(advisory)).toBe(true);
    expect(
      advisory.length,
      '_advisory is empty; nine metrics would become hard gates',
    ).toBeGreaterThan(0);

    const metrics = new Set(Object.keys(baseline).filter((k) => !k.startsWith('_')));
    for (const k of advisory) {
      expect(metrics.has(k), `_advisory names "${k}", which is not a baseline metric`).toBe(true);
    }
  });

  // MEASURED AND NOT WRITTEN: "every metric baselined at 0 carries a note or is
  // advisory". Five zero-invariants that predate this change have no note
  // (alias_mojibake, assignment_to_non_active_tag, dangling_category_id,
  // event_tag_pairs_unlinked, nonclean_entity_type — all documented in CLAUDE.md
  // instead), so the assertion would ship RED, and a gate that is red on arrival
  // is one people scroll past. It also invents a documentation standard nobody
  // agreed to. Recorded rather than silently omitted.
});

/**
 * `prose_unreviewed` matches its producer (2026-09-30, 99991790828215).
 *
 * 99991789930597 narrowed this counter to `publication_role = 'article'`. All
 * 1,632 article rows are stamped, so it read 0 — and would have kept reading 0
 * WHETHER OR NOT THE CRON RAN. Its own baseline note states the contract it
 * could no longer honour: "a flat high number means the cron stopped."
 *
 * The producer is NOT role-scoped. tag-enrichment-sweep/index.ts:447 selects
 * `status = 'active'` and `description is not null` only, walking all 8,470
 * active prose-bearing rows, so its real queue was 4,056 (3,990 utility + 66
 * entity_redirect) against a gauge reading 0. A gauge scoped narrower than its
 * producer cannot report that producer stopping.
 *
 * Not cosmetic: 975 of those are reader-reachable, because fetchTagPreviews
 * (src/hooks/useTagPreviews.ts:36) filters `status = 'active'` and NOTHING else
 * — no role, no seo_indexable — so utility prose surfaces in the hover card.
 * 131 sit at usage >= 100, max 20,353.
 *
 * ONLY THIS ARM MOVED. The other two were measured and their scoping is
 * correct: uncategorized_active (458 utility rows) and
 * sensitive_without_description (71) both describe rows with no page and no
 * search presence, so widening them manufactures work. This file is the layer
 * that stops a future pass "tidying" all three to match.
 *
 * Asserted against the MIGRATION text, not `sql`: this migration patches
 * pg_get_functiondef() and contains no `create or replace`, so
 * latestDefinitionOf() cannot see it and would return a stale definition.
 */
describe('tag_hygiene_stats() prose_unreviewed is not role-scoped', () => {
  const MIG = '99991790828215_tag_hygiene_prose_unreviewed_matches_its_producer.sql';
  const mig = (() => {
    const i = files.indexOf(MIG);
    expect(i, `${MIG} is missing`).toBeGreaterThan(-1);
    return sources[i];
  })();

  it('PATCHES the live definition and never restates it', () => {
    // A restatement reverts 99991789930597's surgery AND 99991790719601's ut
    // CTE and work_mem, whichever the authoring file happened to omit.
    expect(
      /create\s+(or\s+replace\s+)?function\s+public\.tag_hygiene_stats\s*\(/i.test(mig),
      'this migration restates tag_hygiene_stats; it must patch pg_get_functiondef()',
    ).toBe(false);
    expect(mig).toMatch(/pg_get_functiondef\s*\(\s*p\.oid\s*\)/i);
  });

  it('widens exactly the prose arm, naming both the old and new text', () => {
    expect(mig).toContain(
      "'where publication_role = ''article'' and description is not null and prose_reviewed_at is null)'",
    );
    expect(mig).toContain("'where description is not null and prose_reviewed_at is null)'");
  });

  it('counts the arm text to be sure the replace cannot widen', () => {
    // A literal-occurrence count, not a regex: no escaping can broaden it, and
    // two occurrences would mean the replace silently rewrites another counter.
    expect(mig).toMatch(/length\(replace\(src, old_arm, ''\)\)\) \/ length\(old_arm\)/);
    expect(mig).toMatch(/occurs % times, expected 1/);
  });

  it('keeps the other two counters role-scoped, asserted BY NAME', () => {
    // Count alone is satisfied by unscoping the wrong arm and leaving 2.
    expect(mig).toContain("publication_role = ''article'' and category_id is null");
    expect(mig).toContain("publication_role = ''article'' and (is_sensitive or is_adult)");
    expect(mig).toMatch(/role-scoped arms remain, expected 2/);
  });

  it('asserts 99991790719601 and 99991789930597 both survive the patch', () => {
    expect(mig).toContain("position('ut as materialized' in src) = 0");
    expect(mig).toMatch(/unified_tags read % times, expected 3/);
    expect(mig).toContain("position('group by lower(btrim(name)), entity_kind' in src) = 0");
    for (const k of ['search_path=public', 'enable_indexonlyscan=off', 'work_mem=48MB']) {
      expect(mig, `${k} is not asserted in the verify block`).toContain(`'${k}'`);
    }
  });

  it('compares the counter against a COMPUTED queue, never a frozen literal', () => {
    // The corpus moves, so a hardcoded 4056 would rot into a false failure.
    expect(mig).toMatch(/into counter_val/);
    expect(mig).toMatch(/select count\(\*\) into expected from unified_tags/);
    expect(mig).toMatch(/counter_val <> expected/);
    // And it must NOT abort on zero: a rebuild-from-zero has an empty corpus,
    // where 0 = 0 is the correct answer.
    expect(mig).not.toMatch(/if counter_val = 0 then\s*\n\s*raise exception/);
  });

  it('is soft on preconditions so a re-run cannot block the repo', () => {
    expect(mig).toMatch(/if position\(new_arm in src\) > 0 then\s*\n\s*raise notice/);
  });

  it('baselines the widened counter and keeps it advisory', () => {
    const baseline = JSON.parse(
      readFileSync(join(process.cwd(), 'scripts', 'tag-hygiene-baseline.json'), 'utf8'),
    );
    // 4,056 measured on prod 2026-09-30. A re-narrowing would read 0, which is
    // an "improvement" the ratchet happily accepts — hence the lower bound.
    expect(baseline.prose_unreviewed, 'prose_unreviewed was re-narrowed to 0').toBeGreaterThan(
      1000,
    );
    // Queue depth, not an invariant: the house rule is to gate on AGE or a
    // write-time invariant, never on a level.
    expect(baseline._advisory ?? []).toContain('prose_unreviewed');
  });
});
