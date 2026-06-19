import React from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { RecentlyViewedRail } from '@/components/home/RecentlyViewedRail';

const MapShell = React.lazy(() => import('@/components/map/MapShell'));
const NewsMagazine = React.lazy(() => import('@/components/home/NewsMagazine'));
const EventsAgenda = React.lazy(() => import('@/components/home/EventsAgenda'));

// Hide the on-map search (the top-bar search is the single search) and keep the
// landing URL clean (no ?lat&lng&z written as the visitor pans).
const HOME_MAP_CONFIG = { showSearch: false, enableUrlState: false } as const;

const Index = React.memo(() => {
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { user } = useAuth();

  // Defer mounting the hero map until the browser is idle after first paint.
  // MapShell pulls the ~1MB maplibre chunk + heavy GL init; mounting it on the
  // first frame makes it contend with page text + the news/events data fetches.
  // The skeleton below holds the layout so nothing shifts.
  const [mapReady, setMapReady] = React.useState(false);
  React.useEffect(() => {
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setMapReady(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setMapReady(true), 200);
    return () => window.clearTimeout(id);
  }, []);

  const mapHeight = isMobile ? '70vh' : 'calc(100dvh - 64px)';

  return (
    <div className="min-h-screen">
      {/* ── Hero = the live map (same MapShell as /map), search-free ──── */}
      <section className="relative isolate overflow-hidden" style={{ height: mapHeight }}>
        <ErrorBoundary section="map" fallback={<div className="h-full w-full bg-muted" />}>
          {mapReady ? (
            <React.Suspense fallback={<div className="h-full w-full animate-pulse bg-muted" />}>
              <MapShell
                surface="discover"
                height={mapHeight}
                cooperativeGestures
                configOverride={HOME_MAP_CONFIG}
              />
            </React.Suspense>
          ) : (
            <div className="h-full w-full animate-pulse bg-muted" />
          )}
        </ErrorBoundary>

        {/* Headline kept for SEO + a11y only — visually hidden so the live map
            is the unobstructed hero (no overlay card blocking the centre). */}
        <h1 className="sr-only">
          {t('home.heroLine1', 'Queer venues,')} {t('home.heroLine2', 'events, and people.')}{' '}
          {t('home.heroLine3', 'Worldwide.')} —{' '}
          {t('home.subtitleShort', 'Verified safe places, real events, and the people behind them.')}
        </h1>
      </section>

      {/* ── Returning visitors: one light personalized rail (self-hides) ─ */}
      <RecentlyViewedRail />

      {/* ── Events near you — live date-grouped agenda ───────────────── */}
      <ErrorBoundary section="events-agenda" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
              <div className="max-w-7xl mx-auto">
                <Skeleton className="mb-8 h-9 w-64" />
                <div className="grid grid-cols-1 gap-x-10 gap-y-4 md:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-element" />
                  ))}
                </div>
              </div>
            </div>
          }
        >
          <EventsAgenda />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Latest news — editorial magazine grid ────────────────────── */}
      <ErrorBoundary section="news-magazine" fallback={null}>
        <React.Suspense
          fallback={
            <div className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
              <div className="max-w-7xl mx-auto grid grid-cols-1 gap-10 md:grid-cols-[1.1fr_1fr]">
                <Skeleton className="aspect-[16/10] w-full rounded-container" />
                <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/2] w-full rounded-element" />
                  ))}
                </div>
              </div>
            </div>
          }
        >
          <NewsMagazine />
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
