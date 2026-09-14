import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 60000301100000 — round five of the disowned-prose backlog.

 * SCOPE NOTE: this pass identified nine rows. 51700101143000 (a concurrent
 * session) repaired `awareness` and `dyke` — by the same rule, from the same
 * evidence — while this migration sat in review, so their UPDATEs were DELETED
 * rather than left to no-op. The POSTCONDITIONS still cover all nine and the
 * tests below still assert that: they were written against the WRONG text
 * rather than this file's own writes, so they guard both sessions' rows.
 *
 * NINE rows in THREE classes, and the test asserts the classes stay LABELLED,
 * because the whole risk of a mixed-class migration is that a later reader
 * takes the licence of the loosest group and applies it to the others:
 *
 *   A  wrong subject, ORIGINAL rule — the row's own `description` establishes a
 *      sense the short/long description contradict (identity, solidarity,
 *      awareness, dyke, man).
 *   B  wrong subject, WIDENED rule — `description IS NULL`, so the category is
 *      what establishes the sense (old-theatre).
 *   C  NOT a wrong subject at all — a REGISTER defect, one sentence per row
 *      citing its own source to the reader (pride-events, gay-men,
 *      workplace-equality). The subject was verified correct, so the repair is
 *      the smallest that removes the defect and every other sentence is kept
 *      byte-identical.
 *
 * WHAT THIS ROUND CORRECTS ABOUT THE PREVIOUS ONE. Round four concluded "the
 * high-usage head of this backlog is worked out". This pass re-read the whole
 * surviving list rather than the usage head and found `identity` at **541
 * uses** — so that conclusion held for the top twenty and not as a general
 * claim. A hit rate measured over one ordering does not transfer to another.
 * The test asserts the file records that correction rather than quietly
 * contradicting its predecessor.
 *
 * The load-bearing assertions:
 *
 *  1. `description` is NEVER written — it is the evidence for all five Group A
 *     rows, and writing it would remove what licensed the repair.
 *  2. The actor is DECLARED, and the file says the declaration IS load-bearing
 *     here (man and dyke are `human_reviewed`) — the OPPOSITE of round four,
 *     which is exactly why both files have to state which case they are in.
 *     Verified live, not assumed: the undeclared UPDATE returns
 *     "human_reviewed tag ... cannot be modified by system:trigger".
 *  3. Group C keeps its surviving sentences byte-identical. A test that only
 *     checked "the citation is gone" would pass against a full rewrite, which
 *     is the retired bulk-rewrite experiment wearing a fix's clothes.
 *  4. The source-citing postcondition is corpus-wide over all nine rows, not
 *     just Group C — a replacement body that reintroduced the register would
 *     otherwise pass unnoticed.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/60000301100000_tag_prose_wrong_subject_round_five.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

/**
 * Comment-stripped. This header quotes every defect it removes and names every
 * slug, so an assertion over raw text is satisfiable by the PROSE while the
 * statement it describes is gone — the vacuous-assertion class CLAUDE.md has
 * now recorded five times.
 */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The `do $verify$` block re-states every defect signature in order to assert
 *  it is absent, so a `toContain` over the whole file matches the VERIFY copy
 *  and passes with the UPDATE deleted. */
const statements = bare.slice(0, bare.indexOf('do $verify$'));
const verify = bare.slice(bare.indexOf('do $verify$'));

/**
 * The SET clauses only — the text actually written to the corpus.
 *
 * Anchoring on the whole statement is WRONG for any "the new prose must not
 * contain X" assertion, because every UPDATE is content-guarded and therefore
 * quotes the defect verbatim in its own WHERE clause. A `not.toContain` over
 * `statements` fails on correct code; scoped here it tests what it means to.
 * This is the same trap the HIV/STI pass hit from the other direction, where a
 * slice taken from the WHERE clause matched the statement's own guard.
 */
const setClauses = statements
  .split(/^update public\.unified_tags/m)
  .slice(1)
  .map((chunk) => chunk.slice(0, chunk.indexOf('where slug')))
  .join('\n');

describe('60000301100000 — glossary prose round five', () => {
  it('repairs exactly the seven rows still carrying the defect', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(new Set(slugs)).toEqual(
      new Set([
        'identity',
        'solidarity',
        'man',
        'old-theatre',
        'pride-events',
        'gay-men',
        'workplace-equality',
      ]),
    );
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(7);
    // awareness and dyke were repaired by 51700101143000. This is the assertion
    // that fails if someone "restores" the deleted UPDATEs.
    expect(slugs).not.toContain('awareness');
    expect(slugs).not.toContain('dyke');
  });

  it('records that a concurrent session took two of the nine', () => {
    expect(sql).toMatch(/51700101143000/);
    expect(sql).toMatch(/DELETED rather than left to no-op/i);
    expect(sql).toMatch(/hard on postconditions/i);
  });

  it('never writes `description`', () => {
    expect(statements).not.toMatch(/set[\s\S]{0,600}?\bdescription\s*=/);
  });

  it('guards every UPDATE on the defect it is removing', () => {
    expect(statements.match(/and long_description i?like/g)).toHaveLength(7);
    expect(statements.match(/and status = 'active'/g)).toHaveLength(7);
    expect(statements).toContain("like '%Polish trade union federation Solidarity%'");
    expect(statements).toContain("like 'A man is an adult human being who identifies as male%'");
    expect(statements).toContain(
      "like 'The Old Theatre is a historic theatre located in Stamford%'",
    );
  });

  it('replaces prose rather than nulling it — every row is live and rendering', () => {
    expect(statements).not.toMatch(/long_description\s*=\s*null/);
    expect(statements).not.toMatch(/short_description\s*=\s*null/);
  });

  it('replaces a summary only on the two rows whose summary is itself wrong', () => {
    // identity ("Concept of self and group affiliation") and old-theatre
    // ("Historic theatre in Stamford") state the wrong subject in the LEAD
    // line. solidarity and man have correct summaries -- man's is the evidence
    // its body contradicted -- and Group C's summaries were never in question.
    // (awareness was the third such row and is repaired by 51700101143000.)
    expect(statements.match(/short_description\s*=/g)).toHaveLength(2);
    expect(statements).toContain(
      "short_description = 'Who a person understands themselves to be — including gender and orientation.'",
    );
    expect(statements).toContain(
      "short_description = 'A historic theatre still in use as a venue.'",
    );
  });

  it('Group C removes the citing sentence and keeps the rest byte-identical', () => {
    // The surviving sentences must be exactly the prod text minus one sentence.
    expect(statements).toContain(
      "'Pride events are gatherings to promote LGBTQ+ visibility, equality, and unity. They often include parades, rallies, and festivals. These events are typically held annually and may commemorate significant dates in LGBTQ+ history.'",
    );
    expect(statements).toContain(
      "'Gay men are men who are emotionally, romantically, or sexually attracted to other men. Gay men can be found in all parts of the world and come from diverse backgrounds.'",
    );
    expect(statements).toContain(
      'Workplace equality refers to the creation of an inclusive environment where LGBTQ+ employees feel safe and valued. This can be achieved through policies and practices that promote diversity and prevent discrimination. By implementing these policies,',
    );
    // and none of the three may carry the citation it exists to remove --
    // asserted over the SET clauses, since each WHERE guard quotes it verbatim
    expect(setClauses).not.toContain('According to a scientific article published on 2 March 2022');
    expect(setClauses).not.toContain('A scientific article published in 2007 highlights');
    expect(setClauses).not.toContain('According to various sources, including a book by');
    expect(setClauses).not.toContain('as listed on Wikidata');
  });

  it('writes bodies that carry the sense the row’s own evidence establishes', () => {
    expect(statements).toContain(
      'Identity, on this platform, means the parts of how someone understands themselves',
    );
    expect(statements).toContain('Solidarity is support that costs the giver something');
    expect(statements).toContain(
      'An old theatre used as a venue is a surviving playhouse or music hall',
    );
    // man is the NARROWING fix: trans men named first-class, not as a caveat.
    expect(statements).toContain('That includes trans men and cis men');
  });

  it('declares the actor, and records that it IS load-bearing here', () => {
    expect(statements).toContain("set_config('app.actor', 'admin:tag-prose-round-five', true)");
    expect(statements).not.toMatch(/'system:/);
    expect(sql).toMatch(/LOAD-BEARING/);
    expect(sql).toMatch(/human_reviewed/);
    // and that this is the opposite of round four, so neither is copied blindly
    expect(sql).toMatch(/51500101160000|round four/i);
  });

  it('labels all three classes, and marks Group C as NOT a wrong subject', () => {
    expect(sql).toMatch(/GROUP A/);
    expect(sql).toMatch(/GROUP B/);
    expect(sql).toMatch(/GROUP C/);
    expect(sql).toMatch(/NOT A WRONG SUBJECT/i);
    expect(sql).toMatch(/REGISTER defect/i);
    // Group C must not be read as a licence to bulk-rewrite weak prose.
    expect(sql).toMatch(/retired|13 wrong/i);
  });

  it('records that round four’s "head is worked out" held only for the top twenty', () => {
    expect(sql).toMatch(/541/);
    expect(sql).toMatch(/does not transfer/i);
    expect(verify).toMatch(/head is worked out/i);
  });

  it('asserts the DEFECT is gone, not that this file’s wording is present', () => {
    expect(verify).toContain("short_description = 'Concept of self and group affiliation'");
    expect(verify).toContain("long_description like '%Polish trade union federation Solidarity%'");
    expect(verify).toContain(
      "raise exception 'round five: % wrong-subject row(s) still publish the disowned prose'",
    );
    expect(verify).not.toContain('Identity, on this platform');
    expect(verify).not.toContain('Solidarity is support that costs the giver something');
  });

  it('checks the source-citing register across ALL nine rows, not just Group C', () => {
    const block = verify.slice(verify.indexOf('still cite their own source'));
    expect(verify).toMatch(/according to a scientific article/i);
    expect(verify).toMatch(/as listed on wikidata/i);
    expect(verify).toMatch(/the provided sources/i);
    expect(block.length).toBeGreaterThan(0);
    // the guard must run over the nine-slug list, not a Group C subset
    const nineLists = verify.match(
      /'identity','solidarity','awareness','dyke','man','old-theatre',\s*'pride-events','gay-men','workplace-equality'/g,
    );
    expect(nineLists?.length).toBeGreaterThanOrEqual(3);
  });

  it('tests for a literal backslash-n with position(), never LIKE', () => {
    expect(verify).toMatch(/position\('\\n' in coalesce\(long_description/);
    expect(verify).toMatch(/position\('\\n' in coalesce\(short_description/);
    expect(verify).not.toMatch(/like '%\\n%'/);
  });

  it('asserts every touched row stays publishable', () => {
    expect(verify).toMatch(/not tag_has_prose\(description, short_description\)/);
    expect(verify).toContain(
      "raise exception 'round five: % row(s) fell below the thin-page gate'",
    );
  });

  it('reports rather than aborts on everything it does not own', () => {
    expect(verify.match(/raise exception/g)).toHaveLength(4);
    expect(verify.match(/raise notice/g)?.length).toBeGreaterThanOrEqual(4);
    // the deferrals are named so the next pass does not re-read them
    expect(verify).toContain("'diversity'");
    expect(sql).toMatch(/generic-sense cohort/i);
    expect(sql).toMatch(/seo_indexable/);
  });
});
