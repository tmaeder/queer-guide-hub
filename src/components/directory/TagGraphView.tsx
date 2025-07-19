import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  ConnectionLineType,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Tag } from "lucide-react";
import { useTagRelationships } from "@/hooks/useTagRelationships";

interface TagData {
  id: string;
  name: string;
  color?: string;
  usage_count?: number;
  category?: string;
  related_tags?: string[];
  image_url?: string;
}

interface TagGraphViewProps {
  tags: TagData[];
  onTagClick?: (tag: TagData) => void;
  selectedTag?: TagData | null;
}

// Custom node component for tags
const TagNode = ({ data }: { data: any }) => {
  return (
    <div className="bg-card border rounded-lg p-3 shadow-md hover:shadow-lg transition-shadow min-w-[120px]">
      <div className="flex items-center gap-2 mb-2">
        <div 
          className="w-3 h-3 rounded-full flex-shrink-0" 
          style={{ backgroundColor: data.color || 'hsl(var(--muted-foreground))' }}
        />
        <span className="text-sm font-medium truncate">{data.name}</span>
      </div>
      {data.category && (
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-xs px-1 py-0">
            {data.category}
          </Badge>
        </div>
      )}
    </div>
  );
};

const nodeTypes = {
  tagNode: TagNode,
};

export const TagGraphView = ({ tags, onTagClick, selectedTag }: TagGraphViewProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const { relationships, fetchRelationships } = useTagRelationships();

  // Fetch relationships on component mount
  useEffect(() => {
    fetchRelationships();
  }, [fetchRelationships]);

  // Generate nodes and edges from tag data
  const { graphNodes, graphEdges } = useMemo(() => {
    const nodeMap = new Map<string, Node>();
    const edgeSet = new Set<string>();
    const edgeArray: Edge[] = [];

    // Create nodes for all tags
    tags.forEach((tag, index) => {
      const x = Math.cos((index / tags.length) * 2 * Math.PI) * 300;
      const y = Math.sin((index / tags.length) * 2 * Math.PI) * 300;
      
      const node: Node = {
        id: tag.id,
        type: 'tagNode',
        position: { x, y },
        data: {
          ...tag,
          onClick: () => onTagClick?.(tag),
        },
        style: {
          border: selectedTag?.id === tag.id ? '2px solid hsl(var(--primary))' : '1px solid hsl(var(--border))',
        },
      };
      nodeMap.set(tag.id, node);
    });

    // Create edges based on computed relationships
    relationships.forEach((relationship) => {
      const sourceTag = tags.find(t => t.id === relationship.tag1_id);
      const targetTag = tags.find(t => t.id === relationship.tag2_id);
      
      if (sourceTag && targetTag) {
        const edgeId = `${relationship.tag1_id}-${relationship.tag2_id}`;
        
        // Determine edge style based on relationship type and similarity
        const isSemanticRelationship = relationship.relationship_type === 'semantic';
        const strokeWidth = Math.max(2, Math.min(relationship.similarity_score * 8, 6));
        const opacity = Math.max(0.3, Math.min(relationship.similarity_score * 2, 1));
        
        edgeArray.push({
          id: edgeId,
          source: relationship.tag1_id,
          target: relationship.tag2_id,
          type: isSemanticRelationship ? 'smoothstep' : 'straight',
          style: { 
            stroke: isSemanticRelationship ? 'hsl(var(--primary))' : 'hsl(var(--secondary))', 
            strokeWidth,
            opacity,
          },
          animated: isSemanticRelationship && relationship.similarity_score > 0.5,
          label: relationship.similarity_score > 0.7 ? `${(relationship.similarity_score * 100).toFixed(0)}%` : undefined,
        });
      }
    });

    // Fallback: If no computed relationships exist, use category-based connections
    if (relationships.length === 0) {
      tags.forEach((tag) => {
        // Connect tags in the same category
        if (tag.category) {
          tags.forEach((otherTag) => {
            if (tag.id !== otherTag.id && otherTag.category && tag.category === otherTag.category) {
              const edgeId = `${tag.id}-${otherTag.id}`;
              const reverseEdgeId = `${otherTag.id}-${tag.id}`;
              
              if (!edgeSet.has(edgeId) && !edgeSet.has(reverseEdgeId)) {
                edgeArray.push({
                  id: edgeId,
                  source: tag.id,
                  target: otherTag.id,
                  type: 'smoothstep',
                  style: { 
                    stroke: 'hsl(var(--muted-foreground))', 
                    strokeWidth: 3,
                    opacity: 0.6,
                  },
                  animated: false,
                });
                edgeSet.add(edgeId);
              }
            }
          });
        }
      });
    }

    return {
      graphNodes: Array.from(nodeMap.values()),
      graphEdges: edgeArray,
    };
  }, [tags, selectedTag, onTagClick, relationships]);

  // Update nodes and edges when data changes
  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const tag = tags.find(t => t.id === node.id);
    if (tag && onTagClick) {
      onTagClick(tag);
    }
  }, [tags, onTagClick]);

  const onInit = useCallback((instance: any) => {
    setReactFlowInstance(instance);
    // Fit view after a short delay to ensure nodes are rendered
    setTimeout(() => {
      instance.fitView({ padding: 0.1 });
    }, 100);
  }, []);

  const handleFitView = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.1 });
    }
  }, [reactFlowInstance]);

  const handleZoomIn = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomIn();
    }
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomOut();
    }
  }, [reactFlowInstance]);

  return (
    <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-background relative">
      {/* Custom Controls */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button variant="outline" size="sm" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleFitView}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-10 bg-card border rounded-lg p-3 space-y-2">
        <div className="text-sm font-medium">Legend</div>
        {relationships.length > 0 ? (
          <>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-0.5 bg-primary"></div>
              <span>AI Semantic similarity</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-3 h-0.5 bg-secondary"></div>
              <span>Category-based</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Line thickness = similarity strength
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-3 h-0.5 bg-muted-foreground opacity-60"></div>
            <span>Shared categories</span>
          </div>
        )}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onInit={onInit}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{
          animated: false,
          type: 'smoothstep',
        }}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.1}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background />
        <MiniMap 
          nodeColor={(node) => (node.data.color as string) || 'hsl(var(--muted))'}
          className="!bg-background border"
          position="bottom-right"
        />
      </ReactFlow>
    </div>
  );
};