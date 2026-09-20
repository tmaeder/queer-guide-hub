import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991789887254 — round nineteen, ONE SUMMARY ACROSS A FAMILY OF
 * DIFFERENT DRUGS.
 *
 * Round twelve found this class ("one string stamped across rows that are
 * different things, where the shared summary erases the distinction the family
 * exists to draw") and repaired the sadist family and five gender identities.
 * This is the same class continued into the clinical families, where the
 * erased distinction is a dosing interval.
 *
 * What this test preserves, in order of how easily a later edit breaks it:
 *
 *  - `description` AND `long_description` ARE NEVER WRITTEN. Every replacement
 *    restates the row's own description; a pass that may rewrite that column
 *    can make any summary "correct" after the fact. The migration proves this
 *    at apply time with a before-snapshot, and this test proves it statically.
 *  - THE SUMMARIES ARE MUTUALLY DISTINCT. "The flattened text is gone" is
 *    satisfied by stamping a DIFFERENT single string across all fifteen, which
 *    is the same defect wearing a fix's clothes. Distinctness is the purpose.
 *  - EVERY UPDATE IS CONTENT-GUARDED on the flattened text it removes, so a
 *    human (or a concurrent session) who repairs a row first keeps their work.
 *  - THIS IS NOT THE MERGE PASS IT LOOKED LIKE. The search that found these
 *    also returns genuine duplicate-TAG pairs and `trans-man`/`transmasculine`
 *    (the GENDERING class). None is touched, and no `merged_into_id` is
 *    written anywhere in the file.
 *  - NOTHING REACHES `tag_wikidata_repair_audit` — it is the INPUT to
 *    `tag_disowned_prose_signals()`, so a row there would perturb a live metric
 *    to record what the file already records (round twelve's rule).
 *  - THE CONTROLS. `viagra` and `prep` already carried distinguishing
 *    summaries and are the in-corpus model for the fix; a sweep that took them
 *    too would over-reach, so the migration asserts they survive.
 *  - THE POSTCONDITIONS CANNOT BE NEUTERED: no `false` in the verify block, no
 *    pre-seeded counter, every comparison exact, and the scope floor stops a
 *    vanished corpus reading as success.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99991789887254_tag_prose_clinical_family_summaries.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

// Comment-stripped: the header quotes every flattened string verbatim, so an
// unstripped search matches the PROSE while the statement is gone.
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

const TARGETS = [
  'sildenafil',
  'tadalafil',
  'vardenafil',
  'avanafil',
  'cialis',
  'levitra',
  'descovy',
  'truvada',
  'fluoxetine',
  'paroxetine',
  'sertraline',
  'bictegravir',
  'raltegravir',
  'dolutegravir',
  'zidovudine',
];

const FLATTENED = [
  'Medication for erectile dysfunction',
  'Antidepressant medication',
  'Medication for HIV prevention',
  'HIV treatment medication',
  'Medication for HIV/AIDS treatment',
];

/**
 * The body of each `update unified_tags` statement.
 *
 * Cutting at the first `;` is WRONG here and this test failed honestly against
 * correct code before it was fixed: three of the replacement summaries contain
 * a semicolon of their own ("Sold as Cialis; the longest-acting of its
 * class."), so `indexOf(';')` truncates mid-string literal and every
 * slug/guard assertion then reads as a missing statement. Cut on the statement
 * TERMINATOR instead — a `;` that ends its line — which no in-prose semicolon
 * here does. Same trap the venue-dedup pass recorded with `[^;]*`.
 */
function updateBlocks(): string[] {
  return statements
    .split(/update unified_tags/)
    .slice(1)
    .map((s) => {
      const end = s.search(/;\s*(?:\n|$)/);
      return end === -1 ? s : s.slice(0, end);
    });
}

describe('round 19: clinical family summaries', () => {
  it('repairs all fifteen target rows, one UPDATE each', () => {
    const blocks = updateBlocks();
    expect(blocks).toHaveLength(15);
    for (const slug of TARGETS) {
      const hit = blocks.filter((b) => b.includes(`slug = '${slug}'`));
      expect(hit, `${slug} must be updated exactly once`).toHaveLength(1);
    }
  });

  it('content-guards every UPDATE on the flattened text it removes', () => {
    for (const b of updateBlocks()) {
      const guarded = FLATTENED.some((f) => b.includes(`short_description = '${f}'`));
      expect(
        guarded,
        `every UPDATE must be guarded on a flattened summary: ${b.slice(0, 80)}`,
      ).toBe(true);
    }
  });

  it('writes short_description ONLY — never description or long_description', () => {
    for (const b of updateBlocks()) {
      const setClause = b.slice(0, b.indexOf('where'));
      expect(setClause).toContain('short_description =');
      // `description =` would also match inside `short_description =`, so the
      // test has to look for the column as a standalone assignment target.
      expect(/(?:^|[\s,])description\s*=/.test(setClause)).toBe(false);
      expect(/long_description\s*=/.test(setClause)).toBe(false);
    }
  });

  it('gives every row a DISTINCT replacement summary', () => {
    const written = updateBlocks().map((b) => {
      const m = b.match(/short_description\s*=\s*\n?\s*'((?:[^']|'')*)'/);
      return m ? m[1] : null;
    });
    expect(written.every((w) => w !== null)).toBe(true);
    expect(
      new Set(written).size,
      'two rows share a replacement summary — the family is still collapsed',
    ).toBe(15);
    // And none of them may be a flattened string again.
    for (const w of written) expect(FLATTENED).not.toContain(w);
  });

  it('never writes an identifier, a merge, or the repair audit', () => {
    expect(statements).not.toContain('wikidata_id =');
    expect(statements).not.toContain('merged_into_id');
    expect(statements).not.toContain('tag_wikidata_repair_audit');
    expect(statements).not.toContain('category_id =');
  });

  it('declares the actor — all fifteen rows are human_reviewed', () => {
    expect(statements).toMatch(
      /set_config\('app\.actor',\s*'migration:99991789887254_tag_prose_clinical_family_summaries'/,
    );
  });

  it('proves the scope claim with a before-snapshot rather than asserting it', () => {
    expect(statements).toContain('create temporary table _r19_before');
    expect(verify).toContain('_r19_before');
    expect(verify).toMatch(/t\.description is distinct from b\.description/);
    expect(verify).toMatch(/t\.long_description is distinct from b\.long_description/);
  });

  it('asserts the family is distinct, not merely un-flattened', () => {
    expect(verify).toContain('count(distinct short_description)');
    expect(verify).toMatch(/v_distinct <> v_scope/);
  });

  it('keeps the two in-corpus controls outside the pass', () => {
    // Naming the slug is not enough: a mutation that kept `(slug = 'viagra')`
    // and deleted the summary half SURVIVED an earlier draft of this test. The
    // control has to be asserted to still check the row's CONTENT.
    expect(verify).toMatch(/slug = 'viagra'\s+and short_description like 'Sildenafil, prescribed/);
    expect(verify).toMatch(/slug = 'prep'\s+and short_description like 'Pre-exposure prophylaxis/);
    expect(verify).toMatch(/v_controls <> 2/);
  });

  it('calls tag_has_prose rather than restating its OR', () => {
    expect(verify).toContain('tag_has_prose(description, short_description)');
  });

  it('has postconditions that cannot be neutered', () => {
    // Six checks, each raising.
    expect((verify.match(/raise exception/g) ?? []).length).toBe(6);
    // A `false` anywhere short-circuits a predicate while leaving every
    // string-anchored assertion green (round fourteen's surviving mutation).
    expect(verify).not.toMatch(/\bfalse\b/);
    // Every counter must be filled by a real read of unified_tags, never
    // pre-seeded to a passing value. The name is NOT adjacent to the
    // assignment (`v_touched   int := 0`), so an earlier draft's
    // `v_name\\s*:=` pattern never matched and that mutation SURVIVED. Ban
    // any initialiser in the DECLARE block instead.
    const declareBlock = verify.slice(verify.indexOf('declare'), verify.indexOf('begin'));
    expect(declareBlock).not.toContain(':=');
    // Comparisons stay exact — a loosened one stops checking while the RAISE
    // text and the slug list both still match.
    expect(verify).toMatch(/v_flattened <> 0/);
    expect(verify).toMatch(/v_thin <> 0/);
    expect(verify).toMatch(/v_touched <> 0/);
    // The floor stops a corpus that moved out from under the file reading as
    // success: zero surviving rows would otherwise satisfy every other check.
    expect(verify).toMatch(/v_scope < 12/);
  });
});
