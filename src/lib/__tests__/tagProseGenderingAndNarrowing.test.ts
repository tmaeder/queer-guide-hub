import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 79000101100000 — round fourteen, the GENDERING class.
 *
 * Round ten found this class, named it, and deliberately sent it to a pass with
 * its siblings: `bimbo` was deferred because "the defect there is GENDERING,
 * not subject". This file is that pass. The concept on each row is right and
 * the prose writes most of the audience out of their own glossary entry — the
 * femme / man / drag-show / masc / crotch-rope class.
 *
 * What this test exists to preserve, in order of how easily a later edit
 * breaks it:
 *
 *  - `description` IS NEVER WRITTEN. It is the evidence that justifies every
 *    repair here; a pass that rewrites it can make any summary "correct".
 *  - THE BODY DISCIPLINE. The body is touched in exactly two ways: nulled
 *    where it is the wrong subject or restates the gendered claim, or altered
 *    by an exact-phrase `replace()` for an anatomical mis-gendering. No body is
 *    authored. A `replace()` cannot invent prose, which is what keeps every
 *    other sentence byte-identical by construction rather than by retyping.
 *  - THE MIRROR CONTROL. "the sixteen bodies are gone" is equally satisfied by
 *    a sweep that took everything, so five bodies are asserted to SURVIVE —
 *    `yoni-massage`'s especially, which is careful correct prose whose only
 *    fault was in the summary above it.
 *  - ROUND THIRTEEN'S REFUSAL. Sixteen body nulls are exactly the shape that
 *    could quietly take a protected row with them, so the eight
 *    content-bearing rows of the refused register cohort are re-asserted here.
 *  - THE DEFERRED ROWS STAY DEFERRED. `milkmaid` and `satyress` carry gender in
 *    their own names, `titica`'s description is contaminated, `zaddy`'s is
 *    truncated mid-sentence, `wolf` and `knight` have a description that IS the
 *    generic sense. Asserting they are untouched is what lets a later reader
 *    tell a deliberate refusal from a row nobody reached.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/79000101100000_tag_prose_gendering_and_narrowing.sql',
);
const sql = readFileSync(MIGRATION, 'utf8');

// Comment-stripped, because a long explanatory header makes a text-based guard
// satisfiable by the prose while the statement it describes is gone.
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));
const prose = sql
  .split('\n')
  .filter((l) => l.trimStart().startsWith('--'))
  .map((l) => l.trimStart().replace(/^--\s?/, ''))
  .join(' ')
  .replace(/\s+/g, ' ');

const ALL_22 = [
  'bimbo',
  'brat-queen',
  'slutty-princess',
  'submissive-mommy',
  'submissive-sister',
  'switchtress',
  'damsel-in-distress',
  'fembot',
  'primal-daddy',
  'diva',
  'sir',
  'masculinization',
  'cock-and-ball-torture',
  'yoni-massage',
  'cock-worshipper',
  'daddy',
  'babydoll',
  'housewife',
  'hot-aunty',
  'little-goddess',
  'unicorn',
  'gender-variance',
];

const BODIES_NULLED = [
  'brat-queen',
  'slutty-princess',
  'submissive-mommy',
  'submissive-sister',
  'switchtress',
  'damsel-in-distress',
  'fembot',
  'primal-daddy',
  'sir',
  'masculinization',
  'daddy',
  'babydoll',
  'housewife',
  'hot-aunty',
  'little-goddess',
  'unicorn',
];

const BODIES_KEPT = ['bimbo', 'yoni-massage', 'gender-variance'];

describe('79000101100000 — round fourteen, the gendering class', () => {
  it('declares an actor, which is load-bearing on 21 human_reviewed rows', () => {
    expect(statements).toMatch(
      /set_config\(\s*'app\.actor'\s*,\s*'admin:tag-prose-gendering-and-narrowing'\s*,\s*true\s*\)/,
    );
  });

  it('repairs all 22 rows', () => {
    for (const slug of ALL_22) {
      expect(statements, `missing UPDATE for ${slug}`).toMatch(
        new RegExp(`where slug = '${slug}'`),
      );
    }
  });

  it('NEVER writes description — it is the evidence the whole class rests on', () => {
    // Scoped to SET clauses: every UPDATE quotes the defect in its own WHERE
    // guard, so a bare "must not contain" over the file is vacuous.
    const setClauses = statements.match(/set\s+[\s\S]*?\swhere\s/g) ?? [];
    expect(setClauses.length).toBe(22);
    for (const clause of setClauses) {
      expect(clause).not.toMatch(/(^|\s)description\s*=/);
    }
  });

  it('writes short_description on every row', () => {
    const setClauses = statements.match(/set\s+[\s\S]*?\swhere\s/g) ?? [];
    for (const clause of setClauses) {
      expect(clause).toMatch(/short_description\s*=/);
    }
  });

  it('content-guards every UPDATE on the defect text, so a rival repair no-ops', () => {
    const updates = statements.split('update public.unified_tags').slice(1);
    expect(updates.length).toBe(22);
    for (const u of updates) {
      const where = u.slice(u.indexOf('where'));
      expect(where).toMatch(/and short_description = '/);
    }
  });

  it('nulls exactly the 16 bodies that are the wrong subject or restate the gendered claim', () => {
    const updates = statements.split('update public.unified_tags').slice(1);
    const nulled = updates
      .filter((u) => /long_description\s*=\s*null/.test(u.slice(0, u.indexOf('where'))))
      .map((u) => /where slug = '([a-z-]+)'/.exec(u)?.[1]);
    expect(nulled.sort()).toEqual([...BODIES_NULLED].sort());
  });

  it('does NOT null the bodies that must survive — the mirror of leaving a wrong one', () => {
    const updates = statements.split('update public.unified_tags').slice(1);
    for (const slug of BODIES_KEPT) {
      const u = updates.find((x) => new RegExp(`where slug = '${slug}'`).test(x));
      expect(u, `no UPDATE for ${slug}`).toBeTruthy();
      expect(u!.slice(0, u!.indexOf('where'))).not.toMatch(/long_description\s*=\s*null/);
    }
  });

  it('repairs anatomy by exact-phrase replace(), never by writing a body', () => {
    const updates = statements.split('update public.unified_tags').slice(1);
    for (const [slug, from, to] of [
      ['cock-and-ball-torture', 'the male genitals', 'the penis and testicles'],
      ['cock-worshipper', 'male genitalia', 'penises'],
    ] as const) {
      const u = updates.find((x) => new RegExp(`where slug = '${slug}'`).test(x))!;
      const setClause = u.slice(0, u.indexOf('where'));
      expect(setClause).toContain(
        `long_description  = replace(long_description, '${from}', '${to}')`,
      );
      // A literal body assignment here would be authoring prose.
      expect(setClause).not.toMatch(/long_description\s*=\s*'/);
    }
  });

  it('re-asserts round thirteen’s refusal — 16 body nulls could take a protected row', () => {
    for (const slug of [
      'rape-play',
      'piss-drinker',
      'hiv-transmission',
      'water-bondage',
      'electrostimulation',
      'morosexual',
      'latino',
      'alloromantic',
    ]) {
      expect(verify).toContain(`'${slug}'`);
    }
    expect(verify).toMatch(
      /it\(''s\| is\) \(essential\|important\) to \(prioritize\|remember\|note\|understand\)/,
    );
    expect(verify).toMatch(/if v_bad <> 8 then/);
  });

  it('asserts the deferred rows are untouched, so a refusal reads as a refusal', () => {
    for (const slug of ['milkmaid', 'satyress', 'titica', 'zaddy', 'wolf', 'knight']) {
      expect(verify).toContain(`slug = '${slug}'`);
    }
    expect(verify).toMatch(/if v_bad <> 6 then/);
  });

  it('counts the REACHED state positively, not rows in a bad state', () => {
    // Counting rows in a bad state returns a reassuring zero for a slug that
    // has gone missing from the corpus entirely.
    expect(verify).toMatch(/if v_bad <> 22 then/);
    expect(verify).toMatch(/public\.tag_has_prose\(description, short_description\)/);
    // Calls the real predicate rather than restating it: the thin-page gate is
    // an OR, and a hand-rolled "both present" form fails on a null description.
    expect(verify).not.toMatch(/description is not null\s+and\s+short_description is not null/);
  });

  it('lets no postcondition be short-circuited into counting nothing', () => {
    // Found by mutation: `where false and slug in (...)` leaves the slug list,
    // the regex and the `if v_bad <> 8` all intact, so every string-anchored
    // assertion stays green while the check has stopped counting. Anchoring on
    // the condition is not enough when the PREDICATE can be neutered instead.
    expect(verify).not.toMatch(/\bfalse\b/);
    expect(verify).not.toMatch(/select\s+\d+\s+into\s+v_bad/);
    // Every postcondition must actually read the table it claims to check.
    expect([...verify.matchAll(/from public\.unified_tags/g)]).toHaveLength(8);
  });

  it('keeps every postcondition CONDITION strict, not just its message', () => {
    // Neutering `if v_bad <> 0` to `if v_bad < 0` leaves every string-anchored
    // assertion green while the check has stopped checking.
    expect([...verify.matchAll(/if v_bad <> 0 then/g)]).toHaveLength(3);
    expect([...verify.matchAll(/if v_bad <> 22 then/g)]).toHaveLength(2);
    expect([...verify.matchAll(/if v_bad <> 7 then/g)]).toHaveLength(1);
    expect([...verify.matchAll(/if v_bad <> 8 then/g)]).toHaveLength(1);
    expect([...verify.matchAll(/if v_bad <> 6 then/g)]).toHaveLength(1);
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
  });

  it('asserts the surviving bodies by count, including two rows outside the pass', () => {
    expect(verify).toContain("'aftercare','chosen-family'");
    expect(verify).toMatch(/if v_bad <> 7 then/);
  });

  it('records why the regex-matched rows it refused were refused', () => {
    expect(prose).toMatch(/cuckoldress/);
    expect(prose).toMatch(/gender is the term'?s own content/i);
    expect(prose).toMatch(/under-reaching is the correct error/i);
  });

  it('records that unicorn was reachable only because a later rule exists', () => {
    expect(prose).toMatch(/A deferral is a claim about the data and decays like any other/i);
  });
});
