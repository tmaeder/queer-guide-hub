import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991791618696_synonyms_follow_disambiguated_tag.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// The header quotes the defect, the six terms and the rejected alternative ("drop"), so an
// unstripped toContain passes with the executable statement deleted.
const sql = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const selection = sql.slice(sql.indexOf('create temp table _syn_fix'), sql.indexOf('do $fix$'));
const fix = sql.slice(sql.indexOf('do $fix$'), sql.indexOf('do $p1$'));

describe('synonyms follow their disambiguated tag', () => {
  it('selects only rewrites that resolve to a DIFFERENT live tag, not merely stale ones', () => {
    // A replacement matching no tag is stale, not a misroute — sweeping it is a different
    // decision and would widen this pass silently.
    expect(selection).toContain('s.tag_alias_id is null');
    expect(selection).toContain("s.status = 'approved'");
    expect(selection).toMatch(/lower\(s\.replacements\[1\]\)\s*<>\s*lower\(btrim\(t\.name\)\)/);
    expect(selection).toMatch(/exists\s*\(/);
    expect(selection).toContain("o.status = 'active'");
    expect(selection).toContain('o.id <> s.tag_id');
  });

  it('re-points the replacement and never touches the search term', () => {
    // Rewriting `terms` would drop German-language search coverage instead of fixing where
    // it lands. P3 asserts the same thing after the fact.
    expect(fix).toMatch(/set\s+replacements\s*=\s*array\[f\.new_replacement\]/);
    expect(fix).not.toMatch(/set[\s\S]{0,200}\bterms\s*=/);
  });

  it('never deletes a synonym row', () => {
    // Dropping the rows is the rejected alternative: it removes coverage for a
    // 102-assignment tag rather than correcting the destination.
    expect(fix).not.toMatch(/delete\s+from\s+search_synonyms/i);
    expect(sql).not.toMatch(/delete\s+from\s+search_synonyms/i);
  });

  it('refuses a runaway sweep rather than trusting the predicate', () => {
    expect(fix).toMatch(/if\s+v_n\s*>\s*20\s+then/);
    expect(fix).toContain('raise exception');
    // An empty set is a no-op, not a failure — another session may fix it first.
    expect(fix).toMatch(/if\s+v_n\s*=\s*0\s+then/);
  });

  it('asserts BOTH that it agrees with its own tag and that it no longer lands elsewhere', () => {
    const p1 = sql.slice(sql.indexOf('do $p1$'), sql.indexOf('do $p2$'));
    const p2 = sql.slice(sql.indexOf('do $p2$'), sql.indexOf('do $p3$'));
    // P1 alone would pass if a coincidental rename made the old word correct.
    expect(p1).toMatch(/lower\(s\.replacements\[1\]\)\s*<>\s*lower\(btrim\(t\.name\)\)/);
    expect(p1).toMatch(/if\s+v_bad\s+is\s+not\s+null\s+then/);
    expect(p2).toContain('o.id <> s.tag_id');
    expect(p2).toMatch(/if\s+v_bad\s+is\s+not\s+null\s+then/);
    expect((p1 + p2).match(/raise exception/g) ?? []).toHaveLength(2);
  });

  it('protects the correctly-routing orphan cohort', () => {
    // 28 rows share the tag_alias_id IS NULL shape but route correctly; a careless
    // predicate would sweep them. P5 fails if that cohort is empty.
    const p5 = sql.slice(sql.indexOf('do $p5$'));
    expect(p5).toMatch(/lower\(s\.replacements\[1\]\)\s*=\s*lower\(btrim\(t\.name\)\)/);
    expect(p5).toMatch(/if\s+v_ok\s*=\s*0\s+then/);
    expect(p5).toContain('raise exception');
  });

  it('keeps every postcondition scoped, never corpus-wide', () => {
    // A corpus-wide "no synonym disagrees with its tag" check would abort db push
    // repo-wide the moment another session renames a tag — and sessions are doing that
    // today. Every check must DRIVE from the frozen _syn_fix set.
    //
    // Asserting `_syn_fix` appears somewhere in the block is NOT enough and mutation
    // testing proved it: unscoping P1's main query to `from search_synonyms` leaves
    // `select count(*) into v_total from _syn_fix` standing a few lines above, so a
    // substring check still passes while the assertion has gone corpus-wide. Anchor on
    // the driving FROM + its join back to the frozen set.
    for (const block of ['do $p1$', 'do $p2$', 'do $p3$', 'do $p4$']) {
      const start = sql.indexOf(block);
      const body = sql.slice(start, sql.indexOf('$;', start + 10));
      expect(body).toMatch(/from\s+_syn_fix\s+f\b/);
      expect(body).toMatch(/_syn_fix\s+f[\s\S]{0,200}?s\.id\s*=\s*f\.id|f\.id\s*=\s*s\.id/);
    }
    expect(sql).not.toMatch(/where\s+false/i);
    expect(sql).not.toMatch(/if\s+false\s+then/i);
  });

  it('pins no row count, since another session may fix some first', () => {
    expect(sql).not.toMatch(/v_n\s*<>\s*6\b/);
    expect(sql).not.toMatch(/=\s*6\s*then\s*$/m);
  });
});
