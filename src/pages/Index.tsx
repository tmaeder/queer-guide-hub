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
import { GrainOverlay } from '@/components/effects/GrainOverlay';
import { Sparkles } from '@/components/effects/Sparkles';
import { Beams } from '@/components/effects/Beams';
import { Meteors } from '@/components/effects/Meteors';
import { ShootingStars } from '@/components/effects/ShootingStars';
import { WordRotate } from '@/components/effects/WordRotate';
import { Marquee } from '@/components/effects/Marquee';
import { BackgroundLines } from '@/components/effects/BackgroundLines';
import { LampEffect } from '@/components/effects/LampEffect';
import { ShineButton } from '@/components/effects/ShineButton';
import { HoverBorderGradient } from '@/components/effects/HoverBorderGradient';
import { Boxes } from '@/components/effects/Boxes';
import { TextHoverEffect } from '@/components/effects/TextHoverEffect';
import { ExpandableCard, type ExpandableCardItem } from '@/components/effects/ExpandableCard';
import { AnimatedModal } from '@/components/effects/AnimatedModal';
import { CardContainer3D, CardItem } from '@/components/effects/CardContainer3D';
import { GlowingEffect } from '@/components/effects/GlowingEffect';
import { WorldMap } from '@/components/effects/WorldMap';
import { AppleCardsCarousel, type CarouselCard } from '@/components/effects/AppleCardsCarousel';
import { WobbleCard } from '@/components/effects/WobbleCard';
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
        <GrainOverlay />
        {/* Aceternity ambient backdrop — beams + sparkles + shooting stars. */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none z-0">
          <Beams count={9} />
          <Sparkles density={70} />
          <Meteors number={14} />
          <ShootingStars minDelay={2400} maxDelay={6000} trailLength={120} />
          <div className="absolute inset-0 spotlight-radial" />
        </div>
        {/* Text panel */}
        <SpotlightEffect className="md:flex-[0_0_35%] flex flex-col justify-center px-4 sm:px-6 md:px-8 py-12 sm:py-16 md:py-0 relative z-[1]">
          <TextGenerateEffect
            words={`${t('home.heroLine1', 'Discover.')} ${t('home.heroLine2', 'Connect.')} ${t('home.heroLine3', 'Belong.')}`}
            className="text-[2.5rem] sm:text-[3rem] md:text-[3.5rem] lg:text-[4rem] font-extrabold leading-[1.05] mb-3 text-foreground"
            style={{ letterSpacing: '-0.04em' }}
            as="h1"
            staggerDelay={0.08}
          />

          <div className="reveal-up reveal-delay-1 text-[1.125rem] md:text-[1.25rem] font-medium mb-4 text-muted-foreground">
            <span className="mr-1.5">{t('home.rotatePrefix', 'Find queer')}</span>
            <WordRotate
              className="text-foreground font-semibold"
              words={[
                t('home.rotate.venues', 'venues'),
                t('home.rotate.events', 'events'),
                t('home.rotate.community', 'community'),
                t('home.rotate.travel', 'travel tips'),
                t('home.rotate.stories', 'stories'),
              ]}
            />
          </div>

          <p className="reveal-up reveal-delay-2 text-[0.9375rem] md:text-[1.0625rem] text-muted-foreground mb-6 leading-[1.6]">
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

      {/* ── Aceternity marquee: rotating value-prop strip ────────────── */}
      <div className="border-y border-border/50 py-6 bg-muted/30">
        <Marquee speed={50} className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {[
            'Verified safe spaces',
            'Built by the community',
            'Real reviews from real people',
            'Privacy first',
            '180+ countries',
            'Open data',
            'No paywalls',
            'Worldwide',
          ].map((phrase) => (
            <span key={phrase} className="inline-flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-foreground" aria-hidden />
              {phrase}
            </span>
          ))}
        </Marquee>
      </div>

      {/* ── Trending Cities carousel (Aceternity AppleCardsCarousel) ── */}
      <section className="px-4 sm:px-6 md:px-8 py-10 md:py-14">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between mb-4">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
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

      {/* ── Discovery widgets (search v2) ────────────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-8 md:py-12 flex flex-col gap-8">
        <RecommendedForYou />
        <TrendingStrip />
      </section>

      {/* ── Why Queer Guide — WobbleCards trio ─────────────────────── */}
      <section className="px-4 sm:px-6 md:px-8 py-10 md:py-14 max-w-7xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-6">
          {t('home.why.title', 'Why Queer Guide')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <WobbleCard className="h-full">
            <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">01</div>
            <h3 className="text-xl font-bold tracking-tight mt-1">{t('home.why.community.title', 'Built by the community.')}</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-[1.55]">
              {t('home.why.community.desc', 'Verified by people who actually go — not by algorithms or paid placements.')}
            </p>
          </WobbleCard>
          <WobbleCard className="h-full">
            <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">02</div>
            <h3 className="text-xl font-bold tracking-tight mt-1">{t('home.why.privacy.title', 'Privacy first.')}</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-[1.55]">
              {t('home.why.privacy.desc', 'No location tracking, no third-party trackers, no dark patterns. Ever.')}
            </p>
          </WobbleCard>
          <WobbleCard className="h-full">
            <div className="text-sm font-medium uppercase tracking-wider text-muted-foreground">03</div>
            <h3 className="text-xl font-bold tracking-tight mt-1">{t('home.why.free.title', 'Free, forever.')}</h3>
            <p className="text-sm text-muted-foreground mt-3 leading-[1.55]">
              {t('home.why.free.desc', 'No paywalls. Donations and ethical partnerships keep us running.')}
            </p>
          </WobbleCard>
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────────────── */}
      <BackgroundDots className="relative py-12 md:py-16 px-4 sm:px-6 md:px-8">
        <BackgroundLines className="opacity-60" />
        <h2 className="reveal-up font-extrabold mb-8 md:mb-10 text-[1.75rem] md:text-[2.25rem] relative">
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
                <div className="relative h-full overflow-hidden rounded-[inherit]">
                  <GlowingEffect spread={260} intensity={0.28} />
                  <CardContainer3D
                    rotateRange={6}
                    containerClassName="h-full"
                    className="h-full"
                  >
                    <LocalizedLink
                      to={feature.link}
                      style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}
                    >
                      <CardItem translateZ={30} className="font-bold text-base md:text-[1.0625rem] flex items-center gap-2">
                        <Icon size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
                        {t(feature.titleKey)}
                      </CardItem>
                      <CardItem translateZ={16} as="p" className="text-sm text-muted-foreground leading-[1.5]">
                        {t(feature.descKey)}
                      </CardItem>
                    </LocalizedLink>
                  </CardContainer3D>
                </div>
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

      {/* ── Featured stories — Aceternity ExpandableCard grid ─────── */}
      <section className="px-4 sm:px-6 md:px-8 py-12 md:py-16 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
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

      {/* ── Newsletter modal — Aceternity AnimatedModal ─────────── */}
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

      {/* ── Aceternity Boxes teaser — interactive monochrome backdrop ── */}
      <section className="relative h-72 w-full overflow-hidden bg-background flex items-center justify-center">
        <div className="absolute inset-0 z-0 [mask-image:radial-gradient(transparent,white)] pointer-events-none">
          <Boxes />
        </div>
        <div className="relative z-10 max-w-3xl text-center px-4">
          <div className="h-24 md:h-32">
            <TextHoverEffect text="QUEER.GUIDE" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('home.boxes.subtitle', 'Move your cursor across the grid.')}
          </p>
        </div>
      </section>

      {/* ── World map — global community ─────────────────────────── */}
      <section className="relative py-16 md:py-24 px-4 sm:px-6 md:px-8 overflow-hidden">
        <div className="max-w-5xl mx-auto text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            {t('home.world.title', 'A community without borders.')}
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            {t('home.world.subtitle', 'Verified safe places, real reviews, and the people behind them — from Brooklyn to Berlin to Bangkok.')}
          </p>
        </div>
        <div className="max-w-6xl mx-auto">
          <WorldMap
            dots={[
              { start: { lat: 40.7128, lng: -74.006, label: 'New York' }, end: { lat: 51.5072, lng: -0.1276, label: 'London' } },
              { start: { lat: 51.5072, lng: -0.1276, label: 'London' }, end: { lat: 52.52, lng: 13.405, label: 'Berlin' } },
              { start: { lat: 52.52, lng: 13.405, label: 'Berlin' }, end: { lat: 41.9028, lng: 12.4964, label: 'Rome' } },
              { start: { lat: 41.9028, lng: 12.4964, label: 'Rome' }, end: { lat: -33.8688, lng: 151.2093, label: 'Sydney' } },
              { start: { lat: -33.8688, lng: 151.2093, label: 'Sydney' }, end: { lat: 13.7563, lng: 100.5018, label: 'Bangkok' } },
              { start: { lat: 13.7563, lng: 100.5018, label: 'Bangkok' }, end: { lat: 35.6762, lng: 139.6503, label: 'Tokyo' } },
              { start: { lat: 35.6762, lng: 139.6503, label: 'Tokyo' }, end: { lat: 37.7749, lng: -122.4194, label: 'San Francisco' } },
              { start: { lat: 37.7749, lng: -122.4194, label: 'San Francisco' }, end: { lat: 19.4326, lng: -99.1332, label: 'Mexico City' } },
              { start: { lat: 19.4326, lng: -99.1332, label: 'Mexico City' }, end: { lat: -22.9068, lng: -43.1729, label: 'Rio' } },
              { start: { lat: -22.9068, lng: -43.1729, label: 'Rio' }, end: { lat: -33.9249, lng: 18.4241, label: 'Cape Town' } },
            ]}
          />
        </div>
      </section>

      {/* ── Lamp CTA — call-to-action with Aceternity lamp ─────────── */}
      <LampEffect className="min-h-[26rem] py-12">
        <h2 className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-center text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-transparent">
          {t('home.cta.title', 'Built by the community,')}
          <br />
          {t('home.cta.title2', 'for the community.')}
        </h2>
        <p className="mt-3 text-center text-muted-foreground max-w-xl">
          {t('home.cta.subtitle', 'Verified safe spaces, real reviews, no paywalls.')}
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <LocalizedLink to="/submit" style={{ textDecoration: 'none' }}>
            <ShineButton>{t('home.cta.submit', 'Add a venue')}</ShineButton>
          </LocalizedLink>
          <LocalizedLink to="/about" style={{ textDecoration: 'none' }}>
            <HoverBorderGradient>{t('home.cta.about', 'Read the mission')}</HoverBorderGradient>
          </LocalizedLink>
        </div>
      </LampEffect>
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
