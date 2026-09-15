import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 76000101100000 — one summary stamped across a family.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE:
 *
 * 1. `description` IS NEVER WRITTEN. It is the evidence: the shared summary is
 *    wrong *because each row's own description supplies what it erased*.
 *
 * 2. THE WRONG-ENTITY HALF IS NULLED, NEVER REPOINTED. `futch` and `crumbs`
 *    carry Drosophila protein QIDs. `tag_medical_codes_sync` and
 *    `tag_wikidata_hierarchy` rebuild from that column weekly, so a
 *    plausible-but-wrong identifier regenerates wrong data forever while a null
 *    one regenerates nothing.
 *
 * 3. NOTHING IS WRITTEN TO `tag_wikidata_repair_audit`. That table is the INPUT
 *    to `tag_disowned_prose_signals()`, so a row there would perturb a live
 *    metric to record what this file already records.
 *
 * 4. THE CORRECT MEMBER OF A FAMILY IS LEFT ALONE. `sadist`'s summary is right
 *    for the unqualified term; the three qualified rows are what collide with
 *    it. An assertion that only checked "the family no longer shares a string"
 *    would be satisfied by rewriting the one row that was already correct.
 *
 * 5. THE POSITIVE POSTCONDITION IS `count(distinct short_description) = 20`,
 *    which states the file's purpose directly rather than counting rows in a
 *    bad state — a count that returns a reassuring zero for a slug that has
 *    gone missing from the corpus, which the soft guards allow.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/76000101100000_tag_prose_one_summary_many_rows.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/** Header prose, whitespace collapsed — a phrase that wraps across two comment
 *  lines is invisible to a single-line pattern, a trap recorded eight times. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trimStart().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

const blocks = statements.split(/^update public\.unified_tags/m).slice(1);
const blockFor = (slug: string) => blocks.find((b) => b.includes(`where slug = '${slug}'`));
const setClauses = blocks
  .map((c) => (c.includes('where slug') ? c.slice(0, c.indexOf('where slug')) : c))
  .join('\n');

const GROUP_A = ['futch', 'crumbs'];
const GROUP_B = ['foot-bottom', 'sensation-bottom'];
const GROUP_C = [
  'masochist',
  'algolagnia',
  'algophilia',
  'dominant-sadist',
  'sensual-sadist',
  'sexual-sadist',
  'latex-kitten',
  'pig',
  'puppyboy',
  'fairy-kink-mother',
  'leather-mommy',
  'boyflux',
  'girlflux',
  'glitchgender',
  'pupgender',
  'versandrogyne',
];
const ALL = [...GROUP_A, ...GROUP_B, ...GROUP_C];
const BODY_NULLED = [...GROUP_A, ...GROUP_B];
const CONTROLS = ['sadist', 'priest', 'priestess', 'latex-princess'];

/** The strings that were stamped across families. */
const SHARED = [
  'Protein found in Drosophila melanogaster',
  'A term for the receptive partner in anal sex',
  'Deriving pleasure from pain or humiliation',
  'Individual who derives pleasure from inflicting pain',
  'Latex fashion enthusiast',
  'A term in some LGBTQ+ communities',
  'A term of endearment in some LGBTQ+ communities',
  'A non-binary gender identity',
];

describe('76000101100000 — one summary stamped across a family', () => {
  it('writes exactly the 20 rows it claims, and only those', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(20);
    expect(new Set(slugs)).toEqual(new Set(ALL));
  });

  it('never writes description — the evidence the repair rests on', () => {
    expect(setClauses).not.toMatch(/(^|[^_\w])description\s*=\s*'/);
    expect(setClauses).toMatch(/short_description\s*=/);
  });

  it('nulls the Drosophila identifiers and never repoints them', () => {
    for (const s of GROUP_A) {
      const block = blockFor(s);
      expect(block).toContain('wikidata_id       = null');
      // A repointed identifier regenerates wrong data every week.
      expect(block).not.toMatch(/wikidata_id\s*=\s*'Q/);
    }
    expect([...statements.matchAll(/wikidata_id\s*=\s*null/g)]).toHaveLength(2);
    expect(verify).toContain('still carry the Drosophila identifier');
    // Both were resolved live, and the near-miss is the whole point.
    expect(prose).toContain('Futsch Dmel_CG34387');
    expect(prose).toContain('one letter apart');
  });

  it('writes nothing to tag_wikidata_repair_audit', () => {
    // That table is the INPUT to tag_disowned_prose_signals(); a row there
    // would perturb the metric this work is measured by.
    expect(statements).not.toContain('tag_wikidata_repair_audit');
    expect(prose).toContain('Check what consumes a table before writing to it.');
  });

  it('nulls exactly the four wrong bodies', () => {
    expect([...statements.matchAll(/long_description\s*=\s*null/g)]).toHaveLength(4);
    for (const s of BODY_NULLED) expect(blockFor(s)).toContain('long_description');
    for (const s of GROUP_C) expect(blockFor(s)).not.toContain('long_description');
    expect(verify).toContain('wrong body/bodies survive');
  });

  it('leaves the correct member of the sadist family alone, and asserts it', () => {
    expect(statements).not.toContain("where slug = 'sadist'");
    expect(verify).toContain('the correct member of the sadist family was rewritten');
    for (const s of CONTROLS) expect(verify).toContain(s);
  });

  it('guards every UPDATE on the shared summary still being present', () => {
    const guards = [...statements.matchAll(/where slug = '[a-z-]+' and short_description = /g)];
    expect(guards).toHaveLength(20);
  });

  it('states the reached state as distinctness, which is the file’s purpose', () => {
    expect(verify).toMatch(/count\(distinct short_description\) into v_bad/);
    expect(verify).toMatch(/if v_bad <> 20 then/);
  });

  it('keeps every postcondition CONDITION strict, not just its message', () => {
    // Mutation-testing found this gap: neutering `if v_bad <> 0` to
    // `if v_bad < 0` leaves the RAISE text, the slug list and the string list
    // all intact, so every assertion anchored on those still passed while the
    // check had stopped checking. This is the trap 60000101160000 recorded —
    // assert the CONDITION, not the needle inside it. Seven postconditions:
    // six that must find nothing, and the distinctness count.
    expect([...verify.matchAll(/if v_bad <> 0 then/g)]).toHaveLength(6);
    expect([...verify.matchAll(/if v_bad <> 20 then/g)]).toHaveLength(1);
    // And no loosened comparison anywhere in the block.
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
  });

  it('calls the real thin-page function instead of re-implementing it', () => {
    expect(verify).toContain('public.tag_has_prose(description, short_description)');
  });

  it('scopes the "shared summary gone" check to its own rows', () => {
    // The strings legitimately survive elsewhere — `sadist` keeps one on
    // purpose — so a corpus-wide zero check would be wrong here and would
    // force the correct row to be rewritten to satisfy it.
    for (const s of SHARED) expect(verify).toContain(s);
    // Scope the assertion to postcondition 1 ITSELF. A bare search of the whole
    // verify block finds the slug list of a LATER postcondition and passes
    // against a check that was widened corpus-wide — which would RAISE on
    // apply, because `sadist` legitimately keeps its string, and abort `db
    // push` for the whole repo. Anchor on the half of the statement the
    // assertion is about.
    const p1 = verify.slice(0, verify.indexOf('still carry the shared summary'));
    const scope = p1.slice(p1.lastIndexOf('select count(*) into v_bad'));
    expect(scope).toContain('where slug in (');
    expect(scope).toContain("'versandrogyne'");
    expect(scope.indexOf('where slug in (')).toBeLessThan(scope.indexOf('short_description in ('));
  });

  it('records the split between a prose defect and a duplicate-tag problem', () => {
    // Most shared summaries are two names for one concept, which is a merge
    // question. Losing that distinction invites a pass that rewrites one side
    // of a duplicate pair to make them look different.
    expect(prose).toContain('THE RESULT SPLITS IN TWO');
    expect(prose).toContain('DUPLICATE-TAG problem for a merge pass');
    for (const s of ['marriage', 'apparel', 'educator']) expect(prose).toContain(s);
  });

  it('records that the metric is narrower than the defect', () => {
    // Only 3 of the 20 sit inside tag_disowned_prose_signals()'s set. Quoting a
    // 20-row drop against it would be wrong.
    expect(prose).toContain('the METRIC is narrower than the defect');
    expect(prose).toContain('will fall by 3, not by 20');
  });

  it('records that the mojibake in a description is left alone', () => {
    expect(prose).toContain('this series never writes that column');
  });

  it('records that the actor declaration is load-bearing', () => {
    expect(statements).toContain("set_config('app.actor'");
    expect(prose).toContain('all 20 rows are `human_reviewed`');
  });
});
