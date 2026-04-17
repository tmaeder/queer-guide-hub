import { useState, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, GitBranch, X } from 'lucide-react';
import type { Edge } from '@xyflow/react';

const EXAMPLES = [
  'items_count > 0',
  'entity_type == "venue"',
  'source_name != "foursquare" && items_count >= 10',
  'dry_run == false',
];

interface Props {
  edge: Edge | null;
  onClose: () => void;
  onUpdate: (edgeId: string, condition: string) => void;
  onDelete: (edgeId: string) => void;
  anchorX: number;
  anchorY: number;
}

export default function EdgeConditionPopover({ edge, onClose, onUpdate, onDelete, anchorX, anchorY }: Props) {
  const [condition, setCondition] = useState('');

  useEffect(() => {
    if (edge) {
      const existing = (edge.data as { condition?: string })?.condition
        || (edge as unknown as { condition?: string }).condition
        || '';
      setCondition(existing);
    }
  }, [edge]);

  if (!edge) return null;

  const handleSave = () => {
    onUpdate(edge.id, condition.trim());
    onClose();
  };

  const handleClear = () => {
    setCondition('');
    onUpdate(edge.id, '');
    onClose();
  };

  return (
    <div
      className="fixed z-50"
      style={{ left: anchorX, top: anchorY }}
    >
      <Popover open onOpenChange={(o) => !o && onClose()}>
        <PopoverTrigger asChild>
          <span className="absolute" />
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3" side="bottom" align="center">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Edge Condition</span>
            <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="text-[10px] text-muted-foreground mb-2">
            Expression evaluated at runtime. Downstream node is skipped if false.
          </div>

          <Input
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="e.g. items_count > 0"
            className="h-8 text-xs font-mono"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') onClose();
            }}
          />

          <div className="mt-2 text-[10px] text-muted-foreground">
            <div className="mb-1 font-medium">Examples:</div>
            <div className="flex flex-col gap-0.5">
              {EXAMPLES.map(ex => (
                <button
                  key={ex}
                  onClick={() => setCondition(ex)}
                  className="text-left font-mono hover:bg-accent px-1 py-0.5 rounded transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 text-[10px] text-muted-foreground">
            <span className="font-medium">Available vars: </span>
            <span className="font-mono">items_count, items_valid, items_invalid, entity_type, source_name, dry_run</span>
          </div>

          <div className="flex gap-1.5 mt-3">
            <Button size="sm" variant="default" className="h-7 text-xs flex-1" onClick={handleSave}>
              Save
            </Button>
            {condition && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleClear}>
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive hover:text-destructive"
              onClick={() => { onDelete(edge.id); onClose(); }}
            >
              Delete edge
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
