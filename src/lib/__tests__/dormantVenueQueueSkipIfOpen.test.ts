import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The two DORMANT queue writers — `venue-accessibility-osm` (disabled and unscheduled)
 * and `venue-contact-enrich` (no registry row, no cron). Dormant is why they were done
 * last; it is not a reason to leave them broken, because the defect fires the moment
 * either is switched on.
 *
 * `venue-accessibility-osm` is the only writer whose delete reached ACROSS FUNCTIONS: it
 * gates the same `accessibility_attributes` field on which `amenity-truth-backfill` holds
 * ~747 open proposals, so every conflict it found would have destroyed another job's
 * pending work.
 *
 * Idempotency and rejection-blocking come from `_shared/review-queue-guard.ts`, unit-
 * tested there. Asserted HERE: delegation and verdict handling.
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function load(fn: string): string {
  return stripComments(
    readFileSync(join(process.cwd(), 'supabase', 'functions', fn, 'index.ts'), 'utf8'),
  );
}

const osm = load('venue-accessibility-osm');
const contact = load('venue-contact-enrich');

describe.each([
  ['venue-accessibility-osm', () => osm],
  ['venue-contact-enrich', () => contact],
])('%s never destroys a pending proposal', (_name, src) => {
  it('deletes nothing, anywhere', () => {
    expect(src()).not.toMatch(/\.delete\(\)/);
  });

  it('loads the shared guard, scoped to this queue and this run', () => {
    const fn = src();
    const block = fn.slice(fn.indexOf('loadReviewQueueGuard(supabase'));
    expect(block.slice(0, 300)).toMatch(/view: 'venue_review_queue'/);
    expect(block.slice(0, 300)).toMatch(/idColumn: 'venue_id'/);
    expect(block.slice(0, 300)).toMatch(/fields: (GATED_FIELDS|\[GATED_FIELD\])/);
    expect(block.slice(0, 300)).toMatch(/ids: venues\.map\(\(v\) => v\.id\)/);
  });

  it('handles the rejected verdict distinctly from the open one', () => {
    const fn = src();
    expect(fn).toMatch(/block === 'open'/);
    expect(fn).toMatch(/block === 'rejected'/);
    expect(fn).toMatch(/queueRejected\+\+/);
  });

  it('marks an inserted row, classifies 23505 as a skip, and does not swallow errors', () => {
    const fn = src();
    const ok = fn.slice(fn.indexOf('if (!insErr)'));
    expect(ok.slice(0, 400)).toMatch(/guard\.markQueued\(/);
    expect(ok).toMatch(/insErr\.code === '23505'/);
    const ins = fn.slice(fn.indexOf("from('venue_review_queue').insert("));
    expect(ins.slice(0, 500)).not.toMatch(/\.then\(/);
  });

  it('surfaces the counters, omitted when zero', () => {
    const fn = src();
    const summary = fn.slice(fn.indexOf('const queueSummary'));
    expect(summary.slice(0, 600)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(summary.slice(0, 600)).toMatch(/\.\.\.\(queueRejected \? \{ queue_rejected_before/);
    expect(summary.slice(0, 600)).toMatch(/\.\.\.\(queueErrors \?/);
    expect(summary.slice(0, 600)).toMatch(/\.\.\.\(guard\.precheckFailed \?/);
  });
});

describe('venue-accessibility-osm specifics', () => {
  it('compares the SAME object it inserts', () => {
    // The proposal is built once and used for both the guard question and the insert.
    // Two separately-constructed literals would drift and the rejection check would
    // silently stop matching.
    expect(osm).toMatch(
      /const proposal = \{ value: \[\.\.\.winner\]\.sort\(\), osm: osmSlugs, existing, dropped: conflict\.dropped \}/,
    );
    expect(osm).toMatch(/guard\.blocked\(v\.id, GATED_FIELD, proposal\)/);
    expect(osm).toMatch(/proposed_value: proposal/);
  });

  it('keeps the conflict recorded even when the row is not written', () => {
    // Skipping the queue row must not lose the finding: needs_attention is set on the
    // venue and the conflict is stamped, both independently of the row.
    expect(osm).toMatch(/if \(hasConflict\) update\.needs_attention = true/);
    expect(osm).toMatch(/conflict: hasConflict \? conflict\.conflicts : undefined/);
  });

  it('names the shared field once, since amenity-truth-backfill gates the same one', () => {
    expect(osm).toMatch(/const GATED_FIELD = 'accessibility_attributes'/);
    expect(osm).toMatch(/field: GATED_FIELD/);
  });

  it('reports the counters on every exit, including the circuit-open one', () => {
    const spreads = osm.match(/\.\.\.queueSummary\(\)/g) ?? [];
    expect(spreads.length).toBe(4);
    const circuitLines = osm.split('\n').filter((l) => l.includes('circuit_open: true'));
    expect(circuitLines.length).toBe(2);
    for (const line of circuitLines) expect(line).toMatch(/\.\.\.queueSummary\(\)/);
  });
});

describe('venue-contact-enrich specifics', () => {
  it('gates two fields and compares the SAME object it inserts', () => {
    expect(contact).toMatch(/const GATED_FIELDS = \['email', 'phone'\] as const/);
    expect(contact).toMatch(/const proposal = \{ value: p\.value, source_url: p\.url \}/);
    expect(contact).toMatch(/guard\.blocked\(v\.id, p\.field, proposal\)/);
    expect(contact).toMatch(/proposed_value: proposal/);
  });

  it('keeps the row counters separate from the venue-level `queued`', () => {
    // `queued` counts VENUES that produced review-worthy proposals; folding row counts
    // into it would change a number that already means something else.
    expect(contact).toMatch(/queueWritten\+\+/);
    expect(contact).toMatch(/queue_written: queueWritten/);
    expect(contact).toMatch(/if \(toQueue\.length\) queued\+\+/);
  });

  it('reports the counters on both exits', () => {
    const spreads = contact.match(/\.\.\.queueSummary\(\)/g) ?? [];
    expect(spreads.length).toBe(2);
    const circuitLines = contact.split('\n').filter((l) => l.includes('circuit_open: true'));
    expect(circuitLines.length).toBe(1);
    for (const line of circuitLines) expect(line).toMatch(/\.\.\.queueSummary\(\)/);
  });
});
