import React, { useMemo, useState } from 'react';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, Maximize2, Tag, RefreshCw } from "lucide-react";
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

interface GraphNode {
  id: string;
  name: string;
  color: string;
  category: string;
  usage_count: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  strength: number;
  type: 'semantic' | 'category' | 'usage';
}

export const TagGraphView = ({ tags, onTagClick, selectedTag }: TagGraphViewProps) => {
  const [zoom, setZoom] = useState(1);
  const { relationships, fetchRelationships } = useTagRelationships();

  // Create simplified static graph data
  const graphData = useMemo(() => {
    if (!tags || tags.length === 0) return { nodes: [], links: [] };

    console.log('Creating graph with', tags.length, 'tags');

    // Create nodes with static positions in a circle
    const nodes: GraphNode[] = tags.map((tag, index) => {
      const angle = (index / tags.length) * 2 * Math.PI;
      const radius = 200;
      return {
        id: tag.id,
        name: tag.name,
        color: tag.color || '#6366f1',
        category: tag.category || 'uncategorized',
        usage_count: tag.usage_count || 0,
        x: 300 + Math.cos(angle) * radius,
        y: 300 + Math.sin(angle) * radius,
      };
    });

    // Create simple links - only category-based to avoid complexity
    const links: GraphLink[] = [];
    const linkSet = new Set<string>();

    // Category-based links
    tags.forEach(tag1 => {
      tags.forEach(tag2 => {
        if (tag1.id !== tag2.id && tag1.category && tag2.category && tag1.category === tag2.category) {
          const linkId = `${tag1.id}-${tag2.id}`;
          const reverseLinkId = `${tag2.id}-${tag1.id}`;
          
          if (!linkSet.has(linkId) && !linkSet.has(reverseLinkId)) {
            links.push({
              source: tag1.id,
              target: tag2.id,
              strength: 0.5,
              type: 'category'
            });
            linkSet.add(linkId);
          }
        }
      });
    });

    console.log('Created', nodes.length, 'nodes and', links.length, 'links');
    return { nodes, links };
  }, [tags]);



  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.3));
  };

  const handleReset = () => {
    setZoom(1);
  };

  const handleRefresh = async () => {
    await fetchRelationships();
  };

  if (!tags || tags.length === 0) {
    return (
      <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-background relative flex items-center justify-center">
        <div className="text-center space-y-4">
          <Tag className="h-12 w-12 mx-auto text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold mb-2">No Tags Available</h3>
            <p className="text-sm text-muted-foreground">
              Add some tags to see the spider graph visualization.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] border rounded-lg overflow-hidden bg-background relative">
      {/* Controls */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button variant="outline" size="sm" onClick={handleZoomIn}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleZoomOut}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-10 bg-card border rounded-lg p-3 space-y-2">
        <div className="text-sm font-medium">Spider Graph</div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-3 h-0.5 bg-blue-500"></div>
          <span>Semantic links</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-3 h-0.5 bg-purple-500"></div>
          <span>Category links</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="w-3 h-0.5 bg-green-500"></div>
          <span>Usage links</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Node size = usage count
        </div>
      </div>

      {/* Stats */}
      <div className="absolute bottom-4 left-4 z-10 bg-card border rounded-lg p-3">
        <div className="text-xs text-muted-foreground">
          {graphData.nodes.length} nodes, {graphData.links.length} connections
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        className="w-full h-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
      >
        {/* Render links */}
        {graphData.links.map((link, index) => {
          const sourceNode = graphData.nodes.find(n => n.id === link.source);
          const targetNode = graphData.nodes.find(n => n.id === link.target);
          
          if (!sourceNode || !targetNode) return null;
          
          return (
            <line
              key={index}
              x1={sourceNode.x}
              y1={sourceNode.y}
              x2={targetNode.x}
              y2={targetNode.y}
              stroke={link.type === 'semantic' ? '#6366f1' : 
                     link.type === 'category' ? '#8b5cf6' : '#10b981'}
              strokeWidth={Math.max(1, link.strength * 6)}
              strokeOpacity={Math.max(0.2, link.strength)}
            />
          );
        })}
        
        {/* Render nodes */}
        {graphData.nodes.map((node) => {
          const nodeSize = Math.max(15, Math.min(30, 15 + (node.usage_count * 2)));
          const tag = tags.find(t => t.id === node.id);
          
          return (
            <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
              <circle
                r={nodeSize}
                fill={node.color}
                stroke={selectedTag?.id === node.id ? '#000' : '#fff'}
                strokeWidth={selectedTag?.id === node.id ? '3' : '2'}
                opacity="0.8"
                style={{ cursor: 'pointer' }}
                onClick={() => tag && onTagClick && onTagClick(tag)}
                onMouseEnter={(e) => {
                  e.currentTarget.setAttribute('opacity', '1');
                  e.currentTarget.setAttribute('stroke-width', '3');
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.setAttribute('opacity', '0.8');
                  e.currentTarget.setAttribute('stroke-width', selectedTag?.id === node.id ? '3' : '2');
                }}
              />
              
              {/* Usage count badge */}
              {node.usage_count > 0 && (
                <>
                  <circle
                    r="8"
                    cx={nodeSize - 5}
                    cy={-nodeSize + 5}
                    fill="#ef4444"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                  <text
                    textAnchor="middle"
                    x={nodeSize - 5}
                    y={-nodeSize + 5}
                    dy="0.3em"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#fff"
                  >
                    {node.usage_count}
                  </text>
                </>
              )}
              
              {/* Node label */}
              <text
                textAnchor="middle"
                dy={nodeSize + 20}
                fontSize="12"
                fontWeight="bold"
                fill="#374151"
              >
                {node.name.length > 12 ? node.name.substring(0, 12) + '...' : node.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};