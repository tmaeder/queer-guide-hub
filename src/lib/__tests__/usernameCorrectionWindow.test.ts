/**
 * change_username gained a 30-day correction window (99991791139641).
 *
 * The window is only safe because a change inside it does NOT re-anchor
 * username_changed_at. Allowing a recent change while also stamping now()
 * would slide the window forward on every rename and turn a correction
 * grace period into unlimited churn -- which is the thing the 12-month rule
 * exists to prevent. So this file asserts BOTH halves: either one alone is a
 * defect, and a test that only checked the gate would pass against the
 * loophole version.
 *
 * Text-scanning the migration is the established pattern here (the function
 * body lives in SQL and the gate reads auth.uid(), so vitest cannot call it).
 * Assertions run against COMMENT-STRIPPED statements, because this
 * migration's header quotes the predicates it is about -- without stripping,
 * the header alone satisfies every check and the tests go vacuous.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '99991791139641_username_correction_window.sql';

const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Strip `--` line comments so prose cannot satisfy a code assertion. */
const stripComments = (sql: string) =>
  sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

const sql = stripComments(raw);

/** Everything before the verify block: the statements that actually run. */
const statements = sql.slice(0, sql.indexOf('DO $verify$'));
const verify = sql.slice(sql.indexOf('DO $verify$'));

describe('username correction window', () => {
  it('replaces change_username rather than adding a second writer', () => {
    expect(statements).toMatch(/CREATE OR REPLACE FUNCTION change_username\(new_username text\)/);
    // one definition only -- two would race on which is live
    expect(statements.match(/CREATE OR REPLACE FUNCTION change_username/g)).toHaveLength(1);
  });

  it('computes the window from the stored anchor, 30 days', () => {
    expect(statements).toMatch(
      /v_in_grace\s*:=\s*v_changed_at IS NOT NULL\s*AND v_changed_at > now\(\) - interval '30 days'/,
    );
  });

  it('half 1: the rate-limit gate yields to the window', () => {
    // the gate must consult v_in_grace, or a correction stays blocked
    expect(statements).toMatch(/AND NOT v_in_grace/);
  });

  it('half 2: a change inside the window does not re-anchor the clock', () => {
    // WITHOUT this the window renews on every rename == unlimited churn
    expect(statements).toMatch(/WHEN v_in_grace THEN username_changed_at/);
  });

  it('keeps the 12-month rule for a change outside the window', () => {
    expect(statements).toMatch(/AND v_changed_at > now\(\) - interval '12 months' THEN/);
    expect(statements).toMatch(/'error', 'rate_limited'/);
    expect(statements).toMatch(/v_changed_at \+ interval '12 months'/);
  });

  it('still frees the first claim and the post-auto-assign change', () => {
    expect(statements).toMatch(/IF v_old IS NOT NULL AND NOT v_auto/);
    expect(statements).toMatch(/WHEN v_old IS NULL OR v_auto THEN username_changed_at/);
  });

  it('still holds a 90-day redirect for every handle passed through', () => {
    // asserted because a correction chain A->B->C must leave A and B routed,
    // not just the handle the user started the day on
    expect(statements).toMatch(/INSERT INTO username_redirects/);
    expect(statements).toMatch(/expires_at = now\(\) \+ interval '90 days'/);
  });

  it('does not touch any profiles row', () => {
    // the locked user is freed by the rule, which is revertible; a hand-nulled
    // username_changed_at is not
    expect(statements).not.toMatch(/UPDATE profiles SET username_changed_at\s*=\s*NULL/i);
    expect(statements).not.toMatch(/username\s*=\s*'axi'/);
  });

  it('keeps anon locked out of the RPC', () => {
    expect(statements).toMatch(
      /REVOKE EXECUTE ON FUNCTION change_username\(text\) FROM PUBLIC, anon/,
    );
    expect(statements).toMatch(
      /GRANT EXECUTE ON FUNCTION change_username\(text\) TO authenticated/,
    );
  });

  it('postconditions assert both halves against the deployed function', () => {
    expect(verify).toMatch(/pg_get_functiondef/);
    expect(verify).toMatch(/position\('NOT v_in_grace' IN v_src\) = 0/);
    expect(verify).toMatch(/position\('WHEN v_in_grace THEN username_changed_at' IN v_src\) = 0/);
    expect(verify).toMatch(/position\('12 months' IN v_src\) = 0/);
    // three conditions, three raises -- a short-circuited block checks nothing
    expect(verify.match(/RAISE EXCEPTION/g)).toHaveLength(3);
    expect(verify).not.toMatch(/\bfalse\b/);
  });
});
