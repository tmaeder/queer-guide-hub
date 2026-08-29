import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 20261006110000 (#3097) named five rows it declined to touch, each publishing
 * one category on /tags/:slug (the junction) and a different one in the search
 * facet (`unified_tags.category` -> search_documents). 20261006140100 (taxonomy
 * v3, PR C) then re-filed the corpus and closed FOUR of them as a side effect.
 *
 * 20261006200000 is what is left: `safe-sane-and-consensual-ssc`, which now
 * agrees with itself — and is therefore invisible to the census — while sitting
 * on `Safety & Practices`, a LEGACY LEVEL-0 ROOT of the pre-v3 tree that PR E
 * deletes. Every peer consent framework, including this tag's own twin `ssc`,
 * sits in v3's `Safety & Consent -> Consent & Negotiation`.
 *
 * Four parts of that shape are easy to "simplify" back into a bug:
 *
 *  1. IT MUST NOT WRITE `category`. The BEFORE trigger derives the text from
 *     `category_id`; writing both by hand is exactly how the text and the
 *     junction diverged in the first place.
 *
 *  2. THE TARGET IS RESOLVED BY SLUG, AND SO IS ITS PARENT. v3 renames stops
 *     while keeping slugs (`Dynamics & Roles` still answers to
 *     `bdsm-power-exchange`, `Gender` to `gender-identity`), so a name literal
 *     is the one form guaranteed to rot — and without the parent check the
 *     migration could land on a same-named legacy stop.
 *
 *  3. THE DEFECT IS THE LEVEL-0 PARKING, NOT A TEXT DISAGREEMENT. The row's
 *     three surfaces already agree, so an assertion that only checked agreement
 *     would pass on the unfixed row.
 *
 *  4. IT MUST NOT ADOPT THE OTHER THREE STRANDEES. `cleanup`,
 *     `gewaltverbrechen` and `kriminell` are also parked on that legacy root
 *     and were NOT reviewed here. An "is the legacy root empty" assertion, or a
 *     widened UPDATE, would quietly make this migration responsible for them.
 *
 *  5. PART 2 IS NOT OPTIONAL. `trg_search_documents_tag` is AFTER UPDATE **OF**
 *     ... category ..., and a column-scoped trigger fires on the columns named
 *     in the UPDATE STATEMENT, not on what a BEFORE trigger mutated. So
 *     `SET category_id = ...` rewrites `category` and enqueues NOTHING (probed
 *     on prod: queue 24 -> 24 for a category_id write, 24 -> 25 for a category
 *     write). Without part 2 this migration moves the page and leaves the
 *     search facet on the old value — the exact defect it exists to end — and
 *     every other assertion still passes. Assertion 5b is what makes part 2
 *     non-vacuous, so both are pinned.
 *
 * Text check against the migration file, not the database, so it runs in CI
 * without credentials — same pattern as `tagCategoryTextJunctionDisagreement`.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Resolved by SUFFIX, never by a frozen version.
 *
 * This file was pinned to `20261006200000_ssc_consent_stop.sql` and that turned
 * a routine renumber into a red CI run. The migration merged but never applied:
 * higher versions reached prod first, so `supabase db push` refused the whole
 * batch as out-of-order and four consecutive deploys failed. The documented fix
 * is to renumber above the remote max — which is a thing that will happen again
 * to any migration that sits unapplied while other PRs land, so the version is
 * not a stable identifier and must not be treated as one. The suffix is.
 */
const MIGRATION_FILE = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('_ssc_consent_stop.sql'))
  .sort()
  .at(-1);

if (!MIGRATION_FILE) {
  throw new Error(
    'No *_ssc_consent_stop.sql in supabase/migrations — the migration this suite guards is gone, ' +
      'which is a real regression rather than a reason to skip.',
  );
}

const sql = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8');

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

/** Parked on the same legacy root, deliberately not this migration's business. */
const NOT_OURS = ['cleanup', 'gewaltverbrechen', 'kriminell'];

describe('ssc consent stop', () => {
  it('writes category_id only, never the category text', () => {
    const write = statements.find((s) => s.startsWith('update unified_tags') && s.includes('set '));
    expect(write, 'the UPDATE was not found').toBeDefined();
    expect(write).toContain('set category_id = v_target');
    // A bare `category =` assignment would bypass the BEFORE trigger that owns
    // the text. `\b` does not match `category_id =`, since `_` follows the word.
    expect(write).not.toMatch(/\bcategory\s*=/);
  });

  it('touches exactly one row, keyed by id', () => {
    const write = statements.find(
      (s) => s.startsWith('update unified_tags') && s.includes('set '),
    )!;
    expect(write).toMatch(/where id = v_ssc/);
    // Idempotent: re-applying against an already-moved row writes nothing.
    expect(write).toContain('category_id is distinct from v_target');
  });

  it('resolves the target by slug, never by name', () => {
    expect(flat).toMatch(/from tag_categories where slug = 'consent-negotiation'/);
    expect(flat).not.toMatch(/from tag_categories where name = 'consent & negotiation'/);
  });

  it('requires the v3 tree, checking the parent line by slug too', () => {
    // The precondition guard and the landing assertion BOTH spell out this pair,
    // so a whole-file `expect(flat).toContain(...)` is satisfied by either one
    // and passes with the other deleted — measured: dropping the parent check
    // from the guard alone left that form green. Each occurrence is pinned to
    // its own statement instead.
    // Anchored on each statement's own raise/shape, not on `startsWith` — the
    // `;`-split puts `begin` in front of the guard, which is how the first
    // attempt at this test failed on the UNMUTATED file.
    const guard = statements.find(
      (s) => s.includes('if not exists') && s.includes('taxonomy v3 tree) first'),
    );
    expect(guard, 'the v3 precondition guard was not found').toBeDefined();
    expect(guard).toContain("c.slug = 'consent-negotiation'");
    // Without this the guard is satisfied by the pre-v3 tree's own stop of the
    // same slug, and the move would mean something different.
    expect(guard).toContain("p.slug = 'safety-consent'");

    const landed = statements.find(
      (s) => s.includes('into v_n') && s.includes('a.category_id = c.id'),
    );
    expect(landed, 'the landing assertion was not found').toBeDefined();
    expect(landed).toContain("c.slug = 'consent-negotiation'");
    expect(landed).toContain("p.slug = 'safety-consent'");
  });

  it('asserts the row left level 0, which is the actual defect', () => {
    // The three surfaces already AGREE on the unfixed row, so an agreement-only
    // post-condition would pass without the move having happened.
    expect(flat).toContain('c.level = 0');
    expect(code).toContain('still filed at a level-0 root');
  });

  it('asserts moderation did not move', () => {
    expect(code).toContain('is_adult flipped on a non-kink move');
  });

  it('does not adopt the other tags parked on the legacy root', () => {
    for (const slug of NOT_OURS) {
      expect(code, `${slug} must not appear in the migration body`).not.toContain(slug);
    }
    // An "is the legacy root empty" assertion would make this migration
    // responsible for all four; the post-conditions are about v_ssc only.
    expect(flat).not.toMatch(/safety-practices/);
  });

  it('regression-checks the four holds taxonomy v3 already closed', () => {
    const check = statements.find(
      (s) => s.includes('into v_n') && s.includes('crossdresser-transvestite'),
    );
    expect(check, 'the four-hold regression check was not found').toBeDefined();
    for (const slug of ['crossdresser-transvestite', 'piss-slut', 'golden-shower', 'deli']) {
      expect(check, `closed hold not checked: ${slug}`).toContain(slug);
    }
    // All three surfaces, not just two.
    expect(check).toContain('t.category = idc.name');
    expect(check).toContain('a.category_id = t.category_id');
    expect(code).toMatch(/if v_n <> 4 then/);
  });

  it('checks the census over active rows with NO slug exclusions', () => {
    const census = statements.find(
      (s) =>
        s.includes('into v_n') &&
        s.includes('t.category is distinct from c.name') &&
        s.includes("t.status = 'active'"),
    );
    expect(census, 'corpus-wide census assertion not found').toBeDefined();
    // #3097 excused five slugs here; dropping that excuse is the whole point.
    expect(census).not.toContain('not in (');
    for (const slug of [
      'crossdresser-transvestite',
      'safe-sane-and-consensual-ssc',
      'piss-slut',
      'golden-shower',
      'deli',
    ]) {
      expect(census, `census still excuses ${slug}`).not.toContain(slug);
    }
    // Orphan-text rows stay excused by SHAPE, not by slug.
    expect(census).toMatch(
      /exists \(select 1 from tag_categories oc where oc\.name = t\.category\)/,
    );
    expect(code).toContain('disagree with their primary junction');
  });

  it('re-indexes search, because a category_id write does not reach the trigger', () => {
    const reindex = statements.find((s) => s.includes('search_documents_index_tags'));
    expect(reindex, 'part 2 (the search re-index) was not found').toBeDefined();
    // Structural predicate: column vs published facet. A slug list or an
    // unconditional reindex would both be wrong — one cannot self-heal, the
    // other is a blanket rewrite of the whole tag index.
    expect(reindex).toContain("s.facets ->> 'category'");
    expect(reindex).toContain('is distinct from');
    // Scoped to rows that actually reach a reader.
    expect(reindex).toContain("t.status = 'active'");
    expect(reindex).toContain('t.deprecated_at is null');
  });

  it('aborts instead of blanket-reindexing if the stale set grew past review', () => {
    expect(code).toMatch(/if v_stale > \d+ then/);
    expect(code).toContain('larger than the reviewed set');
  });

  it('asserts the published search facet agrees, not just the junction', () => {
    // Assertion 5 compares the column to the junction and would pass with part 2
    // deleted; only this one reads what search actually publishes.
    const thirdSurface = statements.find(
      (s) =>
        s.includes('into v_n') &&
        s.includes("s.facets ->> 'category'") &&
        s.includes('join search_documents'),
    );
    expect(thirdSurface, 'the published-facet assertion was not found').toBeDefined();
    expect(code).toContain('publish a stale search facet');
  });

  it('sets a non-system actor so the human_reviewed audit guard does not reject the write', () => {
    // log_unified_tag_change() raises on any change to a human_reviewed row by
    // an actor matching 'system:%', and this row is human_reviewed.
    expect(code).toMatch(/set_config\('app\.actor',\s*'migration:/);
  });
});
