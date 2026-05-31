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
import { useRecommendations } from '@/hooks/useRecommendations';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { useNearMe } from '@/hooks/useNearMe';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSearchHotkey } from '@/hooks/useSearchHotkey';
import { useUserMode } from '@/hooks/useUserMode';
import { MODE_SCOPE_BIAS } from '@/config/navigation';
import type { SearchFilters } from '@/hooks/useSearch';
import { SearchPopoverDesktop } from './SearchPopoverDesktop';
import { SearchPopoverMobile } from './SearchPopoverMobile';

const RAIL_SCOPE_IDS = [
  'venue',
  'event',
  'city',
  'country',
  'personality',
  'news',
  'marketplace',
  'tag',
  'queer_village',
];

const ROUTE_HREFS: Record<string, (slug: string) => string> = {
  venue: (s) => `/venues/${s}`,
  event: (s) => `/events/${s}`,
  marketplace: (s) => `/marketplace/${s}`,
  personality: (s) => `/personalities/${s}`,
  city: (s) => `/city/${s}`,
  country: (s) => `/country/${s}`,
  queer_village: (s) => `/queer-villages/${s}`,
  news: (s) => `/news/${s}`,
};

function prefetchRoute(suggestion: SearchSuggestion) {
  const slug = suggestion.slug || suggestion.id;
  const href = ROUTE_HREFS[suggestion.type]?.(slug);
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

function getPlaceholder(pathname: string, t: (k: string, d?: string) => string) {
  if (pathname.startsWith('/admin')) return t('search.placeholders.generic', 'Search...');
  if (pathname.startsWith('/hotels')) return t('search.placeholders.hotels', 'Search hotels...');
  if (pathname.startsWith('/events')) return t('search.placeholders.events', 'Find events...');
  if (pathname.startsWith('/marketplace'))
    return t('search.placeholders.marketplace', 'Browse marketplace...');
  if (pathname.startsWith('/news')) return t('search.placeholders.news', 'Read news...');
  if (pathname.startsWith('/personalities'))
    return t('search.placeholders.personalities', 'Meet personalities...');
  return t('search.placeholders.universal', 'Search venues, events, people, places…');
}

export const UniversalSearchBar = () => {
  const trackClickFromSearch = useTrackClick();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ types: [] });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [focusedPane, setFocusedPane] = useState<'rail' | 'results'>('results');
  const [resultsFocused, setResultsFocused] = useState<number | null>(null);
  const [railFocused, setRailFocused] = useState<number | null>(null);
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
  const { mode } = useUserMode();
  const trendingTypes = useMemo(
    () => (MODE_SCOPE_BIAS[mode] ?? ['venue', 'event']).slice(0, 2),
    [mode],
  );
  const { trending } = useTrendingSuggestions(isOpen && !query, 6, trendingTypes);
  // §9.1 zero-query panel: prefer the personalized/popularity-aware recommendations
  // feed when available; fall back to trending. Gated behind a build flag so the
  // panel fires no /recommendations request until the worker endpoint is deployed
  // (avoids a 404 in preview/prod builds; rollout: deploy worker → flip flag).
  const recsEnabled = import.meta.env.VITE_RECOMMENDATIONS_ENABLED === 'true';
  const { recommendations } = useRecommendations(recsEnabled && isOpen && !query, {
    limit: 6,
    types: trendingTypes,
  });
  const discoveryHits = recommendations.length > 0 ? recommendations : trending;
  const discoverySource: 'recommended' | 'trending' =
    recommendations.length > 0 ? 'recommended' : 'trending';
  const voice = useVoiceSearch();
  const nearMe = useNearMe();

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
      const slug = suggestion.slug || suggestion.id;
      const href = ROUTE_HREFS[suggestion.type]?.(slug);
      if (href) {
        navigate(href);
      } else if (suggestion.type === 'tag') {
        navigate(
          `/resources/${(suggestion.name || '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '%20')}`,
        );
      } else if (suggestion.type === 'user') {
        navigate(`/user/${suggestion.id}`);
      } else if (suggestion.type === 'group') {
        navigate(`/groups/${suggestion.id}`);
      } else {
        navigate(
          `/search?q=${encodeURIComponent(displayName)}&types=${suggestion.type}&direct=true`,
        );
      }
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

  // Rail navigable list: [All, ...RAIL_SCOPE_IDS]
  const railLength = 1 + RAIL_SCOPE_IDS.length;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Alt+1..9 → scope shortcut
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const target = idx === 0 ? null : (RAIL_SCOPE_IDS[idx - 1] ?? null);
        setScope(target);
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
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

      if (e.key === 'ArrowLeft') {
        if (focusedPane !== 'rail') {
          setFocusedPane('rail');
          const currentRailIdx = activeScope ? 1 + RAIL_SCOPE_IDS.indexOf(activeScope) : 0;
          setRailFocused(currentRailIdx >= 0 ? currentRailIdx : 0);
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        if (focusedPane !== 'results') {
          setFocusedPane('results');
          setResultsFocused(suggestions.length > 0 ? 0 : null);
          e.preventDefault();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (focusedPane === 'rail') {
          setRailFocused((i) => (i === null ? 0 : (i + 1) % railLength));
        } else {
          setResultsFocused((i) => {
            if (suggestions.length === 0) return null;
            if (i === null) return 0;
            return Math.min(i + 1, suggestions.length - 1);
          });
        }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (focusedPane === 'rail') {
          setRailFocused((i) => (i === null ? railLength - 1 : (i - 1 + railLength) % railLength));
        } else {
          setResultsFocused((i) => (i === null || i === 0 ? null : i - 1));
        }
        return;
      }

      if (e.key === 'Enter') {
        if (focusedPane === 'rail' && railFocused !== null) {
          e.preventDefault();
          const target = railFocused === 0 ? null : (RAIL_SCOPE_IDS[railFocused - 1] ?? null);
          setScope(target);
          setFocusedPane('results');
          return;
        }
        if (focusedPane === 'results' && resultsFocused !== null && suggestions[resultsFocused]) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[resultsFocused]);
          return;
        }
        handleSearch();
      }
    },
    [
      activeScope,
      focusedPane,
      handleSearch,
      handleSelectSuggestion,
      query,
      railFocused,
      railLength,
      resultsFocused,
      setScope,
      suggestions,
    ],
  );

  // ⌘K / Ctrl+K hotkey.
  useSearchHotkey(() => {
    setIsOpen(true);
    focusInput();
  });

  // Auto-focus when popover opens.
  useEffect(() => {
    if (isOpen) focusInput();
  }, [isOpen, focusInput]);

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  const activeFiltersCount =
    (filters.types?.length || 0) +
    (filters.location ? 1 : 0) +
    (filters.categories?.length || 0) +
    (filters.priceRange ? 1 : 0) +
    (filters.rating ? 1 : 0);

  const removeRecent = useCallback((index: number) => {
    setRecentSearches((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      localStorage.setItem('recent-searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecents = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem('recent-searches');
  }, []);

  const placeholder = useMemo(() => getPlaceholder(location.pathname, t), [location.pathname, t]);

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
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  type="text"
                  aria-label={t('search.ariaLabel', 'Search Queer Guide')}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isOpen}
                  aria-controls="qg-search-listbox"
                  aria-haspopup="listbox"
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
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
                  className="w-full border-0 bg-transparent pr-20 text-sm shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-sm"
                  style={{ fontSize: isMobile ? '1rem' : '0.875rem', height: inputHeight }}
                />
                {!query && (
                  <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                    {voice.supported && (
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
                          height: isMobile ? 32 : 24,
                          width: isMobile ? 32 : 24,
                        }}
                      >
                        <Mic style={{ height: isMobile ? 16 : 14, width: isMobile ? 16 : 14 }} />
                      </Button>
                    )}
                    {!isMobile && (
                      <kbd
                        aria-hidden="true"
                        className="pointer-events-none border border-border px-1.5 py-0.5 text-[0.7rem] leading-none text-muted-foreground font-[inherit]"
                      >
                        {isMac ? '⌘K' : 'Ctrl+K'}
                      </kbd>
                    )}
                  </span>
                )}
                {query && (
                  <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    {suggestionsLoading && (
                      <Loader2
                        className="animate-spin text-muted-foreground"
                        style={{ height: isMobile ? 14 : 12, width: isMobile ? 14 : 12 }}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Clear search"
                      className="p-0 text-muted-foreground hover:text-foreground"
                      style={{ height: isMobile ? 32 : 24, width: isMobile ? 32 : 24 }}
                      onClick={() => {
                        setQuery('');
                        focusInput();
                      }}
                    >
                      <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
                    </Button>
                  </span>
                )}
              </div>
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="rounded-none border-border p-0 shadow-none"
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
              : { width: 'min(820px, calc(100vw - 32px))', zIndex: 50 }
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
          onEscapeKeyDown={() => setIsOpen(false)}
          onPointerDownOutside={(e) => {
            // Clicking the search box itself is the anchor, not "outside" —
            // don't let Radix dismiss the popover we just opened.
            if (searchBoxRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (searchBoxRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          {isMobile ? (
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
              resultsFocused={focusedPane === 'results' ? resultsFocused : null}
              railFocused={focusedPane === 'rail' ? railFocused : null}
              setResultsFocused={(i) => {
                setResultsFocused(i);
                setFocusedPane('results');
              }}
              activeFiltersCount={activeFiltersCount}
              onSearchAll={() => handleSearch()}
              removeRecent={removeRecent}
              clearRecents={clearRecents}
              onSelectRecent={(term) => {
                setQuery(term);
                handleSearch(term);
              }}
              nearMeSupported={nearMe.supported}
              nearMeLoading={nearMe.loading}
              onNearMe={async () => {
                const c = await nearMe.request();
                if (!c) return;
                setIsOpen(false);
                navigate(`/search?lat=${c.lat}&lng=${c.lng}&radius=25000`);
              }}
              onBrowseAll={() => {
                setIsOpen(false);
                navigate('/search');
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
              isMac={isMac}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};
