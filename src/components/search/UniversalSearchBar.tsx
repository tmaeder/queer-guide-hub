import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Loader2, Search, X, Mic } from 'lucide-react';
import { useTrackClick } from '@/hooks/useSearchActions';
import { trackSearchUx } from '@/lib/searchClient';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSearchSuggestions, type SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import { useSearchRecommendations } from '@/hooks/useSearchRecommendations';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSearchHotkey } from '@/hooks/useSearchHotkey';
import { useUserMode } from '@/hooks/useUserMode';
import { useAuth } from '@/hooks/useAuth';
import { useAssistant } from '@/hooks/useAssistant';
import { MODE_SCOPE_BIAS } from '@/config/navigation';
import type { SearchFilters } from '@/hooks/useSearch';
import type { AssistantCard } from '@/lib/assistantClient';
import { detailHref } from '@/lib/searchRoutes';
import { SearchPopoverDesktop } from './SearchPopoverDesktop';
import { SearchPopoverMobile } from './SearchPopoverMobile';
import { SearchAskPanel } from './SearchAskPanel';

// Order for Alt+1-9 scope shortcuts (mirrors SearchScopeChips).
const SCOPE_IDS = [
  'venue',
  'event',
  'marketplace',
  'news',
  'personality',
  'city',
  'queer_village',
];

function prefetchRoute(suggestion: SearchSuggestion) {
  // Only prefetch a canonical detail route — `detailHref` returns null for
  // slug-less / UUID-only hits so we never warm a /type/<uuid> dead link.
  const href = detailHref({
    type: suggestion.type,
    slug: suggestion.slug,
    id: suggestion.id,
    title: suggestion.name || suggestion.title,
  });
  if (!href) return;
  try {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = href;
    document.head.appendChild(link);
    setTimeout(() => link.remove(), 30_000);
  } catch {
    /* ignore */
  }
}

function getPlaceholder(
  pathname: string,
  t: (k: string, d?: string) => string,
  isMobile: boolean,
) {
  if (pathname.startsWith('/admin')) return t('search.placeholders.generic', 'Search...');
  if (pathname.startsWith('/hotels')) return t('search.placeholders.hotels', 'Search hotels...');
  if (pathname.startsWith('/events')) return t('search.placeholders.events', 'Find events...');
  if (pathname.startsWith('/marketplace'))
    return t('search.placeholders.marketplace', 'Browse marketplace...');
  if (pathname.startsWith('/news')) return t('search.placeholders.news', 'Read news...');
  if (pathname.startsWith('/personalities'))
    return t('search.placeholders.personalities', 'Meet personalities...');
  // The full universal placeholder overflows the narrow mobile header input
  // (it clipped to "Sear"). Use a short label on mobile.
  if (isMobile) return t('search.placeholders.universalShort', 'Search…');
  return t('search.placeholders.universal', 'Search venues, events, people, places…');
}

export const UniversalSearchBar = () => {
  const trackClickFromSearch = useTrackClick();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'search' | 'ask'>('search');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ types: [] });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [resultsFocused, setResultsFocused] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedRef = useRef(false);
  // When the popover closes it refocuses the input; suppress the focus handler
  // from immediately re-opening it (otherwise Cancel/Escape can't close it).
  const suppressReopenRef = useRef(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const assistant = useAssistant();

  const activeScope = filters.types && filters.types.length === 1 ? filters.types[0] : null;
  const scopeArray = useMemo(() => (activeScope ? [activeScope] : undefined), [activeScope]);

  // Close the popover on route change; clear query when leaving /search.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;
    if (prevPath !== location.pathname) {
      setIsOpen(false);
      setShowFilters(false);
      setMode('search');
      if (prevPath.startsWith('/search') && !location.pathname.startsWith('/search')) {
        setQuery('');
      }
    }
  }, [location.pathname]);

  const {
    suggestions,
    countsByType,
    loading: suggestionsLoading,
    error: suggestionsError,
  } = useSearchSuggestions(query, scopeArray);
  const { mode: userMode } = useUserMode();
  const trendingTypes = useMemo(
    () => (MODE_SCOPE_BIAS[userMode] ?? ['venue', 'event']).slice(0, 2),
    [userMode],
  );
  const { trending } = useTrendingSuggestions(isOpen && !query, 6, trendingTypes);
  // §9.1 zero-query panel: prefer the personalized/popularity-aware recommendations
  // feed when available; fall back to trending. Gated behind a build flag so the
  // panel fires no /recommendations request until the worker endpoint is deployed.
  const recsEnabled = import.meta.env.VITE_RECOMMENDATIONS_ENABLED === 'true';
  const { user } = useAuth();
  const { recommendations } = useSearchRecommendations(recsEnabled && isOpen && !query, {
    limit: 6,
    types: trendingTypes,
    userId: user?.id ?? null,
  });
  const discoveryHits = recommendations.length > 0 ? recommendations : trending;
  const discoverySource: 'recommended' | 'trending' =
    recommendations.length > 0 ? 'recommended' : 'trending';
  const voice = useVoiceSearch();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    if (voice.transcript) setQuery(voice.transcript);
  }, [voice.transcript]);

  useEffect(() => {
    const saved = localStorage.getItem('recent-searches');
    if (!saved) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
      setRecentSearches(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // Reset virtual focus when results change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect synchronizes state with external props/data; React Compiler can't infer the sync direction. Documented exemption from the eslint.config.js staged-ratchet plan.
    setResultsFocused(null);
  }, [suggestions.length, activeScope]);

  const saveRecentSearch = useCallback((searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setRecentSearches((prev) => {
      const updated = [searchTerm, ...prev.filter((s) => s !== searchTerm)].slice(0, 10);
      localStorage.setItem('recent-searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const focusInput = useCallback(() => {
    // Microtask defer covers the focus-after-Radix-opens-popover races.
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  const handleSearch = useCallback(
    (searchQuery?: string) => {
      const searchTerm = searchQuery ?? query;
      if (!searchTerm.trim()) return;
      saveRecentSearch(searchTerm);
      const params = new URLSearchParams({
        q: searchTerm,
        ...(filters.types && filters.types.length > 0 && { types: filters.types.join(',') }),
        ...(filters.location && { location: filters.location }),
        ...(filters.categories &&
          filters.categories.length > 0 && { categories: filters.categories.join(',') }),
        ...(filters.cluster_ids &&
          filters.cluster_ids.length > 0 && { clusters: filters.cluster_ids.join(',') }),
      });
      void trackSearchUx('search_submit', {
        query: searchTerm,
        scope: activeScope || 'all',
        filters_count:
          (filters.types?.length || 0) +
          (filters.location ? 1 : 0) +
          (filters.categories?.length || 0) +
          (filters.cluster_ids?.length || 0),
        source: 'universal_searchbar',
      });
      navigate(`/search?${params}`);
      setIsOpen(false);
    },
    [query, filters, activeScope, navigate, saveRecentSearch],
  );

  const handleSelectSuggestion = useCallback(
    (suggestion: SearchSuggestion) => {
      justSelectedRef.current = true;
      const displayName = suggestion.name || suggestion.title || '';
      setQuery(displayName);
      if (suggestion.id && suggestion.type) {
        trackClickFromSearch({ type: suggestion.type, id: suggestion.id }, 'autocomplete', {
          query: displayName,
        });
      }
      // `detailHref` handles tags (by name), group/user (by id) and slug-keyed
      // types (canonical slug only). A slug-less / UUID-only hit returns null,
      // so we route to a fresh search on the label instead of a dead link.
      const href = detailHref({
        type: suggestion.type,
        slug: suggestion.slug,
        id: suggestion.id,
        title: suggestion.name || suggestion.title,
      });
      navigate(
        href ??
          `/search?q=${encodeURIComponent(displayName)}&types=${suggestion.type}&direct=true`,
      );
      setIsOpen(false);
    },
    [navigate, trackClickFromSearch],
  );

  const setScope = useCallback(
    (scope: string | null) => {
      setFilters((f) => ({ ...f, types: scope ? [scope] : [] }));
      focusInput();
    },
    [focusInput],
  );

  // Enter the inline Ask-the-guide chat, seeding it with the current query.
  const enterAsk = useCallback(() => {
    setMode('ask');
    const q = query.trim();
    if (q && assistant.messages.length === 0 && !assistant.pending) {
      void assistant.send(q);
    }
  }, [query, assistant]);

  const navigateToCard = useCallback(
    (card: AssistantCard) => {
      setIsOpen(false);
      const href = detailHref({
        type: card.type,
        slug: card.slug as string,
        id: card.objectID,
        title: card.title,
      });
      navigate(href ?? `/search?q=${encodeURIComponent(card.title ?? '')}`);
    },
    [navigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Alt+1..9 → scope shortcut
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const target = idx === 0 ? null : (SCOPE_IDS[idx - 1] ?? null);
        setScope(target);
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        if (mode === 'ask') {
          setMode('search');
          focusInput();
        } else {
          setIsOpen(false);
          inputRef.current?.blur();
        }
        return;
      }

      // Tab → inline completion against top suggestion's prefix.
      if (e.key === 'Tab' && !e.shiftKey && query && suggestions[0]) {
        const top = suggestions[0];
        const candidate = (top.name || top.title || '').toString();
        if (
          candidate &&
          candidate.toLowerCase().startsWith(query.toLowerCase()) &&
          candidate !== query
        ) {
          e.preventDefault();
          setQuery(candidate);
          return;
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setResultsFocused((i) => {
          if (suggestions.length === 0) return null;
          if (i === null) return 0;
          return Math.min(i + 1, suggestions.length - 1);
        });
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setResultsFocused((i) => (i === null || i === 0 ? null : i - 1));
        return;
      }

      if (e.key === 'Enter') {
        if (resultsFocused !== null && suggestions[resultsFocused]) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[resultsFocused]);
          return;
        }
        handleSearch();
      }
    },
    [mode, query, suggestions, resultsFocused, setScope, focusInput, handleSelectSuggestion, handleSearch],
  );

  // ⌘K / Ctrl+K hotkey.
  useSearchHotkey(() => {
    setIsOpen(true);
    focusInput();
  });

  // Auto-focus when popover opens (search mode only — Ask owns its own input).
  useEffect(() => {
    if (isOpen && mode === 'search') focusInput();
  }, [isOpen, mode, focusInput]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  const activeFiltersCount =
    (filters.types?.length || 0) +
    (filters.location ? 1 : 0) +
    (filters.categories?.length || 0) +
    (filters.priceRange ? 1 : 0) +
    (filters.rating ? 1 : 0);

  const clearRecents = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem('recent-searches');
  }, []);

  const placeholder = useMemo(
    () => getPlaceholder(location.pathname, t, isMobile),
    [location.pathname, t, isMobile],
  );

  const inputHeight = isMobile ? 48 : 40;
  const iconSize = isMobile ? 20 : 16;

  return (
    <div className="min-w-0 flex-1">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- search landmark also acts as a click target to focus the inner input; keyboard handling provided. */}
            <div
              ref={searchBoxRef}
              role="search"
              aria-label="Site search"
              className="flex cursor-text items-center rounded-container bg-muted transition-colors hover:bg-accent"
              onClick={() => {
                setIsOpen(true);
                focusInput();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsOpen(true);
                  focusInput();
                }
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none inline-flex shrink-0 items-center justify-center text-muted-foreground"
                style={{ height: inputHeight, paddingInline: isMobile ? 16 : 12 }}
              >
                <Search style={{ height: iconSize, width: iconSize }} />
              </span>
              <Input
                ref={inputRef}
                type="text"
                aria-label={t('search.ariaLabel', 'Search Queer Guide')}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isOpen}
                aria-controls="qg-search-listbox"
                aria-haspopup="listbox"
                aria-activedescendant={resultsFocused !== null ? `result-${resultsFocused}` : undefined}
                placeholder={placeholder}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (mode === 'ask') setMode('search');
                  if (!isOpen && !justSelectedRef.current) setIsOpen(true);
                  justSelectedRef.current = false;
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (suppressReopenRef.current) {
                    suppressReopenRef.current = false;
                    return;
                  }
                  setIsOpen(true);
                }}
                autoComplete="off"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-sm"
                style={{
                  fontSize: isMobile ? '1rem' : '0.875rem',
                  height: inputHeight,
                }}
              />
              {/* Trailing controls sit in a flex sibling cell (not absolutely
                positioned over the input) so their tap targets don't overlap
                the input — WCAG 2.5.8 target-size was failing the voice/clear
                buttons on every page (safe clickable space ~15px). */}
              <span className="flex shrink-0 items-center gap-1.5 pe-2">
                {!query && voice.supported && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={
                      voice.listening
                        ? t('search.stopVoice', 'Stop voice search')
                        : t('search.voice', 'Voice search')
                    }
                    aria-pressed={voice.listening}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (voice.listening) voice.stop();
                      else voice.start();
                    }}
                    className={cn(
                      'p-0',
                      voice.listening ? 'text-destructive' : 'text-muted-foreground',
                    )}
                    style={{
                      height: isMobile ? 32 : 28,
                      width: isMobile ? 32 : 28,
                    }}
                  >
                    <Mic style={{ height: isMobile ? 16 : 14, width: isMobile ? 16 : 14 }} />
                  </Button>
                )}
                {!query && !isMobile && (
                  <kbd
                    aria-hidden="true"
                    className="pointer-events-none border border-border px-1.5 py-0.5 text-xs2 leading-none text-muted-foreground font-[inherit]"
                  >
                    {isMac ? '⌘K' : 'Ctrl+K'}
                  </kbd>
                )}
                {query && suggestionsLoading && (
                  <Loader2
                    className="animate-spin text-muted-foreground"
                    style={{ height: isMobile ? 14 : 12, width: isMobile ? 14 : 12 }}
                  />
                )}
                {query && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Clear search"
                    className="p-0 text-muted-foreground hover:text-foreground"
                    style={{ height: isMobile ? 32 : 28, width: isMobile ? 32 : 28 }}
                    onClick={() => {
                      setQuery('');
                      focusInput();
                    }}
                  >
                    <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
                  </Button>
                )}
              </span>
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          // qg-mobile-search-overlay: a CSS hook (src/index.css) that neutralizes
          // Radix's translated popper wrapper so the fixed full-screen mobile
          // sheet anchors to the viewport, not the transformed wrapper.
          className={cn(
            'w-[var(--radix-popover-trigger-width)] overflow-hidden p-0',
            isMobile && 'qg-mobile-search-overlay rounded-none',
          )}
          style={
            isMobile
              ? {
                  position: 'fixed',
                  inset: 0,
                  width: '100vw',
                  height: '100dvh',
                  maxHeight: '100dvh',
                  zIndex: 50,
                }
              : undefined
          }
          align="start"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            focusInput();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            suppressReopenRef.current = true;
            inputRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => {
            if (mode === 'ask') {
              e.preventDefault();
              setMode('search');
              focusInput();
            } else {
              setIsOpen(false);
            }
          }}
          onPointerDownOutside={(e) => {
            // Clicking the search box itself is the anchor, not "outside" —
            // don't let Radix dismiss the popover we just opened.
            if (searchBoxRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (searchBoxRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          {mode === 'ask' ? (
            <SearchAskPanel
              messages={assistant.messages}
              pending={assistant.pending}
              error={assistant.error}
              onSend={(m) => void assistant.send(m)}
              onBack={() => {
                setMode('search');
                focusInput();
              }}
              onSelectCard={navigateToCard}
            />
          ) : isMobile ? (
            <SearchPopoverMobile
              query={query}
              activeScope={activeScope}
              suggestions={suggestions}
              countsByType={countsByType}
              loading={suggestionsLoading}
              error={suggestionsError}
              trending={discoveryHits}
              discoverySource={discoverySource}
              showFilters={showFilters}
              filters={filters}
              setFilters={setFilters}
              setScope={setScope}
              onSelect={handleSelectSuggestion}
              onSearchAll={() => handleSearch()}
              onToggleFilters={() => setShowFilters(!showFilters)}
              activeFiltersCount={activeFiltersCount}
              onClose={() => setIsOpen(false)}
              onClear={() => {
                setQuery('');
                focusInput();
              }}
              onPrefetch={prefetchRoute}
              navigate={navigate}
              onAsk={enterAsk}
              recentSearches={recentSearches}
              onSelectRecent={(term) => {
                setQuery(term);
                handleSearch(term);
              }}
              clearRecents={clearRecents}
            />
          ) : (
            <SearchPopoverDesktop
              query={query}
              activeScope={activeScope}
              suggestions={suggestions}
              countsByType={countsByType}
              loading={suggestionsLoading}
              error={suggestionsError}
              trending={discoveryHits}
              discoverySource={discoverySource}
              recentSearches={recentSearches}
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              filters={filters}
              setFilters={setFilters}
              setScope={setScope}
              onSelectIndex={(s, i) => {
                setResultsFocused(i);
                handleSelectSuggestion(s);
              }}
              resultsFocused={resultsFocused}
              setResultsFocused={setResultsFocused}
              activeFiltersCount={activeFiltersCount}
              onSearchAll={() => handleSearch()}
              clearRecents={clearRecents}
              onSelectRecent={(term) => {
                setQuery(term);
                handleSearch(term);
              }}
              onSelectTrending={(hit) =>
                handleSelectSuggestion({
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
                setIsOpen(false);
                navigate(path);
              }}
              onPrefetch={prefetchRoute}
              onAsk={enterAsk}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
