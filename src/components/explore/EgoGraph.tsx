import { useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useReactFlow,
  useNodesState,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import EntityNode, { type EgoFlowNode } from './EntityNode';

const nodeTypes = { entityNode: EntityNode } satisfies NodeTypes;

interface EgoGraphProps {
  nodes: EgoFlowNode[];
  edges: Edge[];
  onNodeClick: (key: string) => void;
}

function FitOnGrowth({ count }: { count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (count === 0) return;
    const id = window.setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
    return () => window.clearTimeout(id);
  }, [count, fitView]);
  return null;
}

function EgoGraphInner({ nodes: incoming, edges, onNodeClick }: EgoGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<EgoFlowNode>([]);

  // Sync graph growth from the hook while preserving positions the user dragged.
  useEffect(() => {
    setNodes(current => {
      const byId = new Map(current.map(n => [n.id, n]));
      return incoming.map(n => {
        const existing = byId.get(n.id);
        return existing ? { ...n, position: existing.position } : n;
      });
    });
  }, [incoming, setNodes]);

  return (
    <ReactFlow<EgoFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      fitView
      nodesDraggable
      nodesConnectable={false}
      elementsSelectable={false}
      edgesFocusable={false}
      deleteKeyCode={null}
      minZoom={0.15}
      maxZoom={1.6}
      className="bg-muted/10"
    >
      <Background gap={16} size={1} />
      <FitOnGrowth count={incoming.length} />
    </ReactFlow>
  );
}

/**
 * Read-mostly React Flow wrapper for the connections ego network. Nodes are
 * draggable (rearranging is useful), but there is no editing surface — click
 * expands, the per-node arrow link navigates.
 */
export default function EgoGraph(props: EgoGraphProps) {
  return (
    <ReactFlowProvider>
      <EgoGraphInner {...props} />
    </ReactFlowProvider>
  );
}
