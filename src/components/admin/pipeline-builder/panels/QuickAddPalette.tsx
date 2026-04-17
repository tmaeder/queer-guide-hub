import { useState, useEffect } from 'react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import * as Icons from 'lucide-react';
import type { PipelineNodeType } from '../hooks/usePipelineBuilder';

interface QuickAddPaletteProps {
  nodeTypes: PipelineNodeType[];
  onAdd: (nodeType: PipelineNodeType) => void;
}

const categoryLabels: Record<string, string> = {
  source: 'Sources',
  processor: 'Processors',
  validator: 'Validators',
  enricher: 'Enrichers',
  output: 'Outputs',
  control: 'Control',
};

export default function QuickAddPalette({ nodeTypes, onAdd }: QuickAddPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
      if (mod && e.key === 'k' && !inInput) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = (nt: PipelineNodeType) => {
    onAdd(nt);
    setOpen(false);
  };

  // Group by category, preserve category order
  const grouped: Record<string, PipelineNodeType[]> = {};
  for (const nt of nodeTypes) {
    if (!grouped[nt.category]) grouped[nt.category] = [];
    grouped[nt.category].push(nt);
  }
  const categoryOrder = ['source', 'processor', 'validator', 'enricher', 'output', 'control'];
  const orderedCategories = categoryOrder.filter(c => grouped[c]?.length > 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-xl gap-0">
        <Command className="rounded-lg">
          <CommandInput placeholder="Type to search nodes... (Esc to close)" autoFocus />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No nodes found</CommandEmpty>
            {orderedCategories.map(cat => (
              <CommandGroup key={cat} heading={categoryLabels[cat] || cat}>
                {grouped[cat].map(nt => {
                  const Icon = (Icons as Record<string, unknown>)[nt.icon] as React.ComponentType<{ className?: string }> || Icons.Box;
                  return (
                    <CommandItem
                      key={nt.slug}
                      value={`${nt.display_name} ${nt.slug} ${nt.description || ''}`}
                      onSelect={() => handleSelect(nt)}
                      className="gap-2.5 cursor-pointer"
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${nt.color}20`, color: nt.color }}
                      >
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{nt.display_name}</div>
                        {nt.description && (
                          <div className="text-[11px] text-muted-foreground truncate">{nt.description}</div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
