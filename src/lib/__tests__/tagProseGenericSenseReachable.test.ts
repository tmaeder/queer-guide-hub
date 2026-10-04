import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791015924 — round twenty, THE GENERIC SENSE ON THE ROWS A READER
 * ACTUALLY MEETS.
 *
 * Rounds 2-19 selected rows by the SHAPE of the defect. This round selected by
 * REACH — the `useHomeGlossaryPool` predicate (indexable, non-adult, and a
 * NON-NULL `short_description`) — which is why it finds a different set.
 *
 * What this test preserves, in order of how easily a later edit breaks it:
 *
 *  - `description` IS NEVER WRITTEN. It is the evidence every replacement rests
 *    on; a pass that may rewrite it can make any summary "correct" after the
 *    fact. The migration proves it at apply time with a before-snapshot, and
 *    this test proves it statically. Note `short_description` and
 *    `long_description` both END in that word, so the pattern needs a
 *    lookbehind — a naive search reports a violation against correct code.
 *  - THE TWO GROUPS KEEP OPPOSITE IDENTIFIER TREATMENT. Group A nulls five
 *    verified-wrong QIDs; group B KEEPS seven verified-correct ones. A sweep
 *    that cleared all twelve satisfies "the five are null" just as well, so
 *    `wikidata_id` must appear in the group-A statement and NOWHERE in group B.
 *  - EVERY UPDATE IS CONTENT-GUARDED on the text it removes, so a human or a
 *    concurrent session that repairs a row first keeps their work — and the
 *    migration no-ops instead of aborting `db push` for the whole repo.
 *  - P1 IS KEYED ON THE DEFECT, NOT ON THIS FILE'S OWN WORDING. An assertion
 *    that the new text is present would RAISE on somebody else's better fix.
 *  - THE REFUSALS ARE ENFORCED, NOT JUST WRITTEN DOWN. `food` and `bicurious`
 *    were read and declined (generic-but-not-wrong, and thin-not-wrong); the
 *    verify block asserts they are untouched, so a later sweep reaching for
 *    them breaks this file's own check.
 *  - THE CONTROLS. Twelve body nulls are exactly the shape that takes a good
 *    body with them, so the mirror assertion runs on six rows OUTSIDE the
 *    round and requires their bodies to survive.
 *  - `tag_has_prose` IS CALLED, NOT RESTATED. Its OR is not the stricter "both
 *    present" form; restating it reports a defect in the repair (round eleven).
 *  - THE POSTCONDITIONS CANNOT BE NEUTERED: no `false` in the verify block, no
 *    pre-seeded counter, and P1 counts the REACHED state positively so a slug
 *    vanishing from the corpus cannot read as success.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99991791015924_tag_prose_generic_sense_reachable.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

// Comment-stripped: the header quotes the defect strings, the refusals and the
// kept identifiers verbatim, so an unstripped search matches the PROSE while
// the statement is gone. Line-anchored, because a mid-line `--` inside a string
// literal is not a comment.
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const verifyAt = bare.indexOf('do $verify$');
const statements = bare.slice(0, verifyAt);
const verify = bare.slice(verifyAt);

const GROUP_A = ['bbc', 'auntie', 'softcore', 'cuckhold', 'single'];
const GROUP_B = [
  'humor',
  'chocolate',
  'wrestling',
  'photography',
  'metal',
  'clothing',
  'news-education',
];
const ALL = [...GROUP_A, ...GROUP_B];

// The eleven distinct strings the round exists to remove (the broadcaster line
// sits on two rows).
const DEFECTS = [
  'British public service broadcaster',
  'Term with multiple meanings',
  'Consensual relationship dynamic',
  'Music release with one song',
  'Literary and dramatic works intended to be humorous',
  'Food made from roasted cocoa beans',
  'Combat sport involving grappling techniques',
  'Art and practice of creating images by recording light',
  'Material that conducts electricity and heat',
  'Items worn on the human body',
  'Transmission of knowledge and skills',
];

const KEPT_QIDS: Array<[string, string]> = [
  ['humor', 'Q40831'],
  ['chocolate', 'Q195'],
  ['wrestling', 'Q42486'],
  ['photography', 'Q11633'],
  ['metal', 'Q11426'],
  ['clothing', 'Q11460'],
  ['news-education', 'Q8434'],
];

const REFUSED = ['food', 'bicurious'];
const CONTROLS = ['tucking', 'bipoc', 'homonationalism', 'milf', 'spironolactone', 'gender-marker'];

// The two UPDATE statements, sliced apart so an assertion about one group is
// never satisfied by the other.
const groupAStmt = statements.slice(
  statements.indexOf('update public.unified_tags'),
  statements.lastIndexOf('update public.unified_tags'),
);
const groupBStmt = statements.slice(statements.lastIndexOf('update public.unified_tags'));

describe('round 20 — the generic sense on the reachable rows', () => {
  it('slices the file into two distinct UPDATE statements', () => {
    // Positive control: without this the group assertions below are vacuous.
    expect(statements.indexOf('update public.unified_tags')).toBeGreaterThan(-1);
    expect(statements.lastIndexOf('update public.unified_tags')).toBeGreaterThan(
      statements.indexOf('update public.unified_tags'),
    );
    expect(groupAStmt.length).toBeGreaterThan(200);
    expect(groupBStmt.length).toBeGreaterThan(200);
    expect(verify.length).toBeGreaterThan(500);
  });

  it('never writes description — only short_description and long_description', () => {
    // `short_description =` and `long_description =` both end in the word, so
    // the lookbehind is what makes this assertion mean anything.
    expect(statements).not.toMatch(/(?<![_a-z])description\s*=/);
    expect(verify).not.toMatch(/(?<![_a-z])description\s*=\s*'/);
  });

  it('writes both prose columns it claims to and nothing else', () => {
    expect(groupAStmt).toMatch(/set short_description = g\.new_sd/);
    expect(groupAStmt).toMatch(/long_description\s*=\s*null/);
    expect(groupBStmt).toMatch(/set short_description = g\.new_sd/);
    expect(groupBStmt).toMatch(/long_description\s*=\s*null/);
    // No merge, no delete, no audit-table write anywhere in the file.
    expect(bare).not.toMatch(/merged_into_id/);
    expect(bare).not.toMatch(/\bdelete\s+from\b/i);
    expect(bare).not.toMatch(/tag_wikidata_repair_audit/);
  });

  it('nulls the identifier in group A only, and never touches it in group B', () => {
    expect(groupAStmt).toMatch(/wikidata_id\s*=\s*null/);
    expect(groupBStmt).not.toMatch(/wikidata_id/);
    // Exactly one assignment of the column in the whole statements region.
    expect(statements.match(/wikidata_id\s*=\s*null/g)).toHaveLength(1);
  });

  it('content-guards both updates on the text being removed', () => {
    expect(groupAStmt).toMatch(/btrim\(t\.short_description\) = g\.old_sd/);
    expect(groupBStmt).toMatch(/btrim\(t\.short_description\) = g\.old_sd/);
    expect(statements.match(/btrim\(t\.short_description\) = g\.old_sd/g)).toHaveLength(2);
    // Both updates are scoped to live rows.
    expect(statements.match(/t\.status = 'active'/g)).toHaveLength(2);
  });

  it('targets every slug in its own group and no other', () => {
    for (const slug of GROUP_A) expect(groupAStmt).toContain(`'${slug}'`);
    for (const slug of GROUP_B) expect(groupBStmt).toContain(`'${slug}'`);
    for (const slug of GROUP_B) expect(groupAStmt).not.toContain(`'${slug}'`);
    for (const slug of GROUP_A) expect(groupBStmt).not.toContain(`'${slug}'`);
  });

  it('removes each defect string by naming it in a guard', () => {
    for (const defect of DEFECTS) expect(statements).toContain(defect);
  });

  it('gives all twelve rows mutually distinct summaries', () => {
    // Parse the (slug, old_sd, new_sd) triples out of each VALUES block. The
    // first draft of this sliced from `('<slug>'` to the next `),`, which
    // over-runs for the LAST row of each block — it has no trailing comma — and
    // silently picked up a literal from the following statement. Matching the
    // whole triple cannot drift that way, and `(?:[^']|'')*` is required because
    // the `cuckhold` row contains an escaped quote.
    const TRIPLE = /\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)/g;
    const rows = [groupAStmt, groupBStmt].flatMap((stmt) => {
      const block = stmt.slice(stmt.indexOf('(values'), stmt.indexOf(') as g(slug'));
      expect(block.length).toBeGreaterThan(100);
      return [...block.matchAll(TRIPLE)].map((m) => ({ slug: m[1], old: m[2], next: m[3] }));
    });

    expect(rows.map((r) => r.slug)).toEqual(ALL);
    expect(new Set(rows.map((r) => r.next)).size).toBe(12);

    for (const row of rows) {
      // The guard names a string this round removes, the replacement never does.
      expect(DEFECTS).toContain(row.old);
      expect(DEFECTS).not.toContain(row.next);
      expect(row.next.length).toBeGreaterThan(20);
    }
  });

  it('asserts the seven kept identifiers by their exact values', () => {
    for (const [slug, qid] of KEPT_QIDS) {
      expect(verify).toContain(`('${slug}','${qid}')`);
    }
    expect(verify).toMatch(/expected 7 kept identifiers/);
  });

  it('keys P1 on the defect rather than on this file own wording', () => {
    const p1 = verify.slice(0, verify.indexOf('round 20 P2'));
    expect(p1).toMatch(/not in \(/);
    for (const defect of DEFECTS) expect(p1).toContain(defect);
    expect(p1).toMatch(/if v_bad <> 12 then/);
    // Calls the real predicate instead of restating its OR.
    expect(p1).toMatch(/public\.tag_has_prose\(t\.description, t\.short_description\)/);
    expect(verify).not.toMatch(/coalesce\(nullif\(btrim\(/);
  });

  it('enforces the two refusals rather than only recording them', () => {
    for (const slug of REFUSED) {
      expect(verify).toContain(`'${slug}'`);
      expect(groupAStmt).not.toContain(`('${slug}'`);
      expect(groupBStmt).not.toContain(`('${slug}'`);
    }
    expect(verify).toMatch(/refused rows were modified/);
  });

  it('requires the control rows to survive with their bodies', () => {
    const p6 = verify.slice(verify.indexOf('round 20 P5') + 1, verify.indexOf('round 20 P7'));
    expect(p6.length).toBeGreaterThan(200);
    for (const slug of CONTROLS) expect(p6).toContain(`'${slug}'`);
    expect(verify).toMatch(/control rows damaged/);
    expect(verify).toMatch(/t\.long_description is null/);
  });

  it('snapshots every control and refusal, so P5 and P6 cannot go vacuous', () => {
    // P5 and P6 both JOIN `_r20_before`. A slug missing from the snapshot makes
    // that join empty for it, and the postcondition silently stops covering it
    // while still naming it — so the snapshot list is load-bearing and is
    // asserted separately from the checks that read it. A mutation that dropped
    // two controls from this list SURVIVED the first mutation round for exactly
    // this reason.
    const snapshot = statements.slice(
      statements.indexOf('create temporary table _r20_before'),
      statements.indexOf('update public.unified_tags'),
    );
    expect(snapshot.length).toBeGreaterThan(200);
    for (const slug of [...ALL, ...REFUSED, ...CONTROLS]) {
      expect(snapshot).toContain(`'${slug}'`);
    }
  });

  it('declares an attributed actor', () => {
    // 8 of the 12 rows are human_reviewed and `bbc` is also is_sensitive, so
    // log_unified_tag_change() refuses an undeclared write outright.
    expect(statements).toMatch(
      /set_config\('app\.actor', 'migration:99991791015924_tag_prose_generic_sense_reachable', true\)/,
    );
  });

  it('cannot have its postconditions neutered', () => {
    expect(verify).not.toMatch(/\bfalse\b/);
    expect(verify).not.toMatch(/where\s+false/);
    // No pre-seeded counter: `v_bad int;`, never `v_bad int := 0;`.
    expect(verify).toMatch(/v_bad\s+int;/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/);
    expect(verify).not.toMatch(/v_txt\s+text\s*:=/);
    // Every postcondition reads the live table.
    expect(verify.match(/public\.unified_tags/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    // Seven numbered postconditions, each with an exact comparison.
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(verify).toContain(`round 20 P${n}`);
    expect(verify.match(/if v_bad <> \d+ then/g)).toHaveLength(5);
  });

  it('scopes each postcondition to the rows it is about', () => {
    // An exact comparison is not enough on its own: narrowing a postcondition's
    // slug list leaves the count, the message and the `<>` intact while the
    // check stops covering the other rows. A mutation that cut P7 down to one
    // slug SURVIVED the first mutation round for exactly this reason.
    const block = (from: string, to: string) => {
      const a = verify.indexOf(from);
      const b = to === '' ? verify.length : verify.indexOf(to);
      expect(a).toBeGreaterThan(-1);
      expect(b).toBeGreaterThan(a);
      return verify.slice(a, b);
    };

    // P1 judges all twelve; P7 removes all twelve bodies.
    const p1 = block('select count(*) into v_bad', 'round 20 P2');
    const p7 = block('round 20 P6', '');
    for (const slug of ALL) {
      expect(p1).toContain(`'${slug}'`);
      expect(p7).toContain(`'${slug}'`);
    }

    // P2 clears exactly the five group-A identifiers — no more, no fewer. The
    // upper bound is P2's OWN message, not P3's: P3's query sits before its
    // message and legitimately names every group-B slug, so bounding on
    // 'round 20 P3' made this assertion fail against correct code.
    const p2 = block('round 20 P1', 'round 20 P2');
    for (const slug of GROUP_A) expect(p2).toContain(`'${slug}'`);
    for (const slug of GROUP_B) expect(p2).not.toContain(`'${slug}'`);
  });

  it('snapshots the columns it promises not to touch', () => {
    expect(statements).toMatch(/create temporary table _r20_before/);
    expect(statements).toMatch(/on commit drop/);
    expect(statements).toMatch(/select slug, description, wikidata_id, short_description/);
    expect(verify).toMatch(/t\.description is distinct from b\.description/);
    expect(verify).toMatch(/had description changed as collateral/);
  });
});
