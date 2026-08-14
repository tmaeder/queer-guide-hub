/**
 * Shared bending-line geometry: a run of stations drawn as one cubic chain,
 * sliced into per-station sub-paths.
 *
 * Extracted from `src/components/milestones/eraLineGeometry.ts`, which is now a
 * thin binding of this module to the /history dimensions. The generalisation
 * was forced by the /trips/discover line generator, which needs the same three
 * invariants at a different scale and at a station count that changes with the
 * user's pace pick.
 *
 * Three invariants, all asserted in the tests (this module's own, and the
 * milestones one that still exercises it through the old entry points):
 *
 *  1. **Every station is a cubic ENDPOINT.** A cubic bezier passes exactly
 *     through P0 and P3 by definition, so "is this station on the line?" is set
 *     membership rather than a numeric tolerance. That distinction is not
 *     pedantry — `intentMapGeometry.ts` records the failure it prevents, where
 *     a hand-authored diagram's yellow line stopped at y≈176 against a ring
 *     drawn at 167 and the four lines only *appeared* to converge.
 *  2. **The line bends everywhere.** Hard rule #1 of the design system. Nodes
 *     alternate station / crest / station / crest…, and consecutive nodes never
 *     share the cross-axis value, so no segment can degenerate into a straight
 *     run — there is no `L`, `H` or `V` command in any output, lead-in and
 *     run-out included.
 *  3. **Station `i` owns `crest[i-1] → station[i] → crest[i]`, and consecutive
 *     sub-paths share their crest coordinates EXACTLY.** That is what lets each
 *     segment carry its own stroke or its own animation delay with the handoff
 *     landing on a shared point rather than a seam.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface BendingLine {
  viewBox: string;
  w: number;
  h: number;
  /** One point per station, in order. Always a cubic endpoint in `segments[i]`. */
  stations: Pt[];
  /** One `d` per station. `segments[i]` ends exactly where `segments[i + 1]` begins. */
  segments: string[];
}

/** Horizontal band: stations march along x, crests swing above and below `mid`. */
export interface HorizontalOpts {
  view: { w: number; h: number };
  /** Cross-axis centre line the stations sit on. */
  mid: number;
  /** How far the crests swing off `mid`. See the amplitude note below. */
  crest: number;
}

/** Vertical rail: stations march down y in fixed-height rows. */
export interface VerticalOpts {
  /** Height of one station's row, in user units. */
  row: number;
  /** Width of the rail's gutter, in user units. */
  gutter: number;
  mid: number;
  crest: number;
}

/**
 * AMPLITUDE IS NOT A FREE PARAMETER when the SVG stretches.
 *
 * `HistoryLine` measured this: a 300x44 viewBox stretched to 1440px flattens
 * vertical variation about 5x, so a crest of 3-4 units renders as a straight
 * rule with dots on it. Under `preserveAspectRatio="none"` the bend you get in
 * device pixels is `(crest / view.h) * renderedHeight`, so pick `crest` as a
 * FRACTION of the box and check it against the height you actually render at.
 * Both presets below sit around 30% of their box for that reason.
 */

/**
 * Coordinates are rounded AT CONSTRUCTION, not at serialization.
 *
 * `stations` is consumed twice — the SVG draws through it and the HTML plate is
 * parked on it via `pct()`. If the path string rounded while `stations` kept
 * full precision the two would disagree (at n=9 the station is x=55.5555… but
 * the path says 55.56) and invariant 1 would degrade from set membership to
 * "within a tolerance", which is exactly the property this module exists to
 * guarantee.
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

/** Build the station/crest node list, then slice it into per-station sub-paths. */
function build(stations: Pt[], crests: Pt[], axis: 'x' | 'y'): string[] {
  // crests.length === stations.length + 1 — one before the first station and
  // one after the last, so the line bleeds off both ends of its box.
  return stations.map((s, i) => chain([crests[i], s, crests[i + 1]], axis));
}

/**
 * Horizontal band, for the `lg`-and-up layout.
 *
 * The band stretches to whatever width the container is, so the SVG runs
 * `preserveAspectRatio="none"` and the paths carry
 * `vector-effect="non-scaling-stroke"` — otherwise a 1400px-wide line would
 * also be proportionally tall, and the horizontal stretch would fatten the
 * stroke.
 */
export function horizontalLine(n: number, o: HorizontalOpts): BendingLine {
  const { w, h } = o.view;
  const step = w / n;
  const stations: Pt[] = Array.from({ length: n }, (_, i) => pt(step * (i + 0.5), o.mid));
  const crests: Pt[] = Array.from({ length: n + 1 }, (_, i) =>
    // Crest i sits halfway between station i-1 and station i; the two end
    // crests land on the box edge so the line has no visible tip.
    pt(step * i, i % 2 === 0 ? o.mid - o.crest : o.mid + o.crest),
  );
  return { viewBox: `0 0 ${w} ${h}`, w, h, stations, segments: build(stations, crests, 'x') };
}

/**
 * Vertical rail, for below `lg`.
 *
 * Fixed gutter, one fixed-height row per station. User units equal CSS px and
 * the width is fixed, so this one needs no aspect-ratio escape hatch at all —
 * nothing stretches, so nothing deforms. That is why this line can bend where
 * IntentMap's vertical rail had to fall back to a straight bar.
 *
 * The 1:1 unit mapping is load-bearing in the other direction too: the HTML
 * ring column is sized in CSS px to `row` x `gutter`, so if those two numbers
 * ever stop matching the CSS, the rings drift off the path.
 */
export function verticalLine(n: number, o: VerticalOpts): BendingLine {
  const w = o.gutter;
  const h = o.row * n;
  const stations: Pt[] = Array.from({ length: n }, (_, i) => pt(o.mid, o.row * (i + 0.5)));
  const crests: Pt[] = Array.from({ length: n + 1 }, (_, i) =>
    pt(i % 2 === 0 ? o.mid + o.crest : o.mid - o.crest, o.row * i),
  );
  return { viewBox: `0 0 ${w} ${h}`, w, h, stations, segments: build(stations, crests, 'y') };
}

/** Exact percentage for parking an HTML plate on an SVG coordinate. */
export const pct = (v: number, span: number): string => `${((v / span) * 100).toFixed(4)}%`;

/* ── Presets ─────────────────────────────────────────────────────────────── */

/**
 * The desktop plate box, and the band height it FORCES.
 *
 * These three numbers are one equation, not three choices. Stations sit on the
 * band's mid-line; an "above" plate hangs `GAP` above it and a "below" plate
 * `GAP` below, so the band must be `2 * (PLATE_H + GAP)` or the outer plates
 * overflow the section and collide with the next band.
 *
 * This was a magic 420px picked against an assumed ~180px plate. Measured in a
 * browser, real plates run 201-217px — a legality line, a village name and an
 * event line are each conditional — so the top plates hung 15-31px above the
 * band and were clipped. Hence a FIXED plate height with the content clipped to
 * it, rather than a min-height that content can push past: the geometry has to
 * be able to trust this number.
 */
// Measured against the WORST case, not the typical one: ordinal row, city name,
// country, two clamped lines of prose, the counts row, a village name, the
// legality line AND an upcoming event. At 228 that case overflowed its own box
// by 15px and the event line was clipped.
export const ROUTE_PLATE_H = 256;
export const ROUTE_PLATE_GAP = 56;
export const ROUTE_BAND_H = (ROUTE_PLATE_H + ROUTE_PLATE_GAP) * 2;

/** /history era line, horizontal. */
export const ERA_H: HorizontalOpts = { view: { w: 1000, h: 200 }, mid: 100, crest: 62 };
/** /history era line, vertical. */
export const ERA_V: VerticalOpts = { row: 56, gutter: 40, mid: 20, crest: 18 };

/**
 * Filter lines (the /trips/discover picker), horizontal.
 *
 * A shallow band: the crest is 8 of 44, about 18%, because this line sits under
 * a row of labels and a deeper swing would collide with them. It is drawn at a
 * fixed 44px height rather than stretched vertically, so 18% survives.
 */
export const PICKER_H: HorizontalOpts = { view: { w: 300, h: 44 }, mid: 22, crest: 8 };

/**
 * /trips/discover generated route, horizontal.
 *
 * THE CREST IS BOUNDED BY THE PLATE CORRIDOR, which is why it is far shallower
 * than the era line's. Plates alternate above and below the mid-line, so the
 * only band of clear space the track has to itself is the `2 * ROUTE_PLATE_GAP`
 * corridor between the two rows. Set the crest deeper than that and the line's
 * peaks pass BEHIND the plates: measured at crest 62, the swing was +/-168
 * device px against a 48px corridor, and the track read as disconnected blue
 * fragments between boxes rather than as one line.
 *
 * 15 of 200 is 7.5%: at the 624px band that is +/-47 device px inside a 56px
 * half-corridor, measured as ~9px of clearance to the plate edge at every width
 * from 1024 to 1920 (the clearance is width-invariant because the band height
 * is fixed). 17 left only 3px, which is inside antialiasing range. If the plate
 * height or the gap changes, this number has to move with them.
 */
export const ROUTE_H: HorizontalOpts = { view: { w: 1000, h: 200 }, mid: 100, crest: 15 };

/**
 * /trips/discover generated route, vertical.
 *
 * `row` MUST equal the rendered height of one stacked plate, because the SVG
 * puts station `i` at `row * (i + 0.5)` while the HTML ring sits in a column of
 * that same height. They are two descriptions of one number.
 *
 * It was 192, guessed from a `min-h-[176px]` plus a stack gap. Measured at
 * 390px the real plates were 222-243px — a village name and an event line are
 * each conditional — so the rail was ~300px shorter than its own plate stack
 * and every ring below the first drifted further off the line than the last.
 * Hence `ROUTE_PLATE_H` on both breakpoints: the plate is a fixed box that
 * content clips into, on mobile as well as desktop.
 */
export const ROUTE_V: VerticalOpts = { row: ROUTE_PLATE_H, gutter: 40, mid: 20, crest: 18 };

