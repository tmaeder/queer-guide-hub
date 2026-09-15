import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 90000101100000_community_submission_status_reconcile.sql.
 *
 * community_submissions.status had no terminal writer on the pipeline path:
 * source-community-submissions set 'processing' and nothing wrote back, so 74
 * submissions sat there (oldest 2026-04-13) while the pipeline had in fact
 * committed 14 and rejected 41 of them.
 *
 * Assertions run against COMMENT-STRIPPED sql. The migration header quotes the
 * defect and the rule verbatim, so a `toContain` over the raw file is satisfied
 * by the prose with the statement deleted.
 */

const MIGRATIONS = join(__dirname, '../../../supabase/migrations');

function latestMigration(needle: string): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql') && readFileSync(join(MIGRATIONS, f), 'utf8').includes(needle))
    .sort()
    .pop();
  if (!file) throw new Error(`no migration contains ${needle}`);
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** Drop `--` line comments so header prose cannot satisfy an assertion. */
function statementsOf(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

const raw = latestMigration('run_community_submission_reconcile');
const sql = statementsOf(raw);

/** The body between CREATE FUNCTION run_community_submission_reconcile and its closing $$. */
const fnBody = (() => {
  const i = sql.indexOf('CREATE OR REPLACE FUNCTION public.run_community_submission_reconcile');
  const j = sql.indexOf('ALTER FUNCTION public.run_community_submission_reconcile', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return sql.slice(i, j);
})();

/** The single UPDATE ... FROM cand statement. */
const updateStmt = (() => {
  const i = fnBody.indexOf('UPDATE public.community_submissions cs');
  const j = fnBody.indexOf('RETURNING c.disposition', i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return fnBody.slice(i, j);
})();

describe('community submission reconcile — candidate selection', () => {
  it('joins staging on the UNDERSCORE-prefixed _submission_id key', () => {
    // source_type is 'community-submission', not 'user_submission', and the key
    // in raw_data carries a leading underscore. Both wrong guesses cost a round
    // of false "zero rows" during the investigation.
    expect(fnBody).toContain("raw_data->>'_submission_id'");
    expect(fnBody).not.toContain("raw_data->>'submission_id'");
  });

  it('carries the partial-index predicate at EVERY staging lookup', () => {
    // ix_ingestion_staging_submission_id is PARTIAL on `raw_data ? '_submission_id'`.
    // Postgres cannot prove `->>'k' = <text>` implies `? 'k'`, so a lookup missing
    // the `?` test silently loses the index and seq-scans 228k rows. Measured on
    // prod: that blew the statement timeout even with the index freshly built in
    // the same transaction — it is not "slower", it is "does not complete".
    //
    // The line reads as redundant, which is exactly why it needs a guard: it is
    // the first thing a cleanup pass deletes, and nothing fails loudly afterwards
    // until the reconciler starts timing out on a corpus nobody is watching.
    const lookups = sql.match(/raw_data->>'_submission_id'\s*=\s*cs\.id::text/g) ?? [];
    expect(lookups.length).toBeGreaterThanOrEqual(3); // LATERAL, unresolved count, postcondition
    const guarded =
      sql.match(/raw_data \? '_submission_id'\s*\n?\s*AND\s+st\.raw_data->>'_submission_id'/g) ??
      [];
    expect(guarded).toHaveLength(lookups.length);
  });

  it('only dispositions rows whose staging row reached a TERMINAL state', () => {
    // 'pending' is still in flight. Dispositioning it would tell a submitter
    // their submission was rejected while the pipeline is still working on it.
    expect(fnBody).toMatch(
      /s\.disposition IN \('committed',\s*'inserted',\s*'updated',\s*'rejected'\)/,
    );
    expect(fnBody).not.toMatch(/s\.disposition IN \([^)]*'pending'/);
  });

  it("treats 'inserted' and 'updated' as published, not only 'committed'", () => {
    // THE BUG THIS EXISTS FOR. pipeline-commit writes disposition 'committed',
    // so reading the code yields that word — but this corpus is committed by the
    // commit_*_staging_batch RPCs, which write 'inserted' (new record) or
    // 'updated' (enrich onto an existing one). Measured on prod over the 74
    // stuck rows: rejected 41, inserted 9, updated 5, committed ZERO.
    //
    // A ('committed','rejected') filter approves nothing, rejects 41, and strands
    // all 14 published rows at 'processing' forever — telling the operator
    // "not published" about 14 records that are live.
    expect(fnBody).toContain("'inserted'");
    expect(fnBody).toContain("'updated'");
    expect(fnBody).not.toMatch(/disposition IN \('committed',\s*'rejected'\)/);
  });

  it('counts any disposition it cannot act on, rather than ignoring it', () => {
    // The vocabulary has nine values and this file maps six. An unmapped one
    // (error/skipped/cleared/review) silently strands rows, which is the same
    // shape as the 'committed' mistake. v_unhandled makes it a number in the run
    // summary instead of an absence.
    expect(fnBody).toMatch(/v_unhandled/);
    expect(fnBody).toMatch(
      /disposition NOT IN\s*\n?\s*\('pending',\s*'committed',\s*'inserted',\s*'updated',\s*'rejected'\)/,
    );
    expect(fnBody).toMatch(/'unhandled',\s*v_unhandled/);
  });

  it('prefers a commit over a rejection when a submission was staged twice', () => {
    // A re-stage after a fix leaves both rows. If any attempt published, the
    // submission was published — ordering by created_at alone would report the
    // published row as rejected.
    expect(fnBody).toMatch(/ORDER BY \(st\.disposition NOT IN \('rejected',\s*'pending'\)\) DESC/);
  });

  it('leaves rows with no staging row alone and reports them', () => {
    // 19 of the 74 have no surviving staging row. No evidence of their
    // disposition exists; guessing one publishes an unverifiable claim.
    expect(fnBody).toContain('JOIN LATERAL');
    expect(fnBody).not.toContain('LEFT JOIN LATERAL');
    expect(fnBody).toMatch(/v_unresolved/);
    expect(fnBody).toMatch(/'unresolved',\s*v_unresolved/);
  });
});

describe('community submission reconcile — the write', () => {
  it('sets status and promoted_to_* in ONE statement', () => {
    // tg_submission_status_notify reaches its 'published' branch via
    // promoted_to_id changing, and that branch is the only one that resolves a
    // slug and links the live page. Two statements would send a bare "approved"
    // first and the notify trigger's 30-minute batching would swallow the
    // second.
    expect(updateStmt).toContain('SET status =');
    expect(updateStmt).toContain('promoted_to_id');
    expect(updateStmt).toContain('promoted_to_table');
  });

  it('maps committed -> approved and rejected -> rejected', () => {
    // 'approved' is the value trust_submission_accepted keys on; anything else
    // silently drops the trust credit owed for a published submission.
    expect(updateStmt).toMatch(
      /CASE WHEN c\.disposition = 'rejected' THEN 'rejected' ELSE 'approved' END/,
    );
  });

  it('never overwrites a value a human already wrote', () => {
    for (const col of ['promoted_to_id', 'promoted_to_table', 'reviewer_notes', 'reviewed_at']) {
      expect(updateStmt).toMatch(new RegExp(`COALESCE\\(\\s*cs\\.${col}`));
    }
  });

  it('carries a rejection reason only for rejections', () => {
    expect(updateStmt).toMatch(/CASE WHEN c\.disposition = 'rejected'/);
    expect(updateStmt).toMatch(/c\.review_notes/);
  });

  it('does not suppress submitter notifications', () => {
    // Deliberate: the notify trigger folds the whole backfill into ~one inbox
    // row per (user, outcome), and suppressing would mean stamping a permanent
    // notify_submitter=false on real rows to avoid two entries.
    expect(sql).not.toMatch(/notify_submitter\s*=\s*false/i);
    expect(sql).not.toMatch(/DISABLE TRIGGER/i);
  });
});

describe('community submission reconcile — scheduling', () => {
  it('registers in admin_automations as the registry of record', () => {
    expect(sql).toContain("'community_submission_reconcile'");
    expect(sql).toContain('INSERT INTO public.admin_automations');
    expect(sql).toMatch(/ON CONFLICT \(slug\) DO UPDATE/);
  });

  it("uses action.type='rpc' so the cron reconciler cannot recreate it", () => {
    // An rpc row carries no action.command, so sync_automations_to_cron()
    // branch (d) structurally cannot reschedule or re-wrap this job — the
    // cron.schedule below stays the only scheduler.
    expect(sql).toMatch(/"type"\s*:\s*"rpc"/);
    expect(sql).not.toMatch(/"type"\s*:\s*"cron"/);
  });

  it('schedules exactly one cron job', () => {
    expect(sql).toMatch(/cron\.schedule\(\s*\n?\s*'community_submission_reconcile'/);
    expect(sql).toContain("cron.unschedule('community_submission_reconcile')");
  });

  it('is service_role only', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.run_community_submission_reconcile\(int\) FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.run_community_submission_reconcile\(int\) TO service_role/,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.run_community_submission_reconcile\(int\) TO (authenticated|anon)/,
    );
  });
});

describe('community submission reconcile — backfill and postconditions', () => {
  it('backfills by calling the reconciler, not by a separate hand-written UPDATE', () => {
    // One implementation. A separate backfill statement can drift from the
    // recurring one and then the repair proves nothing about the mechanism.
    expect(sql).toMatch(/v_result := public\.run_community_submission_reconcile\(500\)/);
    const updates = sql.match(/UPDATE public\.community_submissions/g) ?? [];
    expect(updates).toHaveLength(1);
  });

  it('loops the backfill so a corpus larger than one batch cannot abort db push', () => {
    expect(sql).toMatch(
      /LOOP[\s\S]*run_community_submission_reconcile\(500\)[\s\S]*EXIT WHEN v_moved = 0/,
    );
  });

  it('asserts the REACHED state, not a dated row count', () => {
    // A count measured on a 2026-09-15 snapshot of prod aborts db push on main
    // the moment a concurrent session moves one row.
    const verify = sql.slice(sql.indexOf('DO $verify$'));
    expect(verify).toMatch(/v_stranded <> 0/);
    expect(verify).toMatch(/cs\.status = 'processing'[\s\S]*EXISTS/);
    expect(verify).not.toMatch(/<>\s*(74|55|14|41|19)\b/);
  });

  it('uses a postcondition predicate WIDER than the mapping it checks', () => {
    // A postcondition built from the function's own disposition list is
    // self-consistent and vacuous: that is precisely how the ('committed',
    // 'rejected') version passed while stranding 14 published rows, because it
    // never counted them as stranded in the first place.
    //
    // `<> 'pending'` is the only form that can fail on a value the function does
    // not know about.
    const verify = sql.slice(sql.indexOf('DO $verify$'));
    expect(verify).toMatch(/st\.disposition <> 'pending'/);
    expect(verify).not.toMatch(/st\.disposition IN \(/);
  });

  it('asserts the cron and the registry row survived', () => {
    const verify = sql.slice(sql.indexOf('DO $verify$'));
    expect(verify).toMatch(/v_scheduled <> 1/);
    expect(verify).toMatch(/slug = 'community_submission_reconcile' AND enabled/);
  });

  it('indexes the jsonb join key', () => {
    // Without it every run is a full scan of ingestion_staging per candidate.
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS ix_ingestion_staging_submission_id[\s\S]*raw_data->>'_submission_id'/,
    );
    expect(sql).toMatch(/WHERE raw_data \? '_submission_id'/);
  });
});
