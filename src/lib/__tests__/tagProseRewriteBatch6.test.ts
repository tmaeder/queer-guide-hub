import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99930101100500 — the measured rewrite, batch 6 (6 rows).
 *
 * 1. A THIRD ORDERING. Batches 1-3 used a seeded order, batches 4-5 assignment
 *    count. This one selects on the Wikipedia-lead SIGNATURE — the prose opens
 *    by restating the tag's own name — which reaches rows neither earlier
 *    ordering could.
 *
 * 2. THE PROBE'S FIRST RUN RETURNED ZERO AND THE ZERO WAS A LIE: it used \b,
 *    and POSTGRES ARE HAS NO \b (the word-boundary escapes are \y, \m, \M).
 *    An emergent zero is indistinguishable from a blind probe, so the file
 *    records the control that caught it.
 *
 * 3. THE REFUSALS ARE ASSERTED, not merely omitted. The signature narrows what
 *    a human reads; it does not decide. `cruising`, `sexual-orientation`,
 *    `asexuality`, `homosexuality` and `sexual-minority` all match it and are
 *    correct; `tin` is wrong for its row but its intended sense cannot be
 *    established, and guessing a sense is how this class arose.
 *
 * 4. `hate-speech` KEEPS its legal-variance content — on a platform with a
 *    criminalization layer, dropping it to shorten a sentence is a content loss
 *    wearing a register fix's clothes.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99930101100500_tag_description_measured_rewrite_batch6.sql',
);
const sql = readFileSync(MIG, 'utf8');
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

const writtenTexts = [...statements.matchAll(/set description =\s*\n?\s*'((?:[^']|'')*)'/g)].map(
  (m) => m[1].replace(/''/g, "'"),
);

describe('tag description measured rewrite, batch 6', () => {
  it('repairs exactly the six measured rows, each content-guarded', () => {
    const guarded: Array<[string, string]> = [
      ['meetup', '%an American social media platform%'],
      ['mat-lace', '%made without the use of pre-existing fabric%'],
      ['color-black', '%absence or complete absorption of visible light%'],
      ['genre-fiction', '%inconsistent with fact, history, or plausibility%'],
      ['hate-speech', '%defined by the Cambridge Dictionary%'],
      ['cabaret', '%master of ceremonies%'],
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

  it('replaces the company definition on meetup with the gathering', () => {
    // 179 assignments, ALL events. The row published Meetup.com the company.
    const meetup = writtenTexts.find((t) => t.startsWith('An informal community gathering'));
    expect(meetup).toBeTruthy();
    expect(meetup).not.toMatch(/platform|service|users|tiers|company/i);
  });

  it('strips the encyclopedia from the namespace rows', () => {
    const lace = writtenTexts.find((t) => t.startsWith('A decorative openwork fabric'));
    expect(lace).toBeTruthy();
    expect(lace).not.toMatch(/cutwork|filet|distinct category/i);

    const black = writtenTexts.find((t) => t.startsWith('Black, as a garment'));
    expect(black).toBeTruthy();
    expect(black).not.toMatch(/achromatic|chroma|magistrates|Enlightenment/i);

    const fiction = writtenTexts.find((t) => t.startsWith('Imaginative writing:'));
    expect(fiction).toBeTruthy();
    expect(fiction).not.toMatch(/plausibility|role-playing|radio dramas/i);
  });

  it('removes the reader-facing source citations from hate-speech', () => {
    const hs = writtenTexts.find((t) => t.startsWith('Speech that attacks or demeans'));
    expect(hs).toBeTruthy();
    expect(hs).not.toMatch(/Cambridge Dictionary|Encyclopedia of the American Constitution/i);
    // and KEEPS the two facts that matter on this platform
    expect(hs).toMatch(/varies widely between countries/);
    expect(hs).toMatch(/sexual orientation and gender identity/);
    expect(verify).toMatch(/lost its legal-variance or identity content/);
  });

  it('keeps drag in the cabaret description', () => {
    // The original reached drag only in its final clause; a replacement that
    // drops it is shorter and worse on this platform.
    const cab = writtenTexts.find((t) => t.startsWith('Live performance for a seated audience'));
    expect(cab).toBeTruthy();
    expect(cab).toMatch(/drag/i);
    expect(verify).toMatch(/cabaret no longer names drag/);
  });

  it('asserts the accurate lead-shape rows are NOT touched', () => {
    // The probe narrows what a human reads; it does not decide.
    for (const slug of [
      'cruising',
      'sexual-orientation',
      'asexuality',
      'homosexuality',
      'sexual-minority',
      'tin',
    ]) {
      expect(statements).not.toContain(`slug = '${slug}'`);
      expect(verify).toContain(`slug='${slug}'`);
    }
    expect(verify).toMatch(/a refused row was rewritten/);
  });

  it('records that the first probe was blind, and why', () => {
    // Postgres ARE has no \b. An emergent zero reads exactly like a clean
    // corpus, so the control that caught it is part of the record.
    expect(sql).toMatch(/POSTGRES ARE HAS NO/);
    expect(sql).toMatch(/\\y/);
    expect(sql).toMatch(/positive control/i);
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
    // Five of the six have a null short_description, so a hand-rolled
    // "both fields present" form would fail on all five.
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/short_description is not null\s+and\s+description is not null/);
  });

  it('counts the reached state positively, and every condition is a real check', () => {
    expect(verify.match(/if v_bad <> 6 then/g) ?? []).toHaveLength(2);
    expect(verify.match(/if v_bad <> 1 then/g) ?? []).toHaveLength(2);
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(3);
    // No loosened comparison, no pre-seeded counter, no short-circuited predicate:
    // each leaves the RAISE text and slug lists intact while the check stops checking.
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/\bfalse\b/);
    expect((verify.match(/from unified_tags/g) ?? []).length).toBe(7);
  });

  it('declares the actor, which is load-bearing on this tranche', () => {
    // mat-lace is human_reviewed = true; verified live, the undeclared UPDATE
    // returns "human_reviewed tag ... cannot be modified by system:trigger".
    expect(statements).toContain(
      "set_config('app.actor', 'admin:tag-description-measured-rewrite-b6', true)",
    );
    expect(sql).toMatch(/human_reviewed = true/);
    expect(sql).toMatch(/cannot be modified by system:trigger/);
  });
});
