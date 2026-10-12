import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Search, Filter, Sparkles, X } from 'lucide-react';
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
import { LoadMore } from '@/components/transit/LoadMore';
import { VirtualizedGrid } from '@/components/ui/VirtualizedGrid';
import { useGridColumns } from '@/components/ui/useGridColumns';
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
import { readSearchFilters, writeSearchFilters } from '@/lib/searchParams';
import { PageContainer } from '@/components/layout/PageContainer';

const MAX_HEADING_QUERY_LEN = 80;
// Must mirror gridClass's breakpoint column counts (md/lg/xl).
const GRID_BREAKPOINTS = [
  { minWidth: 0, columns: 1 },
  { minWidth: 768, columns: 2 },
  { minWidth: 1024, columns: 3 },
  { minWidth: 1280, columns: 4 },
];
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

  const filters = useMemo(() => readSearchFilters(searchParams), [searchParams]);
  const geoActive = filters.lat != null && filters.lng != null;
  const activeScope = filters.types && filters.types.length === 1 ? filters.types[0] : null;
  const config = getTypeConfig(activeScope);
  const availableViews = config.views;
  const availableSorts = config.sorts.filter((s) => s !== 'distance' || geoActive);

  const [viewMode, setViewMode] = useState<SearchViewMode>(config.defaultView);
  const sortId = useMemo<SearchSortId>(() => {
    const value = searchParams.get('sort') as SearchSortId | null;
    return (
      value ??
      (geoActive && getTypeConfig(activeScope).sorts.includes('distance')
        ? 'distance'
        : 'relevance')
    );
  }, [searchParams, geoActive, activeScope]);

  // Clamp to what the scope allows (defends against a stale URL/state).
  const effectiveView = availableViews.includes(viewMode) ? viewMode : config.defaultView;
  const effectiveSort = availableSorts.includes(sortId)
    ? sortId
    : (availableSorts[0] ?? 'relevance');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync input with URL query.
    setSearchQuery(query);
  }, [query]);

  // Traveling preference chips — the saved budget applies as a default price
  // range unless the user sets one manually. Stays out of filters/URL.
  const {
    chips: prefChips,
    toggle: togglePrefChip,
    forget: forgetPrefChip,
  } = usePreferenceChips(['budget']);
  const chipPriceRange = priceRangeFromChips(prefChips);
  const effectiveFilters = useMemo<SearchFilters>(
    () =>
      chipPriceRange && !filters.priceRange ? { ...filters, priceRange: chipPriceRange } : filters,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters, chipPriceRange?.[0], chipPriceRange?.[1]],
  );

  // Pass identity so the worker personalizes ranking from the profile
  // (interests/home_city → _boostReason). Anonymous users fall back to session.
  const { user } = useAuth();
  const {
    results,
    resultKey,
    loading,
    error,
    errorKind,
    totalHits,
    tooShort,
    facets,
    performSearch,
  } = useSearch(query, effectiveFilters, page, workerSort(effectiveSort), {
    userId: user?.id ?? null,
    sessionId: getSessionId(),
  });

  // ── URL sync ───────────────────────────────────────────────────────────
  const writeParams = useCallback(
    (next: SearchFilters, nextSort: SearchSortId) => {
      const params = writeSearchFilters(query, next, nextSort);
      setSearchParams(params);
    },
    [query, setSearchParams],
  );

  const handleFiltersChange = useCallback(
    (next: SearchFilters) => {
      setPage(0);
      writeParams(next, sortId);
    },
    [writeParams, sortId],
  );

  // Tag chip on a result card → refine the current search by that tag.
  const handleTagRefine = useCallback(
    (tag: string) => {
      const current = filters.tags ?? [];
      const selected = current.some((value) => value.toLowerCase() === tag.toLowerCase());
      handleFiltersChange({
        ...filters,
        tags: selected
          ? current.filter((value) => value.toLowerCase() !== tag.toLowerCase())
          : [...current, tag],
      });
    },
    [filters, handleFiltersChange],
  );

  const handleScopeChange = useCallback(
    (scope: string | null) => {
      const next = { ...filters, types: scope ? [scope] : [] };
      const cfg = getTypeConfig(scope);
      const nextSort: SearchSortId =
        geoActive && cfg.sorts.includes('distance') ? 'distance' : (cfg.sorts[0] ?? 'relevance');
      setPage(0);
      setViewMode(cfg.defaultView);
      writeParams(next, nextSort);
    },
    [filters, geoActive, writeParams],
  );

  const handleClearAll = useCallback(() => {
    handleFiltersChange({});
  }, [handleFiltersChange]);

  const handleSortChange = useCallback(
    (next: string) => {
      const s = next as SearchSortId;
      setPage(0);
      writeParams(filters, s);
      void trackSearchUx('facet_apply', { facet: 'sort', value: s, query });
    },
    [filters, query, writeParams],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset paging on new query.
    setPage(0);
  }, [searchParams]);

  const submitSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    else params.delete('q');
    setSearchParams(params);
  }, [searchQuery, searchParams, setSearchParams]);

  // Analytics only. The result card navigates itself through a real anchor
  // (`hrefForSearchResult`), so this must NOT also call `navigate()` — that
  // would push a second, identical history entry and make Back need two
  // presses. The route mapping that used to live here moved into
  // `hrefForSearchResult` so the card can render an href.
  const trackResultClick = useCallback(
    (result: SearchResult) => {
      trackClick({ type: result.type, id: result.objectID }, 'search', { query });
    },
    [trackClick, query],
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
        hrefForEntity({
          type: card.type,
          slug: card.slug as string,
          id: card.objectID,
          title: card.title,
        }),
      );
    },
    [navigate],
  );

  // ── Accumulate pages (infinite scroll), keep previous during refetch ─────
  const queryKey = `${query}|${JSON.stringify(effectiveFilters)}|${workerSort(effectiveSort) ?? ''}`;
  const [resultPages, setResultPages] = useState<{ key: string; items: SearchResult[] }>({
    key: '',
    items: [],
  });
  useEffect(() => {
    if (loading || (resultKey !== undefined && resultKey !== queryKey)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- accumulate completed external search pages.
    setResultPages((previous) => {
      if (queryKey !== previous.key) return { key: queryKey, items: results };
      const seen = new Set(previous.items.map((result) => `${result.type}-${result.objectID}`));
      const fresh = results.filter((result) => !seen.has(`${result.type}-${result.objectID}`));
      return fresh.length ? { key: queryKey, items: [...previous.items, ...fresh] } : previous;
    });
  }, [results, resultKey, loading, queryKey]);

  const currentResults = resultPages.key === queryKey ? resultPages.items : [];
  const totalResults = currentResults.length;
  const hasMore = totalResults < totalHits;
  const activeFilterCount = countActiveFilters(filters);
  const awaitingQuery =
    (query.trim().length >= 2 || activeFilterCount > 0) &&
    resultKey !== undefined &&
    resultKey !== queryKey;
  const showInitialSkeleton = (loading || awaitingQuery) && currentResults.length === 0;
  const hasQuery = query.trim().length > 0;

  // Fire zero_results telemetry once when a real query lands with no hits.
  useEffect(() => {
    if (!query || query.trim().length < 2 || loading || awaitingQuery || tooShort) return;
    if (totalHits === 0 && !errorKind) {
      void trackSearchUx('zero_results', { query, scope: activeScope || 'all' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, totalHits, loading, awaitingQuery, tooShort, errorKind]);

  const dymHit = useDidYouMean(
    query,
    query.trim().length >= 2 &&
      !loading &&
      !awaitingQuery &&
      !tooShort &&
      totalHits === 0 &&
      !errorKind,
  );

  // pb-4 on virtual rows preserves the inter-row gap (absolute rows don't
  // share a parent grid, so gap-y alone can't reach between them).
  const gridClass = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4';
  const listClass = 'flex flex-col pb-2';
  const gridColumns = useGridColumns(GRID_BREAKPOINTS);

  return (
    <div className="relative">
      <PageContainer className="relative">
        <PageHeader
          title={t('search.resultsTitle', 'Search')}
          subtitle={
            errorKind
              ? t('search.unavailableTitle', 'Search is temporarily unavailable')
              : loading || awaitingQuery
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
          <form
            className="flex gap-2"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('search.refine', 'Refine your search…')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t('search.ariaLabel', 'Search Queer Guide')}
                type="search"
                className="h-12 pl-10 pr-12"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-10 w-10"
                  aria-label={t('search.clear', 'Clear search')}
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Button type="submit" className="h-12">
              {t('search.button', 'Search')}
            </Button>
          </form>
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
            <SearchScopeChips
              activeScope={activeScope}
              onScopeChange={handleScopeChange}
              className="px-0"
            />

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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-y border-border-hairline py-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('search.sortBy', 'Sort')}</span>
                <Select value={effectiveSort} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[170px]" aria-label={t('search.sortBy', 'Sort')}>
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

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="flex items-center gap-1 rounded-element bg-surface-container p-1"
                  role="group"
                  aria-label={t('search.view', 'Result view')}
                >
                  {availableViews.map((v) => {
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
                        className="rounded-badge"
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
                  aria-expanded={showFilters}
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

        {errorKind && currentResults.length > 0 && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-element bg-muted p-4"
          >
            <p className="text-sm">
              {error ?? t('search.unavailableTitle', 'Search is temporarily unavailable')}
            </p>
            <Button variant="outline" onClick={() => void performSearch(query, page)}>
              {t('common.retry', 'Try again')}
            </Button>
          </div>
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
        ) : currentResults.length === 0 ? (
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
            onRetry={() => void performSearch(query, page)}
            hasFilters={activeFilterCount > 0}
            onAdjustFilters={() => setShowFilters(true)}
            onBrowse={(p) => navigate(p)}
          />
        ) : effectiveView === 'map' ? (
          <ResultsMapView results={currentResults} />
        ) : effectiveView === 'calendar' ? (
          <div className={cn(loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
            <SearchCalendarView
              results={currentResults}
              query={query}
              onActivate={trackResultClick}
            />
            <LoadMore
              hasMore={hasMore}
              loading={loading}
              onLoadMore={() => setPage((p) => p + 1)}
              resetKey={queryKey}
            />
          </div>
        ) : (
          <div className={cn(loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
            <VirtualizedGrid
              items={currentResults}
              columns={effectiveView === 'grid' ? gridColumns : 1}
              rowClassName={effectiveView === 'grid' ? gridClass : listClass}
              estimateRowHeight={effectiveView === 'grid' ? 380 : 112}
              itemKey={(r) => `${r.type}-${r.objectID}`}
              renderItem={(r) => (
                <SearchResultCard
                  result={r}
                  view={effectiveView === 'grid' ? 'grid' : 'list'}
                  query={query}
                  onActivate={trackResultClick}
                  onTagClick={handleTagRefine}
                  activeTags={filters.tags}
                />
              )}
            />
            <LoadMore
              hasMore={hasMore}
              loading={loading}
              onLoadMore={() => setPage((p) => p + 1)}
              resetKey={queryKey}
            />
          </div>
        )}
      </PageContainer>

      <BackToTopButton />

      {/* Inline AI — right-side sheet */}
      <Sheet open={askOpen} onOpenChange={setAskOpen}>
        <SheetContent side={isMobile ? 'bottom' : 'right'} className="w-full p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('search.ask.title', 'Ask the guide')}</SheetTitle>
          </SheetHeader>
          {assistant.turnstile}
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
  onRetry,
  hasFilters,
}: {
  query: string;
  errorKind: 'unavailable' | 'client_error' | null;
  error: string | null;
  dymTitle?: string;
  onRetry: () => void;
  hasFilters: boolean;
  onSuggest: (s: string) => void;
  onAsk: () => void;
  onAdjustFilters: () => void;
  onBrowse: (path: string) => void;
}) {
  const { t } = useTranslation();
  const hasQuery = query.trim() !== '';

  if (!hasQuery && !hasFilters && !errorKind) {
    return (
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-semibold">
          {t('search.trySearching', 'Try searching for…')}
        </h3>
        <div className="mb-6 flex flex-wrap gap-2">
          {SUGGESTED_SEARCHES.map((s) => (
            <Button key={s} variant="outline" size="sm" onClick={() => onSuggest(s)}>
              {s}
            </Button>
          ))}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {t('search.orBrowse', 'Or browse by category:')}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: t('nav.venues', 'Venues'), path: '/venues' },
            { label: t('nav.events', 'Events'), path: '/events' },
            { label: t('nav.personalities', 'Personalities'), path: '/personalities' },
            { label: t('nav.news', 'News'), path: '/news' },
            { label: t('nav.places', 'Places'), path: '/places' },
            { label: t('header.nav.tags', 'Glossary'), path: '/tags' },
          ].map((c) => (
            <Button key={c.label} variant="ghost" size="sm" onClick={() => onBrowse(c.path)}>
              {c.label}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  if (errorKind) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center pb-12 pt-12 text-center"
      >
        <Search className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">
          {errorKind === 'unavailable'
            ? t('search.unavailableTitle', 'Search is temporarily unavailable')
            : t('search.error', 'Something went wrong')}
        </h3>
        <p className="text-muted-foreground">
          {error ?? t('search.unavailableBody', "We've been notified.")}
        </p>
        <Button className="mt-4" onClick={onRetry}>
          {t('common.retry', 'Try again')}
        </Button>
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
        <p className="mb-4 text-sm text-muted-foreground">
          {t('search.orTry', 'Or try one of these:')}
        </p>
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
