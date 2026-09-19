import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99940101110200 — the measured rewrite, batch 9 (4 rows, TWO groups).
 *
 * 1. THE GROUPS ARE LABELLED AND THE TEST KEEPS THEM APART. Group A is the
 *    lead-shape axis (2 of 25 read = 8%); Group B was found OFF-AXIS while
 *    establishing what `color-rainbow` means, and neither of its rows has a
 *    copula lead, so the axis matcher is structurally blind to both. The risk
 *    of a mixed file is that a later reader takes the looser group's licence
 *    and applies it to the rest.
 *
 * 2. GROUP A IS DELETION ONLY. Both rows are repaired by replace(), which
 *    CANNOT author prose, so the surviving text is byte-identical by
 *    construction. The test asserts the surviving halves, because "the wrong
 *    clause is gone" passes equally against a full rewrite — which is the
 *    retired bulk experiment wearing a fix's clothes.
 *
 * 3. `civil-rights` IS THE NARROWING CLASS. Defining civil rights as owed
 *    "regardless of their race" and nothing else writes an LGBTQ+ audience out
 *    of their own entry. Both other prose fields on the row are broader.
 *
 * 4. `progress-pride-flag` KEEPS ITS QID. Q96633914 is genuinely the Progress
 *    flag — the `methadone` rule: a correct identifier does not make the prose
 *    derived from it correct, and the fix is the prose, not the id.
 *
 * 5. `color-rainbow` STAYS DEFERRED THOUGH ITS PROSE IS WRONG UNDER EVERY
 *    READING. Its 135 news assignments prove the pride-symbol sense and refute
 *    both the meteorology it publishes and the marketplace-facet reading its
 *    slug suggests — but the live `pride-flag` row already holds that concept,
 *    so repairing it here would mint a second row for one concept. That is a
 *    MERGE decision, and a prose pass must not pre-empt it.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99940101110200_tag_description_measured_rewrite_batch9.sql',
);
const sql = readFileSync(MIG, 'utf8');
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/** Comment prose with line breaks and leading `--` collapsed: a phrase that
 *  wraps across two comment lines is invisible to a single-line pattern. This
 *  file has recorded that trap nine times; it is not re-learned here. */
const prose = sql.replace(/\n\s*--\s?/g, ' ').replace(/\s+/g, ' ');

const writtenTexts = [...statements.matchAll(/set description =\s*\n?\s*'((?:[^']|'')*)'/g)].map(
  (m) => m[1].replace(/''/g, "'"),
);

describe('tag description measured rewrite, batch 9', () => {
  it('repairs exactly the four measured rows, each content-guarded', () => {
    const guarded: Array<[string, string]> = [
      ['lgbtq-support', "description like 'LGBTQ+ is an acronym%'"],
      ['civil-rights', "description like '%regardless of their race%'"],
      ['pride-flag', "description like 'See %Rainbow flag%'"],
      ['progress-pride-flag', "description like 'The rainbow flag or pride flag is a symbol%'"],
    ];
    for (const [slug, needle] of guarded) {
      const stmt = statements
        .split(/update unified_tags/)
        .find((s) => s.includes(`slug = '${slug}'`));
      expect(stmt, `no statement for ${slug}`).toBeTruthy();
      expect(stmt).toContain(needle);
      expect(stmt).toContain("status = 'active'");
    }
    expect(statements.match(/update unified_tags/g)).toHaveLength(4);
  });

  it('GROUP A is deletion only — replace(), never an authored replacement', () => {
    // A replace() cannot author prose, which is what makes the surviving text
    // byte-identical by construction rather than by careful retyping.
    const groupA = ['lgbtq-support', 'civil-rights'];
    for (const slug of groupA) {
      const stmt = statements
        .split(/update unified_tags/)
        .find((s) => s.includes(`slug = '${slug}'`))!;
      expect(stmt, `${slug} must use replace()`).toMatch(/set description = replace\(description,/);
    }
    // ...and neither Group A row appears among the authored replacement texts.
    expect(writtenTexts).toHaveLength(2);
  });

  it('asserts what each deletion LEFT ALONE, not merely what it removed', () => {
    // Each phrase appears TWICE — once pinning the exact reached state, once
    // checking the half a replace() must have left alone. Assert the COUNT, or
    // deleting one assertion silently matches the other's copy.
    const survivorA = verify.match(
      /promoting equality and acceptance for individuals who identify as LGBTQ\+\./g,
    );
    const survivorB = verify.match(
      /including the right to equality, justice, and non-discrimination\./g,
    );
    expect(survivorA ?? []).toHaveLength(2);
    expect(survivorB ?? []).toHaveLength(2);
    expect(verify).toMatch(/a deletion rewrote its surviving text/);
  });

  it('removes the acronym definition from lgbtq-support', () => {
    // The separate live `lgbtq` row (5,340 uses) already defines the acronym;
    // this row is about support and its own summary and body both say so.
    const stmt = statements
      .split(/update unified_tags/)
      .find((s) => s.includes("slug = 'lgbtq-support'"))!;
    expect(stmt).toContain('LGBTQ+ is an acronym that stands for');
    expect(stmt).toMatch(/,\s*''\s*\)/); // replaced with the empty string
    expect(verify).toMatch(/description like '%is an acronym%'/);
  });

  it('removes the race-only narrowing from civil-rights without enumerating', () => {
    // Enumerating protected characteristics would be authoring; under-reaching
    // is the correct error.
    const stmt = statements
      .split(/update unified_tags/)
      .find((s) => s.includes("slug = 'civil-rights'"))!;
    expect(stmt).toContain("replace(description, ', regardless of their race', '')");
    expect(stmt).not.toMatch(/sexual orientation|gender identity|disability/i);
    expect(verify).toMatch(/description like '%regardless of their race%'/);
  });

  it('GROUP B: pride-flag stops publishing a dictionary cross-reference', () => {
    const pf = writtenTexts.find((t) => t.startsWith('A flag symbolizing LGBTQ+ pride'));
    expect(pf).toBeTruthy();
    expect(pf).not.toMatch(/^See\b/);
    expect(pf).not.toMatch(/Rainbow flag \(LGBT\)/);
  });

  it('GROUP B: progress-pride-flag describes the Progress flag, not the rainbow flag', () => {
    const ppf = writtenTexts.find((t) => t.startsWith('A variation of the rainbow flag'));
    expect(ppf).toBeTruthy();
    // the chevron is the whole distinction between the two flags
    expect(ppf).toMatch(/chevron/i);
    // and the rainbow flag's own origin story must not survive on this row
    expect(ppf).not.toMatch(/San Francisco/i);
    expect(verify).toMatch(/progress-pride-flag no longer names the chevron/);
    expect(verify).toMatch(/description like '%San Francisco%'/);
  });

  it('never touches a wikidata identifier — the methadone rule', () => {
    // Q96633914 genuinely IS the Progress flag. A correct identifier does not
    // make the prose derived from it correct, and the fix is the prose.
    expect(statements).not.toMatch(/wikidata_id/);
    expect(prose).toMatch(/methadone. rule/i);
  });

  it('asserts the deferred rows are still deferred', () => {
    for (const slug of ['color-rainbow', 'sti', 'kink', 'meeting']) {
      expect(statements).not.toContain(`slug = '${slug}'`);
      expect(verify).toContain(`slug='${slug}'`);
    }
    expect(verify).toMatch(/a deferred row was rewritten/);
  });

  it('records why color-rainbow is deferred despite being wrong under every reading', () => {
    expect(prose).toMatch(/135 news and ZERO marketplace/i);
    expect(prose).toMatch(/MERGE decision, not a prose repair/i);
  });

  it('records that sti is the row round thirteen refused to sweep', () => {
    expect(prose).toMatch(/advice register round thirteen REFUSED to sweep/i);
    expect(prose).toMatch(/real sexual-health guidance/i);
  });

  it('keeps the two groups labelled and the axis yield honest', () => {
    expect(prose).toMatch(/GROUP A -- the lead-shape axis/);
    expect(prose).toMatch(/GROUP B -- found OFF-AXIS/);
    expect(prose).toMatch(/2 taken: 8%/);
    expect(prose).toMatch(/is not inflated by a find that axis could not make/i);
  });

  it('records the matcher control that failed and how it was tightened', () => {
    expect(prose).toMatch(/Worn at fetish events, leather is a community staple/);
    expect(prose).toMatch(/all\s+EIGHT controls now report correctly in both directions/i);
  });

  it('states that the actor declaration IS load-bearing on this tranche', () => {
    expect(statements).toContain(
      "set_config('app.actor', 'admin:tag-description-measured-rewrite-b9', true)",
    );
    expect(prose).toMatch(/ACTOR DECLARATION IS LOAD-BEARING/i);
    expect(prose).toMatch(/Verified live with a REAL value change, not a self-assignment/i);
  });

  it('ships no voice violation, with the plural-aware regex', () => {
    expect(verify).toMatch(
      /organisation\|characterised\|recognised\|behaviour\|licence\|counselling\|colour\|marginalised/,
    );
    expect(verify).toMatch(/\)s\?\\M/);
    for (const t of writtenTexts) {
      expect(t).not.toMatch(
        /\b(organisation|characterised|recognised|behaviour|licence|counselling|colours|marginalised)\b/i,
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
    expect(verify.match(/if v_bad <> 4 then/g) ?? []).toHaveLength(2);
    expect(verify.match(/if v_bad <> 2 then/g) ?? []).toHaveLength(1);
    expect(verify.match(/if v_bad <> 1 then/g) ?? []).toHaveLength(1);
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(3);
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/\bfalse\b/);
    expect((verify.match(/from unified_tags/g) ?? []).length).toBe(7);
  });
});
