import { describe, it, expect } from 'vitest';
import { timeBucket, rotateWindow } from '../rotation';

const HOUR = 60 * 60 * 1000;
const items = (n: number) => Array.from({ length: n }, (_, i) => `i${i}`);

describe('timeBucket', () => {
  it('advances exactly once per window', () => {
    // Anchor on a window boundary — from an arbitrary instant, +5h can
    // legitimately cross into the next bucket.
    const t = Math.floor(1_800_000_000_000 / (6 * HOUR)) * 6 * HOUR;
    const b = timeBucket(t, 6);
    expect(timeBucket(t + 5 * HOUR, 6)).toBe(b);
    expect(timeBucket(t + 6 * HOUR, 6)).toBe(b + 1);
    expect(timeBucket(t + 12 * HOUR, 6)).toBe(b + 2);
  });

  it('is stable within a window regardless of where in it you look', () => {
    const t = 1_800_000_000_000;
    const b = timeBucket(t, 24);
    for (let h = 0; h < 24; h++) {
      // Only true if `t` is window-aligned, so compare against the same origin.
      expect(timeBucket(Math.floor(t / (24 * HOUR)) * 24 * HOUR + h * HOUR, 24)).toBe(b);
    }
  });

  it('never divides by zero on a nonsense window', () => {
    expect(Number.isFinite(timeBucket(1_800_000_000_000, 0))).toBe(true);
  });
});

describe('rotateWindow', () => {
  it('is a selection, not a mutation — no duplicates, all from the source', () => {
    const src = items(20);
    const out = rotateWindow(src, 5, 7);
    expect(out).toHaveLength(5);
    expect(new Set(out).size).toBe(5);
    for (const o of out) expect(src).toContain(o);
  });

  it('renders IDENTICALLY for the same bucket', () => {
    // The negative assertion: this is what catches someone "fixing" rotation
    // with Math.random(), which would break hydration and every snapshot.
    const src = items(20);
    expect(rotateWindow(src, 5, 3)).toEqual(rotateWindow(src, 5, 3));
  });

  it('renders DIFFERENTLY once the bucket advances', () => {
    const src = items(20);
    expect(rotateWindow(src, 5, 3)).not.toEqual(rotateWindow(src, 5, 4));
  });

  it('advances by a PAGE, so a new bucket shares nothing with the last', () => {
    // A stride of one shifted the window a single item per bucket, so
    // consecutive buckets shared four of five stories — "it changes every six
    // hours" was true and invisible at the same time.
    const src = items(20);
    const a = rotateWindow(src, 5, 3);
    const b = rotateWindow(src, 5, 4);
    expect(a.filter((x) => b.includes(x))).toEqual([]);
  });

  it('pages past the pinned head without disturbing it', () => {
    const src = items(21); // 1 pinned + 20 rotatable
    const a = rotateWindow(src, 5, 0, 1);
    const b = rotateWindow(src, 5, 1, 1);
    expect(a[0]).toBe('i0');
    expect(b[0]).toBe('i0');
    // The four unpinned slots are a disjoint page.
    expect(a.slice(1).filter((x) => b.slice(1).includes(x))).toEqual([]);
  });

  it('holds the pinned head in place while the tail cycles', () => {
    const src = items(20);
    const a = rotateWindow(src, 5, 3, 1);
    const b = rotateWindow(src, 5, 9, 1);
    // The editors' pick must not rotate out of the lead.
    expect(a[0]).toBe('i0');
    expect(b[0]).toBe('i0');
    expect(a.slice(1)).not.toEqual(b.slice(1));
    // …and it must not reappear further down the list.
    expect(a.slice(1)).not.toContain('i0');
  });

  it('returns everything (in order) when the pool is no bigger than the window', () => {
    const src = items(3);
    expect(rotateWindow(src, 5, 99)).toEqual(src);
    expect(rotateWindow(src, 3, 99)).toEqual(src);
  });

  it('handles empty input and non-positive takes', () => {
    expect(rotateWindow([], 5, 1)).toEqual([]);
    expect(rotateWindow(items(5), 0, 1)).toEqual([]);
    expect(rotateWindow(items(5), -1, 1)).toEqual([]);
  });

  it('normalizes negative and huge buckets into range', () => {
    const src = items(10);
    expect(rotateWindow(src, 3, -1)).toHaveLength(3);
    expect(rotateWindow(src, 3, -1)).toEqual(rotateWindow(src, 3, 9));
    expect(rotateWindow(src, 3, 1_000_000)).toHaveLength(3);
  });

  it('eventually shows every item across enough buckets', () => {
    // Rotation that never reaches the tail of the pool is just a shuffle of
    // the head — the band would still feel static.
    const src = items(12);
    const seen = new Set<string>();
    for (let b = 0; b < 12; b++) for (const x of rotateWindow(src, 4, b)) seen.add(x);
    expect(seen.size).toBe(12);
  });
});
