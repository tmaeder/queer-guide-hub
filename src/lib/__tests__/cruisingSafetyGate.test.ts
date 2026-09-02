import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { NIGHTLIFE_CATEGORIES } from '@/hooks/useIntentData';

/**
 * Cruising venues must never be visible to an anonymous session.
 *
 * `safety_gated` was purely GEOGRAPHIC from 20260623160000 until 20261110100000:
 * it asked `location_is_high_risk(country_id, city_id)` and nothing else, and
 * `venues` has no is_adult / content_rating column. So every cruising spot in a
 * non-criminalizing country was public — measured on prod 2026-08-30, 112 of 113
 * cruising venues were `safety_gated=false`, i.e. in sitemap-venues.xml, in anon
 * search, and on the public map.
 *
 * Text checks against the migrations directory, so this runs in CI without
 * credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // `create [or replace] function`, not merely `function`: a GRANT, COMMENT ON
    // or ALTER naming the function would otherwise win the reverse scan.
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

/** The migration that most recently CREATEs a given trigger. */
function latestTriggerMigration(trigger: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (new RegExp(`create\\s+trigger\\s+${trigger}\\b`, 'i').test(sql)) return sql;
  }
  throw new Error(`no migration creates ${trigger}`);
}

/** Body of `fn` from the migration that most recently defines it. */
function bodyOf(fn: string): string {
  const sql = latestDefinitionOf(fn);
  const start = sql.search(
    new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i'),
  );
  const rest = sql.slice(start);
  // Function bodies here are dollar-quoted; stop at the closing delimiter.
  const end = rest.search(/\n\$\$;/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('cruising category safety gate', () => {
  it('gates the cruising category in the shared predicate', () => {
    const body = bodyOf('venue_is_safety_gated');
    expect(body).toMatch(/location_is_high_risk/i);
    expect(body).toMatch(/'cruising'/);
  });

  it('guards against a NULL category — `false or NULL` is NULL, not false', () => {
    // Measured on prod: venues.category is itself NOT NULL, so this is defensive
    // rather than load-bearing FOR THAT TABLE. It still matters, because
    // venue_is_safety_gated is a plain public function that any caller can pass a
    // NULL to, and safety_gated is NOT NULL — an unguarded `or p_category =
    // 'cruising'` returns NULL and the write fails. The earlier claim in this file
    // that the column was nullable was wrong; the probe corrected it.
    expect(bodyOf('venue_is_safety_gated')).toMatch(/coalesce\s*\(\s*p_category\s*=\s*'cruising'/i);
  });

  it('does not put a category reference in the SHARED entity trigger fn', () => {
    // set_entity_safety_gated() is used by six triggers (venues, events,
    // organizations, milestones, hotels, queer_villages) and only `venues` has a
    // category column — `new.category` there raises at runtime on the other five.
    expect(bodyOf('set_entity_safety_gated')).not.toMatch(/category/i);
  });

  it('scopes the venues trigger to every column that can change the answer', () => {
    // A column-scoped trigger fires on the columns named in the UPDATE statement.
    //
    // `category` is the obvious one: without it, `UPDATE venues SET
    // category='cruising'` never fires the trigger and the row escapes the gate.
    //
    // country/city/state are the non-obvious ones, and a rolled-back prod probe
    // is what found them. `derive_entity_geo_address()` is a THIRD writer of
    // safety_gated — it recomputes the flag itself (geographically only) because
    // a BEFORE trigger's writes do not re-fire a column-scoped trigger. So
    // `UPDATE venues SET country='DE'` on a cruising venue silently UN-GATED it.
    // BEFORE triggers fire in name order and trg_venues_geo_derive <
    // trg_venues_safety_gated, so matching derive's scope lets ours correct it.
    const sql = latestTriggerMigration('trg_venues_safety_gated');
    const trigger = sql.slice(sql.indexOf('create trigger trg_venues_safety_gated'));
    const scope = trigger.slice(0, 300);
    for (const col of ['country_id', 'city_id', 'category', 'country', 'city', 'state']) {
      expect(scope).toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it('keeps the gate through the country recompute', () => {
    // The nightly ILGA cron calls this. If the venues branch recomputes from
    // location_is_high_risk alone it CLEARS the cruising gate for every venue in
    // a country whose legal status changed.
    const body = bodyOf('recompute_safety_gated_for_country');
    const venuesBranch = body.slice(
      body.indexOf('update public.venues'),
      body.indexOf('update public.events'),
    );
    expect(venuesBranch).toMatch(/venue_is_safety_gated/);
    expect(venuesBranch).not.toMatch(/set safety_gated = public\.location_is_high_risk/);
  });

  it('still recomputes hotels and queer_villages', () => {
    // The live prod definition carries venues/events/organizations/hotels/
    // queer_villages, while the newest migration FILE showed a milestones branch
    // and no hotels or villages. Restating from the file would have dropped two
    // entities from the safety layer.
    const body = bodyOf('recompute_safety_gated_for_country');
    expect(body).toMatch(/update public\.hotels/);
    expect(body).toMatch(/update public\.queer_villages/);
  });

  it('keeps cruising out of the going-out rails', () => {
    // Every cruising venue is now safety_gated, so an anonymous visitor's query
    // drops them regardless — leaving the rail's counts and contents disagreeing
    // by viewer. It is also simply not a going-out destination.
    expect(NIGHTLIFE_CATEGORIES).not.toContain('cruising');
  });
});
