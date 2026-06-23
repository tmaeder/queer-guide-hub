import { useState, useEffect, useCallback } from 'react';
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
import { formatNewsTag } from '@/lib/newsTags';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { MultiCombobox, type MultiComboboxOption } from '@/components/events/MultiCombobox';
import { X, Filter, MapPin, Calendar, Building, Globe, Map, TrendingUp, Tag, Languages, Headphones, SmilePlus } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import type { DateRange } from 'react-day-picker';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from 'react-i18next';
import type { NewsCategory } from '@/hooks/useNews';

// Localized language label via Intl.DisplayNames (same approach as ContentLangBadge).
function languageLabel(code: string, uiLanguage: string): string {
  try {
    const DN = (Intl as unknown as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames;
    if (DN) {
      const out = new DN([uiLanguage], { type: 'language' }).of(code);
      if (out) return out;
    }
  } catch {
    /* fall through */
  }
  return code.toUpperCase();
}

interface LanguageOption {
  language: string;
  article_count?: number;
}

type NewsSource = Tables<'news_sources'>;

interface CountryOption {
  id: string;
  name: string;
  article_count?: number;
}

interface CityOption {
  id: string;
  name: string;
  article_count?: number;
}

interface NewsFiltersProps {
  onFiltersChange: (filters: {
    search?: string;
    tags?: string[];
    countryIds?: string[];
    cityIds?: string[];
    sourceId?: string;
    nearMe?: boolean;
    userLocation?: { lat: number; lng: number };
    dateRange?: { from?: string; to?: string };
    featured?: boolean;
    inStory?: boolean;
    category?: string;
    language?: string;
    mediaType?: 'podcast';
    sentiment?: string;
    trustScoreMin?: number;
    authorNames?: string[];
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
  const { i18n } = useTranslation();
  const [source, setSource] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [dateRange, setDateRange] = useState<string>('');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [inStoryOnly, setInStoryOnly] = useState(false);
  const [podcastsOnly, setPodcastsOnly] = useState(false);
  const [sentiment, setSentiment] = useState<string>('');
  const [trustScoreMin, setTrustScoreMin] = useState<number>(0);
  const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
  const [authors, setAuthors] = useState<MultiComboboxOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  // Fetch only countries/cities that actually have news content (E2). The
  // RPCs come from migration news_qa_countries_with_articles_rpc and return
  // {id, name, article_count} so the Select can show counts.
  useEffect(() => {
    const fetchData = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [countriesRes, citiesRes, languagesRes, authorsRes] = await Promise.all([
        supabase.rpc('news_countries_with_articles'),
        supabase.rpc('news_cities_with_articles'),
        db.rpc('news_languages_with_articles'),
        db.rpc('news_authors_with_articles'),
      ]);
      if (!countriesRes.error && Array.isArray(countriesRes.data)) {
        setCountries(countriesRes.data as CountryOption[]);
      }
      if (!citiesRes.error && Array.isArray(citiesRes.data)) {
        setCities(citiesRes.data as CityOption[]);
      }
      if (!languagesRes.error && Array.isArray(languagesRes.data)) {
        setLanguages(languagesRes.data as LanguageOption[]);
      }
      if (!authorsRes.error && Array.isArray(authorsRes.data)) {
        setAuthors(
          (authorsRes.data as Array<{ author: string; article_count: number }>).map((a) => ({
            value: a.author,
            label: `${a.author} (${a.article_count})`,
          })),
        );
      }
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
        customDateRange:
          overrides.customDateRange !== undefined ? overrides.customDateRange : customDateRange,
        featuredOnly: overrides.featuredOnly !== undefined ? overrides.featuredOnly : featuredOnly,
        inStoryOnly: overrides.inStoryOnly !== undefined ? overrides.inStoryOnly : inStoryOnly,
        podcastsOnly: overrides.podcastsOnly !== undefined ? overrides.podcastsOnly : podcastsOnly,
        category:
          overrides.selectedCategory !== undefined ? overrides.selectedCategory : selectedCategory,
        language:
          overrides.selectedLanguage !== undefined ? overrides.selectedLanguage : selectedLanguage,
        sentiment: overrides.sentiment !== undefined ? overrides.sentiment : sentiment,
        trustScoreMin:
          overrides.trustScoreMin !== undefined ? overrides.trustScoreMin : trustScoreMin,
        selectedAuthors:
          overrides.selectedAuthors !== undefined ? overrides.selectedAuthors : selectedAuthors,
      };

      const filters: Record<string, unknown> = {};

      if ((current.tags as string[])?.length > 0) filters.tags = current.tags;
      if ((current.countryIds as string[])?.length > 0) filters.countryIds = current.countryIds;
      if ((current.cityIds as string[])?.length > 0) filters.cityIds = current.cityIds;
      if (current.nearMe && current.userLocation) {
        filters.nearMe = true;
        filters.userLocation = current.userLocation;
      }
      if (current.featuredOnly) filters.featured = true;
      if (current.inStoryOnly) filters.inStory = true;
      if (current.podcastsOnly) filters.mediaType = 'podcast';
      if (current.category) filters.category = current.category;
      if (current.language) filters.language = current.language;
      if (current.sentiment) filters.sentiment = current.sentiment;
      if (typeof current.trustScoreMin === 'number' && (current.trustScoreMin as number) > 0) {
        filters.trustScoreMin = current.trustScoreMin;
      }
      if ((current.selectedAuthors as string[])?.length > 0) {
        filters.authorNames = current.selectedAuthors;
      }
      // Fix: emit sourceId (uuid) not source name as search string
      if (current.source) filters.sourceId = current.source;

      // Custom date range takes precedence over preset
      if (current.customDateRange) {
        const dr = current.customDateRange as DateRange;
        filters.dateRange = {
          ...(dr.from ? { from: dr.from.toISOString() } : {}),
          ...(dr.to ? { to: dr.to.toISOString() } : {}),
        };
      } else if (current.dateRange) {
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
            if (/^\d{4}$/.test(current.dateRange as string)) {
              const yr = parseInt(current.dateRange as string);
              filters.dateRange = {
                from: new Date(yr, 0, 1).toISOString(),
                to: new Date(yr, 11, 31, 23, 59, 59).toISOString(),
              };
            }
        }
      }

      onFiltersChange(filters);
    },
    [
      source,
      selectedCategory,
      selectedLanguage,
      selectedTags,
      selectedCountries,
      selectedCities,
      nearMe,
      userLocation,
      dateRange,
      customDateRange,
      featuredOnly,
      inStoryOnly,
      podcastsOnly,
      sentiment,
      trustScoreMin,
      selectedAuthors,
      onFiltersChange,
    ],
  );

  const handleLanguageChange = (value: string) => {
    const newLanguage = value === 'all' ? '' : value;
    setSelectedLanguage(newLanguage);
    emitFilters({ selectedLanguage: newLanguage });
  };

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

  const handleAuthorsChange = (next: string[]) => {
    setSelectedAuthors(next);
    emitFilters({ selectedAuthors: next });
  };

  const handleFeaturedToggle = () => {
    const newVal = !featuredOnly;
    setFeaturedOnly(newVal);
    emitFilters({ featuredOnly: newVal });
  };

  const handleInStoryToggle = () => {
    const newVal = !inStoryOnly;
    setInStoryOnly(newVal);
    emitFilters({ inStoryOnly: newVal });
  };

  const handlePodcastsToggle = () => {
    const newVal = !podcastsOnly;
    setPodcastsOnly(newVal);
    emitFilters({ podcastsOnly: newVal });
  };

  const clearFilters = () => {
    setSource('');
    setSelectedCategory('');
    setSelectedLanguage('');
    setSelectedTags([]);
    setSelectedCountries([]);
    setSelectedCities([]);
    setNearMe(false);
    setUserLocation(null);
    setDateRange('');
    setCustomDateRange(undefined);
    setShowCustomDate(false);
    setFeaturedOnly(false);
    setInStoryOnly(false);
    setPodcastsOnly(false);
    setSentiment('');
    setTrustScoreMin(0);
    setSelectedAuthors([]);
    onFiltersChange({});
  };

  const hasActiveFilters =
    source ||
    selectedCategory ||
    selectedLanguage ||
    selectedTags.length > 0 ||
    selectedCountries.length > 0 ||
    selectedCities.length > 0 ||
    nearMe ||
    dateRange ||
    customDateRange ||
    featuredOnly ||
    podcastsOnly ||
    sentiment ||
    trustScoreMin > 0 ||
    selectedAuthors.length > 0;

  return (
    <Card style={{ top: 16 }} className="sticky">
      <CardHeader className="pb-4">
        <CardTitle style={{ alignItems: 'center' }} className="flex gap-2 text-lg">
          <Filter size={20} />
          Filters
        </CardTitle>
      </CardHeader>
      <CardContent style={{ flexDirection: 'column' }} className="flex gap-6">
        {/* Featured Only */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Featured Only</span>
          <Switch checked={featuredOnly} onCheckedChange={handleFeaturedToggle} />
        </div>

        {/* Multi-article stories only */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Multi-article stories only</span>
          <Switch checked={inStoryOnly} onCheckedChange={handleInStoryToggle} />
        </div>

        {/* Podcasts only */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Headphones size={16} />
            Podcasts only
          </span>
          <Switch checked={podcastsOnly} onCheckedChange={handlePodcastsToggle} />
        </div>

        <Separator />

        {/* Sentiment */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <SmilePlus size={16} />
            <span className="text-sm font-medium">Sentiment</span>
          </div>
          <div className="flex gap-1">
            {(['', 'positive', 'neutral', 'negative'] as const).map((s) => (
              <Button
                key={s || 'any'}
                variant={sentiment === s ? 'default' : 'outline'}
                size="sm"
                style={{ flex: 1, fontSize: '0.7rem', padding: '0 4px', height: 28 }}
                onClick={() => {
                  setSentiment(s);
                  emitFilters({ sentiment: s });
                }}
              >
                {s || 'Any'}
              </Button>
            ))}
          </div>
        </div>

        {/* Trust score */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Min credibility</span>
            <span className="text-xs text-muted-foreground">{trustScoreMin > 0 ? `≥${trustScoreMin}` : 'Any'}</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={10}
            value={[trustScoreMin]}
            onValueChange={([v]) => {
              setTrustScoreMin(v);
              emitFilters({ trustScoreMin: v });
            }}
          />
        </div>

        <Separator />

        {/* Category Filter */}
        {categories.length > 0 && (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Tag size={16} />
                <span className="text-sm font-medium">Category</span>
              </div>
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
            </div>
            <Separator />
          </>
        )}

        {/* Language Filter */}
        {languages.length > 0 && (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <Languages size={16} />
                <span className="text-sm font-medium">Language</span>
              </div>
              <Select value={selectedLanguage || 'all'} onValueChange={handleLanguageChange}>
                <SelectTrigger style={{ width: '100%' }}>
                  <SelectValue placeholder="All languages" />
                </SelectTrigger>
                <SelectContent style={{ maxHeight: 240, overflowY: 'auto' }}>
                  <SelectItem value="all">All languages</SelectItem>
                  {languages.map((l) => (
                    <SelectItem key={l.language} value={l.language}>
                      {languageLabel(l.language, i18n.language || 'en')}
                      {l.article_count ? ` (${l.article_count})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
          </>
        )}

        {/* Near Me */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin size={16} />
              <span className="text-sm font-medium">Near Me</span>
            </div>
            <Switch checked={nearMe} onCheckedChange={handleNearMe} disabled={locationLoading} />
          </div>
          {nearMe && (
            <p className="text-xs text-muted-foreground">Showing news relevant to your location</p>
          )}
        </div>

        <Separator />

        {/* Countries Filter */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Globe size={16} />
            <span className="text-sm font-medium">Country</span>
          </div>
          <Select onValueChange={handleCountryToggle}>
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent style={{ maxHeight: 240, overflowY: 'auto' }}>
              {countries.map((country) => (
                <SelectItem key={country.id} value={country.id}>
                  {country.name}
                  {country.article_count ? ` (${country.article_count})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCountries.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedCountries.map((countryId) => {
                const country = countries.find((c) => c.id === countryId);
                return country ? (
                  <Badge
                    key={countryId}
                    variant="default"
                    style={{ fontSize: '0.7rem' }}
                    className="cursor-pointer"
                    onClick={() => handleCountryToggle(countryId)}
                  >
                    {country.name}
                    <X size={10} className="ml-1" />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Cities Filter */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Map size={16} />
            <span className="text-sm font-medium">City</span>
          </div>
          <Select onValueChange={handleCityToggle}>
            <SelectTrigger style={{ width: '100%' }}>
              <SelectValue placeholder="Select city" />
            </SelectTrigger>
            <SelectContent style={{ maxHeight: 240, overflowY: 'auto' }}>
              {cities.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                  {city.article_count ? ` (${city.article_count})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCities.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {selectedCities.map((cityId) => {
                const city = cities.find((c) => c.id === cityId);
                return city ? (
                  <Badge
                    key={cityId}
                    variant="default"
                    style={{ fontSize: '0.7rem' }}
                    className="cursor-pointer"
                    onClick={() => handleCityToggle(cityId)}
                  >
                    {city.name}
                    <X size={10} className="ml-1" />
                  </Badge>
                ) : null;
              })}
            </div>
          )}
        </div>

        <Separator />

        {/* Source Filter */}
        {sources.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Building size={16} />
              <span className="text-sm font-medium">Source</span>
            </div>
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
          </div>
        )}

        {/* Author Filter */}
        {authors.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">Author</span>
            <MultiCombobox
              options={authors}
              selected={selectedAuthors}
              onChange={handleAuthorsChange}
              placeholder="All authors"
              searchPlaceholder="Search authors…"
              emptyText="No authors found."
            />
          </div>
        )}

        {/* Date Range Filter */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            <span className="text-sm font-medium">Published Date</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {([['', 'Any'], ['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']] as [string, string][]).map(
              ([val, label]) => (
                <Badge
                  key={val || 'any'}
                  variant={dateRange === val && !customDateRange ? 'default' : 'outline'}
                  style={{ fontSize: '0.7rem', cursor: 'pointer' }}
                  onClick={() => {
                    const newVal = val;
                    setDateRange(newVal);
                    setCustomDateRange(undefined);
                    setShowCustomDate(false);
                    emitFilters({ dateRange: newVal, customDateRange: undefined });
                  }}
                >
                  {label}
                </Badge>
              ),
            )}
            <Badge
              variant={showCustomDate || customDateRange ? 'default' : 'outline'}
              style={{ fontSize: '0.7rem', cursor: 'pointer' }}
              onClick={() => {
                setShowCustomDate((v) => !v);
                if (!showCustomDate) setDateRange('');
              }}
            >
              Custom
            </Badge>
          </div>
          {showCustomDate && (
            <DatePickerWithRange
              date={customDateRange}
              onSelect={(range) => {
                setCustomDateRange(range ?? undefined);
                emitFilters({ customDateRange: range ?? undefined, dateRange: '' });
              }}
            />
          )}
        </div>

        {/* Trending Tags */}
        {trendingTags.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} />
                <span className="text-sm font-medium">Trending Topics</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {trendingTags.slice(0, 10).map(({ tag }) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                    style={{ fontSize: '0.7rem', transition: 'all 0.2s' }}
                    className="cursor-pointer"
                    onClick={() => handleTagToggle(tag)}
                  >
                    {formatNewsTag(tag)}
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
            <Button variant="outline" onClick={clearFilters} style={{ width: '100%' }}>
              Clear All Filters
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
