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
/** The migration with `--` comment text removed, for assertions that must
 *  distinguish executable SQL from the prose explaining it. */
function codeOnly(sql: string): string {
  return sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');
}

function arm(sql: string, verdict: string): number {
  const i = sql.search(new RegExp(`(then|else)\\s+'${verdict}'`));
  expect(i, `verdict arm '${verdict}' is missing from the CASE expression`).toBeGreaterThan(-1);
  return i;
}

describe('geo_containment_check — verdict arm ordering', () => {
  const sql = latestContainmentMigration();

  it('tests ok BEFORE offshore — the Key West fix', () => {
    // The near-the-claim test must run before "no polygon contains this point".
    // A 1:10m coastline renders the Florida Keys thin enough that a real US
    // venue in Islamorada is 12 km off the US polygon and contained by nothing.
    // Checking `offshore` first would classify it as nowhere; checking
    // near-claim first correctly calls it ok.
    expect(arm(sql, 'ok')).toBeLessThan(arm(sql, 'offshore'));
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
    // of a country the row is not in.
    expect(sql).toMatch(/when j\.verdict = 'ok'/);
  });

  it('gates admin1_wrong on distance as well as polygon identity', () => {
    // Metro areas legitimately span a regional border, but only nearby.
    // Measured disagreement by distance from the linked city: 3.5% under 25 km,
    // 84% at 100-500 km, 90% past 500 km. Without the distance gate the arm is
    // majority false positives; with it, a same-name twin (Portland ME vs OR)
    // still qualifies because it is a different state away by construction.
    expect(sql).toMatch(/km_to_city\s*>\s*100/);
    expect(sql).toMatch(/venue_admin1\s*<>\s*j?\.?city_admin1|j\.venue_admin1 <> j\.city_admin1/);
  });

  it('compares admin-1 by polygon identity, never by name', () => {
    // Name comparison against cities.region_name was measured at 37% false
    // positives — Bavaria vs Bayern, Paris vs Île-de-France — because Natural
    // Earth's admin-1 names are a different vocabulary at a different level of
    // the hierarchy. That is the ISO-2-vs-English-name defect one layer along.
    expect(sql).toContain('geo_admin1_id_at');
    // A CALL, not a mention — and the comment names `regions_contradict()`
    // WITH parentheses to explain why it was abandoned, so even a call-shaped
    // regex matches the prose. Strip `--` comments first and assert on the
    // executable text only. A test that cannot tell code from its own
    // documentation forbids documenting the reasoning.
    expect(codeOnly(sql)).not.toMatch(/regions_contradict\s*\(/);
  });

  it('gives the admin-1 lookup no nearest-neighbour fallback', () => {
    // geo_country_at deliberately falls back to a bounded nearest search for
    // coastal points. admin1 must NOT: guessing a neighbouring province would
    // manufacture admin1_wrong verdicts on every border town.
    const start = sql.indexOf('function public.geo_admin1_id_at');
    expect(start, 'geo_admin1_id_at is missing').toBeGreaterThan(-1);
    const admin1 = sql.slice(start, sql.indexOf('geo_checkable_entities'));
    expect(admin1).not.toContain('ST_DWithin');
  });

  it('keeps the near-country tolerance and its justification together', () => {
    // The tolerance is only defensible because the two populations are
    // separated by orders of magnitude (border artifacts reach 12.4 km; real
    // defects start at 7,584 km). If someone changes the number, the measured
    // range in the comment must move with it.
    expect(sql).toMatch(/p_tolerance_m integer default 25000/);
    expect(sql).toMatch(/12,369|12369/);
  });
});
