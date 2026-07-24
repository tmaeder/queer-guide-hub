import { useMemo } from 'react';
import type { Edge } from '@xyflow/react';
import EgoGraph from '@/components/explore/EgoGraph';
import type { EgoFlowNode } from '@/components/explore/EntityNode';
import { useAdminEgoNetwork } from '@/hooks/useAdminEgoNetwork';
import { GRAPH_STROKE } from './contentGraphMeta';

interface Props {
  center: { type: string; id: string; title: string };
}

/**
 * Instance-level structural ego graph around one record, reusing the public
 * EgoGraph/EntityNode renderer. Data is structural (admin_entity_neighbors),
 * not semantic similarity. Click a node to expand its neighbours.
 */
export default function EntityEgoExplorer({ center }: Props) {
  const { nodes, edges, expand, error } = useAdminEgoNetwork(center);

  const flowNodes = useMemo<EgoFlowNode[]>(() =>
    Object.values(nodes).map((n) => ({
      id: n.key,
      type: 'entityNode' as const,
      position: n.position,
      draggable: n.depth > 0,
      data: {
        title: n.title,
        entityType: n.type,
        isCenter: n.depth === 0,
        expanded: n.expanded,
        loading: n.loading,
      },
    })), [nodes]);

  const flowEdges = useMemo<Edge[]>(() =>
    edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'straight',
      style: { strokeWidth: 1.5, opacity: 0.5, stroke: GRAPH_STROKE },
    })), [edges]);

  const count = Object.keys(nodes).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <span className="text-13 text-muted-foreground">
          {count} node{count === 1 ? '' : 's'} · click to expand
        </span>
        {error && count <= 1 && <span className="text-13 text-destructive">Failed to load neighbours.</span>}
      </div>
      <div className="flex-1 min-h-0 border border-border rounded-container overflow-hidden">
        <EgoGraph nodes={flowNodes} edges={flowEdges} onNodeClick={expand} />
      </div>
    </div>
  );
}
