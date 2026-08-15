import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LEGAL_SOURCE_TYPES, INSTRUMENT_STATUSES } from '../useTagSources';

/**
 * The TS vocabularies and the Postgres CHECK constraints have to agree.
 *
 * They live in two files that are edited months apart, and the failure is quiet:
 * the admin editor offers a value Postgres rejects, so a save 400s with a
 * constraint name in the toast and nothing explains why. This is the same
 * drift-test shape as tokenCatalog vs index.css.
 */

const MIGRATION = resolve(
  __dirname,
  '../../../supabase/migrations/20260906100000_tag_sources_legal_citations.sql',
);

/** Pull the quoted values out of the named CHECK constraint's ARRAY[...]. */
function checkValues(sql: string, constraintMarker: RegExp): string[] {
  const at = sql.search(constraintMarker);
  expect(at, `constraint ${constraintMarker} not found in the migration`).toBeGreaterThan(-1);
  const array = sql.slice(at).match(/ARRAY\[([^\]]*)\]/);
  expect(array, 'no ARRAY[...] after the constraint').toBeTruthy();
  return [...(array as RegExpMatchArray)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('tag_sources vocabularies match the migration', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('every LEGAL_SOURCE_TYPES value is accepted by the source_type CHECK', () => {
    const allowed = checkValues(sql, /ADD CONSTRAINT tag_sources_source_type_check/);
    expect(allowed).toEqual(expect.arrayContaining([...LEGAL_SOURCE_TYPES]));
  });

  it('the legal types are exactly the non-provenance half of the CHECK', () => {
    // The other five (wikipedia/wikidata/editorial/llm/manual) are backfill
    // provenance, not citations, and must never appear in the editor's dropdown.
    const allowed = checkValues(sql, /ADD CONSTRAINT tag_sources_source_type_check/);
    const provenance = ['wikipedia', 'wikidata', 'editorial', 'llm', 'manual'];
    expect(allowed.filter((v) => !provenance.includes(v)).sort()).toEqual(
      [...LEGAL_SOURCE_TYPES].sort(),
    );
  });

  it('every INSTRUMENT_STATUSES value is accepted by the instrument_status CHECK', () => {
    const allowed = checkValues(sql, /ADD CONSTRAINT tag_sources_instrument_status_check/);
    expect(allowed.sort()).toEqual([...INSTRUMENT_STATUSES].sort());
  });

  it('only a legal source_type may be published', () => {
    // The public-read policy hangs off is_public, so if this CHECK ever stopped
    // constraining source_type a backfill row could be flipped public.
    expect(sql).toMatch(/tag_sources_public_requires_citation/);
    const allowed = checkValues(sql, /tag_sources_public_requires_citation/);
    expect(allowed.sort()).toEqual([...LEGAL_SOURCE_TYPES].sort());
  });
});
