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
import { GeoCard } from '@/components/places/GeoCard';
import { AtlasHero } from '@/components/places/AtlasHero';
import { PassportStrip } from '@/components/places/PassportStrip';
import { EditorRail } from '@/components/places/EditorRail';
import { ContinentSection } from '@/components/places/ContinentSection';
import { useEditorialRails } from '@/hooks/useEditorialRails';
import { usePlacesPassport } from '@/hooks/usePlacesPassport';
import { PlacesSearch, type PlacesFilters } from '@/components/places/PlacesSearch';
import { WeatherForecast } from '@/components/weather/WeatherForecast';
import { LocationInfo } from '@/components/location/LocationInfo';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { EmptyState, LoadingTimeout, ErrorState } from '@/components/ui/EmptyState';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { ArrowLeft, Globe, MapPin, Building2, Map as MapIcon, Landmark, Sparkles } from 'lucide-react';
import { PersonalizedFeed } from '@/components/personalization/PersonalizedFeed';
import { useMeta } from '@/hooks/useMeta';

// Curated queer-essential countries. Surfaced first regardless of equality_score
// ranking — ensures the page leads with destinations queer travelers actually
// want to discover, not just whichever country has the highest legal index.
const FEATURED_COUNTRY_NAMES = new Set([
  'Germany', 'Spain', 'Netherlands', 'Portugal', 'Canada', 'Mexico',
  'Thailand', 'Argentina', 'Brazil', 'Australia', 'United States', 'United Kingdom',
  'France', 'Belgium', 'Sweden', 'Denmark', 'Iceland', 'New Zealand',
  'South Africa', 'Uruguay', 'Malta', 'Ireland', 'Norway', 'Finland',
]);
const FEATURED_LIMIT = 24;

// Lazy load the map component
const ExploreMap = lazy(() => import('@/components/map/ExploreMap'));

// Extracted style constants to avoid creating new objects on every render
const ICON_SM: React.CSSProperties = { height: 16, width: 16 };
const ICON_XL: React.CSSProperties = { height: 48, width: 48, margin: '0 auto 16px', color: 'hsl(var(--muted-foreground))' };
const BACK_BTN_STYLE: React.CSSProperties = { marginBottom: 16, transition: 'all 200ms' };
const BACK_ICON_STYLE: React.CSSProperties = { height: 16, width: 16, marginRight: 8 };
const TABS_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 32 };
const TABS_LIST_STYLE: React.CSSProperties = { display: 'grid', width: '100%', maxWidth: 360, gridTemplateColumns: 'repeat(2, 1fr)' };
const TAB_CONTENT_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24 };
const BADGE_STYLE: React.CSSProperties = { paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4, fontWeight: 500 };
const MAP_ICON_STYLE: React.CSSProperties = { height: 32, width: 32, margin: '0 auto', color: 'hsl(var(--muted-foreground))' };
const GRID_6_COLS = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4';

type ViewMode = 'overview' | 'country' | 'city' | 'search';

export default function Places() {
  const { _t } = useTranslation();
  useMeta({
    title: 'Queer Places — Cities, Neighborhoods, Villages',
    description: 'Browse LGBTQ+ friendly countries, cities, and neighborhoods worldwide. See legality at a glance and find your next destination.',
    canonicalPath: '/places',
  });
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
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
  const [_filters, setFilters] = useState<PlacesFilters>({
    continent: 'all',
    populationRange: 'all',
    isCapital: 'all',
    isMajorCity: 'all',
    sortBy: 'equality',
    sortOrder: 'desc',
  });
  // Legacy multi-tab state removed — Atlas section composes its own scroll layout
  // with embedded continent accordions. See ContinentSection.

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

  // filteredCountries/filteredCities removed with the 4-tab layout — the Atlas
  // section uses topQueerCountries + countriesWithContent + continent grouping.

  // Countries with at least one city in our loaded data — proxy for
  // "has content worth surfacing". Filters out Antarctica, Bouvet Island, and
  // ~80 other uninhabited / zero-content territories from the default view.
  const countriesWithContent = useMemo(() => {
    const countryIdsWithCities = new Set(cities.map(c => c.country_id));
    return countries.filter(c => countryIdsWithCities.has(c.id));
  }, [countries, cities]);

  // Top zone: editorial whitelist first (in defined order), then fill with
  // remaining high-equality countries up to FEATURED_LIMIT.
  const topQueerCountries = useMemo(() => {
    const byName = new Map<string, typeof countries[number]>();
    for (const c of countries) {
      if (typeof c.name === 'string') byName.set(c.name, c);
    }
    const featured: typeof countries = [];
    for (const name of FEATURED_COUNTRY_NAMES) {
      const c = byName.get(name);
      if (c) featured.push(c);
    }
    const featuredIds = new Set(featured.map(c => c.id));
    const remaining = countries
      .filter(c => !featuredIds.has(c.id) && typeof c.equality_score === 'number')
      .sort((a, b) => (b.equality_score ?? 0) - (a.equality_score ?? 0));
    return [...featured, ...remaining].slice(0, FEATURED_LIMIT);
  }, [countries]);

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
            <div className="flex flex-col gap-4">
              <h3 className="text-4xl lg:text-5xl font-bold tracking-tight text-foreground">
                {viewMode === 'overview' && 'Places'}
                {viewMode === 'country' && selectedCountry && <>{selectedCountry.name}</>}
                {viewMode === 'city' && selectedCity && <>{selectedCity.name}</>}
                {viewMode === 'search' && 'Search Results'}
              </h3>

              <p className="text-lg text-muted-foreground">
                {viewMode === 'overview' &&
                  'Countries, cities, and locations worldwide.'}
                {viewMode === 'country' &&
                  selectedCountry &&
                  `Cities and regions in ${selectedCountry.name}.`}
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
                className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-2 py-1 rounded-element border-0 bg-background cursor-pointer"
              >
                Places
              </button>
              {selectedCountry && (
                <>
                  <span className="text-muted-foreground/60">/</span>
                  <button
                    type="button"
                    onClick={() => setViewMode('country')}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors px-2 py-1 rounded-element border-0 bg-background cursor-pointer"
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
              defaultValue="atlas"
              style={TABS_STYLE}
            >
              {/* Enhanced Tab Navigation */}
              <div className="flex items-center justify-between">
                <TabsList
                  style={TABS_LIST_STYLE}
                >
                  <TabsTrigger value="atlas">
                    <Sparkles style={ICON_SM} />
                    <span>Atlas</span>
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
                value="atlas"
                style={TAB_CONTENT_STYLE}
              >
                <AtlasView
                  countries={countries}
                  cities={cities}
                  villages={villages}
                  villagesLoading={villagesLoading}
                  continents={continents}
                  featuredNames={FEATURED_COUNTRY_NAMES}
                  topQueerCountries={topQueerCountries}
                  countriesWithContent={countriesWithContent}
                />
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
                <div className="flex items-center gap-4">
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
                    <p>No cities in this country yet</p>
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
                  <div className="flex items-center gap-4">
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
                  <div className="flex items-center gap-4">
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
                  description="Try a different region or check back later."
                  mood="encouraging"
                  primaryAction={{
                    label: 'All regions',
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

// ---------------------------------------------------------------------------
// AtlasView — Editorial atlas layout (replaces Countries/Cities/Neighborhoods)
// Hero cover → passport strip → editor rails → continent country accordions →
// featured neighborhoods.
// ---------------------------------------------------------------------------

interface AtlasViewProps {
  countries: Array<Record<string, unknown>>;
  cities: Array<Record<string, unknown>>;
  villages: Array<Record<string, unknown>>;
  villagesLoading: boolean;
  continents: Array<Record<string, unknown>>;
  featuredNames: Set<string>;
  topQueerCountries: Array<Record<string, unknown>>;
  countriesWithContent: Array<Record<string, unknown>>;
}

function AtlasView({
  villages,
  villagesLoading,
  continents,
  featuredNames,
  topQueerCountries,
  countriesWithContent,
}: AtlasViewProps) {
  const { data: rails } = useEditorialRails();
  const { data: passport } = usePlacesPassport();

  // Continent IDs containing featured countries — expand those by default so
  // first-time visitors see something below the rails without clicking.
  const featuredContinentIds = (() => {
    const ids = new Set<string>();
    for (const c of topQueerCountries) {
      const cid = c.continent_id as string | undefined;
      if (cid) ids.add(cid);
    }
    return Array.from(ids);
  })();

  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <AtlasHero featuredCountryNames={featuredNames} />

      <PassportStrip />

      {(rails ?? []).length === 0 && topQueerCountries.length > 0 && (
        <section className="flex flex-col gap-4">
          <header className="flex flex-col gap-1">
            <h2 className="text-headline-lg md:text-display font-semibold leading-tight tracking-tight">
              Editor&rsquo;s picks
            </h2>
            <p className="text-15 text-muted-foreground max-w-2xl">
              Countries with the strongest LGBTQ+ legal protections and the deepest queer travel
              culture.
            </p>
          </header>
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 pb-2">
            {topQueerCountries.slice(0, 12).map((c, idx) => {
              const id = c.id as string;
              return (
                <div key={id} className="snap-start shrink-0 w-[260px] md:w-[280px]">
                  <GeoCard
                    variant="country"
                    id={id}
                    slug={(c.slug as string | null) ?? null}
                    name={c.name as string}
                    imageUrl={(c.image_url as string | null) ?? null}
                    editorialHook={(c.editorial_hook as string | null) ?? null}
                    capital={(c.capital as string | null) ?? null}
                    legalityData={c as never}
                    visited={!!passport?.visitedCountryIds.has(id)}
                    priority={idx < 4}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(rails ?? []).map((rail) => (
        <EditorRail key={rail.id} rail={rail} />
      ))}

      <ContinentSection
        continents={continents as Array<{ id: string; name: string }>}
        countries={countriesWithContent as Parameters<typeof ContinentSection>[0]['countries']}
        defaultExpandedIds={featuredContinentIds}
        title="Browse the atlas"
        description="Countries with dedicated guides. Click a continent to open it."
      />

      {/* Iconic queer neighborhoods */}
      <section className="flex flex-col gap-6" aria-label="Iconic queer neighborhoods">
        <header className="flex flex-col gap-1">
          <h2 className="text-headline-lg md:text-display font-semibold leading-tight tracking-tight">
            Iconic queer neighborhoods
          </h2>
          <p className="text-15 text-muted-foreground max-w-2xl">
            The Castro, Chueca, Le Marais, Sch&ouml;neberg &mdash; historic LGBTQ+ communities worth a
            trip on their own.
          </p>
        </header>

        {villagesLoading && villages.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-60 bg-muted rounded-element" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {villages
              .filter((v) => (v as { featured?: boolean }).featured)
              .slice(0, 12)
              .map((v, idx) => {
                const id = v.id as string;
                return (
                  <GeoCard
                    key={id}
                    variant="village"
                    id={id}
                    slug={(v.slug as string | null) ?? null}
                    name={v.name as string}
                    imageUrl={(v.image_url as string | null) ?? null}
                    editorialHook={(v.editorial_hook as string | null) ?? null}
                    description={(v.description as string | null) ?? null}
                    visited={!!passport?.visitedVillageIds.has(id)}
                    priority={idx < 4}
                  />
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
