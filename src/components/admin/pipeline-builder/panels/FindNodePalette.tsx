import { useState, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import * as Icons from 'lucide-react';
import type { Node } from '@xyflow/react';

interface FindNodePaletteProps {
  nodes: Node[];
  onSelect: (nodeId: string) => void;
}

/**
 * Cmd+F node finder — fuzzy-search nodes on canvas, click to center and select.
 */
export default function FindNodePalette({ nodes, onSelect }: FindNodePaletteProps) {
  const [open, setOpen] = useState(false);
  const { fitView, setCenter, getNode } = useReactFlow();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
      if (mod && e.key === 'f' && !inInput && nodes.length > 0) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nodes.length]);

  const handleSelect = (nodeId: string) => {
    const n = getNode(nodeId);
    if (n) {
      const cx = (n.position?.x || 0) + (n.width || 200) / 2;
      const cy = (n.position?.y || 0) + (n.height || 80) / 2;
      setCenter(cx, cy, { zoom: 1.2, duration: 400 });
    }
    onSelect(nodeId);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-lg gap-0">
        <Command className="rounded-lg">
          <CommandInput placeholder="Find node on canvas... (Esc to close)" autoFocus />
          <CommandList className="max-h-[400px]">
            <CommandEmpty>No nodes match</CommandEmpty>
            <CommandGroup heading={`${nodes.length} nodes on canvas`}>
              {nodes.map(n => {
                const d = n.data as { label?: string; icon?: string; color?: string; nodeTypeSlug?: string; status?: string };
                const Icon = d.icon
                  ? (Icons as Record<string, unknown>)[d.icon] as React.ComponentType<{ className?: string }> || Icons.Box
                  : Icons.Box;
                const color = d.color || '#6b7280';
                return (
                  <CommandItem
                    key={n.id}
                    value={`${d.label || ''} ${d.nodeTypeSlug || ''} ${n.id}`}
                    onSelect={() => handleSelect(n.id)}
                    className="gap-2.5 cursor-pointer"
                  >
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      <Icon className="h-3 w-3" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.label || d.nodeTypeSlug || n.id}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">{d.nodeTypeSlug || n.id.slice(0, 12)}</div>
                    </div>
                    {d.status && (
                      <span className={`text-[10px] px-1.5 py-0 rounded ${
                        d.status === 'completed' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                        : d.status === 'failed' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                        : d.status === 'running' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'bg-muted text-muted-foreground'
                      }`}>
                        {d.status}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
