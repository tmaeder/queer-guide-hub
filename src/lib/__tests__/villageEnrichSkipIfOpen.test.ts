import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `pipeline-enrich-village` (agentic mode, cron `village_agentic_enrich` `40 5 * * *`)
 * review-gates every narrative overwrite — history, description, editorial_hook — plus
 * notable_landmarks when they cannot auto-fill. It used to write each one by DELETEing the
 * open queue row and INSERTing a fresh one, so the exact proposal a reviewer was reading
 * was destroyed on the next visit.
 *
 * Nothing else held a copy. A village proposal gets no provenance row, and
 * `village_quality_signals` records only a BOOLEAN (`queued: touched`) — not the field
 * name, not the value — so the queue row is the only copy that has ever existed. Measured
 * on prod 2026-09-13: 233 open rows (history 68, editorial_hook 67, description 67,
 * notable_landmarks 31) and ZERO resolved in any status, ever.
 *
 * The fix is the skip-if-open pattern its siblings use. `uq_erq_open` — a PARTIAL unique
 * index on (entity_type, entity_id, field) WHERE status='open' — backs it in the database,
 * which PostgREST cannot reach with ON CONFLICT.
 *
 * Asserted against COMMENT-STRIPPED source. This file's own comments quote the old
 * delete-then-insert shape verbatim, so several of these assertions would be satisfiable by
 * the prose with the code deleted — the trap CLAUDE.md records repeatedly.
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
    // The entire defect was one `.delete()`. The function has no other, so this is an
    // exact statement of the invariant rather than a scoped approximation.
    expect(fn).not.toMatch(/\.delete\(\)/);
  });

  it('reads the open rows ONCE, before the per-village loop', () => {
    const select = fn.indexOf(".select('village_id, field')");
    const loop = fn.indexOf('for (const v of villages)');
    expect(select).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(-1);
    expect(select).toBeLessThan(loop);
  });

  it('scopes the pre-select to open rows for this run only', () => {
    const block = fn.slice(
      fn.indexOf('let alreadyQueued'),
      fn.indexOf('for (const v of villages)'),
    );
    expect(block).toMatch(/\.eq\('status', 'open'\)/);
    expect(block).toMatch(/\.in\('village_id', villages\.map\(/);
    expect(block).toMatch(/\.in\('field', \[\.\.\.GATED_FIELDS\]\)/);
  });

  it('keys the set by village AND field, not by village alone', () => {
    // A village-keyed set would suppress a genuinely new field whenever any other field on
    // that village happened to be under review.
    const block = fn.slice(fn.indexOf('alreadyQueued = new Set('));
    expect(block.slice(0, 200)).toMatch(/\$\{r\.village_id\}:\$\{r\.field\}/);
  });

  it('records a failed pre-select instead of reading it as an empty queue', () => {
    // Absence of evidence must not become evidence of absence. The set stays NULL rather
    // than becoming an empty Set, so `?.has()` is false everywhere and the database — not a
    // wrong local answer — decides.
    const errBranch = fn.slice(fn.indexOf('if (openErr)'));
    expect(fn).toMatch(/if \(openErr\)/);
    expect(errBranch.slice(0, 300)).toMatch(/queuePrecheckFailed = true/);
    const okBranch = errBranch.slice(errBranch.indexOf('} else {'));
    expect(okBranch.slice(0, 200)).toMatch(/alreadyQueued = new Set\(/);
  });

  it('skips a proposal that is already open, before touching the database', () => {
    const helper = fn.slice(fn.indexOf('async function queueReview'));
    expect(helper.slice(0, 400)).toMatch(/if \(alreadyQueued\?\.has\(key\)\) return 'skipped'/);
    // The guard must precede the insert, or it does nothing.
    const guard = helper.indexOf('alreadyQueued?.has(key)');
    const insert = helper.indexOf("from('village_review_queue').insert(");
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(insert);
  });

  it('does not swallow the insert result', () => {
    const helper = fn.slice(fn.indexOf('async function queueReview'));
    const ins = helper.slice(helper.indexOf("from('village_review_queue').insert("));
    expect(ins.slice(0, 400)).not.toMatch(/\.then\(/);
    expect(helper).toMatch(
      /const \{ error \} = await supabase\.from\('village_review_queue'\)\.insert\(/,
    );
  });

  it('treats a unique-index refusal as a skip and any other error as an error', () => {
    const helper = fn.slice(fn.indexOf('async function queueReview'));
    expect(helper).toMatch(/if \(error\.code === '23505'\) return 'skipped'/);
    const after = helper.slice(helper.indexOf("error.code === '23505'"));
    expect(after.slice(0, 300)).toMatch(/return 'error'/);
  });

  it('adds an inserted row to the set, so one run cannot double-insert', () => {
    const ok = fn.slice(fn.indexOf('if (!error)'));
    expect(ok.slice(0, 300)).toMatch(/alreadyQueued\?\.add\(key\)/);
  });

  it('routes every gated field through the one helper', () => {
    // Four call sites — history, description, editorial_hook, notable_landmarks — and each
    // must pass the set, or that field silently keeps the old unguarded behaviour.
    const calls = fn.match(/queueReview\(supabase, v\.id, '[a-z_]+'[\s\S]*?alreadyQueued\)/g) ?? [];
    expect(calls.length).toBe(4);
    for (const f of ['history', 'description', 'editorial_hook', 'notable_landmarks']) {
      expect(fn).toMatch(new RegExp(`queueReview\\(supabase, v\\.id, '${f}'`));
    }
  });

  it('counts a skip separately from a write, and keeps both distinct from "nothing came back"', () => {
    // `touched` answers "did the model produce something actionable" and gates the
    // `skipped++` case. It must stay true for a skip, or a village whose proposals were all
    // already queued reads as though the model returned nothing.
    const tally = fn.slice(fn.indexOf('const tally ='));
    expect(tally.slice(0, 400)).toMatch(/r === 'queued'\)\s*queued\+\+/);
    expect(tally.slice(0, 400)).toMatch(/r === 'skipped'\)\s*queueSkipped\+\+/);
    expect(tally.slice(0, 400)).toMatch(/else queueErrors\+\+/);
    expect(tally.slice(0, 400)).toMatch(/touched = true/);
  });

  it('omits the queue counters when zero, so their presence carries meaning', () => {
    const ret = fn.slice(fn.indexOf("return {\n    mode: 'agentic'"));
    expect(ret.slice(0, 500)).toMatch(/\.\.\.\(queueSkipped \?/);
    expect(ret.slice(0, 500)).toMatch(/\.\.\.\(queueErrors \?/);
    expect(ret.slice(0, 500)).toMatch(/\.\.\.\(queuePrecheckFailed \?/);
  });
});
