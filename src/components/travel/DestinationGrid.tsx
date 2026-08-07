import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GeoCard } from '@/components/places/GeoCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useDestinationCities } from '@/hooks/useIntentData';
import { useVisitedPlaceLookup } from '@/hooks/useVisitedPlaceLookup';
import type { VisitedFilter } from './visitedFilter';

interface Props {
  visitedFilter?: VisitedFilter;
}

/**
 * Destination city grid for /travel — the editorial whitelist rendered as
 * GeoCards (image, editorial hook, visited stamp, save). The whitelist +
 * population fallback makes this effectively never-empty.
 */
export function DestinationGrid({ visitedFilter = 'all' }: Props) {
  const { t } = useTranslation();
  const { data: cities = [], isLoading } = useDestinationCities(8);
  const visitedLookup = useVisitedPlaceLookup();

  const filtered = useMemo(() => {
    if (visitedFilter === 'all') return cities;
    return cities.filter((c) => {
      const isVisited = visitedLookup.has('city', c.id);
      return visitedFilter === 'only_visited' ? isVisited : !isVisited;
    });
  }, [cities, visitedFilter, visitedLookup]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" className="aspect-[4/5] rounded-container" />
        ))}
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('pages.travel.destinations.empty', 'No destinations match this filter.')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {filtered.map((city, i) => (
        <GeoCard
          key={city.id}
          variant="city"
          id={city.id}
          slug={city.slug}
          name={city.name}
          imageUrl={city.image_url}
          editorialHook={city.editorial_hook}
          countryName={city.countries?.name ?? null}
          visited={visitedLookup.has('city', city.id)}
          priority={i < 4}
        />
      ))}
    </div>
  );
}
