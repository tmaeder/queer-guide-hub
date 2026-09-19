import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99950101100200 — the measured rewrite, batch 10 (7 rows).
 *
 * 1. A NEW AXIS: the description is a NEWS-TAXONOMY LABEL rather than a
 *    definition, while the row's own summary AND body both define the term.
 *    /tags/:slug renders description as the lead paragraph and long_description
 *    as the body beneath it, so a reader met "International human rights
 *    coverage" above a real definition of human rights.
 *
 * 2. THE BODIES ARE THE EVIDENCE, so the file must not touch one. A pass that
 *    nulled a body would be destroying its own warrant for the repair.
 *
 * 3. THE "% NEWS" TEST WAS RUN AND REFUTED. The expectation was that a row used
 *    only by news could honestly keep a feed label; coming-out, same-sex-marriage,
 *    pride-month and gender-affirming-care are 100% news AND each carries a full
 *    definitional body. A test that sounds decisive is not decisive until run.
 *
 * 4. `politics` QUALIFIES UNDER THE RULE AND IS DEFERRED ANYWAY, on the
 *    `hiv-aids` precedent. It is asserted still-deferred so the omission cannot
 *    read as an oversight to a later pass.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99950101100200_tag_description_measured_rewrite_batch10.sql',
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

const REPAIRED = [
  'human-rights',
  'coming-out',
  'same-sex-marriage',
  'pride-month',
  'drag-culture',
  'gender-affirming-care',
  'lgbtq-culture',
];

describe('tag description measured rewrite, batch 10', () => {
  it('repairs exactly the seven measured rows, each guarded on its exact feed label', () => {
    const guarded: Array<[string, string]> = [
      ['human-rights', 'International human rights coverage'],
      ['coming-out', 'Coming out stories and support'],
      ['same-sex-marriage', 'News about marriage equality'],
      ['pride-month', 'Pride-related news and events'],
      ['drag-culture', 'Drag performance and culture news'],
      ['gender-affirming-care', 'Transgender healthcare and treatment news'],
      ['lgbtq-culture', 'Cultural news and stories'],
    ];
    for (const [slug, label] of guarded) {
      const stmt = statements
        .split(/update unified_tags/)
        .find((s) => s.includes(`slug = '${slug}'`));
      expect(stmt, `no statement for ${slug}`).toBeTruthy();
      // equality, not LIKE: the guard must match the feed label exactly, so a
      // row someone else already repaired matches nothing.
      expect(stmt).toContain(`description = '${label}'`);
      expect(stmt).toContain("status = 'active'");
    }
    expect(statements.match(/update unified_tags/g)).toHaveLength(7);
  });

  it('never writes, nulls or otherwise touches a body — the bodies are the evidence', () => {
    expect(statements).not.toMatch(/long_description/);
    expect(verify).toMatch(/long_description is not null and btrim\(long_description\) <> ''/);
    expect(verify).toMatch(/a body was destroyed/);
  });

  it('strips the feed-label vocabulary from every repaired row', () => {
    for (const t of writtenTexts) {
      expect(t).not.toMatch(/\b(news|coverage|stories|updates)\b/i);
    }
    expect(verify).toMatch(/\\m\(news\|coverage\|stories\|updates\)\\M/);
    expect(verify).toMatch(/still publish a feed label/);
  });

  it('gives pride-month the two facts its feed label omitted', () => {
    // "Pride-related news and events" says neither when Pride Month is nor what
    // it commemorates; the row's own body says both.
    const pm = writtenTexts.find((t) => t.startsWith('The annual celebration'));
    expect(pm).toBeTruthy();
    expect(pm).toMatch(/June/);
    expect(pm).toMatch(/Stonewall/);
    expect(verify).toMatch(/pride-month no longer names June and Stonewall/);
  });

  it('gives gender-affirming-care a description of the care, not a news category', () => {
    const gac = writtenTexts.find((t) => t.startsWith('Medical, psychological and social care'));
    expect(gac).toBeTruthy();
    expect(gac).toMatch(/gender identity/i);
    // the body's outdated phrasing is deliberately not carried over
    expect(gac).not.toMatch(/sex reassignment/i);
    expect(gac).not.toMatch(/conform/i);
    expect(verify).toMatch(/gender-affirming-care no longer describes the care/);
  });

  it('carries no banned word over from the bodies it drew on', () => {
    // coming-out's own body says "It's a journey"; the replacement must not.
    for (const t of writtenTexts) {
      expect(t).not.toMatch(/\b(journey|vibrant|curated|unlock|discover|explore)\b/i);
      expect(t).not.toMatch(
        /\b(organisation|characterised|recognised|behaviour|licence|counselling|colours|marginalised)\b/i,
      );
      expect(t).not.toMatch(/\bnon-binary\b/i);
      expect(t).not.toMatch(/\b(you|your)\b/i);
      expect(t).not.toMatch(/!/);
    }
    expect(verify).toMatch(/\\m\(journey\|vibrant\|curated\|unlock\)\\M/);
  });

  it('asserts the deferred rows are still deferred, politics included', () => {
    for (const slug of [
      'politics',
      'international-news',
      'transgender-athletes',
      'economic-impact',
    ]) {
      expect(statements).not.toContain(`slug = '${slug}'`);
      expect(verify).toContain(`slug='${slug}'`);
    }
    expect(verify).toMatch(/a deferred row was rewritten/);
  });

  it('records why politics is held back although it qualifies', () => {
    expect(prose).toMatch(/hiv-aids. precedent/i);
    expect(prose).toMatch(/under-reaching is the correct error/i);
  });

  it('records that transgender-athletes has no body, so no second field', () => {
    expect(prose).toMatch(/long_description is NULL/);
    expect(prose).toMatch(/thin, not wrong/i);
  });

  it('records the hypothesis that was measured and REFUTED', () => {
    expect(prose).toMatch(/REFUTED MY OWN HYPOTHESIS/i);
    expect(prose).toMatch(/not decisive until it is run/i);
  });

  it('records that three rival axes were sized before this one was chosen', () => {
    expect(prose).toMatch(/duplicate description across rows/i);
    expect(prose).toMatch(/already closed by round sixteen/i);
    expect(prose).toMatch(/SIZED FIRST rather than chosen by hunch/i);
  });

  it('states that the actor declaration IS load-bearing on this tranche', () => {
    expect(statements).toContain(
      "set_config('app.actor', 'admin:tag-description-measured-rewrite-b10', true)",
    );
    expect(prose).toMatch(/ACTOR DECLARATION IS LOAD-BEARING/i);
    expect(prose).toMatch(/REAL value change rather than a self-assignment/i);
  });

  it('calls the real thin-page predicate rather than restating its OR', () => {
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/short_description is not null\s+and\s+description is not null/);
  });

  it('counts the reached state positively, and every condition is a real check', () => {
    expect(verify.match(/if v_bad <> 7 then/g) ?? []).toHaveLength(2);
    expect(verify.match(/if v_bad <> 1 then/g) ?? []).toHaveLength(2);
    expect(verify.match(/if v_bad <> 4 then/g) ?? []).toHaveLength(1);
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(3);
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/\bfalse\b/);
    expect((verify.match(/from unified_tags/g) ?? []).length).toBe(8);
    // every repaired slug is named in the verify block
    for (const slug of REPAIRED) expect(verify).toContain(slug);
  });
});
