import React, { useMemo } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { AnimatedCounter } from '@/components/animation/AnimatedCounter';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider'));
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
  const { stats: realStats, loading } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const navigate = useLocalizedNavigate();
  const { t } = useTranslation();

  const stats = useMemo(
    () =>
      loading
        ? [
            { value: 0, label: t('home.stats.venues', 'Venues') },
            { value: 0, label: t('home.stats.members', 'Members') },
            { value: 0, label: t('home.stats.cities', 'Cities') },
            { value: 0, label: t('home.stats.events', 'Events') },
          ]
        : [
            { value: realStats.venues, label: t('home.stats.venues', 'Venues') },
            { value: realStats.profiles, label: t('home.stats.members', 'Members') },
            { value: realStats.cities, label: t('home.stats.cities', 'Cities') },
            { value: realStats.events, label: t('home.stats.events', 'Events') },
          ],
    [loading, realStats, t],
  );

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* ── Hero + Map ───────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          minHeight: { xs: 'auto', md: 'calc(100vh - 64px)' },
          bgcolor: 'background.default',
        }}
      >
        {/* Text panel */}
        <Box
          sx={{
            flex: { xs: 'none', md: '0 0 35%' },
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            px: { xs: 2, sm: 3, md: 4 },
            py: { xs: 6, sm: 8, md: 0 },
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Typography
            variant="h1"
            className="reveal-up"
            sx={{
              fontSize: { xs: '2.5rem', sm: '3rem', md: '3.5rem', lg: '4rem' },
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              mb: 2,
              color: 'text.primary',
            }}
          >
            {t('home.heroLine1', 'Discover.')}
            <br />
            {t('home.heroLine2', 'Connect.')}
            <br />
            <Box component="span" sx={{ color: 'brand.main' }}>
              {t('home.heroLine3', 'Belong.')}
            </Box>
          </Typography>

          <Typography
            className="reveal-up reveal-delay-1"
            sx={{
              fontSize: { xs: '0.9375rem', md: '1.0625rem' },
              color: 'text.secondary',
              mb: 3,
              lineHeight: 1.6,
            }}
          >
            {t('home.subtitle', 'Safe venues, vibrant events, and communities that get you — wherever you are.')}
          </Typography>

          <Box
            className="reveal-up reveal-delay-2"
            sx={{
              display: 'flex',
              gap: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Button variant="outline" size={isMobile ? 'sm' : 'default'} onClick={() => navigate('/venues')}>
              <MapPin style={{ width: 16, height: 16, marginRight: 6 }} aria-hidden="true" />
              {t('home.browseVenues', 'Browse Venues')}
            </Button>
            <Button variant="outline" size={isMobile ? 'sm' : 'default'} onClick={() => navigate('/events')}>
              <Calendar style={{ width: 16, height: 16, marginRight: 6 }} aria-hidden="true" />
              {t('home.viewEvents', 'View Events')}
            </Button>
          </Box>
        </Box>

        {/* Map panel */}
        <Box
          sx={{
            flex: { xs: 'none', md: 1 },
            minHeight: { xs: '55vh', md: 0 },
            position: 'relative',
          }}
        >
          <ErrorBoundary section="map" fallback={null}>
            <React.Suspense
              fallback={
                <Box
                  sx={{
                    height: '100%',
                    minHeight: { xs: '55vh', md: 'calc(100vh - 64px)' },
                    bgcolor: 'action.hover',
                  }}
                />
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
        </Box>
      </Box>

      {/* ── Stats Strip ──────────────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor: 'text.primary',
          color: 'background.default',
          py: { xs: 5, md: 7 },
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        <StaggerGrid
          stagger={0.1}
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, 1fr)',
              md: 'repeat(4, 1fr)',
            },
            gap: { xs: 3, md: 4 },
          }}
        >
          {stats.map((stat, i) => (
            <Box key={i} sx={{ textAlign: 'center' }}>
              <Typography
                component="div"
                sx={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: { xs: '2.5rem', sm: '3rem', md: '4rem' },
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                  color: 'brand.main',
                }}
              >
                {loading ? '\u2014' : <AnimatedCounter value={stat.value} suffix="+" />}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: 'inherit',
                  opacity: 0.6,
                  mt: 0.5,
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                }}
              >
                {stat.label}
              </Typography>
            </Box>
          ))}
        </StaggerGrid>
      </Box>

      {/* ── Features Grid ────────────────────────────────────────────── */}
      <Box component="section" className="content-enter" sx={{ py: { xs: 6, md: 8 }, px: { xs: 2, sm: 3, md: 4 } }}>
        <Typography
          variant="h2"
          className="reveal-up"
          sx={{
            fontWeight: 800,
            mb: { xs: 4, md: 5 },
            fontSize: { xs: '1.75rem', md: '2.25rem' },
          }}
        >
          {t('home.explore', 'Explore')}
        </Typography>

        <StaggerGrid
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: 2.5,
          }}
        >
          {featureDefs.map((feature) => {
            const Icon = feature.icon;
            return (
              <LocalizedLink
                to={feature.link}
                key={feature.titleKey}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <Card
                  style={{
                    height: '100%',
                    cursor: 'pointer',
                  }}
                >
                  <CardContent
                    style={{
                      padding: isMobile ? 20 : 28,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        fontFamily: "'Plus Jakarta Sans', sans-serif",
                        fontSize: { xs: '1rem', md: '1.0625rem' },
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Icon
                        style={{ width: 18, height: 18, flexShrink: 0 }}
                        aria-hidden="true"
                      />
                      {t(feature.titleKey)}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: 'text.secondary',
                        lineHeight: 1.5,
                      }}
                    >
                      {t(feature.descKey)}
                    </Typography>
                  </CardContent>
                </Card>
              </LocalizedLink>
            );
          })}
        </StaggerGrid>
      </Box>

      {/* ── Weekly Events Near You ────────────────────────────────────── */}
      <ErrorBoundary section="weekly-events" fallback={null}>
        <React.Suspense fallback={null}>
          <WeeklyEventsSlider />
        </React.Suspense>
      </ErrorBoundary>

      {/* ── Regional Events Calendar ─────────────────────────────────── */}
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
    </Box>
  );
});

Index.displayName = 'Index';
export default Index;
