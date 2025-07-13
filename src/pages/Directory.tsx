import { useState } from "react";
import { useDirectory } from "@/hooks/useDirectory";
import { DirectoryCard } from "@/components/directory/DirectoryCard";
import { DirectorySearch } from "@/components/directory/DirectorySearch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Globe, MapPin, Building2, Users } from "lucide-react";

type ViewMode = "overview" | "continent" | "country" | "search";

export default function Directory() {
  const { 
    continents, 
    countries, 
    cities, 
    loading, 
    error,
    fetchCountriesByContinent,
    fetchCitiesByCountry,
    searchLocations
  } = useDirectory();

  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [selectedContinent, setSelectedContinent] = useState<any>(null);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [continentCountries, setContinentCountries] = useState<any[]>([]);
  const [countryCities, setCountryCities] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any>({ continents: [], countries: [], cities: [] });

  const handleContinentClick = async (continent: any) => {
    setSelectedContinent(continent);
    setViewMode("continent");
    const countries = await fetchCountriesByContinent(continent.id);
    setContinentCountries(countries);
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
      setSearchResults(results);
      setViewMode("search");
    } else {
      setViewMode("overview");
      setSearchResults({ continents: [], countries: [], cities: [] });
    }
  };

  const handleBack = () => {
    if (viewMode === "country") {
      setViewMode("continent");
    } else if (viewMode === "continent") {
      setViewMode("overview");
    } else if (viewMode === "search") {
      setViewMode("overview");
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading directory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center text-destructive">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {viewMode !== "overview" && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <div>
            <h1 className="text-3xl font-bold">Geographic Directory</h1>
            {viewMode === "continent" && selectedContinent && (
              <p className="text-muted-foreground">Exploring {selectedContinent.name}</p>
            )}
            {viewMode === "country" && selectedCountry && (
              <p className="text-muted-foreground">Cities in {selectedCountry.name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <DirectorySearch onSearch={handleSearch} />

      {/* Breadcrumb */}
      {viewMode !== "overview" && viewMode !== "search" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => setViewMode("overview")} className="hover:text-foreground">
            Directory
          </button>
          {selectedContinent && (
            <>
              <span>/</span>
              <button 
                onClick={() => setViewMode("continent")} 
                className="hover:text-foreground"
              >
                {selectedContinent.name}
              </button>
            </>
          )}
          {selectedCountry && (
            <>
              <span>/</span>
              <span className="text-foreground">{selectedCountry.name}</span>
            </>
          )}
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === "overview" && (
        <Tabs defaultValue="continents" className="space-y-4">
          <TabsList>
            <TabsTrigger value="continents" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Continents
            </TabsTrigger>
            <TabsTrigger value="countries" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Countries
            </TabsTrigger>
            <TabsTrigger value="cities" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Major Cities
            </TabsTrigger>
          </TabsList>

          <TabsContent value="continents" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Continents</h2>
              <Badge variant="secondary">{continents.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {continents.map((continent) => (
                <DirectoryCard
                  key={continent.id}
                  type="continent"
                  name={continent.name}
                  data={continent}
                  onClick={() => handleContinentClick(continent)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="countries" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Countries</h2>
              <Badge variant="secondary">{countries.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {countries.map((country) => (
                <DirectoryCard
                  key={country.id}
                  type="country"
                  name={country.name}
                  data={country}
                  onClick={() => handleCountryClick(country)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="cities" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">Major Cities</h2>
              <Badge variant="secondary">{cities.length}</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cities.map((city) => (
                <DirectoryCard
                  key={city.id}
                  type="city"
                  name={city.name}
                  data={city}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {viewMode === "continent" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Countries in {selectedContinent?.name}</h2>
            <Badge variant="secondary">{continentCountries.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      )}

      {viewMode === "country" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Cities in {selectedCountry?.name}</h2>
            <Badge variant="secondary">{countryCities.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {countryCities.map((city) => (
              <DirectoryCard
                key={city.id}
                type="city"
                name={city.name}
                data={city}
              />
            ))}
          </div>
        </div>
      )}

      {viewMode === "search" && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Search Results</h2>
          
          {searchResults.continents.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium">Continents</h3>
                <Badge variant="secondary">{searchResults.continents.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.continents.map((continent: any) => (
                  <DirectoryCard
                    key={continent.id}
                    type="continent"
                    name={continent.name}
                    data={continent}
                    onClick={() => handleContinentClick(continent)}
                  />
                ))}
              </div>
            </div>
          )}

          {searchResults.countries.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium">Countries</h3>
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
                <h3 className="text-lg font-medium">Cities</h3>
                <Badge variant="secondary">{searchResults.cities.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.cities.map((city: any) => (
                  <DirectoryCard
                    key={city.id}
                    type="city"
                    name={city.name}
                    data={city}
                  />
                ))}
              </div>
            </div>
          )}

          {searchResults.continents.length === 0 && 
           searchResults.countries.length === 0 && 
           searchResults.cities.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No results found. Try a different search term.
            </div>
          )}
        </div>
      )}
    </div>
  );
}