import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Layers,
  MoreHorizontal,
  Locate,
  Maximize2,
  Share2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LensPicker } from './LensPicker';
import { MapQuickFilters } from './MapQuickFilters';
import { TimePopover } from './FilterPopovers';
import { MapFiltersPanel } from './MapFiltersPanel';
import { MapSearchField } from './chrome/MapSearchField';
import { MapLayerList } from './chrome/MapLayerList';
import {
  type MapFilterKey,
  type MapLens,
  type MapShellFilters,
} from './MapShell.types';

interface CommandBarProps {
  /** Render the search field. Default true. False keeps lens/filter/layer
   *  controls but drops the on-map search (single search lives in the top bar). */
  showSearch?: boolean;
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
 * Desktop command bar pinned to the top of the map. Holds search, quick
 * filters, the lens picker, filter and layer popovers, and a More menu.
 * Mobile uses MobileMapBar (chrome/MobileMapBar.tsx) instead — MapShell
 * decides which to mount.
 */
export const CommandBar = ({
  showSearch = true,
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
  const { t } = useTranslation();
  const [query, setQuery] = useState(filters.search ?? '');
  // Search starts collapsed to a single icon so it doesn't duplicate the global
  // header search; it expands on click or whenever a search filter is active.
  const [searchOpen, setSearchOpen] = useState(!!filters.search);
  const [filterOpen, setFilterOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the input mirrored to the active search filter. When the search
  // chip is removed elsewhere, filters.search clears and the input empties
  // with it. Typing doesn't touch filters.search until the user applies, so
  // this never fights live keystrokes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way mirror of external search filter into local input + expanded state; never fights keystrokes.
    setQuery(filters.search ?? '');
    if (filters.search) setSearchOpen(true);
  }, [filters.search]);

  // The Filters popover hosts the data-backed panel (category, tags,
  // near-me). Time keeps its dedicated inline date-range popover.
  const hasPanelFilters = availableFilters.some((k) =>
    (['category', 'tags', 'near-me'] as MapFilterKey[]).includes(k),
  );

  const activeFilterCount =
    (filters.category ? 1 : 0) + (filters.tags?.length ?? 0) + (filters.nearMe ? 1 : 0);

  const searchLabel = t('map.commandBar.searchThisMap', { defaultValue: 'Search this map' });
  const filtersLabel =
    activeFilterCount > 0
      ? t('map.commandBar.filtersActive', {
          defaultValue: 'Filters, {{count}} active',
          count: activeFilterCount,
        })
      : t('map.commandBar.filters', { defaultValue: 'Filters' });

  return (
    <div
      data-testid="map-command-bar"
      className={cn(
        // Content-width pill anchored top-left — NOT full-width, so wide screens
        // don't get a huge empty gap between the left controls and the right.
        'absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-element border border-border bg-background/95 backdrop-blur-md h-11 px-2 max-w-[calc(100%-1.5rem)]',
        className,
      )}
    >
      {/* Search — collapsed to an icon by default (no duplicate of the global
          header search); expands inline on click or when a filter is active.
          Hidden entirely when showSearch=false (e.g. homepage uses the top-bar). */}
      {showSearch &&
        (!searchOpen ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={searchLabel}
            title={searchLabel}
            onClick={() => {
              setSearchOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="h-8 w-8 p-0 border border-border"
          >
            <Search size={14} aria-hidden="true" />
          </Button>
        ) : (
          <MapSearchField
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onCollapse={() => setSearchOpen(false)}
            inputRef={inputRef}
          />
        ))}

      {/* Quick filters sit inline next to the view controls; label text
          collapses to icons below lg so the bar fits 768–1024px viewports. */}
      <MapQuickFilters
        filters={filters}
        onChange={onFiltersChange}
        showTime={availableFilters.includes('time')}
        canSave={canSave}
        savedOnly={savedOnly}
        onToggleSaved={onToggleSaved}
        compactLabels
      />

      <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <div className="flex items-center gap-1 shrink-0">
        <LensPicker lenses={lenses} value={lens} onChange={onLensChange} />

        {hasPanelFilters && (
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={filtersLabel}
                title={t('map.commandBar.filters', { defaultValue: 'Filters' })}
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
              <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
                <span className="text-13 font-semibold text-foreground">
                  {t('map.commandBar.filters', { defaultValue: 'Filters' })}
                </span>
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
                    {t('map.commandBar.reset', { defaultValue: 'Reset' })}
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
        )}

        {availableLayers.length > 0 && (
          <Popover open={layerOpen} onOpenChange={setLayerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('map.commandBar.layers', { defaultValue: 'Layers' })}
                title={t('map.commandBar.layers', { defaultValue: 'Layers' })}
                className="h-8 w-8 p-0"
              >
                <Layers size={14} aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="p-1.5 w-56">
              <p className="px-2 pt-1 pb-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t('map.commandBar.layers', { defaultValue: 'Layers' })}
              </p>
              <MapLayerList
                availableLayers={availableLayers}
                enabledLayers={enabledLayers}
                onLayersChange={onLayersChange}
              />
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
              aria-label={t('map.commandBar.more', { defaultValue: 'More map options' })}
              title={t('map.commandBar.moreShort', { defaultValue: 'More' })}
              className="h-8 w-8 p-0"
            >
              <MoreHorizontal size={14} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-1.5 w-52">
            <p className="px-2 pt-1 pb-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('map.commandBar.mapOptions', { defaultValue: 'Map options' })}
            </p>
            <div className="flex flex-col gap-0.5">
              {onGeolocate && (
                <button
                  type="button"
                  onClick={() => {
                    onGeolocate();
                    setMoreOpen(false);
                  }}
                  className="flex items-center gap-2 h-9 px-2 rounded-element text-sm hover:bg-muted text-left"
                >
                  <Locate size={16} aria-hidden="true" className="text-muted-foreground" />
                  <span>{t('map.commandBar.myLocation', { defaultValue: 'My location' })}</span>
                </button>
              )}
              {onFitBounds && (
                <button
                  type="button"
                  onClick={() => {
                    onFitBounds();
                    setMoreOpen(false);
                  }}
                  className="flex items-center gap-2 h-9 px-2 rounded-element text-sm hover:bg-muted text-left"
                >
                  <Maximize2 size={16} aria-hidden="true" className="text-muted-foreground" />
                  <span>{t('map.commandBar.fitResults', { defaultValue: 'Fit to results' })}</span>
                </button>
              )}
              {onShare && (
                <button
                  type="button"
                  onClick={() => {
                    onShare();
                    setMoreOpen(false);
                  }}
                  className="flex items-center gap-2 h-9 px-2 rounded-element text-sm hover:bg-muted text-left"
                >
                  <Share2 size={16} aria-hidden="true" className="text-muted-foreground" />
                  <span>{t('map.commandBar.shareView', { defaultValue: 'Share view' })}</span>
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
