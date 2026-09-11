import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STYLEGUIDE_SCOPES, SCOPE_LABELS, isStyleguideScope } from '../styleguideScopes';

/**
 * `styleguide_rules.applies_to` is governed by three artifacts that must agree:
 * the `styleguide_rules_applies_to_known` CHECK, the
 * `styleguide_scope_values()` function, and this TS list.
 *
 * Unlike the `venueCategories.ts` precedent — whose test pins a migration
 * FILENAME, so a later ALTER of the constraint silently tests the wrong file
 * until someone remembers to update the reference — this finds the LATEST
 * migration that redefines either artifact. Adding a scope in a new migration
 * needs no edit here beyond the list itself.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestMigrationMatching(re: RegExp): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (re.test(sql)) return sql;
  }
  throw new Error(`no migration matches ${re}`);
}

/** Pull a Postgres text[] array literal out of SQL. */
function parseArrayLiteral(sql: string, after: string): string[] {
  const start = sql.indexOf(after);
  expect(start).toBeGreaterThan(-1);
  const open = sql.indexOf('ARRAY[', start);
  const close = sql.indexOf(']', open);
  expect(open).toBeGreaterThan(-1);
  expect(close).toBeGreaterThan(open);
  return [...sql.slice(open, close).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

describe('styleguide scope vocabulary', () => {
  it('matches styleguide_scope_values() in SQL', () => {
    const sql = latestMigrationMatching(
      /create\s+(or\s+replace\s+)?function\s+public\.styleguide_scope_values\s*\(/i,
    );
    const fromSql = parseArrayLiteral(sql, 'styleguide_scope_values');
    expect(fromSql.length).toBeGreaterThan(0);
    expect([...fromSql].sort()).toEqual([...STYLEGUIDE_SCOPES].sort());
  });

  it('matches the CHECK constraint the database actually enforces', () => {
    // The function is documentation; the CHECK is the thing that rejects a row.
    // They are separate literals in the migration and can drift apart.
    const sql = latestMigrationMatching(/styleguide_rules_applies_to_known\s*\n?\s*CHECK/i);
    const fromCheck = parseArrayLiteral(sql, 'styleguide_rules_applies_to_known');
    expect([...fromCheck].sort()).toEqual([...STYLEGUIDE_SCOPES].sort());
  });

  it('labels every scope, so the admin editor cannot show a bare slug', () => {
    for (const scope of STYLEGUIDE_SCOPES) {
      expect(SCOPE_LABELS[scope]).toBeTruthy();
    }
    expect(Object.keys(SCOPE_LABELS).sort()).toEqual([...STYLEGUIDE_SCOPES].sort());
  });

  it('rejects the near-misses that motivated the vocabulary', () => {
    expect(isStyleguideScope('venue')).toBe(true);
    expect(isStyleguideScope('venues')).toBe(false);
    expect(isStyleguideScope('glossary')).toBe(false); // retired in favour of `tag`
    expect(isStyleguideScope('')).toBe(false);
  });
});
