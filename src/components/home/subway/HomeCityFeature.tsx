import { useEffect, useMemo, useState } from 'react';
import { useWhen, whenRange } from '@/lib/whenSelection';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { Image } from '@/components/ui/Image';
import { ImageCredit } from '@/components/ui/ImageCredit';
import { DISCOVERY_EVENT_WINDOW_MS, selectDiscoveryEvent } from '@/lib/discoveryEvent';
import { useEventsQuery } from '@/hooks/useEvents';
import { useOptimizedCity } from '@/hooks/usePlaces';
import { resolveEntityImage } from '@/lib/images/resolveEntityImage';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
import { useHomeRegionContext } from '@/components/home/homeRegionContext';
import { RegionChip } from '@/components/home/RegionChip';
import { useCityPhotos } from '@/hooks/useCityPhotos';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { ChevronLeft, ChevronRight, Pause, Play } from '@/components/icons';
import { CityNetwork } from './CityNetwork';

import { HOME_FALLBACK_CITY_SLUG as FALLBACK_SLUG } from '@/components/home/useHomeCity';
/** Long enough to read the plate; WCAG 2.2.2 is met by the pause control. */
const SLIDE_MS = 7000;

interface Slide {
  url: string;
  alt: string;
  attribution?: string | null;
  license?: string | null;
}

export function HomeCityFeature() {
  const { t, i18n } = useTranslation();
  // Same region as the bands below, so the hero never names a different city.
  // Empty slug while the region resolves keeps the fallback from flashing.
  const region = useHomeRegionContext();
  const slug = region.loading ? '' : region.citySlug || FALLBACK_SLUG;
  const { city } = useOptimizedCity(slug);
  const cityName = city?.name ?? '';
  // The region resolves AFTER first paint, so for ~300-800ms `slug` is '' and there is
  // no city. Rendering the city half anyway published a dangling `/events?city=` and
  // `/venues?city=` (empty filter), a 'Browse  events' label with the name missing, a
  // city-guide link with no accessible name, and a SECOND 'Browse places' inside the
  // hero -- which is also what made four home-magazine e2e cases fail. Hold the
  // city-dependent half until there is a city to name.
  const cityReady = Boolean(city && cityName);
  const isFallback = slug === FALLBACK_SLUG;
  const photo = resolveEntityImage('city', city);
  const metadata = photo.metadata as
    { attribution?: string; photographer?: string; license?: string } | null | undefined;
  const { data: gallery = [] } = useCityPhotos(city?.id);
  // The gallery only replaces the city's own photo when it holds several distinct
  // ones; a single linked asset is usually the same photo the city row already has.
  const slides: Slide[] =
    gallery.length > 1 || (!photo.url && gallery.length > 0)
      ? gallery.map((g) => ({
          url: g.url,
          alt: g.alt ?? '',
          attribution: g.attribution,
          license: g.license,
        }))
      : photo.url
        ? [
            {
              url: photo.url,
              alt: '',
              attribution: metadata?.attribution || metadata?.photographer,
              license: metadata?.license,
            },
          ]
        : [];
  const reducedMotion = useReducedMotion();
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  // A new city starts on its first photo.
  const [slideCity, setSlideCity] = useState(city?.id);
  if (slideCity !== city?.id) {
    setSlideCity(city?.id);
    setSlideIndex(0);
  }
  const current = slides[slideIndex % Math.max(slides.length, 1)];
  const autoplay = slides.length > 1 && !reducedMotion && !paused && !hovering && !focused;
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => setSlideIndex((i) => i + 1), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [autoplay, city?.id]);
  const step = (delta: number) =>
    setSlideIndex(
      (i) => ((((i % slides.length) + delta) % slides.length) + slides.length) % slides.length,
    );
  const [now] = useState(Date.now);
  // The shared "when", if the visitor picked one; else a day-stable window that
  // keeps the query cached and distant featured events out.
  const [when] = useWhen();
  const picked = useMemo(() => (when ? whenRange(when, new Date(now)) : null), [when, now]);
  const start = picked ? picked.start.getTime() : new Date(now).setUTCHours(0, 0, 0, 0);
  const end = picked ? picked.end.getTime() : start + DISCOVERY_EVENT_WINDOW_MS;
  const { events } = useEventsQuery(
    city?.id
      ? {
          cityId: city.id,
          limit: 12,
          dateRange: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
        }
      : null,
  );
  const event = selectDiscoveryEvent(
    events.filter((item) => item.city_id === city?.id),
    now,
  );
  const date = event
    ? new Intl.DateTimeFormat(i18n.language, {
        timeZone: city?.timezone ?? undefined,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(event.start_date))
    : null;
  const eventTitle = event
    ? localizedField(event.title, event.title_i18n as I18nMap, i18n.language)
    : t('home.cityFeature.browseEvents', 'Browse {{city}} events', { city: cityName });

  return (
    <section aria-labelledby="home-city-feature-title" className="min-w-0">
      <div
        role="group"
        aria-label={t('home.cityFeature.photos', 'Photos')}
        className="relative overflow-hidden rounded-panel bg-surface-container"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        {current ? (
          <Image
            key={current.url}
            src={current.url}
            alt={current.alt}
            aspect="card"
            frameClassName={slides.length > 1 ? 'min-h-72' : undefined}
            rounded="none"
            priority
            sizes="(min-width: 1600px) 800px, (min-width: 1024px) 51vw, 92vw"
          />
        ) : (
          <div aria-hidden="true" className="aspect-[16/10] px-6 pb-16 pt-4 sm:px-10">
            <CityNetwork slug={slug} variant="thumb" className="h-full" />
          </div>
        )}
        <div className="absolute inset-x-2 top-2 flex flex-wrap items-start justify-end gap-2 sm:inset-x-4 sm:top-4">
          {slides.length > 1 && (
            <div className="flex shrink-0 items-center gap-0.5 rounded-element bg-card p-0.5">
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t('home.cityFeature.previousPhoto', 'Previous photo')}
                className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
              >
                <ChevronLeft size={18} className="rtl:rotate-180" />
              </button>
              <span
                className="min-w-8 text-center text-13 font-bold tabular-nums"
                aria-live={autoplay ? 'off' : 'polite'}
              >
                {(slideIndex % slides.length) + 1}/{slides.length}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={t('home.cityFeature.nextPhoto', 'Next photo')}
                className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
              >
                <ChevronRight size={18} className="rtl:rotate-180" />
              </button>
              {!reducedMotion && (
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-pressed={paused}
                  aria-label={t('home.cityFeature.pausePhotos', 'Pause slideshow')}
                  className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end justify-between gap-x-2 gap-y-1 sm:inset-x-4 sm:bottom-4">
          {/* One plate: the city guide link and the control that changes the
              city. Before a city is known it is just the picker. */}
          {cityReady ? (
            <div className="inline-flex items-center rounded-element bg-card pe-1">
              <h2 id="home-city-feature-title" className="text-headline leading-none">
                <LocalizedLink
                  to={`/city/${city?.slug ?? slug}`}
                  aria-label={t('home.cityFeature.exploreCity', '{{city}} city guide', {
                    city: cityName,
                  })}
                  className="inline-flex min-h-11 items-center gap-2 rounded-element px-4 py-2 font-display text-foreground underline-offset-4 hover:underline rtl:font-sans rtl:font-bold"
                >
                  {cityName}
                  <TransitIcon name="arrow-right" size={20} className="rtl:rotate-180" />
                </LocalizedLink>
              </h2>
              <span aria-hidden className="h-6 w-px bg-border" />
              <RegionChip region={region} align="start" compact />
            </div>
          ) : (
            <RegionChip region={region} align="start" />
          )}
          {current && (current.attribution || current.license) && (
            <ImageCredit
              attribution={current.attribution ?? undefined}
              license={current.license ?? undefined}
              className="rounded-badge bg-black/60 px-1.5 py-0.5 text-white backdrop-blur-sm"
            />
          )}
        </div>
      </div>

      {cityReady && (
        <ul className="mt-1 grid divide-y divide-border-hairline sm:grid-cols-2 sm:divide-y-0">
          <li className="min-w-0 sm:pe-4">
            <LocalizedLink
              to={
                event
                  ? `/events/${event.slug || event.id}`
                  : `/events?city=${encodeURIComponent(cityName)}`
              }
              className="flex min-h-14 items-center gap-2 rounded-element px-2 py-2 no-underline underline-offset-4 hover:underline"
            >
              <TransitIcon name="events" size={20} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-13 text-muted-foreground">
                  {date && event ? (
                    <time dateTime={event.start_date}>{date}</time>
                  ) : (
                    t('home.cityFeature.whatsOn', 'What’s on')
                  )}
                </span>
                <span className="line-clamp-2 text-15 font-bold">{eventTitle}</span>
              </span>
            </LocalizedLink>
          </li>
          <li className="min-w-0 sm:border-s sm:border-border-hairline sm:ps-4">
            <LocalizedLink
              to={
                isFallback
                  ? '/venues/regenbogenhaus'
                  : `/venues?city=${encodeURIComponent(cityName)}`
              }
              className="flex min-h-14 items-center gap-2 rounded-element px-2 py-2 no-underline underline-offset-4 hover:underline"
            >
              <TransitIcon name="near-you" size={20} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-13 text-muted-foreground">
                  {isFallback ? t('home.cityFeature.communitySpace', 'Community space') : cityName}
                </span>
                <span className="block text-15 font-bold">
                  {isFallback ? 'Regenbogenhaus' : t('home.discovery.places', 'Browse places')}
                </span>
              </span>
            </LocalizedLink>
          </li>
        </ul>
      )}
    </section>
  );
}
