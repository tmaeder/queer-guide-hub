import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `marketplace-tag-backfill` (cron `marketplace_tag_backfill` `45 4 * * *`) review-gates
 * every content-rating DOWNGRADE — wrong-SFW is the harmful direction, so a
 * reclassification that lowers a listing's rating never auto-applies.
 *
 * It used to write those proposals by DELETEing and re-INSERTing, and its delete was ALSO
 * UNSCOPED: it matched on (listing_id, status='open') with no `.eq('field', …)`, so it
 * removed every open row for the listing whatever field it belonged to. That half is
 * latent rather than active — measured 2026-09-13, `subcategory` is the only field this
 * queue has ever held (1,431 of 1,431 rows) — but it is a defect waiting for the first
 * writer that queues a second field on a listing.
 *
 * The fix is the skip-if-open pattern its siblings use, scoped to the one gated field.
 * `uq_erq_open` — a PARTIAL unique index on (entity_type, entity_id, field) WHERE
 * status='open' — backs it in the database, which PostgREST cannot reach with ON CONFLICT.
 *
 * Asserted against COMMENT-STRIPPED source: this file's own comments quote the old
 * unscoped-delete shape verbatim, which would make several assertions vacuous otherwise.
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

describe('marketplace-tag-backfill never destroys a pending proposal', () => {
  it('deletes nothing, anywhere', () => {
    // Two defects in one statement: the delete-then-insert, and its missing field scope.
    // Removing the delete closes both. The function has no other, so this is exact.
    expect(fn).not.toMatch(/\.delete\(\)/);
  });

  it('reads the open rows ONCE, before the per-listing loop', () => {
    const select = fn.indexOf(".select('listing_id')");
    const loop = fn.indexOf('for (const l of listings)');
    expect(select).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(-1);
    expect(select).toBeLessThan(loop);
  });

  it('scopes the pre-select to open rows OF THIS FIELD for this run only', () => {
    // The field scope is the half the old delete was missing, so it is asserted here
    // rather than assumed from the insert.
    const block = fn.slice(
      fn.indexOf('let alreadyQueued'),
      fn.indexOf('for (const l of listings)'),
    );
    expect(block).toMatch(/\.eq\('status', 'open'\)/);
    expect(block).toMatch(/\.eq\('field', GATED_FIELD\)/);
    expect(block).toMatch(/\.in\('listing_id', listings\.map\(/);
  });

  it('names the gated field once, so the pre-select and the insert cannot drift', () => {
    expect(fn).toMatch(/const GATED_FIELD = 'subcategory'/);
    expect(fn).toMatch(/field: GATED_FIELD/);
    // A literal in the insert would let the two sides disagree silently.
    expect(fn).not.toMatch(/field: 'subcategory'/);
  });

  it('skips a listing that is already queued, before touching the database', () => {
    const block = fn.slice(fn.indexOf('for (const g of gatedProposals)'));
    expect(block.slice(0, 300)).toMatch(
      /if \(alreadyQueued\?\.has\(l\.id\)\) \{ queueSkipped\+\+; continue \}/,
    );
    const guard = block.indexOf('alreadyQueued?.has(l.id)');
    const insert = block.indexOf("from('marketplace_review_queue').insert(");
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(insert);
  });

  it('records a failed pre-select instead of reading it as an empty queue', () => {
    const errBranch = fn.slice(fn.indexOf('if (openErr)'));
    expect(fn).toMatch(/if \(openErr\)/);
    expect(errBranch.slice(0, 300)).toMatch(/queuePrecheckFailed = true/);
    // The set stays NULL rather than becoming an empty Set, so `?.has()` is false
    // everywhere and uq_erq_open decides instead of a wrong local answer.
    const okBranch = errBranch.slice(errBranch.indexOf('} else {'));
    expect(okBranch.slice(0, 200)).toMatch(/alreadyQueued = new Set\(/);
  });

  it('does not swallow the insert result', () => {
    const ins = fn.slice(fn.indexOf("from('marketplace_review_queue').insert("));
    expect(ins.slice(0, 400)).not.toMatch(/\.then\(/);
    expect(fn).toMatch(
      /const \{ error: insErr \} = await supabase\.from\('marketplace_review_queue'\)\.insert\(/,
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

  it('adds an inserted listing to the set, so one run cannot double-insert', () => {
    const ok = fn.slice(fn.indexOf('if (!insErr)'));
    expect(ok.slice(0, 400)).toMatch(/alreadyQueued\?\.add\(l\.id\)/);
  });

  it('reports the counters on BOTH return paths, including the circuit-open exit', () => {
    // This function writes no admin_automation_runs row of its own — the cron posts
    // through automation_http_post, which files the RESPONSE BODY against the run — so a
    // return that drops the counters loses them entirely. The circuit-open exit is a real
    // early return from inside the loop, not a theoretical one.
    const returns = fn.match(/\.\.\.queueSummary\(\)/g) ?? [];
    expect(returns.length).toBe(2);
    const circuit = fn.slice(fn.indexOf('circuit_open: true'));
    expect(fn.slice(0, fn.indexOf('circuit_open: true'))).toMatch(/\.\.\.queueSummary\(\)/);
    expect(circuit.length).toBeGreaterThan(0);
  });

  it('omits the queue counters when zero, so their presence carries meaning', () => {
    const summary = fn.slice(fn.indexOf('const queueSummary'));
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queued \? \{ queued \} : \{\}\)/);
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queueErrors \?/);
    expect(summary.slice(0, 400)).toMatch(/\.\.\.\(queuePrecheckFailed \?/);
  });
});
