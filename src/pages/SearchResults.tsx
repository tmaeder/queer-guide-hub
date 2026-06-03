import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  Star,
  Eye,
  Clock,
  TrendingUp,
  ArrowUpDown,
  List,
  Grid,
  MapPin,
  Navigation,
  Sparkles,
} from 'lucide-react';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSearch, type SearchResult, type SearchFilters } from '@/hooks/useSearch';
import { useAssistant } from '@/hooks/useAssistant';
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel';
import { ActiveFilterChips } from '@/components/search/ActiveFilterChips';
import { SavedSearchesMenu } from '@/components/search/SavedSearchesMenu';
import { BackToTopButton } from '@/components/search/BackToTopButton';
import { LoadMoreSentinel } from '@/components/search/LoadMoreSentinel';
import { ResultsMapView } from '@/components/search/ResultsMapView';
import { SearchScopeChips } from '@/components/search/SearchScopeChips';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import { SearchAskPanel } from '@/components/search/SearchAskPanel';
import { useTrackClick } from '@/hooks/useSearchActions';
import { trackSearchUx } from '@/lib/searchClient';
import { useDidYouMean } from '@/hooks/useDidYouMean';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { supportsPriceSort } from '@/lib/searchTaxonomy';
import { hrefForEntity } from '@/lib/searchRoutes';
import type { AssistantCard } from '@/lib/assistantClient';
import { cn } from '@/lib/utils';

const MAX_HEADING_QUERY_LEN = 80;
const SUGGESTED_SEARCHES = [
  'Berlin venues',
  'Pride events',
  'Drag shows',
  'LGBTQ+ history',
  'Queer artists',
  'Safe spaces',
];

function countActiveFilters(f: SearchFilters): number {
  return (
    (f.types?.length || 0) +
    (f.location ? 1 : 0) +
    (f.categories?.length || 0) +
    (f.cluster_ids?.length || 0) +
    (f.priceRange ? 1 : 0) +
    (f.dateRange ? 1 : 0) +
    (f.rating ? 1 : 0) +
    (f.featured ? 1 : 0) +
    (f.verified ? 1 : 0) +
    (f.lat != null && f.lng != null ? 1 : 0)
  );
}

export default function SearchResults() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useLocalizedNavigate();
  const trackClick = useTrackClick();
  const isMobile = useIsMobile();

  const query = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(query);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('list');
  const [page, setPage] = useState(1);
  const [askOpen, setAskOpen] = useState(false);

  const initialLat = Number(searchParams.get('lat')) || undefined;
  const initialLng = Number(searchParams.get('lng')) || undefined;
  const [filters, setFilters] = useState<SearchFilters>({
    types: searchParams.get('types')?.split(',').filter(Boolean) || [],
    location: searchParams.get('location') || undefined,
    categories: searchParams.get('categories')?.split(',').filter(Boolean) || undefined,
    cluster_ids: searchParams.get('clusters')?.split(',').filter(Boolean) || undefined,
    lat: initialLat,
    lng: initialLng,
    radius: Number(searchParams.get('radius')) || undefined,
  });
  const geoActive = filters.lat != null && filters.lng != null;
  const [sortBy, setSortBy] = useState(
    searchParams.get('sort') || (geoActive ? 'distance' : 'relevance'),
  );

  const activeScope = filters.types && filters.types.length === 1 ? filters.types[0] : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync input with URL query.
    setSearchQuery(query);
  }, [query]);

  const { results, loading, error, errorKind, totalHits, tooShort, facets } = useSearch(
    query,
    filters,
    page,
  );

  // ── URL sync ───────────────────────────────────────────────────────────
  const writeFilterParams = useCallback(
    (next: SearchFilters, nextSort = sortBy) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (next.types?.length) params.set('types', next.types.join(','));
      if (next.location) params.set('location', next.location);
      if (next.categories?.length) params.set('categories', next.categories.join(','));
      if (next.cluster_ids?.length) params.set('clusters', next.cluster_ids.join(','));
      if (next.lat != null && next.lng != null) {
        params.set('lat', String(next.lat));
        params.set('lng', String(next.lng));
        if (next.radius) params.set('radius', String(next.radius));
      }
      if (nextSort && nextSort !== 'relevance') params.set('sort', nextSort);
      setSearchParams(params);
    },
    [query, sortBy, setSearchParams],
  );

  const handleFiltersChange = useCallback(
    (next: SearchFilters) => {
      setFilters(next);
      setPage(1);
      writeFilterParams(next);
    },
    [writeFilterParams],
  );

  const handleScopeChange = useCallback(
    (scope: string | null) => {
      handleFiltersChange({ ...filters, types: scope ? [scope] : [] });
    },
    [filters, handleFiltersChange],
  );

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setFilters({});
    setPage(1);
    const params = new URLSearchParams();
    if (sortBy && sortBy !== 'relevance') params.set('sort', sortBy);
    setSearchParams(params);
  }, [sortBy, setSearchParams]);

  const handleSortChange = useCallback(
    (next: string) => {
      setSortBy(next);
      setPage(1);
      writeFilterParams(filters, next);
      void trackSearchUx('facet_apply', { facet: 'sort', value: next, query });
    },
    [filters, query, writeFilterParams],
  );

  // Reset paging when the query string changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on new query.
    setPage(1);
  }, [query]);

  const submitSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    const params = new URLSearchParams(searchParams);
    params.set('q', searchQuery);
    setSearchParams(params);
  }, [searchQuery, searchParams, setSearchParams]);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      trackClick({ type: result.type, id: result.objectID }, 'search', { query });
      navigate(
        hrefForEntity({
          type: result.type,
          slug: (result.metadata?.slug as string) || result.objectID,
          title: result.title,
          isCountry: Boolean(result.metadata?.isCountry),
        }),
      );
    },
    [navigate, trackClick, query],
  );

  // ── Inline AI ──────────────────────────────────────────────────────────
  const assistant = useAssistant();
  const openAsk = useCallback(() => {
    setAskOpen(true);
    const q = query.trim();
    if (q && assistant.messages.length === 0 && !assistant.pending) void assistant.send(q);
  }, [query, assistant]);

  const navigateToCard = useCallback(
    (card: AssistantCard) => {
      setAskOpen(false);
      navigate(
        hrefForEntity({ type: card.type, slug: (card.slug as string) || card.objectID, title: card.title }),
      );
    },
    [navigate],
  );

  // ── Accumulate pages (infinite scroll), keep previous during refetch ─────
  const queryKey = `${query}|${JSON.stringify(filters)}`;
  const [accumulated, setAccumulated] = useState<SearchResult[]>([]);
  const lastKeyRef = useRef('');
  useEffect(() => {
    if (loading) return; // keep previous results visible while refetching
    setAccumulated((prev) => {
      if (queryKey !== lastKeyRef.current) {
        lastKeyRef.current = queryKey;
        return results;
      }
      const seen = new Set(prev.map((r) => r.objectID));
      const fresh = results.filter((r) => r.objectID && !seen.has(r.objectID));
      if (fresh.length > 0) return [...prev, ...fresh];
      return prev.length === results.length ? prev : results;
    });
  }, [results, loading, queryKey]);

  const sortedResults = useMemo(() => {
    const sorted = [...accumulated];
    switch (sortBy) {
      case 'distance':
        return sorted.sort(
          (a, b) => (a._distance_m ?? Infinity) - (b._distance_m ?? Infinity),
        );
      case 'newest':
        return sorted.sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.date || '').getTime() - new Date(b.date || '').getTime());
      case 'rating':
        return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      case 'price-low':
        return sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
      case 'price-high':
        return sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
      case 'popular':
        return sorted.sort(
          (a, b) =>
            ((b.metadata?.viewsCount as number) || 0) - ((a.metadata?.viewsCount as number) || 0),
        );
      case 'alpha-asc':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'alpha-desc':
        return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      default:
        return sorted;
    }
  }, [accumulated, sortBy]);

  const totalResults = accumulated.length;
  const hasMore = totalResults < totalHits;
  const activeFilterCount = countActiveFilters(filters);
  const showInitialSkeleton = loading && accumulated.length === 0;
  const hasQuery = query.trim().length > 0;

  // Fire zero_results telemetry once when a real query lands with no hits.
  useEffect(() => {
    if (!query || query.trim().length < 2 || loading || tooShort) return;
    if (totalHits === 0 && !errorKind) {
      void trackSearchUx('zero_results', { query, scope: activeScope || 'all' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, totalHits, loading, tooShort, errorKind]);

  const dymHit = useDidYouMean(
    query,
    query.trim().length >= 2 && !loading && !tooShort && totalHits === 0 && !errorKind,
  );

  const gridClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
  const listClass = 'flex flex-col gap-3';

  const askButton = (
    <Button variant="outline" size="sm" onClick={openAsk} className="gap-2">
      <Sparkles className="h-4 w-4" />
      {t('search.ask.title', 'Ask the guide')}
    </Button>
  );

  return (
    <div className="relative">
      <div className="container relative mx-auto px-4 py-8">
        <PageHeader
          title={t('search.resultsTitle', 'Search')}
          subtitle={
            loading && accumulated.length === 0
              ? t('search.searching', 'Searching…')
              : hasQuery
                ? t('search.resultsCount', {
                    defaultValue: '{{count}} results for "{{q}}"',
                    count: totalHits,
                    q:
                      query.length > MAX_HEADING_QUERY_LEN
                        ? query.slice(0, MAX_HEADING_QUERY_LEN) + '…'
                        : query,
                  })
                : undefined
          }
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('search.refine', 'Refine your search…')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
                className="pl-10"
              />
            </div>
            <Button onClick={submitSearch}>{t('search.button', 'Search')}</Button>
          </div>
        </PageHeader>

        {/* Filters panel — sticky card on desktop, bottom Sheet on mobile */}
        {showFilters && !isMobile && (
          <Card className="sticky mb-4" style={{ top: 16, zIndex: 10 }}>
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
                <SheetTitle>{t('search.filters', 'Filters')}</SheetTitle>
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

        {hasQuery && (
          <>
            {/* Scope chips */}
            <SearchScopeChips activeScope={activeScope} onScopeChange={handleScopeChange} />

            {/* Active filter chips + saved searches */}
            <div className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <ActiveFilterChips filters={filters} onFiltersChange={handleFiltersChange} />
              </div>
              <SavedSearchesMenu
                currentQueryString={searchParams.toString()}
                suggestedName={query}
                onLoad={(qs) => setSearchParams(new URLSearchParams(qs))}
              />
            </div>

            {/* Controls bar */}
            <div className="mb-6 flex flex-col gap-3 rounded-element bg-muted p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('search.sortBy', 'Sort')}</span>
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="relevance">
                      <span className="inline-flex items-center gap-2">
                        <TrendingUp className="h-3.5 w-3.5" />
                        {t('search.sort.relevance', 'Relevance')}
                      </span>
                    </SelectItem>
                    {geoActive && (
                      <SelectItem value="distance">
                        <span className="inline-flex items-center gap-2">
                          <Navigation className="h-3.5 w-3.5" />
                          {t('search.sort.distance', 'Distance')}
                        </span>
                      </SelectItem>
                    )}
                    <SelectItem value="newest">
                      <span className="inline-flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        {t('search.sort.newest', 'Newest')}
                      </span>
                    </SelectItem>
                    <SelectItem value="rating">
                      <span className="inline-flex items-center gap-2">
                        <Star className="h-3.5 w-3.5" />
                        {t('search.sort.rating', 'Highest rated')}
                      </span>
                    </SelectItem>
                    <SelectItem value="popular">
                      <span className="inline-flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5" />
                        {t('search.sort.popular', 'Most popular')}
                      </span>
                    </SelectItem>
                    {supportsPriceSort(filters.types) && (
                      <>
                        <SelectItem value="price-low">
                          {t('search.sort.priceLow', 'Price: Low to High')}
                        </SelectItem>
                        <SelectItem value="price-high">
                          {t('search.sort.priceHigh', 'Price: High to Low')}
                        </SelectItem>
                      </>
                    )}
                    <SelectItem value="alpha-asc">
                      <span className="inline-flex items-center gap-2">
                        <ArrowUpDown className="h-3.5 w-3.5" />
                        {t('search.sort.az', 'A – Z')}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-r-none"
                    aria-label={t('search.view.list', 'List view')}
                    aria-pressed={viewMode === 'list'}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    className="rounded-none"
                    aria-label={t('search.view.grid', 'Grid view')}
                    aria-pressed={viewMode === 'grid'}
                  >
                    <Grid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'map' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('map')}
                    className="rounded-l-none"
                    aria-label={t('search.view.map', 'Map view')}
                    aria-pressed={viewMode === 'map'}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>
                {askButton}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters((s) => !s)}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  {t('search.filters', 'Filters')}
                  {activeFilterCount > 0 && (
                    <span className="text-muted-foreground">· {activeFilterCount}</span>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Results */}
        {showInitialSkeleton ? (
          <PageLoadingState count={6} variant={viewMode === 'grid' ? 'card' : 'list'} />
        ) : tooShort ? (
          <div className="flex flex-col items-center justify-center pb-12 pt-12 text-center">
            <Search className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">{t('search.keepTyping', 'Keep typing')}</h3>
            <p className="text-muted-foreground">
              {t('search.minChars', 'Enter at least 2 characters to start searching.')}
            </p>
          </div>
        ) : accumulated.length === 0 ? (
          <ZeroState
            query={query}
            errorKind={errorKind}
            error={error}
            dymTitle={(dymHit?.title || dymHit?.name) as string | undefined}
            onSuggest={(s) => {
              const params = new URLSearchParams(searchParams);
              params.set('q', s);
              params.delete('types');
              setSearchParams(params);
            }}
            onAsk={openAsk}
            onAdjustFilters={() => setShowFilters(true)}
            onBrowse={(p) => navigate(p)}
          />
        ) : viewMode === 'map' ? (
          <ResultsMapView
            results={sortedResults}
            onSelect={navigateToResult}
            onAreaSearch={(area) => handleFiltersChange({ ...filters, ...area })}
          />
        ) : (
          <div className={cn(loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
            <div className={viewMode === 'grid' ? gridClass : listClass}>
              {sortedResults.map((r) => (
                <SearchResultCard
                  key={`${r.type}-${r.objectID}`}
                  result={r}
                  view={viewMode === 'grid' ? 'grid' : 'list'}
                  query={query}
                  onSelect={navigateToResult}
                />
              ))}
            </div>
            <LoadMoreSentinel
              hasMore={hasMore}
              loading={loading}
              onLoadMore={() => setPage((p) => p + 1)}
            />
          </div>
        )}
      </div>

      <BackToTopButton />

      {/* Inline AI — right-side sheet */}
      <Sheet open={askOpen} onOpenChange={setAskOpen}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} className="w-full p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('search.ask.title', 'Ask the guide')}</SheetTitle>
          </SheetHeader>
          <SearchAskPanel
            messages={assistant.messages}
            pending={assistant.pending}
            error={assistant.error}
            onSend={(m) => void assistant.send(m)}
            onBack={() => setAskOpen(false)}
            onSelectCard={navigateToCard}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ZeroState({
  query,
  errorKind,
  error,
  dymTitle,
  onSuggest,
  onAsk,
  onAdjustFilters,
  onBrowse,
}: {
  query: string;
  errorKind: 'unavailable' | 'client_error' | null;
  error: string | null;
  dymTitle?: string;
  onSuggest: (s: string) => void;
  onAsk: () => void;
  onAdjustFilters: () => void;
  onBrowse: (path: string) => void;
}) {
  const { t } = useTranslation();
  const hasQuery = query.trim() !== '';

  if (!hasQuery) {
    return (
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">{t('search.trySearching', 'Try searching for…')}</h3>
        <div className="mb-6 flex flex-wrap gap-2">
          {SUGGESTED_SEARCHES.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => onSuggest(s)}>
              {s}
            </Button>
          ))}
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{t('search.orBrowse', 'Or browse by category:')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t('nav.venues', 'Venues'), path: '/venues' },
            { label: t('nav.events', 'Events'), path: '/events' },
            { label: t('nav.personalities', 'Personalities'), path: '/personalities' },
            { label: t('nav.news', 'News'), path: '/news' },
            { label: t('nav.places', 'Places'), path: '/places' },
          ].map((c) => (
            <Button key={c.label} variant="ghost" size="sm" onClick={() => onBrowse(c.path)}>
              {c.label}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  if (errorKind === 'unavailable') {
    return (
      <div role="alert" className="flex flex-col items-center justify-center pb-12 pt-12 text-center">
        <Search className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">
          {t('search.unavailableTitle', 'Search is temporarily unavailable')}
        </h3>
        <p className="text-muted-foreground">{error ?? t('search.unavailableBody', "We've been notified.")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center pb-12 pt-12 text-center">
      <Search className="mb-4 h-12 w-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-semibold">
        {t('search.noResultsFor', 'No results found for "{{q}}"', { q: query })}
      </h3>
      {dymTitle && (
        <Button variant="link" onClick={() => onSuggest(dymTitle)} className="mb-2">
          {t('search.didYouMean', 'Did you mean "{{q}}"?', { q: dymTitle })}
        </Button>
      )}
      <p className="mb-4 text-muted-foreground">
        {t('search.tryDifferent', 'Try different keywords or ask the guide.')}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={onAsk} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {t('search.ask.cta2', 'Ask the guide')}
        </Button>
        <Button variant="outline" onClick={onAdjustFilters}>
          {t('search.adjustFilters', 'Adjust filters')}
        </Button>
      </div>
      <div className="mt-8">
        <p className="mb-3 text-sm text-muted-foreground">{t('search.orTry', 'Or try one of these:')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTED_SEARCHES.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => onSuggest(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
