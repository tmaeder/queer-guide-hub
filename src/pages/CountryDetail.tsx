
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MapPin, Globe, Users, Building2, Calendar, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WeatherForecast } from "@/components/weather/WeatherForecast";
import { LocationInfo } from "@/components/location/LocationInfo";
import { VenueCard } from "@/components/venues/VenueCard";
import { EventCard } from "@/components/events/EventCard";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { useOptimizedCountry, useOptimizedCities } from "@/hooks/useOptimizedDirectory";
import { useOptimizedVenues } from "@/hooks/useOptimizedVenues";
import { useOptimizedEvents } from "@/hooks/useOptimizedEvents";

export default function CountryDetail() {
  const { countryId } = useParams<{ countryId: string }>();
  const { t } = useTranslation();
  
  if (!countryId) {
    return <div>Country not found</div>;
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

  const loading = countryLoading || citiesLoading || venuesLoading || cityVenuesLoading || eventsLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <Globe className="h-12 w-12 mx-auto text-primary/60" />
          </div>
          <p className="text-muted-foreground">Loading country details...</p>
        </div>
      </div>
    );
  }

  if (!country) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Country not found</h1>
          <p className="text-muted-foreground">The country you're looking for doesn't exist.</p>
          <Button asChild>
            <Link to="/directory">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Directory
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent"></div>
        
        <div className="relative mx-auto max-w-7xl px-6 py-12">
          {/* Navigation */}
          <div className="mb-8">
            <Button variant="ghost" asChild className="mb-4">
              <Link to="/directory">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Directory
              </Link>
            </Button>
            
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <Link to="/directory" className="hover:text-foreground transition-colors">
                Directory
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">{country.name}</span>
            </nav>
          </div>

          {/* Country Header */}
          <div className="text-center space-y-6 mb-12">
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <h1 className="text-4xl lg:text-5xl font-bold">
                  {country.flag_emoji} {country.name}
                </h1>
              </div>
              
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                {country.description || `Discover everything about ${country.name} - from major cities and cultural landmarks to local venues and upcoming events.`}
              </p>
            </div>
            
            {/* Country Stats */}
            <div className="flex items-center justify-center gap-6 flex-wrap text-sm">
              {country.capital && (
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span>Capital: {country.capital}</span>
                </div>
              )}
              {country.population && (
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{country.population.toLocaleString()} people</span>
                </div>
              )}
              {country.area_km2 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{country.area_km2.toLocaleString()} km²</span>
                </div>
              )}
              {cities.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{cities.length} cities</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 pb-12">
        {/* Country Information */}
        <div className="grid gap-8 lg:grid-cols-2 mb-12">
          <LocationInfo
            name={country.name}
            type="country"
            className="h-fit"
          />
          
          <WeatherForecast
            latitude={country.latitude}
            longitude={country.longitude}
            cityName={country.capital || country.name}
            className="h-fit"
          />
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="cities" className="space-y-8">
          <TabsList className="grid w-full max-w-md grid-cols-4 mx-auto">
            <TabsTrigger value="cities" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Cities</span>
            </TabsTrigger>
            <TabsTrigger value="venues" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Venues</span>
            </TabsTrigger>
            <TabsTrigger value="events" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Events</span>
            </TabsTrigger>
            <TabsTrigger value="info" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Info</span>
            </TabsTrigger>
          </TabsList>

          {/* Cities Tab */}
          <TabsContent value="cities" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Major Cities</h2>
              <Badge variant="secondary">{cities.length} cities</Badge>
            </div>
            
            {cities.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {cities.map((city) => (
                  <DirectoryCard
                    key={city.id}
                    type="city"
                    name={city.name}
                    data={city}
                    onClick={() => window.location.href = `/city/${city.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No cities found for this country.</p>
              </div>
            )}
          </TabsContent>

          {/* Venues Tab */}
          <TabsContent value="venues" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Local Venues</h2>
              <Badge variant="secondary">{countryVenues.length} venues</Badge>
            </div>
            
            {countryVenues.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                 {countryVenues.map((venue) => (
                   <VenueCard
                     key={venue.id}
                     venue={venue}
                   />
                 ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No venues found for this country yet.</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Be the first to add venues from {country.name}!
                </p>
              </div>
            )}
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Upcoming Events</h2>
              <Badge variant="secondary">{events.length} events</Badge>
            </div>
            
            {events.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {events.map((event) => (
                   <EventCard
                     key={event.id}
                     event={event}
                   />
                 ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No upcoming events found for this country.</p>
              </div>
            )}
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="space-y-8">
            <div className="grid gap-8 md:grid-cols-2">
              {/* Basic Information */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold">Basic Information</h3>
                <div className="space-y-4">
                  {country.capital && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Capital:</span>
                      <span className="font-medium">{country.capital}</span>
                    </div>
                  )}
                  {country.currency && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Currency:</span>
                      <span className="font-medium">{country.currency}</span>
                    </div>
                  )}
                  {country.languages && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Languages:</span>
                      <span className="font-medium">{country.languages.join(', ')}</span>
                    </div>
                  )}
                  {country.timezone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Timezone:</span>
                      <span className="font-medium">{country.timezone}</span>
                    </div>
                  )}
                  {country.calling_code && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Calling Code:</span>
                      <span className="font-medium">{country.calling_code}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Demographics */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold">Demographics & Economy</h3>
                <div className="space-y-4">
                  {country.population && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Population:</span>
                      <span className="font-medium">{country.population.toLocaleString()}</span>
                    </div>
                  )}
                  {country.area_km2 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Area:</span>
                      <span className="font-medium">{country.area_km2.toLocaleString()} km²</span>
                    </div>
                  )}
                  {country.gdp_per_capita_usd && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">GDP per capita:</span>
                      <span className="font-medium">${country.gdp_per_capita_usd.toLocaleString()}</span>
                    </div>
                  )}
                  {country.life_expectancy && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Life Expectancy:</span>
                      <span className="font-medium">{country.life_expectancy} years</span>
                    </div>
                  )}
                  {country.human_development_index && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">HDI:</span>
                      <span className="font-medium">{country.human_development_index}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
