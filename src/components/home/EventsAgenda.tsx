import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, isToday, isTomorrow, isWeekend, startOfDay } from 'date-fns';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { HomeSection } from './HomeSection';
import { useEvents } from '@/hooks/useEvents';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { dedupeEvents } from '@/utils/eventDedup';
import { getFallbackImage } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

type Event = {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  venue_name?: string | null;
  city?: string | null;
  image_url?: string | null;
  is_featured?: boolean | null;
};

type GroupKey = 'today' | 'tomorrow' | 'thisWeekend' | 'thisWeek' | 'later';
const GROUP_ORDER: GroupKey[] = ['today', 'tomorrow', 'thisWeekend', 'thisWeek', 'later'];
const MAX_EVENTS = 10;

function bucketFor(d: Date, now: Date): GroupKey {
  if (isToday(d)) return 'today';
  if (isTomorrow(d)) return 'tomorrow';
  const within7 = d <= addDays(startOfDay(now), 7);
  if (isWeekend(d) && within7) return 'thisWeekend';
  if (within7) return 'thisWeek';
  return 'later';
}

/**
 * Live, date-grouped agenda of upcoming events (location-aware). Groups the
 * soonest events under Today / Tomorrow / This weekend / This week / Later —
 * scannable rows with a thumbnail, not a card rail or a feature+list block.
 */
const EventsAgenda = () => {
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

  const groups = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const upcoming = dedupeEvents(events as Event[])
      .filter((e) => new Date(e.start_date) >= todayStart)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .slice(0, MAX_EVENTS);

    const map = new Map<GroupKey, Event[]>();
    for (const ev of upcoming) {
      const key = bucketFor(new Date(ev.start_date), now);
      (map.get(key) ?? map.set(key, []).get(key)!).push(ev);
    }
    return GROUP_ORDER.filter((k) => map.get(k)?.length).map((k) => ({
      key: k,
      events: map.get(k)!,
    }));
  }, [events]);

  if (loading || groups.length === 0) return null;

  const title = userLocation?.city
    ? t('home.upcoming.titleNear', 'Upcoming Events Near You')
    : t('home.upcoming.title', 'Upcoming Events');

  return (
    <HomeSection
      eyebrow={t('home.events.eyebrow', "What's on")}
      title={title}
      seeAllHref="/events"
      seeAllLabel={t('common.browseAll', 'Browse all')}
    >
      <div className="flex flex-col gap-10">
        {groups.map((group) => (
          <div key={group.key}>
            <Eyebrow as="div" className="mb-4">
              {t(`home.events.groups.${group.key}`, group.key)}
            </Eyebrow>
            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-10">
              {group.events.map((ev) => {
                const d = new Date(ev.start_date);
                const img = isValidImageUrl(ev.image_url)
                  ? (ev.image_url as string)
                  : getFallbackImage('event', ev.id);
                return (
                  <LocalizedLink
                    key={ev.id}
                    to={`/events/${ev.slug}`}
                    className="group grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 border-t border-border py-4 no-underline"
                  >
                    <img
                      src={img}
                      alt=""
                      aria-hidden
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const fb = getFallbackImage('event', ev.id);
                        if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                      }}
                      className="h-14 w-14 shrink-0 rounded-element bg-muted object-cover"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-15 font-semibold leading-tight tracking-tight transition-opacity group-hover:opacity-70">
                        {ev.title}
                      </span>
                      {(ev.venue_name || ev.city) && (
                        <span className="mt-0.5 block truncate text-13 text-muted-foreground">
                          {[ev.venue_name, ev.city].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right text-13 font-semibold tabular-nums text-muted-foreground">
                      {format(d, 'EEE d')}
                    </span>
                  </LocalizedLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </HomeSection>
  );
};

export default EventsAgenda;
