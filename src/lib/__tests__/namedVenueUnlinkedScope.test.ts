import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991791888795, which scoped the NAMED_VENUE_UNLINKED detector to the set its producer
 * can actually reach.
 *
 * Asserted over COMMENT-STRIPPED sql. That migration's header quotes the old predicate, the
 * linker's selector, the rejected alternative AND the measured counts, so an unstripped
 * `toContain` passes with every executable line deleted.
 */

const MIGRATION = '99991791888795_scope_named_venue_unlinked_to_linker';
const MIG_DIR = join(process.cwd(), 'supabase/migrations');

function migrationSql(): string {
  const file = readdirSync(MIG_DIR).find((f) => f.startsWith(MIGRATION));
  if (!file) throw new Error(`migration ${MIGRATION} not found -- renumbered without updating me?`);
  return readFileSync(join(MIG_DIR, file), 'utf8');
}

/** Strip only line-leading `--`; a mid-line `--` may sit inside a SQL string literal. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

const RAW = migrationSql();
const SQL = stripComments(RAW);

describe('NAMED_VENUE_UNLINKED is scoped to the linker, by patch not by restatement', () => {
  it('patches the live definition and never restates the function', () => {
    expect(SQL).toContain('pg_get_functiondef');
    expect(SQL).toContain('execute replace(v_src, v_before, v_after)');
    // The detector is 8,431 chars of ~20 union arms and is the sole source of every event quality
    // code. Restating it would risk silently altering an arm this change never read.
    expect(SQL).not.toMatch(/create\s+or\s+replace\s+function\s+public\.event_quality_findings/i);
  });

  it('strips comments before asserting, but NOT before re-executing', () => {
    // scripts/check-functiondef-asserts.mjs: pg_get_functiondef() returns the body INCLUDING its
    // comments, so an assertion on it can match the prose explaining a symbol rather than the code
    // -- which aborted `db push` on main three times on 2026-09-20. Both verify-block reads are
    // stripped.
    expect((SQL.match(/regexp_replace\(pg_get_functiondef/g) ?? []).length).toBe(2);
    // The PATCH read must stay RAW: its source is re-executed, so stripping there would delete the
    // function's own comments permanently. Exactly one bare read, and it is in the patch block.
    const patch = SQL.slice(SQL.indexOf('$patch$'), SQL.indexOf('$verify$'));
    const verify = SQL.slice(SQL.indexOf('$verify$'));
    expect((patch.match(/select pg_get_functiondef\(p\.oid\) into v_src/g) ?? []).length).toBe(1);
    expect(verify).not.toMatch(/select pg_get_functiondef\(p\.oid\) into v_src/);
  });

  it('refuses to patch unless the anchor occurs exactly once', () => {
    expect(SQL).toMatch(/coalesce\(v_n,\s*0\)\s*<>\s*1/);
    expect(SQL).toMatch(/raise exception 'anchor occurs % times/);
  });

  it('is idempotent, so a re-run or a concurrent patch is a no-op rather than a double scope', () => {
    expect(SQL).toMatch(/if position\(v_after in v_src\) > 0 then[\s\S]{0,200}return;/);
  });

  it("mirrors the linker's own window, not the CTE's event_scope", () => {
    // The linker reaches events that ENDED up to a year ago. `event_scope` is
    // coalesce(end_date,start_date) >= now(), a stricter line that would under-flag real work.
    const patch = SQL.slice(SQL.indexOf('$patch$'), SQL.indexOf('$verify$'));
    // Scoped to the PATCH region and asserted by COUNT. Both needles occur twice -- once in the
    // patch and once in the P1 postcondition that checks it -- so a bare toContain over the whole
    // file stays green when the executable copy is dropped and only the check survives.
    // NOTE the doubled quotes: inside the patch this text sits in a SQL string literal, so it
    // reads `interval ''1 year''`. Asserting the single-quoted form fails on correct code -- it
    // only ever matches the postcondition fixtures, not the patch.
    expect(patch).toContain("start_date >= now() - interval ''1 year''");
    expect(patch).toContain('and city_id is not null');
    expect((SQL.match(/and city_id is not null/g) ?? []).length).toBe(2);
    expect((SQL.match(/start_date >= now\(\) - interval ''1 year''/g) ?? []).length).toBe(2);
    expect(patch).not.toContain('event_scope');
  });

  it('does not widen the linker, which was the rejected alternative', () => {
    // Linking a decade of Wayback-imported events would run the documented namesake risk across
    // rows no reader is attending. This file changes the detector only.
    expect(SQL).not.toMatch(
      /create\s+or\s+replace\s+function\s+public\.(link_event_venues|find_event_venue_candidates|run_event_venue_link)/i,
    );
    expect(SQL).not.toMatch(/link_event_venues\s*\(/);
  });

  it('asserts behaviourally in BOTH directions, with a real positive control', () => {
    // A source-text check cannot tell a live predicate from a dead one, and P2/P3 alone are
    // satisfied perfectly by deleting the arm outright.
    expect(SQL).toMatch(/raise exception 'P2 failed: event % is out of the linker window/);
    expect(SQL).toMatch(/raise exception 'P3 failed: event % has no city_id/);
    expect(SQL).toMatch(/raise exception 'P4 failed: event % is reachable by the linker/);
    // P4's fixture must exclude the place-collision names, or it can select a row the linker
    // refuses for a different reason and the control proves nothing about the window.
    const p4 = SQL.slice(SQL.indexOf('into v_live'), SQL.indexOf('P4 failed: event %'));
    expect(p4).toContain('public.queer_villages');
    expect(p4).toContain('public.cities');
  });

  it('refuses a vacuous run when no fixture exists', () => {
    expect(SQL).toMatch(/P2 failed: no out-of-window fixture exists/);
    expect(SQL).toMatch(/P4 failed: no in-window fixture exists/);
  });

  it('asserts the drain it depends on, so stale rows cannot be stranded silently', () => {
    // Without run_event_quality_scan's auto-resolve branch the ~12,000 stale open rows stay open
    // forever and this change would read as having done nothing.
    // Anchored on the CONDITION, not on the string: `cleared_by_scan` also appears in the closing
    // `raise notice`, so asserting its mere presence passes with the guard neutered to `if false`.
    expect(SQL).toMatch(/if position\('cleared_by_scan' in coalesce\(v_src, ''\)\) = 0/);
    expect(SQL).toMatch(/or position\('not\(issue_code=any\(v_codes\)\)' in replace/);
    expect(SQL).toMatch(
      /raise exception\s*\n?\s*'P5 failed: run_event_quality_scan no longer auto-resolves/,
    );
  });

  it('pins no measured count in an executable position', () => {
    // The corpus moves: a postcondition asserting 16,193 or 13,820 fails on correct code the next
    // time ingest adds an event.
    const stmts = SQL.slice(0, SQL.lastIndexOf('$verify$'));
    expect(stmts).not.toMatch(/\b(16193|16196|13820|4255|2183)\b/);
  });

  it('every postcondition actually raises rather than merely computing', () => {
    expect((SQL.match(/raise exception\s*\n?\s*'P[1-5]/g) ?? []).length).toBeGreaterThanOrEqual(5);
    // A short-circuited guard leaves every string assertion above green while checking nothing.
    expect(SQL).not.toMatch(/if\s+false\s+then/i);
    expect(SQL).not.toMatch(/where\s+false/i);
  });
});
