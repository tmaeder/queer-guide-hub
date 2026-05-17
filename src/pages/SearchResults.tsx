import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MapPin,
  Calendar,
  Star,
  Eye,
  Users,
  ShoppingBag,
  Newspaper,
  Globe,
  Plane,
  FileText,
  Search,
  Filter,
  ArrowUpDown,
  Grid,
  List,
  TrendingUp,
  Clock,
  Sparkles,
  Tag,
  User,
  Hotel,
  Tent,
  HelpCircle,
} from 'lucide-react';
import { useSearch, SearchResult, SearchFilters } from '@/hooks/useSearch';
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel';
import { ActiveFilterChips } from '@/components/search/ActiveFilterChips';
import { SavedSearchesMenu } from '@/components/search/SavedSearchesMenu';
import { BackToTopButton } from '@/components/search/BackToTopButton';
import { SearchFeedbackButtons } from '@/components/search/SearchFeedbackButtons';
import { LoadMoreSentinel } from '@/components/search/LoadMoreSentinel';
import { ResultsMapView } from '@/components/search/ResultsMapView';
import { useTrackClick } from '@/hooks/useSearchActions';
import { trackSearchUx } from '@/lib/searchClient';
import { useDidYouMean } from '@/hooks/useDidYouMean';
import { PageHeader } from '@/components/layout/PageHeader';
import { ColourfulText } from '@/components/effects/ColourfulText';
import { SpotlightV2 } from '@/components/effects/SpotlightV2';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { useTranslation } from 'react-i18next';
import { CONTENT_TYPES, supportsPriceSort, resolveType } from '@/lib/searchTaxonomy';

const MAX_HEADING_QUERY_LEN = 80;

const contentTypeIcons: Record<string, React.ComponentType<{ style?: React.CSSProperties }>> = {
  venue: MapPin,
  venues: MapPin,
  event: Calendar,
  events: Calendar,
  marketplace: ShoppingBag,
  user: Users,
  news: Newspaper,
  location: Globe,
  cities: Globe,
  countries: Globe,
  content: FileText,
  ressource: FileText,
  travel: Plane,
  personality: User,
  personalities: User,
  tag: Tag,
  tags: Tag,
  group: Users,
  hotels: Hotel,
  queer_villages: MapPin,
  festivals: Tent,
};

export default function SearchResults() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useLocalizedNavigate();
  const trackClick = useTrackClick();
  const isMobile = useIsMobile();
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTab, setSelectedTab] = useState('all');
  const initialSort = searchParams.get('sort') || 'relevance';
  const [sortBy, setSortBy] = useState(initialSort);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  // P0-4: 1-indexed page param survives reload; resets to 1 when q/sort/filters change.
  const initialPage = Math.max(1, Number(searchParams.get('page') || 1));
  const [page, setPage] = useState(initialPage);

  const query = searchParams.get('q') || '';
  const initialTypes = searchParams.get('types')?.split(',') || [];
  const initialLocation = searchParams.get('location') || undefined;
  const initialCategories = searchParams.get('categories')?.split(',') || [];
  const initialClusterIds = searchParams.get('clusters')?.split(',') || [];

  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  const initialLat = Number(searchParams.get('lat')) || undefined;
  const initialLng = Number(searchParams.get('lng')) || undefined;
  const initialRadius = Number(searchParams.get('radius')) || undefined;

  const [filters, setFilters] = useState<SearchFilters>({
    types: initialTypes,
    location: initialLocation,
    categories: initialCategories.length > 0 ? initialCategories : undefined,
    cluster_ids: initialClusterIds.length > 0 ? initialClusterIds : undefined,
    lat: initialLat,
    lng: initialLng,
    radius: initialRadius,
  });

  const activeTypes = selectedTab === 'all' ? filters.types : [selectedTab];
  const { results, loading, error, errorKind, totalHits, tooShort, facets } = useSearch(
    query,
    { ...filters, types: activeTypes },
    page,
  );

  const handleFiltersChange = (newFilters: SearchFilters) => {
    setFilters(newFilters);
    setPage(1); // P0-4: any filter change resets paging.
    const params = new URLSearchParams(searchParams);
    if (newFilters.types && newFilters.types.length > 0) {
      params.set('types', newFilters.types.join(','));
    } else {
      params.delete('types');
    }
    if (newFilters.location) {
      params.set('location', newFilters.location);
    } else {
      params.delete('location');
    }
    if (newFilters.categories && newFilters.categories.length > 0) {
      params.set('categories', newFilters.categories.join(','));
    } else {
      params.delete('categories');
    }
    if (newFilters.cluster_ids && newFilters.cluster_ids.length > 0) {
      params.set('clusters', newFilters.cluster_ids.join(','));
    } else {
      params.delete('clusters');
    }
    if (newFilters.lat !== undefined && newFilters.lng !== undefined) {
      params.set('lat', String(newFilters.lat));
      params.set('lng', String(newFilters.lng));
      if (newFilters.radius) params.set('radius', String(newFilters.radius));
    } else {
      params.delete('lat');
      params.delete('lng');
      params.delete('radius');
    }
    params.delete('page');
    setSearchParams(params);
  };

  // P1-7: Clear All in the filters panel must also clear the visible search input.
  const handleClearAll = () => {
    setSearchQuery('');
    setFilters({});
    setPage(1);
    const params = new URLSearchParams();
    if (sortBy && sortBy !== 'relevance') params.set('sort', sortBy);
    setSearchParams(params);
  };

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (sortBy && sortBy !== 'relevance') {
      params.set('sort', sortBy);
    } else {
      params.delete('sort');
    }
    params.delete('page');
    setSearchParams(params);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams/setSearchParams are from useSearchParams, stable refs; only re-run on sortBy
  }, [sortBy]);

  // P0-4: keep page param in URL in sync with state, removing when on page 1.
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (page > 1) params.set('page', String(page));
    else params.delete('page');
    setSearchParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Reset to page 1 whenever the query string itself changes.
  useEffect(() => {
    setPage(1);
  }, [query]);

  // Fire zero_results telemetry once when a real query lands with no hits.
  useEffect(() => {
    if (!query || loading || tooShort) return;
    if (totalHits === 0 && !errorKind) {
      void trackSearchUx('zero_results', {
        query,
        scope: filters.types && filters.types.length === 1 ? filters.types[0] : 'all',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, totalHits, loading, tooShort, errorKind]);

  const getResultsByType = (source: SearchResult[]) => {
    return source.reduce(
      (acc, result) => {
        if (!acc[result.type]) acc[result.type] = [];
        acc[result.type].push(result);
        return acc;
      },
      {} as Record<string, SearchResult[]>,
    );
  };

  const formatResultDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  const sortResults = (results: SearchResult[]) => {
    const sorted = [...results];
    switch (sortBy) {
      case 'newest':
        return sorted.sort(
          (a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime(),
        );
      case 'oldest':
        return sorted.sort(
          (a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime(),
        );
      case 'rating':
        return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'price-low':
        return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'price-high':
        return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'popular':
        return sorted.sort((a, b) => (b.metadata?.viewsCount || 0) - (a.metadata?.viewsCount || 0));
      case 'alpha-asc':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'alpha-desc':
        return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      default:
        return sorted;
    }
  };

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const params = new URLSearchParams(searchParams);
    params.set('q', searchQuery);
    setSearchParams(params);
  };

  const navigateToResult = (result: SearchResult) => {
    trackClick({ type: result.type, id: result.objectID }, 'search', { query });
    const slug = result.metadata?.slug || result.objectID;
    switch (result.type) {
      case 'venue':
      case 'venues':
        navigate(`/venues/${slug}`);
        break;
      case 'event':
      case 'events':
        navigate(`/events/${slug}`);
        break;
      case 'marketplace':
        navigate(`/marketplace/${slug}`);
        break;
      case 'user':
      case 'personalities':
      case 'personality':
        navigate(`/personalities/${slug}`);
        break;
      case 'news':
        navigate(`/news/${slug}`);
        break;
      case 'cities':
      case 'location':
        if (result.metadata?.isCountry) {
          navigate(`/country/${slug}`);
        } else {
          navigate(`/city/${slug}`);
        }
        break;
      case 'countries':
        navigate(`/country/${slug}`);
        break;
      case 'content':
      case 'ressource':
      case 'tags':
      case 'tag':
        navigate(`/resources/${slug}`);
        break;
      case 'hotels':
      case 'festivals':
      case 'queer_villages':
      case 'travel':
        navigate('/places');
        break;
      default:
        navigate(`/search?q=${encodeURIComponent(result.title)}`);
        break;
    }
  };

  const renderResultCard = (result: SearchResult) => {
    // P0-2: never render a card without an objectID — clicking would build a
    // /search?q=undefined link. P1-6: fall back to name/title legacy variants
    // so a personality with `name` but no `title` still shows its label.
    if (!result?.objectID) return null;
    const displayTitle =
      result.title ||
      (result as unknown as { name?: string }).name ||
      '';
    if (!displayTitle) return null;
    const Icon = contentTypeIcons[result.type] || HelpCircle;

    if (viewMode === 'grid') {
      return (
        <Card
          key={`${result.type}-${result.objectID}`}
          onClick={() => navigateToResult(result)}
        >
          <div className="relative">
            {result.imageUrl ? (
              <div
                className="relative overflow-hidden"
                style={{ aspectRatio: '16/9', borderRadius: '8px 8px 0 0' }}
              >
                <img
                  src={result.imageUrl}
                  alt={result.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.2s',
                  }}
                />
                <div className="absolute" style={{ top: 8, left: 8 }}>
                  <Badge
                    variant="secondary"
                    style={{ fontSize: '0.75rem', background: 'hsl(var(--card))' }}
                  >
                    <Icon style={{ width: 12, height: 12, marginRight: 4 }} />
                    {result.type}
                  </Badge>
                </div>
                {result.metadata?.featured && (
                  <div className="absolute" style={{ top: 8, right: 8 }}>
                    <Badge style={{ fontSize: '0.75rem' }}>
                      <Sparkles style={{ width: 12, height: 12, marginRight: 4 }} />
                      Featured
                    </Badge>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="flex items-center justify-center bg-muted"
                style={{ aspectRatio: '16/9', borderRadius: '8px 8px 0 0' }}
              >
                <Icon style={{ width: 48, height: 48, color: 'hsl(var(--muted-foreground))' }} />
              </div>
            )}
          </div>
          <CardContent style={{ padding: 16 }}>
            <p
              className="font-semibold mb-2"
              style={{
                fontSize: '1rem',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {result.title}
            </p>
            {result.description && (
              <p
                className="text-sm text-muted-foreground"
                style={{
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  marginBottom: 12,
                }}
              >
                {result.description}
              </p>
            )}
            <div className="flex flex-wrap items-center mb-3" style={{ gap: 8 }}>
              {result.location && (
                <div className="flex items-center" style={{ gap: 4 }}>
                  <MapPin style={{ width: 12, height: 12 }} />
                  <span className="text-xs text-muted-foreground">{result.location}</span>
                </div>
              )}
              {result.rating && (
                <div className="flex items-center" style={{ gap: 4 }}>
                  <Star style={{ width: 12, height: 12, fill: 'currentColor' }} />
                  <span className="text-xs text-muted-foreground">{result.rating}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              {result.price ? (
                <p className="font-semibold" style={{ fontSize: '1.125rem', color: 'hsl(var(--primary))' }}>
                  ${result.price}
                </p>
              ) : (
                <div />
              )}
              <div className="flex items-center" style={{ gap: 8 }}>
                <SearchFeedbackButtons
                  entity={{ type: result.type, id: result.objectID }}
                  query={query}
                />
                <Button
                  variant="outline"
                  size="sm"
                  style={{ transition: 'color 0.15s, background-color 0.15s' }}
                >
                  View
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card
        key={`${result.type}-${result.objectID}`}
        onClick={() => navigateToResult(result)}
      >
        <CardContent style={{ padding: 16 }}>
          <div className="flex items-start" style={{ gap: 16 }}>
            {result.imageUrl && (
              <div className="flex-shrink-0">
                <img
                  src={result.imageUrl}
                  alt={result.title}
                  style={{
                    width: 80,
                    height: 80,
                    objectFit: 'cover',
                    borderRadius: 8,
                    transition: 'transform 0.2s',
                  }}
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between" style={{ gap: 8 }}>
                <div className="flex-1">
                  <div className="flex items-center mb-2" style={{ gap: 8 }}>
                    <Icon style={{ width: 16, height: 16, color: 'hsl(var(--muted-foreground))' }} />
                    <Badge variant="secondary" style={{ fontSize: '0.75rem' }}>
                      {result.type}
                    </Badge>
                    {result.metadata?.featured && (
                      <Badge style={{ fontSize: '0.75rem' }}>
                        <Sparkles style={{ width: 12, height: 12, marginRight: 4 }} />
                        Featured
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold mb-2" style={{ fontSize: '1.125rem' }}>
                    {result.title}
                  </h3>
                  {result.description && (
                    <p
                      className="text-sm text-muted-foreground"
                      style={{
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        marginBottom: 12,
                      }}
                    >
                      {result.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center mb-3" style={{ gap: 16 }}>
                    {result.location && (
                      <div className="flex items-center" style={{ gap: 4 }}>
                        <MapPin style={{ width: 12, height: 12 }} />
                        <span className="text-sm text-muted-foreground">{result.location}</span>
                      </div>
                    )}
                    {result.date && (
                      <div className="flex items-center" style={{ gap: 4 }}>
                        <Calendar style={{ width: 12, height: 12 }} />
                        <span className="text-sm text-muted-foreground">
                          {formatResultDate(result.date)}
                        </span>
                      </div>
                    )}
                    {result.rating && (
                      <div className="flex items-center" style={{ gap: 4 }}>
                        <Star
                          style={{ width: 12, height: 12, fill: 'currentColor' }}
                        />
                        <span className="text-sm text-muted-foreground">{result.rating}</span>
                      </div>
                    )}
                    {result.metadata?.viewsCount && (
                      <div className="flex items-center" style={{ gap: 4 }}>
                        <Eye style={{ width: 12, height: 12 }} />
                        <span className="text-sm text-muted-foreground">
                          {result.metadata.viewsCount} views
                        </span>
                      </div>
                    )}
                  </div>
                  {result.metadata?.tags && result.metadata.tags.length > 0 && (
                    <div className="flex flex-wrap" style={{ gap: 4 }}>
                      {result.metadata.tags.slice(0, 4).map((tag: string, index: number) => (
                        <Badge key={index} variant="outline" style={{ fontSize: '0.75rem' }}>
                          {tag}
                        </Badge>
                      ))}
                      {result.metadata.tags.length > 4 && (
                        <Badge variant="outline" style={{ fontSize: '0.75rem' }}>
                          +{result.metadata.tags.length - 4} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end" style={{ gap: 8 }}>
                  {result.price && (
                    <p className="font-semibold" style={{ fontSize: '1.25rem', color: 'hsl(var(--primary))' }}>
                      ${result.price}
                    </p>
                  )}
                  <SearchFeedbackButtons
                    entity={{ type: result.type, id: result.objectID }}
                    query={query}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    style={{ transition: 'color 0.15s, background-color 0.15s' }}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Accumulate results across pages so /search behaves like infinite scroll
  // instead of paginated. Reset whenever the query/filter/sort/tab changes.
  const queryKey = `${query}|${selectedTab}|${JSON.stringify(filters)}|${sortBy}`;
  const [accumulated, setAccumulated] = useState<SearchResult[]>([]);
  const lastKeyRef = useRef('');
  const lastPageRef = useRef(0);

  useEffect(() => {
    if (loading) return;
    if (queryKey !== lastKeyRef.current) {
      // New query/filter/sort/tab — reset to the fresh page.
      lastKeyRef.current = queryKey;
      lastPageRef.current = page;
      setAccumulated(results);
    } else if (page > lastPageRef.current) {
      // Same scope, next page — append non-duplicate results.
      lastPageRef.current = page;
      setAccumulated((prev) => {
        const seen = new Set(prev.map((r) => r.objectID));
        const append = results.filter((r) => r.objectID && !seen.has(r.objectID));
        return append.length ? [...prev, ...append] : prev;
      });
    }
    // Same key + same page = no-op (avoids setState/re-render loops when the
    // useSearch hook re-creates its `results` array reference on every render).
  }, [results, loading, queryKey, page]);

  const resultsByType = getResultsByType(accumulated);
  const totalResults = accumulated.length;
  const sortedResults = sortResults(accumulated);
  const sortedResultsByType = Object.entries(resultsByType).reduce(
    (acc, [type, typeResults]) => {
      acc[type] = sortResults(typeResults);
      return acc;
    },
    {} as Record<string, SearchResult[]>,
  );
  const hasMore = totalResults < totalHits;
  const dymHit = useDidYouMean(
    query,
    !loading && !tooShort && totalHits === 0 && !errorKind,
  );

  const gridClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6';
  const listClass = 'flex flex-col gap-4';

  return (
    <div className="relative">
      <SpotlightV2 anchor="top-center" intensity={0.10} />
      <div className="container mx-auto px-4 py-8 relative">
      {/* Header */}
      <PageHeader
        title={<ColourfulText text="Search Results" />}
        subtitle={
          loading
            ? 'Searching across all content...'
            : query
              ? `${totalResults} results found for "${
                  query.length > MAX_HEADING_QUERY_LEN
                    ? query.slice(0, MAX_HEADING_QUERY_LEN) + '…'
                    : query
                }"`
              : undefined
        }
        actions={
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Filter style={{ width: 16, height: 16 }} />
            Filters
            {Object.values(filters).some((v) => v && (Array.isArray(v) ? v.length > 0 : true)) && (
              <Badge
                variant="destructive"
                style={{ marginLeft: 4, height: 20, width: 20, padding: 0, fontSize: '0.75rem' }}
              >
                !
              </Badge>
            )}
          </Button>
        }
      >
        {/* Enhanced Search Bar */}
        <div className="flex" style={{ gap: 12 }}>
          <div className="flex-1 relative">
            <Search
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 16,
                height: 16,
                color: 'hsl(var(--muted-foreground))',
              }}
            />
            <Input
              placeholder="Refine your search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              style={{ paddingLeft: 40 }}
            />
          </div>
          <Button onClick={handleSearch}>Search</Button>
        </div>
      </PageHeader>

      {/* Filters Panel — sticky card on desktop, bottom Sheet on mobile */}
      {showFilters && !isMobile && (
        <Card
          style={{
            position: 'sticky',
            top: 16,
            zIndex: 10,
            marginBottom: 16,
          }}
        >
          <SearchFiltersPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearAll={handleClearAll}
            facets={facets}
          />
        </Card>
      )}
      {isMobile && (
        <Sheet open={showFilters} onOpenChange={setShowFilters}>
          <SheetContent side="bottom" style={{ maxHeight: '85dvh', overflowY: 'auto' }}>
            <SheetHeader>
              <SheetTitle>Filters</SheetTitle>
            </SheetHeader>
            <SearchFiltersPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClearAll={handleClearAll}
              facets={facets}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Active filter chips + saved-search menu */}
      <div className="flex items-center justify-between" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ActiveFilterChips filters={filters} onFiltersChange={handleFiltersChange} />
        </div>
        <SavedSearchesMenu
          currentQueryString={searchParams.toString()}
          suggestedName={query}
          onLoad={(qs) => {
            const next = new URLSearchParams(qs);
            setSearchParams(next);
          }}
        />
      </div>

      {/* Results Controls */}
      {!loading && results.length > 0 && (
        <div
          className="flex flex-col sm:flex-row sm:items-center justify-between bg-muted mb-6"
          style={{ gap: 16, padding: 16, borderRadius: 8 }}
        >
          <div className="flex items-center" style={{ gap: 16 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <p className="text-sm font-medium">Sort by:</p>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger style={{ width: 160 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ zIndex: 50 }}>
                  <SelectItem value="relevance">
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <TrendingUp style={{ width: 12, height: 12 }} />
                      Relevance
                    </span>
                  </SelectItem>
                  <SelectItem value="newest">
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <Clock style={{ width: 12, height: 12 }} />
                      Newest
                    </span>
                  </SelectItem>
                  <SelectItem value="oldest">
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <Clock style={{ width: 12, height: 12, transform: 'rotate(180deg)' }} />
                      Oldest
                    </span>
                  </SelectItem>
                  <SelectItem value="rating">
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <Star style={{ width: 12, height: 12 }} />
                      Highest Rated
                    </span>
                  </SelectItem>
                  <SelectItem value="popular">
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <Eye style={{ width: 12, height: 12 }} />
                      Most Popular
                    </span>
                  </SelectItem>
                  {/* P2-11: only show price sort when every active type can have a price. */}
                  {supportsPriceSort(activeTypes) && (
                    <>
                      <SelectItem value="price-low">Price: Low to High</SelectItem>
                      <SelectItem value="price-high">Price: High to Low</SelectItem>
                    </>
                  )}
                  <SelectItem value="alpha-asc">
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <ArrowUpDown style={{ width: 12, height: 12 }} />A - Z
                    </span>
                  </SelectItem>
                  <SelectItem value="alpha-desc">
                    <span className="inline-flex items-center" style={{ gap: 8 }}>
                      <ArrowUpDown style={{ width: 12, height: 12, transform: 'rotate(180deg)' }} />
                      Z - A
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center" style={{ gap: 8 }}>
            <p className="text-sm font-medium">View:</p>
            <div className="flex items-center" style={{ borderRadius: 8 }}>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              >
                <List style={{ width: 16, height: 16 }} />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                style={{ borderRadius: 0 }}
              >
                <Grid style={{ width: 16, height: 16 }} />
              </Button>
              <Button
                variant={viewMode === 'map' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('map')}
                style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                aria-label="Map view"
              >
                <MapPin style={{ width: 16, height: 16 }} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <PageLoadingState count={6} variant={viewMode === 'grid' ? 'card' : 'list'} />
      ) : tooShort ? (
        // P2-8: helpful guidance instead of "0 results" for sub-MIN_QUERY_LEN inputs.
        <div
          className="flex flex-col items-center justify-center text-center"
          style={{ paddingTop: 48, paddingBottom: 48 }}
        >
          <Search
            style={{ width: 48, height: 48, color: 'hsl(var(--muted-foreground))', marginBottom: 16 }}
          />
          <h3 className="font-semibold mb-2" style={{ fontSize: '1.125rem' }}>
            Keep typing
          </h3>
          <p className="text-muted-foreground">
            Enter at least 2 characters to start searching.
          </p>
        </div>
      ) : results.length === 0 ? (
        <>
          {/* Search Suggestions -- shown when query is empty */}
          {(!query || query.trim() === '') && (
            <Card>
              <CardContent>
                <h3 className="font-semibold mb-4" style={{ fontSize: '1.125rem' }}>
                  Try searching for...
                </h3>
                <div className="flex flex-wrap mb-6" style={{ gap: 8 }}>
                  {[
                    'Berlin venues',
                    'Pride events',
                    'Drag shows',
                    'LGBTQ+ history',
                    'Queer artists',
                    'Safe spaces',
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        params.set('q', suggestion);
                        setSearchParams(params);
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mb-4">Or browse by category:</p>
                <div className="flex flex-wrap" style={{ gap: 8 }}>
                  {[
                    { label: 'Venues', path: '/venues' },
                    { label: 'Events', path: '/events' },
                    { label: 'Personalities', path: '/personalities' },
                    { label: 'News', path: '/news' },
                    { label: 'Places', path: '/places' },
                    { label: 'Resources', path: '/resources' },
                  ].map((cat) => (
                    <Button
                      key={cat.label}
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(cat.path)}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {query && query.trim() !== '' && errorKind === 'unavailable' && (
            <div
              role="alert"
              className="flex flex-col items-center justify-center text-center"
              style={{ paddingTop: 48, paddingBottom: 48 }}
            >
              <Search
                style={{
                  width: 48,
                  height: 48,
                  color: 'hsl(var(--muted-foreground))',
                  marginBottom: 16,
                }}
              />
              <h3 className="font-semibold mb-2" style={{ fontSize: '1.125rem' }}>
                Search is temporarily unavailable
              </h3>
              <p className="text-muted-foreground mb-4">
                {error ?? "We've been notified and are looking into it."}
              </p>
            </div>
          )}
          {query && query.trim() !== '' && errorKind !== 'unavailable' && (
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{ paddingTop: 48, paddingBottom: 48 }}
            >
              <Search
                style={{
                  width: 48,
                  height: 48,
                  color: 'hsl(var(--muted-foreground))',
                  marginBottom: 16,
                }}
              />
              <h3 className="font-semibold mb-2" style={{ fontSize: '1.125rem' }}>
                {t('search.noResultsFor', 'No results found for "{{q}}"', { q: query })}
              </h3>
              {dymHit && (dymHit.title || dymHit.name) && (
                <p className="mb-4">
                  <Button
                    variant="link"
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set('q', (dymHit.title || dymHit.name) as string);
                      params.delete('types');
                      setSearchParams(params);
                    }}
                  >
                    {t('search.didYouMean', 'Did you mean "{{q}}"?', { q: (dymHit.title || dymHit.name) as string })}
                  </Button>
                </p>
              )}
              <p className="text-muted-foreground mb-4">
                {t('search.tryDifferent', 'Try different keywords or adjust your filters')}
              </p>
              <div className="flex" style={{ gap: 12 }}>
                <Button variant="outline" onClick={() => setShowFilters(true)}>
                  Adjust Filters
                </Button>
              </div>
              <div style={{ marginTop: 32 }}>
                <p className="text-sm text-muted-foreground mb-4">Or try one of these searches:</p>
                <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
                  {[
                    'Berlin venues',
                    'Pride events',
                    'Drag shows',
                    'LGBTQ+ history',
                    'Queer artists',
                    'Safe spaces',
                  ].map((suggestion) => (
                    <Button
                      key={suggestion}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const params = new URLSearchParams(searchParams);
                        params.set('q', suggestion);
                        setSearchParams(params);
                      }}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList style={{ marginBottom: 24 }}>
            <TabsTrigger value="all">All ({totalResults})</TabsTrigger>
            {Object.entries(resultsByType).map(([type, typeResults]) => {
              const Icon = contentTypeIcons[type] || HelpCircle;
              // P2-10/P3-12: never render `undefined (n)` — fall back to taxonomy
              // label or a neutral "Other" bucket.
              const canonicalId = resolveType(type);
              const label =
                CONTENT_TYPES.find((t) => t.id === canonicalId)?.label ??
                (type && type !== 'undefined' ? type : 'Other');
              return (
                <TabsTrigger
                  key={type || 'other'}
                  value={type}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <Icon style={{ width: 12, height: 12 }} />
                  {label} ({typeResults.length})
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="all">
            {viewMode === 'map' ? (
              <ResultsMapView
                results={sortedResults}
                onSelect={navigateToResult}
                onAreaSearch={(area) => handleFiltersChange({ ...filters, ...area })}
              />
            ) : Object.keys(sortedResultsByType).length > 1 ? (
              <div className="flex flex-col" style={{ gap: 32 }}>
                {Object.entries(sortedResultsByType).map(([type, typeResults]) => {
                  const Icon = contentTypeIcons[type] || HelpCircle;
                  const canonicalId = resolveType(type);
                  const label =
                    CONTENT_TYPES.find((t) => t.id === canonicalId)?.label ??
                    (type && type !== 'undefined' ? type : 'Other');
                  const topN = typeResults.slice(0, 3);
                  return (
                    <section key={type || 'other'} aria-label={label}>
                      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                        <h2 className="font-semibold inline-flex items-center" style={{ fontSize: '1rem', gap: 8 }}>
                          <Icon style={{ width: 16, height: 16 }} />
                          {label}
                          <span className="text-muted-foreground" style={{ fontWeight: 400 }}>
                            ({typeResults.length})
                          </span>
                        </h2>
                        {typeResults.length > topN.length && (
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => setSelectedTab(type)}
                          >
                            See all {typeResults.length} →
                          </Button>
                        )}
                      </div>
                      <div className={viewMode === 'grid' ? gridClass : listClass}>
                        {topN.map(renderResultCard)}
                      </div>
                    </section>
                  );
                })}
                <LoadMoreSentinel
                  hasMore={hasMore}
                  loading={loading}
                  onLoadMore={() => setPage((p) => p + 1)}
                />
              </div>
            ) : (
              <>
                <div className={viewMode === 'grid' ? gridClass : listClass}>
                  {sortedResults.map(renderResultCard)}
                </div>
                <LoadMoreSentinel
                  hasMore={hasMore}
                  loading={loading}
                  onLoadMore={() => setPage((p) => p + 1)}
                />
              </>
            )}
          </TabsContent>

          {Object.entries(sortedResultsByType).map(([type, typeResults]) => (
            <TabsContent key={type} value={type}>
              {viewMode === 'map' ? (
                <ResultsMapView
                  results={typeResults}
                  onSelect={navigateToResult}
                  onAreaSearch={(area) => handleFiltersChange({ ...filters, ...area })}
                />
              ) : (
                <>
                  <div className={viewMode === 'grid' ? gridClass : listClass}>
                    {typeResults.map(renderResultCard)}
                  </div>
                  <LoadMoreSentinel
                    hasMore={hasMore}
                    loading={loading}
                    onLoadMore={() => setPage((p) => p + 1)}
                  />
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
      </div>
      <BackToTopButton />
      {isMobile && (
        <button
          type="button"
          onClick={() => setShowFilters(true)}
          aria-label="Open filters"
          style={{
            position: 'fixed',
            left: 16,
            bottom: 16,
            zIndex: 40,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '10px 14px',
            background: 'hsl(var(--foreground))',
            color: 'hsl(var(--background))',
            border: 0,
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          <Filter style={{ width: 16, height: 16 }} />
          Filters
          {Object.values(filters).some((v) => v && (Array.isArray(v) ? v.length > 0 : true)) && (
            <Badge variant="destructive" style={{ marginLeft: 4, height: 18, padding: '0 6px', fontSize: '0.7rem' }}>
              {
                (filters.types?.length || 0)
                + (filters.location ? 1 : 0)
                + (filters.categories?.length || 0)
                + (filters.cluster_ids?.length || 0)
                + (filters.priceRange ? 1 : 0)
                + (filters.dateRange ? 1 : 0)
                + (filters.rating ? 1 : 0)
                + (filters.featured ? 1 : 0)
                + (filters.verified ? 1 : 0)
              }
            </Badge>
          )}
        </button>
      )}
    </div>
  );
}
