import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, SlidersHorizontal, Sparkles } from 'lucide-react';
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
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="truncate text-xs text-muted-foreground">{headerText}</span>
        <button
          type="button"
          onClick={onToggleFilters}
          aria-pressed={filtersOpen}
          aria-label={t('search.filters', 'Filters')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-badge border border-border px-2 py-0.5 text-xs text-foreground transition-colors',
            filtersOpen ? 'bg-accent' : 'bg-transparent hover:bg-accent',
          )}
        >
          <SlidersHorizontal className="h-3 w-3" />
          {t('search.filters', 'Filters')}
          {activeFiltersCount > 0 && (
            <span className="text-muted-foreground">· {activeFiltersCount}</span>
          )}
        </button>
      </div>

      <div
        role="listbox"
        aria-label={t('search.results', 'Results')}
        className="flex-1 overflow-y-auto"
        style={{ maxHeight: 460 }}
      >
        {error && (
          <div role="alert" className="border-b border-border p-4 text-sm text-destructive">
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
              <div key={i} className="flex items-center gap-4 px-2 py-2">
                <div className="h-12 w-12 animate-pulse rounded-element bg-muted" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3 w-3/5 animate-pulse bg-muted" />
                  <div className="h-2.5 w-2/5 animate-pulse bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {thin && (
          <div className="p-6 text-center">
            <Search className="mx-auto mb-2 h-6 w-6 opacity-40" />
            <p className="text-sm font-medium">
              {activeScope
                ? t('search.noScopeResults', {
                    defaultValue: 'No {{scope}} for "{{query}}"',
                    scope: scopeLabel,
                    query,
                  })
                : t('search.noResults', { defaultValue: 'No results for "{{query}}"', query })}
            </p>
            {activeScope && (
              <button
                type="button"
                onClick={onClearScope}
                className="mt-2 cursor-pointer bg-transparent p-0 text-xs text-muted-foreground underline"
              >
                {t('search.tryAll', 'Try All')} →
              </button>
            )}
          </div>
        )}

        {suggestions.map((suggestion, i) => {
          const Icon = suggestion.icon as React.ComponentType<{ className?: string }>;
          const displayName = suggestion.name || suggestion.title || '';
          const subtitle = [suggestion.subtitle, suggestion.city, suggestion.country]
            .filter(Boolean)
            .join(' · ');
          return (
            <SearchResultRow
              key={`${suggestion.type}-${suggestion.id}-${i}`}
              id={`result-${i}`}
              image={suggestion.image}
              Icon={Icon}
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
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Ask-the-guide entry: a natural-language escape hatch, promoted when thin. */}
      {query.length >= 2 && (
        <button
          type="button"
          onClick={onAsk}
          className={cn(
            'flex w-full items-center gap-2 border-t border-border px-4 py-2 text-left text-sm transition-colors hover:bg-accent',
            thin && 'bg-muted font-medium',
          )}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {t('search.ask.cta', { defaultValue: 'Ask the guide: "{{query}}"', query })}
          </span>
          <span className="ml-auto shrink-0 text-muted-foreground">→</span>
        </button>
      )}
    </div>
  );
}
