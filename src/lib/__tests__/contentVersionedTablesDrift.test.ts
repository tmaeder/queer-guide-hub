/**
 * The DB has to know which tables are versioned — the trigger reads its own
 * configuration from `content_versioned_tables`, the revert RPC refuses any
 * table absent from it, and the sentinel fails when a registered table has no
 * trigger. That set is a mirror of `src/config/contentTypes`, and a mirror
 * that drifts silently is how a content type stops being versioned without
 * anyone noticing — which is the failure this whole feature exists to fix.
 *
 * Following the styleguideScopes precedent rather than the venueCategories
 * one: find the LATEST migration that defines the set instead of pinning a
 * filename, or this test rots the next time the seed is altered.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contentTypeRegistry } from '@/config/contentTypes';

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

/** The newest migration that seeds `content_versioned_tables`. */
function latestSeedMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const sql = readFileSync(join(MIGRATIONS, files[i]), 'utf8');
    if (/INSERT INTO public\.content_versioned_tables\s*\(registry_key, table_name\)/i.test(sql)) {
      return { file: files[i], sql };
    }
  }
  throw new Error('no migration seeds content_versioned_tables');
}

/** `('registry_key', 'table_name'),` pairs from the VALUES list. */
function seededPairs(sql: string): Map<string, string> {
  const start = sql.search(
    /INSERT INTO public\.content_versioned_tables\s*\(registry_key, table_name\)/i,
  );
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('ON CONFLICT', start);
  expect(end).toBeGreaterThan(start);
  const block = sql.slice(start, end);

  const pairs = new Map<string, string>();
  for (const m of block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)) {
    pairs.set(m[1], m[2]);
  }
  return pairs;
}

describe('content_versioned_tables mirrors the content type registry', () => {
  const { file, sql } = latestSeedMigration();
  const seeded = seededPairs(sql);

  it('found a real seed block', () => {
    expect(seeded.size, `no pairs parsed out of ${file}`).toBeGreaterThan(20);
  });

  it('registers every content type, and nothing else', () => {
    const inRegistry = Object.keys(contentTypeRegistry).sort();
    const inDb = [...seeded.keys()].sort();
    expect(
      inDb,
      `drift between src/config/contentTypes and ${file}. ` +
        `A registry key missing here is a content type whose edits are never recorded.`,
    ).toEqual(inRegistry);
  });

  it('maps each key to the table the registry says it writes', () => {
    // The registry key is not always the table name — `feedback` writes
    // `community_submissions`. Getting this wrong registers a table nothing
    // edits and leaves the real one unversioned.
    for (const [key, config] of Object.entries(contentTypeRegistry)) {
      expect(seeded.get(key), `${key} is not seeded in ${file}`).toBe(config.tableName);
    }
  });

  it('arms nothing — every row ships disabled', () => {
    // Turning 26 triggers on in one migration skips the measured, table-by-table
    // rollout the disk budget depends on.
    const statements = sql.split(/^DO \$verify\$/m)[0];
    expect(statements).not.toMatch(/enabled\s*\)\s*VALUES/i);
    expect(statements).not.toMatch(/SET\s+enabled\s*=\s*true/i);
  });
});
