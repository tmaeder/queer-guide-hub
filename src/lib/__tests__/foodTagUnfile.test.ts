import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The food-unfiling loop must reach LIVE tags and must clear all three filing
 * surfaces. Both halves have already failed in production, three weeks apart in
 * effect but in the same migration.
 *
 * 1. `20261003110400` resolved the tag with
 *    `where slug = r.slug and status = 'deprecated'`, and raised on anything it
 *    could not reach. `supabase db push` applies in version order and stops at
 *    the first error, so on 2026-08-29 three live food tags did not surface a
 *    row for review — they aborted every migration in the repo. The same commit
 *    (9353d042a) failed twice and then went green with no code change, because
 *    the rows the assertion named were edited on prod by hand until it stopped
 *    firing.
 *
 * 2. Its UPDATE was gated `where id = v_tag_id and category_id = v_cat_id`, so
 *    the 20 food tags filed as substances by the denormalized `category` TEXT
 *    alone (`category_id IS NULL`, no junction row) kept that text. Its
 *    assertion sampled ten slugs, none of which was one of the twenty, so it
 *    passed. A sample containing only rows the loop could reach proves nothing.
 *
 * `20261004110400` fixes both. These tests pin the two properties that made the
 * fix a fix, so a later "tidy up the food list" migration cannot reintroduce
 * either. Text check against the migrations directory, not the database, so it
 * runs in CI without credentials — same pattern as `tagCategoryTriggers.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

// The distinctive member of the 81-slug food list; nothing else in the schema
// mentions it, so it identifies every migration that unfiles this cohort.
const FOOD_LIST_MARKER = "'wild-boar-sloppy-joe'";

function latestFoodUnfileMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    if (sql.includes(FOOD_LIST_MARKER)) return { file, sql };
  }
  throw new Error('no migration carries the food slug list');
}

describe('food tags are unfiled regardless of status, across every filing surface', () => {
  const { file, sql } = latestFoodUnfileMigration();

  it('is the migration that fixed both faults, or something newer', () => {
    expect(file >= '20261004110400_food_unfile_all_statuses_and_surfaces.sql').toBe(true);
  });

  it('does not gate the tag lookup on status — a live food tag must be reachable', () => {
    // `select id into v_tag_id from public.unified_tags where slug = ...` must
    // not carry a status predicate. Fault 1 was exactly this one `and`.
    const lookups = sql.match(
      /select\s+id\s+into\s+v_tag_id\s+from\s+public\.unified_tags\s+where[^;]*;/gi,
    );
    expect(lookups, 'expected the loop to resolve the tag id by slug').toBeTruthy();
    for (const lookup of lookups!) {
      expect(
        /\bstatus\b/i.test(lookup),
        `a live food tag is unreachable again — status predicate in: ${lookup.trim()}`,
      ).toBe(false);
    }
  });

  it('does not gate the unfiling UPDATE on category_id alone', () => {
    // Fault 2: `where id = v_tag_id and category_id = v_cat_id` can never match
    // a row filed only by the denormalized text.
    expect(
      /where\s+t?\.?id\s*=\s*v_tag_id\s+and\s+category_id\s*=\s*v_cat_id\s*;/i.test(sql),
      'the UPDATE is gated on category_id alone — text-only filings will survive again',
    ).toBe(false);
    // It must consider the text as an entry condition too.
    expect(/category\s*=\s*v_cat_name/i.test(sql)).toBe(true);
  });

  it('clears the junction row, the category_id and the denormalized text', () => {
    expect(/delete\s+from\s+public\.tag_category_assignments/i.test(sql)).toBe(true);
    expect(/set\s+category_id\s*=\s*nullif\(/i.test(sql)).toBe(true);
    expect(/category\s*=\s*\(\s*select\s+c\.name/i.test(sql)).toBe(true);
  });

  it('asserts over the whole cohort, not a ten-slug sample', () => {
    // The closing assertion must join the full food list and test all three
    // surfaces. A sample is what let the twenty text-only rows through.
    const assertion = sql.slice(sql.search(/still filed as substances/i) - 800);
    expect(/_food\s+f\s+join\s+public\.unified_tags/i.test(assertion)).toBe(true);
    expect(/tag_category_assignments/i.test(assertion)).toBe(true);
    expect(/category_id\s*=\s*v_cat_id/i.test(assertion)).toBe(true);
    expect(/category\s*=\s*v_cat_name/i.test(assertion)).toBe(true);
  });

  it('refuses to change status — unfiling is not retirement', () => {
    // A live food tag stays live and keeps its prose; it only stops being a
    // substance. Without this, "handle live tags" could quietly become a
    // deprecation sweep, which is what was done by hand on 2026-08-29.
    expect(/v_live_after\s+is\s+distinct\s+from\s+v_live_before/i.test(sql)).toBe(true);
    expect(/must never retire a tag/i.test(sql)).toBe(true);
  });
});
