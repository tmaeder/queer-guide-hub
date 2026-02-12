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
    <Card sx={{ position: 'sticky', top: 16 }}>
      <CardHeader sx={{ pb: 2 }}>
        <CardTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '1.125rem' }}>
          <Filter style={{ height: 20, width: 20 }} />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Near Me */}
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <div sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ height: 16, width: 16 }} />
              <span sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Location</span>
            </div>
            <Switch
              checked={nearMe}
              onCheckedChange={handleNearMe}
              disabled={locationLoading}
            />
          </div>
          {nearMe && (
            <p sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Showing news relevant to your location
            </p>
          )}
        </div>

        <Separator />

        {/* Countries Filter */}
        {countries.length > 0 && (
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Globe style={{ height: 16, width: 16 }} />
              <span sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Countries</span>
            </div>
            <Select onValueChange={handleCountryToggle}>
              <SelectTrigger sx={{ width: '100%' }}>
                <SelectValue placeholder="Select countries" />
              </SelectTrigger>
              <SelectContent sx={{ maxHeight: 192, overflowY: 'auto' }}>
                {countries.map((country) => (
                  <SelectItem key={country.id} value={country.id}>
                    {country.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCountries.length > 0 && (
              <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {selectedCountries.map(countryId => {
                  const country = countries.find(c => c.id === countryId);
                  return country ? (
                    <Badge
                      key={countryId}
                      variant="default"
                      sx={{ cursor: 'pointer', fontSize: '0.75rem' }}
                      onClick={() => handleCountryToggle(countryId)}
                    >
                      {country.name}
                      <X style={{ height: 12, width: 12, marginLeft: 4 }} />
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Cities Filter */}
        {cities.length > 0 && (
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Map style={{ height: 16, width: 16 }} />
              <span sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Cities</span>
            </div>
            <Select onValueChange={handleCityToggle}>
              <SelectTrigger sx={{ width: '100%' }}>
                <SelectValue placeholder="Select cities" />
              </SelectTrigger>
              <SelectContent sx={{ maxHeight: 192, overflowY: 'auto' }}>
                {cities.map((city) => (
                  <SelectItem key={city.id} value={city.id}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCities.length > 0 && (
              <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {selectedCities.map(cityId => {
                  const city = cities.find(c => c.id === cityId);
                  return city ? (
                    <Badge
                      key={cityId}
                      variant="default"
                      sx={{ cursor: 'pointer', fontSize: '0.75rem' }}
                      onClick={() => handleCityToggle(cityId)}
                    >
                      {city.name}
                      <X style={{ height: 12, width: 12, marginLeft: 4 }} />
                    </Badge>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Tags Filter */}
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TagSelector
            selectedTags={selectedTags}
            onTagsChange={(tags) => {
              setSelectedTags(tags);
              setTimeout(triggerFiltersChange, 0);
            }}
            placeholder="Select news tags..."
            maxTags={10}
            categories={['news', 'politics', 'culture', 'business', 'education', 'health']}
            sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
          />
        </div>

        {/* Source Filter */}
        {sources.length > 0 && (
          <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Building style={{ height: 16, width: 16 }} />
              <span sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Source</span>
            </div>
            <Select value={source} onValueChange={handleSourceChange}>
              <SelectTrigger sx={{ width: '100%' }}>
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
        <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <div sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Calendar style={{ height: 16, width: 16 }} />
            <span sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Published Date</span>
          </div>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger sx={{ width: '100%' }}>
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
            <div sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <span sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Trending Tags</span>
              <div sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {trendingTags.slice(0, 8).map(({ tag, count }) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    sx={{ cursor: 'pointer', fontSize: '0.75rem', transition: 'all 0.2s', '&:hover': { bgcolor: 'primary.main', color: 'primary.contrastText' } }}
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
            <Button variant="outline" onClick={clearFilters} sx={{ width: '100%' }}>
              Clear All Filters
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};