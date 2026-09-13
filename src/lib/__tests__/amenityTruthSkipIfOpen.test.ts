import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `amenity-truth-backfill` review-gates every LLM accessibility claim, because a wrong
 * access claim is real-world harm. It used to DELETE the open queue row and INSERT a
 * fresh one on every visit, destroying the proposal a reviewer was reading; a gated
 * proposal gets no `venue_field_provenance` row, so that queue row IS the proposal.
 *
 * Idempotency now comes from `_shared/review-queue-guard.ts`, whose own behaviour —
 * canonical value comparison, NULL-not-empty on a failed read, scoping — is unit-tested
 * there against a fake client. What is asserted HERE is that this function delegates to
 * it and handles all three verdicts, which no amount of testing the helper can show.
 *
 * Comment-stripped: this file's comments quote the old shape verbatim.
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
    join(process.cwd(), 'supabase', 'functions', 'amenity-truth-backfill', 'index.ts'),
    'utf8',
  ),
);

describe('amenity-truth-backfill never destroys a pending proposal', () => {
  it('deletes nothing, anywhere', () => {
    expect(fn).not.toMatch(/\.delete\(\)/);
  });

  it('loads the shared guard once, scoped to this queue and its gated fields', () => {
    const block = fn.slice(fn.indexOf('loadReviewQueueGuard(supabase'));
    expect(block.slice(0, 300)).toMatch(/view: 'venue_review_queue'/);
    expect(block.slice(0, 300)).toMatch(/idColumn: 'venue_id'/);
    expect(block.slice(0, 300)).toMatch(/fields: GATED_FIELDS/);
    // Only the LLM source can produce a gated proposal, so an extract-only run must not
    // pay for the read. Passing [] is what makes the guard skip both queries entirely.
    expect(block.slice(0, 300)).toMatch(/ids: wantLlm \? venues\.map\(\(v\) => v\.id\) : \[\]/);
  });

  it('distinguishes all three verdicts, and passes the VALUE so rejection can match', () => {
    // Passing g.value is the whole rejection fix: the guard compares the proposal we are
    // about to insert against the ones already refused. Passing anything else would make
    // it compare the wrong thing and silently never block.
    expect(fn).toMatch(/guard\.blocked\(v\.id, g\.field, g\.value\)/);
    expect(fn).toMatch(/x\.block === null/);
    expect(fn).toMatch(/x\.block === 'open'/);
    expect(fn).toMatch(/x\.block === 'rejected'/);
  });

  it('counts an open skip and a prior rejection separately', () => {
    // Folding them together would hide the treadmill: "skipped" reads as healthy
    // idempotency, while a rising rejected count means the producer keeps re-offering
    // work a human already refused.
    expect(fn).toMatch(/queueSkipped \+= alreadyOpen\.length/);
    expect(fn).toMatch(/queueRejected \+= alreadyRejected\.length/);
  });

  it('marks an inserted row so one run cannot double-insert', () => {
    const ok = fn.slice(fn.indexOf('if (!insErr)'));
    expect(ok.slice(0, 300)).toMatch(/guard\.markQueued\(v\.id, g\.field\)/);
  });

  it('treats a unique-index refusal as a skip and any other error as an error', () => {
    const branch = fn.slice(fn.indexOf('if (!insErr)'));
    expect(branch).toMatch(/insErr\.code === '23505'/);
    const skip = branch.slice(branch.indexOf("insErr.code === '23505'"));
    expect(skip.slice(0, 200)).toMatch(/queueSkipped\+\+/);
    expect(skip.slice(skip.indexOf('} else {'), skip.indexOf('} else {') + 300)).toMatch(
      /queueErrors\+\+/,
    );
  });

  it('does not swallow the insert result', () => {
    const ins = fn.slice(fn.indexOf("from('venue_review_queue').insert("));
    expect(ins.slice(0, 400)).not.toMatch(/\.then\(/);
  });

  it('classifies before the write branch, so a dry run reports the real split', () => {
    const classify = fn.indexOf('const verdicts = gatedProposals.map');
    const guardWrite = fn.indexOf('if (!dryRun)');
    expect(classify).toBeGreaterThan(-1);
    expect(classify).toBeLessThan(guardWrite);
  });

  it('surfaces the counters, omitted when zero', () => {
    const summary = fn.slice(fn.indexOf('const queueSummary'));
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queued \? \{ queued \} : \{\}\)/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queueRejected \? \{ queue_rejected_before/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(guard\.precheckFailed \?/);
  });
});
