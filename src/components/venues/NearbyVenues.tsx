import { useTranslation } from 'react-i18next';
import { useNearbyVenues } from '@/hooks/useNearbyVenues';
import { VenueCard } from './VenueCard';

export function NearbyVenues({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data } = useNearbyVenues(id);
  const venues = data?.venues ?? [];
  if (!venues.length) return null;
  return (
    <section>
      <h2 className="mb-4 text-title font-bold">
        {data?.sameCategory
          ? t('venues.detail.nearbySameCategory', 'Similar places in this city')
          : t('venues.detail.nearby', 'More places in this city')}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
      </div>
    </section>
  );
}
