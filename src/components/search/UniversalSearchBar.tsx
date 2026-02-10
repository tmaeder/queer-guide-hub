import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchInputTyped } from "@/components/ui/search-input-typed";
import { Command, CommandEmpty, CommandList, CommandSeparator, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter, X, Clock, Zap, MapPin, Calendar, Users, ShoppingBag, Newspaper, Globe, Plane, FileText, SlidersHorizontal, Tag, User } from "lucide-react";
import { useAlgoliaSearch, AlgoliaSearchResult, AlgoliaSearchFilters } from "@/hooks/useAlgoliaSearch";
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
  const [filters, setFilters] = useState<AlgoliaSearchFilters>({
    types: []
  });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    results,
    suggestions: searchResults,
    loading
  } = useAlgoliaSearch(query, filters);

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
  const handleSelectResult = (result: AlgoliaSearchResult) => {
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
  const getResultIcon = (type: AlgoliaSearchResult['type']) => {
    const Icon = contentTypeIcons[type];
    return <Icon className="h-4 w-4" />;
  };
  const formatResultSubtitle = (result: AlgoliaSearchResult) => {
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
  return <div className={`${isMobile ? 'w-full' : 'flex-1 max-w-2xl mx-4'}`}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <div className={`flex items-center transition-all duration-200 rounded-lg border cursor-text ${isFocused ? 'bg-background shadow-lg ring-2 ring-ring/20 border-ring' : 'bg-background/50 backdrop-blur-sm hover:bg-background/80'}`} onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}>
              <Button variant="ghost" size="sm" className={`${isMobile ? 'h-12 px-4' : 'h-10 px-3'} rounded-l-lg text-muted-foreground hover:text-foreground pointer-events-none flex-shrink-0`}>
                <Search className={`${isMobile ? 'h-5 w-5' : 'h-4 w-4'}`} />
              </Button>
              
              <div className="flex-1 relative">
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
                  className={`w-full border-0 bg-transparent focus-visible:ring-0 shadow-none ${isMobile ? 'text-base placeholder:text-muted-foreground/60' : 'text-sm placeholder:text-muted-foreground/60'}`} 
                  autoComplete="off" 
                />
                
                {query && <Button variant="ghost" size="sm" aria-label="Clear search" className={`absolute right-2 top-1/2 -translate-y-1/2 ${isMobile ? 'h-8 w-8' : 'h-6 w-6'} p-0 text-muted-foreground hover:text-foreground`} onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}>
                    <X className={`${isMobile ? 'h-4 w-4' : 'h-3 w-3'}`} />
                  </Button>}
              </div>
              
              <Button variant="ghost" size="sm" aria-label="Search filters" className={`${isMobile ? 'h-12 px-4' : 'h-10 px-3'} text-muted-foreground hover:text-foreground relative flex-shrink-0 ${activeFiltersCount > 0 ? 'text-primary' : ''}`} onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal className={`${isMobile ? 'h-5 w-5' : 'h-4 w-4'}`} />
                {activeFiltersCount > 0 && <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center">
                    {activeFiltersCount}
                  </Badge>}
              </Button>
            </div>
          </div>
        </PopoverTrigger>
        
        <PopoverContent className={`${isMobile ? 'w-[calc(100vw-2rem)]' : 'w-[600px]'} p-0 z-50 bg-background/95 backdrop-blur-sm border shadow-xl`} align="start">
          <Command shouldFilter={false} className="bg-transparent">
            {showFilters && (
              <>
                <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
                <CommandSeparator />
              </>
            )}
            
            <CommandList className="max-h-96">
              {!query && recentSearches.length > 0 && <>
                  <CommandGroup heading="Recent searches">
                    {recentSearches.map((search, index) => <CommandItem key={index} onSelect={() => handleRecentSearch(search)} className="cursor-pointer">
                        <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="flex-1">{search}</span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-2" onClick={e => {
                    e.stopPropagation();
                    const updated = recentSearches.filter((_, i) => i !== index);
                    setRecentSearches(updated);
                    localStorage.setItem('recent-searches', JSON.stringify(updated));
                  }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </CommandItem>)}
                    <CommandItem onSelect={clearRecentSearches} className="cursor-pointer text-muted-foreground">
                      <X className="h-4 w-4 mr-2" />
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
                          className="cursor-pointer hover:bg-muted/50 transition-colors p-3"
                        >
                          <Icon className="h-4 w-4 mr-3 text-muted-foreground flex-shrink-0" />
                          <div className="flex flex-col items-start flex-1 min-w-0">
                            <span className="font-medium text-sm truncate w-full">{displayName}</span>
                            {subtitle && (
                              <span className="text-xs text-muted-foreground truncate w-full">{subtitle}</span>
                            )}
                          </div>
                          <Badge 
                            variant="outline" 
                            className="ml-2 text-xs capitalize bg-background/50 border-muted flex-shrink-0"
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
            }, {} as Record<string, AlgoliaSearchResult[]>)).map(([type, typeResults]) => <CommandGroup key={type} heading={contentTypeLabels[type as keyof typeof contentTypeLabels]}>
                  {typeResults.map(result => <CommandItem key={`${result.type}-${result.objectID}`} onSelect={() => handleSelectResult(result)} className="cursor-pointer p-3">
                      <div className="flex items-start gap-3 w-full">
                        <div className="flex-shrink-0 mt-1">
                          {getResultIcon(result.type)}
                        </div>
                        {result.imageUrl && <div className="flex-shrink-0">
                            <img src={result.imageUrl} alt={result.title} className="w-12 h-12 object-cover rounded" />
                          </div>}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{result.title}</div>
                          {result.description && <div className="text-xs text-muted-foreground line-clamp-1">
                              {result.description}
                            </div>}
                          <div className="text-xs text-muted-foreground">
                            {formatResultSubtitle(result)}
                          </div>
                        </div>
                        {result.rating && <div className="flex-shrink-0 text-xs text-muted-foreground">
                            ⭐ {result.rating}
                          </div>}
                      </div>
                    </CommandItem>)}
                </CommandGroup>)}

              {suggestions.length === 0 && searchResults.length === 0 && query.length >= 2 && !loading && !suggestionsLoading && <CommandEmpty className="py-6 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 opacity-50" />
                    <p>No results found for "{query}"</p>
                    <p className="text-xs">Try different keywords or adjust your filters</p>
                  </div>
                </CommandEmpty>}

              {(loading || suggestionsLoading) && <div className="py-6 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                    <p className="text-sm">Searching...</p>
                  </div>
                </div>}

              {/* Search Action */}
              {query && <>
                  <CommandSeparator />
                  <div className="p-3">
                    <Button onClick={() => handleSearch()} className="w-full bg-primary hover:opacity-90 text-primary-foreground" size="sm">
                      <Search className="h-4 w-4 mr-2" />
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