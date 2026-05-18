import React, { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  MapPin,
  Calendar,
  Store,
  Plane,
  Users,
  BookOpen,
  Building,
} from 'lucide-react';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { AnimatedCounter } from '@/components/animation/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpandableCard, type ExpandableCardItem } from '@/components/effects/ExpandableCard';
import { AnimatedModal } from '@/components/effects/AnimatedModal';
import { AppleCardsCarousel, type CarouselCard } from '@/components/effects/AppleCardsCarousel';
import { getRandomFallbackImage } from '@/utils/fallbackImages';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const RegionalEventsCalendar = React.lazy(
  () => import('@/components/home/RegionalEventsCalendar'),
);

const featureDefs = [
  { icon: MapPin, titleKey: 'home.features.venues', descKey: 'home.features.venuesDesc', link: '/venues' },
  { icon: Calendar, titleKey: 'home.features.events', descKey: 'home.features.eventsDesc', link: '/events' },
  { icon: Store, titleKey: 'home.features.marketplace', descKey: 'home.features.marketplaceDesc', link: '/marketplace' },
  { icon: Plane, titleKey: 'home.features.places', descKey: 'home.features.placesDesc', link: '/places' },
  { icon: Building, titleKey: 'home.features.hotels', descKey: 'home.features.hotelsDesc', link: '/hotels' },
  { icon: Users, titleKey: 'home.features.community', descKey: 'home.features.communityDesc', link: '/groups' },
  { icon: BookOpen, titleKey: 'home.features.resources', descKey: 'home.features.resourcesDesc', link: '/resources' },
];

const Index = React.memo(() => {
  const { stats: realStats, loading, error: statsError } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();
  const [newsletterOpen, setNewsletterOpen] = React.useState(false);

  const featuredStories: ExpandableCardItem[] = React.useMemo(
    () => [
      {
        id: 'pride-2026',
        title: 'Pride 2026: A field guide',
        description: 'Seven of the most welcoming parades on Earth this summer.',
        src: getRandomFallbackImage(),
        ctaText: 'Read',
        ctaLink: '/news',
        content: (
          <p>
            From Reykjavík to Buenos Aires, our community-sourced guide to the seven Pride events most worth the
            plane ticket — with safety notes, after-party tips, and the locals who know.
          </p>
        ),
      },
      {
        id: 'safe-travel',
        title: 'Where it is safe — and where it is not.',
        description: 'Country-by-country legal and social safety snapshot.',
        src: getRandomFallbackImage(),
        ctaText: 'Open atlas',
        ctaLink: '/help',
        content: (
          <p>
            An evolving country-by-country legal and social safety snapshot, built with on-the-ground
            contributors. Updated weekly.
          </p>
        ),
      },
      {
        id: 'queer-villages',
        title: 'Queer villages',
        description: 'The towns we have always called home.',
        src: getRandomFallbackImage(),
        ctaText: 'Browse villages',
        ctaLink: '/places',
        content: (
          <p>
            Provincetown, Sitges, Mykonos, Brighton, Hillcrest — and a hundred you have not heard of. Browse
            the long list with context, history, and current temperature.
          </p>
        ),
      },
      {
        id: 'contributors',
        title: 'Built by 2,300+ contributors.',
        description: 'Meet the people behind the guide.',
        src: getRandomFallbackImage(),
        ctaText: 'See credits',
        ctaLink: '/contributors',
        content: (
          <p>
            Bartenders, festival organisers, asylum seekers, professors, activists, and travellers. Every
            verified entry has a story behind it.
          </p>
        ),
      },
    ],
    [],
  );

  const stats = useMemo(
    () => [
      { value: realStats.venues, label: t('home.stats.venues', 'Venues'), link: '/venues' },
      { value: realStats.profiles, label: t('home.stats.members', 'Members') },
      { value: realStats.cities, label: t('home.stats.cities', 'Cities'), link: '/cities' },
      { value: realStats.events, label: t('home.stats.events', 'Events'), link: '/events' },
    ],
    [realStats, t],
  );

  const showStatsStrip =
    loading || (!statsError && stats.some((s) => typeof s.value === 'number' && s.value >= 100));

  return (
    <div className="min-h-screen">
      {/* ── Hero + Map ───────────────────────────────────────────────── */}
      <div className="relative flex flex-col md:flex-row md:min-h-[calc(100vh-64px)] bg-background overflow-hidden">
        {/* Text panel */}
        <div className="md:flex-[0_0_35%] flex flex-col justify-center px-4 sm:px-6 md:px-8 py-12 sm:py-16 md:py-0">
          <h1
            className="text-4xl sm:text-5xl md:text-5xl lg:text-6xl font-extrabold leading-[1.05] mb-4 text-foreground"
            style={{ letterSpacing: '-0.04em' }}
          >
            {t('home.heroLine1', 'Queer venues,')}{' '}
            {t('home.heroLine2', 'events, and people.')}{' '}
            {t('home.heroLine3', 'Worldwide.')}
          </h1>

          <p className="text-base md:text-lg text-muted-foreground mb-6 leading-[1.6] max-w-md">
            {t('home.subtitle', 'Verified safe places, real events, and the people behind them. Built by the community.')}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/directory')}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-7 py-4 text-sm font-extrabold tracking-tight text-background transition-transform duration-200 hover:-translate-y-0.5"
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
          <StaggerGrid
            stagger={0.1}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8"
          >
            {stats.map((stat, i) => {
              const inner = (
                <>
                  <div
                    className="font-extrabold text-[2.5rem] sm:text-[3rem] md:text-[4rem] leading-[1.1]"
                    style={{
                      letterSpacing: '-0.03em',
                    }}
                  >
                    {loading ? (
                      <Skeleton className="mx-auto h-[1em] w-24" />
                    ) : typeof stat.value === 'number' && stat.value >= 100 ? (
                      <AnimatedCounter value={stat.value} suffix="+" />
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
                      style={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
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

      {/* ── Trending Cities carousel (Aceternity AppleCardsCarousel) ── */}
      <section className="px-4 sm:px-6 md:px-8 py-10 md:py-14">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              {t('home.trendingCities', 'Trending cities')}
            </h2>
            <LocalizedLink to="/cities" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              {t('home.viewAll', 'View all')} →
            </LocalizedLink>
          </div>
          <AppleCardsCarousel
            items={[
              { title: 'Berlin', category: 'Germany', href: '/city/berlin', src: getRandomFallbackImage() },
              { title: 'New York', category: 'United States', href: '/city/new-york', src: getRandomFallbackImage() },
              { title: 'Mexico City', category: 'Mexico', href: '/city/mexico-city', src: getRandomFallbackImage() },
              { title: 'Bangkok', category: 'Thailand', href: '/city/bangkok', src: getRandomFallbackImage() },
              { title: 'Tel Aviv', category: 'Israel', href: '/city/tel-aviv', src: getRandomFallbackImage() },
              { title: 'Buenos Aires', category: 'Argentina', href: '/city/buenos-aires', src: getRandomFallbackImage() },
              { title: 'Cape Town', category: 'South Africa', href: '/city/cape-town', src: getRandomFallbackImage() },
              { title: 'Tokyo', category: 'Japan', href: '/city/tokyo', src: getRandomFallbackImage() },
            ] satisfies CarouselCard[]}
          />
        </div>
      </section>

      {/* ── Browse categories ───────────────────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-12 md:py-16 max-w-7xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-8">
          {t('home.browse', 'Browse')}
        </h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
          {featureDefs.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.titleKey} className="bg-background">
                <LocalizedLink
                  to={feature.link}
                  className="flex h-full items-start gap-3 p-6 transition-colors hover:bg-muted/40"
                  style={{ textDecoration: 'none' }}
                >
                  <Icon size={20} aria-hidden="true" className="mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-xl font-bold tracking-tight">{t(feature.titleKey)}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-[1.5]">
                      {t(feature.descKey)}
                    </p>
                  </div>
                </LocalizedLink>
              </li>
            );
          })}
        </ul>
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

      {/* ── Featured stories — Aceternity ExpandableCard grid ─────── */}
      <section className="px-4 sm:px-6 md:px-8 py-12 md:py-16 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {t('home.featuredStories', 'Featured stories')}
          </h2>
          <button
            type="button"
            onClick={() => setNewsletterOpen(true)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('home.subscribe', 'Subscribe →')}
          </button>
        </div>
        <ExpandableCard items={featuredStories} />
      </section>

      {/* ── Newsletter modal ─────────────────────────────────────── */}
      <AnimatedModal open={newsletterOpen} onClose={() => setNewsletterOpen(false)}>
        <div className="text-center">
          <h3 className="text-xl font-bold tracking-tight">
            {t('home.newsletter.title', 'Get the monthly dispatch.')}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {t('home.newsletter.subtitle', 'Best new venues, events, and rights updates — once a month, no spam.')}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setNewsletterOpen(false);
            }}
            className="mt-5 flex gap-2"
          >
            <input
              type="email"
              required
              placeholder="you@example.com"
              className="flex-1 h-10 rounded-element border border-input bg-background px-3.5 text-sm focus:outline-none focus:border-foreground focus:ring-2 focus:ring-foreground/15 transition"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-element bg-foreground text-background px-4 text-sm font-semibold hover:opacity-90"
            >
              {t('home.newsletter.cta', 'Subscribe')}
            </button>
          </form>
          <p className="mt-3 text-[0.6875rem] text-muted-foreground">
            {t('home.newsletter.privacy', 'Unsubscribe anytime. Privacy-first — we never share your email.')}
          </p>
        </div>
      </AnimatedModal>

      {/* ── Final CTA — plain monochrome ─────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-20 md:py-28 bg-foreground text-background text-center">
        <h2
          className="text-3xl md:text-5xl font-extrabold tracking-tight max-w-3xl mx-auto"
          style={{ letterSpacing: '-0.03em' }}
        >
          {t('home.cta.title', 'Built by the community,')} {t('home.cta.title2', 'for the community.')}
        </h2>
        <p className="mt-4 text-sm md:text-base opacity-70 max-w-xl mx-auto">
          {t('home.cta.subtitle', 'Verified safe spaces, real reviews, no paywalls.')}
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <LocalizedLink
            to="/submit"
            className="inline-flex items-center justify-center rounded-full bg-background text-foreground px-7 py-4 text-sm font-extrabold tracking-tight hover:opacity-90 transition-opacity"
            style={{ textDecoration: 'none' }}
          >
            {t('home.cta.submit', 'Add a venue')}
          </LocalizedLink>
          <LocalizedLink
            to="/about"
            className="inline-flex items-center justify-center rounded-full border border-background text-background px-7 py-4 text-sm font-extrabold tracking-tight hover:bg-background hover:text-foreground transition-colors"
            style={{ textDecoration: 'none' }}
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
