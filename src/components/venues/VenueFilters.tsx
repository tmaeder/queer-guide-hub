import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, X, Check, ChevronDown, Navigation, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnifiedTags } from '@/hooks/useUnifiedTags';

interface VenueFiltersProps {
  onFiltersChange: (filters: {
    search?: string;
    city?: string;
    category?: string;
    tags?: string[];
    amenities?: string[];
    services?: string[];
    userLocation?: { latitude: number; longitude: number };
    nearMe?: boolean;
  }) => void;
}

const categories = [
  'bar',
  'restaurant', 
  'cafe',
  'club',
  'hotel',
  'bookstore',
  'gym',
  'salon',
  'healthcare'
];


const commonAmenities = [
  'wifi',
  'parking',
  'wheelchair-accessible',
  'outdoor-seating',
  'pet-friendly',
  'live-music',
  'happy-hour',
  'food-service',
  'full-bar',
  'cocktails',
  'beer-garden',
  'private-rooms',
  'dance-floor',
  'pool-table',
  'trivia-nights'
];

const commonServices = [
  'event-hosting',
  'private-parties',
  'catering',
  'drag-shows',
  'karaoke-nights',
  'live-entertainment',
  'dj-services',
  'theme-nights',
  'workshops',
  'community-events',
  'support-groups',
  'dating-events',
  'trivia-hosting',
  'comedy-shows',
  'art-exhibitions'
];

export function VenueFilters({ onFiltersChange }: VenueFiltersProps) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  
  // Use unified tags from the tag wiki
  const { tags: unifiedTags, loading: tagsLoading, fetchTags } = useUnifiedTags();

  useEffect(() => {
    // Fetch the main tags for venues/organizations
    fetchTags();
  }, []);

  const handleSearch = () => {
    onFiltersChange({
      search: search || undefined,
      city: city || undefined,
      category: category === 'all' ? undefined : category || undefined,
      tags: selectedTags.length > 0 ? selectedTags : undefined,
      amenities: selectedAmenities.length > 0 ? selectedAmenities : undefined,
      services: selectedServices.length > 0 ? selectedServices : undefined,
      userLocation: userLocation || undefined,
      nearMe: nearMe || undefined,
    });
  };

  const detectLocation = async () => {
    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser');
      return;
    }

    setIsDetectingLocation(true);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        });
      });

      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
      setNearMe(true);
      
      // Automatically apply the near me filter
      onFiltersChange({
        search: search || undefined,
        city: city || undefined,
        category: category === 'all' ? undefined : category || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        amenities: selectedAmenities.length > 0 ? selectedAmenities : undefined,
        services: selectedServices.length > 0 ? selectedServices : undefined,
        userLocation: { latitude, longitude },
        nearMe: true,
      });
    } catch (error) {
      console.error('Error detecting location:', error);
      setNearMe(false);
      setUserLocation(null);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleNearMeToggle = () => {
    if (nearMe) {
      // Turn off near me filter
      setNearMe(false);
      setUserLocation(null);
      onFiltersChange({
        search: search || undefined,
        city: city || undefined,
        category: category === 'all' ? undefined : category || undefined,
        tags: selectedTags.length > 0 ? selectedTags : undefined,
        amenities: selectedAmenities.length > 0 ? selectedAmenities : undefined,
        services: selectedServices.length > 0 ? selectedServices : undefined,
        nearMe: false,
        userLocation: undefined,
      });
    } else {
      // Detect location and turn on near me filter
      detectLocation();
    }
  };

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
  };

  const handleAmenityToggle = (amenity: string) => {
    const newAmenities = selectedAmenities.includes(amenity)
      ? selectedAmenities.filter(a => a !== amenity)
      : [...selectedAmenities, amenity];
    setSelectedAmenities(newAmenities);
  };

  const handleServiceToggle = (service: string) => {
    const newServices = selectedServices.includes(service)
      ? selectedServices.filter(s => s !== service)
      : [...selectedServices, service];
    setSelectedServices(newServices);
  };

  const clearFilters = () => {
    setSearch('');
    setCity('');
    setCategory('');
    setSelectedTags([]);
    setSelectedAmenities([]);
    setSelectedServices([]);
    setNearMe(false);
    setUserLocation(null);
    onFiltersChange({});
  };

  const hasActiveFilters = search || city || (category && category !== 'all') || selectedTags.length > 0 || selectedAmenities.length > 0 || selectedServices.length > 0 || nearMe;

  return (
    <div className="space-y-4 p-4 bg-card rounded-lg border">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Button
          variant={nearMe ? "default" : "outline"}
          onClick={handleNearMeToggle}
          disabled={isDetectingLocation}
          className="gap-2"
        >
          {isDetectingLocation ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          Near Me
        </Button>
        <Button onClick={handleSearch} className="bg-primary">
          Search
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowAllFilters(!showAllFilters)}
          className="gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Extended Filters */}
      {showAllFilters && (
        <div className="space-y-4 pt-4 border-t">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="Enter city..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={tagsOpen}
                  className="w-full justify-between"
                >
                  {selectedTags.length > 0
                    ? `${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''} selected`
                    : "Select tags..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search tags..." />
                  <CommandList>
                    <CommandEmpty>No tags found.</CommandEmpty>
                    <CommandGroup>
                      {tagsLoading ? (
                        <div className="flex items-center justify-center p-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : (
                        unifiedTags.map((tag) => (
                          <CommandItem
                            key={tag.id}
                            value={tag.name}
                            onSelect={() => handleTagToggle(tag.name)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedTags.includes(tag.name) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex items-center gap-2">
                              {tag.color && (
                                <div 
                                  className="w-3 h-3 rounded-full border"
                                  style={{ backgroundColor: tag.color }}
                                />
                              )}
                              {tag.name}
                            </div>
                          </CommandItem>
                        ))
                      )}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleTagToggle(tag)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Amenities */}
          <div className="space-y-2">
            <Label>Amenities</Label>
            <Popover open={amenitiesOpen} onOpenChange={setAmenitiesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={amenitiesOpen}
                  className="w-full justify-between"
                >
                  {selectedAmenities.length > 0
                    ? `${selectedAmenities.length} amenity${selectedAmenities.length !== 1 ? 'ies' : ''} selected`
                    : "Select amenities..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search amenities..." />
                  <CommandList>
                    <CommandEmpty>No amenities found.</CommandEmpty>
                    <CommandGroup>
                      {commonAmenities.map((amenity) => (
                        <CommandItem
                          key={amenity}
                          value={amenity}
                          onSelect={() => handleAmenityToggle(amenity)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedAmenities.includes(amenity) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {amenity}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedAmenities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedAmenities.map((amenity) => (
                  <Badge key={amenity} variant="secondary" className="gap-1">
                    {amenity}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleAmenityToggle(amenity)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Services */}
          <div className="space-y-2">
            <Label>Services</Label>
            <Popover open={servicesOpen} onOpenChange={setServicesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={servicesOpen}
                  className="w-full justify-between"
                >
                  {selectedServices.length > 0
                    ? `${selectedServices.length} service${selectedServices.length !== 1 ? 's' : ''} selected`
                    : "Select services..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search services..." />
                  <CommandList>
                    <CommandEmpty>No services found.</CommandEmpty>
                    <CommandGroup>
                      {commonServices.map((service) => (
                        <CommandItem
                          key={service}
                          value={service}
                          onSelect={() => handleServiceToggle(service)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedServices.includes(service) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {service}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedServices.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedServices.map((service) => (
                  <Badge key={service} variant="secondary" className="gap-1">
                    {service}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => handleServiceToggle(service)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSearch} className="bg-primary">
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters} className="gap-2">
                <X className="h-4 w-4" />
                Clear All
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && !showAllFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {search && (
            <Badge variant="secondary" className="gap-1">
              Search: {search}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setSearch('')} />
            </Badge>
          )}
          {city && (
            <Badge variant="secondary" className="gap-1">
              City: {city}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setCity('')} />
            </Badge>
          )}
          {category && category !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              {category}
              <X className="h-3 w-3 cursor-pointer" onClick={() => setCategory('')} />
            </Badge>
          )}
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleTagToggle(tag)}
              />
            </Badge>
          ))}
          {selectedAmenities.map((amenity) => (
            <Badge key={amenity} variant="secondary" className="gap-1">
              {amenity}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleAmenityToggle(amenity)}
              />
            </Badge>
          ))}
          {selectedServices.map((service) => (
            <Badge key={service} variant="secondary" className="gap-1">
              {service}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => handleServiceToggle(service)}
              />
            </Badge>
          ))}
          {nearMe && (
            <Badge variant="secondary" className="gap-1">
              Near Me
              <X className="h-3 w-3 cursor-pointer" onClick={handleNearMeToggle} />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}