import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
  onPrefetch: (s: SearchSuggestion) => void;
  navigate: (path: string) => void;
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
  onPrefetch,
  navigate,
}: SearchPopoverMobileProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
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
          {onToggleFilters && (
            <button
              type="button"
              onClick={onToggleFilters}
              className="relative -mr-2 px-2 py-1 text-foreground"
              aria-label={t('search.filters', 'Search filters')}
            >
              <SlidersHorizontal size={20} />
              {activeFiltersCount > 0 && (
                <Badge variant="destructive" className="absolute -right-1 -top-1">
                  {activeFiltersCount}
                </Badge>
              )}
            </button>
          )}
        </div>
      </div>
      <SearchScopeChips activeScope={activeScope} onScopeChange={setScope} />
      {showFilters && (
        <Suspense fallback={null}>
          <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
        </Suspense>
      )}
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
        />
      ) : (
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
          onToggleFilters={() => undefined}
          filtersOpen={false}
          activeFiltersCount={0}
          onSearchAll={onSearchAll}
          onClearScope={() => setScope(null)}
        />
      )}
    </>
  );
}
