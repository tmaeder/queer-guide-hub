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
 * Here the default is inverted — a field must either name a real column or carry
 * `virtual: true`, so a typo fails CI instead of silently dropping data.
 *
 * The exemption is the field's own `virtual` flag, not a list in this file. Two hardcoded
 * maps used to live here — VIRTUAL_FIELDS and a KNOWN_BROKEN escape hatch — and both were
 * the wrong shape for the same reason: an allowlist entry is invisible from the config
 * being read, and it was inert. `virtual` now actually gates the write path (useCMSEditor
 * drops those keys from the save payload, Editable refuses to open an editor on them), so
 * declaring a field virtual is a behavioural statement this guard can verify rather than a
 * note asking CI to look away — and the assertion below IS the ratchet, so a second list
 * legitimising writes to a non-existent column only blunts it.
 *
 * What the two maps held, and where each entry went:
 *   - hotels.accessibility_attributes / accessibility_notes — real data loss. They now
 *     have columns (migration 20260807130000) and render via AmenityDisplay.
 *   - hotels.target_groups / event_amenities — real data loss, removed from the config:
 *     no column, and no facet, filter or reader anywhere for a hotel.
 *   - queer_villages.city / country and cities.country — autocomplete inputs whose value
 *     lives in the FK columns they populate. Now `virtual: true`, which is what stopped
 *     them poisoning the save payload and failing the whole statement with PGRST204.
 *   - the eight cities / queer_villages aggregates — never broken. Already `hidden` +
 *     `virtual` list renders; calling them "broken" hid the four that were.
 *   - countries.continent → the real `continent_id` FK. unified_tags.color and
 *     marketplace_listings.verified / needs_attention → removed, no columns.
 *   - the four feedback fields → the actual community_submissions triage columns.
 */

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
  const inertVirtuals: string[] = [];
  for (const config of Object.values(contentTypeRegistry)) {
    const columns = schema.get(config.tableName);
    if (!columns) continue; // view-backed or otherwise not in Tables
    for (const field of config.fields) {
      const exists = columns.has(field.name);
      if (!exists && !field.virtual) {
        phantoms.push(`${config.id}.${field.name} -> no column ${config.tableName}.${field.name}`);
      }
      // The inverse mistake: `virtual` on a field that DOES have a column means
      // useCMSEditor strips it from every save, so the column can never be written.
      if (exists && field.virtual) {
        inertVirtuals.push(
          `${config.id}.${field.name} -> marked virtual, but ${config.tableName}.${field.name} exists and will never be saved`,
        );
      }
    }
  }

  it('has no field writing to a column that does not exist', () => {
    expect(phantoms).toEqual([]);
  });

  it('has no virtual field shadowing a real column', () => {
    expect(inertVirtuals).toEqual([]);
  });

  it('routes every relatedFields target to a real column', () => {
    const bad: string[] = [];
    for (const config of Object.values(contentTypeRegistry)) {
      const columns = schema.get(config.tableName);
      if (!columns) continue;
      for (const field of config.fields) {
        for (const target of Object.values(field.relatedFields ?? {})) {
          if (typeof target === 'string' && !columns.has(target)) {
            bad.push(`${config.id}.${field.name} relatedFields -> ${config.tableName}.${target} does not exist`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
