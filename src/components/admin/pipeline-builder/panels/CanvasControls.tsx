import { useCallback, useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { ZoomIn, ZoomOut, Maximize, Crosshair, Camera, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';

interface CanvasControlsProps {
  pipelineName: string;
  hasSelection: boolean;
}

/**
 * Floating canvas controls (bottom-right). Replaces React Flow's default
 * Controls component with a more refined set that includes fit-to-selection
 * and PNG export.
 */
export default function CanvasControls({ pipelineName, hasSelection }: CanvasControlsProps) {
  const { zoomIn, zoomOut, fitView, getViewport, getNodes } = useReactFlow();
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Poll zoom level (react-flow doesn't expose a subscription)
  useEffect(() => {
    const interval = setInterval(() => {
      const v = getViewport();
      setZoom(v.zoom);
    }, 200);
    return () => clearInterval(interval);
  }, [getViewport]);

  const handleFitAll = useCallback(() => {
    fitView({ padding: 0.15, duration: 300 });
  }, [fitView]);

  const handleFitSelection = useCallback(() => {
    const selected = getNodes().filter(n => n.selected);
    if (selected.length === 0) return;
    fitView({ nodes: selected, padding: 0.3, duration: 300 });
  }, [fitView, getNodes]);

  const handleExportPNG = useCallback(async () => {
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const container = document.querySelector('.react-flow') as HTMLElement | null;
      if (!container) throw new Error('Canvas not found');

      const dataUrl = await toPng(container, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
      });

      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pipelineName || 'pipeline'}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Canvas exported as PNG');
    } catch (_e) {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }, [pipelineName]);

  return (
    <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1 bg-popover border border-border rounded-lg shadow-lg p-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => zoomIn({ duration: 150 })}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">Zoom in</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => zoomOut({ duration: 150 })}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">Zoom out</TooltipContent>
      </Tooltip>

      <div className="text-2xs text-center font-mono text-muted-foreground py-0.5 select-none">
        {Math.round(zoom * 100)}%
      </div>

      <div className="h-px bg-border my-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleFitAll}>
            <Maximize className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">Fit all nodes</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleFitSelection}
            disabled={!hasSelection}
          >
            <Crosshair className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">Fit to selection</TooltipContent>
      </Tooltip>

      <div className="h-px bg-border my-0.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={handleExportPNG}
            disabled={exporting}
          >
            {exporting ? <Download className="h-3.5 w-3.5 animate-pulse" /> : <Camera className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">Export as PNG</TooltipContent>
      </Tooltip>
    </div>
  );
}
