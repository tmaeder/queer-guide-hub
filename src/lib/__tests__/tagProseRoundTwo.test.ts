import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 51500101143000 — round two of the disowned-prose backlog that
 * `tag_disowned_prose_signals()` counts (360 before 50700101100200, 352 after).
 *
 * Two groups under two DIFFERENT rules, and the separation is the point:
 *
 *  A. Wrong subject (10 rows) — repaired only where the row's own
 *     `description` establishes a sense the short/long description contradict.
 *     `leader` carried 452 characters on newspaper editorials over "Person in
 *     charge"; `leatherman` 376 on the Portland tool company; `values` and
 *     `stability` carried Wikidata property documentation.
 *
 *  B. Disambiguation artifacts (14 rows) — "Term with multiple meanings" and
 *     friends, where the new summary is DERIVED from the row's own
 *     `description`. No sense is chosen, so this group needs no judgement.
 *
 * The load-bearing assertions:
 *
 *  1. `description` is never written. It is the evidence in both groups.
 *  2. `woman` gets both fields while `man` (50700101100200) kept its body —
 *     the decision inverts because `man`'s body was already trans-inclusive
 *     and `woman`'s is gamete essentialism. Read the prose, not the pattern.
 *  3. The body postcondition is SLUG-SCOPED. A corpus-wide `LIKE` flags
 *     `live-music`, which carries the same concert body and for which it is
 *     correct.
 *  4. Group B is asserted CLOSED (the cohort measured 14), not sampled.
 *
 * Assertions run against COMMENT-STRIPPED SQL: the header quotes the wrong
 * prose being removed, so a bare toContain over the raw file would pass with
 * the real statement deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FILE = '51500101143000_tag_prose_wrong_subject_round_two.sql';

/** Line comments only; this file uses no block comments. */
const sql = readFileSync(join(MIGRATIONS, FILE), 'utf8')
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

const stmtFor = (slug: string): string => {
  const i = sql.indexOf(`where slug = '${slug}'`);
  const j = i > -1 ? i : sql.indexOf(`where slug='${slug}'`);
  expect(j).toBeGreaterThan(-1);
  const start = sql.lastIndexOf('update unified_tags', j);
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf(';', j));
};

const GROUP_A: Array<[string, RegExp]> = [
  ['leader', /short_description = 'Newspaper or magazine opinion piece'/],
  ['lioness', /short_description = 'Female lion or Russian actress'/],
  ['woman', /short_description = 'Female individual'/],
  ['leatherman', /short_description = 'American multi-tool brand'/],
  ['live-music-venue', /short_description = 'Live performance of music'/],
  ['values', /short_description = 'List of values'/],
  ['sister', /short_description = 'Female member of a monastic order'/],
  ['stability', /short_description = 'Unchanging value'/],
  ['lady', /short_description = 'Female-identifying individual'/],
  ['cougar', /short_description = 'Large wild cat native to the Americas'/],
];

const GROUP_B = [
  'dyke',
  'edging',
  'delta',
  'yes-sir',
  'speculum',
  'tease',
  'damsel',
  'boy-toy',
  'chaser',
  'c-ring',
  'mare-cunt',
  'vivisector',
  'backshot',
  'down-low',
];

describe('round-two prose repair', () => {
  it('declares a non-system actor', () => {
    // Seven rows are human_reviewed; log_unified_tag_change() RAISEs on a
    // 'system:%' actor modifying one, and the default is system:trigger.
    expect(sql).toMatch(/set_config\(\s*'app\.actor'\s*,\s*'migration:[^']+'/);
  });

  it.each(GROUP_A)('only rewrites %s while it still carries the wrong subject', (slug, guard) => {
    expect(stmtFor(slug)).toMatch(guard);
  });

  it.each(GROUP_B)('only rewrites %s while it is still a disambiguation artifact', (slug) => {
    // An unguarded UPDATE would overwrite a summary a human has since written.
    expect(stmtFor(slug)).toMatch(
      /short_description = 'Term (with multiple|with various) meanings'|short_description = 'Edging has multiple meanings'|short_description = 'Term without recognized definition'/,
    );
  });

  it.each([
    ['leader', /long_description like 'An editorial, also known as a leader%'/],
    ['woman', /long_description like 'A woman is an adult human female%'/],
    ['leatherman', /long_description like 'Leatherman is an American brand of multi-tool%'/],
    ['live-music-venue', /long_description like 'A concert is a live performance of music%'/],
    ['values', /long_description like 'This tag represents a collection of values%'/],
    [
      'sister',
      /long_description like 'A sister is a woman who dedicates her life to religious service%'/,
    ],
    ['stability', /long_description like 'This property is expected to remain the same%'/],
    ['lady', /long_description like 'A lady is an individual who identifies as female%'/],
  ])('guards the %s BODY on its own wrong-subject text, not just the summary', (slug, guard) => {
    // Asserting only the short_description guard leaves the body guard
    // droppable — an unguarded body UPDATE would overwrite prose a human has
    // since corrected. Caught by mutation testing.
    expect(stmtFor(slug)).toMatch(guard);
  });

  it('never writes description on any row', () => {
    // `description` is the evidence for BOTH groups — in group B it is the
    // literal source of the new summary. Writing it would change what
    // justified the change.
    for (const slug of [...GROUP_A.map(([s]) => s), ...GROUP_B]) {
      expect(stmtFor(slug)).not.toMatch(/(^|[\s,])description\s*=/m);
    }
  });

  it('gives woman BOTH fields, unlike man in the previous pass', () => {
    // man kept its body because that body was already trans-inclusive; woman's
    // was gamete essentialism contradicting its own description.
    const stmt = stmtFor('woman');
    expect(stmt).toMatch(/long_description\s*=/);
    expect(stmt).toMatch(/long_description like 'A woman is an adult human female%'/);
    // Assert the body's SUBSTANCE, not one quotable phrase: the replacement
    // must actually state the gender-identity framing and refuse the
    // anatomy/chromosome definition its predecessor asserted.
    expect(stmt).toMatch(/feminine gender identity/);
    expect(stmt).toMatch(/trans women are women/);
    expect(stmt).toMatch(/not defined by anatomy, chromosomes or reproductive capacity/);
  });

  it('nulls lioness rather than minting a role, and says so', () => {
    // lion was left alone by 50500101100000 because its sense cannot be
    // established; lioness gets only what its own description supports.
    const stmt = stmtFor('lioness');
    expect(stmt).toMatch(/long_description\s*=\s*null/);
    expect(stmt).toMatch(/short_description = 'Female lion role\.'/);
  });

  describe('postconditions', () => {
    it("assert the DEFECT is gone, not this file's wording", () => {
      expect(sql).toMatch(
        /raise exception '[^']*group-A wrong-subject short_description\(s\) still live/,
      );
      expect(sql).toMatch(
        /raise exception '[^']*group-A wrong-subject long_description\(s\) still live/,
      );
    });

    it('scope the body check BY SLUG so a correct sibling is not flagged', () => {
      // A corpus-wide `long_description like 'A concert is a live performance%'`
      // catches `live-music`, where that body is right. The dry run failed on
      // exactly this before it was scoped.
      const i = sql.indexOf('group-A wrong-subject long_description');
      expect(i).toBeGreaterThan(-1);
      const block = sql.slice(Math.max(0, i - 1400), i);
      expect(block).toMatch(
        /slug='live-music-venue' and long_description like 'A concert is a live performance of music%'/,
      );
      // The unscoped form must not come back.
      expect(block).not.toMatch(/\n\s*or long_description like 'A concert is a live performance/);
    });

    it('assert group B is CLOSED, not sampled', () => {
      // The cohort measured 14 corpus-wide, so the whole class is driven to 0.
      expect(sql).toMatch(
        /short_description ~\* '\(has\|with\) multiple meanings\|\^term with\|may refer to'/,
      );
      expect(sql).toMatch(
        /raise exception '[^']*disambiguation-artifact short_description\(s\) remain/,
      );
    });

    it('report rather than abort on rows this file does not control', () => {
      // description drift, `lion`, and `live-music` are all someone else's to
      // change; aborting `db push` for them blocks every queued migration.
      expect(sql).toMatch(/raise notice '[^']*description\(s\) differ/);
      expect(sql).toMatch(/raise notice '[^']*lion no longer carries/);
      expect(sql).toMatch(/raise notice '[^']*live-music no longer reads/);
    });
  });

  it('leaves lion and live-music unrepaired', () => {
    // Both are deliberate: lion's sense cannot be established from the row,
    // live-music's prose is correct for an events tag.
    expect(sql).not.toMatch(/update unified_tags[\s\S]{0,400}?where slug = 'lion'\b/);
    expect(sql).not.toMatch(/update unified_tags[\s\S]{0,400}?where slug = 'live-music'\s/);
  });
});
