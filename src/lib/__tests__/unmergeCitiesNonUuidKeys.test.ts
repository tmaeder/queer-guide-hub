import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the bigint-key fix in unmerge_cities
 * (supabase/migrations/*_unmerge_cities_non_uuid_keys.sql -- resolved by SLUG,
 * never by version. This file has been renumbered five times chasing a moving
 * ceiling; a version in this header is one more place to forget.)
 *
 * The defect: the replay compared recorded ids with a hardcoded `v::uuid`, and
 * three replayed tables key on bigint (ingestion_events, venue_coord_fixes,
 * source_coverage_targets). The cast fails at PLAN time, so an empty recorded
 * array threw exactly as hard as a populated one -- 35 of 35 schema:1 city
 * merges were unreversible while their audit rows all carried `schema:1` and a
 * populated `details.moved`.
 *
 * Every assertion here protects one half of that, and the count-based ones are
 * deliberate: asserting "the text form is present" passes while the OTHER site
 * still casts to uuid.
 *
 * Assertions run against COMMENT-STRIPPED sql -- the header explains the defect
 * in prose and quotes the broken expression verbatim, so a `toContain` over the
 * raw file would pass with the fix deleted.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function migrationSource(): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => /_unmerge_cities_non_uuid_keys\.sql$/.test(f))
    .sort()
    .pop();
  if (!file) throw new Error('unmerge_cities_non_uuid_keys migration not found');
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/** Drop `--` comments so the header cannot satisfy an assertion. */
function statements(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');
}

const SRC = statements(migrationSource());

/** Just the CREATE OR REPLACE body, which is what the cast count is about. */
const FN_BODY = (() => {
  const open = SRC.indexOf('as $function$');
  const close = SRC.indexOf('$function$;', open);
  if (open === -1 || close === -1) throw new Error('function body not found');
  return SRC.slice(open, close);
})();

describe('unmerge_cities bigint keys', () => {
  it('compares the dynamic replay as text, never casting to uuid', () => {
    // The whole defect in one line. ingestion_events.id and
    // venue_coord_fixes.id are bigint and the loop replays both.
    expect(SRC).toContain(
      "'update public.%I set %I = $1 where %I = $2 and %I::text in (select v from jsonb_array_elements_text($3) v)'",
    );
    expect(SRC).not.toContain('%I in (select v::uuid from jsonb_array_elements_text($3) v)');
  });

  it('fixes the STATIC source_coverage_targets statement too', () => {
    // Fixing only the loop leaves unmerge broken for any city with a coverage
    // target -- that id is bigint as well.
    const sct = SRC.slice(SRC.indexOf('update public.source_coverage_targets'));
    expect(sct.slice(0, 400)).toMatch(/id::text\s+in\s*\(select v from jsonb_array_elements_text/);
  });

  it('leaves exactly the seven genuinely-uuid sites alone', () => {
    // Counted, not merely "present": a sweep that cast every comparison to text
    // would satisfy any single presence check while needlessly deoptimising six
    // correct statements.
    //
    // Scoped to the FUNCTION BODY. Counting over the whole file reads 9, because
    // the verify block carries the string twice more -- once as the regexp it
    // searches for and once inside its own RAISE message -- which is a different
    // denominator from the DB-side postcondition (that one counts within
    // pg_get_functiondef, i.e. the function alone).
    const body = FN_BODY;
    const casts = body.match(/v::uuid/g) ?? [];
    expect(casts).toHaveLength(7);
  });

  it('still replays all three bigint-keyed tables', () => {
    // If a later edit "fixes" this by dropping the offending tables from the
    // triples array, unmerge stops throwing and silently stops restoring.
    expect(SRC).toContain("'ingestion_events','city_id','id'");
    expect(SRC).toContain("'venue_coord_fixes','city_id','id'");
    expect(SRC).toContain('update public.source_coverage_targets');
  });

  it('keeps the pre-schema refusal rather than half-undoing', () => {
    expect(SRC).toMatch(/v_pre_schema\s+and\s+not\s+p_force/);
    expect(SRC).toMatch(/predates moved-row recording/);
  });

  it('verifies with a real round trip, not a string scan', () => {
    // The previous version passed every structural test that existed. Only
    // calling the function catches a plan-time cast failure.
    const verify = SRC.slice(SRC.indexOf('do $verify$'));
    expect(verify).toContain('public.unmerge_cities(v_audit)');
    expect(verify).toContain('public.merge_cities(v_keep, v_drop, true)');
    expect(verify).toMatch(/round trip lost rows/);
    expect(verify).toMatch(/reparenting_restored=false/);
  });

  it('counts the remaining uuid casts as a postcondition', () => {
    const verify = SRC.slice(SRC.indexOf('do $verify$'));
    expect(verify).toMatch(/v_uuid_casts\s*<>\s*7/);
  });

  it('counts over the SAME denominator this file does: comments stripped', () => {
    // This is the assertion that was missing, and its absence broke db push on
    // main for four and a half hours.
    //
    // `statements()` above strips `--` comments before counting, and gets 7.
    // The DB-side postcondition counted the raw `pg_get_functiondef`, which
    // returns the body INCLUDING its comments -- and this body quotes
    // `v::uuid` inside a comment explaining why the bigint sites use the text
    // form. So the two checks measured different denominators: this file said
    // 7 and passed in CI, the database said 8 and aborted, on a rewrite that
    // was correct. `db push` stops at the first failing file and takes every
    // migration queued behind it, so the blast radius was the whole repo.
    //
    // Verified against the live server rather than reasoned about:
    // pg_get_functiondef DOES preserve body comments (a probe function with a
    // commented marker read raw=2 / stripped=1).
    const rawBody = migrationSource().slice(
      migrationSource().indexOf('as $function$'),
      migrationSource().indexOf('$function$;'),
    );
    expect(rawBody.match(/v::uuid/g) ?? []).toHaveLength(8); // 7 casts + 1 comment
    expect(FN_BODY.match(/v::uuid/g) ?? []).toHaveLength(7); // this file's count

    // The postcondition must therefore strip before it counts, or it is
    // asserting against a denominator nothing else in the repo uses.
    const verify = SRC.slice(SRC.indexOf('do $verify$'));
    expect(verify).toMatch(/regexp_replace\s*\(\s*pg_get_functiondef/);
  });

  it('never grants unmerge_cities beyond service_role', () => {
    expect(SRC).toMatch(
      /revoke\s+all\s+on\s+function\s+public\.unmerge_cities\(uuid,\s*boolean\)\s+from\s+public,\s*anon,\s*authenticated/i,
    );
    expect(SRC).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.unmerge_cities\(uuid,\s*boolean\)\s+to\s+service_role/i,
    );
  });
});
