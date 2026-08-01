import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentTypeRegistry } from '@/config/contentTypeRegistry';

/**
 * Guards the phantom-field class: a form field naming a column that does not exist.
 *
 * `events` had a `venue_address` field, and VenueAutocompleteField wrote the selected
 * venue's address into it via relatedFields. There is no `events.venue_address` column,
 * so every such write was discarded — the admin filled a box that could never save.
 *
 * fieldColumnTypes.test.ts cannot catch this: it skips any field whose column is absent
 * ("computed/virtual field, not a column"), which is exactly the hole this fell through.
 * Here the default is inverted — a field must either name a real column or be declared
 * virtual below, so a typo fails CI instead of silently dropping data.
 */

/**
 * Fields that intentionally have no column of their own — autocomplete inputs that write
 * only through relatedFields, and read-only aggregates rendered from joins.
 *
 * This is a baseline, not an endorsement. The four entries that turned out to be real
 * write bugs — events.venue_address, venues.featured, and the queer_villages / milestones
 * relatedFields targets — were fixed rather than listed. Anything ADDED here later needs
 * the same check: the point of this test is that a new phantom field fails CI instead of
 * silently dropping what an admin typed.
 */
const VIRTUAL_FIELDS: Record<string, string[]> = {
  // Autocomplete inputs whose value lives in the FK columns they populate.
  events: ['venue_address'],
  queer_villages: ['city', 'country'],
  cities: ['country'],
  // Read-only aggregates and joined display values.
  countries: ['continent'],
  unified_tags: ['color'],
  marketplace_listings: ['verified', 'needs_attention'],
  // The feedback type is backed by community_submissions, which nests its payload in jsonb
  // rather than exposing these as top-level columns.
  feedback: ['title', 'description', 'category', 'contact_email'],
};

/**
 * Phantom fields that are NOT display-only — the admin types into them and the value is
 * discarded. Empty, and it should stay that way: a new entry here means a form is
 * accepting input it will throw away.
 *
 * It previously held twelve. Eight (cities / queer_villages) were never broken at all —
 * they are `virtual: true, hidden: true` list-only renders, and the guard missed that
 * because it read a hardcoded map instead of the flag the config already declares.
 * Labelling working fields "broken" is its own failure: it hides the real ones.
 *
 * The other four were real. `hotels.accessibility_attributes` / `accessibility_notes` now
 * have columns (migration 20260807120000) and are rendered on the hotel detail page;
 * `target_groups` and `event_amenities` were removed, having neither column nor reader.
 */
const KNOWN_BROKEN: Record<string, string[]> = {};

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

describe('registry fields name real columns', () => {
  const source = readFileSync(join(process.cwd(), 'src/integrations/supabase/types.ts'), 'utf8');
  const schema = parseRowColumns(source);

  it('parses the generated schema at all', () => {
    expect(schema.size).toBeGreaterThan(100);
    expect(schema.get('events')?.has('address')).toBe(true);
    // The column this whole test exists because of.
    expect(schema.get('events')?.has('venue_address')).toBe(false);
  });

  const phantoms: string[] = [];
  for (const config of Object.values(contentTypeRegistry)) {
    const columns = schema.get(config.tableName);
    if (!columns) continue; // view-backed or otherwise not in Tables
    const allowed = new Set([
      ...(VIRTUAL_FIELDS[config.id] ?? []),
      ...(KNOWN_BROKEN[config.id] ?? []),
    ]);
    for (const field of config.fields) {
      // Honour the field's OWN declaration first. A config that already says
      // `virtual: true` should not also need an entry in the map above — that
      // duplication is what mislabelled eight working city/village fields.
      if (field.virtual) continue;
      if (columns.has(field.name) || allowed.has(field.name)) continue;
      phantoms.push(`${config.id}.${field.name} -> no column ${config.tableName}.${field.name}`);
    }
  }

  it('keeps the known-broken list empty', () => {
    // A ratchet, not decoration. This list existed to hold a fix open; refilling
    // it would re-legitimise a form that accepts input and throws it away.
    expect(Object.keys(KNOWN_BROKEN)).toEqual([]);
  });

  it('has no field writing to a column that does not exist', () => {
    expect(phantoms).toEqual([]);
  });

  it('routes every relatedFields target to a real column', () => {
    const bad: string[] = [];
    for (const config of Object.values(contentTypeRegistry)) {
      const columns = schema.get(config.tableName);
      if (!columns) continue;
      for (const field of config.fields) {
        for (const target of Object.values(field.relatedFields ?? {})) {
          if (typeof target === 'string' && !columns.has(target)) {
            bad.push(
              `${config.id}.${field.name} relatedFields -> ${config.tableName}.${target} does not exist`,
            );
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
