import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Sparkles } from 'lucide-react';
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
import { PreferenceChips } from '@/components/preferences/PreferenceChips';
import { usePreferenceChips, priceRangeFromChips } from '@/hooks/usePreferenceChips';
import { SavedSearchesMenu } from '@/components/search/SavedSearchesMenu';
import { BackToTopButton } from '@/components/search/BackToTopButton';
import { LoadMoreSentinel } from '@/components/search/LoadMoreSentinel';
import { ResultsMapView } from '@/components/search/ResultsMapView';
import { SearchScopeChips } from '@/components/search/SearchScopeChips';
import { SearchResultCard } from '@/components/search/SearchResultCard';
import { SearchCalendarView } from '@/components/search/SearchCalendarView';
import { SearchAskPanel } from '@/components/search/SearchAskPanel';
import { useTrackClick } from '@/hooks/useSearchActions';
import { trackSearchUx, getSessionId } from '@/lib/searchClient';
import { useAuth } from '@/hooks/useAuth';
import { useDidYouMean } from '@/hooks/useDidYouMean';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageLoadingState } from '@/components/layout/PageLoadingState';
import { hrefForEntity } from '@/lib/searchRoutes';
import {
  getTypeConfig,
  VIEW_META,
  SORT_META,
  workerSort,
  type SearchViewMode,
  type SearchSortId,
} from '@/config/searchTypeConfig';
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
    (f.tags?.length || 0) +
    (f.cluster_ids?.length || 0) +
    (f.target_groups?.length || 0) +
    (f.tags?.length || 0) +
    (f.priceRange ? 1 : 0) +
    (f.dateRange ? 1 : 0) +
    (f.free ? 1 : 0) +
    (f.featured ? 1 : 0) +
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
  // 0-indexed to match the worker (offset = page × hitsPerPage). Starting at 1
  // would skip the first page of results — fatal for scopes with < hitsPerPage.
  const [page, setPage] = useState(0);
  const [askOpen, setAskOpen] = useState(false);

  const initialLat = Number(searchParams.get('lat')) || undefined;
  const initialLng = Number(searchParams.get('lng')) || undefined;
  const [filters, setFilters] = useState<SearchFilters>({
    types: searchParams.get('types')?.split(',').filter(Boolean) || [],
    location: searchParams.get('location') || undefined,
    categories: searchParams.get('categories')?.split(',').filter(Boolean) || undefined,
    cluster_ids: searchParams.get('clusters')?.split(',').filter(Boolean) || undefined,
    tags: searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
    lat: initialLat,
    lng: initialLng,
    radius: Number(searchParams.get('radius')) || undefined,
  });
  const geoActive = filters.lat != null && filters.lng != null;
  const activeScope = filters.types && filters.types.length === 1 ? filters.types[0] : null;
  const config = getTypeConfig(activeScope);
  const availableViews = config.views;
  const availableSorts = config.sorts.filter((s) => s !== 'distance' || geoActive);

  const [viewMode, setViewMode] = useState<SearchViewMode>(config.defaultView);
  const [sortId, setSortId] = useState<SearchSortId>(() => {
    const fromUrl = searchParams.get('sort') as SearchSortId | null;
    if (fromUrl && config.sorts.includes(fromUrl)) return fromUrl;
    return geoActive && config.sorts.includes('distance') ? 'distance' : 'relevance';
  });

  // Clamp to what the scope allows (defends against a stale URL/state).
  const effectiveView = availableViews.includes(viewMode) ? viewMode : config.defaultView;
  const effectiveSort = availableSorts.includes(sortId) ? sortId : (availableSorts[0] ?? 'relevance');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync input with URL query.
    setSearchQuery(query);
  }, [query]);

  // Traveling preference chips — the saved budget applies as a default price
  // range unless the user sets one manually. Stays out of filters/URL.
  const { chips: prefChips, toggle: togglePrefChip, forget: forgetPrefChip } =
    usePreferenceChips(['budget']);
  const chipPriceRange = priceRangeFromChips(prefChips);
  const effectiveFilters = useMemo<SearchFilters>(
    () =>
      chipPriceRange && !filters.priceRange
        ? { ...filters, priceRange: chipPriceRange }
        : filters,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, chipPriceRange?.[0], chipPriceRange?.[1]],
  );

  // Pass identity so the worker personalizes ranking from the profile
  // (interests/home_city → _boostReason). Anonymous users fall back to session.
  const { user } = useAuth();
  const { results, loading, error, errorKind, totalHits, tooShort, facets } = useSearch(
    query,
    effectiveFilters,
    page,
    workerSort(effectiveSort),
    { userId: user?.id ?? null, sessionId: getSessionId() },
  );

  // ── URL sync ───────────────────────────────────────────────────────────
  const writeParams = useCallback(
    (next: SearchFilters, nextSort: SearchSortId) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (next.types?.length) params.set('types', next.types.join(','));
      if (next.location) params.set('location', next.location);
      if (next.categories?.length) params.set('categories', next.categories.join(','));
      if (next.cluster_ids?.length) params.set('clusters', next.cluster_ids.join(','));
      if (next.tags?.length) params.set('tags', next.tags.join(','));
      if (next.lat != null && next.lng != null) {
        params.set('lat', String(next.lat));
        params.set('lng', String(next.lng));
        if (next.radius) params.set('radius', String(next.radius));
      }
      if (nextSort && nextSort !== 'relevance') params.set('sort', nextSort);
      setSearchParams(params);
    },
    [query, setSearchParams],
  );

  const handleFiltersChange = useCallback(
    (next: SearchFilters) => {
      setFilters(next);
      setPage(0);
      writeParams(next, sortId);
    },
    [writeParams, sortId],
  );

  // Tag chip on a result card → refine the current search by that tag.
  const handleTagRefine = useCallback(
    (tag: string) => {
      const current = filters.tags ?? [];
      if (current.includes(tag)) return;
      handleFiltersChange({ ...filters, tags: [...current, tag] });
    },
    [filters, handleFiltersChange],
  );

  const handleScopeChange = useCallback(
    (scope: string | null) => {
      const next = { ...filters, types: scope ? [scope] : [] };
      const cfg = getTypeConfig(scope);
      const nextSort: SearchSortId =
        geoActive && cfg.sorts.includes('distance') ? 'distance' : (cfg.sorts[0] ?? 'relevance');
      setFilters(next);
      setPage(0);
      setViewMode(cfg.defaultView);
      setSortId(nextSort);
      writeParams(next, nextSort);
    },
    [filters, geoActive, writeParams],
  );

  const handleClearAll = useCallback(() => {
    setSearchQuery('');
    setFilters({});
    setPage(0);
    setSortId('relevance');
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const handleSortChange = useCallback(
    (next: string) => {
      const s = next as SearchSortId;
      setSortId(s);
      setPage(0);
      writeParams(filters, s);
      void trackSearchUx('facet_apply', { facet: 'sort', value: s, query });
    },
    [filters, query, writeParams],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on new query.
    setPage(0);
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
          slug: result.slug || (result.metadata?.slug as string) || result.objectID,
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
  const queryKey = `${query}|${JSON.stringify(filters)}|${effectiveSort}`;
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
  const listClass = 'flex flex-col gap-4';

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
                : activeFilterCount > 0
                  ? t('search.resultsCountPlain', {
                      defaultValue: '{{count}} results',
                      count: totalHits,
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
              filterKeys={config.filters}
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
                filterKeys={config.filters}
              />
            </SheetContent>
          </Sheet>
        )}

        {(hasQuery || activeFilterCount > 0) && (
          <>
            <SearchScopeChips activeScope={activeScope} onScopeChange={handleScopeChange} />

            <div className="flex flex-wrap items-center justify-between gap-4 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <PreferenceChips
                  chips={prefChips}
                  onToggle={togglePrefChip}
                  onForget={forgetPrefChip}
                />
                <ActiveFilterChips filters={filters} onFiltersChange={handleFiltersChange} />
              </div>
              <SavedSearchesMenu
                currentQueryString={searchParams.toString()}
                suggestedName={query}
                onLoad={(qs) => setSearchParams(new URLSearchParams(qs))}
              />
            </div>

            {/* Controls bar */}
            <div className="mb-6 flex flex-col gap-4 rounded-element bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('search.sortBy', 'Sort')}</span>
                <Select value={effectiveSort} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    {availableSorts.map((s) => {
                      const meta = SORT_META[s];
                      const Icon = meta.Icon;
                      return (
                        <SelectItem key={s} value={s}>
                          <span className="inline-flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {t(meta.labelKey, meta.label)}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {availableViews.map((v, i) => {
                    const meta = VIEW_META[v];
                    const Icon = meta.Icon;
                    return (
                      <Button
                        key={v}
                        variant={effectiveView === v ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setViewMode(v)}
                        aria-label={t(meta.labelKey, meta.label)}
                        aria-pressed={effectiveView === v}
                        className={cn(
                          i === 0 && 'rounded-r-none',
                          i === availableViews.length - 1 && 'rounded-l-none',
                          i > 0 && i < availableViews.length - 1 && 'rounded-none',
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </Button>
                    );
                  })}
                </div>
                <Button variant="outline" size="sm" onClick={openAsk} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  {t('search.ask.title', 'Ask the guide')}
                </Button>
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
          <PageLoadingState count={6} variant={effectiveView === 'grid' ? 'card' : 'list'} />
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
        ) : effectiveView === 'map' ? (
          <ResultsMapView
            results={accumulated}
            onSelect={navigateToResult}
            onAreaSearch={(area) => handleFiltersChange({ ...filters, ...area })}
          />
        ) : effectiveView === 'calendar' ? (
          <div className={cn(loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
            <SearchCalendarView results={accumulated} query={query} onSelect={navigateToResult} />
            <LoadMoreSentinel
              hasMore={hasMore}
              loading={loading}
              onLoadMore={() => setPage((p) => p + 1)}
            />
          </div>
        ) : (
          <div className={cn(loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
            <div className={effectiveView === 'grid' ? gridClass : listClass}>
              {accumulated.map((r) => (
                <SearchResultCard
                  key={`${r.type}-${r.objectID}`}
                  result={r}
                  view={effectiveView === 'grid' ? 'grid' : 'list'}
                  query={query}
                  onSelect={navigateToResult}
                  onTagClick={handleTagRefine}
                  activeTags={filters.tags}
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
        <p className="mb-4 text-sm text-muted-foreground">{t('search.orBrowse', 'Or browse by category:')}</p>
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
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onAsk} className="gap-2">
          <Sparkles className="h-4 w-4" />
          {t('search.ask.cta2', 'Ask the guide')}
        </Button>
        <Button variant="outline" onClick={onAdjustFilters}>
          {t('search.adjustFilters', 'Adjust filters')}
        </Button>
      </div>
      <div className="mt-8">
        <p className="mb-4 text-sm text-muted-foreground">{t('search.orTry', 'Or try one of these:')}</p>
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
