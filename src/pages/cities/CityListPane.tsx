import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CityListRow } from './CityListRow';
import type { DirectoryCity } from '@/hooks/useCitiesDirectory';
import type { NextPride } from '@/utils/prideForCity';

interface CityListPaneProps {
  cities: DirectoryCity[];
  loading: boolean;
  venueCounts: ReadonlyMap<string, number>;
  prideByCity?: ReadonlyMap<string, NextPride>;
  selectedCityId?: string | null;
  onHoverCity?: (cityId: string | null) => void;
  /** Show this hint when the list is empty but a search/filter is active. */
  hasActiveFilters?: boolean;
}

function RowSkeleton() {
  return (
    <li className="flex items-center gap-4 p-2" aria-hidden="true">
      <div className="h-16 w-16 shrink-0 rounded-element bg-muted animate-pulse" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-32 rounded-badge bg-muted animate-pulse" />
        <div className="h-3 w-48 rounded-badge bg-muted animate-pulse" />
      </div>
    </li>
  );
}

export function CityListPane({
  cities,
  loading,
  venueCounts,
  prideByCity,
  selectedCityId,
  onHoverCity,
  hasActiveFilters = false,
}: CityListPaneProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <ul className="divide-y divide-border" role="list" aria-label={t('cities.listLabel', 'Cities')}>
        {Array.from({ length: 12 }).map((_, i) => (
          <RowSkeleton key={i} />
        ))}
      </ul>
    );
  }

  if (cities.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={t('cities.emptyTitle', 'No cities found')}
        description={
          hasActiveFilters
            ? t('cities.emptyFiltered', 'Try removing a filter or clearing the search.')
            : t('cities.empty', 'No cities are currently listed.')
        }
      />
    );
  }

  return (
    <ul
      className="divide-y divide-border"
      role="list"
      aria-label={t('cities.listLabel', 'Cities')}
    >
      {cities.map((city, index) => (
        <CityListRow
          key={city.id}
          city={city}
          venueCount={venueCounts.get(city.id)}
          nextPride={prideByCity?.get(city.id)}
          selected={!!selectedCityId && (selectedCityId === city.id || selectedCityId === city.slug)}
          // First 3 rows are LCP candidates — fetch eagerly with high
          // priority so the thumbnail is the LCP element instead of waiting
          // on a lazy-load IntersectionObserver.
          highPriorityImage={index < 3}
          onHover={onHoverCity}
        />
      ))}
    </ul>
  );
}
