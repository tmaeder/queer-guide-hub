import { useState, useMemo, Suspense, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useOptimizedCountries, useOptimizedCities } from "@/hooks/useOptimizedPlaces";
import { usePlaces } from "@/hooks/usePlaces";
import { supabase } from "@/integrations/supabase/client";
import { PlacesCard } from "@/components/places/PlacesCard";
import { PlacesSearch, type PlacesFilters } from "@/components/places/PlacesSearch";
import { WeatherForecast } from "@/components/weather/WeatherForecast";
import { LocationInfo } from "@/components/location/LocationInfo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, MapPin, Building2, Users, Map, Crown } from "lucide-react";

// Lazy load the map component
const PlacesMapView = lazy(() => import("@/components/places/PlacesMapView").then(m => ({ default: m.PlacesMapView })));

type ViewMode = "overview" | "country" | "city" | "search";

export default function Places() {
  const { t } = useTranslation();
  const { countries, loading: countriesLoading } = useOptimizedCountries();
  const { cities, loading: citiesLoading } = useOptimizedCities();
  const { fetchCitiesByCountry, searchLocations, findNearbyCities } = usePlaces();
  const loading = countriesLoading || citiesLoading;
  const error = null;
  
  // Fetch continents for grouping countries
  const [continents, setContinents] = useState<any[]>([]);
  
  useEffect(() => {
    const fetchContinents = async () => {
      try {
        const { data: continentsData, error } = await supabase
          .from('continents')
          .select('*')
          .order('name');
        
        if (error) throw error;
        setContinents(continentsData || []);
      } catch (error) {
        console.error('Error fetching continents:', error);
      }
    };
    
    fetchContinents();
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [selectedCity, setSelectedCity] = useState<any>(null);
  const [countryCities, setCountryCities] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any>({ countries: [], cities: [] });
  const [filters, setFilters] = useState<PlacesFilters>({
    continent: "all",
    populationRange: "all",
    isCapital: "all",
    isMajorCity: "all",
    sortBy: "name",
    sortOrder: "asc"
  });

  // Animation states for better UX
  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleCityClick = (city: any) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedCity(city);
      setViewMode("city");
      setIsTransitioning(false);
    }, 150);
  };

  const handleCountryClick = async (country: any) => {
    setIsTransitioning(true);
    setTimeout(async () => {
      setSelectedCountry(country);
      setViewMode("country");
      const cities = await fetchCitiesByCountry(country.id);
      setCountryCities(cities);
      setIsTransitioning(false);
    }, 150);
  };

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      const results = await searchLocations(query);
      setSearchResults(results);
      setViewMode("search");
    } else {
      setViewMode("overview");
      setSearchResults({ continents: [], countries: [], cities: [] });
    }
  };

  const handleFiltersChange = (newFilters: PlacesFilters) => {
    setFilters(newFilters);
    // You can implement filter logic here when needed
  };

  const handleNearMeSearch = async (userLocation: { latitude: number; longitude: number }) => {
    const nearbyCities = await findNearbyCities(userLocation);
    setSearchResults({ countries: [], cities: nearbyCities });
    setViewMode("search");
  };

  // Memoized filter logic for performance
  const filteredCountries = useMemo(() => {
    let result = countries;
    
    if (filters.continent !== "all") {
      result = result.filter(country => country.continent_id === filters.continent);
    }
    
    if (filters.populationRange !== "all") {
      const [min, max] = filters.populationRange.split('-').map(Number);
      result = result.filter(country => {
        const pop = country.population || 0;
        return pop >= min && (max ? pop <= max : true);
      });
    }
    
    return result.sort((a, b) => {
      const field = filters.sortBy === 'name' ? 'name' : 'population';
      const aVal = a[field] || (field === 'name' ? '' : 0);
      const bVal = b[field] || (field === 'name' ? '' : 0);
      
      return filters.sortOrder === 'asc' 
        ? aVal > bVal ? 1 : -1
        : aVal < bVal ? 1 : -1;
    });
  }, [countries, filters]);

  const filteredCities = useMemo(() => {
    let result = cities;
    
    if (filters.isMajorCity !== "all") {
      result = result.filter(city => 
        filters.isMajorCity === "true" ? city.is_major_city : !city.is_major_city
      );
    }
    
    if (filters.isCapital !== "all") {
      result = result.filter(city => 
        filters.isCapital === "true" ? city.is_capital : !city.is_capital
      );
    }
    
    return result.sort((a, b) => {
      const field = filters.sortBy === 'name' ? 'name' : 'population';
      const aVal = a[field] || (field === 'name' ? '' : 0);
      const bVal = b[field] || (field === 'name' ? '' : 0);
      
      return filters.sortOrder === 'asc' 
        ? aVal > bVal ? 1 : -1
        : aVal < bVal ? 1 : -1;
    });
  }, [cities, filters]);

  const handleBack = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      if (viewMode === "city") {
        setViewMode("country");
      } else if (viewMode === "country" || viewMode === "search") {
        setViewMode("overview");
      }
      setIsTransitioning(false);
    }, 150);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-pulse">
            <Globe className="h-12 w-12 mx-auto text-primary/60" />
          </div>
          <p className="text-muted-foreground">Loading places...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-destructive">
            <MapPin className="h-12 w-12 mx-auto" />
          </div>
          <p className="text-destructive">Error loading places</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full transition-opacity duration-300 ${isTransitioning ? 'opacity-50' : 'opacity-100'}`}>
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="relative mx-auto max-w-7xl px-6 py-12 lg:py-20">
          {/* Navigation Header */}
          <div className="mb-8">
            {viewMode !== "overview" && (
              <div className="animate-fade-in">
                <Button 
                  variant="ghost" 
                  onClick={handleBack}
                  className="mb-4 hover:bg-accent/50 transition-all duration-200"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
            )}
            
            {/* Dynamic Title */}
            <div className="space-y-3">
              <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                {viewMode === "overview" && "Explore Places"}
                {viewMode === "country" && selectedCountry && (
                  <>Explore {selectedCountry.name}</>
                )}
                {viewMode === "city" && selectedCity && (
                  <>Discover {selectedCity.name}</>
                )}
                {viewMode === "search" && "Search Results"}
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-2xl">
                {viewMode === "overview" && "Discover amazing places around the world. Find countries, cities, and locations that match your interests."}
                {viewMode === "country" && selectedCountry && `Explore cities and regions in ${selectedCountry.name}. Find the perfect destination for your next adventure.`}
                {viewMode === "city" && selectedCity && `Everything you need to know about ${selectedCity.name}. Weather, demographics, and local insights.`}
                {viewMode === "search" && "Find exactly what you're looking for with our powerful search and filtering tools."}
              </p>
            </div>
          </div>
          
          {/* Enhanced Search */}
          <div className="mb-8">
            <PlacesSearch 
              onSearch={handleSearch} 
              onFiltersChange={handleFiltersChange} 
              onNearMeSearch={handleNearMeSearch}
              placeholder="Search countries, cities, or regions..."
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="mx-auto max-w-7xl px-6 pb-12">
        {/* Breadcrumb Navigation */}
        {viewMode !== "overview" && viewMode !== "search" && (
          <div className="mb-6 animate-fade-in">
            <nav className="flex items-center gap-2 text-sm">
              <button 
                onClick={() => setViewMode("overview")} 
                className="text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/50"
              >
                Places
              </button>
              {selectedCountry && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <button 
                    onClick={() => setViewMode("country")} 
                    className="text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent/50"
                  >
                    {selectedCountry.name}
                  </button>
                </>
              )}
              {selectedCity && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-foreground font-medium px-2 py-1">{selectedCity.name}</span>
                </>
              )}
            </nav>
          </div>
        )}

        {/* Content based on view mode */}
        <div className="animate-fade-in">
          {viewMode === "overview" && (
            <Tabs defaultValue="countries" className="space-y-8">
              {/* Enhanced Tab Navigation */}
              <div className="flex items-center justify-between">
                <TabsList className="grid w-full max-w-md grid-cols-3 bg-muted/50">
                  <TabsTrigger 
                    value="countries" 
                    className="flex items-center gap-2 data-[state=active]:bg-background/80 data-[state=active]:shadow-sm transition-all"
                  >
                    <MapPin className="h-4 w-4" />
                    <span className="hidden sm:inline">Countries</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="cities" 
                    className="flex items-center gap-2 data-[state=active]:bg-background/80 data-[state=active]:shadow-sm transition-all"
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Cities</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="map" 
                    className="flex items-center gap-2 data-[state=active]:bg-background/80 data-[state=active]:shadow-sm transition-all"
                  >
                    <Map className="h-4 w-4" />
                    <span className="hidden sm:inline">Map</span>
                  </TabsTrigger>
                </TabsList>
                
                {/* Stats Overview */}
                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>{countries.length} countries</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    <span>{cities.length} cities</span>
                  </div>
                </div>
              </div>

              <TabsContent value="countries" className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-semibold">Explore Countries</h2>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {filteredCountries.length} found
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-10">
                  {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="h-32 bg-muted/50 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : continents.length > 0 ? (
                    continents.map((continent) => {
                      const continentCountries = filteredCountries.filter(country => 
                        country.continent_id === continent.id
                      );
                      
                      if (continentCountries.length === 0) return null;
                      
                      return (
                        <div key={continent.id} className="group space-y-6">
                          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/40">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-lg bg-primary/10">
                                <Globe className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold">{continent.name}</h3>
                                <p className="text-sm text-muted-foreground">{continentCountries.length} countries to explore</p>
                              </div>
                            </div>
                          </div>
                        
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 pl-6">
                            {continentCountries.map((country, index) => (
                              <div
                                key={country.id}
                                className="animate-fade-in"
                                style={{ animationDelay: `${index * 50}ms` }}
                              >
                                <PlacesCard
                                  type="country"
                                  name={country.name}
                                  data={country}
                                  onClick={() => handleCountryClick(country)}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                      {filteredCountries.map((country, index) => (
                        <div
                          key={country.id}
                          className="animate-fade-in"
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <PlacesCard
                            type="country"
                            name={country.name}
                            data={country}
                            onClick={() => handleCountryClick(country)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="cities" className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-semibold">Discover Cities</h2>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {filteredCities.length} found
                    </Badge>
                  </div>
                </div>
                
                <div className="space-y-10">
                  {continents.map((continent) => {
                    const continentCountries = countries.filter(country => 
                      country.continent_id === continent.id
                    );
                    
                    const continentCities = filteredCities.filter(city => {
                      return continentCountries.some(country => country.id === city.country_id);
                    });
                    
                    if (continentCities.length === 0) return null;
                    
                    return (
                      <div key={continent.id} className="space-y-6">
                        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/40">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold">{continent.name}</h3>
                              <p className="text-sm text-muted-foreground">{continentCities.length} cities to discover</p>
                            </div>
                          </div>
                        </div>
                      
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 pl-6">
                          {continentCities.map((city, index) => (
                            <div
                              key={city.id}
                              className="animate-fade-in"
                              style={{ animationDelay: `${index * 50}ms` }}
                            >
                              <PlacesCard
                                type="city"
                                name={city.name}
                                data={city}
                                onClick={() => handleCityClick(city)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="map" className="animate-fade-in">
                <Suspense
                  fallback={
                    <div className="h-[600px] bg-muted/50 rounded-lg animate-pulse flex items-center justify-center">
                      <div className="text-center space-y-2">
                        <Map className="h-8 w-8 mx-auto text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Loading map...</p>
                      </div>
                    </div>
                  }
                >
                  <PlacesMapView
                    countries={countries}
                    cities={cities}
                    loading={loading}
                    onCountryClick={handleCountryClick}
                    onCityClick={handleCityClick}
                  />
                </Suspense>
              </TabsContent>
            </Tabs>
          )}

          {/* Country View */}
          {viewMode === "country" && selectedCountry && (
            <div className="space-y-8">
              <div className="space-y-6">
                <PlacesCard
                  type="country"
                  name={selectedCountry.name}
                  data={selectedCountry}
                />
                
                {selectedCountry.latitude && selectedCountry.longitude && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <LocationInfo
                      name={selectedCountry.name}
                      type="country"
                    />
                    <WeatherForecast
                      latitude={selectedCountry.latitude}
                      longitude={selectedCountry.longitude}
                      cityName={selectedCountry.capital || selectedCountry.name}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-semibold">Cities in {selectedCountry.name}</h2>
                  <Badge variant="secondary" className="px-3 py-1 font-medium">
                    {countryCities.length} cities
                  </Badge>
                </div>
                
                {countryCities.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {countryCities.map((city, index) => (
                      <div
                        key={city.id}
                        className="animate-fade-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <PlacesCard
                          type="city"
                          name={city.name}
                          data={city}
                          onClick={() => handleCityClick(city)}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No cities found in this country</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* City View */}
          {viewMode === "city" && selectedCity && (
            <div className="space-y-8">
              <PlacesCard
                type="city"
                name={selectedCity.name}
                data={selectedCity}
              />
              
              {selectedCity.latitude && selectedCity.longitude && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <LocationInfo
                    name={selectedCity.name}
                    type="city"
                  />
                  <WeatherForecast
                    latitude={selectedCity.latitude}
                    longitude={selectedCity.longitude}
                    cityName={selectedCity.name}
                  />
                </div>
              )}
            </div>
          )}

          {/* Search Results */}
          {viewMode === "search" && (
            <div className="space-y-8">
              {searchResults.countries?.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-semibold">Countries</h2>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {searchResults.countries.length} found
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {searchResults.countries.map((country: any, index: number) => (
                      <div
                        key={country.id}
                        className="animate-fade-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <PlacesCard
                          type="country"
                          name={country.name}
                          data={country}
                          onClick={() => handleCountryClick(country)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.cities?.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-semibold">Cities</h2>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {searchResults.cities.length} found
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    {searchResults.cities.map((city: any, index: number) => (
                      <div
                        key={city.id}
                        className="animate-fade-in"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <PlacesCard
                          type="city"
                          name={city.name}
                          data={city}
                          onClick={() => handleCityClick(city)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!searchResults.countries?.length && !searchResults.cities?.length) && (
                <div className="text-center py-12 text-muted-foreground">
                  <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No places found matching your search</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}