import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991790358865 — the second door on `person_outing_guard`.
 *
 * `99991789842467` sealed the gate with a BEFORE trigger on `personalities` and
 * named its own residue: the gate accepts EITHER a well-formed `wikidata_qid` OR
 * a non-`SKIP_` `personality_sources` row, so deleting the LAST source row
 * breaches it without touching `personalities`, where a trigger cannot see it.
 * That was recorded as accepted under-reach on the belief that nothing deletes
 * source rows. `scripts/data-quality/verify-personality-wikidata.mjs` does —
 * it writes a `SKIP_` sentinel onto the row and then deletes the wikidata
 * source, in that order, which is exactly what walks past a BEFORE trigger.
 */

const ROOT = process.cwd();
const MIGRATION = join(
  ROOT,
  'supabase/migrations/99991790358865_outing_seal_covers_source_deletion.sql',
);
const DELETER = join(ROOT, 'scripts/data-quality/verify-personality-wikidata.mjs');

const sql = readFileSync(MIGRATION, 'utf8');
const deleter = readFileSync(DELETER, 'utf8');

/** Comment-stripped, so no assertion can be satisfied by the header's prose. */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The trigger function body only — not the verify block, which repeats the predicate. */
const fnBody = bare.slice(
  bare.indexOf('create or replace function public.personality_sources_enforce_outing_guard'),
  bare.indexOf('$function$;'),
);

/** The postcondition block only. */
const verify = bare.slice(bare.indexOf('do $verify$'));

describe('the deleter this exists for', () => {
  it('still performs the breaching sequence, so the seal is not speculative', () => {
    // If this ever stops being true the migration's justification is stale and
    // should be re-measured, not quietly kept.
    expect(deleter).toMatch(/delete from public\.personality_sources/);
    expect(deleter).toMatch(/wikidata_qid\s*=\s*'SKIP_'/);
  });
});

describe('the trigger', () => {
  it('fires AFTER DELETE at STATEMENT level with a transition table', () => {
    // Row level would re-evaluate the same parent once per deleted source, and
    // `personalities` carries the search-document sync among its triggers.
    expect(bare).toMatch(/after delete on public\.personality_sources/);
    expect(bare).toMatch(/referencing old table as old_sources/);
    expect(bare).toMatch(/for each statement/);
    expect(bare).not.toMatch(/for each row/);
  });

  it('is dropped before being created, so re-applying cannot duplicate it', () => {
    expect(bare).toMatch(
      /drop trigger if exists trg_personality_sources_outing_guard on public\.personality_sources/,
    );
  });

  it('reads the transition table rather than re-scanning every personality', () => {
    expect(fnBody).toMatch(/from old_sources/);
  });
});

describe('the predicate matches the gate, clause for clause', () => {
  // A restated predicate that drifts from the gate is worse than none: nothing
  // reports "the seal and the gate disagree".
  it('carries the reach clause, including seo_indexable', () => {
    // `draft` + `seo_indexable` is a real state — both rows resting on the
    // sources arm today are exactly that, and a crawler still reaches them.
    expect(fnBody).toMatch(/p\.visibility = 'public' or p\.seo_indexable/);
  });

  it('carries all four positive identity labels', () => {
    for (const label of ['community_member', 'ally', 'activist', 'representation']) {
      expect(fnBody).toContain(`'${label}'`);
    }
  });

  it('treats a SKIP_ sentinel as no provenance, on both arms', () => {
    expect(fnBody).toMatch(/coalesce\(p\.wikidata_qid, ''\) ~ '\^Q\[0-9\]\+\$'/);
    expect(fnBody).toMatch(/coalesce\(s\.source_entity_id, ''\) !~ '\^SKIP_'/);
  });

  it('excludes duplicates and the dead, as the gate does', () => {
    expect(fnBody).toMatch(/p\.duplicate_of_id is null/);
    expect(fnBody).toMatch(/p\.is_living/);
  });
});

describe('it demotes rather than raising', () => {
  it('writes draft / not-indexable / needs-attention', () => {
    expect(fnBody).toMatch(/visibility\s*=\s*'draft'/);
    expect(fnBody).toMatch(/seo_indexable\s*=\s*false/);
    expect(fnBody).toMatch(/needs_attention\s*=\s*true/);
  });

  it('never raises — a correct repair must still be able to land', () => {
    // The merge cores and erq_cascade_delete remove sources legitimately; a RAISE
    // here would make those operations fail on rows they may clean up.
    expect(fnBody).not.toMatch(/raise exception/);
  });
});

describe('the behavioural proof', () => {
  it('deletes a real row and reads the parent back', () => {
    // Asserting the trigger exists passes against a body that does nothing.
    expect(verify).toMatch(
      /delete from public\.personality_sources where personality_id = v_victim/,
    );
    expect(verify).toMatch(/behavioural proof FAILED/);
  });

  it('ABORTS on a failed proof — a notice would apply green with the seal broken', () => {
    // Anchored on the mechanism, not on the message: demoting this RAISE to a
    // `raise notice` leaves every string-matching assertion green while the
    // migration installs a seal that was never shown to work. That mutation
    // survived the first round.
    const proof = verify.slice(verify.indexOf('if v_vis <> '));
    expect(proof.slice(0, 400)).toMatch(/raise exception 'behavioural proof FAILED/);
    // Same for the rollback check and the post-probe gate read.
    expect(verify).toMatch(/raise exception 'probe rollback FAILED/);
    expect(verify).toMatch(/raise exception 'postcondition failed: gate reads % after the probe/);
    // No assertion in the block may degrade to a warning.
    expect(verify).not.toMatch(/raise notice '[^']*FAILED/);
  });

  it('undoes the probe with a subtransaction, not a hand-written restore', () => {
    // Measured: re-inserting the sources and writing visibility='public'
    // re-enters enforce_personality_public_gate(), which refuses and leaves the
    // person unpublished. A restore that silently unpublishes someone is worse
    // than not probing.
    expect(verify).toMatch(/errcode\s*=\s*'RB001'/);
    expect(verify).toMatch(/exception when sqlstate 'RB001'/);
    expect(verify).not.toMatch(/insert into public\.personality_sources select/);
  });

  it('asserts the rollback against a snapshot, never a hardcoded state', () => {
    // A hardcoded `public/true` fails on a correct rollback — both live rows are
    // draft-but-indexable. This is the assertion that was wrong first.
    expect(verify).toMatch(/into v_before/);
    expect(verify).toMatch(/v_control is distinct from v_before/);
    expect(verify).not.toMatch(/like 'public\/true/);
  });

  it('reports when it could not be exercised instead of passing silently', () => {
    expect(verify).toMatch(/behavioural proof SKIPPED/);
  });

  it('re-checks the gate after the probe', () => {
    const tail = verify.slice(verify.lastIndexOf('raise notice'));
    expect(tail).toMatch(/gate reads % after the probe/);
  });
});

describe('the record', () => {
  it('names the measurement rather than asserting the risk abstractly', () => {
    expect(sql).toMatch(/16,253/);
    expect(sql).toMatch(/jay-johnson/);
  });

  it('CONTROL: the assertions survive a comment-only edit', () => {
    const stripped = sql
      .split('\n')
      .map((l) => (l.trimStart().startsWith('--') ? '-- x' : l))
      .join('\n')
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(stripped).toEqual(bare);
  });
});
