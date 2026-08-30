import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 2 — the 11 countries ILGA does not cover.
 *
 * ILGA's live GraphQL returns 239 national jurisdictions, 239 DISTINCT a2_codes and zero
 * null codes — a 100% join hit rate against the 239 rows the nightly import updates. The
 * 11 persistently "skipped" countries are not a join failure (the roadmap's hypothesis);
 * they are outside ILGA's corpus because they have no distinct legal system. ILGA *does*
 * carry dependent territories that have one — Cook Islands, Niue, Tokelau, Jersey and
 * Anguilla all update nightly — so "dependent territory" is not the discriminator.
 *
 * The live defect was a FAIL-OPEN, not the empty columns: `location_is_high_risk()` tests
 * `(lgbti_criminalization->>'legal') = 'false'`, and against `'{}'` that is `NULL = 'false'`
 * → NULL → not high risk. Western Sahara would therefore publish venues ungated.
 *
 * Text checks against the migrations directory, so this runs in CI with no credentials —
 * same pattern as citySafetyBackfill.test.ts.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function migrationContaining(needle: RegExp): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (needle.test(sql)) return sql;
  }
  throw new Error(`no migration matches ${needle}`);
}

const disposition = migrationContaining(/parent_map\s*\(\s*child\s*,\s*parent\s*\)/i);

/** The five inhabited territories governed by a parent state's law. */
const INHERITED: ReadonlyArray<readonly [string, string]> = [
  ['AX', 'FI'],
  ['CC', 'AU'],
  ['CX', 'AU'],
  ['NF', 'AU'],
  ['SJ', 'NO'],
];

/** The five with no permanent civilian population. */
const NOT_APPLICABLE = ['AQ', 'BV', 'HM', 'TF', 'UM'] as const;

describe('the 11 ILGA-uncovered countries each carry an explicit disposition', () => {
  it.each(INHERITED)('inherits %s from %s', (child, parent) => {
    expect(disposition).toMatch(new RegExp(`'${child}'\\s*,\\s*'${parent}'`));
  });

  it.each(NOT_APPLICABLE)('marks %s not_applicable rather than data_unavailable', (code) => {
    // These are different claims. `data_unavailable` says we failed to find the answer;
    // `not_applicable` says there is no question — no resident population, so no domestic
    // LGBTI legal regime exists to record.
    expect(disposition).toContain(code);
  });

  it('uses not_applicable for the uninhabited set', () => {
    expect(disposition).toMatch(/'state',\s*'not_applicable'/);
  });

  it('stamps inherited data as inherited, never as ilga', () => {
    // A copy must never be mistakable for a measurement.
    expect(disposition).toMatch(/'state',\s*'inherited'/);
    expect(disposition).toMatch(/'parent',\s*m\.parent/);
  });

  it('does NOT bump lgbti_data_last_updated for the uninhabited set', () => {
    // Stamping a fresh timestamp on a country nothing checked would record an observation
    // that never happened. The sentinel accepts them via their disposition instead.
    const naBlock = disposition.slice(
      disposition.indexOf("'not_applicable'"),
      disposition.indexOf("WHERE code IN ('AQ'"),
    );
    expect(naBlock).not.toMatch(/lgbti_data_last_updated/);
  });
});

describe('Western Sahara fails closed without over-claiming', () => {
  const ehBlock = disposition.slice(
    disposition.indexOf('-- ── 3.'),
    disposition.indexOf("WHERE code = 'EH';") + 20,
  );

  it('sets legal=false so location_is_high_risk() fires', () => {
    expect(ehBlock).toMatch(/'legal',\s*false/);
  });

  it('marks the claim disputed and names the de-facto authority', () => {
    expect(ehBlock).toMatch(/'disputed',\s*true/);
    expect(ehBlock).toMatch(/'de_facto_authority',\s*'MA'/);
    expect(ehBlock).toMatch(/'basis',/);
  });

  it('does NOT copy Morocco’s other topic columns', () => {
    // Asserting Moroccan marriage/adoption/gender-recognition law governs a disputed
    // territory is a sovereignty claim this platform cannot support. Only the
    // gate-relevant field is set.
    for (const col of [
      'lgbti_same_sex_unions',
      'lgbti_adoption_rights',
      'lgbti_gender_recognition',
      'lgbti_employment_protection',
    ]) {
      expect(ehBlock).not.toContain(col);
    }
  });

  it('leaves equality_score unset rather than inventing a projection', () => {
    expect(ehBlock).not.toMatch(/equality_score\s*=/);
  });
});

describe('the sentinel makes a silent skip impossible', () => {
  it('adds a zero-tolerance country_rights_unaccounted gate', () => {
    expect(disposition).toContain('country_rights_unaccounted');
    expect(disposition).toMatch(/'country_rights_unaccounted',\s*'critical'/);
  });

  it('keys on a recorded disposition, not merely on freshness', () => {
    // "not updated recently" alone would scream on any one-night ILGA outage. The
    // invariant is structural: every country is either covered by a live source or
    // carries a recorded decision.
    expect(disposition).toMatch(/enrichment_status->'lgbti_rights'->>'state'\s+IS\s+NULL/i);
  });

  it('tolerates a transient outage via a 30-day threshold', () => {
    expect(disposition).toMatch(/interval\s+'30 days'/i);
  });

  it('preserves every pre-existing gate it restates', () => {
    // The function had to be restated wholesale to add one arm; losing a gate in the
    // process would silently disable a release check.
    for (const gate of [
      'hotline_unverified',
      'person_outing_guard',
      'crim_consistency',
      'dup_integrity',
      'hotline_unreachable',
      'hotline_link_broken',
    ]) {
      expect(disposition).toContain(gate);
    }
  });
});

describe('the migration verifies itself rather than hoping', () => {
  it('asserts the EH fail-safe actually reaches the gate', () => {
    // countries -> trg_sync_geo_spine -> geo_country_profiles is load-bearing:
    // location_is_high_risk() reads the SPINE, not `countries`, so a write that did not
    // mirror would leave the fail-safe inert.
    expect(disposition).toMatch(/location_is_high_risk\(/);
    expect(disposition).toMatch(/RAISE EXCEPTION[\s\S]{0,120}spine mirror broken/i);
  });

  it('asserts the sentinel reads zero after disposition', () => {
    expect(disposition).toMatch(/country_rights_unaccounted = %[\s\S]{0,40}expected 0/);
  });
});
