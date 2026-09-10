import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `organizations.needs_attention` was true on 88.3% of rows (5,738 / 6,497),
 * which makes it indistinguishable from no signal — the same failure
 * 20260820191944 fixed for venues at 99.5%.
 *
 * The rule shipped in 20260716214000 as
 * `completeness < 40 OR email_missing`. The second arm flags a row however
 * complete it otherwise is, and only 759 organizations (11.7%) have an email
 * at all — a directory sourced from ILGA/Wikipedia legitimately has no public
 * email for most rows. 3,216 rows, 56% of every flag, were flagged ONLY for
 * that. It also double-counts: email is already 15 of the 100 completeness
 * points, so a missing one has already lowered the score.
 *
 * 20370801100000 drops the arm. This guards against it coming back — the flag
 * has live readers (`src/hooks/useBusinessSpine.ts` filters on it,
 * `AdminBusiness.tsx` renders it), so a regression is silently useless UI
 * rather than an error.
 *
 * Text check against the migrations directory, so it runs in CI without
 * credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/**
 * Strip `--` line comments. The migration explains the removed arm in prose
 * and names `email_missing` there; without this a `toMatch` would be satisfied
 * by the header while the guard itself was gone.
 */
function statementsOnly(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const raw = latestDefinitionOf('run_org_quality_recompute');
const sql = statementsOnly(raw);

/** The body of the function, excluding the trailing COMMENT ON / DO blocks. */
const body = (() => {
  const start = sql.search(
    /create\s+(or\s+replace\s+)?function\s+public\.run_org_quality_recompute\s*\(/i,
  );
  const end = sql.indexOf('END; $$;', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
})();

describe('run_org_quality_recompute flags on completeness alone', () => {
  it('writes needs_attention from the score and nothing else', () => {
    const assignments = [
      ...body.matchAll(/needs_attention\s*(?:=|IS DISTINCT FROM)\s*\(([^)]*)\)/gi),
    ].map((m) => m[1].trim());

    // Both the SET and the diff guard must use the same predicate.
    expect(assignments.length).toBeGreaterThanOrEqual(2);
    for (const predicate of assignments) {
      expect(predicate).toMatch(/new_completeness\s*<\s*40/i);
      expect(predicate).not.toMatch(/\bor\b/i);
      expect(predicate).not.toMatch(/email/i);
    }
  });

  it('has no email-presence flag anywhere in the function body', () => {
    expect(body).not.toMatch(/email_missing/i);
    // `email` may only appear as a weighted term in the score.
    const emailLines = body.split('\n').filter((l) => /email/i.test(l));
    expect(emailLines.length).toBeGreaterThan(0); // it is still scored
    for (const line of emailLines) {
      expect(line).toMatch(/\*\s*15/);
    }
  });

  it('still scores email as 15 of the 100 completeness points', () => {
    expect(body).toMatch(/NULLIF\(trim\(o\.email\), ''\)\s*IS NOT NULL\)::int \* 15/i);
  });
});

describe('the repair migration asserts its own postcondition', () => {
  it('fails on a surviving flag above the threshold', () => {
    expect(sql).toMatch(/needs_attention\s+AND\s+completeness_score\s*>=\s*40/i);
    expect(sql).toMatch(/RAISE EXCEPTION[^;]*scoring >= 40/i);
  });

  it('carries a positive control so a rule that flags nothing also fails', () => {
    expect(sql).toMatch(/v_flagged\s*=\s*0\s+THEN/i);
    expect(sql).toMatch(/RAISE EXCEPTION[^;]*flags nothing/i);
  });
});
