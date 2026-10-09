/**
 * Guards 99991791560472_feedback_board_v_anon_exposure.sql and arm 3 of
 * scripts/check-definer-view-grants.mjs.
 *
 * `feedback_board_v` ran as its owner (no `security_invoker`) and granted SELECT
 * to anon, so it served EVERY user's feedback to anonymous visitors — 140 rows —
 * while the base table `community_submissions` correctly answered anon with 401
 * and its RLS policy restricts reads to the row's own author plus admins.
 *
 * EVERY ASSERTION RUNS OVER COMMENT-STRIPPED SQL. The migration's header quotes
 * each phrase being asserted — including the grants it removes and the privilege
 * list arm 1 was missing — so a `toContain` over the raw file passes with the
 * executable statement deleted. That trap is recorded in CLAUDE.md and has bitten
 * this repo repeatedly.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../..');
const MIGRATION = '99991791560472_feedback_board_v_anon_exposure.sql';

const rawSql = readFileSync(join(ROOT, 'supabase/migrations', MIGRATION), 'utf8');
const gate = readFileSync(join(ROOT, 'scripts/check-definer-view-grants.mjs'), 'utf8');

/** Strip line comments and block comments, leaving only executable SQL. */
const sql = rawSql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The statements, excluding the verify block — assertions must not match it. */
const statements = sql.slice(0, sql.indexOf('do $verify$'));
/** The verify block alone. */
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('feedback_board_v anon exposure — the fix', () => {
  it('makes the view honour the caller RLS', () => {
    expect(statements).toMatch(
      /alter\s+view\s+public\.feedback_board_v\s+set\s*\(\s*security_invoker\s*=\s*true\s*\)/i,
    );
  });

  it('revokes SELECT from BOTH api roles', () => {
    // authenticated matters as much as anon: the RLS policy it bypassed limits a
    // member to their OWN rows, so leaving `authenticated` would still expose
    // every user's feedback to every signed-in member.
    expect(statements).toMatch(/revoke\s+select\s+on\s+public\.feedback_board_v\s+from\s+anon/i);
    expect(statements).toMatch(
      /revoke\s+select\s+on\s+public\.feedback_board_v\s+from\s+authenticated/i,
    );
  });

  it('does NOT restate the view definition', () => {
    // `create or replace view` re-strips the reloption this migration sets, and
    // the body is absent from the repo so it cannot be diffed against anything.
    expect(statements).not.toMatch(/create\s+or\s+replace\s+view\s+public\.feedback_board_v/i);
  });

  it('does not widen the base table to compensate', () => {
    expect(statements).not.toMatch(/create\s+policy[\s\S]{0,200}community_submissions/i);
    expect(statements).not.toMatch(/grant\s+select\s+on\s+public\.community_submissions/i);
  });
});

describe('arm 3 RPC — the seal', () => {
  it('matches SELECT, the privilege arm 1 omits', () => {
    const fn = statements.slice(statements.indexOf('definer_view_api_read_grants'));
    expect(fn).toMatch(/privilege_type\s*=\s*'SELECT'/i);
    // Arm 1 owns the write set; arm 3 must not silently duplicate it.
    expect(fn).not.toMatch(/'INSERT'/i);
  });

  it('includes PUBLIC, not just anon', () => {
    // Revoking from `anon` does not remove a grant made to PUBLIC, and such a
    // view is readable through every role at once — the exact shape a check
    // written only against `anon` reports as clean.
    const fn = statements.slice(statements.indexOf('definer_view_api_read_grants'));
    expect(fn).toMatch(/'anon'\s*,\s*'authenticated'\s*,\s*'public'\s*,\s*'PUBLIC'/i);
  });

  it('exempts security_invoker views', () => {
    // With the option on, the read runs as the caller and RLS applies, so a
    // public projection there is an explicit choice rather than a bypass.
    const fn = statements.slice(statements.indexOf('definer_view_api_read_grants'));
    expect(fn).toMatch(/security_invoker[\s\S]{0,160}in\s*\(\s*'false'\s*,\s*'off'\s*\)/i);
  });

  it('is not reachable by an api role', () => {
    // A definer function granted to `authenticated` is granted to every member.
    const fn = statements.slice(statements.indexOf('create or replace function'));
    expect(fn).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.definer_view_api_read_grants\(\)\s+from\s+public/i,
    );
    expect(fn).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.definer_view_api_read_grants\(\)\s+from\s+anon/i,
    );
    expect(fn).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.definer_view_api_read_grants\(\)\s+from\s+authenticated/i,
    );
    expect(fn).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.definer_view_api_read_grants\(\)\s+to\s+service_role/i,
    );
  });
});

describe('postconditions', () => {
  it('asserts the reached state, not a count of what it changed', () => {
    // Six checks, each RAISING. Asserting the condition alone passes when the
    // `raise` is replaced by `null;` — a trap this repo has recorded.
    const raises = verify.match(/raise\s+exception\s+'P\d/gi) ?? [];
    expect(raises.length).toBe(6);
  });

  it('calls the RPC rather than re-implementing its query', () => {
    // A hand-copied mirror reports zero when the function body has a typo —
    // the gate would ship reporting clean because it matches nothing.
    expect(verify).toMatch(/from\s+public\.definer_view_api_read_grants\(\)/i);
  });

  it('gates the DENOMINATOR so zero cannot mean "measured nothing"', () => {
    expect(verify).toMatch(/v_definer_views\s*<\s*1/);
    expect(verify).toMatch(/P6 failed/);
  });

  it('asserts the base table protection it depends on is intact', () => {
    // The whole finding rests on community_submissions being closed to anon, so
    // a pass that came from opening the table would be worthless.
    expect(verify).toMatch(/P3 failed/);
    expect(verify).toMatch(/P4 failed/);
    expect(verify).toMatch(/has_any_role_jwt/);
  });
});

describe('the gate script wires arm 3', () => {
  const body = gate
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
    .join('\n');

  it('calls the new RPC', () => {
    expect(body).toMatch(/callRpc\(\s*'definer_view_api_read_grants'/);
  });

  it('fails the run rather than only printing', () => {
    const arm = body.slice(body.indexOf('definer_view_api_read_grants'));
    expect(arm).toMatch(/failed\s*=\s*true/);
  });

  it('keeps the allowlist empty and shrink-only', () => {
    // Empty today. A zero invariant is only honest while it stays empty, and an
    // entry that stops leaking must fail so it gets deleted rather than rotting
    // into an allowlist nobody re-reads.
    expect(body).toMatch(/DELIBERATELY_PUBLIC\s*=\s*new Set\(\[\s*\]\)/);
    expect(body).toMatch(/stale/);
  });

  it('still runs arms 1 and 2', () => {
    // Adding arm 3 must not displace the checks that already existed.
    expect(body).toMatch(/definer_view_api_write_grants/);
    expect(body).toMatch(/security_invoker_view_regressions/);
  });
});
