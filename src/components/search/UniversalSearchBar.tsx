import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/currency';
import { useTrackClick } from '@/hooks/useSearchActions';
import { useLocation } from 'react-router';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

  // Reset search state when navigating away from search results
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = location.pathname;
    // Only clear when actually navigating away from search (not on every re-render)
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

  const { suggestions: searchResults, loading } = useSearch(query, filters);

  const { suggestions, loading: suggestionsLoading } = useSearchSuggestions(query);

  // Load recent searches from localStorage
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

  // Save search to recent searches
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
    // Feed bias vector with the click signal.
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

  // Focus input when popover opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  return (
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Box sx={{ position: 'relative' }}>
            <Box
              component="div"
              role="search"
              aria-label="Site search"
              sx={{
                display: 'flex',
                alignItems: 'center',
                transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                cursor: 'text',
                bgcolor: 'background.paper',
              }}
              onClick={() => {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                aria-hidden="true"
                tabIndex={-1}
                style={{
                  height: isMobile ? 48 : 40,
                  paddingLeft: isMobile ? 16 : 12,
                  paddingRight: isMobile ? 16 : 12,
                  borderRadius: 0,
                  color: '#666666',
                  pointerEvents: 'none',
                  flexShrink: 0,
                }}
              >
                <Search style={{ height: isMobile ? 20 : 16, width: isMobile ? 20 : 16 }} />
              </Button>

              <Box sx={{ flex: 1, position: 'relative' }}>
                <SearchInputTyped
                  ref={inputRef}
                  aria-label={t('search.ariaLabel', 'Search Queer Guide')}
                  role="searchbox"
                  placeholders={
                    isMobile
                      ? [t('search.placeholders.generic', 'Search...')]
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
                      color: '#666666',
                    }}
                    onClick={() => {
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                  >
                    <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
                  </Button>
                )}
              </Box>

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
            </Box>
          </Box>
        </PopoverTrigger>

        <PopoverContent
          style={{
            width: isMobile ? 'calc(100vw - 2rem)' : 600,
            padding: 0,
            zIndex: 50,
          }}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false} style={{ background: 'transparent' }}>
            {showFilters && (
              <>
                <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
                <CommandSeparator />
              </>
            )}

            <CommandList style={{ maxHeight: 384 }}>
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
                          style={{ height: 16, width: 16, marginRight: 8, color: '#666666' }}
                        />
                        <Box component="span" sx={{ flex: 1 }}>
                          {search}
                        </Box>
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
                      style={{ cursor: 'pointer', color: '#666666' }}
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
                              color: '#666666',
                              flexShrink: 0,
                            }}
                          />
                          <Box
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <Box
                              component="span"
                              sx={{
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                width: '100%',
                              }}
                            >
                              {displayName}
                            </Box>
                            {subtitle && (
                              <Box
                                component="span"
                                sx={{
                                  fontSize: '0.75rem',
                                  color: 'text.secondary',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  width: '100%',
                                }}
                              >
                                {subtitle}
                              </Box>
                            )}
                          </Box>
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
                      <Box
                        sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, width: '100%' }}
                      >
                        <Box sx={{ flexShrink: 0, mt: 0.5 }}>{getResultIcon(result.type)}</Box>
                        {result.imageUrl && (
                          <Box sx={{ flexShrink: 0 }}>
                            <Box
                              component="img"
                              src={result.imageUrl}
                              alt={result.title}
                              sx={{ width: 48, height: 48, objectFit: 'cover' }}
                            />
                          </Box>
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box
                            sx={{
                              fontWeight: 500,
                              fontSize: '0.875rem',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {result.title}
                          </Box>
                          {result.description && (
                            <Box
                              sx={{
                                fontSize: '0.75rem',
                                color: 'text.secondary',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {result.description}
                            </Box>
                          )}
                          <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {formatResultSubtitle(result)}
                          </Box>
                        </Box>
                        {result.rating && (
                          <Box sx={{ flexShrink: 0, fontSize: '0.75rem', color: 'text.secondary' }}>
                            ⭐ {result.rating}
                          </Box>
                        )}
                      </Box>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {/* Empty state */}
              {suggestions.length === 0 &&
                searchResults.length === 0 &&
                query.length >= 2 &&
                !loading &&
                !suggestionsLoading && (
                  <CommandEmpty style={{ padding: '24px 0', textAlign: 'center' }}>
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <Search style={{ height: 32, width: 32, opacity: 0.5 }} />
                      <Typography>No results found for "{query}"</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Try different keywords or adjust your filters
                      </Typography>
                    </Box>
                  </CommandEmpty>
                )}

            </CommandList>

            {/* Loading + action button live OUTSIDE CommandList — cmdk's
                role="listbox" only permits option/group children, so a
                progressbar or action button inside violates aria-required-children. */}
            {(loading || suggestionsLoading) && (
              <Box sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }} aria-live="polite">
                <Box
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                >
                  <CircularProgress size={24} aria-label="Searching" />
                  <Typography variant="body2">Searching...</Typography>
                </Box>
              </Box>
            )}

            {query && (
              <Box sx={{ p: 1.5, borderTop: '1px solid hsl(var(--border))' }}>
                <Button
                  onClick={() => handleSearch()}
                  variant="default"
                  style={{ width: '100%' }}
                  size="sm"
                >
                  <Search style={{ height: 16, width: 16, marginRight: 8 }} />
                  Search for "{query.length > 20 ? query.slice(0, 20) + '...' : query}"
                </Button>
              </Box>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </Box>
  );
};
