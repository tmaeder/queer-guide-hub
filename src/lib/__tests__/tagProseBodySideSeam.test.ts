import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 81000101100000 — round fifteen, the BODY-SIDE SEAM.
 *
 * Rounds two to fourteen were all summary-first: every one of them SELECTED on
 * `short_description` and touched the body only as a consequence. This pass is
 * the first to select on the body itself, which is why it reaches rows no
 * earlier ordering could — above all the five rows whose summary is already
 * correct and whose body alone is wrong.
 *
 * What this test exists to preserve, in order of how easily a later edit
 * breaks it:
 *
 *  - `description` IS NEVER WRITTEN. It is the evidence that justifies every
 *    repair here; a pass that rewrites it can make any summary "correct".
 *  - THE IDENTIFIER SPLIT, which is the point of the round. Seven namesake
 *    identifiers are nulled and TWO CORRECT ONES ARE KEPT — `double-penetration`
 *    (Q1243210) and `jockstrap` (Q10940) really do name the right thing, and
 *    only the prose derived from their own Wikidata descriptions is wrong. A
 *    sweep that cleared all nine would satisfy "the seven are gone", so both
 *    halves are asserted.
 *  - THE BODY DISCIPLINE. Thirteen nulls and one exact-phrase `replace()`; no
 *    body is authored. A `replace()` cannot invent prose, which keeps every
 *    other sentence byte-identical by construction rather than by retyping.
 *  - THE MIRROR CONTROL. "the thirteen bodies are gone" is equally satisfied by
 *    a sweep that took everything, so six bodies are asserted to SURVIVE —
 *    `manties` and `jockstrap` in the pass, `bimbo` and `yoni-massage` kept by
 *    round fourteen, `aftercare` and `chosen-family` outside both.
 *  - GROUP B WRITES NO SUMMARY. Those five rows' summaries are already correct;
 *    rewriting a correct summary is the LLM rewrite both auto-apply paths were
 *    retired for.
 *  - ROUND THIRTEEN'S REFUSAL, re-asserted for the second round running.
 *  - THE REFUSED ROWS STAY REFUSED, each for its own stated reason, so a later
 *    reader can tell a deliberate refusal from a row nobody reached.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/81000101100000_tag_prose_body_side_seam.sql',
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

const ALL_15 = [
  'girlboss',
  'foot-top',
  'rearrange-guts',
  'unsure',
  'cock-worship',
  'androgynous',
  'hunk',
  'vivisector',
  'female',
  'dance-floor',
  'cake-and-cunnilingus-day',
  'nantaimori',
  'double-penetration',
  'jockstrap',
  'manties',
];

/** The five rows whose summary was already correct — group B writes no summary. */
const BODY_ONLY = ['vivisector', 'female', 'dance-floor', 'cake-and-cunnilingus-day', 'nantaimori'];

/** Nulled because the entity is a namesake. */
const NAMESAKE_IDS = [
  'girlboss',
  'unsure',
  'cock-worship',
  'androgynous',
  'hunk',
  'vivisector',
  'dance-floor',
];

/** The thirteen bodies this file removes. */
const BODIES_NULLED = [
  'girlboss',
  'foot-top',
  'rearrange-guts',
  'unsure',
  'cock-worship',
  'androgynous',
  'hunk',
  'vivisector',
  'female',
  'dance-floor',
  'cake-and-cunnilingus-day',
  'nantaimori',
  'double-penetration',
];

/** Isolate one UPDATE statement by the slug in its WHERE clause. */
function updateFor(slug: string): string {
  const marker = `where slug = '${slug}'`;
  const at = statements.indexOf(marker);
  expect(at, `no UPDATE found for ${slug}`).toBeGreaterThan(-1);
  const start = statements.lastIndexOf('update public.unified_tags', at);
  const end = statements.indexOf(';', at);
  return statements.slice(start, end + 1);
}

/** The SET clause only — the half a "must not write" assertion is about. */
function setClauseFor(slug: string): string {
  const stmt = updateFor(slug);
  return stmt.slice(0, stmt.indexOf(' where '));
}

describe('81000101100000 — round fifteen, the body-side seam', () => {
  it('never writes description, which is the evidence every repair rests on', () => {
    for (const slug of ALL_15) {
      expect(setClauseFor(slug), `${slug} writes description`).not.toMatch(
        /\bset\b[\s\S]*?(^|[\s,])description\s*=/m,
      );
    }
    // Scoped to SET clauses so the header's discussion of `description` cannot
    // satisfy or break it.
    expect(ALL_15.map(setClauseFor).join('\n')).not.toMatch(/(^|[\s,])description\s*=/m);
  });

  it('content-guards every UPDATE on the defect it removes', () => {
    for (const slug of ALL_15) {
      const stmt = updateFor(slug);
      const where = stmt.slice(stmt.indexOf(' where '));
      expect(
        /and short_description (=|is null)/.test(where) || /and long_description like/.test(where),
        `${slug} is not guarded on the text it replaces`,
      ).toBe(true);
    }
  });

  it('writes no summary for the five rows whose summary was already correct', () => {
    for (const slug of BODY_ONLY) {
      expect(setClauseFor(slug), `${slug} rewrites a correct summary`).not.toMatch(
        /short_description\s*=/,
      );
    }
  });

  it('nulls exactly the thirteen expected bodies and authors none', () => {
    for (const slug of BODIES_NULLED) {
      expect(setClauseFor(slug), `${slug} body is not nulled`).toMatch(
        /long_description\s*=\s*null/,
      );
    }
    // `jockstrap` is the one body altered rather than removed, and it must be a
    // replace(), never a literal — a replace() cannot author prose.
    const jock = setClauseFor('jockstrap');
    expect(jock).toMatch(/long_description\s*=\s*replace\(long_description,/);
    expect(jock).not.toMatch(/long_description\s*=\s*'/);
    // `manties` keeps its hand-written body untouched.
    expect(setClauseFor('manties')).not.toMatch(/long_description/);
  });

  it('nulls the seven namesake identifiers and KEEPS the two correct ones', () => {
    for (const slug of NAMESAKE_IDS) {
      const set = setClauseFor(slug);
      expect(set, `${slug} keeps a namesake wikidata_id`).toMatch(/wikidata_id\s*=\s*null/);
      expect(set, `${slug} keeps a namesake wikipedia_url`).toMatch(/wikipedia_url\s*=\s*null/);
    }
    // The half that stops this becoming a sweep: a correct identifier is not
    // collateral. This is the methadone rule.
    for (const slug of ['double-penetration', 'jockstrap']) {
      expect(setClauseFor(slug), `${slug} must keep its correct identifier`).not.toMatch(
        /wikidata_id/,
      );
    }
    expect(verify).toContain("slug = 'double-penetration' and wikidata_id = 'Q1243210'");
    expect(verify).toContain("slug = 'jockstrap'          and wikidata_id = 'Q10940'");
  });

  it('never repoints an identifier — null is the only legal value', () => {
    expect(statements).not.toMatch(/wikidata_id\s*=\s*'Q/);
    expect(statements).not.toMatch(/wikipedia_url\s*=\s*'http/);
  });

  it('writes nothing to tag_wikidata_repair_audit, which is the sentinel input', () => {
    expect(statements).not.toMatch(/tag_wikidata_repair_audit/);
    expect(prose).toMatch(/INPUT to `tag_disowned_prose_signals\(\)`/);
  });

  it('keeps the mirror control, so the body nulls cannot become a sweep', () => {
    expect(verify).toContain(
      "slug in ('manties','jockstrap','bimbo','yoni-massage','aftercare','chosen-family')",
    );
    expect(verify).toMatch(/if v_bad <> 6 then/);
  });

  it('re-asserts round thirteen’s refusal and this round’s own refusals', () => {
    expect(verify).toContain(
      "slug in ('rape-play','piss-drinker','hiv-transmission','water-bondage',",
    );
    expect(verify).toMatch(/if v_bad <> 8 then/);
    for (const slug of [
      'pussy-worship',
      'lingam-massage',
      'ampallang',
      'shemale',
      'mermaid',
      'succubus',
      'wolf',
    ]) {
      expect(verify, `${slug} is not held as a refusal`).toContain(`slug = '${slug}'`);
    }
    expect(verify).toMatch(/if v_bad <> 7 then/);
  });

  it('counts the reached state positively and calls the real thin-page predicate', () => {
    expect(verify).toContain('public.tag_has_prose(description, short_description)');
    // Restating the gate as an AND fails on the three rows whose description is
    // legitimately null.
    expect(verify).not.toMatch(/description is not null\s+and\s+short_description is not null/);
    expect(verify).toMatch(/if v_bad <> 15 then/);
  });

  it('declares an actor, which is load-bearing on thirteen human_reviewed rows', () => {
    expect(statements).toMatch(
      /select set_config\('app\.actor', 'admin:tag-prose-body-side-seam', true\);/,
    );
  });

  it('lets no postcondition be short-circuited into counting nothing', () => {
    // A predicate neutered to `where false and …` leaves every string-anchored
    // assertion green while the check has stopped counting — round fourteen's
    // one surviving mutation.
    expect(verify).not.toMatch(/\bfalse\b/);
    expect(verify).not.toMatch(/select\s+\d+\s+into\s+v_bad/);
    expect([...verify.matchAll(/from public\.unified_tags/g)]).toHaveLength(11);
    // Conditions are counted, so a loosened comparison cannot hide behind an
    // intact RAISE message.
    expect(verify).not.toMatch(/if v_bad [<>]=? -?\d/);
  });

  it('records the honest metric forecast rather than the flattering one', () => {
    expect(prose).toMatch(/THE METRIC MOVES BY ONE, NOT FIFTEEN/);
    expect(prose).toMatch(/ld_surviving` 147 -> 146/);
  });

  it('states the new axis and that every earlier round selected on the summary', () => {
    expect(prose).toMatch(/Rounds two to fourteen were all SUMMARY-FIRST/);
    expect(prose).toMatch(/Nothing has ever selected on the body itself/);
  });
});
