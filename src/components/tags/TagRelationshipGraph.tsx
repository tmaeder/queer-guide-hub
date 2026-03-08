import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d';
import { useTagGraph, type GraphNode, type GraphEdge } from '@/hooks/useTagRelationships';
import { useIsMobile } from '@/hooks/use-mobile';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Maximize2, ZoomIn, ZoomOut, Filter } from 'lucide-react';
import { PageLoadingState } from '@/components/layout/PageLoadingState';

interface TagRelationshipGraphProps {
  onTagClick: (tag: { id: string; name: string }) => void;
  categoryFilter?: string | null;
  categories?: string[];
}

interface ForceNode extends NodeObject {
  id: string;
  name: string;
  category: string | null;
  color: string | null;
  usage_count: number;
  slug: string;
}

interface ForceLink extends LinkObject {
  source: string | ForceNode;
  target: string | ForceNode;
  score: number;
  type: string;
}

const NODE_COLOR = '#6366f1';

export default function TagRelationshipGraph({
  onTagClick,
  categoryFilter: externalCategoryFilter,
  categories = [],
}: TagRelationshipGraphProps) {
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods | undefined>();
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [minScore, setMinScore] = useState(0.8);
  const [internalCategoryFilter, setInternalCategoryFilter] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<ForceNode | null>(null);

  const categoryFilter = externalCategoryFilter || internalCategoryFilter;

  const { data: graphData, isLoading } = useTagGraph(minScore, categoryFilter);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) });
        }
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Transform data for force-graph
  const forceData = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };

    return {
      nodes: graphData.nodes.map((n) => ({
        ...n,
        id: n.id,
        val: Math.log((n.usage_count || 0) + 2) * 2,
      })),
      links: graphData.edges.map((e) => ({
        source: e.source,
        target: e.target,
        score: e.score,
        type: e.type,
      })),
    };
  }, [graphData]);

  const handleNodeClick = useCallback(
    (node: NodeObject) => {
      const n = node as ForceNode;
      if (n.name) {
        onTagClick({ id: n.id, name: n.name });
      }
    },
    [onTagClick],
  );

  const handleNodeHover = useCallback((node: NodeObject | null) => {
    setHoveredNode(node as ForceNode | null);
  }, []);

  const handleZoomToFit = useCallback(() => {
    graphRef.current?.zoomToFit(400, 40);
  }, []);

  // Custom node rendering with label
  const nodeCanvasObject = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as ForceNode & { x: number; y: number; val: number };
      if (n.x === undefined || n.y === undefined) return;

      const size = Math.sqrt(n.val || 3) * 3;
      const isHovered = hoveredNode?.id === n.id;

      // Draw circle
      ctx.beginPath();
      ctx.arc(n.x, n.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = isHovered ? '#ffffff' : NODE_COLOR;
      ctx.fill();
      ctx.strokeStyle = isHovered ? NODE_COLOR : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isHovered ? 2 : 0.5;
      ctx.stroke();

      // Draw label when zoomed in or hovered
      if (globalScale > 1.5 || isHovered) {
        const fontSize = isHovered ? 14 / globalScale : 11 / globalScale;
        ctx.font = `${isHovered ? 'bold ' : ''}${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const text = n.name;
        const textWidth = ctx.measureText(text).width;
        const padding = 2 / globalScale;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(
          n.x - textWidth / 2 - padding,
          n.y + size + 2 / globalScale,
          textWidth + padding * 2,
          fontSize + padding * 2,
        );

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, n.x, n.y + size + 2 / globalScale + padding);
      }
    },
    [hoveredNode],
  );

  const linkColor = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    const alpha = Math.min(0.8, (l.score || 0.3) * 1.2);
    return `rgba(150, 150, 200, ${alpha})`;
  }, []);

  const linkWidth = useCallback((link: LinkObject) => {
    const l = link as ForceLink;
    return Math.max(0.3, (l.score || 0.3) * 3);
  }, []);

  if (isLoading) {
    return <PageLoadingState count={1} />;
  }

  // Mobile: show list fallback
  if (isMobile) {
    const topNodes = [...(graphData?.nodes || [])]
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 20);

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {graphData?.nodes.length || 0} tags, {graphData?.edges.length || 0} relationships
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
          {topNodes.map((node) => (
            <Card
              key={node.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onTagClick({ id: node.id, name: node.name })}
            >
              <CardContent style={{ padding: 12 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {node.name}
                </Typography>
                {node.category && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 0.5, display: 'block', fontSize: '0.7rem' }}
                  >
                    {node.category}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      {/* Controls */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        {!externalCategoryFilter && categories.length > 0 && (
          <Select
            value={internalCategoryFilter || 'all'}
            onValueChange={(val) => setInternalCategoryFilter(val === 'all' ? null : val)}
          >
            <SelectTrigger style={{ width: 220, height: 36 }}>
              <Filter style={{ width: 14, height: 14, marginRight: 6 }} />
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 220 }}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            Min. similarity
          </Typography>
          <Slider
            value={minScore}
            onChange={(_, val) => setMinScore(val as number)}
            min={0.7}
            max={0.95}
            step={0.05}
            size="small"
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            sx={{ width: 120 }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button variant="outline" size="sm" onClick={handleZoomToFit}>
            <Maximize2 style={{ width: 14, height: 14 }} />
          </Button>
        </Box>

        <Badge variant="secondary">
          {forceData.nodes.length} tags, {forceData.links.length} links
        </Badge>
      </Box>

      {/* Graph */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          minHeight: 400,
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          position: 'relative',
        }}
      >
        {forceData.nodes.length > 0 ? (
          <ForceGraph2D
            ref={graphRef}
            graphData={forceData}
            width={dimensions.width}
            height={dimensions.height}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as ForceNode & { x: number; y: number; val: number };
              if (n.x === undefined || n.y === undefined) return;
              const size = Math.sqrt(n.val || 3) * 3;
              ctx.beginPath();
              ctx.arc(n.x, n.y, size + 2, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={linkColor}
            linkWidth={linkWidth}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            cooldownTicks={100}
            onEngineStop={() => graphRef.current?.zoomToFit(400, 40)}
            enableNodeDrag
            enableZoomInteraction
            enablePanInteraction
            autoPauseRedraw={false}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.4}
          />
        ) : (
          <Box
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <Typography color="text.secondary">
              No relationships found. Try lowering the similarity threshold.
            </Typography>
          </Box>
        )}

        {/* Hover tooltip */}
        {hoveredNode && (
          <Box
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              p: 1.5,
              pointerEvents: 'none',
              maxWidth: 220,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {hoveredNode.name}
            </Typography>
            {hoveredNode.category && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {hoveredNode.category}
              </Typography>
            )}
            {hoveredNode.usage_count > 0 && (
              <Typography variant="caption" color="text.secondary">
                {hoveredNode.usage_count} uses
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
