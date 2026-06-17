import React from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { RecentlyViewedRail } from '@/components/home/RecentlyViewedRail';
import { EtherHero } from '@/components/home/EtherHero';
import { EtherSection, GlassCard, MagneticCTA } from '@/components/ui/glass';

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

  const framedMapHeight = isMobile ? '60vh' : '64vh';

  return (
    <div className="dark ether-canvas min-h-screen">
      {/* ── Hero — Ethereal Glass OLED landing (the reskin north star) ─── */}
      <EtherHero />

      {/* ── The live map, framed inside the OLED canvas ───────────────── */}
      <EtherSection orbs={false} grain={false} className="px-4 py-20 sm:px-6 md:px-8 md:py-28">
        <div className="mx-auto max-w-6xl">
          <span className="ether-eyebrow">{t('home.mapEyebrow', 'Live map')}</span>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-2xl font-display text-display font-semibold leading-tight tracking-[-0.03em] text-white">
              {t('home.mapHeading', 'Every safe space, mapped.')}
            </h2>
            <MagneticCTA to="/map">{t('home.openFullMap', 'Open full map')}</MagneticCTA>
          </div>
          <div className="glass-shell mt-10">
            <div className="glass-core overflow-hidden" style={{ height: framedMapHeight }}>
              <ErrorBoundary section="map" fallback={<div className="h-full w-full bg-white/5" />}>
                <React.Suspense
                  fallback={<div className="h-full w-full animate-pulse bg-white/5" />}
                >
                  <MapShell
                    surface="discover"
                    height={framedMapHeight}
                    cooperativeGestures
                    configOverride={HOME_MAP_CONFIG}
                  />
                </React.Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </EtherSection>

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

      {/* ── Final CTA — Ethereal Glass, adaptive on auth state ────────── */}
      <EtherSection className="px-4 py-28 sm:px-6 md:px-8 md:py-40">
        <div className="mx-auto max-w-6xl">
          <GlassCard coreClassName="px-8 py-16 md:px-16 md:py-24">
            <span className="ether-eyebrow">{t('home.cta.eyebrow', 'No paywalls, ever')}</span>
            <h2 className="mt-8 max-w-3xl font-display text-display font-semibold leading-[1.02] tracking-[-0.035em] text-white md:text-hero">
              {t('home.cta.title', 'Built by the community,')}{' '}
              {t('home.cta.title2', 'for the community.')}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/55">
              {t('home.cta.subtitle', 'Verified safe spaces, real reviews, no paywalls.')}
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              {user ? (
                <>
                  <MagneticCTA to="/submit" solid>
                    {t('home.cta.submit', 'Add a venue')}
                  </MagneticCTA>
                  <MagneticCTA to="/friends">
                    {t('home.cta.invite', 'Invite friends')}
                  </MagneticCTA>
                </>
              ) : (
                <>
                  <MagneticCTA to="/auth?mode=signup" solid>
                    {t('home.cta.join', 'Join the community')}
                  </MagneticCTA>
                  <MagneticCTA to="/about">{t('home.cta.about', 'Read the mission')}</MagneticCTA>
                </>
              )}
            </div>
          </GlassCard>
        </div>
      </EtherSection>
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
