import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  MapPin, 
  Globe, 
  Users, 
  Calendar,
  Building,
  Star,
  Heart,
  ExternalLink,
  Clock,
  Thermometer,
  Mountain,
  Phone,
  Mail,
  Bus,
  Plane,
  Train,
  DollarSign,
  GraduationCap,
  Landmark,
  Info,
  FileText
} from "lucide-react";
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
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { toggleFavorite, isFavorited } = useFavorites('city');
  const { fetchCityImage } = useCityImages();
  const { articles, loading: newsLoading, fetchArticles } = useNews();

  const [city, setCity] = useState<CityWithCountry | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string>("");

  const { venues, loading: venuesLoading } = useOptimizedVenues({ 
    city: city?.name,
    limit: 12 
  });
  const { events, loading: eventsLoading } = useOptimizedEvents({ 
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
      const { data, error } = await supabase
        .from('cities')
        .select(`
          *,
          countries (
            id,
            name,
            flag_emoji,
            currency
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setCity(data);
    } catch (error) {
      console.error('Error fetching city details:', error);
      toast({
        title: "Error",
        description: "Failed to load city details",
        variant: "destructive",
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
        description: `${city.name} ${isFavorited(city.id) ? 'removed from' : 'added to'} your favorites`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update favorites",
        variant: "destructive",
      });
    }
  };

  const renderLGBTRating = () => {
    if (!city?.lgbt_friendly_rating) return null;
    
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">LGBTQ+ Friendly:</span>
        <div className="flex">
          {Array.from({ length: 5 }, (_, i) => (
            <Star
              key={i}
              className={`h-4 w-4 ${
                i < city.lgbt_friendly_rating! ? 'fill-primary text-primary' : 'text-muted-foreground'
              }`}
            />
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          ({city.lgbt_friendly_rating}/5)
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading city details...</div>
        </div>
      </div>
    );
  }

  if (!city) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">City Not Found</h1>
            <Button onClick={() => navigate('/directory')}>Back to Directory</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Navigation Header */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => navigate('/directory')} className="hover-scale">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Directory
            </Button>
            <Button variant="outline" onClick={handleFavoriteToggle} className="hover-scale">
              <Heart className={`h-4 w-4 mr-2 transition-colors ${isFavorited(city.id) ? 'fill-primary text-primary' : ''}`} />
              {isFavorited(city.id) ? 'Favorited' : 'Add to Favorites'}
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Enhanced Hero Section */}
        <div className="relative overflow-hidden rounded-2xl shadow-2xl">
          <CityHeroImages cityName={city.name} countryName={city.countries?.name} className="h-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          {/* Hero Content */}
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div className="flex items-end justify-between">
              <div className="flex items-center gap-6">
                {city.countries?.flag_emoji && (
                  <div className="text-7xl drop-shadow-2xl animate-fade-in">
                    {city.countries.flag_emoji}
                  </div>
                )}
                <div className="animate-fade-in">
                  <h1 className="text-6xl font-bold mb-3 text-white drop-shadow-2xl">
                    {city.name}
                  </h1>
                  <p className="text-xl text-white/90 mb-4 drop-shadow-lg">
                    {city.region_name && `${city.region_name}, `}{city.countries?.name}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {city.is_capital && (
                      <Badge className="bg-primary/90 text-primary-foreground border-0 backdrop-blur-sm hover-scale">
                        <Building className="h-3 w-3 mr-1" />
                        Capital City
                      </Badge>
                    )}
                    {city.is_major_city && (
                      <Badge className="bg-accent/90 text-accent-foreground border-0 backdrop-blur-sm hover-scale">
                        <MapPin className="h-3 w-3 mr-1" />
                        Major City
                      </Badge>
                    )}
                    {city.lgbt_friendly_rating && city.lgbt_friendly_rating >= 4 && (
                      <Badge className="bg-green-600/90 text-white border-0 backdrop-blur-sm hover-scale">
                        <Star className="h-3 w-3 mr-1" />
                        LGBTQ+ Friendly
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Description Card */}
        {city.description && (
          <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover-scale">
            <CardContent className="p-8">
              <p className="text-lg leading-relaxed text-muted-foreground">{city.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Tabs */}
        <Tabs defaultValue="overview" className="space-y-8">
          <div className="sticky top-20 z-40 bg-background/95 backdrop-blur-md rounded-xl border shadow-lg p-2">
            <TabsList className="grid w-full grid-cols-9 h-14 bg-muted/50">
              <TabsTrigger value="overview" className="text-sm font-medium hover-scale">
                <Info className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="demographics" className="text-sm font-medium hover-scale">
                <Users className="h-4 w-4 mr-2" />
                Demographics
              </TabsTrigger>
              <TabsTrigger value="economy" className="text-sm font-medium hover-scale">
                <DollarSign className="h-4 w-4 mr-2" />
                Economy
              </TabsTrigger>
              <TabsTrigger value="geography" className="text-sm font-medium hover-scale">
                <Mountain className="h-4 w-4 mr-2" />
                Geography
              </TabsTrigger>
              <TabsTrigger value="culture" className="text-sm font-medium hover-scale">
                <Landmark className="h-4 w-4 mr-2" />
                Culture
              </TabsTrigger>
              <TabsTrigger value="travel" className="text-sm font-medium hover-scale">
                <Plane className="h-4 w-4 mr-2" />
                Travel
              </TabsTrigger>
              <TabsTrigger value="news" className="text-sm font-medium hover-scale">
                <FileText className="h-4 w-4 mr-2" />
                News
              </TabsTrigger>
              <TabsTrigger value="venues" className="text-sm font-medium hover-scale">
                <Building className="h-4 w-4 mr-2" />
                Venues
              </TabsTrigger>
              <TabsTrigger value="events" className="text-sm font-medium hover-scale">
                <Calendar className="h-4 w-4 mr-2" />
                Events
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Enhanced Basic Information Card */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover-scale bg-gradient-to-br from-card to-card/80">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Info className="h-5 w-5 text-primary" />
                    </div>
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {city.population && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Population</span>
                      </div>
                      <span className="font-bold text-primary">{city.population.toLocaleString()}</span>
                    </div>
                  )}
                  {city.founded_year && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Founded</span>
                      </div>
                      <span className="font-bold">{city.founded_year}</span>
                    </div>
                  )}
                  {city.area_km2 && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2">
                        <Mountain className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Area</span>
                      </div>
                      <span className="font-bold">{city.area_km2} km²</span>
                    </div>
                  )}
                  {city.elevation_m && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2">
                        <Mountain className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Elevation</span>
                      </div>
                      <span className="font-bold">{city.elevation_m} m</span>
                    </div>
                  )}
                  {city.timezone && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Timezone</span>
                      </div>
                      <span className="font-bold">{city.timezone}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Enhanced Climate & Geography Card */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover-scale bg-gradient-to-br from-card to-card/80">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Thermometer className="h-5 w-5 text-orange-500" />
                    </div>
                    Climate & Geography
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {city.climate_type && (
                    <div className="p-4 rounded-lg bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-200/50 dark:border-orange-800/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Thermometer className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">Climate Type</span>
                      </div>
                      <span className="font-bold text-orange-700 dark:text-orange-300">{city.climate_type}</span>
                    </div>
                  )}
                  {city.latitude && city.longitude && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Coordinates</span>
                      </div>
                      <span className="font-mono text-sm">
                        {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}
                  {city.best_time_to_visit && (
                    <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200/50 dark:border-green-800/50">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Best Time to Visit</span>
                      </div>
                      <span className="font-bold text-green-700 dark:text-green-300">{city.best_time_to_visit}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Enhanced Administration Card */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover-scale bg-gradient-to-br from-card to-card/80">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Building className="h-5 w-5 text-blue-500" />
                    </div>
                    Administration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {city.mayor && (
                    <div className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Mayor</span>
                      </div>
                      <span className="font-bold">{city.mayor}</span>
                    </div>
                  )}
                  {city.local_language && (
                    <div className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Local Language</span>
                      </div>
                      <span className="font-bold">{city.local_language}</span>
                    </div>
                  )}
                  {city.official_website && (
                    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Official Website</span>
                      </div>
                      <a 
                        href={city.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 flex items-center gap-2 font-medium transition-colors story-link"
                      >
                        Visit Website <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                  {city.lgbt_friendly_rating && (
                    <div className="p-4 rounded-lg bg-gradient-to-r from-rainbow-50 to-purple-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200/50 dark:border-purple-800/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">LGBTQ+ Friendly</span>
                        <div className="flex items-center gap-2">
                          <div className="flex">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 transition-colors ${
                                  i < city.lgbt_friendly_rating! 
                                    ? 'fill-yellow-400 text-yellow-400' 
                                    : 'text-muted-foreground'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-sm font-bold text-purple-700 dark:text-purple-300">
                            {city.lgbt_friendly_rating}/5
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="demographics" className="animate-fade-in">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Users className="h-6 w-6 text-blue-500" />
                  </div>
                  Demographics & Population
                </CardTitle>
              </CardHeader>
              <CardContent>
                {city.demographics && Object.keys(city.demographics).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(city.demographics).map(([key, value]) => (
                      <div key={key} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-bold text-primary">{String(value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No demographic data available.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="economy" className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Economy Sectors */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <DollarSign className="h-5 w-5 text-green-500" />
                    </div>
                    Economy Sectors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.economy_sectors && city.economy_sectors.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                      {city.economy_sectors.map((sector, index) => (
                        <Badge 
                          key={index} 
                          variant="outline" 
                          className="px-3 py-1 hover-scale bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300"
                        >
                          {sector}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No economy sector information available.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cost of Living */}
              <Card className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <DollarSign className="h-5 w-5 text-orange-500" />
                    </div>
                    Cost of Living
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.cost_of_living && Object.keys(city.cost_of_living).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(city.cost_of_living).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <span className="text-sm font-medium capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-bold text-orange-600">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No cost of living data available.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Universities */}
            {city.universities && city.universities.length > 0 && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <GraduationCap className="h-5 w-5 text-blue-500" />
                    </div>
                    Universities & Education
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {city.universities.map((university, index) => (
                      <div key={index} className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                        <GraduationCap className="h-4 w-4 text-blue-500 mb-2" />
                        <span className="font-medium text-blue-700 dark:text-blue-300">{university}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="geography" className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Location Details */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <MapPin className="h-5 w-5 text-green-500" />
                    </div>
                    Location Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {city.latitude && city.longitude && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Coordinates</span>
                        <span className="font-mono text-sm">{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</span>
                      </div>
                    </div>
                  )}
                  {city.elevation_m && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Elevation</span>
                        <span className="font-bold">{city.elevation_m} meters</span>
                      </div>
                    </div>
                  )}
                  {city.area_km2 && (
                    <div className="p-4 rounded-lg bg-muted/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Total Area</span>
                        <span className="font-bold">{city.area_km2} km²</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Postal & Contact Info */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Mail className="h-5 w-5 text-purple-500" />
                    </div>
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {city.postal_codes && city.postal_codes.length > 0 && (
                    <div>
                      <span className="text-sm font-medium mb-2 block">Postal Codes</span>
                      <div className="flex flex-wrap gap-2">
                        {city.postal_codes.map((code, index) => (
                          <Badge key={index} variant="outline">{code}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {city.area_codes && city.area_codes.length > 0 && (
                    <div>
                      <span className="text-sm font-medium mb-2 block">Area Codes</span>
                      <div className="flex flex-wrap gap-2">
                        {city.area_codes.map((code, index) => (
                          <Badge key={index} variant="outline" className="bg-purple-50 dark:bg-purple-950/30">
                            <Phone className="h-3 w-3 mr-1" />
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="culture" className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Notable Landmarks */}
              {city.notable_landmarks && city.notable_landmarks.length > 0 && (
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="p-2 rounded-lg bg-amber-500/10">
                        <Landmark className="h-5 w-5 text-amber-500" />
                      </div>
                      Notable Landmarks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {city.notable_landmarks.map((landmark, index) => (
                        <div key={index} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                          <Landmark className="h-4 w-4 text-amber-500 mb-2" />
                          <span className="font-medium text-amber-700 dark:text-amber-300">{landmark}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Sister Cities */}
              {city.sister_cities && city.sister_cities.length > 0 && (
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-xl">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <Globe className="h-5 w-5 text-blue-500" />
                      </div>
                      Sister Cities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3">
                      {city.sister_cities.map((sisterCity, index) => (
                        <div key={index} className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                          <Globe className="h-4 w-4 text-blue-500 mb-2" />
                          <span className="font-medium text-blue-700 dark:text-blue-300">{sisterCity}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Local Customs */}
            {city.local_customs && (
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Info className="h-5 w-5 text-purple-500" />
                    </div>
                    Local Customs & Culture
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed text-lg">{city.local_customs}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="travel" className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Airport Information */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-sky-500/10">
                      <Plane className="h-5 w-5 text-sky-500" />
                    </div>
                    Airports
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.major_airport_code && (
                    <div className="p-4 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Plane className="h-4 w-4 text-sky-500" />
                        <span className="text-sm font-medium">Major Airport</span>
                      </div>
                      <span className="font-bold text-sky-700 dark:text-sky-300">{city.major_airport_code}</span>
                    </div>
                  )}
                  {city.airport_codes && city.airport_codes.length > 0 && (
                    <div>
                      <span className="text-sm font-medium mb-3 block">All Airport Codes</span>
                      <div className="flex flex-wrap gap-2">
                        {city.airport_codes.map((code, index) => (
                          <Badge key={index} variant="outline" className="bg-sky-50 dark:bg-sky-950/30">
                            <Plane className="h-3 w-3 mr-1" />
                            {code}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Transportation */}
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Bus className="h-5 w-5 text-green-500" />
                    </div>
                    Transportation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.transportation_info && Object.keys(city.transportation_info).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(city.transportation_info).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2 mb-1">
                            <Bus className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                          </div>
                          <span className="text-sm">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Bus className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No transportation information available.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="news" className="animate-fade-in">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <div className="p-2 rounded-lg bg-red-500/10">
                    <FileText className="h-6 w-6 text-red-500" />
                  </div>
                  Latest News
                </CardTitle>
              </CardHeader>
              <CardContent>
                {newsLoading ? (
                  <div className="text-center py-8">Loading news...</div>
                ) : articles.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.slice(0, 6).map((article) => (
                      <div key={article.id} className="hover-scale">
                        <NewsCard article={article} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No news articles available for this city.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="venues" className="animate-fade-in">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Building className="h-6 w-6 text-purple-500" />
                  </div>
                  Popular Venues
                </CardTitle>
              </CardHeader>
              <CardContent>
                {venuesLoading ? (
                  <div className="text-center py-8">Loading venues...</div>
                ) : venues.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {venues.map((venue) => (
                      <div key={venue.id} className="hover-scale">
                        <VenueCard venue={venue} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Building className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No venues available for this city.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="animate-fade-in">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-2xl">
                  <div className="p-2 rounded-lg bg-indigo-500/10">
                    <Calendar className="h-6 w-6 text-indigo-500" />
                  </div>
                  Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="text-center py-8">Loading events...</div>
                ) : events.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.map((event) => (
                      <div key={event.id} className="hover-scale">
                        <EventCard event={event} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No upcoming events for this city.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}