import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 220;
const NODE_HEIGHT = 90;
const H_GAP = 80;
const V_GAP = 40;

/**
 * Topological level-based auto-layout. Places nodes in columns based on their
 * longest path from a source. Nodes with no incoming edges go to column 0.
 * Orders within a column to minimize edge crossings (by weighted barycenter).
 */
export function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;

  const inDegree = new Map<string, number>();
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    parents.set(n.id, []);
    children.set(n.id, []);
  }

  for (const e of edges) {
    if (!inDegree.has(e.target) || !inDegree.has(e.source)) continue;
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    parents.get(e.target)?.push(e.source);
    children.get(e.source)?.push(e.target);
  }

  // Level assignment: longest path from a source
  const level = new Map<string, number>();
  const visit = (id: string): number => {
    if (level.has(id)) return level.get(id)!;
    const p = parents.get(id) || [];
    if (p.length === 0) { level.set(id, 0); return 0; }
    const lvl = Math.max(...p.map(visit)) + 1;
    level.set(id, lvl);
    return lvl;
  };
  for (const n of nodes) visit(n.id);

  // Group by level
  const byLevel = new Map<number, string[]>();
  for (const [id, lvl] of level) {
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push(id);
  }

  // Order within each level by barycenter of parents (reduces edge crossings)
  const orderInLevel = new Map<string, number>();
  const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
  for (const lvl of sortedLevels) {
    const ids = byLevel.get(lvl)!;
    if (lvl === 0) {
      ids.sort();
    } else {
      ids.sort((a, b) => {
        const pa = (parents.get(a) || []).map(p => orderInLevel.get(p) ?? 0);
        const pb = (parents.get(b) || []).map(p => orderInLevel.get(p) ?? 0);
        const ba = pa.length ? pa.reduce((s, v) => s + v, 0) / pa.length : 0;
        const bb = pb.length ? pb.reduce((s, v) => s + v, 0) / pb.length : 0;
        return ba - bb;
      });
    }
    ids.forEach((id, i) => orderInLevel.set(id, i));
  }

  // Assign positions
  return nodes.map(n => {
    const lvl = level.get(n.id) || 0;
    const idx = orderInLevel.get(n.id) || 0;
    return {
      ...n,
      position: {
        x: 50 + lvl * (NODE_WIDTH + H_GAP),
        y: 50 + idx * (NODE_HEIGHT + V_GAP),
      },
    };
  });
}
