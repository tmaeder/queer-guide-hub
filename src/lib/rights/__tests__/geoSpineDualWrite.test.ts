import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The geo-spine dual-write is the quietest failure mode in this schema.
 *
 * `sync_geo_spine_country()` enumerates every column THREE times — the INSERT
 * column list, the VALUES list, and the ON CONFLICT DO UPDATE SET list. A
 * column added to `countries` and to `geo_country_profiles` but missed in any
 * one of them silently never mirrors, and `geo_spine_drift_check()` compares
 * only name/slug/parent_id, so nothing alarms. The same trap is documented for
 * `sync_geo_spine_city` in CLAUDE.md, where a missing profile column "would
 * never alarm".
 *
 * This parses the most recent definition of the function in the migrations
 * directory and asserts the three lists agree. It is a text check, not a
 * database one, so it runs in CI without credentials.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');

function latestDefinitionOf(fn: string): string {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of [...files].reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    // `create [or replace] function`, not merely `function`. A GRANT, REVOKE,
    // COMMENT ON, DROP or ALTER naming the function also contains
    // "function public.<fn>(" and was picked up as its "latest definition".
    // Not hypothetical: 20260822100000 revokes anon on ~97 RPCs including
    // `sync_geo_spine_country()`, sorts last by filename, and so won the
    // reverse scan — the upsert regex below then matched nothing and the suite
    // died at collection with a null deref instead of a readable assertion.
    if (
      new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}\\s*\\(`, 'i').test(sql)
    )
      return sql;
  }
  throw new Error(`no migration defines ${fn}`);
}

describe('sync_geo_spine_country keeps its three column lists in step', () => {
  const sql = latestDefinitionOf('sync_geo_spine_country');

  const block = sql.match(
    /insert into public\.geo_country_profiles as p \((.*?)\)\s*values\s*\((.*?)\)\s*on conflict \(place_id\) do update set(.*?);/s,
  );

  it('parses the geo_country_profiles upsert', () => {
    expect(block, 'could not find the geo_country_profiles upsert').not.toBeNull();
  });

  // Destructured defensively: these run in the describe body, i.e. at COLLECTION
  // time, before the `it` above ever executes. With `block!` a null match threw a
  // TypeError that failed the whole SUITE — so the one assertion written to
  // explain the problem ("could not find the geo_country_profiles upsert") never
  // got to run. Falling back to empty arrays lets that assertion do its job.
  const cols = block ? block[1].split(',').map((c) => c.trim()) : [];
  const vals = block ? block[2].split(',').map((v) => v.trim()) : [];
  const sets = block ? [...block[3].matchAll(/(\w+)\s*=\s*excluded\./g)].map((m) => m[1]) : [];

  it('has as many values as columns', () => {
    expect(vals.length, `${cols.length} columns vs ${vals.length} values`).toBe(cols.length);
  });

  it('maps every column to its own NEW value, in order', () => {
    // `place_id` is fed from new.id; everything else must be new.<same name>.
    const mismatched = cols
      .map((c, i) => [c, vals[i]] as const)
      .filter(([c, v]) => v !== `new.${c}` && !(c === 'place_id' && v === 'new.id'));
    expect(mismatched, `positional mismatch: ${JSON.stringify(mismatched)}`).toEqual([]);
  });

  it('updates every non-key column on conflict', () => {
    // A column present in the INSERT but absent here mirrors on first write
    // and then silently goes stale for ever — the worse half of the trap.
    const missing = cols.filter((c) => c !== 'place_id' && !sets.includes(c));
    expect(missing, `never refreshed on conflict: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it('carries the rights verdict columns through all three lists', () => {
    for (const col of ['rights_verdicts', 'rights_verdict_general']) {
      expect(cols, `${col} missing from INSERT list`).toContain(col);
      expect(vals, `${col} missing from VALUES`).toContain(`new.${col}`);
      expect(sets, `${col} missing from ON CONFLICT SET`).toContain(col);
    }
  });
});
