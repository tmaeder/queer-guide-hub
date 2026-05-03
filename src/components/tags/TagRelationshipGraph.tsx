import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ForceGraph2D, {
  type ForceGraphMethods,
  type NodeObject,
  type LinkObject,
} from 'react-force-graph-2d';
import { useTagGraph } from '@/hooks/useTagRelationships';
import { useIsMobile } from '@/hooks/use-mobile';
import { Slider } from '@/components/ui/slider';
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
import { Maximize2, Filter } from 'lucide-react';
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
  const graphRef = useRef<ForceGraphMethods | undefined>();
  const observerRef = useRef<ResizeObserver | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [minScore, setMinScore] = useState(0.8);
  const [internalCategoryFilter, setInternalCategoryFilter] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<ForceNode | null>(null);

  const categoryFilter = externalCategoryFilter || internalCategoryFilter;

  const { data: graphData, isLoading } = useTagGraph(minScore, categoryFilter);

  const setContainer = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;

    const apply = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      setDimensions((prev) =>
        Math.abs(prev.width - w) < 4 && Math.abs(prev.height - h) < 4
          ? prev
          : { width: w, height: h },
      );
    };

    const rect = el.getBoundingClientRect();
    apply(Math.floor(rect.width), Math.floor(rect.height));

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        apply(Math.floor(entry.contentRect.width), Math.floor(entry.contentRect.height));
      }
    });
    observer.observe(el);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return;
    const g = graphRef.current;
    if (!g) return;
    const centerForce = g.d3Force('center') as
      | { x: (v: number) => void; y: (v: number) => void }
      | undefined;
    if (centerForce) {
      centerForce.x(dimensions.width / 2);
      centerForce.y(dimensions.height / 2);
    }
    g.d3ReheatSimulation();
  }, [dimensions.width, dimensions.height]);

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

  const nodeCanvasObject = useCallback(
    (node: NodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as ForceNode & { x: number; y: number; val: number };
      if (n.x === undefined || n.y === undefined) return;

      const size = Math.sqrt(n.val || 3) * 3;
      const isHovered = hoveredNode?.id === n.id;

      ctx.beginPath();
      ctx.arc(n.x, n.y, size, 0, 2 * Math.PI);
      ctx.fillStyle = isHovered ? '#ffffff' : NODE_COLOR;
      ctx.fill();
      ctx.strokeStyle = isHovered ? NODE_COLOR : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = isHovered ? 2 : 0.5;
      ctx.stroke();

      if (globalScale > 1.5 || isHovered) {
        const fontSize = isHovered ? 14 / globalScale : 11 / globalScale;
        ctx.font = `${isHovered ? 'bold ' : ''}${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const text = n.name;
        const textWidth = ctx.measureText(text).width;
        const padding = 2 / globalScale;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(
          n.x - textWidth / 2 - padding,
          n.y + size + 2 / globalScale,
          textWidth + padding * 2,
          fontSize + padding * 2,
        );

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

  if (isMobile) {
    const topNodes = [...(graphData?.nodes || [])]
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 20);

    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {graphData?.nodes.length || 0} tags, {graphData?.edges.length || 0} relationships
        </p>
        <div className="grid grid-cols-2 gap-3">
          {topNodes.map((node) => (
            <Card
              key={node.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onTagClick({ id: node.id, name: node.name })}
            >
              <CardContent style={{ padding: 12 }}>
                <p className="text-sm font-semibold truncate" style={{ fontSize: '0.8rem' }}>
                  {node.name}
                </p>
                {node.category && (
                  <span className="block text-xs text-muted-foreground mt-1" style={{ fontSize: '0.7rem' }}>
                    {node.category}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
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

        <div className="flex items-center gap-3" style={{ minWidth: 220 }}>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Min. similarity {Math.round(minScore * 100)}%
          </span>
          <Slider
            value={[minScore]}
            onValueChange={([v]) => setMinScore(v)}
            min={0.7}
            max={0.95}
            step={0.05}
            style={{ width: 120 }}
          />
        </div>

        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={handleZoomToFit}>
            <Maximize2 style={{ width: 14, height: 14 }} />
          </Button>
        </div>

        <Badge variant="secondary">
          {forceData.nodes.length} tags, {forceData.links.length} links
        </Badge>
      </div>

      {/* Graph */}
      <div
        ref={setContainer}
        className="flex-1 overflow-hidden bg-background relative"
        style={{ minHeight: 400 }}
      >
        {forceData.nodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 ? (
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
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              {forceData.nodes.length === 0
                ? 'No relationships found. Try lowering the similarity threshold.'
                : 'Preparing graph…'}
            </p>
          </div>
        )}

        {/* Hover tooltip */}
        {hoveredNode && (
          <div
            className="absolute bg-background p-3 pointer-events-none"
            style={{ top: 12, right: 12, maxWidth: 220 }}
          >
            <p className="text-sm font-semibold mb-1">
              {hoveredNode.name}
            </p>
            {hoveredNode.category && (
              <span className="block text-xs text-muted-foreground">
                {hoveredNode.category}
              </span>
            )}
            {hoveredNode.usage_count > 0 && (
              <span className="text-xs text-muted-foreground">
                {hoveredNode.usage_count} uses
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
