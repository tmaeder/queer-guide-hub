import React, { useEffect, useRef, useState } from 'react';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useIsMobile } from '@/hooks/use-mobile';
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
import { MapQuickFilters } from './MapQuickFilters';
import { TimePopover } from './FilterPopovers';
import { MapFiltersPanel } from './MapFiltersPanel';
import {
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
  /** Saved (favorites) quick-toggle — only rendered when the viewer can save. */
  canSave?: boolean;
  savedOnly?: boolean;
  onToggleSaved?: () => void;
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
  canSave,
  savedOnly,
  onToggleSaved,
  className,
}: CommandBarProps) => {
  const navigate = useLocalizedNavigate();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState(filters.search ?? '');
  // Search starts collapsed to a single icon so it doesn't duplicate the global
  // header search; it expands on click or whenever a search filter is active.
  const [searchOpen, setSearchOpen] = useState(!!filters.search);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { suggestions, loading } = useSearchSuggestions(query);

  // Keep the input mirrored to the active search filter. When the search
  // chip is removed elsewhere, filters.search clears and the input empties
  // with it. Typing doesn't touch filters.search until the user applies, so
  // this never fights live keystrokes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way mirror of external search filter into local input + expanded state; never fights keystrokes.
    setQuery(filters.search ?? '');
    if (filters.search) setSearchOpen(true);
  }, [filters.search]);

  // Primary action: narrow what's on the map to the typed term. Secondary
  // action (handleSelect) still jumps to a specific entity's detail page.
  const applySearchFilter = (q: string) => {
    const term = q.trim();
    onFiltersChange({ ...filters, search: term || undefined });
    setPopoverOpen(false);
    inputRef.current?.blur();
  };

  const handleSelect = (item: SearchSuggestion) => {
    const builder = TYPE_PATH[item.type];
    const slug = (item as unknown as { slug?: string }).slug ?? item.id;
    if (builder && slug) {
      setPopoverOpen(false);
      navigate(builder(slug));
    }
  };

  // Enter filters the map (the expected behaviour), rather than teleporting
  // to the first suggestion.
  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim().length >= 2) {
      e.preventDefault();
      applySearchFilter(query);
    }
  };

  const toggleLayer = (l: LayerType) => {
    hapticTrigger('nudge');
    const next = enabledLayers.includes(l)
      ? enabledLayers.filter((x) => x !== l)
      : [...enabledLayers, l];
    onLayersChange(next);
  };

  // The Filters popover hosts the data-backed panel (category, tags,
  // near-me). Time keeps its dedicated inline date-range popover.
  const hasPanelFilters = availableFilters.some((k) =>
    (['category', 'tags', 'near-me'] as MapFilterKey[]).includes(k),
  );

  const activeFilterCount =
    (filters.category ? 1 : 0) + (filters.tags?.length ?? 0) + (filters.nearMe ? 1 : 0);

  return (
    <div
      data-testid="map-command-bar"
      className={cn(
        // Content-width pill anchored top-left — NOT full-width, so wide screens
        // don't get a huge empty gap between the left controls and the right.
        // Caps at the viewport and scrolls horizontally if it ever overflows.
        'absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-element border border-border bg-background h-11 px-2 max-w-[calc(100%-1.5rem)] overflow-x-auto',
        className,
      )}
    >
      {/* Search — collapsed to an icon by default (no duplicate of the global
          header search); expands inline on click or when a filter is active. */}
      {!searchOpen ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Search this map"
          title="Search this map"
          onClick={() => {
            setSearchOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="h-8 w-8 p-0 border border-border"
        >
          <Search size={14} aria-hidden="true" />
        </Button>
      ) : (
      <Popover
        open={popoverOpen && (loading || suggestions.length > 0 || query.length >= 2)}
        onOpenChange={setPopoverOpen}
      >
        <PopoverTrigger asChild>
          <div
            className="relative w-56 shrink-0"
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
              className="pl-8 pr-8 h-7 text-sm border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
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
                  if (filters.search) onFiltersChange({ ...filters, search: undefined });
                  setPopoverOpen(false);
                  setSearchOpen(false);
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
              {!loading && query.length < 2 && (
                <CommandEmpty>Type at least 2 characters</CommandEmpty>
              )}
              {query.trim().length >= 2 && (
                <CommandGroup>
                  <CommandItem
                    value="__filter-map__"
                    onSelect={() => applySearchFilter(query)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Search size={14} aria-hidden="true" />
                    <span className="flex-1 truncate text-sm">
                      Filter map for &ldquo;{query.trim()}&rdquo;
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
              {suggestions.length > 0 && (
                <CommandGroup heading="Jump to a place">
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
              {!loading && suggestions.length === 0 && query.trim().length >= 2 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  No places match — Enter still filters the map.
                </p>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      )}

      {/* Quick filters sit inline next to the view controls (replaces the old
          floating chip row); the bar stays content-width so there's no gap. */}
      <MapQuickFilters
        filters={filters}
        onChange={onFiltersChange}
        showTime={availableFilters.includes('time')}
        canSave={canSave}
        savedOnly={savedOnly}
        onToggleSaved={onToggleSaved}
      />

      <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <div className="flex items-center gap-1 shrink-0">
        <LensPicker lenses={lenses} value={lens} onChange={onLensChange} />

      {hasPanelFilters &&
        (isMobile ? (
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
                title="Filters"
                className="relative h-8 w-8 p-0"
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-foreground text-background text-3xs font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] overflow-y-auto p-4 rounded-t-container"
            >
              <SheetHeader className="text-left">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="pt-4">
                <MapFiltersPanel
                  availableFilters={availableFilters}
                  filters={filters}
                  onFiltersChange={onFiltersChange}
                />
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
                title="Filters"
                className="relative h-8 w-8 p-0"
              >
                <SlidersHorizontal size={14} aria-hidden="true" />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-foreground text-background text-3xs font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="p-0 w-80 max-h-[70dvh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
                <span className="text-13 font-semibold text-foreground">Filters</span>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...filters };
                      delete next.category;
                      delete next.tags;
                      delete next.nearMe;
                      onFiltersChange(next);
                    }}
                    className="text-13 text-muted-foreground underline hover:text-foreground"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="overflow-y-auto p-4">
                <MapFiltersPanel
                  availableFilters={availableFilters}
                  filters={filters}
                  onFiltersChange={onFiltersChange}
                />
              </div>
            </PopoverContent>
          </Popover>
        ))}

      {availableLayers.length > 0 && (
        <Popover open={layerOpen} onOpenChange={setLayerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Layers"
              title="Layers"
              className="h-8 w-8 p-0"
            >
              <Layers size={14} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-1.5 w-56">
            <p className="px-2 pt-1 pb-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Layers
            </p>
            <div className="flex flex-col gap-0.5">
              {LAYER_DEFS.filter((d) => availableLayers.includes(d.type) && !d.comingSoon).map((d) => {
                const checked = enabledLayers.includes(d.type);
                return (
                  <label
                    key={d.type}
                    className="flex items-center gap-2 h-9 px-2 rounded-element text-sm hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleLayer(d.type)}
                      aria-label={d.label}
                    />
                    <span className="flex-1">{d.label}</span>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {availableFilters.includes('time') && (
        <TimePopover
          value={filters.dateRange}
          onChange={(v) => onFiltersChange({ ...filters, dateRange: v })}
        />
      )}

      <Popover open={moreOpen} onOpenChange={setMoreOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label="More map options"
            title="More"
            className="h-8 w-8 p-0"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="p-1.5 w-52">
          <p className="px-2 pt-1 pb-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Map options
          </p>
          <div className="flex flex-col gap-0.5">
            {onGeolocate && (
              <button
                type="button"
                onClick={() => { onGeolocate(); setMoreOpen(false); }}
                className="flex items-center gap-2.5 h-9 px-2 rounded-element text-sm hover:bg-muted text-left"
              >
                <Locate size={15} aria-hidden="true" className="text-muted-foreground" />
                <span>My location</span>
              </button>
            )}
            {onFitBounds && (
              <button
                type="button"
                onClick={() => { onFitBounds(); setMoreOpen(false); }}
                className="flex items-center gap-2.5 h-9 px-2 rounded-element text-sm hover:bg-muted text-left"
              >
                <Maximize2 size={15} aria-hidden="true" className="text-muted-foreground" />
                <span>Fit to results</span>
              </button>
            )}
            {onShare && (
              <button
                type="button"
                onClick={() => { onShare(); setMoreOpen(false); }}
                className="flex items-center gap-2.5 h-9 px-2 rounded-element text-sm hover:bg-muted text-left"
              >
                <Share2 size={15} aria-hidden="true" className="text-muted-foreground" />
                <span>Share view</span>
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      </div>
    </div>
  );
};

export default CommandBar;
