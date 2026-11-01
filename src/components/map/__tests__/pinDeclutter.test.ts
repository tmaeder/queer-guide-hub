import { describe, it, expect } from 'vitest';
import {
  declutterPins,
  dotsUnderPin,
  pinPriority,
  pinRadiusAt,
} from '@/components/map/pinDeclutter';

const p = (id: string, x: number, y: number, priority = 0, r = 15) => ({ id, x, y, r, priority });

describe('declutterPins', () => {
  it('keeps pins that have room full-size', () => {
    expect(declutterPins([p('a', 0, 0), p('b', 100, 0)]).size).toBe(0);
  });

  it('shrinks the lower-priority pin of an overlapping pair', () => {
    const compact = declutterPins([p('low', 0, 0, 1), p('high', 10, 0, 5)]);
    expect([...compact]).toEqual(['low']);
  });

  it('never shrinks the highest-priority pin in a crowd', () => {
    const crowd = Array.from({ length: 30 }, (_, i) => p(`c${i}`, i * 3, 0, 0));
    crowd.push(p('featured', 45, 0, pinPriority(true, false, 1)));
    const compact = declutterPins(crowd);
    expect(compact.has('featured')).toBe(false);
    // Full pins left over are at least one pin-width apart.
    const full = crowd
      .filter((c) => !compact.has(c.id))
      .map((c) => c.x)
      .sort((a, b) => a - b);
    for (let i = 1; i < full.length; i++) expect(full[i] - full[i - 1]).toBeGreaterThanOrEqual(32);
  });

  it('is stable: equal priority falls back to id order', () => {
    expect([...declutterPins([p('b', 0, 0), p('a', 5, 0)])]).toEqual(['b']);
  });
});

describe('pinRadiusAt', () => {
  it('matches the layer radius plus outline, and featured adds the ring', () => {
    expect(pinRadiusAt(11, false)).toBeCloseTo(14.5);
    expect(pinRadiusAt(16, false)).toBeCloseTo(16.5);
    expect(pinRadiusAt(16, true)).toBeCloseTo(21.5);
  });
});

describe('dotsUnderPin', () => {
  const pin = { id: 'a', x: 100, y: 100, r: 12 };

  it('returns dots whose centre is inside the pin disc', () => {
    const dots = [
      { id: 'b', x: 100.3, y: 101 }, // Offstream Party under the Zurich Pride stack
      { id: 'c', x: 111, y: 100 },
      { id: 'd', x: 113, y: 100 }, // visible beside the pin
    ];
    expect(dotsUnderPin(pin, dots)).toEqual(['b', 'c']);
  });

  it('skips the pin itself and duplicates', () => {
    const dots = [
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 101, y: 100 },
      { id: 'b', x: 101, y: 100 },
    ];
    expect(dotsUnderPin(pin, dots)).toEqual(['b']);
  });

  it('is empty when nothing hides under the pin', () => {
    expect(dotsUnderPin(pin, [{ id: 'z', x: 200, y: 200 }])).toEqual([]);
  });
});
