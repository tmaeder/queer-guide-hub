/**
 * CustomizeLayoutSheet — master show/hide/reset panel for cockpit widgets.
 * Lists every role-eligible widget with a visibility toggle. Reorder happens by
 * dragging in the grid (edit mode); this sheet is the discoverable + a11y path
 * for toggling visibility and resetting to the role default.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import type { CockpitWidgetDef } from './types';

interface CustomizeLayoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** All widgets the current role is allowed to see. */
  eligible: CockpitWidgetDef[];
  visibleIds: Set<string>;
  onToggleVisible: (id: string) => void;
  onReset: () => void;
}

export function CustomizeLayoutSheet({
  open,
  onOpenChange,
  eligible,
  visibleIds,
  onToggleVisible,
  onReset,
}: CustomizeLayoutSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>Customize cockpit</SheetTitle>
          <SheetDescription>
            Toggle widgets on or off. Drag cards in the grid to reorder them.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col divide-y divide-border">
          {eligible.map((def) => {
            const Icon = def.icon;
            return (
              <div key={def.id} className="flex items-center justify-between gap-4 py-2">
                <span className="flex items-center gap-2 min-w-0">
                  <Icon size={15} className="text-muted-foreground shrink-0" aria-hidden />
                  <span className="text-sm truncate">{def.title}</span>
                </span>
                <Switch
                  checked={visibleIds.has(def.id)}
                  onCheckedChange={() => onToggleVisible(def.id)}
                  aria-label={`Show ${def.title}`}
                />
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="mt-6 rounded-element"
          onClick={onReset}
        >
          <RotateCcw size={14} className="mr-2" aria-hidden />
          Reset to default
        </Button>
      </SheetContent>
    </Sheet>
  );
}
