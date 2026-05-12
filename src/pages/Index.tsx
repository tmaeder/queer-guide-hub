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
import { GrainOverlay } from '@/components/effects/GrainOverlay';

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
      <div className="relative flex flex-col md:flex-row md:min-h-[calc(100vh-64px)] bg-background">
        <GrainOverlay />
        {/* Text panel */}
        <SpotlightEffect className="md:flex-[0_0_35%] flex flex-col justify-center px-4 sm:px-6 md:px-8 py-12 sm:py-16 md:py-0 relative z-[1]">
          <TextGenerateEffect
            words={`${t('home.heroLine1', 'Discover.')} ${t('home.heroLine2', 'Connect.')} ${t('home.heroLine3', 'Belong.')}`}
            className="text-[2.5rem] sm:text-[3rem] md:text-[3.5rem] lg:text-[4rem] font-extrabold leading-[1.05] mb-4 text-foreground"
            style={{ letterSpacing: '-0.04em' }}
            as="h1"
            staggerDelay={0.08}
          />

          <p className="reveal-up reveal-delay-1 text-[0.9375rem] md:text-[1.0625rem] text-muted-foreground mb-6 leading-[1.6]">
            {t('home.subtitle', 'Safe venues, vibrant events, and communities that get you — wherever you are.')}
          </p>

          <div className="reveal-up reveal-delay-2 flex gap-3 flex-wrap">
            <MovingBorder onClick={() => navigate('/venues')}>
              <MapPin size={16} aria-hidden="true" />
              {t('home.browseVenues', 'Browse Venues')}
            </MovingBorder>
            <MovingBorder onClick={() => navigate('/events')} duration={4}>
              <Calendar size={16} aria-hidden="true" />
              {t('home.viewEvents', 'View Events')}
            </MovingBorder>
          </div>
        </SpotlightEffect>

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

      {/* ── Discovery widgets (search v2) ────────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-8 md:py-12 flex flex-col gap-8">
        <RecommendedForYou />
        <TrendingStrip />
      </section>

      {/* ── Features Grid ────────────────────────────────────────────── */}
      <BackgroundDots className="py-12 md:py-16 px-4 sm:px-6 md:px-8">
        <h2 className="reveal-up font-extrabold mb-8 md:mb-10 text-[1.75rem] md:text-[2.25rem]">
          {t('home.explore', 'Explore')}
        </h2>

        <BentoGrid>
          {featureDefs.map((feature, i) => {
            const Icon = feature.icon;
            const isLarge = i < 2;
            return (
              <BentoGridItem
                key={feature.titleKey}
                colSpan={isLarge ? 2 : 1}
              >
                <LocalizedLink
                  to={feature.link}
                  style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}
                >
                  <div className="font-bold text-base md:text-[1.0625rem] flex items-center gap-2">
                    <Icon size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
                    {t(feature.titleKey)}
                  </div>
                  <p className="text-sm text-muted-foreground leading-[1.5]">
                    {t(feature.descKey)}
                  </p>
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
