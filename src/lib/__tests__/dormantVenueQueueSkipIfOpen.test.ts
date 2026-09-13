import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The last two delete-then-insert queue writers, both currently DORMANT —
 * `venue-accessibility-osm` is disabled and unscheduled, `venue-contact-enrich` has no
 * registry row and no cron. Dormant is why they were left until last; it is not a reason
 * to leave them broken, because the defect fires the moment either is switched on.
 *
 * `venue-accessibility-osm` is the sharper of the two: it gates the SAME
 * `accessibility_attributes` field that `amenity-truth-backfill` holds ~747 open proposals
 * on, so its delete reached ACROSS FUNCTIONS — every conflict it found would have
 * destroyed another job's pending work. A gated accessibility proposal has no provenance
 * row, so the queue row is the only copy.
 *
 * Asserted against COMMENT-STRIPPED source: both files' comments quote the old
 * delete-then-insert shape, which would make several of these assertions vacuous.
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

  it('reads the open rows before the loop, scoped to status, field and this run', () => {
    const fn = src();
    const block = fn.slice(fn.indexOf('let alreadyQueued'), fn.indexOf('for (const v of venues)'));
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/\.eq\('status', 'open'\)/);
    expect(block).toMatch(/\.in\('venue_id', venues\.map\(/);
    // Field scope, however each expresses it — one gated field vs. two.
    expect(block).toMatch(/\.eq\('field', GATED_FIELD\)|\.in\('field', \[\.\.\.GATED_FIELDS\]\)/);
  });

  it('records a failed pre-select instead of reading it as an empty queue', () => {
    const fn = src();
    const errBranch = fn.slice(fn.indexOf('if (openErr)'));
    expect(fn).toMatch(/if \(openErr\)/);
    expect(errBranch.slice(0, 300)).toMatch(/queuePrecheckFailed = true/);
    // NULL, not an empty Set — so `?.has()` is false everywhere and uq_erq_open decides.
    const okBranch = errBranch.slice(errBranch.indexOf('} else {'));
    expect(okBranch.slice(0, 200)).toMatch(/alreadyQueued = new Set\(/);
  });

  it('does not swallow the insert result', () => {
    const fn = src();
    const ins = fn.slice(fn.indexOf("from('venue_review_queue').insert("));
    expect(ins.slice(0, 500)).not.toMatch(/\.then\(/);
    expect(fn).toMatch(
      /const \{ error: insErr \} = await supabase\.from\('venue_review_queue'\)\.insert\(/,
    );
  });

  it('treats a unique-index refusal as a skip and any other error as an error', () => {
    const fn = src();
    const branch = fn.slice(fn.indexOf('if (!insErr)'));
    expect(branch).toMatch(/insErr\.code === '23505'/);
    const skip = branch.slice(branch.indexOf("insErr.code === '23505'"));
    expect(skip.slice(0, 200)).toMatch(/queueSkipped\+\+/);
    const other = skip.slice(skip.indexOf('} else {'));
    expect(other.slice(0, 300)).toMatch(/queueErrors\+\+/);
  });

  it('adds an inserted row to the set, so one run cannot double-insert', () => {
    const fn = src();
    const ok = fn.slice(fn.indexOf('if (!insErr)'));
    expect(ok.slice(0, 400)).toMatch(/alreadyQueued\?\.add\(/);
  });

  it('omits the queue counters when zero, so their presence carries meaning', () => {
    const fn = src();
    const summary = fn.slice(fn.indexOf('const queueSummary'));
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queueErrors \?/);
    expect(summary.slice(0, 500)).toMatch(/\.\.\.\(queuePrecheckFailed \?/);
  });
});

describe('venue-accessibility-osm specifics', () => {
  it('skips a venue already queued, and keeps the conflict recorded anyway', () => {
    const block = osm.slice(
      osm.indexOf('if (hasConflict) {', osm.indexOf('venue_field_provenance')),
    );
    expect(block.slice(0, 400)).toMatch(
      /if \(alreadyQueued\?\.has\(v\.id\)\) \{\s*queueSkipped\+\+/,
    );
    // Skipping the row must not lose the finding: `needs_attention` is set on the venue
    // and the conflict is stamped, both independently of whether the row was written.
    expect(osm).toMatch(/if \(hasConflict\) update\.needs_attention = true/);
    expect(osm).toMatch(/conflict: hasConflict \? conflict\.conflicts : undefined/);
  });

  it('names the shared field once, since amenity-truth-backfill gates the same one', () => {
    expect(osm).toMatch(/const GATED_FIELD = 'accessibility_attributes'/);
    expect(osm).toMatch(/field: GATED_FIELD/);
    // A literal in the insert would let the pre-select and the write disagree.
    const writeBlock = osm.slice(osm.indexOf("from('venue_review_queue').insert("));
    expect(writeBlock.slice(0, 400)).not.toMatch(/field: 'accessibility_attributes'/);
  });

  it('reports the counters on every exit, including the circuit-open one', () => {
    // Four: the recorded summary, the normal response, and the circuit-open early exit
    // from inside the loop — which is BOTH a recordRun and a jsonResponse.
    const spreads = osm.match(/\.\.\.queueSummary\(\)/g) ?? [];
    expect(spreads.length).toBe(4);
    // Asserted per-LINE. A "text before the marker" check is vacuous here, because the
    // circuit-open exit sits inside the loop and so precedes the other two spreads.
    const circuitLines = osm.split('\n').filter((l) => l.includes('circuit_open: true'));
    expect(circuitLines.length).toBe(2);
    for (const line of circuitLines) expect(line).toMatch(/\.\.\.queueSummary\(\)/);
  });
});

describe('venue-contact-enrich specifics', () => {
  it('keys the set by venue AND field — it gates two of them', () => {
    expect(contact).toMatch(/const GATED_FIELDS = \['email', 'phone'\] as const/);
    const set = contact.slice(contact.indexOf('alreadyQueued = new Set('));
    expect(set.slice(0, 200)).toMatch(/\$\{r\.venue_id\}:\$\{r\.field\}/);
    const use = contact.slice(contact.indexOf('for (const p of toQueue)'));
    expect(use.slice(0, 300)).toMatch(/const key = `\$\{v\.id\}:\$\{p\.field\}`/);
  });

  it('keeps the row counters separate from the venue-level `queued`', () => {
    // `queued` counts VENUES that produced review-worthy proposals and is used in the
    // response and the dry-run path; folding row counts into it would change a number
    // that already means something else.
    expect(contact).toMatch(/queueWritten\+\+/);
    expect(contact).toMatch(/queue_written: queueWritten/);
    expect(contact).toMatch(/if \(toQueue\.length\) queued\+\+/);
  });

  it('reports the counters on both exits', () => {
    const spreads = contact.match(/\.\.\.queueSummary\(\)/g) ?? [];
    expect(spreads.length).toBe(2);
    // Per-LINE, for the same reason as the OSM case: a "text before the marker" check
    // passes on any earlier unrelated spread and proves nothing about this exit.
    const circuitLines = contact.split('\n').filter((l) => l.includes('circuit_open: true'));
    expect(circuitLines.length).toBe(1);
    for (const line of circuitLines) expect(line).toMatch(/\.\.\.queueSummary\(\)/);
  });
});
