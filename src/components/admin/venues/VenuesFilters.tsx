import { Search, Filter, X, MapPin, Tag, Grid3X3 } from "lucide-react";
import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
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
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Search and basic filters */}
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2, alignItems: { lg: 'center' } }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Input
                  placeholder="Search venues by name, description, or city..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  sx={{ pl: 5 }}
                />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {/* Category Filter */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Grid3X3 style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Select value={selectedCategory} onValueChange={onCategoryChange}>
                  <SelectTrigger sx={{ width: 160, bgcolor: 'background.default' }}>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent sx={{ bgcolor: 'background.default', border: 1, borderColor: 'divider', boxShadow: 6, zIndex: 50 }}>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Box>

              {/* City Filter */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MapPin style={{ height: 16, width: 16, color: 'var(--muted-foreground)' }} />
                <Select value={selectedCity} onValueChange={onCityChange}>
                  <SelectTrigger sx={{ width: 128, bgcolor: 'background.default' }}>
                    <SelectValue placeholder="City" />
                  </SelectTrigger>
                  <SelectContent sx={{ bgcolor: 'background.default', border: 1, borderColor: 'divider', boxShadow: 6, zIndex: 50 }}>
                    <SelectItem value="all">All Cities</SelectItem>
                    {cities.map(city => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Box>

              {/* Advanced Filters Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Filter style={{ height: 16, width: 16 }} />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" sx={{ ml: 0.5, height: 20, width: 20, borderRadius: '50%', p: 0, fontSize: '0.75rem' }}>
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>

              <Badge variant="outline" sx={{ fontSize: '0.875rem' }}>
                {totalResults} results
              </Badge>
            </Box>
          </Box>

          {/* Advanced Filters */}
          {showAdvancedFilters && (
            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h4" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Advanced Filters</Typography>
                <Button variant="ghost" size="sm" onClick={clearAllFilters}>
                  Clear All
                </Button>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                {/* Tags Filter */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tag style={{ height: 16, width: 16 }} />
                    Tags
                  </Box>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" sx={{ width: '100%', justifyContent: 'space-between' }}>
                        {selectedTags.length === 0
                          ? "Select tags..."
                          : `${selectedTags.length} selected`}
                        <Filter style={{ marginLeft: 8, height: 16, width: 16 }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent sx={{ width: 320, p: 0, bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
                      <Command>
                        <CommandInput placeholder="Search tags..." />
                        <CommandEmpty>No tags found.</CommandEmpty>
                        <CommandGroup sx={{ maxHeight: 256, overflow: 'auto' }}>
                          {tags.map((tag) => (
                            <CommandItem
                              key={tag}
                              onSelect={() => {
                                const newTags = selectedTags.includes(tag)
                                  ? selectedTags.filter(t => t !== tag)
                                  : [...selectedTags, tag];
                                onTagsChange(newTags);
                              }}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
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
                </Box>

                {/* Amenities Filter */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box component="label" sx={{ fontSize: '0.875rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Grid3X3 style={{ height: 16, width: 16 }} />
                    Amenities
                  </Box>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" sx={{ width: '100%', justifyContent: 'space-between' }}>
                        {selectedAmenities.length === 0
                          ? "Select amenities..."
                          : `${selectedAmenities.length} selected`}
                        <Filter style={{ marginLeft: 8, height: 16, width: 16 }} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent sx={{ width: 320, p: 0, bgcolor: 'background.default', border: 1, borderColor: 'divider' }}>
                      <Command>
                        <CommandInput placeholder="Search amenities..." />
                        <CommandEmpty>No amenities found.</CommandEmpty>
                        <CommandGroup sx={{ maxHeight: 256, overflow: 'auto' }}>
                          {amenities.map((amenity) => (
                            <CommandItem
                              key={amenity}
                              onSelect={() => {
                                const newAmenities = selectedAmenities.includes(amenity)
                                  ? selectedAmenities.filter(a => a !== amenity)
                                  : [...selectedAmenities, amenity];
                                onAmenitiesChange(newAmenities);
                              }}
                              sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
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
                </Box>
              </Box>

              {/* Active Filters Display */}
              {(selectedTags.length > 0 || selectedAmenities.length > 0) && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Box component="label" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>Active Filters:</Box>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                    {selectedTags.map(tag => (
                      <Badge key={`tag-${tag}`} variant="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {tag}
                        <X
                          style={{ height: 12, width: 12, cursor: 'pointer' }}
                          onClick={() => onTagsChange(selectedTags.filter(t => t !== tag))}
                        />
                      </Badge>
                    ))}
                    {selectedAmenities.map(amenity => (
                      <Badge key={`amenity-${amenity}`} variant="secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {amenity}
                        <X
                          style={{ height: 12, width: 12, cursor: 'pointer' }}
                          onClick={() => onAmenitiesChange(selectedAmenities.filter(a => a !== amenity))}
                        />
                      </Badge>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}