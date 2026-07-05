import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CalendarPlus, Copy, MapPin, Plane } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AuthGate } from '@/components/layout/AuthGate';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCalendarItems, type CalendarItem } from '@/hooks/useCalendarItems';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';
import { cn } from '@/lib/utils';

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Every day a trip spans, clamped to the given month window. */
function tripDays(start: string, end: string, winStart: Date, winEnd: Date): Date[] {
  const days: Date[] = [];
  let d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last) {
    if (d >= winStart && d <= winEnd) days.push(new Date(d));
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

function AgendaRow({ item }: { item: CalendarItem }) {
  const { t } = useTranslation();
  if (item.kind === 'trip') {
    const range =
      item.start_date === item.end_date
        ? new Date(`${item.start_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        : `${new Date(`${item.start_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(`${item.end_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    return (
      <Link
        to={item.path}
        className="flex items-center gap-4 rounded-element border border-border bg-muted/50 px-4 py-2 hover:bg-muted transition-colors"
      >
        <Plane size={16} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {item.city ? `${item.city} · ` : ''}
            {range}
          </p>
        </div>
        <Badge variant="outline" className="rounded-badge shrink-0">
          {t('calendar.trip', { defaultValue: 'Trip' })}
        </Badge>
      </Link>
    );
  }
  const time = new Date(item.start_date).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Link
      to={item.path}
      className="flex items-center gap-4 rounded-element border border-border px-4 py-2 hover:bg-muted/50 transition-colors"
    >
      <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">{time}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.title}</p>
        {(item.venue_name || item.city) && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground truncate">
            <MapPin size={10} className="shrink-0" />
            {[item.venue_name, item.city].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  );
}

/** Personal calendar: month grid + agenda of the user's trips and saved events. */
export default function MyCalendarPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState<Date>(() => new Date());
  const [selected, setSelected] = useState<Date | undefined>(undefined);
  const dayRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { loading: feedLoading, copyCalendarFeedUrl, downloadCalendarFile } = useCalendarFeed();

  const winStart = useMemo(() => new Date(month.getFullYear(), month.getMonth(), 1), [month]);
  const winEnd = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59),
    [month],
  );
  const { data: items = [], isLoading } = useCalendarItems(winStart, winEnd);

  const { byDay, sortedKeys, eventDates, tripDates } = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    const evDates: Date[] = [];
    const trDates: Date[] = [];
    for (const item of items) {
      if (item.kind === 'trip') {
        const span = tripDays(item.start_date, item.end_date, winStart, winEnd);
        trDates.push(...span);
        // Agenda: anchor the trip on its first visible day
        const anchor = span[0] ?? winStart;
        const k = dayKey(anchor);
        map.set(k, [...(map.get(k) ?? []), item]);
      } else {
        const d = new Date(item.start_date);
        evDates.push(d);
        const k = dayKey(d);
        map.set(k, [...(map.get(k) ?? []), item]);
      }
    }
    return {
      byDay: map,
      sortedKeys: [...map.keys()].sort(),
      eventDates: evDates,
      tripDates: trDates,
    };
  }, [items, winStart, winEnd]);

  const handleSelect = (d: Date | undefined) => {
    setSelected(d);
    if (!d) return;
    dayRefs.current[dayKey(d)]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fmtHeading = (k: string) =>
    new Date(`${k}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

  return (
    <AuthGate
      title={t('calendar.title', { defaultValue: 'My calendar' })}
      description={t('calendar.signInDesc', { defaultValue: 'Sign in to see your trips and saved events.' })}
    >
      <div className="container mx-auto py-8 px-4">
        <PageHeader
          title={t('calendar.title', { defaultValue: 'My calendar' })}
          subtitle={t('calendar.subtitle', { defaultValue: 'Your trips and saved events in one place' })}
        />

        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-col gap-4 md:self-start">
            <div className="rounded-element border border-border">
              <Calendar
                mode="single"
                month={month}
                onMonthChange={setMonth}
                selected={selected}
                onSelect={handleSelect}
                modifiers={{ hasEvents: eventDates, tripDay: tripDates }}
                modifiersClassNames={{
                  hasEvents: 'font-bold underline underline-offset-4',
                  tripDay: 'bg-foreground/10',
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={feedLoading}
                onClick={copyCalendarFeedUrl}
              >
                <Copy size={14} />
                {t('calendar.copyFeed', { defaultValue: 'Copy subscribe URL' })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={feedLoading}
                onClick={downloadCalendarFile}
              >
                <CalendarPlus size={14} />
                {t('calendar.download', { defaultValue: 'Download .ics' })}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {isLoading ? (
              <div className="h-20 rounded-container border border-border bg-card animate-pulse" />
            ) : sortedKeys.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {t('calendar.empty', { defaultValue: 'No trips or saved events this month.' })}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/me/trips">{t('calendar.planTrip', { defaultValue: 'Plan a trip' })}</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/events">{t('calendar.browseEvents', { defaultValue: 'Browse events' })}</Link>
                  </Button>
                </div>
              </div>
            ) : (
              sortedKeys.map((k) => (
                <section
                  key={k}
                  ref={(el) => {
                    dayRefs.current[k] = el;
                  }}
                  aria-label={fmtHeading(k)}
                >
                  <h3
                    className={cn(
                      'mb-2 text-13 font-semibold uppercase tracking-wider',
                      selected && dayKey(selected) === k ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {fmtHeading(k)}
                  </h3>
                  <div className="flex flex-col gap-2">
                    {byDay.get(k)!.map((item) => (
                      <AgendaRow key={`${item.kind}-${item.id}`} item={item} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </AuthGate>
  );
}
