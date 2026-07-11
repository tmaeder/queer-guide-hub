import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TripsStrip } from '@/components/hub/TripsStrip';

/**
 * Trip management drawer for the unified calendar. Wraps the unchanged
 * TripsStrip (which itself handles the /travel ?cityId deep-link seed and
 * CreateTripDialog auto-open).
 */
export function TripsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{t('hub.calendar.tripsDrawer.title', { defaultValue: 'Your trips' })}</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <TripsStrip hideTitle />
        </div>
      </SheetContent>
    </Sheet>
  );
}
