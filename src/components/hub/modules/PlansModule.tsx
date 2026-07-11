import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from 'date-fns';
import { useCalendarState } from '@/components/hub/calendar/useCalendarState';
import { useCalendarLayers } from '@/components/hub/calendar/useCalendarLayers';
import { useCalendarItems } from '@/components/hub/calendar/useCalendarItems';
import { CalendarToolbar } from '@/components/hub/calendar/CalendarToolbar';
import { MonthGrid } from '@/components/hub/calendar/MonthGrid';
import { WeekView } from '@/components/hub/calendar/WeekView';
import { DayView } from '@/components/hub/calendar/DayView';
import { TripsDrawer } from '@/components/hub/calendar/TripsDrawer';
import { Loader2 } from 'lucide-react';

/**
 * Hub Plans module — the unified calendar (2026-07). Month/week/day views over
 * toggleable layers: personal commitments (trips/bookings + event RSVPs/saves/
 * group events via get_my_agenda), friends' birthdays (opt-in, month+day
 * only), queer-history anniversaries and saved news. Trip management lives in
 * a side drawer (TripsDrawer → TripsStrip); a /travel ?cityId deep link
 * auto-opens it.
 */
export function PlansModule() {
  const { view, date, setView, goToday, goPrev, goNext, goDay } = useCalendarState();
  const { enabled, toggle } = useCalendarLayers();
  const [tripsOpen, setTripsOpen] = useState(false);

  // /travel deep-link seed (?cityId=…) → open the trips drawer; the
  // CreateTripDialog auto-open lives inside TripsStrip itself.
  const [searchParams] = useSearchParams();
  const hasTripSeed = !!searchParams.get('cityId');
  useEffect(() => {
    if (hasTripSeed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setTripsOpen(true);
    }
  }, [hasTripSeed]);

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
    <div className="flex flex-col gap-4">
      <CalendarToolbar
        view={view}
        date={date}
        onView={setView}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        enabledLayers={enabled}
        onToggleLayer={toggle}
        onOpenTrips={() => setTripsOpen(true)}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      ) : view === 'month' ? (
        <MonthGrid date={date} byDay={byDay} onSelectDay={goDay} />
      ) : view === 'week' ? (
        <WeekView date={date} byDay={byDay} onSelectDay={goDay} />
      ) : (
        <DayView date={date} byDay={byDay} />
      )}

      <TripsDrawer open={tripsOpen} onOpenChange={setTripsOpen} />
    </div>
  );
}
