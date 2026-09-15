import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards `85000101100000_city_comma_qualifier_merges.sql`.
 *
 * The standing requirement is that city dedup rests on real geographical
 * sources and never merges two different places. This migration merges the
 * SEVEN comma-qualified rows a second signal corroborates (< 10 km from a
 * same-country twin) and must never touch the SIX whose twin is a different
 * place — `Norwalk, California` is 3,976 km from `Norwalk`, and
 * `Schwerin, Brandenburg` is 431 km from `Schwerin` because both exist.
 *
 * Every assertion runs against COMMENT-STRIPPED sql. The header explains the
 * cohort and therefore names the six forbidden rows in prose; asserting over
 * the raw file would let that prose satisfy checks while the statement that
 * protects them was gone — the trap `20360101101700` recorded.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '85000101100000_city_comma_qualifier_merges.sql',
);

const raw = readFileSync(MIGRATION, 'utf8');

/** Strip `--` line comments so prose cannot satisfy a structural assertion. */
const sql = raw
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

/** The seven pairs the file is allowed to merge. */
const MERGE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['Brasília, Distrito Federal', 'Brasília'],
  ['Cebu City, Cebu', 'Cebu City'],
  ['Davao City, Davao del Sur', 'Davao City'],
  ['Dublin, Republic of Ireland', 'Dublin'],
  ['Immenstadt, Allgäu', 'Immenstadt'],
  ['Salvador, Bahia', 'Salvador'],
  ['Vancouver, British Colombia', 'Vancouver'],
];

/** Rows whose same-name twin is a DIFFERENT place. Merging any is the defect. */
const DIFFERENT_PLACES = [
  'Sandusky, Ohio',
  'Dearborn, Michigan',
  'Hudson, Wisconsin',
  'Norwalk, California',
  'Schwerin, Brandenburg',
  'Aguascalientes, Aguascalientes',
];

/** The `values` list the merge loop iterates — the only rows that can merge. */
function mergeValuesBlock(): string {
  const start = sql.indexOf('with pairs(drop_name, keep_name, cc) as (values');
  expect(start, 'the merge loop pairs list must exist').toBeGreaterThan(-1);
  const end = sql.indexOf(')', sql.indexOf("'CA'", start));
  return sql.slice(start, end);
}

describe('city comma-qualifier merges', () => {
  it('merges exactly the seven corroborated pairs', () => {
    const block = mergeValuesBlock();
    for (const [drop, keep] of MERGE_PAIRS) {
      expect(block, `${drop} must be in the merge list`).toContain(drop);
      expect(block, `${keep} must be its target`).toContain(keep);
    }
    // Seven rows, so seven country codes in the values list.
    const codes = block.match(/'(?:BR|PH|IE|DE|CA)'/g) ?? [];
    expect(codes).toHaveLength(7);
  });

  it('never merges a row whose twin is a different place', () => {
    const block = mergeValuesBlock();
    for (const name of DIFFERENT_PLACES) {
      expect(block, `${name} must NOT be mergeable`).not.toContain(name);
    }
  });

  it('asserts the different places survive, which a blanket sweep would fail', () => {
    // The mirror assertion: "the seven are gone" is equally satisfied by a
    // sweep that took everything, so this is what separates the two.
    for (const name of DIFFERENT_PLACES) {
      expect(sql, `${name} must be asserted to survive`).toContain(name);
    }
    expect(sql).toMatch(/DIFFERENT places were merged/);
  });

  it('anchors the 10 km gate so a wider radius cannot pass as it', () => {
    // `< 10000` is a PREFIX of `< 10000000`; a 10,000 km radius corroborates
    // any two points on earth. Anchor with a non-digit lookahead.
    expect(sql).toMatch(/<\s*10000(?!\d)/);
    expect(sql).not.toMatch(/<\s*10000\d/);
    // and the per-pair re-check at apply time
    expect(sql).toMatch(/v_km\s*>=\s*10\b/);
  });

  it('re-resolves and re-checks each pair instead of trusting frozen ids', () => {
    expect(sql).toContain('haversine_m');
    expect(sql).toMatch(/left join cities d on d\.name = p\.drop_name/);
    // soft on preconditions: a moved pair is skipped, never an abort
    expect(sql).toContain('continue;');
    expect(sql).toMatch(/v_skipped/);
  });

  it('keeps every postcondition a strict inequality', () => {
    // Neutering `v_bad <> 0` to `v_bad < 0` leaves every string-anchored
    // assertion green while the check has stopped checking.
    const conditions = sql.match(/v_bad\s*<>\s*0/g) ?? [];
    expect(conditions).toHaveLength(3);
    expect(sql).not.toMatch(/v_bad\s*<\s*0/);
    expect(sql).not.toMatch(/if\s+false/i);
  });

  it('requires every merge it makes to be reversible', () => {
    expect(sql).toContain('city_merge_audit');
    expect(sql).toMatch(/details->>'schema'/);
    expect(sql).toMatch(/not reversible|without schema 1/);
  });

  it('declares an actor and never confirms a cross-country merge', () => {
    expect(sql).toContain("set_config('app.actor'");
    expect(sql).toMatch(/merge_cities\(r\.keep_id,\s*r\.drop_id,\s*false\)/);
    expect(sql).not.toMatch(/merge_cities\([^)]*true\s*\)/);
  });
});
