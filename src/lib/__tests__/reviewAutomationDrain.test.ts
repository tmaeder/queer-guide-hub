import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

/**
 * Read a migration's STATEMENTS, not its prose.
 *
 * Every assertion here is a text search over SQL, and these files carry long
 * explanatory headers that quote the exact phrases being asserted. Without
 * stripping, a guard can be deleted and the test still passes on the comment
 * that describes it — the vacuous-assertion class this repo has hit repeatedly
 * — and, in the mirror case, a postcondition can ABORT on its own prose, which
 * is what stopped #3693's five migrations from applying at all.
 */
function stripComments(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

/**
 * The function body only — CUT at the verify block.
 *
 * Not optional: these migrations' own postconditions contain the very strings
 * the body is asserted to have or lack, so a `not.toContain` over the whole
 * file matches the assertion that exists to forbid it, and a `toContain`
 * passes with the real statement deleted. Both directions are live here —
 * `_review_risk_blocked` appears in a verify guard precisely because it must
 * NOT appear in the body.
 */
function statementsOf(filename: string): string {
  const raw = stripComments(readFileSync(join(MIGRATIONS, filename), 'utf8'));
  const cut = raw.search(/DO \$verify\$/i);
  return cut === -1 ? raw : raw.slice(0, cut);
}

/** The postcondition block, for assertions that are ABOUT the postconditions. */
function verifyOf(filename: string): string {
  const raw = stripComments(readFileSync(join(MIGRATIONS, filename), 'utf8'));
  const cut = raw.search(/DO \$verify\$/i);
  return cut === -1 ? '' : raw.slice(cut);
}

function findMigration(needle: string): string {
  const hit = readdirSync(MIGRATIONS).find((f) => f.includes(needle));
  if (!hit) throw new Error(`no migration matching ${needle}`);
  return hit;
}

describe('staging reconciler — bookkeeping, never a disposition decision', () => {
  const sql = statementsOf(findMigration('staging_reconcile_phantom_review'));

  it('lands class A on auto, never approved', () => {
    // 'approved' fires trg_staging_human_approval_clears_validation, which
    // stamps ai_validation_result.human_override with a from/by/at record — it
    // would forge a human approval on 428 rows nobody looked at.
    expect(sql).toMatch(/review_status\s*=\s*'auto'/);
    expect(sql).not.toMatch(/review_status\s*=\s*'approved'/);
  });

  it('re-resolves the target row rather than trusting the pointer', () => {
    // target_record_id has no FK, so a merge or delete leaves a dangling uuid.
    // A dead pointer is not evidence of a successful commit.
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('target_record_id IS NOT NULL');
  });

  it('leaves machine writes legible', () => {
    expect(sql).toContain('auto-reconcile:');
    expect(sql).toMatch(/reviewed_by\s*=\s*NULL/);
  });

  it('asserts both directions — work to clear AND work left behind', () => {
    const verify = verifyOf(findMigration('staging_reconcile_phantom_review'));
    expect(verify).toContain('no phantom rows found');
    expect(verify).toContain('no genuinely-open rows left');
  });
});

describe('auto-approve — operator policy, with the two measured guards intact', () => {
  const sql = statementsOf(findMigration('review_queue_autoapprove'));

  it('reuses the shared apply internals instead of reimplementing apply', () => {
    // approve_entity_review cannot be called from cron (has_any_role_jwt), so
    // the internals are composed directly. Reimplementing the apply_mode
    // dispatch would be a second writer of the same rule.
    expect(sql).toContain('_apply_review_value');
    expect(sql).toContain('_review_write_provenance');
    expect(sql).toContain('_review_clear_needs_attention');
  });

  it('never attributes a machine approval to a human', () => {
    expect(sql).toMatch(/reviewer_id\s*=\s*NULL/);
    expect(sql).toContain("'llm'");
    expect(sql).not.toContain("'llm+human'");
    expect(sql).toContain('human_reviewed');
  });

  it('rejects unreachable entities rather than publishing to a dead page', () => {
    expect(sql).toContain('ghost');
    expect(sql).toContain('auto-unactionable:');
  });

  it('blocks a safety note that does not name its own country', () => {
    // The live tail of the incident where 86 published notes described a
    // DIFFERENT country's laws. Measured: 3 such rows sit at >=0.90 today, so
    // a pure threshold would publish all three.
    expect(sql).toContain('NOT ILIKE');
    expect(sql).toContain('auto-blocked:');
  });

  it('classifies per-row failures instead of aborting or swallowing them', () => {
    expect(sql).toContain('EXCEPTION WHEN OTHERS');
    expect(sql).toMatch(/v_errors\s*:?=\s*v_errors\s*\+\s*1/);
  });

  it('requires live work for BOTH guards, so neither ships untested', () => {
    const verify = verifyOf(findMigration('review_queue_autoapprove'));
    expect(verify).toContain('unreachable guard has no live work');
    expect(verify).toContain('wrong-country guard has no live work');
  });
});

describe('automation status — an honest split, gated and cheap', () => {
  const sql = statementsOf(findMigration('review_automation_status'));

  it('is role-gated and returns empty rather than raising', () => {
    expect(sql).toContain('has_any_role_jwt');
    expect(sql).toContain("'{}'::jsonb");
  });

  it('keeps per-row risk calls off a page-load path', () => {
    expect(sql).not.toContain('_review_risk_blocked');
  });

  it('counts wrong-country rows as closes, not applies', () => {
    // Otherwise the card promises to apply 3 rows it will actually reject —
    // small, but this surface exists to stop telling the operator something
    // untrue about the queue.
    expect(sql).toContain('closable_wrong_country');
    // Scoped to the SUBTRACTION, not merely to the identifier appearing
    // somewhere after 'auto_applies': the term also appears in auto_closes
    // just below, so the loose form passed with the subtraction deleted.
    // Mutation-tested — the loose version SURVIVED.
    expect(sql).toMatch(
      /'auto_applies',\s*greatest\(\s*rq\.at_threshold\s*-\s*rq\.closable_unreachable\s*-\s*rq\.closable_wrong_country/,
    );
  });

  it('carries a negative control: an unauthorised caller gets nothing', () => {
    const verify = verifyOf(findMigration('review_automation_status'));
    expect(verify).toContain('unauthorised caller received data');
  });
});

describe('adult-links producer — the closers make the rejection guard necessary', () => {
  const src = readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'personality-link-adult-profiles', 'index.ts'),
    'utf8',
  );

  it('is wired to the shared review-queue guard', () => {
    expect(src).toContain('loadReviewQueueGuard');
    expect(src).toContain("view: 'personality_review_queue'");
    expect(src).toContain("idColumn: 'personality_id'");
  });

  it('asks the rejected arm with the VALUE, after the probe', () => {
    // The rejected arm compares proposed_value, which is unknown until the
    // platform answers; asking before the probe would compare nothing.
    expect(src).toMatch(/const proposed = \{ value: probe\.url \}/);
    expect(src).toMatch(/guard\.blocked\([^)]*proposed\)[\s\S]{0,40}'rejected'/);
  });

  it('still short-circuits the open arm before spending a probe', () => {
    expect(src).toMatch(/guard\.blocked\([^)]*undefined\)[\s\S]{0,30}'open'/);
  });

  it('reports a failed pre-read instead of reading it as an empty queue', () => {
    expect(src).toContain('queue_precheck_failed');
    expect(src).toContain('guard.precheckFailed');
  });

  it('no longer claims rejected rows are never re-suggested', () => {
    // The old comment asserted the exact opposite of how uq_erq_open works.
    expect(src).not.toContain('Rejected rows are not');
    expect(src).not.toContain('nothing here to churn yet');
  });
});
