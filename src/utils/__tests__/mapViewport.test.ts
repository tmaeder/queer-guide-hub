import { describe, it, expect } from 'vitest';
import {
  getZoomBucket,
  padBbox,
  quantizeBbox,
  bboxKey,
  filtersHash,
  bboxExceedsPadded,
  LRUCache,
  type Bbox,
} from '../mapViewport';

// ── Zoom Buckets ──────────────────────────────────────────────────────────────

describe('getZoomBucket', () => {
  it('returns "low" for continent/country zoom (< 8)', () => {
    expect(getZoomBucket(0)).toBe('low');
    expect(getZoomBucket(2)).toBe('low');
    expect(getZoomBucket(7.9)).toBe('low');
  });

  it('returns "mid" for regional zoom (8-11.9)', () => {
    expect(getZoomBucket(8)).toBe('mid');
    expect(getZoomBucket(10)).toBe('mid');
    expect(getZoomBucket(11.9)).toBe('mid');
  });

  it('returns "city" for city zoom (>= 12)', () => {
    expect(getZoomBucket(12)).toBe('city');
    expect(getZoomBucket(14)).toBe('city');
    expect(getZoomBucket(18)).toBe('city');
  });
});

// ── Bbox Padding ──────────────────────────────────────────────────────────────

describe('padBbox', () => {
  const bbox: Bbox = { west: 10, south: 40, east: 20, north: 50 };

  it('expands bbox by 15% padding by default', () => {
    const padded = padBbox(bbox);
    expect(padded.west).toBeCloseTo(8.5);
    expect(padded.south).toBeCloseTo(38.5);
    expect(padded.east).toBeCloseTo(21.5);
    expect(padded.north).toBeCloseTo(51.5);
  });

  it('respects custom padding factor', () => {
    const padded = padBbox(bbox, 0.25);
    expect(padded.west).toBeCloseTo(7.5);
    expect(padded.east).toBeCloseTo(22.5);
  });

  it('handles zero padding', () => {
    const padded = padBbox(bbox, 0);
    expect(padded).toEqual(bbox);
  });
});

// ── Bbox Quantization ─────────────────────────────────────────────────────────

describe('quantizeBbox', () => {
  const bbox: Bbox = { west: 11.3, south: 48.7, east: 12.8, north: 49.2 };

  it('rounds to 5-degree grid for "low" bucket', () => {
    const q = quantizeBbox(bbox, 'low');
    expect(q.west).toBe(10);
    expect(q.south).toBe(45);
    expect(q.east).toBe(15);
    expect(q.north).toBe(50);
  });

  it('rounds to 1-degree grid for "mid" bucket', () => {
    const q = quantizeBbox(bbox, 'mid');
    expect(q.west).toBe(11);
    expect(q.south).toBe(48);
    expect(q.east).toBe(13);
    expect(q.north).toBe(50);
  });

  it('rounds to 0.1-degree grid for "city" bucket', () => {
    const q = quantizeBbox(bbox, 'city');
    expect(q.west).toBeCloseTo(11.3);
    expect(q.south).toBeCloseTo(48.7);
    expect(q.east).toBeCloseTo(12.8);
    expect(q.north).toBeCloseTo(49.2);
  });

  it('nearby viewports quantize to same key at low zoom', () => {
    const bbox1: Bbox = { west: 11.0, south: 48.0, east: 12.0, north: 49.0 };
    const bbox2: Bbox = { west: 11.5, south: 48.5, east: 12.5, north: 49.5 };
    const key1 = bboxKey(quantizeBbox(bbox1, 'low'));
    const key2 = bboxKey(quantizeBbox(bbox2, 'low'));
    expect(key1).toBe(key2);
  });
});

// ── Bbox Key ──────────────────────────────────────────────────────────────────

describe('bboxKey', () => {
  it('produces a deterministic string', () => {
    const bbox: Bbox = { west: 10, south: 40, east: 20, north: 50 };
    expect(bboxKey(bbox)).toBe('10.00,40.00,20.00,50.00');
  });

  it('handles negative coordinates', () => {
    const bbox: Bbox = { west: -74.5, south: 40.5, east: -73.5, north: 41.5 };
    expect(bboxKey(bbox)).toBe('-74.50,40.50,-73.50,41.50');
  });
});

// ── Filters Hash ──────────────────────────────────────────────────────────────

describe('filtersHash', () => {
  it('returns "_" for empty filters', () => {
    expect(filtersHash({})).toBe('_');
  });

  it('ignores undefined/null/empty values', () => {
    expect(filtersHash({ search: undefined, category: null, tags: '' })).toBe('_');
  });

  it('produces same hash regardless of key insertion order', () => {
    const h1 = filtersHash({ category: 'bar', search: 'berlin' });
    const h2 = filtersHash({ search: 'berlin', category: 'bar' });
    expect(h1).toBe(h2);
  });

  it('differentiates between different filter values', () => {
    const h1 = filtersHash({ search: 'berlin' });
    const h2 = filtersHash({ search: 'london' });
    expect(h1).not.toBe(h2);
  });

  it('handles array values', () => {
    const h = filtersHash({ tags: ['lgbtq', 'bar'] });
    expect(h).toContain('tags');
    expect(h).toContain('lgbtq');
  });
});

// ── Bbox Exceeds Padded ───────────────────────────────────────────────────────

describe('bboxExceedsPadded', () => {
  const padded: Bbox = { west: 8, south: 38, east: 22, north: 52 };

  it('returns false when current is inside padded', () => {
    const current: Bbox = { west: 10, south: 40, east: 20, north: 50 };
    expect(bboxExceedsPadded(current, padded)).toBe(false);
  });

  it('returns true when current extends west', () => {
    const current: Bbox = { west: 7, south: 40, east: 20, north: 50 };
    expect(bboxExceedsPadded(current, padded)).toBe(true);
  });

  it('returns true when current extends east', () => {
    const current: Bbox = { west: 10, south: 40, east: 23, north: 50 };
    expect(bboxExceedsPadded(current, padded)).toBe(true);
  });

  it('returns true when current extends south', () => {
    const current: Bbox = { west: 10, south: 37, east: 20, north: 50 };
    expect(bboxExceedsPadded(current, padded)).toBe(true);
  });

  it('returns true when current extends north', () => {
    const current: Bbox = { west: 10, south: 40, east: 20, north: 53 };
    expect(bboxExceedsPadded(current, padded)).toBe(true);
  });
});

// ── LRU Cache ─────────────────────────────────────────────────────────────────

describe('LRUCache', () => {
  it('stores and retrieves values', () => {
    const cache = new LRUCache<number>(5);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
  });

  it('returns undefined for missing keys', () => {
    const cache = new LRUCache<number>(5);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts oldest entry when maxSize exceeded', () => {
    const cache = new LRUCache<number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('d')).toBe(4);
    expect(cache.size).toBe(3);
  });

  it('accessing an entry moves it to most-recently-used', () => {
    const cache = new LRUCache<number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.get('a'); // touch 'a', making 'b' the oldest
    cache.set('d', 4); // should evict 'b'
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('overwrites existing keys without growing size', () => {
    const cache = new LRUCache<number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10);
    expect(cache.get('a')).toBe(10);
    expect(cache.size).toBe(2);
  });

  it('clear removes all entries', () => {
    const cache = new LRUCache<number>(5);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('has returns correct boolean', () => {
    const cache = new LRUCache<string>(5);
    cache.set('x', 'val');
    expect(cache.has('x')).toBe(true);
    expect(cache.has('y')).toBe(false);
  });
});
