import { Locate, Maximize2, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { LayerType } from '@/hooks/useExploreMapData';
import { LensPicker } from '../LensPicker';
import { MapFiltersPanel } from '../MapFiltersPanel';
import { TimeRangePicker } from '../FilterPopovers';
import { MapLayerList } from './MapLayerList';
import type { MapFilterKey, MapLens, MapShellFilters } from '../MapShell.types';

export interface MapControlsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
}

/**
 * Mobile bottom sheet — the single thumb-reachable home for every map
 * control: lens, filters, time range, layers, and map actions. Everything
 * applies live (matching the desktop popovers); the sheet is just a container.
 */
export const MapControlsSheet = ({
  open,
  onOpenChange,
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
}: MapControlsSheetProps) => {
  const { t } = useTranslation();

  const hasPanelFilters = availableFilters.some((k) =>
    (['category', 'tags', 'near-me'] as MapFilterKey[]).includes(k),
  );
  const activeFilterCount =
    (filters.category ? 1 : 0) + (filters.tags?.length ?? 0) + (filters.nearMe ? 1 : 0);

  const sectionTitle = 'text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground';
  const actionRow =
    'flex w-full items-center gap-2 h-11 px-2 rounded-element text-sm hover:bg-muted text-left focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto p-4 rounded-t-container">
        <SheetHeader className="text-left">
          <SheetTitle>{t('map.sheet.title', { defaultValue: 'Map options' })}</SheetTitle>
        </SheetHeader>

        {lenses.length > 1 && (
          <div className="pt-4">
            <p className={`${sectionTitle} pb-1.5`}>
              {t('map.sheet.view', { defaultValue: 'View' })}
            </p>
            <LensPicker lenses={lenses} value={lens} onChange={onLensChange} showLabels />
          </div>
        )}

        {hasPanelFilters && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between pb-1.5">
              <p className={sectionTitle}>
                {t('map.sheet.filters', { defaultValue: 'Filters' })}
              </p>
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
            <MapFiltersPanel
              availableFilters={availableFilters}
              filters={filters}
              onFiltersChange={onFiltersChange}
            />
          </div>
        )}

        {availableFilters.includes('time') && (
          <div className="mt-4 border-t border-border pt-4">
            <p className={`${sectionTitle} pb-1.5`}>
              {t('map.sheet.time', { defaultValue: 'Time' })}
            </p>
            <div className="rounded-element border border-border">
              <TimeRangePicker
                value={filters.dateRange}
                onChange={(v) => onFiltersChange({ ...filters, dateRange: v })}
                numberOfMonths={1}
              />
            </div>
          </div>
        )}

        {availableLayers.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className={`${sectionTitle} pb-1.5`}>
              {t('map.sheet.layers', { defaultValue: 'Layers' })}
            </p>
            <MapLayerList
              availableLayers={availableLayers}
              enabledLayers={enabledLayers}
              onLayersChange={onLayersChange}
            />
          </div>
        )}

        {(onGeolocate || onFitBounds || onShare) && (
          <div className="mt-4 border-t border-border pt-4">
            <p className={`${sectionTitle} pb-1.5`}>
              {t('map.sheet.actions', { defaultValue: 'Map actions' })}
            </p>
            <div className="flex flex-col gap-0.5">
              {onGeolocate && (
                <button
                  type="button"
                  onClick={() => {
                    onGeolocate();
                    onOpenChange(false);
                  }}
                  className={actionRow}
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
                    onOpenChange(false);
                  }}
                  className={actionRow}
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
                    onOpenChange(false);
                  }}
                  className={actionRow}
                >
                  <Share2 size={16} aria-hidden="true" className="text-muted-foreground" />
                  <span>{t('map.commandBar.shareView', { defaultValue: 'Share view' })}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default MapControlsSheet;
