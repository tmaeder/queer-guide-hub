import type { ExpressionSpecification } from 'maplibre-gl';
import { MAP_LINES, MAP_LINE_IDS, lineColor, type MapLine } from '@/components/map/mapDomain';
import { ink } from '@/lib/mapTokens';

/**
 * Segmented donut cluster icons. Each cluster renders as a WebGL symbol whose
 * icon id encodes the cluster's quantized composition by LINE (M / E / C / T).
 * Icons are rasterized on demand in the missing-image handler — zero per-frame
 * JS, no DOM markers, all existing cluster handlers (click-to-zoom, spiderfy,
 * hover preview) keep working because the layer id doesn't change.
 *
 * Key format: `qg-donut|<diameterPx>|<qM>|<qE>|<qC>|<qT>`
 * where q* are shares quantized to tenths (a non-zero minority never rounds
 * to 0). Quantization bounds the distinct-image universe to a few dozen per
 * session.
 */

export const DONUT_PREFIX = 'qg-donut';

/**
 * Donut segments are LINES, not layers.
 *
 * The key SHAPE is unchanged — prefix, diameter, four quantized shares — so
 * `DONUT_SIZE_STEPS`, `quantizeShare`, the length check in `parseDonutKey` and
 * the module cache all carry over untouched. A stale cached image from before
 * the switch therefore still parses and still renders the same colour it did
 * (an all-venues donut and an all-M donut are both four-segment keys with the
 * first share at 10, and M borrows the venue track), so there is no
 * invalidation to do.
 */
export const DONUT_LINES = MAP_LINE_IDS;
export type DonutLine = MapLine;

const QUANT = 10;
const PIXEL_RATIO = 2;
const CACHE_CAP = 256;

/**
 * Cluster size buckets (diameter in px), roughly logarithmic in the count.
 *
 * The floor is set by the PIN, not the count: pins are 26-34px
 * (usePointLayers), and a 28px cluster read as just another pin. 36px keeps
 * the smallest cluster visibly a different kind of mark. Growth is log-like so
 * a 500-place cluster is not a disc that buries the city around it: each step
 * up is a 5x jump in count but only ~6-8px in diameter.
 */
export const DONUT_SIZE_STEPS: [count: number, diameterPx: number][] = [
  [0, 36],
  [10, 42],
  [50, 50],
  [100, 56],
  [500, 64],
];

/** The cluster aggregate names, read from the registry so the donut, the
 *  `clusterProperties` that produce them and the hover breakdown cannot
 *  disagree — they were three separate literal lists. */
const countProp = (line: DonutLine): string => MAP_LINES[line].countProp;

/** Quantize one layer's share to tenths; a non-zero count never becomes 0. */
export function quantizeShare(count: number, total: number): number {
  if (count <= 0 || total <= 0) return 0;
  return Math.max(1, Math.round((QUANT * count) / total));
}

/**
 * How many PLACES a cluster holds. Since co-located places are collapsed into
 * one feature (pointStacks.ts), `point_count` counts spots, not places; the
 * `places` aggregate sums each spot's `stack_count`. Falls back to
 * `point_count` for a source built without it.
 */
export function placesExpr(): ExpressionSpecification {
  return ['coalesce', ['get', 'places'], ['get', 'point_count']] as ExpressionSpecification;
}

/** Share (0..1) at or above which one line colours the whole cluster disc. */
export const DOMINANT_SHARE = 0.8;

/** True when one line makes up at least DOMINANT_SHARE of the cluster. Used
 *  for the count's text colour, which must match the disc it sits on. */
export function dominantLineExpression(): ExpressionSpecification {
  const total: ExpressionSpecification = ['max', 1, placesExpr()];
  return [
    'any',
    ...DONUT_LINES.map((line) => [
      '>=',
      ['/', ['coalesce', ['get', countProp(line)], 0], total],
      DOMINANT_SHARE,
    ]),
  ] as ExpressionSpecification;
}

/** The line that fills the disc, or null for a mixed cluster (ink disc). */
export function dominantLine(tenths: Record<DonutLine, number>): DonutLine | null {
  const sum = DONUT_LINES.reduce((a, l) => a + (tenths[l] || 0), 0);
  if (sum <= 0) return null;
  for (const l of DONUT_LINES) if ((tenths[l] || 0) / sum >= DOMINANT_SHARE) return l;
  return null;
}

/** Data-driven `icon-image` expression producing a donut key per cluster. */
export function donutIconExpression(): ExpressionSpecification {
  const total: ExpressionSpecification = ['max', 1, placesExpr()];
  const q = (prop: string): ExpressionSpecification =>
    [
      'case',
      ['>', ['coalesce', ['get', prop], 0], 0],
      ['max', 1, ['round', ['*', QUANT, ['/', ['coalesce', ['get', prop], 0], total]]]],
      0,
    ] as ExpressionSpecification;
  const diameter: ExpressionSpecification = [
    'step',
    placesExpr(),
    ...DONUT_SIZE_STEPS.flatMap(([count, d], i) => (i === 0 ? [d] : [count, d])),
  ] as ExpressionSpecification;
  return [
    'concat',
    `${DONUT_PREFIX}|`,
    ['to-string', diameter],
    ...DONUT_LINES.flatMap((line) => ['|', ['to-string', q(countProp(line))]]),
  ] as ExpressionSpecification;
}

export interface DonutSpec {
  diameter: number;
  tenths: Record<DonutLine, number>;
}

/** Parse an icon id back into a render spec. Returns null for foreign ids. */
export function parseDonutKey(id: string): DonutSpec | null {
  const parts = id.split('|');
  if (parts[0] !== DONUT_PREFIX || parts.length !== 2 + DONUT_LINES.length) return null;
  const nums = parts.slice(1).map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [diameter, ...shares] = nums;
  if (diameter < 8 || diameter > 160) return null;
  // Positional, in `DONUT_LINES` order — the same order `donutIconExpression`
  // emits and `donutSegments` draws, so the three cannot drift.
  const tenths = Object.fromEntries(DONUT_LINES.map((l, i) => [l, shares[i]])) as Record<
    DonutLine,
    number
  >;
  return { diameter, tenths };
}

/** Normalized segment arcs (fractions of the full circle), fixed order. */
export function donutSegments(
  tenths: Record<DonutLine, number>,
): { line: DonutLine; share: number }[] {
  const sum = DONUT_LINES.reduce((a, l) => a + (tenths[l] || 0), 0);
  if (sum <= 0) return [];
  return DONUT_LINES.filter((l) => (tenths[l] || 0) > 0).map((l) => ({
    line: l,
    share: tenths[l] / sum,
  }));
}

/**
 * Synchronous canvas render — pure `arc()` calls, no image loading, safe to
 * run inside the missing-image resolver.
 *
 * A solid disc inside an ink edge: track-coloured when one line dominates,
 * ink when the cluster is mixed. The ink edge is not decoration — three of the
 * four tracks sit under 3:1 against paper (blue 2.25, green 1.64, yellow 1.34)
 * and only clear the WCAG 1.4.11 bar against ink, so a track-coloured mark on
 * this map is *required* to carry one.
 */
export function renderDonut(
  spec: DonutSpec,
  colorOf: (line: DonutLine) => string = lineColor,
): ImageData | null {
  const size = spec.diameter * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // The ink border, 1.5px logical to match the pin outline (usePointLayers).
  const edge = 1.5 * PIXEL_RATIO;
  const c = size / 2;
  const rOuter = c - edge / 2; // inset by half the stroke so it can't clip
  const inkColor = ink();

  // A PLAIN disc, not segmented: a cluster is a count, and ring segments
  // read as a chart nobody can decode at 40px. One line making up at least
  // DOMINANT_SHARE of the cluster fills it in that line's track colour (ink
  // count on top); a mixed cluster is an ink disc (paper count).
  const line = dominantLine(spec.tenths);
  ctx.beginPath();
  ctx.arc(c, c, rOuter, 0, 2 * Math.PI);
  ctx.fillStyle = line ? (colorOf(line) ?? inkColor) : inkColor;
  ctx.fill();

  // Ink edge — the border-gate for a track fill (blue/green/yellow sit under
  // 3:1 against paper and only clear WCAG 1.4.11 against ink).
  ctx.lineWidth = edge;
  ctx.strokeStyle = inkColor;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

// Module-level cache — ImageData is shared across map instances. Keyed by
// composition only, so a live `/admin/design` token change won't repaint
// already-rendered donuts until the next page load. Acceptable: publishing
// branding is a deliberate act followed by a reload, not a hot path.
const donutCache = new Map<string, ImageData>();

/** Resolve an icon id to ImageData (cached). Null for non-donut ids. */
export function getDonutImage(id: string): ImageData | null {
  const hit = donutCache.get(id);
  if (hit) return hit;
  const spec = parseDonutKey(id);
  if (!spec) return null;
  const img = renderDonut(spec);
  if (!img) return null;
  if (donutCache.size >= CACHE_CAP) {
    const oldest = donutCache.keys().next().value;
    if (oldest !== undefined) donutCache.delete(oldest);
  }
  donutCache.set(id, img);
  return img;
}

export const DONUT_PIXEL_RATIO = PIXEL_RATIO;
