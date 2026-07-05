import type { ExpressionSpecification } from 'maplibre-gl';
import { LAYER_COLORS, type LayerType } from '@/hooks/useExploreMapData';

/**
 * Segmented donut cluster icons. Each cluster renders as a WebGL symbol whose
 * icon id encodes the cluster's quantized composition (venues / events /
 * restrooms / hotels). Icons are rasterized on demand in a `styleimagemissing`
 * handler — zero per-frame JS, no DOM markers, all existing cluster handlers
 * (click-to-zoom, spiderfy, hover preview) keep working because the layer id
 * doesn't change.
 *
 * Key format: `qg-donut|<diameterPx>|<qVenues>|<qEvents>|<qRestrooms>|<qHotels>`
 * where q* are shares quantized to tenths (a non-zero minority never rounds
 * to 0). Quantization bounds the distinct-image universe to a few dozen per
 * session.
 */

export const DONUT_PREFIX = 'qg-donut';
export const DONUT_LAYERS = ['venues', 'events', 'restrooms', 'hotels'] as const;
export type DonutLayer = (typeof DONUT_LAYERS)[number];

const QUANT = 10;
const PIXEL_RATIO = 2;
const CACHE_CAP = 256;

/** Cluster size buckets, aligned with the old circle radii (16/20/26/32/40). */
export const DONUT_SIZE_STEPS: [count: number, diameterPx: number][] = [
  [0, 32],
  [10, 40],
  [50, 52],
  [100, 64],
  [500, 80],
];

const COUNT_PROPS: Record<DonutLayer, string> = {
  venues: 'venue_count',
  events: 'event_count',
  restrooms: 'restroom_count',
  hotels: 'hotel_count',
};

/** Quantize one layer's share to tenths; a non-zero count never becomes 0. */
export function quantizeShare(count: number, total: number): number {
  if (count <= 0 || total <= 0) return 0;
  return Math.max(1, Math.round((QUANT * count) / total));
}

/** Data-driven `icon-image` expression producing a donut key per cluster. */
export function donutIconExpression(): ExpressionSpecification {
  const total: ExpressionSpecification = ['max', 1, ['get', 'point_count']];
  const q = (prop: string): ExpressionSpecification =>
    [
      'case',
      ['>', ['coalesce', ['get', prop], 0], 0],
      ['max', 1, ['round', ['*', QUANT, ['/', ['coalesce', ['get', prop], 0], total]]]],
      0,
    ] as ExpressionSpecification;
  const diameter: ExpressionSpecification = [
    'step',
    ['get', 'point_count'],
    ...DONUT_SIZE_STEPS.flatMap(([count, d], i) => (i === 0 ? [d] : [count, d])),
  ] as ExpressionSpecification;
  return [
    'concat',
    `${DONUT_PREFIX}|`,
    ['to-string', diameter],
    ...DONUT_LAYERS.flatMap((layer) => ['|', ['to-string', q(COUNT_PROPS[layer])]]),
  ] as ExpressionSpecification;
}

export interface DonutSpec {
  diameter: number;
  tenths: Record<DonutLayer, number>;
}

/** Parse an icon id back into a render spec. Returns null for foreign ids. */
export function parseDonutKey(id: string): DonutSpec | null {
  const parts = id.split('|');
  if (parts[0] !== DONUT_PREFIX || parts.length !== 2 + DONUT_LAYERS.length) return null;
  const nums = parts.slice(1).map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [diameter, v, e, r, h] = nums;
  if (diameter < 8 || diameter > 160) return null;
  return { diameter, tenths: { venues: v, events: e, restrooms: r, hotels: h } };
}

/** Normalized segment arcs (fractions of the full circle), fixed order. */
export function donutSegments(
  tenths: Record<DonutLayer, number>,
): { layer: DonutLayer; share: number }[] {
  const sum = DONUT_LAYERS.reduce((a, l) => a + (tenths[l] || 0), 0);
  if (sum <= 0) return [];
  return DONUT_LAYERS.filter((l) => (tenths[l] || 0) > 0).map((l) => ({
    layer: l,
    share: tenths[l] / sum,
  }));
}

/**
 * Synchronous canvas render — pure `arc()` calls, no image loading, safe to
 * run inside `styleimagemissing`. White base disc doubles as the halo and the
 * count-text background; segments run clockwise from 12 o'clock in a fixed
 * order so adjacent clusters read consistently.
 */
export function renderDonut(
  spec: DonutSpec,
  colors: Record<LayerType, string> = LAYER_COLORS,
): ImageData | null {
  const size = spec.diameter * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const c = size / 2;
  const rOuter = c - PIXEL_RATIO; // 1px logical inset so strokes don't clip
  const ring = Math.max(5, spec.diameter * 0.16) * PIXEL_RATIO;

  // Base disc — halo + count background (basemap is always the light flavor).
  ctx.beginPath();
  ctx.arc(c, c, rOuter, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const segments = donutSegments(spec.tenths);
  const rMid = rOuter - ring / 2;
  if (segments.length === 0) {
    // Unknown composition — full neutral ring so the donut never reads blank.
    ctx.beginPath();
    ctx.arc(c, c, rMid, 0, 2 * Math.PI);
    ctx.strokeStyle = 'hsl(0 0% 4%)';
    ctx.lineWidth = ring;
    ctx.stroke();
  } else {
    let a0 = -Math.PI / 2;
    for (const { layer, share } of segments) {
      const a1 = a0 + share * 2 * Math.PI;
      ctx.beginPath();
      // Tiny overdraw on single-segment donuts avoids a hairline seam.
      ctx.arc(c, c, rMid, a0, segments.length === 1 ? a0 + 2 * Math.PI : a1);
      ctx.strokeStyle = colors[layer] ?? 'hsl(0 0% 4%)';
      ctx.lineWidth = ring;
      ctx.stroke();
      a0 = a1;
    }
  }

  // Hairline outer edge so the white disc separates from pale basemap tiles.
  ctx.beginPath();
  ctx.arc(c, c, rOuter, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = PIXEL_RATIO;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

// Module-level cache — ImageData is shared across map instances.
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
