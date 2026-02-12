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
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

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
      navigate(`/resources/${suggestion.name}`);
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
    <Box sx={{ flex: 1, maxWidth: '28rem', mx: 2 }}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Box sx={{ position: 'relative' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                transition: 'all 200ms',
                borderRadius: 2,
                border: '1px solid',
                borderColor: isFocused ? 'primary.main' : 'divider',
                bgcolor: isFocused ? 'background.paper' : 'background.paper',
                opacity: isFocused ? 1 : 0.5,
                backdropFilter: 'blur(4px)',
                boxShadow: isFocused ? 4 : 0,
                '&:hover': {
                  opacity: isFocused ? 1 : 0.8
                }
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                sx={{ height: 40, px: 1.5, borderRadius: '8px 0 0 8px', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                onClick={() => setIsOpen(true)}
              >
                <Search style={{ height: 16, width: 16 }} />
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
                sx={{ border: 0, bgcolor: 'transparent', '&:focus-visible': { outline: 'none', boxShadow: 'none' }, boxShadow: 'none', fontSize: '0.875rem', '& ::placeholder': { color: 'text.disabled' } }}
                autoComplete="off"
              />

              {query && (
                <Button
                  variant="ghost"
                  size="sm"
                  sx={{ height: 24, width: 24, p: 0, mr: 0.5, minWidth: 24, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <X style={{ height: 12, width: 12 }} />
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                sx={{ height: 40, px: 1.5, borderRadius: '0 8px 8px 0', color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
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
                  <Sparkles style={{ height: 16, width: 16, animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Zap style={{ height: 16, width: 16 }} />
                )}
              </Button>
            </Box>


            {/* Active Filters Display */}
            {filters.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                {filters.map((filter) => (
                  <Badge
                    key={filter}
                    variant="secondary"
                    style={{ fontSize: '0.75rem', cursor: 'pointer' }}
                    sx={{ '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => removeFilter(filter)}
                  >
                    {filter}
                    <X style={{ height: 12, width: 12, marginLeft: 4 }} />
                  </Badge>
                ))}
              </Box>
            )}
          </Box>
        </PopoverTrigger>
        
        <PopoverContent sx={{ width: 384, p: 0, zIndex: 50, bgcolor: 'rgba(var(--background-rgb), 0.95)', backdropFilter: 'blur(8px)', border: 1, borderColor: 'divider', boxShadow: 24 }} align="start">
          <Command shouldFilter={false} style={{ backgroundColor: 'transparent' }}>
            <CommandList style={{ maxHeight: 320 }}>
              {!query && recentSearches.length > 0 && (
                <>
                  <CommandGroup heading="Recent searches">
                    {recentSearches.map((search, index) => (
                      <CommandItem
                        key={index}
                        onSelect={() => handleRecentSearch(search)}
                        style={{ cursor: 'pointer' }}
                      >
                        <Clock style={{ height: 16, width: 16, marginRight: 8, color: 'var(--muted-foreground)' }} />
                        <Box component="span" sx={{ flex: 1 }}>{search}</Box>
                        <Button
                          variant="ghost"
                          size="sm"
                          sx={{ height: 24, width: 24, p: 0, ml: 1, minWidth: 24 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRecentSearches(recentSearches.filter((_, i) => i !== index));
                            localStorage.setItem('recent-searches', JSON.stringify(recentSearches.filter((_, i) => i !== index)));
                          }}
                        >
                          <X style={{ height: 12, width: 12 }} />
                        </Button>
                      </CommandItem>
                    ))}
                    <CommandItem
                      onSelect={clearRecentSearches}
                      style={{ cursor: 'pointer', color: 'var(--muted-foreground)' }}
                    >
                      <X style={{ height: 16, width: 16, marginRight: 8 }} />
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
                <CommandEmpty sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Search style={{ height: 32, width: 32, opacity: 0.5 }} />
                    <Typography>No results found for "{query}"</Typography>
                    <Typography variant="caption">Try different keywords or check spelling</Typography>
                  </Box>
                </CommandEmpty>
              )}

              <CommandSeparator />

              {/* Quick Filters */}
              <SearchFilters onAddFilter={addFilter} />

              {/* Search Action */}
              {query && (
                <>
                  <CommandSeparator />
                  <Box sx={{ p: 1.5 }}>
                    <Button
                      onClick={() => {
                        handleSearch();
                        setIsOpen(false);
                      }}
                      sx={{ width: '100%', bgcolor: 'primary.main', '&:hover': { opacity: 0.9 }, color: 'primary.contrastText' }}
                      size="sm"
                    >
                      <Search style={{ height: 16, width: 16, marginRight: 8 }} />
                      Search for "{query.length > 20 ? query.slice(0, 20) + '...' : query}"
                    </Button>
                  </Box>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Box>
  );
};