import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 51800101120000 — the disowned-prose TAIL.

 * SCOPE NOTE, and it is the reason several numbers here read "9" where an
 * earlier version of this file read "25": the pass identified a 25-row seam,
 * and 51700101143000 (a concurrent session) repaired 16 of them — by the same
 * rule, from the same evidence — while this migration sat in review. Those 16
 * UPDATEs were DELETED rather than left to no-op, because a file claiming 25
 * rows and changing 9 misreports itself, and rewriting correct prose is the
 * LLM rewrite both auto-apply paths were retired for.
 *
 * The POSTCONDITIONS still cover the whole 25-row seam and the tests below
 * still assert that, deliberately: they were written against the WRONG text
 * rather than this file's own writes, so they now guard both sessions' rows.
 *
 * TWO THINGS THIS FILE EXISTS TO PRESERVE, both of which a later reader could
 * easily undo:
 *
 * 1. THE HALF-REPAIRED CLASS. Seven rows had ONE prose field fixed by an
 *    earlier pass and the other left carrying the disowned junk — `collar` and
 *    `humbler` publish careful kink prose in `description` AND body while their
 *    SUMMARY still reads "Family name or surname"; `bottom`, `babyboy`, `toy`
 *    and `possum` are the mirror. The point is that **no check reading a single
 *    prose field can see this**, which is why five usage-ordered passes missed
 *    them. The test asserts the file records the class.
 *
 * 2. GROUP C MINTS NOTHING. Nine rows have a real but one-line `description`
 *    ("Person who tickles") — enough to state what the tag is, not enough to
 *    write a body from. Their summary is set from that description and the body
 *    is NULLED. A test that only checked "the family-name text is gone" would
 *    pass against a version that invented kink vocabulary for nine usage-0
 *    rows, which is the `queen` / `steer` rule inverted.
 *
 * Method note worth keeping: these were found by SIGNATURE SEARCH over the
 * surviving set ("commune in", "studio album", "family name"), not by usage
 * order. A signature is not a defect — `boyfriend` matched on "can refer to a
 * wide range of relationships" and is correct prose — so the regex narrows what
 * a human reads and does not decide.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/51800101120000_tag_prose_disowned_tail.sql',
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

/** SET clauses only — what is actually written. Anchoring a "must not contain"
 *  on the whole statement is wrong here, because every UPDATE is
 *  content-guarded and therefore quotes the defect verbatim in its WHERE. */
const setClauses = statements
  .split(/^update public\.unified_tags/m)
  .slice(1)
  .map((c) => (c.includes('where slug') ? c.slice(0, c.indexOf('where slug')) : c))
  .join('\n');

/** The full Group C invariant, asserted in the migration's postcondition. */
const GROUP_C = ['doe', 'fae', 'flock', 'handler', 'minion', 'tickler', 'whipper', 'vixen', 'cunt'];
/** The three of them this migration still writes; the other six were nulled by
 *  51700101143000 and are covered by the postcondition, not by an UPDATE. */
const GROUP_C_HERE = ['fae', 'flock', 'cunt'];

describe('51800101120000 — disowned prose, the tail', () => {
  it('repairs exactly the 9 rows still carrying the defect', () => {
    const slugs = [...statements.matchAll(/where slug = '([a-z-]+)'/g)].map((m) => m[1]);
    expect(new Set(slugs).size).toBe(9);
    expect(statements.match(/^update public\.unified_tags/gm)).toHaveLength(9);
    for (const s of [
      'gainer',
      'toy',
      'possum',
      'monsieur',
      'triad',
      'masc',
      'fae',
      'flock',
      'cunt',
    ]) {
      expect(slugs).toContain(s);
    }
    // The 16 repaired by 51700101143000 must NOT be rewritten here. This is the
    // assertion that fails if someone "restores" the deleted UPDATEs.
    for (const s of [
      'collar',
      'humbler',
      'bottom',
      'babyboy',
      'doe',
      'handler',
      'minion',
      'tickler',
      'whipper',
      'vixen',
      'domme',
      'fister',
      'sissy',
      'servant',
      'knife-play',
      'business-suits',
    ]) {
      expect(slugs, `${s} was repaired by 51700101143000 and must not be rewritten`).not.toContain(
        s,
      );
    }
  });

  it('records that a concurrent session took 16 of the seam', () => {
    expect(sql).toMatch(/51700101143000/);
    expect(sql).toMatch(/DELETED rather than left to no-op/i);
    expect(sql).toMatch(/soft-on-preconditions|soft on preconditions/i);
  });

  it('never writes `description` — it is the evidence on every row here', () => {
    expect(setClauses).not.toMatch(/\bdescription\s*=/);
  });

  it('guards every UPDATE on the defect it is removing', () => {
    expect(statements.match(/and status = 'active'/g)).toHaveLength(9);
    const guards = statements.match(/and (short_description = '|long_description like ')/g);
    expect(guards).toHaveLength(9);
  });

  it('Group C nulls the body and mints nothing', () => {
    // fae/flock/cunt are the three of Group C still standing; the other six were
    // nulled by 51700101143000. Each sets a summary the row's own description
    // supports AND nulls the body. If a later edit gives any of the NINE a body,
    // the migration's own postcondition fails too -- both layers are asserted.
    for (const s of GROUP_C_HERE) {
      const stmt = statements
        .split(/^update public\.unified_tags/m)
        .find((c) => c.includes(`where slug = '${s}'`));
      expect(stmt, `no statement for ${s}`).toBeTruthy();
      expect(stmt).toMatch(/long_description = null/);
      expect(stmt).toMatch(/short_description = '/);
    }
    // The postcondition must cover ALL NINE, not just the three written here:
    // six were nulled by 51700101143000 and the invariant is the same for both.
    //
    // SCOPED to the Group C check. An unscoped `verify.toContain(...)` is
    // VACUOUS: `v_seam` happens to list the same nine slugs on one line, so it
    // satisfies the assertion while the postcondition's own list is short a
    // slug. Measured — that mutation SURVIVED before this slice was added.
    const upToRaise = verify.slice(0, verify.indexOf('gained a body'));
    const groupC = upToRaise.slice(upToRaise.lastIndexOf('select count(*)'));
    expect(groupC).toContain(GROUP_C.map((g) => `'${g}'`).join(','));
    expect(verify).toMatch(/long_description is not null/);
    expect(verify).toMatch(/raise exception 'tail: % Group C row\(s\) gained a body/);
  });

  it('only Group C nulls a body — the rest replace prose', () => {
    expect(statements.match(/long_description = null/g)).toHaveLength(GROUP_C_HERE.length);
  });

  it('repairs the half-repaired rows on the field that was LEFT', () => {
    // collar/humbler/gainer: summary only, because description and body are
    // already correct hand-written prose. Touching their bodies would be the
    // bulk rewrite this repo retired.
    for (const s of ['gainer']) {
      const stmt = statements
        .split(/^update public\.unified_tags/m)
        .find((c) => c.includes(`where slug = '${s}'`));
      expect(stmt).toMatch(/short_description = '/);
      expect(stmt).not.toMatch(/long_description/);
    }
    // bottom/babyboy/toy/possum/monsieur: body only, summary already correct.
    for (const s of ['toy', 'possum', 'monsieur', 'triad']) {
      const stmt = statements
        .split(/^update public\.unified_tags/m)
        .find((c) => c.includes(`where slug = '${s}'`));
      expect(stmt).toMatch(/long_description =\n'/);
      expect(stmt?.slice(0, stmt.indexOf('where slug'))).not.toMatch(/short_description/);
    }
  });

  it('records the half-repaired class and how the rows were found', () => {
    expect(sql).toMatch(/HALF-REPAIRED/);
    expect(sql).toMatch(/single field|either field alone|reading a single/i);
    expect(sql).toMatch(/SIGNATURE/i);
    expect(sql).toMatch(/A signature is not a defect/i);
    expect(sql).toMatch(/usage 0|usage order/i);
  });

  it('carries the sense each row’s own evidence establishes', () => {
    expect(setClauses).toContain('Possum is a pet-play persona');
    expect(setClauses).toContain(
      'Monsieur is a French honorific used to address a masculine dominant',
    );
    expect(setClauses).toContain('A triad is a relationship between three people');
    // masc is the sharpest row: the body published biological sex on a page
    // whose own description says "regardless of gender identity".
    expect(setClauses).toContain('it says nothing about their gender identity or their body');
    expect(setClauses).not.toMatch(/produces sperm/);
    // triad must not close on the 1988 studio album it used to
    expect(setClauses).not.toMatch(/studio album/);
  });

  it('declares the actor, and records that it is load-bearing', () => {
    expect(statements).toContain("set_config('app.actor', 'admin:tag-prose-disowned-tail', true)");
    expect(statements).not.toMatch(/'system:/);
    expect(sql).toMatch(/LOAD-BEARING/);
    expect(sql).toMatch(/human_reviewed/);
  });

  it('asserts the DEFECT is gone, not that this file’s wording is present', () => {
    expect(verify).toContain("'Family name or surname'");
    expect(verify).toContain("long_description like 'Domme is a commune in the Dordogne%'");
    expect(verify).toMatch(/raise exception 'tail: % row\(s\) still publish the disowned prose/);
    expect(verify).not.toContain('Possum is a pet-play persona');
    expect(verify).not.toContain('A triad is a relationship between three people');
  });

  it('asserts the thin-page gate, because three bodies are nulled here', () => {
    expect(verify).toMatch(/not tag_has_prose\(description, short_description\)/);
    expect(verify).toMatch(/raise exception 'tail: % row\(s\) fell below the thin-page gate/);
  });

  it('tests for a literal backslash-n with position(), never LIKE', () => {
    expect(verify).toMatch(/position\('\\n' in coalesce\(long_description/);
    expect(verify).toMatch(/position\('\\n' in coalesce\(short_description/);
    expect(verify).not.toMatch(/like '%\\n%'/);
  });

  it('names its deferrals, each with the reason it cannot be reached', () => {
    // ebony/bicon: no clean evidence on the row. host/unicorn: two senses named
    // at once. The cohort: description AGREES with body.
    expect(sql).toMatch(/ebony/);
    expect(sql).toMatch(/bicon/);
    expect(sql).toMatch(/\bhost\b/);
    expect(sql).toMatch(/unicorn/);
    expect(sql).toMatch(/AGREES/);
    expect(verify).toContain("'ebony','bicon','host','unicorn'");
  });

  it('reports rather than aborts on what it does not own', () => {
    expect(verify.match(/raise exception/g)).toHaveLength(5);
    expect(verify.match(/raise notice/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
