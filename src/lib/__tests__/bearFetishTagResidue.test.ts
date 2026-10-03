/**
 * Guards `99991791015920_bear_fetish_tag_residue.sql`.
 *
 * `99991790878434` moved 580 bear events off `event_type='fetish'` and left the
 * duplicate claim standing in `events.tags`. This file clears that residue for
 * exactly the rows that migration repaired and whose own text carries no fetish
 * token -- 325 rows, measured on prod, dry-run at scope=325 / stamped=325 /
 * genuine-kept=61.
 *
 * Every assertion runs against COMMENT-STRIPPED source. The migration's header
 * quotes the predicate, the tag name and the precedent verbatim, so a search
 * over raw text passes while the executable statement is gone -- the vacuous
 * class this repo has recorded repeatedly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '99991791015920_bear_fetish_tag_residue';
const SRC = readFileSync(join(process.cwd(), 'supabase/migrations', `${MIGRATION}.sql`), 'utf8');

/** Drop line-leading `--` comments only; a mid-line `--` is inside a string here. */
const code = SRC.split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

/** The body between the UPDATE and the verify block: the statement under test. */
const updateStmt = (() => {
  const from = code.indexOf('update public.events e set');
  const to = code.indexOf('do $verify$');
  expect(from, 'the UPDATE statement must exist').toBeGreaterThan(-1);
  expect(to, 'the verify block must exist').toBeGreaterThan(from);
  return code.slice(from, to);
})();

const verifyBlock = (() => {
  const from = code.indexOf('do $verify$');
  return code.slice(from);
})();

describe('bear fetish tag residue — scope', () => {
  it('removes only the fetish tag, and only with array_remove', () => {
    expect(updateStmt).toContain("array_remove(coalesce(e.tags, '{}'::text[]), 'fetish')");
  });

  it('never ADDS a tag — the new event_type must not be written back', () => {
    // `run_event_type_reclassify`'s own comment: duplicating event_type into
    // tags is what made the old verdict circular.
    expect(updateStmt).not.toMatch(/array_append|array_cat|\|\|\s*array\[/i);
  });

  it('is scoped to the rows 99991790878434 repaired, not a frozen id list', () => {
    const scope = code.slice(
      code.indexOf('create temporary table _bear_tag_scope'),
      code.indexOf('update public.events e set'),
    );
    expect(scope).toContain("'by' = 'migration:99991790878434'");
    expect(scope).not.toMatch(/\bid in \(/i);
  });

  it('requires the no-fetish-token evidence in the scope, not just the stamp', () => {
    const scope = code.slice(
      code.indexOf('create temporary table _bear_tag_scope'),
      code.indexOf('update public.events e set'),
    );
    // The negation is the whole justification: a row with a real token keeps
    // its tag. Dropping `not` here would sweep genuine fetish events.
    expect(scope).toMatch(
      /not\s*\(\(coalesce\(e\.title[\s\S]*?~\*\s*'\\mleather\\M\|fetish\|\\mkink\\M\|\\mrubber\\M\|pup\(py\)\? play\|cruising'/,
    );
  });

  it('reads the text from title AND description, not the title alone', () => {
    const scope = code.slice(
      code.indexOf('create temporary table _bear_tag_scope'),
      code.indexOf('update public.events e set'),
    );
    expect(scope).toContain("left(coalesce(e.description, ''), 400)");
  });

  it('excludes merged-away rows', () => {
    const scope = code.slice(
      code.indexOf('create temporary table _bear_tag_scope'),
      code.indexOf('update public.events e set'),
    );
    expect(scope).toContain('duplicate_of_id is null');
  });
});

describe('bear fetish tag residue — provenance', () => {
  it('stamps the removal with this migration and preserves the prior array', () => {
    expect(updateStmt).toContain("'by', 'migration:99991791015920'");
    expect(updateStmt).toContain("'previous', to_jsonb(s.tags_before)");
    expect(updateStmt).toContain("'removed', jsonb_build_array('fetish')");
  });

  it('builds field_provenance with || and never jsonb_set(create_missing)', () => {
    // jsonb_set creates only the LAST path element, so a row with no `tags`
    // key would be stamped with nothing — the trap 21050101100000 recorded.
    expect(updateStmt).toContain("coalesce(e.field_provenance, '{}'::jsonb) || jsonb_build_object");
    expect(updateStmt).not.toMatch(/jsonb_set\s*\(/);
  });
});

describe('bear fetish tag residue — postconditions', () => {
  it('refuses an empty scope rather than passing vacuously', () => {
    expect(verifyBlock).toMatch(/if v_scope = 0 then\s*\n?\s*raise exception/);
  });

  it('asserts the END STATE, not the row count of its own UPDATE', () => {
    // P1 re-queries events; a check that only compared ROW_COUNT would pass on
    // a re-run that changed nothing.
    expect(verifyBlock).toMatch(/select count\(\*\) into v_bad[\s\S]*?from public\.events/);
    expect(verifyBlock).toMatch(/if v_bad <> 0 then\s*raise exception 'P1 failed/);
  });

  it('asserts every scoped row is stamped', () => {
    expect(verifyBlock).toMatch(/if v_stamped <> v_scope then\s*raise exception 'P2 failed/);
  });

  it('keeps the control event — tag AND type', () => {
    expect(verifyBlock).toContain("slug = 'bear-dance-folsom-edition-berlin-2027'");
    expect(verifyBlock).toMatch(/not v_control_tag or v_control_type <> 'fetish'/);
  });

  it('asserts the genuine bear+fetish cohort survives as a FLOOR', () => {
    // An equality would abort db push for the whole repo if a concurrent
    // session legitimately retyped one of the 61.
    expect(verifyBlock).toMatch(/if v_bad < 40 then\s*\n?\s*raise exception 'P4 failed/);
  });

  it('has no neutered condition anywhere in the verify block', () => {
    // Short-circuiting a predicate with `false` leaves every string-anchored
    // assertion green while the check has stopped checking.
    expect(verifyBlock).not.toMatch(/\bwhere false\b|\band false\b|\bif false\b/i);
  });

  it('counts exactly seven guarded postconditions', () => {
    const raises = verifyBlock.match(/raise exception 'P\d failed/g) ?? [];
    expect(raises).toHaveLength(7);
  });
});

/**
 * Cohort B. `99991790878434` scoped its repair to `title ~* '\mbears?\M'`, i.e.
 * English only — a gap found by querying the LIVE search-proxy rather than by
 * reading, when `Bärenpaadiie XXL Hamburg` came back under
 * `filters.categories=['fetish']`.
 */
const cohortB = (() => {
  const from = code.indexOf('create temporary table _bear_type_scope_b');
  const to = code.indexOf('do $verify$');
  expect(from, 'the cohort-B scope table must exist').toBeGreaterThan(-1);
  expect(to, 'cohort B must sit above the verify block').toBeGreaterThan(from);
  return code.slice(from, to);
})();

describe('bear fetish residue — cohort B (non-English)', () => {
  it('excludes the English cohort so the two passes cannot double-handle a row', () => {
    expect(cohortB).toContain("not (e.title ~* '\\mbears?\\M')");
  });

  it('carries the non-English and diacritic bear vocabulary', () => {
    // Each alternative was justified by a hand-read row: German Bären,
    // Spanish oso/osos, Italian orsi, and Bëar with metal umlauts.
    for (const needle of ['b(ä|ae)ren', '\\mb(ë|e)ar\\M', '\\mosos?\\M', '\\morsi\\M']) {
      expect(cohortB).toContain(needle);
    }
  });

  it('still requires the no-fetish-token evidence', () => {
    expect(cohortB).toMatch(
      /not\s*\(\(coalesce\(e\.title[\s\S]*?~\*\s*'\\mleather\\M\|fetish\|\\mkink\\M\|\\mrubber\\M\|pup\(py\)\? play\|cruising'/,
    );
  });

  it('derives the new type rather than hardcoding one', () => {
    expect(cohortB).toContain("public.infer_event_type(e.title, e.description) ->> 'event_type'");
    expect(cohortB).not.toMatch(/event_type\s*=\s*'(party|other|festival|social)'/);
  });

  it('refuses to write fetish back', () => {
    // Without this the retype could reinstate the very claim it removes.
    expect(cohortB).toContain("b.new_type <> 'fetish'");
  });

  it('preserves both prior values on the row', () => {
    expect(cohortB).toContain("'value', b.type_before");
    expect(cohortB).toContain("'tags', to_jsonb(b.tags_before)");
    expect(cohortB).toContain("'by', 'migration:99991791015920'");
  });

  it('names the migration whose scope it extends', () => {
    expect(cohortB).toContain('migration:99991790878434');
  });

  it('is asserted empty afterwards, and re-queried rather than counted', () => {
    expect(verifyBlock).toMatch(/raise exception 'P5 failed/);
    const p5 = verifyBlock.slice(
      verifyBlock.indexOf('select count(*) into v_bad', verifyBlock.indexOf("'P4 failed")),
      verifyBlock.indexOf("'P5 failed"),
    );
    expect(p5).toContain('from public.events e');
    expect(p5).toContain("not (e.title ~* '\\mbears?\\M')");
  });

  it('asserts the retype did not leave a cohort-B row on fetish (P6)', () => {
    expect(verifyBlock).toMatch(/join _bear_type_scope_b b on b\.id = e\.id[\s\S]*?'P6 failed/);
  });
});
