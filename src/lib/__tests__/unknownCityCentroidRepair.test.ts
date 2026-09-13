import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the "Unknown" city repair (20480301100000).
 *
 * A reverse-geocode that could not name a place wrote a city literally called
 * "Unknown" at a point in Mallorca, and `run_event_geo_fill` then stamped that
 * point onto all 52 events linked to it — measured, `distinct_points = 1`. So
 * events in California, Greece, Switzerland and Mexico all rendered in Spain.
 *
 * Two properties of the repair are load-bearing and are asserted against the
 * COMMENT-STRIPPED body, because the file's header names every one of these
 * strings in prose and a naive scan passes on the prose alone while the real
 * statement is gone.
 */
const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/20480301100000_unknown_city_centroid_repair.sql'),
  'utf8',
);

// Strip `--` line comments so the header cannot satisfy an assertion.
const BODY = SQL.replace(/^\s*--.*$/gm, '');

describe('unknown-city centroid repair', () => {
  /**
   * The cohort filter is the whole safety argument. Clearing a coordinate is
   * only safe because every one of the 52 is `derived:city_centroid` and none
   * carries an original measurement. Without this predicate the UPDATE would
   * clear a real coordinate the moment one lands on this city.
   */
  it('clears coordinates ONLY for derived:city_centroid rows', () => {
    expect(BODY).toMatch(/field_provenance->'latitude'->>'source'\s*=\s*'derived:city_centroid'/);
  });

  /** Venues measured 0-on-centroid, so their geometry must not be touched. */
  it('does not clear venue coordinates — only the bad city link', () => {
    const venueUpdate = /update venues set city_id = null where city_id = v_city;/.exec(BODY);
    expect(venueUpdate).not.toBeNull();
    expect(BODY).not.toMatch(/update venues[\s\S]{0,200}latitude\s*=\s*null/);
  });

  /** Reversibility: never a hard DELETE on cities. */
  it('archives reversibly rather than deleting the city', () => {
    expect(BODY).toMatch(/archive_city_as_nonplace\(/);
    expect(BODY).not.toMatch(/delete\s+from\s+cities/i);
  });

  /** Recoverability: the prior values must be recorded before being cleared. */
  it('stamps prior city_id and coordinates before clearing them', () => {
    expect(BODY).toMatch(/'unknown_city_repair'/);
    expect(BODY).toMatch(/'prior_city_id'/);
    expect(BODY).toMatch(/'prior_latitude'/);
  });

  /** Hard on postconditions — the state the file exists to reach. */
  it('asserts its own postconditions', () => {
    expect(BODY).toMatch(/raise exception 'event_city_country_mismatch still at/);
    expect(BODY).toMatch(/raise exception 'unknown-city row is still seo_indexable'/);
  });

  /**
   * Soft on preconditions: a concurrent session may have repaired this first,
   * and an abort would block every migration queued behind it.
   */
  it('no-ops instead of aborting when the row is already gone', () => {
    expect(BODY).toMatch(/if not exists \(select 1 from cities where id = v_city\) then/);
  });
});
