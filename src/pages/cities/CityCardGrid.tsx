import { useTranslation } from 'react-i18next';
import { VirtualizedGrid } from '@/components/ui/VirtualizedGrid';
import { useGridColumns } from '@/components/ui/useGridColumns';
import { NETWORK_VIEWBOX } from '@/components/home/subway/cityNetworkGeometry';
import { CityStationCard } from './CityStationCard';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';
import type { NextPride } from '@/utils/prideForCity';

interface CityCardGridProps {
  cities: DirectoryCity[];
  loading: boolean;
  prideByCity?: ReadonlyMap<string, NextPride>;
  selectedCityId?: string | null;
  /** Changes the empty-state copy: "nothing here" vs "nothing matches". */
  hasActiveFilters?: boolean;
}

/** Must mirror the breakpoint column counts in GRID_CLASS below, or a virtual row
 *  slices the wrong number of items and the grid tears. */
const CITIES_GRID_BREAKPOINTS = [
  { minWidth: 0, columns: 1 },
  { minWidth: 640, columns: 2 },
  { minWidth: 1024, columns: 3 },
  { minWidth: 1280, columns: 4 },
];

const GRID_CLASS = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4';

/** Diagram (~205px at the 4-up width) + title + caption + two meta rows + padding.
 *  measureElement corrects from here, so this only has to be close. */
const ESTIMATE_ROW_HEIGHT = 336;

function CardSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse border-[3px] border-foreground/20 p-4">
      <div className="h-8 w-2/3 bg-muted" />
      {/* The same empty diagram box the real card reserves, so the skeleton is
          exactly as tall as the loaded card at EVERY breakpoint rather than at one
          hardcoded height. */}
      <svg
        viewBox={`0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`}
        className="my-2 w-full"
        aria-hidden
      />
      <div className="mt-2 h-4 w-1/2 bg-muted" />
      <div className="mt-2 h-4 w-1/3 bg-muted" />
    </div>
  );
}

export function CityCardGrid({
  cities,
  loading,
  prideByCity,
  selectedCityId,
  hasActiveFilters = false,
}: CityCardGridProps) {
  const { t } = useTranslation();
  const columns = useGridColumns(CITIES_GRID_BREAKPOINTS);

  if (loading) {
    return (
      <div className={GRID_CLASS}>
        {Array.from({ length: 12 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (cities.length === 0) {
    // Deliberately not `EmptyState`: that primitive requires a lucide icon, and
    // lucide must not appear on a surface that speaks the transit vocabulary.
    return (
      <div className="border-[3px] border-foreground p-8 text-center">
        <p className="m-0 font-display text-headline">
          {t('cities.emptyTitle', 'No cities found')}
        </p>
        <p className="mt-2 text-13 text-muted-foreground">
          {hasActiveFilters
            ? t('cities.emptyFiltered', 'Try removing a filter or clearing the search.')
            : t('cities.empty', 'No cities are currently listed.')}
        </p>
      </div>
    );
  }

  return (
    <VirtualizedGrid
      items={cities}
      columns={columns}
      rowClassName={GRID_CLASS}
      estimateRowHeight={ESTIMATE_ROW_HEIGHT}
      itemKey={(city) => city.id}
      renderItem={(city) => (
        <CityStationCard
          city={city}
          nextPride={prideByCity?.get(city.id)}
          selected={
            !!selectedCityId && (selectedCityId === city.id || selectedCityId === city.slug)
          }
        />
      )}
    />
  );
}
