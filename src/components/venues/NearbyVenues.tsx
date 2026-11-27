import { useTranslation } from 'react-i18next';
import { useNearbyVenues, type NearbyVenueGroup } from '@/hooks/useNearbyVenues';
import { useVenueCategoryLabel } from '@/lib/venueCategories';
import { VenueCard } from './VenueCard';

function GroupHeading({ group }: { group: NearbyVenueGroup }) {
  const { t } = useTranslation();
  const category = useVenueCategoryLabel(group.venues[0]?.category);
  if (group.relation === 'same_category') {
    return (
      <div className="mb-4">
        <h2 className="text-title font-bold">
          {t('venues.detail.nearbySameCategory', 'Similar places nearby')}
        </h2>
        <p className="text-15 text-muted-foreground">
          {t('venues.detail.nearbySameCategoryWhy', 'Same category ({{category}}), nearest first', {
            category,
          })}
        </p>
      </div>
    );
  }
  return (
    <h2 className="mb-4 text-title font-bold">
      {t('venues.detail.nearbyOther', 'Other places in this city')}
    </h2>
  );
}

/**
 * Onward places, grouped by WHY they are shown: the same kind of place first
 * (nearest first), then other places in the city. A service venue only gets
 * the first group; see `rankNearbyVenues`.
 */
export function NearbyVenues({ id }: { id: string }) {
  const { data = [] } = useNearbyVenues(id);
  if (!data.length) return null;
  return (
    <div className="flex flex-col gap-12">
      {data.map((group) => (
        <section key={group.relation}>
          <GroupHeading group={group} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.venues.map((venue) => (
              <VenueCard key={venue.id} venue={venue} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
