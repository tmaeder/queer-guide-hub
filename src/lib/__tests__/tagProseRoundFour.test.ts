import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 51500101160000 — round four of the disowned-prose backlog that
 * `tag_disowned_prose_signals()` counts.
 *
 * THREE rows, and the small number is the finding rather than a shortfall.
 * 66 candidates were hand-read in usage order after excluding the 49 the four
 * previous passes repaired and the 3 they deliberately named; 3 qualified.
 * Round three's rate was 11 of 64. The head of this backlog is worked out.
 *
 * WHAT MAKES THIS PASS DIFFERENT FROM ROUNDS TWO AND THREE, and why several
 * assertions below look inverted against `tagProseRoundThree.test.ts`:
 *
 *  - **All three rows have `description IS NULL`**, so the ORIGINAL rule (repair
 *    only where the row's own `description` establishes a sense the short/long
 *    description contradict) reaches none of them. This pass runs on the rule
 *    51500101152700 widened it to: the sense may also be established by a
 *    CATEGORY that admits exactly one reading of the tag's own name. The test
 *    asserts the widening is DECLARED, because a reader who assumes the old
 *    rule would conclude these three rows were repaired without evidence.
 *
 *  - **The actor declaration is NOT load-bearing here.** All three rows are
 *    `human_reviewed = false` (verified live), so `log_unified_tag_change()`
 *    would not RAISE for a system actor. It stays for attribution. Round
 *    three's header says the opposite about ITS rows and is correct about
 *    them — nine of eleven are `human_reviewed`. The test asserts this file
 *    says which of the two situations it is in, so the next pass does not
 *    copy the wrong precedent.
 *
 * The load-bearing assertions:
 *
 *  1. `description` is NEVER written. Here that is not the usual "it is the
 *     evidence" reason — it is NULL on all three — but writing it would be
 *     authoring a row's only lead paragraph from a category inference, which
 *     is one step further than the widened rule permits.
 *  2. `rooftop` replaces its SUMMARY as well as its body, and `casual` and
 *     `drag-show` do not. A test that only checked "the bodies changed" would
 *     pass against a version that left "Top covering of a building" standing
 *     as the lead line of a venue-type page.
 *  3. Every UPDATE is CONTENT-GUARDED on the defect's own text.
 *  4. Prose is REPLACED, never nulled — every row is active and rendering.
 *  5. The postconditions assert the DEFECT IS GONE, not that this file's
 *     wording is present, so a human's better fix also satisfies them.
 *  6. The three deferrals are NAMED, with `potato-salad` recorded as a FILING
 *     question (the `warlord` disposition), not a prose defect.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/51500101160000_tag_prose_wrong_subject_round_four.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

/**
 * Comment-stripped SQL. This file's header quotes the defective prose it
 * removes and names every slug it touches, so an assertion against the raw
 * text is satisfiable by the PROSE while the statement it describes is gone —
 * the vacuous-assertion class CLAUDE.md records five times.
 */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/**
 * Statements only. The `do $verify$` block re-states every defect signature in
 * order to assert it is absent, so a `toContain` over the whole file matches
 * the VERIFY copy and passes with the UPDATE deleted.
 */
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

describe('51500101160000 — glossary prose round four', () => {
  it('repairs exactly the three rows, and no others', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(new Set(slugs)).toEqual(new Set(['rooftop', 'casual', 'drag-show']));
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(3);
  });

  it('never writes `description`', () => {
    expect(statements).not.toMatch(/set[\s\S]{0,400}?\bdescription\s*=/);
  });

  it('guards every UPDATE on the defect it is removing', () => {
    // Three statements, three content guards -- so a row a human fixed first
    // keeps that work and this file no-ops on it.
    expect(statements).toContain(
      "and long_description like 'A roof is the top covering of a building%'",
    );
    expect(statements).toContain(
      "and long_description like 'The term ''casual'' can refer to various concepts%'",
    );
    expect(statements).toContain(
      "and long_description like 'A drag show is a form of entertainment where drag artists impersonate men or women%'",
    );
    expect(statements.match(/and long_description like/g)).toHaveLength(3);
    expect(statements.match(/and status = 'active'/g)).toHaveLength(3);
  });

  it('replaces prose rather than nulling it — every row is live and rendering', () => {
    expect(statements).not.toMatch(/long_description\s*=\s*null/);
    expect(statements).not.toMatch(/short_description\s*=\s*null/);
  });

  it('replaces rooftop’s SUMMARY too, and leaves the other two summaries alone', () => {
    // rooftop's lead line is roofing material on a venue page. casual's and
    // drag-show's summaries are correct, and casual's is the EVIDENCE the new
    // body was derived from -- overwriting it removes what licensed the change.
    expect(statements).toContain(
      "short_description = 'A bar, terrace or club on the roof of a building.'",
    );
    expect(statements.match(/short_description\s*=/g)).toHaveLength(1);
  });

  it('writes bodies the row’s own category supports, in the house register', () => {
    expect(statements).toContain(
      'A rooftop venue is a bar, restaurant, club or terrace on the roof of a building',
    );
    expect(statements).toContain('Casual describes a venue or event with no dress code');
    expect(statements).toContain('A drag show is a live performance by drag artists');
    // The narrowing this row exists to fix: drag kings and performers who work
    // outside the binary are named, and "impersonation" is refused explicitly.
    expect(statements).toContain('drag kings');
    expect(statements).toContain('Drag is performance, not impersonation.');
  });

  it('declares an admin actor for attribution', () => {
    expect(statements).toContain("set_config('app.actor', 'admin:tag-prose-round-four', true)");
    expect(statements).not.toMatch(/'system:/);
  });

  it('records that the actor declaration is NOT load-bearing here, unlike round three', () => {
    // All three rows are human_reviewed = false, so the trigger would not
    // RAISE. Round three's nine-of-eleven are the opposite case. Saying which
    // is which is what stops the next pass copying the wrong precedent.
    expect(sql).toMatch(/human_reviewed\s*=\s*false/);
    expect(sql).toMatch(/NOT LOAD-BEARING/i);
    expect(sql).toMatch(/51500101144000|round three/i);
  });

  it('declares that it runs on the WIDENED rule, and that the widening is bounded', () => {
    expect(sql).toMatch(/51500101152700/);
    expect(sql).toMatch(/description IS NULL/i);
    expect(sql).toMatch(/category/i);
    // The bound: the category must admit exactly one reading. It is NOT
    // widened to "pick the most likely sense", which is how the class arose.
    expect(sql).toMatch(/most likely sense/i);
  });

  it('names the deferrals, and files potato-salad as a CATEGORY question', () => {
    expect(sql).toMatch(/potato-salad/);
    expect(sql).toMatch(/warlord/);
    expect(sql).toMatch(/locker-room/);
    expect(sql).toMatch(/\btea\b/);
    expect(verify).toContain("'potato-salad','locker-room','tea'");
  });

  it('asserts the DEFECT is gone, not that this file’s wording is present', () => {
    expect(verify).toContain("short_description = 'Top covering of a building'");
    expect(verify).toContain("long_description like 'A roof is the top covering of a building%'");
    expect(verify).toContain(
      "raise exception 'round four: % row(s) still publish the disowned prose'",
    );
    // None of this file's NEW prose may appear in the hard postcondition.
    expect(verify).not.toContain('A bar, terrace or club on the roof');
    expect(verify).not.toContain('Drag is performance, not impersonation.');
  });

  it('tests for a literal backslash-n with position(), never LIKE', () => {
    // In a LIKE pattern the backslash is the ESCAPE character, so '%\n%' means
    // "contains the letter n" and matches everything (50900101100000 shipped
    // exactly that and caught it on its own dry run).
    expect(verify).toMatch(/position\('\\n' in coalesce\(long_description/);
    expect(verify).toMatch(/position\('\\n' in coalesce\(short_description/);
    expect(verify).not.toMatch(/like '%\\n%'/);
  });

  it('reports rather than aborts on everything it does not own', () => {
    // An abort on main takes every migration queued behind it, so only the
    // defects this file exists to remove may RAISE.
    expect(verify.match(/raise exception/g)).toHaveLength(2);
    expect(verify.match(/raise notice/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('records the hit rate, so the tail is planned against 3-of-66 not the 45% upper bound', () => {
    expect(sql).toMatch(/66/);
    expect(sql).toMatch(/45%/);
    expect(verify).toMatch(/3 of 66 hand-read candidates qualified/);
  });
});
