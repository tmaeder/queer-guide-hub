import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  LEGAL_SOURCE_TYPES,
  CLINICAL_SOURCE_TYPES,
  CITABLE_SOURCE_TYPES,
  INSTRUMENT_STATUSES,
} from '../useTagSources';

/**
 * The TS vocabularies and the Postgres CHECK constraints have to agree.
 *
 * They live in two files that are edited months apart, and the failure is quiet:
 * the admin editor offers a value Postgres rejects, so a save 400s with a
 * constraint name in the toast and nothing explains why. This is the same
 * drift-test shape as tokenCatalog vs index.css.
 *
 * EACH CONSTRAINT IS READ FROM THE FILE THAT CURRENTLY DEFINES IT, which is not
 * one file. `source_type` and `public_requires_citation` were both redefined by
 * 20261011110300 when `clinical_guideline` was added; `instrument_status` was not
 * touched and still lives in the 2026-09 legal-citations migration. Reading a
 * superseded definition is the failure mode here — the test passes while asserting
 * against SQL that no longer runs — so a constraint moved by a later migration
 * must be repointed below, not left to resolve against whichever file happens to
 * mention it first. Same hazard as the venueCategories drift test.
 */

const migration = (file: string) =>
  readFileSync(resolve(__dirname, `../../../supabase/migrations/${file}`), 'utf8');

/** Redefined by the clinical-guideline migration. */
const CLINICAL_MIGRATION = '20261011110300_tag_sources_clinical_guideline.sql';
/** Still defined where it was introduced. */
const LEGAL_MIGRATION = '20260906100000_tag_sources_legal_citations.sql';

/** Pull the quoted values out of the named CHECK constraint's ARRAY[...]. */
function checkValues(sql: string, constraintMarker: RegExp): string[] {
  const at = sql.search(constraintMarker);
  expect(at, `constraint ${constraintMarker} not found in the migration`).toBeGreaterThan(-1);
  const array = sql.slice(at).match(/ARRAY\[([^\]]*)\]/);
  expect(array, 'no ARRAY[...] after the constraint').toBeTruthy();
  return [...(array as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('tag_sources vocabularies match the migration', () => {
  const sql = migration(CLINICAL_MIGRATION);

  it('every LEGAL_SOURCE_TYPES value is accepted by the source_type CHECK', () => {
    const allowed = checkValues(sql, /ADD CONSTRAINT tag_sources_source_type_check/);
    expect(allowed).toEqual(expect.arrayContaining([...LEGAL_SOURCE_TYPES]));
  });

  it('the citable types are exactly the non-provenance half of the CHECK', () => {
    // The other five (wikipedia/wikidata/editorial/llm/manual) are backfill
    // provenance, not citations, and must never appear in the editor's dropdown.
    // Everything else is citable — legal instruments plus clinical guidance.
    const allowed = checkValues(sql, /ADD CONSTRAINT tag_sources_source_type_check/);
    const provenance = ['wikipedia', 'wikidata', 'editorial', 'llm', 'manual'];
    expect(allowed.filter((v) => !provenance.includes(v)).sort()).toEqual(
      [...CITABLE_SOURCE_TYPES].sort(),
    );
  });

  it('legal and clinical vocabularies do not overlap', () => {
    // They render as different cards and publish under different completeness
    // rules, so a value belonging to both would be ambiguous at every call site.
    const overlap = [...LEGAL_SOURCE_TYPES].filter((v) =>
      ([...CLINICAL_SOURCE_TYPES] as string[]).includes(v),
    );
    expect(overlap).toEqual([]);
  });

  it('every INSTRUMENT_STATUSES value is accepted by the instrument_status CHECK', () => {
    // Read from the legal-citations migration: this constraint was not touched by
    // the clinical-guideline change, so that is still where it is defined.
    const allowed = checkValues(
      migration(LEGAL_MIGRATION),
      /ADD CONSTRAINT tag_sources_instrument_status_check/,
    );
    expect(allowed.sort()).toEqual([...INSTRUMENT_STATUSES].sort());
  });

  it('only a legal source_type may be published as law', () => {
    // The public-read policy hangs off is_public, so if this CHECK ever stopped
    // constraining source_type a backfill row could be flipped public.
    // `checkValues` reads the FIRST ARRAY[...] after the constraint name, which is
    // the legal branch — the clinical branch is deliberately written after it so
    // this assertion keeps meaning what it did.
    expect(sql).toMatch(/ADD CONSTRAINT tag_sources_public_requires_citation/);
    const allowed = checkValues(sql, /ADD CONSTRAINT tag_sources_public_requires_citation/);
    expect(allowed.sort()).toEqual([...LEGAL_SOURCE_TYPES].sort());
  });

  it('the clinical branch requires an edition year instead of a jurisdiction', () => {
    // A guideline has a publisher and a year, not a jurisdiction — stamping UCSF's
    // guidelines 'US' would assert a scope the document does not claim. The year is
    // required in its place because clinical guidance goes stale.
    const at = sql.search(/ADD CONSTRAINT tag_sources_public_requires_citation/);
    const body = sql.slice(at, sql.indexOf(';', at));
    const clinicalBranch = body.slice(body.indexOf('clinical_guideline') - 400);
    expect(clinicalBranch).toMatch(/adopted_year IS NOT NULL/);
    expect(clinicalBranch).toMatch(/official_title IS NOT NULL/);
    expect(clinicalBranch).toMatch(/source_url IS NOT NULL/);
    // and must NOT have quietly picked up the legal jurisdiction requirement
    expect(clinicalBranch.slice(clinicalBranch.indexOf('clinical_guideline'))).not.toMatch(
      /jurisdiction/,
    );
  });
});
