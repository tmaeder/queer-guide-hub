import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The one-shot delete of 58 non-place `cities` rows (Bundesländer, US/BR/MX
 * states, counties, countries, one continent) lives in three files that must
 * agree, and nothing else makes them agree:
 *
 *   - `scripts/data-quality/out/nonplace-city-candidates.json` — what the
 *     classifier ranked, `approved_ids` being the bucket minus the hand review.
 *   - `scripts/data-quality/out/nonplace-city-review.json` — the rows a human
 *     took back OUT of the delete list, with a reason each.
 *   - `supabase/migrations/20260929100000_delete_nonplace_city_shells.sql` —
 *     the ids actually deleted.
 *
 * Re-running the classifier after a data change rewrites the candidates file.
 * If that silently disagreed with the migration, the committed evidence would
 * describe a different deletion than the one that ran — and this deletion is
 * not reversible by RPC, only by reading back a jsonb snapshot. So the test
 * pins the three together.
 *
 * It also pins the STATEMENT ORDER inside the migration. `cities.id` has two
 * foreign keys left after the Geo P2 flips, so a DELETE neither cascades nor
 * errors: it leaves dangling uuids. The birth-place text has to be copied off
 * the city row before the row goes, and the pointers have to be nulled before
 * the delete — get the order wrong and the migration still succeeds, silently.
 *
 * Text checks against the repo, not the database, so this runs in CI without
 * credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const ROOT = process.cwd();
const MIGRATION = join(
  ROOT,
  'supabase',
  'migrations',
  '20260929100000_delete_nonplace_city_shells.sql',
);
const CANDIDATES = join(ROOT, 'scripts', 'data-quality', 'out', 'nonplace-city-candidates.json');
const REVIEW = join(ROOT, 'scripts', 'data-quality', 'out', 'nonplace-city-review.json');

const sql = readFileSync(MIGRATION, 'utf8');
const candidates = JSON.parse(readFileSync(CANDIDATES, 'utf8'));
const review = JSON.parse(readFileSync(REVIEW, 'utf8'));

/** The ids in the migration's `INSERT INTO _nonplace_ids ... VALUES` block. */
function migrationIds(): string[] {
  const block = sql.split('INSERT INTO _nonplace_ids')[1];
  expect(block, 'migration has no _nonplace_ids INSERT').toBeTruthy();
  return [...block.matchAll(/'([0-9a-f-]{36})'::uuid/g)].map((m) => m[1]);
}

describe('non-place city deletion', () => {
  it('deletes exactly the approved ids, in agreement with the classifier output', () => {
    const inMigration = migrationIds();
    expect(inMigration).toHaveLength(58);
    expect(new Set(inMigration).size).toBe(inMigration.length);
    expect([...inMigration].sort()).toEqual([...candidates.approved_ids].sort());
  });

  it('never deletes a row the hand review rejected', () => {
    const inMigration = new Set(migrationIds());
    for (const id of Object.keys(review.rejected)) {
      expect(inMigration.has(id), `${id} was rejected by review but is in the migration`).toBe(
        false,
      );
    }
  });

  it('gives every rejection a stated reason', () => {
    for (const [id, reason] of Object.entries(review.rejected)) {
      expect(typeof reason, `${id} has no reason`).toBe('string');
      expect((reason as string).length).toBeGreaterThan(20);
    }
    // The classifier reports a reviewed id that is no longer in the bucket; a
    // committed stale decision means the review no longer describes anything.
    expect(candidates.stale_review_ids ?? []).toEqual([]);
  });

  it('snapshots and preserves the birth place before deleting the row', () => {
    const snapshot = sql.indexOf('INSERT INTO public.nonplace_city_deletion_audit');
    const birthPlace = sql.indexOf('SET birth_place = c.name');
    const nullPointer = sql.indexOf('SET city_id = NULL');
    const del = sql.indexOf('DELETE FROM public.cities');

    for (const [name, idx] of Object.entries({ snapshot, birthPlace, nullPointer, del })) {
      expect(idx, `${name} statement missing`).toBeGreaterThan(-1);
    }
    // The snapshot is the only way back, so it precedes everything.
    expect(snapshot).toBeLessThan(birthPlace);
    // Copy the name off the row while the row still exists.
    expect(birthPlace).toBeLessThan(nullPointer);
    // Clear the unconstrained pointers before the row they point at is gone.
    expect(nullPointer).toBeLessThan(del);
  });

  it('clears every unconstrained pointer that prod was measured to hold', () => {
    // Measured before the migration was written; a column dropped from this
    // list is a dangling uuid nobody gets an error about.
    for (const table of [
      'public.city_quality_signals',
      'public.city_coverage_gaps',
      'public.city_review_queue_legacy',
      'public.image_asset_links',
      'public.content_embeddings',
    ]) {
      expect(sql, `${table} not cleaned`).toContain(`DELETE FROM ${table}`);
    }
    expect(sql).toContain('SET death_city_id = NULL');
  });

  it('refuses to run if a reviewed row has gained content since review', () => {
    expect(sql).toContain('nonplace delete aborted');
    // The guard must test the same emptiness predicate the classifier used.
    for (const rel of [
      'public.venues',
      'public.events',
      'public.hotels',
      'public.queer_villages',
      'public.news_article_cities',
      'public.organizations',
      'public.milestones',
      'public.trip_destinations',
      'public.trip_places',
      'public.city_favorites',
      'public.guides',
      'public.trips',
      'public.user_travel_preferences',
    ]) {
      expect(sql, `guard does not check ${rel}`).toContain(rel);
    }
  });
});
