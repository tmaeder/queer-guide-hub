import { useState, useMemo, Suspense, lazy, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useOptimizedCountries, useOptimizedCities } from "@/hooks/useOptimizedPlaces";
import { useDirectory } from "@/hooks/useDirectory";
import { supabase } from "@/integrations/supabase/client";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { DirectorySearch, type DirectoryFilters } from "@/components/directory/DirectorySearch";
import { WeatherForecast } from "@/components/weather/WeatherForecast";
import { LocationInfo } from "@/components/location/LocationInfo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, MapPin, Building2, Users, Map, Crown } from "lucide-react";
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { useTheme } from '@mui/material/styles';

// Lazy load the map component
const ExploreMap = lazy(() => import("@/components/map/ExploreMap"));

type ViewMode = "overview" | "country" | "city" | "search";

export default function Directory() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { countries, loading: countriesLoading } = useOptimizedCountries();
  const { cities, loading: citiesLoading } = useOptimizedCities();
  const { fetchCitiesByCountry, searchLocations, findNearbyCities } = useDirectory();
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
  const [filters, setFilters] = useState<DirectoryFilters>({
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

  const handleFiltersChange = (newFilters: DirectoryFilters) => {
    setFilters(newFilters);
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
            <Globe style={{ width: 48, height: 48, margin: '0 auto' }} color="var(--mui-palette-primary-main)" opacity={0.6} />
          </Box>
          <Typography color="text.secondary">{t('directory.loading')}</Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box color="error.main">
            <MapPin style={{ width: 48, height: 48, margin: '0 auto' }} />
          </Box>
          <Typography color="error">{t('directory.error', { message: error })}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', transition: 'opacity 0.3s', opacity: isTransitioning ? 0.5 : 1 }}>
      {/* Hero Section */}
      <Box sx={{ position: 'relative', overflow: 'hidden' }}>
        <Container maxWidth="xl" sx={{ px: 3, py: { xs: 6, lg: 10 } }}>
          {/* Navigation Header */}
          <Box sx={{ mb: 4 }}>
            {viewMode !== "overview" && (
              <Box>
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  style={{ marginBottom: 16, transition: 'all 0.2s' }}
                >
                  <ArrowLeft style={{ width: 16, height: 16, marginRight: 8 }} />
                  {t('directory.back')}
                </Button>
              </Box>
            )}

            {/* Dynamic Title */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="h3" sx={{ fontWeight: 700, fontSize: { xs: '2.25rem', lg: '3rem' }, letterSpacing: '-0.025em' }}>
                {viewMode === "overview" && t('directory.title')}
                {viewMode === "country" && selectedCountry && (
                  <>Explore {selectedCountry.name}</>
                )}
                {viewMode === "city" && selectedCity && (
                  <>Discover {selectedCity.name}</>
                )}
                {viewMode === "search" && "Search Results"}
              </Typography>

              <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '42rem' }}>
                {viewMode === "overview" && "Discover amazing places around the world. Find countries, cities, and locations that match your interests."}
                {viewMode === "country" && selectedCountry && `Explore cities and regions in ${selectedCountry.name}. Find the perfect destination for your next adventure.`}
                {viewMode === "city" && selectedCity && `Everything you need to know about ${selectedCity.name}. Weather, demographics, and local insights.`}
                {viewMode === "search" && "Find exactly what you're looking for with our powerful search and filtering tools."}
              </Typography>
            </Box>
          </Box>

          {/* Enhanced Search */}
          <Box sx={{ mb: 4 }}>
            <DirectorySearch
              onSearch={handleSearch}
              onFiltersChange={handleFiltersChange}
              onNearMeSearch={handleNearMeSearch}
              placeholder="Search countries, cities, or regions..."
            />
          </Box>
        </Container>
      </Box>

      {/* Main Content Area */}
      <Container maxWidth="xl" sx={{ px: 3, pb: 6 }}>
        {/* Breadcrumb Navigation */}
        {viewMode !== "overview" && viewMode !== "search" && (
          <Box sx={{ mb: 3 }}>
            <Box component="nav" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}>
              <Box
                component="button"
                onClick={() => setViewMode("overview")}
                sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'action.hover' }, transition: 'colors', px: 1, py: 0.5, borderRadius: 1.5, cursor: 'pointer', border: 'none', background: 'none' }}
              >
                Directory
              </Box>
              {selectedCountry && (
                <>
                  <Typography component="span" sx={{ color: 'text.disabled' }}>/</Typography>
                  <Box
                    component="button"
                    onClick={() => setViewMode("country")}
                    sx={{ color: 'text.secondary', '&:hover': { color: 'text.primary', bgcolor: 'action.hover' }, transition: 'colors', px: 1, py: 0.5, borderRadius: 1.5, cursor: 'pointer', border: 'none', background: 'none' }}
                  >
                    {selectedCountry.name}
                  </Box>
                </>
              )}
              {selectedCity && (
                <>
                  <Typography component="span" sx={{ color: 'text.disabled' }}>/</Typography>
                  <Typography component="span" sx={{ px: 1, py: 0.5, fontWeight: 500 }}>{selectedCity.name}</Typography>
                </>
              )}
            </Box>
          </Box>
        )}

        {/* Content based on view mode */}
        <Box>
          {viewMode === "overview" && (
            <Tabs defaultValue="countries" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              {/* Enhanced Tab Navigation */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <TabsList>
                  <TabsTrigger value="countries">
                    <MapPin style={{ width: 16, height: 16 }} />
                    <span>Countries</span>
                  </TabsTrigger>
                  <TabsTrigger value="cities">
                    <Building2 style={{ width: 16, height: 16 }} />
                    <span>Cities</span>
                  </TabsTrigger>
                  <TabsTrigger value="map">
                    <Map style={{ width: 16, height: 16 }} />
                    <span>Map</span>
                  </TabsTrigger>
                </TabsList>

                {/* Stats Overview */}
                <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <MapPin style={{ width: 16, height: 16 }} />
                    <Typography component="span" variant="body2">{countries.length} countries</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 style={{ width: 16, height: 16 }} />
                    <Typography component="span" variant="body2">{cities.length} cities</Typography>
                  </Box>
                </Box>
              </Box>

              <TabsContent value="countries" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Section Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5">Explore Countries</Typography>
                    <Badge variant="secondary" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 }}>
                      {filteredCountries.length} found
                    </Badge>
                  </Box>
                </Box>

                {/* Countries Grid */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {loading ? (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Box key={i} sx={{ height: 128, bgcolor: 'action.hover', borderRadius: 2, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
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
                          {/* Continent Header */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
                                <Globe style={{ width: 20, height: 20, color: theme.palette.brand.main }} />
                              </Box>
                              <Box>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{continent.name}</Typography>
                                <Typography variant="body2" color="text.secondary">{continentCountries.length} countries to explore</Typography>
                              </Box>
                            </Box>
                          </Box>

                        {/* Countries Grid */}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2, pl: 3 }}>
                          {continentCountries.map((country, index) => (
                            <Box
                              key={country.id}
                              sx={{ animationDelay: `${index * 50}ms` }}
                            >
                              <DirectoryCard
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
                         sx={{ animationDelay: `${index * 50}ms` }}
                       >
                         <DirectoryCard
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

              <TabsContent value="cities" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Section Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5">Discover Cities</Typography>
                    <Badge variant="secondary" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 }}>
                      {filteredCities.length} found
                    </Badge>
                  </Box>
                </Box>

                {/* Cities by Continent */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {continents.map((continent) => {
                    const continentCountries = countries.filter(country =>
                      country.continent_id === continent.id
                    );

                    const continentCities = filteredCities.filter(city =>
                      continentCountries.some(country => country.id === city.country_id)
                    );

                    if (continentCities.length === 0) return null;

                    return (
                      <Box key={continent.id} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {/* Continent Header */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
                              <Globe style={{ width: 20, height: 20, color: theme.palette.brand.main }} />
                            </Box>
                            <Box>
                              <Typography variant="h6" sx={{ fontWeight: 600 }}>{continent.name}</Typography>
                              <Typography variant="body2" color="text.secondary">{continentCities.length} cities to discover</Typography>
                            </Box>
                          </Box>
                        </Box>

                        {/* Cities by Country */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pl: 3 }}>
                          {continentCountries.map((country) => {
                            const countryCities = filteredCities.filter(city =>
                              city.country_id === country.id
                            );

                            if (countryCities.length === 0) return null;

                            return (
                              <Box key={country.id} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {/* Country Header */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                  <MapPin style={{ width: 16, height: 16 }} color="var(--mui-palette-text-secondary)" />
                                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{country.name}</Typography>
                                  <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                                    {countryCities.length} cities
                                  </Badge>
                                </Box>

                                {/* Cities Grid */}
                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2, pl: 3 }}>
                                  {countryCities.map((city, index) => (
                                    <Box
                                      key={city.id}
                                      sx={{ animationDelay: `${index * 30}ms` }}
                                    >
                                      <DirectoryCard
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
                      </Box>
                    );
                  })}
                </Box>
              </TabsContent>

              <TabsContent value="map" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Section Header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5">Interactive World Map</Typography>
                    <Badge variant="secondary" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 }}>
                      {countries.length} countries, {cities.length} cities
                    </Badge>
                  </Box>
                </Box>

                {/* Map Container */}
                <Box sx={{ borderRadius: 3, overflow: 'hidden', border: 1, borderColor: 'divider', boxShadow: 3 }}>
                  <Suspense
                    fallback={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 384, bgcolor: 'action.hover' }}>
                        <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          <Map style={{ width: 48, height: 48, margin: '0 auto', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', color: '#999999' }} />
                          <Typography color="text.secondary">Loading interactive map...</Typography>
                        </Box>
                      </Box>
                    }
                  >
                    <ExploreMap
                      height={600}
                      defaultLayers={['cities', 'countries']}
                      showLayerToggles
                      showFilters={false}
                    />
                  </Suspense>
                </Box>
              </TabsContent>
            </Tabs>
          )}

          {viewMode === "country" && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Country Header */}
              <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>{selectedCountry?.name}</Typography>
                  <Badge variant="secondary" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 }}>
                    {countryCities.length} cities
                  </Badge>
                </Box>
                <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '42rem', mx: 'auto' }}>
                  Explore the diverse cities and regions of {selectedCountry?.name}.
                  Find your perfect destination with local insights and weather information.
                </Typography>
              </Box>

              {/* Country Information Grid */}
              <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 1fr' } }}>
                <Box style={{ height: 'fit-content' }}>
                  <LocationInfo
                    name={selectedCountry?.name}
                    type="country"
                  />
                </Box>

                <Box style={{ height: 'fit-content' }}>
                  <WeatherForecast
                    latitude={selectedCountry?.latitude}
                    longitude={selectedCountry?.longitude}
                    cityName={selectedCountry?.capital || selectedCountry?.name}
                  />
                </Box>
              </Box>

              {/* Cities Grid */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>Cities to Explore</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                  {countryCities.map((city, index) => (
                    <Box
                      key={city.id}
                      sx={{ animationDelay: `${index * 50}ms` }}
                    >
                      <DirectoryCard
                        type="city"
                        name={city.name}
                        data={city}
                        onClick={() => handleCityClick(city)}
                      />
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          )}

          {viewMode === "city" && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* City Hero Section */}
              <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="h3" sx={{ fontWeight: 700 }}>{selectedCity?.name}</Typography>
                    {selectedCity?.is_capital && (
                      <Badge variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Crown style={{ width: 12, height: 12 }} />
                        Capital
                      </Badge>
                    )}
                    {selectedCity?.is_major_city && (
                      <Badge variant="outline" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Building2 style={{ width: 12, height: 12 }} />
                        Major City
                      </Badge>
                    )}
                  </Box>

                  <Typography variant="h6" color="text.secondary" sx={{ maxWidth: '42rem', mx: 'auto' }}>
                    Discover everything about {selectedCity?.name}. Get local insights, weather updates, and essential information for your visit.
                  </Typography>
                </Box>

                {/* Quick Stats */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, flexWrap: 'wrap', fontSize: '0.875rem' }}>
                  {selectedCity?.region_name && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <MapPin style={{ width: 16, height: 16 }} color="var(--mui-palette-text-secondary)" />
                      <Typography component="span" variant="body2">{selectedCity.region_name}</Typography>
                    </Box>
                  )}
                  {selectedCity?.population && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Users style={{ width: 16, height: 16 }} color="var(--mui-palette-text-secondary)" />
                      <Typography component="span" variant="body2">{selectedCity.population.toLocaleString()} people</Typography>
                    </Box>
                  )}
                  {selectedCity?.timezone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Globe style={{ width: 16, height: 16 }} color="var(--mui-palette-text-secondary)" />
                      <Typography component="span" variant="body2">{selectedCity.timezone}</Typography>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* City Information Grid */}
              <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: '1fr 1fr' } }}>
                <Box style={{ height: 'fit-content' }}>
                  <LocationInfo
                    name={selectedCity?.name}
                    type="city"
                  />
                </Box>

                <Box style={{ height: 'fit-content' }}>
                  <WeatherForecast
                    latitude={selectedCity?.latitude}
                    longitude={selectedCity?.longitude}
                    cityName={selectedCity?.name}
                  />
                </Box>
              </Box>
            </Box>
          )}

          {viewMode === "search" && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Search Results Header */}
              <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>Search Results</Typography>
                <Typography color="text.secondary" sx={{ maxWidth: '42rem', mx: 'auto' }}>
                  Found {(searchResults.countries?.length || 0) + (searchResults.cities?.length || 0)} results matching your search criteria.
                </Typography>
              </Box>

              {/* Countries Results */}
              {searchResults.countries?.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <MapPin style={{ width: 20, height: 20 }} color="var(--mui-palette-primary-main)" />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Countries</Typography>
                    <Badge variant="secondary" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 }}>
                      {searchResults.countries.length} found
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                    {searchResults.countries.map((country: any, index: number) => (
                      <Box
                        key={country.id}
                        sx={{ animationDelay: `${index * 50}ms` }}
                      >
                        <DirectoryCard
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

              {/* Cities Results */}
              {searchResults.cities?.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Building2 style={{ width: 20, height: 20 }} color="var(--mui-palette-primary-main)" />
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Cities</Typography>
                    <Badge variant="secondary" style={{ paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 }}>
                      {searchResults.cities.length} found
                    </Badge>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)', xl: 'repeat(6, 1fr)' }, gap: 2 }}>
                    {searchResults.cities.map((city: any, index: number) => (
                      <Box
                        key={city.id}
                        sx={{ animationDelay: `${(searchResults.countries?.length || 0) * 50 + index * 50}ms` }}
                      >
                        <DirectoryCard
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

              {/* No Results State */}
              {(searchResults.countries?.length || 0) === 0 && (searchResults.cities?.length || 0) === 0 && (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ mx: 'auto', width: 64, height: 64, bgcolor: 'action.hover', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MapPin style={{ width: 32, height: 32 }} color="var(--mui-palette-text-secondary)" />
                    </Box>
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>No results found</Typography>
                      <Typography color="text.secondary" sx={{ maxWidth: '28rem', mx: 'auto' }}>
                        Try adjusting your search terms or explore our featured locations above.
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
}
