import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Shared migration-text helpers for the SQL guard tests.
 *
 * These tests assert against supabase/migrations rather than a live database so
 * they run in CI without credentials (the pattern citySafetyBackfill.test.ts
 * established). The subtlety they all share is finding the migration that holds
 * the CURRENT definition of a function, which is the last one that DEFINES it —
 * not the last one that merely mentions it.
 *
 * The naive filter `sql.includes('FUNCTION public.<fn>')` is wrong twice over,
 * and both halves were live defects:
 *
 *  - it also matches GRANT, REVOKE, COMMENT ON, DROP FUNCTION and
 *    `CREATE TRIGGER ... EXECUTE FUNCTION public.<fn>()`, any of which can win
 *    the scan and leave the test reading a file that defines nothing; and
 *  - it MISSES real definitions, because this repo spells them three ways:
 *    `CREATE OR REPLACE FUNCTION "public"."fn"()` (the baseline dump's quoted
 *    identifiers), `create or replace function public.fn(` and bare
 *    `CREATE OR REPLACE FUNCTION fn(` with no schema at all
 *    (20260415170500_unified_tag_dedup.sql:22).
 *
 * A test that misses the real definition does not fail — it silently reads its
 * own migration and passes vacuously while production runs the older body.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

const sqlFiles = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** Newest migration whose text matches `re`. Throws if none does. */
export function latestMatching(re: RegExp, what: string): string {
  for (const f of [...sqlFiles].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (re.test(sql)) return sql;
  }
  throw new Error(`no migration contains ${what}`);
}

/** Matches a real definition of `fn`, quoted or unquoted, schema-qualified or not. */
export const definitionRe = (fn: string) =>
  new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+("?public"?\\.)?"?${fn}"?\\s*\\(`, 'i');

/** Text of the newest migration that actually DEFINES `fn`. */
export const latestDefinitionOf = (fn: string) =>
  latestMatching(definitionRe(fn), `a definition of ${fn}`);

/** The definition onwards, so assertions cannot match a same-file preamble or comment. */
export function functionBody(fn: string): string {
  const sql = latestDefinitionOf(fn);
  return sql.slice(sql.search(definitionRe(fn)));
}
