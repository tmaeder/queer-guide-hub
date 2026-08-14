import type { HistoryEra } from '@/config/historyEras';
import {
  ERA_H,
  ERA_V,
  horizontalLine as bendHorizontal,
  verticalLine as bendVertical,
  type BendingLine,
} from '@/components/transit/lineGeometry';

/**
 * Geometry for the /history era line — the ten curated eras drawn as ten
 * stations on the pink line.
 *
 * The maths moved to `@/components/transit/lineGeometry` when /trips/discover
 * needed the same bending chain at a station count that changes with the user's
 * pace pick. What stays here is what is genuinely about /history: the box
 * dimensions, and `eraStroke`.
 *
 * The one-argument signatures below are kept deliberately. `eraLineGeometry`'s
 * own test suite is the safety net for that extraction — it asserts all three
 * invariants over n=2..10 through THESE entry points — so it has to keep
 * compiling against them unchanged, or the refactor loses the thing that proves
 * it did not change behaviour.
 */

export type { Pt } from '@/components/transit/lineGeometry';
export { pct } from '@/components/transit/lineGeometry';

/** @deprecated Prefer `BendingLine` from `@/components/transit/lineGeometry`. */
export type EraLine = BendingLine;

export const H_VIEW = ERA_H.view;
export const V_ROW = ERA_V.row;
export const V_GUTTER = ERA_V.gutter;

export function horizontalLine(n: number): EraLine {
  return bendHorizontal(n, ERA_H);
}

export function verticalLine(n: number): EraLine {
  return bendVertical(n, ERA_V);
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
