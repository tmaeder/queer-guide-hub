import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { ChevronLeft, ChevronRight, Pause, Play } from '@/components/icons';
import { Image } from '@/components/ui/Image';
import { useFeaturedVenues } from '@/hooks/useVenuesV2Data';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useVenueCategoryLabel } from '@/lib/venueCategories';
import { venueClosureLabel } from '@/lib/venueClosureLabel';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { localizedField, type I18nMap } from '@/lib/localizeContent';
import type { Database } from '@/integrations/supabase/types';

type Venue = Database['public']['Tables']['venues']['Row'];

const ROTATE_MS = 7000;

/**
 * Rotating featured venue. Advances every 7s; pauses on hover, on focus, and
 * when the reader presses pause. Never autoplays under reduced motion.
 * Starts on a random slide so the first venue differs between visits.
 */
export function VenuesHero({ fallback }: { fallback?: Venue }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const { venues: featured } = useFeaturedVenues();
  const pool = useMemo(
    () =>
      featured.filter(
        (v) => !v.safety_gated && !venueClosureLabel(v) && v.images?.some(isValidImageUrl),
      ),
    [featured],
  );
  // A random starting slide, chosen once, so the first venue differs per visit.
  const [offset] = useState(() => Math.floor(Math.random() * 1000));
  const slides = pool.length ? pool : fallback ? [fallback] : [];

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [manual, setManual] = useState(false);
  const autoplay = slides.length > 1 && !reduced && !paused && !hovering;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [autoplay]);

  if (!slides.length) return null;
  const venue = slides[(index + offset) % slides.length];
  const step = (d: number) => {
    setManual(true);
    setIndex((i) => (i + d + slides.length) % slides.length);
  };

  return (
    <section
      aria-roledescription={slides.length > 1 ? 'carousel' : undefined}
      aria-label={
        pool.length ? t('venues.hero.label', 'Featured venue') : t('venues.title', 'Venues')
      }
      className="relative min-w-0 overflow-hidden rounded-panel bg-card shadow-soft"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovering(false);
      }}
    >
      <div aria-live={manual ? 'polite' : 'off'}>
        <HeroSlide key={venue.id} venue={venue} />
      </div>
      {slides.length > 1 && (
        <div className="absolute top-2 end-2 flex items-center gap-0.5 rounded-element bg-background/90 p-0.5 shadow-soft">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={t('venues.hero.previous', 'Previous venue')}
            className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
          >
            <ChevronLeft size={16} className="rtl:rotate-180" />
          </button>
          <span className="min-w-8 text-center text-13 font-bold tabular-nums">
            {(index % slides.length) + 1}/{slides.length}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={t('venues.hero.next', 'Next venue')}
            className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
          >
            <ChevronRight size={16} className="rtl:rotate-180" />
          </button>
          {!reduced && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-pressed={paused}
              aria-label={t('venues.hero.pause', 'Pause rotation')}
              className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function HeroSlide({ venue }: { venue: Venue }) {
  const { i18n } = useTranslation();
  const category = useVenueCategoryLabel(venue.category);
  const photo = venue.images?.find(isValidImageUrl);
  const name = localizedField(venue.name, venue.name_i18n as I18nMap, i18n.language);
  const description = localizedField(
    venue.description,
    venue.description_i18n as I18nMap,
    i18n.language,
  ).split(/(?<=[.!?])\s+/)[0];
  const place = [category, venue.city || venue.country].filter(Boolean).join(' · ');

  return (
    <LocalizedLink
      to={`/venues/${venue.slug || venue.id}`}
      className="station-arrive group relative flex min-h-56 min-w-0 flex-col justify-end overflow-hidden no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:min-h-64"
    >
      {photo && (
        <Image
          src={photo}
          alt=""
          aspect="auto"
          rounded="none"
          scrim="strong"
          priority
          sizes="(min-width: 768px) 60vw, 100vw"
          frameClassName="absolute inset-0 h-full w-full rounded-panel"
          className="transition-transform duration-slow group-hover:scale-[1.03] motion-reduce:transform-none"
        />
      )}
      <div
        className={`relative flex min-w-0 items-end gap-4 p-4 md:p-6 ${photo ? 'text-white' : ''}`}
      >
        <div className="min-w-0 flex-1">
          {place && (
            <span
              className={`inline-flex rounded-badge px-2 py-0.5 text-2xs font-bold uppercase tracking-label backdrop-blur-sm ${photo ? 'bg-black/40' : 'bg-muted'}`}
            >
              {place}
            </span>
          )}
          <h2 className="mt-2 break-words font-sans text-title font-bold leading-tight group-hover:underline sm:text-headline rtl:font-sans rtl:font-bold">
            {name}
          </h2>
          {description && (
            <p
              className={`mt-1 line-clamp-2 text-15 ${photo ? 'text-white/85' : 'text-muted-foreground'}`}
            >
              {description}
            </p>
          )}
        </div>
      </div>
    </LocalizedLink>
  );
}
