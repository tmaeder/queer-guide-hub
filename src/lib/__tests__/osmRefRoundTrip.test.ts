import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The OSM element id is written by an edge function and read back by a SQL
 * selector, and the two encode it DIFFERENTLY on purpose:
 *
 *   venue_sources.source_entity_id   `osm-node-1234567`   (written by
 *                                     venue-accessibility-osm)
 *   Overpass / pickMatchingElement   `node/1234567`       (returned by
 *                                     venues_due_for_osm_accessibility as
 *                                     `osm_ref`, via regexp_replace)
 *
 * Nothing but this test makes the writer's format string and the reader's regex
 * agree. They live in different files, different languages, and neither
 * references the other.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. Migration
 * 20270301100300_retire_venue_accessibility_osm_cron retired the per-venue cron
 * and named this exact gap as the reason:
 *
 *   "resolves pick.element.type/id, uses it, and never writes it back anywhere
 *    the selector can read -- which is why 916 probes produced no durable
 *    identity at all and every pass starts over"
 *
 * 916 probes, 81% of them failing to match a name within 60 m, because identity
 * was re-derived from scratch every time. The write now exists. If the two
 * encodings silently drift apart, the write still happens, the selector still
 * returns NULL for osm_ref, and the function is back to guessing by name —
 * failing exactly as before while looking like it was fixed.
 */

const ROOT = join(__dirname, '..', '..', '..');
const FN = join(ROOT, 'supabase', 'functions', 'venue-accessibility-osm', 'index.ts');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

/** The most recent migration that defines the selector's osm_ref extraction. */
function selectorSql(): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    if (sql.includes('venues_due_for_osm_accessibility') && sql.includes('regexp_replace')) {
      return sql;
    }
  }
  throw new Error('no migration defines the osm_ref extraction');
}

describe('the OSM element id round-trips between writer and selector', () => {
  const fn = readFileSync(FN, 'utf8');
  const sql = selectorSql();

  it('the function writes source_entity_id in the osm-<type>-<id> form', () => {
    // Positive control on the scan: if the write disappears entirely the rest of
    // this file would pass vacuously, and a missing write is the original bug.
    expect(
      fn,
      'venue-accessibility-osm no longer writes the resolved element id to venue_sources — ' +
        'that is the defect 20270301100300 retired the cron over',
    ).toMatch(/source_entity_id:\s*`osm-\$\{[^}]+\.type\}-\$\{[^}]+\.id\}`/);
  });

  it('the selector still filters and parses that exact shape', () => {
    // Both halves matter: the WHERE filter decides which rows are considered,
    // the regexp_replace decides what they become.
    expect(sql).toMatch(/source_entity_id\s*~\s*'\^osm-\[a-z\]\+-\[0-9\]\+\$'/);
    expect(sql).toMatch(
      /regexp_replace\(\s*vs\.source_entity_id,\s*'\^osm-\(\[a-z\]\+\)-\(\[0-9\]\+\)\$'/,
    );
  });

  it('the two agree on every element type Overpass returns', () => {
    // Executable form of the contract, rather than two independent shape
    // assertions that could both pass while disagreeing.
    const write = (type: string, id: number) => `osm-${type}-${id}`;
    const filter = /^osm-[a-z]+-[0-9]+$/;
    const read = (s: string) => s.replace(/^osm-([a-z]+)-([0-9]+)$/, '$1/$2');

    for (const [type, id] of [
      ['node', 1234567],
      ['way', 98765],
      ['relation', 42],
    ] as const) {
      const stored = write(type, id);
      expect(filter.test(stored), `${stored} would be filtered out by the selector`).toBe(true);
      // `<type>/<id>` is what Overpass uses and what pickMatchingElement expects
      // back as osm_ref, which is what makes the next pass an id lookup.
      expect(read(stored)).toBe(`${type}/${id}`);
    }
  });

  it('the write never repoints an element already attached to another venue', () => {
    // venue_sources is unique on (source_slug, source_entity_id) WITHOUT
    // venue_id, so a plain upsert would move the row to whichever venue matched
    // most recently. Two venues resolving to one element is a duplicate signal
    // for the dedup engine, not something this function may decide silently.
    const call = fn.slice(fn.indexOf("from('venue_sources')"));
    expect(call.slice(0, 900)).toMatch(/ignoreDuplicates:\s*true/);
  });
});
