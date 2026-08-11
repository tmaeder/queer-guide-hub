import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { hapticTrigger } from '@/hooks/useHaptics';
import { TransitIcon } from '@/components/transit/TransitIcon';
import { MapSearchField } from './MapSearchField';
import { MapControls } from './MapControls';
import { LineKey } from './LineKey';
import type { LayerType } from '@/hooks/useExploreMapData';
import type { MapFilterKey, MapLens, MapShellFilters } from '../MapShell.types';

export interface MapBarProps {
  showSearch?: boolean;
  availableLayers: LayerType[];
  enabledLayers: LayerType[];
  onLayersChange: (next: LayerType[]) => void;
  layerCounts?: Partial<Record<LayerType, number>>;
  availableFilters: MapFilterKey[];
  filters: MapShellFilters;
  onFiltersChange: (next: MapShellFilters) => void;
  lenses: MapLens[];
  lens: MapLens;
  onLensChange: (lens: MapLens) => void;
  canSave: boolean;
  savedOnly: boolean;
  onToggleSaved: () => void;
  onGeolocate: () => void;
  onFitBounds?: () => void;
  onShare: () => void;
}

/** Count of things the user has actively narrowed by — drives the bar badge. */
function activeCount(filters: MapShellFilters, savedOnly: boolean): number {
  let n = 0;
  if (filters.category) n++;
  if (filters.tags?.length) n++;
  if (filters.nearMe) n++;
  if (filters.dateRange) n++;
  if (filters.openNow) n++;
  if (filters.accessible) n++;
  if (filters.queerOwned) n++;
  if (filters.era) n++;
  if (savedOnly) n++;
  return n;
}

const trigger =
  'inline-flex h-10 items-center gap-1.5 border-2 border-foreground bg-background px-4 text-13 font-semibold text-foreground transition-colors hover:bg-foreground hover:text-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 data-[state=open]:bg-foreground data-[state=open]:text-background';

/**
 * The map's single control bar — one component at every width.
 *
 * It replaces `CommandBar` (desktop) and `MobileMapBar` (mobile), which were
 * two implementations of the same bar that had drifted into different
 * affordances, and between them exposed SEVEN control groups in a 44px pill:
 * search, four quick-filter chips, a lens radiogroup, Filters, Layers, Time and
 * a "More" menu whose geolocate duplicated the one already sitting in the
 * top-right nav controls.
 *
 * There are now three controls, because there are three questions:
 *   Search  — "where is …?"
 *   Filters — "show me less"      (everything narrowing, incl. time + view)
 *   Lines   — "what am I seeing?" (the line key, which is also the switch)
 *
 * Everything that used to be a chip in the bar is inside Filters; what the
 * user has actually turned on comes back as a chip row underneath, which is
 * the honest place for it — the bar states what you CAN do, the chips state
 * what you HAVE done.
 */
export function MapBar({
  showSearch = true,
  availableLayers,
  enabledLayers,
  onLayersChange,
  layerCounts,
  availableFilters,
  filters,
  onFiltersChange,
  lenses,
  lens,
  onLensChange,
  canSave,
  savedOnly,
  onToggleSaved,
  onGeolocate,
  onFitBounds,
  onShare,
}: MapBarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [searchOpen, setSearchOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const count = activeCount(filters, savedOnly);
  const onCount = enabledLayers.length;

  const filtersLabel = t('map.bar.filters', { defaultValue: 'Filters' });
  const linesLabel = t('map.bar.lines', { defaultValue: 'Lines' });

  const controls = (
    <MapControls
      availableFilters={availableFilters}
      filters={filters}
      onFiltersChange={onFiltersChange}
      lenses={lenses}
      lens={lens}
      onLensChange={onLensChange}
      canSave={canSave}
      savedOnly={savedOnly}
      onToggleSaved={onToggleSaved}
      onGeolocate={() => {
        setControlsOpen(false);
        onGeolocate();
      }}
      onFitBounds={
        onFitBounds
          ? () => {
              setControlsOpen(false);
              onFitBounds();
            }
          : undefined
      }
      onShare={() => {
        setControlsOpen(false);
        onShare();
      }}
      compact={isMobile}
    />
  );

  const lineKey = (
    <LineKey
      availableLayers={availableLayers}
      enabledLayers={enabledLayers}
      onLayersChange={onLayersChange}
      counts={layerCounts}
      lens={lens}
    />
  );

  const badge = (n: number) => (
    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-track-pink px-1 text-2xs font-bold text-foreground ring-2 ring-foreground">
      {n}
    </span>
  );

  return (
    <div className="flex flex-col gap-1.5" data-testid="map-bar">
      <div className="flex items-center gap-1.5">
        {showSearch &&
          (searchOpen || !isMobile ? (
            <MapSearchField
              query={filters.search ?? ''}
              onQueryChange={(q) => onFiltersChange({ ...filters, search: q || undefined })}
              filters={filters}
              onFiltersChange={onFiltersChange}
              onCollapse={() => setSearchOpen(false)}
              inputRef={inputRef}
              className="min-w-0 flex-1 md:w-72 md:flex-none"
            />
          ) : (
            <button
              type="button"
              aria-label={t('map.bar.search', { defaultValue: 'Search this map' })}
              onClick={() => {
                hapticTrigger('nudge');
                setSearchOpen(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className={cn(trigger, 'w-10 justify-center px-0')}
            >
              <TransitIcon name="search" size={16} />
            </button>
          ))}

        {/* Filters — every way to narrow the map, in one place. */}
        {isMobile ? (
          <button
            type="button"
            aria-label={`${filtersLabel}${count > 0 ? `, ${count} active` : ''}`}
            onClick={() => {
              hapticTrigger('nudge');
              setControlsOpen(true);
            }}
            className={trigger}
          >
            <TransitIcon name="tune" size={16} />
            {filtersLabel}
            {count > 0 && badge(count)}
          </button>
        ) : (
          <Popover open={controlsOpen} onOpenChange={setControlsOpen}>
            <PopoverTrigger
              className={trigger}
              aria-label={`${filtersLabel}${count > 0 ? `, ${count} active` : ''}`}
            >
              <TransitIcon name="tune" size={16} />
              {filtersLabel}
              {count > 0 && badge(count)}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              // Without this, cmdk's tag CommandInput takes focus on open and
              // scrolls the panel to itself — the popover appeared already
              // scrolled past "When", showing a bare calendar footer.
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="w-96 border-[3px] border-foreground bg-background p-4"
            >
              {controls}
            </PopoverContent>
          </Popover>
        )}

        {/* Lines — the key, and the switch. */}
        {isMobile ? (
          <button
            type="button"
            aria-label={`${linesLabel}, ${onCount} on`}
            onClick={() => {
              hapticTrigger('nudge');
              setLinesOpen(true);
            }}
            className={trigger}
          >
            <TransitIcon name="map" size={16} />
            {linesLabel}
          </button>
        ) : (
          <Popover open={linesOpen} onOpenChange={setLinesOpen}>
            <PopoverTrigger className={trigger} aria-label={`${linesLabel}, ${onCount} on`}>
              <TransitIcon name="map" size={16} />
              {linesLabel}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="w-72 border-[3px] border-foreground bg-background p-2"
            >
              {lineKey}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Mobile surfaces — same content, sheet instead of popover. */}
      {isMobile && (
        <>
          <Sheet open={controlsOpen} onOpenChange={setControlsOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] overflow-y-auto border-t-[3px] border-foreground"
            >
              <SheetHeader>
                <SheetTitle>{filtersLabel}</SheetTitle>
              </SheetHeader>
              <div className="pt-4">{controls}</div>
            </SheetContent>
          </Sheet>

          <Sheet open={linesOpen} onOpenChange={setLinesOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] overflow-y-auto border-t-[3px] border-foreground"
            >
              <SheetHeader>
                <SheetTitle>{linesLabel}</SheetTitle>
              </SheetHeader>
              <div className="pt-4">{lineKey}</div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

export default MapBar;
