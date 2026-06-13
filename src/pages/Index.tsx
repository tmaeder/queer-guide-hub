import React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import type { ConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { UniversalSearchBar } from '@/components/search/UniversalSearchBar';
import { RecentlyViewedRail } from '@/components/home/RecentlyViewedRail';
import { DestinationsFeature } from '@/components/home/DestinationsFeature';

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
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="min-h-screen">
      {/* ── Hero + Map — stripped to headline · search · map ──────────── */}
      <div className="relative flex flex-col md:flex-row md:min-h-[calc(100vh-64px)] bg-background overflow-hidden">
        <div className="md:flex-[0_0_40%] flex flex-col justify-center px-4 sm:px-6 md:px-10 lg:px-14 py-16 md:py-0">
          <h1
            className="text-display sm:text-hero lg:text-hero-xl font-bold leading-[1.02] text-foreground"
            style={{ letterSpacing: '-0.045em' }}
          >
            {t('home.heroLine1', 'Queer venues,')} {t('home.heroLine2', 'events, and people.')}{' '}
            {t('home.heroLine3', 'Worldwide.')}
          </h1>

          <p className="mt-6 max-w-sm text-base md:text-body-lg text-muted-foreground leading-[1.55]">
            {t('home.subtitleShort', 'Verified safe places, real events, and the people behind them.')}
          </p>

          <div className="mt-10 max-w-md">
            <UniversalSearchBar variant="hero" />
          </div>

          <LocalizedLink
            to="/travel"
            className="group mt-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground no-underline"
          >
            {t('home.planTrip', 'Plan a trip')}
            <span aria-hidden className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </LocalizedLink>
        </div>

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

      {/* ── Returning visitors: one light personalized rail (self-hides) ─ */}
      <RecentlyViewedRail />

      {/* ── Events near you — the live, functional discovery block ────── */}
      <ErrorBoundary section="regional-calendar" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-20 md:py-28">
              <div className="max-w-7xl mx-auto">
                <Skeleton className="mb-8 h-9 w-64" />
                <Skeleton className="h-72 w-full rounded-container" />
              </div>
            </div>
          }
        >
          <RegionalEventsCalendar />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Destinations — editorial, type-led (not a card rail) ─────── */}
      <DestinationsFeature />

      {/* ── Latest news — feature + list ─────────────────────────────── */}
      <ErrorBoundary section="latest-news" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-20 md:py-28">
              <div className="max-w-7xl mx-auto">
                <Skeleton className="mb-8 h-9 w-48" />
                <Skeleton className="h-56 w-full rounded-container" />
              </div>
            </div>
          }
        >
          <LatestNewsSlider />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Browse — quiet numbered index, the page's table of contents ─ */}
      <section className="bg-muted/30 border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-20 md:py-28">
          <h2
            className="mb-12 md:mb-16 text-headline md:text-headline-lg font-bold tracking-tight"
            style={{ letterSpacing: '-0.02em' }}
          >
            {t('home.browseTitle', 'Browse everything.')}
          </h2>
          {/* div[role=list] not <ol>: standalone row links must escape the inline-prose
              rule (index.css `li a { display:inline }` + underline ::after). */}
          <div role="list" className="grid grid-cols-1 md:grid-cols-2 gap-x-16">
            {browseCategories.map((cat, i) => {
              const num = String(i + 1).padStart(2, '0');
              const count = cat.statKey ? formatCompact(realStats[cat.statKey] as number) : null;
              return (
                <div
                  role="listitem"
                  key={cat.titleKey}
                  className="border-t border-border last:border-b md:[&:nth-last-child(2)]:border-b"
                >
                  <LocalizedLink
                    to={cat.link}
                    className="group grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-6 py-6 no-underline"
                  >
                    <span
                      className="text-13 font-semibold tabular-nums text-muted-foreground/60 transition-colors group-hover:text-foreground"
                      style={{ letterSpacing: 'var(--tracking-label)' }}
                    >
                      {num}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-title font-bold leading-tight tracking-tight transition-opacity group-hover:opacity-70">
                        {t(cat.titleKey)}
                      </span>
                      <span className="mt-1 block text-13 text-muted-foreground leading-[1.5]">
                        {t(cat.descKey)}
                      </span>
                    </span>
                    <span className="flex items-center gap-4 self-center">
                      {count ? (
                        <span
                          className="hidden text-13 tabular-nums text-muted-foreground sm:inline"
                        >
                          {count}
                        </span>
                      ) : cat.statKey && loading ? (
                        <Skeleton className="hidden h-3 w-10 sm:block" />
                      ) : null}
                      <span
                        aria-hidden
                        className="text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground"
                      >
                        →
                      </span>
                    </span>
                  </LocalizedLink>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Final CTA — adaptive on auth state ───────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-24 md:py-36 bg-foreground text-background">
        <div className="max-w-3xl">
          <h2
            className="text-display md:text-hero font-bold tracking-tight"
            style={{ letterSpacing: '-0.035em' }}
          >
            {t('home.cta.title', 'Built by the community,')}{' '}
            {t('home.cta.title2', 'for the community.')}
          </h2>
          <p className="mt-6 max-w-xl text-base opacity-70">
            {t('home.cta.subtitle', 'Verified safe spaces, real reviews, no paywalls.')}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            {user ? (
              <>
                <LocalizedLink
                  to="/submit"
                  className="inline-flex items-center justify-center rounded-full bg-background px-8 py-4 text-sm font-bold tracking-tight text-foreground transition-opacity hover:opacity-90 no-underline"
                >
                  {t('home.cta.submit', 'Add a venue')}
                </LocalizedLink>
                <LocalizedLink
                  to="/friends"
                  className="inline-flex items-center justify-center rounded-full border border-background/40 px-8 py-4 text-sm font-bold tracking-tight text-background transition-colors hover:border-background no-underline"
                >
                  {t('home.cta.invite', 'Invite friends')}
                </LocalizedLink>
              </>
            ) : (
              <>
                <LocalizedLink
                  to="/auth?mode=signup"
                  className="inline-flex items-center justify-center rounded-full bg-background px-8 py-4 text-sm font-bold tracking-tight text-foreground transition-opacity hover:opacity-90 no-underline"
                >
                  {t('home.cta.join', 'Join the community')}
                </LocalizedLink>
                <LocalizedLink
                  to="/about"
                  className="inline-flex items-center justify-center rounded-full border border-background/40 px-8 py-4 text-sm font-bold tracking-tight text-background transition-colors hover:border-background no-underline"
                >
                  {t('home.cta.about', 'Read the mission')}
                </LocalizedLink>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
