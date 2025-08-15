
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, MapPin, Globe, Users, Building2, Calendar, Star, Heart, TrendingUp, MapIcon } from "lucide-react";
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
import { useOptimizedCountry, useOptimizedCities } from "@/hooks/useOptimizedDirectory";
import { useOptimizedVenues } from "@/hooks/useOptimizedVenues";
import { useOptimizedEvents } from "@/hooks/useOptimizedEvents";

export default function CountryDetail() {
  const { id: countryId } = useParams<{ id: string }>();
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
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:50px_50px]" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        
        <div className="relative mx-auto max-w-7xl px-6 py-8 lg:py-16">
          {/* Navigation */}
          <div className="mb-8">
            <Button variant="ghost" asChild className="mb-6 hover:bg-white/10">
              <Link to="/directory">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Directory
              </Link>
            </Button>
            
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
              <Link to="/directory" className="hover:text-primary transition-colors">
                Directory
              </Link>
              <span>/</span>
              <span className="text-foreground font-medium">{country.name}</span>
            </nav>
          </div>

          {/* Country Header */}
          <div className="space-y-8 mb-16">
            {/* Country Images */}
            <div className="relative">
              <CountryHeroImages countryName={country.name} />
            </div>
            
            <div className="text-center space-y-6">
              <div className="space-y-4">
                <h1 className="text-5xl lg:text-7xl font-bold bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                  {country.flag_emoji} {country.name}
                </h1>
                
                <p className="text-xl lg:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
                  {country.description || `Discover everything about ${country.name} - from major cities and cultural landmarks to local venues and upcoming events.`}
                </p>
              </div>
            </div>
            
            {/* Country Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {country.capital && (
                <Card className="border-muted/50 hover:border-primary/50 transition-colors">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="p-2 bg-yellow-500/10 rounded-lg">
                      <Star className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Capital</p>
                      <p className="font-semibold">{country.capital}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {country.population && (
                <Card className="border-muted/50 hover:border-primary/50 transition-colors">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Users className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Population</p>
                      <p className="font-semibold">{country.population.toLocaleString()}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {country.area_km2 && (
                <Card className="border-muted/50 hover:border-primary/50 transition-colors">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <MapIcon className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Area</p>
                      <p className="font-semibold">{country.area_km2.toLocaleString()} km²</p>
                    </div>
                  </CardContent>
                </Card>
              )}
              {cities.length > 0 && (
                <Card className="border-muted/50 hover:border-primary/50 transition-colors">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Building2 className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Cities</p>
                      <p className="font-semibold">{cities.length} cities</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 pb-16">
        {/* Quick Info Cards */}
        <div className="grid gap-6 lg:grid-cols-3 mb-12 -mt-8">
          <Card className="border-muted/50 shadow-lg bg-card/80 backdrop-blur-sm">
            <CardContent className="p-0">
              <LocationInfo
                name={country.name}
                type="country"
                className="h-full border-0 bg-transparent"
              />
            </CardContent>
          </Card>
          
          <Card className="border-muted/50 shadow-lg bg-card/80 backdrop-blur-sm">
            <CardContent className="p-0">
              <WeatherForecast
                latitude={country.latitude}
                longitude={country.longitude}
                cityName={country.capital || country.name}
                className="h-full border-0 bg-transparent"
              />
            </CardContent>
          </Card>

          <Card className="border-muted/50 shadow-lg bg-card/80 backdrop-blur-sm">
            <CardContent className="p-0">
              <LGBTJurisdictionInfo
                countryName={country.name}
                countryCode={country.code}
                className="h-full border-0 bg-transparent"
              />
            </CardContent>
          </Card>
        </div>

        {/* Content Tabs */}
        <Card className="border-muted/30 shadow-sm">
          <CardContent className="p-6">
            <Tabs defaultValue="cities" className="space-y-8">
              <TabsList className="grid w-full max-w-lg grid-cols-4 mx-auto h-12 bg-muted/50">
                <TabsTrigger value="cities" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Building2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Cities</span>
                </TabsTrigger>
                <TabsTrigger value="venues" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <MapPin className="h-4 w-4" />
                  <span className="hidden sm:inline">Venues</span>
                </TabsTrigger>
                <TabsTrigger value="events" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Events</span>
                </TabsTrigger>
                <TabsTrigger value="info" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                  <Globe className="h-4 w-4" />
                  <span className="hidden sm:inline">Info</span>
                </TabsTrigger>
              </TabsList>

              {/* Cities Tab */}
              <TabsContent value="cities" className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Major Cities</h2>
                    <p className="text-muted-foreground mt-1">Explore the most important cities in {country.name}</p>
                  </div>
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    {cities.length} cities
                  </Badge>
                </div>
                
                {cities.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {cities.map((city) => (
                      <div key={city.id} className="group cursor-pointer transform transition-all duration-200 hover:scale-105">
                        <DirectoryCard
                          type="city"
                          name={city.name}
                          data={city}
                          onClick={() => window.location.href = `/city/${city.id}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Card className="border-dashed border-2 border-muted/50">
                    <CardContent className="text-center py-16">
                      <div className="space-y-4">
                        <div className="p-4 bg-muted/30 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                          <Building2 className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">No cities found</h3>
                          <p className="text-muted-foreground">No cities are currently listed for this country.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Venues Tab */}
              <TabsContent value="venues" className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Local Venues</h2>
                    <p className="text-muted-foreground mt-1">Discover amazing places to visit in {country.name}</p>
                  </div>
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    {countryVenues.length} venues
                  </Badge>
                </div>
                
                {countryVenues.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                     {countryVenues.map((venue) => (
                       <div key={venue.id} className="group transform transition-all duration-200 hover:scale-105">
                         <VenueCard
                           venue={venue}
                         />
                       </div>
                     ))}
                  </div>
                ) : (
                  <Card className="border-dashed border-2 border-muted/50">
                    <CardContent className="text-center py-16">
                      <div className="space-y-4">
                        <div className="p-4 bg-muted/30 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                          <MapPin className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">No venues found yet</h3>
                          <p className="text-muted-foreground">Be the first to add venues from {country.name}!</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Events Tab */}
              <TabsContent value="events" className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-bold tracking-tight">Upcoming Events</h2>
                    <p className="text-muted-foreground mt-1">Don't miss out on exciting events happening in {country.name}</p>
                  </div>
                  <Badge variant="secondary" className="text-sm px-3 py-1">
                    {events.length} events
                  </Badge>
                </div>
                
                {events.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                     {events.map((event) => (
                       <div key={event.id} className="group transform transition-all duration-200 hover:scale-105">
                         <EventCard
                           event={event}
                         />
                       </div>
                     ))}
                  </div>
                ) : (
                  <Card className="border-dashed border-2 border-muted/50">
                    <CardContent className="text-center py-16">
                      <div className="space-y-4">
                        <div className="p-4 bg-muted/30 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                          <Calendar className="h-10 w-10 text-muted-foreground" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">No upcoming events</h3>
                          <p className="text-muted-foreground">No events are currently scheduled for this country.</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Info Tab */}
              <TabsContent value="info" className="space-y-8">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight mb-2">Country Information</h2>
                  <p className="text-muted-foreground">Detailed statistics and information about {country.name}</p>
                </div>

                <div className="grid gap-8 md:grid-cols-2">
                  {/* Basic Information */}
                  <Card className="border-muted/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-primary" />
                        Basic Information
                      </CardTitle>
                      <CardDescription>
                        Essential details about {country.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {country.capital && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">Capital:</span>
                          <span className="font-semibold">{country.capital}</span>
                        </div>
                      )}
                      {country.currency && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">Currency:</span>
                          <span className="font-semibold">{country.currency}</span>
                        </div>
                      )}
                      {country.languages && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">Languages:</span>
                          <span className="font-semibold">{country.languages.join(', ')}</span>
                        </div>
                      )}
                      {country.timezone && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">Timezone:</span>
                          <span className="font-semibold">{country.timezone}</span>
                        </div>
                      )}
                      {country.calling_code && (
                        <div className="flex justify-between items-center py-2">
                          <span className="text-muted-foreground font-medium">Calling Code:</span>
                          <span className="font-semibold">{country.calling_code}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Demographics & Economy */}
                  <Card className="border-muted/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        Demographics & Economy
                      </CardTitle>
                      <CardDescription>
                        Population statistics and economic indicators
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {country.population && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">Population:</span>
                          <span className="font-semibold">{country.population.toLocaleString()}</span>
                        </div>
                      )}
                      {country.area_km2 && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">Area:</span>
                          <span className="font-semibold">{country.area_km2.toLocaleString()} km²</span>
                        </div>
                      )}
                      {country.gdp_per_capita_usd && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">GDP per capita:</span>
                          <span className="font-semibold">${country.gdp_per_capita_usd.toLocaleString()}</span>
                        </div>
                      )}
                      {country.life_expectancy && (
                        <div className="flex justify-between items-center py-2 border-b border-muted/30">
                          <span className="text-muted-foreground font-medium">Life Expectancy:</span>
                          <span className="font-semibold">{country.life_expectancy} years</span>
                        </div>
                      )}
                      {country.human_development_index && (
                        <div className="flex justify-between items-center py-2">
                          <span className="text-muted-foreground font-medium">HDI:</span>
                          <span className="font-semibold">{country.human_development_index}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
