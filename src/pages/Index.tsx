import React, { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Calendar } from 'lucide-react';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { AnimatedCounter } from '@/components/animation/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { Eyebrow } from '@/components/ui/Eyebrow';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const RegionalEventsCalendar = React.lazy(() => import('@/components/home/RegionalEventsCalendar'));

type BrowseCategory = {
  titleKey: string;
  descKey: string;
  link: string;
  statKey:
    | 'venues'
    | 'events'
    | 'marketplace'
    | 'cities'
    | 'profiles'
    | 'groups'
    | 'personalities'
    | null;
  countLabelKey: string;
};

const browseCategories: BrowseCategory[] = [
  {
    titleKey: 'home.features.venues',
    descKey: 'home.features.venuesDesc',
    link: '/venues',
    statKey: 'venues',
    countLabelKey: 'home.browse.count.venues',
  },
  {
    titleKey: 'home.features.events',
    descKey: 'home.features.eventsDesc',
    link: '/events',
    statKey: 'events',
    countLabelKey: 'home.browse.count.events',
  },
  {
    titleKey: 'home.features.places',
    descKey: 'home.features.placesDesc',
    link: '/places',
    statKey: 'cities',
    countLabelKey: 'home.browse.count.cities',
  },
  {
    titleKey: 'home.features.hotels',
    descKey: 'home.features.hotelsDesc',
    link: '/hotels',
    statKey: null,
    countLabelKey: 'home.browse.count.hotels',
  },
  {
    titleKey: 'home.features.marketplace',
    descKey: 'home.features.marketplaceDesc',
    link: '/marketplace',
    statKey: 'marketplace',
    countLabelKey: 'home.browse.count.marketplace',
  },
  {
    titleKey: 'home.features.community',
    descKey: 'home.features.communityDesc',
    link: '/groups',
    statKey: 'groups',
    countLabelKey: 'home.browse.count.groups',
  },
  {
    titleKey: 'home.features.resources',
    descKey: 'home.features.resourcesDesc',
    link: '/resources',
    statKey: null,
    countLabelKey: 'home.browse.count.resources',
  },
];

type Destination = {
  city: string;
  country: string;
  href: string;
  image: string;
  blurb: string;
};

const trendingDestinations: Destination[] = [
  {
    city: 'Berlin',
    country: 'Germany',
    href: '/city/berlin',
    image: '/images/fallback/eugene-golovesov--WHbksuuyd8-unsplash.webp',
    blurb: 'Clubs, queer landmarks, year-round scene.',
  },
  {
    city: 'Mexico City',
    country: 'Mexico',
    href: '/city/mexico-city',
    image: '/images/fallback/maria-orlova-bU8TeXhsPcY-unsplash.webp',
    blurb: 'Zona Rosa, ballroom culture, food worth flying for.',
  },
  {
    city: 'Bangkok',
    country: 'Thailand',
    href: '/city/bangkok',
    image: '/images/fallback/pexels-anniroenkae-2832456.webp',
    blurb: 'Silom nights and one of Asia’s most open scenes.',
  },
  {
    city: 'Tel Aviv',
    country: 'Israel',
    href: '/city/tel-aviv',
    image: '/images/fallback/pexels-didsss-2911544.webp',
    blurb: 'Mediterranean coastline, all-night Pride pulse.',
  },
  {
    city: 'New York',
    country: 'United States',
    href: '/city/new-york',
    image: '/images/fallback/solen-feyissa-VpcT2lx8vNA-unsplash.webp',
    blurb: 'Where the movement was born — still defining it.',
  },
  {
    city: 'Buenos Aires',
    country: 'Argentina',
    href: '/city/buenos-aires',
    image: '/images/fallback/susan-wilkinson-l9URCYPsJPE-unsplash.webp',
    blurb: 'South America’s most progressive capital.',
  },
];

function formatCompact(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

const Index = React.memo(() => {
  const { stats: realStats, loading, error: statsError } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();

  const stats = useMemo(
    () => [
      { value: realStats.venues, label: t('home.stats.venues', 'Venues'), link: '/venues' },
      { value: realStats.profiles, label: t('home.stats.members', 'Members') },
      { value: realStats.cities, label: t('home.stats.cities', 'Cities'), link: '/cities' },
      { value: realStats.events, label: t('home.stats.events', 'Events'), link: '/events' },
    ],
    [realStats, t],
  );

  // D12: keep the high bar for the strip itself (hide entirely if we can't
  // show at least one real number) but drop the per-stat 100-floor below
  // so legitimately small numbers don't render as "—".
  const showStatsStrip =
    loading || (!statsError && stats.some((s) => typeof s.value === 'number' && s.value > 0));

  return (
    <div className="min-h-screen">
      {/* ── Hero + Map ───────────────────────────────────────────────── */}
      <div className="relative flex flex-col md:flex-row md:min-h-[calc(100vh-64px)] bg-background overflow-hidden">
        {/* Text panel */}
        <div className="md:flex-[0_0_35%] flex flex-col justify-center px-4 sm:px-6 md:px-8 py-12 sm:py-16 md:py-0">
          <Eyebrow as="div" className="mb-3">
            {t('home.eyebrow', 'Queer Guide')}
          </Eyebrow>
          <h1
            className="text-display sm:text-hero md:text-hero lg:text-hero-xl font-bold leading-[1.05] mb-4 text-foreground"
            style={{ letterSpacing: '-0.04em' }}
          >
            {t('home.heroLine1', 'Queer venues,')} {t('home.heroLine2', 'events, and people.')}{' '}
            {t('home.heroLine3', 'Worldwide.')}
          </h1>

          <p className="text-base md:text-lg text-muted-foreground mb-6 leading-[1.6] max-w-md">
            {t(
              'home.subtitle',
              'Verified safe places, real events, and the people behind them. Built by the community.',
            )}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/directory')}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-4 text-sm font-bold tracking-tight text-background transition-opacity duration-200 hover:opacity-90"
            >
              <Calendar size={16} aria-hidden="true" />
              {t('home.browseDirectory', 'Browse the directory')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/travel')}
              className="text-sm font-medium underline underline-offset-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('home.planTrip', 'Plan a trip')}
            </button>
          </div>
        </div>

        {/* Map panel */}
        <div className="md:flex-1 min-h-[55vh] md:min-h-0 relative">
          <ErrorBoundary section="map" fallback={null}>
            <React.Suspense
              fallback={
                <div className="h-full min-h-[55vh] md:min-h-[calc(100vh-64px)] bg-muted" />
              }
            >
              <ExploreMap
                height={isMobile ? '55vh' : 'calc(100vh - 64px)'}
                defaultLayers={['venues', 'events']}
                showFilters
                showLayerToggles
                linkToFullMap="/map"
              />
            </React.Suspense>
          </ErrorBoundary>
        </div>
      </div>

      {/* ── Stats Strip ──────────────────────────────────────────────── */}
      {showStatsStrip && (
        <div
          data-testid="homepage-stats-strip"
          className="bg-foreground text-background py-10 md:py-14 px-4 sm:px-6 md:px-8"
        >
          <StaggerGrid stagger={0.1} className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat, i) => {
              const inner = (
                <>
                  <div
                    className="font-bold text-display sm:text-5xl md:text-hero leading-[1.1]"
                    style={{
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {loading ? (
                      <Skeleton className="mx-auto h-[1em] w-24" />
                    ) : typeof stat.value === 'number' && stat.value > 0 ? (
                      // D12: drop "+" suffix for small numbers (under 100)
                      // so e.g. "6 MEMBERS" reads truthfully rather than
                      // "6+ MEMBERS"; keep "+" on the big numbers where
                      // it signals "thousands and growing".
                      <AnimatedCounter
                        value={stat.value}
                        suffix={stat.value >= 100 ? '+' : ''}
                      />
                    ) : (
                      '—'
                    )}
                  </div>
                  <p
                    className="opacity-60 mt-1 font-medium uppercase text-xs"
                    style={{ letterSpacing: '0.02em', color: 'inherit' }}
                  >
                    {stat.label}
                  </p>
                </>
              );
              return (
                <div key={i} className="text-center">
                  {stat.link ? (
                    <LocalizedLink
                      to={stat.link}
                      style={{ color: 'inherit' }}
                      className="no-underline block"
                    >
                      {inner}
                    </LocalizedLink>
                  ) : (
                    inner
                  )}
                </div>
              );
            })}
          </StaggerGrid>
        </div>
      )}

      {/* ── Discover · Destinations bento ───────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-12 md:py-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-8 md:mb-10">
            <div>
              <Eyebrow as="div" className="mb-2">
                {t('home.discover', 'Destinations')}
              </Eyebrow>
              <h2
                className="text-headline md:text-headline-lg font-bold tracking-tight"
                style={{ letterSpacing: '-0.02em' }}
              >
                {t('home.destinationsTitle', 'Where the scene lives.')}
              </h2>
              <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-md">
                {t(
                  'home.destinationsSubtitle',
                  'Six cities our community keeps coming back to.',
                )}
              </p>
            </div>
            <LocalizedLink
              to="/cities"
              className="hidden sm:inline-flex items-center gap-1 text-13 font-medium text-muted-foreground hover:text-foreground transition-colors group no-underline"
            >
              {t('home.allCities', 'All cities')}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </LocalizedLink>
          </div>

          {/* Bento: 1 hero (col-span-2 row-span-2) + 4 small cards on md+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 md:grid-rows-2 gap-3 md:gap-4 auto-rows-[14rem] sm:auto-rows-[16rem] md:auto-rows-[15rem]">
            {trendingDestinations.slice(0, 5).map((d, i) => {
              const isHero = i === 0;
              return (
                <LocalizedLink
                  key={d.city}
                  to={d.href}
                  aria-label={`${d.city}, ${d.country}`}
                  className={[
                    'group relative overflow-hidden rounded-container bg-muted no-underline',
                    isHero ? 'md:col-span-2 md:row-span-2 sm:col-span-2' : '',
                  ].join(' ')}
                >
                  <img
                    src={d.image}
                    alt=""
                    aria-hidden="true"
                    loading={isHero ? 'eager' : 'lazy'}
                    className="absolute inset-0 h-full w-full object-cover grayscale transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent"
                  />
                  <div
                    className={[
                      'relative h-full flex flex-col justify-end text-background',
                      isHero ? 'p-6 md:p-8' : 'p-4 md:p-5',
                    ].join(' ')}
                  >
                    <span
                      className="text-2xs font-semibold uppercase tracking-label opacity-80"
                      style={{ letterSpacing: 'var(--tracking-label)' }}
                    >
                      {d.country}
                    </span>
                    <h3
                      className={[
                        'font-bold leading-[1.05] mt-1',
                        isHero
                          ? 'text-headline-lg md:text-display'
                          : 'text-title md:text-headline',
                      ].join(' ')}
                      style={{ letterSpacing: '-0.02em' }}
                    >
                      {d.city}
                    </h3>
                    {isHero && (
                      <p className="mt-3 max-w-md text-sm md:text-base opacity-85 leading-[1.5]">
                        {d.blurb}
                      </p>
                    )}
                    <span className="mt-3 inline-flex items-center gap-1 text-13 font-medium opacity-90">
                      {t('home.exploreCity', 'See the city')}
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </span>
                  </div>
                </LocalizedLink>
              );
            })}
          </div>

          {/* Mobile-only: all cities CTA */}
          <div className="mt-6 sm:hidden">
            <LocalizedLink
              to="/cities"
              className="inline-flex items-center gap-1 text-13 font-medium text-muted-foreground hover:text-foreground transition-colors group no-underline"
            >
              {t('home.allCities', 'All cities')}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </LocalizedLink>
          </div>
        </div>
      </section>

      {/* ── Browse · Numbered editorial index ───────────────────────── */}
      <section className="bg-muted/30 border-y border-border">
        <div className="px-4 sm:px-6 md:px-8 py-16 md:py-24 max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-10 md:mb-12">
            <div>
              <Eyebrow as="div" className="mb-2">
                {t('home.browseEyebrow', 'The index')}
              </Eyebrow>
              <h2
                className="text-headline md:text-headline-lg font-bold tracking-tight"
                style={{ letterSpacing: '-0.02em' }}
              >
                {t('home.browseTitle', 'Browse everything.')}
              </h2>
            </div>
            <span
              className="hidden sm:inline-block text-2xs font-semibold uppercase tracking-label text-muted-foreground"
              style={{ letterSpacing: 'var(--tracking-label)', fontVariantNumeric: 'tabular-nums' }}
            >
              {String(browseCategories.length).padStart(2, '0')} {t('home.browseSections', 'sections')}
            </span>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
            {browseCategories.map((cat, i) => {
              const num = String(i + 1).padStart(2, '0');
              const count =
                cat.statKey && typeof realStats[cat.statKey] === 'number'
                  ? formatCompact(realStats[cat.statKey] as number)
                  : null;
              return (
                <li
                  key={cat.titleKey}
                  className={[
                    'border-t border-border last:border-b md:last:border-b-0',
                    // Bottom border on every odd item in single-col view, handled by last:border-b
                  ].join(' ')}
                >
                  <LocalizedLink
                    to={cat.link}
                    className="group grid grid-cols-[3.5rem_1fr_auto] md:grid-cols-[4rem_1fr_auto] items-start gap-x-4 md:gap-x-6 py-6 md:py-8 no-underline"
                  >
                    <span
                      className="text-title md:text-headline font-bold text-muted-foreground/60 leading-none transition-colors group-hover:text-foreground"
                      style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                    >
                      {num}
                    </span>
                    <div className="min-w-0">
                      <h3
                        className="text-title md:text-headline font-bold leading-[1.1] transition-opacity group-hover:opacity-70"
                        style={{ letterSpacing: '-0.02em' }}
                      >
                        {t(cat.titleKey)}
                      </h3>
                      <p className="mt-2 text-sm md:text-base text-muted-foreground leading-[1.5] max-w-md">
                        {t(cat.descKey)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 pt-1">
                      {count ? (
                        <span
                          className="text-2xs font-semibold uppercase tracking-label text-muted-foreground whitespace-nowrap"
                          style={{
                            letterSpacing: 'var(--tracking-label)',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {count} {t(cat.countLabelKey, '')}
                        </span>
                      ) : loading ? (
                        <Skeleton className="h-3 w-12" />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
                      >
                        →
                      </span>
                    </div>
                  </LocalizedLink>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── Upcoming Events Near You (hero + index + 14-day strip) ───── */}
      <ErrorBoundary section="regional-calendar" fallback={null}>
        <React.Suspense fallback={null}>
          <RegionalEventsCalendar />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Latest News ──────────────────────────────────────────────── */}
      <ErrorBoundary section="latest-news" fallback={null}>
        <React.Suspense fallback={null}>
          <LatestNewsSlider />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Final CTA — plain monochrome ─────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-20 md:py-28 bg-foreground text-background text-center">
        <h2
          className="text-display md:text-hero font-bold tracking-tight max-w-3xl mx-auto"
          style={{ letterSpacing: '-0.03em' }}
        >
          {t('home.cta.title', 'Built by the community,')}{' '}
          {t('home.cta.title2', 'for the community.')}
        </h2>
        <p className="mt-4 text-sm md:text-base opacity-70 max-w-xl mx-auto">
          {t('home.cta.subtitle', 'Verified safe spaces, real reviews, no paywalls.')}
        </p>
        <div className="mt-8 flex flex-wrap gap-4 justify-center">
          <LocalizedLink
            to="/submit"
            className="inline-flex items-center justify-center rounded-full bg-background text-foreground px-8 py-4 text-sm font-bold tracking-tight hover:opacity-90 transition-opacity no-underline"
          >
            {t('home.cta.submit', 'Add a venue')}
          </LocalizedLink>
          <LocalizedLink
            to="/about"
            className="inline-flex items-center justify-center rounded-full border border-background text-background px-8 py-4 text-sm font-bold tracking-tight hover:bg-background hover:text-foreground transition-colors no-underline"
          >
            {t('home.cta.about', 'Read the mission')}
          </LocalizedLink>
        </div>
      </section>
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
