import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791054925 — round twenty-one, THE SEAM ROUNDS 19 AND 20 DEFERRED.
 *
 * What this test preserves, in order of how easily a later edit breaks it:
 *
 *  - THE PUBLISHED STANDARD IS THE EVIDENCE FOR GROUP D, so the phrase must
 *    leave EVERY prose column of those three rows. `styleguide_terms` carries
 *    `opposite sex` in the `avoid` array of the `nonbinary` term at severity
 *    `never`; fixing the summary and leaving the body is the half-repair class
 *    this series has recorded four times.
 *  - GROUP D EDITS ITS BODIES, IT DOES NOT REWRITE THEM. A `replace()` cannot
 *    author prose, so the Hirschfeld history survives by construction. If a
 *    later edit swaps the replace for a literal body, the surgical property is
 *    gone and so is the argument for touching the column at all.
 *  - `description` IS WRITTEN ON EXACTLY ONE ROW, and the exception is the whole
 *    point: the phrase the standard rates `never` sits in `transvestite`'s
 *    description, so the series' usual ban would leave the violation live.
 *    Precedent is `99991789823744`'s `anus`/`labia` repairs. One row, named, and
 *    asserted — never a licence.
 *  - NO IDENTIFIER MOVES ANYWHERE. Q486680 is CORRECT for transvestism (its own
 *    English description is the defect string verbatim, which is how the prose
 *    got written), and Q579348/Q47522151 are correct for their rows. This is the
 *    `methadone`/`jockstrap` rule, and a round that starts nulling QIDs has
 *    stopped being this round.
 *  - THE KEPT BODIES ARE ASSERTED IN BOTH DIRECTIONS. Four bodies are nulled;
 *    that is exactly the shape that takes a good body with it, so eight bodies
 *    are required to survive byte-identical to the snapshot.
 *  - THE PADDING REFUSAL. Three group-B bodies carry "It's essential to
 *    prioritize…"; round 13 measured that cohort and refused to sweep it. A
 *    round that nulls them has reversed a measured decision silently.
 *  - EVERY UPDATE IS CONTENT-GUARDED on the text it removes, so a concurrent
 *    repair keeps its work and the migration no-ops rather than aborting
 *    `db push` for the whole repo.
 *  - `tag_has_prose` IS CALLED, NOT RESTATED — its OR is not the stricter "both
 *    present" form (round eleven).
 *  - THE POSTCONDITIONS CANNOT BE NEUTERED: no `false` in the verify block, no
 *    pre-seeded counter, every check reads `unified_tags`, and the snapshot must
 *    cover every row the JOIN-based checks name (the mutation that survived
 *    round 20's first batch).
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99991791054925_tag_prose_deferred_seam.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

// Comment-stripped: the header quotes the defect strings, the refusals and the
// kept identifiers verbatim, so an unstripped search matches the PROSE while the
// statement is gone. Line-anchored, because a mid-line `--` inside a string
// literal is not a comment.
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const verifyAt = bare.indexOf('do $verify$');
const statements = bare.slice(0, verifyAt);
const verify = bare.slice(verifyAt);

// The five UPDATEs, sliced apart so a group assertion cannot be satisfied by a
// different group's statement.
const updates = statements
  .split(/(?=update public\.unified_tags)/)
  .filter((s) => s.trimStart().startsWith('update public.unified_tags'));
const [groupA, groupB, groupC, groupD, descFix] = updates;

const GROUP_A = ['cock-socket', 'cock', 'playing-the-field', 'swab'];
const GROUP_B = [
  'hot-wax',
  'pinching',
  'cock-and-ball-ring',
  'feather-tickler',
  'suction-cup-dildo',
  'domestic-discipline-dd',
];
const GROUP_C = ['alprostadil', 'caverject', 'apomorphine', 'stendra'];
const GROUP_D = ['cross-dressing', 'transvestism', 'transvestite'];
const CONTROLS = [
  'cross-dresser',
  'avanafil',
  'poppers',
  'opposite-sex',
  'heterosexual',
  'heteronormativity',
];
const KEPT_BODIES = [
  'cock-and-ball-ring',
  'feather-tickler',
  'suction-cup-dildo',
  'domestic-discipline-dd',
  ...GROUP_C,
];
const PHRASE = 'associated with the opposite sex';

describe('round 21 — the deferred seam', () => {
  it('parses into exactly the five expected statements', () => {
    expect(updates).toHaveLength(5);
    expect(verifyAt).toBeGreaterThan(0);
  });

  it('repairs all seventeen rows and nothing else', () => {
    const all = [...GROUP_A, ...GROUP_B, ...GROUP_C, ...GROUP_D];
    expect(all).toHaveLength(17);
    expect(new Set(all).size).toBe(17);
    for (const slug of GROUP_A) expect(groupA).toContain(`'${slug}'`);
    for (const slug of GROUP_B) expect(groupB).toContain(`'${slug}'`);
    for (const slug of GROUP_C) expect(groupC).toContain(`'${slug}'`);
    for (const slug of GROUP_D) expect(groupD).toContain(`'${slug}'`);
  });

  // ---- group A: wrong-subject body -------------------------------------------
  it('group A nulls the wrong-subject body and no other statement does', () => {
    expect(groupA).toMatch(/long_description\s*=\s*null/);
    // The says-nothing group must NOT null a body: three of its four bodies are
    // the padding cohort round 13 measured and refused to sweep.
    expect(groupB).not.toMatch(/long_description\s*=\s*null/);
    expect(groupC).not.toMatch(/long_description\s*=\s*null/);
    expect(groupD).not.toMatch(/long_description\s*=\s*null/);
  });

  it('group A restates cock WITHOUT the gendering, a reduction and never an addition', () => {
    // The row's own description reads "Slang for a man's penis"; the corpus has
    // already de-gendered `penis` itself (99991789823744), so the qualifier is
    // dropped rather than carried onto a reader surface.
    expect(groupA).toContain("'Slang for the penis.'");
    expect(groupA).not.toMatch(/a man's penis/);
  });

  it('group C states the class and route, and the nitrate claim ONLY on stendra', () => {
    // The flattened summary erased drug class and route, and three of the four
    // are not PDE5 inhibitors at all. `stendra` carries the interval because its
    // own sibling `avanafil` already states it; the other three deliberately
    // make NO nitrate claim, because asserting one for a non-PDE5 drug would be
    // a fact not on the row. Both halves are asserted — a round that extends the
    // claim to all four, or drops it from stendra, has reversed that decision.
    expect(groupC).toContain('Its label requires 12 hours before any nitrate.');
    expect(groupC.match(/nitrate/g) ?? []).toHaveLength(1);
    expect(groupC).toContain('Prostaglandin E1');
    expect(groupC).toContain('urethra');
    expect(groupC).toContain('dopamine agonist');
    expect(groupC).toContain('not a PDE5 inhibitor');
  });

  // ---- group D: the standard violation ---------------------------------------
  it('group D edits its bodies with an exact-phrase replace, never a literal body', () => {
    expect(groupD).toContain(`replace(t.long_description`);
    expect(groupD).toContain(`'${PHRASE}'`);
    expect(groupD).toContain(`'associated with another gender'`);
    // A literal body on the group-D statement would mean prose was authored.
    expect(groupD).not.toMatch(/long_description\s*=\s*'/);
  });

  it('group D is guarded on BOTH the summary and the body carrying the phrase', () => {
    expect(groupD).toContain(
      `btrim(t.short_description) = 'Dressing in a manner traditionally associated with the opposite sex'`,
    );
    expect(groupD).toContain(`t.long_description like '%${PHRASE}%'`);
  });

  it('writes description on transvestite ALONE, by an exact-phrase replace', () => {
    // The whole series' `description` ban has exactly one documented exception.
    const descWrites = updates.filter((u) => /(?<![_a-z])description\s*=/.test(u));
    expect(descWrites).toHaveLength(1);
    expect(descWrites[0]).toBe(descFix);
    expect(descFix).toContain(`t.slug = 'transvestite'`);
    expect(descFix).toContain(`replace(t.description`);
    expect(descFix).toContain(`t.description like '%${PHRASE}%'`);
    // Every other statement leaves the column alone.
    for (const u of [groupA, groupB, groupC, groupD]) {
      expect(u).not.toMatch(/(?<![_a-z])description\s*=/);
    }
  });

  // ---- identifiers -----------------------------------------------------------
  it('moves no identifier anywhere in the round', () => {
    // Q486680 is CORRECT for transvestism; Q579348 and Q47522151 for their rows.
    // Scoped to the UPDATEs: the snapshot legitimately SELECTS `wikidata_id` so
    // that P7 can compare it, and asserting over the whole statements region
    // therefore fails against correct code.
    for (const u of updates) expect(u).not.toContain('wikidata_id');
    const snapAt = statements.indexOf('create temporary table _r21_before');
    const snapshot = statements.slice(snapAt, statements.indexOf('update public.unified_tags'));
    expect(snapshot).toContain('wikidata_id');
    expect(verify).toContain('wikidata_id is distinct from b.wikidata_id');
  });

  it('writes nothing to the repair audit, which is the sentinel INPUT', () => {
    expect(sql).not.toMatch(/insert\s+into\s+public\.tag_wikidata_repair_audit/i);
  });

  // ---- content guards --------------------------------------------------------
  it('content-guards every repair so a concurrent fix keeps its work', () => {
    for (const u of [groupA, groupB, groupC]) {
      expect(u).toMatch(/btrim\(t\.short_description\)\s*=\s*g\.old_sd/);
      expect(u).toContain(`t.status = 'active'`);
    }
    expect(groupD).toMatch(/btrim\(t\.short_description\)\s*=\s*'Dressing in a manner/);
    expect(descFix).toContain(`t.status = 'active'`);
  });

  it('declares the actor, which is load-bearing on two human_reviewed rows', () => {
    expect(statements).toContain(
      `set_config('app.actor', 'migration:99991791054925_tag_prose_deferred_seam', true)`,
    );
  });

  // ---- postconditions --------------------------------------------------------
  it('snapshots every row the JOIN-based checks name, so none can go vacuous', () => {
    const snapAt = statements.indexOf('create temporary table _r21_before');
    const snapshot = statements.slice(snapAt, statements.indexOf('update public.unified_tags'));
    for (const slug of [...GROUP_A, ...GROUP_B, ...GROUP_C, ...GROUP_D, ...CONTROLS]) {
      expect(snapshot).toContain(`'${slug}'`);
    }
    expect(snapshot).toContain('had_body');
  });

  it('asserts the phrase is gone from ALL THREE prose columns of group D', () => {
    const p5 = verify.slice(verify.indexOf('round 21 P5') - 900, verify.indexOf('round 21 P5'));
    // `description` is a SUFFIX of both other column names, so the bare pattern
    // is satisfied by the `long_description` line and the check goes vacuous on
    // exactly the column that carries the phrase on `transvestite`. A mutation
    // deleting that arm SURVIVED the first round for this reason.
    expect(p5).toMatch(/short_description[^\n]*not ilike '%opposite sex%'/);
    expect(p5).toMatch(/long_description[^\n]*not ilike '%opposite sex%'/);
    expect(p5).toMatch(/(?<![_a-z])description[^\n]*not ilike '%opposite sex%'/);
    // Three columns, three arms — a count, so losing one cannot hide behind the
    // other two matching.
    expect(p5.match(/not ilike '%opposite sex%'/g) ?? []).toHaveLength(3);
  });

  it('asserts the group-D bodies changed by EXACTLY the replace', () => {
    const p6 = verify.slice(verify.indexOf('round 21 P6') - 700, verify.indexOf('round 21 P6'));
    expect(p6).toContain(`replace(b.long_description`);
    expect(p6).toMatch(/t\.long_description\s*<>\s*b\.long_description/);
  });

  it('requires the eight kept bodies to survive byte-identical', () => {
    const p3 = verify.slice(verify.indexOf('round 21 P3') - 800, verify.indexOf('round 21 P3'));
    for (const slug of KEPT_BODIES) expect(p3).toContain(`'${slug}'`);
    expect(p3).toMatch(/t\.long_description\s*=\s*b\.long_description/);
    expect(p3).toContain('t.long_description is not null');
  });

  it('requires the two bodyless rows to stay bodyless, so no body is minted', () => {
    const p4 = verify.slice(verify.indexOf('round 21 P4') - 500, verify.indexOf('round 21 P4'));
    expect(p4).toContain(`'hot-wax'`);
    expect(p4).toContain(`'pinching'`);
    expect(p4).toContain('not b.had_body');
  });

  it('enforces the refusals and the evidence rows as controls', () => {
    const p9 = verify.slice(verify.indexOf('round 21 P9') - 900, verify.indexOf('round 21 P9'));
    for (const slug of CONTROLS) expect(p9).toContain(`'${slug}'`);
    // avanafil is the EVIDENCE for stendra's 12-hour line; cross-dresser for
    // group D's phrasing. Both must be untouched or the evidence is circular.
    expect(p9).toMatch(/short_description is not distinct from b\.short_description/);
    expect(p9).toMatch(/long_description\s*is not distinct from b\.long_description/);
  });

  it('calls tag_has_prose rather than restating its OR', () => {
    expect(verify).toContain('public.tag_has_prose(t.description, t.short_description)');
    expect(verify).not.toMatch(/coalesce\(nullif\(btrim\(/);
  });

  it('counts the REACHED state positively, so a vanished slug cannot read as success', () => {
    expect(verify).toContain('if v_bad <> 17 then');
    const comparisons = verify.match(/if v_bad <> \d+ then/g) ?? [];
    expect(comparisons).toHaveLength(9);
    // A loosened comparison anywhere would let a partial repair pass.
    expect(verify).not.toMatch(/if v_bad [<>]=? \d/);
  });

  it('cannot be neutered by a short-circuit or a pre-seeded counter', () => {
    expect(verify).not.toMatch(/\bfalse\b/);
    expect(verify).toMatch(/v_bad\s+int;/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    // Every postcondition must actually read the table.
    const reads = verify.match(/from public\.unified_tags/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(9);
  });

  it('scopes each postcondition to the rows it is about', () => {
    // P2 is group A only — widening it to the whole round would RAISE on apply,
    // because eight bodies are deliberately KEPT.
    const p2 = verify.slice(verify.indexOf('round 21 P2') - 400, verify.indexOf('round 21 P2'));
    for (const slug of GROUP_A) expect(p2).toContain(`'${slug}'`);
    for (const slug of KEPT_BODIES) expect(p2).not.toContain(`'${slug}'`);
  });

  it('allows the one description write and forbids every other, by position', () => {
    const p8 = verify.slice(verify.indexOf('round 21 P8') - 500, verify.indexOf('round 21 P8'));
    expect(p8).toContain(`t.slug <> 'transvestite'`);
    expect(p8).toContain('t.description is distinct from b.description');
  });
});
