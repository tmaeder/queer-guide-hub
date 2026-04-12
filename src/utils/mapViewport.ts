/**
 * Viewport utilities for map element loading.
 * Provides zoom bucket classification, bbox quantization, filter hashing,
 * and an LRU cache for viewport-based queries.
 */

// ── Zoom Buckets ──────────────────────────────────────────────────────────────
// Tuned for Protomaps basemap (z0-15 MVT tiles). Adjust if zoom scale changes.

/** Continent / country overview — show clusters only */
export const Z_LOW = 8;
/** Regional / metro — hybrid (cluster density-dependent) */
export const Z_MID = 12;
/** City-level — show all individual elements */
export const Z_CITY = 12;
/** MapLibre clusterMaxZoom: clusters disappear at this zoom + 1 */
export const CLUSTER_MAX_ZOOM = 11;
/** Cluster merge radius in pixels */
export const CLUSTER_RADIUS = 60;

export type ZoomBucket = 'low' | 'mid' | 'city';

export function getZoomBucket(zoom: number): ZoomBucket {
  if (zoom < Z_LOW) return 'low';
  if (zoom < Z_CITY) return 'mid';
  return 'city';
}

// ── Bbox Utilities ────────────────────────────────────────────────────────────

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Clamp bbox to valid geographic ranges (lat: -90..90, lng: -180..180).
 * Guards against invalid bounds from MapLibre during init or on certain devices.
 */
export function clampBbox(bbox: Bbox): Bbox {
  return {
    west: Math.max(-180, Math.min(180, bbox.west)),
    south: Math.max(-90, Math.min(90, bbox.south)),
    east: Math.max(-180, Math.min(180, bbox.east)),
    north: Math.max(-90, Math.min(90, bbox.north)),
  };
}

/**
 * Expand a bbox by a relative padding factor (e.g. 0.15 = 15%).
 * Helps reduce refetch on small pans.
 */
export function padBbox(bbox: Bbox, padding = 0.15): Bbox {
  const lngSpan = bbox.east - bbox.west;
  const latSpan = bbox.north - bbox.south;
  return {
    west: bbox.west - lngSpan * padding,
    south: bbox.south - latSpan * padding,
    east: bbox.east + lngSpan * padding,
    north: bbox.north + latSpan * padding,
  };
}

/**
 * Quantize bbox to a grid so small pans reuse cache keys.
 * Resolution adapts to zoom bucket:
 *   low (continent): round to 5 degrees
 *   mid (regional):  round to 1 degree
 *   city (detail):   round to 0.1 degree (~11km)
 */
export function quantizeBbox(bbox: Bbox, bucket: ZoomBucket): Bbox {
  const step = bucket === 'low' ? 5 : bucket === 'mid' ? 1 : 0.1;
  return clampBbox({
    west: Math.floor(bbox.west / step) * step,
    south: Math.floor(bbox.south / step) * step,
    east: Math.ceil(bbox.east / step) * step,
    north: Math.ceil(bbox.north / step) * step,
  });
}

/**
 * Serialize a bbox to a short cache-friendly string.
 */
export function bboxKey(bbox: Bbox): string {
  return `${bbox.west.toFixed(2)},${bbox.south.toFixed(2)},${bbox.east.toFixed(2)},${bbox.north.toFixed(2)}`;
}

// ── Filters Hash ──────────────────────────────────────────────────────────────

/**
 * Produce a deterministic string key from an arbitrary filters object.
 * Keys are sorted to ensure stable hashing.
 */
export function filtersHash(filters: Record<string, unknown>): string {
  const sorted = Object.keys(filters)
    .filter((k) => filters[k] !== undefined && filters[k] !== null && filters[k] !== '')
    .sort();
  if (sorted.length === 0) return '_';
  return sorted.map((k) => `${k}:${JSON.stringify(filters[k])}`).join('|');
}

// ── LRU Cache ─────────────────────────────────────────────────────────────────

export class LRUCache<V> {
  private map = new Map<string, V>();
  constructor(private maxSize: number = 32) {}

  get(key: string): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      // Evict oldest (first entry)
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/**
 * Returns true if a bbox has values within valid geographic ranges
 * and the bounds are properly ordered (south < north, west < east).
 */
export function isBboxValid(bbox: Bbox): boolean {
  return (
    bbox.south >= -90 &&
    bbox.north <= 90 &&
    bbox.west >= -180 &&
    bbox.east <= 180 &&
    bbox.south < bbox.north &&
    bbox.west < bbox.east
  );
}

// ── Debounce ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the new bbox has moved significantly outside the old one,
 * meaning a refetch is needed. Avoids refetch for small pans within padding.
 */
export function bboxExceedsPadded(current: Bbox, padded: Bbox): boolean {
  return (
    current.west < padded.west ||
    current.south < padded.south ||
    current.east > padded.east ||
    current.north > padded.north
  );
}
