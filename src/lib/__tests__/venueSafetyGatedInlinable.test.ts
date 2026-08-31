import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `public.venue_is_safety_gated` must stay inlinable.
 *
 * It is a three-line wrapper — one schema-qualified call plus a literal
 * comparison — and it carries NO `SET search_path` on purpose. A function with
 * a `SET` clause can never be inlined by Postgres, because the GUC has to be
 * established at call time, and this wrapper sits inside
 * `release_gate_checks()`'s `city_safety_gate_drift` arm, which evaluates it
 * once per row across 26,863 venues.
 *
 * Measured on prod (20261117110000): with the clause the arm costs 6,452 ms and
 * the whole RPC 8,916 ms, against `authenticator`'s 8 s statement_timeout — so
 * the gate fails at random and takes unrelated PRs red with it. Without the
 * clause the arm costs ~800 ms.
 *
 * Re-adding `SET search_path` therefore does not merely slow something down; it
 * silently reintroduces a required check that fails on the bad days. Nothing in
 * CI would attribute that to the edit that caused it, which is why this is a
 * test and not a comment.
 *
 * The safety half is asserted too: the wrapper may not grow a table reference.
 * The clause protects nothing only for as long as the body stays table-free —
 * `public.location_is_high_risk`, which does read tables, keeps its own `SET`.
 */
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/** Strip `--` line comments; the header deliberately NAMES the banned clause. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** The most recent migration that (re)defines the function, by version order. */
function latestDefinition(): { file: string; body: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  let found: { file: string; body: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const re =
      /create\s+or\s+replace\s+function\s+public\.venue_is_safety_gated\s*\([\s\S]*?\$\$[\s\S]*?\$\$\s*;/gi;
    const matches = sql.match(re);
    if (matches && matches.length > 0) {
      found = { file, body: matches[matches.length - 1] };
    }
  }
  if (!found) throw new Error('no migration defines public.venue_is_safety_gated');
  return found;
}

describe('venue_is_safety_gated stays inlinable', () => {
  it('is defined by at least one migration', () => {
    expect(latestDefinition().file).toMatch(/^\d{14}_/);
  });

  it('carries no SET clause — a SET makes it un-inlinable and the gate times out', () => {
    // Comments are stripped first: the migration header names the banned clause
    // on purpose, to explain why it is absent. The first draft of this test
    // failed on its own documentation.
    const { body } = latestDefinition();
    expect(stripComments(body)).not.toMatch(/\bset\s+search_path\b/i);
  });

  it('still delegates to the shared predicate rather than inlining a copy', () => {
    // `20261112100000` deleted an inlined copy of the geographic predicate from
    // the gate after it produced 96 false positives. The speedup must not
    // reintroduce one: this wrapper is the ONE place the two rules meet.
    const { body } = latestDefinition();
    expect(body).toMatch(/public\.location_is_high_risk\s*\(/);
    expect(body).toMatch(/'cruising'/);
  });

  it('references no table, which is why dropping the SET is safe', () => {
    const { body } = latestDefinition();
    const sqlBody = body.slice(body.indexOf('$$') + 2, body.lastIndexOf('$$'));
    const withoutComments = stripComments(sqlBody);
    expect(withoutComments).not.toMatch(/\bfrom\s+\w/i);
    expect(withoutComments).not.toMatch(/\bjoin\b/i);
  });
});
