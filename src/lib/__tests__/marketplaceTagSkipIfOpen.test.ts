import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `marketplace-tag-backfill` (cron `45 4 * * *`) gates every content-rating DOWNGRADE.
 * It used to delete-then-insert with an UNSCOPED delete (no `.eq('field')`), and it is
 * where the rejection treadmill was measured: 126 listings rejected more than once,
 * every repeat a byte-identical re-proposal, all decided by auto-triage with
 * `reviewer_id IS NULL`.
 *
 * Idempotency comes from `_shared/review-queue-guard.ts`, whose behaviour (canonical
 * value comparison against jsonb's reordered keys, NULL-not-empty on a failed read,
 * scoping) is unit-tested there against a fake client. Asserted HERE: that this function
 * delegates to it and handles every verdict — which testing the helper cannot show.
 *
 * Comment-stripped: this file's comments quote the old delete-then-insert shape.
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const fn = stripComments(
  readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'marketplace-tag-backfill', 'index.ts'),
    'utf8',
  ),
);

describe('marketplace-tag-backfill never destroys or re-offers a refused proposal', () => {
  it('deletes nothing, anywhere', () => {
    expect(fn).not.toMatch(/\.delete\(\)/);
  });

  it('loads the shared guard once, scoped to this queue and the ONE gated field', () => {
    const block = fn.slice(fn.indexOf('loadReviewQueueGuard(supabase'));
    expect(block.slice(0, 300)).toMatch(/view: 'marketplace_review_queue'/);
    expect(block.slice(0, 300)).toMatch(/idColumn: 'listing_id'/);
    // Field scope is the half the old unscoped delete was missing.
    expect(block.slice(0, 300)).toMatch(/fields: \[GATED_FIELD\]/);
    expect(block.slice(0, 300)).toMatch(/ids: listings\.map\(\(l\) => l\.id\)/);
  });

  it('names the gated field once, so the guard and the insert cannot drift', () => {
    expect(fn).toMatch(/const GATED_FIELD = 'subcategory'/);
    expect(fn).toMatch(/field: GATED_FIELD/);
    expect(fn).not.toMatch(/field: 'subcategory'/);
  });

  it('blocks a prior rejection distinctly from an open row, using the VALUE', () => {
    expect(fn).toMatch(/guard\.blocked\(l\.id, GATED_FIELD, g\.value\)/);
    expect(fn).toMatch(/if \(block === 'open'\) \{ queueSkipped\+\+; continue \}/);
    expect(fn).toMatch(/if \(block === 'rejected'\) \{ queueRejected\+\+; continue \}/);
  });

  it('marks an inserted row, classifies 23505 as a skip, and does not swallow errors', () => {
    const ok = fn.slice(fn.indexOf('if (!insErr)'));
    expect(ok.slice(0, 400)).toMatch(/guard\.markQueued\(l\.id, GATED_FIELD\)/);
    expect(ok).toMatch(/insErr\.code === '23505'/);
    const ins = fn.slice(fn.indexOf("from('marketplace_review_queue').insert("));
    expect(ins.slice(0, 400)).not.toMatch(/\.then\(/);
  });

  it('reports the counters on BOTH return paths, including the circuit-open exit', () => {
    // No admin_automation_runs row of its own — the cron posts through
    // automation_http_post, which files the RESPONSE BODY against the run — so a return
    // that drops the counters loses them entirely.
    const returns = fn.match(/\.\.\.queueSummary\(\)/g) ?? [];
    expect(returns.length).toBe(2);
    const circuitLines = fn.split('\n').filter((l) => l.includes('circuit_open: true'));
    expect(circuitLines.length).toBe(1);
    for (const line of circuitLines) expect(line).toMatch(/\.\.\.queueSummary\(\)/);
  });

  it('surfaces the counters, omitted when zero', () => {
    const summary = fn.slice(fn.indexOf('const queueSummary'));
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queued \? \{ queued \} : \{\}\)/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queueRejected \? \{ queue_rejected_before/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(guard\.precheckFailed \?/);
  });
});
