import { useState, useEffect, useCallback, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  'sauna',
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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );

  const { tags: unifiedTags, loading: tagsLoading, fetchTags } = useUnifiedTags();
  const { accessibilityAttributes, loading: accessibilityLoading } = useAccessibilityAttributes();
  const { targetGroups, loading: targetGroupsLoading } = useTargetGroups();

  useEffect(() => {
    fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build current filters object
  const buildFilters = useCallback(
    (overrides?: Partial<{
      search: string;
      city: string;
      category: string;
      tags: string[];
      amenities: string[];
      services: string[];
      accessibilityAttributes: string[];
      targetGroups: string[];
      nearMe: boolean;
      userLocation: { latitude: number; longitude: number } | null;
    }>) => {
      const s = overrides?.search ?? search;
      const c = overrides?.city ?? city;
      const cat = overrides?.category ?? category;
      const t = overrides?.tags ?? selectedTags;
      const a = overrides?.amenities ?? selectedAmenities;
      const sv = overrides?.services ?? selectedServices;
      const acc = overrides?.accessibilityAttributes ?? selectedAccessibilityAttributes;
      const tg = overrides?.targetGroups ?? selectedTargetGroups;
      const nm = overrides?.nearMe ?? nearMe;
      const ul = overrides?.userLocation !== undefined ? overrides.userLocation : userLocation;

      return {
        search: s || undefined,
        city: c || undefined,
        category: cat === 'all' ? undefined : cat || undefined,
        tags: t.length > 0 ? t : undefined,
        amenities: a.length > 0 ? a : undefined,
        services: sv.length > 0 ? sv : undefined,
        accessibilityAttributes: acc.length > 0 ? acc : undefined,
        targetGroups: tg.length > 0 ? tg : undefined,
        userLocation: ul || undefined,
        nearMe: nm || undefined,
      };
    },
    [search, city, category, selectedTags, selectedAmenities, selectedServices, selectedAccessibilityAttributes, selectedTargetGroups, nearMe, userLocation],
  );

  // Auto-apply debounce for advanced filter changes
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const autoApply = useCallback(
    (overrides?: Parameters<typeof buildFilters>[0]) => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFiltersChange(buildFilters(overrides));
      }, 300);
    },
    [buildFilters, onFiltersChange],
  );

  const handleSearch = () => {
    clearTimeout(debounceRef.current);
    onFiltersChange(buildFilters());
  };

  const handleCategoryClick = (cat: string) => {
    const newCat = category === cat ? '' : cat;
    setCategory(newCat);
    clearTimeout(debounceRef.current);
    onFiltersChange(buildFilters({ category: newCat }));
  };

  const detectLocation = async () => {
    if (!navigator.geolocation) return;
    setIsDetectingLocation(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
      });
      const { latitude, longitude } = position.coords;
      setUserLocation({ latitude, longitude });
      setNearMe(true);
      onFiltersChange(buildFilters({ userLocation: { latitude, longitude }, nearMe: true }));
    } catch {
      setNearMe(false);
      setUserLocation(null);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const handleNearMeToggle = () => {
    if (nearMe) {
      setNearMe(false);
      setUserLocation(null);
      onFiltersChange(buildFilters({ nearMe: false, userLocation: null }));
    } else {
      detectLocation();
    }
  };

  const handleTagToggle = (tag: string) => {
    const newTags = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag];
    setSelectedTags(newTags);
    autoApply({ tags: newTags });
  };

  const handleAmenityToggle = (amenity: string) => {
    const next = selectedAmenities.includes(amenity)
      ? selectedAmenities.filter((a) => a !== amenity)
      : [...selectedAmenities, amenity];
    setSelectedAmenities(next);
    autoApply({ amenities: next });
  };

  const handleServiceToggle = (service: string) => {
    const next = selectedServices.includes(service)
      ? selectedServices.filter((s) => s !== service)
      : [...selectedServices, service];
    setSelectedServices(next);
    autoApply({ services: next });
  };

  const handleAccessibilityToggle = (attr: string) => {
    const next = selectedAccessibilityAttributes.includes(attr)
      ? selectedAccessibilityAttributes.filter((a) => a !== attr)
      : [...selectedAccessibilityAttributes, attr];
    setSelectedAccessibilityAttributes(next);
    autoApply({ accessibilityAttributes: next });
  };

  const handleTargetGroupToggle = (group: string) => {
    const next = selectedTargetGroups.includes(group)
      ? selectedTargetGroups.filter((g) => g !== group)
      : [...selectedTargetGroups, group];
    setSelectedTargetGroups(next);
    autoApply({ targetGroups: next });
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
    clearTimeout(debounceRef.current);
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

  const activeFilterCount = [
    search,
    city,
    category && category !== 'all' ? category : '',
    ...selectedTags,
    ...selectedAmenities,
    ...selectedServices,
    ...selectedAccessibilityAttributes,
    ...selectedTargetGroups,
    nearMe ? 'nearMe' : '',
  ].filter(Boolean).length;

  // Shared remove-badge X style
  const xStyle = { width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' as const };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
      {/* Search Row */}
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
            variant={showAdvanced ? 'default' : 'outline'}
            onClick={() => setShowAdvanced(!showAdvanced)}
            sx={{ height: 44, gap: 1, px: 2 }}
            aria-label="Toggle filters"
          >
            <Filter style={{ width: 16, height: 16 }} />
            {activeFilterCount > 0 && (
              <Box
                component="span"
                sx={{
                  bgcolor: showAdvanced ? 'primary.contrastText' : 'primary.main',
                  color: showAdvanced ? 'primary.main' : 'primary.contrastText',
                  borderRadius: '50%',
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                {activeFilterCount}
              </Box>
            )}
          </Button>
        </Box>
      </Box>

      {/* Category Chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={category === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleCategoryClick(cat)}
            sx={{
              height: 32,
              px: 2,
              fontSize: '0.8rem',
              fontWeight: 500,
              textTransform: 'capitalize',
              borderRadius: 9999,
            }}
          >
            {cat}
          </Button>
        ))}
      </Box>

      {/* Active Filter Chips (always visible when filters applied and advanced is closed) */}
      {hasActiveFilters && !showAdvanced && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
          {search && (
            <Badge variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              &ldquo;{search}&rdquo;
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => { setSearch(''); autoApply({ search: '' }); }} />
            </Badge>
          )}
          {city && (
            <Badge variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              {city}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => { setCity(''); autoApply({ city: '' }); }} />
            </Badge>
          )}
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              {tag}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleTagToggle(tag)} />
            </Badge>
          ))}
          {selectedAmenities.map((a) => (
            <Badge key={a} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              {a}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleAmenityToggle(a)} />
            </Badge>
          ))}
          {selectedServices.map((s) => (
            <Badge key={s} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              {s}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleServiceToggle(s)} />
            </Badge>
          ))}
          {selectedAccessibilityAttributes.map((a) => (
            <Badge key={a} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              {a}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleAccessibilityToggle(a)} />
            </Badge>
          ))}
          {selectedTargetGroups.map((g) => (
            <Badge key={g} variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              {g}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleTargetGroupToggle(g)} />
            </Badge>
          ))}
          {nearMe && (
            <Badge variant="secondary" sx={{ gap: 1, fontSize: '0.75rem' }}>
              Near Me
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={handleNearMeToggle} />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters} sx={{ height: 24, px: 1.5, fontSize: '0.75rem', color: 'text.secondary' }}>
            Clear all
          </Button>
        </Box>
      )}

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <Box
          component="nav"
          aria-label="Venue filters"
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {/* City input */}
          <Box sx={{ maxWidth: 400 }}>
            <Label htmlFor="city" sx={{ fontSize: '0.8rem', fontWeight: 500, mb: 0.5, display: 'block' }}>
              City
            </Label>
            <Input
              id="city"
              placeholder="Enter city..."
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              sx={{ height: 38 }}
            />
          </Box>

          {/* Filter dropdowns — 3 columns on desktop */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' },
              gap: 2.5,
            }}
          >
            {/* Tags */}
            <FilterDropdown
              label="Tags"
              dotColor="primary.main"
              open={tagsOpen}
              onOpenChange={setTagsOpen}
              selected={selectedTags}
              loading={tagsLoading}
              items={unifiedTags.map((t) => ({ key: t.id, label: t.name }))}
              onToggle={handleTagToggle}
              placeholder="Select tags..."
              searchPlaceholder="Search tags..."
              emptyMessage="No tags found."
            />

            {/* Amenities */}
            <FilterDropdown
              label="Amenities"
              dotColor="#3b82f6"
              open={amenitiesOpen}
              onOpenChange={setAmenitiesOpen}
              selected={selectedAmenities}
              items={commonAmenities.map((a) => ({ key: a, label: a }))}
              onToggle={handleAmenityToggle}
              placeholder="Select amenities..."
              searchPlaceholder="Search amenities..."
              emptyMessage="No amenities found."
            />

            {/* Services */}
            <FilterDropdown
              label="Services"
              dotColor="#22c55e"
              open={servicesOpen}
              onOpenChange={setServicesOpen}
              selected={selectedServices}
              items={commonServices.map((s) => ({ key: s, label: s }))}
              onToggle={handleServiceToggle}
              placeholder="Select services..."
              searchPlaceholder="Search services..."
              emptyMessage="No services found."
            />

            {/* Accessibility */}
            <FilterDropdown
              label="Accessibility"
              dotColor="#555555"
              open={accessibilityOpen}
              onOpenChange={setAccessibilityOpen}
              selected={selectedAccessibilityAttributes}
              loading={accessibilityLoading}
              items={accessibilityAttributes.map((a) => ({ key: a.id, label: a.name }))}
              onToggle={handleAccessibilityToggle}
              placeholder="Select accessibility..."
              searchPlaceholder="Search accessibility..."
              emptyMessage="No accessibility features found."
            />

            {/* Target Groups */}
            <FilterDropdown
              label="Target Groups"
              dotColor="#f97316"
              open={targetGroupsOpen}
              onOpenChange={setTargetGroupsOpen}
              selected={selectedTargetGroups}
              loading={targetGroupsLoading}
              items={targetGroups.map((g) => ({ key: g.id, label: g.name, color: g.color }))}
              onToggle={handleTargetGroupToggle}
              placeholder="Select target groups..."
              searchPlaceholder="Search target groups..."
              emptyMessage="No target groups found."
            />
          </Box>

          {/* Clear button */}
          {hasActiveFilters && (
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant="outline"
                onClick={clearFilters}
                size="sm"
                sx={{ gap: 1 }}
              >
                <X style={{ width: 14, height: 14 }} />
                Clear All
              </Button>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// Extracted filter dropdown component to reduce repetition
function FilterDropdown({
  label,
  dotColor,
  open,
  onOpenChange,
  selected,
  loading,
  items,
  onToggle,
  placeholder,
  searchPlaceholder,
  emptyMessage,
}: {
  label: string;
  dotColor: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: string[];
  loading?: boolean;
  items: { key: string; label: string; color?: string }[];
  onToggle: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
}) {
  const xStyle = { width: 12, height: 12, cursor: 'pointer', padding: 8, margin: -8, boxSizing: 'content-box' as const };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Label sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 7, height: 7, bgcolor: dotColor, borderRadius: '50%' }} />
          {label}
        </Box>
      </Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            sx={{ width: '100%', justifyContent: 'space-between', height: 38, fontSize: '0.8rem' }}
          >
            {selected.length > 0
              ? `${selected.length} selected`
              : placeholder}
            <ChevronDown
              style={{ marginLeft: 8, width: 14, height: 14, flexShrink: 0, opacity: 0.5 }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent sx={{ width: '100%', p: 0 }} align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {loading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                    <Loader2 style={{ width: 16, height: 16 }} />
                  </Box>
                ) : (
                  items.map((item) => (
                    <CommandItem
                      key={item.key}
                      value={item.label}
                      onSelect={() => onToggle(item.label)}
                    >
                      <Check
                        style={{
                          marginRight: 8,
                          width: 16,
                          height: 16,
                          opacity: selected.includes(item.label) ? 1 : 0,
                        }}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {item.color && (
                          <Box
                            sx={{ width: 10, height: 10, borderRadius: '50%', border: 1, borderColor: 'divider' }}
                            style={{ backgroundColor: item.color }}
                          />
                        )}
                        {item.label}
                      </Box>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {selected.map((val) => (
            <Badge key={val} variant="secondary" sx={{ gap: 1, fontSize: '0.7rem' }}>
              {val}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => onToggle(val)} />
            </Badge>
          ))}
        </Box>
      )}
    </Box>
  );
}
