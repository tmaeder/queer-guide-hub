import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { deathPenaltyRisk } from '@/utils/equalityScore';

/**
 * The capital-penalty reading exists in TWO languages and they must agree.
 *
 * ILGA splits the fact across `death_penalty` and `penalty`, and neither is sufficient:
 *
 *   Yemen     death_penalty 'Yes'                penalty 'Death Penalty'
 *   Nigeria   death_penalty 'Yes'                penalty '10 years to life in prison'
 *   Qatar     death_penalty 'No legal certainty' penalty 'Death Penalty (possible)'
 *
 * The TypeScript side (`deathPenaltyRisk`) modelled three states; the SQL side tested
 * `death_penalty = 'yes'` and therefore read "the source cannot rule out execution" as
 * "the source says no". Five countries sat in that gap — AE, AF, PK, QA, SO — and
 * `compose_safety_note` rated Kabul `high` rather than `critical`, burying the capital
 * penalty in a parenthetical instead of stating it.
 *
 * `20260904203201` ported the TS definition into SQL. This test exists so the two cannot
 * drift again: it checks the TS function on the cases that define the boundary, and checks
 * that the SQL function still encodes the same four branches in the same order. Order is
 * load-bearing — Nigeria is 'Yes' while its penalty names only prison, so the affirmative
 * `death_penalty` test must run before the `penalty` fallback.
 *
 * Text check against the migrations directory, so it runs in CI without credentials.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * Strip `--` comments before asserting anything about the SQL.
 *
 * These migrations explain the defect at length, so the prose contains every phrase the
 * code contains. Without this, `toMatch(/no legal certainty/)` matches the COMMENT that
 * documents the branch and passes even when the branch itself has been deleted —
 * mutation-verified: removing the `'no legal certainty' THEN 'possible'` line left all 12
 * tests green. A guard that reads the explanation instead of the code guards nothing.
 */
function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

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

/** The five countries that only exist because the third state is real. */
const POSSIBLE = { death_penalty: 'No legal certainty', penalty: 'Death Penalty (possible)' };

describe('deathPenaltyRisk models three states, not two', () => {
  it('confirmed when the field says so', () => {
    expect(deathPenaltyRisk({ death_penalty: 'Yes', penalty: 'Death Penalty' })).toBe('confirmed');
  });

  it('confirmed for Nigeria, whose penalty names only prison', () => {
    // Rules out reading `penalty` alone.
    expect(
      deathPenaltyRisk({ death_penalty: 'Yes', penalty: '10 years to life in prison' }),
    ).toBe('confirmed');
  });

  it('POSSIBLE for "No legal certainty" — never none', () => {
    // The whole defect: absence of certainty is not a negative finding.
    expect(deathPenaltyRisk(POSSIBLE)).toBe('possible');
    expect(deathPenaltyRisk(POSSIBLE)).not.toBe('none');
  });

  it('none for an ordinary non-criminalising country', () => {
    expect(deathPenaltyRisk({ death_penalty: 'No', penalty: null })).toBe('none');
  });

  it('none for Sudan — "No" with a prison penalty', () => {
    // The State Dept corroborator flagged Sudan, but ILGA is right: the 2020 reform
    // replaced execution with life imprisonment. Widening into this would be wrong.
    expect(
      deathPenaltyRisk({ death_penalty: 'No', penalty: '10 years to life in prison' }),
    ).toBe('none');
  });

  it('none, not a crash, on a missing object', () => {
    expect(deathPenaltyRisk(null)).toBe('none');
    expect(deathPenaltyRisk(undefined)).toBe('none');
  });
});

describe('the SQL mirror encodes the same reading', () => {
  const sql = stripSqlComments(latestDefinitionOf('death_penalty_risk'));

  it('returns the same three states', () => {
    for (const state of ['confirmed', 'possible', 'none']) {
      expect(sql).toContain(`'${state}'`);
    }
  });

  it('treats "no legal certainty" as possible', () => {
    // Asserted as the whole branch, not the phrase: the phrase alone also appears in the
    // header comment, so matching it proved nothing (see stripSqlComments).
    expect(sql).toMatch(/no legal certainty'\s*THEN\s*'possible'/i);
  });

  it('tests death_penalty before falling back to penalty', () => {
    // Nigeria is why: 'Yes' with a prison-only penalty string must stay `confirmed`.
    const dpAt = sql.search(/'death_penalty'[\s\S]{0,80}yes/i);
    const penaltyAt = sql.search(/->>'penalty'/i);
    expect(dpAt).toBeGreaterThan(-1);
    expect(penaltyAt).toBeGreaterThan(-1);
    expect(dpAt).toBeLessThan(penaltyAt);
  });

  it('is IMMUTABLE so callers can use it in a WHERE clause', () => {
    expect(sql).toMatch(/IMMUTABLE/i);
  });
});

describe('the safety gate uses the shared reading', () => {
  const gate = stripSqlComments(latestDefinitionOf('location_is_high_risk'));

  it('no longer hardcodes a bare = \'yes\' test', () => {
    expect(gate).toContain('death_penalty_risk');
    expect(gate).not.toMatch(/death_penalty'\s*\)\s*,\s*''\s*\)\s*\)\s*=\s*'yes'/i);
  });

  it('still gates on criminalisation independently of the capital penalty', () => {
    // The two arms are separate: a criminalising country with no death penalty must
    // still gate, which is what keeps the widening a no-op for stored rows.
    expect(gate).toMatch(/'legal'\s*\)\s*=\s*'false'/);
  });
});
