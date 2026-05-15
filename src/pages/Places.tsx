import { useState, useMemo, Suspense, lazy, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useOptimizedCountries,
  useOptimizedCities,
  fetchCitiesByCountry,
  searchLocations,
  findNearbyCities,
} from '@/hooks/usePlaces';
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
const MAP_ICON_STYLE: React.CSSProperties = { height: 32, width: 32, margin: '0 auto', color: 'hsl(var(--muted-foreground))' };
const COLLAPSED_COUNT = 6;

const GRID_6_COLS = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4';
const GRID_4_COLS = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

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

  // Fetch continents for grouping countries
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
      <div className="container mx-auto py-12 md:py-20 px-4">
        <PageLoadingState count={8} />
        {loadingTimedOut && (
          <div className="mt-6">
            <LoadingTimeout onRetry={() => window.location.reload()} />
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-[480px] mx-auto">
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Hero Section */}
      <div className="container mx-auto pt-12 md:pt-20 pb-4 px-4">
        <div className="bg-background rounded-container p-6 lg:p-8 mb-6">
          {/* Navigation Header */}
          <div className="mb-6">
            {viewMode !== 'overview' && (
              <div>
                <Button
                  variant="ghost"
                  onClick={handleBack}
                  style={BACK_BTN_STYLE}
                >
                  <ArrowLeft style={BACK_ICON_STYLE} />
                  Back
                </Button>
              </div>
            )}

            {/* Dynamic Title */}
            <div className="flex flex-col gap-3">
              <h3 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                {viewMode === 'overview' && 'Explore Places'}
                {viewMode === 'country' && selectedCountry && <>Explore {selectedCountry.name}</>}
                {viewMode === 'city' && selectedCity && <>Discover {selectedCity.name}</>}
                {viewMode === 'search' && 'Search Results'}
              </h3>

              <p className="text-lg text-muted-foreground">
                {viewMode === 'overview' &&
                  'Countries, cities, and locations worldwide.'}
                {viewMode === 'country' &&
                  selectedCountry &&
                  `Explore cities and regions in ${selectedCountry.name}. Find the perfect destination for your next adventure.`}
                {viewMode === 'city' &&
                  selectedCity &&
                  `Everything you need to know about ${selectedCity.name}. Weather, demographics, and local insights.`}
                {viewMode === 'search' &&
                  "Find exactly what you're looking for with our powerful search and filtering tools."}
              </p>
            </div>
          </div>

          {/* Enhanced Search */}
          <PlacesSearch
            onSearch={handleSearch}
            onFiltersChange={handleFiltersChange}
            onNearMeSearch={handleNearMeSearch}
            placeholder="Search countries, cities, or regions..."
          />
        </div>
      </div>

      {/* Personalized Recommendations (overview only) */}
      {viewMode === 'overview' && (
        <div className="container mx-auto pb-0 px-4">
          <PersonalizedFeed />
        </div>
      )}

      {/* Main Content Area */}
      <div className="container mx-auto pb-12 px-4">
        {/* Breadcrumb Navigation */}
        {viewMode !== 'overview' && viewMode !== 'search' && (
          <div className="mb-6">
            <nav className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => setViewMode('overview')}
                className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-2 py-1 rounded border-0 bg-background cursor-pointer"
              >
                Places
              </button>
              {selectedCountry && (
                <>
                  <span className="text-muted-foreground/60">/</span>
                  <button
                    type="button"
                    onClick={() => setViewMode('country')}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-2 py-1 rounded border-0 bg-background cursor-pointer"
                  >
                    {selectedCountry.name}
                  </button>
                </>
              )}
              {selectedCity && (
                <>
                  <span className="text-muted-foreground/60">/</span>
                  <span className="text-foreground font-medium px-2 py-1">
                    {selectedCity.name}
                  </span>
                </>
              )}
            </nav>
          </div>
        )}

        {/* Content based on view mode */}
        <div>
          {viewMode === 'overview' && (
            <Tabs
              defaultValue="countries"
              style={TABS_STYLE}
            >
              {/* Enhanced Tab Navigation */}
              <div className="flex items-center justify-between">
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
                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin style={ICON_SM} />
                    <span>{countries.length} countries</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Building2 style={ICON_SM} />
                    <span>{cities.length} cities</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Landmark style={ICON_SM} />
                    <span>{villages.length} neighborhoods</span>
                  </div>
                </div>
              </div>

              <TabsContent
                value="countries"
                style={TAB_CONTENT_STYLE}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h5 className="text-2xl font-semibold">Countries</h5>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {filteredCountries.length} found
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-10">
                  {loading ? (
                    <div className={GRID_6_COLS}>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-32 bg-muted rounded-element animate-pulse"
                        />
                      ))}
                    </div>
                  ) : continents.length > 0 ? (
                    continents.map((continent) => {
                      const continentCountries = filteredCountries.filter(
                        (country) => country.continent_id === continent.id,
                      );

                      if (continentCountries.length === 0) return null;

                      const isExpanded = expandedContinents[continent.id as string];

                      return (
                        <div key={continent.id} className="flex flex-col gap-6">
                          <div
                            onClick={() => toggleContinent(continent.id as string)}
                            className="flex items-center justify-between gap-4 p-4 bg-muted cursor-pointer hover:opacity-85"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-muted-foreground/10">
                                <Globe style={ICON_MD} />
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{continent.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {continentCountries.length} countries
                                </p>
                              </div>
                            </div>
                            {isExpanded ? <ChevronUp style={ICON_MD} /> : <ChevronDown style={ICON_MD} />}
                          </div>

                          {isExpanded && (
                            <div className={GRID_6_COLS}>
                              {continentCountries.map((country, index) => (
                                <div key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
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
                      );
                    })
                  ) : (
                    <div className={GRID_6_COLS}>
                      {filteredCountries.map((country, index) => (
                        <div key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
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

              <TabsContent
                value="cities"
                style={TAB_CONTENT_STYLE}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h5 className="text-2xl font-semibold">Cities</h5>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {filteredCities.length} found
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-8">
                  {citiesByContinent.map(({ continent, totalCities, countries: groupedCountries }) => {
                    const isExpanded = expandedCityContinents[continent.id as string];

                    return (
                      <div key={continent.id} className="flex flex-col gap-6">
                        <div
                          onClick={() => toggleCityContinent(continent.id as string)}
                          className="flex items-center justify-between gap-4 p-4 bg-muted cursor-pointer hover:opacity-85"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted-foreground/10">
                              <Building2 style={ICON_MD} />
                            </div>
                            <div>
                              <p className="text-lg font-semibold">{continent.name as string}</p>
                              <p className="text-sm text-muted-foreground">
                                {totalCities} cities in {groupedCountries.length} countries
                              </p>
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp style={ICON_MD} /> : <ChevronDown style={ICON_MD} />}
                        </div>

                        {isExpanded && (
                          <div className="flex flex-col gap-8 pl-0 sm:pl-4">
                            {groupedCountries.map((country) => {
                              const isCountryExpanded = expandedCityCountries[country.id as string];
                              const visibleCities = isCountryExpanded
                                ? country.cities
                                : country.cities.slice(0, COLLAPSED_COUNT);
                              const hasMore = country.cities.length > COLLAPSED_COUNT;

                              return (
                                <div key={country.id} className="flex flex-col gap-4">
                                  <div className="flex items-center gap-2">
                                    <MapPin style={ICON_SM} />
                                    <p className="font-semibold">{country.name as string}</p>
                                    <p className="text-sm text-muted-foreground">
                                      {country.cities.length} cities
                                    </p>
                                  </div>

                                  <div className={GRID_6_COLS}>
                                    {visibleCities.map((city, index) => (
                                      <div key={city.id} style={{ animationDelay: `${index * 50}ms` }}>
                                        <PlacesCard
                                          type="city"
                                          name={city.name}
                                          data={city}
                                          onClick={() => handleCityClick(city)}
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  {hasMore && !isCountryExpanded && (
                                    <Button
                                      variant="ghost"
                                      onClick={() => toggleCityCountry(country.id as string)}
                                      style={{ alignSelf: 'center' }}
                                    >
                                      Show all {country.cities.length} cities
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent
                value="neighborhoods"
                style={TAB_CONTENT_STYLE}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h5 className="text-2xl font-semibold">LGBTQ+ Neighborhoods</h5>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {villages.length} found
                    </Badge>
                  </div>
                </div>

                {villagesLoading && villages.length === 0 ? (
                  <div className={GRID_4_COLS}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-60 bg-muted rounded-element" />
                    ))}
                  </div>
                ) : villages.length > 0 ? (
                  <div className="flex flex-col gap-8">
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
                        <div key={continent.id} className="flex flex-col gap-6">
                          <div
                            onClick={() => toggleContinent(villageKey)}
                            className="flex items-center justify-between gap-4 p-4 rounded-element bg-muted cursor-pointer hover:opacity-85"
                          >
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-element bg-muted-foreground/10">
                                <Globe style={ICON_MD} />
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{continent.name as string}</p>
                                <p className="text-sm text-muted-foreground">
                                  {continentVillages.length} neighborhood{continentVillages.length !== 1 ? 's' : ''}
                                </p>
                              </div>
                            </div>
                            {hasMore && (
                              isExpanded ? <ChevronUp style={ICON_MD} /> : <ChevronDown style={ICON_MD} />
                            )}
                          </div>

                          {Object.entries(byCountry).map(([countryId, { name: countryName, villages: countryVillages }]) => (
                              <div key={countryId} className="flex flex-col gap-3">
                                <p className="text-sm font-semibold text-muted-foreground pl-1">
                                  {countryName}
                                </p>
                                <div className={GRID_4_COLS}>
                                  {countryVillages.map((village) => (
                                    <VillageCard key={village.id} village={village} />
                                  ))}
                                </div>
                              </div>
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
                        </div>
                      );
                    })}

                    {/* Villages without a continent */}
                    {villages.some((v) => !v.countries?.continent_id) && (
                      <div className="flex flex-col gap-4">
                        <p className="text-lg font-semibold">Other</p>
                        <div className={GRID_4_COLS}>
                          {villages
                            .filter((v) => !v.countries?.continent_id)
                            .map((village) => (
                              <VillageCard key={village.id} village={village} />
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Landmark
                      style={ICON_XL}
                    />
                    <p className="text-muted-foreground">No neighborhoods found yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Check back later as we continue to add LGBTQ+ neighborhoods.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="map">
                <Suspense
                  fallback={
                    <div className="h-[600px] bg-muted rounded-container animate-pulse flex items-center justify-center">
                      <div className="text-center flex flex-col gap-2">
                        <MapIcon style={MAP_ICON_STYLE} />
                        <p className="text-sm text-muted-foreground">Loading map...</p>
                      </div>
                    </div>
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
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-6">
                <PlacesCard type="country" name={selectedCountry.name} data={selectedCountry} />

                {selectedCountry.latitude && selectedCountry.longitude && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <LocationInfo name={selectedCountry.name} type="country" />
                    <WeatherForecast
                      latitude={selectedCountry.latitude}
                      longitude={selectedCountry.longitude}
                      cityName={selectedCountry.capital || selectedCountry.name}
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <h5 className="text-2xl font-semibold">Cities in {selectedCountry.name}</h5>
                  <Badge
                    variant="secondary"
                    style={BADGE_STYLE}
                  >
                    {countryCities.length} cities
                  </Badge>
                </div>

                {countryCities.length > 0 ? (
                  <div className={GRID_6_COLS}>
                    {countryCities.map((city, index) => (
                      <div key={city.id} style={{ animationDelay: `${index * 50}ms` }}>
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
                    <Building2
                      style={ICON_XL}
                    />
                    <p>No cities found in this country</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* City View */}
          {viewMode === 'city' && selectedCity && (
            <div className="flex flex-col gap-8">
              <PlacesCard type="city" name={selectedCity.name} data={selectedCity} />

              {selectedCity.latitude && selectedCity.longitude && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <LocationInfo name={selectedCity.name} type="city" />
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
          {viewMode === 'search' && (
            <div className="flex flex-col gap-8">
              {searchResults.countries?.length > 0 && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-3">
                    <h5 className="text-2xl font-semibold">Countries</h5>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {searchResults.countries.length} found
                    </Badge>
                  </div>
                  <div className={GRID_6_COLS}>
                    {searchResults.countries.map((country, index: number) => (
                      <div key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
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
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-3">
                    <h5 className="text-2xl font-semibold">Cities</h5>
                    <Badge
                      variant="secondary"
                      style={BADGE_STYLE}
                    >
                      {searchResults.cities.length} found
                    </Badge>
                  </div>
                  <div className={GRID_6_COLS}>
                    {searchResults.cities.map((city, index: number) => (
                      <div key={city.id} style={{ animationDelay: `${index * 50}ms` }}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
