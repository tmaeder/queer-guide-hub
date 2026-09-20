import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `search_embeddings_reconcile(p_limit)` runs every 10 minutes (pg_cron jobid 2526), which
 * carries a 2-minute statement timeout.
 *
 * Measured on prod 2026-09-19: 13 of 78 runs (17%) died at that 120 s ceiling, avg 49.8 s,
 * against ZERO rows of actual work. The plan named its own cause:
 *
 *     Parallel Seq Scan on content_embeddings ce
 *       Filter: ((embedding IS NOT NULL) AND (vector_dims(embedding) = 1024))
 *
 * `vector_dims()` is an opaque function call — pgvector fully detoasts the datum to answer it —
 * so the driving side was a seq scan of all 248,229 rows that detoasted every vector out of a
 * 1,750 MB TOAST relation, ten minutes apart, forever. `embedding IS NOT NULL` beside it is
 * free: a null test reads the null bitmap and never detoasts. The two predicates look alike
 * and are not.
 *
 * The LIMIT cannot rescue it, and this is the part worth remembering: it short-circuits only
 * when rows flow, and this is a BACKSTOP that normally finds nothing — so THE JOB IS SLOWEST
 * EXACTLY WHEN IT IS CAUGHT UP. A real backlog made it look healthy.
 *
 * The predicate was dead code. Both `content_embeddings.embedding` and
 * `search_embeddings.embedding` are `vector(1024)` and pgvector enforces the dimension through
 * typmod (`'[1,2,3]'::vector::vector(1024)` → `expected 1024 dimensions, not 3`), so no row of
 * either column can have dims <> 1024. Removing it: 120 s timeout → **866 ms**, same row set.
 *
 * WHY A REPO TEST ON TOP OF THE MIGRATION'S OWN `do $verify$`: that block binds only the
 * migration carrying it, and `create or replace function` lets the next restatement silently
 * put the call back. The function would still return the correct number — just slowly enough
 * to time out — so nothing else would notice. Same reasoning as
 * `src/lib/__tests__/tagHygieneStats.test.ts`, which is guarded twice for the same reason.
 *
 * Text check against the migrations directory, so it runs in CI without credentials.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FN = 'search_embeddings_reconcile';

/** Strip `--` line comments. Both the migration header and the function body deliberately
 *  MENTION vector_dims to warn the next reader off re-adding it; scanning unstripped text
 *  would match that prose and fail on correct code — and would equally pass for a body that
 *  keeps the call and drops the comment. */
const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** The newest migration that (re)defines the function — a pinned filename rots the moment
 *  someone legitimately restates the body. */
const latestDefinition = (): { file: string; sql: string } => {
  const hits = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS, file), 'utf8') }))
    .filter(({ sql }) =>
      new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${FN}\\s*\\(`, 'i').test(sql),
    );
  return hits[hits.length - 1];
};

/** Just the function body, so an assertion about the QUERY cannot be satisfied by the
 *  migration's prose or by a sibling statement elsewhere in the same file. */
const functionBody = (sql: string): string => {
  const start = sql.search(
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${FN}\\s*\\(`, 'i'),
  );
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$function$;', start);
  expect(end).toBeGreaterThan(start);
  return stripComments(sql.slice(start, end));
};

describe('search_embeddings_reconcile: no full-corpus TOAST detoast', () => {
  const latest = latestDefinition();

  it('has a definition to check (positive control)', () => {
    // An empty match set also satisfies every "must not contain" assertion below.
    expect(latest).toBeTruthy();
    expect(latest.sql).toContain(FN);
  });

  it('does not call vector_dims() — the column type enforces the dimension', () => {
    expect(functionBody(latest.sql)).not.toMatch(/vector_dims/i);
  });

  it('still filters on IS NOT NULL, which is the cheap half and must not be dropped with it', () => {
    expect(functionBody(latest.sql)).toMatch(/embedding\s+is\s+not\s+null/i);
  });

  it('still bounds the batch and still anti-joins search_embeddings', () => {
    const body = functionBody(latest.sql);
    expect(body).toMatch(/limit\s+p_limit/i);
    expect(body).toMatch(/not\s+exists/i);
    expect(body).toMatch(/search_embeddings\s+se/i);
  });

  it('asserts its own premise: both embedding columns are still vector(1024)', () => {
    // Removing the guard is only safe while typmod enforces the dimension. The migration must
    // check that at apply time, or the removal becomes silently unsafe if a column is widened.
    const verify = stripComments(latest.sql.slice(latest.sql.indexOf('do $verify$')));
    expect(verify).toMatch(/atttypmod\s*=\s*1024/);
    expect(verify).toMatch(/typname\s*=\s*'vector'/);
    // format_type() schema-qualifies per the caller's search_path, so comparing its string is
    // the check-that-encodes-one-phrasing trap; it aborted this migration's own first dry run.
    expect(verify).not.toMatch(/format_type/);
  });

  it('proves the function still executes, not merely that it parses', () => {
    const verify = stripComments(latest.sql.slice(latest.sql.indexOf('do $verify$')));
    expect(verify).toMatch(new RegExp(`perform\\s+public\\.${FN}\\s*\\(`, 'i'));
  });
});
