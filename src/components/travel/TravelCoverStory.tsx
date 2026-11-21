import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ChevronLeft, ChevronRight } from '@/components/icons';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { Image } from '@/components/ui/Image';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageCredit } from '@/components/ui/ImageCredit';
import { CityNetwork } from '@/components/home/subway/CityNetwork';
import { hasCityNetwork } from '@/components/home/subway/cityNetworkGeometry';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';
import { useTravelCoverStory } from '@/hooks/useTravelCoverStory';
import { useGoNowDestinations } from '@/hooks/useGoNowDestinations';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

const ROTATE_MS = 7000;

interface Slide {
  key: string;
  href: string;
  image?: string | null;
  title?: string;
  context?: string | null;
  detail?: string | null;
  author?: string | null;
  credit?: { attribution?: string; photographer?: string; license?: string };
  network: ReactNode;
}

/**
 * The /travel cover: the published cover story first (when there is one),
 * then a few seasonal destinations, as a slider. Advances every 7s; pauses on
 * hover/focus and never autoplays under reduced motion.
 */
export function TravelCoverStory() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const { data: story, isLoading } = useTravelCoverStory();
  const { data: destinations, isLoading: destinationsLoading } = useGoNowDestinations(6);
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);

  const slides: Slide[] = [];
  if (story?.href) {
    slides.push({
      key: 'cover',
      href: story.href,
      image: story.imageUrl,
      title: story.headline,
      context: story.entityName,
      detail: story.pullQuote,
      author: story.author,
      network: null,
    });
  }
  for (const d of destinations ?? []) {
    if (slides.length >= 5) break;
    if (!isValidImageUrl(d.imageUrl) && !hasCityNetwork(d.slug)) continue;
    slides.push({
      key: d.cityId,
      href: `/city/${d.slug || d.cityId}`,
      image: d.imageUrl,
      title: d.name,
      context: d.countryName,
      detail:
        d.reason.kind === 'trending'
          ? d.editorialHook || t('pages.travel.goNow.trending', 'Trending now')
          : d.reason.label,
      credit: d.imageMetadata as Slide['credit'],
      network: hasCityNetwork(d.slug) ? (
        <div className="h-full bg-muted px-8 py-4" aria-hidden="true">
          <CityNetwork slug={d.slug} variant="thumb" className="h-full" />
        </div>
      ) : null,
    });
  }

  const count = slides.length;
  const autoplay = count > 1 && !reduced && !hovering;
  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [autoplay]);

  // Hold the card's space while the story loads: an image band plus the
  // caption block. Rendering nothing and then the card grew the header by
  // ~280px on a phone and pushed the whole page down (mobile CLS 0.114).
  // Both queries feed the slides: dropping the placeholder when only the
  // story has arrived collapsed the header and re-grew it a moment later.
  if (isLoading || (count === 0 && destinationsLoading)) {
    return (
      <div
        aria-hidden
        data-testid="travel-cover-placeholder"
        className="min-w-0 overflow-hidden rounded-panel bg-card shadow-soft"
      >
        <Skeleton variant="rectangular" className="aspect-[21/9] rounded-none" />
        <div className="h-32" />
      </div>
    );
  }
  if (count === 0) return null;
  const slide = slides[index % count];
  const go = (d: number) => setIndex((i) => (((i + d) % count) + count) % count);

  return (
    <section
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label={t('pages.travel.cover.label', 'Suggested destinations')}
      className="relative min-w-0 overflow-hidden rounded-panel bg-card shadow-soft"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovering(false);
      }}
    >
      <LocalizedLink
        key={slide.key}
        to={slide.href}
        className="station-arrive group block no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {isValidImageUrl(slide.image) ? (
          <Image
            src={slide.image}
            alt=""
            aspect="hero"
            rounded="none"
            priority
            sizes="(min-width: 1024px) 52vw, 92vw"
            fallbackArtwork={slide.network}
          >
            <ImageCredit
              attribution={slide.credit?.attribution || slide.credit?.photographer}
              license={slide.credit?.license}
              className="absolute bottom-2 start-2 hidden rounded-badge bg-black/60 px-1.5 py-0.5 text-white backdrop-blur-sm group-has-[img]:block"
            />
          </Image>
        ) : slide.network ? (
          <div className="aspect-[21/9]">{slide.network}</div>
        ) : null}
        <div className="flex items-center gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            {slide.context && <p className="text-13 text-muted-foreground">{slide.context}</p>}
            <h2 className="break-words font-display text-headline leading-tight group-hover:underline rtl:font-sans rtl:font-bold">
              {slide.title}
            </h2>
            {slide.detail && (
              <p className="mt-2 line-clamp-2 text-15 text-muted-foreground">{slide.detail}</p>
            )}
            {slide.author && <p className="mt-2 text-13 text-muted-foreground">{slide.author}</p>}
          </div>
          <ArrowRight size={20} aria-hidden className="shrink-0 rtl:rotate-180" />
        </div>
      </LocalizedLink>

      {count > 1 && (
        <div className="absolute end-2 top-2 flex items-center gap-1 rounded-element bg-card/90 p-1 shadow-soft backdrop-blur-sm">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t('pages.travel.cover.previous', 'Previous suggestion')}
            className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
          >
            <ChevronLeft size={16} className="rtl:rotate-180" />
          </button>
          <div className="flex items-center gap-1.5 px-1" aria-hidden>
            {slides.map((s, i) => (
              <span
                key={s.key}
                className={cn(
                  'h-1.5 rounded-full bg-foreground transition-all',
                  i === index % count ? 'w-4' : 'w-1.5 opacity-30',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t('pages.travel.cover.next', 'Next suggestion')}
            className="grid size-11 place-items-center rounded-element hover:bg-foreground hover:text-background"
          >
            <ChevronRight size={16} className="rtl:rotate-180" />
          </button>
        </div>
      )}
    </section>
  );
}
