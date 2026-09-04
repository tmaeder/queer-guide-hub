/**
 * Derived geometry for `FlowGraph`.
 *
 * Coordinates are COMPUTED from each node's `lane`/`slot`, never authored.
 * Hand-placed coordinates drift the moment a node is inserted, and the drift
 * is invisible — an edge that ends 3px short of its station still looks like a
 * diagram. Deriving them makes the contract testable instead:
 *
 *  1. **Every edge endpoint is exactly a node centre.** Not "within a
 *     tolerance" — the same point value. `intentMapGeometry.ts` arrived at
 *     this rule first; it turns "is this line actually connected?" into set
 *     membership, which a unit test can assert and a visual check cannot.
 *  2. **Every edge bends.** Hard rule #1 of the design system: illustrative
 *     transit lines are never straight. Two nodes stacked in the same column
 *     would otherwise emit a vertical rule, so those get a lateral kick.
 *  3. **RTL mirrors the geometry**, and mirroring twice is the identity.
 *
 * Lanes run top→bottom (the direction of the flow); slots run left→right
 * within a lane. Node boxes are HTML plates positioned by percentage over the
 * SVG, so this module deals only in centre points — same division of labour as
 * NetworkDiagram, and for the same reason (a `<circle>` in a non-uniformly
 * scaled viewBox renders as an ellipse).
 */

import type { RiskTier } from '../types';

export interface FlowNode {
  id: string;
  /**
   * `restriction` is a speed-restriction section rather than a signal: a
   * stretch of line you may cross, slowly, for a stated reason. It exists
   * because capacity is not a yes/no gate, and drawing it as one would be a
   * lie about how consent actually works.
   */
  kind: 'start' | 'question' | 'outcome' | 'stage' | 'restriction';
  labelKey: string;
  labelFallback: string;
  /** Row. Lower lanes come first in reading and focus order. */
  lane: number;
  /** Position within the lane, left to right. */
  slot: number;
  slug?: string;
  /** Outcomes only. Drives the risk wash; never set on a question. */
  tier?: RiskTier;
  /** Extra prose shown on the plate — the "why", where a bare label would
   *  read as an instruction. */
  noteKey?: string;
  noteFallback?: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  labelKey?: string;
  labelFallback?: string;
  /**
   * `loop` edges run backwards up the graph and are excluded from the acyclic
   * check. The consent figure needs exactly one: consent is revocable, so the
   * line returns to the check-in signal instead of terminating in a verdict.
   */
  kind?: 'forward' | 'loop';
}

export interface Point {
  x: number;
  y: number;
}

export interface PositionedNode extends FlowNode {
  center: Point;
}

export interface PositionedEdge extends FlowEdge {
  d: string;
  from_: Point;
  to_: Point;
  /** Midpoint of the curve, for the HTML label plate. */
  label: Point;
}

export interface FlowLayout {
  nodes: readonly PositionedNode[];
  edges: readonly PositionedEdge[];
  viewBox: { w: number; h: number };
}

export interface FlowLayoutOptions {
  viewBox: { w: number; h: number };
  /** Inset from the viewBox edge to the first/last lane and slot. */
  padX?: number;
  padY?: number;
  rtl?: boolean;
  /**
   * Give every lane the same number of columns, so a node at slot 1 sits at
   * the same x whatever else is on its row. A ladder graph — one spine with
   * terminals hanging off it — is unreadable without this, because a lane
   * holding only the spine would centre it while its neighbours pushed it to
   * an edge.
   */
  alignColumns?: boolean;
}

/** Mirroring is an involution: `mirrorX(mirrorX(x, w), w) === x`. */
export const mirrorX = (x: number, w: number): number => w - x;

/** Percentage helper, shared with the HTML plate layer. */
export const pct = (v: number, span: number): string => `${(v / span) * 100}%`;

/** Lateral kick for an edge whose endpoints share a column, so it still bends. */
const BEND_KICK = 26;

/** How far along the run the control points sit. */
const BEND_ALONG = 0.45;
const BEND_ACROSS = 0.35;

function round(n: number): number {
  // Two decimals is finer than any rendered pixel and keeps the endpoint
  // equality check exact — float noise from the slot division would otherwise
  // make `d`'s terminal pair differ from the node centre in the last digits.
  return Math.round(n * 100) / 100;
}

function laneY(lane: number, laneCount: number, h: number, padY: number): number {
  if (laneCount <= 1) return round(h / 2);
  return round(padY + (lane * (h - 2 * padY)) / (laneCount - 1));
}

function slotX(slot: number, slotCount: number, w: number, padX: number): number {
  if (slotCount <= 1) return round(w / 2);
  return round(padX + (slot * (w - 2 * padX)) / (slotCount - 1));
}

/**
 * Cubic from `a` to `b` that always bends. `index` only breaks the tie for
 * same-column edges, so the same graph always lays out the same way.
 */
function bend(a: Point, b: Point, index: number): { d: string; label: Point } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lateral = dx === 0 ? BEND_KICK * (index % 2 === 0 ? 1 : -1) : dx;

  const c1 = { x: round(a.x + lateral * BEND_ACROSS), y: round(a.y + dy * BEND_ALONG) };
  const c2 = { x: round(b.x - lateral * BEND_ACROSS), y: round(b.y - dy * BEND_ALONG) };

  // The terminal pair is `b` verbatim — that is the endpoint invariant, and
  // it is why the test can compare by set membership.
  const d = `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;

  // Cubic at t=0.5.
  const label = {
    x: round((a.x + 3 * c1.x + 3 * c2.x + b.x) / 8),
    y: round((a.y + 3 * c1.y + 3 * c2.y + b.y) / 8),
  };
  return { d, label };
}

/**
 * A `loop` edge arcs out to the side and back up, the way a map draws a
 * circle line rather than a spur. It deliberately does NOT retrace the
 * forward path.
 */
function loopBack(a: Point, b: Point, w: number): { d: string; label: Point } {
  // Bow towards whichever margin has more room, so the arc never crosses the
  // body of the graph.
  const towardsRight = (a.x + b.x) / 2 < w / 2;
  const reach = towardsRight ? w * 0.34 : -w * 0.34;
  const c1 = { x: round(a.x + reach), y: round(a.y) };
  const c2 = { x: round(b.x + reach), y: round(b.y) };
  const d = `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
  const label = {
    x: round((a.x + 3 * c1.x + 3 * c2.x + b.x) / 8),
    y: round((a.y + 3 * c1.y + 3 * c2.y + b.y) / 8),
  };
  return { d, label };
}

export function flowLayout(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  options: FlowLayoutOptions,
): FlowLayout {
  const { viewBox, padX = 90, padY = 26, rtl = false, alignColumns = false } = options;
  const { w, h } = viewBox;

  const laneCount = nodes.reduce((max, n) => Math.max(max, n.lane), 0) + 1;
  const globalSlots = nodes.reduce((max, n) => Math.max(max, n.slot), 0) + 1;
  const slotsPerLane = new Map<number, number>();
  for (const n of nodes) {
    slotsPerLane.set(n.lane, Math.max(slotsPerLane.get(n.lane) ?? 0, n.slot + 1));
  }

  const positioned: PositionedNode[] = nodes.map((n) => {
    const columns = alignColumns ? globalSlots : (slotsPerLane.get(n.lane) ?? 1);
    const rawX = slotX(n.slot, columns, w, padX);
    return {
      ...n,
      center: {
        x: rtl ? round(mirrorX(rawX, w)) : rawX,
        y: laneY(n.lane, laneCount, h, padY),
      },
    };
  });

  const byId = new Map(positioned.map((n) => [n.id, n]));

  const positionedEdges: PositionedEdge[] = edges.map((e, i) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) {
      throw new Error(`flowLayout: edge ${e.from}->${e.to} references a node that does not exist`);
    }
    const geo =
      e.kind === 'loop' ? loopBack(a.center, b.center, w) : bend(a.center, b.center, i);
    return { ...e, d: geo.d, from_: a.center, to_: b.center, label: geo.label };
  });

  return { nodes: positioned, edges: positionedEdges, viewBox };
}

/**
 * Reading and focus order: lane, then slot. DOM order must match this so
 * keyboard traversal follows the flow (WCAG 1.3.2 / 2.4.3). In RTL the slot
 * order reverses, because the geometry mirrored and a reader starting on the
 * right must meet the same node first.
 */
export function flowOrder(
  nodes: readonly PositionedNode[],
  rtl = false,
): readonly PositionedNode[] {
  return [...nodes].sort((a, b) => a.lane - b.lane || (rtl ? b.slot - a.slot : a.slot - b.slot));
}

/**
 * Every node and edge on a route from a `start` node to `targetId`.
 *
 * Reverse breadth-first over forward edges. This is the figure's one
 * interaction: selecting an outcome shows *how you get there*, which on a
 * consent diagram is the entire teaching point — the terminal states are
 * obvious, the route into them is not.
 *
 * `loop` edges are included only when both ends are already on the route, so
 * the revocation loop lights up without dragging unrelated branches in.
 */
export function ancestryOf(
  nodes: readonly { id: string }[],
  edges: readonly FlowEdge[],
  targetId: string | null,
): { nodes: ReadonlySet<string>; edges: ReadonlySet<string> } {
  if (!targetId || !nodes.some((n) => n.id === targetId)) {
    return { nodes: new Set(), edges: new Set() };
  }
  const forward = edges.filter((e) => e.kind !== 'loop');
  const keptNodes = new Set<string>([targetId]);
  const keptEdges = new Set<string>();

  const queue = [targetId];
  while (queue.length) {
    const current = queue.shift() as string;
    for (const e of forward) {
      if (e.to !== current) continue;
      keptEdges.add(edgeKey(e));
      if (!keptNodes.has(e.from)) {
        keptNodes.add(e.from);
        queue.push(e.from);
      }
    }
  }

  for (const e of edges) {
    if (e.kind === 'loop' && keptNodes.has(e.from) && keptNodes.has(e.to)) {
      keptEdges.add(edgeKey(e));
    }
  }

  return { nodes: keptNodes, edges: keptEdges };
}

/** Stable identity for an edge. Two edges may share a pair only if they carry
 *  different labels, so the label is part of the key. */
export const edgeKey = (e: FlowEdge): string => `${e.from}->${e.to}:${e.labelKey ?? ''}`;

/** Parses the `M x y` and terminal pair out of a cubic emitted above. Shared
 *  with the test so both read the path the same way. */
export function edgeEndpoints(d: string): { start: Point; end: Point } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 8) throw new Error(`edgeEndpoints: not a cubic path: ${d}`);
  return {
    start: { x: nums[0], y: nums[1] },
    end: { x: nums[nums.length - 2], y: nums[nums.length - 1] },
  };
}
