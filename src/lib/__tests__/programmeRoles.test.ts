import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROGRAMME_ROLES, PROGRAMME_ROLE_LABELS } from '../programmeRoles';

/**
 * Drift guard for `events.programme_role`. Same approach as venueCategories.test.ts: parse
 * the migration that defines the CHECK and assert the TS constant matches it exactly. An
 * admin select offering a value the CHECK rejects fails on save; a CHECK value missing
 * here is a role no editor can choose.
 */
const MIGRATION = '99991795346624_events_programme_role.sql';

function checkValues(): string[] {
  const sql = readFileSync(join(__dirname, '../../../supabase/migrations', MIGRATION), 'utf8');
  const idx = sql.indexOf('add constraint events_programme_role_check');
  expect(idx, 'constraint not found').toBeGreaterThan(-1);
  const arrayStart = sql.indexOf('ARRAY[', idx);
  const arrayEnd = sql.indexOf(']', arrayStart);
  expect(arrayStart).toBeGreaterThan(-1);
  return [...sql.slice(arrayStart, arrayEnd).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('programme role vocabulary', () => {
  it('matches events_programme_role_check', () => {
    const db = checkValues();
    // Positive control: an empty parse also "matches" an empty list.
    expect(db.length).toBeGreaterThanOrEqual(10);
    expect([...PROGRAMME_ROLES].sort()).toEqual([...db].sort());
  });

  it('gives every role a label', () => {
    for (const r of PROGRAMME_ROLES) {
      expect(PROGRAMME_ROLE_LABELS[r]?.trim()).toBeTruthy();
    }
    expect(Object.keys(PROGRAMME_ROLE_LABELS).sort()).toEqual([...PROGRAMME_ROLES].sort());
  });
});
