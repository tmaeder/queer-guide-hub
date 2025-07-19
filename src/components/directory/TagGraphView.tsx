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

interface TagData {
  id: string;
  name: string;
  color?: string;
  usage_count?: number;
  categories?: string[];
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
      {data.categories && data.categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.categories.slice(0, 2).map((category: string) => (
            <Badge key={category} variant="secondary" className="text-xs px-1 py-0">
              {category}
            </Badge>
          ))}
          {data.categories.length > 2 && (
            <Badge variant="secondary" className="text-xs px-1 py-0">
              +{data.categories.length - 2}
            </Badge>
          )}
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

    // Create edges based on shared categories and related tags
    tags.forEach((tag) => {
      // Connect tags in the same categories
      if (tag.categories) {
        tags.forEach((otherTag) => {
          if (tag.id !== otherTag.id && otherTag.categories) {
            const sharedCategories = tag.categories.filter(cat => 
              otherTag.categories?.includes(cat)
            );
            
            if (sharedCategories.length > 0) {
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
                    strokeWidth: Math.min(sharedCategories.length * 2, 6),
                    opacity: 0.6,
                  },
                  animated: false,
                });
                edgeSet.add(edgeId);
              }
            }
          }
        });
      }

      // Connect related tags
      if (tag.related_tags) {
        tag.related_tags.forEach((relatedTagName) => {
          const relatedTag = tags.find(t => t.name.toLowerCase() === relatedTagName.toLowerCase());
          if (relatedTag) {
            const edgeId = `${tag.id}-related-${relatedTag.id}`;
            const reverseEdgeId = `${relatedTag.id}-related-${tag.id}`;
            
            if (!edgeSet.has(edgeId) && !edgeSet.has(reverseEdgeId)) {
              edgeArray.push({
                id: edgeId,
                source: tag.id,
                target: relatedTag.id,
                type: 'straight',
                style: { 
                  stroke: 'hsl(var(--primary))', 
                  strokeWidth: 3,
                  opacity: 0.8,
                },
                animated: true,
              });
              edgeSet.add(edgeId);
            }
          }
        });
      }
    });

    return {
      graphNodes: Array.from(nodeMap.values()),
      graphEdges: edgeArray,
    };
  }, [tags, selectedTag, onTagClick]);

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
        <div className="flex items-center gap-2 text-xs">
          <div className="w-3 h-0.5 bg-muted-foreground opacity-60"></div>
          <span>Shared categories</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-3 h-0.5 bg-primary"></div>
          <span>Related tags</span>
        </div>
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