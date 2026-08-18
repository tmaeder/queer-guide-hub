import { TrackLoader } from '@/components/transit/TrackLoader';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { NoStationTrack } from '@/components/transit/NoStationTrack';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { type SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';
import { SearchResultRow } from './SearchResultRow';

export interface SearchPopoverResultsProps {
  query: string;
  activeScope: string | null;
  suggestions: SearchSuggestion[];
  countsByType: Record<string, number>;
  loading: boolean;
  error: string | null;
  focusedIndex: number | null;
  onSelect: (suggestion: SearchSuggestion, index: number) => void;
  onHover: (index: number) => void;
  onPrefetch: (suggestion: SearchSuggestion) => void;
  onToggleFilters: () => void;
  filtersOpen: boolean;
  activeFiltersCount: number;
  onSearchAll: () => void;
  onClearScope: () => void;
  /** Open the inline Ask-the-guide chat seeded with the current query. */
  onAsk: () => void;
  /** Send the reader to the contribute flow from the no-results state. */
  onAddToMap?: () => void;
}

export function SearchPopoverResults({
  query,
  activeScope,
  suggestions,
  countsByType,
  loading,
  error,
  focusedIndex,
  onSelect,
  onHover,
  onPrefetch,
  onToggleFilters,
  filtersOpen,
  activeFiltersCount,
  onSearchAll,
  onClearScope,
  onAsk,
  onAddToMap,
}: SearchPopoverResultsProps) {
  const { t } = useTranslation();
  const totalCount = Object.values(countsByType).reduce((a, b) => a + b, 0);
  const visible = suggestions.length;
  const thin = !loading && !error && query.length >= 2 && visible === 0;

  const scopeLabel = activeScope
    ? (CONTENT_TYPES.find((c) => c.id === activeScope)?.label ?? activeScope)
    : t('search.allLabel', 'All');

  const headerText = query
    ? totalCount > visible
      ? `"${query}" — ${visible} of ${totalCount} ${totalCount === 1 ? t('search.resultOne', 'result') : t('search.resultMany', 'results')}`
      : `"${query}" — ${visible} ${visible === 1 ? t('search.resultOne', 'result') : t('search.resultMany', 'results')}`
    : `${scopeLabel}`;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-9 items-center justify-between gap-2 px-6 py-2">
        <span className="truncate text-2xs font-bold uppercase tracking-label text-muted-foreground">
          {headerText}
        </span>
        <button
          type="button"
          onClick={onToggleFilters}
          aria-pressed={filtersOpen}
          aria-label={t('search.filters', 'Filters')}
          className={cn(
            'inline-flex shrink-0 cursor-pointer items-center gap-1 bg-muted rounded-element px-2 py-0.5 text-2xs font-bold uppercase tracking-label transition-colors',
            filtersOpen
              ? 'bg-foreground text-background'
              : 'bg-transparent text-foreground hover:bg-foreground hover:text-background',
          )}
        >
          {t('search.filters', 'Filters')}
          {activeFiltersCount > 0 && <span>· {activeFiltersCount}</span>}
        </button>
      </div>

      <div
        role="listbox"
        aria-label={t('search.results', 'Results')}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: 460 }}
      >
        {error && (
          <div role="alert" className="p-4 text-sm text-destructive">
            {t('search.unavailable', 'Search unavailable')}.{' '}
            <button
              type="button"
              onClick={onSearchAll}
              className="cursor-pointer bg-transparent p-0 text-inherit underline"
            >
              {t('search.retry', 'Retry')}
            </button>
          </div>
        )}

        {loading && suggestions.length === 0 && (
          <div className="p-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3 w-3/5 animate-pulse bg-muted" />
                  <div className="h-2.5 w-2/5 animate-pulse bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results — the mock's own screen. The metaphor does the work: a
            missing place is a station that has not been built, and the next
            sentence is an invitation to build it, not an apology. */}
        {thin && (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <NoStationTrack />
            <p className="mt-2 font-display text-headline leading-tight">
              {t('search.noStation', 'No station by that name — yet')}
            </p>
            <p className="mt-2 text-13 text-muted-foreground">
              {activeScope
                ? t('search.noScopeResults', {
                    defaultValue: 'No {{scope}} for "{{query}}"',
                    scope: scopeLabel,
                    query,
                  })
                : t('search.noResults', { defaultValue: 'No results for "{{query}}"', query })}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {activeScope && (
                <button
                  type="button"
                  onClick={onClearScope}
                  className="cursor-pointer bg-transparent px-4 py-1.5 text-13 font-bold transition-colors hover:bg-foreground hover:text-background"
                >
                  {t('search.tryAll', 'Try All')}
                </button>
              )}
              {onAddToMap && (
                <button
                  type="button"
                  onClick={onAddToMap}
                  className="cursor-pointer bg-foreground px-4 py-1.5 text-13 font-bold text-background transition-colors hover:bg-background hover:text-foreground rounded-container shadow-soft"
                >
                  {t('search.addToMap', 'Add it to the map')} →
                </button>
              )}
            </div>
          </div>
        )}

        {suggestions.map((suggestion, i) => {
          const displayName = suggestion.name || suggestion.title || '';
          const subtitle = [suggestion.subtitle, suggestion.city, suggestion.country]
            .filter(Boolean)
            .join(' · ');
          return (
            <SearchResultRow
              key={`${suggestion.type}-${suggestion.id}-${i}`}
              id={`result-${i}`}
              type={suggestion.type}
              name={displayName}
              nameHtml={suggestion.nameHtml}
              query={query}
              subtitle={subtitle || undefined}
              focused={focusedIndex === i}
              onClick={() => onSelect(suggestion, i)}
              onMouseEnter={() => {
                onHover(i);
                onPrefetch(suggestion);
              }}
            />
          );
        })}

        {loading && suggestions.length > 0 && (
          <div className="flex justify-center p-2">
            <TrackLoader size={14} />
          </div>
        )}
      </div>

      {/* Ask-the-guide entry: a natural-language escape hatch, promoted when thin. */}
      {query.length >= 2 && (
        <button
          type="button"
          onClick={onAsk}
          className={cn(
            'flex w-full items-center gap-2 border-t border-border-hairline px-6 py-2 text-left text-13 transition-colors hover:bg-foreground hover:text-background',
            thin && 'font-bold',
          )}
        >
          <span className="truncate">
            {t('search.ask.cta', { defaultValue: 'Ask the guide: "{{query}}"', query })}
          </span>
          <span className="ml-auto shrink-0" aria-hidden>
            →
          </span>
        </button>
      )}

      {/* Results footer, per the mock. The keyboard hint is honest — the
          combobox implements ↑↓ and Enter — and it is the only place the
          shortcut is taught, so it is not hidden behind the empty state. */}
      {visible > 0 && (
        <div className="flex items-center justify-between gap-4 border-t border-border-hairline px-6 py-4 text-13 font-bold">
          <button
            type="button"
            onClick={onSearchAll}
            // The mock hovers this to pink. Pink text on paper measures 3.43:1
            // and this is 13px — it fails AA, and track colour is fill-only
            // anyway. An underline carries the same affordance and costs no
            // contrast.
            className="inline-flex cursor-pointer items-center gap-2 bg-transparent p-0 text-foreground underline-offset-4 hover:underline"
          >
            <TransitIcon name="map" size={16} />
            {t('search.seeOnMap', {
              defaultValue: 'See {{count}} results on the map',
              count: totalCount || visible,
            })}
          </button>
          <span aria-hidden className="hidden shrink-0 text-muted-foreground sm:inline">
            {t('search.keyHints', '↑↓ navigate · ↵ open')}
          </span>
        </div>
      )}
    </div>
  );
}
