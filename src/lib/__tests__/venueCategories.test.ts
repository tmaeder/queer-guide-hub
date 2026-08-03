import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VENUE_CATEGORIES, VENUE_CATEGORY_OPTIONS } from '../venueCategories';
import { EVENT_TYPES } from '../eventTypes';

/**
 * Drift guard. Five divergent copies of the venue category list existed before
 * `venueCategories.ts`, and one of them (the admin CMS select) offered values the DB
 * CHECK rejects, so saving a venue with them failed hard. These tests parse the
 * migrations that define the constraints and assert the constants still match.
 *
 * Same approach as the tokenCatalog/index.css drift test.
 */
function checkValues(migrationFile: string, constraintMarker: string): string[] {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations', migrationFile), 'utf8');
  const idx = sql.indexOf(constraintMarker);
  expect(idx, `${constraintMarker} not found in ${migrationFile}`).toBeGreaterThan(-1);
  // Grab the ARRAY[...] literal that follows the marker.
  const arrayStart = sql.indexOf('ARRAY[', idx);
  const arrayEnd = sql.indexOf(']', arrayStart);
  expect(arrayStart).toBeGreaterThan(-1);
  return [...sql.slice(arrayStart, arrayEnd).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('venue category vocabulary', () => {
  it('matches venues_category_check', () => {
    const dbValues = checkValues(
      '20260810120100_venue_category_toilet.sql',
      'ADD CONSTRAINT venues_category_check',
    );
    expect([...VENUE_CATEGORIES].sort()).toEqual([...dbValues].sort());
  });

  it('gives every value a label', () => {
    expect(VENUE_CATEGORY_OPTIONS).toHaveLength(VENUE_CATEGORIES.length);
    for (const o of VENUE_CATEGORY_OPTIONS) {
      expect(o.label.trim()).not.toBe('');
    }
  });
});

describe('event type vocabulary', () => {
  it('matches the event_type whitelist enforced by the write-gate trigger', () => {
    const dbValues = checkValues(
      '20260810120000_event_taxonomy_write_gate.sql',
      'v_valid CONSTANT text[]',
    );
    expect([...EVENT_TYPES].sort()).toEqual([...dbValues].sort());
  });
});
