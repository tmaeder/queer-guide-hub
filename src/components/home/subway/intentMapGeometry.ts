import { INTENT_NAV, INTENT_TRACK, type IntentDestination } from '@/config/navigation';
import type { Track } from '@/components/transit/routeBulletMap';

/**
 * Geometry for the homepage intent map — the six intents as stations on the
 * four track lines, plus the interchange where all four meet.
 *
 * Pure data, no JSX, so the coordinates have exactly one home and the
 * "does this station lie on its line?" question is unit-testable without
 * rendering anything (see __tests__/intentMapGeometry.test.ts).
 *
 * THE INVARIANT THAT MAKES THIS WORK: every station coordinate is a cubic
 * bezier segment ENDPOINT — the `M` point or the final pair of a `C` segment.
 * A cubic passes exactly through P0 and P3 by definition, so "on the curve"
 * is a set-membership check, not a numeric tolerance. Move a station and you
 * must move the corresponding node, or the test fails.
 *
 * Geometry departs from the Front Page template's `TrackLines` drawing on
 * purpose, and restoring that drawing would reintroduce two defects:
 *   1. Yellow never actually reached the interchange (y≈176 at x=730 against
 *      a ring drawn at 167) — the four lines only appeared to converge.
 *   2. The lines ran too close together for a station to reach its label
 *      without the leader crossing a neighbouring track.
 */

/** The stage's coordinate space. Percentages below are derived from it. */
export const VIEWBOX = { w: 1440, h: 360 } as const;

/**
 * Every path starts at x=-40 and ends at x=1480 so the tracks bleed off both
 * edges of the stage instead of terminating inside it.
 *
 * The lines braid (pink and green cross around x≈390 and x≈600) so that at
 * each station's x its OWN track is the outermost line — that is what lets a
 * label sit above/below its station without a leader crossing another track.
 */
export const TRACK_PATHS: Record<Track, string> = {
  pink:
    'M -40 155 C -7 142 82 81 160 80 C 238 79 330 131 430 148 ' +
    'C 530 165 665 180 760 180 C 855 180 930 165 1000 148 ' +
    'C 1070 131 1100 80 1180 80 C 1260 80 1430 138 1480 150',
  green:
    'M -40 172 C 7 170 153 172 240 158 C 327 144 393 81 480 85 ' +
    'C 567 89 660 168 760 180 C 860 192 960 162 1080 160 ' +
    'C 1200 158 1413 167 1480 168',
  yellow:
    'M -40 200 C 17 202 167 213 300 210 C 433 207 647 168 760 180 ' +
    'C 873 192 900 275 980 280 C 1060 285 1157 225 1240 212 ' +
    'C 1323 199 1440 202 1480 200',
  blue:
    'M -40 218 C 20 228 220 275 320 280 C 420 285 487 267 560 250 ' +
    'C 633 233 685 184 760 180 C 835 176 922 208 1010 225 ' +
    'C 1098 242 1212 277 1290 280 C 1368 283 1448 251 1480 245',
};

/** Where a station's name plate hangs relative to the station itself. */
export type Lane = 'above' | 'below';

export interface Station {
  /** Intent id, or `interchange` for the point where all four lines meet. */
  id: string;
  to: string;
  /** The line this station sits on. The interchange sits on all four. */
  track: Track;
  x: number;
  y: number;
  lane: Lane;
  labelKey: string;
  labelFallback: string;
  subtitleKey: string;
  subtitleFallback: string;
  /** Absent on the interchange — it is a destination, not an intent. */
  intent?: IntentDestination;
}

/** Station coordinates, keyed by intent id. Ordered left to right below. */
const STATION_POINTS: Record<string, { x: number; y: number; lane: Lane }> = {
  'going-out': { x: 160, y: 80, lane: 'above' },
  travelling: { x: 320, y: 280, lane: 'below' },
  meet: { x: 480, y: 85, lane: 'above' },
  rights: { x: 980, y: 280, lane: 'below' },
  support: { x: 1180, y: 80, lane: 'above' },
  // Moved off the blue line's (1290, 280) when shop flipped to yellow — shop
  // is the one intent that maps 1:1 to a content type, so INTENT_TRACK has to
  // agree with ROUTE_BULLET_MAP, where marketplace is M-yellow. (1240, 212) is
  // yellow's remaining free endpoint (the final pair of `C 1157 225 1240 212`);
  // rights already holds (980, 280). It sits 60px from support in x but in the
  // opposite lane, so the two name plates cannot collide.
  shop: { x: 1240, y: 212, lane: 'below' },
};

/**
 * The interchange. Every track path passes through this exact point, which is
 * asserted in the geometry test — the convergence is real, not drawn.
 *
 * `.intersection-gradient` is reserved by the design system for "moments of
 * convergence"; four lines provably meeting at one point is that moment, and
 * this is its only call site.
 */
export const INTERCHANGE: Station = {
  id: 'interchange',
  to: '/search',
  track: 'pink',
  x: 760,
  y: 180,
  lane: 'above',
  labelKey: 'home.map.interchange.label',
  labelFallback: 'Search everything',
  subtitleKey: 'home.map.interchange.subtitle',
  subtitleFallback: 'Every line meets here',
};

/**
 * The seven stations in left-to-right order, which is also DOM order — so
 * focus order matches reading order (WCAG 1.3.2 / 2.4.3).
 *
 * Track assignment comes from INTENT_TRACK, never a local literal: the header,
 * the footer and this map must agree on which line an intent belongs to.
 */
export const STATIONS: Station[] = [
  ...INTENT_NAV.map((intent) => ({
    id: intent.id,
    to: intent.to,
    track: INTENT_TRACK[intent.id] ?? 'pink',
    ...STATION_POINTS[intent.id],
    labelKey: intent.labelKey,
    labelFallback: intent.fallback,
    subtitleKey: intent.subtitleKey,
    subtitleFallback: intent.subtitleFallback,
    intent,
  })),
  INTERCHANGE,
].sort((a, b) => a.x - b.x);

/**
 * A viewBox point as a percentage of the stage box.
 *
 * This is exact, not an approximation: an `<svg viewBox>` with the default
 * `preserveAspectRatio` and a viewport of the same aspect ratio maps the
 * viewBox onto its border box with a pure uniform scale and zero translation.
 * The stage wrapper takes its size from the SVG, so (x, y) lands at
 * (x/w, y/h) of the wrapper at every viewport width. Do not set
 * `preserveAspectRatio="none"` — it would break both this and the strokes.
 */
export const pct = (value: number, axis: 'x' | 'y'): string =>
  `${((value / (axis === 'x' ? VIEWBOX.w : VIEWBOX.h)) * 100).toFixed(4)}%`;
