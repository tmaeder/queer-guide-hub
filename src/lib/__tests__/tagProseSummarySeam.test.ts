import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 64000101100000 — the SUMMARY seam of the disowned-prose backlog.
 *
 * WHAT THIS FILE EXISTS TO PRESERVE, each of which a later reader could undo
 * without noticing:
 *
 * 1. `description` IS NEVER WRITTEN. It is the evidence that justifies every
 *    repair here: the summary is wrong *because the row's own description says
 *    something else*. A pass that "tidied" the description too would destroy
 *    the only thing making the change defensible, and every other assertion
 *    would still pass. Note `short_description` contains the substring
 *    `description`, so the assertion has to be anchored on the word boundary.
 *
 * 2. NO BODY IS WRITTEN OR REMOVED. Fourteen of the fifteen seam rows have
 *    `long_description IS NULL`; the fifteenth (`masturbating`) has a correct
 *    body. Minting a body from a one-line description is the guess this whole
 *    class came from (the `queen` / `steer` rule), and silently nulling the one
 *    real body would be the mirror error.
 *
 * 3. THE TWO GROUPS STAY SEPARATE. Group A chooses a sense — the row's own
 *    description establishes it and the summary contradicts it. Group B chooses
 *    NOTHING: those seven summaries said only that the term exists
 *    ("Fluffing refers to various practices"), and each replacement restates
 *    the row's own description. Merging them into one count of fifteen is how a
 *    later pass takes group A's licence and applies it to a row with no
 *    evidence.
 *
 * 4. THE POSTCONDITION TESTS FOR THE WRONG TEXT, not for this file's wording.
 *    That is what let 18 of 34 rows be cut from 60000301100000/100100 when a
 *    concurrent session repaired them first, without either file raising on
 *    main — where `db push` aborts on the first failing file and takes every
 *    migration queued behind it.
 *
 * Method note worth keeping: this tranche was found by ordering the surviving
 * set on LEXICAL OVERLAP between a row's `description` and its published prose,
 * lowest first — a third ordering after usage (rounds two–five) and subject
 * (round seven). The ordering narrows what a human reads; it does not decide.
 * `chubby-chaser` and `intimate-partner-abuse` both score zero and are correct.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/64000101100000_tag_prose_summary_seam.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

/** Comment-stripped: the header quotes every defect it removes, so a raw-text
 *  assertion is satisfiable by the PROSE while the statement is gone. */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));

/** The header prose with its `--` markers stripped and whitespace collapsed, so
 *  an assertion on a sentence is not defeated by where the line happens to
 *  wrap. Asserting on raw text instead invites a regex that reaches across
 *  lines and matches something else. */
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trimStart().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');
const verify = bare.slice(bare.indexOf('do $verify$'));

/** SET clauses only — what is actually written. Anchoring a "must not contain"
 *  on the whole statement is wrong, because every UPDATE is content-guarded and
 *  therefore quotes the defect verbatim in its own WHERE. */
const setClauses = statements
  .split(/^update public\.unified_tags/m)
  .slice(1)
  .map((c) => (c.includes('where slug') ? c.slice(0, c.indexOf('where slug')) : c))
  .join('\n');

const GROUP_A = [
  'golden-retriever',
  'hussy',
  'paraboy',
  'androx',
  'under-consideration',
  'hand-feeding',
  'sword-play',
  'mama-bear',
];
const GROUP_B = ['medical-play', 'slutface', 'fluffing', 'shallowing', 'foot-play'];

/** The two seam rows a concurrent session (63000101171500, PR #3733) merged
 *  first. Their UPDATEs are deleted here rather than left to no-op, so this
 *  file does not claim rows it no longer writes — but they stay in SEAM,
 *  because the postconditions still cover the whole fifteen and must keep
 *  doing so: narrowing them to what this file writes is what turns a rival
 *  repair into a `db push` abort on main. */
const CEDED = ['vetted', 'masturbating'];
const SEAM = [...GROUP_A, ...GROUP_B, ...CEDED];

/** The exact strings the seam exists to remove. */
const DISOWNED = [
  'Scottish dog breed',
  'Derogatory term for a sex worker',
  'Term for a male-identified person',
  'Androx refers to a term related to male hormones',
  'Term introduced in 1968',
  'Feeding animals by hand',
  'Fencing and sword fighting',
  'LGBTQ+ term for a protective mother figure',
  "'medical play'",
  "'Vetted'",
  'A term with complex connotations',
  'Fluffing refers to various practices',
  'Shallowing refers to a sexual practice',
  'Refers to foot-related activities',
  'Masturbation discussion',
];

describe('64000101100000 — the disowned summary seam', () => {
  it('writes exactly the 13 rows it still claims, and only those', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(13);
    expect(new Set(slugs)).toEqual(new Set([...GROUP_A, ...GROUP_B]));
  });

  it('writes nothing for the rows ceded to the concurrent session', () => {
    // Leaving a guarded no-op behind would be harmless at run time and would
    // still misreport the file's scope to the next reader.
    for (const s of CEDED) expect(statements).not.toContain(`where slug = '${s}'`);
  });

  it('still covers the whole 15-row seam in its postconditions', () => {
    // The seam is fifteen rows whoever repaired them. A postcondition narrowed
    // to this file's own writes stops catching a regression in the other half.
    for (const s of CEDED) expect(verify).toContain(s);
    expect(SEAM).toHaveLength(15);
  });

  it('never writes description — the evidence the repair rests on', () => {
    // `short_description` ends in the same word, so the boundary matters.
    expect(setClauses).not.toMatch(/(^|[^_\w])description\s*=/);
    expect(setClauses).toMatch(/short_description\s*=/);
  });

  it('writes no body and removes none', () => {
    expect(setClauses).not.toContain('long_description');
    // The one row here that has a body is asserted to still have it.
    expect(verify).toContain('masturbating');
    expect(verify).toContain('lost its body');
  });

  it('guards every UPDATE on the defect still being present', () => {
    // Soft on preconditions: a human who fixes a row first keeps their work.
    const guards = [...statements.matchAll(/where slug = '[a-z-]+' and short_description = /g)];
    expect(guards).toHaveLength(13);
  });

  it('keeps group B free of any chosen sense', () => {
    // Group B's replacements restate the row's own description. The header is
    // the only place that distinction is recorded, so it is asserted here.
    expect(sql).toContain('THE SUMMARY STATES NOTHING A READER CAN USE');
    expect(sql).toContain('This group chooses no sense');
    for (const s of GROUP_B) expect(statements).toContain(`where slug = '${s}'`);
  });

  it('records that the actor declaration is load-bearing on this tranche', () => {
    expect(statements).toContain("set_config('app.actor'");
    // Round four's tranche was the opposite case; each file must say which it
    // is in, or the next pass copies the wrong precedent.
    expect(sql).toContain('cannot be modified by system:trigger');
  });

  it('asserts the postcondition against the WRONG text, so a rival fix passes', () => {
    for (const d of DISOWNED) expect(verify).toContain(d.replace(/^'|'$/g, ''));
  });

  it('counts the reached state positively, not the bad state', () => {
    // A check that only counts rows in a bad state returns zero for a slug that
    // has gone missing from the corpus, which the soft preconditions allow.
    expect(verify).toMatch(/if v_bad <> 15 then/);
  });

  it('asserts nothing fell below the thin-page gate', () => {
    expect(verify).toContain('tag_has_prose(description, short_description)');
    expect(verify).toContain('thin-page gate');
  });

  it('names what it deferred, with the reason each cannot be reached', () => {
    for (const s of ['warrior-princess', 'feeder', 'chubby-chaser', 'sacred-play']) {
      expect(sql).toContain(s);
    }
    expect(prose).toContain('Under-reaching is the correct error');
  });
});
