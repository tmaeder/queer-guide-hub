import React, { useRef, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Layers,
  MoreHorizontal,
  X,
  Loader2,
  Locate,
  Maximize2,
  Share2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useLocalizedNavigate } from '@/hooks/useLocalizedNavigate';
import {
  useSearchSuggestions,
  type SearchSuggestion,
} from '@/hooks/useSearchSuggestions';
import { hapticTrigger } from '@/hooks/useHaptics';
import { cn } from '@/lib/utils';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LAYER_DEFS } from './ExploreMapLayers';
import { LensPicker } from './LensPicker';
import {
  FILTER_LABELS,
  type MapFilterKey,
  type MapLens,
  type MapShellFilters,
} from './MapShell.types';

const TYPE_PATH: Record<string, (slug: string) => string> = {
  venue: (slug) => `/venues/${slug}`,
  event: (slug) => `/events/${slug}`,
  city: (slug) => `/city/${slug}`,
  country: (slug) => `/country/${slug}`,
  marketplace: (slug) => `/marketplace/${slug}`,
  personality: (slug) => `/personality/${slug}`,
  queer_village: (slug) => `/villages/${slug}`,
  group: (slug) => `/groups/${slug}`,
  news: (slug) => `/news/${slug}`,
  tag: (slug) => `/tags/${slug}`,
  user: (slug) => `/profile/${slug}`,
};

const TYPE_LABEL: Record<string, string> = {
  venue: 'Venue',
  event: 'Event',
  city: 'City',
  country: 'Country',
  marketplace: 'Listing',
  personality: 'Person',
  queer_village: 'Village',
  group: 'Group',
  news: 'News',
  tag: 'Tag',
  user: 'User',
};

interface CommandBarProps {
  lenses: MapLens[];
  lens: MapLens;
  onLensChange: (lens: MapLens) => void;
  availableLayers: LayerType[];
  enabledLayers: LayerType[];
  onLayersChange: (layers: LayerType[]) => void;
  availableFilters: MapFilterKey[];
  filters: MapShellFilters;
  onFiltersChange: (filters: MapShellFilters) => void;
  onGeolocate?: () => void;
  onFitBounds?: () => void;
  onShare?: () => void;
  className?: string;
}

/**
 * Single command bar pinned to the top of the map. Holds search, lens
 * picker, filter and layer popovers, and a More menu. Below the bar, any
 * surface that renders <FilterChips> shows active chips.
 */
export const CommandBar = ({
  lenses,
  lens,
  onLensChange,
  availableLayers,
  enabledLayers,
  onLayersChange,
  availableFilters,
  filters,
  onFiltersChange,
  onGeolocate,
  onFitBounds,
  onShare,
  className,
}: CommandBarProps) => {
  const navigate = useLocalizedNavigate();
  const [query, setQuery] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { suggestions, loading } = useSearchSuggestions(query);

  const handleSelect = (item: SearchSuggestion) => {
    const builder = TYPE_PATH[item.type];
    const slug = (item as unknown as { slug?: string }).slug ?? item.id;
    if (builder && slug) {
      setPopoverOpen(false);
      setQuery('');
      navigate(builder(slug));
    }
  };

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && suggestions.length > 0) {
      e.preventDefault();
      handleSelect(suggestions[0]);
    }
  };

  const toggleLayer = (l: LayerType) => {
    hapticTrigger('nudge');
    const next = enabledLayers.includes(l)
      ? enabledLayers.filter((x) => x !== l)
      : [...enabledLayers, l];
    onLayersChange(next);
  };

  const toggleFilter = (key: MapFilterKey) => {
    hapticTrigger('nudge');
    const next: MapShellFilters = { ...filters };
    switch (key) {
      case 'category':
        if (next.category) delete next.category;
        else next.category = '';
        break;
      case 'tags':
        if (next.tags?.length) delete next.tags;
        else next.tags = [];
        break;
      case 'near-me':
        if (next.nearMe) {
          delete next.nearMe;
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            onFiltersChange({
              ...filters,
              nearMe: { lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: 10 },
            });
          });
          setFilterOpen(false);
          return;
        }
        break;
      case 'time':
        if (next.dateRange) delete next.dateRange;
        else {
          const today = new Date().toISOString().slice(0, 10);
          const inAYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
          next.dateRange = { start: today, end: inAYear };
        }
        break;
      case 'accessibility':
        if (next.accessible) delete next.accessible;
        else next.accessible = true;
        break;
      case 'queer-owned':
        if (next.queerOwned) delete next.queerOwned;
        else next.queerOwned = true;
        break;
      case 'era':
        if (next.era) delete next.era;
        else next.era = { decadeStart: 1950, decadeEnd: 2020 };
        break;
      default:
        break;
    }
    onFiltersChange(next);
    setFilterOpen(false);
  };

  const isFilterActive = (key: MapFilterKey): boolean => {
    switch (key) {
      case 'category': return !!filters.category;
      case 'tags': return !!filters.tags?.length;
      case 'near-me': return !!filters.nearMe;
      case 'time': return !!filters.dateRange;
      case 'accessibility': return !!filters.accessible;
      case 'queer-owned': return !!filters.queerOwned;
      case 'era': return !!filters.era;
      default: return false;
    }
  };

  return (
    <div
      data-testid="map-command-bar"
      className={cn(
        'absolute top-3 left-3 right-3 z-20 flex items-center gap-2 border border-border bg-background h-10 px-2',
        className,
      )}
    >
      {/* Search */}
      <Popover
        open={popoverOpen && (loading || suggestions.length > 0 || query.length >= 2)}
        onOpenChange={setPopoverOpen}
      >
        <PopoverTrigger asChild>
          <div
            className="relative flex-1 min-w-0"
            role="combobox"
            aria-expanded={popoverOpen}
            aria-controls="map-shell-listbox"
          >
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={inputRef}
              placeholder="Search this map"
              aria-label="Search this map"
              aria-autocomplete="list"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPopoverOpen(true);
              }}
              onFocus={() => setPopoverOpen(true)}
              onKeyDown={handleEnter}
              className="pl-7 pr-7 h-7 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {loading && (
              <Loader2
                size={12}
                className="absolute right-7 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-label="Searching"
              />
            )}
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  setPopoverOpen(false);
                  inputRef.current?.focus();
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent
          id="map-shell-listbox"
          align="start"
          className="p-0 w-[--radix-popover-trigger-width] border-border"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              {!loading && suggestions.length === 0 && query.length >= 2 && (
                <CommandEmpty>No results</CommandEmpty>
              )}
              {!loading && query.length < 2 && (
                <CommandEmpty>Type at least 2 characters</CommandEmpty>
              )}
              {suggestions.length > 0 && (
                <CommandGroup>
                  {suggestions.map((s) => (
                    <CommandItem
                      key={`${s.type}-${s.id}`}
                      value={`${s.type}-${s.id}`}
                      onSelect={() => handleSelect(s)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <span className="flex-1 truncate text-sm">{s.name}</span>
                      <Badge variant="outline" className="text-xs h-5 px-2">
                        {TYPE_LABEL[s.type] ?? s.type}
                      </Badge>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="h-6 w-px bg-border" aria-hidden="true" />

      <LensPicker lenses={lenses} value={lens} onChange={onLensChange} />

      {availableFilters.length > 0 && (
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Filters"
              className="h-8 w-8 p-0 border border-border"
            >
              <SlidersHorizontal size={14} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-2 w-56 border-border">
            <div className="flex flex-col gap-1">
              {availableFilters.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={isFilterActive(k)}
                  onClick={() => toggleFilter(k)}
                  className={cn(
                    'inline-flex items-center justify-between h-8 px-2 text-sm border border-transparent hover:bg-muted text-left',
                    isFilterActive(k) && 'border-border bg-muted',
                  )}
                >
                  <span>{FILTER_LABELS[k]}</span>
                  {isFilterActive(k) && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {availableLayers.length > 0 && (
        <Popover open={layerOpen} onOpenChange={setLayerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Layers"
              className="h-8 w-8 p-0 border border-border"
            >
              <Layers size={14} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-2 w-56 border-border">
            <div className="flex flex-col gap-1">
              {LAYER_DEFS.filter((d) => availableLayers.includes(d.type) && !d.comingSoon).map((d) => {
                const checked = enabledLayers.includes(d.type);
                return (
                  <label
                    key={d.type}
                    className="inline-flex items-center gap-2 h-8 px-2 text-sm hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleLayer(d.type)}
                      aria-label={d.label}
                    />
                    <span>{d.label}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="More map options"
            className="h-8 w-8 p-0 border border-border"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-1 w-48 border-border">
          <div className="flex flex-col">
            {onGeolocate && (
              <button
                type="button"
                onClick={() => { onGeolocate(); setMoreOpen(false); }}
                className="inline-flex items-center gap-2 h-8 px-2 text-sm hover:bg-muted text-left"
              >
                <Locate size={14} aria-hidden="true" />
                <span>My location</span>
              </button>
            )}
            {onFitBounds && (
              <button
                type="button"
                onClick={() => { onFitBounds(); setMoreOpen(false); }}
                className="inline-flex items-center gap-2 h-8 px-2 text-sm hover:bg-muted text-left"
              >
                <Maximize2 size={14} aria-hidden="true" />
                <span>Fit to results</span>
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={() => { onShare(); setMoreOpen(false); }}
                className="inline-flex items-center gap-2 h-8 px-2 text-sm hover:bg-muted text-left"
              >
                <Share2 size={14} aria-hidden="true" />
                <span>Share view</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default CommandBar;
