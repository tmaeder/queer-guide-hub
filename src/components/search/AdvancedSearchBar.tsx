import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandList, CommandSeparator, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter, X, Sparkles, Zap, Clock } from "lucide-react";
import { useSearchSuggestions, SearchSuggestion } from "@/hooks/useSearchSuggestions";
import { SearchSuggestions } from "./SearchSuggestions";
import { SearchCategories } from "./SearchCategories";
import { SearchFilters } from "./SearchFilters";

export const AdvancedSearchBar = () => {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const { suggestions, loading } = useSearchSuggestions(query);

  // Load recent searches from localStorage on mount
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

  const handleSearch = (searchQuery?: string, category?: string) => {
    const searchTerm = searchQuery || query;
    const searchCategory = category || selectedCategory;
    
    if (!searchTerm.trim()) return;

    // Save to recent searches
    saveRecentSearch(searchTerm);

    // Navigate to the appropriate page with search parameters
    const params = new URLSearchParams({
      q: searchTerm,
      ...(searchCategory !== "all" && { category: searchCategory }),
      ...(filters.length > 0 && { filters: filters.join(",") }),
    });

    if (searchCategory === "all") {
      navigate(`/search?${params}`);
    } else {
      navigate(`/${searchCategory}?${params}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
      setIsOpen(false);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category);
    if (query) {
      handleSearch(query, category);
      setIsOpen(false);
    }
  };

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    const displayName = suggestion.name || suggestion.title;
    setQuery(displayName);
    
    // Navigate directly to the item if possible
    if (suggestion.type === 'venue') {
      navigate(`/venues/${suggestion.id}`);
    } else if (suggestion.type === 'event') {
      navigate(`/events/${suggestion.id}`);
    } else if (suggestion.type === 'marketplace') {
      navigate(`/marketplace/${suggestion.id}`);
    } else if (suggestion.type === 'tag') {
      navigate(`/tags/${suggestion.name}`);
    } else {
      handleSearch(displayName, suggestion.type);
    }
    setIsOpen(false);
  };

  const addFilter = (filter: string) => {
    if (!filters.includes(filter)) {
      setFilters([...filters, filter]);
    }
  };

  const removeFilter = (filter: string) => {
    setFilters(filters.filter(f => f !== filter));
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent-searches');
  };

  const handleRecentSearch = (searchTerm: string) => {
    setQuery(searchTerm);
    handleSearch(searchTerm);
    setIsOpen(false);
  };

  return (
    <div className="flex-1 max-w-md mx-4">
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
                placeholder="Search anything..."
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
                className="h-10 px-3 rounded-r-lg text-muted-foreground hover:text-foreground"
                onClick={() => {
                  if (query.trim()) {
                    handleSearch();
                    setIsOpen(false);
                  } else {
                    setIsOpen(true);
                  }
                }}
              >
                {loading ? (
                  <Sparkles className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            {/* Active Filters Display */}
            {filters.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {filters.map((filter) => (
                  <Badge
                    key={filter}
                    variant="secondary"
                    className="text-xs cursor-pointer hover:bg-secondary/80"
                    onClick={() => removeFilter(filter)}
                  >
                    {filter}
                    <X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </PopoverTrigger>
        
        <PopoverContent className="w-96 p-0 z-50 bg-background/95 backdrop-blur-sm border shadow-xl" align="start">
          <Command shouldFilter={false} className="bg-transparent">
            <CommandList className="max-h-80">
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
                            setRecentSearches(recentSearches.filter((_, i) => i !== index));
                            localStorage.setItem('recent-searches', JSON.stringify(recentSearches.filter((_, i) => i !== index)));
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
              
              {/* Search Categories */}
              <SearchCategories
                selectedCategory={selectedCategory}
                query={query}
                onSelectCategory={handleSelectCategory}
              />

              {/* Live Suggestions */}
              <SearchSuggestions
                suggestions={suggestions}
                loading={loading}
                query={query}
                onSelectSuggestion={handleSelectSuggestion}
              />

              {suggestions.length === 0 && query.length >= 2 && !loading && (
                <CommandEmpty className="py-6 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 opacity-50" />
                    <p>No results found for "{query}"</p>
                    <p className="text-xs">Try different keywords or check spelling</p>
                  </div>
                </CommandEmpty>
              )}

              <CommandSeparator />

              {/* Quick Filters */}
              <SearchFilters onAddFilter={addFilter} />

              {/* Search Action */}
              {query && (
                <>
                  <CommandSeparator />
                  <div className="p-3">
                    <Button
                      onClick={() => {
                        handleSearch();
                        setIsOpen(false);
                      }}
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