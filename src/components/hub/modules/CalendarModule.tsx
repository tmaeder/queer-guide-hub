import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plane, Ticket, Calendar as CalendarIcon, Star, CalendarPlus, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useMyAgenda, type AgendaItem, type AgendaKind } from '@/hooks/useMyAgenda';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';

const KIND_ICON: Record<AgendaKind, LucideIcon> = {
  trip: Plane,
  reservation: Ticket,
  event_rsvp: CalendarIcon,
  event_saved: Star,
};

const KIND_LABEL_KEY: Record<AgendaKind, string> = {
  trip: 'hub.calendar.kinds.trip',
  reservation: 'hub.calendar.kinds.reservation',
  event_rsvp: 'hub.calendar.kinds.going',
  event_saved: 'hub.calendar.kinds.saved',
};

const KIND_LABEL_DEFAULT: Record<AgendaKind, string> = {
  trip: 'Trip',
  reservation: 'Booking',
  event_rsvp: 'Going',
  event_saved: 'Saved',
};

function AgendaRow({ item }: { item: AgendaItem }) {
  const { t } = useTranslation();
  const Icon = KIND_ICON[item.kind];
  const time = item.all_day
    ? t('hub.calendar.allDay', { defaultValue: 'All day' })
    : new Date(item.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <LocalizedLink
      to={item.open_target}
      className="flex items-center gap-2 rounded-element border border-border px-4 py-2 no-underline transition-colors hover:bg-muted"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        {item.subtitle && (
          <p className="truncate text-13 text-muted-foreground">{item.subtitle}</p>
        )}
      </div>
      <span className="shrink-0 text-13 text-muted-foreground">
        {t(KIND_LABEL_KEY[item.kind], { defaultValue: KIND_LABEL_DEFAULT[item.kind] })} · {time}
      </span>
    </LocalizedLink>
  );
}

/**
 * Hub calendar module — an agenda-first list of the viewer's upcoming
 * commitments (trips, bookings, event RSVPs, dated saved events) grouped by
 * day, plus an ICS subscribe affordance (reuses the saved-events feed).
 */
export function CalendarModule() {
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
    <div className="flex flex-col gap-4">
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
        <p className="py-16 text-center text-sm text-muted-foreground">
          {t('hub.calendar.empty', { defaultValue: 'Nothing upcoming yet.' })}
        </p>
      ) : (
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
      )}

      {!loading && days.length > 0 && (
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setHorizonDays((d) => d + 90)}>
            {t('hub.calendar.showMore', { defaultValue: 'Look further ahead' })}
          </Button>
        </div>
      )}
    </div>
  );
}
