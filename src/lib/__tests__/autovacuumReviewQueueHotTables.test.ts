import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards 99991792238512 — autovacuum cadence on the two tables whose stale visibility map
 * was the dominant cost in get_admin_review_queue().
 *
 * EVERY ASSERTION RUNS OVER COMMENT-STRIPPED SQL. The migration's header quotes every
 * phrase this file asserts on — the option names, both table names, `relallvisible`, the
 * 0.05 tier it rejects — because it explains them at length. An unstripped `toContain`
 * would pass with the ALTER statements deleted, which is the vacuous assertion this repo
 * has recorded repeatedly.
 */

const MIGRATION = '99991792238512_autovacuum_review_queue_hot_tables.sql';
const raw = readFileSync(join(process.cwd(), 'supabase/migrations', MIGRATION), 'utf8');

const sql = raw
  .split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n');

const statements = sql.slice(0, sql.indexOf('do $verify$'));
const verify = sql.slice(sql.indexOf('do $verify$'));

describe('the cadence is applied to both tables', () => {
  it('sets BOTH options on BOTH tables', () => {
    // A scale factor with no floor still waits ~19k rows on a small table; a floor with no
    // scale factor does nothing at all on a large one. Four facts, not two.
    for (const table of ['entity_quality_findings', 'organizations']) {
      const stmt = statements.match(new RegExp(`alter table public\\.${table}[\\s\\S]*?;`))?.[0];
      expect(stmt, `${table} ALTER`).toBeTruthy();
      expect(stmt).toContain('autovacuum_vacuum_scale_factor = 0.02');
      expect(stmt).toContain('autovacuum_vacuum_threshold = 1000');
    }
  });

  it('uses the tight 0.02 tier, not the 0.05 one that demonstrably was not enough', () => {
    // `venues` already carried 0.05/1000 and still degraded enough on 2026-10-17 to need a
    // manual vacuum (24,167 blocks -> 147). For a table an index-only scan depends on, the
    // common tier is insufficient. Scoped to the statements so the header's discussion of
    // 0.05 does not satisfy this.
    expect(statements).not.toContain('scale_factor = 0.05');
    expect((statements.match(/autovacuum_vacuum_scale_factor = 0\.02/g) ?? []).length).toBe(2);
  });

  it('touches ONLY those two tables', () => {
    // Tightening a table that is not degrading is a change with no measurement behind it.
    // venues in particular was re-measured at 20 dead tuples and deliberately left alone.
    const altered = [...statements.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
    expect(altered.sort()).toEqual(['entity_quality_findings', 'organizations']);
  });

  it('changes no data and creates no object', () => {
    // This is a planner/maintenance setting. An UPDATE, INSERT or CREATE here would be a
    // different change wearing this one's clothes.
    expect(statements).not.toMatch(/\b(insert|update|delete)\s+(into\s+|from\s+)?public\./i);
    expect(statements).not.toMatch(/\bcreate\s+(table|index|function|view)\b/i);
  });
});

describe('postconditions', () => {
  it('every one of P1..P4 RAISES, counted exactly per label', () => {
    // Exact counts, not a floor: P1..P4 raise once each, so replacing one with `null;`
    // must not be absorbable. A recorded survivor class.
    for (const label of ['P1', 'P2', 'P3', 'P4']) {
      const hits = sql.match(new RegExp(`raise exception '${label} failed`, 'g')) ?? [];
      expect(hits.length, `${label} raises`).toBe(1);
    }
  });

  it('P2 is the positive control for P1 iterating over nothing', () => {
    // P1 accumulates into v_missing inside a FOR loop, so a renamed or dropped table makes
    // the body never run and leaves v_missing empty — P1 would pass over a table that does
    // not exist. P2 asserts both were actually found.
    expect(verify).toMatch(/<>\s*2\s*then/);
    expect(verify).toContain('expected exactly 2 target tables');
  });

  it('P3 asserts a RELATION, never a pinned threshold number', () => {
    // reltuples moves with the corpus, so a literal would fail on correct code the next
    // time ingest runs.
    expect(verify).toMatch(
      /new_threshold\s*<\s*r?\.?default_threshold|r\.new_threshold < r\.default_threshold/,
    );
    expect(verify).not.toMatch(/\b188169\b|\b19812\b|\b20095\b|\b3005\b/);
  });

  it('P4 requires the cover index to exist AND be valid', () => {
    // Without that index the scan is not index-only, the visibility map is irrelevant, and
    // the whole setting is cargo cult. An INVALID index is worse than a missing one: it
    // exists in pg_index and serves nothing.
    expect(verify).toContain('entity_quality_findings_admin_review_cover_idx');
    expect(verify).toContain('i.indisvalid');
  });

  it('does NOT assert relallvisible, which is the vacuous check here', () => {
    // relallvisible is a planner ESTIMATE refreshed only by vacuum. It read 100.0% on
    // entity_quality_findings while that scan was doing 220,896 heap fetches, so a check on
    // it would have passed throughout the incident this migration exists to prevent.
    expect(verify).not.toContain('relallvisible');
  });

  it('no postcondition is short-circuited', () => {
    expect(verify).not.toMatch(/where false/i);
    expect(verify).not.toMatch(/if\s+false\s+then/i);
    // A pre-seeded accumulator would make the cardinality check pass with nothing counted.
    expect(verify).not.toMatch(/v_missing\s+text\[\]\s*:=\s*array\[/);
  });
});

describe('it is reversible, and the repo convention is followed', () => {
  it('names the one-statement rollback', () => {
    expect(raw).toContain('reset (autovacuum_vacuum_scale_factor');
  });

  it('matches the option spelling the 12 existing tables already use', () => {
    // Drift in option NAME is silent: Postgres rejects an unknown reloption, but a
    // plausible-looking variant applied to a different option is not what was measured.
    const others = readdirSync(join(process.cwd(), 'supabase/migrations'))
      .filter((f) => f.endsWith('.sql') && f !== MIGRATION)
      .map((f) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8'))
      .filter((s) => s.includes('autovacuum_vacuum_scale_factor'));
    // Positive control: if no other migration sets these, this assertion proves nothing and
    // the convention claim in the header is unfounded.
    expect(others.length).toBeGreaterThan(0);
    expect(statements).toContain('autovacuum_vacuum_scale_factor');
    expect(statements).toContain('autovacuum_vacuum_threshold');
  });
});
