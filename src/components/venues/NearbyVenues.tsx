import { useTranslation } from 'react-i18next';
import { useNearbyVenues } from '@/hooks/useNearbyVenues';
import { VenueCard } from './VenueCard';

export function NearbyVenues({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data = [] } = useNearbyVenues(id);
  if (!data.length) return null;
  return (
    <section>
      <h2 className="mb-4 text-title font-bold">
        {t('venues.detail.nearby', 'More places in this city')}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
      </div>
    </section>
  );
}
