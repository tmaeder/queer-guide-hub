import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDirectory } from "@/hooks/useDirectory";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { DirectorySearch, type DirectoryFilters } from "@/components/directory/DirectorySearch";
import { WeatherForecast } from "@/components/weather/WeatherForecast";
import { LocationInfo } from "@/components/location/LocationInfo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, MapPin, Building2, Users } from "lucide-react";

type ViewMode = "overview" | "country" | "city" | "search";

export default function Directory() {
  const { t } = useTranslation();
  const { 
    continents, 
    countries, 
    cities, 
    loading, 
    error,
    fetchCountriesByContinent,
    fetchCitiesByCountry,
    searchLocations,
    findNearbyCities
  } = useDirectory();

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

  const handleCityClick = (city: any) => {
    setSelectedCity(city);
    setViewMode("city");
  };

  const handleCountryClick = async (country: any) => {
    setSelectedCountry(country);
    setViewMode("country");
    const cities = await fetchCitiesByCountry(country.id);
    setCountryCities(cities);
  };

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      const results = await searchLocations(query);
      setSearchResults({ countries: results.countries, cities: results.cities });
      setViewMode("search");
    } else {
      setViewMode("overview");
      setSearchResults({ countries: [], cities: [] });
    }
  };

  const handleFiltersChange = (newFilters: DirectoryFilters) => {
    setFilters(newFilters);
    // You can implement filter logic here when needed
  };

  const handleNearMeSearch = async (userLocation: { latitude: number; longitude: number }) => {
    const nearbyCities = await findNearbyCities(userLocation);
    setSearchResults({ countries: [], cities: nearbyCities });
    setViewMode("search");
  };

  const handleBack = () => {
    if (viewMode === "city") {
      setViewMode("country");
    } else if (viewMode === "country" || viewMode === "search") {
      setViewMode("overview");
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">{t('directory.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-destructive">{t('directory.error', { message: error })}</div>
      </div>
    );
  }

  return (
    <div className="w-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {viewMode !== "overview" && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('directory.back')}
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold">{t('directory.title')}</h1>
            {viewMode === "country" && selectedCountry && (
              <p className="text-muted-foreground">{t('directory.citiesIn', { country: selectedCountry.name })}</p>
            )}
            {viewMode === "city" && selectedCity && (
              <p className="text-muted-foreground">{selectedCity.name} Details</p>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <DirectorySearch 
        onSearch={handleSearch} 
        onFiltersChange={handleFiltersChange} 
        onNearMeSearch={handleNearMeSearch}
      />

      {/* Breadcrumb */}
      {viewMode !== "overview" && viewMode !== "search" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => setViewMode("overview")} className="hover:text-foreground">
            {t('directory.breadcrumb')}
          </button>
          {selectedCountry && (
            <>
              <span>/</span>
              <button 
                onClick={() => setViewMode("country")} 
                className="hover:text-foreground"
              >
                {selectedCountry.name}
              </button>
            </>
          )}
          {selectedCity && (
            <>
              <span>/</span>
              <span className="text-foreground">{selectedCity.name}</span>
            </>
          )}
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === "overview" && (
        <Tabs defaultValue="countries" className="space-y-4">
          <TabsList>
            <TabsTrigger value="countries" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {t('directory.countries')}
            </TabsTrigger>
            <TabsTrigger value="cities" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t('directory.cities')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="countries" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{t('directory.countriesByContinent')}</h2>
              <Badge variant="secondary">{countries.length}</Badge>
            </div>
            <div className="space-y-8">
              {continents.map((continent) => {
                const continentCountries = countries.filter(country => 
                  country.continent_id === continent.id
                );
                
                if (continentCountries.length === 0) return null;
                
                return (
                  <div key={continent.id} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-primary">{continent.name}</h3>
                      <Badge variant="outline">{continentCountries.length} countries</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pl-8">
                      {continentCountries.map((country) => (
                        <DirectoryCard
                          key={country.id}
                          type="country"
                          name={country.name}
                          data={country}
                          onClick={() => handleCountryClick(country)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="cities" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{t('directory.citiesByContinent')}</h2>
              <Badge variant="secondary">{cities.length}</Badge>
            </div>
            <div className="space-y-8">
              {continents.map((continent) => {
                const continentCountries = countries.filter(country => 
                  country.continent_id === continent.id
                );
                
                // Filter cities for this continent
                const continentCities = cities.filter(city => 
                  continentCountries.some(country => country.id === city.country_id)
                );
                
                if (continentCities.length === 0) return null;
                
                return (
                  <div key={continent.id} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold text-primary">{continent.name}</h3>
                      <Badge variant="outline">{continentCities.length} cities</Badge>
                    </div>
                    <div className="space-y-6 pl-8">
                      {continentCountries.map((country) => {
                        const countryCities = cities.filter(city => 
                          city.country_id === country.id
                        );
                        
                        if (countryCities.length === 0) return null;
                        
                        return (
                          <div key={country.id} className="space-y-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <h4 className="text-base font-medium text-muted-foreground">{country.name}</h4>
                              <Badge variant="secondary" className="text-xs">{countryCities.length}</Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pl-6">
                              {countryCities.map((city) => (
                                <DirectoryCard
                                  key={city.id}
                                  type="city"
                                  name={city.name}
                                  data={city}
                                  onClick={() => handleCityClick(city)}
                                />
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
        </Tabs>
      )}


      {viewMode === "country" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{t('directory.citiesIn', { country: selectedCountry?.name })}</h2>
            <Badge variant="secondary">{countryCities.length}</Badge>
          </div>
          
          {/* Country Information */}
          <LocationInfo
            name={selectedCountry?.name}
            type="country"
            className="mb-6"
          />
          
          {/* Weather Forecast for Country */}
          <WeatherForecast
            latitude={selectedCountry?.latitude}
            longitude={selectedCountry?.longitude}
            cityName={selectedCountry?.capital || selectedCountry?.name}
            className="mb-6"
          />
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {countryCities.map((city) => (
              <DirectoryCard
                key={city.id}
                type="city"
                name={city.name}
                data={city}
                onClick={() => handleCityClick(city)}
              />
            ))}
          </div>
        </div>
      )}

      {viewMode === "city" && (
        <div className="space-y-6">
          <div className="grid gap-6">
            {/* City Header */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{selectedCity?.name}</h2>
                {selectedCity?.is_capital && (
                  <Badge variant="secondary">{t('directory.capital')}</Badge>
                )}
                {selectedCity?.is_major_city && (
                  <Badge variant="outline">{t('directory.majorCity')}</Badge>
                )}
              </div>
              
              <div className="space-y-2 text-sm text-muted-foreground">
                {selectedCity?.region_name && (
                  <p><span className="font-medium">{t('directory.region')}:</span> {selectedCity.region_name}</p>
                )}
                {selectedCity?.population && (
                  <p className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{t('directory.population')}:</span> 
                    {selectedCity.population.toLocaleString()}
                  </p>
                )}
                {selectedCity?.timezone && (
                  <p><span className="font-medium">{t('directory.timezone')}:</span> {selectedCity.timezone}</p>
                )}
                {selectedCity?.latitude && selectedCity?.longitude && (
                  <p><span className="font-medium">{t('directory.coordinates')}:</span> {selectedCity.latitude}°, {selectedCity.longitude}°</p>
                )}
              </div>
            </div>

            {/* City Information */}
            <LocationInfo
              name={selectedCity?.name}
              type="city"
            />

            {/* Weather Forecast */}
            <WeatherForecast
              latitude={selectedCity?.latitude}
              longitude={selectedCity?.longitude}
              cityName={selectedCity?.name}
              className="h-fit"
            />
          </div>
        </div>
      )}

      {viewMode === "search" && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">{t('directory.searchResults')}</h2>
          
          {searchResults.countries.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium">{t('directory.countries')}</h3>
                <Badge variant="secondary">{searchResults.countries.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.countries.map((country: any) => (
                  <DirectoryCard
                    key={country.id}
                    type="country"
                    name={country.name}
                    data={country}
                    onClick={() => handleCountryClick(country)}
                  />
                ))}
              </div>
            </div>
          )}

          {searchResults.cities.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium">{t('directory.cities')}</h3>
                <Badge variant="secondary">{searchResults.cities.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.cities.map((city: any) => (
                  <div key={city.id} className="space-y-4">
                    <DirectoryCard
                      type="city"
                      name={city.name}
                      data={city}
                      onClick={() => handleCityClick(city)}
                    />
                    <WeatherForecast
                      latitude={city.latitude}
                      longitude={city.longitude}
                      cityName={city.name}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {searchResults.countries.length === 0 && 
           searchResults.cities.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              {t('directory.noResults')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}