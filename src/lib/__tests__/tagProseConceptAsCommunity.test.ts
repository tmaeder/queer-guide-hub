import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99950101100000 — round sixteen, THE CONCEPT PUBLISHED AS A COMMUNITY.
 *
 * The axis: the row's own `description` defines a TERM — a person-type, a
 * behaviour, an orientation — while the published prose reframes it as a
 * COMMUNITY, a PLACE or a TAG. It is round nine's role-typing one step out.
 *
 * This round is NOT a slice of the disowned-prose backlog and the file must
 * keep saying so: all thirteen rows carry no `wikidata_id` and no
 * `tag_wikidata_repair_audit` row, so `tag_disowned_prose_signals()` is blind
 * to them and its counts do not move. Quoting a movement there would be the
 * flattering number.
 *
 * What this test preserves, in order of how easily a later edit breaks it:
 *
 *  - `description` IS NEVER WRITTEN. It is the evidence every repair rests on;
 *    a pass that rewrites it can make any summary "correct".
 *  - THE SPLIT. Five rows the signature returned are CORRECT prose —
 *    `trans-community` really is a community, `rope-dojo` really is a space —
 *    and they are asserted to survive. A sweep that took them would satisfy
 *    "the thirteen are repaired" on its own.
 *  - THE BODY DISCIPLINE: twelve nulls and ONE kept. `aesthetic-fetishist`
 *    carries correct generic prose whose only fault was the summary above it,
 *    so nulling it would be the exact mirror of leaving a wrong body standing.
 *  - GROUP B CHOOSES NO SENSE. Three rows have a one-line description, so the
 *    replacement restates it and nothing more; merging them into group A's
 *    count is how a later pass takes the looser licence and applies it to a row
 *    with no evidence.
 *  - THE STATED REFUSALS STAY REFUSED — the register cohort, `queer`, and the
 *    anatomy-phrase rows — so a reader can tell a deliberate refusal from a row
 *    nobody reached.
 *  - ROUND THIRTEEN'S REFUSAL, re-asserted for the third round running.
 *  - THE POSTCONDITIONS COUNT THE REACHED STATE and cannot be neutered: no
 *    `false` in the verify block, no pre-seeded counter, and every comparison
 *    stays exact.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99950101100000_tag_prose_concept_as_community.sql',
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

const GROUP_A = [
  'uranic',
  'vulturing',
  'sex-favorable',
  'social-swinger',
  'queer-for-queer-q4q',
  'horny-net-geek-hng',
  'sensual-submissive',
  'lifestyle-kink',
  'queer-romantic',
  'aesthetic-fetishist',
];
const GROUP_B = ['ukete', 'sensual-hedonist', 'smart-ass-sadomasochist'];

describe('99950101100000 — the concept published as a community', () => {
  it('writes short_description and never description', () => {
    expect(statements).toMatch(/set\s+short_description\s*=/);
    // The SET clauses are the half that matters: every UPDATE is content-guarded
    // and therefore quotes the defect text in its own WHERE clause, so asserting
    // over the whole file would pass against a statement that writes the
    // evidence column.
    const setClauses = statements
      .split(/update unified_tags set/)
      .slice(1)
      .map((s) => s.slice(0, s.indexOf('where')));
    expect(setClauses).toHaveLength(13);
    for (const clause of setClauses) {
      expect(clause).not.toMatch(/\bdescription\s*=/);
    }
  });

  it('repairs all thirteen rows, each guarded on the text it removes', () => {
    for (const slug of [...GROUP_A, ...GROUP_B]) {
      expect(statements).toContain(`slug = '${slug}'`);
    }
    // Content-guarded: a concurrent session's better repair no-ops instead of
    // being overwritten.
    const guards = statements.match(/and short_description = '/g) ?? [];
    expect(guards).toHaveLength(13);
  });

  it('nulls twelve bodies and keeps aesthetic-fetishist', () => {
    const nulled = statements.match(/long_description\s*=\s*null/g) ?? [];
    expect(nulled).toHaveLength(12);
    // Scoped to the ONE statement: slicing from the slug reaches forward into
    // the group B updates, which legitimately do null a body.
    const aesthetic = statements
      .split(/update unified_tags set/)
      .find((s) => s.includes("slug = 'aesthetic-fetishist'"));
    expect(aesthetic).toBeDefined();
    expect(aesthetic).not.toMatch(/long_description\s*=\s*null/);
    expect(verify).toContain('strong attraction to specific aesthetics');
  });

  it('authors no body and invents no sense for group B', () => {
    // No body is written anywhere: the only legal moves are a null and, in
    // other rounds, an exact-phrase replace().
    expect(statements).not.toMatch(/long_description\s*=\s*'/);
    expect(statements).toContain("short_description = 'The receiving partner in Japanese rope.'");
    expect(statements).toContain("short_description = 'A person who pursues sensual pleasure.'");
    expect(statements).toContain("short_description = 'A clever exchanger of pain.'");
  });

  it('corrects uranic to the modern orientation, not the historic Uranian term', () => {
    expect(statements).toMatch(/masculine or neutral non-binary people/);
    expect(prose).toMatch(/Ulrichs/);
    expect(prose).toMatch(/neptunic/);
  });

  it('asserts the five refused control rows survive', () => {
    for (const slug of [
      'trans-community',
      'rope-dojo',
      'sexual-assault-resources',
      'peer-rope',
      'needle-exchange-program-nep',
    ]) {
      expect(verify).toContain(slug);
      expect(statements).not.toContain(`slug = '${slug}'`);
    }
  });

  it('re-asserts the anatomy and register refusals rather than reversing them', () => {
    for (const slug of ['futanari', 'pussy-worship', 'shemale']) {
      expect(verify).toContain(slug);
      expect(statements).not.toContain(`slug = '${slug}'`);
    }
    expect(prose).toMatch(/register class round thirteen measured and declined to sweep/i);
    expect(prose).toMatch(/Under-reaching is\s+the correct error/i);
  });

  it("re-asserts round thirteen's protected row", () => {
    expect(verify).toContain('rape-play');
    expect(verify).toContain('not the same as actual non-consensual acts');
    expect(statements).not.toContain("slug = 'rape-play'");
  });

  it('calls the real thin-page predicate instead of restating it', () => {
    expect(verify).toMatch(/tag_has_prose\(description, short_description\)/);
  });

  it('declares the actor, which is load-bearing on twelve human_reviewed rows', () => {
    expect(statements).toContain("set_config('app.actor', 'migration:99950101100000', true)");
  });

  it('keeps every postcondition counting the reached state and un-neuterable', () => {
    // The trap recorded twice: a guard anchored on the RAISE text or the slug
    // list stays green when the condition itself is short-circuited.
    expect(verify).toContain('if v_bad <> 13 then');
    expect(verify).toContain('if v_bad <> 12 then');
    expect(verify).toContain('if v_bad <> 5 then');
    expect(verify).toContain('if v_bad <> 3 then');
    expect(verify).not.toMatch(/\bfalse\b/);
    expect(verify).not.toMatch(/v_bad\s+int\s*:=/); // no pre-seeded counter
    const reads = verify.match(/from unified_tags/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(7);
  });

  it('states that the disowned-prose sentinel does not move', () => {
    expect(prose).toMatch(/do not move at all/i);
    expect(prose).toMatch(/NAME-ONLY lookup/i);
  });
});
