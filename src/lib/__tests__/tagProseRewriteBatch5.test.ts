import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99930101100400 — the measured rewrite, batch 5 (5 rows).
 *
 * 1. THE YIELD IS THE RESULT. 30 rows read by usage, 5 taken. Padding a batch
 *    with generic-but-not-wrong rows is the bulk rewrite this repo retired when
 *    the tag prose judge retracted 16 of its first 18 rows with 13 of them
 *    WRONG, so the DEFERRED rows are asserted to survive.
 *
 * 2. `music` IS THE SHARPEST CASE IN THE SERIES and its evidence is the two
 *    fields this file does not write: short_description is "Art using sound"
 *    and long_description is the art form, while `description` alone published
 *    a kink/sensory-play definition. A pass that "tidied" the summary or body
 *    would have destroyed its own evidence — so those are asserted UNCHANGED.
 *
 * 3. `accessibility` IS A CLAUSE DELETION, NOT A REWRITE, and is labelled as its
 *    own group so a later reader cannot take the rewrite group's licence and
 *    apply it there. "The clause is gone" is equally satisfied by a full
 *    rewrite, so the surviving sentence is asserted too.
 *
 * 4. VOICE CONFORMANCE with the plural-aware regex.
 */

const MIG = join(
  process.cwd(),
  'supabase/migrations/99930101100400_tag_description_measured_rewrite_batch5.sql',
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

describe('tag description measured rewrite, batch 5', () => {
  it('repairs exactly the five measured rows, each content-guarded', () => {
    // A guard is what makes the migration a no-op if someone repairs the row
    // first — the concurrency discipline that keeps a rival fix from turning
    // into a `db push` abort on main.
    const guarded: Array<[string, string]> = [
      ['party', '%Hotels close to nightlife%'],
      ['mat-spandex', '%Joseph Shivers at DuPont%'],
      ['bipoc', '%BIPOC stands for .%'],
      ['music', '%enhance sexual or sensory experiences%'],
      ['accessibility', '%with disabilities, including LGBTQIA+ individuals.%'],
    ];
    for (const [slug, needle] of guarded) {
      const stmt = statements
        .split(/update unified_tags/)
        .find((s) => s.includes(`slug = '${slug}'`));
      expect(stmt, `no statement for ${slug}`).toBeTruthy();
      expect(stmt).toContain(`description like '${needle}'`);
      expect(stmt).toContain("status = 'active'");
    }
    expect(statements.match(/update unified_tags/g)).toHaveLength(5);
  });

  it('settles party and mat-spandex on the sense their assignments establish', () => {
    // party is 6,793 event assignments and published a hotel-amenity definition;
    // mat-spandex is 4,085 marketplace listings and published polymer chemistry.
    const party = writtenTexts.find((t) => t.startsWith('A party atmosphere'));
    expect(party).toBeTruthy();
    expect(party).not.toMatch(/hotel/i);

    const spandex = writtenTexts.find((t) => t.startsWith('A synthetic fiber'));
    expect(spandex).toBeTruthy();
    expect(spandex).not.toMatch(/DuPont|Shivers|copolymer|polyether/i);
    // The material is still named by its trade names — a marketplace filter is
    // what this row serves, and "Lycra" is how a listing spells it.
    expect(spandex).toMatch(/Lycra/);
    expect(spandex).toMatch(/elastane/);
  });

  it('supplies the BIPOC expansion that was literally missing', () => {
    const bipoc = writtenTexts.find((t) => t.startsWith('BIPOC stands for'));
    expect(bipoc).toBeTruthy();
    expect(bipoc).toContain('Black, Indigenous, and People of Color');
    // The second sentence is repaired too: "racial and ethnic minorities" is the
    // definition of POC and drops the specificity the acronym exists to carry.
    expect(bipoc).toMatch(/Black and Indigenous communities specifically/);
    expect(bipoc).not.toMatch(/umbrella term/);
  });

  it('gives music a description that agrees with its own summary and body', () => {
    const music = writtenTexts.find((t) => t.startsWith('Sound arranged into'));
    expect(music).toBeTruthy();
    expect(music).not.toMatch(/sexual|sensory play|scene-setting|arousal/i);
  });

  it('asserts the summary and body of the repaired rows are NOT written', () => {
    // This series never writes `description`, and here the other two fields are
    // the evidence the repair rests on.
    expect(statements).not.toMatch(/set\s+short_description/);
    expect(statements).not.toMatch(/set\s+long_description/);
    expect(verify).toContain("short_description = 'Art using sound'");
    expect(verify).toContain('long_description like ');
  });

  it('keeps the accessibility edit minimal — a replace(), never a literal body', () => {
    // A replace() CANNOT author prose, so every other sentence survives by
    // construction rather than by retyping it.
    const stmt = statements
      .split(/update unified_tags/)
      .find((s) => s.includes("slug = 'accessibility'"));
    expect(stmt).toMatch(/set description = replace\(description,/);
    expect(stmt).toContain(' with disabilities, including LGBTQIA+ individuals.');
    expect(stmt).toContain(' with disabilities.');
    // and the surviving sentence is asserted, or a full rewrite passes too
    expect(verify).toContain(
      "description like 'The design and implementation of environments, products, and services that are inclusive%'",
    );
  });

  it('asserts the deferred rows are still deferred', () => {
    // youth is generic-but-not-wrong and writer is thin-but-not-wrong;
    // under-reaching is the correct error. A later pass that sweeps them in has
    // to break this check first.
    expect(verify).toMatch(/slug='youth'/);
    expect(verify).toMatch(/slug='writer'/);
    expect(verify).toMatch(/a deferred row was rewritten/);
    for (const slug of ['youth', 'writer', 'lesbian', 'gay', 'naturist']) {
      expect(statements).not.toContain(`slug = '${slug}'`);
    }
  });

  it('ships no voice violation, with the plural-aware regex', () => {
    expect(verify).toMatch(
      /organisation\|characterised\|recognised\|behaviour\|licence\|counselling/,
    );
    // \m...\M anchors BOTH ends, so the s? is what catches "organisations".
    expect(verify).toMatch(/\)s\?\\M/);
    expect(verify).toMatch(/\\mnon-binary\\M/);
    for (const t of writtenTexts) {
      expect(t).not.toMatch(
        /\b(organisation|characterised|recognised|behaviour|licence|counselling)s?\b/i,
      );
      expect(t).not.toMatch(/\bnon-binary\b/i);
      expect(t).not.toMatch(/\b(you|your)\b/i);
      expect(t).not.toMatch(/!/);
      // the retired fluff vocabulary
      expect(t).not.toMatch(/\b(discover|explore|unlock|curated|journey|vibrant)\b/i);
    }
  });

  it('calls the real thin-page predicate rather than restating its OR', () => {
    // tag_has_prose is `description OR short_description`; a hand-rolled "both
    // present" form would fail on the rows whose short_description is null.
    expect(verify).toContain('not tag_has_prose(description, short_description)');
    expect(verify).not.toMatch(/short_description is not null\s+and\s+description is not null/);
  });

  it('counts the reached state positively, and every condition is a real check', () => {
    // Counting rows in a BAD state returns zero for a slug that has gone missing
    // from the corpus entirely.
    expect(verify).toMatch(/if v_bad <> 5 then/);
    expect(verify).toMatch(/if v_bad <> 1 then/);
    expect(verify).toMatch(/if v_bad <> 3 then/);
    expect(verify).toMatch(/if v_bad <> 2 then/);
    expect(verify.match(/if v_bad <> 0 then/g) ?? []).toHaveLength(3);
    // No loosened comparison anywhere, and no pre-seeded counter: both leave the
    // RAISE text and the slug lists intact while the check has stopped checking.
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/\bfalse\b/);
    // every postcondition actually reads the table
    expect((verify.match(/from unified_tags/g) ?? []).length).toBe(7);
  });

  it('declares the actor, which is load-bearing on this tranche', () => {
    // mat-spandex and music are human_reviewed = true; verified live, the
    // undeclared UPDATE returns "human_reviewed tag ... cannot be modified by
    // system:trigger". Batch 4 was the opposite case, which is why each file
    // states which one it is in.
    expect(statements).toContain(
      "set_config('app.actor', 'admin:tag-description-measured-rewrite-b5', true)",
    );
    expect(sql).toMatch(/human_reviewed = true/);
    expect(sql).toMatch(/cannot be modified by system:trigger/);
  });
});
