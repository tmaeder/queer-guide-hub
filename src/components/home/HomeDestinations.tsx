import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LocalizedLink } from '@/components/routing/LocalizedLink';
import { HomeSection } from './HomeSection';
import { StaggerContainer, StaggerItem } from '@/components/motion';
import { fetchTrendingCities } from '@/hooks/usePersonalizedCities';
import { getFallbackImage } from '@/utils/fallbackImages';
import { isValidImageUrl } from '@/lib/images/resolveEntityImage';

/**
 * Homepage destinations rail — six editorial cities as portrait snap-scroll
 * cards. The editorial whitelist + population fallback in fetchTrendingCities
 * makes this section effectively never-empty.
 */
export default function HomeDestinations() {
  const { t } = useTranslation();
  const { data: cities = [], isLoading } = useQuery({
    queryKey: ['home-destinations'],
    queryFn: () => fetchTrendingCities(200000, 6),
    staleTime: 30 * 60_000,
  });

  if (!isLoading && cities.length === 0) return null;

  return (
    <HomeSection
      eyebrow={t('home.discover', 'Destinations')}
      title={t('home.destinationsTitle', 'Where the scene lives.')}
      description={t('home.destinationsSubtitle', 'Cities with visible queer life, mapped venue by venue.')}
      seeAllHref="/cities"
      seeAllLabel={t('home.allCities', 'All cities')}
      tinted
    >
      <StaggerContainer className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory no-scrollbar">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="snap-start shrink-0 w-[200px] sm:w-[240px] aspect-[3/4] rounded-container bg-muted animate-pulse"
              />
            ))
          : cities.map((city) => {
              const fallback = getFallbackImage('place', city.id);
              const img = isValidImageUrl(city.image_url) ? city.image_url! : fallback;
              return (
                <StaggerItem key={city.id} className="snap-start shrink-0 w-[200px] sm:w-[240px]">
                  <LocalizedLink
                    to={`/city/${city.slug || city.id}`}
                    className="group relative block aspect-[3/4] overflow-hidden rounded-container border border-border no-underline"
                  >
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError is a media-error handler, not a user-input listener. */}
                    <img
                      src={img}
                      alt={city.name}
                      className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
                      }}
                    />
                    <div className="img-scrim-readable absolute inset-0" />
                    <div className="absolute bottom-0 start-0 end-0 p-4 text-white">
                      <p className="font-display text-title font-bold leading-tight">{city.name}</p>
                      {city.countries?.name && (
                        <p className="mt-0.5 text-13 opacity-90">{city.countries.name}</p>
                      )}
                    </div>
                  </LocalizedLink>
                </StaggerItem>
              );
            })}
      </StaggerContainer>
    </HomeSection>
  );
}
