import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `city_wikidata_signals().wrong_title_back` must assert the IDENTITY of the
 * returned title, not the emptiness of the column.
 *
 * `99991790359075` shipped three zero-invariants over the rows a wrong-entity
 * repair dispositioned. Two compare against the retracted VALUE; the title one
 * fired on any non-null `wikipedia_title`, so a row correctly re-linked to a
 * different entity read as a regression. Measured on prod: 11 of 12 rows are
 * still cleared, and the twelfth (`frisco-us-xyxtu`) was re-linked from the
 * refuted Q62 "San Francisco" to Q128269 "Frisco, Texas" — corroborated by that
 * entity's own description, its enwiki sitelink and a P625 1.2 km from the row's
 * coordinates. The gate was red for days on the repair WORKING, which is how a
 * gate teaches its readers to scroll past it.
 *
 * Asserted over COMMENT-STRIPPED SQL on purpose: the migration's header quotes
 * the old broad predicate verbatim in order to explain it, so an unstripped
 * "the broad form is absent" check fails on correct code — and its mirror passes
 * with the statement deleted. A statement that quotes its own defect breaks
 * negative assertions in both directions.
 *
 * The migration filename is NOT pinned. It is found by content, so a later
 * CREATE OR REPLACE of the same function is what this reads.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function stripComments(sql: string): string {
  return sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');
}

function latestMatching(pattern: RegExp): { name: string; sql: string } {
  const hit = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }))
    .find(({ sql }) => pattern.test(stripComments(sql)));
  if (!hit) throw new Error(`no migration matches ${pattern}`);
  return hit;
}

const COMPARISON =
  "wikipedia_title = field_provenance->'wikidata_qid'->>'retracted_wikipedia_title'";

describe('city_wikidata_signals: the title invariant compares, it does not demand emptiness', () => {
  const { sql } = latestMatching(
    /create\s+or\s+replace\s+function\s+public\.city_wikidata_signals/i,
  );
  const body = stripComments(sql);

  function count(needle: string): number {
    return body.split(needle).length - 1;
  }

  it('compares against the retracted title in BOTH the counter and the examples list', () => {
    // Two copies of the predicate exist. Fixing one leaves the gate naming a row
    // it no longer counts, so this is asserted by count — a single-occurrence
    // check passes on the surviving copy.
    expect(count(COMPARISON)).toBe(2);
  });

  it('no longer treats any non-null title as a regression', () => {
    expect(body).not.toContain(
      "retracted_wikipedia_title' is not null\n     and wikipedia_title is not null;",
    );
  });

  it('still fires when a cleared row caches a title while carrying no identifier', () => {
    // Arm (b): the Kowloon terminal state. Without it, narrowing to the refuted
    // title alone would stop covering the 11 rows whose identifier was cleared,
    // and this change would be a loosening rather than a correction.
    expect(count('or wikidata_qid is null)')).toBe(2);
  });

  it('keeps the two sibling invariants it was made consistent with', () => {
    expect(body).toContain("wikidata_qid = field_provenance->'wikidata_qid'->>'retracted_value'");
    expect(body).toContain("description = field_provenance->'description'->'retracted'->>'from'");
    for (const key of ['qid_regressed', 'wrong_title_back', 'retracted_desc_back']) {
      expect(body).toContain(`'${key}'`);
    }
  });

  it('stays service_role only — a DEFINER aggregate granted to authenticated is granted to everyone', () => {
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(body).toContain(`revoke all on function public.city_wikidata_signals() from ${role}`);
    }
    expect(body).toContain(
      'grant execute on function public.city_wikidata_signals() to service_role',
    );
  });

  it('asserts the reached state AND that the cohort it watches is non-empty', () => {
    // A zero over an empty corpus, a revoked grant or a literal-returning stub is
    // not a clean corpus. Both inherited controls must survive the narrowing,
    // because a change that also narrowed the cohort would pass P1 by watching
    // nothing — and the re-linked control is what makes P1 able to tell the fix
    // from the bug at all.
    expect(body).toMatch(/rows_with_qid'\)::int < 1000/);
    expect(body).toMatch(/dispositioned'\)::int < 11/);
    expect(body).toMatch(/v_titled < 12/);
    expect(body).toMatch(/v_relink < 1/);
  });

  it('raises on every postcondition rather than only naming it', () => {
    // Replacing a `raise exception` with `null;` leaves every string-anchored
    // assertion above green while the postcondition has stopped failing — and a
    // `>=` bound tolerates removing exactly one, which is how the first draft of
    // this case let that mutation survive. The count is EXACT, and the branch
    // this migration exists for is additionally anchored on its own raise rather
    // than on the condition that guards it.
    const verify = body.slice(body.indexOf('$verify$'));
    expect((verify.match(/raise exception/g) ?? []).length).toBe(10);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    expect(verify).toMatch(/wrong_title_back'\)::int <> 0 then\s*\n\s*raise exception 'P1 failed:/);
  });
});
