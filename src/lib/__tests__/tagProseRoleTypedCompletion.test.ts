import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 74500101100000 — the role-typed seam, completed.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * without noticing:
 *
 * 1. `description` IS NEVER WRITTEN. It is the evidence every repair here
 *    rests on: the summary is wrong *because the row's own description types
 *    the tag as a role*. A pass that "tidied" the description too would
 *    destroy the only thing making the change defensible, and every other
 *    assertion would still pass. `short_description` ends in the same word, so
 *    the assertion is boundary-anchored.
 *
 * 2. SEVENTEEN LITERAL-REFERENT BODIES ARE NULLED AND THE CONTROL ROWS KEEP
 *    THEIRS. Nulling a correct body is the exact mirror of leaving a wrong
 *    one. Every row this file nulls has its body replaced by nothing rather
 *    than by invented prose, and two rows in the same backlog that carry real
 *    hand-written bodies (`aftercare`, `chosen-family`) are asserted untouched
 *    — without that, "the bodies are gone" is satisfied by a sweep that took
 *    everything.
 *
 * 3. THE REVERSAL IS RECORDED WITH ITS EVIDENCE. Round nine deferred `angel`,
 *    `acolyte` and `butler` on the test "is the REFERENT correctly named".
 *    This file repairs them, and the justification is not a re-reading of the
 *    same rows — it is the wider cohort, where `lamb` ("Young sheep or sheep
 *    meat") and `butler` ("Domestic worker in a large household") fail
 *    identically. An assertion that loses that invites the split being redrawn
 *    in the same wrong place.
 *
 * 4. THE POSTCONDITION TESTS FOR THE WRONG TEXT, not for this file's wording,
 *    and counts the reached state POSITIVELY. That is what let 18 of 34 rows
 *    be cut from 60000301100000/100100 and two more from 64000101100000 when
 *    concurrent sessions repaired them first, without any of those files
 *    raising on main — where `db push` aborts on the first failing file and
 *    takes every migration queued behind it.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/74500101100000_tag_prose_role_typed_seam_completion.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

/** Comment-stripped: the header quotes every defect it removes, so a raw-text
 *  assertion is satisfiable by the PROSE while the statement is gone. */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/** The header prose, `--` stripped and whitespace collapsed, so an assertion
 *  on a sentence is not defeated by where the line happens to wrap. Round nine
 *  recorded a mutation that first read as a survivor for exactly that reason. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trimStart().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/** SET clauses only — what is actually written. Anchoring a "must not contain"
 *  on the whole statement is wrong, because every UPDATE is content-guarded
 *  and therefore quotes the defect verbatim in its own WHERE. */
const blocks = statements.split(/^update public\.unified_tags/m).slice(1);
const blockFor = (slug: string) => blocks.find((b) => b.includes(`where slug = '${slug}'`));
const setClauses = blocks
  .map((c) => (c.includes('where slug') ? c.slice(0, c.indexOf('where slug')) : c))
  .join('\n');

const GROUP_A1 = [
  'beast',
  'catboy',
  'catgirl',
  'cousin',
  'dragon',
  'duck',
  'feral',
  'lamb',
  'panda',
  'tiger',
  'pet',
  'angel',
  'acolyte',
  'butler',
];
const GROUP_A2 = ['guru', 'pharaoh', 'huntress'];
const GROUP_A3 = ['frog', 'goat', 'strawberry'];
const ALL = [...GROUP_A1, ...GROUP_A2, ...GROUP_A3];

/** The three rows that carry no body at all — they must not gain a SET on it. */
const NO_BODY = ['beast', 'guru', 'pharaoh'];
/** Rows outside this pass whose correct bodies prove it did not over-reach. */
const CONTROLS = ['aftercare', 'chosen-family'];

/** The exact strings the seam exists to remove. */
const DISOWNED = [
  'Mythical or fictional creature',
  'Cat with human-like traits',
  'Feline-human hybrid character',
  "Child of a parent''s sibling",
  'Mythical creature in folklore',
  'Waterfowl in the family Anatidae',
  'Relating to domesticated species living in the wild',
  'Young sheep or sheep meat',
  'Bear species native to China',
  'Large cat native to Asia',
  'Pets and animals',
  'Spiritual or supernatural entity',
  'Assistant in religious services',
  'Domestic worker in a large household',
  'American rapper and term for mentor or guide',
  'Term for ancient Egyptian monarchs',
  'Person who hunts wildlife or feral animals',
];

describe('74500101100000 — the role-typed seam, completed', () => {
  it('writes exactly the 20 rows it claims, and only those', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(20);
    expect(new Set(slugs)).toEqual(new Set(ALL));
  });

  it('never writes description — the evidence the repair rests on', () => {
    expect(setClauses).not.toMatch(/(^|[^_\w])description\s*=\s*'/);
    expect(setClauses).toMatch(/short_description\s*=/);
  });

  it('nulls seventeen literal-referent bodies and leaves the bodiless rows alone', () => {
    expect([...statements.matchAll(/long_description\s*=\s*null/g)]).toHaveLength(17);
    // A row that already carries no body must not gain a SET on that column:
    // writing null where null already sits is a no-op that misreports the diff.
    for (const s of NO_BODY) {
      const block = blockFor(s);
      expect(block).toBeDefined();
      expect(block).not.toContain('long_description');
    }
    expect(verify).toContain('literal-referent body/bodies survive');
  });

  it('asserts the control rows keep their correct bodies', () => {
    // The mirror of assertion 3. Without it, a sweep that nulled every body in
    // the corpus would satisfy "the seventeen are gone".
    for (const s of CONTROLS) expect(verify).toContain(s);
    expect(verify).toContain('control row(s) lost a correct body');
    // And the controls are never themselves written by this file.
    for (const s of CONTROLS) expect(statements).not.toContain(`where slug = '${s}'`);
  });

  it('guards every UPDATE on the defect still being present', () => {
    // Soft on preconditions: a human — or a concurrent session — who fixes a
    // row first keeps their work, and this file no-ops instead of aborting.
    const summaryGuards = [
      ...statements.matchAll(/where slug = '[a-z-]+' and short_description = /g),
    ];
    const emptyGuards = [
      ...statements.matchAll(/where slug = '[a-z-]+' and coalesce\(short_description, ''\) = ''/g),
    ];
    expect(summaryGuards).toHaveLength(17);
    expect(emptyGuards).toHaveLength(3);
    // The three NULL-summary rows are additionally guarded on the body they
    // are about to remove, so a row whose body someone already replaced is not
    // silently emptied.
    for (const s of GROUP_A3) expect(blockFor(s)).toContain('long_description like');
  });

  it('keeps the three groups separate and labelled', () => {
    expect(sql).toContain('GROUP A1');
    expect(sql).toContain('GROUP A2');
    expect(sql).toContain('GROUP A3');
    // A3 fills a NULL summary rather than replacing prose, which is a weaker
    // act than A1's; merging the labels is how a later pass takes the stronger
    // licence for the weaker case.
    expect(prose).toContain('Filling a NULL summary from the row');
  });

  it('records the reversal of round nine’s split, with the evidence for it', () => {
    expect(prose).toContain('DOES THE SUMMARY SAY THIS IS A ROLE?');
    // The evidence is the pair, not an opinion: both name their referent
    // correctly and neither says the tag is a role.
    expect(prose).toContain('Young sheep or sheep meat');
    expect(prose).toContain('Domestic worker in a large household');
    for (const s of ['angel', 'acolyte', 'butler']) expect(prose).toContain(s);
  });

  it('records that the actor declaration is load-bearing on this tranche', () => {
    expect(statements).toContain("set_config('app.actor'");
    // Round four's tranche was the opposite case; each file must say which it
    // is in, or the next pass copies the wrong precedent.
    expect(sql).toContain('cannot be modified by system:trigger');
  });

  it('settles `pet` by measurement rather than judgement', () => {
    // Round nine deferred it as two senses at once. Zero live assignments is
    // what makes the pet-friendly-travel body safe to remove.
    expect(prose).toContain('ZERO live rows in');
  });

  it('asserts the postcondition against the WRONG text, so a rival fix passes', () => {
    for (const d of DISOWNED) expect(verify).toContain(d);
  });

  it('counts the reached state positively, not the bad state', () => {
    // A check that only counts rows in a bad state returns zero for a slug
    // that has gone missing from the corpus, which soft preconditions allow.
    expect(verify).toMatch(/if v_bad <> 20 then/);
    expect(verify).toMatch(/short_description ~\* '\(\^\|\[\^a-z\]\)role/);
  });

  it('asserts nothing fell below the thin-page gate', () => {
    // This is what makes nulling seventeen bodies safe rather than assumed.
    expect(prose).toContain('tag_has_prose(description, short_description)');
    expect(verify).toContain('thin-page gate');
  });

  it('names what it deferred, and gives each its own reason', () => {
    expect(prose).toContain('description is ITSELF the generic sense');
    expect(prose).toContain('Under-reaching is the correct error');
    // `bimbo` is deferred for a DIFFERENT reason than the rest — gendering, not
    // subject — and collapsing the reasons is how the next pass mis-defers.
    expect(prose).toContain('the defect here is GENDERING, not subject');
    for (const s of ['wolf', 'knight', 'reynard', 'parent', 'diva', 'bootblack']) {
      expect(prose).toContain(s);
    }
  });
});
