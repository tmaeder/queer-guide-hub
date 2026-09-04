import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A human "approve" in the triage inbox has to actually unblock the row.
 *
 * Every approve path writes `ingestion_staging.review_status = 'approved'`,
 * but every downstream stage — dedup, the review gate, marketplace-relevance,
 * the enrichment driver, and all six `commit_*_staging_batch` functions —
 * gates on a DIFFERENT column, `ai_validation_status`, whose only writer is
 * pipeline-validate. So a row validate returned `needs_review` for was
 * invisible to every stage forever, and the review queue collected human
 * decisions and discarded them. Measured on prod 2026-08-22: 14 events
 * stranded since 2026-07-13.
 *
 * `trg_staging_human_approval_clears_validation` promotes the column on
 * approve. This is a text check against the migrations directory, not a
 * database one, so it runs in CI without credentials — same pattern as
 * `citySafetyBackfill.test.ts`.
 */

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

function latestDefinitionOf(fn: string): string {
  for (const f of [...migrationFiles()].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // `create [or replace] function`, not merely `function`: a GRANT, REVOKE,
    // COMMENT ON, DROP or ALTER naming it also contains "function public.<fn>(".
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

function latestTriggerDefinition(trigger: string): string {
  for (const f of [...migrationFiles()].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    const at = sql.search(new RegExp(`create\\s+trigger\\s+${trigger}\\b`, 'i'));
    if (at < 0) continue;
    const rest = sql.slice(at);
    const end = rest.indexOf(';');
    return end < 0 ? rest : rest.slice(0, end + 1);
  }
  throw new Error(`no migration creates trigger ${trigger}`);
}

describe('a human approve promotes ai_validation_status', () => {
  const fn = latestDefinitionOf('staging_human_approval_clears_validation');
  const trg = latestTriggerDefinition('trg_staging_human_approval_clears_validation');

  it('sets ai_validation_status to approved', () => {
    expect(fn).toMatch(/NEW\.ai_validation_status\s*:=\s*'approved'/i);
  });

  it('records that a human overrode the validator, without erasing its verdict', () => {
    // jsonb_set onto the existing result — a plain assignment would drop the
    // errors/warnings/quality the validator recorded.
    expect(fn).toMatch(/jsonb_set\(\s*COALESCE\(NEW\.ai_validation_result/i);
    expect(fn).toMatch(/'\{human_override\}'/);
  });

  it('fires BEFORE UPDATE OF review_status on ingestion_staging', () => {
    expect(trg).toMatch(/BEFORE\s+UPDATE\s+OF\s+review_status\s+ON\s+public\.ingestion_staging/i);
  });

  it('only fires on a transition INTO approved', () => {
    expect(trg).toMatch(/NEW\.review_status\s*=\s*'approved'/i);
    expect(trg).toMatch(/OLD\.review_status\s+IS\s+DISTINCT\s+FROM\s+'approved'/i);
  });

  it('never overrides a validator rejection', () => {
    // The promotable set is spelled out rather than negated: a hard E_* reject
    // is a different decision from "needs a look", and auto-clearing one would
    // publish a row the validator refused.
    const when = /WHEN\s*\(([\s\S]*?)\)\s*EXECUTE/i.exec(trg)?.[1] ?? '';
    expect(when).toMatch(/ai_validation_status\s+IN\s*\(\s*'pending'\s*,\s*'needs_review'\s*\)/i);
    expect(when).not.toMatch(/'rejected'/);
  });
});

describe('the stranded shape is a CI-visible sentinel', () => {
  const hygiene = latestDefinitionOf('pipeline_hygiene_stats');
  const script = readFileSync(join(ROOT, 'scripts', 'check-pipeline-health.mjs'), 'utf8');

  it('pipeline_hygiene_stats reports stranded_human_approved', () => {
    expect(hygiene).toMatch(/'stranded_human_approved'/);
  });

  it('counts exactly the stuck shape: pending + human-approved + not validator-approved', () => {
    const block = /'stranded_human_approved'([\s\S]*?)\)\s*,\s*'search_reindex_queue_depth'/.exec(
      hygiene,
    )?.[1];
    expect(block, 'stranded_human_approved block not found').toBeTruthy();
    expect(block).toMatch(/disposition\s*=\s*'pending'/i);
    expect(block).toMatch(/review_status\s*=\s*'approved'/i);
    expect(block).toMatch(/ai_validation_status\s+IS\s+DISTINCT\s+FROM\s+'approved'/i);
  });

  it('the health check FAILS on any non-zero count, with no baseline allowance', () => {
    expect(script).toMatch(/hygiene\.stranded_human_approved/);
    const block = script.slice(script.indexOf('hygiene.stranded_human_approved'));
    const guard = /if\s*\(strandedTotal\s*>\s*(\d+)\)\s*\{([\s\S]*?)\n\s*\}/.exec(block);
    expect(guard, 'no strandedTotal guard').toBeTruthy();
    expect(Number(guard![1])).toBe(0);

    // The PROPERTY is "this is a hard failure, not a warning" — not the
    // mechanism that delivers it. This asserted `process.exit(1)` until
    // 2026-09-04, when the script stopped exiting inline so a failure in an
    // early section could no longer hide every section after it; the guard
    // still fails the build, now via `FAILED = true` plus one exit at the
    // bottom. Pinning the mechanism made a behaviour-preserving refactor read
    // as a regression, so assert the two things that actually matter.
    expect(guard![2]).toMatch(/FAILED\s*=\s*true|process\.exit\(1\)/);
    expect(guard![2]).not.toMatch(/console\.warn/);
  });
});

describe('the promoted column is the one the stages actually read', () => {
  // If a stage ever moves its gate to another column, the trigger above is
  // promoting the wrong thing and silently stops unblocking anything.
  const stages = [
    'supabase/functions/pipeline-deduplicate/index.ts',
    'supabase/functions/pipeline-review-gate/index.ts',
  ];

  it.each(stages)('%s still gates on ai_validation_status', (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    expect(src).toMatch(/\.eq\('ai_validation_status',\s*'approved'\)/);
  });

  it('commit accepts the human verdict on review_status, so only the validator column blocked', () => {
    const sql = readFileSync(join(MIGRATIONS, '20260415120100_event_commit_rpc.sql'), 'utf8');
    expect(sql).toMatch(/review_status\s+IN\s*\('auto','approved'\)/i);
    expect(sql).toMatch(/ai_validation_status\s*=\s*'approved'/i);
  });
});
