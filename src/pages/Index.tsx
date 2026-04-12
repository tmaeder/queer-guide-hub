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
  Building,
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
import { categoryColor, categoryBg, type CategoryKey } from '@/lib/categoryColors';

const ExploreMap = React.lazy(() => import('@/components/map/ExploreMap'));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider'));
const RegionalEventsCalendar = React.lazy(
  () => import('@/components/home/RegionalEventsCalendar'),
);

const features: {
  icon: typeof MapPin;
  title: string;
  description: string;
  link: string;
  category: CategoryKey;
}[] = [
  {
    icon: MapPin,
    title: 'Venues',
    description: 'Verified queer-friendly spaces where you can be yourself',
    link: '/venues',
    category: 'venues',
  },
  {
    icon: Calendar,
    title: 'Events',
    description: 'Local and virtual gatherings in your area',
    link: '/events',
    category: 'events',
  },
  {
    icon: Store,
    title: 'Marketplace',
    description: 'Support queer-owned businesses and creators',
    link: '/marketplace',
    category: 'marketplace',
  },
  {
    icon: Plane,
    title: 'Places',
    description: 'Explore queer-friendly cities and countries',
    link: '/places',
    category: 'places',
  },
  {
    icon: Building,
    title: 'Hotels',
    description: 'Welcoming accommodations worldwide',
    link: '/hotels',
    category: 'hotels',
  },
  {
    icon: Users,
    title: 'Community',
    description: 'Connect with people and join groups',
    link: '/groups',
    category: 'community',
  },
  {
    icon: BookOpen,
    title: 'Resources',
    description: 'Rights, culture, and community support',
    link: '/resources',
    category: 'news',
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
            { value: 0, label: 'Verified Venues', cat: 'venues' as CategoryKey },
            { value: 0, label: 'Community Members', cat: 'community' as CategoryKey },
            { value: 0, label: 'Cities Worldwide', cat: 'places' as CategoryKey },
            { value: 0, label: 'Weekly Events', cat: 'events' as CategoryKey },
          ]
        : [
            { value: realStats.venues, label: 'Verified Venues', cat: 'venues' as CategoryKey },
            { value: realStats.profiles, label: 'Community Members', cat: 'community' as CategoryKey },
            { value: realStats.cities, label: 'Cities Worldwide', cat: 'places' as CategoryKey },
            { value: realStats.events, label: 'Weekly Events', cat: 'events' as CategoryKey },
          ],
    [loading, realStats],
  );

  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          py: { xs: 14, sm: 18, md: 24 },
          px: 2,
          bgcolor: 'background.default',
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
              fontSize: { xs: '3rem', sm: '4.5rem', md: '6rem' },
              fontWeight: 800,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              mb: { xs: 3, md: 4 },
              color: 'text.primary',
            }}
          >
            Discover.
            <br />
            Connect.
            <br />
            <Box
              component="span"
              sx={{ color: categoryColor('community') }}
            >
              Belong.
            </Box>
          </Typography>

          <Typography
            className="reveal-up reveal-delay-1"
            sx={{
              fontSize: { xs: '1.0625rem', sm: '1.1875rem', md: '1.375rem' },
              color: 'text.secondary',
              maxWidth: 540,
              mx: 'auto',
              mb: { xs: 5, md: 6 },
              lineHeight: 1.7,
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
          py: { xs: 5, md: 7 },
          borderTop: 3,
          borderImage: `linear-gradient(90deg, ${categoryColor('venues')}, ${categoryColor('events')}, ${categoryColor('marketplace')}, ${categoryColor('places')}, ${categoryColor('hotels')}, ${categoryColor('community')}) 1`,
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
                    fontSize: { xs: '2.5rem', sm: '3rem', md: '4rem' },
                    letterSpacing: '-0.03em',
                    lineHeight: 1.1,
                    color: categoryColor(stat.cat),
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
      <Box component="section" className="content-enter" sx={{ py: { xs: 8, md: 14 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            className="reveal-up"
            sx={{
              fontWeight: 800,
              mb: { xs: 1, md: 1.5 },
              fontSize: { xs: '1.75rem', md: '2.25rem' },
            }}
          >
            Explore
          </Typography>
          <Typography
            color="text.secondary"
            className="reveal-up reveal-delay-1"
            sx={{ mb: { xs: 4, md: 5 }, fontSize: { xs: '0.9375rem', md: '1.0625rem' } }}
          >
            Everything you need, one tap away.
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
            {features.map((feature) => {
              const Icon = feature.icon;
              const catCssVar = `--cat-${feature.category}`;
              return (
                <Link
                  to={feature.link}
                  key={feature.title}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <Card
                    className="card-category-hover"
                    style={{
                      height: '100%',
                      cursor: 'pointer',
                      ['--_cat' as string]: `var(${catCssVar})`,
                    }}
                  >
                    <CardContent
                      style={{
                        padding: isMobile ? 20 : 28,
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Box
                          className="cat-hover-icon-box"
                          sx={{
                            width: 52,
                            height: 52,
                            borderRadius: 3,
                            bgcolor: categoryBg(feature.category, isDark),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                          }}
                        >
                          <Icon
                            className="cat-hover-icon"
                            style={{
                              width: 24,
                              height: 24,
                              color: categoryColor(feature.category),
                              transition: 'color 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                            }}
                            aria-hidden="true"
                          />
                        </Box>
                        <ArrowRight
                          className="cat-hover-arrow"
                          style={{
                            width: 18,
                            height: 18,
                            color: 'currentColor',
                          }}
                          aria-hidden="true"
                        />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          className="cat-hover-title"
                          variant="subtitle1"
                          sx={{
                            fontWeight: 700,
                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                            mb: 0.5,
                            fontSize: { xs: '1rem', md: '1.0625rem' },
                            transition: 'color 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                          }}
                        >
                          {feature.title}
                        </Typography>
                        <Typography
                          className="cat-hover-desc"
                          variant="body2"
                          sx={{
                            color: 'text.secondary',
                            lineHeight: 1.5,
                            transition: 'color 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
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
          py: { xs: 8, md: 14 },
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: { xs: 3, md: 4 },
            }}
          >
            <Box>
              <Typography
                variant="h2"
                sx={{
                  fontWeight: 800,
                  mb: 0.5,
                  fontSize: { xs: '1.75rem', md: '2.25rem' },
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
