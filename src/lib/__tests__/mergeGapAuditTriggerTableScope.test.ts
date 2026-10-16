import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 99991792168441 fixes merge_gap_audit_trigger(), which raised
 *   42703 record "new" has no field "entity_type"
 * on every city and venue merge AND unmerge, because `kind` was picked out of a
 * single CASE expression whose ELSE arm reads NEW.entity_type -- a column only
 * entity_merge_audit has. A CASE is one expression; the field reference resolves
 * when it is prepared, not lazily per branch.
 *
 * The migration's own `do $verify$` block is the behavioural gate (it proves all
 * three tables reach validation against live data). This file guards the SHAPE, so
 * a later CREATE OR REPLACE cannot quietly reintroduce the single-expression form
 * -- which is exactly how this defect would come back, since the arms themselves
 * look correct.
 *
 * Comments are STRIPPED before every assertion. This migration's header quotes the
 * broken CASE verbatim in order to explain it, so a naive scan of the raw file
 * would match the explanation and fail on correct code.
 */

const MIGRATION = '99991792168441_merge_gap_audit_trigger_table_scope.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Drop `--` line comments so prose quoting the defect cannot satisfy an assertion. */
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const sql = stripComments(raw);

describe('merge_gap_audit_trigger table scope', () => {
  it('the comment stripper actually removes the header that quotes the defect', () => {
    // Positive control. The raw file MUST contain the broken form (in prose) and the
    // stripped file MUST NOT -- otherwise every assertion below is vacuous.
    expect(raw).toMatch(/ELSE NEW\.entity_type END/);
    expect(sql).not.toMatch(/ELSE NEW\.entity_type END/);
  });

  it('does not assign kind from a single CASE expression', () => {
    // The defect: one expression mixing a TG_TABLE_NAME test with a NEW field read.
    expect(sql).not.toMatch(/kind\s*:=\s*CASE/i);
  });

  it('assigns kind with IF/ELSIF statements, not an expression', () => {
    expect(sql).toMatch(/IF\s+TG_TABLE_NAME\s*=\s*'venue_merge_audit'\s+THEN/i);
    expect(sql).toMatch(/ELSIF\s+TG_TABLE_NAME\s*=\s*'city_merge_audit'\s+THEN/i);
  });

  it('reads NEW.entity_type exactly once, and only on the ELSE path', () => {
    const reads = sql.match(/NEW\.entity_type/g) ?? [];
    expect(reads).toHaveLength(1);

    // The single read must sit after the ELSE that follows the two table tests, so
    // it is unreachable for the tables that lack the column.
    const assignment = sql.match(
      /IF\s+TG_TABLE_NAME[\s\S]*?ELSE\s*\n\s*kind\s*:=\s*NEW\.entity_type;\s*\n\s*END IF;/i,
    );
    expect(assignment).not.toBeNull();
  });

  it('keeps the city and venue arms resolving to their own kinds', () => {
    // A "fix" that severed NEW.entity_type but also dropped these would stop every
    // merge resolving its table.
    expect(sql).toMatch(/kind\s*:=\s*'venue';/i);
    expect(sql).toMatch(/kind\s*:=\s*'city';/i);
  });

  it('still guards a bogus pair, so the fix did not disarm validation', () => {
    expect(sql).toMatch(
      /RAISE EXCEPTION 'gap fill requires a canonical survivor and its merged donor'/i,
    );
  });

  it('preserves the lazy OLD read that the same property protects', () => {
    // `ELSIF OLD.undone_at IS NULL` is only safe because an IF/ELSIF statement is
    // evaluated per path -- the very property this fix relies on. Folding it into an
    // expression would raise on INSERT, where OLD is unassigned.
    expect(sql).toMatch(
      /ELSIF\s+OLD\.undone_at\s+IS NULL\s+AND\s+NEW\.undone_at\s+IS NOT NULL\s+THEN/i,
    );
  });

  it('asserts all three audit paths behaviourally, keyed on SQLSTATE', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));

    // Each table is probed, and 42703 -- the defect -- is a hard failure for the two
    // that lack the column, while the entity arm must not newly acquire it.
    for (const table of ['city_merge_audit', 'venue_merge_audit', 'entity_merge_audit']) {
      expect(verify).toContain(`insert into public.${table}`);
    }

    // Three 42703 arms (one per table) and three P0001 pass arms.
    expect(verify.match(/when sqlstate '42703' then/gi) ?? []).toHaveLength(3);
    expect(verify.match(/when sqlstate 'P0001' then/gi) ?? []).toHaveLength(3);
  });

  it('asserts the trigger is still attached to all three tables', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    // Anchored on the CONDITION, not the message it prints -- neutering the `if` to
    // a tautology leaves the RAISE text intact and would otherwise stay green.
    expect(verify).toMatch(/if\s+v_rows\s*<>\s*3\s+then/i);
    expect(verify).toMatch(/tgfoid\s*=\s*'public\.merge_gap_audit_trigger'::regproc/i);
  });

  it('has no loosened comparison or short-circuited predicate in the verify block', () => {
    const verify = sql.slice(sql.indexOf('do $verify$'));
    expect(verify).not.toMatch(/\bwhere false\b/i);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    expect(verify).not.toMatch(/v_rows\s*(<|>)\s*3/i);
  });
});
