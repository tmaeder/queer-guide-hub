import React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Calendar } from 'lucide-react';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import type { ConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useVisitorLocation } from '@/hooks/useVisitorLocation';
import { Skeleton } from '@/components/ui/skeleton';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { HomeSection } from '@/components/home/HomeSection';
import { RecentlyViewedRail } from '@/components/home/RecentlyViewedRail';
import { HomeTrendingRail } from '@/components/home/HomeTrendingRail';
import { RecommendedForYou } from '@/components/discovery/RecommendedForYou';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const RegionalEventsCalendar = React.lazy(() => import('@/components/home/RegionalEventsCalendar'));

type BrowseCategory = {
  titleKey: string;
  descKey: string;
  link: string;
  statKey: keyof ConsolidatedStats | null;
  countLabelKey: string;
};

const browseCategories: BrowseCategory[] = [
  { titleKey: 'home.features.venues', descKey: 'home.features.venuesDesc', link: '/venues', statKey: 'venues', countLabelKey: 'home.browse.count.venues' },
  { titleKey: 'home.features.events', descKey: 'home.features.eventsDesc', link: '/events', statKey: 'events', countLabelKey: 'home.browse.count.events' },
  { titleKey: 'home.features.places', descKey: 'home.features.placesDesc', link: '/places', statKey: 'cities', countLabelKey: 'home.browse.count.cities' },
  { titleKey: 'home.features.hotels', descKey: 'home.features.hotelsDesc', link: '/hotels', statKey: null, countLabelKey: 'home.browse.count.hotels' },
  { titleKey: 'home.features.marketplace', descKey: 'home.features.marketplaceDesc', link: '/marketplace', statKey: 'marketplace', countLabelKey: 'home.browse.count.marketplace' },
  { titleKey: 'home.features.community', descKey: 'home.features.communityDesc', link: '/groups', statKey: 'groups', countLabelKey: 'home.browse.count.groups' },
  { titleKey: 'home.features.resources', descKey: 'home.features.resourcesDesc', link: '/resources', statKey: null, countLabelKey: 'home.browse.count.resources' },
];

function formatCompact(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(n);
}

const Index = React.memo(() => {
  const { stats: realStats, loading } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { location: visitorLocation } = useVisitorLocation();
  const nearCity = visitorLocation?.city ?? undefined;

  // Live "pulse" line folded into the hero — replaces the standalone stats band.
  const pulse = (
    [
      { value: realStats.venues, label: t('home.stats.venues', 'Venues'), link: '/venues' },
      { value: realStats.cities, label: t('home.stats.cities', 'Cities'), link: '/cities' },
      { value: realStats.events, label: t('home.stats.events', 'Events'), link: '/events' },
    ] as { value: number | null; label: string; link: string }[]
  ).filter((p): p is { value: number; label: string; link: string } =>
    typeof p.value === 'number' && p.value > 0,
  );

  return (
    <div className="min-h-screen">
      {/* ── Hero + Map ───────────────────────────────────────────────── */}
      <div className="relative flex flex-col md:flex-row md:min-h-[calc(100vh-64px)] bg-background overflow-hidden">
        {/* Text panel */}
        <div className="md:flex-[0_0_38%] flex flex-col justify-center px-4 sm:px-6 md:px-8 py-12 sm:py-16 md:py-0">
          <Eyebrow as="div" className="mb-2">
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

          {/* Search — primary action; was header-only before */}
          <UniversalSearchBar variant="hero" className="mb-6 max-w-md" />

          {/* Live pulse line */}
          {pulse.length > 0 && (
            <p className="mb-6 text-13 text-muted-foreground">
              {pulse.map((p, i) => (
                <React.Fragment key={p.link}>
                  {i > 0 && (
                    <span aria-hidden="true" className="mx-2 opacity-40">
                      ·
                    </span>
                  )}
                  <LocalizedLink
                    to={p.link}
                    className="no-underline hover:text-foreground transition-colors"
                  >
                    <span
                      className="font-semibold text-foreground"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {p.value.toLocaleString()}
                    </span>{' '}
                    {p.label.toLowerCase()}
                  </LocalizedLink>
                </React.Fragment>
              ))}
            </p>
          )}

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

      {/* ── Personalized: pick up where you left off (self-hides) ─────── */}
      <RecentlyViewedRail />

      {/* ── Personalized: recommended for you (self-hides if no signal) ─ */}
      <ErrorBoundary section="recommended" fallback={null}>
        <RecommendedForYou
          limit={12}
          className="px-4 sm:px-6 md:px-8 py-12 md:py-16 max-w-7xl mx-auto"
        />
      </ErrorBoundary>

      {/* ── Trending venues near you (self-hides) ────────────────────── */}
      <HomeTrendingRail
        type="venue"
        city={nearCity}
        eyebrow={t('home.trending.eyebrow', 'Trending now')}
        title={
          nearCity
            ? t('home.trending.venuesNear', {
                city: nearCity,
                defaultValue: `Popular venues in ${nearCity}.`,
              })
            : t('home.trending.venues', 'Venues on the rise.')
        }
        description={t('home.trending.venuesDesc', 'What the community is checking out this week.')}
        seeAllHref="/venues"
        seeAllLabel={t('home.allVenues', 'All venues')}
      />

      {/* ── Upcoming events near you (hero + index + 14-day strip) ────── */}
      <ErrorBoundary section="regional-calendar" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
              <div className="max-w-7xl mx-auto">
                <Skeleton className="mb-6 h-8 w-56" />
                <Skeleton className="h-64 w-full rounded-container" />
              </div>
            </div>
          }
        >
          <RegionalEventsCalendar />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Trending cities (self-hides) ─────────────────────────────── */}
      <HomeTrendingRail
        type="city"
        eyebrow={t('home.discover', 'Destinations')}
        title={t('home.destinationsTitle', 'Where the scene lives.')}
        description={t('home.destinationsSubtitle', 'Cities the community keeps coming back to.')}
        seeAllHref="/cities"
        seeAllLabel={t('home.allCities', 'All cities')}
      />

      {/* ── Latest News ──────────────────────────────────────────────── */}
      <ErrorBoundary section="latest-news" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
              <div className="max-w-7xl mx-auto">
                <Skeleton className="mb-6 h-8 w-48" />
                <Skeleton className="h-56 w-full rounded-container" />
              </div>
            </div>
          }
        >
          <LatestNewsSlider />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Browse · Numbered editorial index ───────────────────────── */}
      <HomeSection
        tinted
        eyebrow={t('home.browseEyebrow', 'The index')}
        title={t('home.browseTitle', 'Browse everything.')}
      >
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-12">
          {browseCategories.map((cat, i) => {
            const num = String(i + 1).padStart(2, '0');
            const count = cat.statKey ? formatCompact(realStats[cat.statKey] as number) : null;
            return (
              <li
                key={cat.titleKey}
                className="border-t border-border last:border-b md:last:border-b-0"
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
                    ) : cat.statKey && loading ? (
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
      </HomeSection>

      {/* ── Final CTA — adaptive on auth state ───────────────────────── */}
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
          {user ? (
            <>
              <LocalizedLink
                to="/submit"
                className="inline-flex items-center justify-center rounded-full bg-background text-foreground px-8 py-4 text-sm font-bold tracking-tight hover:opacity-90 transition-opacity no-underline"
              >
                {t('home.cta.submit', 'Add a venue')}
              </LocalizedLink>
              <LocalizedLink
                to="/friends"
                className="inline-flex items-center justify-center rounded-full border border-background text-background px-8 py-4 text-sm font-bold tracking-tight hover:bg-background hover:text-foreground transition-colors no-underline"
              >
                {t('home.cta.invite', 'Invite friends')}
              </LocalizedLink>
            </>
          ) : (
            <>
              <LocalizedLink
                to="/auth?mode=signup"
                className="inline-flex items-center justify-center rounded-full bg-background text-foreground px-8 py-4 text-sm font-bold tracking-tight hover:opacity-90 transition-opacity no-underline"
              >
                {t('home.cta.join', 'Join the community')}
              </LocalizedLink>
              <LocalizedLink
                to="/about"
                className="inline-flex items-center justify-center rounded-full border border-background text-background px-8 py-4 text-sm font-bold tracking-tight hover:bg-background hover:text-foreground transition-colors no-underline"
              >
                {t('home.cta.about', 'Read the mission')}
              </LocalizedLink>
            </>
          )}
        </div>
      </section>
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
