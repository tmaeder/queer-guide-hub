/**
 * CockpitSectionsSheet — show/hide the cockpit's sections, per role.
 *
 * Replaces CustomizeLayoutSheet. Same job at a coarser grain: the old sheet
 * toggled fourteen widgets in a draggable bento, this toggles four sections in
 * a fixed feed, because the order is the point (most urgent first) and is not
 * the admin's to rearrange.
 */

import { RotateCcw } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { CockpitSectionDef, CockpitSectionId } from '@/hooks/useCockpitSections';

export function CockpitSectionsSheet({
  open,
  onOpenChange,
  sections,
  isVisible,
  onToggle,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly CockpitSectionDef[];
  isVisible: (id: CockpitSectionId) => boolean;
  onToggle: (id: CockpitSectionId) => void;
  onReset: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-4">
          <SheetTitle>Cockpit sections</SheetTitle>
          <SheetDescription>
            Turn sections off if you never use them. Order is fixed — most urgent first.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col divide-y divide-border">
          {sections.map((section) => (
            <div key={section.id} className="flex items-center justify-between gap-4 py-2">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{section.label}</span>
                <span className="block text-2xs text-muted-foreground">{section.description}</span>
              </span>
              <Switch
                checked={isVisible(section.id)}
                onCheckedChange={() => onToggle(section.id)}
                aria-label={`Show ${section.label}`}
              />
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="mt-6 rounded-element" onClick={onReset}>
          <RotateCcw size={14} className="mr-2" aria-hidden />
          Show all sections
        </Button>
      </SheetContent>
    </Sheet>
  );
}
