import { useState, useMemo, Suspense, lazy, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useOptimizedCountries,
  useOptimizedCities,
  fetchCitiesByCountry,
  searchLocations,
  findNearbyCities,
} from '@/hooks/useOptimizedPlaces';
import { useQueerVillages } from '@/hooks/useQueerVillages';
import { useContinents } from '@/hooks/useContinents';
import { PlacesCard } from '@/components/places/PlacesCard';
import { VillageCard } from '@/components/villages/VillageCard';
import { PlacesSearch, type PlacesFilters } from '@/components/places/PlacesSearch';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { LocationInfo } from '@/components/location/LocationInfo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { ArrowLeft, Globe, MapPin, Building2, Map as MapIcon, Landmark, ChevronDown, ChevronUp } from 'lucide-react';
import { PersonalizedFeed } from '@/components/personalization/PersonalizedFeed';

// Lazy load the map component
const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

// Extracted style constants to avoid creating new objects on every render
const ICON_SM: React.CSSProperties = { height: 16, width: 16 };
const ICON_MD: React.CSSProperties = { height: 20, width: 20 };
const ICON_XL: React.CSSProperties = { height: 48, width: 48, margin: '0 auto 16px', color: 'hsl(var(--muted-foreground))' };
const BACK_BTN_STYLE: React.CSSProperties = { marginBottom: 16, transition: 'all 200ms' };
const BACK_ICON_STYLE: React.CSSProperties = { height: 16, width: 16, marginRight: 8 };
const TABS_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32 };
const TABS_LIST_STYLE: React.CSSProperties = { display: 'grid', width: '100%', maxWidth: 600, gridTemplateColumns: 'repeat(4, 1fr)' };
const TAB_CONTENT_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24 };
const BADGE_STYLE: React.CSSProperties = { paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 };
const MAP_ICON_STYLE: React.CSSProperties = { height: 32, width: 32, margin: '0 auto', color: 'text.secondary' };
const COLLAPSED_COUNT = 6;

type ViewMode = 'overview' | 'country' | 'city' | 'search';

export default function Places() {
  const { _t } = useTranslation();
  const { countries, loading: countriesLoading, error: countriesError } = useOptimizedCountries();
  const { cities, loading: citiesLoading, error: citiesError } = useOptimizedCities();
  // fetchCitiesByCountry, searchLocations, findNearbyCities imported as standalone functions
  const { villages, loading: villagesLoading } = useQueerVillages(true);
  const loading = countriesLoading || citiesLoading;
  const error = countriesError || citiesError || null;

  // Local loading timeout tracker
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) {
      loadingTimerRef.current = setTimeout(() => setLoadingTimedOut(true), 10000);
    } else {
      setLoadingTimedOut(false);
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    }
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [loading]);

  // Fetch continents for grouping countries (DUP-4)
  const { data: continents = [] } = useContinents();

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedCountry, setSelectedCountry] = useState<Record<string, unknown> | null>(null);
  const [selectedCity, setSelectedCity] = useState<Record<string, unknown> | null>(null);
  const [countryCities, setCountryCities] = useState<Record<string, unknown>[]>([]);
  const [searchResults, setSearchResults] = useState<{ countries: Record<string, unknown>[]; cities: Record<string, unknown>[] }>({ countries: [], cities: [] });
  const [filters, setFilters] = useState<PlacesFilters>({
    continent: 'all',
    populationRange: 'all',
    isCapital: 'all',
    isMajorCity: 'all',
    sortBy: 'population',
    sortOrder: 'desc',
  });

  const [expandedContinents, setExpandedContinents] = useState<Record<string, boolean>>({});
  const toggleContinent = (id: string) => {
    setExpandedContinents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [expandedCityContinents, setExpandedCityContinents] = useState<Record<string, boolean>>({});
  const toggleCityContinent = (id: string) => {
    setExpandedCityContinents(prev => ({ ...prev, [id]: !prev[id] }));
  };
  const [expandedCityCountries, setExpandedCityCountries] = useState<Record<string, boolean>>({});
  const toggleCityCountry = (id: string) => {
    setExpandedCityCountries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Animation states for better UX
  const [_isTransitioning, setIsTransitioning] = useState(false);

  const handleCityClick = (city: Record<string, unknown>) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedCity(city);
      setViewMode('city');
      setIsTransitioning(false);
    }, 150);
  };

  const handleCountryClick = async (country: Record<string, unknown>) => {
    setIsTransitioning(true);
    setTimeout(async () => {
      setSelectedCountry(country);
      setViewMode('country');
      const cities = await fetchCitiesByCountry(country.id);
      setCountryCities(cities);
      setIsTransitioning(false);
    }, 150);
  };

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      const results = await searchLocations(query);
      setSearchResults(results);
      setViewMode('search');
    } else {
      setViewMode('overview');
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
    setViewMode('search');
  };

  // Memoized filter logic for performance
  const filteredCountries = useMemo(() => {
    let result = countries;

    if (filters.continent !== 'all') {
      result = result.filter((country) => country.continent_id === filters.continent);
    }

    if (filters.populationRange !== 'all') {
      const [min, max] = filters.populationRange.split('-').map(Number);
      result = result.filter((country) => {
        const pop = country.population || 0;
        return pop >= min && (max ? pop <= max : true);
      });
    }

    return result.sort((a, b) => {
      const field = filters.sortBy === 'name' ? 'name' : 'population';
      const aVal = a[field] || (field === 'name' ? '' : 0);
      const bVal = b[field] || (field === 'name' ? '' : 0);

      return filters.sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1;
    });
  }, [countries, filters]);

  const filteredCities = useMemo(() => {
    let result = cities;

    if (filters.isMajorCity !== 'all') {
      result = result.filter((city) =>
        filters.isMajorCity === 'true' ? city.is_major_city : !city.is_major_city,
      );
    }

    if (filters.isCapital !== 'all') {
      result = result.filter((city) =>
        filters.isCapital === 'true' ? city.is_capital : !city.is_capital,
      );
    }

    return result.sort((a, b) => {
      const field = filters.sortBy === 'name' ? 'name' : 'population';
      const aVal = a[field] || (field === 'name' ? '' : 0);
      const bVal = b[field] || (field === 'name' ? '' : 0);

      return filters.sortOrder === 'asc' ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1;
    });
  }, [cities, filters]);

  const citiesByContinent = useMemo(() => {
    return continents.map((continent) => {
      const cCountries = countries.filter(c => c.continent_id === continent.id);
      const cCities = filteredCities.filter(city =>
        cCountries.some(country => country.id === city.country_id)
      );
      const countriesWithCities = cCountries
        .filter(country => cCities.some(city => city.country_id === country.id))
        .map(country => ({
          ...country,
          cities: cCities.filter(city => city.country_id === country.id),
        }))
        .sort((a, b) => ((a.name as string) > (b.name as string) ? 1 : -1));
      return { continent, totalCities: cCities.length, countries: countriesWithCities };
    }).filter(g => g.totalCities > 0);
  }, [continents, countries, filteredCities]);

  const handleBack = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      if (viewMode === 'city') {
        setViewMode('country');
      } else if (viewMode === 'country' || viewMode === 'search') {
        setViewMode('overview');
      }
      setIsTransitioning(false);
    }, 150);
  };

  if (loading) {
    return (
      <Container sx={{ py: { xs: 6, md: 10 } }}>
        <PageLoadingState count={8} />
        {loadingTimedOut && (
          <Box sx={{ mt: 3 }}>
            <LoadingTimeout onRetry={() => window.location.reload()} />
          </Box>
        )}
      </Container>
    );
  }

  if (error) {
    return (
      <Box
        sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Box sx={{ maxWidth: 480, mx: 'auto' }}>
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Hero Section */}
      <Container sx={{ pt: { xs: 6, md: 10 }, pb: 2 }}>
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 2,
            p: { xs: 3, lg: 4 },
            mb: 3,
          }}
        >
          {/* Navigation Header */}
          <Box sx={{ mb: 3 }}>
            {viewMode !== 'overview' && (
              <Box>
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  style={BACK_BTN_STYLE}
                >
                  <ArrowLeft style={BACK_ICON_STYLE} />
                  Back
                </Button>
              </Box>
            )}

            {/* Dynamic Title */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography
                variant="h3"
                sx={{
                  fontSize: { xs: '2.25rem', lg: '3rem' },
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                  color: 'text.primary',
                }}
              >
                {viewMode === 'overview' && 'Explore Places'}
                {viewMode === 'country' && selectedCountry && <>Explore {selectedCountry.name}</>}
                {viewMode === 'city' && selectedCity && <>Discover {selectedCity.name}</>}
                {viewMode === 'search' && 'Search Results'}
              </Typography>

              <Typography sx={{ fontSize: '1.125rem', color: 'text.secondary' }}>
                {viewMode === 'overview' &&
                  'Discover amazing places around the world. Find countries, cities, and locations that match your interests.'}
                {viewMode === 'country' &&
                  selectedCountry &&
                  `Explore cities and regions in ${selectedCountry.name}. Find the perfect destination for your next adventure.`}
                {viewMode === 'city' &&
                  selectedCity &&
                  `Everything you need to know about ${selectedCity.name}. Weather, demographics, and local insights.`}
                {viewMode === 'search' &&
                  "Find exactly what you're looking for with our powerful search and filtering tools."}
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
      </Container>

      {/* Personalized Recommendations (overview only) */}
      {viewMode === 'overview' && (
        <Container sx={{ pb: 0 }}>
          <PersonalizedFeed />
        </Container>
      )}

      {/* Main Content Area */}
      <Container sx={{ pb: 6 }}>
        {/* Breadcrumb Navigation */}
        {viewMode !== 'overview' && viewMode !== 'search' && (
          <Box sx={{ mb: 3 }}>
            <Box
              component="nav"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem' }}
            >
              <Box
                component="button"
                onClick={() => setViewMode('overview')}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
                  transition: 'color 150ms',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  border: 'none',
                  bgcolor: 'background.paper',
                  cursor: 'pointer',
                }}
              >
                Places
              </Box>
              {selectedCountry && (
                <>
                  <Box component="span" sx={{ color: 'text.disabled' }}>
                    /
                  </Box>
                  <Box
                    component="button"
                    onClick={() => setViewMode('country')}
                    sx={{
                      color: 'text.secondary',
                      '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
                      transition: 'color 150ms',
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      border: 'none',
                      bgcolor: 'background.paper',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedCountry.name}
                  </Box>
                </>
              )}
              {selectedCity && (
                <>
                  <Box component="span" sx={{ color: 'text.disabled' }}>
                    /
                  </Box>
                  <Box
                    component="span"
                    sx={{ color: 'text.primary', fontWeight: 500, px: 1, py: 0.5 }}
                  >
                    {selectedCity.name}
                  </Box>
                </>
              )}
            </Box>
          </Box>
        )}

        {/* Content based on view mode */}
        <Box>
          {viewMode === 'overview' && (
            <Tabs
              defaultValue="countries"
              style={TABS_STYLE}
            >
              {/* Enhanced Tab Navigation */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <TabsList
                  style={TABS_LIST_STYLE}
                >
                  <TabsTrigger value="countries">
                    <MapPin style={ICON_SM} />
                    <span>Countries</span>
                  </TabsTrigger>
                  <TabsTrigger value="cities">
                    <Building2 style={ICON_SM} />
                    <span>Cities</span>
                  </TabsTrigger>
                  <TabsTrigger value="neighborhoods">
                    <Landmark style={ICON_SM} />
                    <span>Neighborhoods</span>
                  </TabsTrigger>
                  <TabsTrigger value="map">
                    <MapIcon style={ICON_SM} />
                    <span>Map</span>
                  </TabsTrigger>
                </TabsList>

                {/* Stats Overview */}
                <Box
                  sx={{
                    display: { xs: 'none', md: 'flex' },
                    alignItems: 'center',
                    gap: 2,
                    fontSize: '0.875rem',
                    color: 'text.secondary',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <MapPin style={ICON_SM} />
                    <span>{countries.length} countries</span>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Building2 style={ICON_SM} />
                    <span>{cities.length} cities</span>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Landmark style={ICON_SM} />
                    <span>{villages.length} neighborhoods</span>
                  </Box>
                </Box>
              </Box>

              <TabsContent
                value="countries"
                style={TAB_CONTENT_STYLE}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Explore Countries
                    </Typography>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {filteredCountries.length} found
                    </Badge>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {loading ? (
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          sm: '1fr 1fr',
                          md: 'repeat(3, 1fr)',
                          lg: 'repeat(4, 1fr)',
                          xl: 'repeat(6, 1fr)',
                        },
                        gap: 2,
                      }}
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Box
                          key={i}
                          sx={{
                            height: 128,
                            bgcolor: 'action.hover',
                            borderRadius: 2,
                            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                          }}
                        />
                      ))}
                    </Box>
                  ) : continents.length > 0 ? (
                    continents.map((continent) => {
                      const continentCountries = filteredCountries.filter(
                        (country) => country.continent_id === continent.id,
                      );

                      if (continentCountries.length === 0) return null;

                      const isExpanded = expandedContinents[continent.id as string];

                      return (
                        <Box
                          key={continent.id}
                          sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                        >
                          <Box
                            onClick={() => toggleContinent(continent.id as string)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 2,
                              p: 2,
                              bgcolor: 'action.hover',
                              cursor: 'pointer',
                              '&:hover': { opacity: 0.85 },
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ p: 1, bgcolor: 'action.selected' }}>
                                <Globe style={ICON_MD} />
                              </Box>
                              <Box>
                                <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                                  {continent.name}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                  {continentCountries.length} countries to explore
                                </Typography>
                              </Box>
                            </Box>
                            {isExpanded ? <ChevronUp style={ICON_MD} /> : <ChevronDown style={ICON_MD} />}
                          </Box>

                          {isExpanded && (
                            <Box
                              sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                  xs: '1fr',
                                  sm: '1fr 1fr',
                                  md: 'repeat(3, 1fr)',
                                  lg: 'repeat(4, 1fr)',
                                  xl: 'repeat(6, 1fr)',
                                },
                                gap: 2,
                              }}
                            >
                              {continentCountries.map((country, index) => (
                                <Box key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
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
                      );
                    })
                  ) : (
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                          xs: '1fr',
                          sm: '1fr 1fr',
                          md: 'repeat(3, 1fr)',
                          lg: 'repeat(4, 1fr)',
                          xl: 'repeat(6, 1fr)',
                        },
                        gap: 2,
                      }}
                    >
                      {filteredCountries.map((country, index) => (
                        <Box key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
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

              <TabsContent
                value="cities"
                style={TAB_CONTENT_STYLE}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Discover Cities
                    </Typography>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {filteredCities.length} found
                    </Badge>
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {citiesByContinent.map(({ continent, totalCities, countries: groupedCountries }) => {
                    const isExpanded = expandedCityContinents[continent.id as string];

                    return (
                      <Box
                        key={continent.id}
                        sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                      >
                        <Box
                          onClick={() => toggleCityContinent(continent.id as string)}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 2,
                            p: 2,
                            bgcolor: 'action.hover',
                            cursor: 'pointer',
                            '&:hover': { opacity: 0.85 },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ p: 1, bgcolor: 'action.selected' }}>
                              <Building2 style={ICON_MD} />
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                                {continent.name as string}
                              </Typography>
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {totalCities} cities in {groupedCountries.length} countries
                              </Typography>
                            </Box>
                          </Box>
                          {isExpanded ? <ChevronUp style={ICON_MD} /> : <ChevronDown style={ICON_MD} />}
                        </Box>

                        {isExpanded && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, pl: { xs: 0, sm: 2 } }}>
                            {groupedCountries.map((country) => {
                              const isCountryExpanded = expandedCityCountries[country.id as string];
                              const visibleCities = isCountryExpanded
                                ? country.cities
                                : country.cities.slice(0, COLLAPSED_COUNT);
                              const hasMore = country.cities.length > COLLAPSED_COUNT;

                              return (
                                <Box key={country.id} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <MapPin style={ICON_SM} />
                                    <Typography sx={{ fontWeight: 600 }}>
                                      {country.name as string}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                      {country.cities.length} cities
                                    </Typography>
                                  </Box>

                                  <Box
                                    sx={{
                                      display: 'grid',
                                      gridTemplateColumns: {
                                        xs: '1fr',
                                        sm: '1fr 1fr',
                                        md: 'repeat(3, 1fr)',
                                        lg: 'repeat(4, 1fr)',
                                        xl: 'repeat(6, 1fr)',
                                      },
                                      gap: 2,
                                    }}
                                  >
                                    {visibleCities.map((city, index) => (
                                      <Box key={city.id} style={{ animationDelay: `${index * 50}ms` }}>
                                        <PlacesCard
                                          type="city"
                                          name={city.name}
                                          data={city}
                                          onClick={() => handleCityClick(city)}
                                        />
                                      </Box>
                                    ))}
                                  </Box>

                                  {hasMore && !isCountryExpanded && (
                                    <Button
                                      variant="ghost"
                                      onClick={() => toggleCityCountry(country.id as string)}
                                      style={{ alignSelf: 'center' }}
                                    >
                                      Show all {country.cities.length} cities
                                    </Button>
                                  )}
                                </Box>
                              );
                            })}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </TabsContent>

              <TabsContent
                value="neighborhoods"
                style={TAB_CONTENT_STYLE}
              >
                <Box
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      LGBTQ+ Neighborhoods
                    </Typography>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {villages.length} found
                    </Badge>
                  </Box>
                </Box>

                {villagesLoading && villages.length === 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: '1fr 1fr',
                        md: 'repeat(3, 1fr)',
                        lg: 'repeat(4, 1fr)',
                      },
                      gap: 2,
                    }}
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Box key={i} sx={{ height: 240, bgcolor: 'action.hover', borderRadius: 2 }} />
                    ))}
                  </Box>
                ) : villages.length > 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {continents.map((continent) => {
                      const continentVillages = villages.filter(
                        (v) => v.countries?.continent_id === continent.id,
                      );
                      if (continentVillages.length === 0) return null;

                      const villageKey = `villages-${continent.id}`;
                      const isExpanded = expandedContinents[villageKey];

                      // Group by country within continent
                      const byCountry: Record<string, { name: string; villages: typeof continentVillages }> = {};
                      for (const v of continentVillages) {
                        const cid = v.country_id || 'unknown';
                        const cname = v.countries?.name || 'Unknown';
                        if (!byCountry[cid]) byCountry[cid] = { name: cname, villages: [] };
                        byCountry[cid].villages.push(v);
                      }

                      const hasMore = continentVillages.length > COLLAPSED_COUNT;

                      return (
                        <Box
                          key={continent.id}
                          sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
                        >
                          <Box
                            onClick={() => toggleContinent(villageKey)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 2,
                              p: 2,
                              borderRadius: 2,
                              bgcolor: 'action.hover',
                              cursor: 'pointer',
                              '&:hover': { opacity: 0.85 },
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'action.selected' }}>
                                <Globe style={ICON_MD} />
                              </Box>
                              <Box>
                                <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>
                                  {continent.name as string}
                                </Typography>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                  {continentVillages.length} neighborhood{continentVillages.length !== 1 ? 's' : ''}
                                </Typography>
                              </Box>
                            </Box>
                            {hasMore && (
                              isExpanded ? <ChevronUp style={ICON_MD} /> : <ChevronDown style={ICON_MD} />
                            )}
                          </Box>

                          {Object.entries(byCountry).map(([countryId, { name: countryName, villages: countryVillages }]) => (
                              <Box key={countryId} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary', pl: 0.5 }}>
                                  {countryName}
                                </Typography>
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gridTemplateColumns: {
                                      xs: '1fr',
                                      sm: 'repeat(2, 1fr)',
                                      md: 'repeat(3, 1fr)',
                                      lg: 'repeat(4, 1fr)',
                                    },
                                    gap: 2,
                                  }}
                                >
                                  {countryVillages.map((village) => (
                                    <VillageCard key={village.id} village={village} />
                                  ))}
                                </Box>
                              </Box>
                          ))}

                          {hasMore && !isExpanded && (
                            <Button
                              variant="ghost"
                              onClick={() => toggleContinent(villageKey)}
                              style={{ alignSelf: 'center' }}
                            >
                              Show all {continentVillages.length} neighborhoods
                            </Button>
                          )}
                        </Box>
                      );
                    })}

                    {/* Villages without a continent */}
                    {villages.some((v) => !v.countries?.continent_id) && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography sx={{ fontSize: '1.125rem', fontWeight: 600 }}>Other</Typography>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: {
                              xs: '1fr',
                              sm: 'repeat(2, 1fr)',
                              md: 'repeat(3, 1fr)',
                              lg: 'repeat(4, 1fr)',
                            },
                            gap: 2,
                          }}
                        >
                          {villages
                            .filter((v) => !v.countries?.continent_id)
                            .map((village) => (
                              <VillageCard key={village.id} village={village} />
                            ))}
                        </Box>
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 6 }}>
                    <Landmark
                      style={ICON_XL}
                    />
                    <Typography color="text.secondary">No neighborhoods found yet</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Check back later as we continue to add LGBTQ+ neighborhoods.
                    </Typography>
                  </Box>
                )}
              </TabsContent>

              <TabsContent value="map">
                <Suspense
                  fallback={
                    <Box
                      sx={{
                        height: 600,
                        bgcolor: 'action.hover',
                        borderRadius: 2,
                        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Box
                        sx={{
                          textAlign: 'center',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 1,
                        }}
                      >
                        <MapIcon style={MAP_ICON_STYLE} />
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Loading map...
                        </Typography>
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
              </TabsContent>
            </Tabs>
          )}

          {/* Country View */}
          {viewMode === 'country' && selectedCountry && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <PlacesCard type="country" name={selectedCountry.name} data={selectedCountry} />

                {selectedCountry.latitude && selectedCountry.longitude && (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                      gap: 3,
                    }}
                  >
                    <LocationInfo name={selectedCountry.name} type="country" />
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
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    Cities in {selectedCountry.name}
                  </Typography>
                  <Badge
                    variant="secondary"
                    style={BADGE_STYLE}
                  >
                    {countryCities.length} cities
                  </Badge>
                </Box>

                {countryCities.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: '1fr 1fr',
                        md: 'repeat(3, 1fr)',
                        lg: 'repeat(4, 1fr)',
                        xl: 'repeat(6, 1fr)',
                      },
                      gap: 2,
                    }}
                  >
                    {countryCities.map((city, index) => (
                      <Box key={city.id} style={{ animationDelay: `${index * 50}ms` }}>
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
                  <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
                    <Building2
                      style={ICON_XL}
                    />
                    <Typography>No cities found in this country</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* City View */}
          {viewMode === 'city' && selectedCity && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <PlacesCard type="city" name={selectedCity.name} data={selectedCity} />

              {selectedCity.latitude && selectedCity.longitude && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                    gap: 3,
                  }}
                >
                  <LocationInfo name={selectedCity.name} type="city" />
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
          {viewMode === 'search' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {searchResults.countries?.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Countries
                    </Typography>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {searchResults.countries.length} found
                    </Badge>
                  </Box>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: '1fr 1fr',
                        md: 'repeat(3, 1fr)',
                        lg: 'repeat(4, 1fr)',
                        xl: 'repeat(6, 1fr)',
                      },
                      gap: 2,
                    }}
                  >
                    {searchResults.countries.map((country, index: number) => (
                      <Box key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
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
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                      Cities
                    </Typography>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {searchResults.cities.length} found
                    </Badge>
                  </Box>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: '1fr 1fr',
                        md: 'repeat(3, 1fr)',
                        lg: 'repeat(4, 1fr)',
                        xl: 'repeat(6, 1fr)',
                      },
                      gap: 2,
                    }}
                  >
                    {searchResults.cities.map((city, index: number) => (
                      <Box key={city.id} style={{ animationDelay: `${index * 50}ms` }}>
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

              {!searchResults.countries?.length && !searchResults.cities?.length && (
                <EmptyState
                  icon={Globe}
                  title="No destinations match"
                  description="Explore a different region or check back later."
                  mood="encouraging"
                  primaryAction={{
                    label: 'Explore All',
                    onClick: () => {
                      setViewMode('overview');
                      setSearchResults({ countries: [], cities: [] });
                    },
                  }}
                />
              )}
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
}
