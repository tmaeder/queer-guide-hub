import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `amenity-truth-backfill` review-gates every LLM accessibility claim, because a wrong
 * access claim is real-world harm. It used to write those proposals by DELETEing the open
 * queue row and INSERTing a fresh one on every visit — so the exact proposal a reviewer
 * was reading was destroyed, with no tombstone in the queue and no copy anywhere else: a
 * gated proposal gets no `venue_field_provenance` row, so the queue row IS the proposal.
 *
 * The fix is the skip-if-open pattern its two siblings already use
 * (`personality-link-adult-profiles`, `event-agentic-enrich`): pre-select the open rows,
 * insert only what is absent, and never delete. `uq_erq_open` — a PARTIAL unique index on
 * (entity_type, entity_id, field) WHERE status='open' — backs it in the database, which
 * PostgREST cannot reach with ON CONFLICT.
 *
 * Asserted against COMMENT-STRIPPED source. The block's own header names every identifier
 * these tests look for, so an unstripped check passes on the prose with the code deleted —
 * the trap CLAUDE.md records three times, and this file's comments quote the old
 * delete-then-insert shape verbatim, which would make several of these vacuous.
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
    // The entire defect was one `.delete()`. The function has no other, so this is an
    // exact statement of the invariant rather than a scoped approximation.
    expect(fn).not.toMatch(/\.delete\(\)/);
  });

  it('reads the open rows ONCE, before the per-venue loop', () => {
    // Per-venue it would be one round trip per row; the point of the batched shape is
    // that it is a single query keyed by the run's venue ids.
    const select = fn.indexOf(".select('venue_id, field')");
    const loop = fn.indexOf('for (const v of venues)');
    expect(select).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(-1);
    expect(select).toBeLessThan(loop);
  });

  it('scopes the pre-select to open rows for this run only', () => {
    const block = fn.slice(fn.indexOf('let alreadyQueued'), fn.indexOf('for (const v of venues)'));
    expect(block).toMatch(/\.eq\('status', 'open'\)/);
    expect(block).toMatch(/\.in\('venue_id', venues\.map\(/);
    expect(block).toMatch(/\.in\('field', \[\.\.\.GATED_FIELDS\]\)/);
  });

  it('keys the set by venue AND field, not by venue alone', () => {
    // A venue-keyed set would suppress a genuinely new field whenever any other field
    // on that venue happened to be under review.
    const block = fn.slice(fn.indexOf('alreadyQueued = new Set('));
    expect(block.slice(0, 200)).toMatch(/\$\{r\.venue_id\}:\$\{r\.field\}/);
  });

  it('inserts only proposals that are not already open', () => {
    expect(fn).toMatch(
      /const toQueue = gatedProposals\.filter\(\(g\) => !alreadyQueued\?\.has\(`\$\{v\.id\}:\$\{g\.field\}`\)\)/,
    );
    const writeBlock = fn.slice(fn.indexOf('if (!dryRun)'));
    expect(writeBlock).toMatch(/for \(const g of toQueue\)/);
    // The old shape iterated every proposal unconditionally.
    expect(writeBlock).not.toMatch(/for \(const g of gatedProposals\)/);
  });

  it('records a failed pre-select instead of reading it as an empty queue', () => {
    // Absence of evidence must not become evidence of absence: without this, an
    // unreadable queue looks exactly like a queue with nothing in it, and every
    // proposal is re-inserted blind.
    const errBranch = fn.slice(fn.indexOf('if (openErr)'));
    expect(fn).toMatch(/if \(openErr\)/);
    expect(errBranch.slice(0, 300)).toMatch(/queuePrecheckFailed = true/);
    // ...and the set stays null rather than becoming an empty Set, so `?.has()` is
    // false everywhere and the database, not a wrong local answer, decides.
    const okBranch = errBranch.slice(errBranch.indexOf('} else {'));
    expect(okBranch.slice(0, 200)).toMatch(/alreadyQueued = new Set\(/);
  });

  it('does not swallow the insert result', () => {
    // The old insert ended `.then(() => {}, () => {})`, so a 23505 from uq_erq_open, a
    // genuine write failure and a successful queue were the same silence.
    const ins = fn.slice(fn.indexOf("from('venue_review_queue').insert("));
    expect(ins.slice(0, 400)).not.toMatch(/\.then\(/);
    expect(fn).toMatch(
      /const \{ error: insErr \} = await supabase\.from\('venue_review_queue'\)\.insert\(/,
    );
  });

  it('treats a unique-index refusal as a skip and any other error as an error', () => {
    const branch = fn.slice(fn.indexOf('if (!insErr)'));
    expect(branch).toMatch(/insErr\.code === '23505'/);
    const skip = branch.slice(branch.indexOf("insErr.code === '23505'"));
    expect(skip.slice(0, 200)).toMatch(/queueSkipped\+\+/);
    const other = skip.slice(skip.indexOf('} else {'));
    expect(other.slice(0, 300)).toMatch(/queueErrors\+\+/);
  });

  it('adds an inserted row to the set, so one run cannot double-insert', () => {
    const ok = fn.slice(fn.indexOf('if (!insErr)'));
    expect(ok.slice(0, 300)).toMatch(/alreadyQueued\?\.add\(`\$\{v\.id\}:\$\{g\.field\}`\)/);
  });

  it('classifies before the write branch, so a dry run reports the real split', () => {
    const classify = fn.indexOf('const toQueue = gatedProposals.filter');
    const guard = fn.indexOf('if (!dryRun)');
    expect(classify).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(classify).toBeLessThan(guard);
  });

  it('omits the queue counters when zero, so their presence carries meaning', () => {
    const summary = fn.slice(fn.indexOf('const queueSummary'));
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queued \? \{ queued \} : \{\}\)/);
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queueErrors \?/);
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queuePrecheckFailed \?/);
  });

  it('reports the counters on the run summary, not only in the response', () => {
    // admin_automation_runs is where a starved or erroring queue would be visible;
    // the HTTP response is read by nobody on a cron fire.
    const rec = fn.slice(
      fn.indexOf('await recordRun(supabase, runStarted, { processed: venues.length'),
    );
    expect(rec.slice(0, 200)).toMatch(/\.\.\.queueSummary/);
  });

  it('gates the pre-select on the source that can produce a proposal', () => {
    // Gated proposals come only from the LLM source; the routine cron runs
    // sources:['extract'] and must not pay for a query that can never matter.
    const block = fn.slice(fn.indexOf('let alreadyQueued'));
    expect(block.slice(0, 200)).toMatch(/if \(wantLlm\)/);
  });
});
