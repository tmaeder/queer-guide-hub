import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `merge_tag_concept` re-parents the loser's `tag_category_assignments` rows
 * VERBATIM — `is_primary` included — after de-duplicating only by `category_id`.
 * So merging two tags whose primary categories DIFFER leaves the winner with two
 * primaries. `20261007140000_prevention_bathroom_plural_twin` did exactly that
 * to `gender-neutral-bathroom`, and cron `tag_plural_merge` (25 4 * * *) calls
 * the same function unattended.
 *
 * It matters because `fetchTagWithCategories` picks the primary with
 * `categories.find((c) => c.is_primary)` over an UNORDERED PostgREST result: two
 * primaries means the category shown on the page is chosen by row order and can
 * contradict the search facet, which reads the unambiguous `category` text.
 *
 * Three parts of the repair are easy to "simplify" into something worse:
 *
 *  1. IT MUST DEMOTE, NOT DELETE. The loser's filing stays as a secondary
 *     assignment — that is how every cross-listed tag is represented, and
 *     deleting a curated assignment is a separate editorial act.
 *
 *  2. THE SURVIVOR IS CHOSEN BY `unified_tags.category_id`, NOT BY AGE OR BY
 *     NAME. That column is what the sync triggers own, and it already agrees
 *     with the text mirror and the search facet. Picking "the oldest" would
 *     have kept `Gender`, which is the retired-v2 filing the merge dragged in.
 *
 *  3. IT MUST NOT LEAVE A TAG WITH ZERO PRIMARIES. That is strictly worse than
 *     two: `fetchTagWithCategories` then falls back to `categories[0]`, which is
 *     unordered again — the same non-determinism, with no way to notice.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
/** Located by SUFFIX, never by version — migrations get renumbered routinely
 *  when they wait behind another PR, and a version-pinned path turns that
 *  bookkeeping into a red test. */
const FILE = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('_tag_merge_left_two_primaries.sql'))
  .sort()
  .pop();
if (!FILE) throw new Error('no *_tag_merge_left_two_primaries.sql migration found');

const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8');

/** The migration minus its `--` comment lines, so prose cannot satisfy a test. */
const code = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const statements = code
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
  .filter(Boolean);

describe('tag merge left two primaries', () => {
  it('demotes rather than deletes', () => {
    expect(statements.some((s) => s.startsWith('delete from tag_category_assignments'))).toBe(
      false,
    );
    const write = statements.find((s) => s.startsWith('update tag_category_assignments'));
    expect(write, 'the demote UPDATE was not found').toBeDefined();
    expect(write).toContain('set is_primary = false');
  });

  it('chooses the survivor by unified_tags.category_id', () => {
    const write = statements.find((s) => s.startsWith('update tag_category_assignments'))!;
    expect(write).toContain('a.category_id is distinct from t.category_id');
    // Never "keep the oldest" — that keeps the loser's retired filing.
    expect(write).not.toContain('order by a.created_at');
  });

  it('is scoped to tags that actually have more than one primary', () => {
    const write = statements.find((s) => s.startsWith('update tag_category_assignments'))!;
    expect(write).toContain('having count(*) > 1');
    // A corpus-wide re-assertion would silently re-file tags whose single
    // primary merely disagrees with category_id — a different, unreviewed class.
    expect(write).toContain('t.category_id is not null');
  });

  it('asserts no tag was left with zero primaries', () => {
    // Anchored on the query's own shape, not on the raise: the `;`-split puts
    // `select ... into v_n` and its `raise exception` in SEPARATE chunks, so a
    // finder requiring both in one statement matches nothing — which is how the
    // first version of this test failed on the unmutated file.
    const stranded = statements.find(
      (s) =>
        s.includes('into v_n') &&
        s.includes('not exists') &&
        s.includes('a.is_primary') &&
        s.includes('exists (select 1 from tag_category_assignments a where a.tag_id = t.id)'),
    );
    expect(stranded, 'the zero-primary assertion was not found').toBeDefined();
    expect(code).toContain('now have NO primary');
  });

  it('asserts the corpus-wide invariant, not just the row it started from', () => {
    const invariant = statements.find(
      (s) =>
        s.includes('into v_n') &&
        s.includes('having count(*) > 1') &&
        !s.startsWith('update tag_category_assignments'),
    );
    expect(invariant, 'the corpus-wide primary-count assertion was not found').toBeDefined();
    expect(invariant).not.toContain('gender-neutral-bathroom');
  });

  it('re-asserts the census that surfaced this', () => {
    const census = statements.find(
      (s) => s.includes('into v_n') && s.includes('t.category is distinct from c.name'),
    );
    expect(census, 'the census assertion was not found').toBeDefined();
    expect(census).toContain("t.status = 'active'");
    expect(census).toMatch(
      /exists \(select 1 from tag_categories oc where oc\.name = t\.category\)/,
    );
  });

  it('aborts if the violating set grew past what was reviewed', () => {
    expect(code).toMatch(/if v_before > \d+ then/);
    expect(code).toContain('larger than the reviewed set');
  });

  it('sets a non-system actor', () => {
    expect(code).toMatch(/set_config\('app\.actor',\s*'migration:/);
  });
});
