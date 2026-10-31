import { describe, it, expect } from 'vitest';
import {
  boundsOf,
  decideClusterAction,
  isColocated,
  shouldListStack,
  STACK_RING_MAX,
  SPIDER_MAX,
  type LngLat,
} from '@/components/map/clusterClick';

// Real shapes: Zürich places a few hundred metres apart, and a stack of
// places geocoded to one identical point (the kind measured at 88 deep in
// Berlin).
const spread: LngLat[] = [
  [8.5281, 47.3779],
  [8.5302, 47.3765],
  [8.5266, 47.3741],
];
const stack: LngLat[] = Array.from({ length: 5 }, () => [13.405, 52.52] as LngLat);

describe('boundsOf', () => {
  it('returns the extent of the coordinates', () => {
    expect(boundsOf(spread)).toEqual([
      [8.5266, 47.3741],
      [8.5302, 47.3779],
    ]);
  });

  it('ignores non-finite coordinates and returns null when none are usable', () => {
    expect(boundsOf([[NaN, 1]])).toBeNull();
    expect(boundsOf([])).toBeNull();
  });
});

describe('isColocated', () => {
  it('is true for an identical-coordinate stack', () => {
    expect(isColocated(boundsOf(stack)!)).toBe(true);
  });

  it('is false for places hundreds of metres apart', () => {
    expect(isColocated(boundsOf(spread)!)).toBe(false);
  });
});

describe('decideClusterAction', () => {
  it('zooms to the contents when that is a real zoom-in', () => {
    const a = decideClusterAction(spread, 12, 15.2, 18);
    expect(a).toEqual({ kind: 'fit', bounds: boundsOf(spread), zoom: 15.2 });
  });

  it('caps the fit at the maximum zoom', () => {
    const a = decideClusterAction(spread, 12, 20, 18);
    expect(a.kind === 'fit' && a.zoom).toBe(18);
  });

  it('fans out a stack no zoom can separate, at any zoom', () => {
    expect(decideClusterAction(stack, 4, null, 18)).toEqual({ kind: 'spiderfy' });
    expect(decideClusterAction(stack, 12, null, 18)).toEqual({ kind: 'spiderfy' });
  });

  it('fans out instead of a click that would visibly do nothing', () => {
    // Already at the cap: fitting would not zoom in at all.
    expect(decideClusterAction(spread, 18, 21, 18)).toEqual({ kind: 'spiderfy' });
    // Fitting would zoom in by less than half a level.
    expect(decideClusterAction(spread, 15, 15.3, 18)).toEqual({ kind: 'spiderfy' });
  });

  it('fans out when no camera could be computed', () => {
    expect(decideClusterAction(spread, 12, null, 18)).toEqual({ kind: 'spiderfy' });
  });
});

describe('shouldListStack', () => {
  it('fans out small stacks', () => {
    expect(shouldListStack(STACK_RING_MAX, true)).toBe(false);
    expect(shouldListStack(2, true)).toBe(false);
  });

  it('lists stacks too large for a readable ring, including ones past the ring cap', () => {
    expect(shouldListStack(STACK_RING_MAX + 1, true)).toBe(true);
    expect(shouldListStack(88, true)).toBe(true);
    expect(88).toBeGreaterThan(SPIDER_MAX);
  });

  it('keeps the ring on surfaces with no results list', () => {
    expect(shouldListStack(88, false)).toBe(false);
  });
});
