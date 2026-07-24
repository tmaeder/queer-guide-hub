import { useEffect, useMemo } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, Controls, useReactFlow,
  useNodesState, type Edge, type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TypeNode, { type TypeFlowNode } from './TypeNode';
import {
  edgeDash, edgeId, edgeWidth, GRAPH_STROKE, type GraphCategory, type GraphEdgeStat, type GraphNodeStat,
} from './contentGraphMeta';

const nodeTypes = { typeNode: TypeNode } satisfies NodeTypes;

const CATEGORY_ORDER: GraphCategory[] = ['content', 'geo', 'community', 'taxonomy', 'media'];

interface OntologyMapProps {
  nodes: GraphNodeStat[];
  edges: GraphEdgeStat[];
  selectedType: string | null;
  selectedEdge: string | null;
  onSelectNode: (type: string | null) => void;
  onSelectEdge: (id: string | null) => void;
}

/** Deterministic circular layout, ordered by category then size. */
function layout(nodes: GraphNodeStat[]): TypeFlowNode[] {
  const ordered = [...nodes].sort((a, b) => {
    const c = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return c !== 0 ? c : b.count - a.count;
  });
  const n = ordered.length || 1;
  const radius = 300 + n * 12;
  return ordered.map((node, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      id: node.type,
      type: 'typeNode' as const,
      position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
      data: {
        type: node.type, label: node.label, category: node.category,
        count: node.count, orphanCount: node.orphan_count, dupCount: node.dup_count,
      },
    };
  });
}

function OntologyMapInner({
  nodes: statNodes, edges: statEdges, selectedType, selectedEdge, onSelectNode, onSelectEdge,
}: OntologyMapProps) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<TypeFlowNode>([]);

  // Rebuild positions when the node set changes; preserve user drags otherwise.
  useEffect(() => {
    const laidOut = layout(statNodes);
    setNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return laidOut.map((n) => {
        const existing = byId.get(n.id);
        return existing ? { ...n, position: existing.position } : n;
      });
    });
  }, [statNodes, setNodes]);

  // Reflect selection into node data (ring highlight).
  useEffect(() => {
    setNodes((cur) => cur.map((n) => ({ ...n, data: { ...n.data, selected: n.id === selectedType } })));
  }, [selectedType, setNodes]);

  useEffect(() => {
    const id = window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80);
    return () => window.clearTimeout(id);
  }, [statNodes.length, fitView]);

  const edges = useMemo<Edge[]>(() =>
    statEdges
      .filter((e) => e.source !== e.target) // self-loops shown in the detail panel, not drawn
      .map((e) => {
        const id = edgeId(e);
        const sel = id === selectedEdge;
        return {
          id,
          source: e.source,
          target: e.target,
          type: 'straight',
          data: { stat: e },
          style: {
            stroke: GRAPH_STROKE,
            strokeWidth: edgeWidth(e.count) + (sel ? 1.5 : 0),
            strokeDasharray: edgeDash(e.relation_kind),
            opacity: sel ? 1 : 0.42,
          },
        } satisfies Edge;
      }),
    [statEdges, selectedEdge]);

  return (
    <ReactFlow<TypeFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => onSelectNode(node.id)}
      onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
      onPaneClick={() => { onSelectNode(null); onSelectEdge(null); }}
      fitView
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable
      edgesFocusable
      deleteKeyCode={null}
      minZoom={0.2}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      className="bg-muted/10"
    >
      <Background gap={18} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function OntologyMap(props: OntologyMapProps) {
  return (
    <ReactFlowProvider>
      <OntologyMapInner {...props} />
    </ReactFlowProvider>
  );
}
