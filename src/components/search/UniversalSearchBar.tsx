import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchInputTyped } from "@/components/ui/search-input-typed";
import { Command, CommandEmpty, CommandList, CommandSeparator, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter, X, Clock, Zap, MapPin, Calendar, Users, ShoppingBag, Newspaper, Globe, Plane, FileText, SlidersHorizontal, Tag, User } from "lucide-react";
import { useSearch, SearchResult, SearchFilters } from "@/hooks/useSearch";
import { useSearchSuggestions, SearchSuggestion } from "@/hooks/useSearchSuggestions";
import { SearchFiltersPanel } from "./SearchFiltersPanel";
import { useIsMobile } from "@/hooks/use-mobile";
const contentTypeIcons = {
  venue: MapPin,
  event: Calendar,
  marketplace: ShoppingBag,
  user: Users,
  news: Newspaper,
  location: Globe,
  content: FileText,
  travel: Plane,
  ressource: Tag,
  personality: User,
  tag: Tag,
  group: Users
};
const contentTypeLabels = {
  venue: "Venues",
  event: "Events",
  marketplace: "Marketplace",
  user: "Members",
  news: "News",
  location: "Places",
  content: "Resources",
  travel: "Places",
  ressource: "Resources",
  personality: "Personalities",
  tag: "Tags",
  group: "Groups"
};
export const UniversalSearchBar = () => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    types: []
  });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  // Reset search state when navigating away from search results
  useEffect(() => {
    if (!location.pathname.startsWith('/search')) {
      setQuery("");
      setIsOpen(false);
      setShowFilters(false);
    }
  }, [location.pathname]);
  const {
    results,
    suggestions: searchResults,
    loading
  } = useSearch(query, filters);

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
    const updated = [searchTerm, ...recentSearches.filter(s => s !== searchTerm)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recent-searches', JSON.stringify(updated));
  };
  const handleSearch = (searchQuery?: string) => {
    const searchTerm = searchQuery || query;
    if (!searchTerm.trim()) return;
    saveRecentSearch(searchTerm);

    // Navigate to search results page
    const params = new URLSearchParams({
      q: searchTerm,
      ...(filters.types.length > 0 && {
        types: filters.types.join(",")
      }),
      ...(filters.location && {
        location: filters.location
      }),
      ...(filters.categories && filters.categories.length > 0 && {
        categories: filters.categories.join(",")
      })
    });
    navigate(`/search?${params}`);
    setIsOpen(false);
  };
  const handleSelectResult = (result: SearchResult) => {
    setQuery(result.title);

    // Navigate directly to specific content (never to directory/overview pages)
    switch (result.type) {
      case 'venue':
        navigate(`/venues/${result.objectID}`);
        break;
      case 'event':
        navigate(`/events/${result.objectID}`);
        break;
      case 'marketplace':
        navigate(`/marketplace/${result.objectID}`);
        break;
      case 'user':
        navigate(`/user/${result.objectID}`);
        break;
      case 'personality':
        navigate(`/personalities/${result.objectID}`);
        break;
      case 'group':
        navigate(`/groups/${result.objectID}`);
        break;
      case 'news':
        // Go to specific news article, not news directory
        navigate(`/news/${result.objectID}`);
        break;
      case 'location':
        // Go to specific location page
        if (result.metadata?.isCountry) {
          navigate(`/country/${result.objectID}`);
        } else {
          navigate(`/city/${result.objectID}`);
        }
        break;
      case 'content':
        // Content items map to resources
        if (result.metadata?.slug) {
          navigate(`/resources/${result.metadata.slug}`);
        } else {
          navigate(`/resources/${result.objectID}`);
        }
        break;
      case 'ressource':
        // Go to specific resource page using slug or ID
        if (result.metadata?.slug) {
          navigate(`/resources/${result.metadata.slug}`);
        } else {
          navigate(`/resources/${result.objectID}`);
        }
        break;
      case 'tag':
        // For tags, navigate directly to the specific resource content about this tag
        const tagSlug = result.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '%20');
        navigate(`/resources/${tagSlug}`);
        break;
      case 'travel':
        // Travel items map to places/cities
        navigate(`/places`);
        break;
      default:
        // Last resort: search with direct flag to find specific content
        navigate(`/search?q=${encodeURIComponent(result.title)}&direct=true`);
    }
    setIsOpen(false);
  };

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    const displayName = suggestion.name || suggestion.title;
    setQuery(displayName);
    
    // Navigate directly to specific content (never to directory/overview pages)
    switch (suggestion.type) {
      case 'venue':
        // Go to specific venue detail page
        navigate(`/venues/${suggestion.id}`);
        break;
      case 'event':
        // Go to specific event detail page
        navigate(`/events/${suggestion.id}`);
        break;
      case 'marketplace':
        // Go to specific marketplace item detail page
        navigate(`/marketplace/${suggestion.id}`);
        break;
      case 'tag':
        // For tags, navigate directly to the specific resource content about this tag
        // Convert tag name to a URL-friendly slug and go to the resource page
        const tagSlug = suggestion.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '%20');
        navigate(`/resources/${tagSlug}`);
        break;
      case 'user':
        navigate(`/user/${suggestion.id}`);
        break;
      case 'personality':
        navigate(`/personalities/${suggestion.id}`);
        break;
      case 'group':
        navigate(`/groups/${suggestion.id}`);
        break;
      default:
        // Fallback: try to find specific content, not search results
        navigate(`/search?q=${encodeURIComponent(displayName)}&types=${suggestion.type}&direct=true`);
    }
    setIsOpen(false);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    } else if (e.key === "Escape") {
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
  const getResultIcon = (type: SearchResult['type']) => {
    const Icon = contentTypeIcons[type];
    return <Icon style={{ height: 16, width: 16 }} />;
  };
  const formatResultSubtitle = (result: SearchResult) => {
    const parts = [];
    if (result.category) parts.push(result.category);
    if (result.location) parts.push(result.location);
    if (result.price) parts.push(`$${result.price}`);
    if (result.date) parts.push(new Date(result.date).toLocaleDateString());
    return parts.join(" • ");
  };
  const activeFiltersCount = filters.types.length + (filters.location ? 1 : 0) + (filters.categories?.length || 0) + (filters.priceRange ? 1 : 0) + (filters.rating ? 1 : 0);

  // Focus input when popover opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);
  return <div style={isMobile ? { width: '100%' } : { flex: 1, maxWidth: '42rem', marginLeft: 16, marginRight: 16 }}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div sx={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', transition: 'all 0.2s', borderRadius: 8, border: '1px solid', cursor: 'text', ...(isFocused ? { backgroundColor: 'var(--background)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', outline: '2px solid rgba(var(--ring-rgb), 0.2)', borderColor: 'var(--ring)' } : { backgroundColor: 'rgba(var(--background-rgb), 0.5)', backdropFilter: 'blur(4px)' }) }} onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}>
              <Button variant="ghost" size="sm" style={{ height: isMobile ? 48 : 40, paddingLeft: isMobile ? 16 : 12, paddingRight: isMobile ? 16 : 12, borderRadius: '8px 0 0 8px', color: 'var(--muted-foreground)', pointerEvents: 'none', flexShrink: 0 }}>
                <Search style={{ height: isMobile ? 20 : 16, width: isMobile ? 20 : 16 }} />
              </Button>
              
              <div sx={{ flex: 1, position: 'relative' }}>
                <SearchInputTyped 
                  ref={inputRef} 
                  placeholders={isMobile ? 
                    ["Search..."] : 
                    ["Search venues...", "Find events...", "Browse marketplace...", "Discover people...", "Read news...", "Explore resources...", "Meet personalities..."]
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
                  style={{ width: '100%', border: 0, backgroundColor: 'transparent', boxShadow: 'none', outline: 'none', fontSize: isMobile ? '1rem' : '0.875rem' }}
                  autoComplete="off" 
                />
                
                {query && <Button variant="ghost" size="sm" aria-label="Clear search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', height: isMobile ? 32 : 24, width: isMobile ? 32 : 24, padding: 0, color: 'var(--muted-foreground)' }} onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}>
                    <X style={{ height: isMobile ? 16 : 12, width: isMobile ? 16 : 12 }} />
                  </Button>}
              </div>
              
              <Button variant="ghost" size="sm" aria-label="Search filters" style={{ height: isMobile ? 48 : 40, paddingLeft: isMobile ? 16 : 12, paddingRight: isMobile ? 16 : 12, color: activeFiltersCount > 0 ? 'hsl(var(--primary))' : 'var(--muted-foreground)', position: 'relative', flexShrink: 0 }} onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal style={{ height: isMobile ? 20 : 16, width: isMobile ? 20 : 16 }} />
                {activeFiltersCount > 0 && <Badge variant="destructive" sx={{ position: 'absolute', top: -4, right: -4, height: 20, width: 20, p: 0, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {activeFiltersCount}
                  </Badge>}
              </Button>
            </div>
          </div>
        </PopoverTrigger>
        
        <PopoverContent style={{ width: isMobile ? 'calc(100vw - 2rem)' : 600, padding: 0, zIndex: 50, backgroundColor: 'rgba(var(--background-rgb), 0.95)', backdropFilter: 'blur(4px)', border: '1px solid', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)' }} align="start">
          <Command shouldFilter={false} sx={{ bgcolor: 'transparent' }}>
            {showFilters && (
              <>
                <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
                <CommandSeparator />
              </>
            )}
            
            <CommandList sx={{ maxHeight: 384 }}>
              {!query && recentSearches.length > 0 && <>
                  <CommandGroup heading="Recent searches">
                    {recentSearches.map((search, index) => <CommandItem key={index} onSelect={() => handleRecentSearch(search)} sx={{ cursor: 'pointer' }}>
                        <Clock style={{ height: 16, width: 16, marginRight: 8, color: 'var(--muted-foreground)' }} />
                        <span sx={{ flex: 1 }}>{search}</span>
                        <Button variant="ghost" size="sm" sx={{ height: 24, width: 24, p: 0, ml: 1 }} onClick={e => {
                    e.stopPropagation();
                    const updated = recentSearches.filter((_, i) => i !== index);
                    setRecentSearches(updated);
                    localStorage.setItem('recent-searches', JSON.stringify(updated));
                  }}>
                          <X style={{ height: 12, width: 12 }} />
                        </Button>
                      </CommandItem>)}
                    <CommandItem onSelect={clearRecentSearches} sx={{ cursor: 'pointer', color: 'text.secondary' }}>
                      <X style={{ height: 16, width: 16, marginRight: 8 }} />
                      Clear recent searches
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>}

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
                          sx={{ cursor: 'pointer', transition: 'background-color 0.2s', p: 1.5, '&:hover': { bgcolor: 'action.hover' } }}
                        >
                          <Icon style={{ height: 16, width: 16, marginRight: 12, color: 'var(--muted-foreground)', flexShrink: 0 }} />
                          <div sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                            <span sx={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{displayName}</span>
                            {subtitle && (
                              <span sx={{ fontSize: '0.75rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{subtitle}</span>
                            )}
                          </div>
                          <Badge 
                            variant="outline" 
                            sx={{ ml: 1, fontSize: '0.75rem', textTransform: 'capitalize', bgcolor: 'rgba(var(--background-rgb), 0.5)', borderColor: 'divider', flexShrink: 0 }}
                          >
                            {suggestion.type}
                          </Badge>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* Group search results by type */}
              {Object.entries(searchResults.reduce((acc, result) => {
              if (!acc[result.type]) acc[result.type] = [];
              acc[result.type].push(result);
              return acc;
            }, {} as Record<string, SearchResult[]>)).map(([type, typeResults]) => <CommandGroup key={type} heading={contentTypeLabels[type as keyof typeof contentTypeLabels]}>
                  {typeResults.map(result => <CommandItem key={`${result.type}-${result.objectID}`} onSelect={() => handleSelectResult(result)} sx={{ cursor: 'pointer', p: 1.5 }}>
                      <div sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, width: '100%' }}>
                        <div sx={{ flexShrink: 0, mt: 0.5 }}>
                          {getResultIcon(result.type)}
                        </div>
                        {result.imageUrl && <div sx={{ flexShrink: 0 }}>
                            <img src={result.imageUrl} alt={result.title} sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1 }} />
                          </div>}
                        <div sx={{ flex: 1, minWidth: 0 }}>
                          <div sx={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</div>
                          {result.description && <div sx={{ fontSize: '0.75rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {result.description}
                            </div>}
                          <div sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            {formatResultSubtitle(result)}
                          </div>
                        </div>
                        {result.rating && <div sx={{ flexShrink: 0, fontSize: '0.75rem', color: 'text.secondary' }}>
                            ⭐ {result.rating}
                          </div>}
                      </div>
                    </CommandItem>)}
                </CommandGroup>)}

              {suggestions.length === 0 && searchResults.length === 0 && query.length >= 2 && !loading && !suggestionsLoading && <CommandEmpty sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                  <div sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Search style={{ height: 32, width: 32, opacity: 0.5 }} />
                    <p>No results found for "{query}"</p>
                    <p sx={{ fontSize: '0.75rem' }}>Try different keywords or adjust your filters</p>
                  </div>
                </CommandEmpty>}

              {(loading || suggestionsLoading) && <div sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                  <div sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <div sx={{ animation: 'spin 1s linear infinite', height: 24, width: 24, border: 2, borderColor: 'primary.main', borderTopColor: 'transparent', borderRadius: '50%' }} />
                    <p sx={{ fontSize: '0.875rem' }}>Searching...</p>
                  </div>
                </div>}

              {/* Search Action */}
              {query && <>
                  <CommandSeparator />
                  <div sx={{ p: 1.5 }}>
                    <Button onClick={() => handleSearch()} sx={{ width: '100%', bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { opacity: 0.9 } }} size="sm">
                      <Search style={{ height: 16, width: 16, marginRight: 8 }} />
                      Search for "{query.length > 20 ? query.slice(0, 20) + '...' : query}"
                    </Button>
                  </div>
                </>}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>;
};