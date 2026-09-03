import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `cities.airport_codes` used to be written by Wikidata P931 alone ("place
 * served by transport hub"), which says nothing about passenger traffic. 250 of
 * the 934 distinct codes in the corpus (27%, measured 2026-08-25) were rail
 * stations (Boston ZTO), heliports (Algeciras AEI), closed airports (Berlin
 * SXF), general-aviation fields (Houston EFD/IWS/CXO) or a different city
 * entirely (Houston HVN = Tweed New Haven). `major_airport_code` feeds the
 * Aviasales flight search, so those were broken booking links.
 *
 * Four properties of `run_city_airport_link` are load-bearing and each of them
 * looks like a detail somebody could "simplify" away:
 *
 *   1. the ABSOLUTE 65 km ceiling. The first version banded to `nearest + 25 km`
 *      and that silently dropped Narita from Tokyo and INCHEON from Seoul, whose
 *      city airports sit 17 km out; widening the band instead would hand
 *      Brighton (LGW 36 km) Heathrow at 76 km. Distance from the city is what
 *      separates the two, not the gap between the airports.
 *   2. the same-country requirement (v1 decision).
 *   3. sitelinks rank ahead of passenger volume. P3872 reports whatever year
 *      each airport last filed, so Wikidata's best figure for Incheon (17.9M)
 *      loses to Gimpo's (24.5M) and Seoul's primary came out GMP.
 *   4. no candidate -> NULL, never a guess.
 *   5. ...but a code that PASSES the gate is never deleted merely because the
 *      city's own coordinates are wrong. Key West is stored 200 km out in the
 *      Gulf of Mexico and has zero candidates; it must keep EYW.
 *
 * Text check against the migrations directory, so it runs in CI without
 * credentials — same pattern as `citySafetyBackfill.test.ts`.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql))
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

const sql = latestDefinitionOf('run_city_airport_link');

describe('run_city_airport_link keeps its measured candidate rule', () => {
  it('reads candidates from the gate table, not from public.airports', () => {
    expect(sql).toMatch(/FROM\s+public\.airport_service/i);
    // public.airports is the flight-booking dump: is_major is false on every row
    // and the set includes bush strips. It can never be the gate.
    expect(sql).not.toMatch(/FROM\s+public\.airports\b/i);
  });

  it('caps candidates at an absolute 65 km, widening only where nothing is that close', () => {
    expect(sql).toMatch(/dist_km\s*<=\s*100(\.0)?/i);
    expect(sql).toMatch(/dist_km\s*<=\s*greatest\(\s*65(\.0)?\s*,\s*\w+\.min_d\s*\+\s*10(\.0)?\s*\)/i);
    expect(sql).toMatch(/min\(\s*\w+\.dist_km\s*\)\s*OVER\s*\(\s*\)/i);
  });

  it('ranks by sitelinks, then passengers, then size, then distance', () => {
    const w = sql.match(/WINDOW\s+w\s+AS\s*\(([\s\S]*?)\)\s*\n/i)?.[1] ?? '';
    expect(w).toMatch(/sitelinks\s+DESC\s+NULLS\s+LAST/i);
    expect(w).toMatch(/pax_per_year\s+DESC\s+NULLS\s+LAST/i);
    expect(w.indexOf('sitelinks')).toBeLessThan(w.indexOf('pax_per_year'));
    expect(w.indexOf('pax_per_year')).toBeLessThan(w.indexOf('large_airport'));
    expect(w.indexOf('large_airport')).toBeLessThan(w.indexOf('dist_km'));
  });

  it('does not call a superseded airport unscheduled', () => {
    // ZTO is a railway station; Rabat's RBA is a working airport that simply
    // serves a different city. Recording both the same way would be a false
    // claim about RBA.
    expect(sql).toMatch(/'superseded_by_a_nearer_airport'/);
    expect(sql).toMatch(/'not_scheduled_passenger_service'/);
  });

  it('requires the airport to be in the same country as the city', () => {
    expect(sql).toMatch(/s\.country_code\s*=\s*r\.country_code/i);
  });

  it('never deletes a code the gate still vouches for', () => {
    // The fallback that saves Key West: with no geographic candidate, the
    // gate-passing subset of the existing codes is kept.
    expect(sql).toMatch(/v_new\s*:=\s*nullif\(v_gated_old/i);
    expect(sql).toMatch(/IF\s+v_new\s+IS\s+NULL\s+OR\s+cardinality\(v_new\)\s*=\s*0\s+THEN/i);
  });

  it('records every retracted code instead of dropping it silently', () => {
    expect(sql).toMatch(/'retracted'/);
    // Appended, so a second pass cannot erase the first pass's evidence.
    expect(sql).toMatch(/coalesce\(v_ap_prov->'retracted',\s*'\[\]'::jsonb\)\s*\|\|/i);
  });

  it('partitions the codes into in-the-city and nearby', () => {
    // Essen has no airport of its own; DUS is 25 km away and DTM 35. Without the
    // split the city page renders "AIRPORT DUS", which asserts Essen has one.
    expect(sql).toMatch(/local_airport_codes\s*=\s*v_local/i);
    expect(sql).toMatch(/nearest_airport_codes\s*=\s*v_nearest/i);
    expect(sql).toMatch(/nearest_airport_km\s*=\s*v_nearest_km/i);
    // Exact token match against the airport's own municipality — substring
    // matching would make York a local airport of New York.
    expect(sql).toMatch(/btrim\(t\.part\)\s*=\s*lower\(btrim\(r\.name\)\)/i);
  });

  it('leads with the airport that is IN the city', () => {
    // The product decision (2026-08-25): a city's own airport is its primary,
    // and prominence only orders what is left. It buys Cologne CGN over DUS,
    // Liverpool LPL over MAN, Dortmund DTM, San Jose SJC; it costs Dallas
    // (Love Field over DFW, whose municipality reads "Dallas-Fort Worth"),
    // Taipei (Songshan over Taoyuan), Nagoya, Bucharest and Kobe. Being wrong
    // towards the airport actually in the city is the chosen direction.
    const w = sql.match(/WINDOW\s+w\s+AS\s*\(([\s\S]*?)\)\s*\n/i)?.[1] ?? '';
    expect(w).toMatch(/is_local\s+DESC/i);
    expect(w.indexOf('is_local')).toBeLessThan(w.indexOf('sitelinks'));
  });

  it('keeps nearest_airport_km attached to a code it can name', () => {
    // London's four airports are all municipality "London", so LTN falls out of
    // the top 4; without the rk bound the column reported 44 km with an empty
    // nearest_airport_codes next to it.
    expect(sql).toMatch(/min\(b\.dist_km\) FILTER \(WHERE NOT b\.is_local[\s\S]{0,80}b\.rk <= 4\)/i);
  });

  it('refuses to run against an unseeded gate', () => {
    // CI applies the migration on merge; the seed is a hand-run script. To an
    // empty gate every existing code looks like junk, so without this the first
    // nightly run would clear the airport code off the whole corpus.
    expect(sql).toMatch(/v_gate_size\s*<\s*1000/i);
    expect(sql).toMatch(/RAISE WARNING[\s\S]{0,120}refusing to run/i);
  });

  it('stamps every row it examines so the sweep terminates', () => {
    expect(sql).toMatch(/'\{city_airport_link\}'/);
    expect(sql).toMatch(/NOT\s*\(coalesce\(c\.enrichment_status,\s*'\{\}'::jsonb\)\s*\?\s*'city_airport_link'\)/i);
  });

  it('re-selects any row still holding a code the gate does not know', () => {
    expect(sql).toMatch(/NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+public\.airport_service/i);
  });
});

describe('the gate table itself', () => {
  const migration = readdirSync(MIGRATIONS)
    .filter((f) => f.includes('city_airport_service'))
    .sort()
    .pop();

  it('exists', () => expect(migration).toBeTruthy());

  const create = readFileSync(join(MIGRATIONS, migration!), 'utf8');

  /** The CREATE TABLE body only — the file's header prose names the excluded types. */
  const tableBody = create.slice(
    create.search(/CREATE TABLE IF NOT EXISTS public\.airport_service/i),
    create.search(/CREATE INDEX/i),
  );

  it('only admits the three scheduled-service airport tiers', () => {
    expect(tableBody).toMatch(
      /ap_type\s+text\s+NOT NULL\s+CHECK\s*\(ap_type IN \('large_airport','medium_airport','small_airport'\)\)/i,
    );
    // heliport / seaplane_base / closed must not be storable.
    expect(tableBody).not.toMatch(/'heliport'|'seaplane_base'|'closed'/);
  });

  it('documents that pax_per_year is a ranking signal, not proof of being open', () => {
    // Closed SXF still reports 12.8M passengers via P3872; a rail station reports 800k.
    expect(create).toMatch(/COMMENT ON COLUMN public\.airport_service\.pax_per_year/i);
    expect(create).toMatch(/historical|Ranking signal only/i);
  });
});
