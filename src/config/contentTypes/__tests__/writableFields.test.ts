import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';

/**
 * Guards the writable-field-vs-column drift class.
 *
 * `aiAssist.writableFields` is the allowlist `applyAIResult` consults before
 * writing a `cms-ai` suggestion into the editor. Four configs listed
 * `meta_title`/`meta_description` on tables that have neither column — SEO
 * overrides for entity types live in the `cms_content_metadata` sidecar
 * (edited via SEOPanel), and the Pages middleware builds per-route SEO tags
 * from the entity's own title/description anyway.
 *
 * That drift was not cosmetic. `useCMSEditor` builds its UPDATE payload from
 * the dirty-key set, so applying such a suggestion put a nonexistent column
 * into the payload and PostgREST rejected the entire save — taking every other
 * pending edit with it.
 *
 * Note this checks a different property than fieldColumnTypes.test.ts: that
 * test compares declared *types* and deliberately skips names it cannot find a
 * column for ("computed/virtual field"), so a missing column passes it
 * silently. Here a missing column is exactly the defect.
 *
 * The generated Supabase types are the schema of record — regenerated from the
 * live database, so this fails when either side drifts.
 */

/** Parse `Row: { col: type }` blocks out of the generated types file. */
function parseRowColumns(source: string): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    // Table declarations sit at a fixed indent inside Tables: { … }.
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

describe('aiAssist.writableFields name real columns', () => {
  const source = readFileSync(join(process.cwd(), 'src/integrations/supabase/types.ts'), 'utf8');
  const schema = parseRowColumns(source);

  const configs = Object.values(contentTypeRegistry).filter(
    (c) => (c.aiAssist?.writableFields ?? []).length > 0,
  );

  it('parses the generated schema at all', () => {
    // A guard on the guard: if the generator changes its formatting this test
    // would pass by finding nothing to check.
    expect(schema.size).toBeGreaterThan(100);
    expect(schema.get('cms_pages')?.has('meta_title')).toBe(true);
    expect(schema.get('venues')?.has('meta_title')).toBe(false);
  });

  it('has configs to check', () => {
    // Same reasoning: an empty registry or a renamed aiAssist key must fail
    // loudly rather than vacuously pass.
    expect(configs.length).toBeGreaterThan(0);
  });

  const missingColumn: string[] = [];
  const unknownTable: string[] = [];

  for (const config of configs) {
    const columns = schema.get(config.tableName);
    if (!columns) {
      // Reported rather than skipped — a view-backed type would otherwise make
      // this guard silently vacuous for that config.
      unknownTable.push(`${config.id} -> ${config.tableName}`);
      continue;
    }
    for (const field of config.aiAssist!.writableFields!) {
      if (!columns.has(field)) {
        missingColumn.push(
          `${config.id}.aiAssist.writableFields lists '${field}', but ` +
            `${config.tableName} has no such column`,
        );
      }
    }
  }

  it('has no writable field without a backing column', () => {
    expect(missingColumn).toEqual([]);
  });

  it('resolves every writable-field config to a table in the schema', () => {
    expect(unknownTable).toEqual([]);
  });
});
