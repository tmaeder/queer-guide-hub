import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter, X } from "lucide-react";
import { useSearchSuggestions, SearchSuggestion } from "@/hooks/useSearchSuggestions";
import { SearchSuggestions } from "./SearchSuggestions";
import { SearchCategories } from "./SearchCategories";
import { SearchFilters } from "./SearchFilters";

export const AdvancedSearchBar = () => {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<string[]>([]);
  const navigate = useNavigate();

  const { suggestions, loading } = useSearchSuggestions(query);

  const handleSearch = (searchQuery?: string, category?: string) => {
    const searchTerm = searchQuery || query;
    const searchCategory = category || selectedCategory;
    
    if (!searchTerm.trim()) return;

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

  return (
    <div className="flex-1 max-w-md mx-4">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <div 
              className="flex items-center bg-background/50 backdrop-blur-sm rounded-lg border"
              onMouseEnter={() => setIsOpen(true)}
            >
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 rounded-l-lg"
                onClick={() => setIsOpen(true)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              
              <Input
                placeholder="Search venues, events, news..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIsOpen(true);
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsOpen(true)}
                onClick={() => setIsOpen(true)}
                className="border-0 bg-transparent focus-visible:ring-0 shadow-none"
                autoComplete="off"
              />
              
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 rounded-r-lg"
                onClick={() => {
                  handleSearch();
                  setIsOpen(false);
                }}
              >
                <Search className="h-4 w-4" />
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
        
        <PopoverContent className="w-80 p-0 z-50" align="start">
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              
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

              <CommandSeparator />

              {/* Quick Filters */}
              <SearchFilters onAddFilter={addFilter} />

              {/* Search Action */}
              {query && (
                <>
                  <CommandSeparator />
                  <div className="p-2">
                    <Button
                      onClick={() => {
                        handleSearch();
                        setIsOpen(false);
                      }}
                      className="w-full"
                      size="sm"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Search for "{query}"
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