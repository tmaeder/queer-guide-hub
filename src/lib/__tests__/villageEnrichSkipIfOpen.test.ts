import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `pipeline-enrich-village` (cron `village_agentic_enrich` `40 5 * * *`) gates every
 * narrative overwrite. It used to delete-then-insert, and it holds LESS than any
 * sibling: no provenance row, and `village_quality_signals` records only a boolean, so
 * the queue row is the only copy that has ever existed.
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
    join(process.cwd(), 'supabase', 'functions', 'pipeline-enrich-village', 'index.ts'),
    'utf8',
  ),
);

describe('pipeline-enrich-village never destroys a pending proposal', () => {
  it('deletes nothing, anywhere', () => {
    expect(fn).not.toMatch(/\.delete\(\)/);
  });

  it('loads the shared guard once, scoped to this queue', () => {
    const block = fn.slice(fn.indexOf('loadReviewQueueGuard(supabase'));
    expect(block.slice(0, 300)).toMatch(/view: 'village_review_queue'/);
    expect(block.slice(0, 300)).toMatch(/idColumn: 'village_id'/);
    expect(block.slice(0, 300)).toMatch(/fields: GATED_FIELDS/);
    expect(block.slice(0, 300)).toMatch(/ids: villages\.map\(\(v\) => v\.id\)/);
  });

  it('asks the guard with the VALUE it is about to insert', () => {
    // `{ value }` is exactly the proposed_value shape the insert writes. Comparing
    // anything else would make the rejection check compare the wrong thing and never fire.
    const helper = fn.slice(fn.indexOf('async function queueReview'));
    expect(helper.slice(0, 500)).toMatch(/guard\.blocked\(villageId, field, \{ value \}\)/);
    const ins = helper.slice(helper.indexOf('insert('));
    expect(ins.slice(0, 300)).toMatch(/proposed_value: \{ value \}/);
  });

  it('returns a distinct outcome for open and for a prior rejection', () => {
    expect(fn).toMatch(/type QueueOutcome = 'queued' \| 'skipped' \| 'rejected' \| 'error'/);
    const helper = fn.slice(fn.indexOf('async function queueReview'));
    expect(helper.slice(0, 500)).toMatch(/if \(block === 'open'\) return 'skipped'/);
    expect(helper.slice(0, 500)).toMatch(/if \(block === 'rejected'\) return 'rejected'/);
  });

  it('tallies every outcome, and keeps a rejection distinct from a skip', () => {
    const tally = fn.slice(fn.indexOf('const tally ='));
    expect(tally.slice(0, 500)).toMatch(/r === 'queued'\)\s*queued\+\+/);
    expect(tally.slice(0, 500)).toMatch(/r === 'skipped'\)\s*queueSkipped\+\+/);
    expect(tally.slice(0, 500)).toMatch(/r === 'rejected'\)\s*queueRejected\+\+/);
    expect(tally.slice(0, 500)).toMatch(/else queueErrors\+\+/);
    // `touched` gates the "nothing actionable came back" branch, so it must stay true for
    // a skip or a village whose proposals were all already queued reads as a no-op.
    expect(tally.slice(0, 500)).toMatch(/touched = true/);
  });

  it('routes every gated field through the one helper, passing the guard', () => {
    const calls = fn.match(/queueReview\(supabase, v\.id, '[a-z_]+'[\s\S]*?guard\)/g) ?? [];
    expect(calls.length).toBe(4);
    for (const f of ['history', 'description', 'editorial_hook', 'notable_landmarks']) {
      expect(fn).toMatch(new RegExp(`queueReview\\(supabase, v\\.id, '${f}'`));
    }
  });

  it('marks an inserted row, and classifies 23505 as a skip', () => {
    const helper = fn.slice(fn.indexOf('async function queueReview'));
    expect(helper).toMatch(/guard\.markQueued\(villageId, field\)/);
    expect(helper).toMatch(/if \(error\.code === '23505'\) return 'skipped'/);
    const ins = helper.slice(helper.indexOf('insert('));
    expect(ins.slice(0, 400)).not.toMatch(/\.then\(/);
  });

  it('surfaces the counters, omitted when zero', () => {
    const ret = fn.slice(fn.indexOf("return {\n    mode: 'agentic'"));
    expect(ret.slice(0, 600)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(ret.slice(0, 600)).toMatch(/\.\.\.\(queueRejected \? \{ queue_rejected_before/);
    expect(ret.slice(0, 600)).toMatch(/\.\.\.\(queueErrors \?/);
    expect(ret.slice(0, 600)).toMatch(/\.\.\.\(guard\.precheckFailed \?/);
  });
});
