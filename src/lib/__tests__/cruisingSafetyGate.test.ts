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

  it('guards against NULL category — `false or NULL` would violate the NOT NULL', () => {
    // venues.category is nullable and venues.safety_gated is NOT NULL, so a bare
    // `or p_category = 'cruising'` yields NULL for every uncategorised venue and
    // the trigger raises on insert.
    expect(bodyOf('venue_is_safety_gated')).toMatch(/coalesce\s*\(\s*p_category\s*=\s*'cruising'/i);
  });

  it('does not put a category reference in the SHARED entity trigger fn', () => {
    // set_entity_safety_gated() is used by six triggers (venues, events,
    // organizations, milestones, hotels, queer_villages) and only `venues` has a
    // category column — `new.category` there raises at runtime on the other five.
    expect(bodyOf('set_entity_safety_gated')).not.toMatch(/category/i);
  });

  it('scopes the venues trigger to `category`', () => {
    // A column-scoped trigger fires on the columns named in the UPDATE statement.
    // Without `category` in the list, `UPDATE venues SET category='cruising'`
    // never fires it and the row silently escapes the gate.
    const sql = readFileSync(
      join(MIGRATIONS, '20261110100000_cruising_category_safety_gate.sql'),
      'utf8',
    );
    const trigger = sql.slice(sql.indexOf('create trigger trg_venues_safety_gated'));
    expect(trigger.slice(0, 200)).toMatch(
      /before\s+insert\s+or\s+update\s+of\s+country_id,\s*city_id,\s*category/i,
    );
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

/**
 * The THIRD reader of the venues gating rule.
 *
 * 20261110100000 introduced `venue_is_safety_gated` so "the trigger and the
 * country-recompute cannot drift" and updated both. It missed
 * `release_gate_checks()`, whose `city_safety_gate_drift` arm inlines the
 * geographic predicate for speed — so the 96 cruising venues it had just
 * correctly gated all read as drift. That is a `critical` gate, so it blocked
 * every PR in the repo, and a permanently-nonzero safety check cannot report the
 * one thing it exists for: a real ungating would have arrived as 97.
 *
 * Repaired in 20261111100000. These assertions exist because the arm is a COPY —
 * copies need a test naming the original, which is the whole lesson of the
 * incident.
 */
describe('city_safety_gate_drift mirrors the venues predicate', () => {
  /** The `city_safety_gate_drift` sub-select from the newest definition. */
  function gateDriftBlock(): string {
    const sql = latestDefinitionOf('release_gate_checks');
    // Anchor on the SQL string literal, NOT the bare word: the migration header
    // discusses `city_safety_gate_drift` in prose, and anchoring on that made the
    // block start above dup_integrity — whose own `select 'venues'` arm then won
    // the search and the assertion failed against the wrong query.
    const start = sql.indexOf("'city_safety_gate_drift'");
    expect(start, 'city_safety_gate_drift arm not found').toBeGreaterThan(-1);
    const end = sql.indexOf(') gate_drift', start);
    expect(end, 'gate_drift subquery terminator not found').toBeGreaterThan(start);
    return sql.slice(start, end);
  }

  it('applies the cruising term to the venues arm', () => {
    const block = gateDriftBlock();
    // The venues arm runs from its own SELECT to the next table's.
    const venuesArm = block.slice(
      block.indexOf("select 'venues'"),
      block.indexOf("select 'events'"),
    );
    expect(venuesArm).toMatch(/'cruising'/);
    // Still geographic too — the cruising term is an addition, never a replacement.
    expect(venuesArm).toMatch(/country_id from hr/);
  });

  it('leaves the four category-less tables purely geographic', () => {
    const block = gateDriftBlock();
    for (const table of ['events', 'hotels', 'organizations', 'guides']) {
      const from = block.indexOf(`select '${table}'`);
      expect(from, `${table} arm missing from the gate`).toBeGreaterThan(-1);
      const next = block.indexOf('select ', from + 10);
      const arm = block.slice(from, next < 0 ? undefined : next);
      // None of these tables has a `category` column; a cruising term here would
      // not be a stricter gate, it would be a SQL error at gate time.
      expect(arm, `${table} arm must not reference category`).not.toMatch(/category/);
    }
  });

  it('still counts every table the gate covered before', () => {
    // The repair restates a 228-line function to change four lines. The risk is
    // dropping an arm, exactly as recompute_safety_gated_for_country once did.
    const block = gateDriftBlock();
    for (const table of ['venues', 'events', 'hotels', 'organizations', 'guides']) {
      expect(block).toContain(`select '${table}'`);
    }
  });

  it('keeps every other release gate in the restated function', () => {
    // Same risk one level up: this function is the whole release-gate surface, so
    // a restatement that loses an arm silently retires a critical check.
    const sql = latestDefinitionOf('release_gate_checks');
    for (const gate of [
      'hotline_unverified',
      'person_outing_guard',
      'person_nonperson_public',
      'crim_consistency',
      'dup_integrity',
      'city_safety_gate_drift',
      'hotline_reachable',
      'hotline_url_live',
      'hotline_link_stale',
      'hotline_link_status_vocab',
      'venue_closed_seo',
      'venue_url_freshness',
      'news_category_coverage',
      'news_category_classifier_stale',
      'city_country_mismatch',
    ]) {
      expect(sql, `release gate ${gate} lost in a restatement`).toContain(`'${gate}'`);
    }
  });
});
