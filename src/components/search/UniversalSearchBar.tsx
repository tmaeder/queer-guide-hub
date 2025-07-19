import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandList, CommandSeparator, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter, X, Clock, Zap, MapPin, Calendar, Users, ShoppingBag, Newspaper, Globe, Plane, FileText, SlidersHorizontal } from "lucide-react";
import { useUniversalSearch, SearchResult, SearchFilters } from "@/hooks/useUniversalSearch";
import { SearchFiltersPanel } from "./SearchFiltersPanel";

const contentTypeIcons = {
  venue: MapPin,
  event: Calendar,
  marketplace: ShoppingBag,
  user: Users,
  news: Newspaper,
  location: Globe,
  content: FileText,
  travel: Plane
};

const contentTypeLabels = {
  venue: "Venues",
  event: "Events", 
  marketplace: "Marketplace",
  user: "Users",
  news: "News",
  location: "Locations",
  content: "Wiki",
  travel: "Travel"
};

export const UniversalSearchBar = () => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({ types: [] });
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { results, suggestions, loading } = useUniversalSearch(query, filters);

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
      ...(filters.types.length > 0 && { types: filters.types.join(",") }),
      ...(filters.location && { location: filters.location }),
      ...(filters.categories && filters.categories.length > 0 && { categories: filters.categories.join(",") }),
    });

    navigate(`/search?${params}`);
    setIsOpen(false);
  };

  const handleSelectResult = (result: SearchResult) => {
    setQuery(result.title);
    
    // Navigate to specific item based on type
    switch (result.type) {
      case 'venue':
        navigate(`/venues/${result.id}`);
        break;
      case 'event':
        navigate(`/events/${result.id}`);
        break;
      case 'marketplace':
        navigate(`/marketplace/${result.id}`);
        break;
      case 'user':
        navigate(`/users/${result.id}`);
        break;
      case 'news':
        navigate(`/news/${result.id}`);
        break;
      case 'location':
        navigate(`/locations/${result.id}`);
        break;
      case 'content':
        navigate(`/wiki/${result.metadata?.slug || result.id}`);
        break;
      case 'travel':
        navigate(`/travel/bookings/${result.id}`);
        break;
      default:
        handleSearch(result.title);
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
    return <Icon className="h-4 w-4" />;
  };

  const formatResultSubtitle = (result: SearchResult) => {
    const parts = [];
    if (result.category) parts.push(result.category);
    if (result.location) parts.push(result.location);
    if (result.price) parts.push(`$${result.price}`);
    if (result.date) parts.push(new Date(result.date).toLocaleDateString());
    return parts.join(" • ");
  };

  const activeFiltersCount = filters.types.length + 
    (filters.location ? 1 : 0) + 
    (filters.categories?.length || 0) + 
    (filters.priceRange ? 1 : 0) + 
    (filters.rating ? 1 : 0);

  return (
    <div className="flex-1 max-w-2xl mx-4">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <div 
              className={`flex items-center transition-all duration-200 rounded-lg border ${
                isFocused 
                  ? 'bg-background shadow-lg ring-2 ring-ring/20 border-ring' 
                  : 'bg-background/50 backdrop-blur-sm hover:bg-background/80'
              }`}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 rounded-l-lg text-muted-foreground hover:text-foreground"
                onClick={() => setIsOpen(true)}
              >
                <Search className="h-4 w-4" />
              </Button>
              
              <Input
                ref={inputRef}
                placeholder="Search venues, events, marketplace, users, news..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!isOpen) setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setIsFocused(true);
                  setIsOpen(true);
                }}
                onBlur={() => setIsFocused(false)}
                className="border-0 bg-transparent focus-visible:ring-0 shadow-none text-sm placeholder:text-muted-foreground/60"
                autoComplete="off"
              />
              
              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 mr-1 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                className={`h-10 px-3 text-muted-foreground hover:text-foreground relative ${
                  activeFiltersCount > 0 ? 'text-primary' : ''
                }`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center"
                  >
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 rounded-r-lg text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (query.trim()) {
                    handleSearch();
                  } else {
                    setIsOpen(true);
                  }
                }}
              >
                <Zap className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </PopoverTrigger>
        
        <PopoverContent className="w-[600px] p-0 z-50 bg-background/95 backdrop-blur-sm border shadow-xl" align="start">
          <Command shouldFilter={false} className="bg-transparent">
            {showFilters && (
              <>
                <SearchFiltersPanel filters={filters} onFiltersChange={setFilters} />
                <CommandSeparator />
              </>
            )}
            
            <CommandList className="max-h-96">
              {!query && recentSearches.length > 0 && (
                <>
                  <CommandGroup heading="Recent searches">
                    {recentSearches.map((search, index) => (
                      <CommandItem
                        key={index}
                        onSelect={() => handleRecentSearch(search)}
                        className="cursor-pointer"
                      >
                        <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="flex-1">{search}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 ml-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = recentSearches.filter((_, i) => i !== index);
                            setRecentSearches(updated);
                            localStorage.setItem('recent-searches', JSON.stringify(updated));
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </CommandItem>
                    ))}
                    <CommandItem
                      onSelect={clearRecentSearches}
                      className="cursor-pointer text-muted-foreground"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear recent searches
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* Group results by type */}
              {Object.entries(
                suggestions.reduce((acc, result) => {
                  if (!acc[result.type]) acc[result.type] = [];
                  acc[result.type].push(result);
                  return acc;
                }, {} as Record<string, SearchResult[]>)
              ).map(([type, typeResults]) => (
                <CommandGroup key={type} heading={contentTypeLabels[type as keyof typeof contentTypeLabels]}>
                  {typeResults.map((result) => (
                    <CommandItem
                      key={`${result.type}-${result.id}`}
                      onSelect={() => handleSelectResult(result)}
                      className="cursor-pointer p-3"
                    >
                      <div className="flex items-start gap-3 w-full">
                        <div className="flex-shrink-0 mt-1">
                          {getResultIcon(result.type)}
                        </div>
                        {result.imageUrl && (
                          <div className="flex-shrink-0">
                            <img 
                              src={result.imageUrl} 
                              alt={result.title}
                              className="w-12 h-12 object-cover rounded"
                            />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{result.title}</div>
                          {result.description && (
                            <div className="text-xs text-muted-foreground line-clamp-1">
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

              {suggestions.length === 0 && query.length >= 2 && !loading && (
                <CommandEmpty className="py-6 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 opacity-50" />
                    <p>No results found for "{query}"</p>
                    <p className="text-xs">Try different keywords or adjust your filters</p>
                  </div>
                </CommandEmpty>
              )}

              {loading && (
                <div className="py-6 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                    <p className="text-sm">Searching...</p>
                  </div>
                </div>
              )}

              {/* Search Action */}
              {query && (
                <>
                  <CommandSeparator />
                  <div className="p-3">
                    <Button
                      onClick={() => handleSearch()}
                      className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground"
                      size="sm"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Search for "{query.length > 20 ? query.slice(0, 20) + '...' : query}"
                    </Button>
                  </div>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};