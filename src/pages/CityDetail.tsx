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
import { useVenues } from "@/hooks/useVenues";
import { useEvents } from "@/hooks/useEvents";
import CityHeroImages from "@/components/city/CityHeroImages";
import { NewsCard } from "@/components/news/NewsCard";
import { VenueCard } from "@/components/venues/VenueCard";
import { EventCard } from "@/components/events/EventCard";
import FlightWidget from "@/components/booking/FlightWidget";
import HotelWidget from "@/components/booking/HotelWidget";

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
  const { venues, loading: venuesLoading, fetchVenues } = useVenues();
  const { events, loading: eventsLoading, fetchEvents } = useEvents();

  const [city, setCity] = useState<CityWithCountry | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string>("");

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
    
    // Fetch related news, venues, and events for this city
    await Promise.all([
      fetchArticles({ search: city.name }),
      fetchVenues({ city: city.name }),
      fetchEvents({ city: city.name })
    ]);
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={() => navigate('/directory')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Directory
          </Button>
          <Button variant="outline" onClick={handleFavoriteToggle}>
            <Heart className={`h-4 w-4 mr-2 ${isFavorited(city.id) ? 'fill-primary text-primary' : ''}`} />
            {isFavorited(city.id) ? 'Remove from Favorites' : 'Add to Favorites'}
          </Button>
        </div>

        {/* Hero Section */}
        <Card className="mb-8 overflow-hidden">
          <CardContent className="p-0">
            {/* City Images with overlay */}
            <div className="relative">
              <CityHeroImages cityName={city.name} countryName={city.countries?.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-8 text-white">
                <div className="flex items-center gap-4 mb-4">
                  {city.countries?.flag_emoji && (
                    <span className="text-6xl drop-shadow-lg">{city.countries.flag_emoji}</span>
                  )}
                  <div>
                    <h1 className="text-5xl font-bold mb-2 drop-shadow-lg">{city.name}</h1>
                    <p className="text-xl text-white/90 mb-3">
                      {city.region_name && `${city.region_name}, `}{city.countries?.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {city.is_capital && (
                        <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                          <Building className="h-3 w-3 mr-1" />
                          Capital City
                        </Badge>
                      )}
                      {city.is_major_city && (
                        <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                          <MapPin className="h-3 w-3 mr-1" />
                          Major City
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {city.description && (
              <div className="p-6 border-t border-border">
                <p className="text-muted-foreground leading-relaxed text-lg">{city.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-8">
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 mb-6">
            <TabsList className="grid w-full grid-cols-9 h-12">
              <TabsTrigger value="overview" className="text-sm font-medium">Overview</TabsTrigger>
              <TabsTrigger value="demographics" className="text-sm font-medium">Demographics</TabsTrigger>
              <TabsTrigger value="economy" className="text-sm font-medium">Economy</TabsTrigger>
              <TabsTrigger value="geography" className="text-sm font-medium">Geography</TabsTrigger>
              <TabsTrigger value="culture" className="text-sm font-medium">Culture</TabsTrigger>
              <TabsTrigger value="travel" className="text-sm font-medium">Travel</TabsTrigger>
              <TabsTrigger value="news" className="text-sm font-medium">News</TabsTrigger>
              <TabsTrigger value="venues" className="text-sm font-medium">Venues</TabsTrigger>
              <TabsTrigger value="events" className="text-sm font-medium">Events</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Info className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {city.population && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Population</span>
                      <span className="font-medium">{city.population.toLocaleString()}</span>
                    </div>
                  )}
                  {city.founded_year && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Founded</span>
                      <span className="font-medium">{city.founded_year}</span>
                    </div>
                  )}
                  {city.area_km2 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Area</span>
                      <span className="font-medium">{city.area_km2} km²</span>
                    </div>
                  )}
                  {city.elevation_m && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Elevation</span>
                      <span className="font-medium">{city.elevation_m} m</span>
                    </div>
                  )}
                  {city.timezone && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Timezone</span>
                      <span className="font-medium">{city.timezone}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Climate & Geography */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Thermometer className="h-5 w-5" />
                    Climate & Geography
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {city.climate_type && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Climate</span>
                      <span className="font-medium">{city.climate_type}</span>
                    </div>
                  )}
                  {city.latitude && city.longitude && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Coordinates</span>
                      <span className="font-medium text-xs">
                        {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}
                  {city.best_time_to_visit && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Best Time to Visit</span>
                      <span className="font-medium">{city.best_time_to_visit}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Contact & Administration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Administration
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {city.mayor && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Mayor</span>
                      <span className="font-medium">{city.mayor}</span>
                    </div>
                  )}
                  {city.local_language && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Local Language</span>
                      <span className="font-medium">{city.local_language}</span>
                    </div>
                  )}
                  {city.official_website && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Official Website</span>
                      <a 
                        href={city.official_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        Visit Website <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  <div className="mt-4">
                    {renderLGBTRating()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="demographics" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Demographics & Population</CardTitle>
              </CardHeader>
              <CardContent>
                {city.demographics && Object.keys(city.demographics).length > 0 ? (
                  <div className="space-y-4">
                    {Object.entries(city.demographics).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground capitalize">
                          {key.replace(/_/g, ' ')}
                        </span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No demographic data available.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="economy" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Economy Sectors */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Economy Sectors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.economy_sectors && city.economy_sectors.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {city.economy_sectors.map((sector, index) => (
                        <Badge key={index} variant="outline">{sector}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No economy sector information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Cost of Living */}
              <Card>
                <CardHeader>
                  <CardTitle>Cost of Living</CardTitle>
                </CardHeader>
                <CardContent>
                  {city.cost_of_living && Object.keys(city.cost_of_living).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(city.cost_of_living).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="font-medium">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No cost of living data available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="geography" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Climate & Geography */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Thermometer className="h-5 w-5" />
                    Climate & Geography
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {city.climate_type && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Climate Type</span>
                      <span className="font-medium">{city.climate_type}</span>
                    </div>
                  )}
                  {city.elevation_m && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Elevation</span>
                      <span className="font-medium">{city.elevation_m} m</span>
                    </div>
                  )}
                  {city.latitude && city.longitude && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Coordinates</span>
                      <span className="font-medium text-xs">
                        {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                      </span>
                    </div>
                  )}
                  {city.timezone && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Timezone</span>
                      <span className="font-medium">{city.timezone}</span>
                    </div>
                  )}
                  {city.area_km2 && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Area</span>
                      <span className="font-medium">{city.area_km2} km²</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Notable Landmarks */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="h-5 w-5" />
                    Notable Landmarks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.notable_landmarks && city.notable_landmarks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {city.notable_landmarks.map((landmark, index) => (
                        <Badge key={index} variant="outline">{landmark}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No landmark information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Sister Cities */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Sister Cities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.sister_cities && city.sister_cities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {city.sister_cities.map((sisterCity, index) => (
                        <Badge key={index} variant="secondary">{sisterCity}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No sister city information available.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="culture" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Universities & Education */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Universities & Education
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.universities && city.universities.length > 0 ? (
                    <ul className="space-y-2">
                      {city.universities.map((university, index) => (
                        <li key={index} className="text-sm">• {university}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No university information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Notable Landmarks */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Landmark className="h-5 w-5" />
                    Notable Landmarks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.notable_landmarks && city.notable_landmarks.length > 0 ? (
                    <ul className="space-y-2">
                      {city.notable_landmarks.map((landmark, index) => (
                        <li key={index} className="text-sm">• {landmark}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">No landmark information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Local Customs */}
              {city.local_customs && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Local Customs & Culture</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">{city.local_customs}</p>
                  </CardContent>
                </Card>
              )}

              {/* Sister Cities */}
              {city.sister_cities && city.sister_cities.length > 0 && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Sister Cities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {city.sister_cities.map((sisterCity, index) => (
                        <Badge key={index} variant="secondary">{sisterCity}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="travel" className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              {/* Flight Widget */}
              <FlightWidget
                airportCode={city.major_airport_code}
                currency={city.countries?.currency}
                title={`Flights to ${city.name}`}
              />
              
              {/* Hotel Widget */}
              <HotelWidget
                latitude={city.latitude}
                longitude={city.longitude}
                title={`Hotels in ${city.name}`}
              />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Transportation */}
                <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bus className="h-5 w-5" />
                    Transportation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {city.transportation_info && Object.keys(city.transportation_info).length > 0 ? (
                    <div className="space-y-3">
                      {Object.entries(city.transportation_info).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-sm font-medium capitalize block mb-1">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-sm text-muted-foreground">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No transportation information available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Contact Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Contact Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {city.area_codes && city.area_codes.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Area Codes</span>
                      <div className="flex flex-wrap gap-1">
                        {city.area_codes.map((code, index) => (
                          <Badge key={index} variant="outline" className="text-xs">{code}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {city.postal_codes && city.postal_codes.length > 0 && (
                    <div>
                      <span className="text-sm text-muted-foreground block mb-1">Postal Codes</span>
                      <div className="flex flex-wrap gap-1">
                        {city.postal_codes.map((code, index) => (
                          <Badge key={index} variant="outline" className="text-xs">{code}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                 </CardContent>
               </Card>
               </div>
             </div>
           </TabsContent>

          <TabsContent value="news" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Related News
                </CardTitle>
              </CardHeader>
              <CardContent>
                {newsLoading ? (
                  <div className="text-center py-8">Loading news...</div>
                ) : articles.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {articles.slice(0, 9).map((article) => (
                      <NewsCard key={article.id} article={article} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No news articles found for {city?.name}.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="venues" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Local Venues
                </CardTitle>
              </CardHeader>
              <CardContent>
                {venuesLoading ? (
                  <div className="text-center py-8">Loading venues...</div>
                ) : venues.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {venues.slice(0, 9).map((venue) => (
                      <VenueCard key={venue.id} venue={venue} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No venues found in {city?.name}.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Upcoming Events
                </CardTitle>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="text-center py-8">Loading events...</div>
                ) : events.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.slice(0, 9).map((event) => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No upcoming events found in {city?.name}.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* GetYourGuide Widget */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Tours & Activities
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div 
                data-gyg-widget="auto" 
                data-gyg-partner-id="2PBDXWH"
                data-gyg-locale="en-US"
                data-gyg-location-name={`${city?.name}, ${city?.countries?.name}`}
                data-gyg-country-code={city?.countries?.id}
                data-gyg-cta="Book Now"
                data-gyg-exclude-soldout="true"
                data-gyg-number-of-items="6"
                style={{ minHeight: '400px' }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}