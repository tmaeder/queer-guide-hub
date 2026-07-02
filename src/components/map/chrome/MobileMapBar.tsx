import { useEffect, useRef, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LensPicker } from '../LensPicker';
import { MapQuickFilters } from '../MapQuickFilters';
import { MapSearchField } from './MapSearchField';
import { MapControlsSheet } from './MapControlsSheet';
import type { MapFilterKey, MapLens, MapShellFilters } from '../MapShell.types';

export interface MobileMapBarProps {
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
  canSave?: boolean;
  savedOnly?: boolean;
  onToggleSaved?: () => void;
  className?: string;
}

/**
 * Mobile map chrome. Row 1 is fixed — search, lens picker, and one
 * "Filters & layers" entry are always visible (nothing hides behind a
 * horizontal scroll). Row 2 holds the quick-filter chips as scrollable
 * shortcuts; every chip's filter is also reachable inside the sheet.
 */
export const MobileMapBar = ({
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
}: MobileMapBarProps) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState(filters.search ?? '');
  const [searchOpen, setSearchOpen] = useState(!!filters.search);
  const [sheetOpen, setSheetOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // One-way mirror of the external search filter into the local input state —
  // removing the search chip elsewhere empties + collapses the field.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-way mirror of external search filter; never fights keystrokes.
    setQuery(filters.search ?? '');
    if (filters.search) setSearchOpen(true);
  }, [filters.search]);

  const activeFilterCount =
    (filters.category ? 1 : 0) + (filters.tags?.length ?? 0) + (filters.nearMe ? 1 : 0);

  const searchLabel = t('map.commandBar.searchThisMap', { defaultValue: 'Search this map' });
  const filtersLabel =
    activeFilterCount > 0
      ? t('map.commandBar.filtersActive', {
          defaultValue: 'Filters & layers, {{count}} active',
          count: activeFilterCount,
        })
      : t('map.commandBar.filtersAndLayers', { defaultValue: 'Filters & layers' });

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {/* Row 1 — fixed. Search toggle + lens picker + filters entry always fit
          a 320px viewport; there is deliberately no overflow-x here. */}
      <div
        data-testid="map-command-bar"
        className="flex h-11 items-center gap-1.5 rounded-element border border-border bg-background/95 px-1.5 backdrop-blur-md"
      >
        {showSearch &&
          (searchOpen ? (
            <MapSearchField
              query={query}
              onQueryChange={setQuery}
              filters={filters}
              onFiltersChange={onFiltersChange}
              onCollapse={() => setSearchOpen(false)}
              inputRef={inputRef}
              className="w-full min-w-0 flex-1"
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={searchLabel}
              title={searchLabel}
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="h-9 w-9 shrink-0 p-0 border border-border"
            >
              <Search size={16} aria-hidden="true" />
            </Button>
          ))}

        {!searchOpen && (
          <>
            <LensPicker lenses={lenses} value={lens} onChange={onLensChange} />
            <div className="flex-1" />
          </>
        )}

        <Button
          variant="ghost"
          size="sm"
          aria-label={filtersLabel}
          title={filtersLabel}
          onClick={() => setSheetOpen(true)}
          className="relative h-9 w-9 shrink-0 p-0"
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-foreground text-background text-3xs font-semibold">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* Row 2 — quick-filter chips, scrollable shortcuts with a fade cue. */}
      <div
        className="-mx-1 overflow-x-auto px-1 no-scrollbar [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]"
      >
        <MapQuickFilters
          filters={filters}
          onChange={onFiltersChange}
          showTime={availableFilters.includes('time')}
          canSave={canSave}
          savedOnly={savedOnly}
          onToggleSaved={onToggleSaved}
        />
      </div>

      <MapControlsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        lenses={lenses}
        lens={lens}
        onLensChange={onLensChange}
        availableLayers={availableLayers}
        enabledLayers={enabledLayers}
        onLayersChange={onLayersChange}
        availableFilters={availableFilters}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onGeolocate={onGeolocate}
        onFitBounds={onFitBounds}
        onShare={onShare}
      />
    </div>
  );
};

export default MobileMapBar;
