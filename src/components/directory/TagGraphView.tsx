import { useCallback, useEffect, useState, useRef } from 'react';
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [zoom, setZoom] = useState(1);
  const { relationships, fetchRelationships } = useTagRelationships();

  // Initialize graph data
  useEffect(() => {
    if (!tags || tags.length === 0) return;

    console.log('Initializing spider graph with', tags.length, 'tags');

    // Create nodes
    const graphNodes: GraphNode[] = tags.map(tag => ({
      id: tag.id,
      name: tag.name,
      color: tag.color || '#6366f1',
      category: tag.category || 'uncategorized',
      usage_count: tag.usage_count || 0,
    }));

    // Create dynamic links based on multiple criteria
    const graphLinks: GraphLink[] = [];
    const linkSet = new Set<string>();

    // 1. AI Semantic relationships (if available)
    if (relationships && relationships.length > 0) {
      relationships.forEach(rel => {
        const linkId = `${rel.tag1_id}-${rel.tag2_id}`;
        const reverseLinkId = `${rel.tag2_id}-${rel.tag1_id}`;
        
        if (!linkSet.has(linkId) && !linkSet.has(reverseLinkId)) {
          graphLinks.push({
            source: rel.tag1_id,
            target: rel.tag2_id,
            strength: rel.similarity_score || 0.5,
            type: 'semantic'
          });
          linkSet.add(linkId);
        }
      });
    }

    // 2. Category-based relationships
    tags.forEach(tag1 => {
      tags.forEach(tag2 => {
        if (tag1.id !== tag2.id && tag1.category && tag2.category && tag1.category === tag2.category) {
          const linkId = `${tag1.id}-${tag2.id}`;
          const reverseLinkId = `${tag2.id}-${tag1.id}`;
          
          if (!linkSet.has(linkId) && !linkSet.has(reverseLinkId)) {
            graphLinks.push({
              source: tag1.id,
              target: tag2.id,
              strength: 0.3,
              type: 'category'
            });
            linkSet.add(linkId);
          }
        }
      });
    });

    // 3. Usage-based relationships (connect frequently used tags)
    const highUsageTags = tags.filter(tag => (tag.usage_count || 0) > 2);
    highUsageTags.forEach(tag1 => {
      highUsageTags.forEach(tag2 => {
        if (tag1.id !== tag2.id) {
          const linkId = `${tag1.id}-${tag2.id}`;
          const reverseLinkId = `${tag2.id}-${tag1.id}`;
          
          if (!linkSet.has(linkId) && !linkSet.has(reverseLinkId)) {
            const usageStrength = Math.min((tag1.usage_count || 0) + (tag2.usage_count || 0), 20) / 20;
            graphLinks.push({
              source: tag1.id,
              target: tag2.id,
              strength: usageStrength * 0.4,
              type: 'usage'
            });
            linkSet.add(linkId);
          }
        }
      });
    });

    console.log('Created', graphNodes.length, 'nodes and', graphLinks.length, 'links');
    setNodes(graphNodes);
    setLinks(graphLinks);
  }, [tags, relationships]);

  // D3 Force Simulation
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = svgRef.current;
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 600;

    // Clear previous content
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    // Create main group for zoom/pan
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(g);

    // Create links
    links.forEach(link => {
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);
      
      if (!sourceNode || !targetNode) return;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', link.type === 'semantic' ? '#6366f1' : 
                                  link.type === 'category' ? '#8b5cf6' : '#10b981');
      line.setAttribute('stroke-width', `${Math.max(1, link.strength * 6)}`);
      line.setAttribute('stroke-opacity', `${Math.max(0.2, link.strength)}`);
      g.appendChild(line);
    });

    // Create nodes
    nodes.forEach((node, index) => {
      // Position nodes in a circle initially
      const angle = (index / nodes.length) * 2 * Math.PI;
      const radius = Math.min(width, height) * 0.3;
      node.x = width/2 + Math.cos(angle) * radius;
      node.y = height/2 + Math.sin(angle) * radius;

      // Create node group
      const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodeGroup.setAttribute('transform', `translate(${node.x}, ${node.y})`);
      nodeGroup.style.cursor = 'pointer';
      
      // Node circle
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const nodeSize = Math.max(15, Math.min(30, 15 + (node.usage_count * 2)));
      circle.setAttribute('r', `${nodeSize}`);
      circle.setAttribute('fill', node.color);
      circle.setAttribute('stroke', selectedTag?.id === node.id ? '#000' : '#fff');
      circle.setAttribute('stroke-width', selectedTag?.id === node.id ? '3' : '2');
      circle.setAttribute('opacity', '0.8');
      
      // Node label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', `${nodeSize + 20}`);
      text.setAttribute('font-size', '12');
      text.setAttribute('font-weight', 'bold');
      text.setAttribute('fill', '#374151');
      text.textContent = node.name.length > 12 ? node.name.substring(0, 12) + '...' : node.name;
      
      // Usage count badge
      if (node.usage_count > 0) {
        const badge = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        badge.setAttribute('r', '8');
        badge.setAttribute('cx', `${nodeSize - 5}`);
        badge.setAttribute('cy', `${-nodeSize + 5}`);
        badge.setAttribute('fill', '#ef4444');
        badge.setAttribute('stroke', '#fff');
        badge.setAttribute('stroke-width', '2');
        
        const badgeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        badgeText.setAttribute('text-anchor', 'middle');
        badgeText.setAttribute('x', `${nodeSize - 5}`);
        badgeText.setAttribute('y', `${-nodeSize + 5}`);
        badgeText.setAttribute('dy', '0.3em');
        badgeText.setAttribute('font-size', '10');
        badgeText.setAttribute('font-weight', 'bold');
        badgeText.setAttribute('fill', '#fff');
        badgeText.textContent = node.usage_count.toString();
        
        nodeGroup.appendChild(badge);
        nodeGroup.appendChild(badgeText);
      }

      nodeGroup.appendChild(circle);
      nodeGroup.appendChild(text);
      
      // Add click handler
      nodeGroup.addEventListener('click', () => {
        const tag = tags.find(t => t.id === node.id);
        if (tag && onTagClick) {
          onTagClick(tag);
        }
      });

      // Add hover effects
      nodeGroup.addEventListener('mouseenter', () => {
        circle.setAttribute('opacity', '1');
        circle.setAttribute('stroke-width', '3');
      });
      
      nodeGroup.addEventListener('mouseleave', () => {
        circle.setAttribute('opacity', '0.8');
        circle.setAttribute('stroke-width', selectedTag?.id === node.id ? '3' : '2');
      });

      g.appendChild(nodeGroup);
    });

    // Update link positions
    const updateLinks = () => {
      const lines = g.querySelectorAll('line');
      links.forEach((link, index) => {
        const sourceNode = nodes.find(n => n.id === link.source);
        const targetNode = nodes.find(n => n.id === link.target);
        
        if (sourceNode && targetNode && lines[index]) {
          const line = lines[index] as SVGLineElement;
          line.setAttribute('x1', `${sourceNode.x}`);
          line.setAttribute('y1', `${sourceNode.y}`);
          line.setAttribute('x2', `${targetNode.x}`);
          line.setAttribute('y2', `${targetNode.y}`);
        }
      });
    };

    // Simple animation for dynamic movement
    let animationId: number;
    const animate = () => {
      // Apply simple repulsion forces
      nodes.forEach(node1 => {
        let fx = 0, fy = 0;
        
        nodes.forEach(node2 => {
          if (node1.id !== node2.id) {
            const dx = (node1.x || 0) - (node2.x || 0);
            const dy = (node1.y || 0) - (node2.y || 0);
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0 && distance < 100) {
              const force = 50 / (distance * distance);
              fx += (dx / distance) * force;
              fy += (dy / distance) * force;
            }
          }
        });

        // Apply link attraction
        links.forEach(link => {
          if (link.source === node1.id || link.target === node1.id) {
            const otherNodeId = link.source === node1.id ? link.target : link.source;
            const otherNode = nodes.find(n => n.id === otherNodeId);
            
            if (otherNode) {
              const dx = (otherNode.x || 0) - (node1.x || 0);
              const dy = (otherNode.y || 0) - (node1.y || 0);
              const distance = Math.sqrt(dx * dx + dy * dy);
              
              if (distance > 80) {
                const force = link.strength * 0.1;
                fx += (dx / distance) * force;
                fy += (dy / distance) * force;
              }
            }
          }
        });

        // Apply forces with damping
        if (node1.x && node1.y) {
          node1.x += fx * 0.1;
          node1.y += fy * 0.1;

          // Keep nodes within bounds
          node1.x = Math.max(50, Math.min(width - 50, node1.x));
          node1.y = Math.max(50, Math.min(height - 50, node1.y));
        }
      });

      // Update visual positions
      const nodeGroups = g.querySelectorAll('g:not(:first-child)') as NodeListOf<SVGGElement>;
      nodes.forEach((node, index) => {
        if (nodeGroups[index] && node.x && node.y) {
          nodeGroups[index].setAttribute('transform', `translate(${node.x}, ${node.y})`);
        }
      });

      updateLinks();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [nodes, links, selectedTag, onTagClick, tags]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.3));
  };

  const handleReset = () => {
    setZoom(1);
    // Re-initialize positions
    if (nodes.length > 0) {
      const width = svgRef.current?.clientWidth || 800;
      const height = svgRef.current?.clientHeight || 600;
      
      setNodes(prev => prev.map((node, index) => {
        const angle = (index / prev.length) * 2 * Math.PI;
        const radius = Math.min(width, height) * 0.3;
        return {
          ...node,
          x: width/2 + Math.cos(angle) * radius,
          y: height/2 + Math.sin(angle) * radius,
        };
      }));
    }
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
          {nodes.length} nodes, {links.length} connections
        </div>
      </div>

      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
      />
    </div>
  );
};