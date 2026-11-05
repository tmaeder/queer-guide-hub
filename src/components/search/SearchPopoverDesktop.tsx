import type { SearchSuggestion } from '@/hooks/useSearchSuggestions';
import type { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import { SearchScopeChips } from './SearchScopeChips';
import { SearchPopoverResults } from './SearchPopoverResults';
import { SearchPopoverEmpty } from './SearchPopoverEmpty';

export interface SearchPopoverDesktopProps {
  /** DOM id the input's `aria-controls` points at. Passed in rather than
   *  hardcoded: the header and the homepage hero both mount a search, and two
   *  elements sharing an id fails the a11y sweep. */
  listboxId: string;
  query: string;
  activeScope: string | null;
  suggestions: SearchSuggestion[];
  loading: boolean;
  error: string | null;
  trending: ReturnType<typeof useTrendingSuggestions>['trending'];
  discoverySource?: 'recommended' | 'trending';
  recentSearches: string[];
  setScope: (s: string | null) => void;
  onSelectIndex: (s: SearchSuggestion, i: number) => void;
  resultsFocused: number | null;
  setResultsFocused: (i: number | null) => void;
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
    listboxId,
    query,
    activeScope,
    suggestions,
    loading,
    error,
    trending,
    discoverySource,
    recentSearches,
    setScope,
    onSelectIndex,
    resultsFocused,
    setResultsFocused,
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
    <div className="flex min-h-[320px] flex-col">
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
          <SearchPopoverResults
            listboxId={listboxId}
            query={query}
            activeScope={activeScope}
            suggestions={suggestions}
            loading={loading}
            error={error}
            focusedIndex={resultsFocused}
            onSelect={onSelectIndex}
            onHover={(i) => setResultsFocused(i)}
            onPrefetch={onPrefetch}
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
