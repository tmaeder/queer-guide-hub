import { describe, it, expect } from 'vitest';
import { autoLayout, NODE_HEIGHT } from '../autoLayout';
import type { BaseNodeType } from '../../types';
import type { Edge } from '@xyflow/react';

const node = (id: string): BaseNodeType => ({ id, type: 'baseNode', position: { x: 0, y: 0 }, data: {} });
const edge = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

describe('autoLayout', () => {
  it('returns nodes array for empty input', () => {
    expect(autoLayout([], [])).toEqual([]);
  });

  it('returns positions for single node', () => {
    const out = autoLayout([node('a')], []);
    expect(Array.isArray(out)).toBe(true);
    expect(out.length).toBe(1);
  });

  it('lays out a diamond DAG in topological columns', () => {
    // a → b, a → c, b → d, c → d
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
    const out = autoLayout(nodes, edges);
    const pos = new Map(out.map(n => [n.id, n.position]));
    expect(pos.get('b')!.x).toBe(pos.get('c')!.x); // b and c share a column
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x);
    expect(pos.get('d')!.x).toBeGreaterThan(pos.get('b')!.x);
    expect(pos.get('b')!.y).not.toBe(pos.get('c')!.y); // no overlap within the column
  });

  it('leaves no vertical overlap within a column', () => {
    // one source fanning out to five children in the same column
    const nodes = [node('src'), ...['a', 'b', 'c', 'd', 'e'].map(node)];
    const edges = ['a', 'b', 'c', 'd', 'e'].map(t => edge('src', t));
    const out = autoLayout(nodes, edges);
    const columnYs = out.filter(n => n.id !== 'src').map(n => n.position.y).sort((x, y) => x - y);
    for (let i = 1; i < columnYs.length; i++) {
      expect(columnYs[i] - columnYs[i - 1]).toBeGreaterThanOrEqual(NODE_HEIGHT);
    }
  });

  it('is deterministic — same input yields identical output', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d')];
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
    expect(autoLayout(nodes, edges)).toEqual(autoLayout(nodes, edges));
  });

  it('terminates on cyclic input and positions every node', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b'), edge('b', 'a')];
    const out = autoLayout(nodes, edges);
    expect(out.length).toBe(2);
    for (const n of out) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });

  it('centerColumns: false pins short columns to the top', () => {
    // column 0 has one node, column 1 has three — without centering, all columns share ROOT_Y
    const nodes = [node('src'), node('a'), node('b'), node('c')];
    const edges = [edge('src', 'a'), edge('src', 'b'), edge('src', 'c')];
    const centered = autoLayout(nodes, edges, { centerColumns: true });
    const flat = autoLayout(nodes, edges, { centerColumns: false });
    const srcCentered = centered.find(n => n.id === 'src')!.position.y;
    const srcFlat = flat.find(n => n.id === 'src')!.position.y;
    expect(srcCentered).toBeGreaterThan(srcFlat);
    const minFlatY = Math.min(...flat.map(n => n.position.y));
    expect(flat.find(n => n.id === 'src')!.position.y).toBe(minFlatY);
  });

  it('honours hGap/nodeWidth overrides for column pitch', () => {
    const nodes = [node('a'), node('b')];
    const edges = [edge('a', 'b')];
    const narrow = autoLayout(nodes, edges, { hGap: 10, nodeWidth: 100 });
    const wide = autoLayout(nodes, edges, { hGap: 400, nodeWidth: 300 });
    const pitch = (out: typeof narrow) =>
      out.find(n => n.id === 'b')!.position.x - out.find(n => n.id === 'a')!.position.x;
    expect(pitch(narrow)).toBe(110);
    expect(pitch(wide)).toBe(700);
  });
});
