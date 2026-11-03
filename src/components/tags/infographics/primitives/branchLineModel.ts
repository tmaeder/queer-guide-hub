/**
 * The data shape and route rules behind `BranchLine`, kept free of React so
 * the rules are testable without rendering and figure data can import the
 * types without pulling in a component.
 *
 * A branch line is ONE main line, read top to bottom, whose stations are in
 * order. A question station may carry an off-ramp: a short branch to a buffer
 * stop, which is where that answer ends. The main line may finish in a loop
 * back to an earlier station.
 *
 * This shape replaces a free-form node/edge graph with lanes and slots. The
 * graph could express anything, which is how the consent figure ended up with
 * lines entering boxes at odd angles and a dashed loop cutting through a box.
 * A ladder — one spine, terminals hanging off it — is all the figure ever was,
 * so the type now says so.
 */

import type { RiskTier } from '../types';

interface Labelled {
  id: string;
  labelKey: string;
  labelFallback: string;
  noteKey?: string;
  noteFallback?: string;
  /** Glossary term this stop IS, if any. */
  slug?: string;
}

/** Where an off-ramp ends. Always an outcome, always a buffer stop. */
export interface BranchEnd extends Labelled {
  tier: RiskTier;
}

export interface MainStation extends Labelled {
  /**
   * `restriction` is a speed restriction: a section you pass through slowly,
   * drawn as cross-ties on the line rather than as a yes/no signal.
   */
  kind: 'start' | 'question' | 'restriction' | 'outcome';
  /** Only on `outcome`: the locked risk tier its plate carries. */
  tier?: RiskTier;
  /** A question's off-ramp: the answer that ends the line. */
  branch?: {
    labelKey: string;
    labelFallback: string;
    to: BranchEnd;
  };
  /** The answer that keeps you on the main line, written on the line. */
  continueLabelKey?: string;
  continueLabelFallback?: string;
}

export interface LoopBack {
  /** Main station the loop leaves from. */
  from: string;
  /** Earlier main station it returns to. */
  to: string;
  labelKey: string;
  labelFallback: string;
}

/** Every stop in reading order: each main station, then its off-ramp end. */
export interface FlatStop {
  id: string;
  kind: MainStation['kind'];
  labelFallback: string;
  noteFallback?: string;
}

export function flatStops(stations: readonly MainStation[]): FlatStop[] {
  return stations.flatMap((s) => {
    const own: FlatStop = {
      id: s.id,
      kind: s.kind,
      labelFallback: s.labelFallback,
      noteFallback: s.noteFallback,
    };
    if (!s.branch) return [own];
    const end = s.branch.to;
    return [
      own,
      {
        id: end.id,
        kind: 'outcome',
        labelFallback: end.labelFallback,
        noteFallback: end.noteFallback,
      },
    ];
  });
}

/** "Answer → stop" for every way out of a stop, in reading order. Empty for a
 *  buffer stop. */
export function exitsOf(
  stations: readonly MainStation[],
  loop: LoopBack | undefined,
  id: string,
): { labelFallback?: string; to: string }[] {
  const i = stations.findIndex((s) => s.id === id);
  if (i < 0) return [];
  const s = stations[i];
  const out: { labelFallback?: string; to: string }[] = [];
  if (s.branch) out.push({ labelFallback: s.branch.labelFallback, to: s.branch.to.labelFallback });
  const next = stations[i + 1];
  if (next) out.push({ labelFallback: s.continueLabelFallback, to: next.labelFallback });
  if (loop && loop.from === s.id) {
    const back = stations.find((x) => x.id === loop.to);
    if (back) out.push({ labelFallback: loop.labelFallback, to: back.labelFallback });
  }
  return out;
}

/**
 * The route from the first station to `targetId`, as the set of stop ids on
 * it. A main station is reached through every main station above it; an
 * off-ramp end through the main line down to its question, then the branch.
 * The loop is never part of a route: it is where you go AFTER arriving.
 */
export function routeTo(stations: readonly MainStation[], targetId: string | null): Set<string> {
  if (!targetId) return new Set();
  const main = stations.findIndex((s) => s.id === targetId);
  if (main >= 0) return new Set(stations.slice(0, main + 1).map((s) => s.id));
  const parent = stations.findIndex((s) => s.branch?.to.id === targetId);
  if (parent < 0) return new Set();
  return new Set([...stations.slice(0, parent + 1).map((s) => s.id), targetId]);
}
