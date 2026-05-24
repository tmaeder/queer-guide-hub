import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';

function sanitizeMeiliHighlight(html: string): string {
  return html.replace(/<(?!\/?em\b)[^>]+>/gi, '').replace(/<em\b[^>]*>/gi, '<em>');
}

function HighlightedText({
  text,
  query,
  html,
}: {
  text: string;
  query: string;
  html?: string | null;
}) {
  if (!text) return null;
  if (html && /<em>/i.test(html)) {
    return (
      <span
        dangerouslySetInnerHTML={{ __html: sanitizeMeiliHighlight(html) }}
        className="qg-search-highlight [&_em]:font-bold [&_em]:not-italic"
      />
    );
  }
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent text-inherit font-bold underline underline-offset-2">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

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
}: SearchPopoverResultsProps) {
  const { t } = useTranslation();
  const totalCount = Object.values(countsByType).reduce((a, b) => a + b, 0);
  const visible = suggestions.length;

  const scopeLabel = activeScope
    ? (CONTENT_TYPES.find((c) => c.id === activeScope)?.label ?? activeScope)
    : t('search.allLabel', 'All');

  const headerText = query
    ? totalCount > visible
      ? `"${query}" — ${visible} of ${totalCount} ${totalCount === 1 ? t('search.resultOne', 'result') : t('search.resultMany', 'results')}`
      : `"${query}" — ${visible} ${visible === 1 ? t('search.resultOne', 'result') : t('search.resultMany', 'results')}`
    : `${scopeLabel}`;

  return (
    <div className="flex flex-1 min-w-0 flex-col">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate text-xs text-muted-foreground">{headerText}</span>
        <button
          type="button"
          onClick={onToggleFilters}
          aria-pressed={filtersOpen}
          aria-label={t('search.filters', 'Filters')}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 border border-border px-2 py-0.5 text-xs text-foreground transition-colors',
            filtersOpen ? 'bg-accent' : 'bg-transparent hover:bg-accent',
          )}
        >
          <SlidersHorizontal size={12} />
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
        style={{ maxHeight: 480 }}
      >
        {error && (
          <div
            role="alert"
            className="border-b border-border p-4 text-sm text-destructive"
          >
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
              <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                <div className="h-10 w-10 animate-pulse bg-muted" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <div className="h-2.5 w-3/5 animate-pulse bg-muted" />
                  <div className="h-2 w-2/5 animate-pulse bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && query.length >= 2 && suggestions.length === 0 && (
          <div className="p-8 text-center">
            <Search size={24} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {activeScope
                ? t('search.noScopeResults', {
                    defaultValue: 'No {{scope}} for "{{query}}"',
                    scope: scopeLabel,
                    query,
                  })
                : t('search.noResults', { defaultValue: 'No results for "{{query}}"', query })}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {activeScope ? (
                <button
                  type="button"
                  onClick={onClearScope}
                  className="cursor-pointer bg-transparent p-0 text-inherit underline"
                >
                  {t('search.tryAll', 'Try All')} →
                </button>
              ) : (
                t('search.tryDifferent', 'Try different keywords')
              )}
            </p>
          </div>
        )}

        {suggestions.map((suggestion, i) => {
          const Icon = suggestion.icon as React.ComponentType<{ className?: string }>;
          const focused = focusedIndex === i;
          const displayName = suggestion.name || suggestion.title || '';
          return (
            <div
              key={`${suggestion.type}-${suggestion.id}-${i}`}
              id={`result-${i}`}
              role="option"
              aria-selected={focused}
              onClick={() => onSelect(suggestion, i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect(suggestion, i);
              }}
              onMouseEnter={() => {
                onHover(i);
                onPrefetch(suggestion);
              }}
              tabIndex={-1}
              className={cn(
                'flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors min-h-[52px]',
                focused ? 'bg-accent outline outline-1 -outline-offset-1 outline-ring' : 'hover:bg-accent',
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-border bg-muted">
                {suggestion.image ? (
                  <img
                    src={suggestion.image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">
                  <HighlightedText text={displayName} query={query} html={suggestion.nameHtml} />
                </span>
                {(suggestion.subtitle || suggestion.city || suggestion.country) && (
                  <span className="truncate text-xs text-muted-foreground">
                    {[suggestion.subtitle, suggestion.city, suggestion.country]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </div>
              <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
            </div>
          );
        })}

        {loading && suggestions.length > 0 && (
          <div className="flex justify-center p-2">
            <Loader2 className="animate-spin text-muted-foreground" size={14} />
          </div>
        )}
      </div>
    </div>
  );
}
