import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 20261006110000 repaired 21 tag pages the pre-#3087 kinktionary revival
 * reclassified and named five rows it declined to touch. Declining to follow
 * the text is not the same as leaving the row alone: both surfaces are
 * reader-visible and they disagreed, so each of those five published one
 * category on /tags/:slug (the junction, via `fetchTagWithCategories`) and a
 * different one in the search facet (`unified_tags.category`, via
 * search_documents). 20261006120000 decides each row and makes both say it.
 *
 * Four keep the category their page already shows and move only the text; one
 * — safe-sane-and-consensual-ssc — goes to `Consent & Negotiation`, which
 * neither column named, because that is where every peer consent framework
 * sits after 20261006110000 moved the scene-safety cohort down into it.
 *
 * Three parts of that shape are easy to "simplify" back into a bug:
 *
 *  1. PART 1 MUST NOT WRITE `category_id`. It is the mirror of 20261006110000's
 *     safety property. This migration decided those four pages are correct, so
 *     a write that also moved their filing would re-file the very pages it
 *     argued to keep — while looking like it was only fixing a facet.
 *
 *  2. THE NEW TEXT IS READ FROM THE PRIMARY JUNCTION, NEVER SPELLED OUT.
 *     A literal would let the migration invent a filing, and would stop being
 *     a no-op for a row a concurrent session already repaired.
 *
 *  3. THE CENSUS ASSERTION CARRIES NO SLUG EXCLUSIONS. 20261006110000 asserted
 *     the same shape with these five excused; dropping the exclusion is the
 *     entire point of this migration, and it is what makes a genuinely new
 *     disagreement fail loudly instead of joining a growing hold list.
 *
 * Text check against the migration file, not the database, so it runs in CI
 * without credentials — same pattern as `tagCategoryTextJunctionDisagreement`.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20261006120000_tag_category_five_holds.sql',
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

const flat = code.replace(/\s+/g, ' ').toLowerCase();

/** The four rows whose page value this migration decided was already correct. */
const KEPT_PAGE = ['crossdresser-transvestite', 'piss-slut', 'golden-shower', 'deli'];

describe('tag category five holds', () => {
  it('part 1 writes the text only, never the filing', () => {
    const part1 = statements.find(
      (s) => s.startsWith('update unified_tags') && s.includes('set category = c.name'),
    );
    expect(part1, 'part 1 UPDATE not found').toBeDefined();
    // `category_id =` in the SET list would re-file a page this migration
    // decided to keep. `\b` alone would not catch it, since `category =` is a
    // prefix of nothing here — match the id form explicitly.
    expect(part1).not.toMatch(/set [^;]*\bcategory_id\s*=/);
  });

  it('part 1 sources the new text from the primary junction, not a literal', () => {
    const part1 = statements.find(
      (s) => s.startsWith('update unified_tags') && s.includes('set category ='),
    );
    expect(part1).toContain('set category = c.name');
    expect(part1).toContain('a.is_primary');
    // Idempotent: a row a concurrent session already repaired is not selected.
    expect(part1).toContain('t.category is distinct from c.name');
  });

  it('part 1 covers exactly the four kept-page rows and not the ssc row', () => {
    const part1 = statements.find(
      (s) => s.startsWith('update unified_tags') && s.includes('set category = c.name'),
    )!;
    for (const slug of KEPT_PAGE) {
      expect(part1, `kept-page row missing from part 1: ${slug}`).toContain(slug);
    }
    // SSC moves by category_id so both triggers fire; a text-only write there
    // would leave the junction — and therefore the page — on the stale parent.
    expect(part1).not.toContain('safe-sane-and-consensual-ssc');
  });

  it('resolves the ssc target category by slug, never by name', () => {
    // PR B of the taxonomy swap renames category names; a name literal would
    // silently resolve to NULL after it lands.
    expect(flat).toMatch(/from tag_categories where slug = 'consent-negotiation'/);
    expect(flat).not.toMatch(/from tag_categories where name = 'consent & negotiation'/);
  });

  it('asserts the kept-page rows did not have their filing moved', () => {
    expect(code).toContain('kept-page row(s) had their filing moved');
    expect(flat).toContain('t.category_id is distinct from h.category_id_before');
  });

  it('asserts moderation did not move', () => {
    // unified_tags_recompute_is_adult() fires on the assignment insert and
    // recomputes from the tag's full assignment set. Under-moderation is the
    // worst failure class on this table, so a flip is checked, not assumed.
    expect(flat).toContain('t.is_adult is distinct from h.is_adult_before');
    expect(code).toContain('is_adult moved on');
  });

  it('checks the census corpus-wide with NO slug exclusions', () => {
    const census = statements.find(
      (s) =>
        s.includes('into v_n') &&
        /from unified_tags t join tag_category_assignments a/.test(s) &&
        s.includes('t.category is distinct from c.name') &&
        s.includes('exists (select 1 from tag_categories oc where oc.name = t.category)'),
    );
    expect(census, 'corpus-wide census assertion not found').toBeDefined();
    // The five holds must NOT be excused any more — that is the whole migration.
    expect(census).not.toContain('not in (');
    for (const slug of [...KEPT_PAGE, 'safe-sane-and-consensual-ssc']) {
      expect(census, `census still excuses ${slug}`).not.toContain(slug);
    }
    // Full corpus, not the temp table: a sampled assertion is how 20261003110400
    // shipped believing it was complete while 20 of 81 rows had survived it.
    expect(census).not.toContain('_five_holds');
    expect(code).toContain('still disagree with their primary junction');
  });

  it('refuses to run if the rows are no longer in the reviewed state', () => {
    expect(code).toContain('no longer in the reviewed state');
    expect(code).toMatch(/if v_n <> 5 then/);
  });

  it('sets a non-system actor so the human_reviewed audit guard does not reject the write', () => {
    // log_unified_tag_change() raises on any change to a human_reviewed row by
    // an actor matching 'system:%', and four of these five are human_reviewed.
    expect(code).toMatch(/set_config\('app\.actor',\s*'migration:/);
  });
});
