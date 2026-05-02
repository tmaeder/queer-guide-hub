import React, { useMemo, useEffect, useState } from 'react';
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
  ArrowUpRight,
} from 'lucide-react';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { AnimatedCounter } from '@/components/animation/AnimatedCounter';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const RegionalEventsCalendar = React.lazy(
  () => import('@/components/home/RegionalEventsCalendar'),
);

type Tone = 'pink' | 'blue' | 'mint' | 'yellow';
const featureDefs: Array<{
  icon: typeof MapPin;
  num: string;
  titleKey: string;
  descKey: string;
  link: string;
  tone: Tone;
}> = [
  { icon: MapPin,   num: '01', titleKey: 'home.features.venues',      descKey: 'home.features.venuesDesc',      link: '/venues',      tone: 'pink' },
  { icon: Calendar, num: '02', titleKey: 'home.features.events',      descKey: 'home.features.eventsDesc',      link: '/events',      tone: 'blue' },
  { icon: Store,    num: '03', titleKey: 'home.features.marketplace', descKey: 'home.features.marketplaceDesc', link: '/marketplace', tone: 'mint' },
  { icon: Plane,    num: '04', titleKey: 'home.features.places',      descKey: 'home.features.placesDesc',      link: '/places',      tone: 'yellow' },
  { icon: Building, num: '05', titleKey: 'home.features.hotels',      descKey: 'home.features.hotelsDesc',      link: '/hotels',      tone: 'pink' },
  { icon: Users,    num: '06', titleKey: 'home.features.community',   descKey: 'home.features.communityDesc',   link: '/groups',      tone: 'blue' },
  { icon: BookOpen, num: '07', titleKey: 'home.features.resources',   descKey: 'home.features.resourcesDesc',   link: '/resources',   tone: 'mint' },
];

const toneClass: Record<Tone, string> = {
  pink:   'riso-card',
  blue:   'riso-card riso-card-blue',
  mint:   'riso-card riso-card-mint',
  yellow: 'riso-card riso-card-yellow',
};

const issueDate = () =>
  new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: '2-digit' });

const Index = React.memo(() => {
  const { stats: realStats, loading, error: statsError } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();
  const [issue] = useState(issueDate);

  const stats = useMemo(
    () => [
      { value: realStats.venues,   label: t('home.stats.venues',  'Venues'),   link: '/venues' },
      { value: realStats.profiles, label: t('home.stats.members', 'Members') },
      { value: realStats.cities,   label: t('home.stats.cities',  'Cities'),   link: '/cities' },
      { value: realStats.events,   label: t('home.stats.events',  'Events'),   link: '/events' },
    ],
    [realStats, t],
  );

  const showStatsStrip =
    loading || (!statsError && stats.some((s) => typeof s.value === 'number' && s.value >= 100));

  // ensure background paper extends behind app shell on this page only
  useEffect(() => {
    document.documentElement.classList.add('riso-html');
    return () => document.documentElement.classList.remove('riso-html');
  }, []);

  return (
    <div className="riso-home">
      <div className="riso-content">
        {/* ── Masthead strip ─────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '14px clamp(16px, 4vw, 40px)',
            borderBottom: '2px solid var(--ink-black)',
            flexWrap: 'wrap',
          }}
        >
          <span className="riso-mono">
            {t('home.masthead.issue', 'Issue Nº')} {new Date().getFullYear() - 2019}
            {' · '}
            <span style={{ opacity: 0.7 }}>{issue}</span>
          </span>
          <span className="riso-mono" style={{ color: 'var(--ink-pink)' }}>
            {t('home.masthead.tagline', 'A Field Guide for Queer Life')}
          </span>
          <span className="riso-mono" style={{ opacity: 0.7 }}>
            EST. 2024 · WORLDWIDE
          </span>
        </div>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.05fr 1fr',
            gap: 'clamp(24px, 4vw, 56px)',
            padding: 'clamp(28px, 5vw, 64px) clamp(16px, 4vw, 40px) clamp(40px, 6vw, 88px)',
            alignItems: 'stretch',
          }}
        >
          {/* Left: type panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(16px, 2.5vw, 28px)' }}>
            <div className="riso-rise" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="riso-stamp" style={{ color: 'var(--ink-blue)' }}>
                ◆ {t('home.stamp.fieldGuide', 'Field Guide')}
              </span>
              <span className="riso-rule riso-rule-pink" style={{ flex: 1, maxWidth: 80 }} />
            </div>

            <h1
              className="riso-display riso-rise riso-d-1"
              style={{
                fontSize: 'clamp(3.25rem, 9vw, 7.5rem)',
                margin: 0,
              }}
            >
              <span
                className="riso-misreg"
                data-text={t('home.heroLine1', 'Discover.')}
              >
                {t('home.heroLine1', 'Discover.')}
              </span>
              <br />
              <em style={{ color: 'var(--ink-blue)' }}>
                {t('home.heroLine2', 'Connect.')}
              </em>
              <br />
              <span style={{ color: 'var(--ink-pink)' }}>
                {t('home.heroLine3', 'Belong.')}
              </span>
            </h1>

            <p
              className="riso-rise riso-d-2"
              style={{
                fontFamily: "'Newsreader', Georgia, serif",
                fontSize: 'clamp(1.05rem, 1.5vw, 1.35rem)',
                lineHeight: 1.45,
                maxWidth: '38ch',
                margin: 0,
                fontWeight: 400,
              }}
            >
              {t(
                'home.subtitle',
                'Safe venues, vibrant events, and communities that get you — wherever you are.',
              )}
            </p>

            <div className="riso-rise riso-d-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="riso-btn" onClick={() => navigate('/venues')}>
                <MapPin size={14} aria-hidden="true" />
                {t('home.browseVenues', 'Browse Venues')}
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
              <button type="button" className="riso-btn riso-btn-ghost" onClick={() => navigate('/events')}>
                <Calendar size={14} aria-hidden="true" />
                {t('home.viewEvents', 'View Events')}
              </button>
            </div>

            {/* Decorative meta strip */}
            <div
              className="riso-rise riso-d-4"
              style={{
                marginTop: 'auto',
                paddingTop: 24,
                borderTop: '2px solid var(--ink-black)',
                display: 'flex',
                gap: 'clamp(12px, 2vw, 32px)',
                flexWrap: 'wrap',
              }}
            >
              <span className="riso-mono">⟶ {t('home.meta.curated', 'Curated by humans')}</span>
              <span className="riso-mono" style={{ color: 'var(--ink-blue)' }}>
                ✦ {t('home.meta.local', 'Locally rooted')}
              </span>
              <span className="riso-mono" style={{ color: 'var(--ink-pink)' }}>
                ✺ {t('home.meta.free', 'Free to explore')}
              </span>
            </div>
          </div>

          {/* Right: framed map */}
          <div className="riso-rise riso-d-2 riso-map-frame" style={{ minHeight: isMobile ? '60vh' : '560px' }}>
            <ErrorBoundary section="map" fallback={null}>
              <React.Suspense
                fallback={
                  <div
                    className="riso-halftone-fade"
                    style={{ height: '100%', minHeight: isMobile ? '60vh' : '560px' }}
                  />
                }
              >
                <ExploreMap
                  height={isMobile ? '60vh' : '560px'}
                  defaultLayers={['venues', 'events']}
                  showFilters
                  showLayerToggles
                  linkToFullMap="/map"
                />
              </React.Suspense>
            </ErrorBoundary>
          </div>
        </section>

        {/* ── Stats — overprinted big numerals ──────────────────── */}
        {showStatsStrip && (
          <section
            data-testid="homepage-stats-strip"
            style={{
              background: 'var(--ink-black)',
              color: 'var(--paper)',
              padding: 'clamp(40px, 6vw, 80px) clamp(16px, 4vw, 40px)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              aria-hidden="true"
              className="riso-halftone-pink"
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.18,
                mixBlendMode: 'screen',
              }}
            />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 28 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span className="riso-mono" style={{ color: 'var(--ink-pink)' }}>
                  ✺ {t('home.stats.heading', 'By the numbers')}
                </span>
                <span className="riso-mono" style={{ opacity: 0.5 }}>
                  / {t('home.stats.live', 'Live')}
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                  gap: 'clamp(16px, 3vw, 40px)',
                }}
              >
                {stats.map((stat, i) => {
                  const inner = (
                    <>
                      <div
                        className="riso-numeral"
                        style={{
                          fontSize: 'clamp(3.5rem, 8vw, 7rem)',
                          color: i % 2 === 0 ? 'var(--ink-pink)' : 'var(--ink-yellow)',
                        }}
                      >
                        {loading ? (
                          <span style={{ opacity: 0.35 }}>—</span>
                        ) : typeof stat.value === 'number' && stat.value >= 100 ? (
                          <AnimatedCounter value={stat.value} suffix="+" />
                        ) : (
                          '—'
                        )}
                      </div>
                      <div
                        className="riso-mono"
                        style={{ marginTop: 8, color: 'var(--paper)', opacity: 0.75 }}
                      >
                        {stat.label}
                      </div>
                    </>
                  );
                  const block = (
                    <div
                      key={i}
                      style={{
                        borderTop: '2px solid var(--paper)',
                        paddingTop: 16,
                      }}
                    >
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
                  return block;
                })}
              </div>
            </div>
          </section>
        )}

        {/* ── Discovery widgets ─────────────────────────────────── */}
        <section
          style={{
            padding: 'clamp(32px, 5vw, 64px) clamp(16px, 4vw, 40px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 32,
          }}
        >
          <RecommendedForYou />
          <TrendingStrip />
        </section>

        {/* ── Explore — numbered tiles ─────────────────────────── */}
        <section
          style={{
            padding: 'clamp(32px, 5vw, 72px) clamp(16px, 4vw, 40px) clamp(40px, 6vw, 96px)',
          }}
        >
          <div className="riso-section-mark">
            <span className="num">§</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="lbl">{t('home.exploreLabel', 'Sections')} · 01—07</span>
            </div>
            <span className="ttl">{t('home.explore', 'Explore')}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? '1fr'
                : 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 18,
            }}
          >
            {featureDefs.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <LocalizedLink
                  to={feature.link}
                  key={feature.titleKey}
                  className={`${toneClass[feature.tone]} riso-rise`}
                  style={{
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'block',
                    padding: '22px 22px 26px',
                    animationDelay: `${80 + idx * 50}ms`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 18,
                    }}
                  >
                    <span
                      className="riso-numeral"
                      style={{
                        fontSize: '2rem',
                        color:
                          feature.tone === 'pink'
                            ? 'var(--ink-pink)'
                            : feature.tone === 'blue'
                            ? 'var(--ink-blue)'
                            : feature.tone === 'mint'
                            ? '#0e9474'
                            : '#b48400',
                      }}
                    >
                      {feature.num}
                    </span>
                    <Icon size={22} aria-hidden="true" strokeWidth={2.25} />
                  </div>
                  <div
                    style={{
                      fontFamily: "'Fraunces', serif",
                      fontVariationSettings: "'opsz' 144, 'SOFT' 100",
                      fontWeight: 800,
                      fontSize: '1.5rem',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.05,
                      marginBottom: 8,
                    }}
                  >
                    {t(feature.titleKey)}
                  </div>
                  <p
                    style={{
                      fontFamily: "'Newsreader', serif",
                      fontSize: '0.975rem',
                      lineHeight: 1.45,
                      margin: 0,
                      color: 'var(--ink-black)',
                      opacity: 0.78,
                    }}
                  >
                    {t(feature.descKey)}
                  </p>
                  <div
                    className="riso-mono"
                    style={{
                      marginTop: 18,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      borderTop: '1.5px solid var(--ink-black)',
                      paddingTop: 10,
                      width: '100%',
                    }}
                  >
                    {t('home.openSection', 'Open section')}
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </div>
                </LocalizedLink>
              );
            })}
          </div>
        </section>

        {/* ── Upcoming Events Near You ─────────────────────────── */}
        <ErrorBoundary section="regional-calendar" fallback={null}>
          <React.Suspense fallback={null}>
            <RegionalEventsCalendar />
          </React.Suspense>
        </ErrorBoundary>

        {/* ── Latest News ──────────────────────────────────────── */}
        <ErrorBoundary section="latest-news" fallback={null}>
          <React.Suspense fallback={null}>
            <LatestNewsSlider />
          </React.Suspense>
        </ErrorBoundary>

        {/* ── Colophon ─────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px clamp(16px, 4vw, 40px)',
            borderTop: '3px solid var(--ink-black)',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span className="riso-mono" style={{ opacity: 0.7 }}>
            ◆ queer.guide — {t('home.colophon', 'Printed in pixels, made for people')}
          </span>
          <span className="riso-mono" style={{ color: 'var(--ink-pink)' }}>
            ✺ {issue}
          </span>
        </div>
      </div>
    </div>
  );
});

Index.displayName = 'Index';
export default Index;
