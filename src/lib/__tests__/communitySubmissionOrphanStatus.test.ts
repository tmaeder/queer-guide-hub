import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99940101110000_community_submission_orphan_status_repair.sql.
 *
 * One submission was published (staging disposition 'inserted' into `events`,
 * target still live) and parked at status='pending_review' — a value NOTHING in
 * the repo writes to community_submissions.status. The reconciler's selector
 * reads status='processing', so it could never see the row.
 *
 * Assertions run against COMMENT-STRIPPED sql: the header quotes the defect and
 * the vocabulary verbatim, so a `toContain` over the raw file is satisfied by
 * the prose with the statement deleted.
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');
const VERSION = '99940101110000';

const raw = (() => {
  const file = readdirSync(MIGRATIONS).find((f) => f.startsWith(VERSION) && f.endsWith('.sql'));
  if (!file) throw new Error(`no migration at ${VERSION}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
})();

/** Drop `--` line comments so header prose cannot satisfy an assertion. */
const sql = raw
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n');

/** The candidate-selection CTE only. Scoping matters: several predicates appear
 *  both here and in the postconditions, so a whole-file assertion can pass
 *  against the wrong copy while the one that selects rows has been deleted. */
const candCte = (() => {
  const i = sql.indexOf('WITH cand AS (');
  const j = sql.indexOf('), fixed AS (', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
})();

/** The UPDATE's SET clause only — a negative assertion over the whole file is
 *  satisfied by the statement's own guards, which quote the same columns. */
const setClause = (() => {
  const i = sql.indexOf('UPDATE public.community_submissions cs');
  const j = sql.indexOf('FROM cand c', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
})();

describe('orphan status repair — what it selects', () => {
  it('keys on the CONDITION, never on the submission id', () => {
    // A frozen id cannot notice that someone dispositioned the row first. The
    // condition can: it matches nothing and the file no-ops.
    expect(sql).not.toMatch(/051f7539/);
    expect(sql).toContain("cs.status = 'pending_review'");
  });

  it('requires the published record to STILL EXIST', () => {
    // Approving a submission whose record was deleted is exactly the defect
    // 99910101100000 exists to prevent; this repair must not reintroduce it.
    //
    // SCOPED TO THE CANDIDATE CTE ON PURPOSE. The first version of this
    // assertion ran over the whole file and SURVIVED a mutation that deleted
    // this very gate — `IS TRUE` also appears in the postcondition below, so the
    // regex matched the other copy while the one that selects rows was gone.
    // Assert the half of the statement the test is about, and count the
    // occurrences so a deletion anywhere is visible.
    expect(candCte).toMatch(/community_submission_target_exists\([\s\S]{0,80}?\)\s*IS TRUE/);
    const gates = sql.match(/community_submission_target_exists\([\s\S]{0,80}?\)\s*IS TRUE/g) ?? [];
    expect(gates).toHaveLength(2); // candidate selection + postcondition
  });

  it('only acts on a PUBLISHED staging row', () => {
    expect(sql).toMatch(/disposition IN \('committed',\s*'inserted',\s*'updated'\)/);
    expect(sql).not.toMatch(/disposition IN \([^)]*'pending'/);
  });

  it('refuses a row a human already decided', () => {
    expect(sql).toContain('cs.reviewed_at IS NULL');
    expect(sql).toContain('cs.reviewer_notes IS NULL');
  });

  it('selects the candidate in a CTE, not an UPDATE ... FROM LATERAL', () => {
    // A LATERAL in an UPDATE's FROM cannot reference the update target's alias
    // (42P10). The first draft did exactly that and the prod dry run caught it.
    expect(sql).toMatch(/WITH cand AS \(/);
    expect(sql).not.toMatch(/UPDATE public\.community_submissions cs[\s\S]{0,200}FROM LATERAL/);
  });
});

describe('orphan status repair — what it writes', () => {
  it('advances to approved and links the record', () => {
    expect(setClause).toMatch(/status\s*=\s*'approved'/);
    expect(setClause).toContain('promoted_to_id');
    expect(setClause).toContain('promoted_to_table');
  });

  it('never overwrites a value already present', () => {
    for (const col of ['promoted_to_id', 'promoted_to_table', 'reviewed_at']) {
      expect(setClause).toMatch(new RegExp(`COALESCE\\(\\s*cs\\.${col}`));
    }
  });

  it('does not touch reviewer_notes', () => {
    // The repair records no human decision, because none was made.
    expect(setClause).not.toMatch(/reviewer_notes\s*=/);
  });

  it('suppresses no trigger and forges no submitter', () => {
    // Both triggers are inert on this row because submitted_by IS NULL —
    // verified on the row, not arranged by the migration.
    expect(sql).not.toMatch(/notify_submitter\s*=/i);
    expect(sql).not.toMatch(/DISABLE TRIGGER/i);
    expect(sql).not.toMatch(/submitted_by\s*=/);
  });
});

describe('orphan status repair — postconditions', () => {
  it('asserts the REACHED state, not the rows this run changed', () => {
    // A count of "rows I updated" fails when a concurrent session already did
    // the work, which turns a correct state into an aborted db push on main.
    expect(sql).toMatch(/IF v_orphans <> 0 THEN/);
    expect(sql).not.toMatch(/IF v_fixed (<>|!=) 1/);
  });

  it('spells the live status vocabulary so a new orphan is caught too', () => {
    expect(sql).toMatch(
      /status NOT IN \('pending',\s*'processing',\s*'approved',\s*'rejected',\s*'duplicate',\s*'needs_info'\)/,
    );
  });

  it('re-checks that no approved submission points at a deleted record', () => {
    expect(sql).toMatch(/IS FALSE\)?\s*\)?\s*THEN[\s\S]{0,200}points at a deleted record/);
  });

  it('raises rather than reporting success on a bad end state', () => {
    const raises = sql.match(/RAISE EXCEPTION/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(2);
  });
});
