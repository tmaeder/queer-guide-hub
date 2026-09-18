import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99800101100050 — four Tone of Voice violations in the batch that
 * shipped as 99700101100300.
 *
 * WHY THIS EXISTS AT ALL, which is the part worth carrying forward: the
 * precision measurement behind 99700101100300 pre-registered its verdict
 * categories as SUBJECT, SENSE, SPECIFICITY and FABRICATION. It did not include
 * conformance to the published Tone of Voice, so a text could score CORRECT and
 * still be unpublishable under `styleguide_rules`. Four of eighteen were. The
 * lesson is that a precision number is only as complete as the criteria it was
 * scored against.
 *
 * WHAT THIS FILE PRESERVES:
 *
 * 1. THE APPLIED MIGRATION IS NOT EDITED. 99700101100300 is in
 *    schema_migrations; its recorded body is what ran. Rewriting it is the
 *    divergence class check-migration-drift.mjs exists to catch, so the repair
 *    is a follow-up migration and this test asserts the old file still contains
 *    the violating text.
 *
 * 2. THE CORRECTION IS A SUBSTITUTION, NOT A REWRITE. Each row keeps the rest of
 *    the sentence it shipped with. "The violation is gone" is equally satisfied
 *    by a pass that replaced the whole text, so the migration carries a mirror
 *    assertion and so does this file.
 *
 * 3. THE CORPUS IS NOT SWEPT. Active descriptions run 34 hyphenated `non-binary`
 *    to 9 unhyphenated — the corpus MAJORITY is the spelling the standard
 *    rejects. Only the row this batch wrote is corrected; changing the other 33
 *    is a corpus-wide decision, and the house answer to drift is a counter.
 *
 * 4. THE DISAGREEMENT IS RECORDED. Anyone re-deriving house style by measuring
 *    the corpus would "correct" nonbinary straight back, so the direction of
 *    resolution and its reason are asserted to stay in the file.
 */

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const FIX = join(MIG_DIR, '99800101100050_tag_description_voice_corrections.sql');
const APPLIED = join(MIG_DIR, '99700101100300_tag_description_measured_rewrite_batch1.sql');

const fixSql = readFileSync(FIX, 'utf8');
const appliedSql = readFileSync(APPLIED, 'utf8');

const strip = (s: string) =>
  s
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

const bare = strip(fixSql);
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

describe('tag description voice corrections', () => {
  it('corrects exactly the four rows the standard rejects', () => {
    const updates = [...statements.matchAll(/^update unified_tags/gm)];
    expect(updates.length).toBe(4);
    for (const slug of ['fundraiser', 'tokenism', 'nala', 'facial-feminization-surgery']) {
      expect(statements).toContain(`'${slug}'`);
    }
  });

  it('uses replace(), so it is a substitution and cannot author prose', () => {
    const sets = [...statements.matchAll(/set description =\s*([^\n]+)/g)].map((m) => m[1].trim());
    expect(sets.length).toBe(4);
    for (const rhs of sets) {
      expect(rhs.startsWith('replace(description,'), `not a substitution: ${rhs}`).toBe(true);
    }
    // a literal assignment would be a rewrite wearing a correction's clothes
    expect(statements).not.toMatch(/set description =\s*'/);
  });

  it('guards each write on the exact violating substring, so it no-ops once applied', () => {
    for (const needle of [
      "description like '%cause or organisation.%'",
      "description like '%an organisation can appear%'",
      "description like 'A role characterised by%'",
      "description like '%trans women and non-binary people%'",
    ]) {
      expect(statements).toContain(needle);
    }
  });

  it('declares an actor — tokenism, nala and FFS are human_reviewed', () => {
    expect(statements).toMatch(
      /set_config\('app\.actor',\s*'admin:tag-description-voice-corrections',\s*true\)/,
    );
  });

  it('DOES NOT EDIT THE APPLIED MIGRATION — its recorded body must still violate', () => {
    // 99700101100300 is in schema_migrations. Editing it is the divergence class
    // the drift monitor exists to catch.
    expect(appliedSql).toMatch(/cause or organisation\./);
    expect(appliedSql).toMatch(/A role characterised by/);
    expect(appliedSql).toMatch(/trans women and non-binary people/);
  });

  it('carries the MIRROR assertion that rows were corrected, not rewritten', () => {
    expect(verify).toMatch(/An event or campaign that raises money for a %/);
    expect(verify).toMatch(/pet play, primal and littles communities\./);
    expect(verify).toMatch(/typically read as masculine/);
  });

  it('asserts the corpus-wide non-binary cohort is NOT swept', () => {
    expect(verify).toMatch(/\\mnon-binary\\M/);
    expect(verify).toMatch(/if v_bad < 20 then/);
    expect(verify).toMatch(/cohort was swept/);
  });

  it('records the standard-vs-corpus disagreement and its direction', () => {
    expect(fixSql).toMatch(/34 HYPHENATED to 9 unhyphenated/);
    expect(fixSql).toMatch(/RESOLVED TOWARD\s*\n--\s*THE STANDARD, NOT THE CORPUS/);
    expect(fixSql).toMatch(/THE 34 ARE NOT SWEPT HERE/);
  });

  it('records what was clean, so the residue is bounded rather than implied', () => {
    expect(fixSql).toMatch(/ZERO active avoid-term hits/);
    expect(fixSql).toMatch(/ZERO second-person uses/);
  });

  it('counts the reached state positively and short-circuits nothing', () => {
    expect(verify).toMatch(/if v_bad <> 4 then/);
    expect(verify).not.toMatch(/where false/);
    expect(verify).not.toMatch(/v_bad\s*:=\s*\d/);
    const conds = [...verify.matchAll(/if v_bad (<>|<) \d+ then/g)];
    expect(conds.length).toBe(4);
  });
});

describe('the corrected end state conforms to the published Tone of Voice', () => {
  /** The four corrected values, reconstructed from the replace() targets. This
   *  is the reusable check every future rewrite batch should carry: the
   *  measurement behind 99700101100300 scored subject and sense and NOT this. */
  const correctedFragments = [
    ...statements.matchAll(/replace\(description,\s*'[^']*',\s*'([^']*)'\)/g),
  ].map((m) => m[1]);

  it('extracts the corrected fragments it asserts on', () => {
    // positive control: an empty match set satisfies every check below
    expect(correctedFragments.length).toBe(4);
  });

  it('uses American spelling — `spelling-and-units`, corpus agrees 25:4 and 29:5', () => {
    for (const t of correctedFragments) {
      expect(
        /\b(organisation|characterised|recognised|behaviour|colour|centre|defence|licence)s?\b/i.test(
          t,
        ),
        `British spelling survives: ${t}`,
      ).toBe(false);
    }
  });

  it('writes `nonbinary` unhyphenated — `trans-language` + styleguide_terms.preferred', () => {
    for (const t of correctedFragments) {
      expect(/\bnon-binary\b/i.test(t), `hyphenated nonbinary survives: ${t}`).toBe(false);
    }
  });

  it('introduces no second person, marketing vocabulary or hype punctuation', () => {
    const banned =
      /\b(you|your|discover|explore|unlock|curated|journey|tailored|amazing|vibrant|iconic)\b|!/i;
    for (const t of correctedFragments) {
      expect(banned.test(t), `voice violation introduced: ${t}`).toBe(false);
    }
  });
});
