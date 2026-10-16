import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 99991792178185 adds dedup_sweep_error_signals(), which reads `merge_error` off
 * the latest dedup_truth_sweep run. Nothing had ever read it: on 2026-10-16 the
 * run row recorded 46 auto-eligible venue pairs, 0 merged, and the reason, while
 * every status field said success and consecutive_failures stayed 0.
 *
 * The load-bearing design decision is the DISCRIMINATOR. Every merge_error on
 * record splits into benign chain-collapse (auto_merged 32..128) and genuine
 * defect (auto_merged always 0), so the gate is `auto_merged = 0` and NOT a
 * denylist of message strings — which is the rule 20330101100000 set for venue
 * `chain_skipped`, because the guard's wording lives in another function.
 *
 * Comments are STRIPPED before every assertion. The migration header quotes the
 * real error messages AND the rejected `capped > 0` shape in order to explain
 * them, so a naive scan of the raw file would match the explanation.
 */

const MIGRATION = '99991792178185_dedup_sweep_error_signals.sql';

const rawSql = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');
const health = readFileSync(join(process.cwd(), 'scripts/check-pipeline-health.mjs'), 'utf8');

/** Drop `--` line comments so prose quoting the defect cannot satisfy an assertion. */
const sql = rawSql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

/** The function body only, excluding the migration's own verify block. */
const body = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

/** The health-script section this migration feeds, comments stripped. */
const section = (() => {
  const start = health.indexOf("console.log('Dedup sweep merge errors')");
  const rest = health.slice(start);
  // Section ends at the final FAILED gate.
  const end = rest.indexOf('if (FAILED) {');
  return rest
    .slice(0, end === -1 ? undefined : end)
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
})();

describe('dedup_sweep_error_signals', () => {
  it('the comment stripper removes the header that quotes the defect', () => {
    // Positive control. Without it every "must not contain" below is vacuous,
    // because the header deliberately quotes both the messages and the rejected
    // shape to explain why they are not used.
    expect(rawSql).toMatch(/drop organization already merged/);
    expect(sql).not.toMatch(/drop organization already merged/);
    expect(rawSql).toMatch(/capped > 0 AND auto_merged = 0/);
    expect(sql).not.toMatch(/capped > 0 AND auto_merged = 0/);
  });

  it('found the health-script section', () => {
    // Guards against the slice silently returning the whole file or nothing.
    expect(section.length).toBeGreaterThan(400);
    expect(section).toContain('dedup_sweep_error_signals');
    expect(section).not.toContain('Venue city text');
  });

  // ── the discriminator ────────────────────────────────────────────────────

  it('gates on auto_merged = 0, not on any message text', () => {
    expect(body).toMatch(
      /'errors_blocking'[\s\S]{0,200}merge_error is not null and auto_merged = 0/i,
    );
  });

  it('classifies no error by its message string', () => {
    // A denylist of guard wording is exactly what 20330101100000 forbids.
    for (const msg of [
      'already merged',
      'is itself a duplicate',
      'has no field',
      'duplicate key value',
      'news_story_articles',
    ]) {
      expect(body).not.toContain(msg);
    }
  });

  it('does not use the measured-and-rejected capped > 0 shape as the gate', () => {
    // It misses the city row from the same run and all five news rows.
    expect(body).not.toMatch(/capped\s*>\s*0/);
  });

  it('keeps auto_merged NULLABLE so absent is not read as zero', () => {
    // coalesce(...,0) here would make a shape change look like a genuine defect
    // on every type, and would make types_missing_auto_merged permanently 0.
    expect(body).toMatch(/\(e->>'auto_merged'\)::int as auto_merged/);
    expect(body).not.toMatch(/coalesce\(\(e->>'auto_merged'\)::int,\s*0\)/);
  });

  it('counts the shape drift it cannot classify', () => {
    expect(body).toMatch(/'types_missing_auto_merged'[\s\S]{0,160}auto_merged is null/i);
  });

  it('treats a blank merge_error as no error', () => {
    expect(body).toMatch(/nullif\(btrim\(coalesce\(e->>'merge_error',\s*''\)\),\s*''\)/);
  });

  // ── probe integrity ──────────────────────────────────────────────────────

  it('distinguishes could-not-look from looked-and-found-none', () => {
    expect(body).toMatch(/'probe_ok',\s*\(select count\(\*\) = 1 from latest\)/);
    expect(body).toMatch(/'types_reported'/);
  });

  it('reads only the newest run and reports its age', () => {
    expect(body).toMatch(/order by r\.started_at desc[\s\S]{0,40}limit 1/i);
    expect(body).toMatch(/'run_age_hours'/);
  });

  it('reports every error, including the ones it does not gate on', () => {
    expect(body).toMatch(/'error_details'/);
    expect(body).toMatch(/'errors_benign'/);
  });

  // ── migration postconditions ─────────────────────────────────────────────

  it('asserts probe_ok, a parsed summary, every gated key, and the grants', () => {
    expect(verify).toMatch(/if coalesce\(\(v->>'probe_ok'\)::boolean, false\) is not true then/i);
    expect(verify).toMatch(/if coalesce\(\(v->>'types_reported'\)::int, 0\) < 2 then/i);
    expect(verify).toMatch(/if not \(v \? v_key\) then/i);
    expect(verify).toMatch(/grantee in \('anon', 'authenticated', 'PUBLIC'\)/);
  });

  it('revokes execute from anon and authenticated', () => {
    // A DEFINER function granted to authenticated is granted to every member.
    expect(sql).toMatch(/revoke all on function public\.dedup_sweep_error_signals\(\) from anon;/);
    expect(sql).toMatch(
      /revoke all on function public\.dedup_sweep_error_signals\(\) from authenticated;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.dedup_sweep_error_signals\(\) to service_role;/,
    );
  });

  it('has no short-circuited predicate in the verify block', () => {
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    expect(verify).not.toMatch(/\bwhere false\b/i);
  });

  // ── the health-script gate ───────────────────────────────────────────────

  /**
   * Slice ONE branch, bounded by where the next one starts.
   *
   * A `[\s\S]{0,N}FAILED = true` window is vacuous here: the branches sit next to
   * each other, so deleting the `FAILED = true` from the branch under test leaves
   * the regex free to match the NEXT branch's one and stay green. Mutation
   * testing caught exactly that — removing the blocking branch's gate survived.
   */
  const branch = (from: string, to: string) => {
    const a = section.indexOf(from);
    const b = section.indexOf(to, a + 1);
    expect(a, `branch start not found: ${from}`).toBeGreaterThan(-1);
    expect(b, `branch end not found: ${to}`).toBeGreaterThan(a);
    return section.slice(a, b);
  };

  it('fails the run on a blocking error', () => {
    expect(branch('if (blocking > 0)', 'if (shapeDrift > 0)')).toMatch(/FAILED = true/);
  });

  it('fails the run on shape drift it cannot classify', () => {
    expect(branch('if (shapeDrift > 0)', 'if (blocking === 0')).toMatch(/FAILED = true/);
  });

  it('fails when the probe itself is broken, rather than passing quietly', () => {
    expect(branch('if (s.probe_ok !== true)', "} else if (!('errors_blocking' in s)")).toMatch(
      /FAILED = true/,
    );
    // An absent key reads as undefined and skips its own comparison silently.
    expect(branch("} else if (!('errors_blocking' in s)", '} else {')).toMatch(/FAILED = true/);
    // Zero types parsed reads exactly like a sweep with no errors.
    expect(branch('if (types < 2)', 'for (const d of details)')).toMatch(/FAILED = true/);
  });

  it('does NOT fail on a benign error', () => {
    // Chain collapse under concurrency is expected; gating on it is the cry-wolf
    // shape that gets a sentinel ignored.
    const benignBlock = section.slice(section.indexOf('benign > 0'));
    expect(benignBlock).toMatch(/console\.warn/);
    expect(benignBlock.slice(0, benignBlock.indexOf('ageH'))).not.toMatch(/FAILED = true/);
  });

  it('prints every error detail so a human can see past the heuristic', () => {
    expect(section).toMatch(/for \(const d of details\)/);
    expect(section).toMatch(/d\.merge_error/);
    expect(section).toMatch(/d\.auto_merged/);
  });

  it('warns rather than fails on a stale run', () => {
    const staleBlock = section.slice(section.indexOf('ageH > 36'));
    expect(staleBlock).toMatch(/console\.warn/);
    expect(staleBlock).not.toMatch(/FAILED = true/);
  });

  it('treats an HTTP failure as having measured nothing', () => {
    expect(section).toMatch(/This check measured NOTHING/);
  });
});
