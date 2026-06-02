import { Suspense, lazy } from 'react';
import type { SearchSuggestion } from '@/hooks/useSearchSuggestions';
import type { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import type { SearchFilters } from '@/hooks/useSearch';
import { SearchScopeChips } from './SearchScopeChips';
import { SearchPopoverResults } from './SearchPopoverResults';
import { SearchPopoverEmpty } from './SearchPopoverEmpty';

const SearchFiltersPanel = lazy(() =>
  import('./SearchFiltersPanel').then((m) => ({ default: m.SearchFiltersPanel })),
);

export interface SearchPopoverDesktopProps {
  query: string;
  activeScope: string | null;
  suggestions: SearchSuggestion[];
  countsByType: Record<string, number>;
  loading: boolean;
  error: string | null;
  trending: ReturnType<typeof useTrendingSuggestions>['trending'];
  discoverySource?: 'recommended' | 'trending';
  recentSearches: string[];
  showFilters: boolean;
  setShowFilters: (b: boolean) => void;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  setScope: (s: string | null) => void;
  onSelectIndex: (s: SearchSuggestion, i: number) => void;
  resultsFocused: number | null;
  setResultsFocused: (i: number | null) => void;
  activeFiltersCount: number;
  onSearchAll: () => void;
  clearRecents: () => void;
  onSelectRecent: (term: string) => void;
  nearMeSupported: boolean;
  nearMeLoading: boolean;
  onNearMe: () => void;
  onExploreMap: (center?: { lat: number; lng: number }) => void;
  onSelectTrending: (hit: ReturnType<typeof useTrendingSuggestions>['trending'][number]) => void;
  onBrowse: (path: string) => void;
  onPrefetch: (s: SearchSuggestion) => void;
  onAsk: () => void;
}

export function SearchPopoverDesktop(props: SearchPopoverDesktopProps) {
  const {
    query,
    activeScope,
    suggestions,
    countsByType,
    loading,
    error,
    trending,
    discoverySource,
    recentSearches,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    setScope,
    onSelectIndex,
    resultsFocused,
    setResultsFocused,
    activeFiltersCount,
    onSearchAll,
    clearRecents,
    onSelectRecent,
    nearMeSupported,
    nearMeLoading,
    onNearMe,
    onExploreMap,
    onSelectTrending,
    onBrowse,
    onPrefetch,
    onAsk,
  } = props;

  return (
    <div className="flex min-h-[320px] flex-col" id="qg-search-listbox">
      {query.length === 0 ? (
        <SearchPopoverEmpty
          trending={trending}
          source={discoverySource}
          onSelectTrending={onSelectTrending}
          onBrowse={onBrowse}
          onAsk={onAsk}
          onExploreMap={onExploreMap}
          onNearMe={onNearMe}
          nearMeSupported={nearMeSupported}
          nearMeLoading={nearMeLoading}
          recents={recentSearches}
          onSelectRecent={onSelectRecent}
          onClearRecents={clearRecents}
        />
      ) : (
        <>
          <SearchScopeChips activeScope={activeScope} onScopeChange={setScope} />
          {showFilters && (
            <Suspense fallback={null}>
              <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
            </Suspense>
          )}
          <SearchPopoverResults
            query={query}
            activeScope={activeScope}
            suggestions={suggestions}
            countsByType={countsByType}
            loading={loading}
            error={error}
            focusedIndex={resultsFocused}
            onSelect={onSelectIndex}
            onHover={(i) => setResultsFocused(i)}
            onPrefetch={onPrefetch}
            onToggleFilters={() => setShowFilters(!showFilters)}
            filtersOpen={showFilters}
            activeFiltersCount={activeFiltersCount}
            onSearchAll={onSearchAll}
            onClearScope={() => setScope(null)}
            onAsk={onAsk}
          />
        </>
      )}
    </div>
  );
}
