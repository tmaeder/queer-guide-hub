import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { type SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { CONTENT_TYPES } from '@/lib/searchTaxonomy';

function sanitizeMeiliHighlight(html: string): string {
  return html.replace(/<(?!\/?em\b)[^>]+>/gi, '').replace(/<em\b[^>]*>/gi, '<em>');
}

function HighlightedText({ text, query, html }: { text: string; query: string; html?: string | null }) {
  if (!text) return null;
  if (html && /<em>/i.test(html)) {
    return (
      <span
        dangerouslySetInnerHTML={{ __html: sanitizeMeiliHighlight(html) }}
        style={{ ['--em-weight' as string]: '700' } as React.CSSProperties}
        className="qg-search-highlight"
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
      <mark style={{ background: 'transparent', color: 'inherit', fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 2 }}>
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

  const scopeLabel =
    activeScope ? CONTENT_TYPES.find((c) => c.id === activeScope)?.label ?? activeScope : t('search.allLabel', 'All');

  const headerText = query
    ? totalCount > visible
      ? `"${query}" — ${visible} of ${totalCount} ${totalCount === 1 ? t('search.resultOne', 'result') : t('search.resultMany', 'results')}`
      : `"${query}" — ${visible} ${visible === 1 ? t('search.resultOne', 'result') : t('search.resultMany', 'results')}`
    : `${scopeLabel}`;

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid hsl(var(--border))',
          minHeight: 36,
          gap: 8,
        }}
      >
        <span
          className="text-xs text-muted-foreground"
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {headerText}
        </span>
        <button
          type="button"
          onClick={onToggleFilters}
          aria-pressed={filtersOpen}
          aria-label={t('search.filters', 'Filters')}
          className="text-xs"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            border: '1px solid hsl(var(--border))',
            background: filtersOpen ? 'hsl(var(--accent))' : 'transparent',
            color: 'hsl(var(--foreground))',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <SlidersHorizontal style={{ height: 12, width: 12 }} />
          {t('search.filters', 'Filters')}
          {activeFiltersCount > 0 && (
            <span style={{ color: 'hsl(var(--muted-foreground))' }}>· {activeFiltersCount}</span>
          )}
        </button>
      </div>

      <div role="listbox" aria-label={t('search.results', 'Results')} style={{ flex: 1, overflowY: 'auto', maxHeight: 480 }}>
        {error && (
          <div role="alert" style={{ padding: '12px', borderBottom: '1px solid hsl(var(--border))', color: 'hsl(var(--destructive))', fontSize: '0.8rem' }}>
            {t('search.unavailable', 'Search unavailable')}. <button type="button" onClick={onSearchAll} style={{ textDecoration: 'underline', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}>{t('search.retry', 'Retry')}</button>
          </div>
        )}

        {loading && suggestions.length === 0 && (
          <div style={{ padding: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px' }}>
                <div style={{ height: 40, width: 40, background: 'hsl(var(--muted))' }} className="animate-pulse" />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="animate-pulse" style={{ height: 10, width: '60%', background: 'hsl(var(--muted))' }} />
                  <div className="animate-pulse" style={{ height: 8, width: '40%', background: 'hsl(var(--muted))' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && query.length >= 2 && suggestions.length === 0 && (
          <div style={{ padding: '32px 12px', textAlign: 'center' }}>
            <Search style={{ height: 24, width: 24, opacity: 0.4, margin: '0 auto 8px' }} />
            <p className="text-sm">
              {activeScope
                ? t('search.noScopeResults', { defaultValue: 'No {{scope}} for "{{query}}"', scope: scopeLabel, query })
                : t('search.noResults', { defaultValue: 'No results for "{{query}}"', query })}
            </p>
            <p className="text-xs text-muted-foreground" style={{ marginTop: 4 }}>
              {activeScope ? (
                <button type="button" onClick={onClearScope} style={{ textDecoration: 'underline', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}>
                  {t('search.tryAll', 'Try All')} →
                </button>
              ) : (
                t('search.tryDifferent', 'Try different keywords')
              )}
            </p>
          </div>
        )}

        {suggestions.map((suggestion, i) => {
          const Icon = suggestion.icon as React.ComponentType<{ style?: React.CSSProperties }>;
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
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                cursor: 'pointer',
                minHeight: 52,
                background: focused ? 'hsl(var(--accent))' : 'transparent',
                outline: focused ? '1px solid hsl(var(--ring))' : 'none',
                outlineOffset: -1,
              }}
            >
              <div
                style={{
                  height: 40,
                  width: 40,
                  flexShrink: 0,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--muted))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {suggestion.image ? (
                  <img
                    src={suggestion.image}
                    alt=""
                    loading="lazy"
                    style={{ height: '100%', width: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Icon style={{ height: 16, width: 16, color: 'hsl(var(--muted-foreground))' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span
                  className="text-sm"
                  style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  <HighlightedText text={displayName} query={query} html={suggestion.nameHtml} />
                </span>
                {(suggestion.subtitle || suggestion.city || suggestion.country) && (
                  <span
                    className="text-xs text-muted-foreground"
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {[suggestion.subtitle, suggestion.city, suggestion.country].filter(Boolean).join(' · ')}
                  </span>
                )}
              </div>
              <Icon style={{ height: 12, width: 12, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
            </div>
          );
        })}

        {loading && suggestions.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 8 }}>
            <Loader2 className="animate-spin" style={{ height: 14, width: 14, color: 'hsl(var(--muted-foreground))' }} />
          </div>
        )}
      </div>
    </div>
  );
}
