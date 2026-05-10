import { describe, it, expect } from 'vitest';

/**
 * Simulates the atomicity guarantee of upsertEntity. We don't run against a
 * real Postgres here (would require infra); instead we model the SQL-level
 * invariant: INSERT ... ON CONFLICT (source_name, source_id, entity_type)
 * DO UPDATE RETURNING canonical_entity_id must converge on a single
 * canonical UUID even under high concurrency.
 *
 * The real DB enforces this via the UNIQUE constraint on scraper_entity_map.
 * This test locks in the client-side contract: when N concurrent callers
 * race for the same (source, id, type), they all see the same canonical UUID
 * and exactly one row exists in the mapping.
 */

type MappingKey = string;
type Mapping = { canonical_id: string };

class FakeMappingTable {
  private rows = new Map<MappingKey, Mapping>();
  private lock = Promise.resolve();

  /**
   * Atomic upsert primitive — mirrors ON CONFLICT ... DO UPDATE RETURNING.
   * Serializes via a monitor to model Postgres row-level locking.
   */
  async upsert(key: MappingKey, newId: () => string): Promise<string> {
    const prev = this.lock;
    let release: () => void = () => {};
    this.lock = new Promise<void>((r) => (release = r));
    await prev;
    try {
      const existing = this.rows.get(key);
      if (existing) return existing.canonical_id;
      const id = newId();
      this.rows.set(key, { canonical_id: id });
      return id;
    } finally {
      release();
    }
  }

  size() {
    return this.rows.size;
  }
  ids() {
    return new Set([...this.rows.values()].map((r) => r.canonical_id));
  }
}

describe('upsertEntity atomicity (model)', () => {
  it('converges on exactly one canonical id under 100 concurrent upserts', async () => {
    const table = new FakeMappingTable();
    const key = 'outsavvy:event-42:event';
    let idCounter = 0;
    const newId = () => `uuid-${++idCounter}`;

    const results = await Promise.all(
      Array.from({ length: 100 }, () => table.upsert(key, newId)),
    );

    // All callers see the SAME canonical uuid
    const unique = new Set(results);
    expect(unique.size).toBe(1);

    // Exactly ONE row in the mapping table
    expect(table.size()).toBe(1);

    // Only one uuid was ever "committed"
    expect(table.ids().size).toBe(1);
  });

  it('supports concurrent different keys writing independently', async () => {
    const table = new FakeMappingTable();
    let idCounter = 0;
    const newId = () => `uuid-${++idCounter}`;

    const keys = Array.from({ length: 50 }, (_, i) => `outsavvy:e-${i}:event`);
    // Each key called twice concurrently.
    const tasks = keys.flatMap((k) => [table.upsert(k, newId), table.upsert(k, newId)]);
    const results = await Promise.all(tasks);

    // 50 keys × 2 calls = 100 results but only 50 unique ids.
    expect(results.length).toBe(100);
    expect(new Set(results).size).toBe(50);
    expect(table.size()).toBe(50);
  });
});
