import { useState, useMemo, Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { useOptimizedCountries, useOptimizedCities } from "@/hooks/usePlaces";
import { useDirectory } from "@/hooks/useDirectory";
import { useContinents } from "@/hooks/useContinents";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { DirectorySearch, type DirectoryFilters } from "@/components/directory/DirectorySearch";
import { WeatherForecast } from "@/components/weather/WeatherForecast";
import { LocationInfo } from "@/components/location/LocationInfo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, MapPin, Building2, Users, Map, Crown } from "lucide-react";
import { PageHero } from "@/components/discovery";

const ExploreMap = lazy(() => import("@/components/map/ExploreMap"));

type ViewMode = "overview" | "country" | "city" | "search";

const GRID_COLS = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2";

export default function Directory() {
  const { t } = useTranslation();
  const { countries, loading: countriesLoading } = useOptimizedCountries();
  const { cities, loading: citiesLoading } = useOptimizedCities();
  const { fetchCitiesByCountry, searchLocations, findNearbyCities } = useDirectory();
  const loading = countriesLoading || citiesLoading;
  const error = null;

  const { data: continents = [] } = useContinents();

  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedCountry, setSelectedCountry] = useState<Record<string, unknown> | null>(null);
  const [selectedCity, setSelectedCity] = useState<Record<string, unknown> | null>(null);
  const [countryCities, setCountryCities] = useState<Record<string, unknown>[]>([]);
  const [searchResults, setSearchResults] = useState<{ countries: Record<string, unknown>[]; cities: Record<string, unknown>[] }>({ countries: [], cities: [] });
  const [filters, setFilters] = useState<DirectoryFilters>({
    continent: "all",
    populationRange: "all",
    isCapital: "all",
    isMajorCity: "all",
    sortBy: "name",
    sortOrder: "asc"
  });

  const [isTransitioning, setIsTransitioning] = useState(false);

  const handleCityClick = (city: Record<string, unknown>) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedCity(city);
      setViewMode("city");
      setIsTransitioning(false);
    }, 150);
  };

  const handleCountryClick = async (country: Record<string, unknown>) => {
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
        <div className="text-center flex flex-col gap-2">
          <div className="animate-pulse">
            <Globe className="w-12 h-12 mx-auto text-primary opacity-60" />
          </div>
          <p className="text-muted-foreground">{t('directory.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center flex flex-col gap-2">
          <div className="text-destructive">
            <MapPin className="w-12 h-12 mx-auto" />
          </div>
          <p className="text-destructive">{t('directory.error', { message: error })}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full transition-opacity duration-300"
      style={{ opacity: isTransitioning ? 0.5 : 1 }}
    >
      {/* Hero */}
      {viewMode === "overview" ? (
        <PageHero
          eyebrow={t('directory.eyebrow', 'Atlas')}
          title={t('directory.title', 'Directory.')}
          lede={t('directory.lede', 'Countries, cities, and regions — the full atlas of queer life around the world.')}
          primaryCta={{ label: t('directory.planTrip', 'Plan a trip'), href: '/travel' }}
          size="md"
        />
      ) : (
        <div className="relative overflow-hidden border-b border-border">
          <div className="container mx-auto px-3 py-6 lg:py-10">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="mb-2 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('directory.back')}
            </Button>
            <div className="flex flex-col gap-1.5">
              <h1 className="font-extrabold text-4xl lg:text-5xl tracking-tight">
                {viewMode === "country" && selectedCountry && <>Explore {selectedCountry.name}</>}
                {viewMode === "city" && selectedCity && <>Discover {selectedCity.name}</>}
                {viewMode === "search" && "Search Results"}
              </h1>
              <p className="text-lg text-muted-foreground max-w-[42rem]">
                {viewMode === "country" && selectedCountry && `Cities and regions in ${selectedCountry.name}.`}
                {viewMode === "city" && selectedCity && `Everything you need to know about ${selectedCity.name}.`}
                {viewMode === "search" && "Find exactly what you're looking for."}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-3 py-6 lg:py-8">
        <div className="mb-4">
          <DirectorySearch
            onSearch={handleSearch}
            onFiltersChange={handleFiltersChange}
            onNearMeSearch={handleNearMeSearch}
            placeholder="Search countries, cities, or regions..."
          />
        </div>
      </div>

      <div className="container mx-auto px-3 pb-6">
        {viewMode !== "overview" && viewMode !== "search" && (
          <div className="mb-3">
            <nav className="flex items-center gap-1 text-sm">
              <button
                onClick={() => setViewMode("overview")}
                className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-1 py-0.5 rounded-badge cursor-pointer border-0 bg-transparent"
              >
                Directory
              </button>
              {selectedCountry && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <button
                    onClick={() => setViewMode("country")}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-1 py-0.5 rounded-badge cursor-pointer border-0 bg-transparent"
                  >
                    {selectedCountry.name}
                  </button>
                </>
              )}
              {selectedCity && (
                <>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="px-1 py-0.5 font-medium">{selectedCity.name}</span>
                </>
              )}
            </nav>
          </div>
        )}

        <div>
          {viewMode === "overview" && (
            <Tabs defaultValue="countries" className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="countries">
                    <MapPin className="w-4 h-4" />
                    <span>Countries</span>
                  </TabsTrigger>
                  <TabsTrigger value="cities">
                    <Building2 className="w-4 h-4" />
                    <span>Cities</span>
                  </TabsTrigger>
                  <TabsTrigger value="map">
                    <Map className="w-4 h-4" />
                    <span>Map</span>
                  </TabsTrigger>
                </TabsList>

                <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-0.5">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">{countries.length} countries</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Building2 className="w-4 h-4" />
                    <span className="text-sm">{cities.length} cities</span>
                  </div>
                </div>
              </div>

              <TabsContent value="countries" className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <h5 className="text-2xl">Explore Countries</h5>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {filteredCountries.length} found
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  {loading ? (
                    <div className={GRID_COLS}>
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="h-32 bg-muted rounded-element animate-pulse" />
                      ))}
                    </div>
                  ) : continents.length > 0 ? (
                    continents.map((continent) => {
                      const continentCountries = filteredCountries.filter(country =>
                        country.continent_id === continent.id
                      );

                      if (continentCountries.length === 0) return null;

                      return (
                        <div key={continent.id} className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 p-2 rounded-element bg-muted">
                            <div className="flex items-center gap-1.5">
                              <div className="p-1 rounded-element bg-muted">
                                <Globe className="w-5 h-5" style={{ color: 'hsl(var(--foreground))' }} />
                              </div>
                              <div>
                                <h6 className="font-semibold text-lg">{continent.name}</h6>
                                <p className="text-sm text-muted-foreground">{continentCountries.length} countries to explore</p>
                              </div>
                            </div>
                          </div>

                          <div className={`${GRID_COLS} pl-3`}>
                            {continentCountries.map((country, index) => (
                              <div key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
                                <DirectoryCard
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
                    <div className={GRID_COLS}>
                      {filteredCountries.map((country, index) => (
                        <div key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
                          <DirectoryCard
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

              <TabsContent value="cities" className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <h5 className="text-2xl">Discover Cities</h5>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {filteredCities.length} found
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  {continents.map((continent) => {
                    const continentCountries = countries.filter(country =>
                      country.continent_id === continent.id
                    );

                    const continentCities = filteredCities.filter(city =>
                      continentCountries.some(country => country.id === city.country_id)
                    );

                    if (continentCities.length === 0) return null;

                    return (
                      <div key={continent.id} className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 p-2 rounded-element bg-muted">
                          <div className="flex items-center gap-1.5">
                            <div className="p-1 rounded-element bg-muted">
                              <Globe className="w-5 h-5" style={{ color: 'hsl(var(--foreground))' }} />
                            </div>
                            <div>
                              <h6 className="font-semibold text-lg">{continent.name}</h6>
                              <p className="text-sm text-muted-foreground">{continentCities.length} cities to discover</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4 pl-3">
                          {continentCountries.map((country) => {
                            const countryCities = filteredCities.filter(city =>
                              city.country_id === country.id
                            );

                            if (countryCities.length === 0) return null;

                            return (
                              <div key={country.id} className="flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 p-1.5 rounded-element bg-muted">
                                  <MapPin className="w-4 h-4 text-muted-foreground" />
                                  <p className="font-medium">{country.name}</p>
                                  <Badge variant="outline" className="text-xs">
                                    {countryCities.length} cities
                                  </Badge>
                                </div>

                                <div className={`${GRID_COLS} pl-3`}>
                                  {countryCities.map((city, index) => (
                                    <div key={city.id} style={{ animationDelay: `${index * 30}ms` }}>
                                      <DirectoryCard
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
                      </div>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="map" className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <h5 className="text-2xl">Interactive World Map</h5>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {countries.length} countries, {cities.length} cities
                    </Badge>
                  </div>
                </div>

                <div className="rounded-container overflow-hidden">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center h-96 bg-muted">
                        <div className="text-center flex flex-col gap-1.5">
                          <Map className="w-12 h-12 mx-auto animate-pulse text-muted-foreground" />
                          <p className="text-muted-foreground">Loading interactive map...</p>
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
                </div>
              </TabsContent>
            </Tabs>
          )}

          {viewMode === "country" && (
            <div className="flex flex-col gap-4">
              <div className="text-center flex flex-col gap-2">
                <div className="flex items-center justify-center gap-1.5">
                  <h4 className="text-3xl font-bold">{selectedCountry?.name}</h4>
                  <Badge variant="secondary" className="px-3 py-1 font-medium">
                    {countryCities.length} cities
                  </Badge>
                </div>
                <p className="text-lg text-muted-foreground max-w-[42rem] mx-auto">
                  Explore the diverse cities and regions of {selectedCountry?.name}. Find your perfect destination with local insights and weather information.
                </p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div style={{ height: 'fit-content' }}>
                  <LocationInfo name={selectedCountry?.name} type="country" />
                </div>
                <div style={{ height: 'fit-content' }}>
                  <WeatherForecast
                    latitude={selectedCountry?.latitude}
                    longitude={selectedCountry?.longitude}
                    cityName={selectedCountry?.capital || selectedCountry?.name}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h5 className="text-2xl font-semibold">Cities to Explore</h5>
                <div className={GRID_COLS}>
                  {countryCities.map((city, index) => (
                    <div key={city.id} style={{ animationDelay: `${index * 50}ms` }}>
                      <DirectoryCard
                        type="city"
                        name={city.name}
                        data={city}
                        onClick={() => handleCityClick(city)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {viewMode === "city" && (
            <div className="flex flex-col gap-4">
              <div className="text-center flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-center gap-1.5 flex-wrap">
                    <h3 className="text-4xl font-bold">{selectedCity?.name}</h3>
                    {selectedCity?.is_capital && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Crown className="w-3 h-3" />
                        Capital
                      </Badge>
                    )}
                    {selectedCity?.is_major_city && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        Major City
                      </Badge>
                    )}
                  </div>

                  <p className="text-lg text-muted-foreground max-w-[42rem] mx-auto">
                    Discover everything about {selectedCity?.name}. Get local insights, weather updates, and essential information for your visit.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 flex-wrap text-sm">
                  {selectedCity?.region_name && (
                    <div className="flex items-center gap-1 px-1.5 py-1 bg-muted rounded-element">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{selectedCity.region_name}</span>
                    </div>
                  )}
                  {selectedCity?.population && (
                    <div className="flex items-center gap-1 px-1.5 py-1 bg-muted rounded-element">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{selectedCity.population.toLocaleString()} people</span>
                    </div>
                  )}
                  {selectedCity?.timezone && (
                    <div className="flex items-center gap-1 px-1.5 py-1 bg-muted rounded-element">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{selectedCity.timezone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div style={{ height: 'fit-content' }}>
                  <LocationInfo name={selectedCity?.name} type="city" />
                </div>
                <div style={{ height: 'fit-content' }}>
                  <WeatherForecast
                    latitude={selectedCity?.latitude}
                    longitude={selectedCity?.longitude}
                    cityName={selectedCity?.name}
                  />
                </div>
              </div>
            </div>
          )}

          {viewMode === "search" && (
            <div className="flex flex-col gap-4">
              <div className="text-center flex flex-col gap-1.5">
                <h4 className="text-3xl font-bold">Search Results</h4>
                <p className="text-muted-foreground max-w-[42rem] mx-auto">
                  Found {(searchResults.countries?.length || 0) + (searchResults.cities?.length || 0)} results matching your search criteria.
                </p>
              </div>

              {searchResults.countries?.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-5 h-5 text-primary" />
                    <h5 className="text-2xl font-semibold">Countries</h5>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {searchResults.countries.length} found
                    </Badge>
                  </div>
                  <div className={GRID_COLS}>
                    {searchResults.countries.map((country, index: number) => (
                      <div key={country.id} style={{ animationDelay: `${index * 50}ms` }}>
                        <DirectoryCard
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
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-5 h-5 text-primary" />
                    <h5 className="text-2xl font-semibold">Cities</h5>
                    <Badge variant="secondary" className="px-3 py-1 font-medium">
                      {searchResults.cities.length} found
                    </Badge>
                  </div>
                  <div className={GRID_COLS}>
                    {searchResults.cities.map((city, index: number) => (
                      <div
                        key={city.id}
                        style={{ animationDelay: `${(searchResults.countries?.length || 0) * 50 + index * 50}ms` }}
                      >
                        <DirectoryCard
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

              {(searchResults.countries?.length || 0) === 0 && (searchResults.cities?.length || 0) === 0 && (
                <div className="text-center py-8">
                  <div className="flex flex-col gap-2">
                    <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                      <MapPin className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                      <h6 className="text-lg font-semibold mb-1">No results found</h6>
                      <p className="text-muted-foreground max-w-md mx-auto">
                        Try adjusting your search terms or explore our featured locations above.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
