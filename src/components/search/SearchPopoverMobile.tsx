import { useTranslation } from 'react-i18next';
import type { SearchSuggestion } from '@/hooks/useSearchSuggestions';
import type { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import { SearchScopeChips } from './SearchScopeChips';
import { SearchPopoverResults } from './SearchPopoverResults';
import { SearchPopoverEmpty } from './SearchPopoverEmpty';

export interface SearchPopoverMobileProps {
  listboxId: string;
  resultsFocused: number | null;
  setResultsFocused: (index: number) => void;
  query: string;
  activeScope: string | null;
  suggestions: SearchSuggestion[];
  loading: boolean;
  error: string | null;
  trending: ReturnType<typeof useTrendingSuggestions>['trending'];
  discoverySource?: 'recommended' | 'trending';
  setScope: (s: string | null) => void;
  onSelect: (s: SearchSuggestion) => void;
  onSearchAll: () => void;
  onClose: () => void;
  onClear: () => void;
  onPrefetch: (s: SearchSuggestion) => void;
  navigate: (path: string) => void;
  onAsk: () => void;
  /** Contribute flow, offered from the no-results state. */
  onAddToMap?: () => void;
  recentSearches: string[];
  onSelectRecent: (term: string) => void;
  clearRecents: () => void;
}

export function SearchPopoverMobile({
  listboxId,
  resultsFocused,
  setResultsFocused,
  query,
  activeScope,
  suggestions,
  loading,
  error,
  trending,
  discoverySource,
  setScope,
  onSelect,
  onSearchAll,
  onClose,
  onClear,
  onPrefetch,
  navigate,
  onAsk,
  onAddToMap,
  recentSearches,
  onSelectRecent,
  clearRecents,
}: SearchPopoverMobileProps) {
  const { t } = useTranslation();

  return (
    // Flex column so the scrollable content fills the 100dvh sheet.
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          type="button"
          onClick={onClose}
          className="-ml-2 px-2 py-1 text-sm font-medium text-foreground"
          aria-label="Close search"
        >
          {t('common.cancel', 'Cancel')}
        </button>
        <div className="flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={onClear}
              className="px-2 py-1 text-sm text-muted-foreground"
              aria-label="Clear search"
            >
              {t('common.clear', 'Clear')}
            </button>
          )}
        </div>
      </div>
      {query.length === 0 ? (
        <SearchPopoverEmpty
          trending={trending}
          source={discoverySource}
          onSelectTrending={(hit) =>
            onSelect({
              id: hit.id,
              name: (hit.title || hit.name || '') as string,
              type: hit.type,
              icon: () => null,
              title: (hit.title || hit.name || '') as string,
              subtitle: hit.city as string | undefined,
              slug: hit.slug as string | undefined,
            })
          }
          onBrowse={(path) => {
            onClose();
            navigate(path);
          }}
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
            onSelect={(s) => onSelect(s)}
            onHover={setResultsFocused}
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
