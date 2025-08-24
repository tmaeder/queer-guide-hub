import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <Link to="/places" className="inline-flex items-center text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Places
        </Link>
        
        {/* Hero Section */}
        {imageUrl && (
          <div className="relative mb-8">
            <div className="aspect-[21/9] rounded-2xl overflow-hidden bg-gradient-to-r from-primary/20 to-accent/20">
              <img
                src={imageUrl}
                alt={city.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-start gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  {city.countries?.flag_emoji && (
                    <span className="text-4xl">{city.countries.flag_emoji}</span>
                  )}  
                  <h1 className="text-4xl font-bold">{city.name}</h1>
                </div>
                <p className="text-xl text-muted-foreground mb-4">
                  {city.region_name && `${city.region_name}, `}{city.countries?.name}
                </p>
                <div className="flex items-center gap-3 mb-4">
                  {city.is_capital && (
                    <Badge variant="secondary">
                      <Building className="h-3 w-3 mr-1" />
                      Capital City
                    </Badge>
                  )}
                  {city.is_major_city && (
                    <Badge variant="outline">
                      <MapPin className="h-3 w-3 mr-1" />
                      Major City
                    </Badge>
                  )}
                  {renderLGBTRating()}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleFavoriteToggle}>
              <Heart className={`h-4 w-4 mr-2 ${isFavorited(city.id) ? 'fill-current text-primary' : ''}`} />
              {isFavorited(city.id) ? 'Favorited' : 'Favorite'}
            </Button>
            {city.official_website && (
              <Button variant="outline" asChild>
                <a href={city.official_website} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-4 w-4 mr-2" />
                  Website
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description Card */}
          {city.description && (
            <Card>
              <CardHeader>
                <CardTitle>About {city.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">{city.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Enhanced Tabs */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-8 bg-muted/50">
              <TabsTrigger value="overview" className="text-sm">
                <Info className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="demographics" className="text-sm">
                <Users className="h-4 w-4 mr-2" />
                Demographics
              </TabsTrigger>
              <TabsTrigger value="economy" className="text-sm">
                <DollarSign className="h-4 w-4 mr-2" />
                Economy
              </TabsTrigger>
              <TabsTrigger value="geography" className="text-sm">
                <Mountain className="h-4 w-4 mr-2" />
                Geography
              </TabsTrigger>
              <TabsTrigger value="culture" className="text-sm">
                <Landmark className="h-4 w-4 mr-2" />
                Culture
              </TabsTrigger>
              <TabsTrigger value="travel" className="text-sm">
                <Plane className="h-4 w-4 mr-2" />
                Travel
              </TabsTrigger>
              <TabsTrigger value="news" className="text-sm">
                <FileText className="h-4 w-4 mr-2" />
                News
              </TabsTrigger>
              <TabsTrigger value="venues" className="text-sm">
                <Building className="h-4 w-4 mr-2" />
                Venues
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Info className="h-5 w-5 text-primary" />
                        Basic Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {city.population && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Population</span>
                          </div>
                          <span className="font-bold">{city.population.toLocaleString()}</span>
                        </div>
                      )}
                      {city.founded_year && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Founded</span>
                          </div>
                          <span className="font-bold">{city.founded_year}</span>
                        </div>
                      )}
                      {city.area_km2 && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Mountain className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Area</span>
                          </div>
                          <span className="font-bold">{city.area_km2} km²</span>
                        </div>
                      )}
                      {city.elevation_m && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <Mountain className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Elevation</span>
                          </div>
                          <span className="font-bold">{city.elevation_m} m</span>
                        </div>
                      )}
                      {city.timezone && (
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
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

            {/* Keep other tabs as they are */}
            <TabsContent value="demographics">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Demographics & Population
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.demographics && Object.keys(city.demographics).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(city.demographics).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-lg bg-muted/50">
                          <span className="text-sm font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                          <p className="font-bold text-primary">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No demographic data available.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="venues">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-primary" />
                    Popular Venues
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {venuesLoading ? (
                    <div className="text-center py-8">Loading venues...</div>
                  ) : venues.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {venues.map((venue) => (
                        <VenueCard key={venue.id} venue={venue} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No venues available for this city.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="news">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Latest News
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {newsLoading ? (
                    <div className="text-center py-8">Loading news...</div>
                  ) : articles.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {articles.slice(0, 6).map((article) => (
                        <NewsCard key={article.id} article={article} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">No news available for this city.</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-primary" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {city.population && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Population</span>
                  <span className="font-bold">{city.population.toLocaleString()}</span>
                </div>
              )}
              {city.countries?.currency && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Currency</span>
                  <span className="font-bold">{city.countries.currency}</span>
                </div>
              )}
              {city.timezone && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Timezone</span>
                  <span className="font-bold">{city.timezone}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Travel Info */}
          {(city.major_airport_code || city.best_time_to_visit) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plane className="h-5 w-5 text-primary" />
                  Travel Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {city.major_airport_code && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Airport</span>
                    <Badge variant="outline">{city.major_airport_code}</Badge>
                  </div>
                )}
                {city.best_time_to_visit && (
                  <div>
                    <span className="text-sm text-muted-foreground block mb-1">Best Time to Visit</span>
                    <p className="text-sm">{city.best_time_to_visit}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}