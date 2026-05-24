import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchSuggestion } from '@/hooks/useSearchSuggestions';
import type { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import type { SearchFilters } from '@/hooks/useSearch';
import { SearchPopoverRail } from './SearchPopoverRail';
import { SearchPopoverResults } from './SearchPopoverResults';
import { SearchPopoverEmpty } from './SearchPopoverEmpty';

const SearchFiltersPanel = lazy(() =>
  import('./SearchFiltersPanel').then((m) => ({ default: m.SearchFiltersPanel })),
);

function KbdHint({ label, desc }: { label: string; desc: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="inline-block min-w-[18px] border border-border px-1 py-px text-center text-[0.65rem] leading-tight font-[inherit]">
        {label}
      </kbd>
      {desc}
    </span>
  );
}

export interface SearchPopoverDesktopProps {
  query: string;
  activeScope: string | null;
  suggestions: SearchSuggestion[];
  countsByType: Record<string, number>;
  loading: boolean;
  error: string | null;
  trending: ReturnType<typeof useTrendingSuggestions>['trending'];
  recentSearches: string[];
  showFilters: boolean;
  setShowFilters: (b: boolean) => void;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  setScope: (s: string | null) => void;
  onSelectIndex: (s: SearchSuggestion, i: number) => void;
  resultsFocused: number | null;
  railFocused: number | null;
  setResultsFocused: (i: number | null) => void;
  activeFiltersCount: number;
  onSearchAll: () => void;
  removeRecent: (i: number) => void;
  clearRecents: () => void;
  onSelectRecent: (term: string) => void;
  nearMeSupported: boolean;
  nearMeLoading: boolean;
  onNearMe: () => void;
  onBrowseAll: () => void;
  onSelectTrending: (hit: ReturnType<typeof useTrendingSuggestions>['trending'][number]) => void;
  onBrowse: (path: string) => void;
  onPrefetch: (s: SearchSuggestion) => void;
  isMac: boolean;
}

export function SearchPopoverDesktop(props: SearchPopoverDesktopProps) {
  const { t } = useTranslation();
  const {
    query,
    activeScope,
    suggestions,
    countsByType,
    loading,
    error,
    trending,
    recentSearches,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    setScope,
    onSelectIndex,
    resultsFocused,
    railFocused,
    setResultsFocused,
    activeFiltersCount,
    onSearchAll,
    removeRecent,
    clearRecents,
    onSelectRecent,
    nearMeSupported,
    nearMeLoading,
    onNearMe,
    onBrowseAll,
    onSelectTrending,
    onBrowse,
    onPrefetch,
    isMac,
  } = props;

  return (
    <div className="flex min-h-[320px] flex-col" id="qg-search-listbox">
      <div className="flex max-h-[560px] min-h-[320px] flex-1">
        <SearchPopoverRail
          query={query}
          activeScope={activeScope}
          countsByType={countsByType}
          recents={recentSearches}
          onSelectScope={setScope}
          onSelectRecent={onSelectRecent}
          onRemoveRecent={removeRecent}
          onClearRecents={clearRecents}
          nearMeSupported={nearMeSupported}
          nearMeLoading={nearMeLoading}
          onNearMe={onNearMe}
          onBrowseAll={onBrowseAll}
          focusedIndex={railFocused}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {showFilters && (
            <Suspense fallback={null}>
              <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
            </Suspense>
          )}
          {query.length === 0 ? (
            <SearchPopoverEmpty
              trending={trending}
              onSelectTrending={onSelectTrending}
              onBrowse={onBrowse}
            />
          ) : (
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
            />
          )}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="flex items-center justify-between gap-4 border-t border-border px-3 py-1.5 text-[0.7rem] text-muted-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <KbdHint label="↑↓" desc={t('search.kbd.navigate', 'Navigate')} />
          <KbdHint label="↵" desc={t('search.kbd.select', 'Select')} />
          <KbdHint label={isMac ? '⌥1-9' : 'Alt+1-9'} desc={t('search.kbd.scope', 'Scope')} />
          <KbdHint label="⇥" desc={t('search.kbd.complete', 'Complete')} />
        </span>
        <span className="inline-flex items-center gap-2">
          {query && (
            <button
              type="button"
              onClick={onSearchAll}
              className="cursor-pointer border-0 bg-transparent p-0 text-inherit underline"
            >
              {t('search.seeAll', 'See all results')} →
            </button>
          )}
          <KbdHint label="Esc" desc={t('search.kbd.close', 'Close')} />
        </span>
      </div>
    </div>
  );
}
