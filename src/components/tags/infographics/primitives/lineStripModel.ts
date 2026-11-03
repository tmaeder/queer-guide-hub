/**
 * The data shape and selection rules behind `LineStrip`, kept free of React
 * so the rules are testable without rendering and figure data can import the
 * types without pulling in a component.
 */

import type { Track } from '../types';

export interface StripStop {
  id: string;
  labelKey: string;
  labelFallback: string;
  /** Glossary term this stop IS, if any. Drives the readout's chips. */
  slug?: string;
  /** On an `any` line: picking this clears the others, and vice versa. */
  exclusive?: boolean;
}

export interface StripLine {
  id: string;
  track: Track;
  select: 'one' | 'any';
  labelKey: string;
  labelFallback: string;
  /** What the line is asking, in one or two sentences. */
  questionKey: string;
  questionFallback: string;
  stops: readonly StripStop[];
}

export type Picks = Readonly<Record<string, readonly string[]>>;

/** Pure, so the selection rules are testable without rendering. */
export function nextPicks(picks: Picks, line: StripLine, stopId: string): Picks {
  const current = picks[line.id] ?? [];
  if (line.select === 'one') return { ...picks, [line.id]: [stopId] };

  const stop = line.stops.find((s) => s.id === stopId);
  if (!stop) return picks;
  if (current.includes(stopId)) {
    return { ...picks, [line.id]: current.filter((id) => id !== stopId) };
  }
  if (stop.exclusive) return { ...picks, [line.id]: [stopId] };
  const exclusive = new Set(line.stops.filter((s) => s.exclusive).map((s) => s.id));
  return { ...picks, [line.id]: [...current.filter((id) => !exclusive.has(id)), stopId] };
}
