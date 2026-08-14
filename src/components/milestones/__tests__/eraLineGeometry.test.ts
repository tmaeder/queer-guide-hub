import { describe, expect, it } from 'vitest';
import {
  H_VIEW,
  V_ROW,
  eraStroke,
  horizontalLine,
  pct,
  verticalLine,
  type EraLine,
} from '../eraLineGeometry';
import { HISTORY_ERAS } from '@/config/historyEras';

/** Every coordinate pair a `C` command ends on, in order. */
function endpoints(d: string): Array<[number, number]> {
  return [
    ...d.matchAll(/C[^C]*?([-\d.]+)\s+([-\d.]+)\s*$|C[^C]*?([-\d.]+)\s+([-\d.]+)(?=\s+C)/g),
  ].map((m) => [Number(m[1] ?? m[3]), Number(m[2] ?? m[4])]);
}

/** The `M x y` a path starts on. */
function startPoint(d: string): [number, number] {
  const m = /^M\s+([-\d.]+)\s+([-\d.]+)/.exec(d);
  if (!m) throw new Error(`no move-to in: ${d}`);
  return [Number(m[1]), Number(m[2])];
}

/** The final coordinate pair of a path. */
function endPoint(d: string): [number, number] {
  const pts = endpoints(d);
  return pts[pts.length - 1];
}

const COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

describe.each([
  ['horizontalLine', horizontalLine],
  ['verticalLine', verticalLine],
])('%s', (_name, make: (n: number) => EraLine) => {
  it.each(COUNTS)('produces one segment per era (n=%i)', (n) => {
    const line = make(n);
    expect(line.segments).toHaveLength(n);
    expect(line.stations).toHaveLength(n);
  });

  // Invariant 1 — a station is ON the line because it is a cubic endpoint,
  // not because it is within some tolerance of one.
  it.each(COUNTS)('puts every station on its own segment as a cubic endpoint (n=%i)', (n) => {
    const line = make(n);
    line.stations.forEach((s, i) => {
      const pts = endpoints(line.segments[i]).map(([x, y]) => `${x},${y}`);
      expect(pts).toContain(`${s.x},${s.y}`);
    });
  });

  // Invariant 3 — the pink→ink handoff lands on a shared point, so a colour
  // change between two eras cannot open a seam.
  it.each(COUNTS)('joins consecutive segments at an identical point (n=%i)', (n) => {
    const line = make(n);
    for (let i = 0; i < n - 1; i += 1) {
      expect(startPoint(line.segments[i + 1])).toEqual(endPoint(line.segments[i]));
    }
  });

  // Invariant 2 — hard rule #1 of the design system, as a test.
  it.each(COUNTS)('never emits a straight segment (n=%i)', (n) => {
    for (const d of make(n).segments) {
      expect(d).not.toMatch(/[LHVlhv]/);
      // Asserted in three linear pieces rather than one `( C .+)+$`. That form
      // nests `.+` inside a `+`, which CodeQL flagged as js/redos (high): the
      // two quantifiers can split the same input many ways, so a near-miss
      // string backtracks exponentially. A test file has no attacker input,
      // but the pattern is wrong wherever it appears.
      expect(d.startsWith('M ')).toBe(true);
      expect(d).toMatch(/^M [-\d.]+ [-\d.]+ C /);
      expect(d.split(' C ').length - 1).toBeGreaterThan(0);
    }
  });

  it.each(COUNTS)('emits only finite coordinates (n=%i)', (n) => {
    for (const d of make(n).segments) {
      for (const token of d.match(/[-\d.]+/g) ?? []) {
        expect(Number.isFinite(Number(token))).toBe(true);
      }
    }
  });
});

describe('horizontalLine', () => {
  it('keeps the fixed viewBox so plates can be parked by percentage', () => {
    const line = horizontalLine(10);
    expect(line.viewBox).toBe(`0 0 ${H_VIEW.w} ${H_VIEW.h}`);
    expect(line.w).toBe(H_VIEW.w);
  });

  it('spaces stations evenly across the full width', () => {
    const xs = horizontalLine(4).stations.map((s) => s.x);
    expect(xs).toEqual([125, 375, 625, 875]);
  });

  it('keeps every station inside the box', () => {
    for (const s of horizontalLine(10).stations) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(H_VIEW.w);
    }
  });
});

describe('verticalLine', () => {
  // The vertical line's user units ARE css px — that 1:1 mapping is what lets
  // it bend without preserveAspectRatio="none". If h ever stops tracking the
  // row height, the rings drift off the path.
  it.each(COUNTS)('is exactly V_ROW tall per era (n=%i)', (n) => {
    expect(verticalLine(n).h).toBe(V_ROW * n);
  });

  it('centres each station in its own row', () => {
    expect(verticalLine(3).stations.map((s) => s.y)).toEqual([28, 84, 140]);
  });
});

describe('eraStroke', () => {
  // The line going dark across persecution chapters is the whole reason this
  // helper exists; pin both branches so a refactor cannot quietly re-pink them.
  it('renders restrained eras in ink and the rest in pink', () => {
    for (const era of HISTORY_ERAS) {
      expect(eraStroke(era)).toBe(
        era.restrained ? 'hsl(var(--foreground))' : 'hsl(var(--track-pink))',
      );
    }
  });

  it('covers the four persecution eras', () => {
    const dark = HISTORY_ERAS.filter((e) => eraStroke(e) === 'hsl(var(--foreground))').map(
      (e) => e.slug,
    );
    expect(dark).toEqual(['hidden-lives', 'empire-criminalization', 'destruction', 'aids-crisis']);
  });

  it('never returns a track colour for a restrained era', () => {
    for (const era of HISTORY_ERAS.filter((e) => e.restrained)) {
      expect(eraStroke(era)).not.toMatch(/--track-/);
    }
  });
});

describe('pct', () => {
  it('converts a coordinate to an exact percentage of its span', () => {
    expect(pct(125, 1000)).toBe('12.5000%');
    expect(pct(0, 40)).toBe('0.0000%');
  });
});
