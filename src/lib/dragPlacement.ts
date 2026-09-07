import { Crown, ChevronUp, Minus, ChevronDown, AlertTriangle, X, UserRound } from 'lucide-react';

import type { DragOutcome } from '@/lib/dragOutcome';

/**
 * The locked palette for Drag Race per-episode placements.
 *
 * WHY THIS IS ALLOWED TO BE CHROMATIC
 *
 * The design system's rule is that colour never encodes state, and that track
 * colours in particular may never encode a state or a ranking. This is a
 * documented functional-scale exception of exactly the same kind as
 * `substanceRisk.ts` and the trip-safety traffic light in `useRiskVisual.ts`.
 *
 * The justification is specific, not "it looks nicer": the placement grid is
 * ~10,000 cells across ~70 seasons, and its entire purpose is that a reader
 * follows one queen's run across a row and spots the wins and the crash in one
 * pass. A six-step opacity ramp on a single ink cannot carry that — adjacent
 * steps at 15% apart are indistinguishable at the 18px cell size the grid needs
 * to fit a 16-episode season on a phone.
 *
 * THIS IS A RANKING SCALE, NOT A RISK SCALE, AND THE HUES SAY SO
 *
 * Nothing here means danger. `elim` is not `--destructive` and deliberately
 * sits off that hue: a queen going home is a story beat, not a safety warning,
 * and borrowing the alarm colour would cheapen the one token this product
 * reserves for real harm. The ordering blue → cyan → neutral → amber → orange →
 * rose mirrors the colour language the source progress tables themselves use,
 * so a reader who knows the format reads this grid without consulting a legend.
 *
 * Raw channel values live ONLY here, so the grid, the legend, the roster and the
 * personality panel cannot drift, and the ESLint colour ban allowlists this
 * single module rather than every surface — the same containment `substanceRisk`
 * and `useRiskVisual` use.
 *
 * COLOUR IS NEVER THE ONLY SIGNAL
 *
 * Every outcome carries a distinct `Icon`, a `label` and a short `code`, and
 * consumers render the glyph inside the cell plus an `sr-only` label. WCAG 1.4.1
 * is satisfied by construction: strip the colour and the grid still reads.
 *
 * THE INK BORDER IS LOAD-BEARING, NOT DECORATION
 *
 * These tints are deliberately quiet — a wall of saturated cells is unreadable —
 * so they do NOT clear 3:1 against paper and cannot satisfy WCAG 1.4.11 against
 * the page. They satisfy it against the ink border every filled cell carries,
 * the same border-gating rule the subway track colours follow. Never render one
 * of these fills without its border.
 *
 * `dragPlacement.test.ts` re-derives every contrast number below rather than
 * trusting this comment.
 */

export interface PlacementVisual {
  /** HSL channel triple — wrap in hsl() at the call site. */
  tint: string;
  /** Text/glyph colour for use ON `tint`. */
  ink: string;
  /** Two-to-four letter code rendered in the cell alongside the glyph. */
  code: string;
  label: string;
  /** One-line plain-English meaning, shown in the legend and on hover. */
  meaning: string;
  Icon: typeof Crown;
}

const VISUALS: Record<DragOutcome, PlacementVisual> = {
  win: {
    tint: '212 92% 88%',
    ink: '214 84% 26%',
    code: 'WIN',
    label: 'Won the challenge',
    meaning: 'Won the maxi challenge that week.',
    Icon: Crown,
  },
  high: {
    tint: '188 72% 87%',
    ink: '192 82% 22%',
    code: 'HIGH',
    label: 'High',
    meaning: 'Among the best that week, but did not take the win.',
    Icon: ChevronUp,
  },
  safe: {
    tint: '55 22% 90%',
    ink: '40 12% 24%',
    code: 'SAFE',
    label: 'Safe',
    meaning: 'Declared safe — not judged at either extreme.',
    Icon: Minus,
  },
  low: {
    tint: '42 94% 86%',
    ink: '30 88% 26%',
    code: 'LOW',
    label: 'Low',
    meaning: 'Among the weakest that week, but not up for elimination.',
    Icon: ChevronDown,
  },
  bottom: {
    tint: '28 92% 88%',
    ink: '18 78% 28%',
    code: 'BTM',
    label: 'Bottom',
    meaning: 'Up for elimination — lip synced for her life.',
    Icon: AlertTriangle,
  },
  elim: {
    // Rose, NOT red. Held ≥25 degrees off `--destructive` (hue 0) on purpose —
    // see the header. dragPlacement.test.ts asserts the distance.
    tint: '330 84% 91%',
    ink: '332 68% 30%',
    code: 'ELIM',
    label: 'Eliminated',
    meaning: 'Went home in this episode.',
    Icon: X,
  },
  guest: {
    tint: '276 38% 90%',
    ink: '278 44% 30%',
    code: 'GUEST',
    label: 'Guest',
    meaning: 'Present in the episode but not competing in it.',
    Icon: UserRound,
  },
};

/**
 * Render order for the legend: the ladder best-to-worst, then `guest`, which is
 * off the ladder entirely and is placed last so the legend reads as a ranking.
 */
export const PLACEMENT_ORDER: readonly DragOutcome[] = [
  'win',
  'high',
  'safe',
  'low',
  'bottom',
  'elim',
  'guest',
];

export function placementVisual(outcome: DragOutcome): PlacementVisual {
  return VISUALS[outcome];
}

export function isDragOutcome(value: string): value is DragOutcome {
  return value in VISUALS;
}
