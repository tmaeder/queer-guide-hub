import { describe, it, expect } from 'vitest';
import {
  ancestryOf,
  edgeEndpoints,
  edgeKey,
  flowLayout,
  flowOrder,
  mirrorX,
  type FlowEdge,
  type FlowNode,
} from '../flowLayout';
import { NODES, EDGES, VIEW, PAD } from '../../figures/consentFlow/data';

const VB = { w: 300, h: 300 };

const simpleNodes: FlowNode[] = [
  { id: 'a', kind: 'start', lane: 0, slot: 1, labelKey: 'a', labelFallback: 'A' },
  { id: 'b', kind: 'question', lane: 1, slot: 1, labelKey: 'b', labelFallback: 'B' },
  { id: 'c', kind: 'outcome', lane: 2, slot: 0, labelKey: 'c', labelFallback: 'C' },
  { id: 'd', kind: 'outcome', lane: 2, slot: 2, labelKey: 'd', labelFallback: 'D' },
];
const simpleEdges: FlowEdge[] = [
  { from: 'a', to: 'b' },
  { from: 'b', to: 'c', labelKey: 'no', labelFallback: 'No' },
  { from: 'b', to: 'd', labelKey: 'yes', labelFallback: 'Yes' },
];

describe('flowLayout — the endpoint invariant', () => {
  /**
   * The whole reason geometry is derived rather than authored. An edge that
   * ends three units short of its station still LOOKS like a diagram, so a
   * visual check cannot catch it. Comparing by set membership can.
   */
  it('ends every edge exactly on a node centre — not within a tolerance', () => {
    const layout = flowLayout(NODES, EDGES, {
      viewBox: VIEW,
      padX: PAD.x,
      padY: PAD.y,
      alignColumns: true,
    });
    const centres = new Set(layout.nodes.map((n) => `${n.center.x},${n.center.y}`));

    for (const edge of layout.edges) {
      const { start, end } = edgeEndpoints(edge.d);
      expect(centres).toContain(`${start.x},${start.y}`);
      expect(centres).toContain(`${end.x},${end.y}`);
    }
  });

  it('starts and ends each edge at the centres of the nodes it names', () => {
    const layout = flowLayout(simpleNodes, simpleEdges, { viewBox: VB });
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    for (const edge of layout.edges) {
      const { start, end } = edgeEndpoints(edge.d);
      expect(start).toEqual(byId.get(edge.from)!.center);
      expect(end).toEqual(byId.get(edge.to)!.center);
    }
  });

  it('bends every edge — no straight segment, even in a single column', () => {
    // Hard rule #1 of the design system. Two stacked nodes are the case that
    // would otherwise emit a vertical rule.
    const stacked: FlowNode[] = [
      { id: 'x', kind: 'start', lane: 0, slot: 0, labelKey: 'x', labelFallback: 'X' },
      { id: 'y', kind: 'outcome', lane: 1, slot: 0, labelKey: 'y', labelFallback: 'Y' },
    ];
    const layout = flowLayout(stacked, [{ from: 'x', to: 'y' }], { viewBox: VB });
    const d = layout.edges[0].d;
    const nums = d.match(/-?[\d.]+/g)!.map(Number);
    const [sx, , c1x, , c2x] = nums;
    // At least one control point leaves the column.
    expect(c1x !== sx || c2x !== sx).toBe(true);
  });

  it('throws on an edge naming a node that does not exist', () => {
    expect(() => flowLayout(simpleNodes, [{ from: 'a', to: 'nope' }], { viewBox: VB })).toThrow(
      /does not exist/,
    );
  });
});

describe('flowLayout — layout', () => {
  it('never places two nodes at the same point', () => {
    const layout = flowLayout(NODES, EDGES, {
      viewBox: VIEW,
      padX: PAD.x,
      padY: PAD.y,
      alignColumns: true,
    });
    const seen = new Set(layout.nodes.map((n) => `${n.center.x},${n.center.y}`));
    expect(seen.size).toBe(layout.nodes.length);
  });

  it('keeps every node inside the viewBox', () => {
    const layout = flowLayout(NODES, EDGES, {
      viewBox: VIEW,
      padX: PAD.x,
      padY: PAD.y,
      alignColumns: true,
    });
    for (const n of layout.nodes) {
      expect(n.center.x).toBeGreaterThanOrEqual(0);
      expect(n.center.x).toBeLessThanOrEqual(VIEW.w);
      expect(n.center.y).toBeGreaterThanOrEqual(0);
      expect(n.center.y).toBeLessThanOrEqual(VIEW.h);
    }
  });

  it('runs lanes strictly downward', () => {
    const layout = flowLayout(NODES, EDGES, {
      viewBox: VIEW,
      padX: PAD.x,
      padY: PAD.y,
      alignColumns: true,
    });
    const yByLane = new Map<number, number>();
    for (const n of layout.nodes) yByLane.set(n.lane, n.center.y);
    const lanes = [...yByLane.keys()].sort((a, b) => a - b);
    for (let i = 1; i < lanes.length; i += 1) {
      expect(yByLane.get(lanes[i])!).toBeGreaterThan(yByLane.get(lanes[i - 1])!);
    }
  });

  it('alignColumns gives the same x to the same slot on every lane', () => {
    const layout = flowLayout(NODES, EDGES, {
      viewBox: VIEW,
      padX: PAD.x,
      padY: PAD.y,
      alignColumns: true,
    });
    const xBySlot = new Map<number, number>();
    for (const n of layout.nodes) {
      const known = xBySlot.get(n.slot);
      if (known === undefined) xBySlot.set(n.slot, n.center.x);
      else expect(n.center.x).toBe(known);
    }
    // Distinct slots must occupy distinct columns.
    expect(new Set(xBySlot.values()).size).toBe(xBySlot.size);
  });

  it('without alignColumns, different slots collide in one column', () => {
    // The negative control, and the reason the option exists. Per-lane
    // spreading sizes each row independently, so a lane holding slots {0,1}
    // pushes the spine to the right margin — landing it on top of the column
    // a three-slot lane uses for slot 2. A test that only asserted the
    // aligned case would pass on a build where `alignColumns` did nothing.
    const spread = flowLayout(NODES, EDGES, { viewBox: VIEW, padX: PAD.x, padY: PAD.y });
    const xOfSlot = (slot: number) =>
      new Set(spread.nodes.filter((n) => n.slot === slot).map((n) => n.center.x));
    const collisions = [...xOfSlot(1)].filter((x) => xOfSlot(2).has(x));
    expect(collisions.length).toBeGreaterThan(0);
  });
});

describe('flowLayout — RTL', () => {
  it('mirrorX is an involution', () => {
    for (const x of [0, 1, 42.5, 150, 299, 300]) {
      expect(mirrorX(mirrorX(x, 300), 300)).toBeCloseTo(x, 10);
    }
  });

  it('mirrors node centres and keeps the endpoint invariant', () => {
    const ltr = flowLayout(NODES, EDGES, {
      viewBox: VIEW,
      padX: PAD.x,
      padY: PAD.y,
      alignColumns: true,
    });
    const rtl = flowLayout(NODES, EDGES, {
      viewBox: VIEW,
      padX: PAD.x,
      padY: PAD.y,
      alignColumns: true,
      rtl: true,
    });

    const ltrById = new Map(ltr.nodes.map((n) => [n.id, n]));
    for (const n of rtl.nodes) {
      expect(n.center.x).toBeCloseTo(mirrorX(ltrById.get(n.id)!.center.x, VIEW.w), 6);
      expect(n.center.y).toBe(ltrById.get(n.id)!.center.y);
    }

    const centres = new Set(rtl.nodes.map((n) => `${n.center.x},${n.center.y}`));
    for (const edge of rtl.edges) {
      const { start, end } = edgeEndpoints(edge.d);
      expect(centres).toContain(`${start.x},${start.y}`);
      expect(centres).toContain(`${end.x},${end.y}`);
    }
  });

  it('reverses slot order so a right-to-left reader meets the same node first', () => {
    const layout = flowLayout(NODES, EDGES, { viewBox: VIEW, alignColumns: true });
    const ltr = flowOrder(layout.nodes, false).map((n) => n.id);
    const rtl = flowOrder(layout.nodes, true).map((n) => n.id);
    // Same lanes, opposite within-lane direction.
    expect(new Set(ltr)).toEqual(new Set(rtl));
    expect(ltr).not.toEqual(rtl);
  });
});

describe('flowOrder — reading and focus order', () => {
  it('sorts by lane, then slot, so DOM order follows the flow', () => {
    const layout = flowLayout(NODES, EDGES, { viewBox: VIEW, alignColumns: true });
    const ordered = flowOrder(layout.nodes);
    for (let i = 1; i < ordered.length; i += 1) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      expect(prev.lane < cur.lane || (prev.lane === cur.lane && prev.slot < cur.slot)).toBe(true);
    }
  });
});

describe('ancestryOf — the route that reaches a stop', () => {
  it('is empty with nothing selected', () => {
    expect(ancestryOf(NODES, EDGES, null).nodes.size).toBe(0);
    expect(ancestryOf(NODES, EDGES, 'not-a-node').nodes.size).toBe(0);
  });

  it('collects every node on a route from the start to the target', () => {
    const lit = ancestryOf(NODES, EDGES, 'go');
    // Reaching "clear to proceed" requires having asked, got a clear yes,
    // passed the capacity restriction, and checked in.
    for (const id of ['start', 'asked', 'clear-yes', 'capacity', 'checkin', 'go']) {
      expect(lit.nodes).toContain(id);
    }
  });

  it('excludes branches that cannot reach the target', () => {
    const lit = ancestryOf(NODES, EDGES, 'go');
    expect(lit.nodes).not.toContain('not-asked');
    expect(lit.nodes).not.toContain('not-a-yes');
    expect(lit.nodes).not.toContain('stop-now');
  });

  it('includes a loop edge only when both its ends are already on the route', () => {
    const loop = EDGES.find((e) => e.kind === 'loop')!;
    // `go` is on the route to itself and so is `checkin`, so the revocation
    // loop lights up.
    expect(ancestryOf(NODES, EDGES, 'go').edges).toContain(edgeKey(loop));
    // `not-asked` reaches neither end of the loop.
    expect(ancestryOf(NODES, EDGES, 'not-asked').edges).not.toContain(edgeKey(loop));
  });

  it('does not traverse a loop edge backwards to invent an ancestor', () => {
    // `checkin` is reachable through the spine only. If the loop were treated
    // as an ordinary edge, `go` would appear to be one of its ancestors.
    const lit = ancestryOf(NODES, EDGES, 'checkin');
    expect(lit.nodes).not.toContain('go');
  });
});

describe('the consent figure specifically', () => {
  it('is acyclic once the revocation loop is set aside', () => {
    const forward = EDGES.filter((e) => e.kind !== 'loop');
    const laneOf = new Map(NODES.map((n) => [n.id, n.lane]));
    for (const e of forward) {
      expect(laneOf.get(e.to)!).toBeGreaterThan(laneOf.get(e.from)!);
    }
  });

  it('has exactly one loop, and it returns to the check-in signal', () => {
    const loops = EDGES.filter((e) => e.kind === 'loop');
    expect(loops).toHaveLength(1);
    // The correction the whole figure exists to make: it does not terminate
    // in approval.
    expect(loops[0].to).toBe('checkin');
  });

  it('gives every terminal outcome a risk tier, and no question one', () => {
    for (const n of NODES) {
      if (n.kind === 'outcome') expect(n.tier).toBeDefined();
      else expect(n.tier).toBeUndefined();
    }
  });

  it('never lets a node be both an outcome and have outgoing forward edges', () => {
    const forward = EDGES.filter((e) => e.kind !== 'loop');
    for (const n of NODES.filter((x) => x.kind === 'outcome')) {
      expect(forward.some((e) => e.from === n.id)).toBe(false);
    }
  });
});
