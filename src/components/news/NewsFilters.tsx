import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Search, X, Filter, MapPin, Calendar, Tag, Building, Globe, Map } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TagSelector } from "@/components/tags/TagSelector";

type NewsSource = Tables<'news_sources'>;

interface CountryOption {
  id: string;
  name: string;
}

interface CityOption {
  id: string;
  name: string;
}

interface NewsFiltersProps {
  onFiltersChange: (filters: {
    search?: string;
    tags?: string[];
    countryIds?: string[];
    cityIds?: string[];
    source?: string;
    nearMe?: boolean;
    userLocation?: { lat: number; lng: number; };
    dateRange?: string;
  }) => void;
  trendingTags?: { tag: string; count: number; }[];
  sources?: NewsSource[];
}

export const NewsFilters = ({
  onFiltersChange,
  trendingTags = [],
  sources = []
}: NewsFiltersProps) => {
  const { toast } = useToast();
  const [source, setSource] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [dateRange, setDateRange] = useState<string>("");
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  // Fetch countries and cities
  useEffect(() => {
    const fetchData = async () => {
      // Fetch countries
      const { data: countriesData } = await supabase
        .from('countries')
        .select('id, name')
        .order('name');
      if (countriesData) setCountries(countriesData);

      // Fetch cities
      const { data: citiesData } = await supabase
        .from('cities')
        .select('id, name')
        .order('name');
      if (citiesData) setCities(citiesData);
    };

    fetchData();
  }, []);

  const triggerFiltersChange = () => {
    onFiltersChange({
      source: source || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      countryIds: selectedCountries.length > 0 ? selectedCountries : undefined,
      cityIds: selectedCities.length > 0 ? selectedCities : undefined,
      nearMe,
      userLocation: userLocation || undefined,
      dateRange: dateRange || undefined
    });
  };

  const handleSourceChange = (value: string) => {
    const newSource = value === "all" ? "" : value;
    setSource(newSource);
    setTimeout(triggerFiltersChange, 0);
  };


  const handleCountryToggle = (countryId: string) => {
    const newCountries = selectedCountries.includes(countryId) 
      ? selectedCountries.filter(c => c !== countryId) 
      : [...selectedCountries, countryId];
    setSelectedCountries(newCountries);
    setTimeout(triggerFiltersChange, 0);
  };

  const handleCityToggle = (cityId: string) => {
    const newCities = selectedCities.includes(cityId) 
      ? selectedCities.filter(c => c !== cityId) 
      : [...selectedCities, cityId];
    setSelectedCities(newCities);
    setTimeout(triggerFiltersChange, 0);
  };

  const handleNearMe = async () => {
    if (!nearMe) {
      setLocationLoading(true);
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(location);
        setNearMe(true);
        setTimeout(triggerFiltersChange, 0);
        toast({
          title: "Location found",
          description: "Showing news relevant to your location"
        });
      } catch (error) {
        toast({
          title: "Location Error",
          description: "Unable to get your location. Please allow location access.",
          variant: "destructive"
        });
      } finally {
        setLocationLoading(false);
      }
    } else {
      setNearMe(false);
      setUserLocation(null);
      setTimeout(triggerFiltersChange, 0);
    }
  };

  const handleDateRangeChange = (value: string) => {
    const newDateRange = value === "all" ? "" : value;
    setDateRange(newDateRange);
    setTimeout(triggerFiltersChange, 0);
  };

  const clearFilters = () => {
    setSource("");
    setSelectedTags([]);
    setSelectedCountries([]);
    setSelectedCities([]);
    setNearMe(false);
    setUserLocation(null);
    setDateRange("");
    onFiltersChange({});
  };

  const hasActiveFilters = source || selectedTags.length > 0 || selectedCountries.length > 0 || selectedCities.length > 0 || nearMe || dateRange;

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Filter className="h-5 w-5" />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Near Me */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-medium">Location</span>
            </div>
            <Switch
              checked={nearMe}
              onCheckedChange={handleNearMe}
              disabled={locationLoading}
            />
          </div>
          {nearMe && (
            <p className="text-xs text-muted-foreground">
              Showing news relevant to your location
            </p>
          )}
        </div>

        <Separator />

        {/* Countries Filter */}
        {countries.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              <span className="text-sm font-medium">Countries</span>
            </div>
            <Select onValueChange={handleCountryToggle}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select countries" />
              </SelectTrigger>
              <SelectContent className="max-h-48 overflow-y-auto">
                {countries.map((country) => (
                  <SelectItem key={country.id} value={country.id}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCountries.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCountries.map(countryId => {
                  const country = countries.find(c => c.id === countryId);
                  return country ? (
                    <Badge
                      key={countryId}
                      variant="default"
                      className="cursor-pointer text-xs"
                      onClick={() => handleCountryToggle(countryId)}
                    >
                      {country.name}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Cities Filter */}
        {cities.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              <span className="text-sm font-medium">Cities</span>
            </div>
            <Select onValueChange={handleCityToggle}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select cities" />
              </SelectTrigger>
              <SelectContent className="max-h-48 overflow-y-auto">
                {cities.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCities.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCities.map(cityId => {
                  const city = cities.find(c => c.id === cityId);
                  return city ? (
                    <Badge
                      key={cityId}
                      variant="default"
                      className="cursor-pointer text-xs"
                      onClick={() => handleCityToggle(cityId)}
                    >
                      {city.name}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Tags Filter */}
        <div className="space-y-3">
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={(tags) => {
              setSelectedTags(tags);
              setTimeout(triggerFiltersChange, 0);
            }}
            placeholder="Select news tags..."
            maxTags={10}
            categories={['news', 'politics', 'culture', 'business', 'education', 'health']}
            className="space-y-2"
          />
        </div>

        {/* Source Filter */}
        {sources.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4" />
              <span className="text-sm font-medium">Source</span>
            </div>
            <Select value={source} onValueChange={handleSourceChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((src) => (
                  <SelectItem key={src.id} value={src.id}>
                    {src.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Date Range Filter */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="text-sm font-medium">Published Date</span>
          </div>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
              <SelectItem value="2022">2022</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Trending Tags */}
        {trendingTags.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <span className="text-sm font-medium">Trending Tags</span>
              <div className="flex flex-wrap gap-2">
                {trendingTags.slice(0, 8).map(({ tag, count }) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
                    onClick={() => {
                      const newTags = selectedTags.includes(tag) 
                        ? selectedTags.filter(t => t !== tag) 
                        : [...selectedTags, tag];
                      setSelectedTags(newTags);
                      setTimeout(triggerFiltersChange, 0);
                    }}
                  >
                    {tag} ({count})
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <>
            <Separator />
            <Button variant="outline" onClick={clearFilters} className="w-full">
              Clear All Filters
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};