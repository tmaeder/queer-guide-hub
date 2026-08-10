import React from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Skeleton } from '@/components/ui/skeleton';
import { RecentlyViewedRail } from '@/components/home/RecentlyViewedRail';
import { DeferredSection } from '@/components/home/DeferredSection';
import { FadeIn } from '@/components/motion';
import { lazyOptional } from '@/utils/lazyRetry';
import { SubwayHero } from '@/components/home/subway/SubwayHero';
import { DeparturesBoard } from '@/components/home/subway/DeparturesBoard';
import { CityCards } from '@/components/home/subway/CityCards';
import { SupportBand } from '@/components/home/subway/SupportBand';

// Plain React.lazy reads `.default` off whatever the dynamic import resolves
// to; lazyOptional degrades to null when a stale deploy no longer serves the
// chunk instead of crashing the homepage.
const NewsMagazine = lazyOptional(() => import('@/components/home/NewsMagazine'));
const HomeShoppingSection = lazyOptional(() => import('@/components/home/HomeShoppingSection'));
const HomeBornThisWeek = lazyOptional(() => import('@/components/home/HomeBornThisWeek'));
const HomeOnThisDay = lazyOptional(() => import('@/components/home/HomeOnThisDay'));

// ── Section shells ───────────────────────────────────────────────────────────

const magazineSkeleton = (
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
);

const railSkeleton = (
  <div className="px-4 sm:px-6 md:px-8 py-12 md:py-16">
    <div className="max-w-7xl mx-auto">
      <Skeleton className="mb-8 h-9 w-64" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-[3/4] w-[200px] sm:w-[240px] shrink-0 rounded-container"
          />
        ))}
      </div>
    </div>
  </div>
);

/** Shared wrapper: error isolation + near-viewport deferral (code AND data)
 *  + scroll-in reveal for every below-fold homepage section. */
function HomeDeferred({
  section,
  skeleton,
  children,
}: {
  section: string;
  skeleton: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary section={section} fallback={null}>
      <DeferredSection fallback={skeleton}>
        <React.Suspense fallback={skeleton}>
          <FadeIn>{children}</FadeIn>
        </React.Suspense>
      </DeferredSection>
    </ErrorBoundary>
  );
}

/**
 * Homepage — subway-map edition (2026-08-09 rebrand).
 *
 * The template's shape: Anton hero + search entry + the four-track network
 * drawing, then band after band separated by 4px ink rules — departures
 * (real events), cities, news, history, marketplace, support. The old
 * map-hero was replaced by a "/map" entry point in the hero, which also
 * drops the ~1MB maplibre chunk from the homepage entirely.
 */
const Index = React.memo(() => {
  return (
    <div className="min-h-screen">
      {/* ── The hero now CARRIES the primary navigation: SubwayHero renders
           IntentMap, whose stations are the six intents. One canvas, one
           position, every breakpoint — the old isMobile split existed only to
           put the separate intent rail above the hero on phones. */}
      <SubwayHero />

      {/* ── Returning visitors: one light personalized rail (self-hides) ─ */}
      <RecentlyViewedRail />

      {/* ── Departures — the soonest real events as board rows ─────────── */}
      <ErrorBoundary section="departures" fallback={null}>
        <DeparturesBoard />
      </ErrorBoundary>

      {/* ── Cities — bordered cards with bending track lines ───────────── */}
      <ErrorBoundary section="cities" fallback={null}>
        <CityCards />
      </ErrorBoundary>

      {/* ── Latest news — editorial magazine grid ────────────────────── */}
      <HomeDeferred section="news-magazine" skeleton={magazineSkeleton}>
        <NewsMagazine />
      </HomeDeferred>

      {/* ── On this day — queer-history milestones (self-hides) ───────── */}
      <HomeDeferred section="on-this-day" skeleton={null}>
        <HomeOnThisDay />
      </HomeDeferred>

      {/* ── Born this week — community history marquee ────────────────── */}
      <HomeDeferred section="born-this-week" skeleton={null}>
        <HomeBornThisWeek />
      </HomeDeferred>

      {/* ── Marketplace — brand-safe spotlight + rail (self-hides) ───── */}
      <HomeDeferred section="home-shopping" skeleton={railSkeleton}>
        <HomeShoppingSection />
      </HomeDeferred>

      {/* ── Support — the closing band, paper with ink CTAs ───────────── */}
      <SupportBand />
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
