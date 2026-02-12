import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MapPin, Calendar, Store, Plane, Users, Shield, ArrowRight, CheckCircle, Sparkles, Globe, Search, BookOpen, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useConsolidatedStats } from '@/hooks/useConsolidatedStats';
import { useIsMobile } from '@/hooks/use-mobile';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';


const FrontPageVenueMap = React.lazy(() => import('@/components/home/FrontPageVenueMap'));
const VenueMapSearch = React.lazy(() => import('@/components/venues/VenueMapSearch').then(m => ({ default: m.VenueMapSearch })));
const LatestNewsSlider = React.lazy(() => import('@/components/home/LatestNewsSlider'));
const WeeklyEventsSlider = React.lazy(() => import('@/components/home/WeeklyEventsSlider'));
const RegionalEventsCalendar = React.lazy(() => import('@/components/home/RegionalEventsCalendar'));
const Index = React.memo(() => {
  const {
    user
  } = useAuth();
  const {
    stats: realStats,
    loading
  } = useConsolidatedStats();
  const isMobile = useIsMobile();
  const features = [{
    icon: MapPin,
    title: 'Venues',
    description: 'Find verified queer-friendly venues where you can be yourself',
    color: 'primary.main',
    link: '/venues'
  }, {
    icon: Calendar,
    title: 'Events',
    description: 'Discover local and virtual gatherings in your area',
    color: 'text.primary',
    link: '/events'
  }, {
    icon: Store,
    title: 'Marketplace',
    description: 'Support queer-owned businesses and creators',
    color: 'secondary.main',
    link: '/marketplace'
  }, {
    icon: Plane,
    title: 'Places',
    description: 'Explore queer-friendly cities and countries worldwide',
    color: 'primary.main',
    link: '/places'
  }, {
    icon: Users,
    title: 'Community',
    description: 'Connect with like-minded people and join groups',
    color: 'text.primary',
    link: '/groups'
  }, {
    icon: BookOpen,
    title: 'Resources',
    description: 'Learn about rights, culture, and community topics',
    color: 'secondary.main',
    link: '/resources'
  }];
  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return `${Math.floor(num / 1000)}K+`;
    }
    return num.toString();
  };
  const stats = useMemo(() => loading ? [{
    number: '---',
    label: 'Verified Venues'
  }, {
    number: '---',
    label: 'Community Members'
  }, {
    number: '---',
    label: 'Cities Worldwide'
  }, {
    number: '---',
    label: 'Weekly Events'
  }] : [{
    number: formatNumber(realStats.venues),
    label: 'Verified Venues'
  }, {
    number: formatNumber(realStats.profiles),
    label: 'Community Members'
  }, {
    number: formatNumber(realStats.cities),
    label: 'Cities Worldwide'
  }, {
    number: formatNumber(realStats.events),
    label: 'Weekly Events'
  }], [loading, realStats, formatNumber]);
  return (
    <Box sx={{ minHeight: '100vh' }}>
      {/* Find Venues & Restrooms Near You */}
      <Box component="section">
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
          <VenueMapSearch />
        </Container>
      </Box>

      {/* Hero Section */}
      <Box component="section">
        <FrontPageVenueMap fullWidth heightClass="h-[60vh]" />
      </Box>

      {/* Features Grid */}
      <Box component="section">
        <Container maxWidth="lg" sx={{ py: { xs: 8, md: 10 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(6, 1fr)',
              },
              gap: { xs: 2, md: 3 },
            }}
          >
            {features.map((feature, index) => {
              const Icon = feature.icon as any;
              return (
                <Link to={feature.link} key={index} style={{ textDecoration: 'none', display: 'block' }}>
                  <Card style={{ height: '100%' }}>
                    <CardContent style={{ padding: 20 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                        <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'primary.main', opacity: 0.1, position: 'relative' }}>
                          <Box sx={{ bgcolor: 'transparent', p: 1.25, borderRadius: 2 }}>
                            <Icon
                              style={{ width: 24, height: 24 }}
                              aria-hidden="true"
                            />
                          </Box>
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            fontSize: { xs: '0.875rem', md: '1rem' },
                          }}
                        >
                          {feature.title}
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

      {/* Community Stats */}
      <Box component="section" sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
              gap: { xs: 2, md: 4 },
            }}
          >
            {stats.map((stat, index) => (
              <Box key={index} sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 700,
                    fontFamily: 'Montserrat, sans-serif',
                    fontSize: { xs: '1.875rem', md: '2.25rem' },
                    backgroundImage: 'linear-gradient(135deg, var(--primary) 0%, var(--accent) 100%)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {stat.number}
                </Typography>
                <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Weekly Events Near You */}
      <React.Suspense fallback={<SliderSkeleton title="This Week Near You" />}>
        <WeeklyEventsSlider />
      </React.Suspense>

      {/* Regional Events Calendar */}
      <React.Suspense fallback={<SliderSkeleton title="Events Calendar Near You" />}>
        <RegionalEventsCalendar />
      </React.Suspense>

      {/* Latest News Section */}
      <React.Suspense fallback={<SliderSkeleton title="Latest News" />}>
        <LatestNewsSlider />
      </React.Suspense>

    </Box>
  );
});

// Enhanced skeleton component for lazy-loaded sliders
const SliderSkeleton = ({
  title
}: {
  title: string;
}) => {
  const isMobile = useIsMobile();
  return (
    <Box
      component="section"
      sx={{
        bgcolor: 'action.hover',
        py: isMobile ? 6 : 10,
        px: 2,
      }}
    >
      <Container maxWidth="lg">
        <Box sx={{ mb: isMobile ? 4 : 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Box>
              <Box
                sx={{
                  height: 40,
                  bgcolor: 'action.disabledBackground',
                  borderRadius: 2,
                  width: isMobile ? 224 : 320,
                  mb: 2,
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.5 },
                  },
                }}
              />
              <Box
                sx={{
                  height: 24,
                  bgcolor: 'action.disabledBackground',
                  borderRadius: 2,
                  width: isMobile ? 320 : 384,
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }}
              />
            </Box>
            <Box
              sx={{
                height: 40,
                bgcolor: 'action.disabledBackground',
                borderRadius: 2,
                width: isMobile ? 96 : 128,
                animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gap: 3,
            gridTemplateColumns: isMobile ? '1fr' : { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
          }}
        >
          {Array.from({
            length: isMobile ? 2 : 3
          }).map((_, i) => (
            <Card key={i} style={{ height: 320, opacity: 0.5 }}>
              <CardContent style={{ padding: 32 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box
                      sx={{
                        height: 24,
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 2,
                        width: 80,
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                    <Box
                      sx={{
                        height: 24,
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 2,
                        width: 64,
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box
                      sx={{
                        height: 28,
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 2,
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                    <Box
                      sx={{
                        height: 28,
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 2,
                        width: '75%',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          height: 16,
                          width: 16,
                          bgcolor: 'action.disabledBackground',
                          borderRadius: 2,
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                      />
                      <Box
                        sx={{
                          height: 16,
                          bgcolor: 'action.disabledBackground',
                          borderRadius: 2,
                          width: 96,
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          height: 16,
                          width: 16,
                          bgcolor: 'action.disabledBackground',
                          borderRadius: 2,
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                      />
                      <Box
                        sx={{
                          height: 16,
                          bgcolor: 'action.disabledBackground',
                          borderRadius: 2,
                          width: 128,
                          animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        }}
                      />
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box
                      sx={{
                        height: 16,
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 2,
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                    <Box
                      sx={{
                        height: 16,
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 2,
                        width: '83%',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                    <Box
                      sx={{
                        height: 16,
                        bgcolor: 'action.disabledBackground',
                        borderRadius: 2,
                        width: '66%',
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                      }}
                    />
                  </Box>
                  <Box
                    sx={{
                      height: 40,
                      bgcolor: 'action.disabledBackground',
                      borderRadius: 2,
                      mt: 'auto',
                      animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Container>
    </Box>
  );
};
export default Index;
