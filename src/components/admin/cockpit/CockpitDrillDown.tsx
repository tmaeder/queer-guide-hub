/**
 * CockpitDrillDown — one shared, controlled Sheet that any widget can open.
 * A widget calls ctx.openDrillDown({ title, render }); the dashboard owns the
 * panel state and renders the body here. Right-side on desktop, bottom on mobile.
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import type { DrillDownPanel } from './types';

interface CockpitDrillDownProps {
  panel: DrillDownPanel | null;
  onClose: () => void;
}

export function CockpitDrillDown({ panel, onClose }: CockpitDrillDownProps) {
  const isMobile = useIsMobile();

  return (
    <Sheet open={panel != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        {panel && (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle>{panel.title}</SheetTitle>
              {panel.description && <SheetDescription>{panel.description}</SheetDescription>}
            </SheetHeader>
            {panel.render()}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
