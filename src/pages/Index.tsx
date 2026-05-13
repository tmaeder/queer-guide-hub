import React, { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { TrendingStrip } from '@/components/discovery/TrendingStrip';
import { RecommendedForYou } from '@/components/discovery/RecommendedForYou';
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
import { TextGenerateEffect } from '@/components/effects/TextGenerateEffect';
import { SpotlightEffect } from '@/components/effects/SpotlightEffect';
import { BackgroundDots } from '@/components/effects/BackgroundDots';
import { BentoGrid, BentoGridItem } from '@/components/effects/BentoGrid';
import { MovingBorder } from '@/components/effects/MovingBorder';
import { MagneticButton } from '@/components/motion';

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
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-mesh opacity-70" />
        {/* Text panel */}
        <SpotlightEffect className="md:flex-[0_0_38%] flex flex-col justify-center px-6 sm:px-10 md:px-12 py-14 sm:py-20 md:py-0 relative z-[1]">
          <div className="reveal-up mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-foreground animate-pulse" />
            {t('home.eyebrow', 'LGBTQ+ Travel & Community')}
          </div>
          <TextGenerateEffect
            words={`${t('home.heroLine1', 'Discover.')} ${t('home.heroLine2', 'Connect.')} ${t('home.heroLine3', 'Belong.')}`}
            className="text-[2.75rem] sm:text-[3.5rem] md:text-[4rem] lg:text-[4.5rem] font-extrabold leading-[1.02] mb-5 text-gradient-fg"
            style={{ letterSpacing: '-0.045em' }}
            as="h1"
            staggerDelay={0.08}
          />

          <p className="reveal-up reveal-delay-1 max-w-md text-base md:text-[1.0625rem] text-muted-foreground mb-7 leading-[1.6]">
            {t('home.subtitle', 'Safe venues, vibrant events, and communities that get you — wherever you are.')}
          </p>

          <div className="reveal-up reveal-delay-2 flex gap-3 flex-wrap">
            <MagneticButton>
              <MovingBorder onClick={() => navigate('/venues')}>
                <MapPin size={16} aria-hidden="true" />
                {t('home.browseVenues', 'Browse Venues')}
              </MovingBorder>
            </MagneticButton>
            <MagneticButton>
              <MovingBorder onClick={() => navigate('/events')} duration={4}>
                <Calendar size={16} aria-hidden="true" />
                {t('home.viewEvents', 'View Events')}
              </MovingBorder>
            </MagneticButton>
          </div>
        </SpotlightEffect>

        {/* Map panel */}
        <div className="md:flex-1 min-h-[55vh] md:min-h-0 relative md:rounded-l-[2.5rem] md:overflow-hidden md:border-l md:border-border md:my-6 md:mr-4 lg:my-8 lg:mr-6">
          <ErrorBoundary section="map" fallback={null}>
            <React.Suspense
              fallback={
                <div className="h-full min-h-[55vh] md:min-h-[calc(100vh-64px)] bg-muted" />
              }
            >
              <ExploreMap
                height={isMobile ? '55vh' : 'calc(100vh - 64px - 4rem)'}
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
          className="relative mx-4 sm:mx-6 md:mx-8 my-8 md:my-12 rounded-3xl border border-foreground/10 bg-foreground text-background py-12 md:py-16 px-6 sm:px-8 md:px-12 overflow-hidden shadow-xl"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(at_20%_20%,hsl(0_0%_100%/0.08)_0%,transparent_50%),radial-gradient(at_80%_80%,hsl(0_0%_100%/0.05)_0%,transparent_50%)]" />
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

      {/* ── Discovery widgets (search v2) ────────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-8 md:py-12 flex flex-col gap-8">
        <RecommendedForYou />
        <TrendingStrip />
      </section>

      {/* ── Features Grid ────────────────────────────────────────────── */}
      <BackgroundDots className="py-16 md:py-24 px-4 sm:px-6 md:px-8">
        <div className="reveal-up mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-foreground" />
          {t('home.exploreEyebrow', 'Everything in one place')}
        </div>
        <h2 className="reveal-up font-extrabold mb-3 text-[2rem] md:text-[3rem] leading-[1.05] tracking-tight text-balance max-w-3xl">
          {t('home.explore', 'Explore')}
        </h2>
        <p className="reveal-up reveal-delay-1 mb-10 md:mb-14 max-w-2xl text-base md:text-lg text-muted-foreground leading-relaxed">
          {t('home.exploreSubtitle', 'Verified venues, real events, and the community that built them.')}
        </p>

        <BentoGrid>
          {featureDefs.map((feature, i) => {
            const Icon = feature.icon;
            const isLarge = i < 2;
            return (
              <BentoGridItem
                key={feature.titleKey}
                colSpan={isLarge ? 2 : 1}
                className="group/bento relative overflow-hidden rounded-2xl border border-border bg-card p-6 md:p-7 shadow-sm transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lg"
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-foreground/[0.04] opacity-0 transition-opacity duration-300 group-hover/bento:opacity-100" />
                <LocalizedLink
                  to={feature.link}
                  className="relative flex h-full flex-col gap-3 no-underline"
                >
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
                    <Icon size={20} aria-hidden="true" />
                  </div>
                  <div className="text-lg md:text-xl font-bold leading-tight tracking-tight">
                    {t(feature.titleKey)}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t(feature.descKey)}
                  </p>
                  <span aria-hidden="true" className="mt-auto inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-foreground/70 transition-transform duration-300 group-hover/bento:translate-x-1">
                    {t('home.bentoExplore', 'Open')} →
                  </span>
                </LocalizedLink>
              </BentoGridItem>
            );
          })}
        </BentoGrid>
      </BackgroundDots>

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
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
