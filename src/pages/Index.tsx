import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider'));
const RegionalEventsCalendar = React.lazy(
  () => import('@/components/home/RegionalEventsCalendar'),
);

const features = [
  {
    icon: MapPin,
    title: 'Venues',
    description: 'Verified queer-friendly spaces where you can be yourself',
    link: '/venues',
    accent: '#c62828',
    accentDark: '#ef9a9a',
    bgLight: '#ffebee',
    bgDark: '#2a0808',
  },
  {
    icon: Calendar,
    title: 'Events',
    description: 'Local and virtual gatherings in your area',
    link: '/events',
    accent: '#e65100',
    accentDark: '#ffcc80',
    bgLight: '#fff3e0',
    bgDark: '#2a1400',
  },
  {
    icon: Store,
    title: 'Marketplace',
    description: 'Support queer-owned businesses and creators',
    link: '/marketplace',
    accent: '#2e7d32',
    accentDark: '#a5d6a7',
    bgLight: '#e8f5e9',
    bgDark: '#0a2a0c',
  },
  {
    icon: Plane,
    title: 'Places',
    description: 'Explore queer-friendly cities and countries',
    link: '/places',
    accent: '#1565c0',
    accentDark: '#90caf9',
    bgLight: '#e3f2fd',
    bgDark: '#061a30',
  },
  {
    icon: Users,
    title: 'Community',
    description: 'Connect with people and join groups',
    link: '/groups',
    accent: '#6a1b9a',
    accentDark: '#ce93d8',
    bgLight: '#f3e5f5',
    bgDark: '#1a0828',
  },
  {
    icon: BookOpen,
    title: 'Resources',
    description: 'Rights, culture, and community support',
    link: '/resources',
    accent: '#00695c',
    accentDark: '#80cbc4',
    bgLight: '#e0f2f1',
    bgDark: '#002420',
  },
];

const Index = React.memo(() => {
  const { stats: realStats, loading } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();

  const formatNumber = (num: number) => {
    if (num >= 1000) return `${Math.floor(num / 1000)}K+`;
    return num.toString();
  };

  const stats = useMemo(
    () =>
      loading
        ? [
            { number: '\u2014', label: 'Verified Venues' },
            { number: '\u2014', label: 'Community Members' },
            { number: '\u2014', label: 'Cities Worldwide' },
            { number: '\u2014', label: 'Weekly Events' },
          ]
        : [
            { number: formatNumber(realStats.venues), label: 'Verified Venues' },
            { number: formatNumber(realStats.profiles), label: 'Community Members' },
            { number: formatNumber(realStats.cities), label: 'Cities Worldwide' },
            { number: formatNumber(realStats.events), label: 'Weekly Events' },
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
            Your guide to
            <br />
            queer spaces
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
            Discover safe venues, vibrant events, and welcoming communities —
            everywhere you go.
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
          py: { xs: 3.5, md: 4.5 },
        }}
      >
        <Container maxWidth="lg">
          <Box
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
                  sx={{
                    fontFamily: "'Montserrat', sans-serif",
                    fontWeight: 800,
                    fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                    color: 'inherit',
                  }}
                >
                  {stat.number}
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
          </Box>
        </Container>
      </Box>

      {/* ── Features Grid ────────────────────────────────────────────── */}
      <Box component="section" sx={{ py: { xs: 5, md: 8 } }}>
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
            Everything you need, in one place.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
              },
              gap: { xs: 2, md: 2.5 },
            }}
          >
            {features.map((feature, index) => {
              const Icon = feature.icon;
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
                          borderRadius: '12px',
                          bgcolor: isDark ? feature.bgDark : feature.bgLight,
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
                            color: isDark ? feature.accentDark : feature.accent,
                          }}
                          aria-hidden="true"
                        />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 700,
                            fontFamily: "'Montserrat', sans-serif",
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
          </Box>
        </Container>
      </Box>

      {/* ── Explore Map ──────────────────────────────────────────────── */}
      <Box
        component="section"
        sx={{
          bgcolor: isDark ? 'background.paper' : '#f8f8f8',
          py: { xs: 5, md: 8 },
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
          <Box sx={{ borderRadius: '12px', overflow: 'hidden' }}>
            <React.Suspense
              fallback={
                <Box
                  sx={{
                    height: { xs: 360, md: 480 },
                    bgcolor: 'action.hover',
                    borderRadius: '12px',
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
          </Box>
        </Container>
      </Box>

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
