import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The containment validator's verdict is a single SQL CASE expression, and CASE
 * is FIRST-MATCH. The order of its arms is therefore load-bearing logic, not
 * formatting — and it is the kind of logic no type check, and no unit test of
 * the individual predicates, can protect.
 *
 * Measured against prod: with the arms in the correct order a correctly-filed
 * Guam venue (coordinate in GU, text says US, city link says US) evaluates to
 * `ok`, because GU and US are equivalent under geo_country_parent. Move the
 * `link_wrong` arm above the `ok` arm and the SAME row evaluates to
 * `link_wrong` — after which the repair pass would relink a venue that was
 * right all along.
 *
 * That is a silent, damaging regression reachable by an innocent-looking
 * reordering, so it gets a test that reads the shipped SQL.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

function latestContainmentMigration(): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('_geo_containment_check.sql'))
    .sort()
    .pop();
  if (!file) throw new Error('no *_geo_containment_check.sql migration found');
  return readFileSync(join(MIGRATIONS, file), 'utf8');
}

/**
 * Index of a verdict literal inside the CASE block.
 *
 * Matches `then '<v>'` OR `else '<v>'` — `unresolved` is the fall-through arm
 * and is written as ELSE, so a then-only matcher silently returns -1 for it and
 * every ordering assertion involving it passes vacuously against a missing arm.
 * (That was a real bug in the first draft of this file, caught by replaying the
 * assertions against the migration instead of trusting them.)
 */
function arm(sql: string, verdict: string): number {
  const i = sql.search(new RegExp(`(then|else)\\s+'${verdict}'`));
  expect(i, `verdict arm '${verdict}' is missing from the CASE expression`).toBeGreaterThan(-1);
  return i;
}

describe('geo_containment_check — verdict arm ordering', () => {
  const sql = latestContainmentMigration();

  it('tests offshore before anything else', () => {
    // A null coordinate country must short-circuit. Every later arm calls
    // geo_countries_equivalent(coord_iso, ...) which returns false on null, so
    // without this first the row would fall through to `unresolved` and a
    // point in the ocean would read as a contradiction between signals.
    expect(arm(sql, 'offshore')).toBeLessThan(arm(sql, 'ok'));
  });

  it('tests ok BEFORE link_wrong — the Guam regression', () => {
    // coord=GU, text=US, link=US. Both arms' predicates are true, so first
    // match decides. ok is correct; link_wrong would send a correctly-filed
    // territory venue to the repair pass to be relinked.
    expect(arm(sql, 'ok')).toBeLessThan(arm(sql, 'link_wrong'));
  });

  it('tests link_wrong before coord_wrong', () => {
    // When the coordinate is corroborated by the row's own country text, the
    // LINK is the defect and the coordinate must be preserved. Reversing these
    // would null a correct coordinate — the Georgetown/Penang case, where the
    // coordinate is the only correct field on the row.
    expect(arm(sql, 'link_wrong')).toBeLessThan(arm(sql, 'coord_wrong'));
  });

  it('falls through to unresolved last', () => {
    const unresolved = arm(sql, 'unresolved');
    for (const v of ['offshore', 'ok', 'link_wrong', 'coord_wrong', 'unverifiable']) {
      expect(arm(sql, v)).toBeLessThan(unresolved);
    }
  });

  it('keeps unverifiable as a distinct verdict, never folded into ok', () => {
    // A row with neither a country text nor a city link has nothing to check
    // against. Counting it as a pass is a clean bill of health nobody earned,
    // and hides the true coverage denominator.
    expect(sql).toContain("then 'unverifiable'");
    expect(sql).toMatch(/linked_iso is null and .*claimed_iso is null/s);
  });
});

describe('geo_containment_check — refusals that keep it honest', () => {
  const sql = latestContainmentMigration();

  it('refuses to run when geo_boundaries holds no country polygons', () => {
    // THE positive control. Over an empty boundary set every point resolves to
    // "no containing country", so every row is classified offshore and a
    // caller reading the ok-count sees a corpus with zero country mismatches.
    // An absent boundary set and a clean corpus are indistinguishable from the
    // verdict distribution alone.
    expect(sql).toMatch(/v_boundary_rows\s*=\s*0/);
    expect(sql).toMatch(/raise exception[\s\S]{0,200}refusing to run/i);
  });

  it('only refines admin1 on rows already agreeing at country level', () => {
    // Checking the province of a row whose COUNTRY is wrong reports the region
    // of a country the row is not in. The join must be gated on verdict='ok'.
    expect(sql).toMatch(/on j\.verdict = 'ok'/);
    expect(sql).toMatch(/when j\.verdict = 'ok'/);
  });

  it('gives geo_admin1_at no nearest-neighbour fallback', () => {
    // geo_country_at deliberately falls back to a bounded nearest search for
    // coastal points. admin1 must NOT: guessing a neighbouring province would
    // manufacture admin1_wrong verdicts on every border town.
    const admin1 = sql.slice(
      sql.indexOf('function public.geo_admin1_at'),
      sql.indexOf('geo_checkable_entities'),
    );
    expect(admin1).not.toContain('ST_DWithin');
  });
});
