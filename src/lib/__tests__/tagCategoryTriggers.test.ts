import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Changing a tag's category was impossible on prod, and nothing said so.
 *
 * Measured 2026-08-22, single row, no bulk involved:
 *
 *   update unified_tags set category_id = <any other> where id = <any tag>;
 *   ERROR 27000: tuple to be updated was already modified by an operation
 *                triggered by the current command
 *
 * The cycle was:
 *
 *   UPDATE unified_tags.category_id
 *     -> BEFORE trg_sync_tag_category (sync_tag_category_assignment)
 *          upserts into tag_category_assignments
 *     -> AFTER unified_tags_recompute_is_adult_trigger on THAT table
 *          UPDATE unified_tags SET is_adult WHERE id = <the same row>
 *     -> the in-flight tuple has already been modified -> 27000.
 *
 * A BEFORE trigger that writes a side table which writes back to the trigger's
 * own table can never work. Postgres says so in the error hint verbatim:
 * "Consider using an AFTER trigger instead of a BEFORE trigger to propagate
 * changes to other rows."
 *
 * 20260919100000 split it: BEFORE sets NEW.category (only legal in BEFORE),
 * AFTER does the junction upsert. These tests pin that split so a future
 * "simplify by merging the two triggers back together" silently re-breaks
 * every category write instead of passing review.
 *
 * Text check against the migrations directory, not the database, so it runs in
 * CI without credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    ) {
      const start = sql.search(
        new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i'),
      );
      const body = sql.slice(start);
      // Stop at the dollar-quoted terminator that closes the function body.
      const end = body.search(/\$fn\$\s*;|\$function\$\s*;|\$\$\s*;/);
      return end < 0 ? body : body.slice(0, end);
    }
  }
  throw new Error(`no migration defines ${fn}`);
}

describe('tag category triggers cannot re-enter the row being updated', () => {
  const before = latestDefinitionOf('sync_tag_category_assignment');
  const after = latestDefinitionOf('sync_tag_category_assignment_after');

  it('the BEFORE trigger writes no side table', () => {
    // This is the whole bug. Any insert/update/delete against another table
    // from here can be routed back into unified_tags by that table's own
    // triggers, and the outer UPDATE dies with 27000.
    expect(before).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+tag_category_assignments/i);
  });

  it('the BEFORE trigger still sets the denormalized category text', () => {
    // The one thing that genuinely requires BEFORE: mutating NEW.
    expect(before).toMatch(/new\.category\s*:=/i);
  });

  it('the AFTER trigger owns the junction upsert', () => {
    expect(after).toMatch(/insert\s+into\s+tag_category_assignments/i);
    expect(after).toMatch(/on\s+conflict\s*\(\s*tag_id\s*,\s*category_id\s*\)/i);
  });

  it('the is_adult recompute does not write when nothing changed', () => {
    // Not sufficient on its own — a tag genuinely moving into or out of
    // Sexuality & Kink still writes — but it removes the write on the
    // overwhelmingly common no-change path.
    const recompute = latestDefinitionOf('unified_tags_recompute_is_adult');
    expect(recompute).toMatch(/is_adult\s+is\s+distinct\s+from/i);
  });
});

describe('tag category consolidation never deletes a category with children', () => {
  // Match the exact version, not the substring: 20260802105740 is an EARLIER,
  // unrelated consolidation (it moved marketplace facet tags out of
  // Sexuality & Kink) and a substring filter picks it first.
  const files = readdirSync(MIGRATIONS).filter((f) => f.startsWith('20260919100000_'));

  it('ships the consolidation migration', () => {
    expect(files.length, 'expected 20260919100000_tag_category_consolidation.sql').toBeGreaterThan(
      0,
    );
  });

  it('guards the ON DELETE CASCADE on tag_categories.parent_id', () => {
    // tag_categories_parent_id_fkey is ON DELETE CASCADE and
    // unified_tags_category_id_fkey is ON DELETE SET NULL, so deleting a
    // level-0 root would cascade to its children and silently uncategorize
    // every tag underneath — 744 of them for the two roots in this map.
    const sql = readFileSync(join(MIGRATIONS, files[0]), 'utf8');
    expect(sql).toMatch(/still has % child categories|child categories/i);
    expect(sql).toMatch(/refusing to delete/i);
  });
});
