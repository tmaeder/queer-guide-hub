import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 99991792213043 adds bookkeeping columns to `content_versioned_tables.ignore_columns`.
 *
 * content_revisions measured 5,348 MB + 926 MB of index on a 23 GB instance, and
 * 87.5% of the last 200,000 revisions were `quality_checked_at` on two tables --
 * a "when did I last look at this" stamp, in a trail built for content.
 *
 * The migration adds NO mechanism: `log_content_revision()` already filters
 * changed keys through ignore_columns and already returns without writing when
 * nothing survives. The registry was simply never populated.
 *
 * This file guards the registry CONTENT and the postconditions. The migration's
 * own verify block is the behavioural gate -- it proves against live data that a
 * bookkeeping-only update records nothing while a content change still records,
 * inside a subtransaction that rolls itself back.
 */

const MIGRATION = '99991792213043_content_revision_bookkeeping_columns.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Drop `--` comments: the header quotes column names and counts in prose. */
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

const statements = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('content_revisions bookkeeping column exclusions', () => {
  it('the comment stripper removes the header, so assertions are not satisfied by prose', () => {
    expect(raw).toMatch(/87\.5%/);
    expect(sql).not.toMatch(/87\.5%/);
  });

  it('excludes quality_checked_at on the two tables that produce 87.5% of revisions', () => {
    expect(statements).toMatch(/'quality_checked_at'/);
    expect(statements).toMatch(/table_name in \('marketplace_brands', 'organizations'\)/);
  });

  it('excludes the remaining bookkeeping stamps and the view counter', () => {
    for (const col of [
      'last_verified_at',
      'views_count',
      'link_checked_at',
      'attributes_extracted_at',
    ]) {
      expect(statements).toContain(`'${col}'`);
    }
  });

  it('does NOT exclude the derived scores, which were deliberately left alone', () => {
    // trust_score / quality_score / completeness_score are derived and recomputed
    // nightly, but a human may want their history and they are <3% of volume.
    // Adding them is a separate argument that needs its own evidence.
    for (const col of ['trust_score', 'quality_score', 'completeness_score']) {
      expect(statements).not.toContain(`'${col}'`);
    }
  });

  it('appends to ignore_columns rather than replacing it', () => {
    // Three UPDATEs, each unnesting the existing array before adding.
    const appends = statements.match(/unnest\(ignore_columns\s*\n?\s*\|\|/g) ?? [];
    expect(appends.length).toBe(3);
    expect(statements).not.toMatch(/set ignore_columns = array\[/);
  });

  it('validates every ignore_columns entry against the catalog, registry-wide', () => {
    // A typo is not an error -- it is an entry that never matches, which looks
    // exactly like a working exclusion. Checked across the whole registry, not
    // only the rows this file touches, so it also catches pre-existing typos.
    expect(verify).toMatch(/information_schema\.columns/);
    expect(verify).toMatch(/ignore_columns names column\(s\) that do not exist/);
    expect(verify).toMatch(
      /from public\.content_versioned_tables t,\s*unnest\(t\.ignore_columns\) col/,
    );
  });

  it('asserts updated_at survives on all four rows', () => {
    expect(verify).toMatch(/ignore_columns @> array\['updated_at'\]/);
    expect(verify).toMatch(/updated_at was dropped from/);
  });

  it('asserts BOTH behavioural halves, not just the suppression', () => {
    // Suppression alone is satisfied by a trigger that records nothing at all.
    expect(verify).toMatch(/bookkeeping-only update still recorded/);
    expect(verify).toMatch(/content change recorded % revisions, expected exactly 1/);
    expect(verify).toMatch(/if v_content_revs <> 1 then/);
    expect(verify).toMatch(/if v_bookkeeping_revs <> 0 then/);
  });

  it('runs the behavioural probe in a self-rolling-back subtransaction', () => {
    // It mutates a real row; it must undo that without a cleanup pass that could
    // match somebody else's data.
    expect(verify).toMatch(/raise exception 'ROLLBACK_BEHAVIOURAL_PROBE'/);
    expect(verify).toMatch(/if sqlerrm <> 'ROLLBACK_BEHAVIOURAL_PROBE' then\s*\n?\s*raise;/);
    // No tidy-up pass outside the subtransaction.
    expect(sql).not.toMatch(/do \$cleanup\$/);
  });

  it('initialises the probe counters so a skipped assignment fails closed', () => {
    expect(verify).toMatch(/v_bookkeeping_revs bigint := -1/);
    expect(verify).toMatch(/v_content_revs\s+bigint := -1/);
  });

  it('probes a real content column and not display_name', () => {
    expect(verify).toMatch(/story is not null/);
    expect(verify).toMatch(/set story = story \|\| ' probe'/);
    expect(verify).not.toMatch(/set display_name/);
  });

  it('has no loosened comparison or short-circuited predicate', () => {
    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    expect(verify).not.toMatch(/v_rows\s*(<|>)\s*4/);
    // Four distinct hard assertions, each on a condition rather than a message.
    const raises = verify.match(/raise exception/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(5);
  });
});
