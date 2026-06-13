import React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { RecentlyViewedRail } from '@/components/home/RecentlyViewedRail';

const MapShell = React.lazy(() => import('@/components/map/MapShell'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const RegionalEventsCalendar = React.lazy(() => import('@/components/home/RegionalEventsCalendar'));

// Hide the on-map search (the top-bar search is the single search) and keep the
// landing URL clean (no ?lat&lng&z written as the visitor pans).
const HOME_MAP_CONFIG = { showSearch: false, enableUrlState: false } as const;

const Index = React.memo(() => {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { user } = useAuth();

  const mapHeight = isMobile ? '70vh' : 'calc(100dvh - 64px)';

  return (
    <div className="min-h-screen">
      {/* ── Hero = the live map (same MapShell as /map), search-free ──── */}
      <section className="relative isolate overflow-hidden" style={{ height: mapHeight }}>
        <ErrorBoundary section="map" fallback={<div className="h-full w-full bg-muted" />}>
          <React.Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
            <MapShell
              surface="discover"
              height={mapHeight}
              cooperativeGestures
              configOverride={HOME_MAP_CONFIG}
            />
          </React.Suspense>
        </ErrorBoundary>

        {/* Floating hero card — headline + the one search (opens the top bar).
            Vertically centred: the discover map's chrome lives at the top
            (command bar / quick filters / legend) and bottom (spotlight rail),
            so the centre is the clear zone. Pointer-events pass through to the
            map around the card. */}
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4">
          <div className="pointer-events-auto w-full max-w-xl">
            <div className="rounded-container border border-border bg-background/85 px-6 py-6 backdrop-blur-md md:px-8 md:py-8">
              <h1
                className="text-headline-lg md:text-display font-bold leading-[1.05] tracking-tight text-foreground"
                style={{ letterSpacing: '-0.03em' }}
              >
                {t('home.heroLine1', 'Queer venues,')} {t('home.heroLine2', 'events, and people.')}{' '}
                {t('home.heroLine3', 'Worldwide.')}
              </h1>
              <p className="mt-4 text-sm md:text-base text-muted-foreground leading-[1.5]">
                {t(
                  'home.subtitleShort',
                  'Verified safe places, real events, and the people behind them.',
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Returning visitors: one light personalized rail (self-hides) ─ */}
      <RecentlyViewedRail />

      {/* ── Events near you — live, functional discovery ─────────────── */}
      <ErrorBoundary section="regional-calendar" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
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

      {/* ── Latest news — feature + list ─────────────────────────────── */}
      <ErrorBoundary section="latest-news" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
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

      {/* ── Final CTA — adaptive on auth state ───────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-20 md:py-28 bg-foreground text-background">
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
