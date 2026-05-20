import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTrackClick } from '@/hooks/useSearchActions';
import { trackSearchUx } from '@/lib/searchClient';
import { useLocation } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInputTyped } from '@/components/ui/search-input-typed';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Search, X, Mic, SlidersHorizontal } from 'lucide-react';
import { useSearchSuggestions, type SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { useTrendingSuggestions } from '@/hooks/useTrendingSuggestions';
import { useVoiceSearch } from '@/hooks/useVoiceSearch';
import { useNearMe } from '@/hooks/useNearMe';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSearchHotkey } from '@/hooks/useSearchHotkey';
import { SearchScopeChips } from './SearchScopeChips';
import { SearchPopoverRail } from './SearchPopoverRail';
import { SearchPopoverResults } from './SearchPopoverResults';
import { SearchPopoverEmpty } from './SearchPopoverEmpty';
import type { SearchFilters } from '@/hooks/useSearch';

const SearchFiltersPanel = lazy(() =>
  import('./SearchFiltersPanel').then((m) => ({ default: m.SearchFiltersPanel })),
);

const RAIL_SCOPE_IDS = ['venue', 'event', 'city', 'country', 'personality', 'news', 'marketplace', 'tag', 'queer_village'];

function KbdHint({ label, desc }: { label: string; desc: string }) {
  return (
    <span className="inline-flex items-center" style={{ gap: 4 }}>
      <kbd
        style={{
          display: 'inline-block',
          minWidth: 18,
          padding: '1px 4px',
          fontSize: '0.65rem',
          lineHeight: 1.2,
          border: '1px solid hsl(var(--border))',
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        {label}
      </kbd>
      {desc}
    </span>
  );
}

function prefetchRoute(suggestion: SearchSuggestion) {
  const slug = suggestion.slug || suggestion.id;
  const href =
    suggestion.type === 'venue' ? `/venues/${slug}`
    : suggestion.type === 'event' ? `/events/${slug}`
    : suggestion.type === 'marketplace' ? `/marketplace/${slug}`
    : suggestion.type === 'personality' ? `/personalities/${slug}`
    : suggestion.type === 'city' ? `/city/${slug}`
    : suggestion.type === 'country' ? `/country/${slug}`
    : suggestion.type === 'queer_village' ? `/queer-villages/${slug}`
    : suggestion.type === 'news' ? `/news/${slug}`
    : null;
  if (!href) return;
  try {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'document';
    link.href = href;
    document.head.appendChild(link);
    setTimeout(() => link.remove(), 30_000);
  } catch { /* ignore */ }
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
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const activeScope = filters.types && filters.types.length === 1 ? filters.types[0] : null;
  const scopeArray = activeScope ? [activeScope] : undefined;

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

  const { suggestions, countsByType, loading: suggestionsLoading, error: suggestionsError } =
    useSearchSuggestions(query, scopeArray);
  const { trending } = useTrendingSuggestions(isOpen && !query);
  const voice = useVoiceSearch();
  const nearMe = useNearMe();

  useEffect(() => {
    if (voice.transcript) setQuery(voice.transcript);
  }, [voice.transcript]);

  useEffect(() => {
    const saved = localStorage.getItem('recent-searches');
    if (saved) {
      try { setRecentSearches(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // Reset virtual focus when results change
  useEffect(() => {
    setResultsFocused(null);
  }, [suggestions.length, activeScope]);

  const saveRecentSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    const updated = [searchTerm, ...recentSearches.filter((s) => s !== searchTerm)].slice(0, 10);
    setRecentSearches(updated);
    localStorage.setItem('recent-searches', JSON.stringify(updated));
  };

  const handleSearch = useCallback((searchQuery?: string) => {
    const searchTerm = searchQuery ?? query;
    if (!searchTerm.trim()) return;
    saveRecentSearch(searchTerm);
    const params = new URLSearchParams({
      q: searchTerm,
      ...(filters.types && filters.types.length > 0 && { types: filters.types.join(',') }),
      ...(filters.location && { location: filters.location }),
      ...(filters.categories && filters.categories.length > 0 && { categories: filters.categories.join(',') }),
      ...(filters.cluster_ids && filters.cluster_ids.length > 0 && { clusters: filters.cluster_ids.join(',') }),
    });
    void trackSearchUx('search_submit', {
      query: searchTerm,
      scope: activeScope || 'all',
      filters_count:
        (filters.types?.length || 0)
        + (filters.location ? 1 : 0)
        + (filters.categories?.length || 0)
        + (filters.cluster_ids?.length || 0),
      source: 'universal_searchbar',
    });
    navigate(`/search?${params}`);
    setIsOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters, activeScope, navigate]);

  const handleSelectSuggestion = useCallback((suggestion: SearchSuggestion) => {
    justSelectedRef.current = true;
    const displayName = suggestion.name || suggestion.title;
    setQuery(displayName || '');
    if (suggestion.id && suggestion.type) {
      trackClickFromSearch({ type: suggestion.type, id: suggestion.id }, 'autocomplete', { query: displayName });
    }
    const slug = suggestion.slug || suggestion.id;
    switch (suggestion.type) {
      case 'venue': navigate(`/venues/${slug}`); break;
      case 'event': navigate(`/events/${slug}`); break;
      case 'marketplace': navigate(`/marketplace/${slug}`); break;
      case 'tag': navigate(`/resources/${(suggestion.name || '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '%20')}`); break;
      case 'user': navigate(`/user/${suggestion.id}`); break;
      case 'personality': navigate(`/personalities/${slug}`); break;
      case 'group': navigate(`/groups/${suggestion.id}`); break;
      case 'city': navigate(`/city/${slug}`); break;
      case 'country': navigate(`/country/${slug}`); break;
      case 'queer_village': navigate(`/queer-villages/${slug}`); break;
      case 'news': navigate(`/news/${slug}`); break;
      default: navigate(`/search?q=${encodeURIComponent(displayName || '')}&types=${suggestion.type}&direct=true`);
    }
    setIsOpen(false);
  }, [navigate, trackClickFromSearch]);

  const setScope = useCallback((scope: string | null) => {
    setFilters((f) => ({ ...f, types: scope ? [scope] : [] }));
    void trackSearchUx('scope_switch', { from: activeScope || 'all', to: scope || 'all', via: 'click' });
    inputRef.current?.focus();
  }, [activeScope]);

  // Rail navigable list: [All, ...RAIL_SCOPE_IDS]
  const railLength = 1 + RAIL_SCOPE_IDS.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Alt+1..9 → scope shortcut
    if (e.altKey && /^[1-9]$/.test(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx === 0) {
        setScope(null);
      } else {
        const id = RAIL_SCOPE_IDS[idx - 1];
        if (id) setScope(id);
      }
      e.preventDefault();
      void trackSearchUx('scope_switch', { from: activeScope || 'all', to: idx === 0 ? 'all' : RAIL_SCOPE_IDS[idx - 1], via: 'key' });
      return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey && query && suggestions[0]) {
      const top = suggestions[0];
      const candidate = (top.name || top.title || '').toString();
      if (candidate && candidate.toLowerCase().startsWith(query.toLowerCase()) && candidate !== query) {
        e.preventDefault();
        setQuery(candidate);
        return;
      }
    }

    if (e.key === 'ArrowLeft') {
      if (focusedPane !== 'rail') {
        setFocusedPane('rail');
        // Map current scope to rail index
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
        setRailFocused((i) => {
          const next = i === null ? 0 : (i + 1) % railLength;
          return next;
        });
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
        setRailFocused((i) => {
          if (i === null) return railLength - 1;
          return (i - 1 + railLength) % railLength;
        });
      } else {
        setResultsFocused((i) => {
          if (i === null || i === 0) return null;
          return i - 1;
        });
      }
      return;
    }

    if (e.key === 'Enter') {
      if (focusedPane === 'rail' && railFocused !== null) {
        e.preventDefault();
        if (railFocused === 0) {
          setScope(null);
        } else {
          const id = RAIL_SCOPE_IDS[railFocused - 1];
          if (id) setScope(id);
        }
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
  };

  useEffect(() => {
    if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  useSearchHotkey(() => {
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  });

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  const activeFiltersCount =
    (filters.types?.length || 0)
    + (filters.location ? 1 : 0)
    + (filters.categories?.length || 0)
    + (filters.priceRange ? 1 : 0)
    + (filters.rating ? 1 : 0);

  const removeRecent = (index: number) => {
    const updated = recentSearches.filter((_, i) => i !== index);
    setRecentSearches(updated);
    localStorage.setItem('recent-searches', JSON.stringify(updated));
  };

  const clearRecents = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent-searches');
  };

  return (
    <div className="flex-1 min-w-0">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <div
              role="search"
              aria-label="Site search"
              className="flex items-center cursor-text bg-background"
              onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  setIsOpen(true);
                  setTimeout(() => inputRef.current?.focus(), 0);
                }
              }}
            >
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center"
                style={{
                  height: isMobile ? 48 : 40,
                  paddingLeft: isMobile ? 16 : 12,
                  paddingRight: isMobile ? 16 : 12,
                  color: 'hsl(var(--muted-foreground))',
                  pointerEvents: 'none',
                  flexShrink: 0,
                }}
              >
                <Search style={{ height: isMobile ? 20 : 16, width: isMobile ? 20 : 16 }} />
              </span>
              <div className="flex-1 relative">
                <SearchInputTyped
                  ref={inputRef}
                  aria-label={t('search.ariaLabel', 'Search Queer Guide')}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isOpen}
                  aria-controls="qg-search-listbox"
                  aria-haspopup="listbox"
                  placeholders={
                    isMobile ? [t('search.placeholders.generic', 'Search...')]
                    : location.pathname.startsWith('/admin') ? [t('search.placeholders.generic', 'Search...')]
                    : location.pathname.startsWith('/hotels') ? [t('search.placeholders.hotels', 'Search hotels...')]
                    : [
                        t('search.placeholders.venues', 'Search venues...'),
                        t('search.placeholders.events', 'Find events...'),
                        t('search.placeholders.marketplace', 'Browse marketplace...'),
                        t('search.placeholders.people', 'Discover people...'),
                        t('search.placeholders.news', 'Read news...'),
                        t('search.placeholders.resources', 'Explore resources...'),
                        t('search.placeholders.personalities', 'Meet personalities...'),
                      ]
                  }
                  typingSpeed={75}
                  pauseDuration={2000}
                  showCursor={true}
                  cursorCharacter="|"
                  value={query}
                  onValueChange={(value) => {
                    setQuery(value);
                    if (!isOpen && !justSelectedRef.current) setIsOpen(true);
                    justSelectedRef.current = false;
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsOpen(true)}
                  style={{
                    width: '100%',
                    border: 0,
                    backgroundColor: 'transparent',
                    boxShadow: 'none',
                    outline: 'none',
                    fontSize: isMobile ? '1rem' : '0.875rem',
                  }}
                  autoComplete="off"
                />
                {!query && (
                  <span
                    className="flex items-center"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', gap: 6 }}
                  >
                    {voice.supported && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={voice.listening ? t('search.stopVoice', 'Stop voice search') : t('search.voice', 'Voice search')}
                        aria-pressed={voice.listening}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (voice.listening) voice.stop();
                          else voice.start();
                        }}
                        style={{
                          height: isMobile ? 32 : 24,
                          width: isMobile ? 32 : 24,
                          padding: 0,
                          color: voice.listening ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))',
                        }}
                      >
                        <Mic style={{ height: isMobile ? 16 : 14, width: isMobile ? 16 : 14 }} />
                      </Button>
                    )}
                    {!isMobile && (
                      <kbd
                        aria-hidden="true"
                        style={{
                          fontSize: '0.7rem',
                          lineHeight: 1,
                          padding: '2px 6px',
                          border: '1px solid hsl(var(--border))',
                          color: 'hsl(var(--muted-foreground))',
                          fontFamily: 'inherit',
                          pointerEvents: 'none',
                        }}
                      >
                        {isMac ? '⌘K' : 'Ctrl+K'}
                      </kbd>
                    )}
                  </span>
                )}
                {query && (
                  <span className="flex items-center gap-1" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
                    {suggestionsLoading && (
                      <Loader2
                        className="animate-spin"
                        style={{ height: isMobile ? 14 : 12, width: isMobile ? 14 : 12, color: 'hsl(var(--muted-foreground))' }}
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Clear search"
                      style={{
                        height: isMobile ? 32 : 24,
                        width: isMobile ? 32 : 24,
                        padding: 0,
                        color: 'hsl(var(--muted-foreground))',
                      }}
                      onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                    >
                      <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
                    </Button>
                  </span>
                )}
              </div>
              {isMobile && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Search filters"
                  style={{
                    height: 48,
                    paddingLeft: 16,
                    paddingRight: 16,
                    color: 'inherit',
                    position: 'relative',
                    flexShrink: 0,
                  }}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal style={{ height: 20, width: 20 }} />
                  {activeFiltersCount > 0 && <Badge variant="destructive">{activeFiltersCount}</Badge>}
                </Button>
              )}
            </div>
          </div>
        </PopoverAnchor>
        <PopoverContent
          style={
            isMobile
              ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', maxHeight: '100dvh', borderRadius: 0, padding: 0, zIndex: 50 }
              : { width: 'min(820px, calc(100vw - 32px))', padding: 0, zIndex: 50, borderRadius: 0 }
          }
          align="start"
          onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => inputRef.current?.focus(), 0); }}
          onCloseAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
          onEscapeKeyDown={() => setIsOpen(false)}
        >
          {isMobile ? (
            <MobileLayout
              query={query}
              activeScope={activeScope}
              suggestions={suggestions}
              countsByType={countsByType}
              loading={suggestionsLoading}
              error={suggestionsError}
              trending={trending}
              recentSearches={recentSearches}
              showFilters={showFilters}
              filters={filters}
              setFilters={setFilters}
              setScope={setScope}
              onSelect={handleSelectSuggestion}
              onSearchAll={() => handleSearch()}
              onClose={() => setIsOpen(false)}
              onClear={() => { setQuery(''); inputRef.current?.focus(); }}
              setQuery={setQuery}
              navigate={navigate}
              removeRecent={removeRecent}
              clearRecents={clearRecents}
              nearMe={nearMe}
            />
          ) : (
            <DesktopLayout
              query={query}
              activeScope={activeScope}
              suggestions={suggestions}
              countsByType={countsByType}
              loading={suggestionsLoading}
              error={suggestionsError}
              trending={trending}
              recentSearches={recentSearches}
              showFilters={showFilters}
              setShowFilters={setShowFilters}
              filters={filters}
              setFilters={setFilters}
              setScope={setScope}
              onSelect={handleSelectSuggestion}
              onSelectIndex={(s, i) => { setResultsFocused(i); handleSelectSuggestion(s); }}
              resultsFocused={focusedPane === 'results' ? resultsFocused : null}
              railFocused={focusedPane === 'rail' ? railFocused : null}
              setResultsFocused={(i) => { setResultsFocused(i); setFocusedPane('results'); }}
              setRailFocused={(i) => { setRailFocused(i); setFocusedPane('rail'); }}
              activeFiltersCount={activeFiltersCount}
              onSearchAll={() => handleSearch()}
              removeRecent={removeRecent}
              clearRecents={clearRecents}
              onSelectRecent={(term) => { setQuery(term); handleSearch(term); }}
              nearMeSupported={nearMe.supported}
              nearMeLoading={nearMe.loading}
              onNearMe={async () => {
                const c = await nearMe.request();
                if (!c) return;
                setIsOpen(false);
                navigate(`/search?lat=${c.lat}&lng=${c.lng}&radius=25000`);
              }}
              onBrowseAll={() => { setIsOpen(false); navigate('/search'); }}
              onSelectTrending={(hit) => handleSelectSuggestion({
                id: hit.id,
                name: (hit.title || hit.name || '') as string,
                type: hit.type,
                icon: () => null,
                title: (hit.title || hit.name || '') as string,
                subtitle: hit.city as string | undefined,
                slug: hit.slug as string | undefined,
              })}
              onBrowse={(path) => { setIsOpen(false); navigate(path); }}
              onPrefetch={prefetchRoute}
              isMac={isMac}
            />
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

interface DesktopLayoutProps {
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
  onSelect: (s: SearchSuggestion) => void;
  onSelectIndex: (s: SearchSuggestion, i: number) => void;
  resultsFocused: number | null;
  railFocused: number | null;
  setResultsFocused: (i: number | null) => void;
  setRailFocused: (i: number | null) => void;
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

function DesktopLayout(props: DesktopLayoutProps) {
  const { t } = useTranslation();
  const {
    query, activeScope, suggestions, countsByType, loading, error, trending,
    recentSearches, showFilters, setShowFilters, filters, setFilters, setScope,
    onSelectIndex, resultsFocused, railFocused, setResultsFocused,
    activeFiltersCount, onSearchAll, removeRecent, clearRecents, onSelectRecent,
    nearMeSupported, nearMeLoading, onNearMe, onBrowseAll, onSelectTrending,
    onBrowse, onPrefetch, isMac,
  } = props;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 320 }} id="qg-search-listbox">
      <div style={{ display: 'flex', flex: 1, minHeight: 320, maxHeight: 560 }}>
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
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
        className="flex items-center justify-between border-t border-border"
        style={{ padding: '6px 12px', fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', gap: 12 }}
        aria-hidden="true"
      >
        <span className="inline-flex items-center" style={{ gap: 8 }}>
          <KbdHint label="↑↓" desc={t('search.kbd.navigate', 'Navigate')} />
          <KbdHint label="↵" desc={t('search.kbd.select', 'Select')} />
          <KbdHint label={isMac ? '⌥1-9' : 'Alt+1-9'} desc={t('search.kbd.scope', 'Scope')} />
          <KbdHint label="⇥" desc={t('search.kbd.complete', 'Complete')} />
        </span>
        <span className="inline-flex items-center" style={{ gap: 8 }}>
          {query && (
            <button
              type="button"
              onClick={onSearchAll}
              style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'underline' }}
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

interface MobileLayoutProps {
  query: string;
  activeScope: string | null;
  suggestions: SearchSuggestion[];
  countsByType: Record<string, number>;
  loading: boolean;
  error: string | null;
  trending: ReturnType<typeof useTrendingSuggestions>['trending'];
  recentSearches: string[];
  showFilters: boolean;
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
  setScope: (s: string | null) => void;
  onSelect: (s: SearchSuggestion) => void;
  onSearchAll: () => void;
  onClose: () => void;
  onClear: () => void;
  setQuery: (q: string) => void;
  navigate: (path: string) => void;
  removeRecent: (i: number) => void;
  clearRecents: () => void;
  nearMe: ReturnType<typeof useNearMe>;
}

function MobileLayout(props: MobileLayoutProps) {
  const { t } = useTranslation();
  const {
    query, activeScope, suggestions, countsByType, loading, error, trending,
    showFilters, filters, setFilters, setScope, onSelect, onSearchAll, onClose,
    onClear, navigate,
  } = props;

  return (
    <>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <button type="button" onClick={onClose} className="text-sm font-medium text-primary px-2 py-1 -ml-2" aria-label="Close search">
          {t('common.cancel', 'Cancel')}
        </button>
        {query && (
          <button type="button" onClick={onClear} className="text-sm text-muted-foreground px-2 py-1 -mr-2" aria-label="Clear search">
            {t('common.clear', 'Clear')}
          </button>
        )}
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
          onSelectTrending={(hit) => onSelect({
            id: hit.id,
            name: (hit.title || hit.name || '') as string,
            type: hit.type,
            icon: () => null,
            title: (hit.title || hit.name || '') as string,
            subtitle: hit.city as string | undefined,
            slug: hit.slug as string | undefined,
          })}
          onBrowse={(path) => { onClose(); navigate(path); }}
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
          onPrefetch={prefetchRoute}
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
