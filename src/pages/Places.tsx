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
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
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
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
            <Globe style={{ height: 48, width: 48, margin: '0 auto', color: '#555555', opacity: 0.6 }} />
          </Box>
          <Typography sx={{ color: 'var(--muted-foreground)' }}>Loading places...</Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ color: 'error.main' }}>
            <MapPin style={{ height: 48, width: 48, margin: '0 auto' }} />
          </Box>
          <Typography sx={{ color: 'error.main' }}>Something went wrong while loading places. Please try again later.</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', transition: 'opacity 300ms', opacity: isTransitioning ? 0.5 : 1 }}>
      {/* Hero Section */}
      <Box sx={{ mx: 'auto', maxWidth: 1280, px: 3, pt: { xs: 3, lg: 5 }, pb: 2 }}>
        <Box sx={{ bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider', p: { xs: 3, lg: 4 }, mb: 3 }}>
          {/* Navigation Header */}
          <Box sx={{ mb: 3 }}>
            {viewMode !== "overview" && (
              <Box className="animate-fade-in">
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  sx={{ mb: 2, '&:hover': { bgcolor: 'action.hover' }, transition: 'all 200ms' }}
                >
                  <ArrowLeft style={{ height: 16, width: 16, marginRight: 8 }} />
                  Back
                </Button>
              </Box>
            )}

            {/* Dynamic Title */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="h3" sx={{ fontSize: { xs: '2.25rem', lg: '3rem' }, fontWeight: 700, letterSpacing: '-0.025em', color: 'text.primary' }}>
                {viewMode === "overview" && "Explore Places"}
                {viewMode === "country" && selectedCountry && (
                  <>Explore {selectedCountry.name}</>
                )}
                {viewMode === "city" && selectedCity && (
                  <>Discover {selectedCity.name}</>
                )}
                {viewMode === "search" && "Search Results"}
              </Typography>

              <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary', maxWidth: 672 }}>
                {viewMode === "overview" && "Discover amazing places around the world. Find countries, cities, and locations that match your interests."}
                {viewMode === "country" && selectedCountry && `Explore cities and regions in ${selectedCountry.name}. Find the perfect destination for your next adventure.`}
                {viewMode === "city" && selectedCity && `Everything you need to know about ${selectedCity.name}. Weather, demographics, and local insights.`}
                {viewMode === "search" && "Find exactly what you're looking for with our powerful search and filtering tools."}
              </Typography>
            </Box>
          </Box>

          {/* Enhanced Search */}
          <PlacesSearch
            onSearch={handleSearch}
            onFiltersChange={handleFiltersChange}
            onNearMeSearch={handleNearMeSearch}
            placeholder="Search countries, cities, or regions..."
          />
        </Box>
      </Box>

      {/* Main Content Area */}
      <Box sx={{ mx: 'auto', maxWidth: 1280, px: 3, pb: 6 }}>
        {/* Breadcrumb Navigation */}
        {viewMode !== "overview" && viewMode !== "search" && (
          <Box sx={{ mb: 3 }} className="animate-fade-in">
            <Box component="nav" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
              <Box
                component="button"
                onClick={() => setViewMode("overview")}
                sx={{ color: 'var(--muted-foreground)', '&:hover': { color: 'var(--foreground)', bgcolor: 'rgba(var(--accent), 0.5)' }, transition: 'color 150ms', px: 1, py: 0.5, borderRadius: 1, border: 'none', bgcolor: 'transparent', cursor: 'pointer' }}
              >
                Places
              </Box>
              {selectedCountry && (
                <>
                  <Box component="span" sx={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>/</Box>
                  <Box
                    component="button"
                    onClick={() => setViewMode("country")}
                    sx={{ color: 'var(--muted-foreground)', '&:hover': { color: 'var(--foreground)', bgcolor: 'rgba(var(--accent), 0.5)' }, transition: 'color 150ms', px: 1, py: 0.5, borderRadius: 1, border: 'none', bgcolor: 'transparent', cursor: 'pointer' }}
                  >
                    {selectedCountry.name}
                  </Box>
                </>
              )}
              {selectedCity && (
                <>
                  <Box component="span" sx={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>/</Box>
                  <Box component="span" sx={{ color: 'var(--foreground)', fontWeight: 500, px: 1, py: 0.5 }}>{selectedCity.name}</Box>
                </>
              )}
            </Box>
          </Box>
        )}

        {/* Content based on view mode */}
        <Box className="animate-fade-in">
          {viewMode === "overview" && (
            <Tabs defaultValue="countries" sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Enhanced Tab Navigation */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <TabsList sx={{ display: 'grid', width: '100%', maxWidth: 448, gridTemplateColumns: 'repeat(3, 1fr)', bgcolor: 'rgba(var(--muted), 0.5)' }}>
                  <TabsTrigger
                    value="countries"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'rgba(var(--background), 0.8)', boxShadow: 1 }, transition: 'all 150ms' }}
                  >
                    <MapPin style={{ height: 16, width: 16 }} />
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Countries</Box>
                  </TabsTrigger>
                  <TabsTrigger
                    value="cities"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'rgba(var(--background), 0.8)', boxShadow: 1 }, transition: 'all 150ms' }}
                  >
                    <Building2 style={{ height: 16, width: 16 }} />
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Cities</Box>
                  </TabsTrigger>
                  <TabsTrigger
                    value="map"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, '&[data-state=active]': { bgcolor: 'rgba(var(--background), 0.8)', boxShadow: 1 }, transition: 'all 150ms' }}
                  >
                    <Map style={{ height: 16, width: 16 }} />
                    <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Map</Box>
                  </TabsTrigger>
                </TabsList>

                {/* Stats Overview */}
                <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2, fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <MapPin style={{ height: 16, width: 16 }} />
                    <span>{countries.length} countries</span>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 style={{ height: 16, width: 16 }} />
                    <span>{cities.length} cities</span>
                  </Box>
                </Box>
              </Box>

              <TabsContent value="countries" className="animate-fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Explore Countries</Typography>
                    <Badge variant="secondary" sx={{ px: 1.5, py: 0.5, fontWeight: 500 }}>
                      {filteredCountries.length} found
                    </Badge>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {loading ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Box key={i} sx={{ height: 128, bgcolor: 'rgba(var(--muted), 0.5)', borderRadius: 2, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                      ))}
                    </Box>
                  ) : continents.length > 0 ? (
                    continents.map((continent) => {
                      const continentCountries = filteredCountries.filter(country =>
                        country.continent_id === continent.id
                      );

                      if (continentCountries.length === 0) return null;

                      return (
                        <Box key={continent.id} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(var(--muted), 0.4)' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.06)' }}>
                                <Globe style={{ height: 20, width: 20, color: '#333333' }} />
                              </Box>
                              <Box>
                                <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{continent.name}</Typography>
                                <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>{continentCountries.length} countries to explore</Typography>
                              </Box>
                            </Box>
                          </Box>

                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2, pl: 3 }}>
                            {continentCountries.map((country, index) => (
                              <Box
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
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      );
                    })
                  ) : (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                      {filteredCountries.map((country, index) => (
                        <Box
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
                        </Box>
                      ))}
                    </Box>
                  )}
                </Box>
              </TabsContent>

              <TabsContent value="cities" className="animate-fade-in" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Discover Cities</Typography>
                    <Badge variant="secondary" sx={{ px: 1.5, py: 0.5, fontWeight: 500 }}>
                      {filteredCities.length} found
                    </Badge>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {continents.map((continent) => {
                    const continentCountries = countries.filter(country =>
                      country.continent_id === continent.id
                    );

                    const continentCities = filteredCities.filter(city => {
                      return continentCountries.some(country => country.id === city.country_id);
                    });

                    if (continentCities.length === 0) return null;

                    return (
                      <Box key={continent.id} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'rgba(var(--muted), 0.4)' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.06)' }}>
                              <Building2 style={{ height: 20, width: 20, color: '#333333' }} />
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>{continent.name}</Typography>
                              <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>{continentCities.length} cities to discover</Typography>
                            </Box>
                          </Box>
                        </Box>

                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2, pl: 3 }}>
                          {continentCities.map((city, index) => (
                            <Box
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
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </TabsContent>

              <TabsContent value="map" className="animate-fade-in">
                <Suspense
                  fallback={
                    <Box sx={{ height: 600, bgcolor: 'rgba(var(--muted), 0.5)', borderRadius: 2, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Map style={{ height: 32, width: 32, margin: '0 auto', color: 'var(--muted-foreground)' }} />
                        <Typography variant="body2" sx={{ color: 'var(--muted-foreground)' }}>Loading map...</Typography>
                      </Box>
                    </Box>
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <PlacesCard
                  type="country"
                  name={selectedCountry.name}
                  data={selectedCountry}
                />

                {selectedCountry.latitude && selectedCountry.longitude && (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                    <LocationInfo
                      name={selectedCountry.name}
                      type="country"
                    />
                    <WeatherForecast
                      latitude={selectedCountry.latitude}
                      longitude={selectedCountry.longitude}
                      cityName={selectedCountry.capital || selectedCountry.name}
                    />
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>Cities in {selectedCountry.name}</Typography>
                  <Badge variant="secondary" sx={{ px: 1.5, py: 0.5, fontWeight: 500 }}>
                    {countryCities.length} cities
                  </Badge>
                </Box>

                {countryCities.length > 0 ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                    {countryCities.map((city, index) => (
                      <Box
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
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 6, color: 'var(--muted-foreground)' }}>
                    <Building2 style={{ height: 48, width: 48, margin: '0 auto 16px', opacity: 0.5 }} />
                    <Typography>No cities found in this country</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* City View */}
          {viewMode === "city" && selectedCity && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <PlacesCard
                type="city"
                name={selectedCity.name}
                data={selectedCity}
              />

              {selectedCity.latitude && selectedCity.longitude && (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                  <LocationInfo
                    name={selectedCity.name}
                    type="city"
                  />
                  <WeatherForecast
                    latitude={selectedCity.latitude}
                    longitude={selectedCity.longitude}
                    cityName={selectedCity.name}
                  />
                </Box>
              )}
            </Box>
          )}

          {/* Search Results */}
          {viewMode === "search" && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {searchResults.countries?.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Countries</Typography>
                    <Badge variant="secondary" sx={{ px: 1.5, py: 0.5, fontWeight: 500 }}>
                      {searchResults.countries.length} found
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                    {searchResults.countries.map((country: any, index: number) => (
                      <Box
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
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {searchResults.cities?.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Cities</Typography>
                    <Badge variant="secondary" sx={{ px: 1.5, py: 0.5, fontWeight: 500 }}>
                      {searchResults.cities.length} found
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                    {searchResults.cities.map((city: any, index: number) => (
                      <Box
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
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {(!searchResults.countries?.length && !searchResults.cities?.length) && (
                <Box sx={{ textAlign: 'center', py: 6, color: 'var(--muted-foreground)' }}>
                  <Globe style={{ height: 48, width: 48, margin: '0 auto 16px', opacity: 0.5 }} />
                  <Typography>No places found matching your search</Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
