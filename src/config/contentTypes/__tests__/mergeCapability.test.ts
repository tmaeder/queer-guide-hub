import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';

/**
 * A soft-merged row must not read as a live one, and the registry is where
 * the admin list learns that a type can even have such a row.
 *
 * What went wrong: `merge_cities` folded "Freisenbruch, Essen" and
 * "Rüttenscheid, Essen" into Essen on 2026-08-25 — content reparented, search
 * reindexed, public slugs redirecting — and all three kept appearing side by
 * side under `/admin/content/cities`, because the CMS list was the one read
 * path with no `duplicate_of_id` predicate. Measured across the registry when
 * this was written: 15,994 merged rows on screen (venues 11,062, marketplace
 * 2,898, events 964, news 566, cities 321, personalities 123, organizations
 * 54, milestones 5, hotels 1).
 *
 * Two assertions, and the second is the one that keeps working:
 *
 *  (a) a declared column must EXIST. `duplicate_of_id=is.null` against a table
 *      without it is a PostgREST 400, and `loadAllTypes` only logs the error —
 *      so a typo would delete that whole type from All content silently.
 *
 *  (b) a table that HAS the column must declare it. Without this, the next
 *      type to gain `duplicate_of_id` starts leaking merged rows the day the
 *      migration lands and nothing says so. That is the failure this whole
 *      suite exists to make loud.
 *
 * `merge` is deliberately not asserted to track `admin.dedup`. The two sets
 * coincide today, but they answer different questions — dedup says which merge
 * console drives the type — and a future hard-merge or bespoke-console type
 * would break a constraint that only ever encoded a coincidence.
 */

/** Same parser as fieldColumnExists.test.ts, over the generated schema. */
function parseRowColumns(source: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const table = /^ {6}(\w+): \{$/.exec(lines[i]);
    if (!table || lines[i + 1] !== '        Row: {') continue;
    const columns = new Set<string>();
    for (let j = i + 2; j < lines.length && lines[j] !== '        }'; j++) {
      const col = /^ {10}(\w+): (.+)$/.exec(lines[j]);
      if (col) columns.add(col[1]);
    }
    tables.set(table[1], columns);
  }
  return tables;
}

describe('merge capability matches the schema', () => {
  const source = readFileSync(join(process.cwd(), 'src/integrations/supabase/types.ts'), 'utf8');
  const schema = parseRowColumns(source);
  const types = Object.values(contentTypeRegistry);

  it('parses the generated schema at all', () => {
    // Without this a parser change makes every assertion below vacuous.
    expect(schema.size).toBeGreaterThan(100);
    expect(schema.get('cities')?.has('duplicate_of_id')).toBe(true);
    expect(schema.get('unified_tags')?.has('duplicate_of_id')).toBe(false);
  });

  it('every declared merge column exists on that table', () => {
    const phantoms = types
      .filter((ct) => ct.merge && schema.has(ct.tableName))
      .filter((ct) => !schema.get(ct.tableName)!.has(ct.merge!.column))
      .map((ct) => `${ct.id}: ${ct.tableName}.${ct.merge!.column}`);
    expect(phantoms).toEqual([]);
  });

  it('every table that CAN be merged declares it', () => {
    const undeclared = types
      // A type whose table the parser does not know (view-backed) proves
      // nothing either way; skip rather than assert against absence.
      .filter((ct) => schema.has(ct.tableName))
      .filter((ct) => schema.get(ct.tableName)!.has('duplicate_of_id'))
      .filter((ct) => !ct.merge)
      .map((ct) => `${ct.id} (${ct.tableName})`);
    expect(undeclared).toEqual([]);
  });

  it('covers the twelve mergeable types', () => {
    // A count, not a hardcoded list: the assertion above owns membership, and
    // this only catches the registry silently losing a type.
    expect(types.filter((ct) => ct.merge).length).toBe(12);
  });
});
