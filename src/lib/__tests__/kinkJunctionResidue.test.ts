import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `20261230113700` takes two ICD-coded medical conditions off an 18+ flag they
 * inherited from a Fetishes junction a merge left behind.
 *
 * Only the properties whose loss is SILENT are pinned. The migration asserts its
 * own effect against the database; what a text check adds is that it keeps
 * removing the CAUSE and keeps being narrow — both of which a later edit could
 * undo while every DB assertion still passed.
 */

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20261230113700_kink_junction_residue_on_medical_tags.sql',
  ),
  'utf8',
);

describe('kink junction residue on medical tags', () => {
  it('deletes the junction and never writes is_adult directly', () => {
    // is_adult is DERIVED — unified_tags_recompute_is_adult() owns it. Writing
    // the column would satisfy the migration's own is_adult assertion while
    // leaving the junction to be recomputed back, which is the exact failure
    // being undone, one layer down. Mutation-tested: swapping the DELETE for an
    // UPDATE fails with "the flag was cleared without the cause".
    expect(sql).toMatch(/delete from public\.tag_category_assignments/);
    expect(sql).not.toMatch(/update public\.unified_tags\s+set is_adult/);
    expect(sql).toMatch(/kink junction\(s\) survive on a target/);
  });

  it('selects by shape — clinical codes — and never by slug', () => {
    // Four of the six rows with this shape (cruising 770 uses, chemsex, fisting,
    // daddy) have a real kink dimension and must keep their flag. The
    // discriminator is tag_medical_codes, which separates the six exactly and
    // stays true for a row that acquires the shape later; a slug list would say
    // nothing about why. Mutation-tested: dropping the predicate selects 6 and
    // trips the count guard.
    expect(sql).toMatch(/from public\.tag_medical_codes m where m\.tag_id = t\.id/);
    const workList = sql.split('-- The work list, by shape.')[1]?.split('if coalesce')[0] ?? '';
    expect(workList, 'the work list must not name slugs').not.toMatch(/slug\s*(=|in)\s*'/);
  });

  it('refuses to run wide', () => {
    // If the shape ever matches a large set it has stopped meaning what the
    // header says, and junctions should not be deleted in bulk on that basis.
    expect(sql).toMatch(/array_length\(v_target, 1\) > 5/);
  });

  it('resolves the kink categories by name, and notices if that fails', () => {
    // The age gate is category-NAME-keyed on both sides. Resolving from names
    // means a renamed category surfaces as "resolved N categories" rather than
    // silently matching nothing and making the migration a no-op that passes.
    expect(sql).toMatch(/resolved only % kink categories/);
  });

  it('declares an actor', () => {
    // Both targets are human_reviewed and the recompute trigger writes
    // unified_tags on this migration's behalf, so log_unified_tag_change would
    // RAISE for a `system:%` actor even though only a junction row is deleted.
    expect(sql).toMatch(/set_config\('app\.actor', 'migration:kink-junction-residue', true\)/);
  });
});
