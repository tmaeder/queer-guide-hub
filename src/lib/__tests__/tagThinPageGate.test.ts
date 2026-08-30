import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two invariants that live in SQL and have both been violated in production.
 *
 * 1. A tag with no description must not be `seo_indexable`. It used to be
 *    enforced only by the daily `tag_thin_page_reindex` sweep at 04:20, while
 *    the weekly `pipeline-tags-ingestion` produced its batch at 05:00 Sunday —
 *    so 137 thin pages were live for ~23 hours every week, and because
 *    `indexable_without_description` is a HARD gate in check-tag-hygiene.mjs
 *    that reads PROD, every open pull request in the repo failed for those 23
 *    hours. 20261025120000 moved the rule to a BEFORE trigger so there is no
 *    window at all.
 *
 * 2. The sweep's re-index arm must reverse only its OWN deindex. It used to
 *    approximate that as `not is_sensitive and not is_adult`, which covers the
 *    sensitivity gate and nothing else, and on 2026-08-30 04:20 it republished
 *    82 pages that a migration had deindexed for carrying verbatim-copied
 *    prose (169 corpus-wide). The rule is now `seo_deindex_reason = 'thin'`,
 *    default-deny.
 *
 * Text checks against supabase/migrations, so they run in CI without database
 * credentials — same pattern as citySafetyBackfill.test.ts.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const sqlFiles = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

function latestMatching(re: RegExp, what: string): string {
  for (const f of [...sqlFiles].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (re.test(sql)) return sql;
  }
  throw new Error(`no migration contains ${what}`);
}

/**
 * `create [or replace] function`, not merely `function`: a GRANT, REVOKE,
 * COMMENT ON or DROP naming the function also contains "function public.<fn>("
 * and would otherwise win the reverse scan.
 */
const latestDefinitionOf = (fn: string) =>
  latestMatching(
    new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i'),
    `a definition of ${fn}`,
  );

describe('thin tags are not indexable at birth', () => {
  const sql = latestDefinitionOf('enforce_tag_thin_page_gate');
  const body = sql.slice(
    sql.search(/create\s+(or\s+replace\s+)?function\s+public\.enforce_tag_thin_page_gate/i),
  );

  it('decides on the shared prose predicate, not its own spelling', () => {
    expect(body).toMatch(
      /tag_has_prose\s*\(\s*new\.description\s*,\s*new\.short_description\s*\)/i,
    );
  });

  it('only ever forces seo_indexable false', () => {
    const assignments = [...body.matchAll(/new\.seo_indexable\s*:=\s*(\w+)/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    expect(assignments.length).toBeGreaterThan(0);
    expect(assignments.every((v) => v === 'false')).toBe(true);
  });

  it('stamps the reason so the sweep can tell its own decision apart', () => {
    expect(body).toMatch(/new\.seo_deindex_reason\s*:=\s*'thin'/i);
  });

  const trigger = latestMatching(
    /create\s+trigger\s+trg_tag_thin_page_gate/i,
    'the trg_tag_thin_page_gate trigger',
  );
  const triggerDef = trigger.slice(trigger.search(/create\s+trigger\s+trg_tag_thin_page_gate/i));
  const columnScope = triggerDef.slice(0, triggerDef.indexOf('on public.unified_tags'));

  // A column-scoped trigger fires only on the columns named in the UPDATE
  // statement. `status`/`merged_into_id` are in scope because reviving a
  // deprecated tag is the other way an indexable-and-thin row appears.
  it.each(['description', 'short_description', 'seo_indexable', 'status', 'merged_into_id'])(
    'fires on UPDATE OF %s',
    (col) => {
      expect(columnScope).toMatch(new RegExp(`\\b${col}\\b`));
    },
  );

  it('fires on INSERT, which is where the weekly batch arrives', () => {
    expect(columnScope).toMatch(/before\s+insert\s+or\s+update\s+of/i);
  });
});

describe('run_tag_thin_page_reindex reverses only its own deindex', () => {
  const sql = latestDefinitionOf('run_tag_thin_page_reindex');
  const fn = sql.slice(
    sql.search(/create\s+(or\s+replace\s+)?function\s+public\.run_tag_thin_page_reindex/i),
  );

  /** The arm whose UPDATE sets seo_indexable = true. */
  const reindexArm = (() => {
    const at = fn.search(/set\s+seo_indexable\s*=\s*true/i);
    expect(at, 'no arm sets seo_indexable = true').toBeGreaterThan(-1);
    const before = fn.slice(0, at);
    const armStart = before.lastIndexOf('with cand as');
    return fn.slice(armStart, at + 200);
  })();

  const deindexArm = (() => {
    const at = fn.search(/set\s+seo_indexable\s*=\s*false/i);
    expect(at, 'no arm sets seo_indexable = false').toBeGreaterThan(-1);
    const before = fn.slice(0, at);
    return fn.slice(before.lastIndexOf('with cand as'), at + 200);
  })();

  it('re-indexes only rows stamped thin', () => {
    expect(reindexArm).toMatch(/seo_deindex_reason\s*=\s*'thin'/i);
  });

  it('clears the reason when it re-indexes', () => {
    expect(reindexArm).toMatch(/seo_deindex_reason\s*=\s*null/i);
  });

  it('still refuses to reverse a sensitivity deindex', () => {
    expect(reindexArm).toMatch(/not\s+is_sensitive\s+and\s+not\s+is_adult/i);
  });

  it('stamps thin when it deindexes, or its own re-index arm would never fire', () => {
    expect(deindexArm).toMatch(/seo_deindex_reason\s*=\s*'thin'/i);
  });
});
