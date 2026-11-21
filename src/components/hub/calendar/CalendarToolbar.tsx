import { useTranslation } from 'react-i18next';
import { CalendarPlus, ChevronLeft, ChevronRight, Plane } from '@/components/icons';
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
  onOpenTrips?: () => void;
}) {
  const { t } = useTranslation();
  const { copyCalendarFeedUrl, loading: feedLoading } = useCalendarFeed();

  const rangeLabel =
    view === 'day'
      ? date.toLocaleDateString([], {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : date.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const pill =
    'inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="flex flex-col gap-4">
      {/* Where you are, and how to move. */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="min-w-0 truncate text-headline font-bold leading-none">{rangeLabel}</h2>
        <div className="flex shrink-0 items-center gap-1 rounded-full bg-muted p-1">
          <button
            type="button"
            className={`${pill} w-10`}
            onClick={onPrev}
            aria-label={t('hub.calendar.nav.prev', { defaultValue: 'Previous' })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={`${pill} px-4`} onClick={onToday}>
            {t('hub.calendar.nav.today', { defaultValue: 'Today' })}
          </button>
          <button
            type="button"
            className={`${pill} w-10`}
            onClick={onNext}
            aria-label={t('hub.calendar.nav.next', { defaultValue: 'Next' })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* What to show. Labels collapse to icons on a phone so this stays one row. */}
      <div className="flex items-center justify-between gap-2">
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
        <div className="flex items-center gap-1">
          <CalendarLayersMenu enabled={enabledLayers} onToggle={onToggleLayer} />
          {onOpenTrips ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full px-2 sm:px-4"
              onClick={onOpenTrips}
              aria-label={t('hub.calendar.tripsButton', { defaultValue: 'Trips' })}
            >
              <Plane className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">
                {t('hub.calendar.tripsButton', { defaultValue: 'Trips' })}
              </span>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full px-2 sm:px-4"
            onClick={copyCalendarFeedUrl}
            disabled={feedLoading}
            aria-label={t('hub.calendar.subscribe', { defaultValue: 'Subscribe' })}
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">
              {t('hub.calendar.subscribe', { defaultValue: 'Subscribe' })}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}
