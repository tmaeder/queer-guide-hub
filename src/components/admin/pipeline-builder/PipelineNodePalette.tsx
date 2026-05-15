import type { DragEvent } from '@xyflow/react';
import { Search } from 'lucide-react';
import { resolvePipelineIcon } from './icon-registry';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { PipelineNodeType } from './hooks/usePipelineBuilder';

const categoryLabels: Record<string, string> = {
  source: 'Sources',
  processor: 'Processors',
  validator: 'Validators',
  enricher: 'Enrichers',
  output: 'Outputs',
  control: 'Control',
};

const categoryOrder = ['source', 'processor', 'validator', 'enricher', 'output', 'control'];

interface Props {
  paletteSearch: string;
  setPaletteSearch: (s: string) => void;
  nodeTypesByCategory: Record<string, PipelineNodeType[]>;
  onDragStart: (event: DragEvent<HTMLDivElement>, nodeType: PipelineNodeType) => void;
  onQuickAdd: (nt: PipelineNodeType) => void;
}

export default function PipelineNodePalette({
  paletteSearch,
  setPaletteSearch,
  nodeTypesByCategory,
  onDragStart,
  onQuickAdd,
}: Props) {
  return (
    <div className="w-60 shrink-0 flex flex-col border-r border-border bg-muted/30 overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border">
        <div className="font-semibold text-sm">Node Palette</div>
        <div className="text-xs2 text-muted-foreground mt-0.5">Drag onto canvas</div>
        <div className="relative mt-2">
          <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={paletteSearch}
            onChange={(e) => setPaletteSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full h-7 pl-6 pr-2 text-xs border border-border rounded-element bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {paletteSearch && (
            <button
              onClick={() => setPaletteSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm leading-none p-1"
              title="Clear search"
            >×</button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {paletteSearch && Object.values(nodeTypesByCategory).every(t => !t || t.length === 0) && (
          <div className="text-center text-xs2 text-muted-foreground py-6 px-2">
            No nodes match "{paletteSearch}"
          </div>
        )}
        <div className="flex flex-col gap-3">
          {categoryOrder.map(cat => {
            const types = nodeTypesByCategory[cat];
            if (!types?.length) return null;
            return (
              <div key={cat}>
                <div className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">
                  {categoryLabels[cat] || cat}
                </div>
                <div className="flex flex-col gap-0.5">
                  {types.map(nt => {
                    const Icon = resolvePipelineIcon(nt.icon);
                    return (
                      <Tooltip key={nt.slug}>
                        <TooltipTrigger asChild>
                          <div
                            role="button"
                            tabIndex={0}
                            aria-label={`Add ${nt.display_name} node`}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-element cursor-grab text-sm hover:bg-accent focus:bg-accent focus:outline-none focus:ring-1 focus:ring-ring transition-colors active:cursor-grabbing"
                            draggable
                            onDragStart={(e) => onDragStart(e as unknown as DragEvent<HTMLDivElement>, nt)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onQuickAdd(nt);
                              }
                            }}
                          >
                            <div
                              className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${nt.color}20`, color: nt.color }}
                            >
                              <Icon className="h-3 w-3" />
                            </div>
                            <span className="truncate">{nt.display_name}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs max-w-[200px]">
                          <div className="font-medium">{nt.display_name}</div>
                          {nt.description && <div className="text-muted-foreground mt-0.5">{nt.description}</div>}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
