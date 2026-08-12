import type { HistoryEra } from '@/config/historyEras';

/**
 * Geometry for the /history era line — the ten curated eras drawn as ten
 * stations on the pink line.
 *
 * Kept out of the component for the same reason
 * `src/components/home/subway/intentMapGeometry.ts` is: "is this station
 * actually on the line?" becomes a unit-testable question instead of a visual
 * one, and the coordinates have exactly one home.
 *
 * Three invariants, all asserted in the test:
 *
 *  1. **Every station is a cubic ENDPOINT.** A cubic bezier passes exactly
 *     through P0 and P3 by definition, so a station sitting on the line is set
 *     membership rather than a numeric tolerance.
 *  2. **The line bends everywhere.** Hard rule #1 of the design system. Nodes
 *     alternate station / crest / station / crest…, and consecutive nodes never
 *     share the cross-axis value, so no segment can degenerate into a straight
 *     run — there is no `L`, `H` or `V` command in any output.
 *  3. **Era `i` owns the sub-path `crest[i-1] → station[i] → crest[i]`, and
 *     consecutive sub-paths share their crest coordinates EXACTLY.** That is
 *     what lets each era carry its own stroke colour (see `eraStroke`) with the
 *     pink→ink handoff landing on a shared point rather than a seam.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface EraLine {
  viewBox: string;
  w: number;
  h: number;
  /** One point per era, in order. Always a cubic endpoint in `segments[i]`. */
  stations: Pt[];
  /** One `d` per era. `segments[i]` ends exactly where `segments[i + 1]` begins. */
  segments: string[];
}

/**
 * Coordinates are rounded AT CONSTRUCTION, not at serialization.
 *
 * `stations` is consumed twice — the SVG draws through it and the HTML plate is
 * parked on it via `pct()`. If the path string rounded while `stations` kept
 * full precision, the two would disagree (at n=9 the station is x=55.5555… but
 * the path says 55.56) and invariant 1 would degrade from set membership to
 * "within a tolerance", which is exactly the property this module exists to
 * guarantee. Caught by the test on its first run.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;
const pt = (x: number, y: number): Pt => ({ x: r2(x), y: r2(y) });

/**
 * Smooth cubic chain through `pts` with the tangent at every node held parallel
 * to `axis`. Each listed point is an endpoint, so joints are C1 and every
 * segment is a real curve as long as consecutive points differ on the other
 * axis — which the station/crest alternation guarantees.
 */
function chain(pts: Pt[], axis: 'x' | 'y'): string {
  let d = `M ${r2(pts[0].x)} ${r2(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p = pts[i];
    const q = pts[i + 1];
    const c1 =
      axis === 'x' ? { x: p.x + (q.x - p.x) / 3, y: p.y } : { x: p.x, y: p.y + (q.y - p.y) / 3 };
    const c2 =
      axis === 'x' ? { x: q.x - (q.x - p.x) / 3, y: q.y } : { x: q.x, y: q.y - (q.y - p.y) / 3 };
    d += ` C ${r2(c1.x)} ${r2(c1.y)}, ${r2(c2.x)} ${r2(c2.y)}, ${r2(q.x)} ${r2(q.y)}`;
  }
  return d;
}

/** Build the station/crest node list, then slice it into per-era sub-paths. */
function build(stations: Pt[], crests: Pt[], axis: 'x' | 'y'): string[] {
  // crests.length === stations.length + 1 — one before the first station and
  // one after the last, so the line bleeds off both ends of its box.
  return stations.map((s, i) => chain([crests[i], s, crests[i + 1]], axis));
}

/* ── Horizontal (lg and up) ──────────────────────────────────────────────
   The band stretches to whatever width the container is, so the SVG runs
   `preserveAspectRatio="none"` and the paths carry
   `vector-effect="non-scaling-stroke"` — otherwise a 1400px-wide line would
   also be proportionally tall, and the horizontal stretch would fatten the
   stroke. Technique borrowed from the personalities EraLine. */
export const H_VIEW = { w: 1000, h: 200 } as const;
const H_MID = 100;
const H_CREST = 62;

export function horizontalLine(n: number): EraLine {
  const { w, h } = H_VIEW;
  const step = w / n;
  const stations: Pt[] = Array.from({ length: n }, (_, i) => pt(step * (i + 0.5), H_MID));
  const crests: Pt[] = Array.from({ length: n + 1 }, (_, i) =>
    // Crest i sits halfway between station i-1 and station i; the two end
    // crests land on the box edge so the line has no visible tip.
    pt(step * i, i % 2 === 0 ? H_MID - H_CREST : H_MID + H_CREST),
  );
  return { viewBox: `0 0 ${w} ${h}`, w, h, stations, segments: build(stations, crests, 'x') };
}

/* ── Vertical (below lg) ─────────────────────────────────────────────────
   Fixed 40px gutter, one 56px row per era. User units equal CSS px and the
   width is fixed, so this one needs no aspect-ratio escape hatch at all —
   nothing stretches, so nothing deforms. That is why this line can bend where
   IntentMap's vertical rail had to fall back to a straight bar. */
export const V_ROW = 56;
export const V_GUTTER = 40;
const V_MID = 20;
const V_CREST = 18;

export function verticalLine(n: number): EraLine {
  const w = V_GUTTER;
  const h = V_ROW * n;
  const stations: Pt[] = Array.from({ length: n }, (_, i) => pt(V_MID, V_ROW * (i + 0.5)));
  const crests: Pt[] = Array.from({ length: n + 1 }, (_, i) =>
    pt(i % 2 === 0 ? V_MID + V_CREST : V_MID - V_CREST, V_ROW * i),
  );
  return { viewBox: `0 0 ${w} ${h}`, w, h, stations, segments: build(stations, crests, 'y') };
}

/**
 * The one place in the codebase that knows the line goes dark.
 *
 * /history is the pink line (milestone = M/pink in routeBulletMap), but across
 * the four `restrained` eras — pre-1800, 1800–1867, 1933–45, 1982–95 — it
 * renders in ink instead. This is a REMOVAL of decoration across persecution
 * chapters, not a colour-coding of risk: the design system forbids track
 * colours from encoding a state, and ink is the absence of a track, not
 * another one. Impact is encoded separately and monochromatically by
 * MilestoneImpactMarker.
 */
export const eraStroke = (era: HistoryEra): string =>
  era.restrained ? 'hsl(var(--foreground))' : 'hsl(var(--track-pink))';

/** Exact percentage for parking an HTML plate on an SVG coordinate. */
export const pct = (v: number, span: number): string => `${((v / span) * 100).toFixed(4)}%`;
