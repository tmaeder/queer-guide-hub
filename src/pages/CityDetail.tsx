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
            <TabsList className="grid w-full grid-cols-4 bg-muted/50">
              <TabsTrigger value="overview" className="text-sm">
                <Info className="h-4 w-4 mr-2" />
                Overview
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
                {/* Basic Information */}
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

                {/* Climate & Geography */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Thermometer className="h-5 w-5 text-primary" />
                      Climate & Geography
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {city.climate_type && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Thermometer className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Climate</span>
                        </div>
                        <span className="font-bold">{city.climate_type}</span>
                      </div>
                    )}
                    {city.latitude && city.longitude && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Coordinates</span>
                        </div>
                        <span className="font-mono text-sm">{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</span>
                      </div>
                    )}
                    {city.best_time_to_visit && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Best Time to Visit</span>
                        </div>
                        <span className="text-sm">{city.best_time_to_visit}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Contact Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-primary" />
                      Contact & Codes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {city.postal_codes && city.postal_codes.length > 0 && (
                      <div>
                        <span className="text-sm font-medium mb-2 block">Postal Codes</span>
                        <div className="flex flex-wrap gap-1">
                          {city.postal_codes.slice(0, 3).map((code, index) => (
                            <Badge key={index} variant="outline" className="text-xs">{code}</Badge>
                          ))}
                          {city.postal_codes.length > 3 && (
                            <Badge variant="outline" className="text-xs">+{city.postal_codes.length - 3} more</Badge>
                          )}
                        </div>
                      </div>
                    )}
                    {city.area_codes && city.area_codes.length > 0 && (
                      <div>
                        <span className="text-sm font-medium mb-2 block">Area Codes</span>
                        <div className="flex flex-wrap gap-1">
                          {city.area_codes.map((code, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              <Phone className="h-3 w-3 mr-1" />
                              {code}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {city.major_airport_code && (
                      <div className="p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2 mb-1">
                          <Plane className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Major Airport</span>
                        </div>
                        <Badge variant="outline">{city.major_airport_code}</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Demographics Section */}
              {city.demographics && Object.keys(city.demographics).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Demographics & Population
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.entries(city.demographics).map(([key, value]) => (
                        <div key={key} className="p-3 rounded-lg bg-muted/50">
                          <span className="text-sm font-medium capitalize block mb-1">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-bold">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Economy Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Economy Sectors */}
                {city.economy_sectors && city.economy_sectors.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-primary" />
                        Economy Sectors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {city.economy_sectors.map((sector, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {sector}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Cost of Living */}
                {city.cost_of_living && Object.keys(city.cost_of_living).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-primary" />
                        Cost of Living
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(city.cost_of_living).map(([key, value]) => (
                          <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                            <span className="text-sm font-medium capitalize">
                              {key.replace(/_/g, ' ')}
                            </span>
                            <span className="font-bold">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Universities */}
              {city.universities && city.universities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-primary" />
                      Universities & Education
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {city.universities.map((university, index) => (
                        <div key={index} className="p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2">
                            <GraduationCap className="h-4 w-4 text-primary" />
                            <span className="font-medium text-sm">{university}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Culture Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Notable Landmarks */}
                {city.notable_landmarks && city.notable_landmarks.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-primary" />
                        Notable Landmarks
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3">
                        {city.notable_landmarks.map((landmark, index) => (
                          <div key={index} className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <Landmark className="h-4 w-4 text-primary" />
                              <span className="font-medium">{landmark}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Sister Cities */}
                {city.sister_cities && city.sister_cities.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-primary" />
                        Sister Cities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3">
                        {city.sister_cities.map((sisterCity, index) => (
                          <div key={index} className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4 text-primary" />
                              <span className="font-medium">{sisterCity}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Local Customs */}
              {city.local_customs && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="h-5 w-5 text-primary" />
                      Local Customs & Culture
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{city.local_customs}</p>
                  </CardContent>
                </Card>
              )}

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
                  {city.major_airport_code && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Major Airport</span>
                      <Badge variant="outline">{city.major_airport_code}</Badge>
                    </div>
                  )}
                  {city.best_time_to_visit && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Best Time to Visit</span>
                      <p className="text-sm font-medium">{city.best_time_to_visit}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>


            <TabsContent value="travel">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Airport Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Plane className="h-5 w-5 text-primary" />
                      Airports
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {city.major_airport_code && (
                      <div className="p-3 rounded-lg bg-muted/50 mb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Plane className="h-4 w-4 text-primary" />
                          <span className="text-sm font-medium">Major Airport</span>
                        </div>
                        <span className="font-bold">{city.major_airport_code}</span>
                      </div>
                    )}
                    {city.airport_codes && city.airport_codes.length > 0 && (
                      <div>
                        <span className="text-sm font-medium mb-3 block">All Airport Codes</span>
                        <div className="flex flex-wrap gap-2">
                          {city.airport_codes.map((code, index) => (
                            <Badge key={index} variant="outline">
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
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bus className="h-5 w-5 text-primary" />
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
                      <p className="text-muted-foreground text-center py-4">No transportation information available.</p>
                    )}
                  </CardContent>
                </Card>
              </div>
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