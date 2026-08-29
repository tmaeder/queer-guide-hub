import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prod ran the pre-#3087 kinktionary revival 16 minutes before its own fix
 * merged, and the fix can never reach the rows it damaged.
 *
 *   2026-08-29 06:08:40 UTC   waves w3 + w4 applied (schema_migrations)
 *   2026-08-29 06:24:36 UTC   12af05ccb authored
 *
 * The loop those waves carried demoted every primary junction row and inserted
 * `unified_tags.category_id` as primary instead. 12af05ccb reversed that after
 * reading the renderer — `fetchTagWithCategories` selects from
 * tag_category_assignments, so the junction is what /tags/:slug shows — but the
 * versions were already recorded applied, so `db push` will never re-run them.
 * 24 live pages kept the regression.
 *
 * 20261006110000 repairs them, and the shape of that repair is what these tests
 * pin, because two parts of it are easy to "simplify" back into a bug:
 *
 *  1. PART 1 MUST NOT WRITE `category`. The argument for moving those rows is
 *     that the text is the surviving copy of the curated pre-06:08 junction. A
 *     repair that rewrote the text would destroy the evidence it relies on, so
 *     the migration asserts the text did not move and only ever writes
 *     `category_id`, letting the owned triggers move the junction.
 *
 *  2. PART 1 IS RESTRICTED TO A STRICT PARENT -> CHILD MOVE. Without the
 *     `parent_id` join the same predicate also matches three cross-branch and
 *     sibling rows, and following the text there is editorially WRONG rather
 *     than merely different: crossdresser-transvestite would move Gender
 *     Identity -> Sexual Health (pathologising a gender-expression term) and
 *     safe-sane-and-consensual-ssc would move Safety & Practices -> Slang &
 *     Terminology (SSC is a consent framework, not slang). Dropping that join
 *     looks like a harmless generalisation and silently re-files both.
 *
 * Text check against the migration file, not the database, so it runs in CI
 * without credentials — same pattern as `tagCategoryTriggers.test.ts`.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261006110000_tag_category_text_junction_disagreement.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

/** The migration minus its `--` comment lines, so prose cannot satisfy a test. */
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** Statements, whitespace-normalised, so reformatting cannot fail a test. */
const statements = code
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
  .filter(Boolean);

describe('tag category text/junction disagreement repair', () => {
  it('restricts part 1 to a strict parent -> child move', () => {
    // The join that excludes the cross-branch and sibling rows. Whitespace is
    // normalised so reformatting the migration does not fail the test.
    expect(code.replace(/\s+/g, ' ')).toContain('curated_c.parent_id = prim_c.id');
  });

  it('scopes part 1 to the rows the 2026-08-29 revival batch minted', () => {
    expect(code).toMatch(/prim\.created_at\s*>=\s*timestamptz\s*'2026-08-29/);
  });

  it('requires the target category to already exist on the tag', () => {
    // `curated` is joined from tag_category_assignments, so part 1 can only
    // ever point at an assignment that was already there — never a new filing.
    expect(code.replace(/\s+/g, ' ')).toMatch(
      /join tag_category_assignments curated on curated\.tag_id = t\.id and not curated\.is_primary/,
    );
  });

  it('part 1 writes category_id only, never the category text', () => {
    const part1 = statements.find(
      (s) => s.startsWith('update unified_tags') && s.includes('_revival_collateral'),
    );
    expect(part1, 'part 1 UPDATE not found').toBeDefined();
    expect(part1).toContain('set category_id = r.target');
    // Assigning `category` here would overwrite the very evidence part 1 relies
    // on. Matched as a bare column assignment rather than `set category = ...`,
    // so a second assignment in the same SET list is caught too — the looser
    // form passed a mutation that appended `, category = 'x'`. `\b` does not
    // match `category_id =`, since `_` follows the word.
    expect(part1).not.toMatch(/\bcategory\s*=/);
  });

  it('asserts the published text did not move on part 1 rows', () => {
    expect(code).toContain('changed their published category text');
    expect(code.replace(/\s+/g, ' ')).toContain('where t.category is distinct from r.text_before');
  });

  it('asserts the class is empty corpus-wide, not over a sample', () => {
    // The post-condition must select straight from unified_tags rather than
    // from either temp table — a sampled assertion is how 20261003110400
    // shipped believing it was complete while 20 of 81 rows had survived it.
    const corpusWide = statements.find(
      (s) =>
        s.includes('into v_bad') &&
        /from unified_tags t\s+join tag_category_assignments a/.test(s) &&
        s.includes('t.category is distinct from c.name'),
    );
    expect(corpusWide, 'corpus-wide disagreement assertion not found').toBeDefined();
    expect(corpusWide).not.toContain('_revival_collateral');
    expect(corpusWide).not.toContain('_junction_wins');
    expect(code).toContain('still disagree with their primary junction');
  });

  it('aborts instead of blanket-writing if the class grew past what was reviewed', () => {
    expect(code).toMatch(/v_part1 > \d+ or v_part2 > \d+/);
    expect(code).toContain('class larger than reviewed');
  });

  it('sets a non-system actor so the human_reviewed audit guard does not reject the write', () => {
    // log_unified_tag_change() raises on any change to a human_reviewed row by
    // an actor matching 'system:%', and the revival set human_reviewed on all
    // of these rows.
    expect(code).toMatch(/set_config\('app\.actor',\s*'migration:/);
  });
});
