import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';
import type { FieldType } from '@/types/cms';

/**
 * Guards the field-type-vs-column-type mismatch class.
 *
 * `redirects.status_code` was declared as a `select` with string options
 * ('301', '302', …) over an INTEGER column. SelectField emits strings and
 * nothing in the save path coerces, so zodFromFields built a z.enum of
 * strings that rejected the NUMBER Postgres returns — every existing
 * redirect failed validation the moment it was opened. Nothing in CI
 * related a config's declared type to the column it writes, so it shipped.
 *
 * The generated Supabase types are the schema of record here: they are
 * regenerated from the live database, so this test fails when either side
 * drifts.
 */

type ColumnKind = 'string' | 'number' | 'boolean' | 'array' | 'json';

/** Parse `Row: { col: type }` blocks out of the generated types file. */
function parseRowTypes(source: string): Map<string, Map<string, string>> {
  const tables = new Map<string, Map<string, string>>();
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // Table declarations sit at a fixed indent inside Tables: { … }.
    const table = /^ {6}(\w+): \{$/.exec(lines[i]);
    if (!table || lines[i + 1] !== '        Row: {') continue;

    const columns = new Map<string, string>();
    for (let j = i + 2; j < lines.length && lines[j] !== '        }'; j++) {
      const col = /^ {10}(\w+): (.+)$/.exec(lines[j]);
      if (col) columns.set(col[1], col[2].trim());
    }
    tables.set(table[1], columns);
  }
  return tables;
}

function columnKind(tsType: string): ColumnKind {
  // Strip the nullable union so `number | null` reads as numeric.
  const t = tsType.replace(/\s*\|\s*null$/, '').trim();
  if (t.endsWith('[]')) return 'array';
  if (t === 'Json') return 'json';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'string'; // includes enum references, which are string unions
}

/**
 * What each field type puts in the record. Only types with an unambiguous
 * storage shape are listed — anything absent is skipped rather than guessed
 * at, so this test reports real mismatches and not modelling opinions.
 */
const FIELD_KIND: Partial<Record<FieldType, ColumnKind>> = {
  text: 'string',
  textarea: 'string',
  richtext: 'string',
  slug: 'string',
  url: 'string',
  email: 'string',
  phone: 'string',
  date: 'string',
  datetime: 'string',
  select: 'string',
  number: 'number',
  boolean: 'boolean',
  multiselect: 'array',
  tags: 'array',
  images: 'array',
  json: 'json',
} as Partial<Record<FieldType, ColumnKind>>;

describe('registry field types match their database columns', () => {
  const source = readFileSync(join(process.cwd(), 'src/integrations/supabase/types.ts'), 'utf8');
  const schema = parseRowTypes(source);

  it('parses the generated schema at all', () => {
    // A guard on the guard: if the generator changes its formatting this
    // test would silently pass by finding nothing to check.
    expect(schema.size).toBeGreaterThan(100);
    expect(schema.get('redirects')?.get('status_code')).toBe('number');
  });

  const mismatches: string[] = [];

  for (const config of Object.values(contentTypeRegistry)) {
    const columns = schema.get(config.tableName);
    if (!columns) continue; // view-backed or otherwise not in Tables

    for (const field of config.fields) {
      const column = columns.get(field.name);
      if (!column) continue; // computed/virtual field, not a column

      const expected = FIELD_KIND[field.type];
      if (!expected) continue;

      const actual = columnKind(column);
      if (expected !== actual) {
        mismatches.push(
          `${config.id}.${field.name}: field type '${field.type}' writes ` +
            `${expected}, but ${config.tableName}.${field.name} is ${actual} (${column})`,
        );
      }
    }
  }

  it('has no field whose declared type conflicts with its column', () => {
    expect(mismatches).toEqual([]);
  });
});
