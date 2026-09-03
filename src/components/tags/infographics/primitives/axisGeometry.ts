/**
 * Derived geometry for `AxisSet`.
 *
 * An axis is a transit line and each of its positions is a station, so the
 * same invariant as `flowLayout` applies and for the same reason: **every
 * station point is a cubic ENDPOINT of the path**. Chaining one cubic per
 * segment makes that true by construction rather than by careful authoring,
 * which is what lets a unit test assert it.
 *
 * The wobble is not decoration. Hard rule #1 of the design system is that
 * illustrative transit lines are never straight, and a row of stations at a
 * constant `y` would emit exactly that. `amp` alternates sign per segment so
 * the line reads as a bending route rather than a ruler — which also matters
 * editorially here: a ruler implies a measured quantity, and the axes this
 * draws (identity, expression, attraction) are not measurements.
 */

export interface Point {
  x: number;
  y: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Chained cubics through every point in order. `points` includes the run-in
 * and run-out anchors, not only the stations — those are ordinary endpoints
 * that happen to carry no ring.
 */
export function axisPath(points: readonly Point[], amp = 9): string {
  if (points.length < 2) {
    throw new Error('axisPath: need at least two points');
  }
  let d = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    // Alternating bow, so consecutive segments curve opposite ways and the
    // line snakes instead of arcing steadily off-axis.
    const bow = i % 2 === 0 ? amp : -amp;
    const c1 = { x: round(a.x + dx * 0.35), y: round(a.y + bow) };
    const c2 = { x: round(b.x - dx * 0.35), y: round(b.y - bow) };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${round(b.x)} ${round(b.y)}`;
  }
  return d;
}

/**
 * Every endpoint the path passes through, in order: the initial `M` pair plus
 * the terminal pair of each cubic. Set membership against this is how a test
 * asks "is this station actually on the line?".
 */
export function pathEndpoints(d: string): Point[] {
  const out: Point[] = [];
  const move = d.match(/^M\s+(-?[\d.]+)\s+(-?[\d.]+)/);
  if (!move) throw new Error(`pathEndpoints: no move-to in ${d}`);
  out.push({ x: Number(move[1]), y: Number(move[2]) });

  const cubics = d.matchAll(/C\s+[^C]*?,\s*[^C]*?,\s*(-?[\d.]+)\s+(-?[\d.]+)/g);
  for (const c of cubics) {
    out.push({ x: Number(c[1]), y: Number(c[2]) });
  }
  return out;
}

/** Mirroring is an involution. Shared with `flowLayout` in spirit, restated
 *  here so neither module has to import the other. */
export const mirrorX = (x: number, w: number): number => w - x;

export const pct = (v: number, span: number): string => `${(v / span) * 100}%`;
