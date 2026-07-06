import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgendaRow } from '@/components/hub/AgendaRow';
import { TripsTab } from '@/components/profile/tabs/TripsTab';
import { useMyAgenda } from '@/hooks/useMyAgenda';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';

/**
 * Hub Plans module — the merged Calendar + Trips surface (2026-07). The
 * agenda (the viewer's upcoming trips, bookings, RSVPs and dated saved events,
 * grouped by day, with an ICS subscribe affordance) sits on top; the trip
 * manager + travel inbox (TripsTab) sits below. This removes the old
 * double-listing where a trip appeared in both /hub/calendar and /hub/trips.
 */
export function PlansModule() {
  const { t } = useTranslation();
  const { copyCalendarFeedUrl, loading: feedLoading } = useCalendarFeed();

  // Rolling window: today → +60d. "Show more" widens the horizon.
  const [horizonDays, setHorizonDays] = useState(60);
  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + horizonDays);
    return { from: start, to: end };
  }, [horizonDays]);

  const { days, loading } = useMyAgenda(from, to);

  const dayLabel = (key: string) => {
    const d = new Date(`${key}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diff === 0) return t('hub.calendar.today', { defaultValue: 'Today' });
    if (diff === 1) return t('hub.calendar.tomorrow', { defaultValue: 'Tomorrow' });
    return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-title font-display">
            {t('hub.calendar.title', { defaultValue: 'Upcoming' })}
          </h2>
          <Button variant="outline" size="sm" onClick={copyCalendarFeedUrl} disabled={feedLoading}>
            <CalendarPlus className="mr-1 h-3.5 w-3.5" aria-hidden />
            {t('hub.calendar.subscribe', { defaultValue: 'Subscribe' })}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : days.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('hub.calendar.empty', { defaultValue: 'Nothing upcoming yet.' })}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-6">
              {days.map((day) => (
                <section key={day.date} className="flex flex-col gap-2">
                  <h3 className="sticky top-0 z-[1] bg-background py-1 text-13 font-semibold uppercase tracking-wider text-muted-foreground">
                    {dayLabel(day.date)}
                  </h3>
                  {day.items.map((item) => (
                    <AgendaRow key={item.id} item={item} />
                  ))}
                </section>
              ))}
            </div>
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setHorizonDays((d) => d + 90)}>
                {t('hub.calendar.showMore', { defaultValue: 'Look further ahead' })}
              </Button>
            </div>
          </>
        )}
      </section>

      {/* Trip manager + travel inbox (the former /hub/trips body). */}
      <section className="flex flex-col gap-2">
        <h2 className="text-title font-display">
          {t('hub.plans.trips', { defaultValue: 'Your trips' })}
        </h2>
        <TripsTab />
      </section>
    </div>
  );
}
