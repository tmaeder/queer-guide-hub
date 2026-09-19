import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991789825862 — the outing seal, codified, and the two performers
 * whose provenance came back.
 *
 * TWO THINGS ARE BEING PROTECTED AND THEY FAIL IN OPPOSITE DIRECTIONS.
 *
 *  1. THE SEAL. `trg_personalities_outing_guard` was attached to prod BY HAND
 *     during the incident and existed in no migration, so a rebuild from
 *     migrations would not have had it and `check-migration-drift.mjs` — which
 *     compares migration HISTORY against repo FILES, never schema OBJECTS —
 *     could not see it. The failure mode is silent absence.
 *
 *  2. THE REPUBLISH. `enforce_personality_public_gate()` drafts any row written
 *     as `public` while `needs_attention` is set, and the 13:14 demotion set
 *     that flag. So restoring `visibility` without clearing it in the SAME
 *     statement reports rows updated and publishes nobody — and a postcondition
 *     that only asserts the GATE reads 0 passes, because a row nobody published
 *     cannot breach an outing gate. The failure mode is silent success.
 *
 * Both are asserted positively. A test that only checks the seal is absent-safe
 * and republish-blind, and vice versa.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/99991789825862_outing_guard_seal_and_republish.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

/**
 * Comment-stripped. The header narrates the whole episode and quotes
 * `needs_attention`, `trust_safety_gate_status()` and the column list verbatim,
 * so a `toContain` over raw text is satisfied by the PROSE while the statement
 * it describes is gone — the vacuous-assertion class CLAUDE.md has now recorded
 * seven times.
 */
const bare = sql
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The trigger function body only — where the demote/raise decision lives. */
const fnBody = bare.slice(bare.indexOf('as $function$'), bare.indexOf('$function$;'));

/** Section 2: the republish + its postconditions. */
const republish = bare.slice(bare.indexOf('do $$'), bare.lastIndexOf('do $$'));

/** The UPDATE's SET clause only — what is actually written to the corpus. */
const setClause = republish.slice(
  republish.indexOf('update public.personalities p'),
  republish.indexOf('where p.enrichment_status'),
);

/** The UPDATE's WHERE clause only — the fail-safe conjuncts. */
const whereClause = republish.slice(
  republish.indexOf('where p.enrichment_status'),
  republish.indexOf('get diagnostics'),
);

describe('99991789825862 — the seal is codified', () => {
  it('CREATES the trigger function rather than assuming prod already has it', () => {
    // The whole reason this file exists: two migrations MENTION this function
    // and neither creates it.
    expect(bare).toMatch(
      /create or replace function public\.personalities_enforce_outing_guard\(\)/,
    );
  });

  it('attaches the trigger, and on both columns the incident travelled through', () => {
    // Scoped to the CREATE TRIGGER statement alone. Slicing to end-of-file
    // reaches sections 2 and 3, which both mention `wikidata_qid` and
    // `visibility` — measured: dropping `wikidata_qid` from the column list
    // left this test GREEN until the slice was bounded.
    const start = bare.indexOf('create trigger trg_personalities_outing_guard');
    const attach = bare.slice(start, bare.indexOf(';', start));
    expect(attach).toMatch(/create trigger trg_personalities_outing_guard/);
    // `wikidata_qid` is the #3813 shape (an identifier removed under a live row).
    expect(attach).toMatch(/\bwikidata_qid\b/);
    // `visibility` + `seo_indexable` are the 13:29:58 shape (a human republishing
    // through the admin UI). Dropping either half re-opens one of the two windows.
    expect(attach).toMatch(/\bvisibility\b/);
    expect(attach).toMatch(/\bseo_indexable\b/);
    expect(attach).toMatch(/\bis_living\b/);
    expect(attach).toMatch(/\blgbti_connection\b/);
  });

  it('DEMOTES and never RAISEs — a correct identifier repair must still land', () => {
    // Refusing the write would have made #3813 abort `db push` on main and take
    // every queued migration with it. The design choice is load-bearing, not
    // stylistic, so it is asserted in both directions.
    expect(fnBody).toMatch(/new\.visibility\s*:=\s*'draft'/);
    expect(fnBody).toMatch(/new\.seo_indexable\s*:=\s*false/);
    expect(fnBody).not.toMatch(/raise\s+exception/i);
  });

  it('mirrors the gate predicate: BOTH provenance arms, not just the identifier', () => {
    expect(fnBody).toMatch(/coalesce\(new\.wikidata_qid, ''\) ~ '\^Q\[0-9\]\+\$'/);
    // The sources arm is what stops the seal demoting every row the adult-link
    // cohort legitimately publishes on a `SKIP_` qid plus a real source row.
    expect(fnBody).toMatch(/personality_sources/);
    expect(fnBody).toMatch(/!~ '\^SKIP_'/);
  });
});

describe('99991789825862 — the republish actually publishes', () => {
  it('clears needs_attention in the SAME statement as visibility', () => {
    // Two statements are reverted by enforce_personality_public_gate() between
    // them. This is the silent-no-op trap and the single most important line.
    expect(setClause).toMatch(/visibility\s*=/);
    expect(setClause).toMatch(/needs_attention\s*=\s*false/);
  });

  it('is fail-safe: only a row that NOW carries provenance goes back up', () => {
    expect(whereClause).toMatch(/wikidata_qid ~ '\^Q\[0-9\]\+\$'/);
    expect(whereClause).toMatch(/exists \(select 1 from public\.personality_sources/);
    expect(whereClause).toMatch(/duplicate_of_id is null/);
    // Soft on preconditions: a row a concurrent session already restored is a
    // no-op, not an abort. `alaska` is skipped by these same conjuncts.
    expect(whereClause).toMatch(/visibility = 'draft'/);
  });

  it('asserts the gate through its own function, not a restated predicate', () => {
    // #3822 hand-restates the predicate and its copy drops `ally`,
    // `seo_indexable` and the sources arm — so it can pass while the real gate
    // is red. Calling the function cannot drift from the gate.
    expect(republish).toMatch(/from public\.trust_safety_gate_status\(\)/);
    expect(republish).toMatch(/where gate = 'person_outing_guard'/);
  });

  it('treats a missing gate row as a failure, never as zero', () => {
    // A probe that cannot see the answer is not a check.
    expect(republish).toMatch(/if v_gate is null then/);
  });

  it('asserts the rows are PUBLIC — a one-sided check is satisfied by doing nothing', () => {
    expect(republish).toMatch(/v_public <> 2/);
    expect(republish).toMatch(/visibility = 'public' and seo_indexable and not needs_attention/);
  });

  it('asserts the trigger is attached after the fact, not merely written above', () => {
    expect(republish).toMatch(/from pg_trigger t join pg_class c/);
    expect(republish).toMatch(/t\.tgname = 'trg_personalities_outing_guard'/);
  });

  it('declares an actor so the revision is never pruned', () => {
    // run_content_revision_prune drops actor_kind='system' only.
    expect(republish).toMatch(
      /set_config\('app\.actor', 'migration:outing_guard_seal_and_republish', true\)/,
    );
  });
});

describe('99991789825862 — the seal is proven, not assumed', () => {
  const probe = bare.slice(bare.lastIndexOf('do $$'));

  it('reproduces the #3813 shape and asserts the row is demoted', () => {
    expect(probe).toMatch(/set wikidata_qid = null/);
    expect(probe).toMatch(/nulling the identifier left the row/);
  });

  it('reproduces the human-republish shape that re-opened the gate at 13:29:58', () => {
    expect(probe).toMatch(/a manual republish reached/);
  });

  it('rolls the probe back and cannot swallow a real failure', () => {
    expect(probe).toMatch(/SEAL_PROBE_OK/);
    expect(probe).toMatch(/if sqlerrm <> 'SEAL_PROBE_OK' then raise; end if;/);
  });

  it('runs in its own block so its rollback cannot discard the republish', () => {
    // A savepoint rollback inside section 2 would undo the writes section 2
    // just made and its postconditions had just verified.
    expect(bare.indexOf('SEAL_PROBE_OK')).toBeGreaterThan(bare.indexOf('v_public <> 2'));
  });
});

describe('99991789825862 — the record', () => {
  it('names the drift class rather than only fixing one instance of it', () => {
    expect(sql).toMatch(/check-migration-drift/);
  });

  it('names what it deliberately does not seal', () => {
    // Deleting the last non-SKIP_ personality_sources row breaches the gate
    // without touching `personalities`, so the trigger cannot see it.
    expect(sql).toMatch(/personality_sources/);
    expect(sql).toMatch(/little-demon/);
  });

  it('CONTROL: the assertions survive a comment-only edit', () => {
    // If this fails, some assertion above is matching the header prose rather
    // than a statement, and the guard is vacuous.
    const commentsOnly = sql
      .split('\n')
      .map((l) => (l.trimStart().startsWith('--') ? '-- x' : l))
      .join('\n');
    const strippedControl = commentsOnly
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(strippedControl).toEqual(bare);
  });
});
