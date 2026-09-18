import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99930101100600 — the measured rewrite, batch 7 (6 rows).
 *
 * 1. `acespec` IS A FACTUAL ERROR ABOUT AN IDENTITY and the sharpest row in the
 *    series since `queerness`. It defined AROACE (both asexual and aromantic)
 *    and stated a false etymology ("a portmanteau of 'asexual' and
 *    'aromantic'"). Acespec is short for ACE-SPECTRUM. The row's own summary
 *    ("Lack of sexual attraction or interest") is what contradicts it, so this
 *    is the ORIGINAL rule, not the widened one.
 *
 * 2. THE REPLACEMENT MUST FIX BOTH HALVES. A text that states the spectrum
 *    reading but leaves the aroace confusion unaddressed still leaves an
 *    indexable identity page misleading, so both are asserted.
 *
 * 3. `bisexual-visibility` IS A PURE DELETION, the `belly-play` treatment: a
 *    dangling colon promising a list that is not there. The surviving sentence
 *    is asserted byte-for-byte, because "the colon is gone" is equally
 *    satisfied by a full rewrite.
 *
 * 4. THE ACTOR DECLARATION IS NOT LOAD-BEARING HERE (all six rows are
 *    human_reviewed = false) and the file says so — batch 6's WAS, and the next
 *    pass must not copy the wrong precedent from whichever file it opens.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99930101100600_tag_description_measured_rewrite_batch7.sql',
);
const sql = readFileSync(MIG, 'utf8');
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/** Comment prose with line breaks and leading `--` collapsed: a phrase that
 *  wraps across two comment lines is invisible to a single-line pattern. */
const prose = sql.replace(/\n\s*--\s?/g, ' ').replace(/\s+/g, ' ');

const writtenTexts = [...statements.matchAll(/set description =\s*\n?\s*'((?:[^']|'')*)'/g)].map(
  (m) => m[1].replace(/''/g, "'"),
);

describe('tag description measured rewrite, batch 7', () => {
  it('repairs exactly the six measured rows, each content-guarded', () => {
    const guarded: Array<[string, string]> = [
      ['acespec', '%portmanteau of%aromantic%'],
      ['abstinence', '%it refers to , which means%'],
      ['bisexual-visibility', '%often face unique challenges:%'],
      ['color-red', '%dominant wavelength of approximately%'],
      ['genre-poetry', '%assonance, alliteration, consonance%'],
      ['retail', '%final link in the supply chain%'],
    ];
    for (const [slug, needle] of guarded) {
      const stmt = statements
        .split(/update unified_tags/)
        .find((s) => s.includes(`slug = '${slug}'`));
      expect(stmt, `no statement for ${slug}`).toBeTruthy();
      expect(stmt).toContain(`description like '${needle}'`);
      expect(stmt).toContain("status = 'active'");
    }
    expect(statements.match(/update unified_tags/g)).toHaveLength(6);
  });

  it('corrects BOTH halves of the acespec error', () => {
    const ace = writtenTexts.find((t) => t.startsWith('Someone on the asexual spectrum'));
    expect(ace).toBeTruthy();
    // the right concept: a spectrum, not a conjunction of two identities
    expect(ace).toMatch(/ace-spectrum/);
    // and the distinction from the identity it was confused with
    expect(ace).toMatch(/aroace/);
    // the false etymology is gone
    expect(ace).not.toMatch(/portmanteau/i);
    expect(verify).toMatch(/acespec lost its spectrum reading or its aroace distinction/);
  });

  it('supplies the abstinence definition that had dropped out', () => {
    const abs = writtenTexts.find((t) => t.startsWith('Choosing not to have sex'));
    expect(abs).toBeTruthy();
    // no moralising register — this is a sexual-health row
    expect(abs).not.toMatch(/\b(should|must|important|essential|risk of)\b/i);
  });

  it('keeps the bisexual-visibility edit a deletion, not a rewrite', () => {
    // A replace() CANNOT author prose, so the surviving sentence is preserved by
    // construction rather than by retyping it.
    const stmt = statements
      .split(/update unified_tags/)
      .find((s) => s.includes("slug = 'bisexual-visibility'"));
    expect(stmt).toMatch(/set description = replace\(description,/);
    expect(stmt).toContain("', '')");
    expect(verify).toContain(
      "description like 'Bisexual visibility is all about increasing awareness and understanding%'",
    );
    expect(verify).toMatch(/deletion became a rewrite/);
    // and nothing in this file writes a literal body for that row
    expect(writtenTexts.some((t) => t.startsWith('Bisexual visibility'))).toBe(false);
  });

  it('strips the encyclopedia from the namespace rows', () => {
    const red = writtenTexts.find((t) => t.startsWith('Red, as a garment'));
    expect(red).toBeTruthy();
    expect(red).not.toMatch(/nanometer|wavelength|CMYK|RGB|complementary/i);

    const poetry = writtenTexts.find((t) => t.startsWith('Poetry:'));
    expect(poetry).toBeTruthy();
    expect(poetry).not.toMatch(/assonance|consonance|onomatopoeia|phoneme|metre/i);
  });

  it('settles retail on the sense its 25 venue assignments establish', () => {
    const retail = writtenTexts.find((t) => t.startsWith('Shops and stores'));
    expect(retail).toBeTruthy();
    expect(retail).not.toMatch(/wholesal|supply chain|manufacturer|institutional/i);
  });

  it('asserts the deferred rows are still deferred', () => {
    for (const slug of [
      'queer-inclusive',
      'brunch',
      'breakfast',
      'hiv-testing',
      'queer-theory',
      'drag',
    ]) {
      expect(statements).not.toContain(`slug = '${slug}'`);
      expect(verify).toContain(`slug='${slug}'`);
    }
    expect(verify).toMatch(/a deferred row was rewritten/);
  });

  it('records that the probe control was re-run AND visible this time', () => {
    // Batch 6's first probe used \b, which Postgres ARE does not have. Here the
    // control was also nearly lost: UNION'd into the result then sorted out of
    // it by the ORDER BY. A control you cannot see in the output is not a control.
    expect(prose).toMatch(/POSTGRES ARE DOES NOT HAVE/);
    expect(prose).toMatch(/a control you cannot see in the output is not a control/i);
  });

  it('states that the actor declaration is NOT load-bearing on this tranche', () => {
    // All six rows are human_reviewed = false. Batch 6's tranche was the
    // opposite case; recording which is which is what stops the next pass
    // copying the wrong precedent.
    expect(statements).toContain(
      "set_config('app.actor', 'admin:tag-description-measured-rewrite-b7', true)",
    );
    expect(sql).toMatch(/NOT LOAD-BEARING ON THIS TRANCHE/);
    expect(sql).toMatch(/human_reviewed = false/);
    expect(sql).toMatch(/attribution only/);
  });

  it('ships no voice violation, with the plural-aware regex', () => {
    expect(verify).toMatch(
      /organisation\|characterised\|recognised\|behaviour\|licence\|counselling/,
    );
    expect(verify).toMatch(/\)s\?\\M/);
    for (const t of writtenTexts) {
      expect(t).not.toMatch(
        /\b(organisation|characterised|recognised|behaviour|licence|counselling)s?\b/i,
      );
      expect(t).not.toMatch(/\bnon-binary\b/i);
      expect(t).not.toMatch(/\b(you|your)\b/i);
      expect(t).not.toMatch(/!/);
      expect(t).not.toMatch(/\b(discover|explore|unlock|curated|journey|vibrant)\b/i);
    }
  });

  it('calls the real thin-page predicate rather than restating its OR', () => {
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/short_description is not null\s+and\s+description is not null/);
  });

  it('counts the reached state positively, and every condition is a real check', () => {
    expect(verify.match(/if v_bad <> 6 then/g) ?? []).toHaveLength(2);
    expect(verify.match(/if v_bad <> 1 then/g) ?? []).toHaveLength(2);
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(3);
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/\bfalse\b/);
    expect((verify.match(/from unified_tags/g) ?? []).length).toBe(7);
  });
});
