import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20360902100000_event_dead_gaycities_images.sql';

/** Comments are prose; a guard must live in the STATEMENTS. */
function statements(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

describe('dead gaycities image strip migration', () => {
  const sql = statements(
    readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8'),
  );

  it('clamps the batch in the function body, not only in a comment', () => {
    // `greatest(coalesce(p_batch, 300), 1)` nests a paren pair inside the
    // `greatest(...)` call, so a naive `[^)]*` inside `greatest\(...\)` stops
    // at the FIRST `)` (coalesce's) instead of greatest's own — verified
    // against the real file, where that naive form false-negatives on
    // correct code. This tolerates exactly one level of nesting, which is
    // what `coalesce(...)` inside `greatest(...)` is.
    expect(sql).toMatch(/least\s*\(\s*greatest\s*\(\s*[^()]*\([^()]*\)[^()]*\)\s*,\s*300\s*\)/);
  });

  it('rebuilds the array by filter rather than emptying it', () => {
    expect(sql).toMatch(/set\s+images\s*=\s*array\s*\(\s*select/i);
    expect(sql).not.toMatch(/set\s+images\s*=\s*'\{\}'/i);
  });

  it('keeps the synthetic positive control — the corpus has no mixed arrays to test with', () => {
    expect(sql).toContain('https://example.com/good.jpg');
    expect(sql).toMatch(/raise exception 'dead-image filter dropped a live url/);
    expect(sql).toMatch(/raise exception 'dead-image filter kept a dead url/);
  });

  // The migration defines TWO functions with DELIBERATELY DIFFERENT security
  // modes, so a bare `expect(sql).toMatch(/security invoker/)` proves nothing —
  // it would pass while the runner was definer and the sentinel invoker. Isolate
  // each function's own definition block and assert against that.
  function definitionOf(name: string): string {
    const block = sql
      .split(/create or replace function/i)
      .find((chunk) => chunk.trimStart().startsWith(`public.${name}`));
    if (!block) throw new Error(`no definition found for ${name}`);
    return block;
  }

  it('the runner is security INVOKER — it reads and writes events broadly', () => {
    const def = definitionOf('run_event_dead_image_strip');
    expect(def).toMatch(/security\s+invoker/i);
    expect(def).not.toMatch(/security\s+definer/i);
  });

  it('the sentinel is security DEFINER — it returns aggregate counts, never rows', () => {
    const def = definitionOf('dead_gaycities_image_signals');
    expect(def).toMatch(/security\s+definer/i);
  });

  it('grants execute on both functions to service_role only', () => {
    expect(sql).toMatch(
      /revoke all on function public\.run_event_dead_image_strip\(int\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.run_event_dead_image_strip\(int\) to service_role/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.dead_gaycities_image_signals\(\) from public, anon, authenticated/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.dead_gaycities_image_signals\(\) to service_role/,
    );
  });

  it('does not restate pipeline_hygiene_stats — that is a merge-collision surface', () => {
    expect(sql).not.toMatch(/create or replace function public\.pipeline_hygiene_stats/i);
  });
});
