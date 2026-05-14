import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useTrackClick } from '@/hooks/useSearchActions';
import { useLocation } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInputTyped } from '@/components/ui/search-input-typed';
import {
  Command,
  CommandEmpty,
  CommandList,
  CommandSeparator,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import {
  Search,
  X,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import { useSearchSuggestions, SearchSuggestion, TYPE_ICONS } from '@/hooks/useSearchSuggestions';
const SearchFiltersPanel = lazy(() =>
  import('./SearchFiltersPanel').then((m) => ({ default: m.SearchFiltersPanel })),
);
import { useIsMobile } from '@/hooks/use-mobile';
import type { SearchFilters } from '@/hooks/useSearch';

const contentTypeLabels: Record<string, string> = {
  venue: 'Venues',
  event: 'Events',
  marketplace: 'Marketplace',
  news: 'News',
  city: 'Cities',
  country: 'Countries',
  personality: 'Personalities',
  tag: 'Tags',
  queer_village: 'Queer Villages',
  user: 'Members',
  group: 'Groups',
};

const TYPE_ORDER = ['city', 'country', 'venue', 'event', 'personality', 'news', 'queer_village', 'marketplace', 'tag', 'user', 'group'];

function TypeHeading({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type];
  const label = contentTypeLabels[type] || type;
  return (
    <span className="flex items-center gap-1.5">
      {Icon && React.createElement(Icon, { style: { height: 12, width: 12 } })}
      {label}
    </span>
  );
}

export const UniversalSearchBar = () => {
  const trackClickFromSearch = useTrackClick();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ types: [] });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [_isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const justSelectedRef = useRef(false);
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

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

  const { suggestions, loading: suggestionsLoading, error: suggestionsError } = useSearchSuggestions(query);

  useEffect(() => {
    const saved = localStorage.getItem('recent-searches');
    if (saved) {
      try { setRecentSearches(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  const saveRecentSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    const updated = [searchTerm, ...recentSearches.filter((s) => s !== searchTerm)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recent-searches', JSON.stringify(updated));
  };

  const handleSearch = (searchQuery?: string) => {
    const searchTerm = searchQuery || query;
    if (!searchTerm.trim()) return;
    saveRecentSearch(searchTerm);
    const params = new URLSearchParams({
      q: searchTerm,
      ...(filters.types && filters.types.length > 0 && { types: filters.types.join(',') }),
      ...(filters.location && { location: filters.location }),
      ...(filters.categories && filters.categories.length > 0 && { categories: filters.categories.join(',') }),
      ...(filters.cluster_ids && filters.cluster_ids.length > 0 && { clusters: filters.cluster_ids.join(',') }),
    });
    navigate(`/search?${params}`);
    setIsOpen(false);
  };

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
    else if (e.key === 'Escape') { setIsOpen(false); inputRef.current?.blur(); }
  };

  const handleRecentSearch = (searchTerm: string) => { setQuery(searchTerm); handleSearch(searchTerm); };
  const clearRecentSearches = () => { setRecentSearches([]); localStorage.removeItem('recent-searches'); };

  const activeFiltersCount = (filters.types?.length || 0) + (filters.location ? 1 : 0) + (filters.categories?.length || 0) + (filters.priceRange ? 1 : 0) + (filters.rating ? 1 : 0);

  useEffect(() => {
    if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  const groupedSuggestions = suggestions.reduce<Record<string, SearchSuggestion[]>>((acc, s) => {
    const t = s.type || 'other';
    if (!acc[t]) acc[t] = [];
    acc[t].push(s);
    return acc;
  }, {});

  return (
    <div className="flex-1 min-w-0">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <motion.div
            className="relative"
            animate={isOpen ? { scale: 1.02, backdropFilter: 'blur(8px)' } : { scale: 1, backdropFilter: 'blur(0px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div role="search" aria-label="Site search" className="flex items-center cursor-text bg-background transition-all"
              onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
              <span aria-hidden="true" className="inline-flex items-center justify-center"
                style={{ height: isMobile ? 48 : 40, paddingLeft: isMobile ? 16 : 12, paddingRight: isMobile ? 16 : 12, color: 'hsl(var(--muted-foreground))', pointerEvents: 'none', flexShrink: 0 }}>
                <Search style={{ height: isMobile ? 20 : 16, width: isMobile ? 20 : 16 }} />
              </span>
              <div className="flex-1 relative">
                <SearchInputTyped ref={inputRef} aria-label={t('search.ariaLabel', 'Search Queer Guide')} role="combobox" aria-autocomplete="list" aria-expanded={isOpen} aria-controls="qg-search-listbox" aria-haspopup="listbox"
                  placeholders={isMobile ? [t('search.placeholders.generic', 'Search...')] : location.pathname.startsWith('/admin') ? [t('search.placeholders.generic', 'Search...')] : location.pathname.startsWith('/hotels') ? [t('search.placeholders.hotels', 'Search hotels...')] : [t('search.placeholders.venues', 'Search venues...'), t('search.placeholders.events', 'Find events...'), t('search.placeholders.marketplace', 'Browse marketplace...'), t('search.placeholders.people', 'Discover people...'), t('search.placeholders.news', 'Read news...'), t('search.placeholders.resources', 'Explore resources...'), t('search.placeholders.personalities', 'Meet personalities...')]}
                  typingSpeed={75} pauseDuration={2000} showCursor={true} cursorCharacter="|" value={query}
                  onValueChange={(value) => { setQuery(value); if (!isOpen && !justSelectedRef.current) setIsOpen(true); justSelectedRef.current = false; }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => { setIsFocused(true); setIsOpen(true); }}
                  onBlur={() => setIsFocused(false)}
                  style={{ width: '100%', border: 0, backgroundColor: 'transparent', boxShadow: 'none', outline: 'none', fontSize: isMobile ? '1rem' : '0.875rem' }}
                  autoComplete="off" />
                {query && (
                  <span className="flex items-center gap-1" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
                    {suggestionsLoading && <Loader2 className="animate-spin" style={{ height: isMobile ? 14 : 12, width: isMobile ? 14 : 12, color: 'hsl(var(--muted-foreground))' }} />}
                    <Button variant="ghost" size="sm" aria-label="Clear search" style={{ height: isMobile ? 32 : 24, width: isMobile ? 32 : 24, padding: 0, color: 'hsl(var(--muted-foreground))' }}
                      onClick={() => { setQuery(''); inputRef.current?.focus(); }}>
                      <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
                    </Button>
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" aria-label="Search filters"
                style={{ height: isMobile ? 48 : 40, paddingLeft: isMobile ? 16 : 12, paddingRight: isMobile ? 16 : 12, color: 'inherit', position: 'relative', flexShrink: 0 }}
                onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal style={{ height: isMobile ? 20 : 16, width: isMobile ? 20 : 16 }} />
                {activeFiltersCount > 0 && <Badge variant="destructive">{activeFiltersCount}</Badge>}
              </Button>
            </div>
          </motion.div>
        </PopoverAnchor>
        <PopoverContent
          style={isMobile ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', maxHeight: '100dvh', borderRadius: 0, padding: 0, zIndex: 50 } : { width: 600, padding: 0, zIndex: 50 }}
          align="start"
          onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => inputRef.current?.focus(), 0); }}
          onCloseAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
          onEscapeKeyDown={() => setIsOpen(false)}>
          {isMobile && (
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <button type="button" onClick={() => setIsOpen(false)} className="text-sm font-medium text-primary px-2 py-1 -ml-2" aria-label="Close search">Cancel</button>
              {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="text-sm text-muted-foreground px-2 py-1 -mr-2" aria-label="Clear search">Clear</button>}
            </div>
          )}
          <Command shouldFilter={false} style={{ background: 'transparent' }}>
            {showFilters && (
              <Suspense fallback={null}>
                <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
                <CommandSeparator />
              </Suspense>
            )}
            <CommandList id="qg-search-listbox" style={{ maxHeight: 384 }}>
              {!query && recentSearches.length > 0 && (
                <>
                  <CommandGroup heading="Recent searches">
                    {recentSearches.map((search, index) => (
                      <CommandItem key={index} onSelect={() => handleRecentSearch(search)} style={{ cursor: 'pointer' }}>
                        <Clock style={{ height: 16, width: 16, marginRight: 8, color: 'hsl(var(--muted-foreground))' }} />
                        <span className="flex-1">{search}</span>
                        <Button variant="ghost" size="sm" aria-label={`Remove "${search}" from recent searches`} style={{ height: 24, width: 24, padding: 0, marginLeft: 4 }}
                          onClick={(e) => { e.stopPropagation(); const updated = recentSearches.filter((_, i) => i !== index); setRecentSearches(updated); localStorage.setItem('recent-searches', JSON.stringify(updated)); }}>
                          <X style={{ height: 12, width: 12 }} />
                        </Button>
                      </CommandItem>
                    ))}
                    <CommandItem onSelect={clearRecentSearches} style={{ cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}>
                      <X style={{ height: 16, width: 16, marginRight: 8 }} />Clear recent searches
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              {TYPE_ORDER.filter((type) => groupedSuggestions[type]).map((type) => (
                <CommandGroup key={type} heading={<TypeHeading type={type} />}>
                  {groupedSuggestions[type].map((suggestion) => {
                    const Icon = suggestion.icon;
                    const displayName = suggestion.name || suggestion.title;
                    const subtitle = suggestion.subtitle;
                    return (
                      <CommandItem key={`${suggestion.type}-${suggestion.id}`} onSelect={() => handleSelectSuggestion(suggestion)} style={{ cursor: 'pointer', padding: '8px 12px' }}>
                        <Icon style={{ height: 16, width: 16, marginRight: 12, color: 'hsl(var(--muted-foreground))', flexShrink: 0 }} />
                        <div className="flex flex-col items-start flex-1 min-w-0">
                          <span className="font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap w-full">{displayName}</span>
                          {subtitle && <span className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap w-full">{subtitle}</span>}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
              {suggestions.length === 0 && query.length >= 2 && !suggestionsLoading && (
                <CommandEmpty style={{ padding: '24px 0', textAlign: 'center' }}>
                  <div className="flex flex-col items-center gap-2">
                    {suggestionsError ? (
                      <div role="alert" className="flex flex-col items-center gap-2">
                        <Search style={{ height: 32, width: 32, opacity: 0.5, color: 'hsl(var(--destructive))' }} />
                        <p style={{ color: 'hsl(var(--destructive))' }}>Search is temporarily unavailable</p>
                        <span className="text-xs text-muted-foreground">{suggestionsError}</span>
                      </div>
                    ) : (
                      <>
                        <Search style={{ height: 32, width: 32, opacity: 0.5 }} />
                        <p>No results found for &ldquo;{query}&rdquo;</p>
                        <span className="text-xs text-muted-foreground">Try different keywords or adjust your filters</span>
                      </>
                    )}
                  </div>
                </CommandEmpty>
              )}
            </CommandList>
            <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
              {suggestionsError ? suggestionsError : suggestionsLoading ? 'Searching…' : query && suggestions.length ? `${suggestions.length} results for ${query}` : query ? `No results for ${query}` : ''}
            </div>
            {suggestionsLoading && suggestions.length === 0 && (
              <div className="py-6 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin" size={24} aria-label="Searching" />
                  <span className="text-sm">Searching...</span>
                </div>
              </div>
            )}
            {query && (
              <div className="p-3 border-t border-border">
                <Button onClick={() => handleSearch()} variant="default" style={{ width: '100%' }} size="sm">
                  <Search style={{ height: 16, width: 16, marginRight: 8 }} />
                  Search for &ldquo;{query.length > 20 ? query.slice(0, 20) + '...' : query}&rdquo;
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
