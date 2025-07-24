import { Search, Filter, X, MapPin, Tag, Grid3X3 } from "lucide-react";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

interface VenuesFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  selectedCity: string;
  onCityChange: (value: string) => void;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  selectedAmenities: string[];
  onAmenitiesChange: (amenities: string[]) => void;
  categories: string[];
  totalResults: number;
}

export function VenuesFilters({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedCity,
  onCityChange,
  selectedTags,
  onTagsChange,
  selectedAmenities,
  onAmenitiesChange,
  categories,
  totalResults
}: VenuesFiltersProps) {
  const [cities, setCities] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  const fetchFilterOptions = async () => {
    try {
      // Fetch unique cities
      const { data: citiesData } = await supabase
        .from('venues')
        .select('city')
        .not('city', 'is', null);
      
      const uniqueCities = [...new Set(citiesData?.map(v => v.city).filter(Boolean))] as string[];
      setCities(uniqueCities.sort());

      // Fetch unique tags
      const { data: tagsData } = await supabase
        .from('venues')
        .select('tags')
        .not('tags', 'is', null);
      
      const allTags = tagsData?.flatMap(v => v.tags || []) || [];
      const uniqueTags = [...new Set(allTags)].sort();
      setTags(uniqueTags);

      // Fetch unique amenities
      const { data: amenitiesData } = await supabase
        .from('venues')
        .select('amenities')
        .not('amenities', 'is', null);
      
      const allAmenities = amenitiesData?.flatMap(v => v.amenities || []) || [];
      const uniqueAmenities = [...new Set(allAmenities)].sort();
      setAmenities(uniqueAmenities);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  const clearAllFilters = () => {
    onSearchChange('');
    onCategoryChange('all');
    onCityChange('all');
    onTagsChange([]);
    onAmenitiesChange([]);
  };

  const activeFiltersCount = [
    searchQuery,
    selectedCategory !== 'all' ? selectedCategory : null,
    selectedCity !== 'all' ? selectedCity : null,
    selectedTags.length > 0 ? 'tags' : null,
    selectedAmenities.length > 0 ? 'amenities' : null
  ].filter(Boolean).length;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Search and basic filters */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search venues by name, description, or city..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedCategory} onValueChange={onCategoryChange}>
                  <SelectTrigger className="w-40 bg-background">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border shadow-lg z-50">
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* City Filter */}
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedCity} onValueChange={onCityChange}>
                  <SelectTrigger className="w-32 bg-background">
                    <SelectValue placeholder="City" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border shadow-lg z-50">
                    <SelectItem value="all">All Cities</SelectItem>
                    {cities.map(city => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Advanced Filters Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>

              <Badge variant="outline" className="text-sm">
                {totalResults} results
              </Badge>
            </div>
          </div>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Advanced Filters</h4>
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  Clear All
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tags Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Tags
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedTags.length === 0 
                          ? "Select tags..." 
                          : `${selectedTags.length} selected`}
                        <Filter className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 bg-background border border-border">
                      <Command>
                        <CommandInput placeholder="Search tags..." />
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {tags.map((tag) => (
                            <CommandItem
                              key={tag}
                              onSelect={() => {
                                const newTags = selectedTags.includes(tag)
                                  ? selectedTags.filter(t => t !== tag)
                                  : [...selectedTags, tag];
                                onTagsChange(newTags);
                              }}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                checked={selectedTags.includes(tag)}
                                onChange={() => {}}
                              />
                              <span>{tag}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Amenities Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Grid3X3 className="h-4 w-4" />
                    Amenities
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-between">
                        {selectedAmenities.length === 0 
                          ? "Select amenities..." 
                          : `${selectedAmenities.length} selected`}
                        <Filter className="ml-2 h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0 bg-background border border-border">
                      <Command>
                        <CommandInput placeholder="Search amenities..." />
                        <CommandEmpty>No amenities found.</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          {amenities.map((amenity) => (
                            <CommandItem
                              key={amenity}
                              onSelect={() => {
                                const newAmenities = selectedAmenities.includes(amenity)
                                  ? selectedAmenities.filter(a => a !== amenity)
                                  : [...selectedAmenities, amenity];
                                onAmenitiesChange(newAmenities);
                              }}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                checked={selectedAmenities.includes(amenity)}
                                onChange={() => {}}
                              />
                              <span>{amenity}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Active Filters Display */}
              {(selectedTags.length > 0 || selectedAmenities.length > 0) && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Active Filters:</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map(tag => (
                      <Badge key={`tag-${tag}`} variant="secondary" className="flex items-center gap-1">
                        {tag}
                        <X 
                          className="h-3 w-3 cursor-pointer hover:text-destructive" 
                          onClick={() => onTagsChange(selectedTags.filter(t => t !== tag))}
                        />
                      </Badge>
                    ))}
                    {selectedAmenities.map(amenity => (
                      <Badge key={`amenity-${amenity}`} variant="secondary" className="flex items-center gap-1">
                        {amenity}
                        <X 
                          className="h-3 w-3 cursor-pointer hover:text-destructive" 
                          onClick={() => onAmenitiesChange(selectedAmenities.filter(a => a !== amenity))}
                        />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}