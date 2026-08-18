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
  /** DOM id the input's `aria-controls` points at. Passed in rather than
   *  hardcoded: the header and the homepage hero both mount a search, and two
   *  elements sharing an id fails the a11y sweep. */
  listboxId?: string;
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
  onSelectTrending: (hit: ReturnType<typeof useTrendingSuggestions>['trending'][number]) => void;
  onBrowse: (path: string) => void;
  onPrefetch: (s: SearchSuggestion) => void;
  onAsk: () => void;
  /** Contribute flow, offered from the no-results state. */
  onAddToMap?: () => void;
}

export function SearchPopoverDesktop(props: SearchPopoverDesktopProps) {
  const {
    listboxId = 'qg-search-listbox',
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
    onSelectTrending,
    onBrowse,
    onPrefetch,
    onAsk,
    onAddToMap,
  } = props;

  return (
    <div className="flex min-h-[320px] flex-col" id={listboxId}>
      {query.length === 0 ? (
        <SearchPopoverEmpty
          trending={trending}
          source={discoverySource}
          onSelectTrending={onSelectTrending}
          onBrowse={onBrowse}
          onAsk={onAsk}
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
            onAddToMap={onAddToMap}
          />
        </>
      )}
    </div>
  );
}
