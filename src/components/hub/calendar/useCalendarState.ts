import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { addDays, addMonths, addWeeks } from 'date-fns';
import { localDayKey } from './types';
import type { CalendarView } from './types';

const VIEWS: CalendarView[] = ['month', 'week', 'day'];

function parseDateParam(raw: string | null): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * URL-backed calendar state on the static /hub/plans route:
 * ?view=month|week|day&date=YYYY-MM-DD. Writes use replace:true and preserve
 * unrelated params (e.g. the /travel ?cityId trip-seed family). Invalid or
 * absent params → month view anchored on today.
 */
export function useCalendarState() {
  const [searchParams, setSearchParams] = useSearchParams();

  const view: CalendarView = VIEWS.includes(searchParams.get('view') as CalendarView)
    ? (searchParams.get('view') as CalendarView)
    : 'month';

  const date = useMemo(() => {
    const parsed = parseDateParam(searchParams.get('date'));
    if (parsed) return parsed;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, [searchParams]);

  const update = useCallback(
    (next: { view?: CalendarView; date?: Date }) => {
      setSearchParams(
        (prev) => {
          if (next.view) prev.set('view', next.view);
          if (next.date) prev.set('date', localDayKey(next.date));
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setView = useCallback((v: CalendarView) => update({ view: v }), [update]);
  const goToday = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    update({ date: today });
  }, [update]);
  const goPrev = useCallback(() => {
    update({
      date:
        view === 'month' ? addMonths(date, -1) : view === 'week' ? addWeeks(date, -1) : addDays(date, -1),
    });
  }, [update, view, date]);
  const goNext = useCallback(() => {
    update({
      date:
        view === 'month' ? addMonths(date, 1) : view === 'week' ? addWeeks(date, 1) : addDays(date, 1),
    });
  }, [update, view, date]);
  const goDay = useCallback((d: Date) => update({ view: 'day', date: d }), [update]);

  return { view, date, setView, goToday, goPrev, goNext, goDay };
}
