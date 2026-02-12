import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Globe, Users, Calendar, Building, Star, Heart, ExternalLink, Clock, Thermometer, Mountain, Phone, Mail, Bus, Plane, Train, DollarSign, GraduationCap, Landmark, Info, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFavorites } from "@/hooks/useFavorites";
import { useCityImages } from "@/hooks/useCityImages";
import { useNews } from "@/hooks/useNews";
import { useOptimizedVenues } from "@/hooks/useOptimizedVenues";
import { useOptimizedEvents } from "@/hooks/useOptimizedEvents";
import CityHeroImages from "@/components/city/CityHeroImages";
import { NewsCard } from "@/components/news/NewsCard";
import { VenueCard } from "@/components/venues/VenueCard";
import { EventCard } from "@/components/events/EventCard";
import { CurrentWeather } from "@/components/weather/CurrentWeather";
import { PageLoading, InlineLoading } from "@/components/ui/loading";
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
type CityWithCountry = {
  id: string;
  name: string;
  region_name?: string;
  population?: number;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  is_capital: boolean;
  is_major_city: boolean;
  elevation_m?: number;
  climate_type?: string;
  major_airport_code?: string;
  airport_codes?: string[];
  founded_year?: number;
  area_km2?: number;
  local_language?: string;
  official_website?: string;
  mayor?: string;
  postal_codes?: string[];
  area_codes?: string[];
  sister_cities?: string[];
  notable_landmarks?: string[];
  economy_sectors?: string[];
  universities?: string[];
  transportation_info?: any;
  demographics?: any;
  cost_of_living?: any;
  lgbt_friendly_rating?: number;
  description?: string;
  best_time_to_visit?: string;
  local_customs?: string;
  image_url?: string;
  countries?: {
    id: string;
    name: string;
    flag_emoji?: string;
    currency?: string;
  };
};
export default function CityDetail() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    toggleFavorite,
    isFavorited
  } = useFavorites('city');
  const {
    fetchCityImage
  } = useCityImages();
  const {
    articles,
    loading: newsLoading,
    fetchArticles
  } = useNews();
  const [city, setCity] = useState<CityWithCountry | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string>("");
  const {
    venues,
    loading: venuesLoading
  } = useOptimizedVenues({
    city: city?.name,
    limit: 12
  });
  const {
    events,
    loading: eventsLoading
  } = useOptimizedEvents({
    city: city?.name,
    limit: 12
  });
  useEffect(() => {
    if (id) {
      fetchCityDetails();
    }
  }, [id]);
  useEffect(() => {
    if (city) {
      loadCityImage();
      loadRelatedContent();
    }
  }, [city]);
  const loadRelatedContent = async () => {
    if (!city) return;

    // Fetch related news for this city
    await fetchArticles({
      cityIds: [city.id],
      countryIds: city.countries?.id ? [city.countries.id] : undefined
    });
  };
  const fetchCityDetails = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('cities').select(`
          *,
          countries (
            id,
            name,
            flag_emoji,
            currency
          )
        `).eq('id', id).single();
      if (error) throw error;
      setCity(data);
    } catch (error) {
      console.error('Error fetching city details:', error);
      toast({
        title: "Error",
        description: "Failed to load city details",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const loadCityImage = async () => {
    if (!city) return;
    try {
      const result = await fetchCityImage(city.id, city.name, city.countries?.name || '');
      setImageUrl(result.image_url || '');
    } catch (error) {
      console.error('Error loading city image:', error);
    }
  };
  const handleFavoriteToggle = async () => {
    if (!city) return;
    try {
      await toggleFavorite(city.id);
      toast({
        title: isFavorited(city.id) ? "Removed from favorites" : "Added to favorites",
        description: `${city.name} ${isFavorited(city.id) ? 'removed from' : 'added to'} your favorites`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive"
      });
    }
  };
  const renderLGBTRating = () => {
    if (!city?.lgbt_friendly_rating) return null;
    return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>LGBTQ+ Friendly:</Typography>
        <Box sx={{ display: 'flex' }}>
          {Array.from({
          length: 5
        }, (_, i) => <Star key={i} style={{ height: 16, width: 16, ...(i < city.lgbt_friendly_rating! ? { fill: 'currentColor', color: 'var(--primary)' } : { color: 'var(--muted-foreground)' }) }} />)}
        </Box>
        <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          ({city.lgbt_friendly_rating}/5)
        </Typography>
      </Box>;
  };
  if (loading) {
    return <PageLoading text="Loading city details..." />;
  }
  if (!city) {
    return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 4 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>City Not Found</Typography>
            <Button onClick={() => navigate('/directory')}>Back to Directory</Button>
          </Box>
        </Box>
      </Box>;
  }
  return <Box sx={{ maxWidth: 1152, mx: 'auto', px: 2, py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Link to="/places" style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--muted-foreground)', marginBottom: 24 }}>
          <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
          Back to Places
        </Link>

        {/* Hero Section */}
        {imageUrl && <Box sx={{ position: 'relative', mb: 4 }}>
            <Box sx={{ aspectRatio: '21/9', borderRadius: 4, overflow: 'hidden', background: 'linear-gradient(to right, rgba(var(--primary-rgb), 0.2), rgba(var(--accent-rgb), 0.2))' }}>
              <Box component="img" src={imageUrl} alt={city.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
          }} />
            </Box>
          </Box>}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, alignItems: { lg: 'flex-start' }, justifyContent: { lg: 'space-between' }, gap: 3 }}>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                  {city.countries?.flag_emoji && <Typography component="span" sx={{ fontSize: '2.25rem' }}>{city.countries.flag_emoji}</Typography>}
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>{city.name}</Typography>
                </Box>
                <Typography sx={{ fontSize: '1.25rem', color: 'text.secondary', mb: 2 }}>
                  {city.region_name && `${city.region_name}, `}{city.countries?.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  {city.is_capital && <Badge variant="secondary">
                      <Building style={{ height: 12, width: 12, marginRight: 4 }} />
                      Capital City
                    </Badge>}
                  {city.is_major_city && <Badge variant="outline">
                      <MapPin style={{ height: 12, width: 12, marginRight: 4 }} />
                      Major City
                    </Badge>}
                  {renderLGBTRating()}
                </Box>
              </Box>

              {/* Current Weather in Header */}
              {city.latitude && city.longitude && (
                <Box sx={{ flexShrink: 0 }}>
                  <CurrentWeather
                    latitude={city.latitude}
                    longitude={city.longitude}
                    cityName={city.name}
                  />
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outline" onClick={handleFavoriteToggle}>
              <Heart style={{ height: 16, width: 16, marginRight: 8, ...(isFavorited(city.id) ? { fill: 'currentColor', color: 'var(--primary)' } : {}) }} />
              {isFavorited(city.id) ? 'Favorited' : 'Favorite'}
            </Button>
            {city.official_website && <Button variant="outline" asChild>
                <a href={city.official_website} target="_blank" rel="noopener noreferrer">
                  <Globe style={{ height: 16, width: 16, marginRight: 8 }} />
                  Website
                </a>
              </Button>}
          </Box>
        </Box>
      </Box>

      <Box sx={{ width: '100%' }}>
        {/* Main Content */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Description Card */}
          {city.description && <Card>
              <CardHeader>
                <CardTitle>About {city.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{city.description}</Typography>
              </CardContent>
            </Card>}

          {/* Enhanced Tabs */}
          <Tabs defaultValue="overview" style={{ width: '100%' }}>
            <TabsList style={{ display: 'grid', width: '100%', gridTemplateColumns: 'repeat(5, 1fr)', backgroundColor: 'rgba(var(--muted-rgb), 0.5)' }}>
              <TabsTrigger value="overview" style={{ fontSize: '0.875rem' }}>
                <Info style={{ height: 16, width: 16, marginRight: 8 }} />
                Overview
              </TabsTrigger>
              <TabsTrigger value="travel" style={{ fontSize: '0.875rem' }}>
                <Plane style={{ height: 16, width: 16, marginRight: 8 }} />
                Travel
              </TabsTrigger>
              <TabsTrigger value="news" style={{ fontSize: '0.875rem' }}>
                <FileText style={{ height: 16, width: 16, marginRight: 8 }} />
                News
              </TabsTrigger>
              <TabsTrigger value="venues" style={{ fontSize: '0.875rem' }}>
                <Building style={{ height: 16, width: 16, marginRight: 8 }} />
                Venues
              </TabsTrigger>
              <TabsTrigger value="events" style={{ fontSize: '0.875rem' }}>
                <Calendar style={{ height: 16, width: 16, marginRight: 8 }} />
                Events
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 24 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Info style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Basic Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {city.population && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Users style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Population</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>{city.population.toLocaleString()}</Typography>
                      </Box>}
                    {city.founded_year && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Calendar style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Founded</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>{city.founded_year}</Typography>
                      </Box>}
                    {city.area_km2 && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Mountain style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Area</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>{city.area_km2} km2</Typography>
                      </Box>}
                    {city.elevation_m && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Mountain style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Elevation</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>{city.elevation_m} m</Typography>
                      </Box>}
                    {city.timezone && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Clock style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Timezone</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>{city.timezone}</Typography>
                      </Box>}
                  </CardContent>
                </Card>

                {/* Climate & Geography */}
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Thermometer style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Climate & Geography
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {city.climate_type && <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Thermometer style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Climate</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>{city.climate_type}</Typography>
                      </Box>}
                    {city.latitude && city.longitude && <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <MapPin style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Coordinates</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</Typography>
                      </Box>}
                    {city.best_time_to_visit && <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Calendar style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Best Time to Visit</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontSize: '0.875rem' }}>{city.best_time_to_visit}</Typography>
                      </Box>}
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Phone style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Contact & Codes
                    </CardTitle>
                  </CardHeader>
                  <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {city.postal_codes && city.postal_codes.length > 0 && <Box>
                        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1, display: 'block' }}>Postal Codes</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {city.postal_codes.slice(0, 3).map((code, index) => <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>{code}</Badge>)}
                          {city.postal_codes.length > 3 && <Badge variant="outline" style={{ fontSize: '0.75rem' }}>+{city.postal_codes.length - 3} more</Badge>}
                        </Box>
                      </Box>}
                    {city.area_codes && city.area_codes.length > 0 && <Box>
                        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1, display: 'block' }}>Area Codes</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {city.area_codes.map((code, index) => <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                              <Phone style={{ height: 12, width: 12, marginRight: 4 }} />
                              {code}
                            </Badge>)}
                        </Box>
                      </Box>}
                    {city.major_airport_code && <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Plane style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Major Airport</Typography>
                        </Box>
                        <Badge variant="outline">{city.major_airport_code}</Badge>
                      </Box>}
                  </CardContent>
                </Card>
              </Box>

              {/* Demographics Section */}
              {city.demographics && Object.keys(city.demographics).length > 0 && <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Users style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Demographics & Population
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
                      {Object.entries(city.demographics).map(([key, value]) => <Box key={key} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, textTransform: 'capitalize', display: 'block', mb: 0.5 }}>
                            {key.replace(/_/g, ' ')}
                          </Typography>
                          <Typography component="span" sx={{ fontWeight: 700 }}>{String(value)}</Typography>
                        </Box>)}
                    </Box>
                  </CardContent>
                </Card>}

              {/* Economy Section */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
                {/* Economy Sectors */}
                {city.economy_sectors && city.economy_sectors.length > 0 && <Card>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DollarSign style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                        Economy Sectors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {city.economy_sectors.map((sector, index) => <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                            {sector}
                          </Badge>)}
                      </Box>
                    </CardContent>
                  </Card>}

                {/* Cost of Living */}
                {city.cost_of_living && Object.keys(city.cost_of_living).length > 0 && <Card>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <DollarSign style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                        Cost of Living
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {Object.entries(city.cost_of_living).map(([key, value]) => <Box key={key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, textTransform: 'capitalize' }}>
                              {key.replace(/_/g, ' ')}
                            </Typography>
                            <Typography component="span" sx={{ fontWeight: 700 }}>{String(value)}</Typography>
                          </Box>)}
                      </Box>
                    </CardContent>
                  </Card>}
              </Box>

              {/* Universities */}
              {city.universities && city.universities.length > 0 && <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <GraduationCap style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Universities & Education
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                      {city.universities.map((university, index) => <Box key={index} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <GraduationCap style={{ height: 16, width: 16, color: 'var(--primary)' }} />
                            <Typography component="span" sx={{ fontWeight: 500, fontSize: '0.875rem' }}>{university}</Typography>
                          </Box>
                        </Box>)}
                    </Box>
                  </CardContent>
                </Card>}

              {/* Culture Section */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
                {/* Notable Landmarks */}
                {city.notable_landmarks && city.notable_landmarks.length > 0 && <Card>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Landmark style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                        Notable Landmarks
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'grid', gap: 1.5 }}>
                        {city.notable_landmarks.map((landmark, index) => <Box key={index} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Landmark style={{ height: 16, width: 16, color: 'var(--primary)' }} />
                              <Typography component="span" sx={{ fontWeight: 500 }}>{landmark}</Typography>
                            </Box>
                          </Box>)}
                      </Box>
                    </CardContent>
                  </Card>}

                {/* Sister Cities */}
                {city.sister_cities && city.sister_cities.length > 0 && <Card>
                    <CardHeader>
                      <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Globe style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                        Sister Cities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Box sx={{ display: 'grid', gap: 1.5 }}>
                        {city.sister_cities.map((sisterCity, index) => <Box key={index} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Globe style={{ height: 16, width: 16, color: 'var(--primary)' }} />
                              <Typography component="span" sx={{ fontWeight: 500 }}>{sisterCity}</Typography>
                            </Box>
                          </Box>)}
                      </Box>
                    </CardContent>
                  </Card>}
              </Box>

              {/* Local Customs */}
              {city.local_customs && <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Info style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Local Customs & Culture
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Typography sx={{ color: 'text.secondary', lineHeight: 1.7 }}>{city.local_customs}</Typography>
                  </CardContent>
                </Card>}

              {/* Current Weather */}
              {city.latitude && city.longitude && <CurrentWeather latitude={city.latitude} longitude={city.longitude} cityName={city.name} />}

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Info style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                    Quick Stats
                  </CardTitle>
                </CardHeader>
                <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {city.population && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Population</Typography>
                      <Typography component="span" sx={{ fontWeight: 700 }}>{city.population.toLocaleString()}</Typography>
                    </Box>}
                  {city.countries?.currency && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Currency</Typography>
                      <Typography component="span" sx={{ fontWeight: 700 }}>{city.countries.currency}</Typography>
                    </Box>}
                  {city.timezone && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Timezone</Typography>
                      <Typography component="span" sx={{ fontWeight: 700 }}>{city.timezone}</Typography>
                    </Box>}
                  {city.major_airport_code && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Major Airport</Typography>
                      <Badge variant="outline">{city.major_airport_code}</Badge>
                    </Box>}
                  {city.best_time_to_visit && <Box>
                      <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary', display: 'block', mb: 0.5 }}>Best Time to Visit</Typography>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{city.best_time_to_visit}</Typography>
                    </Box>}
                </CardContent>
              </Card>
            </TabsContent>


            <TabsContent value="travel" style={{ marginTop: 24 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
                {/* Airport Information */}
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Plane style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Airports
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {city.major_airport_code && <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Plane style={{ height: 16, width: 16, color: 'var(--primary)' }} />
                          <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Major Airport</Typography>
                        </Box>
                        <Typography component="span" sx={{ fontWeight: 700 }}>{city.major_airport_code}</Typography>
                      </Box>}
                    {city.airport_codes && city.airport_codes.length > 0 && <Box>
                        <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, mb: 1.5, display: 'block' }}>All Airport Codes</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {city.airport_codes.map((code, index) => <Badge key={index} variant="outline">
                              <Plane style={{ height: 12, width: 12, marginRight: 4 }} />
                              {code}
                            </Badge>)}
                        </Box>
                      </Box>}
                  </CardContent>
                </Card>

                {/* Transportation */}
                <Card>
                  <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Bus style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                      Transportation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {city.transportation_info && Object.keys(city.transportation_info).length > 0 ? <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        {Object.entries(city.transportation_info).map(([key, value]) => <Box key={key} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              <Bus style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                              <Typography component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</Typography>
                            </Box>
                            <Typography component="span" sx={{ fontSize: '0.875rem' }}>{String(value)}</Typography>
                          </Box>)}
                      </Box> : <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>No transportation information available.</Typography>}
                  </CardContent>
                </Card>
              </Box>
            </TabsContent>


            <TabsContent value="venues" style={{ marginTop: 24 }}>
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                    Popular Venues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {venuesLoading ? <InlineLoading text="Loading venues..." size="md" /> : venues.length > 0 ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
                      {venues.map(venue => <VenueCard key={venue.id} venue={venue} />)}
                    </Box> : <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>No venues available for this city.</Typography>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="news" style={{ marginTop: 24 }}>
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                    Latest News
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {newsLoading ? <InlineLoading text="Loading news..." size="md" /> : articles.length > 0 ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
                      {articles.slice(0, 6).map(article => <NewsCard key={article.id} article={article} />)}
                    </Box> : <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>No news available for this city.</Typography>}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="events" style={{ marginTop: 24 }}>
              <Card>
                <CardHeader>
                  <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar style={{ height: 20, width: 20, color: 'var(--primary)' }} />
                    Upcoming Events
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {eventsLoading ? <InlineLoading text="Loading events..." size="md" /> : events.length > 0 ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
                      {events.map(event => <EventCard key={event.id} event={event} />)}
                    </Box> : <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>No events available for this city.</Typography>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </Box>
      </Box>
    </Box>;
}
