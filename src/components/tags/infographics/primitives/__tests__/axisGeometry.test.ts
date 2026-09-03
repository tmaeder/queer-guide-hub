import { describe, it, expect } from 'vitest';
import { axisPath, pathEndpoints, mirrorX } from '../axisGeometry';
import { AXES, VIEW } from '../../figures/fourLines/data';

describe('axisPath', () => {
  /**
   * The same invariant `flowLayout` holds, for the same reason: a station that
   * is merely NEAR its line still looks like a diagram, so the check has to be
   * exact equality against the path's own endpoints.
   */
  it('makes every point an endpoint of the path', () => {
    for (const axis of AXES) {
      const points = [
        axis.runIn,
        ...axis.stations.map((s) => s.at),
        ...(axis.terminus ? [] : [axis.runOut]),
      ];
      const endpoints = pathEndpoints(axisPath(points));
      const keys = new Set(endpoints.map((p) => `${p.x},${p.y}`));
      for (const p of points) {
        expect(keys).toContain(`${p.x},${p.y}`);
      }
      expect(endpoints).toHaveLength(points.length);
    }
  });

  it('bends every segment — no straight run, which is hard rule #1', () => {
    // A row of stations at a constant y would otherwise emit a ruler, and a
    // ruler implies a measured quantity these axes do not have.
    const flat = axisPath([
      { x: 0, y: 50 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ]);
    const cubics = flat.match(/C[^C]*/g) ?? [];
    expect(cubics.length).toBe(2);
    for (const c of cubics) {
      const ys = (c.match(/-?[\d.]+/g) ?? []).map(Number).filter((_, i) => i % 2 === 1);
      // At least one control point leaves the baseline.
      expect(ys.some((y) => y !== 50)).toBe(true);
    }
  });

  it('alternates the bow so the line snakes rather than arcing off-axis', () => {
    const d = axisPath(
      [
        { x: 0, y: 50 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
      ],
      10,
    );
    const [first, second] = d.match(/C[^C]*/g)!;
    const firstC1Y = Number((first.match(/-?[\d.]+/g) ?? [])[1]);
    const secondC1Y = Number((second.match(/-?[\d.]+/g) ?? [])[1]);
    expect(Math.sign(firstC1Y - 50)).toBe(-Math.sign(secondC1Y - 50));
  });

  it('refuses a path it cannot draw', () => {
    expect(() => axisPath([{ x: 0, y: 0 }])).toThrow(/at least two points/);
  });
});

describe('four lines geometry', () => {
  it('keeps every station inside the viewBox', () => {
    for (const axis of AXES) {
      for (const s of axis.stations) {
        expect(s.at.x).toBeGreaterThanOrEqual(0);
        expect(s.at.x).toBeLessThanOrEqual(VIEW.w);
        expect(s.at.y).toBeGreaterThanOrEqual(0);
        expect(s.at.y).toBeLessThanOrEqual(VIEW.h);
      }
    }
  });

  it('never puts two stations on the same point', () => {
    const seen = new Set<string>();
    for (const axis of AXES) {
      for (const s of axis.stations) {
        const key = `${s.at.x},${s.at.y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('draws sex assigned at birth as a terminus that runs on to nothing', () => {
    // The correction is geometry, not a caption: the line records a starting
    // point and ends, rather than feeding the interchange like the others.
    const assigned = AXES.find((a) => a.id === 'assigned');
    expect(assigned?.terminus).toBe(true);
    for (const axis of AXES.filter((a) => a.id !== 'assigned')) {
      expect(axis.terminus).toBeFalsy();
    }
  });

  it('runs identity as two independent services on one corridor', () => {
    // The other correction: a single bipolar Woman↔Man slider forces a
    // tradeoff that does not exist. Two rails can be any length independently.
    const corridor = AXES.filter((a) => a.corridorKey);
    expect(corridor).toHaveLength(2);
    expect(new Set(corridor.map((a) => a.corridorKey)).size).toBe(1);
    expect(corridor.map((a) => a.id).sort()).toEqual(['identity-man', 'identity-woman']);
    // Same stop vocabulary on both rails, so neither reads as the "real" one.
    expect(corridor[0].stations.map((s) => s.id)).toEqual(corridor[1].stations.map((s) => s.id));
  });

  it('gives every line an explicit "rather not say" stop', () => {
    // Leaving the empty state to carry this makes not answering look like not
    // finishing.
    for (const axis of AXES) {
      expect(axis.stations.some((s) => s.id === 'rather-not')).toBe(true);
    }
  });

  it('mirrorX is an involution', () => {
    for (const x of [0, 64, 152, 234, 300]) {
      expect(mirrorX(mirrorX(x, VIEW.w), VIEW.w)).toBe(x);
    }
  });
});
