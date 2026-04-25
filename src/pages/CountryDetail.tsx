import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  MapPin,
  Globe,
  Users,
  Building2,
  Calendar,
  Star,
  TrendingUp,
  MapIcon,
  Newspaper,
  Cloud,
  Sun,
  CloudRain,
  Plane,
  Activity,
  Shield,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Chip from '@mui/material/Chip';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { LocationInfo } from '@/components/location/LocationInfo';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { DirectoryCard } from '@/components/directory/DirectoryCard';
import CountryHeroImages from '@/components/country/CountryHeroImages';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { WorldBankDataPanel } from '@/components/country/WorldBankDataPanel';
import { SDGDataPanel } from '@/components/country/SDGDataPanel';
import { useWorldBankData } from '@/hooks/useWorldBankData';
import { useSDGData } from '@/hooks/useSDGData';
import { TravelDealsSection } from '@/components/travel/TravelDealsSection';
import { ActivitiesWidget } from '@/components/activities/ActivitiesWidget';
import { useOptimizedCountry, useOptimizedCities } from '@/hooks/useOptimizedPlaces';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useNews } from '@/hooks/useNews';
import { NewsCard } from '@/components/news/NewsCard';
import { supabase } from '@/integrations/supabase/client';
import Box from '@mui/material/Box';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

export default function CountryDetail() {
  const { slug: countrySlug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [weatherData, setWeatherData] = useState<Record<string, unknown> | null>(null);

  const { track } = useTrackEvent();
  const { country, loading: countryLoading } = useOptimizedCountry(countrySlug ?? '');
  const { cities, loading: citiesLoading } = useOptimizedCities({
    countryId: country?.id ?? '',
    limit: 12,
  });

  const { venues, loading: venuesLoading, fetchVenues: fetchCountryVenues } = useVenues(false);
  const {
    venues: cityVenues,
    loading: cityVenuesLoading,
    fetchVenues: fetchCityVenues,
  } = useVenues(false);

  useEffect(() => {
    if (country?.id) {
      track({ eventType: 'page_view', entityType: 'country', entityId: country.id, metadata: { name: country.name } });
    }
  }, [country?.id]);

  useEffect(() => {
    fetchCountryVenues({ city: country?.name, limit: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country?.name]);

  useEffect(() => {
    fetchCityVenues({ limit: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cityNames = cities.map((city) => city.name);

  const filteredCityVenues = useMemo(() => {
    if (!cityVenues || cityNames.length === 0) return [];
    return cityVenues.filter((venue) =>
      cityNames.some(
        (cityName) =>
          venue.city?.toLowerCase().includes(cityName.toLowerCase()) ||
          venue.address?.toLowerCase().includes(cityName.toLowerCase()),
      ),
    );
  }, [cityVenues, cityNames]);

  const countryVenues = useMemo(() => {
    const allVenues = [...(venues || []), ...filteredCityVenues];
    const uniqueVenues = allVenues.filter(
      (venue, index, self) => index === self.findIndex((v) => v.id === venue.id),
    );
    return uniqueVenues.slice(0, 12);
  }, [venues, filteredCityVenues]);

  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);

  useEffect(() => {
    fetchEvents({ city: country?.name, limit: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country?.name]);

  const { articles: localNews, loading: newsLoading, incrementViews } = useNews();
  const countryNews = useMemo(() => {
    if (!localNews || !country) return [];
    return localNews
      .filter(
        (article) =>
          article.country_ids?.includes(country.id) ||
          article.title.toLowerCase().includes(country.name.toLowerCase()) ||
          article.content?.toLowerCase().includes(country.name.toLowerCase()),
      )
      .slice(0, 12);
  }, [localNews, country]);

  const worldBankData = useWorldBankData(country);
  const sdgData = useSDGData(country);
  const loading = countryLoading;

  // Fetch weather data for header indicator
  useEffect(() => {
    const fetchWeatherData = async () => {
      if (!country?.latitude || !country?.longitude) return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const { data, error } = await supabase.functions.invoke('get-weather-forecast', {
          body: {
            latitude: country.latitude,
            longitude: country.longitude,
            cityName: country.capital || country.name,
          },
        });
        if (data && !error) setWeatherData(data);
      } catch (error) {
        console.warn('Failed to fetch weather data:', error);
      } finally {
        clearTimeout(timeoutId);
      }
    };
    fetchWeatherData();
  }, [country?.latitude, country?.longitude, country?.capital, country?.name]);

  const getWeatherIcon = (condition: string) => {
    if (condition?.includes('rain') || condition?.includes('drizzle')) return CloudRain;
    if (condition?.includes('cloud')) return Cloud;
    return Sun;
  };

  if (!countrySlug) {
    return <Box>Country not found</Box>;
  }

  if (loading) {
    return (
      <Box
        sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
            <Globe style={{ height: 48, width: 48, margin: '0 auto', color: 'hsl(var(--muted-foreground))' }} />
          </Box>
          <Typography sx={{ color: 'text.secondary' }}>Loading country details...</Typography>
        </Box>
      </Box>
    );
  }

  const SectionLoader = ({ label }: { label: string }) => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          animation: 'spin 1s linear infinite',
          height: 24,
          width: 24,
          border: '2px solid',
          borderColor: 'primary.main',
          borderTopColor: 'transparent',
          borderRadius: '50%',
        }}
      />
      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
        Loading {label}...
      </Typography>
    </Box>
  );

  if (!country) {
    return (
      <Box
        sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h4" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
            Country not found
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            The country you're looking for doesn't exist.
          </Typography>
          <Button asChild>
            <LocalizedLink to="/users">
              <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
              Back to Directory
            </LocalizedLink>
          </Button>
        </Box>
      </Box>
    );
  }

  // Extract continent/region from joined data
  const continentName = (country as unknown as Record<string, { name?: string }>).continents?.name;
  const regionName = (country as unknown as Record<string, { name?: string }>).regions?.name;
  const subtitle = [continentName, regionName].filter(Boolean).join(', ');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section — compact */}
      <Box sx={{ position: 'relative', overflow: 'hidden' }}>
        <Box
          sx={{
            position: 'relative',
            mx: 'auto',
            px: 3,
            pt: { xs: 3, lg: 5 },
            pb: 2,
          }}
        >
          {/* Navigation */}
          <Box sx={{ mb: 2 }}>
            <Button variant="ghost" asChild>
              <LocalizedLink to="/users">
                <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
                Back to Directory
              </LocalizedLink>
            </Button>
            <Box
              component="nav"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                fontSize: '0.875rem',
                color: 'text.secondary',
                mb: 2,
              }}
            >
              <LocalizedLink to="/users" style={{ transition: 'color 0.2s' }}>
                Directory
              </LocalizedLink>
              <span>/</span>
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
                {country.name}
              </Box>
            </Box>
          </Box>

          {/* Hero Image */}
          <Box sx={{ position: 'relative', mb: 3 }}>
            <CountryHeroImages country={country} />
          </Box>

          {/* Title Row */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 2,
              mb: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography
                  variant="h3"
                  sx={{
                    fontSize: { xs: '2rem', lg: '2.75rem' },
                    fontWeight: 700,
                    color: 'text.primary',
                  }}
                >
                  {country.flag_emoji} {country.name}
                </Typography>
              </Box>
              {subtitle && (
                <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary' }}>
                  {subtitle}
                </Typography>
              )}
            </Box>

            {/* Weather Indicator */}
            {weatherData?.current && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: 'action.hover',
                  borderRadius: '9999px',
                  px: 2,
                  py: 1,
                }}
              >
                {(() => {
                  const WeatherIcon = getWeatherIcon(weatherData.current.condition);
                  return <WeatherIcon style={{ height: 20, width: 20 }} />;
                })()}
                <Box component="span" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  {Math.round(weatherData.current.temperature)}°C
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: '0.875rem',
                    color: 'text.secondary',
                    display: { xs: 'none', sm: 'inline' },
                  }}
                >
                  {country.capital || country.name}
                </Box>
              </Box>
            )}
          </Box>

          {/* Compact Stats Chips */}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1, alignItems: 'center' }}>
            <ReportButton
              contentType="countries"
              contentId={country.id}
              contentName={country.name}
            />
            <AdminEditButton
              contentType="countries"
              contentId={country.id}
              contentName={country.name}
              currentData={country as Record<string, unknown>}
              onSaved={() => window.location.reload()}
            />
            {country.capital && (
              <Chip
                icon={<Star style={{ height: 14, width: 14 }} />}
                label={`Capital: ${country.capital}`}
                size="small"
                variant="outlined"
              />
            )}
            {country.population && (
              <Chip
                icon={<Users style={{ height: 14, width: 14 }} />}
                label={`${(country.population / 1e6).toFixed(1)}M people`}
                size="small"
                variant="outlined"
              />
            )}
            {country.area_km2 && (
              <Chip
                icon={<MapIcon style={{ height: 14, width: 14 }} />}
                label={`${country.area_km2.toLocaleString()} km²`}
                size="small"
                variant="outlined"
              />
            )}
            {cities.length > 0 && (
              <Chip
                icon={<Building2 style={{ height: 14, width: 14 }} />}
                label={`${cities.length} cities`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </Box>
      </Box>

      {/* Safety Alert Banner */}
      <SafetyAlertBanner
        criminalization={country.lgbti_criminalization as Record<string, unknown> | null}
        countryName={country.name}
      />

      {/* Main Content — Tabs immediately */}
      <Box sx={{ mx: 'auto', px: 3, pb: 8 }}>
        <Card>
          <CardContent>
            <Tabs
              defaultValue="overview"
              style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
            >
              <TabsList

              >
                <TabsTrigger
                  value="overview"

                >
                  <Info style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Overview
                  </Box>
                </TabsTrigger>
                <TabsTrigger value="rights">
                  <Shield style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Rights
                  </Box>
                </TabsTrigger>
                <TabsTrigger value="cities">
                  <Building2 style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Cities
                  </Box>
                </TabsTrigger>
                <TabsTrigger value="venues">
                  <MapPin style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Venues
                  </Box>
                </TabsTrigger>
                <TabsTrigger value="events">
                  <Calendar style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Events
                  </Box>
                </TabsTrigger>
                <TabsTrigger value="travel">
                  <Plane style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Travel
                  </Box>
                </TabsTrigger>
                <TabsTrigger value="news">
                  <Newspaper style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    News
                  </Box>
                </TabsTrigger>
                <TabsTrigger value="map">
                  <MapIcon style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                    Map
                  </Box>
                </TabsTrigger>
              </TabsList>

              {/* ===== OVERVIEW TAB ===== */}
              <TabsContent
                value="overview"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                {/* Top row: About + Quick Facts */}
                <ScrollReveal direction="up">
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' },
                    gap: 3,
                  }}
                >
                  {/* About Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <Globe style={{ height: 20, width: 20 }} />
                        About {country.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                        {country.description ||
                          `Discover everything about ${country.name} – from major cities and cultural landmarks to local venues and upcoming events.`}
                      </Typography>
                    </CardContent>
                  </Card>

                  {/* Quick Facts Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <Star style={{ height: 20, width: 20 }} />
                        Quick Facts
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {country.capital && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Star style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                              Capital
                            </Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 700 }}>{country.capital}</Typography>
                        </Box>
                      )}
                      {country.currency && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUp style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                              Currency
                            </Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 700 }}>{country.currency}</Typography>
                        </Box>
                      )}
                      {country.languages && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Globe style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                              Languages
                            </Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 700, textAlign: 'right', maxWidth: '60%' }}>
                            {Array.isArray(country.languages)
                              ? country.languages.slice(0, 3).join(', ')
                              : country.languages}
                            {Array.isArray(country.languages) && country.languages.length > 3
                              ? ` +${country.languages.length - 3}`
                              : ''}
                          </Typography>
                        </Box>
                      )}
                      {country.timezone && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Calendar style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                              Timezone
                            </Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 700 }}>{country.timezone}</Typography>
                        </Box>
                      )}
                      {country.calling_code && (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: 'action.hover',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MapPin style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
                            <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                              Calling Code
                            </Typography>
                          </Box>
                          <Typography sx={{ fontWeight: 700 }}>{country.calling_code}</Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Box>
                </ScrollReveal>

                {/* LocationInfo: Wikipedia + Photo Gallery */}
                <LocationInfo
                  name={country.name}
                  type="country"
                  style={{ border: 0, backgroundColor: '#ffffff' }}
                />

                {/* Weather Forecast */}
                {country.latitude && country.longitude && (
                  <Card>
                    <CardContent>
                      <WeatherForecast
                        latitude={country.latitude}
                        longitude={country.longitude}
                        cityName={country.capital || country.name}
                        style={{ height: '100%', border: 0, backgroundColor: '#ffffff' }}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* World Bank Data -- Economy, Demographics, Society, Environment */}
                <WorldBankDataPanel data={worldBankData} countryName={country.name} />

                {/* UN SDG Data -- Sustainable Development Goals */}
                <SDGDataPanel data={sdgData} countryName={country.name} />
              </TabsContent>

              {/* ===== RIGHTS TAB ===== */}
              <TabsContent
                value="rights"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography
                      variant="h2"
                      sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
                    >
                      LGBTI Rights
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                      Legal protections and rights status in {country.name}
                    </Typography>
                  </Box>
                </Box>

                <LGBTJurisdictionInfo
                  country={country}
                  style={{ boxShadow: 'none', borderColor: 'inherit' }}
                />
              </TabsContent>

              {/* ===== CITIES TAB ===== */}
              <TabsContent
                value="cities"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography
                      variant="h2"
                      sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
                    >
                      Major Cities
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                      Explore the most important cities in {country.name}
                    </Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {cities.length} cities
                  </Badge>
                </Box>

                {citiesLoading ? (
                  <SectionLoader label="cities" />
                ) : cities.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: '1fr 1fr',
                        md: 'repeat(3, 1fr)',
                        lg: 'repeat(4, 1fr)',
                      },
                      gap: 3,
                    }}
                  >
                    {cities.map((city) => (
                      <Box
                        key={city.id}
                        sx={{
                          cursor: 'pointer',
                          transition: 'transform 0.2s',
                          '&:hover': { transform: 'scale(1.03)' },
                        }}
                      >
                        <DirectoryCard
                          type="city"
                          name={city.name}
                          data={city}
                          onClick={() => (window.location.href = `/city/${city.slug || city.id}`)}
                        />
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box
                          sx={{
                            p: 2,
                            bgcolor: 'action.hover',
                            borderRadius: '50%',
                            width: 80,
                            height: 80,
                            mx: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Building2 style={{ height: 40, width: 40, color: 'hsl(var(--muted-foreground))' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            No cities found
                          </Typography>
                          <Typography sx={{ color: 'text.secondary' }}>
                            No cities are currently listed for this country.
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ===== VENUES TAB ===== */}
              <TabsContent
                value="venues"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography
                      variant="h2"
                      sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
                    >
                      Local Venues
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                      Discover amazing places to visit in {country.name}
                    </Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {countryVenues.length} venues
                  </Badge>
                </Box>

                {venuesLoading || cityVenuesLoading ? (
                  <SectionLoader label="venues" />
                ) : countryVenues.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' },
                      gap: 3,
                    }}
                  >
                    {countryVenues.map((venue) => (
                      <Box
                        key={venue.id}
                        sx={{
                          transition: 'transform 0.2s',
                          '&:hover': { transform: 'scale(1.03)' },
                        }}
                      >
                        <VenueCard venue={venue} />
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box
                          sx={{
                            p: 2,
                            bgcolor: 'action.hover',
                            borderRadius: '50%',
                            width: 80,
                            height: 80,
                            mx: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <MapPin style={{ height: 40, width: 40, color: 'hsl(var(--muted-foreground))' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            No venues found yet
                          </Typography>
                          <Typography sx={{ color: 'text.secondary' }}>
                            Be the first to add venues from {country.name}!
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ===== EVENTS TAB ===== */}
              <TabsContent
                value="events"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography
                      variant="h2"
                      sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
                    >
                      Upcoming Events
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                      Don't miss out on exciting events happening in {country.name}
                    </Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {events.length} events
                  </Badge>
                </Box>

                {eventsLoading ? (
                  <SectionLoader label="events" />
                ) : events.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
                      gap: 3,
                    }}
                  >
                    {events.map((event) => (
                      <Box
                        key={event.id}
                        sx={{
                          transition: 'transform 0.2s',
                          '&:hover': { transform: 'scale(1.03)' },
                        }}
                      >
                        <EventCard event={event} />
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box
                          sx={{
                            p: 2,
                            bgcolor: 'action.hover',
                            borderRadius: '50%',
                            width: 80,
                            height: 80,
                            mx: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Calendar style={{ height: 40, width: 40, color: 'hsl(var(--muted-foreground))' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            No upcoming events
                          </Typography>
                          <Typography sx={{ color: 'text.secondary' }}>
                            No events are currently scheduled for this country.
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ===== TRAVEL TAB (merged Flights + Tours) ===== */}
              <TabsContent
                value="travel"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                <Box>
                  <Typography
                    variant="h2"
                    sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
                  >
                    Travel & Tours
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                    Find flights and experiences in {country.name}
                  </Typography>
                </Box>

                <TravelDealsSection
                  destinationCity={country.capital || country.name}
                  destinationCountryCode={country.code}
                />

                <Card>
                  <CardHeader>
                    <CardTitle>
                      <Activity style={{ height: 20, width: 20 }} />
                      Activities & Tours
                    </CardTitle>
                    <CardDescription>
                      Discover amazing experiences in {country.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ActivitiesWidget
                      destination={country.capital || country.name}
                      countryCode={country.code}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ===== NEWS TAB ===== */}
              <TabsContent
                value="news"
                style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography
                      variant="h2"
                      sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
                    >
                      Local News
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                      Stay updated with the latest news from {country.name}
                    </Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {countryNews.length} articles
                  </Badge>
                </Box>

                {newsLoading ? (
                  <SectionLoader label="news" />
                ) : countryNews.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
                      gap: 3,
                    }}
                  >
                    {countryNews.map((article) => (
                      <Box
                        key={article.id}
                        sx={{
                          transition: 'transform 0.2s',
                          '&:hover': { transform: 'scale(1.03)' },
                        }}
                      >
                        <NewsCard article={article} onViewArticle={incrementViews} />
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Card>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box
                          sx={{
                            p: 2,
                            bgcolor: 'action.hover',
                            borderRadius: '50%',
                            width: 80,
                            height: 80,
                            mx: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Newspaper style={{ height: 40, width: 40, color: 'hsl(var(--muted-foreground))' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                            No local news found
                          </Typography>
                          <Typography sx={{ color: 'text.secondary' }}>
                            No news articles are currently available for {country.name}.
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* ===== MAP TAB ===== */}
              <TabsContent value="map">
                {typeof country.latitude === 'number' && typeof country.longitude === 'number' && (
                  <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={32} aria-label="Loading" /></Box>}>
                    <ExploreMap
                      height={500}
                      initialCenter={[Number(country.longitude), Number(country.latitude)]}
                      initialZoom={5}
                      defaultLayers={['venues', 'events', 'cities']}
                      showLayerToggles
                      showFilters={false}
                      skipAutoFly
                    />
                  </Suspense>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
