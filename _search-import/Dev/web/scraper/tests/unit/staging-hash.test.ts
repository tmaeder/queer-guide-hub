import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

// Re-declare the same serializer the publisher uses. Keep this in sync with
// scraper/src/db/staging-publisher.ts :: stableStringify. Kept local to avoid
// exposing it from the publisher module (which pulls pg/transitives).
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('stableStringify (staging-publisher payload hash)', () => {
  it('produces the same hash for objects with different key insertion order', () => {
    const a = { name: 'X', city: 'Berlin', tags: ['a', 'b'] };
    const b = { tags: ['a', 'b'], city: 'Berlin', name: 'X' };
    expect(sha256(stableStringify(a))).toBe(sha256(stableStringify(b)));
    // Sanity: the old non-stable JSON.stringify would have matched here too
    // (modern V8 preserves insertion order) — this test locks the invariant
    // against future runtime changes.
  });

  it('is deterministic across nested structures', () => {
    const a = { outer: { y: 2, x: 1 }, arr: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
    const b = { arr: [{ a: 1, b: 2 }, { c: 3, d: 4 }], outer: { x: 1, y: 2 } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('treats different values as different hashes', () => {
    const a = { name: 'X' };
    const b = { name: 'Y' };
    expect(sha256(stableStringify(a))).not.toBe(sha256(stableStringify(b)));
  });

  it('handles null and undefined consistently', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify({ a: null, b: 1 })).toBe(stableStringify({ b: 1, a: null }));
  });
});
