import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSimilar } from '@/lib/searchClient';

/** One row from the search-proxy /similar endpoint (related_entities RPC). */
interface SimilarRow {
  content_type: string;
  content_id: string;
  score: number;
  metadata?: {
    title?: string;
    city?: string;
    country?: string;
    category?: string;
    slug?: string;
    image_url?: string;
    optimized_url?: string | null;
    thumbnail_url?: string | null;
  };
}

export interface EgoNode {
  key: string; // `${type}:${id}`
  type: string;
  id: string;
  title: string;
  slug?: string;
  category?: string;
  city?: string;
  country?: string;
  imageUrl?: string | null;
  /** similarity score of the edge that introduced this node */
  score?: number;
  depth: number;
  /** outward direction from the graph center, radians — expansions fan out along it */
  angle: number;
  position: { x: number; y: number };
  expanded: boolean;
  loading: boolean;
}

export interface EgoEdge {
  id: string;
  source: string;
  target: string;
  score: number;
}

interface EgoState {
  nodes: Record<string, EgoNode>;
  edges: EgoEdge[];
}

const RING_RADIUS = 420;
const EXPAND_RADIUS = 360;
const NEIGHBORS_PER_EXPAND = 8;

export const egoKey = (type: string, id: string) => `${type}:${id}`;

function mergeExpansion(state: EgoState, parentKey: string, rows: SimilarRow[]): EgoState {
  const parent = state.nodes[parentKey];
  if (!parent) return state;

  const nodes = { ...state.nodes, [parentKey]: { ...parent, expanded: true, loading: false } };
  const edges = [...state.edges];
  const edgeKeys = new Set(edges.flatMap(e => [`${e.source}→${e.target}`, `${e.target}→${e.source}`]));

  const fresh = rows.filter(r => {
    const key = egoKey(r.content_type, r.content_id);
    return key !== parentKey && !nodes[key];
  });

  // Root fans out on a full circle; deeper expansions fan out on an arc
  // centered on the parent's outward direction.
  const isRoot = parent.depth === 0;
  const n = Math.max(fresh.length, 1);
  const arc = isRoot ? 2 * Math.PI : Math.min((2 * Math.PI) / 2.4, (Math.PI / 7) * n);
  const start = isRoot ? -Math.PI / 2 : n === 1 ? parent.angle : parent.angle - arc / 2;
  const step = isRoot ? arc / n : n > 1 ? arc / (n - 1) : 0;
  const radius = isRoot ? RING_RADIUS : EXPAND_RADIUS;

  let placed = 0;
  for (const row of rows) {
    const key = egoKey(row.content_type, row.content_id);
    if (key === parentKey) continue;

    if (!nodes[key]) {
      const angle = start + placed * step;
      nodes[key] = {
        key,
        type: row.content_type,
        id: row.content_id,
        title: row.metadata?.title || row.content_type,
        slug: row.metadata?.slug,
        category: row.metadata?.category,
        city: row.metadata?.city,
        country: row.metadata?.country,
        imageUrl: row.metadata?.thumbnail_url || row.metadata?.optimized_url || row.metadata?.image_url || null,
        score: row.score,
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

    const ek = `${parentKey}→${key}`;
    if (!edgeKeys.has(ek)) {
      edgeKeys.add(ek);
      edgeKeys.add(`${key}→${parentKey}`);
      edges.push({ id: ek, source: parentKey, target: key, score: row.score });
    }
  }

  return { nodes, edges };
}

/**
 * Ego network around a center entity: fetches its semantic neighbors
 * (search-proxy /similar → related_entities RPC) and merges expand-on-click
 * fetches into one growing graph, deduped by entity key. Layout is pure
 * trigonometry — full circle around the root, arcs around expanded nodes.
 */
export function useEgoNetwork(center: { type: string; id: string; title?: string } | null) {
  const [state, setState] = useState<EgoState>({ nodes: {}, edges: [] });
  const [error, setError] = useState(false);
  const stateRef = useRef(state);
  // eslint-disable-next-line react-hooks/refs -- intentional ref-during-render: latest-value mirror so expand() reads current graph state without re-creating the callback.
  stateRef.current = state;

  const expand = useCallback(async (key: string) => {
    const node = stateRef.current.nodes[key];
    if (!node || node.expanded || node.loading) return;
    setState(s => ({ ...s, nodes: { ...s.nodes, [key]: { ...s.nodes[key], loading: true } } }));
    try {
      const rows = (await fetchSimilar(
        { type: node.type, id: node.id },
        NEIGHBORS_PER_EXPAND,
      )) as unknown as SimilarRow[];
      setState(s => mergeExpansion(s, key, rows));
    } catch {
      setState(s => ({ ...s, nodes: { ...s.nodes, [key]: { ...s.nodes[key], loading: false } } }));
      setError(true);
    }
  }, []);

  // (Re)seed the graph when the center entity changes, then expand it.
  useEffect(() => {
    if (!center?.type || !center?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setState({ nodes: {}, edges: [] });
      return;
    }
    const key = egoKey(center.type, center.id);
    setError(false);
    setState({
      nodes: {
        [key]: {
          key,
          type: center.type,
          id: center.id,
          title: center.title || center.type,
          depth: 0,
          angle: 0,
          position: { x: 0, y: 0 },
          expanded: false,
          loading: true,
        },
      },
      edges: [],
    });
    let cancelled = false;
    fetchSimilar({ type: center.type, id: center.id }, NEIGHBORS_PER_EXPAND)
      .then(rows => {
        if (cancelled) return;
        setState(s => mergeExpansion(s, key, rows as unknown as SimilarRow[]));
      })
      .catch(() => {
        if (cancelled) return;
        setState(s => (s.nodes[key] ? { ...s, nodes: { ...s.nodes, [key]: { ...s.nodes[key], loading: false } } } : s));
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [center?.type, center?.id, center?.title]);

  return { nodes: state.nodes, edges: state.edges, expand, error };
}
