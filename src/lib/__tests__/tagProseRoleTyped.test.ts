import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 65000101100000 — the role-typed generic seam.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * without noticing:
 *
 * 1. `description` IS NEVER WRITTEN. It is the evidence every repair here
 *    rests on: the summary is wrong *because the row's own description types
 *    the tag as a role*. A pass that "tidied" the description too would
 *    destroy the only thing making the change defensible, and every other
 *    assertion would still pass. Note `short_description` contains the
 *    substring `description`, so the assertion is word-boundary anchored.
 *
 * 2. THE THREE LITERAL-REFERENT BODIES ARE NULLED AND THE TWO CORRECT ONES
 *    ARE NOT. `bunny` / `doll` / `meerkat` carried zoology and object
 *    encyclopedia on a role page; `edge-switch` and `lactation-play` carry
 *    correct bodies. Nulling a good body is the exact mirror of leaving a
 *    wrong one, so both directions are asserted.
 *
 * 3. THE TWO GROUPS STAY SEPARATE. Group A chooses that the tag is a ROLE,
 *    which the description already says. Group B chooses NOTHING — those four
 *    summaries said only that the term exists, and each replacement restates
 *    the row's own description. Merging them is how a later pass takes group
 *    A's licence and applies it to a row with no evidence.
 *
 * 4. THE POSTCONDITION TESTS FOR THE WRONG TEXT, not for this file's wording.
 *    That is what let 18 of 34 rows be cut from 60000301100000/100100, and
 *    two more from 64000101100000, when concurrent sessions repaired them
 *    first — without any of those files raising on main, where `db push`
 *    aborts on the first failing file and takes every migration behind it.
 *
 * Method note worth keeping: this tranche is the cohort FOUR earlier passes
 * deferred as unreachable. The deferral was right about some rows and wrong
 * about these, and the difference is the word `role` in the description —
 * "Cute animal role" types the tag, "Small mammal in Leporidae family" names
 * an animal, and reading those as two ways of saying rabbit is what hid it.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/65000101100000_tag_prose_role_typed_generic.sql',
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
 *  on a sentence is not defeated by where the line happens to wrap. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trimStart().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

/** SET clauses only — what is actually written. Anchoring a "must not contain"
 *  on the whole statement is wrong, because every UPDATE is content-guarded
 *  and therefore quotes the defect verbatim in its own WHERE. */
const setClauses = statements
  .split(/^update public\.unified_tags/m)
  .slice(1)
  .map((c) => (c.includes('where slug') ? c.slice(0, c.indexOf('where slug')) : c))
  .join('\n');

const GROUP_A = ['bunny', 'doll', 'meerkat', 'balloon', 'thrall'];
const GROUP_B = ['chauffeur', 'dawg', 'edge-switch', 'lactation-play'];
const BODY_NULLED = ['bunny', 'doll', 'meerkat'];
const BODY_KEPT = ['edge-switch', 'lactation-play'];

/** The exact strings the seam exists to remove. */
const DISOWNED = [
  'Small mammal in Leporidae family',
  'Model of a human or humanoid character',
  'Small mongoose species found in southern Africa',
  'Inflatable bag made of flexible material',
  'Historical Scandinavian slave or serf',
  'BDSM practice',
  'Lactation play is a form of erotic play',
];

describe('65000101100000 — the role-typed generic seam', () => {
  it('writes exactly the 9 rows it claims, and only those', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(9);
    expect(new Set(slugs)).toEqual(new Set([...GROUP_A, ...GROUP_B]));
  });

  it('never writes description — the evidence the repair rests on', () => {
    // `short_description` ends in the same word, so the boundary matters.
    expect(setClauses).not.toMatch(/(^|[^_\w])description\s*=\s*'/);
    expect(setClauses).toMatch(/short_description\s*=/);
  });

  it('nulls the three literal-referent bodies and keeps the two correct ones', () => {
    const nulls = [...statements.matchAll(/long_description\s*=\s*null/g)];
    expect(nulls).toHaveLength(3);
    for (const s of BODY_NULLED) {
      const stmt = statements.slice(statements.indexOf(`long_description  = null`));
      expect(stmt).toBeTruthy();
      expect(statements).toContain(`where slug = '${s}'`);
    }
    // The correct bodies must never be touched by a SET clause.
    for (const s of BODY_KEPT) {
      const block = statements
        .split(/^update public\.unified_tags/m)
        .find((c) => c.includes(`where slug = '${s}'`));
      expect(block).toBeDefined();
      expect(block).not.toContain('long_description');
    }
    // And the verify block asserts both directions.
    expect(verify).toContain('literal-referent body/bodies survive');
    expect(verify).toContain('correct body/bodies were destroyed');
  });

  it('guards every UPDATE on the defect still being present', () => {
    // Soft on preconditions: a human who fixes a row first keeps their work.
    const guards = [...statements.matchAll(/where slug = '[a-z-]+' and short_description = /g)];
    expect(guards).toHaveLength(9);
  });

  it('keeps group B free of any chosen sense', () => {
    expect(sql).toContain('THE SUMMARY STATES NOTHING A READER CAN USE');
    expect(prose).toContain('This group CHOOSES NO SENSE');
    for (const s of GROUP_B) expect(statements).toContain(`where slug = '${s}'`);
  });

  it('records that the word `role` in the description is the evidence', () => {
    // This is the whole finding: four passes deferred these rows as
    // unreachable, and an assertion that loses it invites a fifth deferral.
    expect(prose).toContain('THE GENERIC-SENSE COHORT WAS NOT UNREACHABLE');
    expect(prose).toContain('The word `role` in the description is the evidence');
  });

  it('records that the actor declaration is load-bearing on this tranche', () => {
    expect(statements).toContain("set_config('app.actor'");
    // Round four's tranche was the opposite case; each file must say which it
    // is in, or the next pass copies the wrong precedent.
    expect(sql).toContain('cannot be modified by system:trigger');
  });

  it('asserts the postcondition against the WRONG text, so a rival fix passes', () => {
    for (const d of DISOWNED) expect(verify).toContain(d);
  });

  it('counts the reached state positively, not the bad state', () => {
    // A check that only counts rows in a bad state returns zero for a slug
    // that has gone missing from the corpus, which soft preconditions allow.
    expect(verify).toMatch(/if v_bad <> 9 then/);
  });

  it('asserts nothing fell below the thin-page gate', () => {
    // This is what makes nulling the three bodies safe rather than assumed.
    expect(verify).toContain('tag_has_prose(description, short_description)');
    expect(verify).toContain('thin-page gate');
  });

  it('names what it deferred, and separates the two reasons', () => {
    // The old blanket label "the generic-sense cohort" hid two different
    // things; collapsing them again is how the next pass mis-defers.
    expect(prose).toContain('The description is ITSELF the generic sense');
    expect(prose).toContain('Under-reaching is the correct error');
    for (const s of ['wolf', 'knight', 'reynard', 'angel', 'butler', 'acolyte', 'pet']) {
      expect(prose).toContain(s);
    }
  });
});
