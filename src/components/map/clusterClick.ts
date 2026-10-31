/**
 * What a click on a cluster should do.
 *
 * Clusters now merge on COLLISION (see CLUSTER_RADIUS / CLUSTER_MAX_ZOOM in
 * utils/mapViewport.ts) rather than disappearing at a fixed zoom, so a
 * cluster can be clicked at any zoom, and it means one of two things:
 *
 * - its places are spread out and simply too close to draw separately at
 *   this zoom → zoom to exactly their extent;
 * - its places sit on (nearly) the same spot, so no zoom will ever separate
 *   them → fan them out in place.
 *
 * The old rule zoomed half a level past `getClusterExpansionZoom`, which
 * lands wherever the first split happens rather than where the user can see
 * the contents, and it fanned out only when that zoom was >= 18 — a rule
 * written for the old cluster ceiling of z11.
 *
 * Pure, so the decision is unit-testable without a live map.
 */

export type LngLat = [number, number];
export type Bounds = [LngLat, LngLat];

/** Largest number of places fanned out in a ring. Beyond this a ring is
 *  unreadable; the remainder is the job of the results list. */
export const SPIDER_MAX = 24;

/** Degrees under which two coordinates count as the same spot (~1 m). */
const COLOCATED_EPS = 1e-5;

/** A fit that zooms in by less than this would not visibly separate anything. */
const MIN_USEFUL_ZOOM_GAIN = 0.5;

export function boundsOf(coords: LngLat[]): Bounds | null {
  if (coords.length === 0) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lng, lat] of coords) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  if (!Number.isFinite(w)) return null;
  return [
    [w, s],
    [e, n],
  ];
}

export function isColocated(b: Bounds): boolean {
  return b[1][0] - b[0][0] < COLOCATED_EPS && b[1][1] - b[0][1] < COLOCATED_EPS;
}

export type ClusterAction = { kind: 'spiderfy' } | { kind: 'fit'; bounds: Bounds; zoom: number };

/**
 * @param coords      every leaf of the clicked cluster
 * @param currentZoom the map's zoom at click time
 * @param fitZoom     the zoom `map.cameraForBounds(bounds, padding)` would use,
 *                    or null if it could not compute one
 * @param maxFitZoom  never zoom deeper than this to fit
 */
export function decideClusterAction(
  coords: LngLat[],
  currentZoom: number,
  fitZoom: number | null,
  maxFitZoom: number,
): ClusterAction {
  const b = boundsOf(coords);
  if (!b || isColocated(b)) return { kind: 'spiderfy' };
  if (fitZoom == null || !Number.isFinite(fitZoom)) return { kind: 'spiderfy' };
  const target = Math.min(fitZoom, maxFitZoom);
  // Fitting would barely move: the points are distinct but so close that the
  // deepest allowed zoom still can't draw them apart. Fan out instead of a
  // click that visibly does nothing.
  if (target - currentZoom < MIN_USEFUL_ZOOM_GAIN) return { kind: 'spiderfy' };
  return { kind: 'fit', bounds: b, zoom: target };
}
