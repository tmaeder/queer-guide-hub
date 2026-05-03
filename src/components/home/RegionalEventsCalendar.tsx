import React, { useEffect, useMemo } from 'react';
import { useEvents } from '@/hooks/useEvents';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { addDays, format, isSameDay, startOfDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

type Event = {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  venue_name?: string | null;
  city?: string | null;
  image_url?: string | null;
  featured?: boolean | null;
};

const Hairline = () => <div className="h-px bg-current opacity-10" />;

const DISPLAY = "'Plus Jakarta Sans', sans-serif";
const BODY = "'Inter', sans-serif";

const RegionalEventsCalendar: React.FC = () => {
  const { events, loading, fetchEvents } = useEvents(false);
  const { location: userLocation, loading: locationLoading } = useVisitorLocation();
  const { t } = useTranslation();

  useEffect(() => {
    if (locationLoading) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30);
    const range = { start: now.toISOString(), end: end.toISOString() };
    const city = userLocation?.city;
    if (city) {
      fetchEvents({ city, dateRange: range }, { signal }).then((res) => {
        if (!signal.aborted && res.fetched === 0) {
          fetchEvents({ dateRange: range }, { signal });
        }
      });
    } else {
      fetchEvents({ dateRange: range }, { signal });
    }
    return () => ctrl.abort();
  }, [userLocation?.city, locationLoading, fetchEvents]);

  const { hero, list, days, eventsByDay, today } = useMemo(() => {
    const all = events as Event[];
    const featured = all.find((e) => e.is_featured);
    const heroEvent = featured ?? all[0] ?? null;
    const rest = all.filter((e) => e.id !== heroEvent?.id).slice(0, 6);

    const now = new Date();
    const start = startOfDay(now);
    const daysArr = Array.from({ length: 14 }, (_, i) => addDays(start, i));
    const map = new Map<string, Event[]>();
    daysArr.forEach((d) => map.set(d.toISOString(), []));
    all.forEach((ev) => {
      const d = new Date(ev.start_date);
      const key = daysArr.find((x) => isSameDay(x, d))?.toISOString();
      if (key) map.get(key)!.push(ev);
    });
    map.forEach((lst) =>
      lst.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()),
    );

    return {
      hero: heroEvent,
      list: rest,
      days: daysArr,
      eventsByDay: map,
      today: start,
    };
  }, [events]);

  if (loading) return null;
  if (!hero) return null;

  const monthLabel = format(new Date(), 'MMMM yyyy').toUpperCase();
  const heroHref = `/events/${hero.slug}`;
  const headline = userLocation?.city
    ? t('home.upcoming.titleNear', 'Upcoming Events Near You')
    : t('home.upcoming.title', 'Upcoming Events');

  const activeDays = days.filter(
    (d) => (eventsByDay.get(d.toISOString()) || []).length > 0,
  );

  return (
    <section className="w-full px-4 py-8 sm:px-6 md:px-8 md:py-16">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <h2
            className="m-0 text-[1.75rem] font-extrabold leading-[1.1] tracking-tight md:text-[2.25rem]"
            style={{ fontFamily: DISPLAY }}
          >
            {headline}
          </h2>
          <div
            className="text-[0.8125rem] uppercase text-muted-foreground md:text-sm"
            style={{ fontFamily: BODY, letterSpacing: '0.08em' }}
          >
            {monthLabel}
          </div>
        </div>
        <LocalizedLink
          to="/events"
          className="whitespace-nowrap text-[0.8125rem] text-foreground no-underline transition-opacity hover:opacity-70 md:text-sm"
          style={{ fontFamily: BODY }}
        >
          {t('common.browseAll', 'Browse all')} →
        </LocalizedLink>
      </div>
      <Hairline />

      {/* Hero + index */}
      <div
        className={cn(
          'mt-6 grid grid-cols-1 gap-y-6 md:mt-8 md:gap-y-0',
          list.length > 0 ? 'md:grid-cols-[3fr_2fr] md:gap-x-8' : 'md:grid-cols-1',
        )}
      >
        {/* Hero */}
        <LocalizedLink
          to={heroHref}
          className="block text-foreground no-underline transition-opacity hover:opacity-85"
        >
          {hero.image_url && (
            <div className="mb-4 aspect-[4/3] w-full overflow-hidden bg-muted">
              <img
                src={hero.image_url}
                alt=""
                className="block h-full w-full object-cover"
              />
            </div>
          )}
          <div
            className="mb-2 text-sm font-extrabold uppercase text-[hsl(var(--brand))] md:text-base"
            style={{
              fontFamily: DISPLAY,
              letterSpacing: '0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {format(new Date(hero.start_date), 'dd MMM').toUpperCase()}
          </div>
          <h3
            className="m-0 mb-3 overflow-hidden font-bold leading-[1.15]"
            style={{
              fontFamily: DISPLAY,
              fontSize: 'clamp(1.5rem, 3.2vw, 2.5rem)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {hero.title}
          </h3>
          {(hero.venue_name || hero.city) && (
            <div
              className="text-sm text-muted-foreground md:text-[0.9375rem]"
              style={{ fontFamily: BODY }}
            >
              {[hero.venue_name, hero.city].filter(Boolean).join(' · ')}
            </div>
          )}
        </LocalizedLink>

        {/* Index list */}
        {list.length > 0 && (
          <div className="self-start p-0 md:bg-accent md:p-6">
            {list.map((ev, idx) => (
              <React.Fragment key={ev.id}>
                {idx > 0 && <Hairline />}
                <LocalizedLink
                  to={`/events/${ev.slug}`}
                  className="group grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 py-3 text-foreground no-underline md:py-4"
                >
                  <div
                    className="whitespace-nowrap text-xs font-medium uppercase text-muted-foreground"
                    style={{
                      fontFamily: BODY,
                      letterSpacing: '0.06em',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {format(new Date(ev.start_date), 'dd MMM').toUpperCase()}
                  </div>
                  <div
                    className="overflow-hidden whitespace-nowrap text-ellipsis text-[0.9375rem] font-semibold leading-[1.3] transition-opacity group-hover:opacity-70 md:text-base"
                    style={{ fontFamily: DISPLAY }}
                  >
                    {ev.title}
                  </div>
                  <div
                    className="text-muted-foreground transition-transform group-hover:translate-x-1"
                    style={{ fontFamily: BODY }}
                  >
                    →
                  </div>
                </LocalizedLink>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming dates strip */}
      {activeDays.length > 0 && (
        <div className="mt-8 border-t pt-6 md:mt-12 md:pt-8">
          <div
            className="mb-4 text-xs font-medium uppercase text-muted-foreground md:mb-6"
            style={{ fontFamily: BODY, letterSpacing: '0.08em' }}
          >
            {t('home.upcoming.next14', 'Next 14 days')}
          </div>
          <div
            className="grid gap-x-3 gap-y-6 md:gap-x-4"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))' }}
          >
            {activeDays.map((day) => {
              const items = eventsByDay.get(day.toISOString()) || [];
              const isToday = isSameDay(day, today);
              const top = items[0];
              return (
                <LocalizedLink
                  key={day.toISOString()}
                  to={`/events/${top.slug}`}
                  className="block min-w-0 text-foreground no-underline transition-opacity hover:opacity-70"
                >
                  <div
                    className="text-[0.6875rem] font-medium uppercase text-muted-foreground"
                    style={{ fontFamily: BODY, letterSpacing: '0.08em' }}
                  >
                    {format(day, 'EEE')}
                  </div>
                  <div
                    className={cn(
                      'mb-2 text-2xl font-light leading-none md:text-[1.75rem]',
                      isToday && 'text-[hsl(var(--brand))]',
                    )}
                    style={{ fontFamily: DISPLAY, fontVariantNumeric: 'tabular-nums' }}
                  >
                    {format(day, 'd')}
                  </div>
                  <div
                    className="overflow-hidden text-[0.8125rem] font-semibold leading-[1.3]"
                    style={{
                      fontFamily: DISPLAY,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {top.title}
                  </div>
                  {items.length > 1 && (
                    <div
                      className="mt-1 text-[0.6875rem] text-muted-foreground"
                      style={{ fontFamily: BODY }}
                    >
                      +{items.length - 1}
                    </div>
                  )}
                </LocalizedLink>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default RegionalEventsCalendar;
