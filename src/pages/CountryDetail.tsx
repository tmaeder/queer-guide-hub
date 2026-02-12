
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MapPin, Globe, Users, Building2, Calendar, Star, Heart, TrendingUp, MapIcon, Newspaper, Cloud, Sun, CloudRain, Thermometer, Plane, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { WeatherForecast } from "@/components/weather/WeatherForecast";
import { LocationInfo } from "@/components/location/LocationInfo";
import { VenueCard } from "@/components/venues/VenueCard";
import { EventCard } from "@/components/events/EventCard";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import CountryHeroImages from "@/components/country/CountryHeroImages";
import LGBTJurisdictionInfo from "@/components/country/LGBTJurisdictionInfo";
import { FlightsWidget } from "@/components/flights/FlightsWidget";
import { ActivitiesWidget } from "@/components/activities/ActivitiesWidget";
import { useOptimizedCountry, useOptimizedCities } from "@/hooks/useOptimizedDirectory";
import { useOptimizedVenues } from "@/hooks/useOptimizedVenues";
import { useOptimizedEvents } from "@/hooks/useOptimizedEvents";
import { useNews } from "@/hooks/useNews";
import { NewsCard } from "@/components/news/NewsCard";
import { supabase } from "@/integrations/supabase/client";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function CountryDetail() {
  const { id: countryId } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [weatherData, setWeatherData] = useState<any>(null);

  if (!countryId) {
    return <Box>Country not found</Box>;
  }

  const { country, loading: countryLoading } = useOptimizedCountry(countryId);
  const { cities, loading: citiesLoading } = useOptimizedCities({
    countryId,
    limit: 12
  });

  // Filter venues by country name to match the current country
  const { venues, loading: venuesLoading } = useOptimizedVenues({
    city: country?.name, // Use country name as filter since venues might have country in city field
    limit: 12
  });

  // Also try filtering by actual cities in this country
  const cityNames = cities.map(city => city.name);
  const { venues: cityVenues, loading: cityVenuesLoading } = useOptimizedVenues({
    limit: 12
  });

  // Filter city venues to only include venues from cities in this country
  const filteredCityVenues = useMemo(() => {
    if (!cityVenues || cityNames.length === 0) return [];
    return cityVenues.filter(venue =>
      cityNames.some(cityName =>
        venue.city?.toLowerCase().includes(cityName.toLowerCase()) ||
        venue.address?.toLowerCase().includes(cityName.toLowerCase())
      )
    );
  }, [cityVenues, cityNames]);

  // Combine and deduplicate venues
  const countryVenues = useMemo(() => {
    const allVenues = [...(venues || []), ...filteredCityVenues];
    const uniqueVenues = allVenues.filter((venue, index, self) =>
      index === self.findIndex(v => v.id === venue.id)
    );
    return uniqueVenues.slice(0, 12); // Limit to 12 venues
  }, [venues, filteredCityVenues]);

  const { events, loading: eventsLoading } = useOptimizedEvents({
    city: country?.name, // Use country name as city filter
    limit: 12
  });

  // Fetch local news for this country
  const { articles: localNews, loading: newsLoading, incrementViews } = useNews();
  const countryNews = useMemo(() => {
    if (!localNews || !country) return [];
    return localNews.filter(article =>
      article.country_ids?.includes(country.id) ||
      article.title.toLowerCase().includes(country.name.toLowerCase()) ||
      article.content?.toLowerCase().includes(country.name.toLowerCase())
    ).slice(0, 12);
  }, [localNews, country]);

  // Only gate the full-page spinner on core country data — everything else loads progressively
  const loading = countryLoading;

  // Fetch weather data for header indicator (with timeout)
  useEffect(() => {
    const fetchWeatherData = async () => {
      if (!country?.latitude || !country?.longitude) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      try {
        const { data, error } = await supabase.functions.invoke('get-weather-forecast', {
          body: {
            latitude: country.latitude,
            longitude: country.longitude,
            cityName: country.capital || country.name
          }
        });

        if (data && !error) {
          setWeatherData(data);
        }
      } catch (error) {
        console.warn('Failed to fetch weather data for header:', error);
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

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
            <Globe style={{ height: 48, width: 48, margin: '0 auto', color: 'var(--primary)', opacity: 0.6 }} />
          </Box>
          <Typography sx={{ color: 'var(--muted-foreground)' }}>Loading country details...</Typography>
        </Box>
      </Box>
    );
  }

  // Helper: inline loading skeleton for tab sections
  const SectionLoader = ({ label }: { label: string }) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, gap: 1.5 }}>
      <Box sx={{ animation: 'spin 1s linear infinite', height: 24, width: 24, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Loading {label}...</Typography>
    </Box>
  );

  if (!country) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h4" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>Country not found</Typography>
          <Typography sx={{ color: 'var(--muted-foreground)' }}>The country you're looking for doesn't exist.</Typography>
          <Button asChild>
            <Link to="/users">
              <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
              Back to Directory
            </Link>
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(to bottom right, var(--background), var(--muted)/20, var(--background))' }}>
      {/* Hero Section */}
      <Box sx={{ position: 'relative', overflow: 'hidden' }}>
        {/* Background Pattern */}
        <Box sx={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--grid-white-02) 1px, transparent 1px), linear-gradient(90deg, var(--grid-white-02) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom right, rgba(var(--primary-rgb), 0.05), transparent, rgba(var(--accent-rgb), 0.05))' }} />

        <Box sx={{ position: 'relative', mx: 'auto', maxWidth: 1280, px: 3, py: { xs: 4, lg: 8 } }}>
          {/* Navigation */}
          <Box sx={{ mb: 4 }}>
            <Button variant="ghost" asChild sx={{ mb: 3, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
              <Link to="/users">
                <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
                Back to Directory
              </Link>
            </Button>

            {/* Breadcrumb */}
            <Box component="nav" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', color: 'var(--muted-foreground)', mb: 4 }}>
              <Link to="/users" style={{ transition: 'color 0.2s' }}>
                Directory
              </Link>
              <span>/</span>
              <Box component="span" sx={{ color: 'var(--foreground)', fontWeight: 500 }}>{country.name}</Box>
            </Box>
          </Box>

          {/* Country Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, mb: 8 }}>
            {/* Country Images */}
            <Box sx={{ position: 'relative' }}>
              <CountryHeroImages countryName={country.name} />
            </Box>

            <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Typography variant="h1" sx={{ fontSize: { xs: '3rem', lg: '4.5rem' }, fontWeight: 700, background: 'linear-gradient(to right, var(--primary), rgba(var(--primary-rgb), 0.8), var(--accent))', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent' }}>
                    {country.flag_emoji} {country.name}
                  </Typography>

                  {/* Weather Indicator */}
                  {weatherData?.current && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'rgba(var(--muted-rgb), 0.2)', backdropFilter: 'blur(4px)', borderRadius: '9999px', px: 2, py: 1, border: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                      {(() => {
                        const WeatherIcon = getWeatherIcon(weatherData.current.condition);
                        return <WeatherIcon style={{ height: 20, width: 20, color: 'var(--primary)' }} />;
                      })()}
                      <Box component="span" sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                        {Math.round(weatherData.current.temperature)}°C
                      </Box>
                      <Box component="span" sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', display: { xs: 'none', sm: 'inline' } }}>
                        {country.capital || country.name}
                      </Box>
                    </Box>
                  )}
                </Box>

                <Typography sx={{ fontSize: { xs: '1.25rem', lg: '1.5rem' }, color: 'var(--muted-foreground)', maxWidth: 896, mx: 'auto', lineHeight: 1.75 }}>
                  {country.description || `Discover everything about ${country.name} - from major cities and cultural landmarks to local venues and upcoming events.`}
                </Typography>
              </Box>
            </Box>

            {/* Country Stats Grid */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, maxWidth: 896, mx: 'auto' }}>
              {country.capital && (
                <Card sx={{ borderColor: 'divider', '&:hover': { borderColor: 'primary.main' }, transition: 'border-color 0.2s' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                    <Box sx={{ p: 1, bgcolor: 'rgba(234, 179, 8, 0.1)', borderRadius: 2 }}>
                      <Star style={{ height: 20, width: 20, color: '#ca8a04' }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Capital</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{country.capital}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
              {country.population && (
                <Card sx={{ borderColor: 'divider', '&:hover': { borderColor: 'primary.main' }, transition: 'border-color 0.2s' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                    <Box sx={{ p: 1, bgcolor: 'rgba(59, 130, 246, 0.1)', borderRadius: 2 }}>
                      <Users style={{ height: 20, width: 20, color: '#2563eb' }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Population</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{country.population.toLocaleString()}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
              {country.area_km2 && (
                <Card sx={{ borderColor: 'divider', '&:hover': { borderColor: 'primary.main' }, transition: 'border-color 0.2s' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                    <Box sx={{ p: 1, bgcolor: 'rgba(34, 197, 94, 0.1)', borderRadius: 2 }}>
                      <MapIcon style={{ height: 20, width: 20, color: '#16a34a' }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Area</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{country.area_km2.toLocaleString()} km²</Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
              {cities.length > 0 && (
                <Card sx={{ borderColor: 'divider', '&:hover': { borderColor: 'primary.main' }, transition: 'border-color 0.2s' }}>
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                    <Box sx={{ p: 1, bgcolor: 'rgba(168, 85, 247, 0.1)', borderRadius: 2 }}>
                      <Building2 style={{ height: 20, width: 20, color: '#555555' }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>Cities</Typography>
                      <Typography sx={{ fontWeight: 600 }}>{cities.length} cities</Typography>
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Main Content */}
      <Box sx={{ mx: 'auto', maxWidth: 1280, px: 3, pb: 8 }}>
        {/* Quick Info Cards */}
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, mb: 6, mt: -4 }}>
          <Card sx={{ borderColor: 'divider', boxShadow: 6, bgcolor: 'background.paper', backdropFilter: 'blur(8px)' }}>
            <CardContent sx={{ p: 0 }}>
              <LocationInfo
                name={country.name}
                type="country"
                style={{ height: '100%', border: 0, backgroundColor: 'transparent' }}
              />
            </CardContent>
          </Card>

          <Card sx={{ borderColor: 'divider', boxShadow: 1, bgcolor: 'background.paper', backdropFilter: 'blur(8px)' }}>
            <CardContent sx={{ p: 0 }}>
              <LGBTJurisdictionInfo
                countryName={country.name}
                countryCode={country.code}
                style={{ height: '100%', border: 0, backgroundColor: 'transparent' }}
              />
            </CardContent>
          </Card>
        </Box>

        {/* Content Tabs */}
        <Card sx={{ borderColor: 'divider', boxShadow: 1 }}>
          <CardContent sx={{ p: 3 }}>
            <Tabs defaultValue="cities" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              <TabsList sx={{ display: 'grid', width: '100%', maxWidth: 768, gridTemplateColumns: 'repeat(7, 1fr)', mx: 'auto', height: 48, bgcolor: 'action.hover' }}>
                <TabsTrigger value="cities" sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'background.paper', boxShadow: 1 } }}>
                  <Building2 style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Cities</Box>
                </TabsTrigger>
                <TabsTrigger value="venues" sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'background.paper', boxShadow: 1 } }}>
                  <MapPin style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Venues</Box>
                </TabsTrigger>
                <TabsTrigger value="events" sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'background.paper', boxShadow: 1 } }}>
                  <Calendar style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Events</Box>
                </TabsTrigger>
                <TabsTrigger value="flights" sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'background.paper', boxShadow: 1 } }}>
                  <Plane style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Flights</Box>
                </TabsTrigger>
                <TabsTrigger value="activities" sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'background.paper', boxShadow: 1 } }}>
                  <Activity style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Tours</Box>
                </TabsTrigger>
                <TabsTrigger value="news" sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'background.paper', boxShadow: 1 } }}>
                  <Newspaper style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>News</Box>
                </TabsTrigger>
                <TabsTrigger value="info" sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'background.paper', boxShadow: 1 } }}>
                  <Globe style={{ height: 16, width: 16 }} />
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Info</Box>
                </TabsTrigger>
              </TabsList>

              {/* Cities Tab */}
              <TabsContent value="cities" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Major Cities</Typography>
                    <Typography sx={{ color: 'var(--muted-foreground)', mt: 0.5 }}>Explore the most important cities in {country.name}</Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {cities.length} cities
                  </Badge>
                </Box>

                {citiesLoading ? (
                  <SectionLoader label="cities" />
                ) : cities.length > 0 ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 3 }}>
                    {cities.map((city) => (
                      <Box key={city.id} sx={{ cursor: 'pointer', transform: 'scale(1)', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)' } }}>
                        <DirectoryCard
                          type="city"
                          name={city.name}
                          data={city}
                          onClick={() => window.location.href = `/city/${city.id}`}
                        />
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Card sx={{ borderStyle: 'dashed', border: 2, borderColor: 'divider' }}>
                    <CardContent sx={{ textAlign: 'center', py: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(var(--muted-rgb), 0.3)', borderRadius: '50%', width: 80, height: 80, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Building2 style={{ height: 40, width: 40, color: 'var(--muted-foreground)' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>No cities found</Typography>
                          <Typography sx={{ color: 'var(--muted-foreground)' }}>No cities are currently listed for this country.</Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Venues Tab */}
              <TabsContent value="venues" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Local Venues</Typography>
                    <Typography sx={{ color: 'var(--muted-foreground)', mt: 0.5 }}>Discover amazing places to visit in {country.name}</Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {countryVenues.length} venues
                  </Badge>
                </Box>

                {(venuesLoading || cityVenuesLoading) ? (
                  <SectionLoader label="venues" />
                ) : countryVenues.length > 0 ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                     {countryVenues.map((venue) => (
                       <Box key={venue.id} sx={{ transform: 'scale(1)', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)' } }}>
                         <VenueCard
                           venue={venue}
                         />
                       </Box>
                     ))}
                  </Box>
                ) : (
                  <Card sx={{ borderStyle: 'dashed', border: 2, borderColor: 'divider' }}>
                    <CardContent sx={{ textAlign: 'center', py: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(var(--muted-rgb), 0.3)', borderRadius: '50%', width: 80, height: 80, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <MapPin style={{ height: 40, width: 40, color: 'var(--muted-foreground)' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>No venues found yet</Typography>
                          <Typography sx={{ color: 'var(--muted-foreground)' }}>Be the first to add venues from {country.name}!</Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Upcoming Events</Typography>
                    <Typography sx={{ color: 'var(--muted-foreground)', mt: 0.5 }}>Don't miss out on exciting events happening in {country.name}</Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {events.length} events
                  </Badge>
                </Box>

                {eventsLoading ? (
                  <SectionLoader label="events" />
                ) : events.length > 0 ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                     {events.map((event) => (
                       <Box key={event.id} sx={{ transform: 'scale(1)', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)' } }}>
                         <EventCard
                           event={event}
                         />
                       </Box>
                     ))}
                  </Box>
                ) : (
                  <Card sx={{ borderStyle: 'dashed', border: 2, borderColor: 'divider' }}>
                    <CardContent sx={{ textAlign: 'center', py: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(var(--muted-rgb), 0.3)', borderRadius: '50%', width: 80, height: 80, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Calendar style={{ height: 40, width: 40, color: 'var(--muted-foreground)' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>No upcoming events</Typography>
                          <Typography sx={{ color: 'var(--muted-foreground)' }}>No events are currently scheduled for this country.</Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Flights Tab */}
              <TabsContent value="flights" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Flight Deals</Typography>
                    <Typography sx={{ color: 'var(--muted-foreground)', mt: 0.5 }}>Find the best flight deals to {country.capital || country.name}</Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Plane style={{ height: 12, width: 12 }} />
                    Travel
                  </Badge>
                </Box>

                <Card sx={{ borderColor: 'divider' }}>
                  <CardContent sx={{ p: 3 }}>
                    <FlightsWidget
                      destination={country.capital || country.name}
                      countryCode={country.code}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Activities Tab */}
              <TabsContent value="activities" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Activities & Tours</Typography>
                    <Typography sx={{ color: 'var(--muted-foreground)', mt: 0.5 }}>Discover amazing experiences in {country.name}</Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Activity style={{ height: 12, width: 12 }} />
                    Popular Tours
                  </Badge>
                </Box>

                <Card sx={{ borderColor: 'divider' }}>
                  <CardContent sx={{ p: 3 }}>
                    <ActivitiesWidget
                      destination={country.capital || country.name}
                      countryCode={country.code}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* News Tab */}
              <TabsContent value="news" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}>Local News</Typography>
                    <Typography sx={{ color: 'var(--muted-foreground)', mt: 0.5 }}>Stay updated with the latest news from {country.name}</Typography>
                  </Box>
                  <Badge variant="secondary" style={{ fontSize: '0.875rem', padding: '4px 12px' }}>
                    {countryNews.length} articles
                  </Badge>
                </Box>

                {newsLoading ? (
                  <SectionLoader label="news" />
                ) : countryNews.length > 0 ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                     {countryNews.map((article) => (
                       <Box key={article.id} sx={{ transform: 'scale(1)', transition: 'all 0.2s', '&:hover': { transform: 'scale(1.05)' } }}>
                         <NewsCard
                           article={article}
                           onViewArticle={incrementViews}
                         />
                       </Box>
                     ))}
                  </Box>
                ) : (
                  <Card sx={{ borderStyle: 'dashed', border: 2, borderColor: 'divider' }}>
                    <CardContent sx={{ textAlign: 'center', py: 8 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(var(--muted-rgb), 0.3)', borderRadius: '50%', width: 80, height: 80, mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Newspaper style={{ height: 40, width: 40, color: 'var(--muted-foreground)' }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>No local news found</Typography>
                          <Typography sx={{ color: 'var(--muted-foreground)' }}>No news articles are currently available for {country.name}.</Typography>
                        </Box>
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Info Tab */}
              <TabsContent value="info" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <Box>
                  <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em', mb: 1 }}>Country Information</Typography>
                  <Typography sx={{ color: 'var(--muted-foreground)' }}>Detailed statistics and information about {country.name}</Typography>
                </Box>

                {/* Weather Forecast */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardContent sx={{ p: 0 }}>
                    <WeatherForecast
                      latitude={country.latitude}
                      longitude={country.longitude}
                      cityName={country.capital || country.name}
                      style={{ height: '100%', border: 0, backgroundColor: 'transparent' }}
                    />
                  </CardContent>
                </Card>

                <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                  {/* Basic Information */}
                  <Card sx={{ borderColor: 'divider' }}>
                    <CardHeader>
                      <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Globe style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                        Basic Information
                      </CardTitle>
                      <CardDescription>
                        Essential details about {country.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {country.capital && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Capital:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.capital}</Box>
                        </Box>
                      )}
                      {country.currency && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Currency:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.currency}</Box>
                        </Box>
                      )}
                      {country.languages && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Languages:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.languages.join(', ')}</Box>
                        </Box>
                      )}
                      {country.timezone && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Timezone:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.timezone}</Box>
                        </Box>
                      )}
                      {country.calling_code && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Calling Code:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.calling_code}</Box>
                        </Box>
                      )}
                    </CardContent>
                  </Card>

                  {/* Demographics & Economy */}
                  <Card sx={{ borderColor: 'divider' }}>
                    <CardHeader>
                      <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TrendingUp style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                        Demographics & Economy
                      </CardTitle>
                      <CardDescription>
                        Population statistics and economic indicators
                      </CardDescription>
                    </CardHeader>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {country.population && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Population:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.population.toLocaleString()}</Box>
                        </Box>
                      )}
                      {country.area_km2 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Area:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.area_km2.toLocaleString()} km²</Box>
                        </Box>
                      )}
                      {country.gdp_per_capita_usd && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>GDP per capita:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>${country.gdp_per_capita_usd.toLocaleString()}</Box>
                        </Box>
                      )}
                      {country.life_expectancy && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, borderBottom: '1px solid rgba(var(--muted-rgb), 0.3)' }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>Life Expectancy:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.life_expectancy} years</Box>
                        </Box>
                      )}
                      {country.human_development_index && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1 }}>
                          <Box component="span" sx={{ color: 'var(--muted-foreground)', fontWeight: 500 }}>HDI:</Box>
                          <Box component="span" sx={{ fontWeight: 600 }}>{country.human_development_index}</Box>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Box>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
