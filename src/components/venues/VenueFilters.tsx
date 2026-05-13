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

interface VenueFiltersProps {
  /** Seed initial search input. Used for URL hydration on mount. */
  initialSearch?: string;
  /** Seed initial category chip selection. */
  initialCategory?: string;
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
  'club',
  'hotel',
  'sauna',
  'community_center',
  'theater',
  'gallery',
  'gym',
  'salon',
  'organization',
  'event-venue',
  'other',
] as const;

const categoryLabels: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  club: 'Club',
  hotel: 'Hotel',
  sauna: 'Sauna',
  community_center: 'Community',
  theater: 'Theater',
  gallery: 'Gallery',
  gym: 'Gym',
  salon: 'Salon',
  organization: 'Organization',
  'event-venue': 'Event Venue',
  other: 'Other',
};

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

export function VenueFilters({
  initialSearch = '',
  initialCategory = '',
  onFiltersChange,
}: VenueFiltersProps) {
  const [search, setSearch] = useState(initialSearch);
  const [city, setCity] = useState('');
  const [category, setCategory] = useState(initialCategory);
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
    clearTimeout(searchDebounceRef.current);
    onFiltersChange(buildFilters());
  };

  // Debounced search-as-you-type (250ms after last keystroke).
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchInput = (value: string) => {
    setSearch(value);
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      onFiltersChange(buildFilters({ search: value }));
    }, 250);
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
    <div className="flex flex-col gap-4 w-full min-w-0 overflow-hidden">
      {/* Search Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            style={{
              position: 'absolute',
              left: 14,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              color: 'hsl(var(--muted-foreground))',
            }}
          />
          <Input
            placeholder="Search venues & organizations..."
            value={search}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-11 h-11 rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={nearMe ? 'default' : 'outline'}
            onClick={handleNearMeToggle}
            disabled={isDetectingLocation}
            size="icon"
            className="h-11 w-11 rounded-xl"
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
            size="icon"
            className="h-11 w-11 rounded-xl"
            aria-label="Search"
          >
            <Search style={{ width: 16, height: 16 }} />
          </Button>
          <Button
            variant={showAdvanced ? 'default' : 'outline'}
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-11 rounded-xl gap-2"
            aria-label="Toggle filters"
          >
            <Filter style={{ width: 16, height: 16 }} />
            {activeFilterCount > 0 && (
              <span
                className="rounded-full inline-flex items-center justify-center font-semibold"
                style={{
                  backgroundColor: showAdvanced ? 'hsl(var(--primary-foreground))' : 'hsl(var(--primary))',
                  color: showAdvanced ? 'hsl(var(--primary))' : 'hsl(var(--primary-foreground))',
                  minWidth: 20,
                  height: 20,
                  fontSize: '0.7rem',
                  padding: '0 6px',
                }}
              >
                {activeFilterCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Category Chips */}
      <div className="flex gap-1.5 flex-wrap max-w-full">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={category === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleCategoryClick(cat)}
            className="rounded-full h-8 px-3.5 text-xs font-medium transition-all"
          >
            {categoryLabels[cat] ?? cat}
          </Button>
        ))}
      </div>

      {/* Active Filter Chips */}
      {hasActiveFilters && !showAdvanced && (
        <div className="flex flex-wrap gap-1.5 items-center pt-1 px-1">
          {search && (
            <Badge variant="secondary">
              &ldquo;{search}&rdquo;
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => { setSearch(''); autoApply({ search: '' }); }} />
            </Badge>
          )}
          {city && (
            <Badge variant="secondary">
              {city}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => { setCity(''); autoApply({ city: '' }); }} />
            </Badge>
          )}
          {selectedTags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleTagToggle(tag)} />
            </Badge>
          ))}
          {selectedAmenities.map((a) => (
            <Badge key={a} variant="secondary">
              {a}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleAmenityToggle(a)} />
            </Badge>
          ))}
          {selectedServices.map((s) => (
            <Badge key={s} variant="secondary">
              {s}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleServiceToggle(s)} />
            </Badge>
          ))}
          {selectedAccessibilityAttributes.map((a) => (
            <Badge key={a} variant="secondary">
              {a}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleAccessibilityToggle(a)} />
            </Badge>
          ))}
          {selectedTargetGroups.map((g) => (
            <Badge key={g} variant="secondary">
              {g}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => handleTargetGroupToggle(g)} />
            </Badge>
          ))}
          {nearMe && (
            <Badge variant="secondary">
              Near Me
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={handleNearMeToggle} />
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      )}

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <nav
          aria-label="Venue filters"
          className="flex flex-col gap-6 pt-5 mt-1 border-t border-border"
        >
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
              Refine
            </span>
          </div>

          {/* City input */}
          <div className="max-w-[400px] flex flex-col gap-1.5">
            <Label htmlFor="city" className="text-[11px] uppercase tracking-wider text-muted-foreground">City</Label>
            <Input
              id="city"
              placeholder="Enter city..."
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="h-11 rounded-xl"
            />
          </div>

          {/* Filter dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Tags */}
            <FilterDropdown
              label="Tags"
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
          </div>

          {/* Clear button */}
          {hasActiveFilters && (
            <div className="flex gap-3">
              <Button variant="outline" onClick={clearFilters} size="sm">
                <X style={{ width: 14, height: 14 }} />
                Clear All
              </Button>
            </div>
          )}
        </nav>
      )}
    </div>
  );
}

// Extracted filter dropdown component to reduce repetition
function FilterDropdown({
  label,
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
    <div className="flex flex-col gap-2">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground" aria-hidden="true" />
          {label}
          {selected.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-foreground text-background text-[10px] font-semibold normal-case tracking-normal">
              {selected.length}
            </span>
          )}
        </div>
      </Label>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-11 w-full justify-between rounded-xl font-normal"
          >
            <span className="truncate text-sm">
              {selected.length > 0
                ? `${selected.length} selected`
                : placeholder}
            </span>
            <ChevronDown
              style={{ marginLeft: 8, width: 14, height: 14, flexShrink: 0, opacity: 0.5 }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="rounded-xl border-border shadow-lg p-0">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {loading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 style={{ width: 16, height: 16 }} />
                  </div>
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
                      <div className="flex items-center gap-2">
                        {item.color && (
                          <div
                            className="rounded-full border border-border"
                            style={{ width: 10, height: 10, backgroundColor: item.color }}
                          />
                        )}
                        {item.label}
                      </div>
                    </CommandItem>
                  ))
                )}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((val) => (
            <Badge key={val} variant="secondary">
              {val}
              <X style={xStyle} role="button" aria-label="Remove filter" onClick={() => onToggle(val)} />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
