import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { useTrackClick } from '@/hooks/useSearchActions';
import { useLocation } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SearchInputTyped } from '@/components/ui/search-input-typed';
import {
  Command,
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
  MapPin,
  Calendar,
  Users,
  ShoppingBag,
  Newspaper,
  Globe,
  Plane,
  FileText,
  SlidersHorizontal,
  Tag,
  User,
} from 'lucide-react';
import { useSearch, SearchResult, SearchFilters } from '@/hooks/useSearch';
import { useSearchSuggestions, SearchSuggestion } from '@/hooks/useSearchSuggestions';
import { SearchFiltersPanel } from './SearchFiltersPanel';
import { useIsMobile } from '@/hooks/use-mobile';

const contentTypeIcons: Record<string, React.ComponentType<{ style?: React.CSSProperties }>> = {
  venue: MapPin,
  venues: MapPin,
  event: Calendar,
  events: Calendar,
  marketplace: ShoppingBag,
  user: Users,
  news: Newspaper,
  location: Globe,
  cities: Globe,
  countries: Globe,
  content: FileText,
  travel: Plane,
  ressource: Tag,
  personality: User,
  personalities: User,
  tag: Tag,
  tags: Tag,
  group: Users,
};
const contentTypeLabels: Record<string, string> = {
  venue: 'Venues',
  venues: 'Venues',
  event: 'Events',
  events: 'Events',
  marketplace: 'Marketplace',
  user: 'Members',
  news: 'News',
  location: 'Places',
  cities: 'Cities',
  countries: 'Countries',
  content: 'Resources',
  travel: 'Places',
  ressource: 'Resources',
  personality: 'Personalities',
  personalities: 'Personalities',
  tag: 'Tags',
  tags: 'Tags',
  group: 'Groups',
};

export const UniversalSearchBar = () => {
  const trackClickFromSearch = useTrackClick();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    types: [],
  });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [_isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useLocalizedNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { t } = useTranslation();

  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;
    if (
      prevPath !== location.pathname &&
      prevPath.startsWith('/search') &&
      !location.pathname.startsWith('/search')
    ) {
      setQuery('');
      setIsOpen(false);
      setShowFilters(false);
    }
  }, [location.pathname]);

  const { suggestions: searchResults, loading, error: searchError } = useSearch(query, filters);

  const { suggestions, loading: suggestionsLoading } = useSearchSuggestions(query);

  useEffect(() => {
    const saved = localStorage.getItem('recent-searches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch {
        // Ignore invalid JSON
      }
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
      ...(filters.types.length > 0 && {
        types: filters.types.join(','),
      }),
      ...(filters.location && {
        location: filters.location,
      }),
      ...(filters.categories &&
        filters.categories.length > 0 && {
          categories: filters.categories.join(','),
        }),
      ...(filters.cluster_ids &&
        filters.cluster_ids.length > 0 && {
          clusters: filters.cluster_ids.join(','),
        }),
    });
    navigate(`/search?${params}`);
    setIsOpen(false);
  };

  const handleSelectResult = (result: SearchResult) => {
    setQuery(result.title);
    const slug = result.metadata?.slug || result.objectID;
    switch (result.type) {
      case 'venue':
      case 'venues':
        navigate(`/venues/${slug}`);
        break;
      case 'event':
      case 'events':
        navigate(`/events/${slug}`);
        break;
      case 'marketplace':
        navigate(`/marketplace/${slug}`);
        break;
      case 'user':
        navigate(`/user/${result.objectID}`);
        break;
      case 'personality':
      case 'personalities':
        navigate(`/personalities/${slug}`);
        break;
      case 'group':
        navigate(`/groups/${result.objectID}`);
        break;
      case 'news':
        navigate(`/news/${slug}`);
        break;
      case 'cities':
      case 'location':
        if (result.metadata?.isCountry) {
          navigate(`/country/${slug}`);
        } else {
          navigate(`/city/${slug}`);
        }
        break;
      case 'countries':
        navigate(`/country/${slug}`);
        break;
      case 'content':
      case 'ressource':
      case 'tags':
      case 'tag':
        navigate(`/resources/${slug}`);
        break;
      case 'travel':
        navigate(`/places`);
        break;
      default:
        navigate(`/search?q=${encodeURIComponent(result.title)}&direct=true`);
    }
    setIsOpen(false);
  };

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    const displayName = suggestion.name || suggestion.title;
    setQuery(displayName);
    if (suggestion.id && suggestion.type) {
      trackClickFromSearch({ type: suggestion.type, id: suggestion.id }, 'autocomplete', {
        query: displayName,
      });
    }
    switch (suggestion.type) {
      case 'venue':
        navigate(`/venues/${suggestion.slug || suggestion.id}`);
        break;
      case 'event':
        navigate(`/events/${suggestion.slug || suggestion.id}`);
        break;
      case 'marketplace':
        navigate(`/marketplace/${suggestion.slug || suggestion.id}`);
        break;
      case 'tag': {
        const tagSlug = suggestion.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '%20');
        navigate(`/resources/${tagSlug}`);
        break;
      }
      case 'user':
        navigate(`/user/${suggestion.id}`);
        break;
      case 'personality':
        navigate(`/personalities/${suggestion.slug || suggestion.id}`);
        break;
      case 'group':
        navigate(`/groups/${suggestion.id}`);
        break;
      default:
        navigate(
          `/search?q=${encodeURIComponent(displayName)}&types=${suggestion.type}&direct=true`,
        );
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleRecentSearch = (searchTerm: string) => {
    setQuery(searchTerm);
    handleSearch(searchTerm);
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent-searches');
  };

  const getResultIcon = (type: string) => {
    const Icon = contentTypeIcons[type] || Search;
    return <Icon style={{ height: 16, width: 16 }} />;
  };

  const formatResultSubtitle = (result: SearchResult) => {
    const parts = [];
    if (result.category) parts.push(result.category);
    if (result.location) parts.push(result.location);
    if (result.price) parts.push(formatCurrency(result.price));
    if (result.date) parts.push(new Date(result.date).toLocaleDateString());
    return parts.join(' • ');
  };

  const activeFiltersCount =
    filters.types.length +
    (filters.location ? 1 : 0) +
    (filters.categories?.length || 0) +
    (filters.priceRange ? 1 : 0) +
    (filters.rating ? 1 : 0);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  return (
    <div className="flex-1 min-w-0">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <div
              role="search"
              aria-label="Site search"
              className="flex items-center cursor-text bg-background transition-all"
              onClick={() => {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 0);
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
                    isMobile
                      ? [t('search.placeholders.generic', 'Search...')]
                      : location.pathname.startsWith('/hotels')
                        ? [t('search.placeholders.hotels', 'Search hotels...')]
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
                    if (!isOpen) setIsOpen(true);
                  }}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    setIsFocused(true);
                    setIsOpen(true);
                  }}
                  onBlur={() => setIsFocused(false)}
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

                {query && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Clear search"
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      height: isMobile ? 32 : 24,
                      width: isMobile ? 32 : 24,
                      padding: 0,
                      color: 'hsl(var(--muted-foreground))',
                    }}
                    onClick={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                  >
                    <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
                  </Button>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                aria-label="Search filters"
                style={{
                  height: isMobile ? 48 : 40,
                  paddingLeft: isMobile ? 16 : 12,
                  paddingRight: isMobile ? 16 : 12,
                  color: 'inherit',
                  position: 'relative',
                  flexShrink: 0,
                }}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal
                  style={{ height: isMobile ? 20 : 16, width: isMobile ? 20 : 16 }}
                />
                {activeFiltersCount > 0 && (
                  <Badge variant="destructive">{activeFiltersCount}</Badge>
                )}
              </Button>
            </div>
          </div>
        </PopoverAnchor>

        <PopoverContent
          style={
            isMobile
              ? {
                  // Bug #20: full-screen sheet on mobile so the search popover
                  // doesn't bury the page beneath an undismissable overlay.
                  position: 'fixed',
                  inset: 0,
                  width: '100vw',
                  height: '100dvh',
                  maxHeight: '100dvh',
                  borderRadius: 0,
                  padding: 0,
                  zIndex: 50,
                }
              : { width: 600, padding: 0, zIndex: 50 }
          }
          align="start"
          // Restore focus to the input when opening, and back to the trigger
          // on close (assistive tech expects the focus ring to land back where
          // it came from).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          onEscapeKeyDown={() => setIsOpen(false)}
        >
          {isMobile && (
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-sm font-medium text-primary px-2 py-1 -ml-2"
                aria-label="Close search"
              >
                Cancel
              </button>
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="text-sm text-muted-foreground px-2 py-1 -mr-2"
                  aria-label="Clear search"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          <Command shouldFilter={false} style={{ background: 'transparent' }}>
            {showFilters && (
              <>
                <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
                <CommandSeparator />
              </>
            )}

            {/* axe `aria-required-children` flags an empty role="listbox"
                (no group/option descendants). Only mount CommandList when
                there is at least one option-bearing section to show.
                Empty/error states render as siblings below. */}
            {(
              (!query && recentSearches.length > 0) ||
              suggestions.length > 0 ||
              searchResults.length > 0
            ) && (
            <CommandList id="qg-search-listbox" style={{ maxHeight: 384 }}>
              {/* Recent Searches */}
              {!query && recentSearches.length > 0 && (
                <>
                  <CommandGroup heading="Recent searches">
                    {recentSearches.map((search, index) => (
                      <CommandItem
                        key={index}
                        onSelect={() => handleRecentSearch(search)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Clock
                          style={{ height: 16, width: 16, marginRight: 8, color: 'hsl(var(--muted-foreground))' }}
                        />
                        <span className="flex-1">{search}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove "${search}" from recent searches`}
                          style={{ height: 24, width: 24, padding: 0, marginLeft: 4 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = recentSearches.filter((_, i) => i !== index);
                            setRecentSearches(updated);
                            localStorage.setItem('recent-searches', JSON.stringify(updated));
                          }}
                        >
                          <X style={{ height: 12, width: 12 }} />
                        </Button>
                      </CommandItem>
                    ))}
                    <CommandItem
                      onSelect={clearRecentSearches}
                      style={{ cursor: 'pointer', color: 'hsl(var(--muted-foreground))' }}
                    >
                      <X style={{ height: 16, width: 16, marginRight: 8 }} />
                      Clear recent searches
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* Live Suggestions */}
              {suggestions.length > 0 && (
                <>
                  <CommandGroup heading="Suggestions">
                    {suggestions.map((suggestion) => {
                      const Icon = suggestion.icon;
                      const displayName = suggestion.name || suggestion.title;
                      const subtitle = suggestion.subtitle;

                      return (
                        <CommandItem
                          key={`${suggestion.type}-${suggestion.id}`}
                          onSelect={() => handleSelectSuggestion(suggestion)}
                          style={{ cursor: 'pointer', padding: '8px 12px' }}
                        >
                          <Icon
                            style={{
                              height: 16,
                              width: 16,
                              marginRight: 12,
                              color: 'hsl(var(--muted-foreground))',
                              flexShrink: 0,
                            }}
                          />
                          <div className="flex flex-col items-start flex-1 min-w-0">
                            <span className="font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap w-full">
                              {displayName}
                            </span>
                            {subtitle && (
                              <span className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap w-full">
                                {subtitle}
                              </span>
                            )}
                          </div>
                          <Badge variant="outline">{suggestion.type}</Badge>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* Group search results by type */}
              {Object.entries(
                searchResults.reduce(
                  (acc, result) => {
                    if (!acc[result.type]) acc[result.type] = [];
                    acc[result.type].push(result);
                    return acc;
                  },
                  {} as Record<string, SearchResult[]>,
                ),
              ).map(([type, typeResults]) => (
                <CommandGroup
                  key={type}
                  heading={contentTypeLabels[type as keyof typeof contentTypeLabels]}
                >
                  {typeResults.map((result, idx) => (
                    <CommandItem
                      key={`${result.type}-${result.objectID}`}
                      onSelect={() => handleSelectResult(result)}
                      className="slide-up-in"
                      style={{
                        cursor: 'pointer',
                        padding: '8px 12px',
                        animationDelay: `${idx * 0.04}s`,
                      }}
                    >
                      <div className="flex items-start gap-3 w-full">
                        <div className="flex-shrink-0 mt-0.5">{getResultIcon(result.type)}</div>
                        {result.imageUrl && (
                          <div className="flex-shrink-0">
                            <img
                              src={result.imageUrl}
                              alt={result.title}
                              style={{ width: 48, height: 48, objectFit: 'cover' }}
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm overflow-hidden text-ellipsis whitespace-nowrap">
                            {result.title}
                          </div>
                          {result.description && (
                            <div className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                              {result.description}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {formatResultSubtitle(result)}
                          </div>
                        </div>
                        {result.rating && (
                          <div className="flex-shrink-0 text-xs text-muted-foreground">
                            ⭐ {result.rating}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

            </CommandList>
            )}

            {/* Empty / error state — siblings of CommandList so they don't
                violate axe `aria-required-children`, which forbids any
                non-option descendant of role="listbox". */}
            {searchError && !loading && !suggestionsLoading ? (
              <div
                role="alert"
                style={{ padding: '24px 0', textAlign: 'center' }}
                className="flex flex-col items-center gap-2"
              >
                <Search
                  style={{ height: 32, width: 32, opacity: 0.5, color: 'hsl(var(--destructive))' }}
                />
                <p style={{ color: 'hsl(var(--destructive))' }}>Search is temporarily unavailable</p>
                <span className="text-xs text-muted-foreground">{searchError}</span>
              </div>
            ) : (
              suggestions.length === 0 &&
              searchResults.length === 0 &&
              query.length >= 2 &&
              !loading &&
              !suggestionsLoading && (
                <div
                  style={{ padding: '24px 0', textAlign: 'center' }}
                  className="flex flex-col items-center gap-2"
                >
                  <Search style={{ height: 32, width: 32, opacity: 0.5 }} />
                  <p>No results found for "{query}"</p>
                  <span className="text-xs text-muted-foreground">
                    Try different keywords or adjust your filters
                  </span>
                </div>
              )
            )}

            {/* Bug #18: screen-reader status announcement of result counts and
                error states. Visually hidden; assistive tech reads it as the
                hits/error change. */}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="sr-only"
            >
              {searchError
                ? searchError
                : loading || suggestionsLoading
                  ? 'Searching…'
                  : query && (searchResults.length || suggestions.length)
                    ? `${searchResults.length + suggestions.length} results for ${query}`
                    : query
                      ? `No results for ${query}`
                      : ''}
            </div>

            {(loading || suggestionsLoading) && (
              <div className="py-6 text-center text-muted-foreground">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="animate-spin" size={24} aria-label="Searching" />
                  <span className="text-sm">Searching...</span>
                </div>
              </div>
            )}

            {query && (
              <div className="p-3 border-t border-border">
                <Button
                  onClick={() => handleSearch()}
                  variant="default"
                  style={{ width: '100%' }}
                  size="sm"
                >
                  <Search style={{ height: 16, width: 16, marginRight: 8 }} />
                  Search for "{query.length > 20 ? query.slice(0, 20) + '...' : query}"
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};
