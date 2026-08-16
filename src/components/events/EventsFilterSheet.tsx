import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ShareFiltersButton } from '@/components/events/ShareFiltersButton';
import {
  EventFiltersPanel,
  type EventFiltersPanelProps,
} from '@/components/events/EventFiltersPanel';

interface EventsFilterSheetProps extends Omit<EventFiltersPanelProps, 'singleColumn'> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Live result count for the footer button. */
  resultCount?: number;
}

/**
 * The demoted "everything else" filter surface for /events.
 *
 * This panel used to render INLINE inside the page's filter block, so opening it
 * pushed the results down by its full height — on a phone that is most of a
 * screen, and it happened on the one interaction that means "show me more".
 * Same demotion `MarketplaceFilterSheet` performs, and `side="right"` matches
 * it: on a phone the sheet is full-width, which is the room a panel of eight
 * pickers and two calendars actually needs.
 */
export function EventsFilterSheet({
  open,
  onOpenChange,
  resultCount,
  onApply,
  ...panel
}: EventsFilterSheetProps) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('pages.events.filters', 'Filters')}</SheetTitle>
        </SheetHeader>

        {/* `singleColumn`: the panel's own grid steps to 2 columns at md and 4 at
            lg, which are VIEWPORT queries — inside a 448px sheet on a desktop
            they would lay four pickers across 448px. */}
        <EventFiltersPanel
          {...panel}
          singleColumn
          onApply={() => {
            onApply();
            onOpenChange(false);
          }}
        />

        <SheetFooter className="mt-auto flex-row items-center gap-2 pt-4">
          <ShareFiltersButton />
          <Button className="flex-1" onClick={() => onOpenChange(false)}>
            {typeof resultCount === 'number'
              ? t('pages.events.showResults', {
                  count: resultCount,
                  defaultValue: `Show ${resultCount} events`,
                })
              : t('pages.events.showResultsGeneric', 'Show results')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
