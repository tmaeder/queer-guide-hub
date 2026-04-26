import { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { X, Filter, MapPin, Calendar, Building, Globe, Map, TrendingUp, Tag } from 'lucide-react';
import { Tables } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { NewsCategory } from '@/hooks/useNews';

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
    userLocation?: { lat: number; lng: number };
    dateRange?: { from?: string; to?: string };
    featured?: boolean;
    category?: string;
  }) => void;
  trendingTags?: { tag: string; count: number }[];
  sources?: NewsSource[];
  categories?: NewsCategory[];
}

export const NewsFilters = ({
  onFiltersChange,
  trendingTags = [],
  sources = [],
  categories = [],
}: NewsFiltersProps) => {
  const { toast } = useToast();
  const [source, setSource] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [dateRange, setDateRange] = useState<string>('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  // Fetch countries and cities
  useEffect(() => {
    const fetchData = async () => {
      const [{ data: countriesData }, { data: citiesData }] = await Promise.all([
        supabase.from('countries').select('id, name').order('name'),
        supabase.from('cities').select('id, name').order('name'),
      ]);
      if (countriesData) setCountries(countriesData);
      if (citiesData) setCities(citiesData);
    };
    fetchData();
  }, []);
  const emitFilters = useCallback(
    (overrides: Record<string, unknown> = {}) => {
      const current = {
        source: overrides.source !== undefined ? overrides.source : source,
        tags: overrides.selectedTags !== undefined ? overrides.selectedTags : selectedTags,
        countryIds:
          overrides.selectedCountries !== undefined
            ? overrides.selectedCountries
            : selectedCountries,
        cityIds: overrides.selectedCities !== undefined ? overrides.selectedCities : selectedCities,
        nearMe: overrides.nearMe !== undefined ? overrides.nearMe : nearMe,
        userLocation: overrides.userLocation !== undefined ? overrides.userLocation : userLocation,
        dateRange: overrides.dateRange !== undefined ? overrides.dateRange : dateRange,
        featuredOnly: overrides.featuredOnly !== undefined ? overrides.featuredOnly : featuredOnly,
        category:
          overrides.selectedCategory !== undefined ? overrides.selectedCategory : selectedCategory,
      };

      // Build the filter object
      const filters: Record<string, unknown> = {};

      if (current.tags?.length > 0) filters.tags = current.tags;
      if (current.countryIds?.length > 0) filters.countryIds = current.countryIds;
      if (current.cityIds?.length > 0) filters.cityIds = current.cityIds;
      if (current.nearMe && current.userLocation) {
        filters.nearMe = true;
        filters.userLocation = current.userLocation;
      }
      if (current.featuredOnly) filters.featured = true;
      if (current.category) filters.category = current.category;

      // Convert date range string to from/to
      if (current.dateRange) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        switch (current.dateRange) {
          case 'today':
            filters.dateRange = { from: today.toISOString() };
            break;
          case 'week': {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filters.dateRange = { from: weekAgo.toISOString() };
            break;
          }
          case 'month': {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            filters.dateRange = { from: monthAgo.toISOString() };
            break;
          }
          case 'year': {
            const yearStart = new Date(now.getFullYear(), 0, 1);
            filters.dateRange = { from: yearStart.toISOString() };
            break;
          }
          default:
            // Numeric year like "2024"
            if (/^\d{4}$/.test(current.dateRange)) {
              const yr = parseInt(current.dateRange);
              filters.dateRange = {
                from: new Date(yr, 0, 1).toISOString(),
                to: new Date(yr, 11, 31, 23, 59, 59).toISOString(),
              };
            }
        }
      }

      // Search by source name (filter in the quick search)
      if (current.source) {
        const src = sources.find((s) => s.id === current.source);
        if (src) filters.search = src.name;
      }

      onFiltersChange(filters);
    },
    [
      source,
      selectedCategory,
      selectedTags,
      selectedCountries,
      selectedCities,
      nearMe,
      userLocation,
      dateRange,
      featuredOnly,
      sources,
      onFiltersChange,
    ],
  );

  const handleCategoryChange = (value: string) => {
    const newCategory = value === 'all' ? '' : value;
    setSelectedCategory(newCategory);
    emitFilters({ selectedCategory: newCategory });
  };

  const handleSourceChange = (value: string) => {
    const newSource = value === 'all' ? '' : value;
    setSource(newSource);
    emitFilters({ source: newSource });
  };

  const handleCountryToggle = (countryId: string) => {
    const newCountries = selectedCountries.includes(countryId)
      ? selectedCountries.filter((c) => c !== countryId)
      : [...selectedCountries, countryId];
    setSelectedCountries(newCountries);
    emitFilters({ selectedCountries: newCountries });
  };

  const handleCityToggle = (cityId: string) => {
    const newCities = selectedCities.includes(cityId)
      ? selectedCities.filter((c) => c !== cityId)
      : [...selectedCities, cityId];
    setSelectedCities(newCities);
    emitFilters({ selectedCities: newCities });
  };

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
    emitFilters({ selectedTags: newTags });
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
          lng: position.coords.longitude,
        };
        setUserLocation(location);
        setNearMe(true);
        emitFilters({ nearMe: true, userLocation: location });
        toast({
          title: 'Location found',
          description: 'Showing news relevant to your location',
        });
      } catch (_error) {
        toast({
          title: 'Location Error',
          description: 'Unable to get your location. Please allow location access.',
          variant: 'destructive',
        });
      } finally {
        setLocationLoading(false);
      }
    } else {
      setNearMe(false);
      setUserLocation(null);
      emitFilters({ nearMe: false, userLocation: null });
    }
  };

  const handleDateRangeChange = (value: string) => {
    const newDateRange = value === 'all' ? '' : value;
    setDateRange(newDateRange);
    emitFilters({ dateRange: newDateRange });
  };

  const handleFeaturedToggle = () => {
    const newVal = !featuredOnly;
    setFeaturedOnly(newVal);
    emitFilters({ featuredOnly: newVal });
  };

  const clearFilters = () => {
    setSource('');
    setSelectedCategory('');
    setSelectedTags([]);
    setSelectedCountries([]);
    setSelectedCities([]);
    setNearMe(false);
    setUserLocation(null);
    setDateRange('');
    setFeaturedOnly(false);
    onFiltersChange({});
  };

  const hasActiveFilters =
    source ||
    selectedCategory ||
    selectedTags.length > 0 ||
    selectedCountries.length > 0 ||
    selectedCities.length > 0 ||
    nearMe ||
    dateRange ||
    featuredOnly;

  return (
    <Card style={{ position: 'sticky', top: 16 }}>
      <CardHeader style={{ paddingBottom: 16 }}>
        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.125rem' }}>
          <Filter style={{ height: 20, width: 20 }} />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Featured Only */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
            Featured Only
          </Box>
          <Switch checked={featuredOnly} onCheckedChange={handleFeaturedToggle} />
        </Box>

        <Separator />

        {/* Category Filter */}
        {categories.length > 0 && (
          <>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tag style={{ height: 16, width: 16 }} />
                <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  Category
                </Box>
              </Box>
              <Select value={selectedCategory || 'all'} onValueChange={handleCategoryChange}>
                <SelectTrigger style={{ width: '100%' }}>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.slug}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
            <Separator />
          </>
        )}

        {/* Near Me */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MapPin style={{ height: 16, width: 16 }} />
              <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Near Me
              </Box>
            </Box>
            <Switch checked={nearMe} onCheckedChange={handleNearMe} disabled={locationLoading} />
          </Box>
          {nearMe && (
            <Typography variant="caption" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              Showing news relevant to your location
            </Typography>
          )}
        </Box>

        <Separator />

        {/* Countries Filter */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Globe style={{ height: 16, width: 16 }} />
            <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
              Country
            </Box>
          </Box>
          <Select onValueChange={handleCountryToggle}>
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent style={{ maxHeight: 240, overflowY: 'auto' }}>
              {countries.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCountries.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selectedCountries.map((countryId) => {
                const country = countries.find((c) => c.id === countryId);
                return country ? (
                  <Badge
                    key={countryId}
                    variant="default"
                    style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                    onClick={() => handleCountryToggle(countryId)}
                  >
                    {country.name}
                    <X style={{ height: 10, width: 10, marginLeft: 4 }} />
                  </Badge>
                ) : null;
              })}
            </Box>
          )}
        </Box>

        {/* Cities Filter */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Map style={{ height: 16, width: 16 }} />
            <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
              City
            </Box>
          </Box>
          <Select onValueChange={handleCityToggle}>
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent style={{ maxHeight: 240, overflowY: 'auto' }}>
              {cities.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCities.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selectedCities.map((cityId) => {
                const city = cities.find((c) => c.id === cityId);
                return city ? (
                  <Badge
                    key={cityId}
                    variant="default"
                    style={{ cursor: 'pointer', fontSize: '0.7rem' }}
                    onClick={() => handleCityToggle(cityId)}
                  >
                    {city.name}
                    <X style={{ height: 10, width: 10, marginLeft: 4 }} />
                  </Badge>
                ) : null;
              })}
            </Box>
          )}
        </Box>

        <Separator />

        {/* Source Filter */}
        {sources.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Building style={{ height: 16, width: 16 }} />
              <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Source
              </Box>
            </Box>
            <Select value={source} onValueChange={handleSourceChange}>
              <SelectTrigger style={{ width: '100%' }}>
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent style={{ maxHeight: 240, overflowY: 'auto' }}>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((src) => (
                  <SelectItem key={src.id} value={src.id}>
                    {src.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Box>
        )}

        {/* Date Range Filter */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Calendar style={{ height: 16, width: 16 }} />
            <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
              Published Date
            </Box>
          </Box>
          <Select value={dateRange} onValueChange={handleDateRangeChange}>
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue placeholder="All dates" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This week</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="year">This year</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
            </SelectContent>
          </Select>
        </Box>

        {/* Trending Tags */}
        {trendingTags.length > 0 && (
          <>
            <Separator />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUp style={{ height: 16, width: 16 }} />
                <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  Trending Topics
                </Box>
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {trendingTags.slice(0, 10).map(({ tag }) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                    style={{ cursor: 'pointer', fontSize: '0.7rem', transition: 'all 0.2s' }}
                    onClick={() => handleTagToggle(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </Box>
            </Box>
          </>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <>
            <Separator />
            <Button variant="outline" onClick={clearFilters} style={{ width: '100%' }}>
              Clear All Filters
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
