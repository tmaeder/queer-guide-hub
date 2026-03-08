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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { useUnifiedTags } from '@/hooks/useUnifiedTags';
import { useAccessibilityAttributes } from '@/hooks/useAccessibilityAttributes';
import { useTargetGroups } from '@/hooks/useTargetGroups';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface VenueFiltersProps {
  onFiltersChange: (filters: {
    search?: string;
    city?: string;
    category?: string;
    tags?: string[];
    amenities?: string[];
    services?: string[];
    accessibilityAttributes?: string[];
    targetGroups?: string[];
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
  'healthcare',
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
  'trivia-nights',
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
  'art-exhibitions',
];

export function VenueFilters({ onFiltersChange }: VenueFiltersProps) {
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedAccessibilityAttributes, setSelectedAccessibilityAttributes] = useState<string[]>(
    [],
  );
  const [selectedTargetGroups, setSelectedTargetGroups] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [targetGroupsOpen, setTargetGroupsOpen] = useState(false);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  // Use unified tags from the tag wiki
  const { tags: unifiedTags, loading: tagsLoading, fetchTags } = useUnifiedTags();
  const { accessibilityAttributes, loading: accessibilityLoading } = useAccessibilityAttributes();
  const { targetGroups, loading: targetGroupsLoading } = useTargetGroups();

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
      accessibilityAttributes:
        selectedAccessibilityAttributes.length > 0 ? selectedAccessibilityAttributes : undefined,
      targetGroups: selectedTargetGroups.length > 0 ? selectedTargetGroups : undefined,
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
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
  };

  const handleAmenityToggle = (amenity: string) => {
    const newAmenities = selectedAmenities.includes(amenity)
      ? selectedAmenities.filter((a) => a !== amenity)
      : [...selectedAmenities, amenity];
    setSelectedAmenities(newAmenities);
  };

  const handleServiceToggle = (service: string) => {
    const newServices = selectedServices.includes(service)
      ? selectedServices.filter((s) => s !== service)
      : [...selectedServices, service];
    setSelectedServices(newServices);
  };

  const handleAccessibilityToggle = (attr: string) => {
    const newAttributes = selectedAccessibilityAttributes.includes(attr)
      ? selectedAccessibilityAttributes.filter((a) => a !== attr)
      : [...selectedAccessibilityAttributes, attr];
    setSelectedAccessibilityAttributes(newAttributes);
  };

  const handleTargetGroupToggle = (group: string) => {
    const newGroups = selectedTargetGroups.includes(group)
      ? selectedTargetGroups.filter((g) => g !== group)
      : [...selectedTargetGroups, group];
    setSelectedTargetGroups(newGroups);
  };

  const clearFilters = () => {
    setSearch('');
    setCity('');
    setCategory('');
    setSelectedTags([]);
    setSelectedAmenities([]);
    setSelectedServices([]);
    setSelectedAccessibilityAttributes([]);
    setSelectedTargetGroups([]);
    setNearMe(false);
    setUserLocation(null);
    onFiltersChange({});
  };

  const hasActiveFilters =
    search ||
    city ||
    (category && category !== 'all') ||
    selectedTags.length > 0 ||
    selectedAmenities.length > 0 ||
    selectedServices.length > 0 ||
    selectedAccessibilityAttributes.length > 0 ||
    selectedTargetGroups.length > 0 ||
    nearMe;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        p: 3,
        bgcolor: 'background.paper',
        borderRadius: 3,
        boxShadow: 1,
        width: '100%',
      }}
    >
      {/* Search Bar */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
        <Box sx={{ position: 'relative', flex: 1 }}>
          <Search
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              color: 'var(--muted-foreground)',
            }}
          />
          <Input
            placeholder="Search venues & organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ pl: 4.5, height: 44 }}
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant={nearMe ? 'default' : 'outline'}
            onClick={handleNearMeToggle}
            disabled={isDetectingLocation}
            size="icon"
            sx={{ height: 44, width: 44 }}
            aria-label="Find near me"
          >
            {isDetectingLocation ? (
              <Loader2 style={{ width: 16, height: 16 }} />
            ) : (
              <Navigation style={{ width: 16, height: 16 }} />
            )}
          </Button>
          <Button
            onClick={handleSearch}
            sx={{ bgcolor: 'primary.main', height: 44, width: 44 }}
            size="icon"
            aria-label="Search"
          >
            <Search style={{ width: 16, height: 16 }} />
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAllFilters(!showAllFilters)}
            size="icon"
            sx={{ height: 44, width: 44 }}
            aria-label="Toggle filters"
          >
            <Filter style={{ width: 16, height: 16 }} />
          </Button>
        </Box>
      </Box>

      {/* Extended Filters */}
      {showAllFilters && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            pt: 3,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="city" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                City
              </Label>
              <Input
                id="city"
                placeholder="Enter city..."
                value={city}
                onChange={(e) => setCity(e.target.value)}
                sx={{ height: 40 }}
              />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Label htmlFor="category" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Category
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger sx={{ height: 40 }}>
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
            </Box>
          </Box>

          {/* Filter Categories - Updated to 5 columns */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(5, 1fr)' },
              gap: 3,
            }}
          >
            {/* Tags */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main', borderRadius: '50%' }} />
                  Tags
                </Box>
              </Label>
              <Popover open={tagsOpen} onOpenChange={setTagsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={tagsOpen}
                    sx={{ width: '100%', justifyContent: 'space-between', height: 40 }}
                  >
                    {selectedTags.length > 0
                      ? `${selectedTags.length} tag${selectedTags.length !== 1 ? 's' : ''} selected`
                      : 'Select tags...'}
                    <ChevronDown
                      style={{ marginLeft: 8, width: 16, height: 16, flexShrink: 0, opacity: 0.5 }}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent sx={{ width: '100%', p: 0 }} align="start">
                  <Command>
                    <CommandInput placeholder="Search tags..." />
                    <CommandList>
                      <CommandEmpty>No tags found.</CommandEmpty>
                      <CommandGroup>
                        {tagsLoading ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              p: 2,
                            }}
                          >
                            <Loader2 style={{ width: 16, height: 16 }} />
                          </Box>
                        ) : (
                          unifiedTags.map((tag) => (
                            <CommandItem
                              key={tag.id}
                              value={tag.name}
                              onSelect={() => handleTagToggle(tag.name)}
                            >
                              <Check
                                style={{
                                  marginRight: 8,
                                  width: 16,
                                  height: 16,
                                  opacity: selectedTags.includes(tag.name) ? 1 : 0,
                                }}
                              />
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {tag.name}
                              </Box>
                            </CommandItem>
                          ))
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedTags.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {selectedTags.map((tag) => (
                    <Badge key={tag} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
                      {tag}
                      <X
                        style={{ width: 12, height: 12, cursor: 'pointer' }}
                        onClick={() => handleTagToggle(tag)}
                      />
                    </Badge>
                  ))}
                </Box>
              )}
            </Box>

            {/* Amenities */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, bgcolor: '#3b82f6', borderRadius: '50%' }} />
                  Amenities
                </Box>
              </Label>
              <Popover open={amenitiesOpen} onOpenChange={setAmenitiesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={amenitiesOpen}
                    sx={{ width: '100%', justifyContent: 'space-between', height: 40 }}
                  >
                    {selectedAmenities.length > 0
                      ? `${selectedAmenities.length} amenity${selectedAmenities.length !== 1 ? 'ies' : ''} selected`
                      : 'Select amenities...'}
                    <ChevronDown
                      style={{ marginLeft: 8, width: 16, height: 16, flexShrink: 0, opacity: 0.5 }}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent sx={{ width: '100%', p: 0 }} align="start">
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
                              style={{
                                marginRight: 8,
                                width: 16,
                                height: 16,
                                opacity: selectedAmenities.includes(amenity) ? 1 : 0,
                              }}
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
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {selectedAmenities.map((amenity) => (
                    <Badge key={amenity} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
                      {amenity}
                      <X
                        style={{ width: 12, height: 12, cursor: 'pointer' }}
                        onClick={() => handleAmenityToggle(amenity)}
                      />
                    </Badge>
                  ))}
                </Box>
              )}
            </Box>

            {/* Services */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, bgcolor: '#22c55e', borderRadius: '50%' }} />
                  Services
                </Box>
              </Label>
              <Popover open={servicesOpen} onOpenChange={setServicesOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={servicesOpen}
                    sx={{ width: '100%', justifyContent: 'space-between', height: 40 }}
                  >
                    {selectedServices.length > 0
                      ? `${selectedServices.length} service${selectedServices.length !== 1 ? 's' : ''} selected`
                      : 'Select services...'}
                    <ChevronDown
                      style={{ marginLeft: 8, width: 16, height: 16, flexShrink: 0, opacity: 0.5 }}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent sx={{ width: '100%', p: 0 }} align="start">
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
                              style={{
                                marginRight: 8,
                                width: 16,
                                height: 16,
                                opacity: selectedServices.includes(service) ? 1 : 0,
                              }}
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
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {selectedServices.map((service) => (
                    <Badge key={service} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
                      {service}
                      <X
                        style={{ width: 12, height: 12, cursor: 'pointer' }}
                        onClick={() => handleServiceToggle(service)}
                      />
                    </Badge>
                  ))}
                </Box>
              )}
            </Box>

            {/* Accessibility Attributes */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, bgcolor: '#555555', borderRadius: '50%' }} />
                  Accessibility
                </Box>
              </Label>
              <Popover open={accessibilityOpen} onOpenChange={setAccessibilityOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={accessibilityOpen}
                    sx={{ width: '100%', justifyContent: 'space-between', height: 40 }}
                  >
                    {selectedAccessibilityAttributes.length > 0
                      ? `${selectedAccessibilityAttributes.length} feature${selectedAccessibilityAttributes.length !== 1 ? 's' : ''} selected`
                      : 'Select accessibility...'}
                    <ChevronDown
                      style={{ marginLeft: 8, width: 16, height: 16, flexShrink: 0, opacity: 0.5 }}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent sx={{ width: '100%', p: 0 }} align="start">
                  <Command>
                    <CommandInput placeholder="Search accessibility features..." />
                    <CommandList>
                      <CommandEmpty>No accessibility features found.</CommandEmpty>
                      <CommandGroup>
                        {accessibilityLoading ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              p: 2,
                            }}
                          >
                            <Loader2 style={{ width: 16, height: 16 }} />
                          </Box>
                        ) : (
                          accessibilityAttributes.map((attr) => (
                            <CommandItem
                              key={attr.id}
                              value={attr.name}
                              onSelect={() => handleAccessibilityToggle(attr.name)}
                            >
                              <Check
                                style={{
                                  marginRight: 8,
                                  width: 16,
                                  height: 16,
                                  opacity: selectedAccessibilityAttributes.includes(attr.name)
                                    ? 1
                                    : 0,
                                }}
                              />
                              {attr.name}
                            </CommandItem>
                          ))
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedAccessibilityAttributes.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {selectedAccessibilityAttributes.map((attr) => (
                    <Badge key={attr} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
                      {attr}
                      <X
                        style={{ width: 12, height: 12, cursor: 'pointer' }}
                        onClick={() => handleAccessibilityToggle(attr)}
                      />
                    </Badge>
                  ))}
                </Box>
              )}
            </Box>

            {/* Target Groups */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Label sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 8, height: 8, bgcolor: '#f97316', borderRadius: '50%' }} />
                  Target Groups
                </Box>
              </Label>
              <Popover open={targetGroupsOpen} onOpenChange={setTargetGroupsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={targetGroupsOpen}
                    sx={{ width: '100%', justifyContent: 'space-between', height: 40 }}
                  >
                    {selectedTargetGroups.length > 0
                      ? `${selectedTargetGroups.length} group${selectedTargetGroups.length !== 1 ? 's' : ''} selected`
                      : 'Select target groups...'}
                    <ChevronDown
                      style={{ marginLeft: 8, width: 16, height: 16, flexShrink: 0, opacity: 0.5 }}
                    />
                  </Button>
                </PopoverTrigger>
                <PopoverContent sx={{ width: '100%', p: 0 }} align="start">
                  <Command>
                    <CommandInput placeholder="Search target groups..." />
                    <CommandList>
                      <CommandEmpty>No target groups found.</CommandEmpty>
                      <CommandGroup>
                        {targetGroupsLoading ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              p: 2,
                            }}
                          >
                            <Loader2 style={{ width: 16, height: 16 }} />
                          </Box>
                        ) : (
                          targetGroups.map((group) => (
                            <CommandItem
                              key={group.id}
                              value={group.name}
                              onSelect={() => handleTargetGroupToggle(group.name)}
                            >
                              <Check
                                style={{
                                  marginRight: 8,
                                  width: 16,
                                  height: 16,
                                  opacity: selectedTargetGroups.includes(group.name) ? 1 : 0,
                                }}
                              />
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box
                                  sx={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    border: 1,
                                    borderColor: 'divider',
                                  }}
                                  style={{ backgroundColor: group.color }}
                                />
                                {group.name}
                              </Box>
                            </CommandItem>
                          ))
                        )}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedTargetGroups.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {selectedTargetGroups.map((group) => (
                    <Badge key={group} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
                      {group}
                      <X
                        style={{ width: 12, height: 12, cursor: 'pointer' }}
                        onClick={() => handleTargetGroupToggle(group)}
                      />
                    </Badge>
                  ))}
                </Box>
              )}
            </Box>
          </Box>

          {/* Action Buttons */}
          <Box
            sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, pt: 2 }}
          >
            <Button
              onClick={handleSearch}
              sx={{
                bgcolor: 'primary.main',
                '&:hover': { bgcolor: 'primary.dark' },
                flex: { xs: 1, sm: 'none' },
                px: { sm: 8 },
              }}
            >
              Apply Filters
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                onClick={clearFilters}
                sx={{ gap: 2, flex: { xs: 1, sm: 'none' } }}
              >
                <X style={{ width: 16, height: 16 }} />
                Clear All
              </Button>
            )}
          </Box>
        </Box>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && !showAllFilters && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 2,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
            Active filters:
          </Typography>
          {search && (
            <Badge variant="secondary" sx={{ gap: 1 }}>
              Search: {search}
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={() => setSearch('')}
              />
            </Badge>
          )}
          {city && (
            <Badge variant="secondary" sx={{ gap: 1 }}>
              City: {city}
              <X style={{ width: 12, height: 12, cursor: 'pointer' }} onClick={() => setCity('')} />
            </Badge>
          )}
          {category && category !== 'all' && (
            <Badge variant="secondary" sx={{ gap: 1 }}>
              {category}
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={() => setCategory('')}
              />
            </Badge>
          )}
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" sx={{ gap: 1 }}>
              {tag}
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={() => handleTagToggle(tag)}
              />
            </Badge>
          ))}
          {selectedAmenities.map((amenity) => (
            <Badge key={amenity} variant="secondary" sx={{ gap: 1 }}>
              {amenity}
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={() => handleAmenityToggle(amenity)}
              />
            </Badge>
          ))}
          {selectedServices.map((service) => (
            <Badge key={service} variant="secondary" sx={{ gap: 1 }}>
              {service}
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={() => handleServiceToggle(service)}
              />
            </Badge>
          ))}
          {selectedAccessibilityAttributes.map((attr) => (
            <Badge key={attr} variant="secondary" sx={{ gap: 1 }}>
              {attr}
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={() => handleAccessibilityToggle(attr)}
              />
            </Badge>
          ))}
          {selectedTargetGroups.map((group) => (
            <Badge key={group} variant="secondary" sx={{ gap: 1 }}>
              {group}
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={() => handleTargetGroupToggle(group)}
              />
            </Badge>
          ))}
          {nearMe && (
            <Badge variant="secondary" sx={{ gap: 1 }}>
              Near Me
              <X
                style={{ width: 12, height: 12, cursor: 'pointer' }}
                onClick={handleNearMeToggle}
              />
            </Badge>
          )}
        </Box>
      )}
    </Box>
  );
}
