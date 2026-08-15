import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { fetchTrendingCities } from '@/hooks/usePersonalizedCities';
import { Band } from '@/components/home/Band';
import { CityNetwork } from './CityNetwork';
import { NETWORK_VIEWBOX } from './cityNetworkGeometry';

/** "Where are you riding?" — city cards, each carrying an octilinear
 *  abstraction of that city's own transit network. */
export function CityCards() {
  const { t } = useTranslation();
  const { data: cities = [], isLoading } = useQuery({
    queryKey: ['home-destinations'],
    queryFn: () => fetchTrendingCities(200000, 8),
    staleTime: 30 * 60_000,
  });

  if (!isLoading && cities.length === 0) return null;

  return (
    <Band
      surface="tint"
      title={t('home.cities.title', 'Where are you riding?')}
      seeAllHref="/cities"
      seeAllLabel={t('home.cities.seeAll', 'All cities')}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                // Same shell + an empty diagram box, so the skeleton is exactly
                // as tall as the loaded card at every breakpoint instead of a
                // fixed height that only matches at one.
                <div key={i} className="animate-pulse border-[3px] border-foreground/20 p-4">
                  <div className="h-8 w-2/3 bg-muted" />
                  <svg
                    viewBox={`0 0 ${NETWORK_VIEWBOX.w} ${NETWORK_VIEWBOX.h}`}
                    className="my-2 w-full"
                    aria-hidden
                  />
                  <div className="h-4 w-1/2 bg-muted" />
                </div>
              ))
            : cities.map((city, i) => (
                <div
                  key={city.id}
                  className="card-lift group relative border-[3px] border-foreground bg-background p-4"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-headline">{city.name}</span>
                    {city.countries?.equality_score != null && (
                      <span
                        className="shrink-0 text-13 font-bold"
                        title={t('home.cities.equality', 'Equality score')}
                      >
                        {city.countries.equality_score}
                      </span>
                    )}
                  </div>
                  <CityNetwork slug={city.slug} index={i} />
                  <div className="truncate text-13 text-muted-foreground">
                    {city.editorial_hook || city.countries?.name || ''}
                  </div>
                  <LocalizedLink
                    to={`/city/${city.slug || city.id}`}
                    className="absolute inset-0 no-underline"
                    aria-label={city.name}
                  />
                </div>
              ))}
      </div>
    </Band>
  );
}
