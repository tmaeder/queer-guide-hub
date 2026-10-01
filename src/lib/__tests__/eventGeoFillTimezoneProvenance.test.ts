import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `run_event_geo_fill` writes two values from the linked city. It always stamped the
// coordinates (`derived:city_centroid`) and never stamped the timezone, so once a link
// was quarantined as a namesake mislink the surviving timezone was indistinguishable
// from one the source feed supplied.
//
// Measured cost on prod before the seal: 147 quarantined events, 24 with a surviving
// timezone, and ZERO of the 24 provably city-derived — so 99991790714809 could repair
// exactly one, the cross-continent `Europe/London` on a Canadian festival, and had to
// leave 23 alone. Under-reaching was correct; the stamp is what makes it unnecessary
// next time.
//
// Proven functionally against prod in a rolled-back transaction: one real
// `run_event_geo_fill(40)` pass stamped 1 row `derived:city_timezone`, 0
// `derived:country_timezone`.
//
// THIS TEST EXISTS BECAUSE THE MIGRATION'S OWN VERIFY BLOCK RUNS ONCE. It asserts the
// live function at apply time and then never again — a later `CREATE OR REPLACE` from
// any other migration could drop the stamp and nothing would notice. So this finds the
// LATEST migration that defines the function and asserts the property there, the same
// drift-test shape `venueCategories.ts` uses.

const DIR = join(process.cwd(), 'supabase/migrations');

/**
 * The newest migration that (re)defines the function — later files win.
 *
 * CASE-INSENSITIVE, and that is not cosmetic. A migration hand-written in this repo
 * says `create or replace function`; one built from `pg_get_functiondef` — which is
 * the correct way to restate a live function — says `CREATE OR REPLACE FUNCTION`. A
 * lowercase needle silently skipped the newest definition and resolved to a 2026-08
 * file instead, so every assertion below ran against the PRE-SEAL body and six of
 * them failed on correct code. A search that cannot find the file you are asserting
 * about is indistinguishable from a property that is missing.
 */
function latestDefinitionOf(fnName: string): { file: string; sql: string } {
  const re = new RegExp(`function\\s+public\\.${fnName}\\b`, 'i');
  const hits = readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => re.test(readFileSync(join(DIR, f), 'utf8')));
  expect(hits.length, `no migration defines ${fnName}`).toBeGreaterThan(0);
  // Positive control: this repo has more than one definition of this function, so a
  // single hit means the matcher has silently narrowed again.
  expect(
    hits.length,
    `only one definition of ${fnName} found — matcher too narrow?`,
  ).toBeGreaterThan(1);
  const file = hits[hits.length - 1];
  return { file, sql: readFileSync(join(DIR, file), 'utf8') };
}

describe('run_event_geo_fill records where a derived timezone came from', () => {
  const { file, sql } = latestDefinitionOf('run_event_geo_fill');
  // Comment-stripped: every header here explains the stamp in prose, so a whole-file
  // match would be satisfiable by the explanation with the stamp deleted.
  const body = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

  it('stamps the timezone it derives', () => {
    expect(body, `latest definition is ${file}`).toMatch(/'source',\s*v_tz_src/);
    expect(body).toMatch(/v_tz_src\s*:=\s*case/);
  });

  it('distinguishes a city-derived zone from a country-derived one', () => {
    // They rot differently: a city zone is wrong the moment the link is quarantined,
    // a single-timezone country zone survives an unlink intact. Collapsing them into
    // one label would make the stamp useless for exactly the repair it exists for.
    expect(body).toContain('derived:city_timezone');
    expect(body).toContain('derived:country_timezone');
  });

  it('stamps only when this statement is the one that sets the column', () => {
    // A zone that arrived with the event keeps its own provenance and must never be
    // relabelled as derived.
    expect(body).toMatch(/e\.timezone is null and v_new_tz is not null/);
  });

  it('keeps the coordinate stamp it already had', () => {
    // CONTROL. A rewrite that added the timezone stamp and dropped the centroid one
    // would satisfy every assertion above while losing the only provenance this
    // function used to record.
    expect(body).toContain('derived:city_centroid');
    expect(body).toMatch(/'latitude',\s*jsonb_build_object/);
    expect(body).toMatch(/'longitude',\s*jsonb_build_object/);
  });

  it('does not widen access on replace', () => {
    // CREATE OR REPLACE preserves grants, so the risk is a file that re-grants. If a
    // future definition adds a GRANT it must not be to a broad role.
    expect(body).not.toMatch(
      /grant\s+execute\s+on\s+function\s+public\.run_event_geo_fill[^;]*to\s+(public|anon|authenticated)/i,
    );
  });
});

describe('the stale-timezone record is nested, not merged into the shared object', () => {
  // 99991790714809 merged `at` and `by` straight into
  // `enrichment_status.event_city_link`, which already had both from whichever writer
  // quarantined the row — so the row then claimed MY migration had blocked the link.
  // The general rule: a nested fact gets its own key; merging into a shared object
  // silently overwrites whatever else wrote there.
  const { sql } = latestDefinitionOf('run_event_geo_fill');

  it('re-nests under its own key and records the attribution it destroyed', () => {
    expect(sql).toContain("'stale_timezone'");
    expect(sql).toContain('at_lost_to');
    // The real blocker must be restored by id, not guessed.
    expect(sql).toContain('migration:99991790719878');
  });

  it('removes the keys that were merged into the shared object', () => {
    for (const key of ['stale_timezone_cleared', 'reason', 'at', 'by']) {
      expect(sql).toContain(`- '${key}'`);
    }
  });

  it('does not back-date the lost timestamp', () => {
    // The original `at` on that row is unrecoverable. Recording it as unknown is
    // honest; copying the twin's timestamp would be a fabrication.
    expect(sql).toMatch(/not recoverable|recorded as unknown|would be a fabrication/i);
  });
});
