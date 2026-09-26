import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard for 99991789843323_autoapprove_honours_batchable.sql.
 *
 * `run_review_queue_autoapprove` publishes content with no human in the loop.
 * What stops it publishing an accessibility claim, a safety rating or a travel
 * date is ONE predicate in its SELECT — `g.batchable` — and the function is a
 * CREATE OR REPLACE, so the next restatement drops it silently and every other
 * check in the repo still passes. The migration deliberately does NOT assert
 * the predicate itself: a text check inside a `do $verify$` block aborts
 * `db push` for the whole repository the moment someone rewrites the condition
 * while preserving it (20810101100100). So the check lives here, where a false
 * alarm costs one PR.
 *
 * Every assertion runs against COMMENT-STRIPPED SQL. The migration's header
 * quotes `batchable=false` a dozen times and names all four gated fields, so a
 * bare `toContain` over the raw file passes with the predicate deleted — the
 * vacuous-assertion class this repo has recorded repeatedly.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
const FN = 'run_review_queue_autoapprove';

/** The latest migration defining the function — not a pinned filename, so a
 *  later restatement is what gets checked rather than this one forever. */
function latestDefinition(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const hit = files
    .filter((f) =>
      readFileSync(join(MIGRATIONS, f), 'utf8').includes(`CREATE OR REPLACE FUNCTION public.${FN}`),
    )
    .pop();
  if (!hit) throw new Error(`no migration defines ${FN}`);
  return readFileSync(join(MIGRATIONS, hit), 'utf8');
}

/** Strip `--` line comments. Without this the header alone satisfies most of
 *  the assertions below while the statements say the opposite. */
function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

/** The FOR loop's SELECT only. Scoping matters: the same predicate appears
 *  again in the `held_for_human_not_batchable` counter, so an unscoped match
 *  passes with the loop's copy deleted — which is the one that gates writes. */
function loopSelect(sql: string): string {
  const from = sql.indexOf('FOR r IN');
  const to = sql.indexOf('LOOP', from);
  expect(from, 'the FOR loop is missing entirely').toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return sql.slice(from, to);
}

describe('autoapprove honours review_field_registry.batchable', () => {
  const src = statements(latestDefinition());

  it('gates the row loop on batchable', () => {
    expect(loopSelect(src)).toMatch(/AND\s*\(\s*g\.batchable\b/);
  });

  it('carries exactly one exception, and it is city.safety_notes', () => {
    const loop = loopSelect(src);
    // A pair comparison, never a LIKE/regex/IN over field names: a second
    // exception has to be written out in full rather than slipped in by
    // widening an existing pattern.
    expect(loop).toMatch(
      /\(\s*q\.entity_type\s*,\s*q\.field\s*\)\s*=\s*\(\s*'city'\s*,\s*'safety_notes'\s*\)/,
    );
    const exceptions = loop.match(/\(\s*q\.entity_type\s*,\s*q\.field\s*\)\s*=/g) ?? [];
    expect(exceptions).toHaveLength(1);
  });

  it('reports what it held back instead of staying silent', () => {
    // Without this key the run summary is identical whether the predicate is
    // present or gone, so "held for a human" reads as "nothing to do".
    expect(src).toContain('held_for_human_not_batchable');
  });

  it('demotes city.lgbt_friendly_rating in the registry, not in the predicate', () => {
    // In the registry so one UPDATE reverses it. In the predicate it would
    // take a migration, and the list would drift from the column that already
    // means this.
    expect(src).toMatch(
      /UPDATE\s+public\.review_field_registry\s+SET\s+batchable\s*=\s*false\s+WHERE\s+entity_type\s*=\s*'city'\s+AND\s+field\s*=\s*'lgbt_friendly_rating'/,
    );
  });

  it('asserts the four gated fields are non-batchable, and safety_notes survives', () => {
    // Both directions. A migration that excluded safety_notes too would
    // satisfy "the four are gated" while retracting a decision it claims to
    // keep — the mirror assertion is what catches an over-broad sweep.
    for (const pair of [
      /\(\s*'venue'\s*,\s*'accessibility_attributes'\s*\)/,
      /\(\s*'venue'\s*,\s*'accessibility_notes'\s*\)/,
      /\(\s*'city'\s*,\s*'best_time_to_visit'\s*\)/,
      /\(\s*'city'\s*,\s*'lgbt_friendly_rating'\s*\)/,
    ]) {
      expect(src).toMatch(pair);
    }
    expect(src).toMatch(/safety_notes[\s\S]{0,400}?RAISE EXCEPTION/);
  });

  it('leaves the applied rows alone — this changes what happens next', () => {
    // Nothing already auto-approved is retracted, and nothing is rejected: the
    // held rows stay `open` and visible in /admin/quality. A migration that
    // started rejecting them would be a different, much larger change.
    expect(src).not.toMatch(/UPDATE\s+public\.entity_review_queue[\s\S]{0,200}status\s*=\s*'open'/);
    expect(src).not.toMatch(/status\s*=\s*'pending'/);
  });
});
