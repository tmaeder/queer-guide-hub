import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991792239679 — the 15 search_documents_index_* functions move from LANGUAGE sql to
 * plpgsql + force_custom_plan so their dual-mode `(p_id is null or x.id = p_id)` predicate can
 * be planned against the actual id. Measured 1,092.9 MB -> 14.9 MB per 15 single-row reindexes.
 *
 * EVERY ASSERTION RUNS OVER COMMENT-STRIPPED SQL, and that is load-bearing rather than tidy.
 * The migration's header quotes essentially every phrase asserted here — `LANGUAGE plpgsql`,
 * `plan_cache_mode`, `pg_get_functiondef`, `p_id is null or`, even the `\s*$` anchor — because
 * it explains them. An unstripped `toContain` would pass with the executable statement deleted,
 * which is the vacuous assertion this repo has recorded repeatedly.
 */

const MIGRATION = '99991792239679_search_indexers_plpgsql_custom_plan.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

// Comments at LINE START only — the house stripper. Sufficient here: every comment in this
// migration is a full line.
const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const rewrite = sql.slice(sql.indexOf('do $rewrite$'), sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('the rewrite changes the language, not the SQL', () => {
  it('converts LANGUAGE sql to plpgsql and attaches force_custom_plan in one substitution', () => {
    expect(rewrite).toContain("E'\\n LANGUAGE sql\\n'");
    expect(rewrite).toContain('LANGUAGE plpgsql');
    expect(rewrite).toContain("plan_cache_mode TO ''force_custom_plan''");
  });

  it('derives the definition from pg_get_functiondef instead of reconstructing the header', () => {
    // These 15 carry THREE different search_path settings ("", `public, extensions`, and
    // `public, extensions, pg_temp`). Reconstructing one by hand produced
    // `SET search_path TO 'public, extensions'` — a single schema of that name — and the
    // cities body then failed with `unaccent(text) does not exist`.
    expect(rewrite).toContain('pg_get_functiondef(r.oid)');
    expect(rewrite).not.toMatch(/set\s+search_path\s+to/i);
  });

  it('never substitutes inside the body: the dual-mode predicate is not rewritten', () => {
    // The whole point is that the SQL is carried over verbatim. A migration that "fixed" the
    // predicate would also be plausible and would change 14 function bodies.
    expect(rewrite).not.toContain('o.id = p_id');
    expect(rewrite).not.toContain('coalesce(p_id');
    expect(rewrite).not.toMatch(/replace\([^)]*p_id is null/i);
  });

  it('only touches functions that are still LANGUAGE sql, so a re-run is a no-op', () => {
    expect(rewrite).toMatch(/l\.lanname\s*=\s*'sql'/);
  });
});

describe('the transformation asserts it applied before executing', () => {
  it('refuses a body containing a $, which would make the $function$ tag ambiguous', () => {
    expect(rewrite).toMatch(/position\('\$' in r\.prosrc\)\s*>\s*0/);
  });

  it('anchors the closing delimiter on trailing whitespace, not bare end-of-string', () => {
    // rtrim(text) strips SPACES but not newlines, and pg_get_functiondef ends with
    // `$function$\n`. Anchoring on `\$function\$$` matched nothing and left the body
    // unterminated — this file's own guard caught it, not a failing function.
    expect(rewrite).toContain("regexp_replace(newdef, '\\$function\\$\\s*$'");
    expect(rewrite).not.toMatch(/regexp_replace\(\s*rtrim\(/);
  });

  it('verifies all four shape conditions and raises, rather than executing blindly', () => {
    const guard = rewrite.slice(rewrite.indexOf("if position('LANGUAGE plpgsql' in newdef)"));
    expect(guard).toContain('raise exception');
    // The execute must come AFTER the guard that protects it.
    expect(rewrite.indexOf('execute newdef')).toBeGreaterThan(
      rewrite.indexOf("if position('LANGUAGE plpgsql' in newdef)"),
    );
  });
});

describe('postconditions assert the reached state, not the work done', () => {
  it('fails if any indexer is still LANGUAGE sql', () => {
    expect(verify).toMatch(/v_sql_left\s*<>\s*0/);
    expect(verify).toContain('are still LANGUAGE sql');
  });

  it('fails if any indexer lacks the plan_cache_mode setting', () => {
    expect(verify).toContain("array['plan_cache_mode=force_custom_plan']");
    expect(verify).toMatch(/v_missing is not null/);
  });

  it('counts nothing that a second run would change, so the migration is idempotent', () => {
    // A `rewritten = 15` assertion would pass on the first run and fail on the second while
    // the schema was correct. Every check must be over the end state.
    //
    // SCOPED TO THE WHOLE FILE, not just the verify block: a surviving mutation put exactly
    // this assertion in the REWRITE block instead, where a verify-only check could not see
    // it. n_done may be incremented and reported, never asserted on.
    expect(verify).not.toMatch(/n_done/);
    const raisesOnCount = sql
      .split('\n')
      .filter((l) => /n_done/.test(l) && /raise\s+exception/i.test(l));
    expect(raisesOnCount).toEqual([]);
    expect(sql).not.toMatch(/n_done\s*(<>|!=|<|>|=)\s*\d/);
  });

  it('asserts the dual-mode predicate SURVIVED, over comment-stripped bodies', () => {
    // Proves the change was language-only. Stripping comments matters on this one too:
    // pg_proc.prosrc carries the body's own comments.
    expect(verify).toMatch(/v_dual\s*<\s*14/);
    // Whitespace-insensitive: the point is that prosrc is stripped before it is matched,
    // not how the operators are spaced.
    expect(verify).toMatch(/regexp_replace\(\s*p\.prosrc\s*,\s*'--\[\^'\s*\|\|\s*chr\(10\)/);
  });

  it('executes a converted function, because the catalog cannot show that it runs', () => {
    expect(verify).toMatch(/perform public\.search_documents_index_countries\(/);
  });

  it('raises on every failed postcondition rather than only reporting', () => {
    const raises = verify.match(/raise exception/g) ?? [];
    expect(raises.length).toBeGreaterThanOrEqual(4);
  });
});
