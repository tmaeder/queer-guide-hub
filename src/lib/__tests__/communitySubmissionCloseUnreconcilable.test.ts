import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99980101100000_community_submission_close_unreconcilable.sql.
 *
 * 19 submissions sat at status='processing' with no ingestion_staging row, so
 * the reconciler reported them as `unresolved` every hour and nothing could
 * move them.
 *
 * The load-bearing fact: prune_ingestion_staging deletes ONLY rows whose
 * disposition IS DISTINCT FROM 'pending'. A pending row is never pruned at any
 * age, so a staged submission with no staging row PROVABLY reached a terminal
 * disposition — which verdict is what is unrecoverable, not whether one existed.
 *
 * Assertions run against COMMENT-STRIPPED sql: the header states the rule
 * verbatim, so a `toContain` over the raw file is satisfied by the prose with
 * the statement deleted.
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');
const VERSION = '99980101100000';

const raw = (() => {
  const file = readdirSync(MIGRATIONS).find((f) => f.startsWith(VERSION) && f.endsWith('.sql'));
  if (!file) throw new Error(`no migration at ${VERSION}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
})();

const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

/** The candidate CTE only. Several predicates repeat in the postconditions, so a
 *  whole-file assertion can pass against the wrong copy — the exact way the
 *  target-exists guard in 99940101110000 first went vacuous. */
const candCte = (() => {
  const i = sql.indexOf('WITH cand AS (');
  const j = sql.indexOf('), closed AS (', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
})();

/** The UPDATE's SET clause only. */
const setClause = (() => {
  const i = sql.indexOf('UPDATE public.community_submissions cs');
  const j = sql.indexOf('FROM cand c', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
})();

describe('close unreconcilable — what it selects', () => {
  it('only touches rows with NO staging row at all', () => {
    // A readable staging row is the reconciler's job. Closing one of those
    // would destroy a verdict that can still be read.
    expect(candCte).toMatch(/NOT EXISTS\s*\(/);
    expect(candCte).toContain("cs.status = 'processing'");
  });

  it('refuses a row a human already decided, or one already linked', () => {
    for (const guard of ['cs.reviewed_at IS NULL', 'cs.reviewer_notes IS NULL', 'cs.promoted_to_id IS NULL']) {
      expect(candCte).toContain(guard);
    }
  });

  it('keys on the condition, never a frozen id list', () => {
    // A frozen list cannot notice that a row has since acquired a staging row.
    expect(sql).not.toMatch(/4ed435af|f1fc5a30|c73e61af/);
    expect(sql).not.toMatch(/IN \(\s*'[0-9a-f]{8}-/);
  });
});

describe('close unreconcilable — what it writes', () => {
  it("closes to 'rejected', the only status producers treat as terminal", () => {
    // Any new status value is re-offered as open by the next producer pass,
    // which is the treadmill this close exists to end.
    expect(setClause).toMatch(/status\s*=\s*'rejected'/);
    expect(setClause).not.toMatch(/status\s*=\s*'(unresolved|closed|abandoned|unknown)'/);
  });

  it('leaves reviewed_by NULL so the close stays machine-legible', () => {
    expect(setClause).not.toMatch(/reviewed_by\s*=/);
    expect(sql).toMatch(/reviewed_by IS NOT NULL/); // asserted in the postcondition
  });

  it('records why, and says the content is recoverable', () => {
    expect(sql).toMatch(/auto-unreconcilable:/);
    expect(sql).toMatch(/re-submit to reprocess/i);
  });

  it('invents no link and forges no publication', () => {
    expect(setClause).not.toMatch(/promoted_to_id\s*=/);
    expect(setClause).not.toMatch(/promoted_to_table\s*=/);
  });

  it('suppresses no notification', () => {
    // All 19 carry a submitted_by, so the notify trigger fires; batching folds
    // it to one inbox row per user. Suppressing would mean a permanent
    // notify_submitter=false on real rows.
    expect(sql).not.toMatch(/notify_submitter\s*=/i);
    expect(sql).not.toMatch(/DISABLE TRIGGER/i);
  });
});

describe('close unreconcilable — postconditions', () => {
  it('asserts the reached state, not this run’s count', () => {
    expect(sql).toMatch(/IF v_left <> 0 THEN/);
    expect(sql).not.toMatch(/IF v_closed (<>|!=) 19/);
  });

  it('asserts the OPPOSITE direction too, so sweeping everything fails', () => {
    // "zero stranded" is equally satisfied by closing every submission in the
    // table. This check is what makes the first one mean something.
    expect(sql).toMatch(/v_wrong_open/);
    expect(sql).toMatch(/closed despite having a readable staging row/);
  });

  it('raises rather than reporting success on a bad end state', () => {
    const raises = sql.match(/RAISE EXCEPTION/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(3);
  });
});
