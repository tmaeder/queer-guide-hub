import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
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
  ArrowRight,
  Map,
} from 'lucide-react';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import { AnimatedCounter } from '@/components/animation/AnimatedCounter';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider'));
const RegionalEventsCalendar = React.lazy(
  () => import('@/components/home/RegionalEventsCalendar'),
);

// HSL-based feature color system — auto-computes light/dark variants
const FEATURE_HUES = [
  { key: 'venues', hue: 0, sat: 70 },
  { key: 'events', hue: 25, sat: 85 },
  { key: 'marketplace', hue: 142, sat: 60 },
  { key: 'places', hue: 211, sat: 75 },
  { key: 'community', hue: 330, sat: 80 },
  { key: 'resources', hue: 174, sat: 55 },
] as const;

function featureColor(hue: number, sat: number, isDark: boolean) {
  return {
    accent: `hsl(${hue}, ${sat}%, ${isDark ? 70 : 40}%)`,
    bg: `hsl(${hue}, ${sat}%, ${isDark ? 10 : 95}%)`,
  };
}

const features = [
  {
    icon: MapPin,
    title: 'Venues',
    description: 'Verified queer-friendly spaces where you can be yourself',
    link: '/venues',
  },
  {
    icon: Calendar,
    title: 'Events',
    description: 'Local and virtual gatherings in your area',
    link: '/events',
  },
  {
    icon: Store,
    title: 'Marketplace',
    description: 'Support queer-owned businesses and creators',
    link: '/marketplace',
  },
  {
    icon: Plane,
    title: 'Places',
    description: 'Explore queer-friendly cities and countries',
    link: '/places',
  },
  {
    icon: Users,
    title: 'Community',
    description: 'Connect with people and join groups',
    link: '/groups',
  },
  {
    icon: BookOpen,
    title: 'Resources',
    description: 'Rights, culture, and community support',
    link: '/resources',
  },
];

const Index = React.memo(() => {
  const { stats: realStats, loading } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();

  const stats = useMemo(
    () =>
      loading
        ? [
            { value: 0, label: 'Verified Venues' },
            { value: 0, label: 'Community Members' },
            { value: 0, label: 'Cities Worldwide' },
            { value: 0, label: 'Weekly Events' },
          ]
        : [
            { value: realStats.venues, label: 'Verified Venues' },
            { value: realStats.profiles, label: 'Community Members' },
            { value: realStats.cities, label: 'Cities Worldwide' },
            { value: realStats.events, label: 'Weekly Events' },
          ],
    [loading, realStats],
  );

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Box
        className="hero-gradient hero-grain"
        sx={{
          position: 'relative',
          overflow: 'hidden',
          py: { xs: 10, sm: 14, md: 18 },
          px: 2,
        }}
      >
        <Container
          maxWidth="md"
          sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}
        >
          <Typography
            variant="h1"
            className="reveal-up"
            sx={{
              fontSize: { xs: '2.75rem', sm: '3.75rem', md: '5rem' },
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              mb: { xs: 2.5, md: 3 },
              color: 'text.primary',
            }}
          >
            Your world.
            <br />
            Your way.
          </Typography>

          <Typography
            className="reveal-up reveal-delay-1"
            sx={{
              fontSize: { xs: '1.0625rem', sm: '1.1875rem', md: '1.375rem' },
              color: 'text.secondary',
              maxWidth: 520,
              mx: 'auto',
              mb: { xs: 4, md: 5 },
              lineHeight: 1.6,
            }}
          >
            Safe venues, vibrant events, and communities that get you —
            wherever you are.
          </Typography>

          <Box
            className="reveal-up reveal-delay-2"
            sx={{
              display: 'flex',
              gap: { xs: 1.5, md: 2 },
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button size="lg" onClick={() => navigate('/map')}>
              <Map
                style={{ width: 18, height: 18, marginRight: 8 }}
                aria-hidden="true"
              />
              Explore the Map
            </Button>
            <Button variant="outline" size="lg" onClick={() => navigate('/venues')}>
              Browse Venues
              <ArrowRight
                style={{ width: 18, height: 18, marginLeft: 8 }}
                aria-hidden="true"
              />
            </Button>
          </Box>
        </Container>
      </Box>

      {/* ── Stats Strip ──────────────────────────────────────────────── */}
      <Box
        sx={{
          bgcolor: 'text.primary',
          color: 'background.default',
          py: { xs: 4, md: 5 },
          borderTop: 2,
          borderColor: theme.palette.brand?.main || '#DB2777',
        }}
      >
        <Container maxWidth="lg">
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
                    fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                    color: 'inherit',
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
        </Container>
      </Box>

      {/* ── Features Grid ────────────────────────────────────────────── */}
      <Box component="section" className="content-enter" sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="h4"
            className="reveal-up"
            sx={{
              fontWeight: 700,
              mb: { xs: 1, md: 1.5 },
              fontSize: { xs: '1.5rem', md: '1.875rem' },
            }}
          >
            Explore
          </Typography>
          <Typography
            color="text.secondary"
            className="reveal-up reveal-delay-1"
            sx={{ mb: { xs: 3, md: 4 }, fontSize: { xs: '0.9375rem', md: '1.0625rem' } }}
          >
            All the good stuff, one tap away.
          </Typography>

          <StaggerGrid
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: 2.5,
            }}
          >
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const { hue, sat } = FEATURE_HUES[index];
              const colors = featureColor(hue, sat, isDark);
              return (
                <Link
                  to={feature.link}
                  key={feature.title}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <Card
                    className="feature-card-lift"
                    style={{ height: '100%', cursor: 'pointer' }}
                  >
                    <CardContent
                      style={{
                        padding: isMobile ? 20 : 24,
                        height: '100%',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 16,
                      }}
                    >
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: 3,
                          bgcolor: colors.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon
                          style={{
                            width: 22,
                            height: 22,
                            color: colors.accent,
                          }}
                          aria-hidden="true"
                        />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 700,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            mb: 0.5,
                            fontSize: { xs: '0.9375rem', md: '1rem' },
                          }}
                        >
                          {feature.title}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'text.secondary',
                            lineHeight: 1.5,
                          }}
                        >
                          {feature.description}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </StaggerGrid>
        </Container>
      </Box>

      {/* ── Explore Map ──────────────────────────────────────────────── */}
      <ScrollReveal direction="up">
      <Box
        component="section"
        sx={{
          bgcolor: isDark ? 'background.paper' : '#f8f8f8',
          py: { xs: 6, md: 10 },
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: { xs: 2, md: 3 },
            }}
          >
            <Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  mb: 0.5,
                  fontSize: { xs: '1.5rem', md: '1.875rem' },
                }}
              >
                Explore Near You
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontSize: { xs: '0.875rem', md: '1rem' } }}
              >
                Venues and events on the map
              </Typography>
            </Box>
            <Button
              variant="outline"
              size={isMobile ? 'sm' : 'default'}
              onClick={() => navigate('/map')}
            >
              Full Map
              <ArrowRight
                style={{
                  marginLeft: 8,
                  width: isMobile ? 14 : 16,
                  height: isMobile ? 14 : 16,
                }}
                aria-hidden="true"
              />
            </Button>
          </Box>
          <Box sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <ErrorBoundary section="map" fallback={null}>
              <React.Suspense
                fallback={
                  <Box
                    sx={{
                      height: { xs: 360, md: 480 },
                      bgcolor: 'action.hover',
                      borderRadius: 3,
                    }}
                  />
                }
              >
                <ExploreMap
                  height={isMobile ? 360 : 480}
                  defaultLayers={['venues', 'events']}
                  showFilters
                  showLayerToggles
                  linkToFullMap="/map"
                />
              </React.Suspense>
            </ErrorBoundary>
          </Box>
        </Container>
      </Box>
      </ScrollReveal>

      {/* ── Weekly Events Near You ────────────────────────────────────── */}
      <React.Suspense fallback={null}>
        <WeeklyEventsSlider />
      </React.Suspense>

      {/* ── Regional Events Calendar ─────────────────────────────────── */}
      <React.Suspense fallback={null}>
        <RegionalEventsCalendar />
      </React.Suspense>

      {/* ── Latest News ──────────────────────────────────────────────── */}
      <React.Suspense fallback={null}>
        <LatestNewsSlider />
      </React.Suspense>
    </Box>
  );
});

Index.displayName = 'Index';
export default Index;
