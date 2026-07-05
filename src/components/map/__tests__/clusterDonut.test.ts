import { describe, expect, it } from 'vitest';
import {
  DONUT_PREFIX,
  DONUT_SIZE_STEPS,
  donutIconExpression,
  donutSegments,
  parseDonutKey,
  quantizeShare,
} from '../clusterDonut';

describe('quantizeShare', () => {
  it('never rounds a non-zero minority down to 0', () => {
    // 1 hotel among 60 points → 1/60 ≈ 0.017 → would round to 0 without the floor
    expect(quantizeShare(1, 60)).toBe(1);
  });

  it('quantizes to tenths', () => {
    expect(quantizeShare(50, 100)).toBe(5);
    expect(quantizeShare(100, 100)).toBe(10);
    expect(quantizeShare(0, 100)).toBe(0);
  });
});

describe('parseDonutKey', () => {
  it('round-trips a well-formed key', () => {
    const spec = parseDonutKey(`${DONUT_PREFIX}|52|6|3|0|1`);
    expect(spec).toEqual({
      diameter: 52,
      tenths: { venues: 6, events: 3, restrooms: 0, hotels: 1 },
    });
  });

  it('rejects foreign ids and malformed keys', () => {
    expect(parseDonutKey('type:venues')).toBeNull();
    expect(parseDonutKey(`${DONUT_PREFIX}|52|6|3`)).toBeNull();
    expect(parseDonutKey(`${DONUT_PREFIX}|52|a|3|0|1`)).toBeNull();
    expect(parseDonutKey(`${DONUT_PREFIX}|9999|1|0|0|0`)).toBeNull();
  });
});

describe('donutSegments', () => {
  it('renormalizes shares (independent rounding can exceed 10)', () => {
    const segs = donutSegments({ venues: 6, events: 3, restrooms: 0, hotels: 2 });
    const sum = segs.reduce((a, s) => a + s.share, 0);
    expect(sum).toBeCloseTo(1);
    expect(segs.map((s) => s.layer)).toEqual(['venues', 'events', 'hotels']);
  });

  it('returns an empty list for unknown composition (renderer falls back to a full neutral ring)', () => {
    expect(donutSegments({ venues: 0, events: 0, restrooms: 0, hotels: 0 })).toEqual([]);
  });

  it('single-type cluster is one full segment', () => {
    const segs = donutSegments({ venues: 10, events: 0, restrooms: 0, hotels: 0 });
    expect(segs).toEqual([{ layer: 'venues', share: 1 }]);
  });
});

describe('donutIconExpression', () => {
  it('emits a concat expression starting with the donut prefix', () => {
    const expr = donutIconExpression() as unknown[];
    expect(expr[0]).toBe('concat');
    expect(expr[1]).toBe(`${DONUT_PREFIX}|`);
  });

  it('size steps align with the documented buckets', () => {
    expect(DONUT_SIZE_STEPS[0]).toEqual([0, 32]);
    expect(DONUT_SIZE_STEPS.at(-1)).toEqual([500, 80]);
  });
});
