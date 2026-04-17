import type { Node, Edge } from '@xyflow/react';

// Tuned for readable flows: wider horizontal spacing for clean edge curves,
// generous vertical spacing so labels don't overlap crossing edges.
const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;
const H_GAP = 180;   // column-to-column spacing (horizontal)
const V_GAP = 70;    // row-to-row spacing within a column
const ROOT_X = 80;
const ROOT_Y = 80;
const BARYCENTER_PASSES = 24; // up/down sweeps to minimize crossings

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  hGap?: number;
  vGap?: number;
  // Center columns vertically so short columns align with the middle of taller columns
  centerColumns?: boolean;
}

/**
 * Topological level-based auto-layout with multi-pass barycenter crossing
 * minimization and vertical centering.
 *
 * Phases:
 *  1. Level assignment (longest path from a source)
 *  2. Initial ordering by insertion / parent-avg
 *  3. Multi-pass barycenter sweeps (down then up) — each pass reorders a column
 *     based on the average position of its neighbors on the adjacent column.
 *     Many passes converge to a local minimum of edge crossings.
 *  4. Gap inflation for dense columns (columns with many fan-in/fan-out get extra V_GAP)
 *  5. Vertical centering so all columns align around a common midline
 */
export function autoLayout(nodes: Node[], edges: Edge[], opts: LayoutOptions = {}): Node[] {
  if (nodes.length === 0) return nodes;

  const nodeWidth  = opts.nodeWidth  ?? NODE_WIDTH;
  const nodeHeight = opts.nodeHeight ?? NODE_HEIGHT;
  const hGap       = opts.hGap       ?? H_GAP;
  const vGap       = opts.vGap       ?? V_GAP;
  const centerCols = opts.centerColumns ?? true;

  const parents  = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const n of nodes) { parents.set(n.id, []); children.set(n.id, []); }
  for (const e of edges) {
    if (!parents.has(e.target) || !children.has(e.source)) continue;
    parents.get(e.target)!.push(e.source);
    children.get(e.source)!.push(e.target);
  }

  // 1. Level assignment via longest path from a source (memoized DFS with cycle guard)
  const level = new Map<string, number>();
  const stack = new Set<string>();
  const visit = (id: string): number => {
    if (level.has(id)) return level.get(id)!;
    if (stack.has(id)) return 0; // cycle — treat as source
    stack.add(id);
    const p = parents.get(id) || [];
    const lvl = p.length === 0 ? 0 : Math.max(...p.map(visit)) + 1;
    stack.delete(id);
    level.set(id, lvl);
    return lvl;
  };
  for (const n of nodes) visit(n.id);

  // Group ids by level
  const byLevel = new Map<number, string[]>();
  for (const [id, lvl] of level) {
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(id);
  }
  const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);

  // Order map: index within column (0..n-1)
  const order = new Map<string, number>();

  // 2. Initial ordering — sources sorted by id, subsequent columns by avg parent position
  for (const lvl of sortedLevels) {
    const ids = byLevel.get(lvl)!;
    if (lvl === 0) {
      ids.sort();
    } else {
      ids.sort((a, b) => {
        const pa = (parents.get(a) || []).map(p => order.get(p) ?? 0);
        const pb = (parents.get(b) || []).map(p => order.get(p) ?? 0);
        const ba = pa.length ? pa.reduce((s, v) => s + v, 0) / pa.length : 0;
        const bb = pb.length ? pb.reduce((s, v) => s + v, 0) / pb.length : 0;
        return ba - bb;
      });
    }
    ids.forEach((id, i) => order.set(id, i));
  }

  // 3. Multi-pass barycenter sweeps (down then up) to minimize crossings
  const barycenter = (id: string, neighbors: string[]) => {
    const positions = neighbors.map(n => order.get(n) ?? 0);
    if (positions.length === 0) return order.get(id) ?? 0;
    return positions.reduce((s, v) => s + v, 0) / positions.length;
  };

  for (let pass = 0; pass < BARYCENTER_PASSES; pass++) {
    const downPass = pass % 2 === 0;

    if (downPass) {
      // Order children by parent barycenter (top-down sweep)
      for (let i = 1; i < sortedLevels.length; i++) {
        const ids = byLevel.get(sortedLevels[i])!;
        const scored = ids.map(id => ({ id, b: barycenter(id, parents.get(id) || []) }));
        scored.sort((a, b) => a.b - b.b);
        scored.forEach((s, idx) => order.set(s.id, idx));
      }
    } else {
      // Order parents by children barycenter (bottom-up sweep)
      for (let i = sortedLevels.length - 2; i >= 0; i--) {
        const ids = byLevel.get(sortedLevels[i])!;
        const scored = ids.map(id => ({ id, b: barycenter(id, children.get(id) || []) }));
        scored.sort((a, b) => a.b - b.b);
        scored.forEach((s, idx) => order.set(s.id, idx));
      }
    }
  }

  // 4. Density-aware vertical gap: inflate gap in columns where nodes have many
  // fan-in/fan-out so edges have room to breathe
  const columnVGap = new Map<number, number>();
  for (const lvl of sortedLevels) {
    const ids = byLevel.get(lvl)!;
    const avgDegree = ids.length === 0 ? 0 : ids.reduce((s, id) =>
      s + (parents.get(id)?.length || 0) + (children.get(id)?.length || 0), 0) / ids.length;
    // 1 extra V_GAP unit per average degree above 2 (max +60%)
    const scale = Math.min(1.6, 1 + Math.max(0, avgDegree - 2) * 0.2);
    columnVGap.set(lvl, vGap * scale);
  }

  // 5. Vertical centering — find max column height, center each column around the midline
  const heights = new Map<number, number>();
  let maxHeight = 0;
  for (const lvl of sortedLevels) {
    const ids = byLevel.get(lvl)!;
    const g = columnVGap.get(lvl)!;
    const h = ids.length * nodeHeight + (ids.length - 1) * g;
    heights.set(lvl, h);
    if (h > maxHeight) maxHeight = h;
  }

  return nodes.map(n => {
    const lvl = level.get(n.id) || 0;
    const idx = order.get(n.id) || 0;
    const g = columnVGap.get(lvl) || vGap;
    const colHeight = heights.get(lvl) || 0;
    const yOffset = centerCols ? (maxHeight - colHeight) / 2 : 0;
    return {
      ...n,
      position: {
        x: ROOT_X + lvl * (nodeWidth + hGap),
        y: ROOT_Y + yOffset + idx * (nodeHeight + g),
      },
    };
  });
}
