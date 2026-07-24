import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** One neighbour row from admin_entity_neighbors. */
interface NeighborNode {
  key: string;
  type: string;
  id: string;
  title: string;
  center?: boolean;
}
interface NeighborEdge {
  source: string;
  target: string;
  relation: string;
}

export interface AdminEgoNode {
  key: string;
  type: string;
  id: string;
  title: string;
  depth: number;
  angle: number;
  position: { x: number; y: number };
  expanded: boolean;
  loading: boolean;
}
export interface AdminEgoEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

interface EgoState {
  nodes: Record<string, AdminEgoNode>;
  edges: AdminEgoEdge[];
}

const RING_RADIUS = 420;
const EXPAND_RADIUS = 340;

async function fetchNeighbors(type: string, id: string): Promise<{ nodes: NeighborNode[]; edges: NeighborEdge[] }> {
  const { data, error } = await supabase.rpc('admin_entity_neighbors', { p_type: type, p_id: id });
  if (error) throw error;
  const d = (data ?? {}) as { nodes?: NeighborNode[]; edges?: NeighborEdge[] };
  return { nodes: d.nodes ?? [], edges: d.edges ?? [] };
}

function mergeExpansion(
  state: EgoState,
  parentKey: string,
  incoming: { nodes: NeighborNode[]; edges: NeighborEdge[] },
): EgoState {
  const parent = state.nodes[parentKey];
  if (!parent) return state;

  const nodes = { ...state.nodes, [parentKey]: { ...parent, expanded: true, loading: false } };
  const edges = [...state.edges];
  const edgeKeys = new Set(edges.map((e) => e.id));

  // Neighbours the parent didn't already have.
  const fresh = incoming.nodes.filter((n) => n.key !== parentKey && !nodes[n.key]);
  const isRoot = parent.depth === 0;
  const n = Math.max(fresh.length, 1);
  const arc = isRoot ? 2 * Math.PI : Math.min((2 * Math.PI) / 2.4, (Math.PI / 7) * n);
  const start = isRoot ? -Math.PI / 2 : n === 1 ? parent.angle : parent.angle - arc / 2;
  const step = isRoot ? arc / n : n > 1 ? arc / (n - 1) : 0;
  const radius = isRoot ? RING_RADIUS : EXPAND_RADIUS;

  let placed = 0;
  for (const row of incoming.nodes) {
    if (row.key === parentKey) continue;
    if (!nodes[row.key]) {
      const angle = start + placed * step;
      nodes[row.key] = {
        key: row.key,
        type: row.type,
        id: row.id,
        title: row.title,
        depth: parent.depth + 1,
        angle,
        position: {
          x: parent.position.x + Math.cos(angle) * radius,
          y: parent.position.y + Math.sin(angle) * radius,
        },
        expanded: false,
        loading: false,
      };
      placed++;
    }
  }
  for (const e of incoming.edges) {
    const id = `${e.source}→${e.target}`;
    if (!edgeKeys.has(id) && nodes[e.source] && nodes[e.target]) {
      edgeKeys.add(id);
      edges.push({ id, source: e.source, target: e.target, relation: e.relation });
    }
  }
  return { nodes, edges };
}

/**
 * Structural ego network around an admin-selected record. Seeds from
 * admin_entity_neighbors and grows on expand-click, deduped by key. Radial
 * layout mirrors the public ego graph (full circle at root, arcs on expand).
 */
export function useAdminEgoNetwork(center: { type: string; id: string; title?: string } | null) {
  const [state, setState] = useState<EgoState>({ nodes: {}, edges: [] });
  const [error, setError] = useState(false);
  const stateRef = useRef(state);
  // eslint-disable-next-line react-hooks/refs -- intentional ref-during-render: latest-value mirror so expand() reads current graph state without re-creating the callback.
  stateRef.current = state;

  const expand = useCallback(async (key: string) => {
    const node = stateRef.current.nodes[key];
    if (!node || node.expanded || node.loading) return;
    setState((s) => ({ ...s, nodes: { ...s.nodes, [key]: { ...s.nodes[key], loading: true } } }));
    try {
      const incoming = await fetchNeighbors(node.type, node.id);
      setState((s) => mergeExpansion(s, key, incoming));
    } catch {
      setState((s) => ({ ...s, nodes: { ...s.nodes, [key]: { ...s.nodes[key], loading: false } } }));
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!center?.type || !center?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props; React Compiler can't infer the sync direction.
      setState({ nodes: {}, edges: [] });
      return;
    }
    const key = `${center.type}:${center.id}`;
    setError(false);
    setState({
      nodes: {
        [key]: {
          key, type: center.type, id: center.id, title: center.title || center.type,
          depth: 0, angle: 0, position: { x: 0, y: 0 }, expanded: false, loading: true,
        },
      },
      edges: [],
    });
    let cancelled = false;
    fetchNeighbors(center.type, center.id)
      .then((incoming) => { if (!cancelled) setState((s) => mergeExpansion(s, key, incoming)); })
      .catch(() => {
        if (cancelled) return;
        setState((s) => (s.nodes[key] ? { ...s, nodes: { ...s.nodes, [key]: { ...s.nodes[key], loading: false } } } : s));
        setError(true);
      });
    return () => { cancelled = true; };
  }, [center?.type, center?.id, center?.title]);

  return { nodes: state.nodes, edges: state.edges, expand, error };
}
