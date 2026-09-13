import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `city-agentic-enrich` re-visits a city roughly every nine hours and, for each
 * review-gated field, DELETEs the open queue row and INSERTs a new one. The
 * proposal a reviewer read is therefore destroyed with no trace: the queue keeps
 * no tombstone, and `city_consensus_audit` records each run's field names and
 * citations but never the proposed VALUE.
 *
 * Measured live: a wrong Haapsalu `best_time_to_visit` — naming a spring film
 * festival as a summer one — was read, reported, and gone before anyone could act
 * on it, and could not be reconstructed afterwards because nothing had kept the
 * text. That is the "human decisions silently discarded" failure one step earlier:
 * the PROPOSAL is discarded rather than the decision, so no queue-depth sentinel
 * can see it.
 *
 * Asserted against COMMENT-STRIPPED source. The block's own header names every
 * identifier these tests look for, so an unstripped check passes on the prose with
 * the capture deleted — the trap CLAUDE.md records three times.
 */

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

const city = stripComments(
  readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'city-agentic-enrich', 'index.ts'),
    'utf8',
  ),
);

// The write block only — scoping matters, because the file mentions the queue
// elsewhere and a file-wide match would survive deleting the capture.
const writeBlock = city.slice(city.indexOf('if (!dryRun)'));

describe('city-agentic-enrich records the proposal it supersedes', () => {
  it('reads the open row BEFORE destroying it', () => {
    // The entire fix is this ordering. A select placed after the delete compiles,
    // runs, and captures nothing — which is indistinguishable from "nothing was
    // replaced" in the audit.
    const select = writeBlock.indexOf(".select('id, proposed_value, confidence, created_at')");
    const del = writeBlock.indexOf(".from('city_review_queue').delete()");
    expect(select).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(-1);
    expect(select).toBeLessThan(del);
  });

  it('reads the value, not merely the row', () => {
    expect(writeBlock).toMatch(/\.select\('id, proposed_value, confidence, created_at'\)/);
    expect(writeBlock).toMatch(/\.eq\('status', 'open'\)/);
  });

  it('uses maybeSingle, which the open-row unique index makes exact', () => {
    // uq_erq_open (entity_type, entity_id, field) WHERE status='open' guarantees at
    // most one match, so more than one surfaces as an error rather than silently
    // taking the first.
    expect(writeBlock).toMatch(/\.maybeSingle\(\)/);
  });

  it('records only a CHANGED proposal, never a byte-identical re-publish', () => {
    // This composer re-publishes identical text routinely; recording that every nine
    // hours would bury the real replacements in noise.
    expect(writeBlock).toMatch(
      /JSON\.stringify\(prior\.proposed_value\)\s*!==\s*JSON\.stringify\(g\.value\)/,
    );
  });

  it('keeps the superseded text itself, not just that something was replaced', () => {
    const block = writeBlock.slice(writeBlock.indexOf('superseded.push('));
    expect(block).toMatch(/previous_value:\s*prior\.proposed_value/);
    expect(block).toMatch(/proposed_at:\s*prior\.created_at/);
  });

  it('records a failed read instead of swallowing it', () => {
    // Absence of evidence must not be recorded as evidence of absence: without this,
    // an unreadable prior row looks exactly like no prior row.
    const errBranch = writeBlock.slice(writeBlock.indexOf('if (priorErr)'));
    expect(writeBlock).toMatch(/if \(priorErr\)/);
    expect(errBranch.slice(0, 200)).toMatch(/supersededUnreadable\.push\(g\.field\)/);
  });

  it('carries both keys into the audit details', () => {
    const audit = writeBlock.slice(writeBlock.indexOf("from('city_consensus_audit')"));
    expect(audit).toMatch(/\{\s*superseded\s*\}/);
    expect(audit).toMatch(/superseded_unreadable:\s*supersededUnreadable/);
  });

  it('omits the keys when empty, so their absence carries meaning', () => {
    // A run that replaced nothing must not stamp an empty array onto every audit row;
    // that is what lets a reader treat a missing key as "nothing was overwritten".
    const audit = writeBlock.slice(writeBlock.indexOf("from('city_consensus_audit')"));
    expect(audit).toMatch(/\.\.\.\(superseded\.length \?/);
    expect(audit).toMatch(/\.\.\.\(supersededUnreadable\.length \?/);
  });

  it('refuses to re-offer a proposal that was already REJECTED, unchanged', () => {
    // This composer KEEPS its delete-then-insert — overwriting an OPEN row is the design,
    // which is why the outgoing value is audited rather than preserved. So only the
    // rejected half of the guard applies here. `uq_erq_open` cannot express it: it covers
    // status='open' only, so a rejected row blocks nothing and the same refused proposal
    // is re-offered on the next pass, hourly.
    const block = writeBlock.slice(writeBlock.indexOf('guard.blocked(c.id, g.field, g.value)'));
    expect(writeBlock).toMatch(/guard\.blocked\(c\.id, g\.field, g\.value\) === 'rejected'/);
    expect(block.slice(0, 200)).toMatch(/queueRejected\+\+/);
    expect(block.slice(0, 200)).toMatch(/continue/);
    // The skip must precede the delete, or the refused proposal is destroyed and rewritten
    // before anyone notices it was refused.
    const guardIdx = writeBlock.indexOf('guard.blocked(c.id');
    const delIdx = writeBlock.indexOf(".from('city_review_queue').delete()");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(delIdx);
  });

  it('loads the guard over this run, scoped to the fields it gates', () => {
    const block = city.slice(city.indexOf('loadReviewQueueGuard(supabase'));
    expect(block.slice(0, 300)).toMatch(/view: 'city_review_queue'/);
    expect(block.slice(0, 300)).toMatch(/idColumn: 'city_id'/);
    expect(block.slice(0, 300)).toMatch(/fields: CITY_GATED_FIELDS/);
    expect(city).toMatch(
      /const CITY_GATED_FIELDS = \['lgbt_friendly_rating', 'editorial_hook', 'best_time_to_visit'\] as const/,
    );
  });

  it('surfaces the rejection counter and a failed pre-check', () => {
    expect(city).toMatch(
      /\.\.\.\(queueRejected \? \{ queue_rejected_before: queueRejected \} : \{\}\)/,
    );
    expect(city).toMatch(
      /\.\.\.\(guard\.precheckFailed \? \{ queue_precheck_failed: true \} : \{\}\)/,
    );
  });

  it('captures nothing on a dry run', () => {
    // The capture lives inside the !dryRun block with every other write, so a dry run
    // stays read-only and supersedes nothing.
    const guard = city.indexOf('if (!dryRun)');
    const capture = city.indexOf('const superseded');
    expect(guard).toBeGreaterThan(-1);
    expect(capture).toBeGreaterThan(guard);
  });
});
