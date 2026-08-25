import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The city dedup sweep's geo arm may never auto-merge.
 *
 * The key arm (`dedup_despace(name)` equality + country + distance) is blind to
 * exonyms — 'munich' vs 'munchen' — so 20260928110000 added a second arm that
 * pairs cities by coordinates alone. Coordinates cannot tell a duplicate from a
 * district or an administrative umbrella: Manhattan sits 14 m from New York's
 * centroid, Grad Zagreb 650 m from Zagreb's. Auto-merging those destroys content
 * that `unmerge_cities` cannot restore — it only flips `duplicate_of_id` and
 * leaves the reparenting done, which is why the 29 wrongly merged pairs of
 * 2026-07-29 had to be repaired by hand.
 *
 * So `is_auto` is a hard literal false on that arm, and the two-QID exclusion is
 * the one filter that must stay: two distinct non-null wikidata_qids are a
 * positive statement that two different real places are involved.
 *
 * Text check against the migrations directory — no credentials, same pattern as
 * `src/lib/__tests__/citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('run_dedup_truth_sweep');

/** The `when 'city' then $q$ … $q$` candidate query, and only that branch. */
function cityBranch(): string {
  const start = sql.indexOf("when 'city' then $q$");
  expect(start, "the sweep has a `when 'city'` branch").toBeGreaterThan(-1);
  const end = sql.indexOf('$q$', start + "when 'city' then $q$".length);
  return sql.slice(start, end);
}

describe('run_dedup_truth_sweep city geo arm', () => {
  it('carries a geo-only arm', () => {
    expect(cityBranch()).toContain('geo_only_2km');
  });

  it('never marks a geo-only pair auto-eligible', () => {
    const branch = cityBranch();
    const arm = branch.slice(branch.indexOf('union all'));
    // The select list of the geo arm: id, id, name, name, is_auto, conf, reason.
    expect(arm).toMatch(/select\s+a\.id,\s*b\.id,\s*a\.name,\s*b\.name,\s*false,/);
    expect(arm).not.toMatch(/true\s*,\s*[\d.]+::numeric\s*,\s*'geo_only_2km'/);
  });

  it('excludes pairs that carry two different wikidata QIDs', () => {
    const branch = cityBranch();
    const arm = branch.slice(branch.indexOf('union all'));
    expect(arm).toMatch(
      /not\s*\(\s*a\.qid is not null and b\.qid is not null and a\.qid <> b\.qid\s*\)/,
    );
  });

  it('keeps the original key arm intact', () => {
    const branch = cityBranch();
    expect(branch).toContain('a.dsp = b.dsp');
    expect(branch).toContain('despace_geo');
  });
});
