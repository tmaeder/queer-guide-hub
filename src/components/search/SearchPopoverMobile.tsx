import { Suspense, lazy, useEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mic, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SearchSuggestion } from '@/hooks/useSearchSuggestions';
import type { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import type { SearchFilters } from '@/hooks/useSearch';
import { SearchScopeChips } from './SearchScopeChips';
import { SearchPopoverResults } from './SearchPopoverResults';
import { SearchPopoverEmpty } from './SearchPopoverEmpty';

const SearchFiltersPanel = lazy(() =>
  import('./SearchFiltersPanel').then((m) => ({ default: m.SearchFiltersPanel })),
);

export interface SearchPopoverMobileProps {
  query: string;
  activeScope: string | null;
  suggestions: SearchSuggestion[];
  countsByType: Record<string, number>;
  loading: boolean;
  error: string | null;
  trending: ReturnType<typeof useTrendingSuggestions>['trending'];
  discoverySource?: 'recommended' | 'trending';
  showFilters: boolean;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  setScope: (s: string | null) => void;
  onSelect: (s: SearchSuggestion) => void;
  onSearchAll: () => void;
  onToggleFilters?: () => void;
  activeFiltersCount?: number;
  onClose: () => void;
  onClear: () => void;
  /** Live input wiring — the sheet owns the visible search field on mobile. */
  placeholder: string;
  onQueryChange: (v: string) => void;
  onInputKeyDown: (e: KeyboardEvent) => void;
  voiceSupported: boolean;
  voiceListening: boolean;
  onVoiceToggle: () => void;
  onPrefetch: (s: SearchSuggestion) => void;
  navigate: (path: string) => void;
  onAsk: () => void;
  onExploreMap: (center?: { lat: number; lng: number }) => void;
  onNearMe: () => void;
  nearMeSupported: boolean;
  nearMeLoading: boolean;
  recentSearches: string[];
  onSelectRecent: (term: string) => void;
  clearRecents: () => void;
}

export function SearchPopoverMobile({
  query,
  activeScope,
  suggestions,
  countsByType,
  loading,
  error,
  trending,
  discoverySource,
  showFilters,
  filters,
  setFilters,
  setScope,
  onSelect,
  onSearchAll,
  onToggleFilters,
  activeFiltersCount = 0,
  onClose,
  onClear,
  placeholder,
  onQueryChange,
  onInputKeyDown,
  voiceSupported,
  voiceListening,
  onVoiceToggle,
  onPrefetch,
  navigate,
  onAsk,
  onExploreMap,
  onNearMe,
  nearMeSupported,
  nearMeLoading,
  recentSearches,
  onSelectRecent,
  clearRecents,
}: SearchPopoverMobileProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  // The sheet owns the visible field on mobile — focus it on open so the user
  // can see and control what they type (the header field sits behind the overlay).
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      <div
        className="flex items-center gap-2 border-b border-border px-4 py-2"
        style={{ paddingTop: 'max(8px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-element bg-muted pl-4 pr-2">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            aria-label={t('search.ariaLabel', 'Search Queer Guide')}
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 border-0 bg-transparent px-2 text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          {loading && (
            <Loader2 className="mr-1 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
          {query ? (
            <button
              type="button"
              onClick={() => {
                onClear();
                inputRef.current?.focus();
              }}
              aria-label={t('common.clear', 'Clear')}
              className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          ) : (
            voiceSupported && (
              <button
                type="button"
                onClick={onVoiceToggle}
                aria-pressed={voiceListening}
                aria-label={
                  voiceListening
                    ? t('search.stopVoice', 'Stop voice search')
                    : t('search.voice', 'Voice search')
                }
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center',
                  voiceListening ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                <Mic className="h-5 w-5" />
              </button>
            )
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 px-1 text-sm font-medium text-foreground"
          aria-label="Close search"
        >
          {t('common.cancel', 'Cancel')}
        </button>
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
            focusedIndex={null}
            onSelect={(s) => onSelect(s)}
            onHover={() => undefined}
            onPrefetch={onPrefetch}
            onToggleFilters={onToggleFilters ?? (() => undefined)}
            filtersOpen={showFilters}
            activeFiltersCount={activeFiltersCount}
            onSearchAll={onSearchAll}
            onClearScope={() => setScope(null)}
            onAsk={onAsk}
          />
        </>
      )}
    </>
  );
}
