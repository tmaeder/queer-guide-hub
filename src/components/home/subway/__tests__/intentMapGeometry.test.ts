import { describe, it, expect } from 'vitest';
import { INTENT_NAV, INTENT_TRACK } from '@/config/navigation';
import type { Track } from '@/components/transit/routeBulletMap';
import {
  INTERCHANGE,
  STATIONS,
  TRACK_PATHS,
  VIEWBOX,
  pct,
} from '../intentMapGeometry';

const TRACKS: Track[] = ['pink', 'blue', 'green', 'yellow'];

/**
 * The points a cubic path is GUARANTEED to pass through: the `M` point and
 * the final coordinate pair of every `C` segment. A cubic bezier passes
 * exactly through P0 and P3 by definition, so testing station placement is a
 * set-membership check with no sampling and no tolerance.
 */
function nodesOf(d: string): Array<[number, number]> {
  const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const out: Array<[number, number]> = [[n[0], n[1]]];
  for (let i = 2; i + 5 < n.length; i += 6) out.push([n[i + 4], n[i + 5]]);
  return out;
}

describe('intentMapGeometry', () => {
  it('places every station on a node of its own track', () => {
    for (const station of STATIONS) {
      if (station.id === INTERCHANGE.id) continue;
      expect(
        nodesOf(TRACK_PATHS[station.track]),
        `${station.id} must sit on the ${station.track} line`,
      ).toContainEqual([station.x, station.y]);
    }
  });

  it('converges all four tracks on the interchange', () => {
    // The convergence has to be real, not drawn: the previous illustration
    // put a ring at (730, 167) while the yellow line ran through y≈176.
    for (const track of TRACKS) {
      expect(nodesOf(TRACK_PATHS[track]), `${track} must reach the interchange`).toContainEqual([
        INTERCHANGE.x,
        INTERCHANGE.y,
      ]);
    }
  });

  it('assigns every station the track INTENT_TRACK declares', () => {
    for (const intent of INTENT_NAV) {
      const station = STATIONS.find((s) => s.id === intent.id);
      expect(station, `no station for intent ${intent.id}`).toBeDefined();
      expect(station!.track).toBe(INTENT_TRACK[intent.id]);
    }
  });

  it('renders one station per intent plus the interchange', () => {
    expect(STATIONS).toHaveLength(INTENT_NAV.length + 1);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    expect(STATIONS.filter((s) => !s.intent)).toEqual([INTERCHANGE]);
  });

  it('orders stations left to right, so DOM order matches reading order', () => {
    const xs = STATIONS.map((s) => s.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('keeps same-lane plates from colliding at the narrowest desktop width', () => {
    // 1024 is where the lg: layout starts AND the binding case: the plate is
    // fixed px while the map scales with the viewport, so the map is smallest
    // relative to the type here, not at 1536.
    const scale = 1024 / VIEWBOX.w;
    const PLATE = 160; // lg:w-40
    const GAP = 16;

    for (const lane of ['above', 'below'] as const) {
      const xs = STATIONS.filter((s) => s.lane === lane)
        .map((s) => s.x)
        .sort((a, b) => a - b);
      expect(xs.length, `lane ${lane} is empty`).toBeGreaterThan(0);

      for (let i = 1; i < xs.length; i++) {
        expect(
          (xs[i] - xs[i - 1]) * scale,
          `lane ${lane}: plates at x=${xs[i - 1]} and x=${xs[i]} overlap at 1024px`,
        ).toBeGreaterThanOrEqual(PLATE + GAP);
      }

      // `main` carries `overflow-x-clip`, so a plate that runs off the edge is
      // silently cropped — no scrollbar, no error. Only this catches it.
      expect(xs[0] * scale - PLATE / 2, `lane ${lane} clips the left edge`).toBeGreaterThanOrEqual(0);
      expect(
        xs[xs.length - 1] * scale + PLATE / 2,
        `lane ${lane} clips the right edge`,
      ).toBeLessThanOrEqual(1024);
    }
  });

  it('bleeds every track off both edges of the stage', () => {
    for (const track of TRACKS) {
      const nodes = nodesOf(TRACK_PATHS[track]);
      expect(nodes[0][0], `${track} starts inside the stage`).toBeLessThan(0);
      expect(nodes[nodes.length - 1][0], `${track} ends inside the stage`).toBeGreaterThan(VIEWBOX.w);
    }
  });

  it('keeps every station inside the viewBox', () => {
    for (const s of STATIONS) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(VIEWBOX.w);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(VIEWBOX.h);
    }
  });

  it('converts viewBox coordinates to in-range percentages', () => {
    expect(pct(0, 'x')).toBe('0.0000%');
    expect(pct(VIEWBOX.w, 'x')).toBe('100.0000%');
    expect(pct(VIEWBOX.h / 2, 'y')).toBe('50.0000%');
    for (const s of STATIONS) {
      for (const [value, axis] of [
        [s.x, 'x'],
        [s.y, 'y'],
      ] as const) {
        const n = Number.parseFloat(pct(value, axis));
        expect(n).toBeGreaterThan(0);
        expect(n).toBeLessThan(100);
      }
    }
  });
});
