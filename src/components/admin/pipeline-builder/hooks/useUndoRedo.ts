import { useCallback, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

interface UndoRedoOpts {
  maxHistory?: number;
  debounceMs?: number;
}

/**
 * Undo/redo stack for canvas state. Debounces snapshots to avoid stacking every
 * micro-change (e.g. each drag pixel). Commits to history on drag-end, edge
 * connect, node add/remove, config edit.
 */
export function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: (n: Node[]) => void,
  setEdges: (e: Edge[]) => void,
  { maxHistory = 50, debounceMs = 300 }: UndoRedoOpts = {},
) {
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const timerRef = useRef<number | null>(null);
  const [, forceUpdate] = useState(0);
  const rerender = () => forceUpdate(v => v + 1);

  const pushSnapshot = useCallback((snap: Snapshot) => {
    pastRef.current.push(snap);
    if (pastRef.current.length > maxHistory) pastRef.current.shift();
    futureRef.current = [];
    rerender();
  }, [maxHistory]);

  /** Schedule a snapshot commit after debounce. Call on every edit. */
  const markEdit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const snap: Snapshot = { nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) };
    timerRef.current = window.setTimeout(() => {
      pushSnapshot(snap);
    }, debounceMs);
  }, [nodes, edges, pushSnapshot, debounceMs]);

  /** Immediate snapshot (skip debounce) — for big operations like template apply. */
  const commitNow = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    pushSnapshot({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
  }, [nodes, edges, pushSnapshot]);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const snap = past.pop()!;
    futureRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    setNodes(snap.nodes);
    setEdges(snap.edges);
    rerender();
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const snap = future.pop()!;
    pastRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) });
    setNodes(snap.nodes);
    setEdges(snap.edges);
    rerender();
  }, [nodes, edges, setNodes, setEdges]);

  const reset = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    rerender();
  }, []);

  return {
    undo,
    redo,
    markEdit,
    commitNow,
    reset,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
