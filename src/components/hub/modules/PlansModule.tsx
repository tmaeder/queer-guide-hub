import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AgendaRow } from '@/components/hub/AgendaRow';
import { TripsTab } from '@/components/profile/tabs/TripsTab';
import { useMyAgenda, type AgendaKind } from '@/hooks/useMyAgenda';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';

type AgendaScope = 'all' | 'trips' | 'groups';

const TRIP_KINDS: AgendaKind[] = ['trip', 'reservation'];

const chipClass = (active: boolean) =>
  cn(
    'flex min-h-0 items-center whitespace-nowrap rounded-badge border px-4 py-2 text-13',
    active ? 'bg-foreground text-background' : 'bg-background text-foreground',
  );

/**
 * Hub Plans module — the merged Calendar + Trips surface (2026-07). The
 * agenda (the viewer's upcoming trips, bookings, RSVPs, dated saved events,
 * and events from groups they belong to, grouped by day, with an ICS
 * subscribe affordance) sits on top; the trip manager + travel inbox
 * (TripsTab) sits below. This removes the old double-listing where a trip
 * appeared in both /hub/calendar and /hub/trips.
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

  const { days: allDays, loading } = useMyAgenda(from, to);

  // Only offer the Groups chip when the current window actually has a group
  // event — same empty-affordance discipline as the inbox's filter chips.
  const [scope, setScope] = useState<AgendaScope>('all');
  const hasGroupEvents = useMemo(
    () => allDays.some((day) => day.items.some((item) => item.kind === 'group_event')),
    [allDays],
  );

  const days = useMemo(() => {
    if (scope === 'all') return allDays;
    const kinds = scope === 'trips' ? TRIP_KINDS : (['group_event'] as AgendaKind[]);
    return allDays
      .map((day) => ({ ...day, items: day.items.filter((item) => kinds.includes(item.kind)) }))
      .filter((day) => day.items.length > 0);
  }, [allDays, scope]);

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

        {!loading && allDays.length > 0 && (
          <div className="flex gap-2 overflow-x-auto" role="tablist">
            <button
              role="tab"
              aria-selected={scope === 'all'}
              onClick={() => setScope('all')}
              className={chipClass(scope === 'all')}
            >
              {t('hub.calendar.scope.all', { defaultValue: 'All' })}
            </button>
            <button
              role="tab"
              aria-selected={scope === 'trips'}
              onClick={() => setScope('trips')}
              className={chipClass(scope === 'trips')}
            >
              {t('hub.calendar.scope.trips', { defaultValue: 'Trips' })}
            </button>
            {hasGroupEvents && (
              <button
                role="tab"
                aria-selected={scope === 'groups'}
                onClick={() => setScope('groups')}
                className={chipClass(scope === 'groups')}
              >
                {t('hub.calendar.scope.groups', { defaultValue: 'Groups' })}
              </button>
            )}
          </div>
        )}

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
