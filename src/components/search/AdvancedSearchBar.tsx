import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter, X, MapPin, Calendar, Store, Newspaper, Users, Tag } from "lucide-react";

const searchCategories = [
  { label: "All", value: "all", icon: Search },
  { label: "Venues", value: "venues", icon: MapPin },
  { label: "Events", value: "events", icon: Calendar },
  { label: "Marketplace", value: "marketplace", icon: Store },
  { label: "News", value: "news", icon: Newspaper },
  { label: "Community", value: "community", icon: Users },
  { label: "Tags", value: "tags", icon: Tag },
];

export const AdvancedSearchBar = () => {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState<string[]>([]);
  const navigate = useNavigate();

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
    
    setIsOpen(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const addFilter = (filter: string) => {
    if (!filters.includes(filter)) {
      setFilters([...filters, filter]);
    }
  };

  const removeFilter = (filter: string) => {
    setFilters(filters.filter(f => f !== filter));
  };

  const CategoryIcon = searchCategories.find(cat => cat.value === selectedCategory)?.icon || Search;

  return (
    <div className="flex-1 max-w-md mx-4">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <div className="relative">
            <div className="flex items-center border rounded-lg bg-background/50 backdrop-blur-sm">
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3 border-r rounded-r-none"
                onClick={() => setIsOpen(true)}
              >
                <CategoryIcon className="h-4 w-4" />
              </Button>
              <Input
                placeholder="Search venues, events, news..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => setIsOpen(true)}
                className="border-0 focus-visible:ring-0 rounded-l-none"
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-10 px-3"
                onClick={() => handleSearch()}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Filters Display */}
            {filters.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {filters.map((filter) => (
                  <Badge
                    key={filter}
                    variant="secondary"
                    className="text-xs cursor-pointer"
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
        
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Type to search..."
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              
              {/* Categories */}
              <CommandGroup heading="Search in">
                {searchCategories.map((category) => {
                  const Icon = category.icon;
                  return (
                    <CommandItem
                      key={category.value}
                      onSelect={() => {
                        setSelectedCategory(category.value);
                        if (query) handleSearch(query, category.value);
                      }}
                      className="cursor-pointer"
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {category.label}
                      {selectedCategory === category.value && (
                        <Badge variant="outline" className="ml-auto text-xs">
                          Selected
                        </Badge>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>

              <CommandSeparator />

              {/* Quick Filters */}
              <CommandGroup heading="Filters">
                <CommandItem onSelect={() => addFilter("featured")}>
                  <Filter className="h-4 w-4 mr-2" />
                  Featured only
                </CommandItem>
                <CommandItem onSelect={() => addFilter("free")}>
                  <Filter className="h-4 w-4 mr-2" />
                  Free events
                </CommandItem>
                <CommandItem onSelect={() => addFilter("today")}>
                  <Filter className="h-4 w-4 mr-2" />
                  Today
                </CommandItem>
                <CommandItem onSelect={() => addFilter("this-week")}>
                  <Filter className="h-4 w-4 mr-2" />
                  This week
                </CommandItem>
              </CommandGroup>

              {query && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Actions">
                    <CommandItem 
                      onSelect={() => handleSearch()}
                      className="cursor-pointer font-medium"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      Search for "{query}"
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};