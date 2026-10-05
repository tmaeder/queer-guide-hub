import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrackLoader } from '@/components/transit/TrackLoader';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { useCalendarState } from '@/components/hub/calendar/useCalendarState';
import { useCalendarLayers } from '@/components/hub/calendar/useCalendarLayers';
import { useCalendarItems } from '@/components/hub/calendar/useCalendarItems';
import { CalendarToolbar } from '@/components/hub/calendar/CalendarToolbar';
import { MonthGrid } from '@/components/hub/calendar/MonthGrid';
import { WeekView } from '@/components/hub/calendar/WeekView';
import { DayView } from '@/components/hub/calendar/DayView';
import { TripsStrip } from '@/components/hub/TripsStrip';
import { AMBIENT_TRIP_CONTEXT_ENABLED } from '@/lib/trips/ambientTripFlags';

/**
 * Hub Plans module — the unified calendar (2026-07). Month/week/day views over
 * toggleable layers: personal commitments (trips/bookings + event RSVPs/saves/
 * group events via get_my_agenda), friends' birthdays (opt-in, month+day
 * only), queer-history anniversaries and saved news. The trip portfolio stays
 * visible above the calendar so planning context is never hidden in a drawer.
 */
export function PlansModule() {
  const { t } = useTranslation();
  const { view, date, setView, goToday, goPrev, goNext, goDay } = useCalendarState();
  const { enabled, toggle } = useCalendarLayers();

  // Fetch window = the visible range (month grid includes leading/trailing
  // week overflow).
  const { from, to } = useMemo(() => {
    if (view === 'month') {
      return {
        from: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }),
        to: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }),
      };
    }
    if (view === 'week') {
      return {
        from: startOfWeek(date, { weekStartsOn: 1 }),
        to: endOfWeek(date, { weekStartsOn: 1 }),
      };
    }
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    return { from: dayStart, to: dayEnd };
  }, [view, date]);

  const { byDay, loading } = useCalendarItems(from, to, enabled);

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('hub.modules.plans', { defaultValue: 'Plans' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('hub.plans.description', {
            defaultValue: 'Your commitments, queer calendar and trips.',
          })}
        </p>
      </header>

      {AMBIENT_TRIP_CONTEXT_ENABLED ? (
        <section id="hub-trips" aria-label={t('hub.plans.trips', { defaultValue: 'Your trips' })}>
          <TripsStrip hideTitle />
        </section>
      ) : null}

      <section
        className="flex flex-col gap-4"
        aria-label={t('hub.plans.sections.calendar', { defaultValue: 'Calendar' })}
      >
        <CalendarToolbar
          view={view}
          date={date}
          onView={setView}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          enabledLayers={enabled}
          onToggleLayer={toggle}
          {...(AMBIENT_TRIP_CONTEXT_ENABLED
            ? {
                onOpenTrips: () =>
                  document.getElementById('hub-trips')?.scrollIntoView?.({ block: 'start' }),
              }
            : {})}
        />

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <TrackLoader size={20} />
          </div>
        ) : view === 'month' ? (
          <MonthGrid date={date} byDay={byDay} onSelectDay={goDay} />
        ) : view === 'week' ? (
          <WeekView date={date} byDay={byDay} onSelectDay={goDay} />
        ) : (
          <DayView date={date} byDay={byDay} />
        )}
      </section>
    </div>
  );
}
