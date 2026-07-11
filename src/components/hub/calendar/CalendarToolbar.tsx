import { useTranslation } from 'react-i18next';
import { CalendarPlus, ChevronLeft, ChevronRight, Plane } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';
import { CalendarLayersMenu } from './CalendarLayersMenu';
import type { CalendarLayerId, CalendarView } from './types';

/**
 * Unified calendar toolbar: range label + prev/today/next, view switcher,
 * layer toggles, trips drawer trigger and the ICS subscribe affordance.
 */
export function CalendarToolbar({
  view,
  date,
  onView,
  onPrev,
  onNext,
  onToday,
  enabledLayers,
  onToggleLayer,
  onOpenTrips,
}: {
  view: CalendarView;
  date: Date;
  onView: (v: CalendarView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  enabledLayers: Set<CalendarLayerId>;
  onToggleLayer: (id: CalendarLayerId) => void;
  onOpenTrips: () => void;
}) {
  const { t } = useTranslation();
  const { copyCalendarFeedUrl, loading: feedLoading } = useCalendarFeed();

  const rangeLabel =
    view === 'day'
      ? date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : date.toLocaleDateString([], { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onPrev}
            aria-label={t('hub.calendar.nav.prev', { defaultValue: 'Previous' })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onNext}
            aria-label={t('hub.calendar.nav.next', { defaultValue: 'Next' })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            {t('hub.calendar.nav.today', { defaultValue: 'Today' })}
          </Button>
          <h2 className="ml-2 text-title font-display">{rangeLabel}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={view} onValueChange={(v) => onView(v as CalendarView)}>
            <TabsList>
              <TabsTrigger value="month">
                {t('hub.calendar.views.month', { defaultValue: 'Month' })}
              </TabsTrigger>
              <TabsTrigger value="week">
                {t('hub.calendar.views.week', { defaultValue: 'Week' })}
              </TabsTrigger>
              <TabsTrigger value="day">
                {t('hub.calendar.views.day', { defaultValue: 'Day' })}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <CalendarLayersMenu enabled={enabledLayers} onToggle={onToggleLayer} />
          <Button variant="outline" size="sm" onClick={onOpenTrips}>
            <Plane className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('hub.calendar.tripsButton', { defaultValue: 'Trips' })}
          </Button>
          <Button variant="outline" size="sm" onClick={copyCalendarFeedUrl} disabled={feedLoading}>
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('hub.calendar.subscribe', { defaultValue: 'Subscribe' })}
          </Button>
        </div>
      </div>
    </div>
  );
}
