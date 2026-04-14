import { useState, useEffect, lazy, Suspense } from 'react';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { useParams } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReportButton } from '@/components/moderation/ReportButton';
import { AdminEditButton } from '@/components/admin/AdminEditButton';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  MapPin,
  Globe,
  Users,
  Calendar,
  Building,
  Star,
  Heart,
  Clock,
  Thermometer,
  Mountain,
  Phone,
  Plane,
  Bus,
  DollarSign,
  GraduationCap,
  Landmark,
  Info,
  FileText,
  Shield,
  Home,
  Map as MapIcon,
  ChevronDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFavorites } from '@/hooks/useFavorites';
import { useCityImages } from '@/hooks/useCityImages';
import { useNews } from '@/hooks/useNews';
import { useVenues } from '@/hooks/useVenues';
import { useEvents } from '@/hooks/useEvents';
import { useOptimizedCountry, useOptimizedCity } from '@/hooks/useOptimizedPlaces';
import { NewsCard } from '@/components/news/NewsCard';
import { VenueCard } from '@/components/venues/VenueCard';
import { EventCard } from '@/components/events/EventCard';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { PageLoading, InlineLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/EmptyState';
import { DetailHero } from '@/components/layout/DetailHero';
import { DetailTabs } from '@/components/layout/DetailTabs';
import { CityTravelHub } from '@/components/travel/CityTravelHub';
import { SimilarCities } from '@/components/personalization/SimilarCities';
import EqualityScoreBadge from '@/components/country/EqualityScoreBadge';
import SafetyAlertBanner from '@/components/country/SafetyAlertBanner';
import { LocationInfo } from '@/components/location/LocationInfo';
import LGBTJurisdictionInfo from '@/components/country/LGBTJurisdictionInfo';
import { VillageCard } from '@/components/villages/VillageCard';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import { useNearestAirport } from '@/hooks/useNearestAirport';
import Box from '@mui/material/Box';
import { ScrollReveal } from '@/components/animation/ScrollReveal';
import { StaggerGrid } from '@/components/animation/StaggerGrid';
import Typography from '@mui/material/Typography';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { Luggage } from 'lucide-react';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';


const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

export default function CityDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('city');
  const { fetchCityImage } = useCityImages();
  const { articles, loading: newsLoading, fetchArticles } = useNews();
  const { city, loading, refetch: refetchCity } = useOptimizedCity(slug ?? '');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const { user } = useAuth();
  const { track } = useTrackEvent();

  useEffect(() => {
    if (city?.id) {
      track({ eventType: 'page_view', entityType: 'city', entityId: city.id, metadata: { name: city.name } });
    }
  }, [city?.id]);

  const hasAirport = !!(city?.major_airport_code || (city?.airport_codes && city.airport_codes.length > 0));
  const { nearestAirport, loading: _nearestAirportLoading } = useNearestAirport({
    latitude: city?.latitude ?? null,
    longitude: city?.longitude ?? null,
    hasAirport,
  });
  const effectiveIata = city?.major_airport_code || nearestAirport?.iata_code || null;

  const { venues, loading: venuesLoading, fetchVenues } = useVenues(false);
  const { events, loading: eventsLoading, fetchEvents } = useEvents(false);

  useEffect(() => {
    fetchVenues({ city: city?.name, limit: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.name]);

  useEffect(() => {
    fetchEvents({ city: city?.name, limit: 12 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city?.name]);
  const { country: fullCountry, loading: countryLoading } = useOptimizedCountry(
    city?.countries?.slug || city?.countries?.id || '',
  );
  const { villages, loading: villagesLoading, fetchVillages } = useQueerVillages(false);

  useEffect(() => {
    if (city) {
      loadCityImage();
      loadRelatedContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCityImage/loadRelatedContent defined below, re-run on city change
  }, [city]);
  useEffect(() => {
    if (city?.id) fetchVillages({ cityId: city.id });
  }, [city?.id, fetchVillages]);

  const loadRelatedContent = async () => {
    if (!city) return;
    await fetchArticles({
      cityIds: [city.id],
      countryIds: city.countries?.id ? [city.countries.id] : undefined,
    });
  };

  const loadCityImage = async () => {
    if (!city) return;
    try {
      const result = await fetchCityImage(city.id, city.name, city.countries?.name || '');
      setImageUrl(result.image_url || '');
    } catch (_error) {
      // Image loading failure is non-critical, fallback to no image
    }
  };

  const handleFavoriteToggle = async () => {
    if (!city) return;
    try {
      await toggleFavorite(city.id);
      toast({
        title: isFavorited(city.id) ? 'Removed from favorites' : 'Added to favorites',
        description: `${city.name} ${isFavorited(city.id) ? 'removed from' : 'added to'} your favorites`,
      });
    } catch (_error) {
      toast({ title: 'Error', description: 'Failed to update favorites', variant: 'destructive' });
    }
  };

  const formatPopulation = (pop: number) => {
    if (pop >= 1e6) return `${(pop / 1e6).toFixed(1)}M people`;
    if (pop >= 1e3) return `${(pop / 1e3).toFixed(0)}K people`;
    return `${pop} people`;
  };

  if (loading) return <PageLoading text="Loading city details..." />;

  if (!city) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Box sx={{ mx: 'auto', px: 2, py: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
            City Not Found
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>
            The city you're looking for doesn't exist.
          </Typography>
          <LocalizedLink to="/places" style={{ color: 'inherit', fontWeight: 500 }}>
            ← Back to Places
          </LocalizedLink>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ mx: 'auto', px: 2, py: 3 }}>
      {/* Breadcrumb */}
      <Box
        component="nav"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.875rem',
          color: 'text.secondary',
          mb: 2,
        }}
      >
        <LocalizedLink to="/places" style={{ color: 'inherit', textDecoration: 'none' }}>
          ← Back to Places
        </LocalizedLink>
        <span>/</span>
        {city.countries && (
          <>
            <LocalizedLink
              to={`/country/${city.countries.slug || city.countries.id}`}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {city.countries.name}
            </LocalizedLink>
            <span>/</span>
          </>
        )}
        <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
          {city.name}
        </Box>
      </Box>

      {/* Hero Image */}
      <DetailHero imageUrl={imageUrl} alt={city.name} height={{ xs: 192, md: 240 }} />

      {/* Safety Alert — above fold, before title */}
      <SafetyAlertBanner
        criminalization={
          city.countries?.lgbti_criminalization as Record<string, unknown> | null | undefined
        }
        countryName={city.countries?.name || ''}
      />

      {/* Title Row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1,
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 0.5 }}>
            <Typography
              variant="h3"
              sx={{
                fontSize: { xs: '2rem', lg: '2.75rem' },
                fontWeight: 700,
                color: 'text.primary',
              }}
            >
              {city.countries?.flag_emoji && <>{city.countries.flag_emoji} </>}
              {city.name}
            </Typography>
            {city.countries?.equality_score != null && (
              <EqualityScoreBadge score={city.countries.equality_score} size="md" />
            )}
          </Box>
          <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary', mb: 1 }}>
            {city.region_name && `${city.region_name}, `}
            {city.countries ? (
              <LocalizedLink
                to={`/country/${city.countries.slug || city.countries.id}`}
                style={{
                  color: 'inherit',
                  textDecoration: 'underline',
                  textDecorationColor: 'currentColor',
                  textUnderlineOffset: '2px',
                }}
              >
                {city.countries.name}
              </LocalizedLink>
            ) : null}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0, mt: 1, flexWrap: 'wrap' }}>
          <ReportButton contentType="cities" contentId={city.id} contentName={city.name} />
          <AdminEditButton
            contentType="cities"
            contentId={city.id}
            contentName={city.name}
            currentData={city as Record<string, unknown>}
            onSaved={() => refetchCity()}
          />
          <Button variant="outline" size="sm" onClick={handleFavoriteToggle}>
            <Heart
              style={{
                height: 16,
                width: 16,
                marginRight: 6,
                ...(isFavorited(city.id) ? { fill: 'currentColor', color: 'inherit' } : {}),
              }}
            />
            {isFavorited(city.id) ? 'Favorited' : 'Favorite'}
          </Button>
          {city.official_website && (
            <Button variant="outline" size="sm" asChild>
              <a href={city.official_website} target="_blank" rel="noopener noreferrer">
                <Globe style={{ height: 16, width: 16, marginRight: 6 }} />
                Website
              </a>
            </Button>
          )}
        </Box>
      </Box>

      {/* Compact Stat Chips */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {city.is_capital && (
          <Chip
            icon={<Building style={{ height: 14, width: 14 }} />}
            label="Capital City"
            size="small"
            variant="outlined"
          />
        )}
        {city.is_major_city && (
          <Chip
            icon={<MapPin style={{ height: 14, width: 14 }} />}
            label="Major City"
            size="small"
            variant="outlined"
          />
        )}
        {city.population && (
          <Chip
            icon={<Users style={{ height: 14, width: 14 }} />}
            label={formatPopulation(city.population)}
            size="small"
            variant="outlined"
          />
        )}
        {city.timezone && (
          <Chip
            icon={<Clock style={{ height: 14, width: 14 }} />}
            label={city.timezone}
            size="small"
            variant="outlined"
          />
        )}
        {effectiveIata && (
          <Chip
            icon={<Plane style={{ height: 14, width: 14 }} />}
            label={hasAirport ? effectiveIata : `~${effectiveIata} (nearest)`}
            size="small"
            variant="outlined"
          />
        )}
        {city.climate_type && (
          <Chip
            icon={<Thermometer style={{ height: 14, width: 14 }} />}
            label={city.climate_type}
            size="small"
            variant="outlined"
          />
        )}
        {city.lgbt_friendly_rating && (
          <Chip
            icon={
              <Star style={{ height: 14, width: 14, fill: 'currentColor', color: 'inherit' }} />
            }
            label={`${city.lgbt_friendly_rating}/5 LGBTQ+ Friendly`}
            size="small"
            variant="outlined"
          />
        )}
      </Box>

      {/* Main Content — Tabs */}
      <DetailTabs
        tabs={[
          { value: 'overview', label: 'Overview', icon: Info },
          { value: 'rights', label: 'Rights', icon: Shield },
          { value: 'venues', label: 'Venues', icon: Building },
          { value: 'events', label: 'Events', icon: Calendar },
          { value: 'travel', label: 'Travel', icon: Plane },
          { value: 'news', label: 'News', icon: FileText },
          { value: 'map', label: 'Map', icon: MapIcon },
        ]}
      >

            {/* ═══ OVERVIEW TAB ═══ */}
            <TabsContent
              value="overview"
              style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}
            >
              {/* About + Quick Facts */}
              <ScrollReveal direction="up">
              <Box
                sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, gap: 3 }}
              >
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Globe style={{ height: 20, width: 20 }} />
                      About {city.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                      {city.description ||
                        `Discover ${city.name} – from local venues and cultural landmarks to upcoming events.`}
                    </Typography>
                  </CardContent>
                </Card>

                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Star style={{ height: 20, width: 20 }} />
                      Quick Facts
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {city.countries?.name && (
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
                          <Globe style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Country
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.countries.name}
                        </Typography>
                      </Box>
                    )}
                    {city.countries?.currency && (
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
                          <DollarSign style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Currency
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.countries.currency}
                        </Typography>
                      </Box>
                    )}
                    {city.local_language && (
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
                          <Globe style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Language
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.local_language}
                        </Typography>
                      </Box>
                    )}
                    {city.timezone && (
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
                          <Clock style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Timezone
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.timezone}
                        </Typography>
                      </Box>
                    )}
                    {city.best_time_to_visit && (
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
                          <Calendar style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Best Time
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                          {city.best_time_to_visit}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Box>
              </ScrollReveal>

              {/* Wikipedia + Photo Gallery */}
              <LocationInfo name={city.name} type="city" />

              {/* Weather Forecast */}
              {city.latitude && city.longitude && (
                <WeatherForecast
                  latitude={city.latitude}
                  longitude={city.longitude}
                  cityName={city.name}
                />
              )}

              {/* Info Cards Grid — collapsible */}
              <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" sx={{ display: 'flex', alignItems: 'center', gap: 1, mx: 'auto' }}>
                  <ChevronDown style={{ height: 16, width: 16 }} />
                  Show more details
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
              <StaggerGrid
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                  gap: 3,
                }}
              >
                {/* Basic Information */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Info style={{ height: 20, width: 20 }} />
                      Basic Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {city.population && (
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
                          <Users style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Population
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.population.toLocaleString()}
                        </Typography>
                      </Box>
                    )}
                    {city.founded_year && (
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
                          <Calendar style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Founded
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.founded_year}
                        </Typography>
                      </Box>
                    )}
                    {city.area_km2 && (
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
                          <Mountain style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Area
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.area_km2} km²
                        </Typography>
                      </Box>
                    )}
                    {city.elevation_m && (
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
                          <Mountain style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Elevation
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.elevation_m} m
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>

                {/* Climate & Geography */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Thermometer style={{ height: 20, width: 20 }} />
                      Climate & Geography
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {city.climate_type && (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Thermometer style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Climate
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.climate_type}
                        </Typography>
                      </Box>
                    )}
                    {city.latitude && city.longitude && (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <MapPin style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Coordinates
                          </Typography>
                        </Box>
                        <Typography
                          component="span"
                          sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}
                        >
                          {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>
                </Card>

                {/* Contact & Codes */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Phone style={{ height: 20, width: 20 }} />
                      Contact & Codes
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {city.postal_codes && city.postal_codes.length > 0 && (
                      <Box>
                        <Typography
                          component="span"
                          sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1, display: 'block' }}
                        >
                          Postal Codes
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {city.postal_codes.slice(0, 3).map((code, index) => (
                            <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                              {code}
                            </Badge>
                          ))}
                          {city.postal_codes.length > 3 && (
                            <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                              +{city.postal_codes.length - 3} more
                            </Badge>
                          )}
                        </Box>
                      </Box>
                    )}
                    {city.area_codes && city.area_codes.length > 0 && (
                      <Box>
                        <Typography
                          component="span"
                          sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1, display: 'block' }}
                        >
                          Area Codes
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {city.area_codes.map((code, index) => (
                            <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                              <Phone style={{ height: 12, width: 12, marginRight: 4 }} />
                              {code}
                            </Badge>
                          ))}
                        </Box>
                      </Box>
                    )}
                    {effectiveIata && (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Plane style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            {hasAirport ? 'Major Airport' : 'Nearest Airport'}
                          </Typography>
                        </Box>
                        <Badge variant="outline">{effectiveIata}</Badge>
                        {!hasAirport && nearestAirport && (
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
                            {nearestAirport.city_name} — {nearestAirport.distanceKm} km
                          </Typography>
                        )}
                      </Box>
                    )}
                  </CardContent>
                </Card>

              {/* Demographics */}
              {city.demographics && Object.keys(city.demographics).length > 0 && (
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users style={{ height: 20, width: 20 }} />
                      Demographics & Population
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          md: 'repeat(2, 1fr)',
                          lg: 'repeat(3, 1fr)',
                        },
                        gap: 2,
                      }}
                    >
                      {Object.entries(city.demographics).map(([key, value]) => (
                        <Box key={key} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Typography
                            component="span"
                            sx={{
                              fontSize: '0.875rem',
                              fontWeight: 500,
                              textTransform: 'capitalize',
                              display: 'block',
                              mb: 0.5,
                            }}
                          >
                            {key.replace(/_/g, ' ')}
                          </Typography>
                          <Typography component="span" sx={{ fontWeight: 700 }}>
                            {String(value)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* Economy */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  gap: 3,
                }}
              >
                {city.economy_sectors && city.economy_sectors.length > 0 && (
                  <Card sx={{ borderColor: 'divider' }}>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DollarSign style={{ height: 20, width: 20 }} />
                        Economy Sectors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {city.economy_sectors.map((sector, index) => (
                          <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                            {sector}
                          </Badge>
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                )}
                {city.cost_of_living && Object.keys(city.cost_of_living).length > 0 && (
                  <Card sx={{ borderColor: 'divider' }}>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DollarSign style={{ height: 20, width: 20 }} />
                        Cost of Living
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {Object.entries(city.cost_of_living).map(([key, value]) => (
                          <Box
                            key={key}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: 'action.hover',
                            }}
                          >
                            <Typography
                              component="span"
                              sx={{
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                textTransform: 'capitalize',
                              }}
                            >
                              {key.replace(/_/g, ' ')}
                            </Typography>
                            <Typography component="span" sx={{ fontWeight: 700 }}>
                              {String(value)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </Box>

              {/* Universities */}
              {city.universities && city.universities.length > 0 && (
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <GraduationCap style={{ height: 20, width: 20 }} />
                      Universities & Education
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          md: 'repeat(2, 1fr)',
                          lg: 'repeat(3, 1fr)',
                        },
                        gap: 1.5,
                      }}
                    >
                      {city.universities.map((university, index) => (
                        <Box key={index} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <GraduationCap style={{ height: 16, width: 16 }} />
                            <Typography
                              component="span"
                              sx={{ fontWeight: 500, fontSize: '0.875rem' }}
                            >
                              {university}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* Culture */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  gap: 3,
                }}
              >
                {city.notable_landmarks && city.notable_landmarks.length > 0 && (
                  <Card sx={{ borderColor: 'divider' }}>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Landmark style={{ height: 20, width: 20 }} />
                        Notable Landmarks
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'grid', gap: 1.5 }}>
                        {city.notable_landmarks.map((landmark, index) => (
                          <Box
                            key={index}
                            sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Landmark style={{ height: 16, width: 16 }} />
                              <Typography component="span" sx={{ fontWeight: 500 }}>
                                {landmark}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                )}
                {city.sister_cities && city.sister_cities.length > 0 && (
                  <Card sx={{ borderColor: 'divider' }}>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Globe style={{ height: 20, width: 20 }} />
                        Sister Cities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'grid', gap: 1.5 }}>
                        {city.sister_cities.map((sisterCity, index) => (
                          <Box
                            key={index}
                            sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Globe style={{ height: 16, width: 16 }} />
                              <Typography component="span" sx={{ fontWeight: 500 }}>
                                {sisterCity}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </Box>
              </StaggerGrid>

              {/* Local Customs */}
              {city.local_customs && (
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Info style={{ height: 20, width: 20 }} />
                      Local Customs & Culture
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
                      {city.local_customs}
                    </Typography>
                  </CardContent>
                </Card>
              )}
              </CollapsibleContent>
              </Collapsible>

              {/* Queer Villages */}
              {!villagesLoading && villages.length > 0 && (
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Home style={{ height: 20, width: 20 }} />
                      LGBTQ+ Neighborhoods
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          sm: 'repeat(2, 1fr)',
                          md: 'repeat(3, 1fr)',
                        },
                        gap: 2,
                      }}
                    >
                      {villages.map((village) => (
                        <VillageCard key={village.id} village={village} />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ═══ RIGHTS TAB ═══ */}
            <TabsContent
              value="rights"
              style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}
            >
              <Box
                sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}
              >
                <Box>
                  <Typography
                    variant="h2"
                    sx={{ fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.025em' }}
                  >
                    LGBTI Rights
                  </Typography>
                  <Typography sx={{ color: 'text.secondary', mt: 0.5 }}>
                    Legal protections and rights status in{' '}
                    {city.countries ? (
                      <LocalizedLink
                        to={`/country/${city.countries.slug || city.countries.id}`}
                        style={{ color: 'inherit', textDecoration: 'underline' }}
                      >
                        {city.countries.name}
                      </LocalizedLink>
                    ) : (
                      'this country'
                    )}
                  </Typography>
                </Box>
                {city.countries?.equality_score != null && (
                  <EqualityScoreBadge score={city.countries.equality_score} size="lg" />
                )}
              </Box>

              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                }}
              >
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                  The rights information below applies to {city.countries?.name || 'this country'}{' '}
                  at the national level. Local laws and enforcement in {city.name} may vary.
                </Typography>
              </Box>

              {countryLoading ? (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 8,
                    gap: 2,
                  }}
                >
                  <InlineLoading text="Loading rights data..." size="md" />
                </Box>
              ) : fullCountry ? (
                <LGBTJurisdictionInfo country={fullCountry} />
              ) : (
                <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>
                  Rights data is not available for this location.
                </Typography>
              )}
            </TabsContent>

            {/* ═══ VENUES TAB ═══ */}
            <TabsContent value="venues" style={{ marginTop: 24 }}>
              {user && city && (
                <Card style={{ marginBottom: 16 }}>
                  <CardContent style={{ paddingTop: 20 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Luggage style={{ width: 20, height: 20, opacity: 0.6 }} />
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          Planning a trip to {city.name}?
                        </Typography>
                      </Box>
                      <Button variant="outline" size="sm" onClick={() => setCreateTripOpen(true)}>
                        Create Trip
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              )}
              {venuesLoading ? (
                <InlineLoading text="Loading venues..." size="md" />
              ) : venues.length > 0 ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                    gap: 2,
                  }}
                >
                  {venues.map((venue) => (
                    <VenueCard key={venue.id} venue={venue} />
                  ))}
                </Box>
              ) : (
                <EmptyState
                  icon={Building}
                  title="No venues found yet"
                  description={`Be the first to add venues in ${city.name}!`}
                  mood="encouraging"
                />
              )}
            </TabsContent>

            {/* ═══ EVENTS TAB ═══ */}
            <TabsContent value="events" style={{ marginTop: 24 }}>
              {eventsLoading ? (
                <InlineLoading text="Loading events..." size="md" />
              ) : events.length > 0 ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                    gap: 2,
                  }}
                >
                  {events.map((event) => (
                    <EventCard key={event.id} event={event} />
                  ))}
                </Box>
              ) : (
                <EmptyState
                  icon={Calendar}
                  title="No upcoming events"
                  description={`Check back later for events in ${city.name}!`}
                  mood="encouraging"
                />
              )}
            </TabsContent>

            {/* ═══ TRAVEL TAB ═══ */}
            <TabsContent
              value="travel"
              style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}
            >
              <CityTravelHub
                destinationIata={effectiveIata}
                destinationCity={city.name}
                destinationCountryCode={city.countries?.code}
              />

              <SimilarCities
                cityId={city.id}
                cityName={city.name}
                countryId={city.country_id}
                equalityScore={city.countries?.equality_score}
                latitude={city.latitude}
              />

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                  gap: 3,
                }}
              >
                {/* Airports */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Plane style={{ height: 20, width: 20 }} />
                      Airports
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {city.major_airport_code && (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Plane style={{ height: 16, width: 16 }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Major Airport
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {city.major_airport_code}
                        </Typography>
                      </Box>
                    )}
                    {!hasAirport && nearestAirport && (
                      <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Plane style={{ height: 16, width: 16 }} />
                          <Typography
                            component="span"
                            sx={{ fontSize: '0.875rem', fontWeight: 500 }}
                          >
                            Nearest Airport
                          </Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>
                          {nearestAirport.iata_code}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
                          {nearestAirport.city_name} — {nearestAirport.distanceKm} km away
                        </Typography>
                      </Box>
                    )}
                    {city.airport_codes && city.airport_codes.length > 0 && (
                      <Box>
                        <Typography
                          component="span"
                          sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1.5, display: 'block' }}
                        >
                          All Airport Codes
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {city.airport_codes.map((code, index) => (
                            <Badge key={index} variant="outline">
                              <Plane style={{ height: 12, width: 12, marginRight: 4 }} />
                              {code}
                            </Badge>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>

                {/* Transportation */}
                <Card sx={{ borderColor: 'divider' }}>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Bus style={{ height: 20, width: 20 }} />
                      Transportation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {city.transportation_info &&
                    Object.keys(city.transportation_info).length > 0 ? (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {Object.entries(city.transportation_info).map(([key, value]) => (
                          <Box key={key} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Bus style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                              <Typography
                                component="span"
                                sx={{
                                  fontSize: '0.875rem',
                                  fontWeight: 500,
                                  textTransform: 'capitalize',
                                }}
                              >
                                {key.replace(/_/g, ' ')}
                              </Typography>
                            </Box>
                            <Typography component="span" sx={{ fontSize: '0.875rem' }}>
                              {String(value)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    ) : (
                      <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                        No transportation information available.
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Box>
            </TabsContent>

            {/* ═══ NEWS TAB ═══ */}
            <TabsContent value="news" style={{ marginTop: 24 }}>
              {newsLoading ? (
                <InlineLoading text="Loading news..." size="md" />
              ) : articles.length > 0 ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                    gap: 2,
                  }}
                >
                  {articles.slice(0, 6).map((article) => (
                    <NewsCard key={article.id} article={article} />
                  ))}
                </Box>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No news available"
                  description={`Check back later for news about ${city.name}!`}
                  mood="neutral"
                />
              )}
            </TabsContent>

            {/* ═══ MAP TAB ═══ */}
            <TabsContent value="map">
              {typeof city.latitude === 'number' && typeof city.longitude === 'number' && (
                <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={32} /></Box>}>
                  <ExploreMap
                    height={500}
                    initialCenter={[Number(city.longitude), Number(city.latitude)]}
                    initialZoom={12}
                    defaultLayers={['venues', 'events', 'neighbourhoods']}
                    showLayerToggles
                    showFilters={false}
                    skipAutoFly
                  />
                </Suspense>
              )}
            </TabsContent>
      </DetailTabs>

      <CreateTripDialog open={createTripOpen} onClose={() => setCreateTripOpen(false)} />
    </Box>
  );
}
