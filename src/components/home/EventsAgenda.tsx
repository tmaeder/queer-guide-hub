import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, format, isToday, isTomorrow, isWeekend, startOfDay } from 'date-fns';
import { Heart } from 'lucide-react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeSection } from './HomeSection';
import { ParticleBurst } from '@/components/joy/ParticleBurst';
import { useEvents } from '@/hooks/useEvents';
import { useFavorites } from '@/hooks/useFavorites';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { useEntityImageAssets } from '@/hooks/useEntityImageAssets';
import { useUpcomingPrideEvents } from '@/hooks/useUpcomingPrideEvents';
import { dedupeEvents } from '@/utils/eventDedup';
import { resolveImageUrl } from '@/utils/resolveImageUrl';
import { getFallbackImage } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { cn } from '@/lib/utils';

type Event = {
  id: string;
  slug: string;
  title: string;
  start_date: string;
  end_date?: string | null;
  venue_name?: string | null;
  city?: string | null;
  // The `events` table has no `image_url` column — images live in `images[]`
  // and `logo_url`. The optimized R2 copy (when one exists) is fetched
  // separately via useEntityImageAssets and merged in resolveImageUrl below.
  images?: string[] | null;
  logo_url?: string | null;
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

function isOnNow(ev: Event, now: Date): boolean {
  const start = new Date(ev.start_date);
  if (start > now) return false;
  const end = ev.end_date ? new Date(ev.end_date) : null;
  return end != null && end >= now;
}

/** Pride-season strip — the guaranteed fallback when the 30-day agenda is empty. */
function PrideFallback() {
  const { t } = useTranslation();
  const { data: pride = [], isLoading } = useUpcomingPrideEvents({ months: 6, limit: 6 });

  if (isLoading || pride.length === 0) return null;

  return (
    <HomeSection
      eyebrow={t('home.events.eyebrow', "What's on")}
      title={t('home.events.prideFallback.title', 'Pride season ahead')}
      seeAllHref="/events"
      seeAllLabel={t('common.browseAll', 'Browse all')}
    >
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar">
        {pride.map((ev) => {
          const fallback = getFallbackImage('event', ev.id);
          const raw = ev.images?.find(Boolean) ?? null;
          const img = isValidImageUrl(raw) ? raw! : fallback;
          return (
            <LocalizedLink
              key={ev.id}
              to={ev.slug ? `/events/${ev.slug}` : '/events'}
              className="group snap-start shrink-0 w-[240px] no-underline"
            >
              <img
                src={img}
                alt=""
                aria-hidden
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                }}
                className="aspect-[3/2] w-full rounded-element bg-muted object-cover transition-transform group-hover:scale-[1.02]"
              />
              <p className="mt-2 truncate text-15 font-semibold tracking-tight">{ev.title}</p>
              <p className="truncate text-13 text-muted-foreground">
                {[ev.city?.name, ev.start_date ? format(new Date(ev.start_date), 'MMM d') : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </LocalizedLink>
          );
        })}
      </div>
    </HomeSection>
  );
}

/** Card-confined save control with a joy burst on save (homepage joy zone). */
function SaveButton({ eventId, className }: { eventId: string; className?: string }) {
  const { t } = useTranslation();
  const { isFavorited, toggleFavorite } = useFavorites('event');
  const [burst, setBurst] = useState(false);
  const saved = isFavorited(eventId);

  return (
    <button
      type="button"
      aria-label={saved ? t('common.unsave', 'Remove from saved') : t('common.save', 'Save')}
      aria-pressed={saved}
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-full',
        'bg-background/85 backdrop-blur-sm border border-border text-foreground transition-colors hover:border-foreground/40',
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!saved) setBurst(true);
        void toggleFavorite(eventId);
      }}
    >
      <Heart className={cn('h-4 w-4', saved && 'fill-current')} aria-hidden="true" />
      {burst && <ParticleBurst onDone={() => setBurst(false)} />}
    </button>
  );
}

/**
 * Live, date-grouped agenda of upcoming events (location-aware): one lead
 * event card + scannable rows grouped under Today / Tomorrow / This weekend /
 * This week / Later. Falls back city → global (in useEvents wiring below) →
 * pride season, so the section never silently vanishes.
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

  const { lead, groups } = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const upcoming = dedupeEvents(events as Event[])
      .filter((e) => new Date(e.start_date) >= todayStart)
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      .slice(0, MAX_EVENTS);

    // Lead = the soonest event that has real imagery (falls back to the very
    // first). Pulled out of the agenda list so it isn't shown twice.
    const leadEv =
      upcoming.find((e) => isValidImageUrl(e.images?.find(Boolean) ?? e.logo_url ?? null)) ??
      upcoming[0] ??
      null;
    const rest = upcoming.filter((e) => e.id !== leadEv?.id);

    const map = new Map<GroupKey, Event[]>();
    for (const ev of rest) {
      const key = bucketFor(new Date(ev.start_date), now);
      (map.get(key) ?? map.set(key, []).get(key)!).push(ev);
    }
    return {
      lead: leadEv,
      groups: GROUP_ORDER.filter((k) => map.get(k)?.length).map((k) => ({
        key: k,
        events: map.get(k)!,
      })),
    };
  }, [events]);

  // Prefer the R2-optimized mirror when one exists. Keyed off the same visible
  // events so the lookup is bounded. Called unconditionally (before the early
  // return) to keep hook order stable.
  const eventIds = useMemo(
    () => [...(lead ? [lead.id] : []), ...groups.flatMap((g) => g.events.map((e) => e.id))],
    [lead, groups],
  );
  const { assets } = useEntityImageAssets('event', eventIds);

  const empty = !lead && groups.length === 0;

  if (!loading && empty) return <PrideFallback />;

  const title = userLocation?.city
    ? t('home.upcoming.titleNear', 'Upcoming Events Near You')
    : t('home.upcoming.title', 'Upcoming Events');

  const now = new Date();
  const resolveEventImage = (ev: Event, preferThumb: boolean) => {
    const rawImg = ev.images?.find(Boolean) ?? ev.logo_url ?? null;
    const asset = assets.get(ev.id);
    return (
      resolveImageUrl({
        imageUrl: isValidImageUrl(rawImg) ? rawImg : null,
        optimizedUrl: asset?.optimized_url ?? null,
        thumbnailUrl: asset?.thumbnail_url ?? null,
        preferThumb,
      }) || getFallbackImage('event', ev.id)
    );
  };

  return (
    <HomeSection
      eyebrow={t('home.events.eyebrow', "What's on")}
      title={title}
      seeAllHref="/events"
      seeAllLabel={t('common.browseAll', 'Browse all')}
    >
      {loading && empty ? (
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
          <Skeleton className="aspect-[16/10] w-full rounded-container" />
          <div className="flex flex-col gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-element" />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
          {lead && (
            <div className="relative self-start">
            <LocalizedLink
              to={`/events/${lead.slug}`}
              className="group relative block overflow-hidden rounded-container border border-border no-underline"
            >
              <img
                src={resolveEventImage(lead, false)}
                alt=""
                aria-hidden
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const fb = getFallbackImage('event', lead.id);
                  if (e.currentTarget.src !== fb) e.currentTarget.src = fb;
                }}
                className="aspect-[16/10] w-full bg-muted object-cover transition-transform group-hover:scale-[1.02]"
              />
              <div className="img-scrim-readable absolute inset-0" />
              <div className="absolute bottom-0 start-0 end-0 p-6 text-white">
                <div className="mb-2 flex items-center gap-2">
                  {isOnNow(lead, now) ? (
                    <Badge variant="default" className="gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" aria-hidden />
                      {t('home.events.onNow', 'On now')}
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      {format(new Date(lead.start_date), 'EEE, MMM d')}
                    </Badge>
                  )}
                </div>
                <p className="font-display text-title md:text-headline font-bold leading-tight">
                  {lead.title}
                </p>
                {(lead.venue_name || lead.city) && (
                  <p className="mt-1 truncate text-13 opacity-90">
                    {[lead.venue_name, lead.city].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </LocalizedLink>
            <SaveButton eventId={lead.id} className="absolute top-4 end-4" />
            </div>
          )}

          <div className="flex flex-col gap-8">
            {groups.map((group) => (
              <div key={group.key}>
                <Eyebrow
                  as="div"
                  className={cn('mb-2', group.key === 'today' && 'font-bold text-foreground')}
                >
                  {t(`home.events.groups.${group.key}`, group.key)}
                </Eyebrow>
                <div className="grid grid-cols-1">
                  {group.events.map((ev) => {
                    const d = new Date(ev.start_date);
                    const onNow = isOnNow(ev, now);
                    return (
                      <LocalizedLink
                        key={ev.id}
                        to={`/events/${ev.slug}`}
                        className="group grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 rounded-element border-t border-border px-2 py-4 no-underline transition-colors hover:bg-muted"
                      >
                        <img
                          src={resolveEventImage(ev, true)}
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
                        {onNow ? (
                          <Badge variant="default" className="shrink-0 gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
                              aria-hidden
                            />
                            {t('home.events.onNow', 'On now')}
                          </Badge>
                        ) : (
                          <span className="shrink-0 text-right text-13 font-semibold tabular-nums text-muted-foreground">
                            {format(d, 'EEE d')}
                          </span>
                        )}
                      </LocalizedLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </HomeSection>
  );
};

export default EventsAgenda;
