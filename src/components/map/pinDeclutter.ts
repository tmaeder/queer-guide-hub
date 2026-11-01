/**
 * Which pins draw full-size and which shrink to a dot.
 *
 * Above the cluster range every place is its own pin, so dense streets would
 * draw pins on top of each other. Instead pins are placed greedily by
 * priority (featured, live, bigger stack, then a stable id order): a pin that
 * would overlap one already placed is drawn COMPACT, a small dot that still
 * marks the place and is still clickable. Zooming in spreads the places out
 * and more of them become full pins. Nothing is ever merged or hidden.
 *
 * Pure: screen positions in, the set of compact ids out. The caller projects
 * and applies the result as feature-state, so no data reload is needed.
 */

export interface DeclutterPoint {
  id: string;
  x: number;
  y: number;
  /** Full-pin radius in px, including its outline. */
  r: number;
  /** Higher places first. */
  priority: number;
}

/** Pixels kept clear between two full pins. */
export const PIN_GAP = 2;

export function declutterPins(points: DeclutterPoint[], gap = PIN_GAP): Set<string> {
  const compact = new Set<string>();
  if (points.length < 2) return compact;
  const sorted = [...points].sort(
    (a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const maxR = sorted.reduce((m, p) => Math.max(m, p.r), 0);
  const cell = Math.max(1, 2 * maxR + gap);
  const grid = new Map<string, DeclutterPoint[]>();
  const cellKey = (cx: number, cy: number) => `${cx},${cy}`;

  for (const p of sorted) {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++) {
      for (let dy = -1; dy <= 1 && !hit; dy++) {
        for (const q of grid.get(cellKey(cx + dx, cy + dy)) ?? []) {
          if (Math.hypot(p.x - q.x, p.y - q.y) < p.r + q.r + gap) {
            hit = true;
            break;
          }
        }
      }
    }
    if (hit) {
      compact.add(p.id);
      continue;
    }
    const k = cellKey(cx, cy);
    const bucket = grid.get(k);
    if (bucket) bucket.push(p);
    else grid.set(k, [p]);
  }
  return compact;
}

/** Full-pin radius at a zoom, outline included. Mirrors the unclustered
 *  layer's `circle-radius` (13→15, featured 15→17 over z11→z16) plus the
 *  1.5px stroke MapLibre draws outside the radius. */
export function pinRadiusAt(zoom: number, featured: boolean): number {
  const t = Math.min(1, Math.max(0, (zoom - 11) / 5));
  const base = featured ? 15 + 2 * t : 13 + 2 * t;
  // A featured pin also wears the interchange ring (+3px).
  return base + 1.5 + (featured ? 3 : 0);
}

/** Placement priority: featured > live > bigger stack. */
export function pinPriority(featured: boolean, live: boolean, stackCount: number): number {
  return (featured ? 1000 : 0) + (live ? 100 : 0) + Math.min(99, stackCount);
}
