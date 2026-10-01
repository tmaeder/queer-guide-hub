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
  'supabase/migrations/99991790377689_record_personality_sources_outing_guard.sql',
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

/**
 * The `create trigger ...;` statement alone.
 *
 * Scoped deliberately: `referencing old table as old_sources` appears THREE times
 * in this file — the header, the DDL, and the file's own verify block, which greps
 * `pg_get_triggerdef` for it. Asserting against the whole file therefore passes
 * with the DDL's clause deleted, which a mutation proved. The file's own
 * postcondition would still catch it at apply time; this repo-side guard must not
 * be the one that is vacuous.
 */
const triggerDdl = bare.slice(
  bare.indexOf('create trigger trg_personality_sources_outing_guard'),
  bare.indexOf('do $verify$'),
);

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
    expect(triggerDdl).toMatch(/after delete on public\.personality_sources/);
    expect(triggerDdl).toMatch(/referencing old table as old_sources/);
    expect(triggerDdl).toMatch(/for each statement/);
    expect(triggerDdl).not.toMatch(/for each row/);
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

describe('the record on main', () => {
  it('copies the objects verbatim from prod rather than re-deriving them', () => {
    // 99991790377689 was written by a concurrent session from pg_get_functiondef /
    // pg_get_triggerdef after the trigger had been hand-applied, so it ships no new
    // behaviour and is a no-op against the live database. That is what makes it a
    // faithful record rather than a second, divergent definition.
    expect(sql).toMatch(/pg_get_functiondef/);
    expect(sql).toMatch(/pg_get_triggerdef/);
  });

  it('asserts the objects exist after applying, rather than assuming', () => {
    expect(verify).toMatch(/raise exception/);
    expect(verify).toMatch(/trg_personality_sources_outing_guard/);
  });

  it('names the two details that must not be "tidied"', () => {
    // A FOR EACH ROW rewrite loses the transition table the body reads, and
    // trusting the deleted rows instead of re-checking would unpublish a person
    // who still holds a real source.
    expect(sql).toMatch(/FOR EACH ROW rewrite loses the transition table/);
    expect(sql).toMatch(/still holds a real source/);
  });
});
