import { Trash2, LayoutGrid, Boxes, X, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface MultiSelectActionBarProps {
  count: number;
  onDeselect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onLayoutSelected: () => void;
  onSaveAsTemplate: () => void;
}

/**
 * Floating action bar shown at the bottom of the canvas when 2+ nodes are selected.
 * Provides bulk operations that make sense across a selection.
 */
export default function MultiSelectActionBar({
  count,
  onDeselect,
  onDelete,
  onDuplicate,
  onLayoutSelected,
  onSaveAsTemplate,
}: MultiSelectActionBarProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-popover border border-border rounded-lg shadow-lg px-2 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <span className="text-xs font-medium px-2 text-muted-foreground">
        {count} selected
      </span>
      <div className="h-4 w-px bg-border mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5 mr-1" />
            Duplicate
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Duplicate all selected nodes</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onLayoutSelected}>
            <LayoutGrid className="h-3.5 w-3.5 mr-1" />
            Auto-arrange
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Layout only selected subgraph</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onSaveAsTemplate}>
            <Boxes className="h-3.5 w-3.5 mr-1" />
            Save as template
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Save selection as a reusable template</TooltipContent>
      </Tooltip>

      <div className="h-4 w-px bg-border mx-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Delete {count} nodes and their edges</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onDeselect}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Deselect all</TooltipContent>
      </Tooltip>
    </div>
  );
}
