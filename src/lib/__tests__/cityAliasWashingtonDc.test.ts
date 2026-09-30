import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Guards 99991790794042_city_alias_washington_dc.sql.
//
// The cohort of unlinked events whose city is absent from `cities` looked like accent
// variants that a `city_aliases` row would fix. It is not: measured through
// `public.city_name_key` (which unaccents, controls passing), the unaccented match
// count is ZERO for every name -- `cities` holds no Whistler, Lansing, Aspen or Boca
// Raton at all. Those are MISSING CITIES and an alias cannot invent a target.
//
// A sweep of eleven abbreviation rewrites over the whole cohort returns exactly three
// names whose target exists, and only ONE of them is shippable:
//
//   Washington DC -> Washington, D.C.   single canonical row, 1,091 events    SHIP
//   St Louis      -> Saint Louis        one side of a DUPLICATE PAIR          refuse
//   St Paul       -> Saint Paul         one side of a DUPLICATE PAIR          refuse
//
// `saint-louis` (16 events, Q38022) and `st-louis` (203 events, no qid) are 4.07 km
// apart in the same region and ALREADY cross-alias each other; `saint-paul` and a
// `tmp-` St. Paul are 3.41 km apart. Aliasing there would pick a side of a defect
// instead of naming a city -- the fix is `merge_cities`, whose direction is an
// editorial call this migration deliberately does not make.
//
// Assertions run over COMMENT-STRIPPED source and are scoped to the statement they are
// about: this header names every refused city, so a bare toContain over the raw file
// would pass against a deleted guard.

const MIGRATION = '99991790794042_city_alias_washington_dc.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

/** Migration text with comment lines removed, so prose cannot satisfy a guard. */
const statements = raw
  .split('\n')
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n');

const writes = statements.slice(0, statements.indexOf('DO $verify$'));
const verify = statements.slice(statements.indexOf('DO $verify$'));

describe('the alias', () => {
  it('is pinned to the single canonical DC row, by name AND region', () => {
    // Region as well as name: the point of this file is that a bare name can be one
    // side of a duplicate pair, so the target must be identified, not guessed.
    expect(writes).toContain("c.name = 'Washington, D.C.'");
    expect(writes).toContain("c.region_name = 'District of Columbia'");
    expect(writes).toContain("co.code = 'US'");
    expect(writes).toContain('c.duplicate_of_id IS NULL');
  });

  it('never inserts alias_key, which is a generated column', () => {
    // `alias_key` is GENERATED ALWAYS AS city_canonical_key(alias); inserting it
    // raises 428C9. Found by dry-running, not by reading information_schema --
    // whose default projection shows a generated column as merely nullable.
    expect(writes).toContain('INSERT INTO public.city_aliases (city_id, alias, locale)');
    // Scoped to the COLUMN LIST with `[^)]*`, which stops at the paren that closes
    // it. `[^;]*` reaches past it into `ON CONFLICT (city_id, alias_key)` -- where
    // naming the column is correct -- so the looser form fails on correct code. The
    // node shim caught that; vitest could not start a worker to.
    expect(writes).not.toMatch(/INSERT INTO public\.city_aliases\s*\([^)]*alias_key/);
  });

  it('is idempotent on the real unique index', () => {
    expect(writes).toContain('ON CONFLICT (city_id, alias_key) DO NOTHING');
  });
});

describe('the release', () => {
  it('deletes the stale stamp and never writes city_id', () => {
    // The shipped guarded runner must do the linking, or guards A and B are bypassed.
    expect(writes).toContain("SET enrichment_status = e.enrichment_status - 'event_city_link'");
    expect(writes).not.toMatch(/UPDATE public\.events[\s\S]*?SET[^;]*\bcity_id\s*=/);
  });

  it('covers Washington DC as well as Cancun', () => {
    // The 5 DC rows were stamped by a force-run BEFORE the alias existed, so the
    // alias alone would only have helped future arrivals. Dropping either row from
    // this list silently leaves that cohort stuck.
    const block = writes.slice(writes.indexOf('WITH verified'));
    expect(block).toContain("('Cancun',        'MX', 'Cancún',           'Quintana Roo')");
    expect(block).toContain("('Washington DC', 'US', 'Washington, D.C.', 'District of Columbia')");
  });

  it('pins each release to the exact city the alias must resolve to', () => {
    // Not just "an alias resolves": it must resolve to THIS city. Without the name
    // and region equality a future alias change would silently relocate the events.
    expect(writes).toContain('c.id = public.city_by_alias(e.country_id, e.city)');
    expect(writes).toContain('c.name = v.target_name');
    expect(writes).toContain('c.region_name = v.target_region');
  });

  it('only releases rows that were not blocked by a guard', () => {
    // A guard-blocked row is a decision, not a stale stamp.
    expect(writes).toContain("e.enrichment_status->'event_city_link'->>'blocked' IS NULL");
  });

  it('only releases rows that are still unlinked', () => {
    expect(writes).toContain('e.city_id IS NULL');
  });
});

describe('the refusals, which are the substance of the file', () => {
  it('asserts no alias exists for the duplicate-pair abbreviations', () => {
    // P3. If this check goes, a later pass reads the file as precedent for picking a
    // side of the Saint Louis / St. Louis split.
    expect(verify).toContain("alias_key IN ('st louis', 'st paul')");
    expect(verify).toMatch(/RAISE EXCEPTION 'P3:/);
  });

  it('asserts no island-for-capital alias exists', () => {
    // P4. An alias is a STANDING rule: it would link every future island-wide event
    // to the capital, which relocates an event rather than renaming a city.
    expect(verify).toContain("alias_key IN ('curacao', 'puerto rico', 'mallorca')");
    expect(verify).toMatch(/RAISE EXCEPTION 'P4:/);
  });

  it('asserts Rio stays refused, as a live control on the de-qualification rule', () => {
    // P5. `Rio de Janeiro` is exactly the alias plus a space, which 99991790719640
    // refuses by design. Asserting it here makes that rule's liveness a condition of
    // this migration rather than an assumption.
    expect(verify).toMatch(
      /city_by_alias\(\(SELECT id FROM public\.countries WHERE code = 'BR'\), 'Rio'\) IS NOT NULL/,
    );
    expect(verify).toMatch(/RAISE EXCEPTION 'P5:/);
  });

  it('never aliases any of the refused names', () => {
    const insert = writes.slice(0, writes.indexOf('WITH verified'));
    for (const refused of ['St Louis', 'St Paul', 'Curacao', 'Puerto Rico', 'Mallorca', "'Rio'"]) {
      expect(insert).not.toContain(refused);
    }
  });
});

describe('postconditions', () => {
  it('assert the alias RESOLVES, not merely that a row exists', () => {
    // P1 counts the row; P2 is the behavioural half. A row the de-qualification
    // guard refuses would satisfy P1 and link nothing at all.
    expect(verify).toContain("a.alias_key = 'washington dc'");
    expect(verify).toContain("v_city := public.city_by_alias(v_us, 'Washington DC')");
    expect(verify).toContain("v_name IS DISTINCT FROM 'Washington, D.C.'");
  });

  it('check the release by city_id, not by the city TEXT', () => {
    // `derive_entity_geo_address` is a BEFORE trigger that rewrites events.city FROM
    // city_id, so a linked row's text becomes 'Cancún' and any predicate matching the
    // pre-link spelling reports zero. That produced a false "0 linked" reading during
    // this file's own dry run.
    expect(verify).toContain('AND e.city_id IS NOT NULL');
    expect(verify).toMatch(/RAISE EXCEPTION 'P7:/);
  });

  it('raise on every failure rather than reporting it', () => {
    const raises = verify.match(/RAISE EXCEPTION 'P\d/g) ?? [];
    expect(raises.length).toBe(7);
    // A neutered condition leaves every string-anchored assertion above green.
    expect(verify).not.toMatch(/\bIF\s+(false|FALSE)\b/);
  });
});
