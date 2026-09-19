import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99930101100700 — the measured rewrite, batch 8 (3 rows).
 *
 * 1. `top-surgery` PUBLISHED A WIKIPEDIA DISAMBIGUATION DUMP on an indexable
 *    trans-health page: a dangling colon followed by newline-separated article
 *    titles. Leading with mammaplasty and breast augmentation frames
 *    gender-affirming chest surgery as cosmetic breast work. The evidence is
 *    the row's OWN summary ("Surgical alterations of the chest for gender
 *    affirmation"), so this is the original rule.
 *
 * 2. THE REPLACEMENT MUST NAME BOTH DIRECTIONS. One that describes only
 *    masculinizing chest surgery erases trans feminine readers from their own
 *    entry — the `femme`/`drag-show`/`masc` narrowing class — and the result
 *    must be prose, carrying neither a newline nor a colon.
 *
 * 3. THE YIELD IS 3 OF 25 (12%) AND IS REPORTED, NOT PADDED. The temptation at
 *    that rate is to add generic-but-not-wrong rows so the batch looks worth
 *    shipping, which is the bulk sweep wearing a measured pass's clothes.
 *
 * 4. `tea` STAYS DEFERRED THOUGH THE EVIDENCE MOVED. All 17 of its assignments
 *    are venues, but its short_description also says "beverage", so repairing
 *    would mean overruling the row's own summary on category evidence alone.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99930101100700_tag_description_measured_rewrite_batch8.sql',
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

describe('tag description measured rewrite, batch 8', () => {
  it('repairs exactly the three measured rows, each content-guarded', () => {
    const guarded: Array<[string, string]> = [
      ['top-surgery', '%breasts:Mammaplasty%'],
      ['resources', '%renewable or non-renewable resources%'],
      ['color-blue', '%Rayleigh scattering%'],
    ];
    for (const [slug, needle] of guarded) {
      const stmt = statements
        .split(/update unified_tags/)
        .find((s) => s.includes(`slug = '${slug}'`));
      expect(stmt, `no statement for ${slug}`).toBeTruthy();
      expect(stmt).toContain(`description like '${needle}'`);
      expect(stmt).toContain("status = 'active'");
    }
    expect(statements.match(/update unified_tags/g)).toHaveLength(3);
  });

  it('gives top-surgery prose that names both directions', () => {
    const ts = writtenTexts.find((t) => t.startsWith('Gender-affirming chest surgery'));
    expect(ts).toBeTruthy();
    expect(ts).toMatch(/trans masculine/i);
    expect(ts).toMatch(/trans feminine/i);
    // the disambiguation list is gone
    expect(ts).not.toMatch(/Mammaplasty|Breast reduction|Mastectomy surgery/i);
    expect(verify).toMatch(/top-surgery no longer names both directions/);
  });

  it('asserts top-surgery is prose, not a list', () => {
    // The defect was a dangling colon plus newline-separated article titles, so
    // the repair must carry neither. Asserted in the migration AND on the text.
    const ts = writtenTexts.find((t) => t.startsWith('Gender-affirming chest surgery'))!;
    expect(ts).not.toContain(':');
    expect(ts).not.toContain('\n');
    expect(verify).toMatch(/position\(E'\\n' in description\) > 0/);
    expect(verify).toMatch(/top-surgery is still a list/);
  });

  it('strips the wrong subject from resources and color-blue', () => {
    const res = writtenTexts.find((t) => t.startsWith('Support services'));
    expect(res).toBeTruthy();
    // natural-resource economics, not health resources
    expect(res).not.toMatch(/renewable|supply|wealth|commodit/i);

    const blue = writtenTexts.find((t) => t.startsWith('Blue, as a garment'));
    expect(blue).toBeTruthy();
    expect(blue).not.toMatch(/Rayleigh|Tyndall|wavelength|RGB|RYB|spectrum/i);
  });

  it('asserts the deferred rows are still deferred', () => {
    for (const slug of ['tea', 'shopping', 'outing', 'self-harm']) {
      expect(statements).not.toContain(`slug = '${slug}'`);
      expect(verify).toContain(`slug='${slug}'`);
    }
    expect(verify).toMatch(/a deferred row was rewritten/);
  });

  it('records why tea stays deferred even though the evidence moved', () => {
    // A deferral decays, but this one survives re-reading: two prose fields
    // agree on the beverage, so repairing overrules the row's own summary.
    expect(prose).toMatch(/all 17 assignments are VENUES/i);
    expect(prose).toMatch(/short_description ALSO says/i);
  });

  it('reports the falling yield rather than padding the batch', () => {
    expect(prose).toMatch(/12%/);
    expect(prose).toMatch(/REPORTED RATHER THAN PADDED/i);
  });

  it('records that the control was lost to the ORDER BY a second time', () => {
    // Batch 7 coined the rule; this tranche broke it again via `nulls last`.
    expect(prose).toMatch(/nulls last/i);
    expect(prose).toMatch(/a rule you have written down is not a rule you have applied/i);
  });

  it('states that the actor declaration IS load-bearing on this tranche', () => {
    // top-surgery is human_reviewed = true, unlike batch 7's tranche.
    expect(statements).toContain(
      "set_config('app.actor', 'admin:tag-description-measured-rewrite-b8', true)",
    );
    expect(prose).toMatch(/ACTOR DECLARATION IS LOAD-BEARING/i);
    expect(prose).toMatch(/human_reviewed = true/);
  });

  it('ships no voice violation, with the plural-aware regex', () => {
    expect(verify).toMatch(
      /organisation\|characterised\|recognised\|behaviour\|licence\|counselling/,
    );
    expect(verify).toMatch(/\)s\?\\M/);
    for (const t of writtenTexts) {
      expect(t).not.toMatch(
        /\b(organisation|characterised|recognised|behaviour|licence|counselling|colours)\b/i,
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
    expect(verify.match(/if v_bad <> 3 then/g) ?? []).toHaveLength(1);
    expect(verify.match(/if v_bad <> 1 then/g) ?? []).toHaveLength(1);
    expect(verify.match(/if v_bad <> 4 then/g) ?? []).toHaveLength(1);
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(4);
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/\bfalse\b/);
    expect((verify.match(/from unified_tags/g) ?? []).length).toBe(7);
  });
});
